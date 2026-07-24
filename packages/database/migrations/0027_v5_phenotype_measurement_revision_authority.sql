BEGIN;

CREATE OR REPLACE FUNCTION guard_phenotype_measurement_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  authority text := current_setting('app.authority_function', true);
  referenced_revision phenotype_measurement_revisions%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'phenotype measurements are immutable and cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF authority IS DISTINCT FROM 'phenotype_measurement_worker_completion' THEN
      RAISE EXCEPTION 'phenotype measurements may only be created by the deterministic worker authority';
    END IF;
    IF NEW.current_revision_id IS NOT NULL THEN
      RAISE EXCEPTION 'initial phenotype measurement must be bound to its first revision atomically after insert';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'current_revision_id') IS DISTINCT FROM (to_jsonb(OLD) - 'current_revision_id') THEN
    RAISE EXCEPTION 'phenotype measurement scientific identity and machine result are immutable';
  END IF;
  IF NEW.current_revision_id IS NOT DISTINCT FROM OLD.current_revision_id THEN
    RETURN NEW;
  END IF;
  IF authority NOT IN ('phenotype_measurement_worker_completion', 'phenotype_measurement_correction') THEN
    RAISE EXCEPTION 'phenotype measurement revision may only change through canonical authority';
  END IF;
  IF authority = 'phenotype_measurement_worker_completion' AND OLD.current_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'worker authority may only initialize the first phenotype measurement revision';
  END IF;
  IF authority = 'phenotype_measurement_correction' AND OLD.current_revision_id IS NULL THEN
    RAISE EXCEPTION 'measurement correction requires an initialized predecessor revision';
  END IF;
  SELECT * INTO referenced_revision
  FROM phenotype_measurement_revisions
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.current_revision_id
    AND measurement_id = NEW.id;
  IF referenced_revision.id IS NULL THEN
    RAISE EXCEPTION 'current phenotype measurement revision must belong to the same measurement';
  END IF;
  IF authority = 'phenotype_measurement_worker_completion'
     AND (referenced_revision.revision <> 1 OR referenced_revision.supersedes_revision_id IS NOT NULL) THEN
    RAISE EXCEPTION 'worker authority must initialize revision one without a predecessor';
  END IF;
  IF authority = 'phenotype_measurement_correction'
     AND referenced_revision.supersedes_revision_id IS DISTINCT FROM OLD.current_revision_id THEN
    RAISE EXCEPTION 'phenotype measurement correction must linearly supersede the current revision';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS phenotype_measurements_authority_guard ON phenotype_measurements;
CREATE TRIGGER phenotype_measurements_authority_guard
BEFORE INSERT OR UPDATE OR DELETE ON phenotype_measurements
FOR EACH ROW EXECUTE FUNCTION guard_phenotype_measurement_authority();

CREATE OR REPLACE FUNCTION guard_phenotype_measurement_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  authority text := current_setting('app.authority_function', true);
  measurement phenotype_measurements%ROWTYPE;
  capture phenotype_captures%ROWTYPE;
  predecessor phenotype_measurement_revisions%ROWTYPE;
BEGIN
  IF authority NOT IN ('phenotype_measurement_worker_completion', 'phenotype_measurement_correction') THEN
    RAISE EXCEPTION 'phenotype measurement revisions may only be created through canonical authority';
  END IF;
  SELECT * INTO measurement FROM phenotype_measurements
  WHERE workspace_id = NEW.workspace_id AND id = NEW.measurement_id FOR SHARE;
  IF measurement.id IS NULL THEN
    RAISE EXCEPTION 'phenotype measurement revision requires an existing measurement';
  END IF;
  IF authority = 'phenotype_measurement_worker_completion' THEN
    SELECT * INTO capture FROM phenotype_captures
    WHERE workspace_id = measurement.workspace_id AND id = measurement.capture_id FOR SHARE;
    IF NEW.revision <> 1 OR NEW.supersedes_revision_id IS NOT NULL
       OR NEW.corrected_by IS DISTINCT FROM capture.captured_by
       OR measurement.current_revision_id IS NOT NULL THEN
      RAISE EXCEPTION 'initial machine measurement revision is inconsistent with its capture authority';
    END IF;
  ELSE
    IF NEW.corrected_by IS DISTINCT FROM app_current_actor_user_id() THEN
      RAISE EXCEPTION 'measurement correction actor must match the authenticated actor';
    END IF;
    IF NEW.supersedes_revision_id IS DISTINCT FROM measurement.current_revision_id THEN
      RAISE EXCEPTION 'measurement correction predecessor is stale';
    END IF;
    SELECT * INTO predecessor FROM phenotype_measurement_revisions
    WHERE workspace_id = NEW.workspace_id AND id = NEW.supersedes_revision_id
      AND measurement_id = NEW.measurement_id FOR SHARE;
    IF predecessor.id IS NULL OR NEW.revision <> predecessor.revision + 1 THEN
      RAISE EXCEPTION 'measurement correction revision must linearly follow the current predecessor';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS phenotype_measurement_revisions_insert_guard ON phenotype_measurement_revisions;
