BEGIN;

ALTER TABLE auth_sessions
  ADD COLUMN mfa_verified_at timestamptz;

ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_mfa_verified_after_creation_check
  CHECK (mfa_verified_at IS NULL OR mfa_verified_at >= created_at);

COMMENT ON COLUMN auth_sessions.mfa_verified_at IS
  'Server-recorded time when this specific session completed a TOTP or recovery-code challenge. NULL means password/bootstrap-only assurance.';

COMMIT;
