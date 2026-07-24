# Delivery and Release Plan

## Release slices

### Slice 1 — Foundation and catalog governance

Monorepo, web shell, identity, workspaces, roles, PostgreSQL, object storage, jobs, audit, catalog importer, review states, and seeded catalog.

### Slice 2 — Exact genetics and simulation UX

Exact rational engine, independent loci, multi-allelic rules, uncertain genotypes, target recovery, immutable run storage, result UI, and tests.

### Slice 3 — Breeding ledger

Germplasm, seed lots, plants, labels, crosses, pollination, harvests, progeny, pedigree, selection goals, observations, and exports.

### Slice 4 — Advanced genetics

Linkage, maternal/cytoplasmic inheritance, epistasis, host–pathogen contexts, Monte Carlo fallback, and advanced model UI.

### Slice 5 — AI research and copilot

Document ingestion, hybrid retrieval, candidate extraction, review queue, simulation tools, AI UI, evals, and provider degradation.

### Slice 6 — Phenotype laboratory

Capture protocols, quality gates, deterministic measurements, annotations, corrections, model registry, and vision job UI.

### Slice 7 — Research simulation and model framework

R/Python model workers, AlphaSimR job templates, training dataset registry, model cards, evaluation and promotion gates. Quantitative predictions remain disabled until data gates pass.

### Slice 8 — Interoperability and hardening

Selected BrAPI endpoints, MIAPPE/MCPD exports, performance, security, restore drill, accessibility audit, deployment docs, and release evidence.

## Merge order

1. Platform contracts and repository baseline.
2. Database schema and catalog import.
3. Exact engine.
4. Core web workflows.
5. Breeding ledger.
6. Advanced simulation contracts.
7. AI and workers.
8. Vision and model registry.
9. Integrated validation and release hardening.

## Release strategy

Use feature flags for incomplete research capabilities. Seed a demonstration workspace. Run migrations and backup before deployment. Maintain the previous deployable image and catalog/model versions for rollback. Prefer forward repair for schema changes after data migration.
