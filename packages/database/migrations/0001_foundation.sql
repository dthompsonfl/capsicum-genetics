BEGIN;

CREATE TYPE membership_role AS ENUM (
  'owner',
  'breeder',
  'technician',
  'scientific_reviewer',
  'catalog_curator',
  'administrator',
  'viewer'
);
CREATE TYPE evidence_state AS ENUM ('verified', 'inferred', 'assumed', 'unknown', 'conflicting');
CREATE TYPE review_state AS ENUM (
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'rejected',
  'superseded'
);
CREATE TYPE material_status AS ENUM ('active', 'depleted', 'lost', 'retired', 'quarantined');
CREATE TYPE material_kind AS ENUM (
  'germplasm_accession',
  'seed_lot',
  'plant',
  'fruit',
  'seed_harvest',
  'progeny_family',
  'tissue_sample'
);
CREATE TYPE origin_event_type AS ENUM (
  'acquisition',
  'germination',
  'controlled_cross',
  'selfing',
  'open_pollination',
  'vegetative_propagation',
  'seed_harvest'
);
CREATE TYPE pollination_method AS ENUM ('controlled_cross', 'selfing', 'open_pollination');
CREATE TYPE cross_status AS ENUM ('planned', 'pollinated', 'verified', 'failed', 'harvested', 'closed');
CREATE TYPE scientific_authority AS ENUM (
  'exact_supported',
  'conditional_supported',
  'hypothesis_only',
  'unsupported'
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email)),
  CHECK (length(trim(display_name)) > 0)
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CHECK (length(trim(name)) > 0)
);

CREATE TABLE workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role membership_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  ip_hash text,
  FOREIGN KEY (workspace_id, actor_user_id)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(action)) > 0),
  CHECK (length(trim(entity_type)) > 0)
);
CREATE INDEX audit_events_workspace_time_idx
  ON audit_events(workspace_id, occurred_at DESC);

-- Scientific catalog: imported source rows remain draft until independently reviewed.
CREATE TABLE catalog_import_batches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_file_name text NOT NULL,
  source_file_sha256 text NOT NULL,
  imported_by uuid NOT NULL REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  record_count integer NOT NULL CHECK (record_count >= 0),
  reconciliation jsonb NOT NULL,
  UNIQUE (source_file_sha256, source_file_name)
);

