BEGIN;

CREATE TYPE pending_object_state AS ENUM (
  'registered',
  'stored',
  'attached',
  'cleanup_requested',
  'delete_claimed',
  'deleted',
  'failed'
);

CREATE TABLE pending_object_uploads (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  purpose text NOT NULL CHECK (purpose IN ('media_upload','research_source')),
  client_request_id text NOT NULL CHECK (length(client_request_id) BETWEEN 8 AND 200),
  object_key text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length > 0),
  media_type text NOT NULL CHECK (length(trim(media_type)) > 0),
  state pending_object_state NOT NULL DEFAULT 'registered',
  reference_type text,
  reference_id uuid,
  cleanup_job_id uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  stored_at timestamptz,
  attached_at timestamptz,
  deleted_at timestamptz,
  last_error_code text,
  last_error_detail jsonb,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, purpose, client_request_id),
  UNIQUE (workspace_id, object_key),
  FOREIGN KEY (workspace_id, created_by) REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, cleanup_job_id) REFERENCES jobs(workspace_id, id),
  CHECK (object_key LIKE 'workspaces/' || workspace_id::text || '/%'),
  CHECK ((state IN ('stored','attached','cleanup_requested','delete_claimed','deleted')) = (stored_at IS NOT NULL)),
  CHECK ((state = 'attached') = (reference_type IS NOT NULL AND reference_id IS NOT NULL AND attached_at IS NOT NULL)),
  CHECK ((state = 'deleted') = (deleted_at IS NOT NULL))
);
CREATE INDEX pending_object_cleanup_idx
  ON pending_object_uploads(state, expires_at, created_at)
  WHERE state IN ('stored','cleanup_requested','failed');

ALTER TABLE pending_object_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_object_uploads FORCE ROW LEVEL SECURITY;
CREATE POLICY pending_object_uploads_select
  ON pending_object_uploads FOR SELECT
  USING (app_workspace_access_allowed(workspace_id));

