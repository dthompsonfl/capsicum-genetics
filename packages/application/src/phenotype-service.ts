import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  phenotypeAnnotationCreateSchema,
  phenotypeCaptureCreateSchema,
  phenotypeMeasurementCorrectionSchema,
  type PhenotypeAnnotationCreateInput,
  type PhenotypeCaptureCreateInput,
  type PhenotypeMeasurementCorrectionInput,
  type Principal,
} from '@capsicum/contracts';
import { withSystemTransaction, withWorkspaceTransaction } from '@capsicum/database';
import { evaluateCaptureQuality, type CaptureProtocol } from '@capsicum/vision';
import { ApplicationError, audit, authorize, executeIdempotent } from './internal';

function readProtocol(value: unknown, protocolId: string, version: string): CaptureProtocol {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Capture protocol contract is malformed.');
  const contract = value as Record<string, unknown>;
  const requiredViews = contract.requiredViews;
  const protocol: CaptureProtocol = {
    protocolId,
    version,
    minimumWidthPx: Number(contract.minimumWidthPx),
    minimumHeightPx: Number(contract.minimumHeightPx),
    maximumBlurScore: Number(contract.maximumBlurScore),
    requiredViews: Array.isArray(requiredViews) ? requiredViews.filter((entry): entry is string => typeof entry === 'string') : [],
    requiresScaleReference: contract.requiresScaleReference === true,
    requiresColorReference: contract.requiresColorReference === true,
  };
  if (!Number.isSafeInteger(protocol.minimumWidthPx) || protocol.minimumWidthPx < 1
    || !Number.isSafeInteger(protocol.minimumHeightPx) || protocol.minimumHeightPx < 1
    || !Number.isFinite(protocol.maximumBlurScore) || protocol.maximumBlurScore < 0 || protocol.maximumBlurScore > 1
    || protocol.requiredViews.length === 0) {
    throw new TypeError('Capture protocol contract is incomplete or unsafe.');
  }
  return protocol;
}

export async function listApprovedCaptureProtocols(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'media.read');
  return withSystemTransaction(pool, async (client) => (await client.query(
    `SELECT id, protocol_key, version, contract, approved_at::text
     FROM capture_protocols WHERE review_state = 'approved'
     ORDER BY protocol_key, version`,
  )).rows);
}

