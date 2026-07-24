BEGIN;

ALTER TABLE catalog_releases
  ADD COLUMN governing_workspace_id uuid REFERENCES workspaces(id),
  ADD COLUMN authored_by uuid REFERENCES users(id),
  ADD COLUMN release_review_state review_state NOT NULL DEFAULT 'draft',
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN reviewed_by uuid REFERENCES users(id),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_rationale text,
  ADD COLUMN publication_schema_version text NOT NULL DEFAULT 'legacy-v3',
  ADD COLUMN content_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE catalog_releases
SET authored_by = published_by,
    release_review_state = CASE WHEN state = 'approved' THEN 'approved'::review_state ELSE 'draft'::review_state END,
    reviewed_by = CASE WHEN state = 'approved' THEN published_by ELSE NULL END,
    reviewed_at = CASE WHEN state = 'approved' THEN published_at ELSE NULL END,
    review_rationale = CASE WHEN state = 'approved' THEN 'Legacy V3 release; independent V4 release review was not recorded.' ELSE NULL END
WHERE publication_schema_version = 'legacy-v3';

ALTER TABLE catalog_releases
  ADD CONSTRAINT catalog_releases_v4_governance_check CHECK (
    publication_schema_version <> 'v4'
    OR (
      governing_workspace_id IS NOT NULL
      AND authored_by IS NOT NULL
      AND (
        release_review_state IN ('draft', 'in_review', 'changes_requested', 'rejected')
        OR (
          release_review_state = 'approved'
          AND reviewed_by IS NOT NULL
          AND reviewed_at IS NOT NULL
          AND review_rationale IS NOT NULL
          AND length(trim(review_rationale)) >= 10
          AND reviewed_by <> authored_by
        )
      )
      AND (state <> 'approved' OR release_review_state = 'approved')
    )
  );

CREATE TABLE catalog_release_sources (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  source_id uuid NOT NULL REFERENCES scientific_sources(id),
  record_hash text NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (release_id, source_id)
);

CREATE TABLE catalog_release_assemblies (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  assembly_id uuid NOT NULL REFERENCES reference_assemblies(id),
  record_hash text NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (release_id, assembly_id)
);

CREATE TABLE catalog_release_passages (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  workspace_id uuid NOT NULL,
  passage_id uuid NOT NULL,
  record_hash text NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (release_id, workspace_id, passage_id),
  FOREIGN KEY (workspace_id, passage_id) REFERENCES research_passages(workspace_id, id)
);

CREATE TABLE catalog_release_capture_protocols (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  protocol_id uuid NOT NULL REFERENCES capture_protocols(id),
  record_hash text NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (release_id, protocol_id)
);

CREATE TABLE catalog_release_observation_definitions (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  definition_id uuid NOT NULL REFERENCES observation_definitions(id),
  record_hash text NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (release_id, definition_id)
);

CREATE INDEX catalog_releases_governing_workspace_idx
  ON catalog_releases(governing_workspace_id, created_at DESC)
  WHERE publication_schema_version = 'v4';
CREATE INDEX catalog_release_passages_workspace_idx
  ON catalog_release_passages(workspace_id, passage_id);

CREATE OR REPLACE FUNCTION guard_runtime_catalog_publication_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor uuid;
  actor_role membership_role;
  review_only boolean;
