# Capsicum Breeding Intelligence Platform - File-by-File Adversarial Review

Date: 2026-07-22

## Review scope

Reviewed archive: `capsicum-breeding-intelligence-platform-built-v1(1).zip`

The archive was extracted recursively and reviewed across the web application, package graph, database migrations, workers, infrastructure, tests, generated catalog data, and preserved source handoff. The repository contains 238 inventoried files, 16 workspace packages, 46 page routes, 3 API routes, 37 PostgreSQL tables, a Python worker, an R worker, and the complete original planning pack.

## Validation actually performed

- ZIP extraction and recursive inventory inspection.
- Package, route, dependency, migration, contract, and test-surface review.
- `python3 -m pytest apps/worker-python/tests -q`: 3 tests passed.
- `python3 scripts/import_catalog.py --check`: passed catalog reconciliation.
- `python3 scripts/validate_repository.py`: structural checks passed, but release readiness remained false.
- A real Node build could not be executed in this environment because the archive has no `pnpm-lock.yaml`, the runtime is Node 22 rather than the required Node 24, pnpm is unavailable, and registry access is blocked.
- PostgreSQL, Docker, R, browser E2E, accessibility, and backup/restore runtime proof could not be executed here.

The repository's validator is useful as a structural guard, but it mostly proves expected files and literal markers. It does not prove that migrations execute, authorization is enforced, the app builds, workflows persist, workers consume jobs, browser flows work, or backup restoration succeeds.

## Executive verdict

**Current state: strong architecture and scientific-safety foundation; not a complete web application.**

The implementation correctly refuses to invent unsupported genetics. The exact inheritance engine is the strongest part of the codebase. The primary failure is delivery completeness: most routes are capability-status shells, and the production paths for identity, persistence, biological workflows, catalog governance, jobs, AI retrieval, image handling, exports, and operations are not connected.

Do not rewrite the platform. The next sweep should preserve the modular monolith and scientific boundaries while implementing the missing vertical slices through canonical services and repositories.

## Highest-priority findings

### P0. CI and reproducibility are currently broken

CI requires `pnpm install --frozen-lockfile`, but there is no `pnpm-lock.yaml`. The web Dockerfile uses `--no-frozen-lockfile`, producing a different dependency policy than CI. A registry-enabled Node 24 environment must generate and commit the lockfile, then run the complete project-native validation ladder.

### P0. The web route map exists, but the product workflows do not

Most route files render `CapabilityPage` with `foundation` or `blocked` state. A user cannot yet onboard, authenticate, manage a workspace, register germplasm, create seed lots and plants, execute a controlled cross, record harvest/progeny, enter observations, publish a catalog release, upload images, retrieve AI evidence, inspect durable jobs, export data, or complete a breeding cycle.

### P0. No production authentication or authorization enforcement

`packages/auth` is a role-permission map only. There are no sessions, secure cookies, account recovery, invitations, MFA/passkey/OIDC boundary, CSRF controls, active membership state, or route/API enforcement. Database workspace context is only trustworthy after it is derived from an authenticated server-side principal.

### P0. Database intent and domain contracts drift

The SQL has strong RLS, append-only, and scientific-review intent, but it is not exercised against PostgreSQL. Domain packages are not backed by repositories. Specific drift includes job terminal timestamps/results, observation value-contract enforcement, scientific review transitions, model promotion, and biological-origin invariants.

### P0. Exact simulation production path is not authoritative

The only mutation API uses an in-memory idempotency map and is disabled in production. It accepts arbitrary workspace, release, locus, allele, and material identifiers. It must validate authenticated workspace membership, approved catalog release contents, genotype evidence, idempotency, and immutable persisted run records.

### P0. Monte Carlo does not solve exact-state explosion

The current Monte Carlo function samples a distribution that must already have been exactly enumerated. It therefore cannot serve as the fallback for an oversized exact cross. Implement direct stochastic inheritance sampling from parent hypotheses/gametes without materializing the entire exact distribution.

### P0. File upload and observability security are incomplete

The storage package only validates object-key segments and a MIME allowlist. It does not inspect file signatures, bound decoded images, prevent decompression bombs, quarantine uploads, scan content, or implement signed access. Logging redaction is only shallow and can leak nested secrets.

## Required next-sweep outcome

The next sweep should deliver a functioning authenticated, persisted, responsive web MVP that supports a complete breeding cycle and exact simulation, while retaining explicit research-only gates for unsupported phenotype, quantitative, genomic, disease, SHU, and learned-vision claims.

