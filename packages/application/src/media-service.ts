import type pg from 'pg';
import {
  mediaUploadMetadataSchema,
  type MediaUploadMetadata,
  type Principal,
} from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import type { DetectedUpload } from '@capsicum/storage';
import { ApplicationError, audit, authorize, executeIdempotent } from './internal';
import { enqueueJobInTransaction } from './operations-service';

export type MediaEntityType = 'plant' | 'fruit' | 'seed_lot' | 'progeny_family' | 'research_document';

async function assertMediaEntity(client: pg.PoolClient, entityType: MediaEntityType, entityId: string): Promise<void> {
  if (entityType === 'research_document') {
    const result = await client.query(
      `SELECT 1 FROM research_documents WHERE workspace_id = app_current_workspace_id() AND id = $1`,
      [entityId],
    );
    if (!result.rows[0]) throw new ApplicationError('not_found', 'Research document not found.');
    return;
  }
  const expectedKind = entityType === 'fruit' ? 'fruit' : entityType;
  const result = await client.query<{ kind: string }>(
    `SELECT kind::text AS kind FROM biological_materials
     WHERE workspace_id = app_current_workspace_id() AND id = $1`,
    [entityId],
  );
  if (result.rows[0]?.kind !== expectedKind) throw new ApplicationError('not_found', `A ${entityType} record was not found.`);
}

export async function createQuarantinedMediaObject(
  pool: pg.Pool,
  principal: Principal,
  rawInput: MediaUploadMetadata & { objectKey: string; upload: DetectedUpload; traceId: string; pendingUploadId: string },
): Promise<{ mediaId: string; inspectionJobId: string; state: 'quarantined' }> {
  authorize(principal, 'media.write');
  const metadata = mediaUploadMetadataSchema.parse(rawInput) as MediaUploadMetadata;
  if (metadata.sourceSha256 && metadata.sourceSha256 !== rawInput.upload.sourceSha256) {
    throw new ApplicationError('validation_failed', 'The supplied upload hash does not match the inspected bytes.');
  }
  if (metadata.byteLength !== rawInput.upload.byteLength) {
    throw new ApplicationError('validation_failed', 'The supplied upload length does not match the inspected bytes.');
  }
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: rawInput.traceId,
  }, (client) => executeIdempotent(client, principal, metadata.clientRequestId, {
    ...metadata,
    objectKey: rawInput.objectKey,
    detectedMimeType: rawInput.upload.mimeType,
    sourceSha256: rawInput.upload.sourceSha256,
  }, async () => {
    await assertMediaEntity(client, metadata.entityType, metadata.entityId);
    type MediaBindingRow = {
      id: string;
      source_sha256: string;
      entity_type: string | null;
      entity_id: string | null;
      inspection_job_id: string | null;
    };
    const inserted = await client.query<MediaBindingRow>(
      `INSERT INTO media_objects(
         workspace_id, object_key, source_sha256, mime_type, declared_mime_type,
         detected_mime_type, byte_length, upload_state, inspection_state,
         uploaded_by, original_file_name, entity_type, entity_id,
         pixel_width, pixel_height, frame_count, inspection_requested_at
       ) VALUES (
         app_current_workspace_id(), $1, $2, $3, $4, $3, $5,
         'quarantined', 'queued', app_current_actor_user_id(), $6, $7, $8, $9, $10, $11, now()
       )
       ON CONFLICT (workspace_id, object_key) DO NOTHING
       RETURNING id, source_sha256, entity_type, entity_id, inspection_job_id`,
      [
        rawInput.objectKey,
        rawInput.upload.sourceSha256,
        rawInput.upload.mimeType,
        metadata.declaredMimeType,
        rawInput.upload.byteLength,
        metadata.fileName,
        metadata.entityType,
        metadata.entityId,
        rawInput.upload.width ?? null,
        rawInput.upload.height ?? null,
        rawInput.upload.mimeType.startsWith('image/') ? 1 : null,
      ],
    );
    const media = inserted.rows[0] ?? (await client.query<MediaBindingRow>(
      `SELECT id, source_sha256, entity_type, entity_id, inspection_job_id
       FROM media_objects
       WHERE workspace_id = app_current_workspace_id() AND object_key = $1
       FOR UPDATE`,
      [rawInput.objectKey],
    )).rows[0];
    if (!media || (
      media.source_sha256 !== rawInput.upload.sourceSha256
      || media.entity_type !== metadata.entityType
      || media.entity_id !== metadata.entityId
    )) {
      throw new ApplicationError('idempotency_conflict', 'The immutable object key is already bound to different media metadata.');
    }
    let inspectionJobId = media.inspection_job_id;
    if (!inspectionJobId) {
      const job = await enqueueJobInTransaction(client, principal, {
        jobType: 'media.inspect.v1',
        contractVersion: '1.0.0',
        clientRequestId: `${metadata.clientRequestId}:inspect`,
        traceId: rawInput.traceId,
        payload: {
          mediaObjectId: media.id,
          objectKey: rawInput.objectKey,
          sourceSha256: rawInput.upload.sourceSha256,
          declaredMimeType: metadata.declaredMimeType,
          detectedMimeType: rawInput.upload.mimeType,
          byteLength: rawInput.upload.byteLength,
        },
      });
      inspectionJobId = job.jobId;
      await client.query(
        `UPDATE media_objects SET inspection_job_id = $2
         WHERE workspace_id = app_current_workspace_id() AND id = $1 AND inspection_job_id IS NULL`,
        [media.id, inspectionJobId],
      );
    }
    await audit(client, principal, 'media.quarantined', 'media_object', media.id, null, {
      entityType: metadata.entityType,
      entityId: metadata.entityId,
      sourceSha256: rawInput.upload.sourceSha256,
      inspectionJobId,
    });
    await client.query('SELECT app_attach_pending_object_upload($1,$2,$3)', [rawInput.pendingUploadId, 'media_object', media.id]);
    return { mediaId: media.id, inspectionJobId, state: 'quarantined' as const };
  }, 'media.upload'));
}

