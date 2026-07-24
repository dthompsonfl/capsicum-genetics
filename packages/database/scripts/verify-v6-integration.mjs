import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (process.env.ALLOW_V6_INTEGRATION_TEST !== 'YES') throw new Error('Set ALLOW_V6_INTEGRATION_TEST=YES against a disposable database.');
const adminUrl = process.env.DATABASE_ADMIN_URL;
const runtimeUrl = process.env.DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
if (!adminUrl || !runtimeUrl || !workerUrl) throw new Error('DATABASE_ADMIN_URL, DATABASE_URL, and WORKER_DATABASE_URL are required.');
const manifest = JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../src/generated/migration-manifest.json'), 'utf8')).migrations;
const { Client } = pg;
const admin = new Client({ connectionString: adminUrl, application_name: 'capsicum-v6-integration-admin' });
const runtime = new Client({ connectionString: runtimeUrl, application_name: 'capsicum-v6-integration-runtime' });
const worker = new Client({ connectionString: workerUrl, application_name: 'capsicum-v6-integration-worker' });
const ids = { userA: randomUUID(), userB: randomUUID(), workspaceA: randomUUID(), workspaceB: randomUUID(), pending: null, previewJob: randomUUID(), deleteJob: randomUUID() };
function assert(condition, message) { if (!condition) throw new Error(message); }
async function rejected(operation, fragment) {
  try { await operation(); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.toLowerCase().includes(fragment.toLowerCase()), `Expected rejection containing ${fragment}, received ${message}`); return;
  }
  throw new Error(`Expected operation to reject with ${fragment}.`);
}
async function setContext(client, workspaceId, userId) {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('app.current_workspace_id',$1,true), set_config('app.current_actor_user_id',$2,true)`, [workspaceId, userId]);
}
await admin.connect(); await runtime.connect(); await worker.connect();
try {
  const applied = (await admin.query('SELECT version, checksum FROM app_schema_migrations ORDER BY applied_at, version')).rows;
  assert(JSON.stringify(applied) === JSON.stringify(manifest), 'Applied migration identity/checksum set differs from generated manifest.');
  await admin.query('BEGIN');
  await admin.query('INSERT INTO users(id,email,display_name) VALUES ($1,$2,$3),($4,$5,$6)', [ids.userA, `v6-a-${ids.userA}@test.invalid`, 'V6 A', ids.userB, `v6-b-${ids.userB}@test.invalid`, 'V6 B']);
  await admin.query('INSERT INTO workspaces(id,slug,name,created_by) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', [ids.workspaceA, `v6-a-${ids.workspaceA}`, 'V6 A', ids.userA, ids.workspaceB, `v6-b-${ids.workspaceB}`, 'V6 B', ids.userB]);
  await admin.query("INSERT INTO workspace_memberships(workspace_id,user_id,role,state) VALUES ($1,$2,'owner','active'),($3,$4,'owner','active')", [ids.workspaceA, ids.userA, ids.workspaceB, ids.userB]);
  await admin.query('COMMIT');

  await setContext(runtime, ids.workspaceA, ids.userA);
  const sourceHash = 'a'.repeat(64);
  const objectKey = `workspaces/${ids.workspaceA}/quarantine/${randomUUID()}/${sourceHash}.png`;
  const inserted = await runtime.query(`SELECT app_register_pending_object_upload('media_upload',$1,$2,$3,100,'image/png',3600)::text AS id`, [randomUUID(), objectKey, sourceHash]);
  ids.pending = inserted.rows[0].id;
  await runtime.query('SELECT app_mark_pending_object_stored($1)', [ids.pending]);
  await runtime.query("SELECT app_fail_pending_object_upload($1,true,'fixture_after_object_write','{}'::jsonb)", [ids.pending]);
  assert((await runtime.query('SELECT count(*)::int AS count FROM pending_object_uploads')).rows[0].count === 1, 'Owner cannot see their pending object.');
  await runtime.query('COMMIT');

  await setContext(runtime, ids.workspaceA, ids.userA);
  await rejected(() => runtime.query("INSERT INTO pending_object_uploads(workspace_id,purpose,client_request_id,object_key,source_sha256,byte_length,media_type,created_by) VALUES ($1,'media_upload','direct-write',$2,$3,100,'image/png',$4)", [ids.workspaceA, objectKey.replace(sourceHash, 'b'.repeat(64)), 'b'.repeat(64), ids.userA]), 'permission denied');
  await runtime.query('ROLLBACK');

  await setContext(runtime, ids.workspaceB, ids.userB);
  assert((await runtime.query('SELECT count(*)::int AS count FROM pending_object_uploads')).rows[0].count === 0, 'Cross-workspace RLS exposed a pending object.');
  await rejected(() => runtime.query('SELECT app_mark_pending_object_stored($1)', [ids.pending]), 'not found');
  await runtime.query('ROLLBACK');

  const runtimeWorkerPrivilege = (await runtime.query("SELECT has_function_privilege(current_user,'app_worker_enqueue_storage_cleanup()','EXECUTE') AS allowed")).rows[0].allowed;
  assert(runtimeWorkerPrivilege === false, 'Runtime role can execute a worker-only cleanup function.');
  const workerHumanPrivilege = (await worker.query("SELECT has_function_privilege(current_user,'app_register_pending_object_upload(text,text,text,text,bigint,text,integer)','EXECUTE') AS allowed")).rows[0].allowed;
  assert(workerHumanPrivilege === false, 'Worker role can execute a human upload-authority function.');

  await admin.query("UPDATE pending_object_uploads SET created_at=now()-interval '48 hours', expires_at=now()-interval '47 hours' WHERE id=$1", [ids.pending]);
  const cleanupPrefix = `workspaces/${ids.workspaceA}/`;
  const previewPayload = { workspaceId: ids.workspaceA, dryRun: true, retentionHours: 24, deletionLimit: 10, prefix: cleanupPrefix };
  await admin.query(`INSERT INTO jobs(id,workspace_id,job_type,contract_version,state,payload,payload_sha256,idempotency_key,trace_id,created_by,attempt,max_attempts,lease_owner,lease_expires_at,started_at)
    VALUES ($1,$2,'storage.cleanup.v1','1.0.0','running',$3::jsonb,encode(digest(convert_to($3::jsonb::text,'UTF8'),'sha256'),'hex'),'preview-fixture','preview-fixture',$4,1,3,'v6-integration-worker',now()+interval '5 minutes',now())`,
    [ids.previewJob, ids.workspaceA, JSON.stringify(previewPayload), ids.userA]);
  const preview = await worker.query('SELECT id::text,object_key,reference_count FROM app_worker_preview_pending_object_cleanup($1,$2,$3)', [ids.previewJob, 'v6-integration-worker', 10]);
  assert(preview.rowCount === 1 && preview.rows[0].reference_count === 0, 'Cleanup dry-run did not return exactly one unreferenced candidate.');
  assert((await admin.query('SELECT state::text FROM pending_object_uploads WHERE id=$1', [ids.pending])).rows[0].state === 'cleanup_requested', 'Dry-run mutated pending-object state.');

  const deletePayload = { ...previewPayload, dryRun: false };
  await admin.query(`INSERT INTO jobs(id,workspace_id,job_type,contract_version,state,payload,payload_sha256,idempotency_key,trace_id,created_by,attempt,max_attempts,lease_owner,lease_expires_at,started_at)
    VALUES ($1,$2,'storage.cleanup.v1','1.0.0','running',$3::jsonb,encode(digest(convert_to($3::jsonb::text,'UTF8'),'sha256'),'hex'),'delete-fixture','delete-fixture',$4,1,3,'v6-integration-worker',now()+interval '5 minutes',now())`,
    [ids.deleteJob, ids.workspaceA, JSON.stringify(deletePayload), ids.userA]);
  const claimed = await worker.query('SELECT id::text FROM app_worker_claim_pending_object_cleanup($1,$2,$3)', [ids.deleteJob, 'v6-integration-worker', 10]);
  assert(claimed.rowCount === 1, 'Destructive cleanup did not claim the verified orphan exactly once.');
  await worker.query("SELECT app_worker_finalize_pending_object_cleanup($1,$2,$3,false,'fixture_restore')", [ids.deleteJob, 'v6-integration-worker', ids.pending]);

  console.log(JSON.stringify({ passed: true, migrations: manifest.length, checks: ['exact-migration-manifest','runtime-direct-write-denied','cross-workspace-rls','runtime-worker-function-denied','worker-human-function-denied','cleanup-dry-run-non-mutating','cleanup-bounded-reference-guard'] }, null, 2));
} finally {
  await runtime.query('ROLLBACK').catch(() => undefined); await worker.query('ROLLBACK').catch(() => undefined);
  await admin.query('DELETE FROM jobs WHERE id = ANY($1::uuid[])', [[ids.previewJob, ids.deleteJob]]).catch(() => undefined);
  await admin.query('DELETE FROM pending_object_uploads WHERE workspace_id = ANY($1::uuid[])', [[ids.workspaceA, ids.workspaceB]]).catch(() => undefined);
  await admin.query('DELETE FROM workspace_memberships WHERE workspace_id = ANY($1::uuid[])', [[ids.workspaceA, ids.workspaceB]]).catch(() => undefined);
  await admin.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[ids.workspaceA, ids.workspaceB]]).catch(() => undefined);
  await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ids.userA, ids.userB]]).catch(() => undefined);
  await Promise.all([admin.end(), runtime.end(), worker.end()]);
}
