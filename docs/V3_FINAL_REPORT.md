# Capsicum Breeding Intelligence Platform — V3 Final Report

## Release verdict

**BLOCKED for production release.**

The V3 source tree is a materially stronger engineering candidate, but the completion standard in the V3 prompt requires direct proof of a frozen dependency installation, PostgreSQL 18 migrations and restricted-role behavior, production builds, Docker/Compose startup, browser accessibility journeys, and backup/restore. Those runtimes were unavailable in this execution environment. No substitute evidence is presented as production proof.

## Verified pre-edit baseline

The supplied V2 archive contained 294 audited files, six forward migrations, 48 page routes, seven API routes, 17 workspace packages, two runtime applications, and a source-backed seed catalog reconciling 22 loci, 22 claims, 30 sources, and zero active executable phenotype rules.

The supplied adversarial review correctly identified the following P0 defects in source:

- no legitimate `pnpm-lock.yaml` or frozen-install evidence;
- unproven production package boundary;
- idempotency identifiers generated after user intent rather than preserved by the browser;
- fruit set conflated with cross verification;
- cross-derived seed lots assigned maternal accession identity;
- free-form alleles not validated against an exact release;
- stale observation corrections able to branch current truth;
- draft definitions usable for authoritative observations;
- operator-entered values presented as machine observations;
- upload size enforcement occurring after buffering.

The sweep also discovered defects not captured by the V2 narrative:

- `hasPermission`, `requirePermission`, and `isIndependentCatalogReviewer` were imported but not exported, so a real package build would fail;
- research audit code referenced an undefined retrieval constant;
- public health and one-time-token exchange routes were intercepted by session middleware;
- worker, Compose, and environment malware-scanner variables disagreed;
- initial least-privilege closure accidentally blocked the legitimate inspection-job binding column;
- broad inherited table/default privileges exceeded the declared database authority model.
- local invitation and reset credential URLs were reflected into browser state/query parameters; V3 now removes that exposure and fails invitation mutation before authority changes when secure delivery is unavailable.

The complete baseline evidence is in `docs/V3_BASELINE_REPORT.md` and `docs/v3-baseline.json`.

## Architecture and migration decisions

The existing modular monolith was preserved:

- Next.js web application;
- application-service authority boundary;
- pure exact-genetics package;
- advanced scientific algorithms isolated from authoritative persistence;
- PostgreSQL as the record and transition authority;
- durable Node worker and explicit Python/R boundaries;
- object storage outside the database;
- source-backed, independently reviewed scientific catalog;
- maternal direction, explicit uncertainty, immutable snapshots, and abstention.

Migrations `0001` through `0006` were not rewritten. V3 adds forward migrations `0007` through `0014`. They introduce or harden biological identity, cross verification, normalized genotype evidence, observation authority, simulation authority, authentication recovery, media quarantine, worker completion, research passage review, opaque label tokens, and least-privilege runtime grants.

The production package contract remains compiled `dist` exports. Worker source execution was removed from production scripts. Web and worker Dockerfiles build their complete Turbo dependency graph before creating runtime artifacts.

## Work completed

### Biological identity and breeding ledger

- Cross operational state and identity-verification state are independent.
- Fruit set does not verify pollen identity.
- Verification records method, evidence, confidence, author, reviewer, time, and review state.
- Controlled crosses, selfing, and open pollination preserve maternal direction.
- Canonical harvest creates fruit, seed harvest, derived breeding-material identity, derived seed lot, progeny family, inventory, provenance, labels, and audit records atomically.
- Recombinant progeny no longer inherit the maternal accession identity.
- Plant registration consumes or reserves seed inventory, or requires a documented exception.
- Inventory receipts, adjustments, reservations, planting, losses, returns, and reconciliation remain append-only.
- Locations, movement history, deterministic label generations, opaque QR tokens, family members, and cycle-safe pedigree traversal are represented.

### Genotype and scientific catalog authority

- Reference assemblies, alleles, aliases, sequence and structural variants, markers, assays, release membership, and normalized call provenance are represented.
- Historical notation is retained separately from normalized identifiers.
- Genotype correction uses immutable supersession and an exact current-version check.
- Simulations record the exact genotype-call versions in their immutable premise snapshot.
- Runtime mutation of normalized catalog authority is denied until a curator/reviewer canonical service is completed.
- The seed catalog still activates zero phenotype rules. This is correct, not a missing-data failure.

