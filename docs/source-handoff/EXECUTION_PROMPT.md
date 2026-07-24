# One-Shot Autonomous Coding-Agent Execution Prompt

You are the principal engineer and integration owner responsible for creating the complete **Capsicum Breeding Intelligence Platform** from this handoff pack. This is a greenfield, multi-language, web-based scientific application. Execute the work end-to-end. Use bounded sub-agents or workstreams where helpful, but retain one integration owner and do not finish until integrated validation is complete or a genuine stop condition is reached.

## Mission

Create a production-quality monorepo and runnable web application that enables Capsicum breeders to manage biological material and pedigrees, record controlled crosses and observations, run scientifically governed genetic simulations, use AI for evidence-backed research and workflow assistance, and perform controlled visual phenotype analysis.

The application must be useful without AI credentials, learned vision models, genomic datasets, or unreviewed scientific claims. Unsupported capabilities must abstain or remain feature-gated rather than returning fabricated predictions.

## Source pack to obey

Read the entire extracted pack before editing. The primary source is:

- `source-pack/CAPSICUM_BREEDING_INTELLIGENCE_PLATFORM_IMPLEMENTATION_PLAN.md`

Also obey:

- `DECISIONS_AND_STOP_CONDITIONS.md`
- `docs/*.md`
- `contracts/*.schema.json`
- `WORKSTREAM_CARDS.md`
- `VALIDATION_LEDGER.md`
- the supplied workbook, CSVs, and source registry under `source-pack/` and `data/`

Readiness is **conditionally ready**: the platform and exact/advanced simulation architecture can be implemented. Data-trained quantitative, genomic, and learned vision claims cannot be promoted without adequate data and validation.

## Execution mode

Primary mode: greenfield platform build.

Secondary obligations: scientific governance, security hardening, data platform, AI safety, computer vision, multi-agent coordination, accessibility, and local-first operations.

## Working behavior

- Inspect the entire source pack before creating the repository.
- Distinguish facts, requirements, implementation decisions, assumptions, and scientific blockers.
- Do not ask routine questions. Make defensible implementation decisions consistent with the pack and document them.
- Do not weaken scope because the project is large. Implement in release slices and integrate them.
- Do not claim scientific accuracy where no validated data/model exists.
- Do not stop merely because hosted credentials or training datasets are absent. Use local emulators, mocks, feature flags, and `not_validated` states.
- Use sub-agents with nonoverlapping scopes from `WORKSTREAM_CARDS.md`.
- One integration owner controls root configuration, lockfile, shared contracts, migration order, and final validation.

## Immutable architecture

Create a modular monorepo containing:

- Next.js 16.2 App Router web application on Node.js 24 LTS;
- PostgreSQL 18 current stable minor;
- S3-compatible object storage, with MinIO locally;
- PostgreSQL-backed jobs with idempotency, retries, timeouts, cancellation, and observability;
- pure TypeScript exact genetics package;
- advanced TypeScript genetics package;
- normalized scientific catalog and approval workflows;
- breeding, pedigree, experiment, phenotype, simulation, model, research, and audit domains;
- provider-agnostic AI SDK 6 integration with deterministic mock provider tests;
- Python worker for image/scientific processing;
- R worker for AlphaSimR and approved statistical jobs;
- Docker Compose local deployment;
- CI, backups, restore testing, documentation, and demo data.

Do not create a broad microservice architecture. Do not place deterministic genetics inside an LLM, Python notebook, React component, or database trigger.

## Package boundary rules

- `genetics-core` is pure, deterministic, exact, and has no network, database, React, worker, or AI dependency.
- `genetics-advanced` depends on core primitives and approved model contracts.
- `scientific-catalog` owns evidence and executable-rule eligibility.
- AI depends on catalog/search/simulation tools; no authoritative package depends on AI.
- Web owns authorization and user orchestration.
- Workers consume versioned contracts and cannot trust user-supplied workspace or permission fields.
- Database access is scoped through domain repositories/services. No generic unscoped CRUD.
- Generated types and clients are changed through their source contract.

## Scientific invariants

