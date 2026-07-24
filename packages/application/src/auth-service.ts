import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  createDeterministicOpaqueToken,
  createOpaqueToken,
  createRecoveryCodes,
  createTotpSecret,
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  hashRecoveryCode,
  hashOpaqueToken,
  isPrivilegedWorkspaceRole,
  CURRENT_PASSWORD_PARAMETERS,
  hashPassword,
  keyedSubjectHash,
  passwordNeedsRehash,
  sessionExpiry,
  verifyInstallationToken,
  verifyPassword,
  verifyPasswordOrDummy,
  verifyTotpCode,
} from '@capsicum/auth';
import {
  bootstrapOwnerSchema,
  signInSchema,
  workspaceInvitationSchema,
  invitationMutationSchema,
  passwordResetCompleteSchema,
  passwordResetRequestSchema,
  publicErrorCodeSchema,
  sessionRevokeSchema,
  workspaceMembershipUpdateSchema,
  workspaceSwitchSchema,
  type BootstrapOwnerInput,
  type Principal,
  type SignInInput,
  type WorkspaceInvitationInput,
  type InvitationMutationInput,
  type PasswordResetCompleteInput,
  type PasswordResetRequestInput,
  type SessionRevokeInput,
  type WorkspaceMembershipUpdateInput,
  type WorkspaceSwitchInput,
  type WorkspaceRole,
} from '@capsicum/contracts';
import { withSystemTransaction, withWorkspaceTransaction } from '@capsicum/database';
import { ApplicationError, audit, authorize, executeIdempotent, requestHash, type ApplicationErrorCode } from './internal';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}

export interface AbuseContext {
  userAgentHash?: string;
  ipHash?: string;
  abuseControlSecret: string;
  mfaEncryptionKey?: string;
  recoveryCodeSecret?: string;
  requirePrivilegedMfa?: boolean;
}

function abuseKey(context: Pick<AbuseContext, 'abuseControlSecret' | 'ipHash'>, scope: string, subject: string): string {
  return keyedSubjectHash(
    context.abuseControlSecret,
    scope,
    `${context.ipHash ?? 'network-unavailable'}\0${subject}`,
  );
}

/**
 * Rate-limit accounting is intentionally committed before a denied request is
 * surfaced. Throwing inside this transaction would roll the bucket update back.
 */
async function consumeRateLimit(
  pool: pg.Pool,
  key: string,
  scope: string,
  limit: number,
  windowSeconds: number,
  blockSeconds: number,
): Promise<void> {
  const outcome = await withSystemTransaction(pool, async (client) => {
    const result = await client.query<RateLimitResult>(
      `SELECT allowed, remaining, retry_after_seconds
       FROM app_consume_rate_limit($1,$2,$3,$4,$5)`,
      [key, scope, limit, windowSeconds, blockSeconds],
    );
    return result.rows[0] ?? { allowed: false, remaining: 0, retry_after_seconds: windowSeconds };
  });
  if (!outcome.allowed) {
    throw new ApplicationError('rate_limited', 'Too many requests. Try again later.', {
      retryable: true,
      retryAfterSeconds: Math.max(1, outcome.retry_after_seconds || windowSeconds),
    });
  }
}

interface PublicFailureBody {
  error: {
    code: ApplicationErrorCode;
    message: string;
    retryable: boolean;
  };
}

interface PublicIdempotencyRow<T> {
  request_hash: string;
  state: 'pending' | 'completed' | 'failed_retryable' | 'failed_terminal' | 'conflict';
  response_body: T | PublicFailureBody | null;
  locked_until: string | null;
}

type PublicOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApplicationError };

function publicFailure(error: unknown): { state: 'failed_retryable' | 'failed_terminal'; appError: ApplicationError } {
  if (error instanceof ApplicationError) {
    return { state: error.retryable ? 'failed_retryable' : 'failed_terminal', appError: error };
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return {
      state: 'failed_terminal',
      appError: new ApplicationError('validation_failed', error.message.slice(0, 500)),
    };
  }
  return {
    state: 'failed_retryable',
    appError: new ApplicationError('unavailable', 'The request could not be completed. Try again.', {
      retryable: true,
      cause: error,
    }),
  };
}

function replayPublicFailure(body: unknown): ApplicationError {
  const parsed = body as Partial<PublicFailureBody> | null;
  const candidateCode = typeof parsed?.error?.code === 'string' ? parsed.error.code : 'conflict';
  const validatedCode = publicErrorCodeSchema.safeParse(candidateCode);
  const code: ApplicationErrorCode = validatedCode.success ? validatedCode.data : 'conflict';
  const message = typeof parsed?.error?.message === 'string'
    ? parsed.error.message
    : 'The original request reached a terminal result and cannot be replayed.';
  return new ApplicationError(code, message, { retryable: parsed?.error?.retryable === true });
}

/**
 * Public token mutations use a savepoint so business writes can roll back while
 * the request record commits its terminal classification. Concurrent callers
 * serialize on the intent row and replay the same completed or terminal result.
 */