export async function createPhenotypeCapture(
  pool: pg.Pool,
  principal: Principal,
  rawInput: PhenotypeCaptureCreateInput,
): Promise<{ captureId: string; qualityState: string; blockingReasons: readonly string[]; reviewReasons: readonly string[] }> {
  authorize(principal, 'media.write');
  const input = phenotypeCaptureCreateSchema.parse(rawInput) as PhenotypeCaptureCreateInput;
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const mediaResult = await client.query<{
      id: string; entity_id: string | null; upload_state: string; inspection_state: string;
      detected_mime_type: string | null; source_sha256: string; inspection_id: string | null;
      width_px: number | null; height_px: number | null; blur_score: string | null;
      exposure_score: string | null; orientation: number | null; malware_result: string | null;
      decoder_result: string | null; inspector_kind: string | null; inspector_version: string | null;
    }>(
      `SELECT media.id, media.entity_id, media.upload_state, media.inspection_state::text,
              media.detected_mime_type, media.source_sha256,
              inspection.id AS inspection_id, inspection.width_px, inspection.height_px,
              inspection.blur_score::text, inspection.exposure_score::text,
              inspection.orientation, inspection.malware_result, inspection.decoder_result,
              inspection.inspector_kind, inspection.inspector_version
       FROM media_objects media
       LEFT JOIN LATERAL (
         SELECT * FROM media_inspections candidate
         WHERE candidate.workspace_id = media.workspace_id AND candidate.media_object_id = media.id
         ORDER BY candidate.inspected_at DESC, candidate.id DESC LIMIT 1
       ) inspection ON true
       WHERE media.workspace_id = app_current_workspace_id() AND media.id = $1
       FOR SHARE OF media`,
      [input.mediaObjectId],
    );
    const media = mediaResult.rows[0];
    if (!media || media.upload_state !== 'complete' || media.inspection_state !== 'accepted') {
      throw new ApplicationError('scientific_authority_required', 'Only media accepted by the isolated inspection boundary can become a phenotype capture.');
    }
    if (!media.detected_mime_type?.startsWith('image/')) throw new ApplicationError('validation_failed', 'Phenotype captures require an inspected image.');
    if (media.entity_id !== input.materialId) throw new ApplicationError('validation_failed', 'The source image is attached to a different biological material.');
    if (!media.inspection_id || !media.width_px || !media.height_px || media.decoder_result !== 'accepted' || media.malware_result !== 'clean') {
      throw new ApplicationError('scientific_authority_required', 'The media inspection is incomplete or lacks a clean malware result.');
    }

    const protocolResult = await client.query<{ id: string; protocol_key: string; version: string; contract: unknown }>(
      `SELECT id, protocol_key, version, contract FROM capture_protocols
       WHERE id = $1 AND review_state = 'approved'`,
      [input.protocolId],
    );
    const protocolRow = protocolResult.rows[0];
    if (!protocolRow) throw new ApplicationError('scientific_authority_required', 'Capture protocol is not independently approved.');
    const protocol = readProtocol(protocolRow.contract, protocolRow.protocol_key, protocolRow.version);
    const quality = evaluateCaptureQuality(protocol, {
      imageId: input.mediaObjectId,
      widthPx: media.width_px,
      heightPx: media.height_px,
      blurScore: media.blur_score === null ? null : Number(media.blur_score),
      view: input.viewName,
      hasScaleReference: input.operatorScaleConfirmed,
      hasColorReference: input.operatorColorReferenceConfirmed,
      sourceSha256: media.source_sha256,
    });
    const captureId = randomUUID();
    const machineFacts = {
      inspectionId: media.inspection_id,
      inspectorKind: media.inspector_kind,
      inspectorVersion: media.inspector_version,
      sourceSha256: media.source_sha256,
      detectedMimeType: media.detected_mime_type,
      widthPx: media.width_px,
      heightPx: media.height_px,
      blurScore: media.blur_score === null ? null : Number(media.blur_score),
      exposureScore: media.exposure_score === null ? null : Number(media.exposure_score),
      orientation: media.orientation,
      malwareResult: media.malware_result,
      decoderResult: media.decoder_result,
    };
    await client.query(
      `INSERT INTO phenotype_captures(
         id, workspace_id, material_id, protocol_id, media_object_id, view_name,
         capture_metadata, quality_state, quality_detail, captured_at, captured_by
       ) VALUES ($1, app_current_workspace_id(), $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, app_current_actor_user_id())`,
      [
        captureId,
        input.materialId,
        input.protocolId,
        input.mediaObjectId,
        input.viewName,
        JSON.stringify({
          machineFacts,
          operatorConfirmations: {
            scaleReferenceVisible: input.operatorScaleConfirmed,
            colorReferenceVisible: input.operatorColorReferenceConfirmed,
          },
          protocol: { id: protocolRow.id, key: protocolRow.protocol_key, version: protocolRow.version },
        }),
        quality.state,
        JSON.stringify(quality),
        input.capturedAt,
      ],
    );
    await audit(client, principal, 'phenotype.capture.created', 'phenotype_capture', captureId, null, {
      materialId: input.materialId,
      mediaObjectId: input.mediaObjectId,
      protocolId: input.protocolId,
      inspectionId: media.inspection_id,
      quality,
    });
    return { captureId, qualityState: quality.state, blockingReasons: quality.blockingReasons, reviewReasons: quality.reviewReasons };
  }, 'phenotype.capture'));
}

