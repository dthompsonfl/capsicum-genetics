BEGIN;

ALTER TABLE selection_plans
  ADD COLUMN status_version integer NOT NULL DEFAULT 1 CHECK (status_version > 0),
  ADD COLUMN activated_by uuid,
  ADD COLUMN activated_at timestamptz,
  ADD COLUMN completed_by uuid,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN cancelled_by uuid,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN terminal_reason text;

-- Preserve V3 data without pretending that legacy lifecycle actions had richer
-- evidence than was actually recorded. Existing approved actor/time fields are
-- reused only as migration provenance for states that V3 already permitted.
ALTER TABLE selection_plans DISABLE TRIGGER selection_plans_terminal_immutable;
UPDATE selection_plans
SET activated_by = approved_by,
    activated_at = approved_at
WHERE status IN ('active', 'completed');
UPDATE selection_plans
SET completed_by = approved_by,
    completed_at = approved_at,
    terminal_reason = 'Legacy V3 completion; detailed outcome was not recorded.'
WHERE status = 'completed';
UPDATE selection_plans
SET cancelled_by = COALESCE(approved_by, created_by),
    cancelled_at = COALESCE(approved_at, created_at),
    terminal_reason = 'Legacy V3 cancellation; detailed reason was not recorded.'
WHERE status = 'cancelled';
ALTER TABLE selection_plans ENABLE TRIGGER selection_plans_terminal_immutable;

