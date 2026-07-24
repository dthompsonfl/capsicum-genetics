# Capsicum Breeding Intelligence Platform v2 — File-by-File Review and Next-Sweep Gap Analysis

**Reviewed archive:** `capsicum-breeding-intelligence-platform-next-sweep-v2(1).zip`  
**Archive inventory:** 294 files; no nested archives  
**Review posture:** adversarial source, contract, database, scientific-authority, security, UX, worker, and release review  
**Verdict:** substantial engineering candidate; **not production-ready and not yet scientifically safe enough for authoritative breeding records without the corrections below**

The accompanying `CAPSICUM_V2_FILE_BY_FILE_AUDIT.csv` and `.json` contain one row for every file in the supplied archive. This document records the load-bearing findings that must control the next implementation sweep.

## 1. What materially improved

The repository is no longer a route-name scaffold. It now contains:

- a real Next.js App Router application with 48 page routes and 7 API routes;
- authenticated workspace transactions, opaque hashed sessions, invitation and membership flows;
- six forward-only PostgreSQL migrations defining a broad authoritative model and membership-bound RLS;
- durable idempotency primitives, audit history, job/outbox lease functions, and a persistent Node worker;
- working germplasm, seed-lot, plant, cross, harvest, pedigree, observation, catalog, simulation, upload, export, and research service paths;
- strong exact-rational genetics primitives and meaningful scientific abstention behavior;
- a legitimate evidence catalog with generated provenance rather than hard-coded folklore.

These are real improvements. They should be preserved. A rewrite would create risk without solving the remaining authority defects.

## 2. Validation actually performed in this review

The following checks were executable in the supplied environment:

- ZIP integrity: passed.
- Recursive inventory: 294 original files, no nested archives.
- JSON parsing: all repository JSON files parsed successfully.
- `python3 -m pytest apps/worker-python/tests -q`: **3 passed**.
- `python3 scripts/import_catalog.py --check`: passed.
- `python3 scripts/validate_repository.py`: structural validation passed, while correctly reporting release readiness as false.
- Shell syntax for backup and restore scripts: passed.

The following remain **unproven**, not passed:

- Node 24 clean install, lint, typecheck, Vitest, Turbo build, and Next production build;
- PostgreSQL 18 migration replay, RLS, trigger, concurrency, and restricted-role behavior;
- Docker image and integrated Compose execution;
- browser E2E, WCAG/axe, responsive and CSP/CSRF behavior;
- Node worker lease/crash/cancellation integration;
- object-storage upload/download/reconciliation;
- R worker execution;
- backup and isolated restore drill;
- dependency, license, secret, SAST, container, and SBOM scans.

The host has Node 22, no pnpm, no PostgreSQL client/server, no Docker, and no R. The repository has no lockfile. No runtime-completion claim should rely on the structural validator.

## 3. Release-blocking findings

### P0-1 — The repository cannot pass its own frozen install

`package.json`, CI, and both Node Dockerfiles specify pnpm 10.14.0 and frozen installs, but `pnpm-lock.yaml` is absent. CI and image builds are therefore blocked as committed.

The next agent must generate the lockfile through a real Node 24 registry-enabled install, commit it, then prove a clean `--frozen-lockfile` install. Hand-authoring a lockfile is prohibited.

### P0-2 — Workspace TypeScript packaging is unproven

Every internal package exports TypeScript source directly. `apps/web/next.config.ts` transpiles only a subset of the packages imported by the web app and omits important source-exporting packages such as `@capsicum/application`, `@capsicum/auth`, `@capsicum/database`, `@capsicum/storage`, `@capsicum/breeding-domain`, and `@capsicum/observation-domain`.

This may fail in the Next standalone build or produce runtime packaging defects. The Node worker also runs TypeScript source with `--experimental-strip-types` while importing workspace packages. Choose and prove one canonical boundary:

1. explicitly transpile every source-exporting package required by Next and prove standalone tracing; or
2. build packages to `dist` with proper exports and run only compiled production artifacts.

The second path is preferred for deterministic worker/container deployment if it can be introduced without needless complexity.

### P0-3 — Duplicate-submit protection is not actually connected to user intent

`executeIdempotent` is a strong multi-instance database primitive, but `apps/web/src/app/actions.ts` generates `randomUUID()` inside each server action. Each duplicate browser submission therefore receives a different key and can create duplicate authoritative records.

The client must create one stable request ID per user intent, retain it across retry/re-render/network ambiguity, submit it with the mutation, and rotate it only after definitive success or intentional reset. Add concurrent duplicate-submit tests against real PostgreSQL for every authoritative workflow.

### P0-4 — Cross verification is scientifically conflated with fruit set

