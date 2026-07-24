# Start Here — Capsicum Breeding Intelligence Platform

This archive is a self-contained implementation handoff for a **web-based Capsicum breeding intelligence platform**. It is designed to be given to a capable autonomous coding agent or an engineering team.

## Required reading order

1. `SOURCE_PACK_READINESS.md`
2. `EXECUTION_PROMPT.md`
3. `source-pack/CAPSICUM_BREEDING_INTELLIGENCE_PLATFORM_IMPLEMENTATION_PLAN.md`
4. `docs/00_PRODUCT_CHARTER.md`
5. `docs/01_SYSTEM_ARCHITECTURE.md`
6. `docs/02_WEB_APPLICATION_UX_SPEC.md`
7. `docs/03_DATA_MODEL_AND_MIGRATIONS.md`
8. `docs/04_SIMULATION_ENGINE_SPEC.md`
9. `docs/05_AI_AND_RAG_SPEC.md`
10. `docs/06_PHENOTYPE_VISION_SPEC.md`
11. `WORKSTREAM_CARDS.md`
12. `VALIDATION_LEDGER.md`

## How to use this pack

Give the entire extracted directory to the coding agent. Use the contents of `EXECUTION_PROMPT.md` as the agent's primary instruction. The agent must treat all other files as binding source material.

The agent is expected to create a new repository from this specification. The archive is not the completed application and does not pretend that unsupported quantitative genetics models can be made scientifically accurate without training data.

## Authoritative hierarchy

When documents conflict, use this order:

1. Scientific safety, prohibited claims, evidence eligibility, and stop conditions.
2. `EXECUTION_PROMPT.md`.
3. The full implementation plan in `source-pack/`.
4. Domain specifications under `docs/`.
5. Machine-readable schemas under `contracts/`.
6. Starter repository blueprint.
7. Informational notes and examples.

Do not resolve conflicts by weakening scientific integrity, access controls, auditability, test requirements, or uncertainty disclosure.

## Deliverable expected from the coding agent

A complete, runnable, documented monorepo containing:

- responsive Next.js web application;
- PostgreSQL database and migrations;
- exact and advanced inheritance simulation modules;
- scientific evidence catalog and review workflows;
- germplasm, seed-lot, plant, cross, pedigree, experiment, phenotype, and selection workflows;
- bounded AI research and breeding copilot;
- phenotype image capture, deterministic measurement, annotation, and model-evaluation infrastructure;
- Python and R worker boundaries for scientific workloads;
- local Docker Compose deployment;
- automated tests, CI, observability, backups, and restore documentation;
- seeded demonstration workspace using the supplied Capsicum catalog.

## Release truth

The first application can be functionally complete while some scientific capabilities remain explicitly **research-only** or **blocked pending data**. A missing validated model must result in abstention, not fabricated accuracy.
