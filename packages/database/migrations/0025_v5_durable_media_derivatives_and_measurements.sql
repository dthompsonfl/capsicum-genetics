BEGIN;

CREATE TYPE media_processing_state AS ENUM ('queued','running','completed','failed','cancelled','dead_letter');

CREATE TABLE media_derivative_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  media_object_id uuid NOT NULL,
  source_sha256 text NOT NULL,
  job_id uuid NOT NULL,
  state media_processing_state NOT NULL DEFAULT 'queued',
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, media_object_id, source_sha256),
  UNIQUE (workspace_id, job_id),
  FOREIGN KEY (workspace_id, media_object_id) REFERENCES media_objects(workspace_id, id),
  FOREIGN KEY (workspace_id, job_id) REFERENCES jobs(workspace_id, id),
  CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK ((state = 'completed') = (completed_at IS NOT NULL))
);

CREATE TABLE phenotype_measurement_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  capture_id uuid NOT NULL,
  source_sha256 text NOT NULL,
  job_id uuid NOT NULL,
  state media_processing_state NOT NULL DEFAULT 'queued',
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, capture_id, source_sha256),
  UNIQUE (workspace_id, job_id),
  FOREIGN KEY (workspace_id, capture_id) REFERENCES phenotype_captures(workspace_id, id),
  FOREIGN KEY (workspace_id, job_id) REFERENCES jobs(workspace_id, id),
  CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK ((state = 'completed') = (completed_at IS NOT NULL))
);

ALTER TABLE media_derivative_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_derivative_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY media_derivative_runs_active_membership ON media_derivative_runs
  USING (app_workspace_access_allowed(workspace_id))
  WITH CHECK (app_workspace_access_allowed(workspace_id));

ALTER TABLE phenotype_measurement_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE phenotype_measurement_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY phenotype_measurement_runs_active_membership ON phenotype_measurement_runs
  USING (app_workspace_access_allowed(workspace_id))
  WITH CHECK (app_workspace_access_allowed(workspace_id));


CREATE OR REPLACE FUNCTION queue_media_derivative_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  media media_objects%ROWTYPE;
  job_id uuid := uuidv7();
  payload jsonb;
  payload_hash text;