### Observation authority

- Draft/research observations are separate from authoritative observations.
- Authoritative values require approved, versioned definitions and compatible protocol, unit, vocabulary, value type, range, precision, and missing-data contracts.
- Session transitions are centralized and version checked.
- Observation correction locks the aggregate and rejects stale predecessors.
- Revision history is linear and append-only.

### Idempotency and public errors

- Browser mutation forms generate a stable client request ID before submission.
- IDs survive rerenders, duplicate clicks, timeout ambiguity, and retries.
- IDs rotate only after definitive completion or explicit payload change.
- PostgreSQL idempotency records serialize concurrent callers, compare canonical payload hashes, replay completed results, and do not survive a rolled-back aggregate transaction.
- Public errors use structured safe codes and omit SQL, stack traces, credentials, and raw scientific records.

### Simulation and scientific analysis

- Exact rational inheritance, weighted uncertainty, independent loci, linkage foundations, maternal transmission, approved conditional rules, host–pathogen abstention, and direct Monte Carlo remain isolated in scientific packages.
- Approved-release simulations validate loci and exact approved allele membership.
- Result authority is split into calculation, premise/evidence, and interpretation dimensions.
- Historical inputs include catalog release, call versions, evidence IDs, parent direction, assumptions, exclusions, engine version, model version, hashes, and stochastic diagnostics where applicable.
- Observed segregation reconciliation now supplies chi-square only when expected-count assumptions hold, exact two-sided binomial testing for small two-category samples, Holm adjustment, missing-data disclosure, and explicit abstention for unsupported small multinomial cases.
- Unsupported exact SHU, universal phenotype, yield, flavor, genomic, G×E, and unvalidated learned-model claims remain unavailable.

### Authentication, security, and privacy

- Scrypt credentials store parameter versions and support rehash-on-success.
- Sessions and one-time credentials are opaque and stored only as hashes.
- Invitation and reset credentials are never returned to React state, application query parameters, logs, or analytics. Local/test delivery uses a mode-0700 spool and mode-0600 deterministic notice files; production rejects the local adapter.
- Exchange endpoints immediately move the credential into short-lived HttpOnly state and scrub the browser URL.
- Arbitrary forwarding headers are ignored unless proxy trust is explicitly enabled.
- Retained network fingerprints use keyed HMAC.
- Workspace switching, sessions, revocation, invitation revoke/resend, reset delivery adapters, role administration, and suspended-member denial have application services and web surfaces.
- CSP nonce propagation, strict cookies, same-origin mutation checks, safe redirects, and sanitized health responses are represented.
- Runtime roles cannot bypass RLS and cannot manufacture reviews, model validations, media inspection outcomes, or immutable artifacts.

### Media, workers, exports, and operations

- Upload length is rejected from request metadata before multipart parsing and from the file object before persistence.
- Accepted bytes are content-addressed into quarantine and paired atomically with an inspection job.
- Media authority stays quarantined when malware inspection is unavailable.
- Worker handlers use versioned payload contracts, leases, heartbeats, cancellation checks, retries, dead-letter states, stale recovery, and worker-only security-definer functions.
- Export creation is queued and worker-completed into an immutable artifact with hash and workspace authorization.
- Health, liveness, readiness, audit, queue, worker capability, and job remediation surfaces exist without exposing payloads or credentials.
- Backup and isolated-restore scripts verify checksums and support object reconciliation when object storage is configured.

### Build, CI, and repository hygiene

- Production runtime imports resolve through compiled package exports.
- Turbo dependency order is explicit for packages, web, and worker.
- Docker uses frozen installation policy and non-root, read-only runtime containers.
- CI definitions cover quality/build, PostgreSQL authority, Python/R boundaries, browser/axe, Compose smoke, security scans, and evidence artifacts.
- Generated caches, Python bytecode, test output, build output, and local runtime debris are excluded and cleaned.
- A legitimate lockfile was not generated because registry DNS was unavailable.

## Acceptance results

No acceptance journey is reported as production-passed because the required integrated runtime could not be started. Source status is recorded per journey in `docs/V3_ACCEPTANCE_TRACEABILITY.md` and `docs/v3-acceptance-traceability.json`.

The strongest source-complete journeys are:

- canonical cross/self/open-pollination identity;
- fruit-set versus verification separation;
- canonical derived-progeny harvest;
- inventory-backed plant creation;
- genotype supersession and simulation snapshots;
- stable request intent and idempotent services;
- linear observation correction;
- quarantined upload plus durable inspection job;
- durable export artifact creation;
- session/invitation/reset administration;
- approved-evidence-only deterministic research answers.

Materially incomplete journeys include:

- normalized catalog authoring/review UI and services;
- persisted multi-generation F1/F2/backcross planning;
- unified persisted linkage/maternal/conditional-rule laboratory;
- durable research ingestion and passage extraction handlers;
- isolated hostile-image decoding, metadata stripping, derivatives, cleanup, and Python durable participation;
- hosted AI provider wiring and evaluation;
- large truly streamed exports;
- complete E2E/axe coverage for all 44 journeys;
- MIAPPE conformance fixtures;
- optional TOTP/recovery-code operator workflows.

## Validation evidence

Completed locally:

- Node 24.11.1 source parsing: 143 TypeScript/TSX/MTS/CTS files, zero parse diagnostics;
- authentication runtime smoke: permission matrix, independent review, scrypt-v2 verification, opaque-token hashing passed;
- exact/linkage/uncertainty/Monte Carlo and observed-segregation deterministic smoke fixtures passed;
- Python worker tests: 3 passed;
- catalog reconciliation: 22 loci, 22 claims, 30 sources, zero activated rules;
- YAML parsing: CI, security workflow, Compose, and development Compose passed;
- shell syntax: backup/restore and repository scripts passed;
- repository validator: 527 checks, zero source issues, four environment warnings; `releaseReady=false`.

Not executable locally:

- registry-backed `pnpm install --frozen-lockfile`;
- Prettier/ESLint/full TypeScript semantic build with installed dependencies;
- Vitest/Turbo/Next standalone/worker production build;
- PostgreSQL migration replay, RLS, triggers, concurrency, and query plans;
- Docker/Compose runtime;
- Playwright/axe and manual browser review;
- object-storage and hostile-image integration;
- R runtime;
- backup and isolated restore.

## Security and privacy result

The source authority model is substantially stronger, but production security is not proven until the restricted PostgreSQL roles, CSP behavior, token exchange, proxy trust, shared rate limits, upload quarantine, and artifact downloads execute in an integrated environment. TOTP schema exists but full enrollment/recovery workflows are not complete. Hosted AI remains disabled by default.

## Scientific limitations

The platform performs exact inheritance calculations only for supplied genetic premises. It does not establish that a plant, accession, allele call, marker, assay, parent, pathogen isolate, or environment is correct. No quantitative heat, universal color, yield, flavor, disease, genomic, G×E, or learned-vision claim is enabled without independently validated evidence and applicability.

## Remaining blockers

See `docs/V3_RELEASE_BLOCKERS.md`. The production blockers are not documentation gaps; they are missing runtime proof and unfinished high-risk workflows.

## Debt introduced by V3

| Debt | Owner | Payoff | Removal condition | Due milestone |
|---|---|---|---|---|
| Normalized catalog tables are runtime read-only | Scientific platform team | Prevents unreviewed allele/variant authority | Curator submit/reviewer approve/publisher release service and PG tests | Before catalog-authoring beta |
| Small multinomial segregation abstains | Quantitative genetics reviewer | Avoids false exact claims | Independently reviewed bounded exact multinomial implementation and fixtures | Before multi-category segregation release |
| Upload API still buffers accepted files after a strict pre-body limit | Platform security team | Bounded compatibility with Next request parsing | Streaming/multipart adapter plus hostile-file integration tests | Before production media enablement |
| Hosted AI is not application-wired | AI governance owner | Core workflows remain provider-independent | Privacy/cost/timeout/evaluation gates and provider integration pass | Before hosted-AI opt-in |
| E2E suite covers only public boundaries | Web quality owner | Prevents fake journey-completion claims | Seeded integrated fixtures and all 44 journey tests pass | Before release candidate |

## Final judgment

The V3 repository is a credible, safety-oriented source candidate. It is **not production deployable from the evidence available in this run**. Release requires a registry-enabled clean build, PostgreSQL 18 authority proof, Docker/Compose smoke, complete browser and accessibility journeys, hostile-media validation, and a demonstrated backup/restore.