`packages/application/src/breeding-service.ts` maps `fruit_set` to the `verified` cross state. Fruit set proves fertilization/fruit development, not paternal identity, isolation integrity, or genetic verification. The same generic transition service can mark a cross `harvested` without creating fruit, seed harvest, seed lot, or family artifacts.

Split at least:

- operational lifecycle: planned, prepared/bagged, pollinated, fruit_set, harvest_ready, harvested, failed, closed;
- identity/verification state: unverified, process_documented, marker_confirmed, conflicted, failed;
- verification method/evidence, reviewer, date, and confidence.

Only the canonical harvest transaction may set the operational state to harvested. A generic event cannot bypass required biological artifacts.

### P0-5 — Cross-derived progeny are assigned to the maternal accession

`harvestCross` obtains the maternal plant’s source seed-lot accession and assigns it to the recombinant progeny seed lot. That is a biological identity error. A controlled cross, selfed family, or open-pollinated family is not the maternal accession.

Create a canonical derived germplasm/family/population identity model. A progeny seed lot must reference its cross, seed harvest, family/generation, and derived line/population identity; it must not inherit a parental accession identifier as if genetically identical.

### P0-6 — Alleles are free-form text while catalog authority checks only loci

The catalog release proves that a locus is in a reviewed release, but genotype calls and simulation inputs use unrestricted allele strings. There is no authoritative allele/variant/marker/assay/reference-assembly model. An “approved release” simulation can therefore use invented allele names at a valid locus.

Add forward migrations and contracts for normalized allele definitions, aliases, sequence/structural variants where known, reference assembly/version, marker assays, call method, ploidy, phase/haplotype, and unresolved source notation. Approved-release simulation must validate every allele identifier and its applicability/version. User-declared mode remains available but visibly lower authority.

### P0-7 — Observation corrections can overwrite current truth from a stale branch

A correction can supersede any historical revision and then update `observations.current_revision_id`, even if another correction has already become current. It also validates against the incoming definition ID rather than proving that it matches the observation’s immutable definition/version.

Require a current revision token/version, lock the observation row, reject stale corrections with a conflict response, and either keep definition identity immutable or provide an explicit governed definition-migration workflow. The database should enforce a linear correction chain for the authoritative current revision.

### P0-8 — Draft observation definitions can create authoritative observations

`listObservationDefinitions` returns all review states and `recordObservation` does not require an approved definition. Category validation checks only the textual vocabulary array and ignores the declared vocabulary ID/version.

Only approved, versioned definitions may create authoritative observations. Research/draft capture must be labeled and segregated. Controlled terms must resolve to a specific approved vocabulary/version, not merely match a string.

### P0-9 — Visual “analysis” trusts operator-entered machine facts

The phenotype-capture form asks the user to enter inspected width, height, blur score, and whether references are visible. Width/height are compared with file metadata, but blur and calibration/reference presence are not machine-derived. This is a governed manual declaration form, not visual analysis.

Move image decoding, metadata extraction, blur/quality computation, thumbnail generation, reference detection/confirmation, and deterministic measurement into an isolated worker. Store derived values with algorithm/version/hash and preserve operator confirmation/correction as separate audited evidence.

### P0-10 — Upload limits occur after the full file is buffered

The upload route calls `request.formData()` and `file.arrayBuffer()` before `inspectUpload` enforces the 25 MB limit. This is an avoidable memory/DoS risk. The pipeline also lacks a scanner, hostile decoder isolation, metadata policy, and orphan-object reconciliation.

Implement bounded streaming or platform-enforced request limits before buffering, quarantine-first object state, malware/decoder checks, metadata stripping policy, immutable derivatives, and background reconciliation/cleanup.

## 4. High-priority incomplete areas

### Scientific lineage and inventory

- `createSeedLot` does not prove that a selected source lot belongs to the selected accession.
- `createPlant` creates unlimited plants without consuming or recording seed inventory.
- `plants.genotype_evidence_state` is overwritten by the latest single-locus call and cannot represent aggregate coverage/conflict.
- Family membership and grow-out linkage are not completed as operational workflows.
- Label records exist, but printable/scanable QR workflows are absent.

### Simulation product

- Exact independent inheritance is strong, but the response authority conflates exact arithmetic with premise quality.
- Only one-locus target recovery is modeled in the main contract.
- Advanced linkage, maternal state, governed rule graphs, host–pathogen context, and direct Monte Carlo exist only as library primitives or a worker job.
- No canonical engine chooser, persisted advanced result contract, multi-generation F1/F2/backcross planning, or observed segregation reconciliation exists.
- Long simulation fallback is not enqueued from the web/application layer.

Use separate fields such as:

- `calculationAuthority`: exact | approximate;
- `premiseAuthority`: verified | mixed | assumed | conflicting | unknown;
- `interpretationAuthority`: genotype_only | conditional_phenotype | unsupported;
- explicit model/release/applicability/evidence identifiers.

