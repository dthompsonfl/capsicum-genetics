# Security and threat model

## Protected assets

- workspace identity, membership, roles, invitations, and sessions;
- germplasm, seed, plant, cross, harvest, family, pedigree, observation, and selection records;
- genotype assays, scientific evidence, catalog decisions, and model approvals;
- immutable simulation inputs, results, and content hashes;
- uploaded media, derivatives, annotations, and phenotype measurements;
- session credentials, bootstrap proof, MFA secrets/recovery codes, database/storage/delivery credentials, and AI-provider secrets;
- audit, job, outbox, export, backup, and restore records.

## Trust boundaries

1. Browser to the Next.js application.
2. Reverse proxy/load balancer to the application origin.
3. Application to the restricted `capsicum_runtime` database login.
4. Persistent worker to the separate `capsicum_worker` login and narrowly granted security-definer functions.
5. Migration/provisioning process to the administrative database login.
6. Application and workers to private S3-compatible object storage and malware scanning.
7. Application to the credential-delivery provider.
8. Optional hosted AI provider; this boundary is non-authoritative.
9. Backup operator to administrative database/object credentials and an isolated restore target.

## Implemented controls

### Installation, identity, and sessions

- first-owner bootstrap requires a SHA-256-verified installation token;
- bootstrap uses a PostgreSQL advisory lock and rechecks that no user exists inside the transaction;
- scrypt password hashing with per-credential salt;
- opaque random session token stored only as a hash;
- session expiration, revocation, membership-state checks, and server-derived principals;
- `httpOnly`, `SameSite=Strict`, production-secure cookies based on explicit application mode;
- password-reset and invitation tokens are one-time, derived, expiring credentials delivered out of band;
- production credential delivery uses a bounded Resend adapter; the local spool is forbidden in production;
- sign-in errors do not disclose whether an account exists;
- failed-attempt accounting is retained without global account lockout that an attacker could weaponize.

### Privileged multi-factor authentication

- TOTP with encrypted-at-rest shared secrets;
- one-time hashed recovery codes and controlled rotation;
- TOTP replay-step prevention;
- MFA enrollment, current-browser verification, disable, and recovery-code regeneration workflows;
- privileged roles require MFA in production;
- assurance is attached to the individual session;
- a password-only session cannot enter privileged routes or switch into a privileged workspace;
- membership changes revoke affected sessions.

### Authorization and workspace isolation

- role/permission checks in application services;
- transaction-local actor/workspace/request context;
- active membership verification before workspace operations;
- membership-bound PostgreSQL row-level security on workspace-scoped tables;
- `FORCE ROW LEVEL SECURITY` and composite workspace foreign keys;
- restricted runtime and worker database roles;
- worker cross-workspace actions only through narrowly granted functions;
- owner demotion/deactivation and self-lockout prevention;
- destructive-gated PostgreSQL authority verification.

### Scientific and record integrity

- append-only audit, inventory, observation-revision, scientific-review, annotation, and job-attempt histories where applicable;
- immutable approved catalog records, validated models, simulation inputs/results, and content hashes;
- independent author/reviewer separation and hash-bound publication;
- pedigree-cycle rejection and directed seed-parent/pollen-parent roles;
- explicit evidence states for verified, inferred, assumed, unknown, and conflicting genotype information;
- research citations require direct supporting text from approved in-workspace evidence;
- AI has no authority to publish evidence, approve models, change genotypes, or override calculations.

### Web and API controls

- explicit public-path allowlist and session-gated proxy;
- canonical HTTPS origin/host enforcement in production;
- same-origin checks using `Origin` and fetch metadata for state-changing requests;
- CSP, frame denial, HSTS, referrer, permissions, cross-origin opener/resource policy, and no-index controls;
- safe redirect handling;
- bounded request contracts and generic public errors;
- readiness responses expose status flags/probes rather than parsed secrets.

### Storage, workers, and observability

- content-addressed immutable object keys and collision checks;
- byte limits, extension/MIME allowlists, magic-number checks, image-dimension limits, and protocol-aware phenotype capture;
- quarantine/scanner workflow and bounded derivative processing paths;
- signed storage requests and time-bounded health probes;
- durable job leases, heartbeats, retries, cancellation, recovery, and dead-letter concepts;
- recursive secret redaction and structured operational logging.

## Primary adversarial scenarios

| Scenario | Implemented defense | Runtime proof still required |
|---|---|---|
| An attacker claims a fresh deployment | Installation-token digest, rate limit, advisory lock, transactional empty-user recheck | Concurrent onboarding and token rotation/removal test on PostgreSQL 18 |
| A password-only user reaches a privileged workspace | Per-session MFA assurance, privileged route guard, destination-role check | Browser/integration tests across multi-membership and role-switch paths |
| A known email is denial-of-serviced | No persistent global account lockout; bounded abuse accounting and generic errors | Distributed abuse/rate-limit testing and alert thresholds |
| Caller forges another workspace | Membership-bound RLS validates active actor membership | Restricted-role cross-table attack suite |
| Revoked user reuses a session | Active membership check and session revocation | Concurrent revocation/session tests |
| Author approves their own scientific claim | Independent-review and role triggers | Full catalog transition tests |
| AI fabricates source support | Approved evidence only, exact supporting quote, exact claim/title support, abstention | Provider-specific red-team and evaluation suite |
| Upload contains malware or hostile media | Limits, signature checks, immutable quarantine-oriented storage, scanner path | ClamAV outage/malicious fixture/decoder fuzz proof |
| Worker steals or finishes another lease | Database-owned claim/heartbeat/complete functions and lease-owner checks | Crash, stale lease, retry, cancellation, dead-letter integration tests |
| Readiness/logging leaks credentials | Sanitized readiness and recursive log redaction | Runtime response/log secret scan |

## Residual risk before production

- Generate and review a genuine lockfile; run dependency, license, secret, SAST, container, and SBOM scans.
- Prove all authentication, recovery, invitation, MFA, role-switch, and abuse controls in production-like browsers.
- Prove PostgreSQL migrations, RLS, triggers, security-definer grants, and concurrency under restricted roles.
- Prove storage, scanner, worker, email, degraded-dependency, backup, and isolated-restore behavior.
- Remove `style-src 'unsafe-inline'` from CSP or document a narrowly scoped, time-bounded exception with browser evidence and an owner.
- Define secret rotation, key versioning, database credential expiry, backup encryption, incident response, retention, and deletion obligations.
- Conduct an external application security review before untrusted public exposure.
