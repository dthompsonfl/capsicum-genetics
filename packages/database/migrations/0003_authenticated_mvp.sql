BEGIN;

ALTER TABLE workspace_memberships
  ADD COLUMN state text NOT NULL DEFAULT 'active',
  ADD COLUMN invited_by uuid REFERENCES users(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN revoked_at timestamptz,
  ADD CONSTRAINT workspace_memberships_state_check
    CHECK (state IN ('active', 'suspended', 'revoked')),
  ADD CONSTRAINT workspace_memberships_revocation_check
    CHECK ((state = 'revoked') = (revoked_at IS NOT NULL));

CREATE TABLE user_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_version text NOT NULL DEFAULT 'scrypt-v1',
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(password_hash) BETWEEN 80 AND 1000)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  active_workspace_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  rotated_from_session_id uuid REFERENCES auth_sessions(id),
  user_agent_hash text,
  ip_hash text,
  CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  FOREIGN KEY (active_workspace_id, user_id)
    REFERENCES workspace_memberships(workspace_id, user_id)
);
CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions(user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE workspace_invitations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  email text NOT NULL,
  role membership_role NOT NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email, token_hash),
  FOREIGN KEY (workspace_id, invited_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (email = lower(email)),
  CHECK (role <> 'owner'),
  CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CHECK (expires_at > created_at),
  CHECK ((accepted_by IS NULL) = (accepted_at IS NULL)),
  CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE INDEX workspace_invitations_lookup_idx
  ON workspace_invitations(token_hash, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;


CREATE OR REPLACE FUNCTION app_resolve_workspace_invitation(p_token_hash text)
RETURNS TABLE(id uuid, workspace_id uuid, email text, role membership_role)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT invitation.id, invitation.workspace_id, invitation.email, invitation.role
  FROM workspace_invitations invitation
  WHERE invitation.token_hash = p_token_hash
    AND invitation.accepted_at IS NULL
    AND invitation.revoked_at IS NULL
    AND invitation.expires_at > now()
$$;
REVOKE ALL ON FUNCTION app_resolve_workspace_invitation(text) FROM PUBLIC;

CREATE TABLE material_locations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  location_type text NOT NULL,
  parent_location_id uuid,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, name),
  FOREIGN KEY (workspace_id, parent_location_id)
    REFERENCES material_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(name)) > 0),
  CHECK (location_type IN ('site', 'greenhouse', 'room', 'bench', 'tray', 'storage', 'field', 'other'))
);

CREATE TABLE inventory_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  seed_lot_material_id uuid NOT NULL,
  event_type text NOT NULL,
  quantity_delta integer NOT NULL,
  running_quantity integer NOT NULL CHECK (running_quantity >= 0),
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, seed_lot_material_id)
    REFERENCES seed_lots(workspace_id, material_id),
  FOREIGN KEY (workspace_id, recorded_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (event_type IN ('received', 'adjustment', 'sown', 'transferred', 'consumed', 'discarded', 'counted')),
  CHECK (length(trim(reason)) > 0)
);
CREATE INDEX inventory_events_seed_lot_time_idx
  ON inventory_events(workspace_id, seed_lot_material_id, occurred_at DESC);

CREATE TABLE material_labels (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  material_id uuid NOT NULL,
  label_code text NOT NULL,
  label_type text NOT NULL DEFAULT 'qr',
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, label_code),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, issued_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(label_code)) > 0),
  CHECK (label_type IN ('qr', 'barcode', 'human_readable'))
);

CREATE TABLE genotype_calls (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  material_id uuid NOT NULL,
  locus_catalog_id text NOT NULL,
  allele_one text NOT NULL,
  allele_two text NOT NULL,
  evidence_state evidence_state NOT NULL,
  assay_method text,
  assay_identifier text,
  source_document_id uuid,
  notes text,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  supersedes_call_id uuid,
  is_current boolean NOT NULL DEFAULT true,
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, source_document_id)
    REFERENCES research_documents(workspace_id, id),
  FOREIGN KEY (workspace_id, recorded_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, supersedes_call_id)
    REFERENCES genotype_calls(workspace_id, id),
  CHECK (length(trim(locus_catalog_id)) > 0),
  CHECK (length(trim(allele_one)) > 0),
  CHECK (length(trim(allele_two)) > 0),
  CHECK (supersedes_call_id IS NULL OR supersedes_call_id <> id)
);
CREATE UNIQUE INDEX genotype_calls_current_unique_idx
  ON genotype_calls(workspace_id, material_id, locus_catalog_id)
  WHERE is_current;

CREATE TABLE cross_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  cross_id uuid NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  notes text,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, cross_id) REFERENCES crosses(workspace_id, id),
  FOREIGN KEY (workspace_id, recorded_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (event_type IN ('planned', 'pollinated', 'bagged', 'unbagged', 'verified', 'failed', 'fruit_set', 'harvested', 'closed'))
);
CREATE INDEX cross_events_cross_time_idx
  ON cross_events(workspace_id, cross_id, occurred_at);

