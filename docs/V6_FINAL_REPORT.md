# Capsicum Breeding Intelligence Platform V6 Final Report

## Release verdict

**BLOCKED.**

V6 corrects the confirmed production-path defects from the V5 adversarial review and adds executable proof definitions for the unavailable infrastructure gates. The local source tree is internally consistent and preserves the scientific authority model, but this host could not prove a frozen Node 24 build, PostgreSQL 18 authority behavior, MinIO/ClamAV integration, production containers, complete browser/WCAG journeys, security scans, or isolated restore. Those are release requirements, not optional polish.

Implementation source hash, excluding local evidence and V6 reports: `7b0c1cd425a9ba5a26140ed1d3be92f7b0bfe030ee896b40b143e6de64633ab4`.

## Verified pre-edit state

The supplied V5 source contained 500 files, 27 forward migrations, 54 page routes, 14 API routes, and zero approved executable phenotype rules. The V5 reports correctly withheld production readiness but overstated several source-level paths:

- S3-compatible GET and range GET signatures canonicalized `PUT`.
- readiness expected 22 migrations while 27 existed;
- the authority verifier contained stale/nonexistent routine signatures;
- migration SQL and migration-ledger insertion were separate commits;
- request-derived redirects allowed encoded/backslash origin escape classes;
- backup checksums were path-dependent and object restore verified count rather than content;
- web uploads and worker inspection buffered complete files;
- failed object/database coordination had no active cleanup authority;
- expensive authenticated operations lacked one shared durable admission service;
- hosted AI lacked a versioned adversarial evaluation policy;
- production Compose omitted required runtime security/cost variables;
- application/PostgreSQL and MinIO/ClamAV tests were largely absent or environment-gated without broad coverage.

The complete baseline is in `docs/V6_BASELINE_REPORT.md` and `docs/v6-baseline.json`.

## Architecture decisions

V6 preserves the existing modular monolith and scientific boundaries.

- PostgreSQL remains the authoritative state, RLS, role, transition, lease, and audit boundary.
- The web runtime, worker, and migration identities remain separate.
- Exact genetics stays pure and deterministic; advanced calculations retain explicit authority dimensions.
- Migrations `0001` through `0027` are unchanged. V6 adds `0028` and `0029` only.
- Migration and routine identities are generated from source and checked for drift.
- Uploads use a pending-object authority record before or alongside immutable object persistence.
- Object cleanup is workspace-scoped, content-addressed, previewable, bounded, retention-aware, reference-checked, idempotent, and worker-owned.
- Hosted AI remains optional, evidence-bounded, citation-revalidated, evaluated, and unable to mutate scientific authority.
- Unsupported quantitative, genomic, G×E, exact SHU, yield, flavor, universal phenotype, and learned-vision claims remain unavailable.

## Work completed

### Reproducible runtime boundary

- Added generated ordered migration version/checksum manifests.
- Added generated exact runtime/worker routine grant manifests.
- readiness compares the complete applied ordered version/checksum set, not a count.
- CI, Dockerfiles, and package metadata consistently specify Node 24.18.0 and pnpm 10.14.0 with frozen installation.
- Compiled web/worker artifact and Next.js standalone verifiers remain required.
- Added environment-contract reconciliation across config, `.env.example`, Compose, CI, web, and worker.
- Added commit/run/source-hash release-evidence generation.

A legitimate `pnpm-lock.yaml` could not be generated because Corepack could not resolve `registry.npmjs.org`. No lockfile was synthesized.

### Migration and database authority

- The migrator now validates one supported outer transaction, strips it in memory, and runs migration body plus ledger insertion in one transaction under the advisory lock.
- Added fault injection before schema work, after schema work, after ledger insertion, and on schema failure.
- Added an environment-gated PostgreSQL crash-atomicity verifier.
- The authority verifier preflights actual `pg_proc` signatures from generated manifests before privilege checks.
- Added V6 restricted-role integration definitions for exact migration identity, direct-write denial, cross-workspace RLS, worker/human function separation, and cleanup preview/claim behavior.
- `pgcrypto` is provisioned before replay because historical migrations use `digest()`.

### Object storage and downloads