async function executePublicIdempotent<T>(
  pool: pg.Pool,
  scope: string,
  actorKeyHash: string,
  idempotencyKey: string,
  payload: unknown,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const payloadHash = requestHash(payload);
  const outcome = await withSystemTransaction<PublicOutcome<T>>(pool, async (client) => {
    const inserted = await client.query<{ inserted: boolean }>(
      `WITH created AS (
         INSERT INTO public_idempotency_records(
           scope, actor_key_hash, idempotency_key, request_hash, state, locked_until
         ) VALUES ($1,$2,$3,$4,'pending',clock_timestamp() + interval '2 minutes')
         ON CONFLICT DO NOTHING
         RETURNING 1
       ) SELECT EXISTS (SELECT 1 FROM created) AS inserted`,
      [scope, actorKeyHash, idempotencyKey, payloadHash],
    );
    const current = await client.query<PublicIdempotencyRow<T>>(
      `SELECT request_hash, state::text, response_body, locked_until::text
       FROM public_idempotency_records
       WHERE scope = $1 AND actor_key_hash = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [scope, actorKeyHash, idempotencyKey],
    );
    const record = current.rows[0];
    if (!record) {
      return { ok: false, error: new ApplicationError('internal_error', 'The request intent could not be acquired.', { retryable: true }) };
    }
    if (record.request_hash !== payloadHash) {
      return {
        ok: false,
        error: new ApplicationError('idempotency_conflict', 'This request identifier was already used for a different request.'),
      };
    }
    if (record.state === 'completed' && record.response_body !== null) {
      return { ok: true, value: record.response_body as T };
    }
    if (record.state === 'failed_terminal' || record.state === 'conflict') {
      return { ok: false, error: replayPublicFailure(record.response_body) };
    }
    if (!inserted.rows[0]?.inserted && record.state === 'pending' && record.locked_until) {
      const lockedUntil = Date.parse(record.locked_until);
      if (Number.isFinite(lockedUntil) && lockedUntil > Date.now()) {
        return {
          ok: false,
          error: new ApplicationError('duplicate_in_progress', 'The same request is already being processed.', {
            retryable: true,
            retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1_000)),
          }),
        };
      }
    }

    await client.query(
      `UPDATE public_idempotency_records
       SET state = 'pending', locked_until = clock_timestamp() + interval '2 minutes',
           response_body = NULL, last_error_code = NULL, completed_at = NULL,
           updated_at = clock_timestamp()
       WHERE scope = $1 AND actor_key_hash = $2 AND idempotency_key = $3`,
      [scope, actorKeyHash, idempotencyKey],
    );
    await client.query('SAVEPOINT public_idempotent_operation');
    try {
      const response = await operation(client);
      await client.query('RELEASE SAVEPOINT public_idempotent_operation');
      await client.query(
        `UPDATE public_idempotency_records
         SET state = 'completed', response_body = $4::jsonb, completed_at = clock_timestamp(),
             locked_until = NULL, last_error_code = NULL, updated_at = clock_timestamp()
         WHERE scope = $1 AND actor_key_hash = $2 AND idempotency_key = $3`,
        [scope, actorKeyHash, idempotencyKey, JSON.stringify(response)],
      );
      return { ok: true, value: response };
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT public_idempotent_operation');
      await client.query('RELEASE SAVEPOINT public_idempotent_operation');
      const failure = publicFailure(error);
      const responseBody: PublicFailureBody = {
        error: {
          code: failure.appError.code,
          message: failure.appError.message,
          retryable: failure.appError.retryable,
        },
      };
      await client.query(
        `UPDATE public_idempotency_records
         SET state = $4::idempotency_state, response_body = $5::jsonb,
             last_error_code = $6, locked_until = NULL,
             completed_at = CASE WHEN $4 = 'failed_terminal' THEN clock_timestamp() ELSE NULL END,
             updated_at = clock_timestamp()
         WHERE scope = $1 AND actor_key_hash = $2 AND idempotency_key = $3`,
        [scope, actorKeyHash, idempotencyKey, failure.state, JSON.stringify(responseBody), failure.appError.code],
      );
      return { ok: false, error: failure.appError };
    }
  });
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

async function recordFailedSignIn(pool: pg.Pool, userId: string): Promise<void> {
  await withSystemTransaction(pool, async (client) => {
    await client.query(
      `UPDATE user_credentials
       SET failed_attempts = LEAST(failed_attempts + 1, 100000),
           locked_until = NULL,
           updated_at = clock_timestamp()
       WHERE user_id = $1`,
      [userId],
    );
  });
}

function credentialParameters() {
  return {
    algorithm: CURRENT_PASSWORD_PARAMETERS.algorithm,
    version: CURRENT_PASSWORD_PARAMETERS.version,
    N: CURRENT_PASSWORD_PARAMETERS.N,
    r: CURRENT_PASSWORD_PARAMETERS.r,
    p: CURRENT_PASSWORD_PARAMETERS.p,
    keyLength: CURRENT_PASSWORD_PARAMETERS.keyLength,
  };
}


export interface SessionIssue {
  token: string;
  expiresAt: string;
  principal: Principal;
}

export async function canBootstrapOwner(pool: pg.Pool): Promise<boolean> {
  const result = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM users');
  return (result.rows[0]?.count ?? 0) === 0;
}

export async function bootstrapOwner(
  pool: pg.Pool,
  rawInput: BootstrapOwnerInput,
  context: AbuseContext,
  expectedInstallationTokenSha256: string,
): Promise<SessionIssue> {
  const input = bootstrapOwnerSchema.parse(rawInput);
  await consumeRateLimit(
    pool,
    abuseKey(context, 'owner-bootstrap', 'first-owner'),
    'owner-bootstrap',
    5,
    60 * 60,
    60 * 60,
  );
  if (!verifyInstallationToken(input.installationToken, expectedInstallationTokenSha256)) {
    throw new RangeError('The installation credential is invalid or expired.');
  }
  const passwordHash = await hashPassword(input.password);
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = sessionExpiry();
  const userId = randomUUID();
  const workspaceId = randomUUID();

  return withSystemTransaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('capsicum-owner-bootstrap'))");
    const users = await client.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM users) AS exists');
    if (users.rows[0]?.exists) {
      throw new RangeError('First-owner bootstrap is closed because the system already has users.');
    }
    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [userId]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    await client.query(
      `INSERT INTO users(id, email, display_name) VALUES ($1, $2, $3)`,
      [userId, input.email, input.displayName],
    );
    await client.query(
      `INSERT INTO user_credentials(user_id, password_hash, password_version, password_parameters) VALUES ($1, $2, 'scrypt-v2', $3::jsonb)`,
      [userId, passwordHash, JSON.stringify(credentialParameters())],
    );
    await client.query(
      `INSERT INTO workspaces(id, slug, name, created_by) VALUES ($1, $2, $3, $4)`,
      [workspaceId, input.workspaceSlug, input.workspaceName, userId],
    );
    await client.query(
      `INSERT INTO workspace_memberships(workspace_id, user_id, role, state)
       VALUES ($1, $2, 'owner', 'active')`,
      [workspaceId, userId],
    );
    const session = await client.query<{ id: string }>(
      `INSERT INTO auth_sessions(user_id, token_hash, active_workspace_id, expires_at, user_agent_hash, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, tokenHash, workspaceId, expiresAt.toISOString(), context.userAgentHash ?? null, context.ipHash ?? null],
    );
    const sessionId = session.rows[0]?.id;
    if (!sessionId) throw new Error('Owner session was not created.');
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      principal: {
        userId,
        workspaceId,
        role: 'owner',
        sessionId,
        email: input.email,
        displayName: input.displayName,
        mfaVerifiedAt: null,
      },
    };
  });
}

