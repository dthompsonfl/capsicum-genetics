import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';

export type WorkspaceRole =
  | 'owner'
  | 'breeder'
  | 'technician'
  | 'scientific_reviewer'
  | 'catalog_curator'
  | 'administrator'
  | 'viewer';

export type Permission =
  | 'workspace.manage'
  | 'material.read'
  | 'material.write'
  | 'cross.read'
  | 'cross.write'
  | 'simulation.read'
  | 'simulation.run'
  | 'catalog.read'
  | 'catalog.curate'
  | 'catalog.review'
  | 'catalog.publish'
  | 'observation.read'
  | 'observation.write'
  | 'media.read'
  | 'media.write'
  | 'research.ask'
  | 'job.read'
  | 'job.cancel'
  | 'audit.read'
  | 'export.create'
  | 'system.read';

export const PRIVILEGED_WORKSPACE_ROLES = [
  'owner',
  'administrator',
  'scientific_reviewer',
  'catalog_curator',
] as const satisfies readonly WorkspaceRole[];

const privilegedWorkspaceRoles = new Set<WorkspaceRole>(PRIVILEGED_WORKSPACE_ROLES);

export function isPrivilegedWorkspaceRole(role: WorkspaceRole): boolean {
  return privilegedWorkspaceRoles.has(role);
}

const permissions: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    'workspace.manage',
    'material.read',
    'material.write',
    'cross.read',
    'cross.write',
    'simulation.read',
    'simulation.run',
    'catalog.read',
    'catalog.curate',
    'catalog.review',
    'catalog.publish',
    'observation.read',
    'observation.write',
    'media.read',
    'media.write',
    'research.ask',
    'job.read',
    'job.cancel',
    'audit.read',
    'export.create',
    'system.read',
  ]),
  breeder: new Set<Permission>([
    'material.read',
    'material.write',
    'cross.read',
    'cross.write',
    'simulation.read',
    'simulation.run',
    'catalog.read',
    'observation.read',
    'observation.write',
    'media.read',
    'media.write',
    'research.ask',
    'job.read',
    'export.create',
  ]),
  technician: new Set<Permission>([
    'material.read',
    'material.write',
    'cross.read',
    'simulation.read',
    'observation.read',
    'observation.write',
    'media.read',
    'media.write',
    'job.read',
  ]),
  scientific_reviewer: new Set<Permission>([
    'material.read',
    'cross.read',
    'simulation.read',
    'simulation.run',
    'catalog.read',
    'catalog.review',
    'observation.read',
    'media.read',
    'research.ask',
    'audit.read',
  ]),
  catalog_curator: new Set<Permission>([
    'catalog.read',
    'catalog.curate',
    'material.read',
    'research.ask',
    'audit.read',
  ]),
  administrator: new Set<Permission>([
    'workspace.manage',
    'material.read',
    'material.write',
    'cross.read',
    'cross.write',
    'simulation.read',
    'simulation.run',
    'catalog.read',
    'catalog.curate',
    'observation.read',
    'observation.write',
    'media.read',
    'media.write',
    'research.ask',
    'job.read',
    'job.cancel',
    'audit.read',
    'export.create',
    'system.read',
  ]),
  viewer: new Set<Permission>([
    'material.read',
    'cross.read',
    'simulation.read',
    'catalog.read',
    'observation.read',
    'media.read',
  ]),
};

export function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return permissions[role].has(permission);
}

export function requirePermission(role: WorkspaceRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new RangeError(`Role ${role} does not have permission ${permission}.`);
  }
}

export function isIndependentCatalogReviewer(input: { actorId: string; authorId: string }): boolean {
  return input.actorId.trim().length > 0
    && input.authorId.trim().length > 0
    && input.actorId !== input.authorId;
}

export interface PasswordHashParameters {
  algorithm: 'scrypt';
  version: 2;
  N: number;
  r: number;
  p: number;
  keyLength: number;
}

const LEGACY_PASSWORD_VERSION = 'scrypt-v1';
const PASSWORD_VERSION = 'scrypt-v2';
export const CURRENT_PASSWORD_PARAMETERS: PasswordHashParameters = {
  algorithm: 'scrypt',
  version: 2,
  N: 32768,
  r: 8,
  p: 1,
  keyLength: 64,
};
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function parameterText(parameters: PasswordHashParameters): string {
  return `N=${parameters.N},r=${parameters.r},p=${parameters.p},keyLength=${parameters.keyLength}`;
}