export async function listPhenotypeCaptures(pool: pg.Pool, principal: Principal, limit = 100) {
  authorize(principal, 'media.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT capture.id, capture.material_id, material.material_code,
            capture.media_object_id, capture.view_name, capture.quality_state::text,
            capture.quality_detail, capture.capture_metadata, capture.captured_at::text,
            protocol.protocol_key, protocol.version AS protocol_version,
            count(annotation.id)::int AS annotation_count
     FROM phenotype_captures capture
     JOIN biological_materials material ON material.id = capture.material_id
     JOIN capture_protocols protocol ON protocol.id = capture.protocol_id
     LEFT JOIN phenotype_annotations annotation ON annotation.capture_id = capture.id
     WHERE capture.workspace_id = app_current_workspace_id()
     GROUP BY capture.id, material.material_code, protocol.protocol_key, protocol.version
     ORDER BY capture.captured_at DESC LIMIT $1`,
    [Math.max(1, Math.min(250, Math.trunc(limit)))],
  )).rows);
}

export async function getPhenotypeCapture(pool: pg.Pool, principal: Principal, captureId: string) {
  authorize(principal, 'media.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const capture = (await client.query(
      `SELECT capture.*, material.material_code, media.original_file_name, media.detected_mime_type AS mime_type,
              protocol.protocol_key, protocol.version AS protocol_version, protocol.contract
       FROM phenotype_captures capture
       JOIN biological_materials material ON material.id = capture.material_id
       JOIN media_objects media ON media.id = capture.media_object_id
       JOIN capture_protocols protocol ON protocol.id = capture.protocol_id
       WHERE capture.workspace_id = app_current_workspace_id() AND capture.id = $1`,
      [captureId],
    )).rows[0] ?? null;
    if (!capture) return null;
    const measurements = (await client.query(
      `SELECT measurement.id, measurement.measurement_key, measurement.algorithm_name,
              measurement.algorithm_version, measurement.source_media_sha256,
              revision.value_payload, measurement.current_revision_id,
              revision.revision, revision.reason, revision.corrected_at::text,
              run.state::text AS processing_state, run.failure_code, run.job_id
       FROM phenotype_measurements measurement
       LEFT JOIN phenotype_measurement_revisions revision
         ON revision.workspace_id = measurement.workspace_id
        AND revision.id = measurement.current_revision_id
       LEFT JOIN phenotype_measurement_runs run
         ON run.workspace_id = measurement.workspace_id
        AND run.capture_id = measurement.capture_id
        AND run.source_sha256 = measurement.source_media_sha256
       WHERE measurement.workspace_id = app_current_workspace_id()
         AND measurement.capture_id = $1
       ORDER BY measurement.measurement_key, measurement.created_at, measurement.id`,
      [captureId],
    )).rows;
    const measurementRevisions = (await client.query(
      `SELECT revision.id, revision.measurement_id, revision.revision, revision.value_payload,
              revision.reason, revision.supersedes_revision_id, revision.corrected_at::text,
              corrector.display_name AS corrected_by_name
       FROM phenotype_measurement_revisions revision
       JOIN phenotype_measurements measurement
         ON measurement.workspace_id = revision.workspace_id AND measurement.id = revision.measurement_id
       JOIN users corrector ON corrector.id = revision.corrected_by
       WHERE revision.workspace_id = app_current_workspace_id()
         AND measurement.capture_id = $1
       ORDER BY measurement.measurement_key, revision.revision, revision.id`,
      [captureId],
    )).rows;
    const annotations = (await client.query(
      `SELECT annotation.id, annotation.annotation_type, annotation.geometry, annotation.label,
              annotation.revision, annotation.supersedes_annotation_id, annotation.correction_reason,
              annotation.created_at::text, creator.display_name AS created_by_name,
              NOT EXISTS (
                SELECT 1 FROM phenotype_annotations successor
                WHERE successor.workspace_id = annotation.workspace_id
                  AND successor.supersedes_annotation_id = annotation.id
              ) AS is_current
       FROM phenotype_annotations annotation
       JOIN users creator ON creator.id = annotation.created_by
       WHERE annotation.workspace_id = app_current_workspace_id() AND annotation.capture_id = $1
       ORDER BY annotation.created_at, annotation.id`,
      [captureId],
    )).rows;
    return { capture, annotations, measurements, measurementRevisions };
  });
}

export async function createPhenotypeAnnotation(
  pool: pg.Pool,
  principal: Principal,
  rawInput: PhenotypeAnnotationCreateInput,
): Promise<{ annotationId: string; revision: number }> {
  authorize(principal, 'observation.write');
  const input = phenotypeAnnotationCreateSchema.parse(rawInput) as PhenotypeAnnotationCreateInput;
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const capture = await client.query<{ id: string }>(
      `SELECT id FROM phenotype_captures
       WHERE workspace_id = app_current_workspace_id() AND id = $1 FOR SHARE`,
      [input.captureId],
    );
    if (!capture.rows[0]) throw new ApplicationError('not_found', 'Phenotype capture was not found.');
    let revision = 1;
    if (input.supersedesAnnotationId) {
      const previous = await client.query<{ capture_id: string; revision: number }>(
        `SELECT capture_id, revision FROM phenotype_annotations
         WHERE workspace_id = app_current_workspace_id() AND id = $1 FOR UPDATE`,
        [input.supersedesAnnotationId],
      );
      const row = previous.rows[0];
      if (!row || row.capture_id !== input.captureId) throw new ApplicationError('validation_failed', 'The predecessor must belong to the same capture.');
      if (input.expectedCurrentAnnotationId !== input.supersedesAnnotationId) {
        throw new ApplicationError('stale_version', 'The annotation changed before this correction was submitted. Reload and retry.');
      }
      const successor = await client.query(
        `SELECT id FROM phenotype_annotations
         WHERE workspace_id = app_current_workspace_id() AND supersedes_annotation_id = $1
         FOR SHARE`,
        [input.supersedesAnnotationId],
      );
      if (successor.rows[0]) throw new ApplicationError('stale_version', 'This annotation revision has already been superseded. Reload the current history.');
      revision = row.revision + 1;
    } else if (input.expectedCurrentAnnotationId) {
      throw new ApplicationError('validation_failed', 'A current annotation identifier is only valid for a correction.');
    }
    const annotationId = randomUUID();
    await client.query(
      `INSERT INTO phenotype_annotations(
         id, workspace_id, capture_id, annotation_type, geometry, label,
         revision, supersedes_annotation_id, correction_reason, created_by
       ) VALUES ($1, app_current_workspace_id(), $2, $3, $4::jsonb, $5, $6, $7, $8, app_current_actor_user_id())`,
      [
        annotationId,
        input.captureId,
        input.annotationType,
        JSON.stringify(input.geometry),
        input.label,
        revision,
        input.supersedesAnnotationId ?? null,
        input.correctionReason ?? null,
      ],
    );
    await audit(client, principal, 'phenotype.annotation.created', 'phenotype_annotation', annotationId, null, {
      captureId: input.captureId,
      annotationType: input.annotationType,
      label: input.label,
      revision,
      supersedesAnnotationId: input.supersedesAnnotationId ?? null,
      correctionReason: input.correctionReason ?? null,
    });
    return { annotationId, revision };
  }, 'phenotype.annotation'));
}

export async function listModelVersions(pool: pg.Pool, principal: Principal, limit = 100) {
  authorize(principal, 'audit.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT id, model_key, version, model_kind, state::text, artifact_object_key,
            training_dataset_hash, model_card, evaluation_report,
            promoted_by, promoted_at::text, created_at::text
     FROM model_versions
     WHERE workspace_id = app_current_workspace_id()
     ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(250, Math.trunc(limit)))],
  )).rows);
}


export async function correctPhenotypeMeasurement(
  pool: pg.Pool,
  principal: Principal,
  rawInput: PhenotypeMeasurementCorrectionInput,
): Promise<{ measurementId: string; captureId: string; revisionId: string; revision: number }> {
  authorize(principal, 'observation.write');
  const input = phenotypeMeasurementCorrectionSchema.parse(rawInput) as PhenotypeMeasurementCorrectionInput;
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    try {
      const result = await client.query<{ result: {
        measurementId: string; captureId: string; revisionId: string; revision: number;
      } }>(
        `SELECT app_correct_phenotype_measurement($1,$2,$3::jsonb,$4) AS result`,
        [input.measurementId, input.expectedCurrentRevisionId, JSON.stringify(input.valuePayload), input.reason],
      );
      const corrected = result.rows[0]?.result;
      if (!corrected) throw new ApplicationError('internal_error', 'The corrected measurement revision was not returned.', { retryable: true });
      return corrected;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('revision is stale') || message.includes('predecessor is stale')) {
        throw new ApplicationError('stale_version', 'The measurement changed before this correction was saved. Reload and try again.', { cause: error });
      }
      if (message.includes('was not found')) {
        throw new ApplicationError('not_found', 'The phenotype measurement was not found.', { cause: error });
      }
      if (error instanceof ApplicationError) throw error;
      throw error;
    }
  }, 'phenotype.measurement.correct'));
}