- Consolidated SigV4 signing for byte PUT, streamed file PUT, GET, HEAD, DELETE, range GET, and ListObjectsV2.
- Canonical requests use the actual method, sorted encoded query, signed range/content headers, and exact payload hash.
- Added deterministic signer fixtures and environment-gated MinIO tests for immutable PUT, same-content duplicate, conflicting duplicate, full GET, range GET/416, streamed PUT, prefix LIST, readiness, invalid credentials, missing bucket, and safe keys.
- Local runtime smoke proves immutable file behavior, ranges, bounded prefix listing, safe deletion, and key containment.
- Media/export downloads preserve workspace authorization, byte ranges, `416`, private caching, and `nosniff`.

### Upload, quarantine, and memory limits

- Replaced `formData()`/`arrayBuffer()` upload paths with bounded raw-body streaming to mode-restricted temporary files.
- Hashes and lengths are calculated incrementally.
- File signatures and UTF-8 research inputs are validated from disk.
- Worker object retrieval streams to disk with byte bounds and incremental hashing.
- ClamAV receives a backpressured stream rather than a whole-file buffer.
- decoder, pixel, frame, process, memory, CPU, concurrency, and container envelopes are explicit.
- Python/Pillow parity reuses the restricted materialized file.

### Object/database reconciliation and cleanup

- Added `pending_object_uploads` with forced RLS and a canonical register → stored → attached/failure → cleanup lifecycle.
- Media and research services bind immutable object metadata to pending authority records and record failures after object persistence.
- Added scheduled and operator-triggered `storage.cleanup.v1` jobs.
- Cleanup supports dry-run and destructive modes, stable request IDs, retention hours, deletion and scan limits, bounded workspace-prefix inventory, and cooperative cancellation.
- Untracked content-addressed objects discovered under the exact workspace prefix are classified against all known authoritative object references; destructive runs register them before claim.
- Preview does not mutate pending state.
- Destructive claims recheck authoritative references under lock before deletion.
- Referenced media, source documents, extraction artifacts, immutable exports, media derivatives, export jobs, and model artifacts cannot be deleted by cleanup.
- Preview and deletion outcomes are auditable; failures return candidates to retryable cleanup state.

Stale multipart upload abortion remains dependent on object-store lifecycle administration and is listed as a blocker rather than falsely represented as implemented.

### Redirect and response security

- Centralized exact-origin internal-destination normalization.
- Rejects schemes, credentials, network paths, raw/encoded backslashes, control characters, malformed encodings, and repeated-decoding bypasses.
- One hardening helper applies CSP/nonce behavior, HSTS in production, frame protection, referrer policy, content-type protection, cross-origin policies, and private cache behavior to normal and redirect responses.

### Authentication, quotas, and privacy

- Preserved versioned scrypt credentials, opaque hashed sessions, hashed one-time credentials, session revocation, workspace switching, invitation/recovery controls, and active-membership enforcement.
- Added durable shared admission policies for media/research upload, exact/advanced simulation, Monte Carlo concurrency/sample budgets, exports, research assistance, and job operations.
- Production requires an abuse-control secret and trusted-proxy configuration remains explicit.
- Logs redact recursively and do not include raw documents, images, credentials, session tokens, or full job payloads.

### Backup, restore, and evidence

- Backup checksums are bundle-relative and remain valid after relocation and deletion of the source path.
- Restore verification checks manifest schema, expected files, migration identity/checksums, authoritative row counts/hashes, every object key, byte length, and SHA-256.
- Fixtures cover relocation and tamper rejection.
- CI defines a source PostgreSQL/MinIO backup, independent destination PostgreSQL/MinIO restore, and content reconciliation job.
- Local documentation evidence is explicitly non-authoritative; release evidence is intended to be CI-produced and commit-bound.

### AI safety

- Added a versioned evaluation corpus covering prompt/source injection, fabricated or mismatched citations, conflicting evidence, unsupported questions, workspace isolation, provider failure, exfiltration, and abstention.
- Hosted generation is disabled by default and requires explicit provider, privacy, timeout, retry, token, pricing, and per-request cost ceilings.
- Generation runs outside database transactions over bounded approved evidence.
- Citations are revalidated before persistence; policy version/hash, provider/model, evidence hashes, latency, tokens, cost, fallback, and evaluation outcome are auditable.
- Core research workflows function without hosted AI.

