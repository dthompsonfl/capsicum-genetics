BEGIN;

-- Canonical browser authoring is append-only. Curators may create draft versions,
-- but may not rewrite scientific identity after insertion. Review fields remain
-- governed by the independently reviewed transition service from migration 0017.
CREATE OR REPLACE FUNCTION guard_runtime_catalog_record_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor uuid;
  actor_role membership_role;
  old_state review_state;
  new_state review_state;
BEGIN
  IF NOT app_is_runtime_session() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  actor := app_current_actor_user_id();
  actor_role := app_current_membership_role();
  IF actor IS NULL OR actor_role IS NULL THEN
    RAISE EXCEPTION 'catalog mutation requires an active authenticated workspace membership';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF actor_role NOT IN ('owner', 'catalog_curator') THEN
      RAISE EXCEPTION 'catalog authoring requires owner or catalog_curator';
    END IF;
    IF to_jsonb(NEW) ? 'authored_by' AND NEW.authored_by <> actor THEN
      RAISE EXCEPTION 'catalog record author must match authenticated actor';
    END IF;
    IF NEW.review_state <> 'draft' THEN
      RAISE EXCEPTION 'new catalog records must begin as drafts';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scientific catalog versions are append-only';
  END IF;

  old_state := OLD.review_state;
  new_state := NEW.review_state;
  IF new_state <> 'approved' AND (NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'non-approved scientific records cannot name an approver';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['review_state','approved_by','approved_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['review_state','approved_by','approved_at']) THEN
    RAISE EXCEPTION 'scientific catalog versions are immutable; create a new version';
  END IF;

  IF new_state = 'in_review' AND old_state IN ('draft', 'changes_requested') THEN
    IF actor_role NOT IN ('owner', 'catalog_curator') THEN
      RAISE EXCEPTION 'catalog submission requires owner or catalog_curator';
    END IF;
    RETURN NEW;
  END IF;

  IF new_state IN ('approved', 'changes_requested', 'rejected') AND old_state = 'in_review' THEN
    IF actor_role NOT IN ('owner', 'scientific_reviewer') THEN
      RAISE EXCEPTION 'catalog review transitions require owner or scientific_reviewer';
    END IF;
    IF NEW.approved_by IS NOT NULL AND NEW.approved_by <> actor THEN
      RAISE EXCEPTION 'catalog approval actor does not match authenticated actor';
    END IF;
    RETURN NEW;
  END IF;

  IF new_state = old_state THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'illegal scientific catalog review transition from % to %', old_state, new_state;
END
$$;

CREATE OR REPLACE FUNCTION guard_runtime_allele_alias_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_role membership_role;
  target_state review_state;
  target_author uuid;
BEGIN
  IF NOT app_is_runtime_session() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  actor_role := app_current_membership_role();
  IF actor_role NOT IN ('owner', 'catalog_curator') THEN
    RAISE EXCEPTION 'allele alias authoring requires owner or catalog_curator';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'allele aliases are append-only; create a new allele version to correct notation';
  END IF;
  SELECT review_state, authored_by INTO target_state, target_author
  FROM catalog_alleles WHERE id = NEW.allele_id;
  IF target_state <> 'draft' OR target_author <> app_current_actor_user_id() THEN
    RAISE EXCEPTION 'aliases may only be attached to the authenticated author''s draft allele';
  END IF;
  IF NEW.source_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM scientific_sources WHERE id = NEW.source_id AND review_state = 'approved'
  ) THEN
    RAISE EXCEPTION 'allele aliases may cite only approved scientific sources';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS allele_aliases_runtime_authority ON allele_aliases;
CREATE TRIGGER allele_aliases_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON allele_aliases
FOR EACH ROW EXECUTE FUNCTION guard_runtime_allele_alias_write();

GRANT INSERT ON TABLE
  reference_assemblies,
  catalog_alleles,
  allele_aliases,
  sequence_variants,
  structural_variants,
  catalog_markers,
  catalog_assays
TO capsicum_runtime;

REVOKE UPDATE, DELETE ON TABLE
  reference_assemblies,
  catalog_alleles,
  allele_aliases,
  sequence_variants,
  structural_variants,
  catalog_markers,
  catalog_assays
FROM capsicum_runtime;

GRANT UPDATE (review_state, approved_by, approved_at) ON TABLE
  reference_assemblies,
  catalog_alleles,
  sequence_variants,
  structural_variants,
  catalog_markers,
  catalog_assays
TO capsicum_runtime;

COMMIT;