export interface MultiFactorStatus {
  enabled: boolean;
  enrollmentPending: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export async function getMultiFactorStatus(pool: pg.Pool, principal: Principal): Promise<MultiFactorStatus> {
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<{
      enabled_at: string | null;
      has_record: boolean;
      recovery_codes_remaining: number;
    }>(
      `SELECT credential.enabled_at::text,
              credential.user_id IS NOT NULL AS has_record,
              (SELECT count(*)::int FROM user_recovery_codes code WHERE code.user_id = $1 AND code.consumed_at IS NULL) AS recovery_codes_remaining
       FROM (SELECT $1::uuid AS user_id) subject
       LEFT JOIN user_totp_credentials credential ON credential.user_id = subject.user_id`,
      [principal.userId],
    );
    const row = result.rows[0];
    return {
      enabled: Boolean(row?.enabled_at),
      enrollmentPending: Boolean(row?.has_record && !row.enabled_at),
      enabledAt: row?.enabled_at ?? null,
      recoveryCodesRemaining: row?.recovery_codes_remaining ?? 0,
    };
  });
}

type MultiFactorCredentialRow = {
  encrypted_secret: string;
  enabled_at: string | null;
  last_used_step: string | null;
};

type MultiFactorChallenge = {
  totpCode?: string;
  recoveryCode?: string;
};

async function verifyMultiFactorChallenge(
  client: pg.PoolClient,
  userId: string,
  credential: MultiFactorCredentialRow,
  challenge: MultiFactorChallenge,
  context: Pick<AbuseContext, 'mfaEncryptionKey' | 'recoveryCodeSecret'>,
  invalidMessage: string,
): Promise<'totp' | 'recovery_code'> {
  if (!credential.enabled_at) throw new RangeError('Multi-factor authentication is not enabled.');
  if (challenge.totpCode && challenge.recoveryCode) {
    throw new RangeError('Use either an authenticator code or a recovery code, not both.');
  }
  if (challenge.totpCode) {
    if (!context.mfaEncryptionKey) {
      throw new ApplicationError('unavailable', 'Multi-factor authentication is not configured on the server.', { retryable: false });
    }
    const verified = verifyTotpCode(
      decryptTotpSecret(credential.encrypted_secret, context.mfaEncryptionKey),
      challenge.totpCode,
      { lastUsedStep: credential.last_used_step ? Number(credential.last_used_step) : null },
    );
    if (!verified.valid || verified.step === undefined) throw new RangeError(invalidMessage);
    await client.query(
      'UPDATE user_totp_credentials SET last_used_step = $2 WHERE user_id = $1',
      [userId, verified.step],
    );
    return 'totp';
  }
  if (challenge.recoveryCode) {
    if (!context.recoveryCodeSecret) {
      throw new ApplicationError('unavailable', 'Recovery-code verification is not configured on the server.', { retryable: false });
    }
    const consumed = await client.query<{ id: string }>(
      `UPDATE user_recovery_codes
       SET consumed_at = clock_timestamp()
       WHERE user_id = $1 AND code_hash = $2 AND consumed_at IS NULL
       RETURNING id`,
      [userId, hashRecoveryCode(challenge.recoveryCode, context.recoveryCodeSecret)],
    );
    if (!consumed.rows[0]) throw new RangeError(invalidMessage);
    return 'recovery_code';
  }
  throw new RangeError('An authenticator code or recovery code is required.');
}

export async function beginMultiFactorEnrollment(
  pool: pg.Pool,
  principal: Principal,
  encryptionKey: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const secret = createTotpSecret();
  const encrypted = encryptTotpSecret(secret, encryptionKey);
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const existing = await client.query<{ enabled_at: string | null }>(
      'SELECT enabled_at::text FROM user_totp_credentials WHERE user_id = $1 FOR UPDATE',
      [principal.userId],
    );
    if (existing.rows[0]?.enabled_at) throw new RangeError('Multi-factor authentication is already enabled.');
    await client.query(
      `INSERT INTO user_totp_credentials(user_id, encrypted_secret, key_version, enabled_at, disabled_at, last_used_step)
       VALUES ($1, $2, 'v1', NULL, NULL, NULL)
       ON CONFLICT (user_id) DO UPDATE SET encrypted_secret = EXCLUDED.encrypted_secret,
         key_version = 'v1', enabled_at = NULL, disabled_at = NULL, last_used_step = NULL, created_at = clock_timestamp()`,
      [principal.userId, encrypted],
    );
    await client.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [principal.userId]);
    await audit(client, principal, 'auth.mfa_enrollment_started', 'user', principal.userId, undefined, { method: 'totp' });
  });
  return {
    secret,
    otpauthUri: createTotpUri({ secret, accountName: principal.email }),
  };
}

export async function confirmMultiFactorEnrollment(
  pool: pg.Pool,
  principal: Principal,
  code: string,
  encryptionKey: string,
  recoveryCodeSecret: string,
): Promise<{ recoveryCodes: string[] }> {
  const recoveryCodes = createRecoveryCodes();
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<{ encrypted_secret: string; enabled_at: string | null; last_used_step: string | null }>(
      `SELECT encrypted_secret, enabled_at::text, last_used_step::text
       FROM user_totp_credentials WHERE user_id = $1 FOR UPDATE`,
      [principal.userId],
    );
    const credential = result.rows[0];
    if (!credential) throw new RangeError('Start multi-factor enrollment before confirming it.');
    if (credential.enabled_at) throw new RangeError('Multi-factor authentication is already enabled.');
    const verified = verifyTotpCode(decryptTotpSecret(credential.encrypted_secret, encryptionKey), code, { window: 1 });
    if (!verified.valid || verified.step === undefined) throw new RangeError('The authenticator code is invalid or expired.');
    await client.query(
      `UPDATE user_totp_credentials
       SET enabled_at = clock_timestamp(), disabled_at = NULL, last_used_step = $2
       WHERE user_id = $1`,
      [principal.userId, verified.step],
    );
    await client.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [principal.userId]);
    for (const recoveryCode of recoveryCodes) {
      await client.query(
        'INSERT INTO user_recovery_codes(user_id, code_hash) VALUES ($1, $2)',
        [principal.userId, hashRecoveryCode(recoveryCode, recoveryCodeSecret)],
      );
    }
    const assuredSession = await client.query(
      `UPDATE auth_sessions
       SET mfa_verified_at = clock_timestamp(), last_seen_at = clock_timestamp()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > clock_timestamp()
       RETURNING id`,
      [principal.sessionId, principal.userId],
    );
    if (!assuredSession.rows[0]) throw new ApplicationError('stale_version', 'The current session is no longer active.');
    await audit(client, principal, 'auth.mfa_enabled', 'user', principal.userId, undefined, { method: 'totp', recoveryCodeCount: recoveryCodes.length });
    return { recoveryCodes };
  });
}

