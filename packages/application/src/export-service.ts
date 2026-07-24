import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { BREEDING_LEDGER_SCHEMA_VERSION, type Principal } from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import { audit, authorize, executeIdempotent } from './internal';
import { enforceOperationAdmission } from './admission-service';
import { enqueueJobInTransaction } from './operations-service';

export type BreedingLedgerExportFormat = 'json' | 'csv';

export async function requestBreedingLedgerExport(
  pool: pg.Pool,
  principal: Principal,
  format: BreedingLedgerExportFormat,
  clientRequestId: string,
  traceId: string,
): Promise<{ exportJobId: string; jobId: string; state: 'queued' }> {
  await enforceOperationAdmission(pool, principal, { scope: 'export.breeding-ledger', limit: 10, windowSeconds: 3600, activeJobTypes: ['export.breeding-ledger.v1'], maxActiveJobs: 3 });
  authorize(principal, 'export.create');
  if (format !== 'json' && format !== 'csv') throw new TypeError('Export format must be json or csv.');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: traceId,
  }, (client) => executeIdempotent(client, principal, clientRequestId, { format }, async () => {
    const exportJobId = randomUUID();
    const job = await enqueueJobInTransaction(client, principal, {
      jobType: 'export.breeding-ledger.v1',
      contractVersion: '1.0.0',
      clientRequestId: `${clientRequestId}:worker`,
      traceId,
      payload: { exportJobId, format, schemaVersion: BREEDING_LEDGER_SCHEMA_VERSION },
    });
    await client.query(
      `INSERT INTO export_jobs(
         id, workspace_id, export_type, requested_format, filter_payload,
         state, job_id, requested_by
       ) VALUES (
         $1, app_current_workspace_id(), 'breeding_ledger', $2,
         $3::jsonb, 'queued', $4, app_current_actor_user_id()
       )`,
      [
        exportJobId,
        format,
        JSON.stringify({ schemaVersion: BREEDING_LEDGER_SCHEMA_VERSION, format }),
        job.jobId,
      ],
    );
    await audit(client, principal, 'export.queued', 'export_job', exportJobId, null, {
      format,
      workerJobId: job.jobId,
      schemaVersion: BREEDING_LEDGER_SCHEMA_VERSION,
    });
    return { exportJobId, jobId: job.jobId, state: 'queued' as const };
  }, 'export.breeding_ledger'));
}

export async function listExportJobs(pool: pg.Pool, principal: Principal, limit = 100) {
  authorize(principal, 'export.create');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT export.id, export.export_type, export.requested_format, export.state,
            export.object_key, export.content_sha256, export.job_id, export.artifact_id,
            export.failure_code, export.requested_at::text, export.completed_at::text,
            job.state::text AS worker_state, job.attempt, job.max_attempts,
            job.last_error_code, job.created_at::text AS worker_created_at
     FROM export_jobs export
     LEFT JOIN jobs job ON job.workspace_id = export.workspace_id AND job.id = export.job_id
     WHERE export.workspace_id = app_current_workspace_id()
     ORDER BY export.requested_at DESC LIMIT $1`,
    [Math.max(1, Math.min(250, Math.trunc(limit)))],
  )).rows);
}

export async function getExportJob(pool: pg.Pool, principal: Principal, exportJobId: string) {
  authorize(principal, 'export.create');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT export.id, export.export_type, export.requested_format, export.state,
            export.object_key, export.content_sha256, export.job_id, export.artifact_id,
            export.failure_code, export.requested_at::text, export.completed_at::text,
            artifact.byte_length, artifact.media_type, artifact.state::text AS artifact_state,
            artifact.available_at::text,
            job.state::text AS worker_state, job.attempt, job.max_attempts, job.last_error_code
     FROM export_jobs export
     LEFT JOIN immutable_artifacts artifact
       ON artifact.workspace_id = export.workspace_id AND artifact.id = export.artifact_id
     LEFT JOIN jobs job ON job.workspace_id = export.workspace_id AND job.id = export.job_id
     WHERE export.workspace_id = app_current_workspace_id() AND export.id = $1`,
    [exportJobId],
  )).rows[0] ?? null);
}