ALTER TABLE selection_plans
  ADD CONSTRAINT selection_plans_activated_by_fk
    FOREIGN KEY (workspace_id, activated_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT selection_plans_completed_by_fk
    FOREIGN KEY (workspace_id, completed_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT selection_plans_cancelled_by_fk
    FOREIGN KEY (workspace_id, cancelled_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT selection_plans_lifecycle_consistency CHECK (
    (status = 'draft' AND approved_by IS NULL AND approved_at IS NULL
      AND activated_by IS NULL AND activated_at IS NULL
      AND completed_by IS NULL AND completed_at IS NULL
      AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND activated_by IS NULL AND activated_at IS NULL
      AND completed_by IS NULL AND completed_at IS NULL
      AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'active' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND activated_by IS NOT NULL AND activated_at IS NOT NULL
      AND completed_by IS NULL AND completed_at IS NULL
      AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'completed' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND activated_by IS NOT NULL AND activated_at IS NOT NULL
      AND completed_by IS NOT NULL AND completed_at IS NOT NULL
      AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL
      AND completed_by IS NULL AND completed_at IS NULL)
  ),
  ADD CONSTRAINT selection_plans_terminal_reason_check CHECK (
    (status IN ('completed', 'cancelled')) = (terminal_reason IS NOT NULL AND length(trim(terminal_reason)) >= 3)
  );

CREATE TABLE selection_plan_transitions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  selection_plan_id uuid NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  from_version integer NOT NULL CHECK (from_version > 0),
  to_version integer NOT NULL CHECK (to_version = from_version + 1),
  actor_user_id uuid NOT NULL,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, selection_plan_id, to_version),
  FOREIGN KEY (workspace_id, selection_plan_id) REFERENCES selection_plans(workspace_id, id),
  FOREIGN KEY (workspace_id, actor_user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (from_status IN ('draft','approved','active','completed','cancelled')),
  CHECK (to_status IN ('approved','active','completed','cancelled')),
  CHECK (to_status NOT IN ('completed','cancelled') OR (reason IS NOT NULL AND length(trim(reason)) >= 3))
);

ALTER TABLE selection_plan_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_plan_transitions FORCE ROW LEVEL SECURITY;
CREATE POLICY selection_plan_transitions_workspace_isolation ON selection_plan_transitions
  USING (app_workspace_access_allowed(workspace_id))
  WITH CHECK (app_workspace_access_allowed(workspace_id));

CREATE OR REPLACE FUNCTION reject_selection_plan_transition_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'selection plan transition history is append-only';
END
$$;
CREATE TRIGGER selection_plan_transitions_append_only
BEFORE UPDATE OR DELETE ON selection_plan_transitions
FOR EACH ROW EXECUTE FUNCTION reject_selection_plan_transition_mutation();

CREATE OR REPLACE FUNCTION app_transition_selection_plan(
  p_plan_id uuid,
  p_expected_version integer,
  p_to_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  plan_record selection_plans%ROWTYPE;
  actor_id uuid;
  actor_role membership_role;
  normalized_reason text;
BEGIN
  actor_id := app_current_actor_user_id();
  actor_role := app_current_membership_role();
  IF actor_id IS NULL OR actor_role IS NULL THEN
    RAISE EXCEPTION 'selection plan transition requires an active authenticated membership';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'selection plan expected version is required';
  END IF;
  IF p_to_status NOT IN ('approved','active','completed','cancelled') THEN
    RAISE EXCEPTION 'unsupported selection plan target status';
  END IF;
  normalized_reason := NULLIF(trim(COALESCE(p_reason, '')), '');

  SELECT * INTO plan_record
  FROM selection_plans
  WHERE workspace_id = app_current_workspace_id() AND id = p_plan_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selection plan not found';
  END IF;
  IF plan_record.status_version <> p_expected_version THEN
    RAISE EXCEPTION 'selection plan version conflict';
  END IF;
  IF plan_record.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'terminal selection plan cannot transition';
  END IF;

  IF p_to_status = 'approved' THEN
    IF plan_record.status <> 'draft' THEN RAISE EXCEPTION 'only draft selection plans may be approved'; END IF;
    IF actor_role NOT IN ('owner','scientific_reviewer') THEN
      RAISE EXCEPTION 'selection plan approval requires owner or scientific_reviewer';
    END IF;
    IF actor_id = plan_record.created_by THEN
      RAISE EXCEPTION 'selection plan author cannot approve their own plan';
    END IF;
  ELSIF p_to_status = 'active' THEN
    IF plan_record.status <> 'approved' THEN RAISE EXCEPTION 'only approved selection plans may be activated'; END IF;
    IF actor_role NOT IN ('owner','administrator','breeder') THEN
      RAISE EXCEPTION 'selection plan activation requires owner, administrator, or breeder';
    END IF;
  ELSIF p_to_status = 'completed' THEN
    IF plan_record.status <> 'active' THEN RAISE EXCEPTION 'only active selection plans may be completed'; END IF;
    IF actor_role NOT IN ('owner','administrator','breeder') THEN
      RAISE EXCEPTION 'selection plan completion requires owner, administrator, or breeder';
    END IF;
    IF normalized_reason IS NULL OR length(normalized_reason) < 3 THEN
      RAISE EXCEPTION 'selection plan completion requires a reason or outcome summary';
    END IF;
  ELSIF p_to_status = 'cancelled' THEN
    IF plan_record.status NOT IN ('draft','approved','active') THEN RAISE EXCEPTION 'selection plan cannot be cancelled from its current state'; END IF;
    IF actor_role NOT IN ('owner','administrator','breeder') THEN
      RAISE EXCEPTION 'selection plan cancellation requires owner, administrator, or breeder';
    END IF;
    IF normalized_reason IS NULL OR length(normalized_reason) < 3 THEN
      RAISE EXCEPTION 'selection plan cancellation requires a reason';
    END IF;
  END IF;

  PERFORM set_config('app.selection_plan_transition', 'on', true);
  UPDATE selection_plans
  SET status = p_to_status,
      status_version = status_version + 1,
      approved_by = CASE WHEN p_to_status = 'approved' THEN actor_id ELSE approved_by END,
      approved_at = CASE WHEN p_to_status = 'approved' THEN clock_timestamp() ELSE approved_at END,
      activated_by = CASE WHEN p_to_status = 'active' THEN actor_id ELSE activated_by END,
      activated_at = CASE WHEN p_to_status = 'active' THEN clock_timestamp() ELSE activated_at END,
      completed_by = CASE WHEN p_to_status = 'completed' THEN actor_id ELSE completed_by END,
      completed_at = CASE WHEN p_to_status = 'completed' THEN clock_timestamp() ELSE completed_at END,
      cancelled_by = CASE WHEN p_to_status = 'cancelled' THEN actor_id ELSE cancelled_by END,
      cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN clock_timestamp() ELSE cancelled_at END,
      terminal_reason = CASE WHEN p_to_status IN ('completed','cancelled') THEN normalized_reason ELSE terminal_reason END
  WHERE workspace_id = plan_record.workspace_id AND id = plan_record.id;

  INSERT INTO selection_plan_transitions(
    workspace_id, selection_plan_id, from_status, to_status,
    from_version, to_version, actor_user_id, reason
  ) VALUES (
    plan_record.workspace_id, plan_record.id, plan_record.status, p_to_status,
    plan_record.status_version, plan_record.status_version + 1, actor_id, normalized_reason
  );

  RETURN jsonb_build_object(
    'selectionPlanId', plan_record.id,
    'fromStatus', plan_record.status,
    'toStatus', p_to_status,
    'statusVersion', plan_record.status_version + 1
  );
END
$$;

CREATE OR REPLACE FUNCTION guard_selection_plan_terminal_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.selection_plan_transition', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'terminal selection plans are immutable';
  END IF;
  IF ROW(
    NEW.status, NEW.status_version, NEW.approved_by, NEW.approved_at,
    NEW.activated_by, NEW.activated_at, NEW.completed_by, NEW.completed_at,
    NEW.cancelled_by, NEW.cancelled_at, NEW.terminal_reason
  ) IS DISTINCT FROM ROW(
    OLD.status, OLD.status_version, OLD.approved_by, OLD.approved_at,
    OLD.activated_by, OLD.activated_at, OLD.completed_by, OLD.completed_at,
    OLD.cancelled_by, OLD.cancelled_at, OLD.terminal_reason
  ) THEN
    RAISE EXCEPTION 'selection plan lifecycle may only change through app_transition_selection_plan';
  END IF;
  RETURN NEW;
END
$$;

REVOKE INSERT, UPDATE, DELETE ON selection_plan_transitions FROM capsicum_runtime;
GRANT SELECT ON selection_plan_transitions TO capsicum_runtime;
REVOKE UPDATE ON selection_plans FROM capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_transition_selection_plan(uuid, integer, text, text) TO capsicum_runtime;
REVOKE ALL ON FUNCTION app_transition_selection_plan(uuid, integer, text, text) FROM PUBLIC;

COMMIT;