export async function verifyCurrentSessionMultiFactor(
  pool: pg.Pool,
  principal: Principal,
  challenge: MultiFactorChallenge,
  encryptionKey: string,
  recoveryCodeSecret: string,
): Promise<{ mfaVerifiedAt: string; method: 'totp' | 'recovery_code' }> {
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<MultiFactorCredentialRow>(
      `SELECT encrypted_secret, enabled_at::text, last_used_step::text
       FROM user_totp_credentials WHERE user_id = $1 FOR UPDATE`,
      [principal.userId],
    );
    const credential = result.rows[0];
    if (!credential?.enabled_at) throw new RangeError('Enable multi-factor authentication before verifying this session.');
    const method = await verifyMultiFactorChallenge(
      client,
      principal.userId,
      credential,
      challenge,
      { mfaEncryptionKey: encryptionKey, recoveryCodeSecret },
      'The authentication code is invalid or expired.',
    );
    const session = await client.query<{ mfa_verified_at: string }>(
      `UPDATE auth_sessions
       SET mfa_verified_at = clock_timestamp(), last_seen_at = clock_timestamp()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > clock_timestamp()
       RETURNING mfa_verified_at::text`,
      [principal.sessionId, principal.userId],
    );
    const mfaVerifiedAt = session.rows[0]?.mfa_verified_at;
    if (!mfaVerifiedAt) throw new ApplicationError('stale_version', 'The current session is no longer active.');
    await audit(client, principal, 'auth.session_mfa_verified', 'auth_session', principal.sessionId, undefined, { method });
    return { mfaVerifiedAt, method };
  });
}

