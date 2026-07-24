-- V3 biological identity and cross authority. Existing migrations remain immutable.
ALTER TYPE material_kind ADD VALUE IF NOT EXISTS 'derived_line';
ALTER TYPE material_kind ADD VALUE IF NOT EXISTS 'population';
ALTER TYPE material_kind ADD VALUE IF NOT EXISTS 'selection';

BEGIN;

CREATE TYPE cross_operational_state AS ENUM (
  'planned',
  'prepared',
  'pollinated',
  'fruit_set',
  'harvest_ready',
  'harvested',
  'failed',
  'closed'
);
CREATE TYPE cross_verification_state AS ENUM (
  'unknown',
  'process_documented',
  'isolation_evidence_recorded',
  'morphology_consistent_unconfirmed',
  'marker_confirmed',
  'genotype_confirmed',
  'conflicting',
  'failed'
);
CREATE TYPE cross_verification_method AS ENUM (
  'unknown',
  'process_documentation',
  'isolation_record',
  'morphology',
  'marker_assay',
  'genotype_assay',
  'conflict_review',
  'failure_review'
);
CREATE TYPE breeding_material_class AS ENUM (
  'controlled_cross_progeny',
  'selfed_progeny',
  'open_pollinated_progeny',
  'derived_line',
  'population',
  'selection'
);
CREATE TYPE inventory_allocation_mode AS ENUM ('consumed', 'reserved', 'documented_exception', 'uncertain_quantity');

ALTER TABLE crosses RENAME COLUMN status TO legacy_status;
ALTER TABLE crosses
  ADD COLUMN operational_state cross_operational_state,
  ADD COLUMN verification_state cross_verification_state NOT NULL DEFAULT 'unknown',
  ADD COLUMN current_verification_id uuid,
  ADD COLUMN harvested_at timestamptz;

UPDATE crosses
SET operational_state = CASE legacy_status::text
  WHEN 'planned' THEN 'planned'::cross_operational_state
  WHEN 'pollinated' THEN 'pollinated'::cross_operational_state
  -- Legacy "verified" was scientifically conflated. Preserve the event history but
  -- do not convert it into paternal-identity authority.
  WHEN 'verified' THEN 'pollinated'::cross_operational_state
  WHEN 'harvested' THEN 'harvested'::cross_operational_state
  WHEN 'failed' THEN 'failed'::cross_operational_state
  WHEN 'closed' THEN 'closed'::cross_operational_state
  ELSE 'planned'::cross_operational_state
END;
ALTER TABLE crosses ALTER COLUMN operational_state SET NOT NULL;

CREATE TABLE cross_verifications (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  cross_id uuid NOT NULL,
  verification_state cross_verification_state NOT NULL,
  method cross_verification_method NOT NULL,
  source_type text NOT NULL,
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(5,4),
  statement text NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, cross_id) REFERENCES crosses(workspace_id, id),
  FOREIGN KEY (workspace_id, recorded_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CHECK (jsonb_typeof(evidence_references) = 'array'),
  CHECK (length(trim(source_type)) > 0),
  CHECK (length(trim(statement)) > 0)
);

CREATE TABLE cross_verification_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  verification_id uuid NOT NULL,
  decision review_state NOT NULL,
  rationale text NOT NULL,
  reviewer_user_id uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, verification_id, reviewer_user_id),
  FOREIGN KEY (workspace_id, verification_id) REFERENCES cross_verifications(workspace_id, id),
  FOREIGN KEY (workspace_id, reviewer_user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
  CHECK (length(trim(rationale)) >= 10)
);

ALTER TABLE crosses
  ADD CONSTRAINT crosses_current_verification_fk
  FOREIGN KEY (workspace_id, current_verification_id)
  REFERENCES cross_verifications(workspace_id, id);

