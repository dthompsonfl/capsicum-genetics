BEGIN;

CREATE TYPE idempotency_state AS ENUM ('pending','completed','failed_retryable','failed_terminal','conflict');
CREATE TYPE artifact_state AS ENUM ('pending','available','rejected','expired');
CREATE TYPE media_inspection_state AS ENUM ('queued','running','accepted','rejected','needs_review','failed');

ALTER TABLE idempotency_records
  ADD COLUMN state idempotency_state NOT NULL DEFAULT 'pending',
  ADD COLUMN operation_name text,
  ADD COLUMN last_error_code text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN completed_at timestamptz;
UPDATE idempotency_records
SET state = CASE WHEN response_status IS NOT NULL THEN 'completed'::idempotency_state ELSE 'pending'::idempotency_state END,
    completed_at = CASE WHEN response_status IS NOT NULL THEN created_at ELSE NULL END;
ALTER TABLE idempotency_records
  ADD CONSTRAINT idempotency_records_state_response_check CHECK (
    (state = 'completed' AND response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
    OR state <> 'completed'
  );

ALTER TABLE user_credentials
  ADD COLUMN password_parameters jsonb NOT NULL DEFAULT '{"algorithm":"scrypt","version":1,"N":32768,"r":8,"p":1,"keyLength":64}'::jsonb,
  ADD COLUMN rehash_required boolean NOT NULL DEFAULT false;

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  requested_ip_hmac text,
  CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CHECK (expires_at > requested_at),
  CHECK (NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE INDEX password_reset_tokens_active_idx
  ON password_reset_tokens(token_hash, expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE user_totp_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  key_version text NOT NULL,
  enabled_at timestamptz,
  disabled_at timestamptz,
  last_used_step bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (enabled_at IS NOT NULL AND disabled_at IS NOT NULL))
);
CREATE TABLE user_recovery_codes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  UNIQUE (user_id, code_hash),
  CHECK (code_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  scope text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(scope)) > 0)
);

CREATE OR REPLACE FUNCTION app_consume_rate_limit(
  p_bucket_key text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer DEFAULT 0
)
RETURNS TABLE(allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  bucket rate_limit_buckets%ROWTYPE;
  now_value timestamptz := clock_timestamp();
BEGIN
  IF p_limit < 1 OR p_limit > 100000 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate-limit contract';
  END IF;
  INSERT INTO rate_limit_buckets(bucket_key, scope, window_started_at, request_count)
  VALUES (p_bucket_key, p_scope, now_value, 0)
  ON CONFLICT (bucket_key) DO NOTHING;
  SELECT * INTO bucket FROM rate_limit_buckets WHERE bucket_key = p_bucket_key FOR UPDATE;
  IF bucket.blocked_until IS NOT NULL AND bucket.blocked_until > now_value THEN
    RETURN QUERY SELECT false, 0, GREATEST(1, ceil(extract(epoch FROM bucket.blocked_until - now_value))::integer);
    RETURN;
  END IF;
  IF bucket.window_started_at + make_interval(secs => p_window_seconds) <= now_value THEN
    bucket.window_started_at := now_value;
    bucket.request_count := 0;
  END IF;
  bucket.request_count := bucket.request_count + 1;
  IF bucket.request_count > p_limit THEN
    UPDATE rate_limit_buckets
    SET window_started_at = bucket.window_started_at,
        request_count = bucket.request_count,
        blocked_until = CASE WHEN p_block_seconds > 0 THEN now_value + make_interval(secs => p_block_seconds) ELSE NULL END,
        updated_at = now_value
    WHERE bucket_key = p_bucket_key;
    RETURN QUERY SELECT false, 0,
      CASE WHEN p_block_seconds > 0 THEN p_block_seconds
           ELSE GREATEST(1, ceil(extract(epoch FROM bucket.window_started_at + make_interval(secs => p_window_seconds) - now_value))::integer)
      END;
    RETURN;
  END IF;
  UPDATE rate_limit_buckets
  SET scope = p_scope,
      window_started_at = bucket.window_started_at,
      request_count = bucket.request_count,
      blocked_until = NULL,
      updated_at = now_value
  WHERE bucket_key = p_bucket_key;
  RETURN QUERY SELECT true, p_limit - bucket.request_count, 0;
END
$$;
REVOKE ALL ON FUNCTION app_consume_rate_limit(text,text,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_consume_rate_limit(text,text,integer,integer,integer) TO capsicum_runtime;

CREATE TABLE immutable_artifacts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  artifact_type text NOT NULL,
  object_key text NOT NULL,
  content_sha256 text NOT NULL,
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  media_type text NOT NULL,
  state artifact_state NOT NULL DEFAULT 'pending',
  source_job_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, object_key),
  UNIQUE (workspace_id, content_sha256, artifact_type),
  FOREIGN KEY (workspace_id, source_job_id) REFERENCES jobs(workspace_id, id),
  FOREIGN KEY (workspace_id, created_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK ((state = 'available') = (available_at IS NOT NULL)),
  CHECK (length(trim(artifact_type)) > 0)
);

ALTER TABLE jobs
  ADD COLUMN trace_id text,
  ADD COLUMN heartbeat_at timestamptz,
  ADD COLUMN payload_sha256 text,
  ADD COLUMN result_artifact_id uuid,
  ADD CONSTRAINT jobs_payload_sha256_check CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT jobs_result_artifact_fk FOREIGN KEY (workspace_id, result_artifact_id)
    REFERENCES immutable_artifacts(workspace_id, id);

CREATE TABLE job_contracts (
  job_type text NOT NULL,
  contract_version text NOT NULL,
  worker_capability text NOT NULL,
  payload_schema jsonb NOT NULL,
  result_schema jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_type, contract_version),
  CHECK (length(trim(worker_capability)) > 0)
);

