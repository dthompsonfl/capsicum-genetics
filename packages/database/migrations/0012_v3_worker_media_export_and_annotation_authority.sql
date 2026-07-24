BEGIN;

-- V3 durable-runtime authority. This migration intentionally extends, rather than
-- rewrites, the six supplied V2 migrations and V3 migrations 0007-0011.

ALTER TABLE phenotype_annotations
  ADD COLUMN correction_reason text,
  ADD CONSTRAINT phenotype_annotations_correction_reason_check CHECK (
    (supersedes_annotation_id IS NULL AND correction_reason IS NULL)
    OR (supersedes_annotation_id IS NOT NULL AND length(trim(correction_reason)) >= 2)
  );

ALTER TABLE media_objects
  ADD COLUMN inspection_requested_at timestamptz,
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN rejection_code text;

ALTER TABLE export_jobs
  ADD COLUMN requested_format text,
  ADD COLUMN failure_code text,
  ADD CONSTRAINT export_jobs_requested_format_check
    CHECK (requested_format IS NULL OR requested_format IN ('json','csv'));
UPDATE export_jobs
SET requested_format = CASE
  WHEN export_type LIKE '%_csv' THEN 'csv'
  ELSE 'json'
END
WHERE requested_format IS NULL;
ALTER TABLE export_jobs ALTER COLUMN requested_format SET NOT NULL;

INSERT INTO job_contracts(job_type, contract_version, worker_capability, payload_schema, result_schema, active)
VALUES
  ('genetics.direct-inheritance-monte-carlo.v1','1.0.0','genetics.monte_carlo',
   '{"type":"object","required":["maternalHypotheses","paternalHypotheses","seed","sampleCount"]}'::jsonb,
   '{"type":"object","required":["sampleCount","seed"]}'::jsonb, true),
  ('media.inspect.v1','1.0.0','media.inspect',
   '{"type":"object","required":["mediaObjectId","objectKey","sourceSha256","declaredMimeType"]}'::jsonb,
   '{"type":"object","required":["inspectionState","sourceSha256","decoderResult","malwareResult"]}'::jsonb, true),
  ('media.derivatives.v1','1.0.0','media.derivatives',
   '{"type":"object","required":["mediaObjectId","objectKey","sourceSha256"]}'::jsonb,
   '{"type":"object"}'::jsonb, false),
  ('research.ingest.v1','1.0.0','research.ingest',
   '{"type":"object","required":["documentId","objectKey","sourceSha256"]}'::jsonb,
   '{"type":"object"}'::jsonb, false),
  ('research.extract-passages.v1','1.0.0','research.extract_passages',
   '{"type":"object","required":["documentId","objectKey","sourceSha256"]}'::jsonb,
   '{"type":"object"}'::jsonb, false),
  ('export.breeding-ledger.v1','1.0.0','export.breeding_ledger',
   '{"type":"object","required":["exportJobId","format"]}'::jsonb,
   '{"type":"object","required":["artifactId","contentSha256","byteLength"]}'::jsonb, true),
  ('storage.cleanup.v1','1.0.0','storage.cleanup',
   '{"type":"object"}'::jsonb,
   '{"type":"object"}'::jsonb, false),
  ('worker.health.v1','1.0.0','worker.health',
   '{"type":"object"}'::jsonb,
   '{"type":"object","required":["status","workerVersion"]}'::jsonb, true)
ON CONFLICT (job_type, contract_version) DO UPDATE
SET worker_capability = EXCLUDED.worker_capability,
    payload_schema = EXCLUDED.payload_schema,
    result_schema = EXCLUDED.result_schema,
    active = EXCLUDED.active;


CREATE OR REPLACE FUNCTION validate_active_job_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM job_contracts contract
    WHERE contract.job_type = NEW.job_type
      AND contract.contract_version = NEW.contract_version
      AND contract.active
  ) THEN
    RAISE EXCEPTION 'job contract % version % is not active', NEW.job_type, NEW.contract_version;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jobs_require_active_contract
