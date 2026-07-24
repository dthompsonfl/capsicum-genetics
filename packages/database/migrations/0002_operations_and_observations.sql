BEGIN;

CREATE TYPE job_state AS ENUM (
  'queued',
  'running',
  'cancel_requested',
  'succeeded',
  'failed',
  'cancelled',
  'dead_letter'
);
CREATE TYPE outbox_state AS ENUM ('pending', 'publishing', 'published', 'failed', 'dead_letter');
CREATE TYPE capture_quality_state AS ENUM ('accepted', 'rejected', 'needs_review');
CREATE TYPE model_state AS ENUM ('draft', 'evaluating', 'validated', 'rejected', 'retired');

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  job_type text NOT NULL,
  contract_version text NOT NULL,
  state job_state NOT NULL DEFAULT 'queued',
  priority smallint NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  payload jsonb NOT NULL,
  result jsonb,
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 100),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  cancellation_requested_at timestamptz,
  last_error_code text,
  last_error_detail jsonb,
  idempotency_key text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, job_type, idempotency_key),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(job_type)) > 0),
  CHECK (length(trim(contract_version)) > 0),
  CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  CHECK (attempt <= max_attempts),
  CHECK ((state IN ('running', 'cancel_requested')) = (lease_owner IS NOT NULL)),
  CHECK ((state IN ('running', 'cancel_requested')) = (lease_expires_at IS NOT NULL)),
  CHECK ((state IN ('succeeded', 'cancelled', 'dead_letter')) = (completed_at IS NOT NULL)),
  CHECK (state <> 'succeeded' OR result IS NOT NULL)
);
CREATE INDEX jobs_claim_idx ON jobs(state, priority, available_at, created_at)
  WHERE state IN ('queued', 'failed');
CREATE INDEX jobs_workspace_time_idx ON jobs(workspace_id, created_at DESC);
CREATE INDEX jobs_lease_expiry_idx ON jobs(lease_expires_at)
  WHERE state IN ('running', 'cancel_requested');

CREATE TABLE job_attempts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  job_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  worker_id text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  outcome job_state,
  error_code text,
  error_detail jsonb,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, job_id, attempt),
  FOREIGN KEY (workspace_id, job_id) REFERENCES jobs(workspace_id, id),
  CHECK (length(trim(worker_id)) > 0),
  CHECK (outcome IS NULL OR outcome IN ('succeeded', 'failed', 'cancelled', 'dead_letter'))
);

CREATE TABLE job_logs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  job_id uuid NOT NULL,
  attempt integer,
  level text NOT NULL,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, job_id) REFERENCES jobs(workspace_id, id),
  CHECK (level IN ('debug', 'info', 'warn', 'error')),
  CHECK (length(trim(event)) > 0)
);
CREATE INDEX job_logs_job_time_idx ON job_logs(workspace_id, job_id, occurred_at);

CREATE TABLE transactional_outbox (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  contract_version text NOT NULL,
  payload jsonb NOT NULL,
  state outbox_state NOT NULL DEFAULT 'pending',
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts integer NOT NULL DEFAULT 10 CHECK (max_attempts BETWEEN 1 AND 100),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (workspace_id, id),
  CHECK (length(trim(aggregate_type)) > 0),
  CHECK (length(trim(event_type)) > 0),
  CHECK (attempt <= max_attempts),
  CHECK ((state = 'publishing') = (lease_owner IS NOT NULL)),
  CHECK ((state = 'publishing') = (lease_expires_at IS NOT NULL)),
  CHECK ((state = 'published') = (published_at IS NOT NULL))
);
CREATE INDEX transactional_outbox_claim_idx
  ON transactional_outbox(state, available_at, created_at)
  WHERE state IN ('pending', 'failed');

