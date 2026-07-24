BEGIN;

CREATE TYPE research_ingestion_state AS ENUM (
  'queued',
  'processing',
  'extracted',
  'failed',
  'cancelled',
  'unavailable'
);

ALTER TABLE research_documents
  ADD COLUMN source_media_type text,
  ADD COLUMN source_byte_length bigint,
  ADD COLUMN ingestion_state research_ingestion_state NOT NULL DEFAULT 'queued',
  ADD COLUMN ingestion_failure_code text,
  ADD CONSTRAINT research_documents_source_media_type_check CHECK (
    source_media_type IS NULL OR source_media_type IN ('text/plain','text/markdown','application/pdf')
  ),
  ADD CONSTRAINT research_documents_source_byte_length_check CHECK (
    source_byte_length IS NULL OR source_byte_length > 0
  );

-- V2/V3/V4 sources may already have reviewed passages without a durable ingestion job.
-- Preserve those records as extracted; mark other legacy rows explicitly unavailable rather
-- than pretending that a worker is queued for a job that does not exist.
UPDATE research_documents document
SET ingestion_state = CASE
      WHEN EXISTS (
        SELECT 1 FROM research_passages passage
        WHERE passage.workspace_id = document.workspace_id AND passage.document_id = document.id
      ) THEN 'extracted'::research_ingestion_state
      ELSE 'unavailable'::research_ingestion_state
    END,
    ingestion_failure_code = CASE
      WHEN EXISTS (
        SELECT 1 FROM research_passages passage
        WHERE passage.workspace_id = document.workspace_id AND passage.document_id = document.id
      ) THEN NULL
      ELSE 'legacy_source_not_durably_ingested'
    END
WHERE document.ingestion_job_id IS NULL;

CREATE OR REPLACE FUNCTION guard_research_ingestion_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.source_sha256 IS DISTINCT FROM NEW.source_sha256
     OR OLD.object_key IS DISTINCT FROM NEW.object_key
     OR OLD.source_media_type IS DISTINCT FROM NEW.source_media_type
     OR OLD.source_byte_length IS DISTINCT FROM NEW.source_byte_length
     OR OLD.ingestion_job_id IS DISTINCT FROM NEW.ingestion_job_id THEN
    RAISE EXCEPTION 'research source identity and ingestion job binding are immutable';
  END IF;
  IF (OLD.ingestion_state IS DISTINCT FROM NEW.ingestion_state
      OR OLD.ingestion_failure_code IS DISTINCT FROM NEW.ingestion_failure_code)
     AND COALESCE(current_setting('app.authority_function', true), '') NOT IN (
       'research_worker_ingestion', 'research_job_state_sync'
     ) THEN
    RAISE EXCEPTION 'research ingestion state may change only through canonical worker authority';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER research_documents_ingestion_authority_guard
BEFORE UPDATE ON research_documents
FOR EACH ROW EXECUTE FUNCTION guard_research_ingestion_state();

