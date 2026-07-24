BEGIN;

CREATE TABLE selection_plan_reconciliations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  selection_plan_id uuid NOT NULL,
  selection_plan_status_version integer NOT NULL CHECK (selection_plan_status_version > 0),
  source_simulation_content_hash text NOT NULL CHECK (source_simulation_content_hash ~ '^[a-f0-9]{64}$'),
  categories jsonb NOT NULL,
  missing_count integer NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  method text NOT NULL CHECK (method IN ('exact_binomial','chi_square','insufficient_for_supported_test')),
  sample_size integer NOT NULL CHECK (sample_size >= 0),
  degrees_of_freedom integer,
  statistic double precision,
  infinite_statistic boolean NOT NULL DEFAULT false,
  p_value double precision,
  expected_counts jsonb NOT NULL,
  assumptions_met boolean NOT NULL,
  warnings jsonb NOT NULL,
  interpretation text NOT NULL,
  engine_version text NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  result_hash text NOT NULL CHECK (result_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, selection_plan_id, idempotency_key),
  UNIQUE (workspace_id, selection_plan_id, result_hash),
  FOREIGN KEY (workspace_id, selection_plan_id) REFERENCES selection_plans(workspace_id, id),
  FOREIGN KEY (workspace_id, created_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (jsonb_typeof(categories) = 'array' AND jsonb_array_length(categories) >= 2),
  CHECK (jsonb_typeof(expected_counts) = 'array'),
  CHECK (jsonb_typeof(warnings) = 'array'),
  CHECK (p_value IS NULL OR (p_value >= 0 AND p_value <= 1)),
  CHECK (method <> 'chi_square' OR (degrees_of_freedom IS NOT NULL AND (statistic IS NOT NULL OR infinite_statistic) AND p_value IS NOT NULL)),
  CHECK (method <> 'exact_binomial' OR p_value IS NOT NULL),
  CHECK (method <> 'insufficient_for_supported_test' OR (p_value IS NULL AND assumptions_met = false)),
  CHECK (NOT infinite_statistic OR statistic IS NULL)
);

ALTER TABLE selection_plan_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_plan_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY selection_plan_reconciliations_workspace_isolation ON selection_plan_reconciliations
  USING (app_workspace_access_allowed(workspace_id))
  WITH CHECK (app_workspace_access_allowed(workspace_id));

CREATE OR REPLACE FUNCTION reject_selection_plan_reconciliation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'observed segregation reconciliations are immutable; record a new analysis';
END
$$;
CREATE TRIGGER selection_plan_reconciliations_immutable
BEFORE UPDATE OR DELETE ON selection_plan_reconciliations
FOR EACH ROW EXECUTE FUNCTION reject_selection_plan_reconciliation_mutation();

GRANT SELECT, INSERT ON selection_plan_reconciliations TO capsicum_runtime;
REVOKE UPDATE, DELETE ON selection_plan_reconciliations FROM capsicum_runtime;

COMMIT;