CREATE TABLE breeding_material_identities (
  material_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  material_class breeding_material_class NOT NULL,
  cross_id uuid,
  maternal_parent_material_id uuid,
  paternal_parent_material_id uuid,
  paternal_identity_known boolean NOT NULL DEFAULT false,
  pollination_method pollination_method,
  verification_state cross_verification_state NOT NULL DEFAULT 'unknown',
  generation_label text,
  selection_source_material_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id) REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, cross_id) REFERENCES crosses(workspace_id, id),
  FOREIGN KEY (workspace_id, maternal_parent_material_id) REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, paternal_parent_material_id) REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, selection_source_material_id) REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, created_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (generation_label IS NULL OR length(trim(generation_label)) > 0),
  CHECK (
    (pollination_method = 'controlled_cross' AND paternal_parent_material_id IS NOT NULL AND paternal_identity_known)
    OR (pollination_method = 'selfing' AND paternal_parent_material_id = maternal_parent_material_id AND paternal_identity_known)
    OR (pollination_method = 'open_pollination' AND paternal_parent_material_id IS NULL AND NOT paternal_identity_known)
    OR pollination_method IS NULL
  )
);

-- Backfill existing family identity without inventing genetic verification.
INSERT INTO breeding_material_identities(
  material_id, workspace_id, material_class, cross_id,
  maternal_parent_material_id, paternal_parent_material_id,
  paternal_identity_known, pollination_method, verification_state,
  generation_label, created_by
)
SELECT family.material_id, family.workspace_id,
       CASE cross_record.pollination_method
         WHEN 'controlled_cross' THEN 'controlled_cross_progeny'::breeding_material_class
         WHEN 'selfing' THEN 'selfed_progeny'::breeding_material_class
         ELSE 'open_pollinated_progeny'::breeding_material_class
       END,
       family.cross_id,
       cross_record.maternal_plant_id, cross_record.paternal_plant_id,
       cross_record.paternal_plant_id IS NOT NULL,
       cross_record.pollination_method, cross_record.verification_state,
       family.generation_label, material.created_by
FROM progeny_families family
JOIN crosses cross_record
  ON cross_record.workspace_id = family.workspace_id AND cross_record.id = family.cross_id
JOIN biological_materials material
  ON material.workspace_id = family.workspace_id AND material.id = family.material_id
ON CONFLICT (material_id) DO NOTHING;

ALTER TABLE seed_lots
  ALTER COLUMN accession_material_id DROP NOT NULL,
  ADD COLUMN derived_material_id uuid,
  ADD COLUMN source_seed_harvest_material_id uuid,
  ADD CONSTRAINT seed_lots_derived_material_fk
    FOREIGN KEY (workspace_id, derived_material_id)
    REFERENCES breeding_material_identities(workspace_id, material_id),
  ADD CONSTRAINT seed_lots_source_harvest_fk
    FOREIGN KEY (workspace_id, source_seed_harvest_material_id)
    REFERENCES seed_harvests(workspace_id, material_id);

-- Recover the V2 cross-derived seed-lot lineage from immutable origin edges.
WITH derived_seed_lots AS (
  SELECT DISTINCT ON (seed_lot.material_id)
         seed_lot.material_id AS seed_lot_id,
         family.material_id AS family_id,
         family.source_seed_harvest_material_id AS harvest_id
  FROM seed_lots seed_lot
  JOIN material_origin_events origin
    ON origin.workspace_id = seed_lot.workspace_id
   AND origin.material_id = seed_lot.material_id
   AND origin.event_type = 'seed_harvest'
  JOIN material_origin_parents parent
    ON parent.workspace_id = origin.workspace_id
   AND parent.origin_event_id = origin.id
   AND parent.parent_role = 'seed_harvest'
  JOIN progeny_families family
    ON family.workspace_id = seed_lot.workspace_id
   AND family.source_seed_harvest_material_id = parent.parent_material_id
  ORDER BY seed_lot.material_id, origin.occurred_at DESC, origin.id DESC
)
UPDATE seed_lots seed_lot
SET accession_material_id = NULL,
    derived_material_id = derived.family_id,
    source_seed_harvest_material_id = derived.harvest_id
