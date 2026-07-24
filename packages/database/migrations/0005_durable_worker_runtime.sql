BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capsicum_worker') THEN
    CREATE ROLE capsicum_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_claim_job(
  p_worker_id text,
  p_job_types text[],
  p_lease_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  claimed jobs%ROWTYPE;
BEGIN
  IF length(trim(COALESCE(p_worker_id, ''))) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_job_types IS NULL OR cardinality(p_job_types) = 0 THEN
    RAISE EXCEPTION 'at least one accepted job type is required';
  END IF;
  IF p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'lease duration must be between 5 and 3600 seconds';
  END IF;

  WITH candidate AS (
    SELECT id
    FROM jobs
    WHERE state IN ('queued', 'failed')
      AND available_at <= now()
      AND attempt < max_attempts
      AND job_type = ANY (p_job_types)
    ORDER BY priority ASC, available_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE jobs job
  SET state = 'running',
      attempt = job.attempt + 1,
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      started_at = COALESCE(job.started_at, now()),
      cancellation_requested_at = NULL,
      last_error_code = NULL,
      last_error_detail = NULL
  FROM candidate
  WHERE job.id = candidate.id
  RETURNING job.* INTO claimed;

  IF claimed.id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO job_attempts (
    workspace_id, job_id, attempt, worker_id, started_at
  ) VALUES (
    claimed.workspace_id, claimed.id, claimed.attempt, p_worker_id, now()
  );
  INSERT INTO job_logs (workspace_id, job_id, attempt, level, event, detail)
  VALUES (
    claimed.workspace_id,
    claimed.id,
    claimed.attempt,
    'info',
    'job.claimed',
    jsonb_build_object('workerId', p_worker_id, 'leaseSeconds', p_lease_seconds)
  );

  RETURN jsonb_build_object(
    'id', claimed.id,
    'workspaceId', claimed.workspace_id,
    'jobType', claimed.job_type,
    'contractVersion', claimed.contract_version,
    'payload', claimed.payload,
    'attempt', claimed.attempt,
    'maxAttempts', claimed.max_attempts,
    'leaseExpiresAt', claimed.lease_expires_at
  );
END
$$;

CREATE OR REPLACE FUNCTION app_job_cancellation_requested(
  p_job_id uuid,
  p_worker_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT COALESCE((
    SELECT state = 'cancel_requested'
    FROM jobs
    WHERE id = p_job_id
      AND lease_owner = p_worker_id
      AND state IN ('running', 'cancel_requested')
  ), false)
$$;

CREATE OR REPLACE FUNCTION app_heartbeat_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  renewed_at timestamptz;
BEGIN
  IF p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'lease duration must be between 5 and 3600 seconds';
  END IF;
  UPDATE jobs
  SET lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  WHERE id = p_job_id
    AND lease_owner = p_worker_id
    AND state IN ('running', 'cancel_requested')
    AND lease_expires_at > now()
  RETURNING lease_expires_at INTO renewed_at;
  IF renewed_at IS NULL THEN
    RAISE EXCEPTION 'worker does not own an active lease for job %', p_job_id;
  END IF;
  RETURN renewed_at;
END
$$;

CREATE OR REPLACE FUNCTION app_complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.state <> 'running'
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id
     OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active running lease for job %', p_job_id;
  END IF;

  UPDATE jobs
  SET state = 'succeeded',
      result = p_result,
      lease_owner = NULL,
      lease_expires_at = NULL,
      completed_at = now()
  WHERE id = p_job_id;
  UPDATE job_attempts
  SET finished_at = now(), outcome = 'succeeded'
  WHERE workspace_id = current_job.workspace_id
    AND job_id = current_job.id
    AND attempt = current_job.attempt;
  INSERT INTO job_logs (workspace_id, job_id, attempt, level, event, detail)
  VALUES (current_job.workspace_id, current_job.id, current_job.attempt, 'info', 'job.succeeded', '{}'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION app_cancel_leased_job(
  p_job_id uuid,
  p_worker_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.state <> 'cancel_requested'
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id
     OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own a cancellation-requested lease for job %', p_job_id;
  END IF;
  UPDATE jobs
  SET state = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, completed_at = now()
  WHERE id = p_job_id;
  UPDATE job_attempts
  SET finished_at = now(), outcome = 'cancelled'
  WHERE workspace_id = current_job.workspace_id
    AND job_id = current_job.id
    AND attempt = current_job.attempt;
  INSERT INTO job_logs (workspace_id, job_id, attempt, level, event, detail)
  VALUES (current_job.workspace_id, current_job.id, current_job.attempt, 'info', 'job.cancelled', '{}'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION app_fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_error_detail jsonb DEFAULT '{}'::jsonb,
  p_base_delay_seconds integer DEFAULT 10
)
RETURNS job_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  next_state job_state;
  retry_delay integer;
BEGIN
  IF length(trim(COALESCE(p_error_code, ''))) = 0 THEN
    RAISE EXCEPTION 'error code is required';
  END IF;
  IF p_base_delay_seconds < 1 OR p_base_delay_seconds > 3600 THEN
    RAISE EXCEPTION 'base retry delay must be between 1 and 3600 seconds';
  END IF;
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF current_job.id IS NULL OR current_job.state <> 'running'
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id
     OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active running lease for job %', p_job_id;
  END IF;

  next_state := CASE
    WHEN current_job.attempt >= current_job.max_attempts THEN 'dead_letter'::job_state
    ELSE 'failed'::job_state
  END;
  retry_delay := LEAST(3600, p_base_delay_seconds * (2 ^ LEAST(current_job.attempt - 1, 20))::integer);

  UPDATE jobs
  SET state = next_state,
      available_at = CASE WHEN next_state = 'failed' THEN now() + make_interval(secs => retry_delay) ELSE available_at END,
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error_code = p_error_code,
      last_error_detail = COALESCE(p_error_detail, '{}'::jsonb),
      completed_at = CASE WHEN next_state = 'dead_letter' THEN now() ELSE NULL END
  WHERE id = p_job_id;
  UPDATE job_attempts
  SET finished_at = now(), outcome = next_state, error_code = p_error_code,
      error_detail = COALESCE(p_error_detail, '{}'::jsonb)
  WHERE workspace_id = current_job.workspace_id
    AND job_id = current_job.id
    AND attempt = current_job.attempt;
  INSERT INTO job_logs (workspace_id, job_id, attempt, level, event, detail)
  VALUES (
    current_job.workspace_id,
    current_job.id,
    current_job.attempt,
    'error',
    CASE WHEN next_state = 'dead_letter' THEN 'job.dead_lettered' ELSE 'job.retry_scheduled' END,
    jsonb_build_object('errorCode', p_error_code, 'retryDelaySeconds', retry_delay)
  );
  RETURN next_state;
END
$$;

CREATE OR REPLACE FUNCTION app_recover_expired_jobs(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  expired jobs%ROWTYPE;
  recovered integer := 0;
  next_state job_state;
  retry_delay integer;
BEGIN
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'recovery limit must be between 1 and 1000';
  END IF;
  FOR expired IN
    SELECT * FROM jobs
    WHERE state IN ('running', 'cancel_requested')
      AND lease_expires_at <= now()
    ORDER BY lease_expires_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    IF expired.state = 'cancel_requested' THEN
      next_state := 'cancelled';
      retry_delay := 0;
    ELSIF expired.attempt >= expired.max_attempts THEN
      next_state := 'dead_letter';
      retry_delay := 0;
    ELSE
      next_state := 'failed';
      retry_delay := LEAST(3600, 10 * (2 ^ LEAST(expired.attempt - 1, 20))::integer);
    END IF;

    UPDATE jobs
    SET state = next_state,
        available_at = CASE WHEN next_state = 'failed' THEN now() + make_interval(secs => retry_delay) ELSE available_at END,
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error_code = CASE WHEN next_state = 'cancelled' THEN last_error_code ELSE 'lease_expired' END,
        last_error_detail = CASE WHEN next_state = 'cancelled' THEN last_error_detail ELSE jsonb_build_object('recoveredAt', now()) END,
        completed_at = CASE WHEN next_state IN ('cancelled', 'dead_letter') THEN now() ELSE NULL END
    WHERE id = expired.id;
    UPDATE job_attempts
    SET finished_at = now(), outcome = next_state,
        error_code = CASE WHEN next_state = 'cancelled' THEN NULL ELSE 'lease_expired' END,
        error_detail = CASE WHEN next_state = 'cancelled' THEN NULL ELSE jsonb_build_object('recoveredAt', now()) END
    WHERE workspace_id = expired.workspace_id
      AND job_id = expired.id
      AND attempt = expired.attempt;
    INSERT INTO job_logs (workspace_id, job_id, attempt, level, event, detail)
    VALUES (
      expired.workspace_id,
      expired.id,
      expired.attempt,
      CASE WHEN next_state = 'cancelled' THEN 'info' ELSE 'warn' END,
      CASE WHEN next_state = 'cancelled' THEN 'job.cancelled_after_lease_expiry' ELSE 'job.lease_recovered' END,
      jsonb_build_object('nextState', next_state, 'retryDelaySeconds', retry_delay)
    );
    recovered := recovered + 1;
  END LOOP;
  RETURN recovered;
END
$$;


CREATE OR REPLACE FUNCTION app_claim_outbox(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  claimed transactional_outbox%ROWTYPE;
BEGIN
  IF length(trim(COALESCE(p_worker_id, ''))) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'lease duration must be between 5 and 3600 seconds';
  END IF;
  WITH candidate AS (
    SELECT id
    FROM transactional_outbox
    WHERE state IN ('pending', 'failed')
      AND available_at <= now()
      AND attempt < max_attempts
    ORDER BY available_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE transactional_outbox event
  SET state = 'publishing',
      attempt = event.attempt + 1,
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error_code = NULL
  FROM candidate
  WHERE event.id = candidate.id
  RETURNING event.* INTO claimed;
  IF claimed.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', claimed.id,
    'workspaceId', claimed.workspace_id,
    'aggregateType', claimed.aggregate_type,
    'aggregateId', claimed.aggregate_id,
    'eventType', claimed.event_type,
    'contractVersion', claimed.contract_version,
    'payload', claimed.payload,
    'attempt', claimed.attempt,
    'maxAttempts', claimed.max_attempts
  );
END
$$;

CREATE OR REPLACE FUNCTION app_complete_outbox(p_event_id uuid, p_worker_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  UPDATE transactional_outbox
  SET state = 'published', lease_owner = NULL, lease_expires_at = NULL, published_at = now()
  WHERE id = p_event_id
    AND state = 'publishing'
    AND lease_owner = p_worker_id
    AND lease_expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'worker does not own an active outbox lease for event %', p_event_id;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_fail_outbox(
  p_event_id uuid,
  p_worker_id text,
  p_error_code text,
  p_base_delay_seconds integer DEFAULT 10
)
RETURNS outbox_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_event transactional_outbox%ROWTYPE;
  next_state outbox_state;
  retry_delay integer;
BEGIN
  SELECT * INTO current_event FROM transactional_outbox WHERE id = p_event_id FOR UPDATE;
  IF current_event.id IS NULL OR current_event.state <> 'publishing'
     OR current_event.lease_owner IS DISTINCT FROM p_worker_id
     OR current_event.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active outbox lease for event %', p_event_id;
  END IF;
  next_state := CASE
    WHEN current_event.attempt >= current_event.max_attempts THEN 'dead_letter'::outbox_state
    ELSE 'failed'::outbox_state
  END;
  retry_delay := LEAST(3600, p_base_delay_seconds * (2 ^ LEAST(current_event.attempt - 1, 20))::integer);
  UPDATE transactional_outbox
  SET state = next_state,
      available_at = CASE WHEN next_state = 'failed' THEN now() + make_interval(secs => retry_delay) ELSE available_at END,
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error_code = p_error_code
  WHERE id = p_event_id;
  RETURN next_state;
END
$$;

CREATE OR REPLACE FUNCTION app_recover_expired_outbox(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  expired transactional_outbox%ROWTYPE;
  recovered integer := 0;
  next_state outbox_state;
  retry_delay integer;
BEGIN
  IF p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'recovery limit must be between 1 and 1000'; END IF;
  FOR expired IN
    SELECT * FROM transactional_outbox
    WHERE state = 'publishing' AND lease_expires_at <= now()
    ORDER BY lease_expires_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    next_state := CASE
      WHEN expired.attempt >= expired.max_attempts THEN 'dead_letter'::outbox_state
      ELSE 'failed'::outbox_state
    END;
    retry_delay := LEAST(3600, 10 * (2 ^ LEAST(expired.attempt - 1, 20))::integer);
    UPDATE transactional_outbox
    SET state = next_state,
        available_at = CASE WHEN next_state = 'failed' THEN now() + make_interval(secs => retry_delay) ELSE available_at END,
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error_code = 'lease_expired'
    WHERE id = expired.id;
    recovered := recovered + 1;
  END LOOP;
  RETURN recovered;
END
$$;

REVOKE ALL ON FUNCTION app_claim_job(text, text[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_job_cancellation_requested(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_heartbeat_job(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_complete_job(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_cancel_leased_job(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_fail_job(uuid, text, text, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_recover_expired_jobs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_claim_job(text, text[], integer) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_job_cancellation_requested(uuid, text) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_heartbeat_job(uuid, text, integer) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_complete_job(uuid, text, jsonb) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_cancel_leased_job(uuid, text) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_fail_job(uuid, text, text, jsonb, integer) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_recover_expired_jobs(integer) FROM capsicum_runtime;
GRANT USAGE ON SCHEMA public TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_claim_job(text, text[], integer) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_job_cancellation_requested(uuid, text) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_heartbeat_job(uuid, text, integer) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_complete_job(uuid, text, jsonb) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_cancel_leased_job(uuid, text) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_fail_job(uuid, text, text, jsonb, integer) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_recover_expired_jobs(integer) TO capsicum_worker;
REVOKE ALL ON FUNCTION app_claim_outbox(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_complete_outbox(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_fail_outbox(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_recover_expired_outbox(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_claim_outbox(text, integer) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_complete_outbox(uuid, text) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_fail_outbox(uuid, text, text, integer) FROM capsicum_runtime;
REVOKE ALL ON FUNCTION app_recover_expired_outbox(integer) FROM capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_claim_outbox(text, integer) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_complete_outbox(uuid, text) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_fail_outbox(uuid, text, text, integer) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_recover_expired_outbox(integer) TO capsicum_worker;

COMMIT;
