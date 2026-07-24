import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { Principal, StandardError } from '@capsicum/contracts';
import { requirePermission, type Permission } from '@capsicum/auth';

export type ApplicationErrorCode = StandardError['error']['code'];

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly retryable: boolean;
  readonly fieldErrors: Record<string, string[]> | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: ApplicationErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      fieldErrors?: Record<string, string[]>;
      retryAfterSeconds?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApplicationError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.fieldErrors = options.fieldErrors;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function authorize(principal: Principal, permission: Permission): void {
  try {
    requirePermission(principal.role, permission);
  } catch (cause) {
    throw new ApplicationError('permission_denied', 'You do not have permission to perform this action.', { cause });
  }
}

interface IdempotencyRow<T> {
  request_hash: string;
  state: 'pending' | 'completed' | 'failed_retryable' | 'failed_terminal' | 'conflict';
  response_status: number | null;
  response_body: T | null;
  locked_until: string | null;
}

/**
 * Runs an authoritative mutation under a stable intent key. The record and the
 * aggregate are committed in one transaction, so rollback removes the pending
 * key and a valid retry is never poisoned. Concurrent callers serialize on the
 * record and receive the original completed response.
 */
export async function executeIdempotent<T>(
  client: pg.PoolClient,
  principal: Principal,
  idempotencyKey: string,
  payload: unknown,
  operation: () => Promise<T>,
  operationName = 'authoritative_mutation',
): Promise<T> {
  const hash = requestHash(payload);
  const inserted = await client.query<{ inserted: boolean }>(
    `WITH inserted AS (
       INSERT INTO idempotency_records(
         workspace_id, actor_user_id, idempotency_key, request_hash,
         state, operation_name, locked_until, updated_at
       ) VALUES ($1, $2, $3, $4, 'pending', $5, clock_timestamp() + interval '2 minutes', clock_timestamp())
       ON CONFLICT DO NOTHING
       RETURNING 1
     ) SELECT EXISTS (SELECT 1 FROM inserted) AS inserted`,
    [principal.workspaceId, principal.userId, idempotencyKey, hash, operationName],
  );

  const existing = await client.query<IdempotencyRow<T>>(
    `SELECT request_hash, state::text, response_status, response_body, locked_until::text
     FROM idempotency_records
     WHERE workspace_id = $1 AND actor_user_id = $2 AND idempotency_key = $3
     FOR UPDATE`,
    [principal.workspaceId, principal.userId, idempotencyKey],
  );
  const record = existing.rows[0];
  if (!record) {
    throw new ApplicationError('internal_error', 'The request intent could not be acquired.', { retryable: true });
  }
  if (record.request_hash !== hash) {
    throw new ApplicationError(
      'idempotency_conflict',
      'This request identifier was already used for a different payload. Reset the form and submit again.',
    );
  }
  if (record.state === 'completed' && record.response_status !== null && record.response_body !== null) {
    return record.response_body;
  }
  if (record.state === 'failed_terminal' || record.state === 'conflict') {
    throw new ApplicationError('conflict', 'The original request reached a terminal conflict and cannot be replayed.');
  }
  if (!inserted.rows[0]?.inserted && record.state === 'pending' && record.locked_until) {
    // SELECT FOR UPDATE waits for an in-flight transaction. A committed pending
    // record can only be a recovered legacy/stale record; take it over after expiry.
    const lockedUntil = Date.parse(record.locked_until);
    if (Number.isFinite(lockedUntil) && lockedUntil > Date.now()) {
      throw new ApplicationError('duplicate_in_progress', 'The same request is already being processed.', {
        retryable: true,
        retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1_000)),
      });
    }
  }

  await client.query(
    `UPDATE idempotency_records
     SET state = 'pending', operation_name = $4, locked_until = clock_timestamp() + interval '2 minutes',
         last_error_code = NULL, updated_at = clock_timestamp()
     WHERE workspace_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
    [principal.workspaceId, principal.userId, idempotencyKey, operationName],
  );

  const response = await operation();
  await client.query(
    `UPDATE idempotency_records
     SET state = 'completed', response_status = 200, response_body = $4::jsonb,
         locked_until = NULL, completed_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE workspace_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
    [principal.workspaceId, principal.userId, idempotencyKey, JSON.stringify(response)],
  );
  return response;
}

export function toPublicError(error: unknown, requestId?: string): StandardError {
  const appError = error instanceof ApplicationError ? error : null;
  const message = appError
    ? appError.message
    : error instanceof TypeError || error instanceof RangeError
      ? error.message.slice(0, 500)
      : 'The request could not be completed.';
  return {
    error: {
      code: appError?.code ?? (error instanceof TypeError || error instanceof RangeError ? 'validation_failed' : 'internal_error'),
      message,
      retryable: appError?.retryable ?? false,
      ...(requestId ? { requestId } : {}),
      ...(appError?.retryAfterSeconds ? { retryAfterSeconds: appError.retryAfterSeconds } : {}),
      ...(appError?.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
    },
  };
}

export async function audit(
  client: pg.PoolClient,
  principal: Principal,
  action: string,
  entityType: string,
  entityId: string | null,
  beforeState: unknown,
  afterState: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events(workspace_id, actor_user_id, action, entity_type, entity_id, before_state, after_state, request_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, current_setting('app.request_id', true))`,
    [
      principal.workspaceId,
      principal.userId,
      action,
      entityType,
      entityId,
      beforeState === undefined ? null : JSON.stringify(beforeState),
      afterState === undefined ? null : JSON.stringify(afterState),
    ],
  );
}