### Scientific functionality preserved

Local runtime fixtures continue to pass for:

- exact single-locus inheritance;
- exact independent multi-locus inheritance;
- weighted genotype uncertainty;
- linkage endpoints and explicit phase;
- maternal direction;
- direct Monte Carlo without exact-state expansion;
- observed segregation selection of valid tests;
- host–pathogen abstention when context is insufficient.

No scientific rule, genotype, phenotype, model accuracy, or approval was fabricated.

## Final locally verified scope

- Delivered repository files: **587**.
- V5 → V6 delta: **87 created, 39 modified, 0 deleted**.
- Implementation source files before V6 report/inventory generation: **536**.
- Page routes: **54**.
- API routes: **14**.
- Forward migrations: **29**.
- Unique `CREATE TABLE` declarations: **116**.
- TypeScript-family files parsed: **170**.
- Repository validator: **778 checks, 0 source issues, 5 environment warnings**.
- Catalog: **22 loci, 22 claims, 30 sources, 0 approved executable phenotype rules**.

## Failures and classification

| Failure | Classification | Status |
|---|---|---|
| Corepack cannot download pnpm 10.14.0 (`EAI_AGAIN`) | Environment/tooling | Open |
| Required Node 24 unavailable; host is Node 22.16.0 | Environment/tooling | Open |
| PostgreSQL 18/`psql` unavailable | Environment/tooling | Open |
| Docker/Compose unavailable | Environment/tooling | Open |
| R unavailable | Environment/tooling | Open |
| Browser/axe runtime unavailable | Environment/tooling | Open |
| Frozen dependency, license, SAST, secret, container scans and SBOM | Depends on frozen graph/CI | Open |
| Real isolated database/object restore | Depends on Docker/PG/MinIO | Open |
| Approved executable phenotype rules | Scientific/data blocker | Valid zero-rule state |
| Validated learned phenotype model | Scientific/data blocker | Intentionally unavailable |
| Introduced source issue found by local checks | Introduced by V6 | None remaining |
| Unknown/unclassified failure | Unknown | None recorded |

## Technical debt

| Debt | Owner | Payoff/removal condition | Due milestone |
|---|---|---|---|
| No legitimate lockfile or clean build evidence | Platform engineering | Registry-enabled Node 24 frozen install and all builds pass | Before staging |
| V6 migrations and authority matrix unexecuted | Database/security engineering | Empty and V5-upgrade replay plus complete restricted-role suite pass | Before staging |
| S3/ClamAV/worker integration unexecuted | Platform security | MinIO/ClamAV tests and crash/cancel/retry suite pass in production images | Before media staging |
| Stale multipart abortion relies on storage lifecycle policy | Operations | Approved lifecycle/abort runbook and integration evidence | Before production object storage |
| Browser/WCAG journey matrix incomplete locally | Web quality | Seeded Playwright/axe suite passes at all required viewports | Release candidate |
| MIAPPE, PDF extraction, multi-generation orchestration, calibrated biological vision | Scientific/product owners | Independently reviewed contracts and fixtures | Separate scientific releases |

## Activation sequence

1. Restore registry access and use Node 24.18.0/Corepack/pnpm 10.14.0.
2. Generate and review a legitimate `pnpm-lock.yaml`; prove fresh `pnpm install --frozen-lockfile`.
3. Run formatting, lint, strict typecheck, unit/property tests, Turbo builds, standalone verification, and worker start smoke.
4. Replay all 29 migrations from empty PostgreSQL 18 and a representative V5 baseline.
5. Execute migration atomicity, authority, application concurrency, RLS, role, transition, job, cleanup, and query-plan suites.
6. Run MinIO/ClamAV/media/research/export integration and worker crash/cancellation/retry tests.
7. Run all authenticated Playwright/axe journeys and documented manual keyboard/mobile/zoom review.
8. Build and scan production containers; generate/review SBOM, dependency, license, secret, SAST, and container reports.
9. Execute isolated backup/restore and reconcile migrations, authoritative hashes, and every object digest.
10. Reissue commit-bound evidence and reconsider the blocked verdict.
