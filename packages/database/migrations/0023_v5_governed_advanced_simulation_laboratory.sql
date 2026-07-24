BEGIN;

CREATE TYPE simulation_request_state AS ENUM (
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'dead_letter'
);

CREATE TABLE simulation_requests (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  requested_by uuid NOT NULL,
  mode text NOT NULL,
  contract_version text NOT NULL,
  state simulation_request_state NOT NULL,
  catalog_release_id uuid REFERENCES catalog_releases(id),
  input_snapshot jsonb NOT NULL,
  input_hash text NOT NULL,
  model_type text NOT NULL,
  model_version text NOT NULL,
  engine_version text NOT NULL,
  calculation_authority simulation_calculation_authority NOT NULL,
  premise_authority simulation_premise_authority NOT NULL,
  interpretation_authority simulation_interpretation_authority NOT NULL,
  parent_direction jsonb NOT NULL,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  genotype_call_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  abstentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL,
  trace_id text NOT NULL,
  job_id uuid,
  simulation_run_id uuid,
  failure_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, requested_by, idempotency_key),
  FOREIGN KEY (workspace_id, requested_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, job_id)
    REFERENCES jobs(workspace_id, id),
  FOREIGN KEY (workspace_id, simulation_run_id)
    REFERENCES simulation_runs(workspace_id, id),
  CHECK (mode IN ('linked_two_locus','maternal_state','conditional_rule_graph','host_pathogen','direct_monte_carlo')),
  CHECK (length(trim(contract_version)) > 0),
  CHECK (length(trim(model_type)) > 0),
  CHECK (length(trim(model_version)) > 0),
  CHECK (length(trim(engine_version)) > 0),
  CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  CHECK (jsonb_typeof(parent_direction) = 'object'),
  CHECK (jsonb_typeof(evidence_ids) = 'array'),
  CHECK (jsonb_typeof(genotype_call_ids) = 'array'),
  CHECK (jsonb_typeof(assumptions) = 'array'),
  CHECK (jsonb_typeof(warnings) = 'array'),
  CHECK (jsonb_typeof(abstentions) = 'array'),
  CHECK ((state = 'completed') = (simulation_run_id IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK ((mode = 'direct_monte_carlo') = (job_id IS NOT NULL))
);
CREATE INDEX simulation_requests_workspace_time_idx
  ON simulation_requests(workspace_id, requested_at DESC, id DESC);
CREATE INDEX simulation_requests_job_idx
  ON simulation_requests(workspace_id, job_id) WHERE job_id IS NOT NULL;

ALTER TABLE simulation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY simulation_requests_active_membership
  ON simulation_requests
  USING (app_workspace_access_allowed(workspace_id))
  WITH CHECK (app_workspace_access_allowed(workspace_id));

CREATE OR REPLACE FUNCTION guard_simulation_request_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'simulation requests are immutable and cannot be deleted';
  END IF;
  IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
     OR OLD.requested_by IS DISTINCT FROM NEW.requested_by
     OR OLD.mode IS DISTINCT FROM NEW.mode
     OR OLD.contract_version IS DISTINCT FROM NEW.contract_version
     OR OLD.catalog_release_id IS DISTINCT FROM NEW.catalog_release_id
     OR OLD.input_snapshot IS DISTINCT FROM NEW.input_snapshot
     OR OLD.input_hash IS DISTINCT FROM NEW.input_hash
     OR OLD.model_type IS DISTINCT FROM NEW.model_type
     OR OLD.model_version IS DISTINCT FROM NEW.model_version
     OR OLD.engine_version IS DISTINCT FROM NEW.engine_version
     OR OLD.calculation_authority IS DISTINCT FROM NEW.calculation_authority
     OR OLD.premise_authority IS DISTINCT FROM NEW.premise_authority
     OR OLD.interpretation_authority IS DISTINCT FROM NEW.interpretation_authority
     OR OLD.parent_direction IS DISTINCT FROM NEW.parent_direction
     OR OLD.evidence_ids IS DISTINCT FROM NEW.evidence_ids
     OR OLD.genotype_call_ids IS DISTINCT FROM NEW.genotype_call_ids
     OR OLD.assumptions IS DISTINCT FROM NEW.assumptions
     OR OLD.warnings IS DISTINCT FROM NEW.warnings
     OR OLD.abstentions IS DISTINCT FROM NEW.abstentions
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.trace_id IS DISTINCT FROM NEW.trace_id
     OR OLD.job_id IS DISTINCT FROM NEW.job_id THEN
    RAISE EXCEPTION 'simulation request scientific identity and input snapshot are immutable';
  END IF;
  IF COALESCE(current_setting('app.authority_function', true), '') NOT IN (
    'simulation_worker_completion', 'simulation_job_state_sync'
  ) THEN
    RAISE EXCEPTION 'simulation request state may change only through canonical authority functions';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER simulation_requests_authority_guard
BEFORE UPDATE OR DELETE ON simulation_requests
FOR EACH ROW EXECUTE FUNCTION guard_simulation_request_authority();

CREATE OR REPLACE FUNCTION app_record_completed_advanced_simulation(
  p_request_id uuid,
  p_mode text,
  p_contract_version text,
  p_catalog_release_id uuid,
  p_input_snapshot jsonb,
  p_input_hash text,
  p_model_type text,
  p_model_version text,
  p_engine_version text,
  p_calculation_authority simulation_calculation_authority,
  p_premise_authority simulation_premise_authority,
  p_interpretation_authority simulation_interpretation_authority,
  p_parent_direction jsonb,
  p_evidence_ids jsonb,
  p_genotype_call_ids jsonb,
  p_result_payload jsonb,
  p_result_hash text,
  p_assumptions jsonb,
  p_warnings jsonb,
  p_abstentions jsonb,
  p_idempotency_key text,
  p_trace_id text,
  p_diagnostics jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  run_id uuid := uuidv7();
  legacy_authority scientific_authority;
BEGIN
  IF NOT app_workspace_access_allowed(workspace) THEN RAISE EXCEPTION 'active workspace membership is required'; END IF;
  IF app_current_membership_role() NOT IN ('owner','administrator','breeder','scientific_reviewer') THEN
    RAISE EXCEPTION 'simulation authority is required';
  END IF;
  IF p_mode NOT IN ('linked_two_locus','maternal_state','conditional_rule_graph','host_pathogen') THEN
    RAISE EXCEPTION 'unsupported synchronous advanced simulation mode';
  END IF;
  IF p_input_hash !~ '^[a-f0-9]{64}$' OR p_result_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'simulation hashes must be lowercase SHA-256';
  END IF;
  IF p_catalog_release_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM catalog_releases release
    WHERE release.id = p_catalog_release_id AND release.state = 'approved' AND release.published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'catalog release is not approved and published';
  END IF;
  legacy_authority := CASE
    WHEN p_calculation_authority = 'exact'
      AND p_premise_authority = 'verified'
      AND p_interpretation_authority IN ('genotype_only','conditional_phenotype')
      THEN CASE WHEN p_interpretation_authority = 'conditional_phenotype' THEN 'conditional_supported'::scientific_authority ELSE 'exact_supported'::scientific_authority END
    WHEN p_interpretation_authority = 'conditional_phenotype' THEN 'hypothesis_only'::scientific_authority
    ELSE 'unsupported'::scientific_authority
  END;
  INSERT INTO simulation_runs(
    id, workspace_id, created_by, model_type, model_version, catalog_release_id,
    authority, normalized_input, result_payload, assumptions, warnings, abstentions,
    content_hash, completed_at, calculation_authority, premise_authority,
    interpretation_authority, engine_version, input_hash, parent_direction,
    evidence_ids, genotype_call_ids, diagnostics
  ) VALUES (
    run_id, workspace, actor, p_model_type, p_model_version, p_catalog_release_id,
    legacy_authority, p_input_snapshot, p_result_payload, p_assumptions, p_warnings, p_abstentions,
    p_result_hash, now(), p_calculation_authority, p_premise_authority,
    p_interpretation_authority, p_engine_version, p_input_hash, p_parent_direction,
    p_evidence_ids, p_genotype_call_ids, p_diagnostics
  );
  INSERT INTO simulation_requests(
    id, workspace_id, requested_by, mode, contract_version, state, catalog_release_id,
    input_snapshot, input_hash, model_type, model_version, engine_version,
    calculation_authority, premise_authority, interpretation_authority,
    parent_direction, evidence_ids, genotype_call_ids, assumptions, warnings, abstentions,
    idempotency_key, trace_id, simulation_run_id, completed_at
  ) VALUES (
    p_request_id, workspace, actor, p_mode, p_contract_version, 'completed', p_catalog_release_id,
    p_input_snapshot, p_input_hash, p_model_type, p_model_version, p_engine_version,
    p_calculation_authority, p_premise_authority, p_interpretation_authority,
    p_parent_direction, p_evidence_ids, p_genotype_call_ids, p_assumptions, p_warnings, p_abstentions,
    p_idempotency_key, p_trace_id, run_id, now()
  );
  RETURN jsonb_build_object('requestId', p_request_id, 'simulationRunId', run_id, 'resultHash', p_result_hash);
END
$$;

CREATE OR REPLACE FUNCTION app_worker_complete_advanced_simulation(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb,
  p_result_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  request simulation_requests%ROWTYPE;
  run_id uuid := uuidv7();
  legacy_authority scientific_authority;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.job_type <> 'genetics.direct-inheritance-monte-carlo.v1'
     OR current_job.state NOT IN ('running','cancel_requested')
     OR current_job.lease_owner <> p_worker_id OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active advanced simulation lease';
  END IF;
  SELECT * INTO request FROM simulation_requests
  WHERE workspace_id = current_job.workspace_id AND job_id = current_job.id FOR UPDATE;
  IF request.id IS NULL OR request.state NOT IN ('queued','running') THEN
    RAISE EXCEPTION 'advanced simulation request is not completable';
  END IF;
  IF p_result_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'result hash must be lowercase SHA-256'; END IF;
  legacy_authority := 'unsupported'::scientific_authority;
  INSERT INTO simulation_runs(
    id, workspace_id, created_by, model_type, model_version, catalog_release_id,
    authority, normalized_input, result_payload, assumptions, warnings, abstentions,
    content_hash, completed_at, calculation_authority, premise_authority,
    interpretation_authority, engine_version, input_hash, parent_direction,
    evidence_ids, genotype_call_ids, random_seed, sample_count, diagnostics
  ) VALUES (
    run_id, request.workspace_id, request.requested_by, request.model_type, request.model_version,
    request.catalog_release_id, legacy_authority, request.input_snapshot, p_result,
    request.assumptions, request.warnings, request.abstentions, p_result_hash, now(),
    request.calculation_authority, request.premise_authority, request.interpretation_authority,
    request.engine_version, request.input_hash, request.parent_direction, request.evidence_ids,
    request.genotype_call_ids, p_result->>'seed', NULLIF(p_result->>'sampleCount','')::bigint,
    COALESCE(p_result->'diagnostics','{}'::jsonb)
  );
  PERFORM set_config('app.authority_function', 'simulation_worker_completion', true);
  UPDATE simulation_requests
  SET state = 'completed', simulation_run_id = run_id, completed_at = now(), failure_code = NULL
  WHERE workspace_id = request.workspace_id AND id = request.id;
  PERFORM app_complete_job(p_job_id, p_worker_id, jsonb_build_object(
    'requestId', request.id, 'simulationRunId', run_id, 'resultHash', p_result_hash
  ));
  RETURN jsonb_build_object('requestId', request.id, 'simulationRunId', run_id, 'resultHash', p_result_hash);
END
$$;

CREATE OR REPLACE FUNCTION sync_advanced_simulation_request_from_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.job_type <> 'genetics.direct-inheritance-monte-carlo.v1' OR NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  IF NEW.state IN ('running','failed','cancelled','dead_letter') THEN
    PERFORM set_config('app.authority_function', 'simulation_job_state_sync', true);
    UPDATE simulation_requests
    SET state = CASE NEW.state
      WHEN 'running' THEN 'running'::simulation_request_state
      WHEN 'failed' THEN 'failed'::simulation_request_state
      WHEN 'cancelled' THEN 'cancelled'::simulation_request_state
      WHEN 'dead_letter' THEN 'dead_letter'::simulation_request_state
    END,
    failure_code = CASE WHEN NEW.state IN ('failed','dead_letter') THEN NEW.last_error_code ELSE NULL END,
    completed_at = CASE WHEN NEW.state IN ('cancelled','dead_letter') THEN COALESCE(NEW.completed_at, now()) ELSE NULL END
    WHERE workspace_id = NEW.workspace_id AND job_id = NEW.id AND state <> 'completed';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jobs_sync_advanced_simulation_request
AFTER UPDATE OF state ON jobs
FOR EACH ROW EXECUTE FUNCTION sync_advanced_simulation_request_from_job();

INSERT INTO job_contracts(job_type, contract_version, worker_capability, payload_schema, result_schema, active)
VALUES (
  'genetics.direct-inheritance-monte-carlo.v1', '1.0.0', 'node.genetics.direct-monte-carlo',
  '{"type":"object","required":["requestId","maternalHypotheses","paternalHypotheses","seed","sampleCount"]}'::jsonb,
  '{"type":"object","required":["mode","seed","sampleCount","estimates","diagnostics"]}'::jsonb,
  true
)
ON CONFLICT (job_type, contract_version) DO UPDATE
SET worker_capability = EXCLUDED.worker_capability,
    payload_schema = EXCLUDED.payload_schema,
    result_schema = EXCLUDED.result_schema,
    active = true;

REVOKE ALL ON TABLE simulation_requests FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE simulation_requests TO capsicum_runtime;
GRANT SELECT ON TABLE simulation_requests TO capsicum_worker;
REVOKE ALL ON FUNCTION app_record_completed_advanced_simulation(uuid,text,text,uuid,jsonb,text,text,text,text,simulation_calculation_authority,simulation_premise_authority,simulation_interpretation_authority,jsonb,jsonb,jsonb,jsonb,text,jsonb,jsonb,jsonb,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_record_completed_advanced_simulation(uuid,text,text,uuid,jsonb,text,text,text,text,simulation_calculation_authority,simulation_premise_authority,simulation_interpretation_authority,jsonb,jsonb,jsonb,jsonb,text,jsonb,jsonb,jsonb,text,text,jsonb) TO capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_complete_advanced_simulation(uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_worker_complete_advanced_simulation(uuid,text,jsonb,text) TO capsicum_worker;

COMMIT;