CREATE TRIGGER phenotype_measurement_revisions_insert_guard
BEFORE INSERT ON phenotype_measurement_revisions
FOR EACH ROW EXECUTE FUNCTION guard_phenotype_measurement_revision_insert();

CREATE OR REPLACE FUNCTION app_correct_phenotype_measurement(
  p_measurement_id uuid,
  p_expected_current_revision_id uuid,
  p_value_payload jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  actor_id uuid := app_current_actor_user_id();
  current_workspace_id uuid := app_current_workspace_id();
  actor_role text;
  measurement phenotype_measurements%ROWTYPE;
  current_revision phenotype_measurement_revisions%ROWTYPE;
  next_revision_id uuid := uuidv7();
  next_revision integer;
BEGIN
  IF actor_id IS NULL OR current_workspace_id IS NULL THEN
    RAISE EXCEPTION 'authenticated workspace context is required';
  END IF;
  SELECT role::text INTO actor_role
  FROM workspace_memberships
  WHERE workspace_id = app_current_workspace_id()
    AND user_id = app_current_actor_user_id()
    AND state = 'active';
  IF actor_role IS NULL OR actor_role NOT IN ('owner','breeder','technician','administrator') THEN
    RAISE EXCEPTION 'active observation-writer membership is required';
  END IF;
  IF jsonb_typeof(p_value_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'corrected measurement value must be a JSON object';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 10 OR length(p_reason) > 4000 THEN
    RAISE EXCEPTION 'measurement correction reason must contain 10 to 4000 characters';
  END IF;

  SELECT * INTO measurement
  FROM phenotype_measurements
  WHERE workspace_id = app_current_workspace_id() AND id = p_measurement_id
  FOR UPDATE;
  IF measurement.id IS NULL THEN
    RAISE EXCEPTION 'phenotype measurement was not found';
  END IF;
  IF measurement.current_revision_id IS DISTINCT FROM p_expected_current_revision_id THEN
    RAISE EXCEPTION 'phenotype measurement revision is stale';
  END IF;
  SELECT * INTO current_revision
  FROM phenotype_measurement_revisions
  WHERE workspace_id = measurement.workspace_id
    AND id = measurement.current_revision_id
    AND measurement_id = measurement.id
  FOR UPDATE;
  IF current_revision.id IS NULL THEN
    RAISE EXCEPTION 'phenotype measurement current revision is missing';
  END IF;

  next_revision := current_revision.revision + 1;
  PERFORM set_config('app.authority_function', 'phenotype_measurement_correction', true);
  INSERT INTO phenotype_measurement_revisions(
    id, workspace_id, measurement_id, revision, value_payload, reason,
    supersedes_revision_id, corrected_by
  ) VALUES (
    next_revision_id, measurement.workspace_id, measurement.id, next_revision,
    p_value_payload, trim(p_reason), current_revision.id, actor_id
  );
  UPDATE phenotype_measurements
  SET current_revision_id = next_revision_id
  WHERE workspace_id = measurement.workspace_id AND id = measurement.id;

  INSERT INTO audit_events(
    workspace_id, actor_user_id, action, entity_type, entity_id,
    before_state, after_state, request_id
  ) VALUES (
    measurement.workspace_id, actor_id, 'phenotype.measurement.corrected',
    'phenotype_measurement', measurement.id,
    jsonb_build_object('revisionId', current_revision.id, 'revision', current_revision.revision, 'valuePayload', current_revision.value_payload),
    jsonb_build_object('revisionId', next_revision_id, 'revision', next_revision, 'valuePayload', p_value_payload, 'reason', trim(p_reason)),
    current_setting('app.request_id', true)
  );
  RETURN jsonb_build_object(
    'measurementId', measurement.id,
    'captureId', measurement.capture_id,
    'revisionId', next_revision_id,
    'revision', next_revision
  );
END
$$;

REVOKE INSERT, UPDATE, DELETE ON phenotype_measurements, phenotype_measurement_revisions FROM capsicum_runtime, capsicum_worker;
GRANT SELECT ON phenotype_measurements, phenotype_measurement_revisions TO capsicum_runtime;
REVOKE ALL ON FUNCTION app_correct_phenotype_measurement(uuid,uuid,jsonb,text) FROM PUBLIC, capsicum_worker;
GRANT EXECUTE ON FUNCTION app_correct_phenotype_measurement(uuid,uuid,jsonb,text) TO capsicum_runtime;
REVOKE ALL ON FUNCTION guard_phenotype_measurement_authority() FROM PUBLIC, capsicum_runtime, capsicum_worker;
REVOKE ALL ON FUNCTION guard_phenotype_measurement_revision_insert() FROM PUBLIC, capsicum_runtime, capsicum_worker;

COMMIT;
