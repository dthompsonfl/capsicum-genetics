import { environmentReadiness, environmentSchema, type ReadinessCheck } from '@capsicum/config';
import { databaseHealth, EXPECTED_SCHEMA_MIGRATIONS } from '@capsicum/database';
import { probeObjectStorage } from '@capsicum/storage';
import { getDatabasePool } from './database';
import { getObjectStorageConfig } from './storage';

export interface SafeSystemReadiness {
  valid: boolean;
  generatedAt: string;
  runtime: {
    nodeVersion: string;
    node24OrNewer: boolean;
    appMode: string;
  };
  configured: {
    database: boolean;
    objectStorage: boolean;
    hostedAi: boolean;
    learnedVision: boolean;
    researchModels: boolean;
  };
  issues: Array<{ path: string; message: string }>;
  readiness: readonly ReadinessCheck[];
  live?: {
    database: {
      ok: boolean;
      migrationCount?: number;
      expectedMigrationCount: number;
      missingMigrationVersions?: string[];
      unexpectedMigrationVersions?: string[];
      checksumMismatchVersions?: string[];
      orderMismatch?: boolean;
      detail: string;
    };
    objectStorage: { ok: boolean; mode?: string; statusCode?: number; detail: string };
  };
}

function nodeMajor(): number {
  return Number(process.versions.node.split('.')[0] ?? 0);
}

export async function getSafeSystemReadiness(includeLiveChecks = true): Promise<SafeSystemReadiness> {
  const parsed = environmentSchema.safeParse(process.env);
  const base = {
    generatedAt: new Date().toISOString(),
    runtime: {
      nodeVersion: process.versions.node,
      node24OrNewer: nodeMajor() >= 24,
      appMode: process.env.APP_MODE ?? 'demo',
    },
    configured: {
      database: Boolean(process.env.DATABASE_URL),
      objectStorage: Boolean(process.env.S3_ENDPOINT),
      hostedAi: process.env.ENABLE_HOSTED_AI === 'true' && Boolean(process.env.AI_GATEWAY_API_KEY),
      learnedVision: process.env.ENABLE_LEARNED_VISION === 'true',
      researchModels: process.env.ENABLE_RESEARCH_MODELS === 'true',
    },
  };
  if (!parsed.success) {
    return {
      valid: false,
      ...base,
      issues: parsed.error.issues.map((issue: { path: PropertyKey[]; message: string }) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
      readiness: [],
    };
  }
  const readiness = environmentReadiness(parsed.data);
  if (!includeLiveChecks) return { valid: true, ...base, issues: [], readiness };

  const database = parsed.data.DATABASE_URL
    ? await databaseHealth(getDatabasePool())
    : { ok: false as const, error: 'Database is not configured.' };
  const objectStorage = parsed.data.S3_ENDPOINT
    ? await probeObjectStorage(getObjectStorageConfig())
    : { ok: false as const, detail: 'Object storage is not configured.' };
  const status = database.migrationStatus;
  const migrationReady = database.ok && status?.ok === true;
  const detail = !database.ok
    ? 'PostgreSQL health check failed.'
    : migrationReady
      ? 'PostgreSQL is reachable and its ordered migration versions and checksums match the repository manifest.'
      : [
          `PostgreSQL is reachable but the migration manifest does not match (${status?.appliedCount ?? 0}/${EXPECTED_SCHEMA_MIGRATIONS}).`,
          status?.missing.length ? `Missing: ${status.missing.join(', ')}.` : '',
          status?.unexpected.length ? `Unexpected: ${status.unexpected.join(', ')}.` : '',
          status?.checksumMismatches.length ? `Checksum mismatches: ${status.checksumMismatches.map((item) => item.version).join(', ')}.` : '',
          status?.orderMismatch ? 'Applied migration order differs from the repository manifest.' : '',
        ].filter(Boolean).join(' ');
  return {
    valid: true,
    ...base,
    issues: [],
    readiness,
    live: {
      database: {
        ok: migrationReady,
        ...(database.migrationCount !== undefined ? { migrationCount: database.migrationCount } : {}),
        expectedMigrationCount: EXPECTED_SCHEMA_MIGRATIONS,
        ...(status?.missing.length ? { missingMigrationVersions: status.missing } : {}),
        ...(status?.unexpected.length ? { unexpectedMigrationVersions: status.unexpected } : {}),
        ...(status?.checksumMismatches.length ? { checksumMismatchVersions: status.checksumMismatches.map((item) => item.version) } : {}),
        ...(status?.orderMismatch ? { orderMismatch: true } : {}),
        detail,
      },
      objectStorage: {
        ok: objectStorage.ok,
        ...('mode' in objectStorage ? { mode: objectStorage.mode } : {}),
        ...('statusCode' in objectStorage && objectStorage.statusCode !== undefined ? { statusCode: objectStorage.statusCode } : {}),
        detail: objectStorage.detail,
      },
    },
  };
}