CREATE TABLE scientific_sources (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_id text NOT NULL,
  record_version text NOT NULL DEFAULT '1',
  content_hash text NOT NULL,
  supersedes_id uuid REFERENCES scientific_sources(id),
  import_batch_id uuid NOT NULL REFERENCES catalog_import_batches(id),
  authored_by uuid NOT NULL REFERENCES users(id),
  citation_text text NOT NULL,
  locator text,
  source_type text NOT NULL,
  raw_source_payload jsonb NOT NULL,
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK (
    (review_state IN ('approved', 'superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (review_state NOT IN ('approved', 'superseded') AND approved_by IS NULL AND approved_at IS NULL)
  )
);

CREATE TABLE loci (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  catalog_id text NOT NULL,
  record_version text NOT NULL DEFAULT '1',
  content_hash text NOT NULL,
  supersedes_id uuid REFERENCES loci(id),
  import_batch_id uuid NOT NULL REFERENCES catalog_import_batches(id),
  authored_by uuid NOT NULL REFERENCES users(id),
  canonical_symbol text NOT NULL,
  trait_category text NOT NULL,
  species_scope text NOT NULL,
  model_class text NOT NULL,
  raw_source_payload jsonb NOT NULL,
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK (
    (review_state IN ('approved', 'superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (review_state NOT IN ('approved', 'superseded') AND approved_by IS NULL AND approved_at IS NULL)
  ),
  CHECK (length(trim(catalog_id)) > 0),
  CHECK (length(trim(canonical_symbol)) > 0)
);

CREATE TABLE evidence_assertions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  claim_id text NOT NULL,
  record_version text NOT NULL DEFAULT '1',
  content_hash text NOT NULL,
  supersedes_id uuid REFERENCES evidence_assertions(id),
  import_batch_id uuid NOT NULL REFERENCES catalog_import_batches(id),
  authored_by uuid NOT NULL REFERENCES users(id),
  locus_id uuid REFERENCES loci(id),
  claim_text text NOT NULL,
  applicability text NOT NULL,
  required_conditions text NOT NULL,
  exclusions text NOT NULL,
  raw_source_payload jsonb NOT NULL,
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK (
    (review_state IN ('approved', 'superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (review_state NOT IN ('approved', 'superseded') AND approved_by IS NULL AND approved_at IS NULL)
  )
);

CREATE TABLE evidence_assertion_sources (
  assertion_id uuid NOT NULL REFERENCES evidence_assertions(id),
  source_id uuid NOT NULL REFERENCES scientific_sources(id),
  passage_locator text,
  PRIMARY KEY (assertion_id, source_id)
);

CREATE TABLE scientific_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id),
  reviewer_user_id uuid NOT NULL REFERENCES users(id),
  decision review_state NOT NULL,
  rationale text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, reviewer_user_id, decision),
  CHECK (reviewer_user_id <> author_user_id),
  CHECK (decision IN ('changes_requested', 'approved', 'rejected')),
  CHECK (length(trim(entity_type)) > 0),
  CHECK (length(trim(rationale)) > 0)
);

CREATE TABLE catalog_releases (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  version text NOT NULL UNIQUE,
  state review_state NOT NULL DEFAULT 'draft',
  import_batch_id uuid REFERENCES catalog_import_batches(id),
  content_hash text NOT NULL UNIQUE,
  published_by uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state = 'approved' AND published_by IS NOT NULL AND published_at IS NOT NULL)
    OR (state <> 'approved' AND published_by IS NULL AND published_at IS NULL)
  ),
  CHECK (content_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE catalog_release_loci (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  locus_id uuid NOT NULL REFERENCES loci(id),
  record_hash text NOT NULL,
  PRIMARY KEY (release_id, locus_id),
  CHECK (record_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE catalog_release_assertions (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  assertion_id uuid NOT NULL REFERENCES evidence_assertions(id),
  record_hash text NOT NULL,
  PRIMARY KEY (release_id, assertion_id),
  CHECK (record_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE phenotype_rules (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  catalog_release_id uuid NOT NULL REFERENCES catalog_releases(id),
  rule_key text NOT NULL,
  rule_version text NOT NULL,
  input_contract jsonb NOT NULL,
  output_contract jsonb NOT NULL,
  executable_expression jsonb NOT NULL,
  authority scientific_authority NOT NULL,
  supporting_assertion_id uuid NOT NULL REFERENCES evidence_assertions(id),
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  UNIQUE (catalog_release_id, rule_key, rule_version),
  CHECK (authority IN ('exact_supported', 'conditional_supported')),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK (
    (review_state IN ('approved', 'superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (review_state NOT IN ('approved', 'superseded') AND approved_by IS NULL AND approved_at IS NULL)
  )
);

-- Canonical biological identity. Specialized records extend, rather than replace, this identity.
CREATE TABLE biological_materials (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind material_kind NOT NULL,
  material_code text NOT NULL,
  status material_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, material_code),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(material_code)) > 0)
);

CREATE TABLE germplasm_accessions (
  material_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  taxon text NOT NULL,
  display_name text NOT NULL,
  provenance jsonb NOT NULL,
  UNIQUE (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  CHECK (length(trim(taxon)) > 0),
  CHECK (length(trim(display_name)) > 0)
);

CREATE TABLE seed_lots (
  material_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  accession_material_id uuid NOT NULL,
  source_lot_material_id uuid,
  quantity_estimate integer CHECK (quantity_estimate IS NULL OR quantity_estimate >= 0),
  UNIQUE (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, accession_material_id)
    REFERENCES germplasm_accessions(workspace_id, material_id),
  FOREIGN KEY (workspace_id, source_lot_material_id)
    REFERENCES seed_lots(workspace_id, material_id),
  CHECK (source_lot_material_id IS NULL OR source_lot_material_id <> material_id)
);

CREATE TABLE plants (
  material_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  source_seed_lot_material_id uuid NOT NULL,
  genotype_evidence_state evidence_state NOT NULL DEFAULT 'unknown',
  UNIQUE (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, source_seed_lot_material_id)
    REFERENCES seed_lots(workspace_id, material_id)
);

CREATE TABLE material_origin_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  material_id uuid NOT NULL,
  event_type origin_event_type NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, material_id),
  FOREIGN KEY (workspace_id, material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, recorded_by)
    REFERENCES workspace_memberships(workspace_id, user_id)
);

CREATE TABLE material_origin_parents (
  workspace_id uuid NOT NULL,
  origin_event_id uuid NOT NULL,
  parent_material_id uuid NOT NULL,
  parent_role text NOT NULL,
  PRIMARY KEY (origin_event_id, parent_material_id, parent_role),
  FOREIGN KEY (workspace_id, origin_event_id)
    REFERENCES material_origin_events(workspace_id, id),
  FOREIGN KEY (workspace_id, parent_material_id)
    REFERENCES biological_materials(workspace_id, id),
  CHECK (length(trim(parent_role)) > 0)
);

CREATE TABLE pedigree_edges (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  parent_material_id uuid NOT NULL,
  child_material_id uuid NOT NULL,
  relationship text NOT NULL,
  origin_event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, parent_material_id, child_material_id, relationship),
  FOREIGN KEY (workspace_id, parent_material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, child_material_id)
    REFERENCES biological_materials(workspace_id, id),
  FOREIGN KEY (workspace_id, origin_event_id)
    REFERENCES material_origin_events(workspace_id, id),
  CHECK (parent_material_id <> child_material_id),
  CHECK (length(trim(relationship)) > 0)
);
CREATE INDEX pedigree_edges_child_idx ON pedigree_edges(workspace_id, child_material_id);
CREATE INDEX pedigree_edges_parent_idx ON pedigree_edges(workspace_id, parent_material_id);

CREATE TABLE crosses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  cross_code text NOT NULL,
  maternal_plant_id uuid NOT NULL,
  paternal_plant_id uuid,
  pollination_method pollination_method NOT NULL,
  status cross_status NOT NULL DEFAULT 'planned',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, cross_code),
  FOREIGN KEY (workspace_id, maternal_plant_id)
    REFERENCES plants(workspace_id, material_id),
  FOREIGN KEY (workspace_id, paternal_plant_id)
    REFERENCES plants(workspace_id, material_id),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (
    (pollination_method = 'controlled_cross' AND paternal_plant_id IS NOT NULL AND maternal_plant_id <> paternal_plant_id)
    OR (pollination_method = 'selfing' AND paternal_plant_id IS NOT NULL AND paternal_plant_id = maternal_plant_id)
    OR (pollination_method = 'open_pollination' AND paternal_plant_id IS NULL)
  ),
  CHECK (length(trim(cross_code)) > 0)
);

CREATE TABLE simulation_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_by uuid NOT NULL,
  model_type text NOT NULL,
  model_version text NOT NULL,
  catalog_release_id uuid REFERENCES catalog_releases(id),
  authority scientific_authority NOT NULL,
  normalized_input jsonb NOT NULL,
  result_payload jsonb NOT NULL,
  assumptions jsonb NOT NULL,
  warnings jsonb NOT NULL,
  abstentions jsonb NOT NULL,
  content_hash text NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, content_hash, created_by),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(trim(model_type)) > 0),
  CHECK (length(trim(model_version)) > 0),
  CHECK (content_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE idempotency_records (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, actor_user_id, idempotency_key),
  FOREIGN KEY (workspace_id, actor_user_id)
    REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599)
);