The completion prompt accompanying this report defines the exact scope, sequencing, stop conditions, tests, and final evidence contract.

## Priority legend

- **P0**: release-blocking correctness, security, data, or missing core workflow.
- **P1**: required for a credible MVP or strong production hardening.
- **P2**: cleanup, consistency, or lower-risk improvement.
- **Preserve / Source of truth / Generated / Release gate**: do not casually edit; maintain provenance and regenerate through canonical sources.

## File-by-file review

| File | Priority | Finding and required next action |
|---|---|---|
| `.dockerignore` | **P2** | Repository/tooling support file. Keep aligned with actual runtime and generated-file conventions. |
| `.env.example` | **P1** | Documents basic runtime variables, but needs auth-provider/session-cookie settings, upload limits, rate limits, worker concurrency, observability, retention, and backup configuration. |
| `.github/workflows/ci.yml` | **P0** | CI is configured to use a frozen pnpm lockfile, but pnpm-lock.yaml is absent, so CI cannot currently install. Add real PostgreSQL integration, browser E2E/accessibility, security, migration, worker, and backup/restore jobs. |
| `.gitignore` | **P2** | Correctly ignores common outputs, but the archive still contains Python cache artifacts. Remove generated caches and verify archive hygiene. |
| `.nvmrc` | **P2** | Repository/tooling support file. Keep aligned with actual runtime and generated-file conventions. |
| `.prettierignore` | **P2** | Repository/tooling support file. Keep aligned with actual runtime and generated-file conventions. |
| `.prettierrc.json` | **P2** | Repository/tooling support file. Keep aligned with actual runtime and generated-file conventions. |
| `AGENTS.md` | **Preserve** | Strong scientific boundary rules. Expand with canonical service/repository boundaries, generated-code ownership, auth enforcement, and validation obligations. |
| `README.md` | **Update** | Accurately states the repository is a conditionally complete foundation. Rewrite only after the next sweep to reflect proven runtime behavior and exact commands. |
| `apps/web/Dockerfile` | **P0** | Uses non-frozen install while CI requires frozen install. Make the image reproducible, copy only required manifests first, add health behavior, and verify standalone output and non-root runtime. |
| `apps/web/next-env.d.ts` | **P2** | Repository/tooling support file. Keep aligned with actual runtime and generated-file conventions. |
| `apps/web/next.config.ts` | **P0** | Basic headers exist, but production security needs a tested CSP/nonce strategy, HSTS under HTTPS, secure asset policy, and explicit image/upload configuration. |
| `apps/web/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `apps/web/src/app/admin/audit/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: Append-only audit storage is defined. The demo app has no authenticated mutation history to display. |
| `apps/web/src/app/admin/jobs/page.tsx` | **Review** | Route requires integration with canonical server-side services, authorization, persistence, accessibility, and end-to-end tests. |
| `apps/web/src/app/admin/models/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: Database promotion gates exist; no quantitative or learned model is validated in this release. |
| `apps/web/src/app/admin/system/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: The current release exposes environment and feature readiness through the system endpoint. |
| `apps/web/src/app/ai/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: The deterministic mock and citation validator are implemented. Hosted generation remains optional and degraded. |
| `apps/web/src/app/annotations/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Annotation revisions and reviewer workflows are not implemented in the web application. |
| `apps/web/src/app/api/health/route.ts` | **P1** | Liveness-only endpoint is acceptable, but separate liveness and readiness and include version/build identity. |
| `apps/web/src/app/api/simulations/exact/route.ts` | **P0** | Demo-only in-memory idempotency is not durable, not multi-instance safe, and production is disabled. Add authenticated workspace authorization, persistent idempotency, approved catalog validation, immutable run persistence, rate limits, and response-schema validation. |
| `apps/web/src/app/api/system/readiness/route.ts` | **P1** | Returns typed configuration status but does not verify database/object storage/worker connectivity. Add bounded live checks and protect internal details. |
| `apps/web/src/app/breeding-ledger/page.tsx` | **P0** | Documentation-only page. Implement the full biological identity chain with persistent CRUD, controlled transitions, labels/QR, audit, and lineage navigation. |
| `apps/web/src/app/catalog/claims/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Claim review, applicability decisions, and separation of duties are not connected. |
| `apps/web/src/app/catalog/loci/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: The seed record can be reviewed in the catalog table; authoritative detail review is not connected. |
| `apps/web/src/app/catalog/page.tsx` | **P1** | Route points to a partial vertical slice. Complete persistence, authorization, error/degraded states, and E2E coverage. Current summary: The normalized seed catalog is visible under the implemented scientific catalog route. |
| `apps/web/src/app/catalog/releases/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Immutable publication and rollback controls exist in SQL, but release administration is not connected. |
| `apps/web/src/app/crosses/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Cross events, verification, fruit set, harvest, and progeny detail are not connected yet. |
| `apps/web/src/app/crosses/new/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: This route is blocked until authenticated plant selection and durable idempotent writes are connected. |
| `apps/web/src/app/crosses/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: Directed maternal and paternal roles are protected in the domain and database. Full pollination and harvest workflows are pending. |
| `apps/web/src/app/dashboard/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: The dashboard currently summarizes exact-engine and catalog readiness. Durable operational metrics require authenticated database records. |
| `apps/web/src/app/experiments/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Experiment design, environments, variables, sessions, and observations are unavailable. |
| `apps/web/src/app/experiments/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Experiment, environment, variable, and session workflows are not connected yet. |
| `apps/web/src/app/families/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Family membership, generation, segregation observations, and selection decisions are not connected yet. |
| `apps/web/src/app/germplasm/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Accession detail persistence and audit are not connected yet. |
| `apps/web/src/app/germplasm/new/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: A new accession must have a stable material code, taxon, source provenance, and a singular origin event. |
| `apps/web/src/app/germplasm/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: Canonical accession storage is defined in PostgreSQL; record-entry workflows are not connected in this release. |
| `apps/web/src/app/globals.css` | **P1** | Provides a coherent responsive baseline, but needs design tokens/components, browser-tested focus/contrast, reduced-motion verification, tables/forms at mobile widths, and WCAG 2.2 AA audit. |
| `apps/web/src/app/layout.tsx` | **P0** | Hard-coded demo identity and incomplete navigation. Replace with authenticated workspace shell, role-aware navigation, active states, responsive mobile navigation, and global error/loading behavior. |
| `apps/web/src/app/observations/session/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Append-only observation revision rules exist, but session capture is not connected. |
| `apps/web/src/app/onboarding/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: The onboarding route documents the required sequence but does not create authoritative users or workspaces in demo mode. |
| `apps/web/src/app/page.tsx` | **P1** | Good authority framing but static seed metrics. Convert to role-aware workspace dashboard with live data while preserving abstention language. |
| `apps/web/src/app/pedigrees/[materialId]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: The cycle-safe pedigree foundation exists, but the visual graph repository is not connected. |
| `apps/web/src/app/phenotype-capture/page.tsx` | **P1** | Static quality-gate demonstration. Add signed upload, quarantine, capture protocols, calibration, annotation/correction, deterministic measurements, and human approval. |
| `apps/web/src/app/phenotypes/images/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Immutable object, protocol, quality, measurement, annotation, and correction detail are not connected. |
| `apps/web/src/app/phenotypes/images/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: Deterministic capture-quality and calibrated-length boundaries are implemented; uploads and persistence are not. |
| `apps/web/src/app/plants/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Plant lifecycle, genotype evidence, observations, and samples are not connected yet. |
| `apps/web/src/app/plants/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: Individual plants are canonical biological materials linked to source seed lots and genotype evidence states. |
| `apps/web/src/app/reports/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Authoritative exports are not connected yet. |
| `apps/web/src/app/research-assistant/page.tsx` | **P1** | Static deterministic example. Add authenticated retrieval over approved passages, citation verification, tool audit, rate/cost controls, feedback, and strict abstention. |
| `apps/web/src/app/research/review/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Candidate extraction and review-state storage are defined; no AI output can approve scientific evidence. |
| `apps/web/src/app/research/sources/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Versioned source and passage persistence are modeled, but source ingestion detail is not connected. |
| `apps/web/src/app/scientific-catalog/page.tsx` | **P0** | Read-only generated catalog view. Add persistence-backed source/locus/assertion review, diffing, independent approval, applicability, conflict handling, and immutable release publication. |
| `apps/web/src/app/seed-lots/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Seed inventory events, storage, labels, and lineage detail are not connected yet. |
| `apps/web/src/app/seed-lots/page.tsx` | **P0** | Route exposes foundation status rather than an end-to-end workflow. Connect canonical services, permissions, persistence, all UI states, and tests. Current summary: Seed-lot lineage and quantity constraints are modeled; inventory transactions and labels remain to be implemented. |
| `apps/web/src/app/selection-plans/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Selection plan persistence, candidate ranking, and decision approval are unavailable. |
| `apps/web/src/app/selection-plans/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Selection-goal and decision provenance are part of the target architecture but are not yet authoritative. |
| `apps/web/src/app/settings/users/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Role and permission contracts exist, but invitation and session workflows are not connected. |
| `apps/web/src/app/settings/workspace/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Workspace persistence exists at the schema level; production mutation screens require authentication. |
| `apps/web/src/app/sign-in/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Production sign-in is intentionally unavailable until a durable session and account recovery implementation is connected. |
| `apps/web/src/app/simulation-lab/page.tsx` | **P1** | Keep the scientific wording; integrate the form into authenticated persisted simulation workflow. |
| `apps/web/src/app/simulation-lab/simulation-form.tsx` | **P0** | Best implemented UI slice, but hard-codes demo workspace/release/material IDs and only supports one certainty-1 genotype per locus. Connect real materials/catalog releases, weighted uncertainty, saved runs, accessible validation, server errors, and plan creation. |
| `apps/web/src/app/simulations/[id]/page.tsx` | **P0** | Route is an explicit blocked shell. Implement the persisted, authorized workflow required by the route contract. Current summary: Immutable simulation storage is modeled, but this demo does not retrieve authoritative runs. |
| `apps/web/src/app/simulations/new/page.tsx` | **P1** | Route points to a partial vertical slice. Complete persistence, authorization, error/degraded states, and E2E coverage. Current summary: Use the exact simulation lab for the implemented vertical slice. |
| `apps/web/src/app/simulations/page.tsx` | **P1** | Route points to a partial vertical slice. Complete persistence, authorization, error/degraded states, and E2E coverage. Current summary: Exact simulation is implemented. Durable immutable run persistence is defined but not connected to the demo UI. |
| `apps/web/src/components/capability-page.tsx` | **Replace** | Useful honesty scaffold, but most product routes must become real workflows. Retain explicit unavailable/degraded states only for scientifically blocked capabilities. |
| `apps/web/src/lib/environment.ts` | **P1** | Schema validation is useful, but readiness is configuration-presence only. Add live dependency probes without leaking secrets. |
| `apps/web/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `apps/worker-python/Dockerfile` | **P1** | Health-only container boundary. Add pinned dependencies/lock, durable job consumer entrypoint, read-only filesystem where possible, and health/readiness behavior. |
| `apps/worker-python/pyproject.toml` | **Review** | No critical defect was isolated in this file, but it must remain aligned with the canonical architecture, contracts, security controls, and validation ladder. |
| `apps/worker-python/tests/test_worker.py` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `apps/worker-python/worker.py` | **P1** | Independent exact parity is useful, but this is a stdin health/utility process, not a durable worker. Add typed job contracts, queue claims, artifact storage, heartbeat/cancellation, and only validated deterministic vision workloads. |
| `apps/worker-r/Dockerfile` | **P1** | Research-only health container. Add reproducible package management and job consumer only when an approved protocol exists. |
| `apps/worker-r/README.md` | **Research gate** | Keep research-only until protocols, package versions, datasets, and model evaluations are approved. |
| `apps/worker-r/worker.R` | **Preserve gate** | Correctly abstains. Add AlphaSimR or statistical execution only after package pinning, approved protocols, datasets, and evaluation gates exist. |
| `docs/BUILD_MANIFEST.json` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/EXECUTION_MEMO.md` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/FILE_INVENTORY.txt` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/FINAL_REPORT.md` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/RELEASE_BLOCKERS.md` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/ROADMAP.md` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/ROUTE_INVENTORY.md` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/SCIENTIFIC_LIMITATIONS.md` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/VALIDATION_REPORT.md` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/catalog-reconciliation.json` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/repository-validation.json` | **Update** | Current-state documentation. Update after implementation with exact behavior, commands, evidence, failures, and residual scientific gates. |
| `docs/source-handoff/DECISIONS_AND_STOP_CONDITIONS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/EXECUTION_PROMPT.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/FINAL_REPORT_TEMPLATE.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/MANIFEST.json` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/PACKAGE_CONTENTS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/README.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/SHA256SUMS.txt` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/SOURCE_PACK_READINESS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/START_HERE.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/VALIDATION_LEDGER.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/WORKSTREAM_CARDS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/checklists/AI_MODEL_RELEASE_GATE.md` | **Release gate** | Binding release checklist. Keep and map every item to executable evidence in the final report. |
| `docs/source-handoff/checklists/SCIENTIFIC_RELEASE_GATE.md` | **Release gate** | Binding release checklist. Keep and map every item to executable evidence in the final report. |
| `docs/source-handoff/checklists/WEB_RELEASE_GATE.md` | **Release gate** | Binding release checklist. Keep and map every item to executable evidence in the final report. |
| `docs/source-handoff/contracts/README.md` | **Source contract** | Original machine-readable handoff contract. Reconcile with canonical runtime Zod/OpenAPI contracts and document intentional deviations. |
| `docs/source-handoff/contracts/ai-answer.schema.json` | **Source contract** | Original machine-readable handoff contract. Reconcile with canonical runtime Zod/OpenAPI contracts and document intentional deviations. |
| `docs/source-handoff/contracts/catalog-import-record.schema.json` | **Source contract** | Original machine-readable handoff contract. Reconcile with canonical runtime Zod/OpenAPI contracts and document intentional deviations. |
| `docs/source-handoff/contracts/phenotype-observation.schema.json` | **Source contract** | Original machine-readable handoff contract. Reconcile with canonical runtime Zod/OpenAPI contracts and document intentional deviations. |
| `docs/source-handoff/contracts/simulation-request.schema.json` | **Source contract** | Original machine-readable handoff contract. Reconcile with canonical runtime Zod/OpenAPI contracts and document intentional deviations. |
| `docs/source-handoff/contracts/simulation-result.schema.json` | **Source contract** | Original machine-readable handoff contract. Reconcile with canonical runtime Zod/OpenAPI contracts and document intentional deviations. |
| `docs/source-handoff/data/Change_Log.csv` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Change_Log.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Data_Dictionary.csv` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Data_Dictionary.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Evidence_Claims.csv` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Evidence_Claims.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Locus_Catalog.csv` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Locus_Catalog.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/README.csv` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/README.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Research_Backlog.csv` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Research_Backlog.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Sources.csv` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Sources.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Standards.csv` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/Standards.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/data/workbook-export-manifest.json` | **Source of truth** | Preserved scientific source data. Do not rewrite as executable logic; maintain hashes and provenance. |
| `docs/source-handoff/docs/00_PRODUCT_CHARTER.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/01_SYSTEM_ARCHITECTURE.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/02_WEB_APPLICATION_UX_SPEC.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/03_DATA_MODEL_AND_MIGRATIONS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/04_SIMULATION_ENGINE_SPEC.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/05_AI_AND_RAG_SPEC.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/06_PHENOTYPE_VISION_SPEC.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/07_SCIENTIFIC_GOVERNANCE.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/08_API_AND_CONTRACTS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/09_SECURITY_PRIVACY_OPERATIONS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/10_TEST_AND_VALIDATION_PLAN.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/11_DELIVERY_AND_RELEASE_PLAN.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/12_DEFINITION_OF_DONE.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/13_ENVIRONMENT_AND_DEPLOYMENT.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/14_REPO_STRUCTURE_AND_CONVENTIONS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/docs/15_VERIFIED_TECH_AND_STANDARDS_BASELINE.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/source-pack/CAPSICUM_BREEDING_INTELLIGENCE_PLATFORM_IMPLEMENTATION_PLAN.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/source-pack/CAPSICUM_GENETICS_DATASET_README_v0_1.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/source-pack/build_capsicum_catalog.py` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/source-pack/capsicum_genetics_evidence_catalog_v0_1.xlsx` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/source-pack/capsicum_locus_catalog_v0_1.csv` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/source-pack/capsicum_sources_v0_1.csv` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/starter-repo-blueprint/.env.example` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/starter-repo-blueprint/AGENTS.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/starter-repo-blueprint/REPOSITORY_TREE.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/starter-repo-blueprint/VERSION_POLICY.md` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `docs/source-handoff/tools/build_capsicum_handoff_pack.py` | **Source of truth** | Preserved original handoff material. Treat as binding unless repo evidence requires a documented, scientifically safer decision. |
| `eslint.config.mjs` | **P1** | Strict typed lint rules are valuable. Add Next.js rules explicitly if not already inherited and include test/config coverage without suppressing meaningful warnings. |
| `infra/backup/backup.sh` | **P1** | Creates checksummed database dump only. Add object-storage backup, encryption/retention policy, metadata, failure reporting, and automated drill integration. |
| `infra/backup/restore-test.sh` | **P1** | Basic database restore smoke. Restore into an isolated target, validate schema/data invariants and object assets, emit evidence, and never point at a live database. |
| `infra/compose/docker-compose.yml` | **P0** | Provides local services but uses fixed development credentials, lacks migrations/bootstrap/bucket initialization, and workers only exit after health commands. Add persistent worker processes, init jobs, health/readiness, and production-safe documentation. |
| `package.json` | **P0** | Workspace scripts are reasonable, but the missing lockfile blocks frozen install. Add project-native security, E2E, database integration, migration, and full validation scripts. |
| `packages/ai/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/ai/src/hosted.ts` | **P1** | Optional structured generation boundary. Add provider configuration validation, timeouts/retries, rate/cost controls, trace/audit, prompt-injection defenses, and full structured response verification. |
| `packages/ai/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/ai/src/index.ts` | **P1** | Good citation-ID and abstention boundary, but no retrieval ranking, entailment validation, ingestion, tool audit, or evaluations. Build RAG only over approved passages and never grant AI scientific authority. |
| `packages/ai/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/auth/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/auth/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/auth/src/index.ts` | **P0** | Only an in-memory role matrix; no identity, sessions, invitation, recovery, CSRF, cookie, or route enforcement. Rename canApproveOwnCatalogWork because it actually checks reviewer independence. Implement production auth and active membership enforcement. |
| `packages/auth/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/breeding-domain/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/breeding-domain/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/breeding-domain/src/index.ts` | **P0** | In-memory validators only. Add canonical persistence-backed services for material identity, origin event cardinality and kinds, directed crosses, pollination, fruit/harvest, families, generations, selections, labels, and concurrent cycle safety. |
| `packages/breeding-domain/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/config/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/config/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/config/src/index.ts` | **P1** | Strong environment parsing, but production readiness incorrectly equates configured URLs with healthy dependencies. Add settings needed for security, uploads, workers, observability, and live probes. |
| `packages/config/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/contracts/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/contracts/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/contracts/src/index.ts` | **P0** | Only exact simulation is centrally contracted. Add versioned Zod contracts for all CRUD, jobs, events, uploads, catalog review, observations, AI, vision, advanced simulations, exports, and errors. Infer TS types from schemas to prevent drift. |
| `packages/contracts/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/database/migrations/0001_foundation.sql` | **P0** | Strong RLS/immutability intent, but schema is materially narrower than the specification and lacks auth/session, allele/genotype, detailed material/cross/harvest/family/selection, and stronger origin-kind/cardinality constraints. Validate on real PostgreSQL and add forward migrations rather than editing after release. |
| `packages/database/migrations/0002_operations_and_observations.sql` | **P0** | Adds jobs/research/media/observations/models, but observation payloads are not checked against definitions, model promotion gates are weak, job/domain contracts drift, and annotation/AI/evaluation/backup records are absent. Add constraints/services and PostgreSQL integration tests. |
| `packages/database/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/database/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/database/src/index.ts` | **P0** | Provides pool and workspace transaction, but membership has no active status and principal values are caller supplied. Add authenticated principal derivation, repository layer, permission checks, migration runner, retry/timeouts, and integration tests. |
| `packages/database/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/genetics-advanced/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/genetics-advanced/src/host-pathogen.ts` | **P1** | Correctly requires pathogen and assay context. Add normalized pathogen entities, explicit environment applicability, missing effector semantics, evidence status checks, and UI/API integration. |
| `packages/genetics-advanced/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/genetics-advanced/src/index.ts` | **P1** | Two-locus linkage, maternal state, and penetrance are useful foundations. Extend to explicit phase uncertainty, multi-locus maps, nuclear-restorer interactions, context models, and persisted approved rule references. |
| `packages/genetics-advanced/src/monte-carlo.ts` | **P0** | Not a true state-space fallback because it samples an already computed exact distribution. Implement direct gamete/genotype sampling that can avoid exact expansion, version the PRNG, stream/worker execution, and validate convergence/error policy. |
| `packages/genetics-advanced/src/rule-graph.ts` | **P1** | Deterministic priority/conflict handling is good. Add catalog-backed validation, richer predicates/context, cycle/static analysis, rule test fixtures, and explainability traces. |
| `packages/genetics-advanced/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/genetics-core/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/genetics-core/src/exact.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/genetics-core/src/exact.ts` | **P1** | Correctly preserves exact probabilities and unknown hypotheses. Add property-based tests, computational budgets tied to request policy, sparse/dynamic strategies, and stronger provenance semantics for derived offspring. |
| `packages/genetics-core/src/index.ts` | **Preserve** | Thin export boundary is appropriate. |
| `packages/genetics-core/src/invariants.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/genetics-core/src/rational.ts` | **P1** | Good exact arithmetic foundation. Add bounded input size, cross-reduction to limit intermediate BigInts, hostile-input tests, and serialization/version guarantees. |
| `packages/genetics-core/src/target-recovery.ts` | **P1** | Uses floating-point conversion for confidence calculations. Add stable log-space handling for tiny probabilities, edge-case tests, and explicit operational adjustment provenance. |
| `packages/genetics-core/src/types.ts` | **P1** | Core types are appropriately pure. Clarify derived versus observed evidence states and version public contracts. |
| `packages/genetics-core/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/jobs/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/jobs/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/jobs/src/index.ts` | **P0** | State machine and SQL schema drift: terminal timestamps/results and cancellation fields are not represented consistently. Build a durable repository/claim/heartbeat/executor/outbox system and integrate Python/R workers. |
| `packages/jobs/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/observability/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/observability/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/observability/src/index.ts` | **P0** | Top-level key redaction can leak nested secrets. Implement recursive structured redaction, request/trace IDs, metrics, error reporting, audit-safe logging, and no-sensitive-payload policy. |
| `packages/observability/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/observation-domain/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/observation-domain/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/observation-domain/src/index.ts` | **P0** | Revision validator is minimal. Enforce value contracts, finite numerics, units/vocabularies, methods, actor/material/session context, correction-chain integrity, and experimental designs. |
| `packages/observation-domain/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/scientific-catalog/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/scientific-catalog/src/generated/claims.json` | **Generated** | Generated draft catalog fixture. Do not edit directly; regenerate from validated source data and keep zero executable rules until approved. |
| `packages/scientific-catalog/src/generated/loci.json` | **Generated** | Generated draft catalog fixture. Do not edit directly; regenerate from validated source data and keep zero executable rules until approved. |
| `packages/scientific-catalog/src/generated/sources.json` | **Generated** | Generated draft catalog fixture. Do not edit directly; regenerate from validated source data and keep zero executable rules until approved. |
| `packages/scientific-catalog/src/governance.ts` | **P0** | Review state machine is a good start, but permission/role separation, transition actors, supersession approval, and database transaction enforcement must be unified. Avoid domain/SQL drift. |
| `packages/scientific-catalog/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/scientific-catalog/src/index.ts` | **P1** | Generated draft seed data is correctly non-executable. Move runtime reads to persisted versioned catalog releases and retain generated assets only as import fixtures. |
| `packages/scientific-catalog/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/simulation-domain/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/simulation-domain/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/simulation-domain/src/index.ts` | **P0** | Useful exact orchestration but drops genotype evidence IDs by converting all hypotheses to user_prior, trusts arbitrary release/locus/allele IDs, and lacks code/build version. Integrate authoritative catalog/genotype repositories and immutable provenance. |
| `packages/simulation-domain/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/storage/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/storage/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/storage/src/index.ts` | **P0** | Object-key and MIME allowlist are insufficient. Add size limits, file-signature sniffing, extension/MIME consistency, decode/decompression safeguards, malware scanning, quarantine, signed URLs, retention, and deletion policy. |
| `packages/storage/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/test-utils/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/test-utils/src/index.ts` | **P1** | Minimal helpers. Add factories/builders for principals, catalog releases, biological materials, simulation fixtures, PostgreSQL integration, and deterministic clocks/IDs. |
| `packages/test-utils/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `packages/vision/package.json` | **P1** | Package manifest is structurally valid. Add only justified dependencies, pin through the root lockfile, and preserve dependency direction. |
| `packages/vision/src/index.test.ts` | **P1** | Existing unit coverage is useful but narrow. Preserve it and add negative, property-based, contract, persistence, concurrency, authorization, and end-to-end regression coverage appropriate to this module. |
| `packages/vision/src/index.ts` | **P1** | Only deterministic metadata quality and simple calibrated length. Validate all protocol values, define quality metrics, implement secure capture/annotation/measurement pipeline, and keep learned models gated by promotion evidence. |
| `packages/vision/tsconfig.json` | **Preserve** | Uses shared strict TypeScript configuration. Keep package boundaries and strictness intact. |
| `pnpm-workspace.yaml` | **Preserve** | Workspace boundary is appropriate. Keep the modular monolith and bounded worker topology. |
| `scripts/import_catalog.py` | **P1** | Good staging reconciliation, but only three CSVs and shallow validation. Add complete workbook/domain mapping, schema versions, transaction-safe database staging, reconciliation categories, idempotency, and tests. |
| `scripts/validate_repository.py` | **P0** | Primarily checks paths and literal markers, so passing does not prove runtime behavior. Replace/augment with AST/contract checks and real install, build, database, browser, security, worker, and restore validation. |
| `tsconfig.base.json` | **Preserve** | Strict compiler posture is strong. Keep noUncheckedIndexedAccess and exactOptionalPropertyTypes. |
| `turbo.json` | **P1** | Build graph is minimal. Add environment inputs/outputs as needed and ensure tests do not depend on stale build artifacts. |