CREATE TABLE fruits (
  material_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  cross_id uuid NOT NULL,
  maternal_plant_id uuid NOT NULL,
  set_at timestamptz,
  harvested_at timestamptz,
  UNIQUE (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, cross_id)
    REFERENCES crosses(workspace_id, id),
  FOREIGN KEY (workspace_id, maternal_plant_id)
    REFERENCES plants(workspace_id, material_id),
  CHECK (harvested_at IS NULL OR set_at IS NULL OR harvested_at >= set_at)
);

CREATE TABLE seed_harvests (
  material_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  fruit_material_id uuid NOT NULL,
  quantity_estimate integer CHECK (quantity_estimate IS NULL OR quantity_estimate >= 0),
  harvested_at timestamptz NOT NULL,
  UNIQUE (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, fruit_material_id)
    REFERENCES fruits(workspace_id, material_id)
);

CREATE TABLE progeny_families (
  material_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  cross_id uuid NOT NULL,
  source_seed_harvest_material_id uuid NOT NULL,
  generation_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, cross_id)
    REFERENCES crosses(workspace_id, id),
  FOREIGN KEY (workspace_id, source_seed_harvest_material_id)
    REFERENCES seed_harvests(workspace_id, material_id),
  CHECK (length(trim(generation_label)) > 0)
);

CREATE TABLE family_members (
  workspace_id uuid NOT NULL,
  family_material_id uuid NOT NULL,
  plant_material_id uuid NOT NULL,
  member_number integer,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_material_id, plant_material_id),
  FOREIGN KEY (workspace_id, family_material_id)
    REFERENCES progeny_families(workspace_id, material_id),
  FOREIGN KEY (workspace_id, plant_material_id)
    REFERENCES plants(workspace_id, material_id),
  CHECK (member_number IS NULL OR member_number > 0)
);

CREATE TABLE selection_plans (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  simulation_run_id uuid NOT NULL,
  name text NOT NULL,
  target_description text NOT NULL,
  planned_population integer NOT NULL CHECK (planned_population > 0),
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, simulation_run_id)
    REFERENCES simulation_runs(workspace_id, id),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, approved_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (status IN ('draft', 'approved', 'active', 'completed', 'cancelled')),
  CHECK ((status IN ('approved', 'active', 'completed')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE experiments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  code text NOT NULL,
  name text NOT NULL,
  objective text NOT NULL,
  environment jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'planned',
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, code),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (state IN ('planned', 'active', 'completed', 'cancelled')),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE observation_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  experiment_id uuid,
  protocol_key text NOT NULL,
  protocol_version text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, experiment_id)
    REFERENCES experiments(workspace_id, id),
  FOREIGN KEY (workspace_id, opened_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, closed_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (state IN ('open', 'closed', 'cancelled')),
  CHECK ((state = 'closed') = (closed_by IS NOT NULL AND closed_at IS NOT NULL))
);

ALTER TABLE media_objects
  ADD COLUMN original_file_name text,
  ADD COLUMN entity_type text,
  ADD COLUMN entity_id uuid,
  ADD COLUMN pixel_width integer,
  ADD COLUMN pixel_height integer,
  ADD COLUMN quarantine_reason text,
  ADD CONSTRAINT media_objects_entity_type_check
    CHECK (entity_type IS NULL OR entity_type IN ('plant', 'fruit', 'seed_lot', 'progeny_family', 'research_document')),
  ADD CONSTRAINT media_objects_dimensions_check
    CHECK (
      (pixel_width IS NULL AND pixel_height IS NULL)
      OR (pixel_width > 0 AND pixel_height > 0 AND pixel_width <= 20000 AND pixel_height <= 20000)
    );
CREATE INDEX media_objects_entity_idx
  ON media_objects(workspace_id, entity_type, entity_id, created_at DESC);

ALTER TABLE observations
  ADD COLUMN session_id uuid,
  ADD CONSTRAINT observations_session_fk
    FOREIGN KEY (workspace_id, session_id)
    REFERENCES observation_sessions(workspace_id, id);

CREATE TABLE phenotype_annotations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  capture_id uuid NOT NULL,
  annotation_type text NOT NULL,
  geometry jsonb NOT NULL,
  label text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  supersedes_annotation_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, capture_id)
    REFERENCES phenotype_captures(workspace_id, id),
  FOREIGN KEY (workspace_id, supersedes_annotation_id)
    REFERENCES phenotype_annotations(workspace_id, id),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (annotation_type IN ('point', 'line', 'polygon', 'bounding_box', 'measurement')),
  CHECK (length(trim(label)) > 0)
);

CREATE TABLE ai_interactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  question text NOT NULL,
  answer_payload jsonb NOT NULL,
  authority text NOT NULL,
  model_id text NOT NULL,
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (authority IN ('evidence_summary', 'hypothesis_only', 'unsupported')),
  CHECK (length(trim(question)) > 0)
);

