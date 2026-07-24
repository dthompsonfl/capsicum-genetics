# V6 Security and Threat Model

## Protected assets

- credentials, opaque session tokens, invitation/reset tokens, recovery codes;
- workspace membership and role authority;
- biological identity, parentage, seed inventory, genotype and assay evidence;
- approved sources/passages, catalog releases, rules and applicability;
- immutable simulation inputs/results and observation/correction histories;
- quarantined media, research documents, derivatives, exports and model artifacts;
- worker leases, jobs, outbox events, audits, backups and secrets.

## Trust boundaries

1. Browser ↔ Next.js web runtime.
2. Web runtime ↔ restricted PostgreSQL runtime role.
3. Node worker ↔ worker-only PostgreSQL functions.
4. Web/worker ↔ private object storage.
5. Worker ↔ ClamAV and isolated Python verifier.
6. Optional AI gateway ↔ bounded approved evidence.
7. Migration/backup operator ↔ privileged database and storage identities.

## Principal threats and controls

| Threat | V6 control |
|---|---|
| Forged workspace context | active-membership RLS plus canonical workspace transactions and restricted roles |
| Direct terminal-state write | database transition functions, immutable triggers, revoked table/function privileges |
| Duplicate/ambiguous mutation | stable client request IDs, payload hashes, durable idempotency states and replay |
| Redirect escape/open redirect | exact configured-origin parser; backslash/control/scheme/network-path rejection |
| CSRF/cross-origin mutation | same-origin checks, secure cookies and proxy response hardening |
| Token leakage | hashed opaque credentials, HttpOnly exchange, URL scrubbing, recursive redaction |
| Brute force/expensive abuse | durable database rate limits and workspace/user operation admission |
| S3 signing confusion | one SigV4 implementation using actual method/query/headers/payload hash |
| Bucket/path escape | workspace-scoped safe object keys, exact prefixes, signed requests and restricted downloads |
| Orphan deletion of evidence | content addressing, retention, preview, reference count, locked recheck and audit |
| Upload memory exhaustion | raw streaming, disk materialization, byte/pixel/frame/process limits |
| Malware/polyglot image | quarantine, ClamAV stream, decoder limits, independent parity, fail-closed state |
| AI prompt injection/citation fabrication | approved bounded evidence, evaluation corpus, citation revalidation, deterministic fallback |
| Migration split-brain | schema and ledger in one transaction under advisory lock |
| Backup tampering/path dependence | bundle-relative checksums, schema validation, object and authoritative table hashes |
| Secret/config drift | production fail-closed config and automated env reconciliation |

## Authentication and privacy

- scrypt parameters are versioned and can be rehashed after successful authentication;
- unknown-account verification uses a comparable KDF path;
- failed sign-in accounting and rate limits persist independently of rejected authentication;
- proxy-derived network data is trusted only behind explicit proxy configuration;
- any retained network fingerprint uses keyed HMAC;
- production requires session, token derivation, network fingerprint, abuse-control, database and object-storage secrets;
- local/test delivery adapters are rejected in production;
- hosted AI is disabled by default and transfers only bounded approved evidence under explicit policy.

## Object and media safety

- uploads are content-addressed and start non-authoritative;
- quarantined objects cannot become phenotype captures until scanner/decoder authority succeeds;
- cleanup cannot use browser-supplied arbitrary prefixes;
- preview and destructive cleanup are different stable intents;
- a discovered object must contain a valid SHA-256 in its key, be older than retention, and have zero authoritative references;
- image decoders run with bounded input, pixel, frame, time, memory and concurrency envelopes;
- no learned phenotype output exists without a promoted validated model.

## Residual risks

- PostgreSQL roles/RLS/triggers and concurrent idempotency are source-defined but unexecuted here.
- MinIO/ClamAV and production-container hostile fixtures are defined but unexecuted here.
- stale multipart upload abortion needs a proved provider lifecycle/abort mechanism.
- browser CSP/CSRF/accessibility behavior needs production browser proof.
- security scan and SBOM evidence requires a legitimate frozen dependency graph.