BEFORE INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION validate_active_job_contract();

CREATE OR REPLACE FUNCTION app_heartbeat_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE renewed_at timestamptz;
BEGIN
  IF p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'lease duration must be between 5 and 3600 seconds';
  END IF;
  UPDATE jobs
  SET lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now()
  WHERE id = p_job_id
    AND lease_owner = p_worker_id
    AND state IN ('running', 'cancel_requested')
    AND lease_expires_at > now()
  RETURNING lease_expires_at INTO renewed_at;
  IF renewed_at IS NULL THEN
    RAISE EXCEPTION 'worker does not own an active lease for job %', p_job_id;
  END IF;
  RETURN renewed_at;
END
$$;

CREATE OR REPLACE FUNCTION guard_runtime_media_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_has_role(current_user, 'capsicum_runtime', 'member')
     AND COALESCE(current_setting('app.authority_function', true), '') NOT IN ('worker_media_inspection','media_upload_rejection')
     AND (
       NEW.upload_state IS DISTINCT FROM OLD.upload_state
       OR NEW.inspection_state IS DISTINCT FROM OLD.inspection_state
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.rejection_code IS DISTINCT FROM OLD.rejection_code
       OR NEW.quarantine_reason IS DISTINCT FROM OLD.quarantine_reason
     ) THEN
    RAISE EXCEPTION 'media authority state may only change through a canonical authority function';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER media_objects_authority_guard
BEFORE UPDATE ON media_objects FOR EACH ROW EXECUTE FUNCTION guard_runtime_media_authority_mutation();

CREATE OR REPLACE FUNCTION guard_runtime_export_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_has_role(current_user, 'capsicum_runtime', 'member')
     AND COALESCE(current_setting('app.authority_function', true), '') <> 'worker_export_completion'
     AND (
       NEW.state IS DISTINCT FROM OLD.state
       OR NEW.object_key IS DISTINCT FROM OLD.object_key
       OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
       OR NEW.artifact_id IS DISTINCT FROM OLD.artifact_id
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     ) THEN
    RAISE EXCEPTION 'export authority state may only change through the durable worker boundary';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER export_jobs_authority_guard
BEFORE UPDATE ON export_jobs FOR EACH ROW EXECUTE FUNCTION guard_runtime_export_authority_mutation();

CREATE OR REPLACE FUNCTION app_reject_media_upload(p_media_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace_id_value uuid := app_current_workspace_id();
  actor_id_value uuid := app_current_actor_user_id();
BEGIN
  IF workspace_id_value IS NULL OR actor_id_value IS NULL OR NOT EXISTS (
    SELECT 1 FROM workspace_memberships membership
    WHERE membership.workspace_id = workspace_id_value
      AND membership.user_id = actor_id_value
      AND membership.state = 'active'
      AND membership.role IN ('owner','administrator','breeder','technician')
  ) THEN
    RAISE EXCEPTION 'active media-write membership is required';
  END IF;
  PERFORM set_config('app.authority_function', 'media_upload_rejection', true);
  UPDATE media_objects
  SET upload_state = 'rejected', inspection_state = 'rejected', completed_at = NULL,
      accepted_at = NULL, rejected_at = now(), rejection_code = 'upload_failed',
      quarantine_reason = left(COALESCE(NULLIF(trim(p_reason),''),'upload failed'),1000)
  WHERE workspace_id = workspace_id_value AND id = p_media_id
    AND upload_state IN ('pending','quarantined');
END
$$;

CREATE OR REPLACE FUNCTION app_request_job_cancellation(p_job_id uuid)
RETURNS job_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace_id_value uuid := app_current_workspace_id();
  actor_id_value uuid := app_current_actor_user_id();
  new_state job_state;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workspace_memberships membership
    WHERE membership.workspace_id = workspace_id_value
      AND membership.user_id = actor_id_value
      AND membership.state = 'active'
      AND membership.role IN ('owner','administrator')
  ) THEN RAISE EXCEPTION 'job cancellation authority is required'; END IF;
  UPDATE jobs
  SET state = CASE WHEN state IN ('queued','failed') THEN 'cancelled'::job_state ELSE 'cancel_requested'::job_state END,
      cancellation_requested_at = now(),
      completed_at = CASE WHEN state IN ('queued','failed') THEN now() ELSE completed_at END
  WHERE workspace_id = workspace_id_value AND id = p_job_id
    AND state IN ('queued','failed','running')
  RETURNING state INTO new_state;
  IF new_state IS NULL THEN RAISE EXCEPTION 'job cannot be cancelled in its current state'; END IF;
  RETURN new_state;