BEGIN
  IF NEW.inspection_state <> 'accepted' OR NEW.malware_result <> 'clean' OR NEW.decoder_result <> 'accepted' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO media FROM media_objects
  WHERE workspace_id = NEW.workspace_id AND id = NEW.media_object_id;
  IF media.id IS NULL OR media.upload_state <> 'complete' OR media.source_sha256 IS DISTINCT FROM NEW.source_sha256 THEN
    RAISE EXCEPTION 'accepted inspection is not bound to complete immutable media';
  END IF;
  payload := jsonb_build_object(
    'mediaObjectId', media.id,
    'objectKey', media.object_key,
    'sourceSha256', media.source_sha256,
    'detectedMimeType', media.detected_mime_type,
    'byteLength', media.byte_length
  );
  payload_hash := encode(digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO jobs(
    id, workspace_id, job_type, contract_version, payload, payload_sha256,
    idempotency_key, trace_id, created_by
  ) VALUES (
    job_id, media.workspace_id, 'media.derivatives.v1', '1.0.0', payload, payload_hash,
    'media-derivatives:' || media.id::text || ':' || media.source_sha256,
    'media-derivatives:' || media.id::text, media.uploaded_by
  )
  ON CONFLICT (workspace_id, job_type, idempotency_key) DO NOTHING;
  SELECT id INTO job_id FROM jobs
  WHERE workspace_id = media.workspace_id AND job_type = 'media.derivatives.v1'
    AND idempotency_key = 'media-derivatives:' || media.id::text || ':' || media.source_sha256;
  INSERT INTO media_derivative_runs(workspace_id, media_object_id, source_sha256, job_id)
  VALUES (media.workspace_id, media.id, media.source_sha256, job_id)
  ON CONFLICT (workspace_id, media_object_id, source_sha256) DO NOTHING;
  RETURN NEW;
END
$$;
CREATE TRIGGER media_inspections_queue_derivatives
AFTER INSERT ON media_inspections
FOR EACH ROW EXECUTE FUNCTION queue_media_derivative_job();

CREATE OR REPLACE FUNCTION queue_capture_measurement_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  media media_objects%ROWTYPE;
  job_id uuid := uuidv7();
  payload jsonb;
  payload_hash text;
BEGIN
  SELECT * INTO media FROM media_objects
  WHERE workspace_id = NEW.workspace_id AND id = NEW.media_object_id;
  IF media.id IS NULL OR media.upload_state <> 'complete' OR media.inspection_state <> 'accepted' THEN
    RAISE EXCEPTION 'phenotype capture source is not accepted immutable media';
  END IF;
  payload := jsonb_build_object(
    'captureId', NEW.id,
    'mediaObjectId', media.id,
    'objectKey', media.object_key,
    'sourceSha256', media.source_sha256,
    'protocolId', NEW.protocol_id,
    'capturedBy', NEW.captured_by
  );
  payload_hash := encode(digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO jobs(
    id, workspace_id, job_type, contract_version, payload, payload_sha256,
    idempotency_key, trace_id, created_by
  ) VALUES (
    job_id, NEW.workspace_id, 'media.measurements.v1', '1.0.0', payload, payload_hash,
    'media-measurements:' || NEW.id::text || ':' || media.source_sha256,
    'media-measurements:' || NEW.id::text, NEW.captured_by
  )
  ON CONFLICT (workspace_id, job_type, idempotency_key) DO NOTHING;
  SELECT id INTO job_id FROM jobs
  WHERE workspace_id = NEW.workspace_id AND job_type = 'media.measurements.v1'
    AND idempotency_key = 'media-measurements:' || NEW.id::text || ':' || media.source_sha256;
  INSERT INTO phenotype_measurement_runs(workspace_id, capture_id, source_sha256, job_id)
  VALUES (NEW.workspace_id, NEW.id, media.source_sha256, job_id)
  ON CONFLICT (workspace_id, capture_id, source_sha256) DO NOTHING;
  RETURN NEW;
END
$$;
CREATE TRIGGER phenotype_captures_queue_measurements
AFTER INSERT ON phenotype_captures
FOR EACH ROW EXECUTE FUNCTION queue_capture_measurement_job();

CREATE OR REPLACE FUNCTION app_worker_complete_media_derivatives(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  run media_derivative_runs%ROWTYPE;
  media media_objects%ROWTYPE;
  item jsonb;
  derivative_id uuid;
  existing media_derivatives%ROWTYPE;
  persisted_count integer := 0;
  seen_types text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.job_type <> 'media.derivatives.v1'
     OR current_job.state NOT IN ('running','cancel_requested')
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active media-derivative lease';
  END IF;
  SELECT * INTO run FROM media_derivative_runs
  WHERE workspace_id = current_job.workspace_id AND job_id = current_job.id FOR UPDATE;
  SELECT * INTO media FROM media_objects
  WHERE workspace_id = current_job.workspace_id AND id = run.media_object_id FOR SHARE;
  IF run.id IS NULL OR media.id IS NULL OR media.source_sha256 IS DISTINCT FROM run.source_sha256
     OR p_result->>'sourceSha256' IS DISTINCT FROM run.source_sha256 THEN
    RAISE EXCEPTION 'media derivative result does not match immutable source';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_result->'derivatives','[]'::jsonb)) LOOP
    IF item->>'derivativeType' NOT IN ('thumbnail','analysis_ready')
       OR COALESCE(item->>'resultSha256','') !~ '^[a-f0-9]{64}$'
       OR length(trim(COALESCE(item->>'objectKey',''))) = 0
       OR length(trim(COALESCE(item->>'algorithmName',''))) = 0
       OR length(trim(COALESCE(item->>'algorithmVersion',''))) = 0
       OR NULLIF(item->>'widthPx','')::integer <= 0
       OR NULLIF(item->>'heightPx','')::integer <= 0 THEN
      RAISE EXCEPTION 'media derivative result is invalid';
    END IF;
    IF item->>'derivativeType' = ANY(seen_types) THEN
      RAISE EXCEPTION 'media derivative result repeats derivative type %', item->>'derivativeType';
    END IF;
    seen_types := array_append(seen_types, item->>'derivativeType');
    derivative_id := NULL;
    INSERT INTO media_derivatives(
      workspace_id, media_object_id, derivative_type, source_sha256,
      algorithm_name, algorithm_version, parameters, object_key, result_sha256,
      width_px, height_px
    ) VALUES (
      run.workspace_id, run.media_object_id, item->>'derivativeType', run.source_sha256,
      item->>'algorithmName', item->>'algorithmVersion', COALESCE(item->'parameters','{}'::jsonb),
      item->>'objectKey', item->>'resultSha256', (item->>'widthPx')::integer, (item->>'heightPx')::integer
    ) ON CONFLICT (workspace_id, object_key) DO NOTHING
    RETURNING id INTO derivative_id;
    IF derivative_id IS NULL THEN
      SELECT * INTO existing FROM media_derivatives
      WHERE workspace_id = run.workspace_id AND object_key = item->>'objectKey';
      IF existing.id IS NULL
         OR existing.media_object_id IS DISTINCT FROM run.media_object_id
         OR existing.derivative_type IS DISTINCT FROM item->>'derivativeType'
         OR existing.source_sha256 IS DISTINCT FROM run.source_sha256
         OR existing.algorithm_name IS DISTINCT FROM item->>'algorithmName'
         OR existing.algorithm_version IS DISTINCT FROM item->>'algorithmVersion'
         OR existing.parameters IS DISTINCT FROM COALESCE(item->'parameters','{}'::jsonb)
         OR existing.result_sha256 IS DISTINCT FROM item->>'resultSha256'
         OR existing.width_px IS DISTINCT FROM (item->>'widthPx')::integer
         OR existing.height_px IS DISTINCT FROM (item->>'heightPx')::integer THEN
        RAISE EXCEPTION 'immutable derivative key conflicts with different content';
      END IF;
    END IF;
    persisted_count := persisted_count + 1;
  END LOOP;
  IF persisted_count <> 2 OR NOT ('thumbnail' = ANY(seen_types)) OR NOT ('analysis_ready' = ANY(seen_types)) THEN
    RAISE EXCEPTION 'exactly one thumbnail and one analysis-ready derivative are required';
  END IF;
  UPDATE media_derivative_runs SET state = 'completed', failure_code = NULL, completed_at = now()
  WHERE workspace_id = run.workspace_id AND id = run.id;
  PERFORM app_complete_job(p_job_id, p_worker_id, p_result || jsonb_build_object('derivativeCount', persisted_count));
  RETURN jsonb_build_object('mediaObjectId', media.id, 'derivativeCount', persisted_count);
END
$$;

CREATE OR REPLACE FUNCTION app_worker_complete_phenotype_measurements(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  run phenotype_measurement_runs%ROWTYPE;
  capture phenotype_captures%ROWTYPE;
  item jsonb;
  measurement_id uuid;
  revision_id uuid;
  existing phenotype_measurements%ROWTYPE;
  persisted_count integer := 0;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.job_type <> 'media.measurements.v1'
     OR current_job.state NOT IN ('running','cancel_requested')
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active phenotype-measurement lease';
  END IF;
  SELECT * INTO run FROM phenotype_measurement_runs
  WHERE workspace_id = current_job.workspace_id AND job_id = current_job.id FOR UPDATE;
  SELECT * INTO capture FROM phenotype_captures
  WHERE workspace_id = current_job.workspace_id AND id = run.capture_id FOR SHARE;
  IF run.id IS NULL OR capture.id IS NULL OR p_result->>'sourceSha256' IS DISTINCT FROM run.source_sha256 THEN
    RAISE EXCEPTION 'phenotype measurement result does not match immutable capture source';
  END IF;
  PERFORM set_config('app.authority_function', 'phenotype_measurement_worker_completion', true);
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_result->'measurements','[]'::jsonb)) LOOP
    IF length(trim(COALESCE(item->>'measurementKey',''))) = 0
       OR length(trim(COALESCE(item->>'algorithmName',''))) = 0
       OR length(trim(COALESCE(item->>'algorithmVersion',''))) = 0
       OR jsonb_typeof(COALESCE(item->'valuePayload','null'::jsonb)) <> 'object' THEN
      RAISE EXCEPTION 'machine-observable measurement result is invalid';
    END IF;
    measurement_id := uuidv7();
    revision_id := uuidv7();
    INSERT INTO phenotype_measurements(
      id, workspace_id, capture_id, measurement_key, algorithm_name, algorithm_version,
      protocol_id, source_media_sha256, value_payload, current_revision_id
    ) VALUES (
      measurement_id, run.workspace_id, capture.id, item->>'measurementKey',
      item->>'algorithmName', item->>'algorithmVersion', capture.protocol_id,
      run.source_sha256, item->'valuePayload', NULL
    ) ON CONFLICT (workspace_id, capture_id, measurement_key, algorithm_name, algorithm_version) DO NOTHING
    RETURNING id INTO measurement_id;
    IF measurement_id IS NULL THEN
      SELECT * INTO existing FROM phenotype_measurements
      WHERE workspace_id = run.workspace_id AND capture_id = capture.id
        AND measurement_key = item->>'measurementKey'
        AND algorithm_name = item->>'algorithmName'
        AND algorithm_version = item->>'algorithmVersion';
      IF existing.id IS NULL OR existing.protocol_id IS DISTINCT FROM capture.protocol_id
         OR existing.source_media_sha256 IS DISTINCT FROM run.source_sha256
         OR existing.value_payload IS DISTINCT FROM item->'valuePayload'
         OR existing.current_revision_id IS NULL THEN
        RAISE EXCEPTION 'immutable machine measurement identity conflicts with different content';
      END IF;
    ELSE
      INSERT INTO phenotype_measurement_revisions(
        id, workspace_id, measurement_id, revision, value_payload, reason, corrected_by
      ) VALUES (
        revision_id, run.workspace_id, measurement_id, 1, item->'valuePayload',
        'Initial deterministic machine-observable measurement.', capture.captured_by
      );
      UPDATE phenotype_measurements SET current_revision_id = revision_id
      WHERE workspace_id = run.workspace_id AND id = measurement_id;
    END IF;
    persisted_count := persisted_count + 1;
  END LOOP;
  IF persisted_count = 0 THEN RAISE EXCEPTION 'no deterministic measurements were persisted'; END IF;
  UPDATE phenotype_measurement_runs SET state = 'completed', failure_code = NULL, completed_at = now()
  WHERE workspace_id = run.workspace_id AND id = run.id;
  PERFORM app_complete_job(p_job_id, p_worker_id, p_result || jsonb_build_object('measurementCount', persisted_count));
  RETURN jsonb_build_object('captureId', capture.id, 'measurementCount', persisted_count);
