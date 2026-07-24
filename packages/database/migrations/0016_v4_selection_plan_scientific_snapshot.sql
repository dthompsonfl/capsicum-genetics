BEGIN;

ALTER TABLE selection_plans
  ADD COLUMN target_expression jsonb,
  ADD COLUMN target_model text,
  ADD COLUMN target_model_version text,
  ADD COLUMN scenario_type text,
  ADD COLUMN confidence numeric(8,7),
  ADD COLUMN probability_basis jsonb,
  ADD COLUMN population_calculation jsonb,
  ADD COLUMN assumptions jsonb,
  ADD COLUMN generation_plan jsonb,
  ADD COLUMN originating_simulation_model_version text,
  ADD COLUMN originating_simulation_content_hash text;

UPDATE selection_plans plan
SET target_expression = jsonb_build_object('description', plan.target_description),
    target_model = 'capsicum.selection-target',
    target_model_version = '1.0.0',
    scenario_type = 'f1',
    confidence = 0.95,
    probability_basis = jsonb_build_object(
      'simulationRunId', plan.simulation_run_id,
      'legacyBackfill', true,
      'guarantee', false
    ),
    population_calculation = jsonb_build_object(
      'plannedPopulation', plan.planned_population,
      'legacyBackfill', true,
      'guarantee', false
    ),
    assumptions = COALESCE(run.assumptions, '[]'::jsonb),
    generation_plan = '[]'::jsonb,
    originating_simulation_model_version = run.model_version,
    originating_simulation_content_hash = run.content_hash
FROM simulation_runs run
WHERE run.workspace_id = plan.workspace_id
  AND run.id = plan.simulation_run_id;

ALTER TABLE selection_plans
  ALTER COLUMN target_expression SET NOT NULL,
  ALTER COLUMN target_model SET NOT NULL,
  ALTER COLUMN target_model_version SET NOT NULL,
  ALTER COLUMN scenario_type SET NOT NULL,
  ALTER COLUMN confidence SET NOT NULL,
  ALTER COLUMN probability_basis SET NOT NULL,
  ALTER COLUMN population_calculation SET NOT NULL,
  ALTER COLUMN assumptions SET NOT NULL,
  ALTER COLUMN generation_plan SET NOT NULL,
  ALTER COLUMN originating_simulation_model_version SET NOT NULL,
  ALTER COLUMN originating_simulation_content_hash SET NOT NULL,
  ADD CONSTRAINT selection_plans_scenario_type_check CHECK (
    scenario_type IN ('f1','f2_self','backcross_maternal','backcross_paternal','reciprocal','multi_generation')
  ),
  ADD CONSTRAINT selection_plans_confidence_check CHECK (confidence > 0 AND confidence < 1),
  ADD CONSTRAINT selection_plans_target_model_check CHECK (
    length(trim(target_model)) > 0 AND length(trim(target_model_version)) > 0
  ),
  ADD CONSTRAINT selection_plans_simulation_hash_check CHECK (
    originating_simulation_content_hash ~ '^[a-f0-9]{64}$'
  ),
  ADD CONSTRAINT selection_plans_probability_not_guarantee_check CHECK (
    COALESCE((probability_basis->>'guarantee')::boolean, false) = false
    AND COALESCE((population_calculation->>'guarantee')::boolean, false) = false
  );

CREATE OR REPLACE FUNCTION reject_selection_plan_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.workspace_id,
    NEW.simulation_run_id,
    NEW.target_description,
    NEW.target_expression,
    NEW.target_model,
    NEW.target_model_version,
    NEW.planned_population,
    NEW.scenario_type,
    NEW.confidence,
    NEW.probability_basis,
    NEW.population_calculation,
    NEW.assumptions,
    NEW.generation_plan,
    NEW.originating_simulation_model_version,
    NEW.originating_simulation_content_hash,
    NEW.created_by,
    NEW.created_at,
    NEW.idempotency_key
  ) IS DISTINCT FROM ROW(
    OLD.workspace_id,
    OLD.simulation_run_id,
    OLD.target_description,
    OLD.target_expression,
    OLD.target_model,
    OLD.target_model_version,
    OLD.planned_population,
    OLD.scenario_type,
    OLD.confidence,
    OLD.probability_basis,
    OLD.population_calculation,
    OLD.assumptions,
    OLD.generation_plan,
    OLD.originating_simulation_model_version,
    OLD.originating_simulation_content_hash,
    OLD.created_by,
    OLD.created_at,
    OLD.idempotency_key
  ) THEN
    RAISE EXCEPTION 'selection plan scientific snapshot is immutable; create a new plan version';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER selection_plans_snapshot_immutable
BEFORE UPDATE ON selection_plans
FOR EACH ROW EXECUTE FUNCTION reject_selection_plan_snapshot_mutation();

COMMIT;