END
$$;

CREATE OR REPLACE FUNCTION app_retry_job(p_job_id uuid)
RETURNS job_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace_id_value uuid := app_current_workspace_id();
  actor_id_value uuid := app_current_actor_user_id();
  new_state job_state;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workspace_memberships membership
    WHERE membership.workspace_id = workspace_id_value
      AND membership.user_id = actor_id_value
      AND membership.state = 'active'
      AND membership.role IN ('owner','administrator')
  ) THEN RAISE EXCEPTION 'job retry authority is required'; END IF;
  UPDATE jobs
  SET state = 'queued', available_at = now(), completed_at = NULL,
      lease_owner = NULL, lease_expires_at = NULL,
      cancellation_requested_at = NULL, last_error_code = NULL, last_error_detail = NULL
  WHERE workspace_id = workspace_id_value AND id = p_job_id
    AND state IN ('failed','dead_letter','cancelled') AND attempt < max_attempts
  RETURNING state INTO new_state;
  IF new_state IS NULL THEN RAISE EXCEPTION 'job is not eligible for retry'; END IF;
  RETURN new_state;
END
$$;

CREATE OR REPLACE FUNCTION synchronize_job_aggregate_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.job_type = 'export.breeding-ledger.v1' THEN
    IF NEW.state = 'running' THEN
      UPDATE export_jobs SET state = 'running'
      WHERE workspace_id = NEW.workspace_id AND job_id = NEW.id AND state = 'queued';
    ELSIF NEW.state = 'dead_letter' THEN
      UPDATE export_jobs SET state = 'failed', failure_code = COALESCE(NEW.last_error_code,'dead_letter'), completed_at = now()
      WHERE workspace_id = NEW.workspace_id AND job_id = NEW.id AND state IN ('queued','running');
    ELSIF NEW.state = 'cancelled' THEN
      UPDATE export_jobs SET state = 'cancelled', completed_at = now()
      WHERE workspace_id = NEW.workspace_id AND job_id = NEW.id AND state IN ('queued','running');
    END IF;
  ELSIF NEW.job_type = 'media.inspect.v1' AND NEW.state = 'dead_letter' THEN
    UPDATE media_objects
    SET inspection_state = 'failed', upload_state = 'quarantined',
        quarantine_reason = 'Inspection exhausted all retries; administrator review is required.'
    WHERE workspace_id = NEW.workspace_id AND inspection_job_id = NEW.id
      AND inspection_state IN ('queued','running','failed');
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jobs_sync_aggregate_state
AFTER UPDATE OF state ON jobs FOR EACH ROW
WHEN (OLD.state IS DISTINCT FROM NEW.state)
EXECUTE FUNCTION synchronize_job_aggregate_state();