CREATE TABLE worker_heartbeats (
  worker_id text PRIMARY KEY,
  worker_kind text NOT NULL,
  worker_version text NOT NULL,
  capabilities text[] NOT NULL,
  started_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL,
  current_job_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (length(trim(worker_id)) > 0),
  CHECK (cardinality(capabilities) > 0)
);

CREATE TABLE outbox_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  outbox_id uuid NOT NULL,
  adapter_key text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  outcome text NOT NULL,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, outbox_id, adapter_key, attempt),
  FOREIGN KEY (workspace_id, outbox_id) REFERENCES transactional_outbox(workspace_id, id),
  CHECK (outcome IN ('delivered','retryable_failure','terminal_failure','unavailable'))
);

ALTER TABLE media_objects
  ADD COLUMN declared_mime_type text,
  ADD COLUMN detected_mime_type text,
  ADD COLUMN frame_count integer CHECK (frame_count IS NULL OR frame_count > 0),
  ADD COLUMN metadata_payload jsonb,
  ADD COLUMN metadata_stripped boolean NOT NULL DEFAULT false,
  ADD COLUMN inspection_state media_inspection_state NOT NULL DEFAULT 'queued',
  ADD COLUMN inspection_job_id uuid,
  ADD COLUMN accepted_at timestamptz,
  ADD CONSTRAINT media_objects_inspection_job_fk FOREIGN KEY (workspace_id, inspection_job_id)
    REFERENCES jobs(workspace_id, id),
  ADD CONSTRAINT media_objects_authority_check CHECK (
    upload_state <> 'complete'
    OR (inspection_state = 'accepted' AND accepted_at IS NOT NULL)
  );
UPDATE media_objects
SET declared_mime_type = mime_type,
    detected_mime_type = mime_type,
    inspection_state = CASE WHEN upload_state = 'complete' THEN 'accepted'::media_inspection_state ELSE 'queued'::media_inspection_state END,
    accepted_at = CASE WHEN upload_state = 'complete' THEN completed_at ELSE NULL END;

CREATE TABLE media_inspections (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  media_object_id uuid NOT NULL,
  inspection_state media_inspection_state NOT NULL,
  inspector_kind text NOT NULL,
  inspector_version text NOT NULL,
  source_sha256 text NOT NULL,
  declared_mime_type text,
  detected_mime_type text,
  width_px integer,
  height_px integer,
  pixel_count bigint,
  frame_count integer,
  blur_score numeric(8,7),
  exposure_score numeric(8,7),
  orientation smallint,
  metadata_detected jsonb NOT NULL DEFAULT '{}'::jsonb,
  malware_result text NOT NULL,
  decoder_result text NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, media_object_id, inspector_kind, inspector_version, source_sha256),
  FOREIGN KEY (workspace_id, media_object_id) REFERENCES media_objects(workspace_id, id),
  CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (width_px IS NULL OR width_px > 0),
  CHECK (height_px IS NULL OR height_px > 0),
  CHECK (pixel_count IS NULL OR pixel_count > 0),
  CHECK (frame_count IS NULL OR frame_count > 0),
  CHECK (blur_score IS NULL OR (blur_score >= 0 AND blur_score <= 1)),
  CHECK (exposure_score IS NULL OR (exposure_score >= 0 AND exposure_score <= 1)),
  CHECK (malware_result IN ('clean','suspicious','infected','unavailable')),
  CHECK (decoder_result IN ('accepted','rejected','timed_out','resource_limited','failed')),
  CHECK (jsonb_typeof(findings) = 'array')
);

