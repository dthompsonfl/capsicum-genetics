# V3 Genuine Release Blockers

The following are material blockers, not deferred documentation tasks.

## 1. Reproducible dependency graph

`pnpm-lock.yaml` is absent. Corepack could not resolve `registry.npmjs.org`, so a legitimate pnpm 10.14.0 lockfile and clean frozen installation could not be produced or proven.

**Activation:** in a registry-enabled Node 24 environment, run a normal `pnpm install`, review the generated lockfile, commit it, then prove `pnpm install --frozen-lockfile` from a fresh checkout.

## 2. Real semantic build and runtime artifacts

Installed dependencies were unavailable. Prettier, ESLint, complete strict TypeScript, Vitest, Turbo, Next.js standalone, worker production build/start, dependency/license/SAST/secret/container scans, and SBOM generation were not executed.

**Activation:** run the complete validation ladder from the committed lockfile and retain logs/artifacts.

## 3. PostgreSQL 18 authority proof

PostgreSQL/`psql` was unavailable. Fourteen migrations, upgrade from V2, RLS, grants, triggers, deferred checks, idempotency concurrency, stale revisions, pedigree cycles, worker leases, direct-terminal-state bypasses, and query plans remain unexecuted.

**Activation:** run empty and V2-baseline migration replay plus the expanded destructive authority and application integration suites under migration/runtime/worker roles.

## 4. Integrated deployment proof

Docker was unavailable. Web, migration, PostgreSQL, MinIO, worker, health, readiness, restart, and standalone artifact behavior are unproven.

**Activation:** build production images and run Compose smoke with no development fallbacks.

## 5. Browser, accessibility, and nontechnical journeys

Playwright browsers and a running application were unavailable. The current E2E source covers public boundaries only, not all 44 required journeys. Manual keyboard/mobile review was not performed.

**Activation:** implement seeded integrated fixtures and pass all journeys at phone, tablet, laptop, and desktop viewports with axe and manual keyboard evidence.

## 6. Hostile-media and isolated vision pipeline

Quarantine, bounded request size, hashing, signature/MIME/dimension checks, and durable inspection contracts exist. Isolated hostile decoding, metadata stripping, malware runtime, deterministic derivative generation, cleanup/reconciliation, and durable Python-worker participation are incomplete and unproven.

**Activation:** implement the isolated decoder/derivative/cleanup handlers and pass hostile fixtures plus restart/object-storage integration.

## 7. Complete advanced simulation product

Pure linkage, maternal, conditional-rule, host–pathogen, Monte Carlo, and segregation components exist, but one persisted governed laboratory does not yet integrate all engines, multi-generation F1/F2/backcross planning, unknown phase, observed reconciliation UI, and plan conversion.

**Activation:** finish canonical contracts/services/jobs/UI and pass golden/property/reproducibility/cancellation fixtures.

## 8. Catalog normalized-authority workflow

Normalized allele/variant/marker/assay tables are deliberately runtime read-only. Complete curator submission, independent review, release promotion, conflict/supersession, and browser workflows are absent.

**Activation:** implement canonical review services/functions and adversarial publication tests. Do not relax the read-only grant.

## 9. Research ingestion and hosted AI

Approved-passage retrieval and deterministic abstention exist. Durable ingestion/extraction handlers, provider privacy/cost/timeout controls, hosted generation wiring, and adversarial AI evaluation are incomplete.

**Activation:** implement and evaluate versioned ingestion/extraction first; then opt in hosted AI behind explicit governance. Core workflows must continue with AI disabled.

## 10. Backup and isolated restore

Scripts exist and pass syntax checks, but no database/object backup or isolated restore was executed.

**Activation:** perform a protected drill and reconcile migrations, row counts, authoritative hashes, object manifests/hashes, and representative downloads.

## 11. Scientific evidence/model blockers

The seed catalog has zero independently approved executable phenotype rules and no validated learned model artifact. This is a scientific blocker to phenotype prediction, not a software defect.

**Activation:** independent scientific review, applicable structured claims, validation populations/datasets, model cards, held-out evaluation, calibration, promotion, drift, and rollback evidence.