### Jobs, outbox, and exports

- The Node worker supports only health and direct Monte Carlo jobs.
- It does not heartbeat during a long computation and checks cancellation only before execution.
- Outbox “publication” writes the complete payload to stdout and marks it published; this is neither a governed delivery adapter nor safe for sensitive payloads.
- Application workflows do not expose a canonical enqueue service.
- Exports are synchronous and fully materialized in a web request, with a 10,000-row section cap.

Implement real job producers/handlers for Monte Carlo, media inspection, research ingestion, and streamed exports; heartbeat/cancel between chunks; durable artifacts; redacted logs; retries; dead-letter remediation; and worker capability/lag health.

### AI and research

- The evidence assistant correctly abstains and revalidates citations.
- Retrieval is simple keyword overlap over already-existing passages.
- Hosted structured generation exists but is not wired into the application.
- The source detail route is still an explicit blocked capability page.
- There is no complete source/document ingestion, extraction, passage review, supersession, hybrid retrieval, evaluation, or feedback workflow.

Implement ingestion and review first. Prefer PostgreSQL full-text/trigram retrieval plus optional embeddings only if measured quality justifies them. AI remains non-authoritative, feature-gated, audited, and replaceable by deterministic summaries.

### Authentication and security

- The baseline scrypt/session implementation is sound.
- Request fingerprinting trusts `x-forwarded-for` and hashes IP addresses without a secret, making fingerprints spoofable and potentially reversible.
- Invitation tokens remain in URLs through failure flows and can enter history/logs/referrers.
- Workspace switching exists in service code but lacks a complete interface.
- Password recovery, optional MFA, rate limiting, abuse monitoring, and administrative session controls are absent.
- CSP nonce, cookie/CSRF, proxy trust, and all route/API authorization require production-browser proof.

### Web UX

Most routes are now backed by services, but they remain thin server-rendered forms and tables. The next sweep must prove complete nontechnical-user journeys, guided validation, stable submission state, pagination/search, keyboard/mobile use, empty/error/loading/degraded states, and destructive-action confirmation. The research source detail route must cease being a capability placeholder.

### Testing and release evidence

The 69 TypeScript test cases are concentrated in pure domain packages. `packages/application/src/index.test.ts` contains only a sentinel test. There are no real browser tests, PostgreSQL service tests, object-store integration tests, Node-worker integration tests, or complete RLS attack suite.

Add:

- migration replay from empty and representative prior state;
- restricted-role RLS/trigger tests across every authoritative table;
- application service transaction/concurrency/rollback/idempotency tests;
- worker lease, heartbeat, crash, retry, cancellation, stale recovery, and dead-letter tests;
- upload/download/quarantine/orphan tests against object storage;
- Playwright E2E and axe tests for all required journeys;
- performance/scale tests and query plans;
- container/Compose smoke tests;
- backup plus isolated restore with row and object hash reconciliation.

## 5. File-level disposition

See `CAPSICUM_V2_FILE_BY_FILE_AUDIT.csv` for all 294 files. The intended handling is:

- **Preserve and extend:** exact genetics core, rational arithmetic, scientific abstention, transaction-local workspace context, immutable/audit concepts, membership-bound RLS, generated catalog provenance.
- **Correct at authority layer:** breeding service, observation service, simulation authority contracts, genotype/allele schema, media/capture service, worker integration, idempotency connection.
- **Complete end to end:** AI ingestion/retrieval, advanced simulations, visual analysis, async exports, QR/labels, session/workspace administration, E2E accessibility and release operations.
- **Do not hand edit:** generated catalog JSON/CSV/workbook exports; regenerate through source scripts.
- **Do not rewrite:** modular monolith, PostgreSQL authority boundary, pure genetics core, explicit scientific gates.

## 6. Recommended next-sweep sequencing

1. Prove clean Node 24 install/build and choose the workspace package compilation boundary.
2. Add forward migration(s) for biological identity, allele normalization, observation concurrency, and job artifacts.
3. Correct cross, progeny, inventory, genotype aggregate, and observation authority services.
4. Connect stable idempotency tokens to every user mutation.
5. Add real PostgreSQL integration and adversarial tests before expanding features.
6. Integrate advanced simulations and durable job execution.
7. Build source ingestion/RAG and isolated image-analysis pipelines.
8. Complete web workflows, pagination, workspace/session controls, QR/labels, and accessibility.
9. Execute the full container/browser/backup/security validation ladder.
10. Update documentation only from observed evidence and package the modified-file archive.

## 7. Release-readiness judgment

**Conditionally ready for another implementation sweep. Not production-ready.**

The architecture is worth preserving. The next sweep must focus on authoritative correctness and proof—not adding more named routes, tables, or documentation claims.