CREATE TABLE media_derivatives (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  media_object_id uuid NOT NULL,
  derivative_type text NOT NULL,
  source_sha256 text NOT NULL,
  algorithm_name text NOT NULL,
  algorithm_version text NOT NULL,
  parameters jsonb NOT NULL,
  object_key text NOT NULL,
  result_sha256 text NOT NULL,
  width_px integer,
  height_px integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, media_object_id, derivative_type, algorithm_version, result_sha256),
  UNIQUE (workspace_id, object_key),
  FOREIGN KEY (workspace_id, media_object_id) REFERENCES media_objects(workspace_id, id),
  CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (result_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE TABLE phenotype_measurements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  measurement_key text NOT NULL,
  algorithm_name text NOT NULL,
  algorithm_version text NOT NULL,
  protocol_id uuid NOT NULL REFERENCES capture_protocols(id),
  source_media_sha256 text NOT NULL,
  value_payload jsonb NOT NULL,
  unit_id uuid REFERENCES measurement_units(id),
  current_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, capture_id, measurement_key, algorithm_name, algorithm_version),
  FOREIGN KEY (workspace_id, capture_id) REFERENCES phenotype_captures(workspace_id, id),
  CHECK (source_media_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE phenotype_measurement_revisions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  measurement_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  value_payload jsonb NOT NULL,
  reason text NOT NULL,
  supersedes_revision_id uuid,
  corrected_by uuid NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, measurement_id, revision),
  UNIQUE (workspace_id, supersedes_revision_id),
  FOREIGN KEY (workspace_id, measurement_id) REFERENCES phenotype_measurements(workspace_id, id),
  FOREIGN KEY (workspace_id, supersedes_revision_id) REFERENCES phenotype_measurement_revisions(workspace_id, id),
  FOREIGN KEY (workspace_id, corrected_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(reason)) > 0)
);
ALTER TABLE phenotype_measurements ADD CONSTRAINT phenotype_measurements_current_revision_fk
  FOREIGN KEY (workspace_id, current_revision_id) REFERENCES phenotype_measurement_revisions(workspace_id, id);

CREATE TABLE research_extraction_artifacts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  source_sha256 text NOT NULL,
  extractor_name text NOT NULL,
  extractor_version text NOT NULL,
  artifact_sha256 text NOT NULL,
  object_key text NOT NULL,
  page_count integer,
  extraction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, document_id, extractor_name, extractor_version, artifact_sha256),
  FOREIGN KEY (workspace_id, document_id) REFERENCES research_documents(workspace_id, id),
  CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (page_count IS NULL OR page_count > 0)
);