CREATE OR REPLACE FUNCTION app_worker_complete_research_ingestion(
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
  document research_documents%ROWTYPE;
  artifact_id uuid := uuidv7();
  passage jsonb;
  passage_count integer := 0;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.job_type <> 'research.ingest.v1'
     OR current_job.state NOT IN ('running','cancel_requested')
     OR current_job.lease_owner <> p_worker_id OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active research ingestion lease';
  END IF;
  SELECT * INTO document FROM research_documents
  WHERE workspace_id = current_job.workspace_id AND ingestion_job_id = current_job.id FOR UPDATE;
  IF document.id IS NULL OR document.ingestion_state NOT IN ('queued','processing','failed') THEN
    RAISE EXCEPTION 'research document is not eligible for ingestion completion';
  END IF;
  IF p_result->>'documentId' IS DISTINCT FROM document.id::text
     OR p_result->>'sourceSha256' IS DISTINCT FROM document.source_sha256 THEN
    RAISE EXCEPTION 'research ingestion result does not match the immutable source document';
  END IF;
  IF COALESCE(p_result->>'artifactSha256','') !~ '^[a-f0-9]{64}$'
     OR length(trim(COALESCE(p_result->>'artifactObjectKey',''))) = 0 THEN
    RAISE EXCEPTION 'research extraction artifact identity is invalid';
  END IF;
  INSERT INTO research_extraction_artifacts(
    id, workspace_id, document_id, source_sha256, extractor_name, extractor_version,
    artifact_sha256, object_key, page_count, extraction_metadata
  ) VALUES (
    artifact_id, document.workspace_id, document.id, document.source_sha256,
    p_result->>'extractorName', p_result->>'extractorVersion', p_result->>'artifactSha256',
    p_result->>'artifactObjectKey', NULLIF(p_result->>'pageCount','')::integer,
    COALESCE(p_result->'extractionMetadata','{}'::jsonb)
  );
  FOR passage IN SELECT value FROM jsonb_array_elements(COALESCE(p_result->'passages','[]'::jsonb)) LOOP
    IF COALESCE(passage->>'passageSha256','') !~ '^[a-f0-9]{64}$'
       OR length(trim(COALESCE(passage->>'passageText',''))) = 0
       OR NULLIF(passage->>'characterEnd','')::integer <= NULLIF(passage->>'characterStart','')::integer THEN
      RAISE EXCEPTION 'research passage extraction result is invalid';
    END IF;
    INSERT INTO research_passages(
      workspace_id, document_id, passage_index, passage_text, passage_sha256, token_count,
      extraction_artifact_id, passage_version, character_start, character_end, locator,
      review_state, authored_by
    ) VALUES (
      document.workspace_id, document.id, (passage->>'passageIndex')::integer,
      passage->>'passageText', passage->>'passageSha256', (passage->>'tokenCount')::integer,
      artifact_id, 1, (passage->>'characterStart')::integer, (passage->>'characterEnd')::integer,
      passage->>'locator', 'draft', document.created_by
    );
    passage_count := passage_count + 1;
  END LOOP;
  IF passage_count = 0 THEN RAISE EXCEPTION 'research ingestion produced no reviewable passages'; END IF;
  PERFORM set_config('app.authority_function', 'research_worker_ingestion', true);
  UPDATE research_documents
  SET ingestion_state = 'extracted', ingestion_failure_code = NULL
  WHERE workspace_id = document.workspace_id AND id = document.id;
  PERFORM app_complete_job(p_job_id, p_worker_id, jsonb_build_object(
    'documentId', document.id, 'extractionArtifactId', artifact_id, 'passageCount', passage_count
  ));
  RETURN jsonb_build_object(
    'documentId', document.id,
    'extractionArtifactId', artifact_id,
    'passageCount', passage_count
  );
END
$$;

CREATE OR REPLACE FUNCTION sync_research_ingestion_from_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.job_type <> 'research.ingest.v1' OR NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  IF NEW.state IN ('running','failed','cancelled','dead_letter') THEN
    PERFORM set_config('app.authority_function', 'research_job_state_sync', true);
    UPDATE research_documents
    SET ingestion_state = CASE NEW.state
      WHEN 'running' THEN 'processing'::research_ingestion_state
      WHEN 'failed' THEN 'failed'::research_ingestion_state
      WHEN 'cancelled' THEN 'cancelled'::research_ingestion_state
      WHEN 'dead_letter' THEN 'failed'::research_ingestion_state
    END,
    ingestion_failure_code = CASE WHEN NEW.state IN ('failed','dead_letter') THEN NEW.last_error_code ELSE NULL END
    WHERE workspace_id = NEW.workspace_id AND ingestion_job_id = NEW.id
      AND ingestion_state <> 'extracted';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jobs_sync_research_ingestion
AFTER UPDATE OF state ON jobs
FOR EACH ROW EXECUTE FUNCTION sync_research_ingestion_from_job();

INSERT INTO job_contracts(job_type, contract_version, worker_capability, payload_schema, result_schema, active)
VALUES (
  'research.ingest.v1', '1.0.0', 'node.research.deterministic-text-extraction',
  '{"type":"object","required":["documentId","objectKey","sourceSha256","mediaType"]}'::jsonb,
  '{"type":"object","required":["documentId","artifactSha256","artifactObjectKey","passages"]}'::jsonb,
  true
)
ON CONFLICT (job_type, contract_version) DO UPDATE
SET worker_capability = EXCLUDED.worker_capability,
    payload_schema = EXCLUDED.payload_schema,
    result_schema = EXCLUDED.result_schema,
    active = true;

REVOKE ALL ON FUNCTION app_worker_complete_research_ingestion(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_worker_complete_research_ingestion(uuid,text,jsonb) TO capsicum_worker;

COMMIT;
