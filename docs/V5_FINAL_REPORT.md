# Capsicum Breeding Intelligence Platform V5 Final Report

## Release verdict

**BLOCKED.**

V5 closes the largest implementation gaps left by V4: the advanced genetics engines now share one governed persistence boundary; text and Markdown research sources use durable immutable ingestion; accepted images produce deterministic derivatives and machine-observable facts with independent decoder parity; measurements support linear human correction; breeding-ledger exports stream under a repeatable-read snapshot; and hosted AI is optional, bounded, citation-revalidated, and non-authoritative.

Production deployment is still not proven. The validation host cannot perform a legitimate frozen installation, Node 24 build, PostgreSQL 18 migration/authority suite, Docker/MinIO/ClamAV integration, browser E2E/WCAG validation, security scans, or isolated backup restoration.

## Verified pre-edit state

V4 contained 446 files, 54 page routes, 11 API routes, 22 forward migrations, and zero approved executable phenotype rules. Its exact-genetics core and biological identity model were materially sound. The remaining genuine implementation gaps were:

- advanced linkage, maternal, conditional-rule, host–pathogen, and direct Monte Carlo execution were not unified through one persisted service/API/UI contract;
- research ingestion stopped short of a durable extraction and review workflow;
- accepted media lacked deterministic derivative and measurement execution;
- phenotype measurements lacked a canonical correction history;
- large exports still required a fully streamed artifact path;
- hosted AI was intentionally unwired;
- runtime proof remained blocked by missing infrastructure and dependency installation.

The V5 baseline is recorded in `docs/V5_BASELINE_REPORT.md` and `docs/v5-baseline.json`.

## Architecture decisions

V5 extends the approved modular monolith. It does not replace it.

- `packages/genetics-core` remains pure, deterministic, and exact.
- Advanced scientific models remain isolated in `packages/genetics-advanced`.
- Canonical application services own authoritative mutations.
- PostgreSQL remains the authority boundary for RLS, immutable snapshots, state transitions, worker leases, and correction histories.
- Direct Monte Carlo is sampled directly and never expands the exact state space first.
- Node workers own durable execution and persistence finalization.
- The Python worker is an independent deterministic verifier, not a learned-phenotype authority.
- Hosted AI remains optional and cannot approve evidence, publish rules, promote models, or mutate scientific terminal states.
- Migrations `0001` through `0022` remain unchanged. V5 adds migrations `0023` through `0027` only.

## Final repository scope

- Repository files: **500** before archive packaging.
- Page routes: **54**.
- API routes: **14**.
- Forward migrations: **27** (`0001` through `0027`).
- Static authority-table inventory: **115 unique `CREATE TABLE` declarations**.
- TypeScript-family files parsed by the repository parser: **155**.
- Approved executable phenotype rules: **0**.

## Work completed

### Governed advanced simulation laboratory

- Added one versioned request contract for phased two-locus linkage, maternal state, approved conditional rule graphs, host–pathogen rules, and direct inheritance Monte Carlo.
- Preserves calculation, premise, and interpretation authority independently.
- Validates approved release inputs as exact normalized locus–allele pairs.
- Requires approved executable rules and their supporting assertions to be members of the selected immutable release.
- Preserves maternal and paternal direction, phase evidence, recombination assumptions, catalog release, engine/model version, evidence IDs, seed, sample count, diagnostics, input hash, and result hash.
- Rejects unknown maternal state rather than hiding alternatives inside one result.
- Rejects duplicate loci, inconsistent hypothesis locus sets, non-positive hypotheses, and parent probability masses that do not sum exactly to one before enqueue.
- Provides a guided browser form instead of raw JSON.
- Keeps phenotype and host–pathogen modes unavailable when no approved rules exist.

### Durable research ingestion

- Added bounded UTF-8 text and Markdown upload with immutable object hash and durable job enqueue.
- Added deterministic normalization, passage segmentation, passage hashes, extraction artifact hashes, exact source locators, and extractor version.
- Added independent review for both source documents and passages.
- Added source detail and passage navigation surfaces.
- PDF remains explicitly unavailable until a bounded approved extractor and hostile fixtures exist.

### Deterministic media processing

- Accepted scanner-clean media automatically queues immutable thumbnail and analysis-ready derivatives.
- Derivatives strip metadata and bind source hash, algorithm, version, parameters, dimensions, result hash, and object key.
- Approved phenotype captures automatically queue deterministic machine-observable image facts.
- Sharp/libvips facts are independently checked by Python/Pillow.
- EXIF orientation is applied before dimensions and luminance are computed.
- Hash mismatch, path escape, multi-frame input, invalid dimensions, and decoder disagreement fail closed.
- No fruit trait, disease, flavor, yield, SHU, or learned phenotype claim is emitted.

