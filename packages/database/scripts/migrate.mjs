import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  applyMigrationAtomically,
  requestedFaultPoint,
  stripSingleOuterTransaction,
} from './migration-utils.mjs';
import { requireMigrationDatabaseUrl } from './repository-env.mjs';

const { Client } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(root, '../..');
const {
  connectionString: databaseUrl,
  source: databaseUrlSource,
  loadedFiles,
} = requireMigrationDatabaseUrl(repositoryRoot);
process.stdout.write(
  `migration database configured by ${databaseUrlSource}; ` +
    `loaded ${loadedFiles.length} repository environment file(s)\n`,
);

const migrationsDirectory = resolve(root, 'migrations');
const files = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
for (const [index, file] of files.entries()) {
  const expected = String(index + 1).padStart(4, '0');
  if (!file.startsWith(`${expected}_`)) {
    throw new Error(`Migration sequence is not contiguous at ${file}; expected ${expected}.`);
  }
}

const client = new Client({ connectionString: databaseUrl, application_name: 'capsicum-migrator' });
await client.connect();
try {
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['capsicum-schema-migrations']);
  try {
    const applied = await client.query('SELECT version, checksum FROM app_schema_migrations ORDER BY applied_at, version');
    const appliedByVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));
    const unexpected = [...appliedByVersion.keys()].filter((version) => !files.includes(version));
    if (unexpected.length) throw new Error(`Database contains unexpected migrations: ${unexpected.join(', ')}.`);

    for (const file of files) {
      const sql = await readFile(resolve(migrationsDirectory, file), 'utf8');
      stripSingleOuterTransaction(sql, file);
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existingChecksum = appliedByVersion.get(file);
      if (existingChecksum !== undefined) {
        if (existingChecksum !== checksum) throw new Error(`Applied migration ${file} checksum changed. Create a forward migration instead.`);
        process.stdout.write(`skip ${file}\n`);
        continue;
      }
      await applyMigrationAtomically(client, { version: file, checksum, sql, faultPoint: requestedFaultPoint(file) });
      process.stdout.write(`applied ${file}\n`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['capsicum-schema-migrations']);
  }
} finally {
  await client.end();
}