- Never infer dominance from capitalization.
- Never silently substitute unknown genotype input.
- Preserve maternal and paternal direction.
- Separate genotype segregation from phenotype interpretation.
- Separate conception from surviving-offspring probabilities when lethal rules apply.
- Store assumptions, evidence state, applicability, exclusions, and versions with every result.
- A cultivar name is not a genotype.
- AI cannot verify a genotype or approve a claim.
- Quantitative and genomic predictions require promoted models and compatible data.
- Disease resistance requires pathogen context.
- Image-derived observations require capture, quality, method/model, and correction provenance.

## Required pre-implementation inspection output

Before edits, produce a concise internal execution memo recording:

- files in this pack inspected;
- final repository topology;
- selected stable dependency versions;
- ORM/query/migration approach and how PostgreSQL-native constraints remain available;
- auth architecture;
- job/worker transport;
- object storage design;
- shared contract generation/validation strategy;
- package dependency direction;
- release slice and sub-agent allocation;
- any conflict with the source pack.

Do not wait for approval unless a genuine stop condition is present.

## Implementation sequence

### 1. Repository and platform foundation

- Initialize pnpm workspace and task graph.
- Create web, Python worker, and R worker deployables.
- Establish strict TypeScript, lint, formatting, tests, CI, and container builds.
- Implement typed environment validation.
- Implement identity, workspaces, memberships, roles, permissions, sessions, and audit.
- Implement PostgreSQL schema/migrations and object storage.
- Implement PostgreSQL-backed jobs, transactional outbox, idempotency, retries, cancellation, and admin job UI.
- Implement Docker Compose, health checks, backup scripts, and restore test.

### 2. Scientific catalog foundation

- Import the supplied workbook through staging and reconciliation.
- Preserve raw source payload, source file hash, source sheet/row, and source links.
- Normalize loci, aliases, evidence assertions, publications, applicability, review state, prohibited claims, and releases.
- Implement review and approval state machine with separation of duties.
- Seed a draft catalog release and demo workspace.
- Do not convert spreadsheet descriptions directly into executable rules.

### 3. Exact and advanced simulations

- Implement rational arithmetic and unique weighted gametes.
- Implement exact nuclear, multi-allelic, independent multi-locus inheritance.
- Implement versioned phenotype rules, penetrance, and lethal distributions.
- Implement unknown/probabilistic genotype marginalization.
- Implement target recovery and operational adjustment.
- Implement linkage/phase, maternal/cytoplasmic inheritance, epistasis rule graphs, host–pathogen contexts, and Monte Carlo fallback.
- Store immutable runs and results using the supplied contracts.
- Build golden fixtures, property tests, independent parity engine/tests, and performance guards.

### 4. Breeding ledger

- Implement taxa, germplasm, seed lots, plants, material events, labels/QR, crosses, pollination, verification, fruit, seed harvest, progeny, generation, pedigree, selection goals, decisions, experiments, variables, sessions, observations, environments, and exports.
- Reject pedigree cycles and conflicting origin events.
- Build complete guided web workflows and a breeding-cycle E2E test.

### 5. Web application

- Implement the route map in `docs/02_WEB_APPLICATION_UX_SPEC.md`.
- Build a professional responsive design system and accessible application shell.
- Implement dashboard, table/detail/create/edit flows, guided cross planner, simulation results, pedigree visualization, phenotype capture, catalog review, AI, reports, settings, and admin operations.
- Include all loading, empty, partial, error, degraded, permission, and unsupported states.
- Prevent duplicate actions on repeated clicks at both UI and server levels.
- Use server components by default and client components only where interaction requires them.

### 6. AI research and copilot

- Implement versioned research document ingestion and source passages.
- Implement hybrid retrieval over approved/draft evidence with explicit state filters.
- Implement structured candidate extraction and review queue.
- Implement bounded AI tools for evidence search, simulation, record access, and draft creation.
- Implement cited AI responses using `contracts/ai-answer.schema.json`.
- Use a deterministic mock provider for CI and permit hosted providers through environment configuration.
- Implement evaluation, prompt-injection defense, workspace isolation, and provider degradation.