## Unexpected or generated artifacts found outside the recorded inventory

- `apps/worker-python/.pytest_cache/CACHEDIR.TAG` - remove generated caches/build artifacts from the distributable archive unless intentionally documented.
- `apps/worker-python/.pytest_cache/README.md` - remove generated caches/build artifacts from the distributable archive unless intentionally documented.
- `apps/worker-python/.pytest_cache/.gitignore` - remove generated caches/build artifacts from the distributable archive unless intentionally documented.
- `apps/worker-python/__pycache__/worker.cpython-313.pyc` - remove generated caches/build artifacts from the distributable archive unless intentionally documented.
- `apps/worker-python/tests/__pycache__/test_worker.cpython-313-pytest-9.0.2.pyc` - remove generated caches/build artifacts from the distributable archive unless intentionally documented.
- `apps/worker-python/.pytest_cache/v/cache/nodeids` - remove generated caches/build artifacts from the distributable archive unless intentionally documented.

## Acceptance gap against the original definition of done

| Area | Current state | Required next-sweep evidence |
|---|---|---|
| Product | Route shells and one exact simulation demo | Onboarding, workspace, full breeding cycle, persisted simulations, selection plan, observations, reports and exports |
| Science | Strong abstention and draft catalog | Independent review workflow, approved release mechanics, catalog-backed simulation validation, no unsupported activation |
| Engineering | Pure engines and SQL foundations | Real install/build, migrations, repositories, auth, workers, integration/E2E/security tests |
| UX | Responsive shell and semantic intent | Complete states, mobile workflows, keyboard operation, axe/manual WCAG 2.2 AA evidence |
| Operations | Compose/scripts defined | Running stack, durable workers, live readiness, metrics, backup plus object-store restore drill |