CREATE OR REPLACE FUNCTION app_worker_record_heartbeat(
  p_worker_id text,
  p_worker_kind text,
  p_worker_version text,
  p_capabilities text[],
  p_started_at timestamptz,
  p_current_job_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF length(trim(COALESCE(p_worker_id, ''))) = 0
     OR length(trim(COALESCE(p_worker_kind, ''))) = 0
     OR length(trim(COALESCE(p_worker_version, ''))) = 0
     OR p_capabilities IS NULL OR cardinality(p_capabilities) = 0 THEN
    RAISE EXCEPTION 'valid worker identity and capabilities are required';
  END IF;
  INSERT INTO worker_heartbeats(
    worker_id, worker_kind, worker_version, capabilities,
    started_at, heartbeat_at, current_job_id, metadata
  ) VALUES (
    p_worker_id, p_worker_kind, p_worker_version, p_capabilities,
    p_started_at, now(), p_current_job_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (worker_id) DO UPDATE SET
    worker_kind = EXCLUDED.worker_kind,
    worker_version = EXCLUDED.worker_version,
    capabilities = EXCLUDED.capabilities,
    heartbeat_at = now(),
    current_job_id = EXCLUDED.current_job_id,
    metadata = EXCLUDED.metadata;
END
$$;

CREATE OR REPLACE FUNCTION app_worker_complete_media_inspection(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  media media_objects%ROWTYPE;
  inspection_id uuid := uuidv7();
  requested_media_id uuid;
  requested_sha text;
  final_state media_inspection_state;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.job_type <> 'media.inspect.v1'
     OR current_job.contract_version <> '1.0.0'
     OR current_job.state <> 'running'
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id
     OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active media-inspection lease';
  END IF;
  requested_media_id := (current_job.payload->>'mediaObjectId')::uuid;
  requested_sha := current_job.payload->>'sourceSha256';
  SELECT * INTO media FROM media_objects
  WHERE workspace_id = current_job.workspace_id AND id = requested_media_id
  FOR UPDATE;
  IF media.id IS NULL OR media.inspection_job_id IS DISTINCT FROM current_job.id THEN
    RAISE EXCEPTION 'media object is not bound to this inspection job';
  END IF;
  IF media.source_sha256 IS DISTINCT FROM requested_sha
     OR p_result->>'sourceSha256' IS DISTINCT FROM requested_sha THEN
    RAISE EXCEPTION 'media inspection source hash mismatch';
  END IF;
  final_state := (p_result->>'inspectionState')::media_inspection_state;
  IF final_state NOT IN ('accepted','rejected','needs_review','failed') THEN
    RAISE EXCEPTION 'media inspection produced an invalid terminal state';
  END IF;

  INSERT INTO media_inspections(
    id, workspace_id, media_object_id, inspection_state,
    inspector_kind, inspector_version, source_sha256,
    declared_mime_type, detected_mime_type, width_px, height_px,
    pixel_count, frame_count, blur_score, exposure_score, orientation,
    metadata_detected, malware_result, decoder_result, findings
  ) VALUES (
    inspection_id, current_job.workspace_id, media.id, final_state,
    COALESCE(NULLIF(p_result->>'inspectorKind',''),'isolated_node_worker'),
    COALESCE(NULLIF(p_result->>'inspectorVersion',''),'unknown'),
    requested_sha,
    media.declared_mime_type,
    NULLIF(p_result->>'detectedMimeType',''),
    NULLIF(p_result->>'widthPx','')::integer,
    NULLIF(p_result->>'heightPx','')::integer,
    NULLIF(p_result->>'pixelCount','')::bigint,
    NULLIF(p_result->>'frameCount','')::integer,
    NULLIF(p_result->>'blurScore','')::numeric,
    NULLIF(p_result->>'exposureScore','')::numeric,
    NULLIF(p_result->>'orientation','')::smallint,
    COALESCE(p_result->'metadataDetected','{}'::jsonb),
    COALESCE(NULLIF(p_result->>'malwareResult',''),'unavailable'),
    COALESCE(NULLIF(p_result->>'decoderResult',''),'failed'),
    COALESCE(p_result->'findings','[]'::jsonb)
  );

  PERFORM set_config('app.authority_function', 'worker_media_inspection', true);
  UPDATE media_objects
  SET detected_mime_type = NULLIF(p_result->>'detectedMimeType',''),
      pixel_width = NULLIF(p_result->>'widthPx','')::integer,
      pixel_height = NULLIF(p_result->>'heightPx','')::integer,
      frame_count = NULLIF(p_result->>'frameCount','')::integer,
      metadata_payload = COALESCE(p_result->'metadataDetected','{}'::jsonb),
      metadata_stripped = COALESCE((p_result->>'metadataStripped')::boolean, false),
      inspection_state = final_state,
      upload_state = CASE
        WHEN final_state = 'accepted' THEN 'complete'
        WHEN final_state = 'rejected' THEN 'rejected'
        ELSE 'quarantined'
      END,
      completed_at = CASE WHEN final_state = 'accepted' THEN now() ELSE NULL END,
      accepted_at = CASE WHEN final_state = 'accepted' THEN now() ELSE NULL END,
      rejected_at = CASE WHEN final_state = 'rejected' THEN now() ELSE NULL END,
      rejection_code = CASE WHEN final_state = 'rejected' THEN COALESCE(NULLIF(p_result->>'rejectionCode',''),'inspection_rejected') ELSE NULL END,
      quarantine_reason = CASE WHEN final_state IN ('needs_review','failed') THEN COALESCE(NULLIF(p_result->>'reviewReason',''),'inspection requires review') ELSE NULL END
  WHERE workspace_id = current_job.workspace_id AND id = media.id;

  PERFORM app_complete_job(p_job_id, p_worker_id, p_result || jsonb_build_object('inspectionId', inspection_id));
  RETURN inspection_id;
END
$$;

CREATE OR REPLACE FUNCTION app_worker_breeding_ledger_snapshot(
  p_job_id uuid,
  p_worker_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  snapshot jsonb;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id;
  IF current_job.id IS NULL OR current_job.job_type <> 'export.breeding-ledger.v1'
     OR current_job.contract_version <> '1.0.0'
     OR current_job.state <> 'running'
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id
     OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active breeding-ledger export lease';
  END IF;
  SELECT jsonb_build_object(
    'schemaVersion','2.0',
    'exportType','capsicum_breeding_ledger',
    'workspaceId',current_job.workspace_id,
    'generatedAt',now(),
    'materials', COALESCE((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at, row_data.id)
      FROM (SELECT id, material_code, kind::text AS material_kind, status::text AS status,
                   created_at
            FROM biological_materials WHERE workspace_id = current_job.workspace_id LIMIT 100000) row_data), '[]'::jsonb),
    'inventoryEvents', COALESCE((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.occurred_at, row_data.id)
      FROM (SELECT id, seed_lot_material_id, event_type, quantity_delta, quantity_after,
                   occurred_at, source_reference
            FROM seed_inventory_events WHERE workspace_id = current_job.workspace_id LIMIT 100000) row_data), '[]'::jsonb),
    'crosses', COALESCE((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at, row_data.id)
      FROM (SELECT id, cross_code, maternal_plant_id, paternal_plant_id, pollination_method::text AS pollination_method,
                   operational_state::text AS operational_state, verification_state::text AS verification_state, created_at
            FROM crosses WHERE workspace_id = current_job.workspace_id LIMIT 100000) row_data), '[]'::jsonb),
    'families', COALESCE((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at, row_data.material_id)
      FROM (SELECT material_id, cross_id, source_seed_harvest_material_id, generation_label, created_at
            FROM progeny_families WHERE workspace_id = current_job.workspace_id LIMIT 100000) row_data), '[]'::jsonb),
    'genotypeCalls', COALESCE((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.recorded_at, row_data.id)
      FROM (SELECT id, material_id, locus_catalog_id, allele_one_id, allele_two_id, evidence_state::text AS evidence_state,
                   call_basis::text AS call_basis, assay_id, marker_id, call_version, recorded_at, supersedes_call_id, is_current
            FROM genotype_calls WHERE workspace_id = current_job.workspace_id LIMIT 100000) row_data), '[]'::jsonb),
    'observations', COALESCE((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at, row_data.id)
      FROM (SELECT id, material_id, definition_id, definition_trait_version, authority::text AS authority,
                   session_id, current_revision_id, created_at
            FROM observations WHERE workspace_id = current_job.workspace_id LIMIT 100000) row_data), '[]'::jsonb),
    'simulationRuns', COALESCE((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.completed_at, row_data.id)
      FROM (SELECT id, model_type, model_version, engine_version, catalog_release_id,
                   calculation_authority::text AS calculation_authority,
                   premise_authority::text AS premise_authority,
                   interpretation_authority::text AS interpretation_authority,
                   input_hash, content_hash, completed_at
            FROM simulation_runs WHERE workspace_id = current_job.workspace_id LIMIT 100000) row_data), '[]'::jsonb)
  ) INTO snapshot;
  RETURN snapshot;
