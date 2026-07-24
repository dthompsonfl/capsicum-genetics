BEGIN;

-- Observation-session terminal transitions must pass through one atomic authority.
CREATE OR REPLACE FUNCTION app_transition_observation_session(
  p_session_id uuid,
  p_transition text,
  p_expected_state_version integer,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(state text, state_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  current_session observation_sessions%ROWTYPE;
  next_state text;
BEGIN
  IF NOT app_workspace_access_allowed(workspace) THEN
    RAISE EXCEPTION 'active workspace membership required';
  END IF;
  SELECT * INTO current_session
  FROM observation_sessions
  WHERE workspace_id = workspace AND id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'observation session not found'; END IF;
  IF current_session.state_version <> p_expected_state_version THEN
    RAISE EXCEPTION 'stale observation session version';
  END IF;

  next_state := CASE p_transition
    WHEN 'open' THEN CASE WHEN current_session.state = 'planned' THEN 'open' END
    WHEN 'pause' THEN CASE WHEN current_session.state IN ('open','reopened') THEN 'paused' END
    WHEN 'resume' THEN CASE WHEN current_session.state = 'paused' THEN 'open' END
    WHEN 'close' THEN CASE WHEN current_session.state IN ('open','paused','reopened') THEN 'closed' END
    WHEN 'reopen' THEN CASE WHEN current_session.state = 'closed' THEN 'reopened' END
    WHEN 'cancel' THEN CASE WHEN current_session.state IN ('planned','open','paused','reopened') THEN 'cancelled' END
    ELSE NULL
  END;
  IF next_state IS NULL THEN
    RAISE EXCEPTION 'illegal observation session transition from % through %', current_session.state, p_transition;
  END IF;
  IF p_transition = 'reopen' AND app_current_membership_role() NOT IN ('owner','administrator','scientific_reviewer') THEN
    RAISE EXCEPTION 'reopening a closed observation session requires elevated authority';
  END IF;
  IF p_transition IN ('reopen','cancel') AND length(trim(COALESCE(p_reason, ''))) < 2 THEN
    RAISE EXCEPTION 'reopen and cancellation transitions require a reason';
  END IF;

  UPDATE observation_sessions
  SET state = next_state,
      state_version = current_session.state_version + 1,
      paused_by = CASE WHEN next_state = 'paused' THEN actor ELSE paused_by END,
      paused_at = CASE WHEN next_state = 'paused' THEN clock_timestamp() ELSE paused_at END,
      closed_by = CASE WHEN next_state = 'closed' THEN actor ELSE closed_by END,
      closed_at = CASE WHEN next_state = 'closed' THEN clock_timestamp() ELSE closed_at END,
      reopened_by = CASE WHEN next_state = 'reopened' THEN actor ELSE reopened_by END,
      reopened_at = CASE WHEN next_state = 'reopened' THEN clock_timestamp() ELSE reopened_at END,
      cancelled_by = CASE WHEN next_state = 'cancelled' THEN actor ELSE cancelled_by END,
      cancelled_at = CASE WHEN next_state = 'cancelled' THEN clock_timestamp() ELSE cancelled_at END
  WHERE workspace_id = workspace AND id = p_session_id;

  RETURN QUERY SELECT next_state, current_session.state_version + 1;
END
$$;

CREATE OR REPLACE FUNCTION guard_observation_session_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app_is_runtime_session()
     AND (NEW.state IS DISTINCT FROM OLD.state OR NEW.state_version IS DISTINCT FROM OLD.state_version) THEN
    RAISE EXCEPTION 'observation session transitions require canonical authority';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER observation_sessions_runtime_authority
BEFORE UPDATE OF state, state_version ON observation_sessions
FOR EACH ROW EXECUTE FUNCTION guard_observation_session_authority();

REVOKE UPDATE (state, state_version, paused_by, paused_at, closed_by, closed_at, reopened_by, reopened_at, cancelled_by, cancelled_at)
  ON observation_sessions FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_transition_observation_session(uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_transition_observation_session(uuid,text,integer,text) TO capsicum_runtime;

-- Historical simulation snapshots and final artifacts are immutable to the web role.
CREATE OR REPLACE FUNCTION reject_simulation_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'simulation snapshots are immutable; create a new simulation run';
END
$$;
CREATE TRIGGER simulation_runs_immutable_v3
BEFORE UPDATE OR DELETE ON simulation_runs
FOR EACH ROW EXECUTE FUNCTION reject_simulation_run_mutation();
REVOKE UPDATE, DELETE ON simulation_runs FROM capsicum_runtime;

-- A finalized genotype call cannot be directly inserted as a non-current historical
-- branch. Runtime callers must append exactly one successor to the locked current call.
CREATE OR REPLACE FUNCTION validate_genotype_call_linearity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_call genotype_calls%ROWTYPE;
BEGIN
  SELECT * INTO current_call
  FROM genotype_calls
  WHERE workspace_id = NEW.workspace_id
    AND material_id = NEW.material_id
    AND locus_catalog_id = NEW.locus_catalog_id
    AND is_current
  FOR UPDATE;
  IF current_call.id IS NULL THEN
    IF NEW.supersedes_call_id IS NOT NULL OR NEW.call_version <> 1 THEN
      RAISE EXCEPTION 'initial genotype call must be version 1 without a predecessor';
    END IF;
  ELSE
    IF NEW.supersedes_call_id IS DISTINCT FROM current_call.id THEN
      RAISE EXCEPTION 'stale genotype correction; predecessor is not current';
    END IF;
    IF NEW.call_version <> current_call.call_version + 1 THEN
      RAISE EXCEPTION 'genotype call version must increment current version by one';
    END IF;
    UPDATE genotype_calls SET is_current = false
    WHERE workspace_id = current_call.workspace_id AND id = current_call.id;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER genotype_calls_validate_linearity
BEFORE INSERT ON genotype_calls
FOR EACH ROW EXECUTE FUNCTION validate_genotype_call_linearity();

-- Deterministic label payloads are immutable evidence. A QR is a locator only; the
-- workspace-scoped database lookup remains authoritative.
CREATE OR REPLACE FUNCTION app_resolve_material_label(p_label_code text)
RETURNS TABLE(material_id uuid, material_code text, kind text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT material.id, material.material_code, material.kind::text, material.status::text
  FROM material_labels label
  JOIN biological_materials material
    ON material.workspace_id = label.workspace_id AND material.id = label.material_id
  WHERE label.workspace_id = app_current_workspace_id()
    AND label.label_code = p_label_code
    AND label.revoked_at IS NULL
    AND app_workspace_access_allowed(label.workspace_id)
$$;
REVOKE ALL ON FUNCTION app_resolve_material_label(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_material_label(text) TO capsicum_runtime;

COMMIT;