END
$$;

CREATE OR REPLACE FUNCTION sync_media_processing_from_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mapped media_processing_state;
BEGIN
  IF NEW.state IS NOT DISTINCT FROM OLD.state OR NEW.job_type NOT IN ('media.derivatives.v1','media.measurements.v1') THEN RETURN NEW; END IF;
  mapped := CASE NEW.state
    WHEN 'queued' THEN 'queued'::media_processing_state
    WHEN 'running' THEN 'running'::media_processing_state
    WHEN 'cancel_requested' THEN 'running'::media_processing_state
    WHEN 'succeeded' THEN 'completed'::media_processing_state
    WHEN 'failed' THEN 'failed'::media_processing_state
    WHEN 'cancelled' THEN 'cancelled'::media_processing_state
    WHEN 'dead_letter' THEN 'dead_letter'::media_processing_state
  END;
  IF NEW.job_type = 'media.derivatives.v1' THEN
    UPDATE media_derivative_runs SET state = mapped,
      failure_code = CASE WHEN NEW.state IN ('failed','dead_letter') THEN NEW.last_error_code ELSE NULL END,
      completed_at = CASE WHEN NEW.state = 'succeeded' THEN COALESCE(completed_at, now()) ELSE NULL END
    WHERE workspace_id = NEW.workspace_id AND job_id = NEW.id AND state <> 'completed';
  ELSE
    UPDATE phenotype_measurement_runs SET state = mapped,
      failure_code = CASE WHEN NEW.state IN ('failed','dead_letter') THEN NEW.last_error_code ELSE NULL END,
      completed_at = CASE WHEN NEW.state = 'succeeded' THEN COALESCE(completed_at, now()) ELSE NULL END
    WHERE workspace_id = NEW.workspace_id AND job_id = NEW.id AND state <> 'completed';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jobs_sync_media_processing
