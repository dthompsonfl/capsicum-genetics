BEGIN;

-- QR values are opaque locators. Biological identity remains a workspace-scoped
-- database record; neither workspace IDs nor internal material IDs are encoded.
ALTER TABLE material_labels ADD COLUMN public_token uuid;
UPDATE material_labels SET public_token = uuidv7() WHERE public_token IS NULL;
ALTER TABLE material_labels ALTER COLUMN public_token SET NOT NULL;
CREATE UNIQUE INDEX material_labels_public_token_unique_idx ON material_labels(public_token);

CREATE OR REPLACE FUNCTION app_resolve_material_label_token(p_public_token uuid)
RETURNS TABLE(material_id uuid, material_code text, kind text, status text, label_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT material.id, material.material_code, material.kind::text, material.status::text, label.id
  FROM material_labels label
  JOIN biological_materials material
    ON material.workspace_id = label.workspace_id AND material.id = label.material_id
  WHERE label.workspace_id = app_current_workspace_id()
    AND label.public_token = p_public_token
    AND label.revoked_at IS NULL
    AND app_workspace_access_allowed(label.workspace_id)
$$;
REVOKE ALL ON FUNCTION app_resolve_material_label_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_material_label_token(uuid) TO capsicum_runtime;

-- Scientific documents and extracted passages gain explicit independent-review
-- authority. Approval is a reviewed terminal transition, not a writable label.
ALTER TABLE research_documents
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN supersedes_document_id uuid,
  ADD COLUMN ingestion_job_id uuid,
  ADD CONSTRAINT research_documents_approved_by_fk
    FOREIGN KEY (workspace_id, approved_by) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT research_documents_supersedes_fk
    FOREIGN KEY (workspace_id, supersedes_document_id) REFERENCES research_documents(workspace_id, id),
  ADD CONSTRAINT research_documents_ingestion_job_fk
    FOREIGN KEY (workspace_id, ingestion_job_id) REFERENCES jobs(workspace_id, id);

-- V2 had no reviewer identity for workspace documents. Legacy rows cannot retain
-- an authoritative label without inventing an approver, so they return to review.
UPDATE research_documents
SET review_state = 'in_review'
WHERE review_state IN ('approved','superseded');

ALTER TABLE research_documents
  ADD CONSTRAINT research_documents_review_authority_check CHECK (
    (review_state IN ('approved','superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by <> created_by)
    OR (review_state NOT IN ('approved','superseded') AND approved_by IS NULL AND approved_at IS NULL)
  );
CREATE UNIQUE INDEX research_documents_single_successor_idx
  ON research_documents(workspace_id, supersedes_document_id)
  WHERE supersedes_document_id IS NOT NULL;

CREATE TABLE research_document_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  decision review_state NOT NULL,
  rationale text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, document_id) REFERENCES research_documents(workspace_id, id),
  FOREIGN KEY (workspace_id, reviewer_id) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (decision IN ('approved','changes_requested','rejected')),
  CHECK (length(trim(rationale)) >= 10)
);

CREATE TABLE research_passage_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  passage_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  decision review_state NOT NULL,
  rationale text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, passage_id) REFERENCES research_passages(workspace_id, id),
  FOREIGN KEY (workspace_id, reviewer_id) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (decision IN ('approved','changes_requested','rejected')),
  CHECK (length(trim(rationale)) >= 10)
);

CREATE TRIGGER research_document_reviews_append_only
BEFORE UPDATE OR DELETE ON research_document_reviews
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER research_passage_reviews_append_only
BEFORE UPDATE OR DELETE ON research_passage_reviews
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE OR REPLACE FUNCTION guard_research_document_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_has_role(current_user, 'capsicum_runtime', 'member')
     AND COALESCE(current_setting('app.authority_function', true), '') NOT IN ('research_document_review','research_document_submit')
     AND (
       NEW.review_state IS DISTINCT FROM OLD.review_state
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     ) THEN
    RAISE EXCEPTION 'research document review state may only change through canonical review authority';
  END IF;
  IF OLD.review_state IN ('approved','superseded') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'approved research documents are immutable; create a superseding version';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER research_documents_authority_guard
BEFORE UPDATE ON research_documents FOR EACH ROW EXECUTE FUNCTION guard_research_document_authority();

CREATE OR REPLACE FUNCTION guard_research_passage_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_has_role(current_user, 'capsicum_runtime', 'member')
     AND COALESCE(current_setting('app.authority_function', true), '') NOT IN ('research_passage_review','research_passage_submit')
     AND (
       NEW.review_state IS DISTINCT FROM OLD.review_state
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     ) THEN
    RAISE EXCEPTION 'research passage review state may only change through canonical review authority';
  END IF;
  IF OLD.review_state IN ('approved','superseded') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'approved research passages are immutable; create a superseding version';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER research_passages_authority_guard
BEFORE UPDATE ON research_passages FOR EACH ROW EXECUTE FUNCTION guard_research_passage_authority();

CREATE OR REPLACE FUNCTION app_submit_research_document(p_document_id uuid)
RETURNS review_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  document research_documents%ROWTYPE;
BEGIN
  IF NOT app_workspace_access_allowed(workspace)
     OR app_current_membership_role() NOT IN ('owner','administrator','catalog_curator','scientific_reviewer') THEN
    RAISE EXCEPTION 'research curation authority is required';
  END IF;
  SELECT * INTO document FROM research_documents
  WHERE workspace_id = workspace AND id = p_document_id FOR UPDATE;
  IF document.id IS NULL OR document.review_state NOT IN ('draft','changes_requested') THEN
    RAISE EXCEPTION 'research document is not eligible for submission';
  END IF;
  IF document.created_by <> actor AND app_current_membership_role() NOT IN ('owner','administrator','catalog_curator') THEN
    RAISE EXCEPTION 'only the author or a curator may submit this document';
  END IF;
  PERFORM set_config('app.authority_function', 'research_document_submit', true);
  UPDATE research_documents SET review_state = 'in_review'
  WHERE workspace_id = workspace AND id = document.id;
  RETURN 'in_review'::review_state;