BEGIN
  IF NOT app_is_runtime_session() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  actor := app_current_actor_user_id();
  actor_role := app_current_membership_role();
  IF actor IS NULL OR actor_role IS NULL THEN
    RAISE EXCEPTION 'catalog release mutation requires an active authenticated workspace membership';
  END IF;

  IF TG_TABLE_NAME = 'catalog_releases' THEN
    IF TG_OP = 'INSERT' THEN
      IF actor_role NOT IN ('owner', 'catalog_curator') THEN
        RAISE EXCEPTION 'catalog release drafting requires owner or catalog_curator';
      END IF;
      IF NEW.publication_schema_version = 'v4'
         AND (NEW.authored_by <> actor OR NEW.governing_workspace_id <> app_current_workspace_id()) THEN
        RAISE EXCEPTION 'catalog release author and workspace must match authenticated context';
      END IF;
      RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
      IF actor_role NOT IN ('owner', 'catalog_curator') OR OLD.state = 'approved' THEN
        RAISE EXCEPTION 'published catalog releases cannot be deleted';
      END IF;
      RETURN OLD;
    END IF;

    review_only := NEW.state = OLD.state
      AND NEW.content_hash = OLD.content_hash
      AND NEW.content_manifest = OLD.content_manifest
      AND NEW.version = OLD.version
      AND NEW.governing_workspace_id IS NOT DISTINCT FROM OLD.governing_workspace_id
      AND NEW.authored_by IS NOT DISTINCT FROM OLD.authored_by
      AND (
        NEW.release_review_state IS DISTINCT FROM OLD.release_review_state
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
        OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
        OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
        OR NEW.review_rationale IS DISTINCT FROM OLD.review_rationale
      );

    IF review_only THEN
      IF actor_role NOT IN ('owner', 'scientific_reviewer') THEN
        RAISE EXCEPTION 'catalog release review requires owner or scientific_reviewer';
      END IF;
      IF NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by <> actor THEN
        RAISE EXCEPTION 'catalog release reviewer does not match authenticated actor';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.state = 'approved' AND OLD.state <> 'approved' THEN
      IF actor_role <> 'owner' OR NEW.published_by <> actor THEN
        RAISE EXCEPTION 'catalog publication requires the authenticated workspace owner';
      END IF;
      RETURN NEW;
    END IF;

    IF actor_role NOT IN ('owner', 'catalog_curator') THEN
      RAISE EXCEPTION 'catalog release drafting requires owner or catalog_curator';
    END IF;
    RETURN NEW;
  END IF;

  IF actor_role NOT IN ('owner', 'catalog_curator') THEN
    RAISE EXCEPTION 'catalog release membership writes require owner or catalog_curator';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION guard_catalog_release_membership_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_release_id uuid;
  target_state review_state;
  target_review_state review_state;
BEGIN
  target_release_id := COALESCE(NEW.release_id, OLD.release_id);
  SELECT state, release_review_state
  INTO target_state, target_review_state
  FROM catalog_releases
  WHERE id = target_release_id;
  IF target_state = 'approved' OR target_review_state IN ('in_review', 'approved') THEN
    RAISE EXCEPTION 'catalog release membership is locked during review and after publication';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION require_independent_catalog_release_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.publication_schema_version = 'v4' AND NEW.release_review_state = 'approved' THEN
    IF NEW.reviewed_by = NEW.authored_by THEN
      RAISE EXCEPTION 'catalog release authors cannot approve their own release';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM scientific_reviews review
      WHERE review.entity_type = 'catalog_releases'
        AND review.entity_id = NEW.id
        AND review.author_user_id = NEW.authored_by
        AND review.reviewer_user_id = NEW.reviewed_by
        AND review.decision = 'approved'
    ) THEN
      RAISE EXCEPTION 'approved V4 catalog release requires a matching independent scientific review';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE CONSTRAINT TRIGGER catalog_releases_require_independent_review
AFTER INSERT OR UPDATE ON catalog_releases
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_independent_catalog_release_review();