function parseParameters(value: string): PasswordHashParameters | null {
  const values = Object.fromEntries(value.split(',').map((part) => part.split('=', 2)));
  const N = Number(values.N);
  const r = Number(values.r);
  const parallelism = Number(values.p);
  const keyLength = Number(values.keyLength);
  if (![N, r, parallelism, keyLength].every(Number.isSafeInteger)) return null;
  if (N < 16384 || N > 1048576 || r < 1 || r > 64 || parallelism < 1 || parallelism > 16 || keyLength < 32 || keyLength > 128) return null;
  return { algorithm: 'scrypt', version: 2, N, r, p: parallelism, keyLength };
}

async function derivePassword(password: string, salt: Buffer, parameters: PasswordHashParameters): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password.normalize('NFKC'),
      salt,
      parameters.keyLength,
      {
        N: parameters.N,
        r: parameters.r,
        p: parameters.p,
        maxmem: Math.max(SCRYPT_MAXMEM, 128 * parameters.N * parameters.r + 1024 * parameters.r * parameters.p),
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Buffer.from(derivedKey));
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordStrength(password);
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, CURRENT_PASSWORD_PARAMETERS);
  return [PASSWORD_VERSION, parameterText(CURRENT_PASSWORD_PARAMETERS), salt.toString('base64url'), derived.toString('base64url')].join('$');
}

const DUMMY_PASSWORD_HASH = 'scrypt-v2$N=32768,r=8,p=1,keyLength=64$8KfW4ci1SWei0eP0BRYnOA$gHK_43sJD7HFcJwffdYeWvTNpFK-ZkK3T7oUXcthBcN6gBAxoRB1pqQUYDCAZ9WRHC4dkZ_PADnTD4jXpIQ4vQ';

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  let parameters: PasswordHashParameters;
  let saltText: string;
  let hashText: string;
  if (parts.length === 3 && parts[0] === LEGACY_PASSWORD_VERSION) {
    parameters = { ...CURRENT_PASSWORD_PARAMETERS, version: 2 };
    [, saltText = '', hashText = ''] = parts;
  } else if (parts.length === 4 && parts[0] === PASSWORD_VERSION) {
    const parsed = parseParameters(parts[1] ?? '');
    if (!parsed) return false;
    parameters = parsed;
    [, , saltText = '', hashText = ''] = parts;
  } else {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltText, 'base64url');
    expected = Buffer.from(hashText, 'base64url');
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== parameters.keyLength) return false;
  const actual = await derivePassword(password, salt, parameters);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Performs the same scrypt work for known and unknown accounts. The fixed hash
 * is intentionally public and is used only to equalize the authentication cost.
 */
export async function verifyPasswordOrDummy(password: string, encoded?: string | null): Promise<boolean> {
  return verifyPassword(password, encoded ?? DUMMY_PASSWORD_HASH);
}

export function keyedSubjectHash(secret: string, scope: string, value: string): string {
  if (secret.length < 32) throw new RangeError('Abuse-control secret must contain at least 32 characters.');
  const normalizedScope = scope.trim().toLowerCase();
  const normalizedValue = value.trim().normalize('NFKC').toLowerCase();
  if (!normalizedScope || normalizedScope.length > 100) throw new RangeError('Abuse-control scope is invalid.');
  if (!normalizedValue || normalizedValue.length > 2_000) throw new RangeError('Abuse-control subject is invalid.');
  return createHmac('sha256', secret)
    .update(`capsicum-abuse-subject-v1\0${normalizedScope}\0${normalizedValue}`, 'utf8')
    .digest('hex');
}

export function passwordNeedsRehash(encoded: string): boolean {
  const parts = encoded.split('$');
  if (parts[0] !== PASSWORD_VERSION || parts.length !== 4) return true;
  const parameters = parseParameters(parts[1] ?? '');
  return !parameters
    || parameters.N !== CURRENT_PASSWORD_PARAMETERS.N
    || parameters.r !== CURRENT_PASSWORD_PARAMETERS.r
    || parameters.p !== CURRENT_PASSWORD_PARAMETERS.p
    || parameters.keyLength !== CURRENT_PASSWORD_PARAMETERS.keyLength;
}

export function assertPasswordStrength(password: string): void {
  if (password.length < 12 || password.length > 256) {
    throw new RangeError('Password must be between 12 and 256 characters.');
  }
  const categories = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (categories < 3) {
    throw new RangeError('Password must contain at least three character categories.');
  }
  if (/^(.)\1+$/.test(password) || /password|capsicum|qwerty|letmein/i.test(password)) {
    throw new RangeError('Password is too predictable.');
  }
}