AFTER UPDATE OF state ON jobs
FOR EACH ROW EXECUTE FUNCTION sync_media_processing_from_job();

INSERT INTO job_contracts(job_type, contract_version, worker_capability, payload_schema, result_schema, active)
VALUES
  ('media.derivatives.v1','1.0.0','node.media.deterministic-derivatives',
   '{"type":"object","required":["mediaObjectId","objectKey","sourceSha256","detectedMimeType"]}'::jsonb,
   '{"type":"object","required":["sourceSha256","derivatives"]}'::jsonb,true),
  ('media.measurements.v1','1.0.0','node.media.machine-observable-measurements',
   '{"type":"object","required":["captureId","objectKey","sourceSha256","protocolId"]}'::jsonb,
   '{"type":"object","required":["sourceSha256","measurements"]}'::jsonb,true)
ON CONFLICT (job_type, contract_version) DO UPDATE
SET worker_capability = EXCLUDED.worker_capability,
    payload_schema = EXCLUDED.payload_schema,
    result_schema = EXCLUDED.result_schema,
    active = true;

REVOKE ALL ON FUNCTION queue_media_derivative_job() FROM PUBLIC, capsicum_runtime, capsicum_worker;
REVOKE ALL ON FUNCTION queue_capture_measurement_job() FROM PUBLIC, capsicum_runtime, capsicum_worker;
REVOKE ALL ON FUNCTION sync_media_processing_from_job() FROM PUBLIC, capsicum_runtime, capsicum_worker;
REVOKE ALL ON FUNCTION app_worker_complete_media_derivatives(uuid,text,jsonb) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_complete_phenotype_measurements(uuid,text,jsonb) FROM PUBLIC, capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_worker_complete_media_derivatives(uuid,text,jsonb) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_complete_phenotype_measurements(uuid,text,jsonb) TO capsicum_worker;

GRANT SELECT ON media_derivative_runs, phenotype_measurement_runs TO capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON media_derivative_runs, phenotype_measurement_runs FROM capsicum_runtime;

COMMIT;
