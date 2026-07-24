# Production deployment guide

## Deployment posture

Deploy only after all items in `V9_RELEASE_BLOCKERS.md` have recorded evidence. The repository is designed to fail closed when production identity, origin, delivery, or MFA configuration is incomplete.

## 1. Prepare secrets

Generate independent random values for:

- `SESSION_SECRET`
- `TOKEN_DERIVATION_SECRET`
- `NETWORK_FINGERPRINT_SECRET`
- `ABUSE_CONTROL_SECRET`
- database role passwords
- object-storage credentials

Generate `MFA_ENCRYPTION_KEY` as exactly 32 random bytes encoded as 64 lowercase hexadecimal characters.

Never reuse a secret between purposes or environments.

## 2. Configure canonical origin

Production requires:

```dotenv
NODE_ENV=production
APP_MODE=production
APP_ORIGIN=https://capsicum.example.com
NEXT_PUBLIC_APP_URL=https://capsicum.example.com
APP_RELEASE_SHA=<immutable-40-or-64-character-hex-source-revision>
```

`APP_ORIGIN` must be HTTPS and must match the externally visible host. `APP_RELEASE_SHA` must identify the exact reviewed source revision used to build both web and worker images; labels such as `latest` are rejected. Configure `TRUSTED_PROXY_HOPS` only after documenting the exact reverse-proxy chain.

## 3. Configure first-owner bootstrap

Create a one-time raw token:

```bash
TOKEN="$(openssl rand -base64 48)"
printf '%s' "$TOKEN" | sha256sum
```

Configure only the digest as `BOOTSTRAP_TOKEN_SHA256`. Deliver the raw token to the intended owner through an authenticated out-of-band channel. Remove or rotate the configured digest after owner creation according to the deployment secret-management process.

The onboarding service also takes a PostgreSQL advisory lock and rechecks that no user exists, preventing concurrent first-owner creation. The token remains necessary to prevent an external visitor from claiming a fresh deployment.

## 4. Configure production credential delivery

```dotenv
DELIVERY_ADAPTER=resend
DELIVERY_FROM_EMAIL=verified-sender@example.com
RESEND_API_KEY=...
```

The local spool adapter is development-only and is rejected in production. Verify invitation and password-reset delivery, link expiry, one-time use, abuse limits, and redacted logs before launch.

## 5. Enforce privileged MFA

```dotenv
REQUIRE_PRIVILEGED_MFA=true
MFA_ENCRYPTION_KEY=<64-lowercase-hex-characters>
```

Owners, administrators, and scientific reviewers must enroll TOTP before privileged routes or workspace switching are permitted. MFA assurance is stored per session. Recovery codes are one-time values and must be stored offline.

## 6. Separate database roles

Use:

- `MIGRATION_DATABASE_URL` or `DATABASE_ADMIN_URL` only for migrations/provisioning;
- `DATABASE_URL` for the restricted web runtime;
- `WORKER_DATABASE_URL` for the restricted worker.

Run:

```bash
pnpm db:migrate
pnpm db:provision-roles
pnpm db:seed-catalog
```

Never run the web or worker as a table owner or PostgreSQL superuser.

## 7. Configure object storage and malware inspection

Use environment-specific S3-compatible credentials and a private bucket. Verify immutable-key collision behavior, checksums, upload limits, scanner availability, quarantine, derivative creation, download authorization, and deletion/retention policy.

Production media acceptance must fail safely when the malware scanner is unavailable.

## 8. Validate before traffic

Required gates include:

- frozen dependency install and production build on Node 24;
- complete unit and integration tests;
- empty-database and upgrade migration replay on PostgreSQL 18;
- restricted-role/RLS authority tests;
- browser E2E, axe, keyboard, responsive, and screen-reader checks;
- invitation, recovery, MFA enrollment, recovery-code, and role-switch tests;
- object-storage and scanner fault tests;
- worker lease, retry, cancellation, and dead-letter tests;
- backup and isolated restore reconciliation;
- dependency, secret, SAST, container, license, and SBOM scans.

## 9. Operate and monitor

Collect structured logs without secrets or raw one-time credentials. Alert on repeated authentication failures, invitation/recovery abuse, MFA failures, scanner outages, worker lease expiry, dead-letter growth, storage failures, migration drift, and backup/restore failures.

Define owners for security incidents, scientific catalog governance, operational support, data correction, and disaster recovery.

## Rollback

Database migrations are forward-only. Rollback means restoring the previous deployable application against a schema it supports or performing an isolated, tested database restore—not manually reversing authoritative records. Every release must declare compatibility and restore boundaries before deployment.