export function createDeterministicOpaqueToken(secret: string, context: string, byteLength = 32): string {
  if (secret.length < 32) throw new RangeError('Token derivation secret must contain at least 32 characters.');
  if (!context.trim() || context.length > 2_000) throw new RangeError('Token derivation context is invalid.');
  if (!Number.isSafeInteger(byteLength) || byteLength < 24 || byteLength > 64) {
    throw new RangeError('Deterministic token byte length must be between 24 and 64.');
  }
  return createHmac('sha512', secret).update(`capsicum-token-v1\0${context}`, 'utf8').digest().subarray(0, byteLength).toString('base64url');
}

export function keyedFingerprint(secret: string, purpose: 'network' | 'user-agent', value: string): string {
  if (secret.length < 32) throw new RangeError('Fingerprint secret must contain at least 32 characters.');
  const normalized = value.trim().slice(0, 2_000);
  if (!normalized) throw new RangeError('Fingerprint value must not be empty.');
  return createHmac('sha256', secret).update(`capsicum-${purpose}-v1\0${normalized}`, 'utf8').digest('hex');
}

export function createOpaqueToken(byteLength = 32): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 24 || byteLength > 128) {
    throw new RangeError('Opaque token byte length must be between 24 and 128.');
  }
  return randomBytes(byteLength).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  if (token.length < 32 || token.length > 512) throw new TypeError('Opaque token has an invalid length.');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hashInstallationToken(token: string): string {
  if (token.length < 32 || token.length > 512) {
    throw new TypeError('Installation token must contain between 32 and 512 characters.');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyInstallationToken(token: string, expectedSha256: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new TypeError('Installation token digest must be a SHA-256 hexadecimal value.');
  }
  let actual: Buffer;
  try {
    actual = Buffer.from(hashInstallationToken(token), 'hex');
  } catch {
    return false;
  }
  const expected = Buffer.from(expectedSha256.toLowerCase(), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, '').replaceAll(' ', '');
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new TypeError('TOTP secret is not valid base32.');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new TypeError('TOTP secret is not valid base32.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function createTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function createTotpUri(input: { secret: string; accountName: string; issuer?: string }): string {
  const issuer = input.issuer?.trim() || 'Capsicum Intelligence';
  const label = `${issuer}:${input.accountName.trim()}`;
  const parameters = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`;
}

function totpAtStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

export function verifyTotpCode(
  secret: string,
  code: string,
  options: { now?: Date; window?: number; lastUsedStep?: number | null } = {},
): { valid: boolean; step?: number } {
  if (!/^\d{6}$/.test(code)) return { valid: false };
  const now = options.now ?? new Date();
  const currentStep = Math.floor(now.getTime() / 30_000);
  const window = Math.max(0, Math.min(2, options.window ?? 1));
  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;
    if (options.lastUsedStep !== undefined && options.lastUsedStep !== null && step <= options.lastUsedStep) continue;
    const expected = Buffer.from(totpAtStep(secret, step));
    const actual = Buffer.from(code);
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return { valid: true, step };
  }
  return { valid: false };
}

function encryptionKey(keyHex: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new TypeError('MFA encryption key must be 64 hexadecimal characters.');
  return Buffer.from(keyHex, 'hex');
}

export function encryptTotpSecret(secret: string, keyHex: string): string {
  decodeBase32(secret);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyHex), nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptTotpSecret(encoded: string, keyHex: string): string {
  const [version, nonceText, tagText, ciphertextText] = encoded.split('.');
  if (version !== 'v1' || !nonceText || !tagText || !ciphertextText) throw new TypeError('Encrypted TOTP secret is malformed.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(keyHex), Buffer.from(nonceText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const secret = Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
  decodeBase32(secret);
  return secret;
}

export function createRecoveryCodes(count = 10): string[] {
  if (!Number.isSafeInteger(count) || count < 5 || count > 20) throw new RangeError('Recovery code count must be between 5 and 20.');
  return Array.from({ length: count }, () => {
    const raw = randomBytes(10).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
  });
}

export function hashRecoveryCode(code: string, secret: string): string {
  if (secret.length < 32) throw new RangeError('Recovery-code derivation secret must contain at least 32 characters.');
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length < 16 || normalized.length > 64) throw new TypeError('Recovery code has an invalid format.');
  return createHmac('sha256', secret).update(`capsicum-recovery-code-v1\0${normalized}`, 'utf8').digest('hex');
}

export function sessionExpiry(now = new Date(), ttlHours = 12): Date {
  if (!Number.isSafeInteger(ttlHours) || ttlHours < 1 || ttlHours > 24 * 30) {
    throw new RangeError('Session TTL must be between 1 hour and 30 days.');
  }
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1_000);
}