FROM derived_seed_lots derived
WHERE seed_lot.material_id = derived.seed_lot_id;

ALTER TABLE seed_lots
  ADD CONSTRAINT seed_lots_identity_anchor_check
  CHECK (num_nonnulls(accession_material_id, derived_material_id) = 1),
  ADD CONSTRAINT seed_lots_derived_harvest_check
  CHECK (
    (derived_material_id IS NULL AND source_seed_harvest_material_id IS NULL)
    OR (derived_material_id IS NOT NULL AND source_seed_harvest_material_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION validate_seed_lot_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_accession uuid;
  source_derived uuid;
BEGIN
  IF NEW.source_lot_material_id IS NULL THEN RETURN NEW; END IF;
  SELECT accession_material_id, derived_material_id
  INTO source_accession, source_derived
  FROM seed_lots
  WHERE workspace_id = NEW.workspace_id AND material_id = NEW.source_lot_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'source seed lot does not exist in workspace'; END IF;
  IF NEW.accession_material_id IS DISTINCT FROM source_accession
     OR NEW.derived_material_id IS DISTINCT FROM source_derived THEN
    RAISE EXCEPTION 'source and derived seed lots must preserve the same biological identity anchor';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER seed_lots_validate_lineage
BEFORE INSERT OR UPDATE OF accession_material_id, derived_material_id, source_lot_material_id
ON seed_lots FOR EACH ROW EXECUTE FUNCTION validate_seed_lot_lineage();

ALTER TABLE cross_events DROP CONSTRAINT IF EXISTS cross_events_event_type_check;
ALTER TABLE cross_events DROP CONSTRAINT IF EXISTS cross_events_event_type_check1;
ALTER TABLE cross_events ADD CONSTRAINT cross_events_event_type_v3_check
  CHECK (event_type IN (
    'planned', 'prepared', 'pollinated', 'bagged', 'unbagged',
    'failed', 'fruit_set', 'harvest_ready', 'harvested', 'closed'
  ));

ALTER TABLE inventory_events DROP CONSTRAINT IF EXISTS inventory_events_event_type_check;
ALTER TABLE inventory_events ADD CONSTRAINT inventory_events_event_type_check
  CHECK (event_type IN (
    'received', 'adjustment', 'reservation', 'reservation_release', 'reservation_released',
    'planting', 'germination', 'loss', 'return', 'reconciliation',
    'sown', 'transferred', 'consumed', 'discarded', 'counted'
  ));

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  seed_lot_material_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  purpose text NOT NULL,
  state text NOT NULL DEFAULT 'active',
  reserved_by uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  consumed_at timestamptz,
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, seed_lot_material_id) REFERENCES seed_lots(workspace_id, material_id),
  FOREIGN KEY (workspace_id, reserved_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (state IN ('active', 'released', 'consumed')),
  CHECK ((state = 'released') = (released_at IS NOT NULL)),
  CHECK ((state = 'consumed') = (consumed_at IS NOT NULL)),
  CHECK (length(trim(purpose)) > 0)
);

CREATE TABLE plant_inventory_allocations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  plant_material_id uuid NOT NULL,
  seed_lot_material_id uuid NOT NULL,
  inventory_event_id uuid,
  reservation_id uuid,
  allocation_mode inventory_allocation_mode NOT NULL,
  quantity integer,
  exception_reason text,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, plant_material_id),
  FOREIGN KEY (workspace_id, plant_material_id) REFERENCES plants(workspace_id, material_id),
  FOREIGN KEY (workspace_id, seed_lot_material_id) REFERENCES seed_lots(workspace_id, material_id),
  FOREIGN KEY (workspace_id, inventory_event_id) REFERENCES inventory_events(workspace_id, id),
  FOREIGN KEY (workspace_id, reservation_id) REFERENCES inventory_reservations(workspace_id, id),
  FOREIGN KEY (workspace_id, recorded_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (quantity IS NULL OR quantity > 0),
  CHECK (
    (allocation_mode IN ('consumed', 'reserved') AND quantity IS NOT NULL AND exception_reason IS NULL)
    OR (allocation_mode IN ('documented_exception', 'uncertain_quantity') AND exception_reason IS NOT NULL)
  )
);

