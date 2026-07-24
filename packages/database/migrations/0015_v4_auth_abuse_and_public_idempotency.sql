BEGIN;

ALTER TABLE user_credentials
  ADD COLUMN last_successful_login_at timestamptz;

-- Abuse-control keys are HMACs. Rate-limit state is ephemeral and may be safely
-- reset during this migration to avoid retaining legacy raw compound keys.
TRUNCATE TABLE rate_limit_buckets;
ALTER TABLE rate_limit_buckets
  ADD CONSTRAINT rate_limit_buckets_hmac_key_check
  CHECK (bucket_key ~ '^[a-f0-9]{64}$');
CREATE INDEX rate_limit_buckets_scope_updated_idx
  ON rate_limit_buckets(scope, updated_at DESC);

ALTER TABLE public_idempotency_records
  ADD CONSTRAINT public_idempotency_terminal_contract_check
  CHECK (
    (state = 'completed'
      AND response_body IS NOT NULL
      AND completed_at IS NOT NULL
      AND last_error_code IS NULL
      AND locked_until IS NULL)
    OR
    (state = 'failed_terminal'
      AND response_body IS NOT NULL
      AND completed_at IS NOT NULL
      AND last_error_code IS NOT NULL
      AND locked_until IS NULL)
    OR
    (state = 'failed_retryable'
      AND response_body IS NOT NULL
      AND completed_at IS NULL
      AND last_error_code IS NOT NULL
      AND locked_until IS NULL)
    OR state IN ('pending', 'conflict')
  );
CREATE INDEX public_idempotency_cleanup_idx
  ON public_idempotency_records(state, updated_at);

-- Password work must never occur while holding a credential row lock. The
-- runtime records a failed attempt through this short, durable function after
-- password verification has completed.
CREATE OR REPLACE FUNCTION app_record_failed_signin(
  p_user_id uuid,
  p_max_attempts integer,
  p_lock_minutes integer
)
RETURNS TABLE(failed_attempts integer, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF p_max_attempts < 1 OR p_max_attempts > 100 OR p_lock_minutes < 1 OR p_lock_minutes > 1440 THEN
    RAISE EXCEPTION 'invalid failed-signin accounting contract';
  END IF;
  RETURN QUERY
  UPDATE user_credentials
  SET failed_attempts = user_credentials.failed_attempts + 1,
      locked_until = CASE
        WHEN user_credentials.failed_attempts + 1 >= p_max_attempts
          THEN GREATEST(
            COALESCE(user_credentials.locked_until, '-infinity'::timestamptz),
            clock_timestamp() + make_interval(mins => p_lock_minutes)
          )
        ELSE user_credentials.locked_until
      END,
      updated_at = clock_timestamp()
  WHERE user_id = p_user_id
  RETURNING user_credentials.failed_attempts, user_credentials.locked_until;
END
$$;

REVOKE ALL ON FUNCTION app_record_failed_signin(uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_record_failed_signin(uuid,integer,integer) TO capsicum_runtime;

COMMIT;
