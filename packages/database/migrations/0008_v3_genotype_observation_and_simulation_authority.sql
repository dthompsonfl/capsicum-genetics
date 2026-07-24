BEGIN;

CREATE TYPE genotype_call_basis AS ENUM (
  'verified_genotype',
  'marker_supported',
  'pedigree_inference',
  'phenotype_inference',
  'user_assumption',
  'imported_claim',
  'unknown',
  'conflicting'
);
CREATE TYPE phase_state AS ENUM ('known_phased', 'known_unphased', 'unknown', 'conflicting');
CREATE TYPE observation_authority AS ENUM ('research_draft', 'authoritative');
CREATE TYPE observation_session_state AS ENUM ('planned', 'open', 'paused', 'closed', 'reopened', 'cancelled');
CREATE TYPE simulation_calculation_authority AS ENUM ('exact', 'approximate', 'unsupported');
CREATE TYPE simulation_premise_authority AS ENUM ('verified', 'mixed', 'inferred', 'assumed', 'conflicting', 'unknown');
CREATE TYPE simulation_interpretation_authority AS ENUM ('genotype_only', 'conditional_phenotype', 'unsupported');

CREATE TABLE reference_assemblies (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  assembly_key text NOT NULL,
  record_version text NOT NULL,
  content_hash text NOT NULL,
  species_scope text NOT NULL,
  assembly_name text NOT NULL,
  accession text,
  source_locator text NOT NULL,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  supersedes_id uuid REFERENCES reference_assemblies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assembly_key, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK ((review_state IN ('approved','superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE catalog_alleles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  allele_key text NOT NULL,
  record_version text NOT NULL,
  content_hash text NOT NULL,
  locus_id uuid NOT NULL REFERENCES loci(id),
  canonical_symbol text NOT NULL,
  molecular_definition jsonb,
  functional_class text,
  unresolved_source_notation text,
  applicability text NOT NULL,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  supersedes_id uuid REFERENCES catalog_alleles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (allele_key, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (length(trim(canonical_symbol)) > 0),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK ((review_state IN ('approved','superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE allele_aliases (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  allele_id uuid NOT NULL REFERENCES catalog_alleles(id),
  alias text NOT NULL,
  notation_context text NOT NULL,
  source_id uuid REFERENCES scientific_sources(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (allele_id, alias, notation_context),
  CHECK (length(trim(alias)) > 0),
  CHECK (length(trim(notation_context)) > 0)
);

CREATE TABLE sequence_variants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  variant_key text NOT NULL,
  record_version text NOT NULL,
  content_hash text NOT NULL,
  assembly_id uuid NOT NULL REFERENCES reference_assemblies(id),
  chromosome text NOT NULL,
  position_start bigint NOT NULL CHECK (position_start > 0),
  position_end bigint NOT NULL CHECK (position_end >= position_start),
  reference_allele text NOT NULL,
  alternate_allele text NOT NULL,
  locus_id uuid REFERENCES loci(id),
  allele_id uuid REFERENCES catalog_alleles(id),
  applicability text NOT NULL,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  supersedes_id uuid REFERENCES sequence_variants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_key, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (reference_allele <> alternate_allele),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK ((review_state IN ('approved','superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE structural_variants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  variant_key text NOT NULL,
  record_version text NOT NULL,
  content_hash text NOT NULL,
  assembly_id uuid NOT NULL REFERENCES reference_assemblies(id),
  chromosome text NOT NULL,
  position_start bigint NOT NULL CHECK (position_start > 0),
  position_end bigint NOT NULL CHECK (position_end >= position_start),
  variant_type text NOT NULL,
  locus_id uuid REFERENCES loci(id),
  allele_id uuid REFERENCES catalog_alleles(id),
  applicability text NOT NULL,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  supersedes_id uuid REFERENCES structural_variants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_key, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (variant_type IN ('deletion','insertion','duplication','inversion','translocation','copy_number','other')),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK ((review_state IN ('approved','superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE catalog_markers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  marker_key text NOT NULL,
  record_version text NOT NULL,
  content_hash text NOT NULL,
  locus_id uuid REFERENCES loci(id),
  assembly_id uuid REFERENCES reference_assemblies(id),
  marker_type text NOT NULL,
  target_definition jsonb NOT NULL,
  applicability text NOT NULL,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  supersedes_id uuid REFERENCES catalog_markers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marker_key, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK ((review_state IN ('approved','superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE catalog_assays (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  assay_key text NOT NULL,
  record_version text NOT NULL,
  content_hash text NOT NULL,
  marker_id uuid REFERENCES catalog_markers(id),
  locus_id uuid REFERENCES loci(id),
  assay_type text NOT NULL,
  protocol_locator text NOT NULL,
  result_contract jsonb NOT NULL,
  applicability text NOT NULL,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  supersedes_id uuid REFERENCES catalog_assays(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assay_key, record_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK ((review_state IN ('approved','superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE catalog_release_alleles (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  allele_id uuid NOT NULL REFERENCES catalog_alleles(id),
  record_hash text NOT NULL,
  PRIMARY KEY (release_id, allele_id),
  CHECK (record_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE catalog_release_sequence_variants (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  variant_id uuid NOT NULL REFERENCES sequence_variants(id),
  record_hash text NOT NULL,
  PRIMARY KEY (release_id, variant_id),
  CHECK (record_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE catalog_release_structural_variants (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  variant_id uuid NOT NULL REFERENCES structural_variants(id),
  record_hash text NOT NULL,
  PRIMARY KEY (release_id, variant_id),
  CHECK (record_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE catalog_release_markers (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  marker_id uuid NOT NULL REFERENCES catalog_markers(id),
  record_hash text NOT NULL,
  PRIMARY KEY (release_id, marker_id),
  CHECK (record_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE catalog_release_assays (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  assay_id uuid NOT NULL REFERENCES catalog_assays(id),
  record_hash text NOT NULL,
  PRIMARY KEY (release_id, assay_id),
  CHECK (record_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE genotype_calls
  ADD COLUMN locus_id uuid REFERENCES loci(id),
  ADD COLUMN allele_one_id uuid REFERENCES catalog_alleles(id),
  ADD COLUMN allele_two_id uuid REFERENCES catalog_alleles(id),
  ADD COLUMN catalog_release_id uuid REFERENCES catalog_releases(id),
  ADD COLUMN marker_id uuid REFERENCES catalog_markers(id),
  ADD COLUMN assay_id uuid REFERENCES catalog_assays(id),
  ADD COLUMN call_basis genotype_call_basis NOT NULL DEFAULT 'unknown',
  ADD COLUMN ploidy smallint NOT NULL DEFAULT 2 CHECK (ploidy BETWEEN 1 AND 16),
  ADD COLUMN phase phase_state NOT NULL DEFAULT 'unknown',
  ADD COLUMN haplotype_payload jsonb,
  ADD COLUMN unresolved_notation jsonb,
  ADD COLUMN source_result_payload jsonb,
  ADD COLUMN call_version integer NOT NULL DEFAULT 1 CHECK (call_version > 0);

CREATE UNIQUE INDEX genotype_calls_current_locus_idx
  ON genotype_calls(workspace_id, material_id, locus_catalog_id)
  WHERE is_current;
CREATE UNIQUE INDEX genotype_calls_single_successor_idx
  ON genotype_calls(workspace_id, supersedes_call_id)
  WHERE supersedes_call_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_normalized_genotype_call()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allele_one_locus uuid;
  allele_two_locus uuid;
BEGIN
  IF NEW.catalog_release_id IS NULL THEN
    IF NEW.allele_one_id IS NOT NULL OR NEW.allele_two_id IS NOT NULL OR NEW.locus_id IS NOT NULL THEN
      RAISE EXCEPTION 'normalized genotype calls require an exact catalog release';
    END IF;
    IF NEW.unresolved_notation IS NULL THEN
      NEW.unresolved_notation := jsonb_build_object(
        'locus', NEW.locus_catalog_id,
        'alleleOne', NEW.allele_one,
        'alleleTwo', NEW.allele_two
      );
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.locus_id IS NULL OR NEW.allele_one_id IS NULL OR NEW.allele_two_id IS NULL THEN
    RAISE EXCEPTION 'release-aware genotype calls require normalized locus and allele identifiers';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM catalog_release_loci
    WHERE release_id = NEW.catalog_release_id AND locus_id = NEW.locus_id
  ) THEN RAISE EXCEPTION 'locus is not a member of the selected catalog release'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM catalog_release_alleles
    WHERE release_id = NEW.catalog_release_id AND allele_id = NEW.allele_one_id
  ) OR NOT EXISTS (
    SELECT 1 FROM catalog_release_alleles
    WHERE release_id = NEW.catalog_release_id AND allele_id = NEW.allele_two_id
  ) THEN RAISE EXCEPTION 'one or more alleles are not members of the selected catalog release'; END IF;
  SELECT locus_id INTO allele_one_locus FROM catalog_alleles WHERE id = NEW.allele_one_id;
  SELECT locus_id INTO allele_two_locus FROM catalog_alleles WHERE id = NEW.allele_two_id;
  IF allele_one_locus <> NEW.locus_id OR allele_two_locus <> NEW.locus_id THEN
    RAISE EXCEPTION 'alleles do not belong to the selected locus';
  END IF;
  IF NEW.marker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM catalog_release_markers WHERE release_id = NEW.catalog_release_id AND marker_id = NEW.marker_id
  ) THEN RAISE EXCEPTION 'marker is not a member of the selected catalog release'; END IF;
  IF NEW.assay_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM catalog_release_assays WHERE release_id = NEW.catalog_release_id AND assay_id = NEW.assay_id
  ) THEN RAISE EXCEPTION 'assay is not a member of the selected catalog release'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER genotype_calls_validate_normalized
BEFORE INSERT ON genotype_calls
FOR EACH ROW EXECUTE FUNCTION validate_normalized_genotype_call();

CREATE OR REPLACE FUNCTION guard_genotype_call_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'genotype-call history is immutable'; END IF;
  IF OLD.is_current AND NOT NEW.is_current
     AND (to_jsonb(NEW) - 'is_current') = (to_jsonb(OLD) - 'is_current') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'genotype calls may only be superseded through a new immutable call';
END
$$;
CREATE TRIGGER genotype_calls_history_guard
BEFORE UPDATE OR DELETE ON genotype_calls
FOR EACH ROW EXECUTE FUNCTION guard_genotype_call_history();

CREATE TABLE measurement_units (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  unit_key text NOT NULL,
  unit_version text NOT NULL,
  symbol text NOT NULL,
  dimension text NOT NULL,
  definition text NOT NULL,
  conversion_to_si jsonb,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_key, unit_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK ((review_state IN ('approved','superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE controlled_vocabularies (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  vocabulary_key text NOT NULL,
  vocabulary_version text NOT NULL,
  title text NOT NULL,
  applicability text NOT NULL,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vocabulary_key, vocabulary_version),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK ((review_state IN ('approved','superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE controlled_terms (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  vocabulary_id uuid NOT NULL REFERENCES controlled_vocabularies(id),
  term_key text NOT NULL,
  label text NOT NULL,
  definition text,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (vocabulary_id, term_key),
  UNIQUE (vocabulary_id, label),
  CHECK (length(trim(term_key)) > 0),
  CHECK (length(trim(label)) > 0)
);

ALTER TABLE observation_definitions
  ADD COLUMN authored_by uuid REFERENCES users(id),
  ADD COLUMN approved_by uuid REFERENCES users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN content_hash text,
  ADD COLUMN unit_id uuid REFERENCES measurement_units(id),
  ADD COLUMN vocabulary_version_id uuid REFERENCES controlled_vocabularies(id),
  ADD COLUMN applicability jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT observation_definitions_content_hash_check
    CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT observation_definitions_approval_check
    CHECK (
      (review_state IN ('approved','superseded') AND authored_by IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND content_hash IS NOT NULL AND approved_by <> authored_by)
      OR review_state NOT IN ('approved','superseded')
    );

ALTER TABLE observations
  ADD COLUMN authority observation_authority NOT NULL DEFAULT 'research_draft',
  ADD COLUMN definition_trait_id text,
  ADD COLUMN definition_trait_version text,
  ADD COLUMN created_by uuid,
  ADD CONSTRAINT observations_created_by_fk
    FOREIGN KEY (workspace_id, created_by) REFERENCES workspace_memberships(workspace_id, user_id);
UPDATE observations observation
SET definition_trait_id = definition.trait_id,
    definition_trait_version = definition.trait_version
FROM observation_definitions definition
WHERE definition.id = observation.definition_id;
ALTER TABLE observations
  ALTER COLUMN definition_trait_id SET NOT NULL,
  ALTER COLUMN definition_trait_version SET NOT NULL;

ALTER TABLE observation_revisions
  ADD COLUMN revision_number integer,
  ADD COLUMN definition_id uuid REFERENCES observation_definitions(id),
  ADD COLUMN authority observation_authority NOT NULL DEFAULT 'research_draft',
  ADD COLUMN unit_id uuid REFERENCES measurement_units(id),
  ADD COLUMN term_id uuid REFERENCES controlled_terms(id),
  ADD COLUMN quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN missing_reason text,
  ADD COLUMN device_provenance jsonb,
  ADD COLUMN observer_timestamp timestamptz NOT NULL DEFAULT now();

WITH ranked_revisions AS (
  SELECT id,
         workspace_id,
         observation_id,
         row_number() OVER (
           PARTITION BY workspace_id, observation_id
           ORDER BY created_at, id
         )::integer AS revision_number
  FROM observation_revisions
)
UPDATE observation_revisions revision
SET definition_id = observation.definition_id,
    revision_number = ranked.revision_number
FROM observations observation,
     ranked_revisions ranked
WHERE observation.workspace_id = revision.workspace_id
  AND observation.id = revision.observation_id
  AND ranked.id = revision.id
  AND ranked.workspace_id = revision.workspace_id
  AND ranked.observation_id = revision.observation_id;
ALTER TABLE observation_revisions
  ALTER COLUMN revision_number SET NOT NULL,
  ALTER COLUMN definition_id SET NOT NULL,
  ADD CONSTRAINT observation_revisions_revision_number_unique
    UNIQUE (workspace_id, observation_id, revision_number),
  ADD CONSTRAINT observation_revisions_quality_flags_check
    CHECK (jsonb_typeof(quality_flags) = 'array');
CREATE UNIQUE INDEX observation_revisions_single_successor_idx
  ON observation_revisions(workspace_id, supersedes_revision_id)
  WHERE supersedes_revision_id IS NOT NULL;

ALTER TABLE observation_sessions DROP CONSTRAINT IF EXISTS observation_sessions_state_check;
ALTER TABLE observation_sessions DROP CONSTRAINT IF EXISTS observation_sessions_check;
ALTER TABLE observation_sessions
  ADD COLUMN state_version integer NOT NULL DEFAULT 1 CHECK (state_version > 0),
  ADD COLUMN paused_by uuid,
  ADD COLUMN paused_at timestamptz,
  ADD COLUMN reopened_by uuid,
  ADD COLUMN reopened_at timestamptz,
  ADD COLUMN cancelled_by uuid,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN protocol_id uuid REFERENCES capture_protocols(id),
  ADD CONSTRAINT observation_sessions_state_check
    CHECK (state IN ('planned','open','paused','closed','reopened','cancelled')),
  ADD CONSTRAINT observation_sessions_paused_by_fk
    FOREIGN KEY (workspace_id, paused_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT observation_sessions_reopened_by_fk
    FOREIGN KEY (workspace_id, reopened_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT observation_sessions_cancelled_by_fk
    FOREIGN KEY (workspace_id, cancelled_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT observation_sessions_terminal_fields_check
    CHECK (
      (state = 'closed' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
      OR (state = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
      OR state IN ('planned','open','paused','reopened')
    );

CREATE OR REPLACE FUNCTION validate_observation_revision_linearity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_revision uuid;
  expected_number integer;
  observation_definition uuid;
  observation_authority_value observation_authority;
BEGIN
  SELECT current_revision_id, definition_id, authority
  INTO current_revision, observation_definition, observation_authority_value
  FROM observations
  WHERE workspace_id = NEW.workspace_id AND id = NEW.observation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'observation does not exist'; END IF;
  IF NEW.definition_id <> observation_definition THEN
    RAISE EXCEPTION 'observation definition identity and version are immutable';
  END IF;
  IF NEW.authority <> observation_authority_value THEN
    RAISE EXCEPTION 'observation revision authority must match its aggregate';
  END IF;
  IF current_revision IS NULL THEN
    IF NEW.supersedes_revision_id IS NOT NULL THEN RAISE EXCEPTION 'initial observation revision cannot supersede another revision'; END IF;
    expected_number := 1;
  ELSE
    IF NEW.supersedes_revision_id IS DISTINCT FROM current_revision THEN
      RAISE EXCEPTION 'stale observation correction; supplied predecessor is not current';
    END IF;
    SELECT revision_number + 1 INTO expected_number
    FROM observation_revisions
    WHERE workspace_id = NEW.workspace_id AND id = current_revision;
  END IF;
  IF NEW.revision_number <> expected_number THEN
    RAISE EXCEPTION 'observation revision number must be %', expected_number;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER observation_revisions_validate_linearity
BEFORE INSERT ON observation_revisions
FOR EACH ROW EXECUTE FUNCTION validate_observation_revision_linearity();

CREATE OR REPLACE FUNCTION guard_observation_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.definition_id IS DISTINCT FROM OLD.definition_id
     OR NEW.definition_trait_id IS DISTINCT FROM OLD.definition_trait_id
     OR NEW.definition_trait_version IS DISTINCT FROM OLD.definition_trait_version
     OR NEW.authority IS DISTINCT FROM OLD.authority
     OR NEW.material_id IS DISTINCT FROM OLD.material_id THEN
    RAISE EXCEPTION 'observation identity, definition version, material, and authority are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER observations_identity_guard
BEFORE UPDATE ON observations
FOR EACH ROW EXECUTE FUNCTION guard_observation_identity();

ALTER TABLE simulation_runs
  ADD COLUMN calculation_authority simulation_calculation_authority,
  ADD COLUMN premise_authority simulation_premise_authority,
  ADD COLUMN interpretation_authority simulation_interpretation_authority,
  ADD COLUMN engine_version text,
  ADD COLUMN input_hash text,
  ADD COLUMN parent_direction jsonb,
  ADD COLUMN evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN genotype_call_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN random_seed text,
  ADD COLUMN sample_count bigint,
  ADD COLUMN diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE simulation_runs
SET calculation_authority = CASE
      WHEN authority = 'exact_supported' THEN 'exact'::simulation_calculation_authority
      WHEN authority IN ('conditional_supported','hypothesis_only') THEN 'approximate'::simulation_calculation_authority
      ELSE 'unsupported'::simulation_calculation_authority END,
    premise_authority = CASE
      WHEN normalized_input::text LIKE '%"conflicting"%' THEN 'conflicting'::simulation_premise_authority
      WHEN normalized_input::text LIKE '%"assumed"%' THEN 'assumed'::simulation_premise_authority
      WHEN normalized_input::text LIKE '%"inferred"%' THEN 'inferred'::simulation_premise_authority
      WHEN normalized_input::text LIKE '%"verified"%' THEN 'verified'::simulation_premise_authority
      ELSE 'unknown'::simulation_premise_authority END,
    interpretation_authority = 'genotype_only',
    engine_version = model_version,
    input_hash = content_hash,
    parent_direction = jsonb_build_object('preserved', true);
ALTER TABLE simulation_runs
  ALTER COLUMN calculation_authority SET NOT NULL,
  ALTER COLUMN premise_authority SET NOT NULL,
  ALTER COLUMN interpretation_authority SET NOT NULL,
  ALTER COLUMN engine_version SET NOT NULL,
  ALTER COLUMN input_hash SET NOT NULL,
  ALTER COLUMN parent_direction SET NOT NULL,
  ADD CONSTRAINT simulation_runs_input_hash_check CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT simulation_runs_evidence_ids_array CHECK (jsonb_typeof(evidence_ids) = 'array'),
  ADD CONSTRAINT simulation_runs_genotype_call_ids_array CHECK (jsonb_typeof(genotype_call_ids) = 'array'),
  ADD CONSTRAINT simulation_runs_stochastic_metadata_check CHECK (
    model_type NOT IN ('direct_monte_carlo','linked_monte_carlo','conditional_monte_carlo')
    OR (calculation_authority = 'approximate' AND random_seed IS NOT NULL AND sample_count IS NOT NULL AND sample_count > 0)
  );

-- Runtime authority and immutability for normalized scientific records.
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'reference_assemblies','catalog_alleles','sequence_variants','structural_variants',
    'catalog_markers','catalog_assays','measurement_units','controlled_vocabularies'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write()',
      target || '_runtime_authority', target
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_approved_scientific_record_mutation()',
      target || '_immutable_after_approval', target
    );
  END LOOP;
END
$$;

CREATE TRIGGER catalog_release_alleles_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_alleles
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write();
CREATE TRIGGER catalog_release_sequence_variants_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_sequence_variants
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write();
CREATE TRIGGER catalog_release_structural_variants_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_structural_variants
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write();
CREATE TRIGGER catalog_release_markers_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_markers
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write();
CREATE TRIGGER catalog_release_assays_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_assays
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write();

CREATE OR REPLACE FUNCTION validate_catalog_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = 'approved' AND (TG_OP = 'INSERT' OR OLD.state <> 'approved') THEN
    IF NOT EXISTS (SELECT 1 FROM catalog_release_loci WHERE release_id = NEW.id) THEN
      RAISE EXCEPTION 'catalog release must contain at least one locus before publication';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM catalog_release_assertions WHERE release_id = NEW.id) THEN
      RAISE EXCEPTION 'catalog release must contain at least one evidence assertion before publication';
    END IF;
    IF EXISTS (
      SELECT 1 FROM catalog_release_loci release_locus
      JOIN loci locus ON locus.id = release_locus.locus_id
      WHERE release_locus.release_id = NEW.id
        AND (locus.review_state <> 'approved' OR release_locus.record_hash <> locus.content_hash)
    ) THEN RAISE EXCEPTION 'catalog release contains unapproved loci or mismatched locus hashes'; END IF;
    IF EXISTS (
      SELECT 1 FROM catalog_release_assertions release_assertion
      JOIN evidence_assertions assertion ON assertion.id = release_assertion.assertion_id
      WHERE release_assertion.release_id = NEW.id
        AND (assertion.review_state <> 'approved' OR release_assertion.record_hash <> assertion.content_hash)
    ) THEN RAISE EXCEPTION 'catalog release contains unapproved assertions or mismatched assertion hashes'; END IF;
    IF EXISTS (
      SELECT 1 FROM catalog_release_assertions release_assertion
      WHERE release_assertion.release_id = NEW.id
        AND NOT EXISTS (SELECT 1 FROM evidence_assertion_sources source_link WHERE source_link.assertion_id = release_assertion.assertion_id)
    ) THEN RAISE EXCEPTION 'catalog release contains an evidence assertion without a source link'; END IF;
    IF EXISTS (
      SELECT 1 FROM catalog_release_assertions release_assertion
      JOIN evidence_assertion_sources source_link ON source_link.assertion_id = release_assertion.assertion_id
      JOIN scientific_sources source ON source.id = source_link.source_id
      WHERE release_assertion.release_id = NEW.id AND source.review_state <> 'approved'
    ) THEN RAISE EXCEPTION 'catalog release contains evidence backed by an unapproved source'; END IF;
    IF EXISTS (
      SELECT 1 FROM catalog_release_loci release_locus
      WHERE release_locus.release_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM catalog_release_alleles release_allele
          JOIN catalog_alleles allele ON allele.id = release_allele.allele_id
          WHERE release_allele.release_id = NEW.id
            AND allele.locus_id = release_locus.locus_id
            AND allele.review_state = 'approved'
            AND release_allele.record_hash = allele.content_hash
        )
    ) THEN RAISE EXCEPTION 'every published locus requires at least one approved, hash-matched allele'; END IF;
    IF EXISTS (
      SELECT 1 FROM catalog_release_alleles release_allele
      JOIN catalog_alleles allele ON allele.id = release_allele.allele_id
      WHERE release_allele.release_id = NEW.id
        AND (allele.review_state <> 'approved' OR release_allele.record_hash <> allele.content_hash)
    ) THEN RAISE EXCEPTION 'catalog release contains unapproved alleles or mismatched allele hashes'; END IF;
    IF EXISTS (
      SELECT 1 FROM phenotype_rules rule
      WHERE rule.catalog_release_id = NEW.id AND rule.review_state <> 'approved'
    ) THEN RAISE EXCEPTION 'catalog release contains unapproved phenotype rules'; END IF;
    IF EXISTS (
      SELECT 1 FROM phenotype_rules rule
      WHERE rule.catalog_release_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM catalog_release_assertions release_assertion
          WHERE release_assertion.release_id = NEW.id
            AND release_assertion.assertion_id = rule.supporting_assertion_id
        )
    ) THEN RAISE EXCEPTION 'catalog phenotype rule references an assertion outside the release'; END IF;
  END IF;
  RETURN NEW;
END
$$;

COMMIT;
