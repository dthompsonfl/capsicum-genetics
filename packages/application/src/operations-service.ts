import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  enqueueJobSchema,
  storageCleanupRequestSchema,
  type EnqueueJobInput,
  type Principal,
  type StorageCleanupRequestInput,
} from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import { ApplicationError, audit, authorize, executeIdempotent, requestHash } from './internal';

const jobPermission = {
  'genetics.direct-inheritance-monte-carlo.v1': 'simulation.run',
  'media.inspect.v1': 'media.write',
  'media.derivatives.v1': 'media.write',
  'media.measurements.v1': 'media.write',
  'research.ingest.v1': 'catalog.curate',
  'research.extract-passages.v1': 'catalog.curate',
  'export.breeding-ledger.v1': 'export.create',
  'storage.cleanup.v1': 'job.cancel',
  'worker.health.v1': 'system.read',
} as const;

export async function enqueueJobInTransaction(
  client: pg.PoolClient,
  principal: Principal,
  input: EnqueueJobInput,
): Promise<{ jobId: string; state: 'queued'; duplicate: boolean }> {
  authorize(principal, jobPermission[input.jobType]);
  const contract = await client.query<{ active: boolean }>(
    `SELECT active FROM job_contracts WHERE job_type = $1 AND contract_version = $2`,
    [input.jobType, input.contractVersion],
  );
  if (!contract.rows[0]?.active) {
    throw new ApplicationError('unavailable', 'The requested worker capability is not active.', { retryable: false });
  }
  const jobId = randomUUID();
  const payloadSha256 = requestHash(input.payload);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO jobs(
       id, workspace_id, job_type, contract_version, payload, payload_sha256,
       idempotency_key, trace_id, created_by
     ) VALUES ($1, app_current_workspace_id(), $2, $3, $4::jsonb, $5, $6, $7, app_current_actor_user_id())
     ON CONFLICT (workspace_id, job_type, idempotency_key) DO NOTHING
     RETURNING id`,
    [jobId, input.jobType, input.contractVersion, JSON.stringify(input.payload), payloadSha256, input.clientRequestId, input.traceId],
  );
  const existing = inserted.rows[0] ?? (await client.query<{ id: string; payload_sha256: string | null }>(
    `SELECT id, payload_sha256 FROM jobs
     WHERE workspace_id = app_current_workspace_id() AND job_type = $1 AND idempotency_key = $2
     FOR SHARE`,
    [input.jobType, input.clientRequestId],
  )).rows[0];
  if (!existing) throw new ApplicationError('internal_error', 'The durable job could not be created.', { retryable: true });
  if ('payload_sha256' in existing && existing.payload_sha256 !== payloadSha256) {
    throw new ApplicationError('idempotency_conflict', 'This request identifier was already used for a different job payload.');
  }
  await audit(client, principal, 'job.enqueued', 'job', existing.id, null, {
    jobType: input.jobType,
    contractVersion: input.contractVersion,
    traceId: input.traceId,
    payloadSha256,
  });
  return { jobId: existing.id, state: 'queued' as const, duplicate: inserted.rows.length === 0 };
}

export async function enqueueJob(
  pool: pg.Pool,
  principal: Principal,
  rawInput: EnqueueJobInput,
): Promise<{ jobId: string; state: 'queued'; duplicate: boolean }> {
  const input = enqueueJobSchema.parse(rawInput) as EnqueueJobInput;
  authorize(principal, jobPermission[input.jobType]);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.traceId,
  }, (client) => executeIdempotent(
    client,
    principal,
    input.clientRequestId,
    input,
    async () => enqueueJobInTransaction(client, principal, input),
    `enqueue:${input.jobType}`,
  ));
}

export async function listAuditEvents(pool: pg.Pool, principal: Principal, limit = 100) {
  authorize(principal, 'audit.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT event.id, event.action, event.entity_type, event.entity_id,
            event.before_state, event.after_state, event.occurred_at::text,
            actor.display_name AS actor_name
     FROM audit_events event
     LEFT JOIN users actor ON actor.id = event.actor_user_id
     WHERE event.workspace_id = app_current_workspace_id()
     ORDER BY event.occurred_at DESC LIMIT $1`,
    [Math.max(1, Math.min(500, limit))],
  )).rows);
}

