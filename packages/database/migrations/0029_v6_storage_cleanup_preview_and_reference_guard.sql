BEGIN;

ALTER TABLE pending_object_uploads DROP CONSTRAINT IF EXISTS pending_object_uploads_purpose_check;
ALTER TABLE pending_object_uploads ADD CONSTRAINT pending_object_uploads_purpose_check
  CHECK (purpose IN ('media_upload','research_source','discovered_orphan'));

CREATE OR REPLACE FUNCTION app_pending_object_reference_count(
  p_workspace_id uuid,
  p_object_key text,
  p_content_sha256 text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT (
    (SELECT count(*) FROM media_objects
      WHERE workspace_id=p_workspace_id AND object_key=p_object_key AND source_sha256=p_content_sha256)
    + (SELECT count(*) FROM research_documents
      WHERE workspace_id=p_workspace_id AND object_key=p_object_key AND source_sha256=p_content_sha256)
    + (SELECT count(*) FROM research_extraction_artifacts
      WHERE workspace_id=p_workspace_id AND object_key=p_object_key AND artifact_sha256=p_content_sha256)
    + (SELECT count(*) FROM immutable_artifacts
      WHERE workspace_id=p_workspace_id AND object_key=p_object_key AND content_sha256=p_content_sha256)
    + (SELECT count(*) FROM export_jobs
      WHERE workspace_id=p_workspace_id AND object_key=p_object_key AND content_sha256=p_content_sha256)
    + (SELECT count(*) FROM media_derivatives
      WHERE workspace_id=p_workspace_id AND object_key=p_object_key AND result_sha256=p_content_sha256)
    + (SELECT count(*) FROM model_versions
      WHERE workspace_id=p_workspace_id AND artifact_object_key=p_object_key)
  )::integer
$$;

CREATE OR REPLACE FUNCTION app_worker_enqueue_storage_cleanup()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO jobs(workspace_id,job_type,contract_version,payload,payload_sha256,idempotency_key,trace_id,created_by,available_at,max_attempts)
  SELECT candidate.workspace_id, 'storage.cleanup.v1', '1.0.0',
         jsonb_build_object(
           'workspaceId',candidate.workspace_id,
           'scheduledHour',date_trunc('hour',now()),
           'dryRun',false,
           'retentionHours',24,
           'deletionLimit',100,
           'scanLimit',500,
           'prefix','workspaces/' || candidate.workspace_id::text || '/'
         ),
         encode(digest(convert_to(jsonb_build_object(
           'workspaceId',candidate.workspace_id,
           'scheduledHour',date_trunc('hour',now()),
           'dryRun',false,
           'retentionHours',24,
           'deletionLimit',100,
           'scanLimit',500,
           'prefix','workspaces/' || candidate.workspace_id::text || '/'
         )::text,'UTF8'),'sha256'),'hex'),
         'storage-cleanup:' || to_char(date_trunc('hour',now()),'YYYYMMDDHH24'),
         'scheduled-storage-cleanup', owner_membership.user_id, now(), 5
  FROM (
    SELECT DISTINCT workspace_id FROM pending_object_uploads
    WHERE state IN ('cleanup_requested','stored')
      AND created_at <= now() - interval '24 hours'
      AND (state='cleanup_requested' OR expires_at <= now())
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

CREATE OR REPLACE FUNCTION app_worker_reconcile_discovered_storage_object(
  p_job_id uuid,
  p_worker_id text,
  p_object_key text,
  p_source_sha256 text,
  p_byte_length bigint,
  p_last_modified timestamptz,
  p_register boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  job_row jobs%ROWTYPE;
  required_prefix text;
  retention_hours integer;
  existing pending_object_uploads%ROWTYPE;
BEGIN
  SELECT * INTO job_row FROM jobs WHERE id=p_job_id FOR SHARE;
  IF job_row.id IS NULL OR job_row.job_type <> 'storage.cleanup.v1'
     OR job_row.state NOT IN ('running','cancel_requested')
     OR job_row.lease_owner IS DISTINCT FROM p_worker_id
     OR job_row.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active storage-cleanup reconciliation lease';
  END IF;
  required_prefix := 'workspaces/' || job_row.workspace_id::text || '/';
  retention_hours := greatest(1,least(COALESCE(NULLIF(job_row.payload->>'retentionHours','')::integer,24),8760));
  IF COALESCE(job_row.payload->>'prefix','') <> required_prefix OR p_object_key NOT LIKE required_prefix || '%' THEN
    RAISE EXCEPTION 'discovered object is outside the cleanup workspace prefix';
  END IF;
  IF p_source_sha256 !~ '^[a-f0-9]{64}$' OR p_object_key NOT LIKE '%' || p_source_sha256 || '.%' OR p_byte_length <= 0 THEN
    RETURN 'invalid_content_address';
  END IF;
  IF p_last_modified > now() - make_interval(hours => retention_hours) THEN RETURN 'within_retention'; END IF;
  IF app_pending_object_reference_count(job_row.workspace_id,p_object_key,p_source_sha256) > 0 THEN RETURN 'referenced'; END IF;
  SELECT * INTO existing FROM pending_object_uploads
    WHERE workspace_id=job_row.workspace_id AND object_key=p_object_key FOR SHARE;
  IF existing.id IS NOT NULL THEN RETURN 'tracked'; END IF;
  IF NOT p_register THEN RETURN 'orphan_candidate'; END IF;

  INSERT INTO pending_object_uploads(
    workspace_id,purpose,client_request_id,object_key,source_sha256,byte_length,media_type,state,expires_at,created_by,created_at,stored_at,last_error_code,last_error_detail
  ) VALUES (
    job_row.workspace_id,'discovered_orphan',
    'discovered:' || substr(encode(digest(convert_to(p_object_key,'UTF8'),'sha256'),'hex'),1,64),
    p_object_key,p_source_sha256,p_byte_length,'application/octet-stream','cleanup_requested',
    p_last_modified,job_row.created_by,p_last_modified,p_last_modified,'discovered_untracked_object',
    jsonb_build_object('discoveredByJobId',job_row.id,'discoveredAt',now())
  ) ON CONFLICT (workspace_id,object_key) DO NOTHING;
  RETURN 'registered_orphan';
END
$$;

CREATE OR REPLACE FUNCTION app_worker_preview_pending_object_cleanup(
  p_job_id uuid,
  p_worker_id text,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  object_key text,
  source_sha256 text,
  created_at timestamptz,
  expires_at timestamptz,
  cleanup_reason text,
  reference_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  job_row jobs%ROWTYPE;
  requested_limit integer;
  retention_hours integer;
  required_prefix text;
BEGIN
  SELECT * INTO job_row FROM jobs WHERE jobs.id=p_job_id FOR SHARE;
  IF job_row.id IS NULL OR job_row.job_type <> 'storage.cleanup.v1'
     OR job_row.state NOT IN ('running','cancel_requested')
     OR job_row.lease_owner IS DISTINCT FROM p_worker_id
     OR job_row.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active storage-cleanup preview lease';
  END IF;

  requested_limit := greatest(1,least(COALESCE(NULLIF(job_row.payload->>'deletionLimit','')::integer,p_limit),500));
  requested_limit := least(requested_limit,greatest(1,least(p_limit,500)));
  retention_hours := greatest(1,least(COALESCE(NULLIF(job_row.payload->>'retentionHours','')::integer,24),8760));
  required_prefix := 'workspaces/' || job_row.workspace_id::text || '/';
  IF COALESCE(job_row.payload->>'prefix','') <> required_prefix THEN
    RAISE EXCEPTION 'storage-cleanup prefix is not bound to the job workspace';
  END IF;

  RETURN QUERY
  SELECT pending.id,
         pending.object_key,
         pending.source_sha256,
         pending.created_at,
         pending.expires_at,
         CASE WHEN pending.state='cleanup_requested' THEN 'failed_or_unattached_upload' ELSE 'expired_unattached_upload' END,
         app_pending_object_reference_count(pending.workspace_id,pending.object_key,pending.source_sha256)
  FROM pending_object_uploads pending
  WHERE pending.workspace_id=job_row.workspace_id
    AND pending.object_key LIKE required_prefix || '%'
    AND pending.state IN ('cleanup_requested','stored')
    AND pending.created_at <= now() - make_interval(hours => retention_hours)
    AND (pending.state='cleanup_requested' OR pending.expires_at <= now())
    AND app_pending_object_reference_count(pending.workspace_id,pending.object_key,pending.source_sha256)=0
  ORDER BY pending.created_at,pending.id
  LIMIT requested_limit;
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
SET row_security = off
AS $$
DECLARE
  job_row jobs%ROWTYPE;
  requested_limit integer;
  retention_hours integer;
  required_prefix text;
BEGIN
  SELECT * INTO job_row FROM jobs WHERE id=p_job_id FOR SHARE;
  IF job_row.id IS NULL OR job_row.job_type <> 'storage.cleanup.v1' OR job_row.state NOT IN ('running','cancel_requested')
     OR job_row.lease_owner IS DISTINCT FROM p_worker_id OR job_row.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active storage-cleanup lease';
  END IF;
  IF COALESCE((job_row.payload->>'dryRun')::boolean,false) THEN
    RAISE EXCEPTION 'dry-run cleanup jobs may not claim objects for deletion';
  END IF;

  requested_limit := greatest(1,least(COALESCE(NULLIF(job_row.payload->>'deletionLimit','')::integer,p_limit),500));
  requested_limit := least(requested_limit,greatest(1,least(p_limit,500)));
  retention_hours := greatest(1,least(COALESCE(NULLIF(job_row.payload->>'retentionHours','')::integer,24),8760));
  required_prefix := 'workspaces/' || job_row.workspace_id::text || '/';
  IF COALESCE(job_row.payload->>'prefix','') <> required_prefix THEN
    RAISE EXCEPTION 'storage-cleanup prefix is not bound to the job workspace';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT pending.id
    FROM pending_object_uploads pending
    WHERE pending.workspace_id=job_row.workspace_id
      AND pending.object_key LIKE required_prefix || '%'
      AND pending.state IN ('cleanup_requested','stored')
      AND pending.created_at <= now() - make_interval(hours => retention_hours)
      AND (pending.state='cleanup_requested' OR pending.expires_at <= now())
      AND app_pending_object_reference_count(pending.workspace_id,pending.object_key,pending.source_sha256)=0
    ORDER BY pending.created_at,pending.id
    FOR UPDATE SKIP LOCKED
    LIMIT requested_limit
  ), updated AS (
    UPDATE pending_object_uploads pending
    SET state='delete_claimed', cleanup_job_id=p_job_id
    FROM candidates
    WHERE pending.id=candidates.id
      AND app_pending_object_reference_count(pending.workspace_id,pending.object_key,pending.source_sha256)=0
    RETURNING pending.*
  ) SELECT * FROM updated;
END
$$;

CREATE OR REPLACE FUNCTION app_worker_record_storage_cleanup_preview(
  p_job_id uuid,
  p_worker_id text,
  p_candidate_count integer,
  p_sample jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE job_row jobs%ROWTYPE;
BEGIN
  SELECT * INTO job_row FROM jobs WHERE id=p_job_id FOR SHARE;
  IF job_row.id IS NULL OR job_row.job_type <> 'storage.cleanup.v1'
     OR job_row.lease_owner IS DISTINCT FROM p_worker_id OR job_row.lease_expires_at <= now()
     OR NOT COALESCE((job_row.payload->>'dryRun')::boolean,false) THEN
    RAISE EXCEPTION 'worker does not own an active dry-run storage-cleanup lease';
  END IF;
  INSERT INTO audit_events(workspace_id,actor_user_id,action,entity_type,entity_id,after_state,request_id)
  VALUES(job_row.workspace_id,NULL,'storage.cleanup_previewed','job',job_row.id,
         jsonb_build_object('candidateCount',greatest(0,p_candidate_count),'sample',COALESCE(p_sample,'[]'::jsonb)),job_row.trace_id);
END
$$;

UPDATE job_contracts
SET active=true,
    worker_capability='storage.cleanup',
    payload_schema='{"type":"object","required":["workspaceId","dryRun","retentionHours","deletionLimit","scanLimit","prefix"],"properties":{"dryRun":{"type":"boolean"},"retentionHours":{"type":"integer","minimum":1,"maximum":8760},"deletionLimit":{"type":"integer","minimum":1,"maximum":500},"scanLimit":{"type":"integer","minimum":1,"maximum":1000},"prefix":{"type":"string"}}}'::jsonb,
    result_schema='{"type":"object","required":["mode","candidates","deleted","failed"],"properties":{"mode":{"enum":["dry_run","delete"]},"candidates":{"type":"integer"},"deleted":{"type":"integer"},"failed":{"type":"integer"}}}'::jsonb
WHERE job_type='storage.cleanup.v1' AND contract_version='1.0.0';

REVOKE ALL ON FUNCTION app_pending_object_reference_count(uuid,text,text) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_reconcile_discovered_storage_object(uuid,text,text,text,bigint,timestamptz,boolean) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_preview_pending_object_cleanup(uuid,text,integer) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_record_storage_cleanup_preview(uuid,text,integer,jsonb) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_enqueue_storage_cleanup() FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_claim_pending_object_cleanup(uuid,text,integer) FROM PUBLIC, capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_worker_reconcile_discovered_storage_object(uuid,text,text,text,bigint,timestamptz,boolean) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_preview_pending_object_cleanup(uuid,text,integer) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_record_storage_cleanup_preview(uuid,text,integer,jsonb) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_enqueue_storage_cleanup() TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_claim_pending_object_cleanup(uuid,text,integer) TO capsicum_worker;

COMMIT;
