# V3 Security and Threat Model

## Assets

- user credentials, sessions, invitations, reset tokens, MFA secrets, and recovery codes;
- workspace membership and role authority;
- biological identity, provenance, genotype evidence, observations, simulations, and catalog releases;
- scientific documents, passages, images, metadata, derivatives, and exports;
- database, object-storage, AI-provider, scanner, and delivery credentials;
- immutable audit, review, job, and artifact histories.

## Trust boundaries

1. Browser ↔ Next.js web runtime.
2. Web runtime ↔ PostgreSQL restricted runtime role.
3. Worker ↔ PostgreSQL worker functions.
4. Web/worker ↔ object storage.
5. Worker ↔ malware scanner/isolated decoder.
6. Application ↔ optional hosted AI provider.
7. Migration/backup operator ↔ privileged database and storage controls.

## Principal threats and controls

| Threat | Primary controls | Residual risk |
|---|---|---|
| Cross-workspace access | Forced RLS, active-membership policies, transaction-local actor/workspace context, scoped object/artifact checks | Must be executed under PG18 restricted roles. |
| Forged workspace context | Policy-level membership verification, not caller context alone | Requires adversarial integration proof. |
| Privilege escalation | Role matrix, owner immutability, suspension/revocation, DB transition guards | Full browser/DB matrix unexecuted. |
| Duplicate authoritative mutations | Stable browser request ID, canonical payload hash, transactional idempotency | 20-way multi-instance PG test unexecuted. |
| Session/token theft | Opaque hashed tokens, Strict/HttpOnly/Secure cookies, URL scrub exchange, CSP, no raw-token logs | Browser/referrer/analytics proof unexecuted. |
| Proxy-header spoofing | Forwarded headers ignored unless explicit trust; keyed HMAC fingerprint | Deployment proxy chain must be configured and tested. |
| Password cracking | Versioned scrypt parameters, rehash-on-success, account failure lock/rate limits | No external password breach screening. |
| CSRF/cross-origin mutation | Same-origin checks, strict cookies, form mutation boundaries | Browser tests unavailable. |
| Scientific terminal-state bypass | Canonical services, DB functions, triggers, append-only histories, least-privilege grants | PG execution unavailable. |
| Malicious files | pre-body length gate, signature/MIME/dimension checks, quarantine, worker inspection, fail-closed acceptance | No isolated decoder/malware runtime proof; metadata stripping incomplete. |
| GPS/privacy leakage | quarantine and metadata flags; learned claims disabled | Complete metadata removal is unfinished. |
| AI prompt injection/fabrication | evidence serialized as data, approved/workspace filtering, citation revalidation, deterministic abstention | Hosted provider is not wired/evaluated. |
| Secret exposure | sanitized readiness, recursive log redaction, env-only credentials, secret/security scans in CI | Scans not run locally. |
| Worker lease theft/crash | owner-bound leases, heartbeat, cancellation, stale recovery, retries/dead-letter | Concurrent worker proof unavailable. |
| Artifact disclosure | workspace-scoped DB authorization and immutable object keys | S3 integration proof unavailable. |

## Authentication

Credentials use `scrypt-v2` with stored parameters. Successful sign-in can rehash legacy parameters. Session and one-time tokens are random or context-derived opaque values and only their hashes are stored. Invitation/reset exchange routes create short-lived HttpOnly state and redirect to scrubbed URLs. Shared rate-limit buckets are database-backed.

TOTP and recovery-code tables exist, but complete enrollment, challenge, recovery, reset, and administrative operator workflows are not complete. MFA is therefore not claimed as production-ready.

## Authorization and RLS

Application permission checks provide early rejection. PostgreSQL remains the authoritative isolation boundary. Runtime and worker roles are non-superuser and cannot bypass RLS. V3 closes broad inherited mutation/default-function privileges. Security-definer functions set a fixed search path and have explicit execute grants.

## Upload and media security

The request must declare a bounded length before multipart parsing. Inspected bytes are hashed and stored in quarantine. Signature, declared/detected MIME, dimensions, pixel count, and frame metadata are recorded. Acceptance fails closed if scanner results are unavailable. The missing isolated hostile-decoder and metadata-stripping pipeline remains a blocker.

## AI boundary

AI may retrieve only independently approved, in-scope evidence. Citation IDs are revalidated after generation. AI cannot approve evidence, publish a rule, promote a model, verify genotype, mutate terminal state, or override a simulation. Hosted AI is disabled by default and not considered operational.

## Privacy and retention

Network fingerprints are keyed HMAC values, not raw IP addresses. Purpose is abuse protection and session anomaly review. Production retention periods for session metadata, audit events, scientific documents, images, AI telemetry, and exports require operator policy before release. Raw document/image content must not enter analytics or general error reporting.

## Operational response

On suspected compromise:

1. revoke active sessions and one-time tokens;
2. rotate application, derivation, database, storage, scanner, delivery, and provider credentials;
3. stop affected workers and quarantine pending artifacts;
4. preserve audit/job/object evidence;
5. restore and reconcile in isolation when integrity is uncertain;
6. add a forward repair migration rather than modifying applied migrations;
7. rerun authority, security, E2E, and restore evidence before reopening.