END
$$;

CREATE OR REPLACE FUNCTION app_worker_complete_export(
  p_job_id uuid,
  p_worker_id text,
  p_object_key text,
  p_content_sha256 text,
  p_byte_length bigint,
  p_media_type text,
  p_result jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  export_record export_jobs%ROWTYPE;
  v_artifact_id uuid := uuidv7();
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.job_type <> 'export.breeding-ledger.v1'
     OR current_job.state <> 'running'
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id
     OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active export lease';
  END IF;
  SELECT * INTO export_record FROM export_jobs
  WHERE workspace_id = current_job.workspace_id AND job_id = current_job.id FOR UPDATE;
  IF export_record.id IS NULL OR export_record.state NOT IN ('queued','running') THEN
    RAISE EXCEPTION 'export record is not completable';
  END IF;
  IF p_content_sha256 !~ '^[a-f0-9]{64}$' OR p_byte_length < 0 OR length(trim(p_object_key)) = 0 THEN
    RAISE EXCEPTION 'invalid immutable export artifact metadata';
  END IF;
  INSERT INTO immutable_artifacts(
    id, workspace_id, artifact_type, object_key, content_sha256, byte_length,
    media_type, state, source_job_id, metadata, created_by, available_at
  ) VALUES (
    v_artifact_id, current_job.workspace_id, 'breeding_ledger_export', p_object_key,
    p_content_sha256, p_byte_length, p_media_type, 'available', current_job.id,
    jsonb_build_object('exportJobId', export_record.id, 'format', export_record.requested_format),
    export_record.requested_by, now()
  );
  PERFORM set_config('app.authority_function', 'worker_export_completion', true);
  UPDATE export_jobs
  SET state = 'succeeded', artifact_id = v_artifact_id, object_key = p_object_key,
      content_sha256 = p_content_sha256, completed_at = now(), failure_code = NULL
  WHERE workspace_id = current_job.workspace_id AND id = export_record.id;
  UPDATE jobs SET result_artifact_id = v_artifact_id WHERE id = current_job.id;
  PERFORM app_complete_job(p_job_id, p_worker_id,
    p_result || jsonb_build_object('artifactId', v_artifact_id, 'contentSha256', p_content_sha256, 'byteLength', p_byte_length));
  RETURN v_artifact_id;
END
$$;

REVOKE ALL ON FUNCTION app_reject_media_upload(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_request_job_cancellation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_retry_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reject_media_upload(uuid,text) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_request_job_cancellation(uuid) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_retry_job(uuid) TO capsicum_runtime;

REVOKE ALL ON FUNCTION app_worker_record_heartbeat(text,text,text,text[],timestamptz,uuid,jsonb) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_complete_media_inspection(uuid,text,jsonb) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_breeding_ledger_snapshot(uuid,text) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_complete_export(uuid,text,text,text,bigint,text,jsonb) FROM PUBLIC, capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_worker_record_heartbeat(text,text,text,text[],timestamptz,uuid,jsonb) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_complete_media_inspection(uuid,text,jsonb) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_breeding_ledger_snapshot(uuid,text) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_complete_export(uuid,text,text,text,bigint,text,jsonb) TO capsicum_worker;

COMMIT;