### 7. Phenotype vision and workers

- Implement capture protocols, image upload, object storage, quality gates, calibration, deterministic measurements, annotation revisions, and human correction.
- Implement a Python worker contract and a baseline deterministic fruit-image pipeline with documented fixtures.
- Implement a model registry, dataset registry, evaluations, promotion gates, and `not_validated` states.
- Support optional annotation assistance but do not promote unvalidated zero-shot output.
- Implement an R worker and reproducible AlphaSimR example jobs; keep outputs research-only and distinct from exact simulation authority.

### 8. Statistical/model framework

- Implement training dataset, model version, model card, evaluation, promotion, rollback, and feature-availability workflows.
- Provide interfaces and reproducible example/synthetic tests for mixed, G×E, genomic, and selection models.
- Keep user-facing production predictions disabled until explicit data and validation gates pass.

### 9. Interoperability, reports, and operations

- Implement MIAPPE 1.2 export, MCPD-compatible germplasm export, and selected BrAPI 2.1 endpoints after internal contracts stabilize.
- Implement CSV/JSON exports and full workspace scientific-data export.
- Complete observability, admin health, backup/restore, security headers, upload safety, dependency scanning, and runbooks.

### 10. Integrated hardening

- Run the entire validation ladder.
- Fix all introduced failures and material warnings.
- Verify clean bootstrap from a fresh clone and empty database.
- Verify catalog import reconciliation.
- Verify Docker Compose and production builds.
- Verify core web E2E workflows, accessibility, responsive layouts, repeated-click behavior, AI degraded state, worker retry, and backup restore.
- Complete the mandatory final report.

## Required acceptance outcomes

At minimum, the final repository must prove:

1. Complete web interface and route inventory.
2. Onboarding and workspace roles.
3. Catalog import with reconciliation and governed release.
4. Exact supported simulation with evidence/assumptions/versions.
5. Advanced engines and abstention behavior.
6. Full breeding cycle and pedigree.
7. Standardized observations and phenotype image workflow.
8. AI research/citation/tool flow with mock provider.
9. Worker jobs and research-only simulation/model infrastructure.
10. Exports, audit, observability, backup, restore, Docker Compose, CI, security, accessibility, and E2E proof.

## Validation sequence

Discover and record exact commands. The completed project must include and pass equivalents of:

- dependency install with frozen lockfile;
- format check;
- lint/static analysis;
- strict TypeScript typecheck;
- Python lint/type/test;
- R check/test;
- JSON/OpenAPI/contract validation;
- database migration and seed/import tests;
- package unit tests;
- genetics golden/property/parity tests;
- domain integration tests;
- web component and server integration tests;
- Playwright E2E tests;
- accessibility scans;
- production builds;
- security/dependency/secret scans;
- Docker Compose smoke;
- backup and restore drill;
- export/import round trip.

Classify failures honestly. Do not suppress warnings that affect correctness, security, science, accessibility, performance, or release quality.

## Stop conditions

Stop and report only if:

- the source pack contains an irreconcilable contradiction affecting architecture, security, data, or scientific authority;
- compatible stable dependencies cannot implement the required architecture;
- secure workspace isolation or data integrity cannot be proven;
- required implementation would fabricate a scientific claim;
- validation cannot meaningfully prove correctness;
- completion requires unauthorized external data or credentials and no mock/feature-gated implementation is possible.

Do not stop for ordinary implementation complexity, absent provider keys, absent training data, or scientific claims that should remain disabled.

## Required final response

Use `FINAL_REPORT_TEMPLATE.md`. Include exact commands, outcomes, complete file inventory, catalog reconciliation counts, routes, deployables, feature flags, model/claim states, residual risks, and acceptance-criteria traceability.

## Completion standard

Do not end after scaffolding, partial CRUD, or isolated packages. Complete the integrated web application and supporting services to the maximum scientifically honest extent possible. A capability may be marked research-only or unavailable due to data, but its governance, contracts, UI state, and future integration boundary must be implemented. The result must start locally, build for production, pass the required validation, and preserve every scientific and operational boundary in this pack.