CREATE TABLE research_documents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source_id uuid REFERENCES scientific_sources(id),
  title text NOT NULL,
  source_locator text NOT NULL,
  document_version text NOT NULL,
  source_sha256 text NOT NULL,
  object_key text,
  review_state review_state NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE NULLS NOT DISTINCT (workspace_id, source_sha256, document_version),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(title)) > 0),
  CHECK (source_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE TABLE research_passages (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  passage_index integer NOT NULL CHECK (passage_index >= 0),
  passage_text text NOT NULL,
  passage_sha256 text NOT NULL,
  token_count integer CHECK (token_count IS NULL OR token_count >= 0),
  UNIQUE (workspace_id, id),
  UNIQUE (document_id, passage_index),
  FOREIGN KEY (workspace_id, document_id)
    REFERENCES research_documents(workspace_id, id),
  CHECK (length(trim(passage_text)) > 0),
  CHECK (passage_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE TABLE capture_protocols (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  protocol_key text NOT NULL,
  version text NOT NULL,
  contract jsonb NOT NULL,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (protocol_key, version),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK (
    (review_state IN ('approved', 'superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (review_state NOT IN ('approved', 'superseded') AND approved_by IS NULL AND approved_at IS NULL)
  )
);

CREATE TRIGGER capture_protocols_immutable_after_approval
BEFORE UPDATE OR DELETE ON capture_protocols
FOR EACH ROW EXECUTE FUNCTION reject_approved_scientific_record_mutation();

CREATE CONSTRAINT TRIGGER capture_protocols_require_independent_approval
AFTER INSERT OR UPDATE ON capture_protocols
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_independent_scientific_approval();

CREATE TABLE media_objects (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  object_key text NOT NULL,
  source_sha256 text NOT NULL,
  mime_type text NOT NULL,
  byte_length bigint NOT NULL CHECK (byte_length > 0),
  upload_state text NOT NULL DEFAULT 'pending',
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, object_key),
  UNIQUE (workspace_id, source_sha256, object_key),
  FOREIGN KEY (workspace_id, uploaded_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (upload_state IN ('pending', 'complete', 'quarantined', 'rejected')),
  CHECK ((upload_state = 'complete') = (completed_at IS NOT NULL))
);

CREATE TABLE phenotype_captures (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  material_id uuid NOT NULL,
  protocol_id uuid NOT NULL REFERENCES capture_protocols(id),
  media_object_id uuid NOT NULL,
  view_name text NOT NULL,
  capture_metadata jsonb NOT NULL,
  quality_state capture_quality_state NOT NULL,
  quality_detail jsonb NOT NULL,
  captured_at timestamptz NOT NULL,
  captured_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, media_object_id)
    REFERENCES media_objects(workspace_id, id),
  FOREIGN KEY (workspace_id, captured_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(view_name)) > 0)
);

CREATE TABLE observation_definitions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trait_id text NOT NULL,
  trait_version text NOT NULL,
  display_name text NOT NULL,
  value_contract jsonb NOT NULL,
  vocabulary_id text,
  review_state review_state NOT NULL DEFAULT 'draft',
  UNIQUE (trait_id, trait_version)
);

CREATE TABLE observations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  material_id uuid NOT NULL,
  definition_id uuid NOT NULL REFERENCES observation_definitions(id),
  current_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id)
);

CREATE TABLE observation_revisions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  observation_id uuid NOT NULL,
  method_id text NOT NULL,
  method_version text NOT NULL,
  value_payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL,
  supersedes_revision_id uuid,
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, observation_id)
    REFERENCES observations(workspace_id, id),
  FOREIGN KEY (workspace_id, recorded_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, supersedes_revision_id)
    REFERENCES observation_revisions(workspace_id, id),
  CHECK ((supersedes_revision_id IS NULL) = (correction_reason IS NULL)),
  CHECK (correction_reason IS NULL OR length(trim(correction_reason)) > 0)
);

ALTER TABLE observations
  ADD CONSTRAINT observations_current_revision_fk
  FOREIGN KEY (workspace_id, current_revision_id)
  REFERENCES observation_revisions(workspace_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE model_versions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  model_key text NOT NULL,
  version text NOT NULL,
  model_kind text NOT NULL,
  state model_state NOT NULL DEFAULT 'draft',
  artifact_object_key text,
  training_dataset_hash text,
  model_card jsonb NOT NULL,
  evaluation_report jsonb,
  promoted_by uuid,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (workspace_id, model_key, version),
  FOREIGN KEY (workspace_id, promoted_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (
    (state = 'validated' AND promoted_by IS NOT NULL AND promoted_at IS NOT NULL AND evaluation_report IS NOT NULL)
    OR state <> 'validated'
  )
);

CREATE OR REPLACE FUNCTION validate_observation_current_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM observation_revisions revision
    WHERE revision.workspace_id = NEW.workspace_id
      AND revision.id = NEW.current_revision_id
      AND revision.observation_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'current observation revision must belong to the same observation';
  END IF;
  RETURN NEW;
END
$$;

CREATE CONSTRAINT TRIGGER observations_validate_current_revision
AFTER INSERT OR UPDATE OF current_revision_id ON observations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_observation_current_revision();

CREATE OR REPLACE FUNCTION reject_observation_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'observation revisions are append-only; create a correction revision';
END
$$;

CREATE TRIGGER observation_revisions_append_only
BEFORE UPDATE OR DELETE ON observation_revisions
FOR EACH ROW EXECUTE FUNCTION reject_observation_revision_mutation();

DO $$
DECLARE
  table_name text;
  workspace_tables text[] := ARRAY[
    'jobs', 'job_attempts', 'job_logs', 'transactional_outbox',
    'research_documents', 'research_passages', 'media_objects',
    'phenotype_captures', 'observations', 'observation_revisions', 'model_versions'
  ];
BEGIN
  FOREACH table_name IN ARRAY workspace_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY workspace_isolation ON %I USING (workspace_id = app_current_workspace_id()) WITH CHECK (workspace_id = app_current_workspace_id())',
      table_name
    );
  END LOOP;
END
$$;

COMMIT;