## Recommended merge order

1. Reproducible toolchain, lockfile, baseline CI, and real PostgreSQL migration proof.
2. Canonical contracts, authenticated principal/session, workspace authorization, and database repositories.
3. Germplasm/material/cross/harvest/family/pedigree vertical slice.
4. Persisted exact simulation, approved catalog validation, idempotency, and selection-plan conversion.
5. Experiments, observation definitions/sessions/revisions, and exports.
6. Catalog source/claim/locus review and immutable release workflow.
7. Durable jobs/outbox plus Python/R worker consumers.
8. Secure media upload, capture protocols, annotation, deterministic measurements, and model registry.
9. Evidence-bounded RAG/AI with audit/evaluation and no scientific authority.
10. Complete responsive UX, E2E, accessibility, security, performance, backup/restore, and final release evidence.

## Release-readiness judgment

**Conditionally ready for the next implementation sweep; blocked for production release.**

The architecture is sufficient to continue. Production release remains blocked until the prompt's acceptance gates are proven with real runtime evidence.

## Least-confidence items

1. A full Node/Next/Vitest build could not be executed because the environment lacked Node 24, pnpm, registry access, and the repository lockfile.
2. PostgreSQL constraints, RLS, concurrent pedigree writes, migration repair, and backup restore could not be exercised here.
3. The final selection of the authentication library, migration runner, object-storage client, and browser-test stack should follow current repository compatibility checks rather than being invented in this report.
4. Learned vision and quantitative/genomic model architecture cannot be validated without representative datasets and scientific evaluation protocols.

## Biggest hidden issue

The codebase can look much more complete than it is because it has every required route and many strong domain names. Most of those routes are status documentation, not operational product surfaces. The next agent must be measured by successful end-to-end user journeys and persisted evidence, not by file count, route count, table count, or marker-based validation.
