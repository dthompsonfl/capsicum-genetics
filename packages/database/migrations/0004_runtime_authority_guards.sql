BEGIN;

-- Global scientific catalog tables cannot use workspace RLS because releases are shared.
-- Runtime writes therefore require an authenticated active-workspace principal and a
-- database-enforced role check. Migration/maintenance owners remain able to perform
-- controlled imports and repair work outside the application runtime role.
CREATE OR REPLACE FUNCTION app_current_membership_role()
RETURNS membership_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT membership.role
  FROM workspace_memberships membership
  WHERE membership.workspace_id = app_current_workspace_id()
    AND membership.user_id = app_current_actor_user_id()
    AND membership.state = 'active'
$$;
REVOKE ALL ON FUNCTION app_current_membership_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_current_membership_role() TO capsicum_runtime;

CREATE OR REPLACE FUNCTION app_is_runtime_session()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT pg_has_role(current_user, 'capsicum_runtime', 'member')
$$;
REVOKE ALL ON FUNCTION app_is_runtime_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_runtime_session() TO capsicum_runtime;

CREATE OR REPLACE FUNCTION guard_runtime_catalog_record_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_role membership_role;
  old_state review_state;
  new_state review_state;
BEGIN
  IF NOT app_is_runtime_session() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  actor_role := app_current_membership_role();
  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'catalog mutation requires an active authenticated workspace membership';
  END IF;

  old_state := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.review_state END;
  new_state := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.review_state END;

  IF TG_OP = 'UPDATE' AND new_state IN ('approved', 'changes_requested', 'rejected')
     AND new_state IS DISTINCT FROM old_state THEN
    IF actor_role NOT IN ('owner', 'scientific_reviewer') THEN
      RAISE EXCEPTION 'catalog review transitions require owner or scientific_reviewer';
    END IF;
    IF NEW.approved_by IS NOT NULL AND NEW.approved_by <> app_current_actor_user_id() THEN
      RAISE EXCEPTION 'catalog approval actor does not match authenticated actor';
    END IF;
  ELSIF actor_role NOT IN ('owner', 'catalog_curator') THEN
    RAISE EXCEPTION 'catalog authoring requires owner or catalog_curator';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER scientific_sources_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON scientific_sources
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();
CREATE TRIGGER loci_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON loci
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();
CREATE TRIGGER evidence_assertions_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON evidence_assertions
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();
CREATE TRIGGER phenotype_rules_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON phenotype_rules
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();
CREATE TRIGGER capture_protocols_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON capture_protocols
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();

CREATE OR REPLACE FUNCTION guard_runtime_scientific_review_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_role membership_role;
BEGIN
  IF NOT app_is_runtime_session() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  actor_role := app_current_membership_role();
  IF actor_role NOT IN ('owner', 'scientific_reviewer') THEN
    RAISE EXCEPTION 'scientific review writes require owner or scientific_reviewer';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'scientific reviews are append-only';
  END IF;
  IF NEW.reviewer_user_id <> app_current_actor_user_id() THEN
    RAISE EXCEPTION 'scientific review actor does not match authenticated actor';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER scientific_reviews_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON scientific_reviews
FOR EACH ROW EXECUTE FUNCTION guard_runtime_scientific_review_write();

CREATE OR REPLACE FUNCTION guard_runtime_catalog_publication_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT app_is_runtime_session() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF app_current_membership_role() <> 'owner' THEN
    RAISE EXCEPTION 'catalog publication requires the workspace owner role';
  END IF;
  IF TG_TABLE_NAME = 'catalog_releases' AND TG_OP <> 'DELETE'
     AND NEW.published_by IS NOT NULL
     AND NEW.published_by <> app_current_actor_user_id() THEN
    RAISE EXCEPTION 'catalog publisher does not match authenticated actor';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER catalog_releases_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON catalog_releases
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write();
CREATE TRIGGER catalog_release_loci_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_loci
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write();
CREATE TRIGGER catalog_release_assertions_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON catalog_release_assertions
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write();

CREATE OR REPLACE FUNCTION guard_runtime_assertion_source_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app_is_runtime_session() AND app_current_membership_role() NOT IN ('owner', 'catalog_curator') THEN
    RAISE EXCEPTION 'evidence source-link writes require owner or catalog_curator';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER evidence_assertion_sources_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON evidence_assertion_sources
FOR EACH ROW EXECUTE FUNCTION guard_runtime_assertion_source_write();


-- Tighten publication semantics for the executable catalog: evidence-free releases
-- are not scientifically meaningful even when they contain reviewed locus names.
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


-- Scientific image records are correction-only. A correction creates a new
-- annotation row and references exactly one predecessor; source captures never mutate.
CREATE UNIQUE INDEX phenotype_annotations_single_successor_idx
  ON phenotype_annotations(workspace_id, supersedes_annotation_id)
  WHERE supersedes_annotation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_phenotype_annotation_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  previous_capture_id uuid;
  previous_revision integer;
BEGIN
  IF NEW.supersedes_annotation_id IS NULL THEN
    IF NEW.revision <> 1 THEN
      RAISE EXCEPTION 'initial phenotype annotation revision must be 1';
    END IF;
  ELSE
    SELECT capture_id, revision INTO previous_capture_id, previous_revision
    FROM phenotype_annotations
    WHERE workspace_id = NEW.workspace_id AND id = NEW.supersedes_annotation_id;
    IF previous_capture_id IS NULL OR previous_capture_id <> NEW.capture_id THEN
      RAISE EXCEPTION 'superseded annotation must belong to the same capture';
    END IF;
    IF NEW.revision <> previous_revision + 1 THEN
      RAISE EXCEPTION 'annotation revision must increment its predecessor by exactly one';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER phenotype_annotations_validate_revision
BEFORE INSERT ON phenotype_annotations
FOR EACH ROW EXECUTE FUNCTION validate_phenotype_annotation_revision();
CREATE TRIGGER phenotype_annotations_append_only
BEFORE UPDATE OR DELETE ON phenotype_annotations
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER phenotype_captures_append_only
BEFORE UPDATE OR DELETE ON phenotype_captures
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE OR REPLACE FUNCTION guard_validated_model_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'validated' THEN
    RAISE EXCEPTION 'validated model versions are immutable; create a new version or retire through a governed transition';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER model_versions_immutable_after_validation
BEFORE UPDATE OR DELETE ON model_versions
FOR EACH ROW EXECUTE FUNCTION guard_validated_model_mutation();

-- Runtime catalog imports are prohibited. The importer must use the separately held
-- migration/maintenance connection and records immutable batch provenance.
REVOKE INSERT, UPDATE, DELETE ON catalog_import_batches FROM capsicum_runtime;

COMMIT;