export async function regenerateMultiFactorRecoveryCodes(
  pool: pg.Pool,
  principal: Principal,
  totpCode: string,
  encryptionKey: string,
  recoveryCodeSecret: string,
): Promise<{ recoveryCodes: string[] }> {
  const recoveryCodes = createRecoveryCodes();
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<MultiFactorCredentialRow>(
      `SELECT encrypted_secret, enabled_at::text, last_used_step::text
       FROM user_totp_credentials WHERE user_id = $1 FOR UPDATE`,
      [principal.userId],
    );
    const credential = result.rows[0];
    if (!credential?.enabled_at) throw new RangeError('Multi-factor authentication is not enabled.');
    await verifyMultiFactorChallenge(
      client,
      principal.userId,
      credential,
      { totpCode },
      { mfaEncryptionKey: encryptionKey, recoveryCodeSecret },
      'The authenticator code is invalid or expired.',
    );
    await client.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [principal.userId]);
    for (const recoveryCode of recoveryCodes) {
      await client.query(
        'INSERT INTO user_recovery_codes(user_id, code_hash) VALUES ($1, $2)',
        [principal.userId, hashRecoveryCode(recoveryCode, recoveryCodeSecret)],
      );
    }
    await client.query(
      `UPDATE auth_sessions SET mfa_verified_at = clock_timestamp(), last_seen_at = clock_timestamp()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
      [principal.sessionId, principal.userId],
    );
    await audit(client, principal, 'auth.mfa_recovery_codes_rotated', 'user', principal.userId, undefined, {
      recoveryCodeCount: recoveryCodes.length,
    });
    return { recoveryCodes };
  });
}

export async function disableMultiFactorAuthentication(
  pool: pg.Pool,
  principal: Principal,
  code: string,
  encryptionKey: string,
  requiredForPrivilegedRoles: boolean,
): Promise<void> {
  if (requiredForPrivilegedRoles && isPrivilegedWorkspaceRole(principal.role)) {
    throw new RangeError('Multi-factor authentication is required for this privileged role and cannot be disabled.');
  }
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<{ encrypted_secret: string; enabled_at: string | null; last_used_step: string | null }>(
      `SELECT encrypted_secret, enabled_at::text, last_used_step::text
       FROM user_totp_credentials WHERE user_id = $1 FOR UPDATE`,
      [principal.userId],
    );
    const credential = result.rows[0];
    if (!credential?.enabled_at) throw new RangeError('Multi-factor authentication is not enabled.');
    const verified = verifyTotpCode(decryptTotpSecret(credential.encrypted_secret, encryptionKey), code, {
      lastUsedStep: credential.last_used_step ? Number(credential.last_used_step) : null,
    });
    if (!verified.valid) throw new RangeError('The authenticator code is invalid or expired.');
    await client.query(
      `UPDATE user_totp_credentials SET enabled_at = NULL, disabled_at = clock_timestamp(), last_used_step = NULL WHERE user_id = $1`,
      [principal.userId],
    );
    await client.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [principal.userId]);
    await client.query(
      'UPDATE auth_sessions SET mfa_verified_at = NULL WHERE user_id = $1 AND revoked_at IS NULL',
      [principal.userId],
    );
    await audit(client, principal, 'auth.mfa_disabled', 'user', principal.userId, { method: 'totp' }, undefined);
  });
}

export async function signIn(
  pool: pg.Pool,
  rawInput: SignInInput,
  context: AbuseContext,
): Promise<SessionIssue> {
  const input = signInSchema.parse(rawInput);
  await consumeRateLimit(
    pool,
    abuseKey(context, 'sign-in', input.email),
    'sign-in',
    10,
    15 * 60,
    15 * 60,
  );

  const result = await pool.query<{
    user_id: string;
    display_name: string;
    password_hash: string;
    failed_attempts: number;
    locked_until: string | null;
    rehash_required: boolean;
  }>(
    `SELECT user_account.id AS user_id, user_account.display_name, credential.password_hash,
            credential.failed_attempts, credential.locked_until::text, credential.rehash_required
     FROM users user_account
     JOIN user_credentials credential ON credential.user_id = user_account.id
     WHERE user_account.email = $1`,
    [input.email],
  );
  const snapshot = result.rows[0];
  const valid = await verifyPasswordOrDummy(input.password, snapshot?.password_hash);
  if (!snapshot || !valid) {
    if (snapshot) await recordFailedSignIn(pool, snapshot.user_id);
    throw new RangeError('Invalid email or password.');
  }

  const upgradedHash = snapshot.rehash_required || passwordNeedsRehash(snapshot.password_hash)
    ? await hashPassword(input.password)
    : null;
  return withSystemTransaction(pool, async (client) => {
    const currentResult = await client.query<{
      password_hash: string;
      locked_until: string | null;
    }>(
      `SELECT password_hash, locked_until::text
       FROM user_credentials
       WHERE user_id = $1
       FOR UPDATE`,
      [snapshot.user_id],
    );
    const current = currentResult.rows[0];
    if (!current || current.password_hash !== snapshot.password_hash) {
      throw new RangeError('Invalid email or password.');
    }
    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [snapshot.user_id]);
    const membership = await client.query<{ workspace_id: string; role: WorkspaceRole }>(
      `SELECT workspace_id, role
       FROM workspace_memberships
       WHERE user_id = $1 AND state = 'active'
       ORDER BY CASE role
         WHEN 'owner' THEN 0
         WHEN 'administrator' THEN 1
         WHEN 'scientific_reviewer' THEN 2
         WHEN 'catalog_curator' THEN 3
         ELSE 4 END, created_at
       LIMIT 1`,
      [snapshot.user_id],
    );
    const active = membership.rows[0];
    if (!active) throw new RangeError('The account has no active workspace membership.');

    const mfaResult = await client.query<MultiFactorCredentialRow>(
      `SELECT encrypted_secret, enabled_at::text, last_used_step::text
       FROM user_totp_credentials
       WHERE user_id = $1
       FOR UPDATE`,
      [snapshot.user_id],
    );
    const mfa = mfaResult.rows[0];
    const privileged = isPrivilegedWorkspaceRole(active.role);
    let mfaSatisfied = false;
    if (mfa?.enabled_at) {
      await verifyMultiFactorChallenge(
        client,
        snapshot.user_id,
        mfa,
        input,
        context,
        'Invalid email, password, or authentication code.',
      );
      mfaSatisfied = true;
    } else if (context.requirePrivilegedMfa && privileged) {
      // Issue a deliberately low-assurance session so an existing privileged user can enroll MFA.
      // Server-side route guards restrict that session to the security enrollment and sign-out paths.
      mfaSatisfied = false;
    }

    if (upgradedHash) {
      await client.query(
        `UPDATE user_credentials
         SET password_hash = $2, password_version = 'scrypt-v2', password_parameters = $3::jsonb,
             rehash_required = false, failed_attempts = 0, locked_until = NULL,
             last_successful_login_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [snapshot.user_id, upgradedHash, JSON.stringify(credentialParameters())],
      );
    } else {
      await client.query(
        `UPDATE user_credentials
         SET failed_attempts = 0, locked_until = NULL,
             last_successful_login_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [snapshot.user_id],
      );
    }
    const token = createOpaqueToken();
    const expiresAt = sessionExpiry();
    const session = await client.query<{ id: string; mfa_verified_at: string | null }>(
      `INSERT INTO auth_sessions(
         user_id, token_hash, active_workspace_id, expires_at, user_agent_hash, ip_hash, mfa_verified_at
       ) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::boolean THEN clock_timestamp() ELSE NULL END)
       RETURNING id, mfa_verified_at::text`,
      [
        snapshot.user_id,
        hashOpaqueToken(token),
        active.workspace_id,
        expiresAt.toISOString(),
        context.userAgentHash ?? null,
        context.ipHash ?? null,
        mfaSatisfied,
      ],
    );
    const sessionId = session.rows[0]?.id;
    if (!sessionId) throw new ApplicationError('internal_error', 'The session could not be created.', { retryable: true });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      principal: {
        userId: snapshot.user_id,
        workspaceId: active.workspace_id,
        role: active.role,
        sessionId,
        email: input.email,
        displayName: snapshot.display_name,
        mfaVerifiedAt: session.rows[0]?.mfa_verified_at ?? null,
      },
    };
  });
}

export async function readSession(pool: pg.Pool, token: string): Promise<Principal | null> {
  if (!token || token.length < 32) return null;
  return withSystemTransaction(pool, async (client) => {
    const sessionResult = await client.query<{
      session_id: string;
      user_id: string;
      workspace_id: string;
      email: string;
      display_name: string;
      role: WorkspaceRole;
      mfa_verified_at: string | null;
    }>(
      `SELECT session.id AS session_id, user.id AS user_id,
              session.active_workspace_id AS workspace_id,
              user.email, user.display_name, membership.role, session.mfa_verified_at::text
       FROM auth_sessions session
       JOIN users user ON user.id = session.user_id
       JOIN workspace_memberships membership
         ON membership.workspace_id = session.active_workspace_id
        AND membership.user_id = session.user_id
        AND membership.state = 'active'
       WHERE session.token_hash = $1
         AND session.revoked_at IS NULL
         AND session.expires_at > now()`,
      [hashOpaqueToken(token)],
    );
    const session = sessionResult.rows[0];
    if (!session) return null;
    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [session.user_id]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [session.workspace_id]);
    await client.query(
      `UPDATE auth_sessions SET last_seen_at = now()
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()
         AND last_seen_at < now() - interval '5 minutes'`,
      [session.session_id],
    );
    return {
      userId: session.user_id,
      workspaceId: session.workspace_id,
      role: session.role,
      sessionId: session.session_id,
      email: session.email,
      displayName: session.display_name,
      mfaVerifiedAt: session.mfa_verified_at,
    };
  });
}

export async function revokeSession(pool: pg.Pool, sessionId: string, userId: string): Promise<void> {
  await withSystemTransaction(pool, async (client) => {
    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [userId]);
    await client.query(
      `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, clock_timestamp())
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
  });
}

export interface UserSessionSummary {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  mfaVerifiedAt: string | null;
  userAgentHash: string | null;
  networkHash: string | null;
  activeWorkspaceId: string | null;
  current: boolean;
}