CREATE TABLE material_movements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  material_id uuid NOT NULL,
  from_location_id uuid,
  to_location_id uuid,
  moved_at timestamptz NOT NULL,
  reason text NOT NULL,
  moved_by uuid NOT NULL,
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, material_id) REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, from_location_id) REFERENCES material_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, to_location_id) REFERENCES material_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, moved_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (from_location_id IS DISTINCT FROM to_location_id),
  CHECK (length(trim(reason)) > 0)
);
CREATE INDEX material_movements_history_idx
  ON material_movements(workspace_id, material_id, moved_at DESC, id DESC);

CREATE TABLE material_current_locations (
  workspace_id uuid NOT NULL,
  material_id uuid NOT NULL,
  location_id uuid,
  movement_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id) REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, location_id) REFERENCES material_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, movement_id) REFERENCES material_movements(workspace_id, id)
);

CREATE TABLE label_generations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  label_id uuid NOT NULL,
  payload_version text NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL,
  generated_by uuid NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, label_id, payload_sha256),
  FOREIGN KEY (workspace_id, label_id) REFERENCES material_labels(workspace_id, id),
  FOREIGN KEY (workspace_id, generated_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (length(trim(payload_version)) > 0)
);

CREATE OR REPLACE FUNCTION app_record_cross_event(
  p_cross_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key text
)
RETURNS TABLE(event_id uuid, operational_state cross_operational_state)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_state cross_operational_state;
  next_state cross_operational_state;
  event_result uuid;
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
BEGIN
  IF NOT app_workspace_access_allowed(workspace) THEN RAISE EXCEPTION 'active workspace membership required'; END IF;
  SELECT cross_record.operational_state INTO current_state
  FROM crosses cross_record
  WHERE cross_record.workspace_id = workspace AND cross_record.id = p_cross_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cross not found'; END IF;

  next_state := CASE p_event_type
    WHEN 'planned' THEN CASE WHEN current_state = 'planned' THEN 'planned'::cross_operational_state END
    WHEN 'prepared' THEN CASE WHEN current_state IN ('planned','prepared') THEN 'prepared'::cross_operational_state END
    WHEN 'bagged' THEN CASE WHEN current_state IN ('planned','prepared') THEN 'prepared'::cross_operational_state END
    WHEN 'unbagged' THEN CASE WHEN current_state IN ('prepared','pollinated','fruit_set','harvest_ready') THEN current_state END
    WHEN 'pollinated' THEN CASE WHEN current_state IN ('planned','prepared') THEN 'pollinated'::cross_operational_state END
    WHEN 'fruit_set' THEN CASE WHEN current_state IN ('pollinated','fruit_set') THEN 'fruit_set'::cross_operational_state END
    WHEN 'harvest_ready' THEN CASE WHEN current_state IN ('fruit_set','harvest_ready') THEN 'harvest_ready'::cross_operational_state END
    WHEN 'failed' THEN CASE WHEN current_state IN ('planned','prepared','pollinated','fruit_set','harvest_ready') THEN 'failed'::cross_operational_state END
    WHEN 'closed' THEN CASE WHEN current_state IN ('failed','harvested') THEN 'closed'::cross_operational_state END
    ELSE NULL
  END;
  IF next_state IS NULL THEN
    RAISE EXCEPTION 'illegal cross transition from % through %', current_state, p_event_type;
  END IF;

  INSERT INTO cross_events(workspace_id, cross_id, event_type, occurred_at, notes, recorded_by, idempotency_key)
  VALUES (workspace, p_cross_id, p_event_type, p_occurred_at, p_notes, actor, p_idempotency_key)
  RETURNING id INTO event_result;
  UPDATE crosses
  SET operational_state = next_state, updated_at = now()
  WHERE workspace_id = workspace AND id = p_cross_id;
  RETURN QUERY SELECT event_result, next_state;