CREATE TABLE ai_tool_calls (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  interaction_id uuid NOT NULL,
  tool_name text NOT NULL,
  input_payload jsonb NOT NULL,
  output_payload jsonb,
  authorized boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, interaction_id)
    REFERENCES ai_interactions(workspace_id, id),
  CHECK (length(trim(tool_name)) > 0)
);

CREATE TABLE export_jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  export_type text NOT NULL,
  filter_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'queued',
  object_key text,
  content_sha256 text,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, requested_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK ((state = 'succeeded') = (object_key IS NOT NULL AND content_sha256 IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE TABLE backup_restore_records (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid REFERENCES workspaces(id),
  operation text NOT NULL,
  state text NOT NULL,
  database_sha256 text,
  object_manifest_sha256 text,
  target_environment text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  initiated_by uuid REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (operation IN ('backup', 'restore_test')),
  CHECK (state IN ('running', 'succeeded', 'failed')),
  CHECK (database_sha256 IS NULL OR database_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (object_manifest_sha256 IS NULL OR object_manifest_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE OR REPLACE FUNCTION reject_auth_session_token_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.token_hash <> OLD.token_hash OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'session token identity is immutable; rotate into a new session';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER auth_sessions_token_immutable
BEFORE UPDATE ON auth_sessions
FOR EACH ROW EXECUTE FUNCTION reject_auth_session_token_mutation();

CREATE OR REPLACE FUNCTION reject_cross_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'cross events are append-only';
END
$$;

CREATE TRIGGER cross_events_append_only
BEFORE UPDATE OR DELETE ON cross_events
FOR EACH ROW EXECUTE FUNCTION reject_cross_event_mutation();

CREATE OR REPLACE FUNCTION reject_inventory_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'inventory events are append-only; record a compensating event';
END
$$;

CREATE TRIGGER inventory_events_append_only
BEFORE UPDATE OR DELETE ON inventory_events
FOR EACH ROW EXECUTE FUNCTION reject_inventory_event_mutation();

CREATE OR REPLACE FUNCTION guard_selection_plan_terminal_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'terminal selection plans are immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER selection_plans_terminal_immutable
BEFORE UPDATE OR DELETE ON selection_plans
FOR EACH ROW EXECUTE FUNCTION guard_selection_plan_terminal_mutation();

DO $$
DECLARE
  table_name text;
  workspace_tables text[] := ARRAY[
    'workspace_invitations', 'material_locations', 'inventory_events', 'material_labels',
    'genotype_calls', 'cross_events', 'fruits', 'seed_harvests', 'progeny_families',
    'family_members', 'selection_plans', 'experiments', 'observation_sessions',
    'phenotype_annotations', 'ai_interactions', 'ai_tool_calls', 'export_jobs'
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

DROP POLICY IF EXISTS workspace_self_isolation ON workspaces;
DROP POLICY IF EXISTS active_membership_visibility ON workspaces;
CREATE POLICY active_membership_visibility ON workspaces
  USING (
    id = app_current_workspace_id()
    AND EXISTS (
      SELECT 1 FROM workspace_memberships membership
      WHERE membership.workspace_id = id
        AND membership.user_id = app_current_actor_user_id()
        AND membership.state = 'active'
    )
  )
  WITH CHECK (
    id = app_current_workspace_id()
    AND created_by = app_current_actor_user_id()
  );

DROP POLICY IF EXISTS membership_workspace_isolation ON workspace_memberships;
CREATE POLICY membership_workspace_isolation ON workspace_memberships
  USING (
    workspace_id = app_current_workspace_id()
    OR user_id = app_current_actor_user_id()
  )
  WITH CHECK (workspace_id = app_current_workspace_id());

INSERT INTO observation_definitions(trait_id, trait_version, display_name, value_contract, vocabulary_id, review_state)
VALUES
  ('fruit_length', '1.0', 'Fruit length', '{"type":"number","unit":"mm","minimum":0}'::jsonb, NULL, 'draft'),
  ('fruit_width', '1.0', 'Fruit width', '{"type":"number","unit":"mm","minimum":0}'::jsonb, NULL, 'draft'),
  ('mature_color_description', '1.0', 'Mature color description', '{"type":"text"}'::jsonb, NULL, 'draft'),
  ('fruit_count', '1.0', 'Fruit count', '{"type":"number","unit":"count","minimum":0}'::jsonb, NULL, 'draft')
ON CONFLICT (trait_id, trait_version) DO NOTHING;


-- A non-login capability role keeps the web process off the migration owner role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capsicum_runtime') THEN
    CREATE ROLE capsicum_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO capsicum_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO capsicum_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO capsicum_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO capsicum_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO capsicum_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO capsicum_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO capsicum_runtime;

COMMIT;