### Measurement correction authority

- Machine results remain immutable.
- Human correction creates a new immutable revision with actor, reason, predecessor, timestamp, and value payload.
- The aggregate is locked and the supplied predecessor must equal the current revision.
- Stale branching is rejected.
- Worker authority can initialize revision one only; it cannot impersonate a human correction.

### Streaming breeding-ledger exports

- Exports page authoritative sections under one repeatable-read transaction.
- JSON or CSV is written incrementally to a mode-0600 temporary file.
- SHA-256 is computed during writing.
- The completed artifact streams to immutable object storage rather than being held as one database JSON value or worker buffer.
- Worker lease ownership, export context, workspace binding, byte length, and final hash are verified before completion.

### Evidence-bounded hosted AI

- Hosted generation is enabled only by explicit configuration.
- Approved workspace evidence is bounded before provider transfer.
- Timeout, retries, output tokens, evidence volume, and temperature are bounded.
- Evidence is treated as untrusted data, not instructions.
- Every generated citation is revalidated after generation and again before persistence.
- Provider/model/latency/token metadata and fallback state are audited.
- Provider failure or changed evidence approval falls back to the deterministic evidence answer.
- Core research workflows remain functional with hosted AI disabled.

### Security and runtime boundaries

- Expanded worker-only function and runtime privilege verification for all V5 functions.
- Added RLS-scoped simulation request and processing-run records.
- Added immutable job and scientific input snapshots.
- Retained recursive log redaction, separate worker credentials, fixed function search paths, restricted object downloads, and fail-closed production configuration.

## Scientific corrections made during final review

Two defects were found after the initial V5 implementation and corrected before packaging:

1. EXIF-oriented images could have produced a false cross-decoder mismatch because pre-rotation metadata dimensions were compared with post-orientation Pillow dimensions. V5 now computes Sharp dimensions and luminance from the actual rotated grayscale pixel buffer.
2. Direct Monte Carlo premises could contain duplicate loci, inconsistent locus sets, or probability masses that failed only after worker enqueue. The governed contract now rejects those invalid premises before any job or immutable request record is created.

## Validation summary

Passed locally:

- repository validator: 699 checks, zero source issues, five environment warnings;
- TypeScript parser: 155 files, zero diagnostics, TypeScript 5.8.3 parser;
- Python worker: eight tests passed, including hostile/orientation fixtures;
- exact genetics runtime smoke: exact, independent, uncertainty, linkage, maternal direction, direct Monte Carlo, observed segregation, and host–pathogen abstention;
- authentication runtime smoke: scrypt-v2, valid/invalid/dummy verification, keyed abuse digest, and opaque token hashing;
- catalog reconciliation: 22 loci, 22 evidence claims, 30 sources, zero executable rules;
- YAML, shell, and Node operational-script syntax;
- source checksum and archive verification performed after final document generation.

Unavailable and therefore not passed:

- legitimate `pnpm-lock.yaml` and frozen installation;
- Node 24 / TypeScript 5.9.2 full workspace typecheck, lint, tests, Turbo, Next.js standalone, and worker production build;
- PostgreSQL 18 empty replay, V4-to-V5 replay, RLS, grants, triggers, concurrency, idempotency, and query-plan execution;
- Docker, MinIO, ClamAV, worker restart, object cleanup, and large-artifact integration;
- Playwright, axe, manual keyboard/mobile/zoom review;
- dependency/license/secret/SAST/container scans and SBOM;
- backup and isolated restore;
- R worker execution.

## Remaining genuine implementation blockers

- PDF research ingestion and hostile PDF fixtures are not implemented.
- MIAPPE conformance mappings and fixtures are not complete.
- Full multi-generation F1/F2/backcross orchestration is represented by selection plans but is not a single automated scenario engine.
- Deterministic media output is limited to image facts and derivatives; scale/color-reference calibration and validated biological measurements remain unavailable.
- No approved executable phenotype rule or independently validated learned model exists.
- Complete authenticated browser coverage for every acceptance journey is not present.

## Release judgment

V5 is a real scientific records and bounded genetics application candidate. It is **not production-ready** until restricted-role PostgreSQL execution, frozen production builds, integrated worker/object-storage tests, browser accessibility evidence, and a verified restore are demonstrated.