export async function rejectQuarantinedMediaObject(
  pool: pg.Pool,
  principal: Principal,
  mediaId: string,
  reason: string,
): Promise<void> {
  authorize(principal, 'media.write');
  await withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    await client.query('SELECT app_reject_media_upload($1,$2)', [mediaId, reason.slice(0, 1_000)]);
    await audit(client, principal, 'media.rejected', 'media_object', mediaId, null, { reason: reason.slice(0, 500) });
  });
}

export async function listMediaObjects(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'media.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT media.id, media.entity_type, media.entity_id, media.original_file_name, media.object_key,
            media.source_sha256, media.declared_mime_type, media.detected_mime_type,
            media.mime_type, media.byte_length, media.pixel_width, media.pixel_height,
            media.frame_count, media.upload_state, media.inspection_state::text,
            media.inspection_job_id, media.quarantine_reason, media.rejection_code,
            media.created_at::text, media.completed_at::text, media.accepted_at::text,
            inspection.inspector_kind, inspection.inspector_version, inspection.decoder_result,
            inspection.malware_result, inspection.blur_score, inspection.exposure_score,
            inspection.findings
     FROM media_objects media
     LEFT JOIN LATERAL (
       SELECT * FROM media_inspections candidate
       WHERE candidate.workspace_id = media.workspace_id AND candidate.media_object_id = media.id
       ORDER BY candidate.inspected_at DESC, candidate.id DESC LIMIT 1
     ) inspection ON true
     WHERE media.workspace_id = app_current_workspace_id()
     ORDER BY media.created_at DESC LIMIT 200`,
  )).rows);
}

export async function getMediaObject(pool: pg.Pool, principal: Principal, mediaId: string) {
  authorize(principal, 'media.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT media.*, inspection.id AS inspection_id, inspection.inspection_state::text AS latest_inspection_state,
            inspection.inspector_kind, inspection.inspector_version, inspection.decoder_result,
            inspection.malware_result, inspection.blur_score, inspection.exposure_score,
            inspection.metadata_detected, inspection.findings, inspection.inspected_at::text
     FROM media_objects media
     LEFT JOIN LATERAL (
       SELECT * FROM media_inspections candidate
       WHERE candidate.workspace_id = media.workspace_id AND candidate.media_object_id = media.id
       ORDER BY candidate.inspected_at DESC, candidate.id DESC LIMIT 1
     ) inspection ON true
     WHERE media.workspace_id = app_current_workspace_id() AND media.id = $1`,
    [mediaId],
  )).rows[0] ?? null);
}


export async function listMediaDerivatives(
  pool: pg.Pool,
  principal: Principal,
  mediaId: string,
): Promise<readonly Record<string, unknown>[]> {
  authorize(principal, 'media.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT derivative.id, derivative.derivative_type, derivative.source_sha256,
            derivative.algorithm_name, derivative.algorithm_version, derivative.parameters,
            derivative.object_key, derivative.result_sha256, derivative.width_px,
            derivative.height_px, derivative.created_at::text,
            run.state::text AS processing_state, run.failure_code, run.job_id
     FROM media_derivatives derivative
     LEFT JOIN media_derivative_runs run
       ON run.workspace_id = derivative.workspace_id
      AND run.media_object_id = derivative.media_object_id
      AND run.source_sha256 = derivative.source_sha256
     WHERE derivative.workspace_id = app_current_workspace_id()
       AND derivative.media_object_id = $1
     ORDER BY derivative.derivative_type, derivative.created_at, derivative.id`,
    [mediaId],
  )).rows);
}

export async function getMediaDerivative(
  pool: pg.Pool,
  principal: Principal,
  mediaId: string,
  derivativeType: 'thumbnail' | 'analysis_ready',
) {
  authorize(principal, 'media.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT derivative.object_key, derivative.derivative_type, derivative.result_sha256,
            derivative.width_px, derivative.height_px,
            CASE derivative.derivative_type WHEN 'thumbnail' THEN 'image/jpeg' ELSE 'image/png' END AS media_type
     FROM media_derivatives derivative
     JOIN media_objects media
       ON media.workspace_id = derivative.workspace_id AND media.id = derivative.media_object_id
     WHERE derivative.workspace_id = app_current_workspace_id()
       AND derivative.media_object_id = $1 AND derivative.derivative_type = $2
       AND media.upload_state = 'complete' AND media.inspection_state = 'accepted'
     ORDER BY derivative.created_at DESC, derivative.id DESC LIMIT 1`,
    [mediaId, derivativeType],
  )).rows[0] ?? null);
}