CREATE OR REPLACE FUNCTION app_register_pending_object_upload(
  p_purpose text,
  p_client_request_id text,
  p_object_key text,
  p_source_sha256 text,
  p_byte_length bigint,
  p_media_type text,
  p_retention_seconds integer DEFAULT 86400
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing pending_object_uploads%ROWTYPE;
  created_id uuid := uuidv7();
BEGIN
  IF app_current_workspace_id() IS NULL OR app_current_actor_user_id() IS NULL THEN
    RAISE EXCEPTION 'workspace and actor context are required';
  END IF;
  IF p_purpose NOT IN ('media_upload','research_source') THEN RAISE EXCEPTION 'unsupported pending object purpose'; END IF;
  IF p_object_key NOT LIKE 'workspaces/' || app_current_workspace_id()::text || '/%' THEN
    RAISE EXCEPTION 'pending object key is outside the active workspace prefix';
  END IF;
  IF p_source_sha256 !~ '^[a-f0-9]{64}$' OR p_byte_length <= 0 THEN
    RAISE EXCEPTION 'pending object integrity metadata is invalid';
  END IF;
  IF p_retention_seconds < 3600 OR p_retention_seconds > 604800 THEN
    RAISE EXCEPTION 'pending object retention must be between one hour and seven days';
  END IF;

  INSERT INTO pending_object_uploads(
    id, workspace_id, purpose, client_request_id, object_key, source_sha256,
    byte_length, media_type, created_by, expires_at
  ) VALUES (
    created_id, app_current_workspace_id(), p_purpose, p_client_request_id,
    p_object_key, p_source_sha256, p_byte_length, p_media_type,
    app_current_actor_user_id(), now() + make_interval(secs => p_retention_seconds)
  )
  ON CONFLICT (workspace_id, purpose, client_request_id) DO NOTHING;

  SELECT * INTO existing
  FROM pending_object_uploads
  WHERE workspace_id = app_current_workspace_id()
    AND purpose = p_purpose
    AND client_request_id = p_client_request_id
  FOR UPDATE;
  IF existing.id IS NULL THEN RAISE EXCEPTION 'pending object registration failed'; END IF;
  IF existing.object_key <> p_object_key OR existing.source_sha256 <> p_source_sha256
     OR existing.byte_length <> p_byte_length OR existing.media_type <> p_media_type THEN
    RAISE EXCEPTION 'pending object request identifier conflicts with different content';
  END IF;
  RETURN existing.id;
END
$$;

CREATE OR REPLACE FUNCTION app_mark_pending_object_stored(p_pending_id uuid)
RETURNS pending_object_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE current_row pending_object_uploads%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM pending_object_uploads
  WHERE workspace_id = app_current_workspace_id() AND id = p_pending_id FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'pending object was not found'; END IF;
  IF current_row.state = 'registered' THEN
    UPDATE pending_object_uploads SET state='stored', stored_at=now(), last_error_code=NULL, last_error_detail=NULL
    WHERE id=current_row.id;
    RETURN 'stored';
  END IF;
  IF current_row.state IN ('stored','attached') THEN RETURN current_row.state; END IF;
  RAISE EXCEPTION 'pending object cannot be marked stored from state %', current_row.state;
END
$$;

CREATE OR REPLACE FUNCTION app_fail_pending_object_upload(
  p_pending_id uuid,
  p_object_persisted boolean,
  p_error_code text,
  p_error_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS pending_object_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE current_row pending_object_uploads%ROWTYPE; next_state pending_object_state;
BEGIN
  SELECT * INTO current_row FROM pending_object_uploads
  WHERE workspace_id = app_current_workspace_id() AND id = p_pending_id FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'pending object was not found'; END IF;
  IF current_row.state = 'attached' THEN RETURN current_row.state; END IF;
  next_state := CASE WHEN p_object_persisted OR current_row.stored_at IS NOT NULL THEN 'cleanup_requested'::pending_object_state ELSE 'failed'::pending_object_state END;
  UPDATE pending_object_uploads
  SET state=next_state,
      stored_at=CASE WHEN p_object_persisted AND stored_at IS NULL THEN now() ELSE stored_at END,
      last_error_code=left(coalesce(nullif(trim(p_error_code),''),'upload_failed'),200),
      last_error_detail=coalesce(p_error_detail,'{}'::jsonb)
  WHERE id=current_row.id;
  RETURN next_state;
END
$$;

CREATE OR REPLACE FUNCTION app_attach_pending_object_upload(
  p_pending_id uuid,
  p_reference_type text,
  p_reference_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE current_row pending_object_uploads%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM pending_object_uploads
  WHERE workspace_id = app_current_workspace_id() AND id = p_pending_id FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'pending object was not found'; END IF;
  IF current_row.state = 'attached' THEN
    IF current_row.reference_type = p_reference_type AND current_row.reference_id = p_reference_id THEN RETURN; END IF;
    RAISE EXCEPTION 'pending object is already attached to a different authority record';
  END IF;
  IF current_row.state <> 'stored' THEN RAISE EXCEPTION 'pending object must be stored before attachment'; END IF;
  IF p_reference_type = 'media_object' THEN
    IF NOT EXISTS (SELECT 1 FROM media_objects WHERE workspace_id=app_current_workspace_id() AND id=p_reference_id AND object_key=current_row.object_key AND source_sha256=current_row.source_sha256) THEN
      RAISE EXCEPTION 'media reference does not match the pending object';
    END IF;
  ELSIF p_reference_type = 'research_document' THEN
    IF NOT EXISTS (SELECT 1 FROM research_documents WHERE workspace_id=app_current_workspace_id() AND id=p_reference_id AND object_key=current_row.object_key AND source_sha256=current_row.source_sha256) THEN
      RAISE EXCEPTION 'research reference does not match the pending object';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported pending object reference type';
  END IF;
  UPDATE pending_object_uploads
  SET state='attached', reference_type=p_reference_type, reference_id=p_reference_id, attached_at=now()
  WHERE id=current_row.id;
END
$$;

CREATE OR REPLACE FUNCTION app_worker_enqueue_storage_cleanup()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO jobs(workspace_id,job_type,contract_version,payload,payload_sha256,idempotency_key,trace_id,created_by,available_at,max_attempts)
  SELECT candidate.workspace_id, 'storage.cleanup.v1', '1.0.0',
         jsonb_build_object('workspaceId',candidate.workspace_id,'scheduledHour',date_trunc('hour',now())),
         encode(digest(convert_to(jsonb_build_object('workspaceId',candidate.workspace_id,'scheduledHour',date_trunc('hour',now()))::text,'UTF8'),'sha256'),'hex'),
         'storage-cleanup:' || to_char(date_trunc('hour',now()),'YYYYMMDDHH24'),
         'scheduled-storage-cleanup', owner_membership.user_id, now(), 5
  FROM (
    SELECT DISTINCT workspace_id FROM pending_object_uploads
    WHERE state IN ('cleanup_requested','stored') AND (state='cleanup_requested' OR expires_at <= now())
  ) candidate
  JOIN LATERAL (
    SELECT user_id FROM workspace_memberships
    WHERE workspace_id=candidate.workspace_id AND role='owner' AND state='active'
    ORDER BY created_at LIMIT 1
  ) owner_membership ON true
  ON CONFLICT (workspace_id,job_type,idempotency_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$$;

CREATE OR REPLACE FUNCTION app_worker_claim_pending_object_cleanup(
  p_job_id uuid,
  p_worker_id text,
  p_limit integer DEFAULT 100
)
RETURNS SETOF pending_object_uploads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE job_row jobs%ROWTYPE;
BEGIN
  SELECT * INTO job_row FROM jobs WHERE id=p_job_id FOR SHARE;
  IF job_row.id IS NULL OR job_row.job_type <> 'storage.cleanup.v1' OR job_row.state NOT IN ('running','cancel_requested')
     OR job_row.lease_owner IS DISTINCT FROM p_worker_id OR job_row.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active storage-cleanup lease';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM pending_object_uploads
    WHERE workspace_id=job_row.workspace_id
      AND state IN ('cleanup_requested','stored')
      AND (state='cleanup_requested' OR expires_at <= now())
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1,least(p_limit,500))
  ), updated AS (
    UPDATE pending_object_uploads pending
    SET state='delete_claimed', cleanup_job_id=p_job_id
    FROM candidates
    WHERE pending.id=candidates.id
    RETURNING pending.*
  ) SELECT * FROM updated;
END
$$;

CREATE OR REPLACE FUNCTION app_worker_finalize_pending_object_cleanup(
  p_job_id uuid,
  p_worker_id text,
  p_pending_id uuid,
  p_deleted boolean,
  p_error_code text DEFAULT NULL
)
RETURNS pending_object_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE job_row jobs%ROWTYPE; current_row pending_object_uploads%ROWTYPE;
BEGIN
  SELECT * INTO job_row FROM jobs WHERE id=p_job_id FOR SHARE;
  IF job_row.id IS NULL OR job_row.job_type <> 'storage.cleanup.v1' OR job_row.lease_owner IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION 'worker does not own storage-cleanup finalization authority';
  END IF;
  SELECT * INTO current_row FROM pending_object_uploads
  WHERE workspace_id=job_row.workspace_id AND id=p_pending_id FOR UPDATE;
  IF current_row.id IS NULL OR current_row.state <> 'delete_claimed' OR current_row.cleanup_job_id IS DISTINCT FROM p_job_id THEN
    RAISE EXCEPTION 'pending object is not claimed by this cleanup job';
  END IF;
  IF p_deleted THEN
    UPDATE pending_object_uploads SET state='deleted', deleted_at=now(), last_error_code=NULL, last_error_detail=NULL WHERE id=current_row.id;
    INSERT INTO audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,after_state,request_id)
    VALUES(job_row.workspace_id,NULL,'storage.orphan_deleted','pending_object_upload',current_row.id,jsonb_build_object('objectKey',current_row.object_key,'sourceSha256',current_row.source_sha256),job_row.trace_id);
    RETURN 'deleted';
  END IF;
  UPDATE pending_object_uploads
  SET state='cleanup_requested', cleanup_job_id=NULL, last_error_code=left(coalesce(p_error_code,'object_delete_failed'),200), last_error_detail=jsonb_build_object('failedAt',now())
  WHERE id=current_row.id;
  RETURN 'cleanup_requested';
END
$$;

UPDATE job_contracts
SET active=true,
    worker_capability='storage.cleanup',
    payload_schema='{"type":"object","required":["workspaceId","scheduledHour"]}'::jsonb,
    result_schema='{"type":"object","required":["claimed","deleted","failed"]}'::jsonb
WHERE job_type='storage.cleanup.v1' AND contract_version='1.0.0';

REVOKE ALL ON TABLE pending_object_uploads FROM PUBLIC, capsicum_runtime, capsicum_worker;
GRANT SELECT ON TABLE pending_object_uploads TO capsicum_runtime;
GRANT SELECT ON TABLE pending_object_uploads TO capsicum_worker;
REVOKE ALL ON FUNCTION app_register_pending_object_upload(text,text,text,text,bigint,text,integer) FROM PUBLIC, capsicum_worker;
REVOKE ALL ON FUNCTION app_mark_pending_object_stored(uuid) FROM PUBLIC, capsicum_worker;
REVOKE ALL ON FUNCTION app_fail_pending_object_upload(uuid,boolean,text,jsonb) FROM PUBLIC, capsicum_worker;
REVOKE ALL ON FUNCTION app_attach_pending_object_upload(uuid,text,uuid) FROM PUBLIC, capsicum_worker;
GRANT EXECUTE ON FUNCTION app_register_pending_object_upload(text,text,text,text,bigint,text,integer) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_mark_pending_object_stored(uuid) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_fail_pending_object_upload(uuid,boolean,text,jsonb) TO capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_attach_pending_object_upload(uuid,text,uuid) TO capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_enqueue_storage_cleanup() FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_claim_pending_object_cleanup(uuid,text,integer) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_finalize_pending_object_cleanup(uuid,text,uuid,boolean,text) FROM PUBLIC, capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_worker_enqueue_storage_cleanup() TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_claim_pending_object_cleanup(uuid,text,integer) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_finalize_pending_object_cleanup(uuid,text,uuid,boolean,text) TO capsicum_worker;

COMMIT;