export async function listUserSessions(pool: pg.Pool, principal: Principal): Promise<UserSessionSummary[]> {
  return withSystemTransaction(pool, async (client) => {
    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [principal.userId]);
    const result = await client.query<{
      id: string; created_at: string; last_seen_at: string; expires_at: string; revoked_at: string | null;
      mfa_verified_at: string | null; user_agent_hash: string | null; ip_hash: string | null; active_workspace_id: string | null;
    }>(
      `SELECT id, created_at::text, last_seen_at::text, expires_at::text, revoked_at::text,
              mfa_verified_at::text, user_agent_hash, ip_hash, active_workspace_id
       FROM auth_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [principal.userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      mfaVerifiedAt: row.mfa_verified_at,
      userAgentHash: row.user_agent_hash,
      networkHash: row.ip_hash,
      activeWorkspaceId: row.active_workspace_id,
      current: row.id === principal.sessionId,
    }));
  });
}

export interface AvailableWorkspace {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  current: boolean;
}

export async function listAvailableWorkspaces(pool: pg.Pool, principal: Principal): Promise<AvailableWorkspace[]> {
  return withSystemTransaction(pool, async (client) => {
    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [principal.userId]);
    const result = await client.query<{ id: string; name: string; slug: string; role: WorkspaceRole }>(
      `SELECT workspace.id, workspace.name, workspace.slug, membership.role
       FROM workspace_memberships membership
       JOIN workspaces workspace ON workspace.id = membership.workspace_id
       WHERE membership.user_id = $1 AND membership.state = 'active'
       ORDER BY workspace.name, workspace.id`,
      [principal.userId],
    );
    return result.rows.map((row) => ({ ...row, current: row.id === principal.workspaceId }));
  });
}

export async function switchWorkspace(
  pool: pg.Pool,
  principal: Principal,
  rawInput: WorkspaceSwitchInput,
  requirePrivilegedMfa = false,
): Promise<{ workspaceId: string }> {
  const input = workspaceSwitchSchema.parse(rawInput);
  return withSystemTransaction(pool, async (client) => {
    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [principal.userId]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [principal.workspaceId]);
    return executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
      const membership = await client.query<{ role: WorkspaceRole }>(
        `SELECT role FROM workspace_memberships
         WHERE workspace_id = $1 AND user_id = $2 AND state = 'active'`,
        [input.workspaceId, principal.userId],
      );
      const destination = membership.rows[0];
      if (!destination) throw new ApplicationError('permission_denied', 'No active membership exists for that workspace.');
      if (requirePrivilegedMfa && isPrivilegedWorkspaceRole(destination.role) && !principal.mfaVerifiedAt) {
        throw new ApplicationError('permission_denied', 'Verify multi-factor authentication before switching into a privileged workspace.');
      }
      const updated = await client.query(
        `UPDATE auth_sessions SET active_workspace_id = $1, last_seen_at = clock_timestamp()
         WHERE id = $2 AND user_id = $3 AND revoked_at IS NULL AND expires_at > clock_timestamp()
         RETURNING id`,
        [input.workspaceId, principal.sessionId, principal.userId],
      );
      if (!updated.rows[0]) throw new ApplicationError('stale_version', 'The current session is no longer active.');
      return { workspaceId: input.workspaceId };
    }, 'workspace.switch');
  });
}

export async function revokeUserSession(
  pool: pg.Pool,
  principal: Principal,
  rawInput: SessionRevokeInput,
): Promise<{ sessionId: string; currentSessionRevoked: boolean }> {
  const input = sessionRevokeSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) =>
    executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
      const result = await client.query(
        `UPDATE auth_sessions
         SET revoked_at = COALESCE(revoked_at, clock_timestamp())
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [input.sessionId, principal.userId],
      );
      if (!result.rows[0]) throw new ApplicationError('not_found', 'The session was not found.');
      await audit(client, principal, 'auth.session.revoked', 'auth_session', input.sessionId, null, {
        currentSession: input.sessionId === principal.sessionId,
      });
      return { sessionId: input.sessionId, currentSessionRevoked: input.sessionId === principal.sessionId };
    }, 'auth.session.revoke'),
  );
}