CREATE OR REPLACE FUNCTION app_current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_actor_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.actor_user_id', true), '')::uuid
$$;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_self_isolation ON workspaces
  USING (id = app_current_workspace_id())
  WITH CHECK (id = app_current_workspace_id());

ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_workspace_isolation ON workspace_memberships
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DO $$
DECLARE
  table_name text;
  workspace_tables text[] := ARRAY[
    'audit_events',
    'biological_materials',
    'germplasm_accessions',
    'seed_lots',
    'plants',
    'material_origin_events',
    'material_origin_parents',
    'pedigree_edges',
    'crosses',
    'simulation_runs',
    'idempotency_records'
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

CREATE OR REPLACE FUNCTION reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER catalog_import_batches_append_only
BEFORE UPDATE OR DELETE ON catalog_import_batches
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER scientific_reviews_append_only
BEFORE UPDATE OR DELETE ON scientific_reviews
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER material_origin_events_append_only
BEFORE UPDATE OR DELETE ON material_origin_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER pedigree_edges_append_only
BEFORE UPDATE OR DELETE ON pedigree_edges
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER simulation_runs_immutable
BEFORE UPDATE OR DELETE ON simulation_runs
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE OR REPLACE FUNCTION reject_published_catalog_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'approved' THEN
    RAISE EXCEPTION 'published catalog release % is immutable', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER catalog_releases_immutable_after_publication
BEFORE UPDATE OR DELETE ON catalog_releases
FOR EACH ROW EXECUTE FUNCTION reject_published_catalog_release_mutation();

CREATE OR REPLACE FUNCTION reject_pedigree_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE descendants(material_id) AS (
      SELECT child_material_id
      FROM pedigree_edges
      WHERE workspace_id = NEW.workspace_id
        AND parent_material_id = NEW.child_material_id
      UNION
      SELECT edge.child_material_id
      FROM pedigree_edges edge
      JOIN descendants descendant
        ON edge.parent_material_id = descendant.material_id
      WHERE edge.workspace_id = NEW.workspace_id
    )
    SELECT 1
    FROM descendants
    WHERE material_id = NEW.parent_material_id
  ) THEN
    RAISE EXCEPTION 'pedigree edge would create a cycle';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER pedigree_edges_reject_cycles