CREATE OR REPLACE FUNCTION validate_catalog_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.state = 'approved') THEN
    RETURN NEW;
  END IF;

  IF NEW.publication_schema_version = 'v4' THEN
    IF NEW.release_review_state <> 'approved' OR NEW.reviewed_by IS NULL OR NEW.reviewed_by = NEW.authored_by THEN
      RAISE EXCEPTION 'V4 catalog release requires independent release approval before publication';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM catalog_release_sources WHERE release_id = NEW.id) THEN
      RAISE EXCEPTION 'V4 catalog release requires at least one approved scientific source';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM catalog_release_alleles WHERE release_id = NEW.id) THEN
      RAISE EXCEPTION 'V4 catalog release requires normalized approved alleles';
    END IF;
    IF EXISTS (
      SELECT 1 FROM catalog_release_loci rl
      WHERE rl.release_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM catalog_release_alleles ra
          JOIN catalog_alleles allele ON allele.id = ra.allele_id
          WHERE ra.release_id = NEW.id AND allele.locus_id = rl.locus_id
        )
    ) THEN
      RAISE EXCEPTION 'every V4 release locus requires at least one normalized allele';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM catalog_release_loci WHERE release_id = NEW.id) THEN
    RAISE EXCEPTION 'catalog release must contain at least one locus before publication';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM catalog_release_assertions WHERE release_id = NEW.id) THEN
    RAISE EXCEPTION 'catalog release must contain at least one evidence assertion before publication';
  END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_loci member JOIN loci record ON record.id = member.locus_id
    WHERE member.release_id = NEW.id AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash)
  ) THEN RAISE EXCEPTION 'catalog release contains unapproved loci or mismatched locus hashes'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_assertions member JOIN evidence_assertions record ON record.id = member.assertion_id
    WHERE member.release_id = NEW.id AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash)
  ) THEN RAISE EXCEPTION 'catalog release contains unapproved assertions or mismatched assertion hashes'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_sources member JOIN scientific_sources record ON record.id = member.source_id
    WHERE member.release_id = NEW.id AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash)
  ) THEN RAISE EXCEPTION 'catalog release contains unapproved sources or mismatched source hashes'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_assemblies member JOIN reference_assemblies record ON record.id = member.assembly_id
    WHERE member.release_id = NEW.id AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash)
  ) THEN RAISE EXCEPTION 'catalog release contains unapproved assemblies or mismatched assembly hashes'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_alleles member JOIN catalog_alleles record ON record.id = member.allele_id
    WHERE member.release_id = NEW.id
      AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash
           OR NOT EXISTS (SELECT 1 FROM catalog_release_loci rl WHERE rl.release_id = NEW.id AND rl.locus_id = record.locus_id))
  ) THEN RAISE EXCEPTION 'catalog release contains invalid allele membership'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_sequence_variants member JOIN sequence_variants record ON record.id = member.variant_id
    WHERE member.release_id = NEW.id
      AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash
           OR NOT EXISTS (SELECT 1 FROM catalog_release_assemblies ra WHERE ra.release_id = NEW.id AND ra.assembly_id = record.assembly_id)
           OR (record.locus_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_release_loci rl WHERE rl.release_id = NEW.id AND rl.locus_id = record.locus_id))
           OR (record.allele_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_release_alleles ral WHERE ral.release_id = NEW.id AND ral.allele_id = record.allele_id)))
  ) THEN RAISE EXCEPTION 'catalog release contains invalid sequence-variant membership'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_structural_variants member JOIN structural_variants record ON record.id = member.variant_id
    WHERE member.release_id = NEW.id
      AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash
           OR NOT EXISTS (SELECT 1 FROM catalog_release_assemblies ra WHERE ra.release_id = NEW.id AND ra.assembly_id = record.assembly_id)
           OR (record.locus_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_release_loci rl WHERE rl.release_id = NEW.id AND rl.locus_id = record.locus_id))
           OR (record.allele_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_release_alleles ral WHERE ral.release_id = NEW.id AND ral.allele_id = record.allele_id)))
  ) THEN RAISE EXCEPTION 'catalog release contains invalid structural-variant membership'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_markers member JOIN catalog_markers record ON record.id = member.marker_id
    WHERE member.release_id = NEW.id
      AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash
           OR (record.locus_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_release_loci rl WHERE rl.release_id = NEW.id AND rl.locus_id = record.locus_id))
           OR (record.assembly_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_release_assemblies ra WHERE ra.release_id = NEW.id AND ra.assembly_id = record.assembly_id)))
  ) THEN RAISE EXCEPTION 'catalog release contains invalid marker membership'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_assays member JOIN catalog_assays record ON record.id = member.assay_id
    WHERE member.release_id = NEW.id
      AND (record.review_state <> 'approved' OR member.record_hash <> record.content_hash
           OR (record.marker_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_release_markers rm WHERE rm.release_id = NEW.id AND rm.marker_id = record.marker_id))
           OR (record.locus_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_release_loci rl WHERE rl.release_id = NEW.id AND rl.locus_id = record.locus_id)))
  ) THEN RAISE EXCEPTION 'catalog release contains invalid assay membership'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_passages member JOIN research_passages record
      ON record.workspace_id = member.workspace_id AND record.id = member.passage_id
    WHERE member.release_id = NEW.id AND (record.review_state <> 'approved' OR member.record_hash <> record.passage_sha256)
  ) THEN RAISE EXCEPTION 'catalog release contains unapproved passages or mismatched passage hashes'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_capture_protocols member JOIN capture_protocols record ON record.id = member.protocol_id
    WHERE member.release_id = NEW.id AND record.review_state <> 'approved'
  ) THEN RAISE EXCEPTION 'catalog release contains unapproved capture protocols'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_observation_definitions member JOIN observation_definitions record ON record.id = member.definition_id
    WHERE member.release_id = NEW.id AND (record.review_state <> 'approved' OR record.content_hash IS NULL OR member.record_hash <> record.content_hash)
  ) THEN RAISE EXCEPTION 'catalog release contains invalid observation definitions'; END IF;
  IF EXISTS (
    SELECT 1 FROM phenotype_rules rule
    WHERE rule.catalog_release_id = NEW.id
      AND (rule.review_state <> 'approved'
           OR NOT EXISTS (SELECT 1 FROM catalog_release_assertions ra WHERE ra.release_id = NEW.id AND ra.assertion_id = rule.supporting_assertion_id))
  ) THEN RAISE EXCEPTION 'catalog release contains invalid executable rules'; END IF;

  RETURN NEW;
