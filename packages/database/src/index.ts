import pg from 'pg';
import { MIGRATION_MANIFEST } from './migration-manifest';

const { Pool } = pg;

export { EXPECTED_SCHEMA_MIGRATIONS, MIGRATION_MANIFEST } from './migration-manifest';
export type { MigrationIdentity } from './migration-manifest';
export type DatabasePool = pg.Pool;

export interface DatabasePoolOptions {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: false | { rejectUnauthorized: boolean };
  applicationName?: string;
}

export function createDatabasePool(
  connectionString: string,
  options: DatabasePoolOptions = {},
): pg.Pool {
  if (
    !connectionString.startsWith('postgresql://') &&
    !connectionString.startsWith('postgres://')
  ) {
    throw new TypeError('DATABASE_URL must be a PostgreSQL connection string.');
  }
  return new Pool({
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    application_name: options.applicationName ?? 'capsicum-breeding-intelligence',
    ...(options.ssl ? { ssl: options.ssl } : {}),
  });
}

export interface WorkspacePrincipal {
  workspaceId: string;
  actorUserId: string;
  requestId?: string;
}

export async function withSystemTransaction<T>(
  pool: pg.Pool,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withWorkspaceTransaction<T>(
  pool: pg.Pool,
  principal: WorkspacePrincipal,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (principal.workspaceId.trim().length === 0) throw new TypeError('workspaceId is required.');
  if (principal.actorUserId.trim().length === 0) throw new TypeError('actorUserId is required.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [principal.workspaceId]);
    await client.query("SELECT set_config('app.actor_user_id', $1, true)", [principal.actorUserId]);
    if (principal.requestId) {
      await client.query("SELECT set_config('app.request_id', $1, true)", [principal.requestId]);
    }
    const membershipResult = await client.query<{
      allowed: boolean;
      role: string | null;
    }>(
      `SELECT EXISTS (
         SELECT 1
         FROM workspace_memberships
         WHERE workspace_id = $1
           AND user_id = $2
           AND state = 'active'
       ) AS allowed,
       (
         SELECT role::text
         FROM workspace_memberships
         WHERE workspace_id = $1
           AND user_id = $2
           AND state = 'active'
       ) AS role`,
      [principal.workspaceId, principal.actorUserId],
    );
    if (membershipResult.rows[0]?.allowed !== true) {
      throw new RangeError('The authenticated actor is not an active member of the requested workspace.');
    }
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface MigrationIdentityRecord {
  version: string;
  checksum: string;
}

export type AppliedMigrationIdentity = MigrationIdentityRecord;

export interface MigrationStatus {
  ok: boolean;
  expectedCount: number;
  appliedCount: number;
  missing: string[];
  unexpected: string[];
  checksumMismatches: Array<{ version: string; expected: string; applied: string }>;
  orderMismatch: boolean;
}

export function compareMigrationState(
  applied: readonly AppliedMigrationIdentity[],
  expected: readonly MigrationIdentityRecord[] = MIGRATION_MANIFEST,
): MigrationStatus {
  const expectedByVersion = new Map<string, string>(expected.map((migration) => [migration.version, migration.checksum]));
  const appliedByVersion = new Map<string, string>(applied.map((migration) => [migration.version, migration.checksum]));
  const missing = expected.filter((migration) => !appliedByVersion.has(migration.version)).map((migration) => migration.version);
  const unexpected = applied.filter((migration) => !expectedByVersion.has(migration.version)).map((migration) => migration.version);
  const checksumMismatches = expected.flatMap((migration) => {
    const actual = appliedByVersion.get(migration.version);
    return actual !== undefined && actual !== migration.checksum
      ? [{ version: migration.version, expected: migration.checksum, applied: actual }]
      : [];
  });
  const expectedOrder = expected.map((migration) => migration.version).filter((version) => appliedByVersion.has(version));
  const appliedExpectedOrder = applied.map((migration) => migration.version).filter((version) => expectedByVersion.has(version));
  const orderMismatch = expectedOrder.length !== appliedExpectedOrder.length || expectedOrder.some((version, index) => appliedExpectedOrder[index] !== version);
  return {
    ok: missing.length === 0 && unexpected.length === 0 && checksumMismatches.length === 0 && !orderMismatch,
    expectedCount: expected.length,
    appliedCount: applied.length,
    missing,
    unexpected,
    checksumMismatches,
    orderMismatch,
  };
}

export async function databaseHealth(pool: pg.Pool): Promise<{
  ok: boolean;
  databaseTime?: string;
  migrationCount?: number;
  appliedMigrations?: AppliedMigrationIdentity[];
  migrationStatus?: MigrationStatus;
  error?: string;
}> {
  try {
    const timeResult = await pool.query<{ database_time: string }>('SELECT now()::text AS database_time');
    const migrationResult = await pool.query<AppliedMigrationIdentity>(
      `SELECT version, checksum
       FROM app_schema_migrations
       ORDER BY applied_at, version`,
    );
    const appliedMigrations = migrationResult.rows.map((row) => ({ version: row.version, checksum: row.checksum }));
    const databaseTime = timeResult.rows[0]?.database_time;
    return {
      ok: true,
      ...(databaseTime ? { databaseTime } : {}),
      migrationCount: appliedMigrations.length,
      appliedMigrations,
      migrationStatus: compareMigrationState(appliedMigrations),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown database error.' };
  }
}