BEFORE INSERT ON pedigree_edges
FOR EACH ROW EXECUTE FUNCTION reject_pedigree_cycle();

CREATE OR REPLACE FUNCTION require_approved_rule_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assertion_state review_state;
BEGIN
  SELECT review_state INTO assertion_state
  FROM evidence_assertions
  WHERE id = NEW.supporting_assertion_id;

  IF NEW.review_state = 'approved' AND assertion_state <> 'approved' THEN
    RAISE EXCEPTION 'approved phenotype rules require an approved evidence assertion';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER phenotype_rules_require_approved_evidence
BEFORE INSERT OR UPDATE ON phenotype_rules
FOR EACH ROW EXECUTE FUNCTION require_approved_rule_evidence();

CREATE OR REPLACE FUNCTION guard_approved_assertion_source_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_assertion_id uuid;
  target_state review_state;
BEGIN
  target_assertion_id := COALESCE(NEW.assertion_id, OLD.assertion_id);
  SELECT review_state INTO target_state
  FROM evidence_assertions
  WHERE id = target_assertion_id;

  IF target_state IN ('approved', 'superseded') THEN
    RAISE EXCEPTION 'source links for approved evidence assertion % are immutable', target_assertion_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER evidence_assertion_sources_immutable_after_approval
BEFORE INSERT OR UPDATE OR DELETE ON evidence_assertion_sources
FOR EACH ROW EXECUTE FUNCTION guard_approved_assertion_source_mutation();

CREATE OR REPLACE FUNCTION require_independent_scientific_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.review_state = 'approved' THEN
    IF NEW.approved_by = NEW.authored_by THEN
      RAISE EXCEPTION 'scientific records cannot be approved by their author';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM scientific_reviews review
      WHERE review.entity_type = TG_TABLE_NAME
        AND review.entity_id = NEW.id
        AND review.author_user_id = NEW.authored_by
        AND review.reviewer_user_id = NEW.approved_by
        AND review.decision = 'approved'
    ) THEN
      RAISE EXCEPTION 'approved %.% requires a matching independent scientific review', TG_TABLE_NAME, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE CONSTRAINT TRIGGER scientific_sources_require_independent_approval
AFTER INSERT OR UPDATE ON scientific_sources
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_independent_scientific_approval();

CREATE CONSTRAINT TRIGGER loci_require_independent_approval
AFTER INSERT OR UPDATE ON loci
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_independent_scientific_approval();

CREATE CONSTRAINT TRIGGER evidence_assertions_require_independent_approval
AFTER INSERT OR UPDATE ON evidence_assertions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_independent_scientific_approval();

CREATE CONSTRAINT TRIGGER phenotype_rules_require_independent_approval
AFTER INSERT OR UPDATE ON phenotype_rules
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_independent_scientific_approval();

CREATE OR REPLACE FUNCTION reject_approved_scientific_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.review_state IN ('approved', 'superseded') THEN
    IF TG_OP = 'UPDATE'
      AND OLD.review_state = 'approved'
      AND NEW.review_state = 'superseded'
      AND (to_jsonb(NEW) - 'review_state') = (to_jsonb(OLD) - 'review_state') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'approved scientific record %.% is immutable; create a new version and supersede it', TG_TABLE_NAME, OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER scientific_sources_immutable_after_approval