export async function listJobs(pool: pg.Pool, principal: Principal, limit = 100) {
  authorize(principal, 'job.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT id, job_type, contract_version, state::text, priority, attempt, max_attempts,
            available_at::text, lease_owner, lease_expires_at::text, heartbeat_at::text,
            cancellation_requested_at::text, last_error_code, trace_id,
            created_at::text, started_at::text, completed_at::text, result_artifact_id, result,
            (SELECT count(*)::int FROM job_attempts attempt_record
             WHERE attempt_record.workspace_id = jobs.workspace_id AND attempt_record.job_id = jobs.id) AS attempt_count,
            (SELECT count(*)::int FROM job_logs log_record
             WHERE log_record.workspace_id = jobs.workspace_id AND log_record.job_id = jobs.id) AS log_count
     FROM jobs WHERE workspace_id = app_current_workspace_id()
     ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(500, limit))],
  )).rows);
}

export async function getWorkerRuntimeStatus(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'system.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const queue = (await client.query<{
      queued: number; running: number; failed: number; dead_letter: number; oldest_queued_at: string | null;
    }>(
      `SELECT
         count(*) FILTER (WHERE state IN ('queued','failed'))::int AS queued,
         count(*) FILTER (WHERE state IN ('running','cancel_requested'))::int AS running,
         count(*) FILTER (WHERE state = 'failed')::int AS failed,
         count(*) FILTER (WHERE state = 'dead_letter')::int AS dead_letter,
         min(created_at) FILTER (WHERE state IN ('queued','failed'))::text AS oldest_queued_at
       FROM jobs WHERE workspace_id = app_current_workspace_id()`,
    )).rows[0];
    const workers = (await client.query(
      `SELECT worker_id, worker_kind, worker_version, capabilities,
              started_at::text, heartbeat_at::text, current_job_id,
              heartbeat_at >= now() - interval '2 minutes' AS healthy
       FROM worker_heartbeats ORDER BY heartbeat_at DESC`,
    )).rows;
    return { queue, workers };
  });
}

export async function requestJobCancellation(
  pool: pg.Pool,
  principal: Principal,
  jobId: string,
  clientRequestId = `cancel:${jobId}`,
) {
  authorize(principal, 'job.cancel');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => executeIdempotent(client, principal, clientRequestId, { jobId }, async () => {
    const result = await client.query<{ state: string }>('SELECT app_request_job_cancellation($1)::text AS state', [jobId]);
    const state = result.rows[0];
    if (!state) throw new ApplicationError('conflict', 'Job cannot be cancelled in its current state.');
    await audit(client, principal, 'job.cancellation_requested', 'job', jobId, null, state);
    return state;
  }, 'job.cancel'));
}

export async function retryJob(
  pool: pg.Pool,
  principal: Principal,
  jobId: string,
  clientRequestId: string,
) {
  authorize(principal, 'job.cancel');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => executeIdempotent(client, principal, clientRequestId, { jobId }, async () => {
    const result = await client.query<{ state: string }>('SELECT app_retry_job($1)::text AS state', [jobId]);
    const state = result.rows[0];
    if (!state) throw new ApplicationError('conflict', 'Job is not eligible for retry or has exhausted its attempts.');
    await audit(client, principal, 'job.retried', 'job', jobId, null, state);
    return state;
  }, 'job.retry'));
}

export async function workspaceMembers(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'workspace.manage');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT user.id, user.email, user.display_name, membership.role::text,
            membership.state, membership.created_at::text, membership.updated_at::text, membership.revoked_at::text
     FROM workspace_memberships membership
     JOIN users user ON user.id = membership.user_id
     WHERE membership.workspace_id = app_current_workspace_id()
     ORDER BY membership.created_at`,
  )).rows);
}

export async function workspaceDetail(pool: pg.Pool, principal: Principal) {
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT workspace.id, workspace.slug, workspace.name, workspace.created_at::text,
            count(membership.user_id)::int AS member_count
     FROM workspaces workspace
     LEFT JOIN workspace_memberships membership ON membership.workspace_id = workspace.id AND membership.state = 'active'
     WHERE workspace.id = app_current_workspace_id()
     GROUP BY workspace.id`,
  )).rows[0] ?? null);
}

export async function enqueueStorageCleanup(
  pool: pg.Pool,
  principal: Principal,
  rawInput: StorageCleanupRequestInput,
): Promise<{ jobId: string; state: 'queued'; duplicate: boolean }> {
  const input = storageCleanupRequestSchema.parse(rawInput);
  authorize(principal, 'job.cancel');
  return enqueueJob(pool, principal, {
    jobType: 'storage.cleanup.v1',
    contractVersion: '1.0.0',
    payload: {
      workspaceId: principal.workspaceId,
      dryRun: input.dryRun,
      retentionHours: input.retentionHours,
      deletionLimit: input.deletionLimit,
      scanLimit: input.scanLimit,
      prefix: `workspaces/${principal.workspaceId}/`,
      requestedBy: principal.userId,
    },
    clientRequestId: input.clientRequestId,
    traceId: `storage-cleanup:${input.clientRequestId}`,
  });
}
