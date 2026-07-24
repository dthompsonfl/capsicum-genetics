BEGIN;

CREATE OR REPLACE FUNCTION app_worker_breeding_ledger_export_context(
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
  export_record export_jobs%ROWTYPE;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id;
  IF current_job.id IS NULL OR current_job.job_type <> 'export.breeding-ledger.v1'
     OR current_job.state NOT IN ('running','cancel_requested')
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id
     OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active breeding-ledger export lease';
  END IF;

  SELECT * INTO export_record FROM export_jobs
  WHERE workspace_id = current_job.workspace_id AND job_id = current_job.id;
  IF export_record.id IS NULL OR export_record.state NOT IN ('queued','running') THEN
    RAISE EXCEPTION 'export record is not eligible for streaming';
  END IF;

  RETURN jsonb_build_object(
    'workspaceId', current_job.workspace_id,
    'exportJobId', export_record.id,
    'format', export_record.requested_format,
    'requestedAt', export_record.requested_at,
    'snapshotAt', transaction_timestamp(),
    'schemaVersion', '3.1'
  );
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
  release_identifier text := p_result->>'softwareReleaseIdentifier';
  v_requested_at timestamptz;
  v_snapshot_at timestamptz;
  v_generated_at timestamptz;
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
  IF p_result->>'exportJobId' IS DISTINCT FROM export_record.id::text
     OR p_result->>'format' IS DISTINCT FROM export_record.requested_format
     OR p_result->>'schemaVersion' IS DISTINCT FROM '3.1' THEN
    RAISE EXCEPTION 'export result does not match the authoritative export request';
  END IF;
  IF release_identifier IS NULL OR (
       release_identifier <> 'development-unversioned'
       AND release_identifier !~* '^[a-f0-9]{40}$'
       AND release_identifier !~* '^[a-f0-9]{64}$'
     ) THEN
    RAISE EXCEPTION 'export result lacks an immutable software release identifier';
  END IF;
  IF p_result->>'requestedAt' IS NULL
     OR p_result->>'snapshotAt' IS NULL
     OR p_result->>'generatedAt' IS NULL
     OR jsonb_typeof(p_result->'scientificProfile') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_result->'sectionCounts') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'export result lacks required scientific provenance';
  END IF;
  BEGIN
    v_requested_at := (p_result->>'requestedAt')::timestamptz;
    v_snapshot_at := (p_result->>'snapshotAt')::timestamptz;
    v_generated_at := (p_result->>'generatedAt')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'export result contains invalid scientific provenance timestamps';
  END;
  IF v_requested_at > v_snapshot_at OR v_snapshot_at > v_generated_at THEN
    RAISE EXCEPTION 'export provenance timeline must satisfy requestedAt <= snapshotAt <= generatedAt';
  END IF;

  INSERT INTO immutable_artifacts(
    id, workspace_id, artifact_type, object_key, content_sha256, byte_length,
    media_type, state, source_job_id, metadata, created_by, available_at
  ) VALUES (
    v_artifact_id, current_job.workspace_id, 'breeding_ledger_export', p_object_key,
    p_content_sha256, p_byte_length, p_media_type, 'available', current_job.id,
    jsonb_build_object(
      'exportJobId', export_record.id,
      'format', export_record.requested_format,
      'schemaVersion', p_result->>'schemaVersion',
      'softwareReleaseIdentifier', release_identifier,
      'requestedAt', p_result->>'requestedAt',
      'snapshotAt', p_result->>'snapshotAt',
      'generatedAt', p_result->>'generatedAt',
      'scientificProfile', p_result->'scientificProfile',
      'sectionCounts', p_result->'sectionCounts'
    ),
    export_record.requested_by, now()
  );

  PERFORM set_config('app.authority_function', 'worker_export_completion', true);
  UPDATE export_jobs
  SET state = 'succeeded', artifact_id = v_artifact_id, object_key = p_object_key,
      content_sha256 = p_content_sha256, completed_at = now(), failure_code = NULL
  WHERE workspace_id = current_job.workspace_id AND id = export_record.id;
  UPDATE jobs SET result_artifact_id = v_artifact_id WHERE id = current_job.id;
  PERFORM app_complete_job(
    p_job_id,
    p_worker_id,
    p_result || jsonb_build_object(
      'artifactId', v_artifact_id,
      'contentSha256', p_content_sha256,
      'byteLength', p_byte_length
    )
  );
  RETURN v_artifact_id;
END
$$;

UPDATE job_contracts
SET worker_capability = 'node.export.streaming-breeding-ledger',
    payload_schema = '{"type":"object","required":["exportJobId","format","schemaVersion"]}'::jsonb,
    result_schema = '{"type":"object","required":["artifactId","contentSha256","byteLength","exportJobId","format","schemaVersion","sectionCounts","requestedAt","snapshotAt","generatedAt","softwareReleaseIdentifier","scientificProfile"]}'::jsonb
WHERE job_type = 'export.breeding-ledger.v1' AND contract_version = '1.0.0';

REVOKE ALL ON FUNCTION app_worker_breeding_ledger_export_context(uuid,text)
  FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_complete_export(uuid,text,text,text,bigint,text,jsonb)
  FROM PUBLIC, capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_worker_breeding_ledger_export_context(uuid,text)
  TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_complete_export(uuid,text,text,text,bigint,text,jsonb)
  TO capsicum_worker;

COMMIT;