export async function createWorkspaceInvitation(
  pool: pg.Pool,
  principal: Principal,
  rawInput: WorkspaceInvitationInput,
  tokenDerivationSecret: string,
  abuseControlSecret: string,
): Promise<{ token: string; invitationId: string; expiresAt: string }> {
  authorize(principal, 'workspace.manage');
  const input = workspaceInvitationSchema.parse(rawInput);
  await consumeRateLimit(
    pool,
    keyedSubjectHash(abuseControlSecret, 'workspace-invitation', `${principal.workspaceId}:${principal.userId}`),
    'workspace-invitation',
    50,
    60 * 60,
    60 * 60,
  );
  const token = createDeterministicOpaqueToken(
    tokenDerivationSecret,
    `workspace-invitation:${principal.workspaceId}:${principal.userId}:${input.idempotencyKey}`,
  );
  const result = await withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1_000).toISOString();
    const invitation = await client.query<{ id: string }>(
      `INSERT INTO workspace_invitations(workspace_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [principal.workspaceId, input.email, input.role, hashOpaqueToken(token), principal.userId, expiresAt],
    );
    const invitationId = invitation.rows[0]!.id;
    await audit(client, principal, 'workspace.invitation.created', 'workspace_invitation', invitationId, null, {
      email: input.email,
      role: input.role,
      expiresAt,
    });
    return { invitationId, expiresAt };
  }, 'workspace.invitation.create'));
  return { token, ...result };
}

export async function mutateWorkspaceInvitation(
  pool: pg.Pool,
  principal: Principal,
  rawInput: InvitationMutationInput,
  tokenDerivationSecret: string,
  abuseControlSecret: string,
): Promise<{ invitationId: string; action: 'revoke' | 'resend'; recipientEmail?: string; token?: string; expiresAt?: string }> {
  authorize(principal, 'workspace.manage');
  const input = invitationMutationSchema.parse(rawInput);
  await consumeRateLimit(
    pool,
    keyedSubjectHash(abuseControlSecret, 'workspace-invitation-mutation', `${principal.workspaceId}:${principal.userId}`),
    'workspace-invitation-mutation',
    100,
    60 * 60,
    60 * 60,
  );
  const token = input.action === 'resend'
    ? createDeterministicOpaqueToken(tokenDerivationSecret, `workspace-invitation-resend:${principal.workspaceId}:${principal.userId}:${input.idempotencyKey}`)
    : undefined;
  const result = await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) =>
    executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
      const existing = await client.query<{ id: string; email: string; role: WorkspaceRole; accepted_at: string | null; revoked_at: string | null }>(
        `SELECT id, email, role, accepted_at::text, revoked_at::text
         FROM workspace_invitations
         WHERE workspace_id = app_current_workspace_id() AND id = $1
         FOR UPDATE`,
        [input.invitationId],
      );
      const invitation = existing.rows[0];
      if (!invitation) throw new ApplicationError('not_found', 'The invitation was not found.');
      if (invitation.accepted_at) throw new ApplicationError('conflict', 'An accepted invitation cannot be revoked or resent.');
      if (input.action === 'revoke') {
        await client.query(
          `UPDATE workspace_invitations SET revoked_at = COALESCE(revoked_at, clock_timestamp())
           WHERE id = $1`,
          [invitation.id],
        );
        await audit(client, principal, 'workspace.invitation.revoked', 'workspace_invitation', invitation.id, null, { email: invitation.email });
        return { invitationId: invitation.id, action: 'revoke' as const };
      }
      if (!token) throw new ApplicationError('internal_error', 'The invitation token was not derived.');
      const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1_000).toISOString();
      const created = await client.query<{ id: string }>(
        `INSERT INTO workspace_invitations(workspace_id, email, role, token_hash, invited_by, expires_at)
         VALUES (app_current_workspace_id(), $1, $2, $3, $4, $5)
         RETURNING id`,
        [invitation.email, invitation.role, hashOpaqueToken(token), principal.userId, expiresAt],
      );
      const newId = created.rows[0]!.id;
      await client.query(
        `UPDATE workspace_invitations
         SET revoked_at = COALESCE(revoked_at, clock_timestamp()), superseded_by_invitation_id = $2
         WHERE id = $1`,
        [invitation.id, newId],
      );
      await audit(client, principal, 'workspace.invitation.resent', 'workspace_invitation', newId, { supersededInvitationId: invitation.id }, {
        email: invitation.email,
        role: invitation.role,
        expiresAt,
      });
      return { invitationId: newId, action: 'resend' as const, recipientEmail: invitation.email, expiresAt };
    }, 'workspace.invitation.mutate'),
  );
  return token && result.action === 'resend' ? { ...result, token } : result;
}

export async function acceptWorkspaceInvitation(
  pool: pg.Pool,
  input: { token: string; displayName: string; password: string },
  context: AbuseContext,
): Promise<SessionIssue> {
  const tokenHash = hashOpaqueToken(input.token);
  await consumeRateLimit(
    pool,
    abuseKey(context, 'invitation-accept', tokenHash),
    'invitation-accept',
    12,
    15 * 60,
    15 * 60,
  );
  return withSystemTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tokenHash]);
    const invitationResult = await client.query<{
      id: string;
      workspace_id: string;
      email: string;
      role: WorkspaceRole;
    }>(
      `SELECT id, workspace_id, email, role
       FROM app_resolve_workspace_invitation($1)`,
      [tokenHash],
    );
    const invitation = invitationResult.rows[0];
    if (!invitation) throw new RangeError('Invitation is invalid, expired, or already used.');

    let userId: string;
    let displayName: string;
    const existing = await client.query<{ id: string; display_name: string; password_hash: string }>(
      `SELECT user_account.id, user_account.display_name, credential.password_hash
       FROM users user_account
       JOIN user_credentials credential ON credential.user_id = user_account.id
       WHERE user_account.email = $1`,
      [invitation.email],
    );
    if (existing.rows[0]) {
      if (!(await verifyPassword(input.password, existing.rows[0].password_hash))) {
        throw new RangeError('Invitation or account credentials are invalid.');
      }
      userId = existing.rows[0].id;
      displayName = existing.rows[0].display_name;
    } else {
      userId = randomUUID();
      displayName = input.displayName.trim();
      const passwordHash = await hashPassword(input.password);
      await client.query(
        `INSERT INTO users(id, email, display_name) VALUES ($1, $2, $3)`,
        [userId, invitation.email, displayName],
      );
      await client.query(
        `INSERT INTO user_credentials(user_id, password_hash, password_version, password_parameters)
         VALUES ($1, $2, 'scrypt-v2', $3::jsonb)`,
        [userId, passwordHash, JSON.stringify(credentialParameters())],
      );
    }

    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [userId]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [invitation.workspace_id]);
    await client.query("SELECT set_config('app.invitation_id', $1, true)", [invitation.id]);
    await client.query(
      `INSERT INTO workspace_memberships(workspace_id, user_id, role, state, invited_by)
       SELECT $1, $2, $3, 'active', invited_by
       FROM workspace_invitations WHERE id = $4
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, state = 'active', revoked_at = NULL,
                     invited_by = EXCLUDED.invited_by, updated_at = clock_timestamp()`,
      [invitation.workspace_id, userId, invitation.role, invitation.id],
    );
    const accepted = await client.query(
      `UPDATE workspace_invitations
       SET accepted_by = $1, accepted_at = clock_timestamp()
       WHERE id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
       RETURNING id`,
      [userId, invitation.id],
    );
    if (!accepted.rows[0]) throw new RangeError('Invitation is invalid, expired, or already used.');

    const token = createOpaqueToken();
    const expiresAt = sessionExpiry();
    const session = await client.query<{ id: string }>(
      `INSERT INTO auth_sessions(
         user_id, token_hash, active_workspace_id, expires_at, user_agent_hash, ip_hash
       ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, hashOpaqueToken(token), invitation.workspace_id, expiresAt.toISOString(), context.userAgentHash ?? null, context.ipHash ?? null],
    );
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      principal: {
        userId,
        workspaceId: invitation.workspace_id,
        role: invitation.role,
        sessionId: session.rows[0]!.id,
        email: invitation.email,
        displayName,
        mfaVerifiedAt: null,
      },
    };
  });
}

export interface PasswordResetRequestResult {
  accepted: true;
  token?: string;
  expiresAt?: string;
  tokenHash?: string;
}

export async function requestPasswordReset(
  pool: pg.Pool,
  rawInput: PasswordResetRequestInput,
  tokenDerivationSecret: string,
  context: Pick<AbuseContext, 'ipHash' | 'abuseControlSecret'>,
): Promise<PasswordResetRequestResult> {
  const input = passwordResetRequestSchema.parse(rawInput);
  const actorKeyHash = keyedSubjectHash(context.abuseControlSecret, 'password-reset-actor', input.email);
  const token = createDeterministicOpaqueToken(tokenDerivationSecret, `password-reset:${input.email}:${input.idempotencyKey}`);
  await consumeRateLimit(
    pool,
    abuseKey(context, 'password-reset', input.email),
    'password-reset',
    6,
    60 * 60,
    60 * 60,
  );
  const result = await executePublicIdempotent(pool, 'password-reset.request', actorKeyHash, input.idempotencyKey, input, async (client) => {
      const user = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [input.email]);
      const userId = user.rows[0]?.id;
      if (!userId) return { issued: false, expiresAt: null as string | null };
      const expiresAt = new Date(Date.now() + 30 * 60 * 1_000).toISOString();
      await client.query(
        `UPDATE password_reset_tokens
         SET revoked_at = COALESCE(revoked_at, clock_timestamp())
         WHERE user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
        [userId],
      );
      await client.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at, requested_ip_hmac)
         VALUES ($1,$2,$3,$4)`,
        [userId, hashOpaqueToken(token), expiresAt, context.ipHash ?? null],
      );
      return { issued: true, expiresAt };
  });
  return result.issued
    ? {
        accepted: true,
        token,
        tokenHash: hashOpaqueToken(token),
        ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
      }
    : { accepted: true };
}

