# Workstream Cards

## Workstream 0 — Integration lead and architecture

Mission: initialize the monorepo, enforce boundaries, own shared contracts, sequence merges, and run final integrated validation.

Allowed scope: root config, CI, shared contracts, dependency graph, integration fixes, final documentation.

Stop conditions: unresolved contract conflict, unsafe dependency cycle, or weakening of scientific/security gates.

## Workstream 1 — Platform, auth, data, and operations

Mission: identity, workspaces, roles, PostgreSQL, migrations, storage, jobs, audit, idempotency, observability, backups, and Docker Compose.

Owns: `auth`, `database`, `jobs`, `storage`, `observability`, config, infra.

Validation: migrations, authorization, isolation, concurrency, queue retry, backup/restore, compose smoke.

## Workstream 2 — Scientific catalog and import

Mission: normalize the supplied catalog, preserve provenance, implement evidence review, releases, applicability, and rule eligibility.

Owns: `scientific-catalog`, importer, catalog UI, source/review UI.

Must not: activate claims without the approved workflow.

Validation: zero silent-loss import, source resolution, release immutability, state transition tests.

## Workstream 3 — Genetics and simulation engines

Mission: implement exact genetics and advanced model contracts with mathematical proof and reproducibility.

Owns: `genetics-core`, `genetics-advanced`, simulation domain portions.

Must not: use AI or database calls in the exact engine.

Validation: golden, property-based, independent parity, performance thresholds.

## Workstream 4 — Breeding ledger and phenotyping records

Mission: germplasm, seed lots, plants, labels, crosses, harvests, progeny, pedigree, experiments, observations, selections, exports.

Owns: breeding and observation domain packages and corresponding web routes.

Validation: complete breeding-cycle E2E, pedigree constraints, QR/label identity, export round trip.

## Workstream 5 — Web experience and design system

Mission: accessible responsive interface, navigation, guided workflows, result visualization, operational states, and end-to-end UX integration.

Owns: `apps/web`, `ui` except shared backend contracts.

Validation: Playwright, accessibility, responsive visual review, repeated-click behavior, degraded states.

## Workstream 6 — AI research and copilot

Mission: document ingestion, retrieval, candidate extraction, tool orchestration, citations, evals, and user-facing copilot.

Owns: `ai`, research document pipelines, AI UI.

Must not: create authoritative rules or verified genotypes.

Validation: mock provider tests, citation evals, prompt injection, cross-workspace isolation, abstention.

## Workstream 7 — Vision and scientific workers

Mission: capture protocols, quality gates, deterministic measurements, annotation, model registry, Python/R workers, forward simulation templates.

Owns: `vision`, worker apps, worker contracts after integration-lead approval.

Validation: contract tests, measurement fixtures, job idempotency, model gating, worker failure recovery.

## Merge order

1. Workstream 0 repository baseline.
2. Workstream 1 platform contracts and schema foundations.
3. Workstream 2 normalized catalog plus Workstream 3 pure engine in parallel.
4. Workstream 4 breeding domain.
5. Workstream 5 integrated web workflows.
6. Workstream 6 AI on stable catalog/simulation APIs.
7. Workstream 7 vision/workers on stable material/observation/job contracts.
8. Workstream 0 integrated hardening and final validation.

Only the integration lead edits root lockfiles, shared generated contracts, global migrations sequencing, and root CI after initialization.