END
$$;

CREATE OR REPLACE FUNCTION app_record_cross_verification(
  p_cross_id uuid,
  p_verification_state cross_verification_state,
  p_method cross_verification_method,
  p_source_type text,
  p_evidence_references jsonb,
  p_confidence numeric,
  p_statement text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  verification_id uuid;
BEGIN
  IF NOT app_workspace_access_allowed(workspace) THEN RAISE EXCEPTION 'active workspace membership required'; END IF;
  PERFORM 1 FROM crosses WHERE workspace_id = workspace AND id = p_cross_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cross not found'; END IF;
  INSERT INTO cross_verifications(
    workspace_id, cross_id, verification_state, method, source_type,
    evidence_references, confidence, statement, recorded_by, idempotency_key
  ) VALUES (
    workspace, p_cross_id, p_verification_state, p_method, p_source_type,
    COALESCE(p_evidence_references, '[]'::jsonb), p_confidence, p_statement, actor, p_idempotency_key
  ) RETURNING id INTO verification_id;
  RETURN verification_id;
END
$$;

CREATE OR REPLACE FUNCTION app_review_cross_verification(
  p_verification_id uuid,
  p_decision review_state,
  p_rationale text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  verification cross_verifications%ROWTYPE;
  review_id uuid;
BEGIN
  IF NOT app_workspace_access_allowed(workspace) THEN RAISE EXCEPTION 'active workspace membership required'; END IF;
  IF app_current_membership_role() NOT IN ('owner','scientific_reviewer') THEN
    RAISE EXCEPTION 'scientific reviewer authority required';
  END IF;
  SELECT * INTO verification FROM cross_verifications
  WHERE workspace_id = workspace AND id = p_verification_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cross verification not found'; END IF;
  IF verification.recorded_by = actor THEN RAISE EXCEPTION 'verification authors cannot approve their own evidence'; END IF;
  IF p_decision NOT IN ('approved','rejected','changes_requested') THEN RAISE EXCEPTION 'invalid review decision'; END IF;
  INSERT INTO cross_verification_reviews(workspace_id, verification_id, decision, rationale, reviewer_user_id)
  VALUES (workspace, p_verification_id, p_decision, p_rationale, actor)
  RETURNING id INTO review_id;
  IF p_decision = 'approved' THEN
    UPDATE crosses
    SET verification_state = verification.verification_state,
        current_verification_id = verification.id,
        updated_at = now()
    WHERE workspace_id = workspace AND id = verification.cross_id;
  END IF;
  RETURN review_id;
END
$$;

CREATE OR REPLACE FUNCTION app_complete_cross_harvest(
  p_cross_id uuid,
  p_fruit_material_id uuid,
  p_seed_harvest_material_id uuid,
  p_seed_lot_material_id uuid,
  p_family_material_id uuid,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  current_state cross_operational_state;
  event_id uuid;
BEGIN
  IF NOT app_workspace_access_allowed(workspace) THEN RAISE EXCEPTION 'active workspace membership required'; END IF;
  SELECT operational_state INTO current_state FROM crosses
  WHERE workspace_id = workspace AND id = p_cross_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cross not found'; END IF;
  IF current_state NOT IN ('fruit_set','harvest_ready') THEN
    RAISE EXCEPTION 'cross must have recorded fruit set before canonical harvest';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM fruits fruit
    JOIN seed_harvests harvest
      ON harvest.workspace_id = fruit.workspace_id AND harvest.fruit_material_id = fruit.material_id
    JOIN seed_lots seed_lot
      ON seed_lot.workspace_id = harvest.workspace_id
     AND seed_lot.source_seed_harvest_material_id = harvest.material_id
    JOIN progeny_families family
      ON family.workspace_id = harvest.workspace_id
     AND family.source_seed_harvest_material_id = harvest.material_id
    WHERE fruit.workspace_id = workspace
      AND fruit.material_id = p_fruit_material_id
      AND fruit.cross_id = p_cross_id
      AND harvest.material_id = p_seed_harvest_material_id
      AND seed_lot.material_id = p_seed_lot_material_id
      AND family.material_id = p_family_material_id
      AND seed_lot.derived_material_id = family.material_id
  ) THEN
    RAISE EXCEPTION 'canonical harvest artifacts are incomplete or biologically inconsistent';
  END IF;
  INSERT INTO cross_events(workspace_id, cross_id, event_type, occurred_at, notes, recorded_by, idempotency_key)
  VALUES (workspace, p_cross_id, 'harvested', p_occurred_at, p_notes, actor, p_idempotency_key)
  RETURNING id INTO event_id;
  UPDATE crosses
  SET operational_state = 'harvested', harvested_at = p_occurred_at, updated_at = now()
  WHERE workspace_id = workspace AND id = p_cross_id;
  RETURN event_id;
END
$$;

CREATE OR REPLACE FUNCTION reject_cross_authority_direct_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app_is_runtime_session() THEN
    RAISE EXCEPTION 'cross authority transitions require canonical database functions';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER crosses_authority_update_guard
BEFORE UPDATE OF operational_state, verification_state, current_verification_id, harvested_at
ON crosses FOR EACH ROW EXECUTE FUNCTION reject_cross_authority_direct_mutation();

CREATE TRIGGER cross_verifications_append_only
BEFORE UPDATE OR DELETE ON cross_verifications
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER cross_verification_reviews_append_only
BEFORE UPDATE OR DELETE ON cross_verification_reviews
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER breeding_material_identities_append_only
BEFORE UPDATE OR DELETE ON breeding_material_identities
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER plant_inventory_allocations_append_only
BEFORE UPDATE OR DELETE ON plant_inventory_allocations
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER material_movements_append_only
BEFORE UPDATE OR DELETE ON material_movements
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER label_generations_append_only
BEFORE UPDATE OR DELETE ON label_generations
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

-- Membership-bound RLS for every new workspace table.
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'cross_verifications','cross_verification_reviews','breeding_material_identities',
    'inventory_reservations','plant_inventory_allocations','material_movements',
    'material_current_locations','label_generations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY active_membership_workspace_isolation ON %I USING (app_workspace_access_allowed(workspace_id)) WITH CHECK (app_workspace_access_allowed(workspace_id))',
      target
    );
  END LOOP;
END
$$;

REVOKE UPDATE, DELETE ON crosses FROM capsicum_runtime;
GRANT UPDATE (cross_code, updated_at) ON crosses TO capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON cross_events FROM capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON cross_verifications FROM capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON cross_verification_reviews FROM capsicum_runtime;
GRANT SELECT ON cross_events, cross_verifications, cross_verification_reviews TO capsicum_runtime;
REVOKE ALL ON FUNCTION app_record_cross_event(uuid,text,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_record_cross_verification(uuid,cross_verification_state,cross_verification_method,text,jsonb,numeric,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_review_cross_verification(uuid,review_state,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_complete_cross_harvest(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_record_cross_event(uuid,text,timestamptz,text,text) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_record_cross_verification(uuid,cross_verification_state,cross_verification_method,text,jsonb,numeric,text,text) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_review_cross_verification(uuid,review_state,text) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_complete_cross_harvest(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text) TO capsicum_runtime;

COMMIT;