export async function markPasswordResetDelivery(
  pool: pg.Pool,
  tokenHash: string,
  state: 'delivered' | 'unavailable' | 'failed',
  errorCode?: string,
): Promise<void> {
  await pool.query('SELECT app_mark_password_reset_delivery($1,$2,$3)', [tokenHash, state, errorCode ?? null]);
}

export async function completePasswordReset(
  pool: pg.Pool,
  rawInput: PasswordResetCompleteInput,
  context: Pick<AbuseContext, 'ipHash' | 'abuseControlSecret'>,
): Promise<{ completed: true }> {
  const input = passwordResetCompleteSchema.parse(rawInput);
  const tokenHash = hashOpaqueToken(input.token);
  await consumeRateLimit(
    pool,
    abuseKey(context, 'password-reset-complete', tokenHash),
    'password-reset-complete',
    8,
    30 * 60,
    30 * 60,
  );
  return executePublicIdempotent(pool, 'password-reset.complete', tokenHash, input.idempotencyKey, { tokenHash, password: '[redacted]' }, async (client) => {
      const reset = await client.query<{ id: string; user_id: string }>(
        `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = $1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > clock_timestamp()
         FOR UPDATE`,
        [tokenHash],
      );
      const record = reset.rows[0];
      if (!record) throw new ApplicationError('validation_failed', 'The password reset credential is invalid or expired.');
      const passwordHash = await hashPassword(input.password);
      await client.query(
        `UPDATE user_credentials
         SET password_hash = $2, password_version = 'scrypt-v2', password_parameters = $3::jsonb,
             rehash_required = false, password_changed_at = clock_timestamp(), failed_attempts = 0,
             locked_until = NULL, updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [record.user_id, passwordHash, JSON.stringify(credentialParameters())],
      );
      await client.query('UPDATE password_reset_tokens SET consumed_at = clock_timestamp() WHERE id = $1', [record.id]);
      await client.query(
        `UPDATE password_reset_tokens SET revoked_at = COALESCE(revoked_at, clock_timestamp())
         WHERE user_id = $1 AND id <> $2 AND consumed_at IS NULL AND revoked_at IS NULL`,
        [record.user_id, record.id],
      );
      await client.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, clock_timestamp())
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [record.user_id],
      );
      return { completed: true as const };
  });
}

export async function updateWorkspaceMembership(
  pool: pg.Pool,
  principal: Principal,
  rawInput: WorkspaceMembershipUpdateInput,
): Promise<{ userId: string; role: WorkspaceRole; state: 'active' | 'suspended' | 'revoked' }> {
  authorize(principal, 'workspace.manage');
  const input = workspaceMembershipUpdateSchema.parse(rawInput) as WorkspaceMembershipUpdateInput;
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`membership:${principal.workspaceId}:${input.userId}`]);
    const targetResult = await client.query<{ role: WorkspaceRole; state: string; email: string; display_name: string; updated_at: string }>(
      `SELECT membership.role, membership.state, user_account.email, user_account.display_name, membership.updated_at::text
       FROM workspace_memberships membership
       JOIN users user_account ON user_account.id = membership.user_id
       WHERE membership.workspace_id = app_current_workspace_id() AND membership.user_id = $1
       FOR UPDATE OF membership`,
      [input.userId],
    );
    const target = targetResult.rows[0];
    if (!target) throw new ApplicationError('not_found', 'Workspace membership was not found.');
    if (input.expectedUpdatedAt && target.updated_at !== input.expectedUpdatedAt) {
      throw new ApplicationError('stale_version', 'This membership changed after the page loaded. Refresh and try again.');
    }
    if (target.role === 'owner') {
      throw new ApplicationError('permission_denied', 'The workspace owner cannot be demoted, suspended, or revoked through member administration.');
    }
    if (input.userId === principal.userId && input.state !== 'active') {
      throw new ApplicationError('permission_denied', 'You cannot suspend or revoke your own active workspace membership.');
    }
    const before = { role: target.role, state: target.state };
    await client.query(
      `UPDATE workspace_memberships
       SET role = $2,
           state = $3,
           revoked_at = CASE WHEN $3 = 'revoked' THEN COALESCE(revoked_at, clock_timestamp()) ELSE NULL END,
           updated_at = clock_timestamp()
       WHERE workspace_id = app_current_workspace_id() AND user_id = $1`,
      [input.userId, input.role, input.state],
    );
    if (input.state !== 'active') {
      await client.query(
        `UPDATE auth_sessions
         SET revoked_at = COALESCE(revoked_at, clock_timestamp())
         WHERE user_id = $1 AND active_workspace_id = app_current_workspace_id() AND revoked_at IS NULL`,
        [input.userId],
      );
    }
    await audit(client, principal, 'workspace.membership.updated', 'workspace_membership', input.userId, before, {
      role: input.role,
      state: input.state,
      email: target.email,
      displayName: target.display_name,
    });
    return { userId: input.userId, role: input.role, state: input.state };
  }, 'workspace.membership.update'));
}

export async function listWorkspaceInvitations(pool: pg.Pool, principal: Principal): Promise<Array<{
  id: string; email: string; role: WorkspaceRole; expiresAt: string; acceptedAt: string | null; revokedAt: string | null; createdAt: string;
}>> {
  authorize(principal, 'workspace.manage');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<{
      id: string; email: string; role: WorkspaceRole; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string;
    }>(
      `SELECT id, email, role, expires_at::text, accepted_at::text, revoked_at::text, created_at::text
       FROM workspace_invitations
       WHERE workspace_id = app_current_workspace_id()
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    return result.rows.map((row) => ({
      id: row.id, email: row.email, role: row.role, expiresAt: row.expires_at,
      acceptedAt: row.accepted_at, revokedAt: row.revoked_at, createdAt: row.created_at,
    }));
  });
}