END
$$;

CREATE OR REPLACE FUNCTION app_submit_research_passage(p_passage_id uuid)
RETURNS review_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  passage research_passages%ROWTYPE;
BEGIN
  IF NOT app_workspace_access_allowed(workspace)
     OR app_current_membership_role() NOT IN ('owner','administrator','catalog_curator','scientific_reviewer') THEN
    RAISE EXCEPTION 'research curation authority is required';
  END IF;
  SELECT * INTO passage FROM research_passages
  WHERE workspace_id = workspace AND id = p_passage_id FOR UPDATE;
  IF passage.id IS NULL OR passage.review_state NOT IN ('draft','changes_requested') THEN
    RAISE EXCEPTION 'research passage is not eligible for submission';
  END IF;
  IF passage.authored_by IS NULL THEN RAISE EXCEPTION 'research passage requires a human author before submission'; END IF;
  IF passage.authored_by <> actor AND app_current_membership_role() NOT IN ('owner','administrator','catalog_curator') THEN
    RAISE EXCEPTION 'only the author or a curator may submit this passage';
  END IF;
  PERFORM set_config('app.authority_function', 'research_passage_submit', true);
  UPDATE research_passages SET review_state = 'in_review'
  WHERE workspace_id = workspace AND id = passage.id;
  RETURN 'in_review'::review_state;
END
$$;

CREATE OR REPLACE FUNCTION app_review_research_document(
  p_document_id uuid,
  p_decision review_state,
  p_rationale text
)
RETURNS review_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  document research_documents%ROWTYPE;
BEGIN
  IF NOT app_workspace_access_allowed(workspace)
     OR app_current_membership_role() NOT IN ('owner','scientific_reviewer') THEN
    RAISE EXCEPTION 'independent scientific reviewer authority is required';
  END IF;
  IF p_decision NOT IN ('approved','changes_requested','rejected') OR length(trim(p_rationale)) < 10 THEN
    RAISE EXCEPTION 'valid decision and scientific rationale are required';
  END IF;
  SELECT * INTO document FROM research_documents
  WHERE workspace_id = workspace AND id = p_document_id FOR UPDATE;
  IF document.id IS NULL OR document.review_state <> 'in_review' THEN
    RAISE EXCEPTION 'research document is not awaiting review';
  END IF;
  IF document.created_by = actor THEN RAISE EXCEPTION 'authors cannot approve or review their own research documents'; END IF;
  INSERT INTO research_document_reviews(workspace_id, document_id, reviewer_id, decision, rationale)
  VALUES (workspace, document.id, actor, p_decision, trim(p_rationale));
  PERFORM set_config('app.authority_function', 'research_document_review', true);
  UPDATE research_documents
  SET review_state = p_decision,
      approved_by = CASE WHEN p_decision = 'approved' THEN actor ELSE NULL END,
      approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END
  WHERE workspace_id = workspace AND id = document.id;
  RETURN p_decision;
END
$$;

CREATE OR REPLACE FUNCTION app_review_research_passage(
  p_passage_id uuid,
  p_decision review_state,
  p_rationale text
)
RETURNS review_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  workspace uuid := app_current_workspace_id();
  actor uuid := app_current_actor_user_id();
  passage research_passages%ROWTYPE;
BEGIN
  IF NOT app_workspace_access_allowed(workspace)
     OR app_current_membership_role() NOT IN ('owner','scientific_reviewer') THEN
    RAISE EXCEPTION 'independent scientific reviewer authority is required';
  END IF;
  IF p_decision NOT IN ('approved','changes_requested','rejected') OR length(trim(p_rationale)) < 10 THEN
    RAISE EXCEPTION 'valid decision and scientific rationale are required';
  END IF;
  SELECT * INTO passage FROM research_passages
  WHERE workspace_id = workspace AND id = p_passage_id FOR UPDATE;
  IF passage.id IS NULL OR passage.review_state <> 'in_review' THEN
    RAISE EXCEPTION 'research passage is not awaiting review';
  END IF;
  IF passage.authored_by = actor THEN RAISE EXCEPTION 'authors cannot approve or review their own passages'; END IF;
  INSERT INTO research_passage_reviews(workspace_id, passage_id, reviewer_id, decision, rationale)
  VALUES (workspace, passage.id, actor, p_decision, trim(p_rationale));
  PERFORM set_config('app.authority_function', 'research_passage_review', true);
  UPDATE research_passages
  SET review_state = p_decision,
      approved_by = CASE WHEN p_decision = 'approved' THEN actor ELSE NULL END,
      approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END
  WHERE workspace_id = workspace AND id = passage.id;
  RETURN p_decision;
END
$$;

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['research_document_reviews','research_passage_reviews'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY active_membership_workspace_isolation ON %I USING (app_workspace_access_allowed(workspace_id)) WITH CHECK (app_workspace_access_allowed(workspace_id))',
      target
    );
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION app_submit_research_document(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_submit_research_passage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_review_research_document(uuid,review_state,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_review_research_passage(uuid,review_state,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_submit_research_document(uuid) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_submit_research_passage(uuid) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_review_research_document(uuid,review_state,text) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_review_research_passage(uuid,review_state,text) TO capsicum_runtime;

COMMIT;
