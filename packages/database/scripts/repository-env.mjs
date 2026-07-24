import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function loadRepositoryEnvironment(repositoryRoot) {
  const loadedFiles = [];
  const candidates = [resolve(repositoryRoot, '.env.local'), resolve(repositoryRoot, '.env')];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    loadEnvFile(candidate);
    loadedFiles.push(candidate);
  }

  return loadedFiles;
}

export function resolveMigrationDatabaseUrl(environment = process.env) {
  const migrationUrl = nonEmpty(environment.MIGRATION_DATABASE_URL);
  const adminUrl = nonEmpty(environment.DATABASE_ADMIN_URL);
  const runtimeUrl = nonEmpty(environment.DATABASE_URL);
  const selected = migrationUrl
    ? { connectionString: migrationUrl, source: 'MIGRATION_DATABASE_URL' }
    : adminUrl
      ? { connectionString: adminUrl, source: 'DATABASE_ADMIN_URL' }
      : runtimeUrl
        ? { connectionString: runtimeUrl, source: 'DATABASE_URL' }
        : undefined;

  if (!selected) return undefined;

  let parsed;
  try {
    parsed = new URL(selected.connectionString);
  } catch {
    throw new Error(`${selected.source} must be a valid PostgreSQL connection URL.`);
  }
  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${selected.source} must use the postgresql:// or postgres:// protocol.`);
  }

  const production = environment.APP_MODE === 'production' || environment.NODE_ENV === 'production';
  if (production && selected.source === 'DATABASE_URL') {
    throw new Error(
      'Production migrations require MIGRATION_DATABASE_URL or DATABASE_ADMIN_URL. ' +
        'Refusing to use the restricted DATABASE_URL runtime role.',
    );
  }

  return selected;
}

export function requireMigrationDatabaseUrl(repositoryRoot) {
  const loadedFiles = loadRepositoryEnvironment(repositoryRoot);
  const selected = resolveMigrationDatabaseUrl(process.env);
  if (selected) return { ...selected, loadedFiles };

  const localEnvPath = resolve(repositoryRoot, '.env.local');
  throw new Error(
    [
      'Database migration credentials are not configured.',
      `Set MIGRATION_DATABASE_URL (preferred) or DATABASE_ADMIN_URL in the shell or in ${localEnvPath}.`,
      'For local development only, DATABASE_URL is accepted as a fallback.',
      'Copy .env.example to .env.local and replace every placeholder; the example file is never loaded automatically.',
    ].join(' '),
  );
}