BEFORE UPDATE OR DELETE ON scientific_sources
FOR EACH ROW EXECUTE FUNCTION reject_approved_scientific_record_mutation();

CREATE TRIGGER loci_immutable_after_approval
BEFORE UPDATE OR DELETE ON loci
FOR EACH ROW EXECUTE FUNCTION reject_approved_scientific_record_mutation();

CREATE TRIGGER evidence_assertions_immutable_after_approval
BEFORE UPDATE OR DELETE ON evidence_assertions
FOR EACH ROW EXECUTE FUNCTION reject_approved_scientific_record_mutation();

CREATE TRIGGER phenotype_rules_immutable_after_approval
BEFORE UPDATE OR DELETE ON phenotype_rules
FOR EACH ROW EXECUTE FUNCTION reject_approved_scientific_record_mutation();

CREATE OR REPLACE FUNCTION validate_catalog_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = 'approved' AND (TG_OP = 'INSERT' OR OLD.state <> 'approved') THEN
    IF NOT EXISTS (SELECT 1 FROM catalog_release_loci WHERE release_id = NEW.id) THEN
      RAISE EXCEPTION 'catalog release must contain at least one locus before publication';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM catalog_release_loci release_locus
      JOIN loci locus ON locus.id = release_locus.locus_id
      WHERE release_locus.release_id = NEW.id
        AND (locus.review_state <> 'approved' OR release_locus.record_hash <> locus.content_hash)
    ) THEN
      RAISE EXCEPTION 'catalog release contains unapproved loci or mismatched locus hashes';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM catalog_release_assertions release_assertion
      JOIN evidence_assertions assertion ON assertion.id = release_assertion.assertion_id
      WHERE release_assertion.release_id = NEW.id
        AND (assertion.review_state <> 'approved' OR release_assertion.record_hash <> assertion.content_hash)
    ) THEN
      RAISE EXCEPTION 'catalog release contains unapproved assertions or mismatched assertion hashes';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM catalog_release_assertions release_assertion
      WHERE release_assertion.release_id = NEW.id
        AND NOT EXISTS (
          SELECT 1
          FROM evidence_assertion_sources assertion_source
          WHERE assertion_source.assertion_id = release_assertion.assertion_id
        )
    ) THEN
      RAISE EXCEPTION 'catalog release contains an evidence assertion without a source link';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM catalog_release_assertions release_assertion
      JOIN evidence_assertion_sources assertion_source
        ON assertion_source.assertion_id = release_assertion.assertion_id
      JOIN scientific_sources source ON source.id = assertion_source.source_id
      WHERE release_assertion.release_id = NEW.id
        AND source.review_state <> 'approved'
    ) THEN
      RAISE EXCEPTION 'catalog release contains evidence backed by an unapproved source';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM phenotype_rules rule
      WHERE rule.catalog_release_id = NEW.id
        AND rule.review_state <> 'approved'
    ) THEN
      RAISE EXCEPTION 'catalog release contains unapproved phenotype rules';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM phenotype_rules rule
      WHERE rule.catalog_release_id = NEW.id
        AND NOT EXISTS (
          SELECT 1
          FROM catalog_release_assertions release_assertion
          WHERE release_assertion.release_id = NEW.id
            AND release_assertion.assertion_id = rule.supporting_assertion_id
        )
    ) THEN
      RAISE EXCEPTION 'catalog phenotype rule references an assertion outside the release';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER catalog_releases_validate_publication
BEFORE INSERT OR UPDATE OF state ON catalog_releases
FOR EACH ROW EXECUTE FUNCTION validate_catalog_publication();

CREATE OR REPLACE FUNCTION guard_catalog_release_membership_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_release_id uuid;
  target_state review_state;
BEGIN
  target_release_id := COALESCE(NEW.release_id, OLD.release_id);
  SELECT state INTO target_state FROM catalog_releases WHERE id = target_release_id;
  IF target_state = 'approved' THEN
    RAISE EXCEPTION 'published catalog release membership is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER catalog_release_loci_guard
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_loci
FOR EACH ROW EXECUTE FUNCTION guard_catalog_release_membership_mutation();

CREATE TRIGGER catalog_release_assertions_guard
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_assertions
FOR EACH ROW EXECUTE FUNCTION guard_catalog_release_membership_mutation();

COMMIT;