END
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'catalog_release_loci', 'catalog_release_assertions', 'catalog_release_alleles',
    'catalog_release_sequence_variants', 'catalog_release_structural_variants',
    'catalog_release_markers', 'catalog_release_assays', 'catalog_release_sources',
    'catalog_release_assemblies', 'catalog_release_passages',
    'catalog_release_capture_protocols', 'catalog_release_observation_definitions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_guard ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_catalog_release_membership_mutation()', table_name, table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_runtime_authority ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_runtime_authority BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write()', table_name, table_name);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE catalog_releases TO capsicum_runtime;
GRANT SELECT, INSERT ON TABLE
  catalog_release_sources,
  catalog_release_assemblies,
  catalog_release_passages,
  catalog_release_capture_protocols,
  catalog_release_observation_definitions
TO capsicum_runtime;
GRANT SELECT, INSERT ON TABLE
  catalog_release_loci,
  catalog_release_assertions,
  catalog_release_alleles,
  catalog_release_sequence_variants,
  catalog_release_structural_variants,
  catalog_release_markers,
  catalog_release_assays
TO capsicum_runtime;


-- Every normalized scientific record uses the same independent-review and
-- immutable-version authority as the original source/locus/assertion catalog.
DROP TRIGGER IF EXISTS observation_definitions_runtime_authority ON observation_definitions;
CREATE TRIGGER observation_definitions_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON observation_definitions
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();
DROP TRIGGER IF EXISTS observation_definitions_immutable_after_approval ON observation_definitions;
CREATE TRIGGER observation_definitions_immutable_after_approval
BEFORE UPDATE OR DELETE ON observation_definitions
FOR EACH ROW EXECUTE FUNCTION reject_approved_scientific_record_mutation();

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'reference_assemblies', 'catalog_alleles', 'sequence_variants',
    'structural_variants', 'catalog_markers', 'catalog_assays',
    'observation_definitions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', target || '_require_independent_approval', target);
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_independent_scientific_approval()',
      target || '_require_independent_approval', target
    );
  END LOOP;
END
$$;

-- Normalized scientific records remain authored through import/curation paths, but
-- their review transitions are available to the canonical application service.
GRANT UPDATE (review_state, approved_by, approved_at) ON TABLE
  reference_assemblies,
  catalog_alleles,
  sequence_variants,
  structural_variants,
  catalog_markers,
  catalog_assays,
  observation_definitions
TO capsicum_runtime;

COMMIT;