ALTER TABLE research_passages
  ADD COLUMN extraction_artifact_id uuid,
  ADD COLUMN passage_version integer NOT NULL DEFAULT 1 CHECK (passage_version > 0),
  ADD COLUMN page_start integer,
  ADD COLUMN page_end integer,
  ADD COLUMN character_start integer,
  ADD COLUMN character_end integer,
  ADD COLUMN locator text,
  ADD COLUMN review_state review_state NOT NULL DEFAULT 'draft',
  ADD COLUMN authored_by uuid,
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN supersedes_passage_id uuid,
  ADD CONSTRAINT research_passages_extraction_artifact_fk
    FOREIGN KEY (workspace_id, extraction_artifact_id) REFERENCES research_extraction_artifacts(workspace_id, id),
  ADD CONSTRAINT research_passages_authored_by_fk
    FOREIGN KEY (workspace_id, authored_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT research_passages_approved_by_fk
    FOREIGN KEY (workspace_id, approved_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT research_passages_supersedes_fk
    FOREIGN KEY (workspace_id, supersedes_passage_id) REFERENCES research_passages(workspace_id, id),
  ADD CONSTRAINT research_passages_review_check CHECK (
    (review_state IN ('approved','superseded') AND authored_by IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by <> authored_by)
    OR review_state NOT IN ('approved','superseded')
  ),
  ADD CONSTRAINT research_passages_page_range_check CHECK (page_end IS NULL OR (page_start IS NOT NULL AND page_end >= page_start)),
  ADD CONSTRAINT research_passages_character_range_check CHECK (character_end IS NULL OR (character_start IS NOT NULL AND character_end >= character_start));
CREATE UNIQUE INDEX research_passages_single_successor_idx
  ON research_passages(workspace_id, supersedes_passage_id)
  WHERE supersedes_passage_id IS NOT NULL;
CREATE INDEX research_passages_full_text_idx
  ON research_passages USING gin (to_tsvector('english', passage_text));
CREATE INDEX research_passages_trigram_fallback_idx
  ON research_passages(workspace_id, document_id, passage_index, passage_version);

ALTER TABLE ai_interactions
  ADD COLUMN provider text NOT NULL DEFAULT 'deterministic_local',
  ADD COLUMN provider_model_version text,
  ADD COLUMN latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  ADD COLUMN input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  ADD COLUMN output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  ADD COLUMN cost_microunits bigint CHECK (cost_microunits IS NULL OR cost_microunits >= 0),
  ADD COLUMN abstained boolean NOT NULL DEFAULT false,
  ADD COLUMN feedback jsonb;

ALTER TABLE export_jobs
  ADD COLUMN job_id uuid,
  ADD COLUMN artifact_id uuid,
  ADD CONSTRAINT export_jobs_job_fk FOREIGN KEY (workspace_id, job_id) REFERENCES jobs(workspace_id, id),
  ADD CONSTRAINT export_jobs_artifact_fk FOREIGN KEY (workspace_id, artifact_id) REFERENCES immutable_artifacts(workspace_id, id);

CREATE TRIGGER media_inspections_append_only
BEFORE UPDATE OR DELETE ON media_inspections FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER media_derivatives_append_only
BEFORE UPDATE OR DELETE ON media_derivatives FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER phenotype_measurement_revisions_append_only
BEFORE UPDATE OR DELETE ON phenotype_measurement_revisions FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER research_extraction_artifacts_append_only
BEFORE UPDATE OR DELETE ON research_extraction_artifacts FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE OR REPLACE FUNCTION guard_immutable_artifact_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable artifacts cannot be deleted';
  END IF;
  IF OLD.state <> 'pending' THEN
    RAISE EXCEPTION 'finalized immutable artifacts cannot be changed';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.artifact_type IS DISTINCT FROM OLD.artifact_type
     OR NEW.object_key IS DISTINCT FROM OLD.object_key
     OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.byte_length IS DISTINCT FROM OLD.byte_length
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.source_job_id IS DISTINCT FROM OLD.source_job_id
     OR NEW.metadata IS DISTINCT FROM OLD.metadata
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'immutable artifact identity and content metadata cannot be changed';
  END IF;
  IF NEW.state NOT IN ('available','rejected','expired') THEN
    RAISE EXCEPTION 'pending artifacts may only be finalized as available, rejected, or expired';
  END IF;
  IF NEW.state = 'available' AND NEW.available_at IS NULL THEN
    RAISE EXCEPTION 'available artifact requires available_at';
  END IF;
  IF NEW.state <> 'available' AND NEW.available_at IS NOT NULL THEN
    RAISE EXCEPTION 'non-available artifact cannot have available_at';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER immutable_artifacts_guard
BEFORE UPDATE OR DELETE ON immutable_artifacts FOR EACH ROW EXECUTE FUNCTION guard_immutable_artifact_transition();

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'immutable_artifacts','outbox_delivery_attempts','media_inspections','media_derivatives',
    'phenotype_measurements','phenotype_measurement_revisions','research_extraction_artifacts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY active_membership_workspace_isolation ON %I USING (app_workspace_access_allowed(workspace_id)) WITH CHECK (app_workspace_access_allowed(workspace_id))', target
    );
  END LOOP;
END
$$;

-- Worker-only tables and functions are not directly available to the web role.
REVOKE ALL ON worker_heartbeats, job_contracts FROM capsicum_runtime;
GRANT SELECT ON job_contracts TO capsicum_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_heartbeats TO capsicum_worker;

COMMIT;
