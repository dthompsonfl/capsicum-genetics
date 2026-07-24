BEGIN;

CREATE OR REPLACE FUNCTION app_workspace_access_allowed(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT p_workspace_id IS NOT NULL
    AND p_workspace_id = app_current_workspace_id()
    AND EXISTS (
      SELECT 1
      FROM workspace_memberships membership
      WHERE membership.workspace_id = p_workspace_id
        AND membership.user_id = app_current_actor_user_id()
        AND membership.state = 'active'
    )
$$;
REVOKE ALL ON FUNCTION app_workspace_access_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_workspace_access_allowed(uuid) TO capsicum_runtime;

CREATE OR REPLACE FUNCTION app_valid_invitation_context(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role membership_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_invitations invitation
    JOIN users user_account ON user_account.id = p_user_id
    WHERE invitation.id = nullif(current_setting('app.invitation_id', true), '')::uuid
      AND invitation.workspace_id = p_workspace_id
      AND invitation.email = user_account.email
      AND invitation.role = p_role
      AND invitation.accepted_at IS NULL
      AND invitation.revoked_at IS NULL
      AND invitation.expires_at > now()
  )
$$;
REVOKE ALL ON FUNCTION app_valid_invitation_context(uuid, uuid, membership_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_valid_invitation_context(uuid, uuid, membership_role) TO capsicum_runtime;

CREATE OR REPLACE FUNCTION app_membership_write_allowed(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role membership_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT p_workspace_id = app_current_workspace_id()
    AND (
      app_current_membership_role() IN ('owner', 'administrator')
      OR app_valid_invitation_context(p_workspace_id, p_user_id, p_role)
      OR (
        p_user_id = app_current_actor_user_id()
        AND p_role = 'owner'
        AND EXISTS (
          SELECT 1 FROM workspaces workspace
          WHERE workspace.id = p_workspace_id
            AND workspace.created_by = p_user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM workspace_memberships membership
          WHERE membership.workspace_id = p_workspace_id
        )
      )
    )
$$;
REVOKE ALL ON FUNCTION app_membership_write_allowed(uuid, uuid, membership_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_membership_write_allowed(uuid, uuid, membership_role) TO capsicum_runtime;

-- Replace permissive workspace-id-only policies. Every authoritative workspace row
-- now requires both the selected workspace and an active membership for the actor.
DO $$
DECLARE
  target record;
  policy record;
BEGIN
  FOR target IN
    SELECT DISTINCT class.relname AS table_name
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = class.oid
    WHERE namespace.nspname = 'public'
      AND class.relkind = 'r'
      AND attribute.attname = 'workspace_id'
      AND class.relname NOT IN ('workspaces', 'workspace_memberships')
  LOOP
    FOR policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target.table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON %I', policy.policyname, target.table_name);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format(
      'CREATE POLICY active_membership_workspace_isolation ON %I USING (app_workspace_access_allowed(workspace_id)) WITH CHECK (app_workspace_access_allowed(workspace_id))',
      target.table_name
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS membership_workspace_isolation ON workspace_memberships;
DROP POLICY IF EXISTS membership_select_authority ON workspace_memberships;
DROP POLICY IF EXISTS membership_insert_authority ON workspace_memberships;
DROP POLICY IF EXISTS membership_update_authority ON workspace_memberships;
CREATE POLICY membership_select_authority ON workspace_memberships
  FOR SELECT
  USING (
    user_id = app_current_actor_user_id()
    OR app_workspace_access_allowed(workspace_id)
  );
CREATE POLICY membership_insert_authority ON workspace_memberships
  FOR INSERT
  WITH CHECK (app_membership_write_allowed(workspace_id, user_id, role));
CREATE POLICY membership_update_authority ON workspace_memberships
  FOR UPDATE
  USING (
    user_id = app_current_actor_user_id()
    OR app_workspace_access_allowed(workspace_id)
  )
  WITH CHECK (app_membership_write_allowed(workspace_id, user_id, role));

CREATE OR REPLACE FUNCTION guard_runtime_membership_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT app_is_runtime_session() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'workspace memberships are revoked through governed state transitions, not deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'workspace membership identity is immutable';
    END IF;
    IF OLD.role = 'owner' AND (
      NEW.role IS DISTINCT FROM OLD.role OR NEW.state IS DISTINCT FROM OLD.state
    ) THEN
      RAISE EXCEPTION 'workspace owner membership cannot be demoted or deactivated';
    END IF;
    IF NEW.user_id = app_current_actor_user_id() AND NEW.state <> 'active' THEN
      RAISE EXCEPTION 'an actor cannot suspend or revoke their own membership';
    END IF;
    IF app_current_membership_role() NOT IN ('owner', 'administrator')
       AND NOT app_valid_invitation_context(NEW.workspace_id, NEW.user_id, NEW.role) THEN
      RAISE EXCEPTION 'membership updates require owner/administrator authority or a valid invitation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS workspace_memberships_runtime_authority ON workspace_memberships;
CREATE TRIGGER workspace_memberships_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON workspace_memberships
FOR EACH ROW EXECUTE FUNCTION guard_runtime_membership_mutation();

COMMIT;
