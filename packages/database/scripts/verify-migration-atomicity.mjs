import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { applyMigrationAtomically } from './migration-utils.mjs';

const { Client } = pg;
const connectionString = process.env.MIGRATION_ATOMICITY_DATABASE_URL || process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error('MIGRATION_ATOMICITY_DATABASE_URL or MIGRATION_DATABASE_URL is required.');
if (process.env.ALLOW_MIGRATION_ATOMICITY_TEST !== 'YES') {
  throw new Error('Set ALLOW_MIGRATION_ATOMICITY_TEST=YES for a disposable PostgreSQL database.');
}

const admin = new Client({ connectionString, application_name: 'capsicum-migration-atomicity-control' });
await admin.connect();
const prefix = `v6_atomicity_${randomUUID().replaceAll('-', '')}`;
const target = `${prefix}_target`;
const versions = {
  schemaError: `${prefix}_schema_error.sql`,
  postSchema: `${prefix}_post_schema.sql`,
  postLedger: `${prefix}_post_ledger.sql`,
  terminated: `${prefix}_terminated.sql`,
  success: `${prefix}_success.sql`,
};

async function absent(version, marker) {
  const [targetResult, ledgerResult] = await Promise.all([
    admin.query(`SELECT count(*)::integer AS count FROM ${target} WHERE marker = $1`, [marker]),
    admin.query('SELECT count(*)::integer AS count FROM app_schema_migrations WHERE version = $1', [version]),
  ]);
  if (targetResult.rows[0].count !== 0 || ledgerResult.rows[0].count !== 0) {
    throw new Error(`Atomicity failure for ${version}: target=${targetResult.rows[0].count}, ledger=${ledgerResult.rows[0].count}.`);
  }
}

try {
  await admin.query(`CREATE TABLE ${target}(marker text PRIMARY KEY)`);
  for (const [version, marker, faultPoint] of [
    [versions.postSchema, 'post-schema', 'post-schema-pre-ledger'],
    [versions.postLedger, 'post-ledger', 'post-ledger-pre-commit'],
  ]) {
    const client = new Client({ connectionString, application_name: 'capsicum-migration-atomicity-injected' });
    await client.connect();
    try {
      await applyMigrationAtomically(client, {
        version,
        checksum: 'a'.repeat(64),
        sql: `BEGIN; INSERT INTO ${target}(marker) VALUES ('${marker}'); COMMIT;`,
        faultPoint,
      }).then(() => { throw new Error(`Expected ${faultPoint} to fail.`); }, () => undefined);
    } finally {
      await client.end();
    }
    await absent(version, marker);
  }

  const schemaClient = new Client({ connectionString, application_name: 'capsicum-migration-atomicity-schema-error' });
  await schemaClient.connect();
  try {
    await applyMigrationAtomically(schemaClient, {
      version: versions.schemaError,
      checksum: 'b'.repeat(64),
      sql: `BEGIN; INSERT INTO ${target}(marker) VALUES ('schema-error'); SELECT 1 / 0; COMMIT;`,
    }).then(() => { throw new Error('Expected schema execution to fail.'); }, () => undefined);
  } finally {
    await schemaClient.end();
  }
  await absent(versions.schemaError, 'schema-error');

  const terminatedClient = new Client({ connectionString, application_name: 'capsicum-migration-atomicity-termination' });
  await terminatedClient.connect();
  const pid = (await terminatedClient.query('SELECT pg_backend_pid()::integer AS pid')).rows[0].pid;
  await terminatedClient.query('BEGIN');
  await terminatedClient.query(`INSERT INTO ${target}(marker) VALUES ('terminated')`);
  await terminatedClient.query('INSERT INTO app_schema_migrations(version, checksum) VALUES ($1, $2)', [versions.terminated, 'c'.repeat(64)]);
  await admin.query('SELECT pg_terminate_backend($1)', [pid]);
  await terminatedClient.end().catch(() => undefined);
  await absent(versions.terminated, 'terminated');

  const successClient = new Client({ connectionString, application_name: 'capsicum-migration-atomicity-success' });
  await successClient.connect();
  try {
    await applyMigrationAtomically(successClient, {
      version: versions.success,
      checksum: 'd'.repeat(64),
      sql: `BEGIN; INSERT INTO ${target}(marker) VALUES ('success'); COMMIT;`,
    });
  } finally {
    await successClient.end();
  }
  const success = await admin.query(
    `SELECT EXISTS(SELECT 1 FROM ${target} WHERE marker = 'success') AS target,
            EXISTS(SELECT 1 FROM app_schema_migrations WHERE version = $1) AS ledger`,
    [versions.success],
  );
  if (!success.rows[0].target || !success.rows[0].ledger) throw new Error('Successful migration did not commit schema and ledger together.');
  console.log(JSON.stringify({ schemaVersion: '1.0', passed: true, checks: ['schema-error-rollback', 'post-schema-rollback', 'post-ledger-rollback', 'backend-termination-rollback', 'atomic-success'] }, null, 2));
} finally {
  await admin.query('DELETE FROM app_schema_migrations WHERE version = ANY($1::text[])', [Object.values(versions)]).catch(() => undefined);
  await admin.query(`DROP TABLE IF EXISTS ${target}`).catch(() => undefined);
  await admin.end();
}
