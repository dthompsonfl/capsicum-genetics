BEGIN;

CREATE TABLE public_idempotency_records (
  scope text NOT NULL,
  actor_key_hash text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  state idempotency_state NOT NULL DEFAULT 'pending',
  response_body jsonb,
  last_error_code text,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (scope, actor_key_hash, idempotency_key),
  CHECK (actor_key_hash ~ '^[a-f0-9]{64}$'),
  CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  CHECK (length(trim(scope)) BETWEEN 1 AND 100),
  CHECK (
    (state = 'completed' AND response_body IS NOT NULL AND completed_at IS NOT NULL)
    OR state <> 'completed'
  )
);

ALTER TABLE workspace_invitations
  ADD COLUMN last_sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN send_count integer NOT NULL DEFAULT 1 CHECK (send_count BETWEEN 1 AND 100),
  ADD COLUMN superseded_by_invitation_id uuid REFERENCES workspace_invitations(id),
  ADD CONSTRAINT workspace_invitations_supersession_check
    CHECK (superseded_by_invitation_id IS NULL OR revoked_at IS NOT NULL);

ALTER TABLE password_reset_tokens
  ADD COLUMN request_id uuid NOT NULL DEFAULT uuidv7(),
  ADD COLUMN delivery_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN delivery_attempted_at timestamptz,
  ADD COLUMN delivery_error_code text,
  ADD CONSTRAINT password_reset_delivery_state_check
    CHECK (delivery_state IN ('pending','delivered','unavailable','failed')),
  ADD CONSTRAINT password_reset_delivery_time_check
    CHECK ((delivery_state = 'pending') = (delivery_attempted_at IS NULL));

ALTER TABLE user_credentials
  ALTER COLUMN password_version SET DEFAULT 'scrypt-v2';

CREATE OR REPLACE FUNCTION app_mark_password_reset_delivery(
  p_token_hash text,
  p_state text,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF p_state NOT IN ('delivered','unavailable','failed') THEN
    RAISE EXCEPTION 'invalid password reset delivery state';
  END IF;
  UPDATE password_reset_tokens
  SET delivery_state = p_state,
      delivery_attempted_at = clock_timestamp(),
      delivery_error_code = CASE WHEN p_state = 'failed' THEN left(p_error_code, 100) ELSE NULL END
  WHERE token_hash = p_token_hash
    AND consumed_at IS NULL
    AND revoked_at IS NULL;
  RETURN FOUND;
END
$$;

REVOKE ALL ON TABLE public_idempotency_records FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public_idempotency_records TO capsicum_runtime;
REVOKE ALL ON FUNCTION app_mark_password_reset_delivery(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mark_password_reset_delivery(text,text,text) TO capsicum_runtime;

COMMIT;
