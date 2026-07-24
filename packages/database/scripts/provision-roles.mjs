import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.MIGRATION_DATABASE_URL;
const runtimePassword = process.env.CAPSICUM_RUNTIME_DB_PASSWORD;
const workerPassword = process.env.CAPSICUM_WORKER_DB_PASSWORD;
if (!adminUrl) throw new Error('DATABASE_ADMIN_URL or MIGRATION_DATABASE_URL is required.');

function requiredPassword(value, label) {
  if (!value || value.length < 24) throw new Error(`${label} must contain at least 24 characters.`);
  return value;
}
function literal(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const client = new Client({ connectionString: adminUrl, application_name: 'capsicum-role-provisioner' });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capsicum_runtime_login') THEN
      CREATE ROLE capsicum_runtime_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capsicum_worker_login') THEN
      CREATE ROLE capsicum_worker_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
  END $$`);
  await client.query(`ALTER ROLE capsicum_runtime_login PASSWORD ${literal(requiredPassword(runtimePassword, 'CAPSICUM_RUNTIME_DB_PASSWORD'))}`);
  await client.query(`ALTER ROLE capsicum_worker_login PASSWORD ${literal(requiredPassword(workerPassword, 'CAPSICUM_WORKER_DB_PASSWORD'))}`);
  await client.query('GRANT capsicum_runtime TO capsicum_runtime_login');
  await client.query('GRANT capsicum_worker TO capsicum_worker_login');
  await client.query('REVOKE capsicum_worker FROM capsicum_runtime_login');
  await client.query('REVOKE capsicum_runtime FROM capsicum_worker_login');
  await client.query("ALTER ROLE capsicum_runtime_login SET statement_timeout = '30s'");
  await client.query("ALTER ROLE capsicum_runtime_login SET idle_in_transaction_session_timeout = '15s'");
  await client.query("ALTER ROLE capsicum_worker_login SET statement_timeout = '10min'");
  await client.query("ALTER ROLE capsicum_worker_login SET idle_in_transaction_session_timeout = '15s'");
  await client.query('COMMIT');
  process.stdout.write('provisioned restricted runtime and worker database logins\n');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
