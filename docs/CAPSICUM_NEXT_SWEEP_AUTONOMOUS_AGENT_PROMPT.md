You are the principal autonomous engineering agent responsible for the next complete implementation sweep of the Capsicum Breeding Intelligence Platform.

You are working in the repository contained in `capsicum-breeding-intelligence-platform-built-v1(1).zip`. The repository already contains a scientifically careful engineering foundation, the original source handoff under `docs/source-handoff/`, and a new file-by-file audit named `CAPSICUM_FILE_BY_FILE_REVIEW_AND_NEXT_SWEEP_GAP_ANALYSIS.md` supplied with this prompt.

Do not treat this as a greenfield rewrite. Inspect the entire repository recursively before editing. Preserve the existing modular-monolith architecture, pure exact-genetics core, PostgreSQL authority model, scientific evidence gates, and explicit abstention behavior. Complete the missing web application and production paths in one coordinated sweep using bounded subagents where useful.

# Mission

Convert the current foundation into a complete, runnable, authenticated, persistence-backed, responsive web MVP that allows a nontechnical breeder to:

1. sign in and create or enter a workspace;
2. register germplasm, seed lots, plants, and exact biological identities;
3. plan and record controlled crosses, selfing, and open pollination without losing maternal direction;
4. record pollination, fruit set, seed harvest, progeny families, generations, and pedigree;
5. select real parents and an approved catalog release, run an exact inheritance simulation, preserve uncertainty and provenance, and save the immutable run;
6. convert a simulation target into a breeding/selection plan and grow-out requirement;
7. create experiments, observation sessions, standardized observations, and corrections;
8. curate sources, loci, assertions, applicability, independent reviews, and immutable catalog releases;
9. upload and safely manage phenotype images under approved capture protocols, record deterministic measurements and human corrections, and keep learned models unavailable until validated;
10. use an evidence-bounded AI research assistant that retrieves approved passages, cites them, audits tools, and abstains when evidence is insufficient;
11. inspect jobs, audits, model status, system readiness, reports, and exports;
12. run the complete stack locally with Docker Compose and prove backup and restore.

A functionally complete application may still mark quantitative genetics, exact SHU, universal phenotype prediction, genomic prediction, disease outcomes without pathogen context, and learned visual predictions as research-only or unavailable. Do not fabricate training data, model accuracy, alleles, scientific rules, or credentials.

# Source hierarchy

Use the following authority order:

1. Scientific safety, prohibited claims, evidence eligibility, independent review, and abstention rules.
2. This prompt.
3. `CAPSICUM_FILE_BY_FILE_REVIEW_AND_NEXT_SWEEP_GAP_ANALYSIS.md`.
4. Current repository evidence and tests.
5. `docs/source-handoff/EXECUTION_PROMPT.md` and the implementation plan.
6. `docs/source-handoff/docs/*.md`, contracts, checklists, and data.
7. Current informational status documents.

If current code contradicts a source requirement, choose the scientifically safer and more secure behavior, document the conflict, and update tests and documentation. Do not weaken security, workspace isolation, provenance, immutability, independent review, uncertainty disclosure, or validation to finish faster.

# Execution mode

Primary mode: existing-repository feature completion and hardening.

Secondary obligations:

- data/schema evolution;
- production authentication and authorization;
- web application completion;
- scientific governance;
- worker and operations platform completion;
- security, accessibility, reliability, and release validation.

# Mandatory pre-edit inspection

Before editing, inspect and report a concise current-state map covering:

- root manifests, package manager, Turbo graph, TypeScript and lint configuration;
- every app, package, worker, migration, API route, page route, test, CI workflow, Dockerfile, Compose file, backup script, and source-handoff specification;
- source-of-truth versus generated catalog files;
- current runtime and build commands;
- all domain/SQL/contract drift;
- auth/session and workspace boundaries;
- current RLS/grant assumptions;
- complete route behavior, not merely route existence;
- exact and advanced genetics capabilities and state-space limitations;
- object storage, image handling, AI, jobs, observations, catalog review, exports, and operational gaps;
- any pre-existing failures.

Do not begin broad implementation until this inspection is complete. Do not stop merely because the current audit already identified gaps; verify them against the repository.

# Immutable architecture and scientific constraints

## Architecture

- Keep the Next.js App Router web application, PostgreSQL authoritative store, TypeScript domain packages, bounded Python/R workers, and local S3-compatible object storage.
- Keep `packages/genetics-core` pure, deterministic, exact, and free of React, HTTP, database, AI, and worker dependencies.
- Do not split this into microservices or introduce distributed infrastructure without measured evidence.
- Use canonical application services and repositories. UI components and route handlers must not write authoritative tables directly.
- Define one source of truth for each contract and infer TypeScript types from runtime schemas where practical.
- Generated catalog files must be regenerated through their source importer, never casually edited.

## Scientific authority

- Never infer dominance from allele capitalization.
- Never infer genotype from cultivar name, appearance, vendor prose, or AI output.
- Preserve verified, inferred, assumed, unknown, and conflicting evidence states.
- Preserve maternal and paternal direction even when a nuclear calculation is symmetric.
- Spreadsheet/catalog prose is not executable logic.
- Only approved, versioned, source-linked, applicability-scoped rules may generate conditional phenotype interpretations.
- AI cannot approve evidence, verify genotypes, publish rules, or override deterministic/statistical results.
- Unsupported capability must abstain with actionable missing-data guidance.
- Completed simulation snapshots and published catalog releases are immutable.
- Keep quantitative, genomic, GxE, exact SHU, and learned-vision outputs disabled until promoted models have real datasets, model cards, independent evaluations, and applicability limits.

# Required implementation work

## Workstream 0 - Reproducible baseline and repository hygiene

1. Use Node 24 and the repository-declared pnpm version.
2. Perform a clean registry-enabled install and commit `pnpm-lock.yaml`.
3. Make CI and Docker use the same frozen dependency policy.
4. Remove `.pytest_cache`, `__pycache__`, `.pyc`, temporary validation directories, and other generated archive debris.
5. Establish baseline results for format, lint, typecheck, unit tests, build, Python tests, catalog reconciliation, and repository validation before substantive edits.
6. Add missing project-native validation scripts rather than relying on literal marker checks.
7. Do not upgrade dependencies merely because newer versions exist. Change versions only for compatibility, security, or an implementation requirement, and document the reason.

## Workstream 1 - Canonical contracts and database runtime

1. Expand `packages/contracts` into versioned runtime schemas for:
   - authentication/session/workspace;
   - germplasm, seed lots, inventory events, plants, labels, locations, and materials;
   - crosses, parent roles, pollination events, verification, fruits, harvests, families, generations, and pedigree;
   - genotype calls, evidence, assays, haplotypes where needed by exact simulation;
   - simulation requests/results/runs/targets/selection plans;
   - experiments, variables, sessions, observations, revisions, units, vocabularies, and QC;
   - scientific sources, passages, loci, assertions, reviews, releases, and executable rules;
   - jobs, attempts, logs, outbox events, workers, cancellation, artifacts, and errors;
   - uploads, media, capture protocols, annotations, measurements, models, and evaluations;
   - AI questions, retrieval passages, citations, tool calls, feedback, and evaluations;
   - reports, exports, audit records, pagination, filtering, and standard error envelopes.
2. Infer static types from runtime schemas to prevent duplicate contract drift.
3. Add a forward-only migration runner and idempotent seed/bootstrap process. Never mutate schema at application boot.
4. Execute all migrations against a real PostgreSQL 18 instance from empty state and representative prior state.
5. Add repositories and transaction-scoped services for all authoritative domains.
6. Reconcile domain models and SQL constraints, especially jobs, observations, scientific review, model promotion, origin events, material kinds, and pedigree.
7. Add missing normalized tables or forward migrations required by the original data model for the MVP, including auth identities/sessions, genotype evidence, detailed breeding events, observation sessions/variables, annotations, AI audit/evaluation, backup/restore records, and export jobs where necessary.
8. Add database roles/grants so application code does not implicitly own or bypass authority tables. Verify RLS under the actual application role.
9. Add active/suspended/revoked membership states and prevent stale membership access.
10. Add integration tests for migrations, RLS, cross-workspace attacks, independent review, immutability, append-only behavior, pedigree concurrency/cycles, idempotency, and constraint failures.

Do not edit historical migrations if they are already treated as released. Add numbered forward migrations unless the repository has never shipped and the migration policy explicitly permits consolidation; document the decision.

## Workstream 2 - Production identity, sessions, and permissions

1. Implement a production-capable authentication system appropriate to Next.js 16 and the repository architecture after verifying current compatibility.
2. Support secure sign-in, sign-out, session rotation/revocation, account recovery or admin invite bootstrap, secure cookies, CSRF protection, and rate limiting.
3. Derive user/workspace principal exclusively from the authenticated server-side session. Never trust `workspaceId`, `actorUserId`, role, or permissions supplied by a browser body/header.
4. Implement onboarding, workspace creation, invitations, member role changes, suspension/revocation, and owner-safe controls.
5. Enforce permissions in server-side services and routes, not only UI visibility.
6. Require independent reviewer identity for scientific approvals; rename and correct the misleading `canApproveOwnCatalogWork` helper.
7. Add authorization tests for every high-risk mutation and cross-workspace read/write attempt.
8. Protect admin, audit, catalog publication, model promotion, export, and job cancellation surfaces appropriately.

## Workstream 3 - Complete biological identity and breeding ledger

Implement production UI, APIs/server actions, repositories, services, audit, and tests for:

- taxa/germplasm accessions and aliases;
- source organizations/acquisitions and exact seed-lot provenance;
- auditable seed-lot inventory events rather than a mutable quantity only;
- individual plants, locations, status, labels, and QR codes;
- directed controlled crosses, selfing, and open pollination;
- parent role/cardinality and material-kind validation;
- pollination events, flower identifiers, isolation/emasculation method, operators, timestamps, fruit set, verification, and failure states;
- fruits, seed harvests, seed counts, progeny families, generation records, and origin events;
- pedigree edges and cycle-safe lineage views;
- selection goals, criteria, decisions, and traceable culling/retention;
- immutable or append-only history where biological provenance must not be erased.

A user must be able to record a complete breeding cycle without an external spreadsheet. Every mutation must be idempotent, workspace-scoped, audited, validated, and recoverable where appropriate.

## Workstream 4 - Exact and advanced simulation product

1. Preserve and harden exact rational segregation.
2. Add property-based tests for probability mass, allele-order invariance, parent symmetry for pure nuclear models, maternal asymmetry, linkage edge cases, unknown distributions, viability, and target recovery.
3. Bound rational input sizes and reduce intermediate fractions to prevent computational abuse.
4. Make target recovery numerically stable for very small probabilities.
5. Connect simulation to real biological materials, genotype calls/evidence, approved catalog release contents, and explicit working hypotheses.
6. Never accept arbitrary release/locus/allele identifiers without validating them against the selected release or a clearly labeled user-defined research scenario.
7. Preserve genotype-call evidence IDs, assay/source references, and hypothesis basis. Do not collapse everything to `user_prior`.
8. Persist immutable input/result snapshots, engine version, code/build commit, catalog release hash, rules, assumptions, warnings, abstentions, seed/PRNG for stochastic runs, and content hash.
9. Replace in-memory idempotency with durable idempotency records and transactionally create simulation runs.
10. Add browser support for weighted genotype hypotheses and unknown phase scenarios.
11. Implement direct Monte Carlo inheritance sampling that does not require precomputing the exact state distribution. Run large simulations as durable jobs with reproducible seeds and error diagnostics.
12. Extend linkage only as supported by explicit map/phase inputs; do not invent recombination data.
13. Integrate maternal/cytoplasmic state and nuclear-restorer logic through approved rules and explicit context.
14. Integrate phenotype rule graphs and host-pathogen results only through approved evidence/applicability records, with conflict and insufficient-evidence results.
15. Allow a saved simulation target to create a planned cross and selection plan.

## Workstream 5 - Experiments and observations

Implement:

- investigations/studies or the smallest normalized equivalents required by the existing specification;
- environments, locations, experimental designs, blocks/plots/observation units where applicable;
- approved observation definitions using trait-method-scale/unit/vocabulary contracts;
- observation sessions optimized for greenhouse/mobile data entry;
- bulk entry, autosave/retry, offline-safe draft behavior where practical, and duplicate-action collapse;
- append-only observation revisions with explicit correction reason;
- validation of numerical finiteness, units, categorical vocabulary, dates, method versions, actor, material, and session context;
- QC flags and data exports aligned to MIAPPE concepts where supported.

The database and application service must enforce value contracts; a flexible JSON payload alone is insufficient.

## Workstream 6 - Scientific catalog and research governance

1. Import the supplied source catalog into staging with file/row hashes and reconciliation.
2. Implement source, passage, locus, assertion, applicability, marker/allele details where supported, review, change request, conflict, supersession, and release workflows.
3. Display source passages beside extracted assertions.
4. Enforce curator review plus independent scientific review before approval/publication.
5. Ensure superseding an approved record cannot bypass new review.
6. Publish immutable, hash-bound releases and support safe rollback by selecting a prior release, not mutating history.
7. Build release diff, audit, and validation views.
8. Keep all current seed records draft and zero phenotype rules active unless the repository includes enough reviewed evidence and tests to approve a deliberately narrow rule. Do not activate a rule merely to demonstrate the UI.
9. Expand importer tests and reconcile all source columns without silent loss.

## Workstream 7 - Durable jobs, outbox, and workers

1. Unify `packages/jobs` and SQL into one canonical state model with started/completed/cancelled timestamps, result/error contracts, attempts, leases, heartbeats, and artifacts.
2. Implement PostgreSQL claim queries using safe concurrency semantics, bounded retries, exponential backoff, stale lease recovery, cooperative cancellation, and dead-letter handling.
3. Implement transactional outbox publication/reconciliation.
4. Create persistent Node/Python/R worker loops that claim registered job types rather than exiting after a health command.
5. Version every job payload/result contract and reject unknown versions safely.
6. Store structured job logs and artifacts without secrets.
7. Add concurrency, lease-loss, retry, cancellation, idempotency, poison-message, and shutdown tests.
8. Keep R/AlphaSimR and trained model jobs unavailable until an approved protocol and dependencies exist, but make the unavailable state operational and visible.

## Workstream 8 - Secure phenotype media and deterministic vision

1. Implement signed upload initiation/completion, object-storage persistence, immutable source hashes, and workspace authorization.
2. Enforce byte limits, file signatures, extension/MIME consistency, safe image decode, pixel/dimension limits, decompression-bomb protection, metadata/EXIF policy, malware/content quarantine, and non-public buckets.
3. Create thumbnails/derived artifacts through jobs and preserve provenance.
4. Implement versioned capture protocols, required views, calibration references, quality checks, actionable rejection/review states, and human override audit.
5. Implement annotation projects, revisions, masks, deterministic measurements, method versions, corrections, and authoritative observation promotion.
6. Validate every protocol field and metric range. Define blur and quality metric semantics rather than accepting arbitrary numbers.
7. Keep learned inference disabled unless a model version is promoted with immutable dataset hash, task-specific evaluation, model card, applicability limits, independent approval, and drift monitoring.
8. Do not use multimodal AI output as an authoritative measurement.

## Workstream 9 - Evidence-bounded AI and RAG

1. Implement versioned document ingestion, safe parsing, source hashing, passage/chunk provenance, and approved review states.
2. Add workspace-scoped retrieval over approved passages only. Use a vector/search approach compatible with PostgreSQL or the selected architecture after verifying dependencies.
3. Add hybrid retrieval/reranking only when it improves measured evaluations.
4. Return schema-validated answers with citation IDs, exact source locators, authority class, missing context, warnings, abstentions, tool calls, and run IDs.
5. Validate that every citation belongs to the retrieved permitted set and add claim/citation support checks beyond ID membership.
6. Expose deterministic tools for exact simulations and record retrieval; AI must call tools rather than recalculate authoritative genetics in prose.
7. Add prompt-injection controls, provider/model allowlists, timeouts, retries, rate and cost limits, per-workspace quotas, audit, feedback, and red-team/evaluation fixtures.
8. The application must remain fully usable when AI is disabled or unavailable.

## Workstream 10 - Complete web experience

Replace route shells with real workflows while retaining honest blocked states for genuinely unavailable science.

Requirements:

- responsive desktop/tablet/mobile shell;
- role-aware complete navigation and active state;
- accessible command/search or global navigation if useful;
- semantic forms, keyboard operation, focus management, error summaries, field errors, loading, empty, partial, degraded, permission, conflict, and success states;
- no raw database or scientific implementation jargon for ordinary operators;
- repeated-click protection and idempotent server behavior;
- confirmation and recovery for destructive/high-risk actions;
- labels and QR scanning workflow for biological materials;
- pagination/filtering/sorting for large data sets;
- route-level error, loading, not-found, and permission handling;
- no hard-coded demo workspace, release, actor, or material IDs in production paths;
- clear exact/conditional/hypothesis/unsupported authority labels at every prediction;
- source and uncertainty details available without overwhelming the primary workflow;
- WCAG 2.2 AA, including contrast, touch targets, keyboard, screen-reader names, motion preferences, and responsive tables/forms.

Create a reusable UI package or well-bounded component system if repository evidence supports it. Do not copy-paste dozens of one-off forms.

## Workstream 11 - Reports, exports, audit, and administration

Implement:

- audit event browsing with permission controls and before/after safety;
- job queue, attempts, logs, cancellation, retry/dead-letter views;
- model registry/evaluation/promotion status;
- system readiness with live but non-sensitive dependency checks;
- scientific release and reconciliation reports;
- breeding, pedigree, seed inventory, cross, simulation, selection, experiment, observation, and provenance exports;
- asynchronous large exports with durable jobs and signed downloads;
- all-user-data export in documented nonproprietary formats;
- retention and deletion/retirement policy consistent with biological provenance and audit requirements.

## Workstream 12 - Security, observability, operations, and release proof

1. Threat-model authentication, workspace isolation, scientific approvals, uploads, AI/RAG, jobs, exports, and administrator actions.
2. Add recursive secret/PII redaction, structured logs, request/trace IDs, metrics, error reporting, and actionable health/readiness.
3. Add CSP with a tested nonce/hash strategy, production HSTS under HTTPS, secure cookie policy, frame/permissions/referrer/content-type controls, and safe external resource policy.
4. Rate-limit and bound expensive endpoints, body sizes, exact state spaces, Monte Carlo samples, uploads, AI, exports, and job creation.
5. Ensure SQL is parameterized and all user input is runtime validated.
6. Verify RLS with the actual restricted application database role; do not connect as table owner in production.
7. Make Docker images reproducible, non-root, minimal, health-checked, and based on the frozen lock/dependency sets.
8. Add migrations/bootstrap/bucket initialization and persistent worker services to Compose.
9. Prove database and object-storage backup and restore in an isolated drill. Record checksums and validation queries.
10. Document local development, staging/production configuration, secret rotation, incident response, migration repair, backup restoration, and support ownership.

# Required tests and validation

Discover and use repository-native commands. At minimum, complete and repeatedly run:

1. clean Node 24/pnpm frozen install;
2. formatting check;
3. lint with no meaningful suppressed warnings;
4. strict typecheck across all packages/apps;
5. all unit tests;
6. property-based genetics tests;
7. PostgreSQL migration tests from empty and prior snapshot;
8. repository/service integration tests against real PostgreSQL and object storage;
9. RLS/authorization/adversarial workspace tests;
10. API/contract tests, including idempotency and repeated-submit concurrency;
11. job/outbox/worker concurrency and cancellation tests;
12. Python worker tests and R health/protocol tests;
13. catalog reconciliation and independent-review/publication tests;
14. secure upload and malformed-image tests;
15. AI citation, abstention, prompt-injection, tool-authorization, and evaluation tests;
16. Playwright or equivalent E2E tests for onboarding, breeding cycle, exact simulation, selection-plan creation, observation correction, catalog review, upload/capture, export, permissions, and degraded modes;
17. automated axe accessibility tests plus keyboard/mobile manual checks;
18. production Next build and container builds;
19. Docker Compose smoke with migrations, web, database, object storage, and persistent workers;
20. security/dependency/secret scanning appropriate to the repo;
21. performance budgets for dashboard, list pages, exact simulation, uploads, and large pedigrees;
22. database plus object-store backup/restore drill;
23. `scripts/import_catalog.py --check` and an upgraded repository validator that proves behavior rather than markers only.

For every failure, classify it as introduced, pre-existing relevant, pre-existing unrelated, environment/tooling, or external blocker. Fix introduced and relevant failures. Do not hide warnings or weaken tests to obtain green output.

# Required end-to-end acceptance journeys

The sweep is not complete until automated tests and manual evidence prove:

1. A first owner can bootstrap/sign in, create a workspace, invite a member, and enforce role permissions.
2. A breeder can register germplasm, acquire a seed lot, adjust inventory through events, create plants, print/scan labels, and view provenance.
3. A breeder can record a controlled cross, selfing, and open-pollinated event with correct parent direction and validation.
4. A breeder can record fruit, seed harvest, progeny family/generation, and see a cycle-safe pedigree.
5. A breeder can select actual parents/genotype evidence and an approved catalog release, run and save an exact simulation, see assumptions/uncertainty/sources, and create a selection plan.
6. Repeated submission creates one authoritative mutation; conflicting reuse returns a safe conflict.
7. An observer can execute a protocol/session, enter values with unit/vocabulary validation, and create an audited correction revision.
8. A curator and a different reviewer can move a source/assertion/locus through review and publish an immutable release; the author cannot self-approve.
9. An operator can upload a safe image, reject a malformed/oversized image, pass a capture protocol, annotate/correct a deterministic measurement, and preserve provenance.
10. An AI answer uses only approved passages, shows exact citations/tool runs, and abstains when evidence is absent; disabling AI does not break core workflows.
11. An administrator can inspect/cancel jobs, audit actions, view live readiness, export records, and restore a backup in an isolated environment.
12. Cross-workspace access, stale/revoked membership, forged workspace IDs, unapproved rule use, mutable completed simulations, and pedigree cycles are rejected.

# Performance and scalability requirements

- Use pagination and indexed queries for all unbounded lists.
- Avoid N+1 queries and loading full pedigrees/catalogs/images into memory.
- Bound exact and stochastic computation by authenticated policy and move long work to jobs.
- Use streaming or incremental export for large datasets.
- Make idempotency safe across multiple web instances.
- Measure before claiming optimization; report before/after evidence for material changes.

# Explicit non-goals and prohibited shortcuts

- Do not claim production accuracy for quantitative, genomic, GxE, SHU, flavor, yield, disease, or learned-vision models without real validation.
- Do not create fake catalog approvals or genotype calls to make demos appear complete.
- Do not bypass RLS with an owner database connection in application runtime.
- Do not put authorization only in client components.
- Do not use in-memory Maps as authoritative persistence or idempotency.
- Do not directly write terminal scientific, job, cross, model, or review states from arbitrary route handlers; use canonical transition services.
- Do not weaken immutability, append-only history, independent review, or audit controls.
- Do not silence TypeScript, lint, database, accessibility, or security failures with blanket exclusions.
- Do not add a microservice, queue, cache, vector database, or orchestration platform unless the existing architecture cannot meet a proven requirement.
- Do not leave capability pages as substitutes for core MVP workflows.
- Do not mark the application complete based on route/table/file counts.

# Subagent execution rules

You may use subagents, but the lead agent owns final integration and validation.

Suggested bounded workstreams:

1. platform/toolchain/auth/security;
2. database/contracts/repositories;
3. breeding ledger and observations;
4. simulation/catalog governance;
5. jobs/workers/media/vision;
6. AI/research;
7. web UX/accessibility/E2E;
8. operations/backup/release evidence.

Assign one owner for shared contracts and migrations. Serialize changes to root manifests, lockfile, migrations, shared schemas, generated catalog outputs, and global navigation. Require each subagent to report files, tests, assumptions, and deviations. Merge in dependency order, run integration tests after every shared-contract merge, and perform one final repository-wide review.

# Stop conditions

Stop and report instead of improvising only when:

- repository evidence materially contradicts a safety-critical requirement;
- a required secure/auth/data behavior cannot be implemented without an unapproved external decision;
- migration or data loss risk cannot be bounded;
- a scientific model would require fabricated evidence or training data;
- validation cannot meaningfully prove a high-risk change;
- implementation would require a major architecture replacement outside this approved scope.

External provider credentials, production DNS, email delivery, or real training data are not reasons to abandon the rest of the sweep. Implement secure provider interfaces, local/test adapters, explicit degraded states, and document the external activation step.

# Final code-review loop

After implementation and before final reporting:

1. Review every created or modified file.
2. Check correctness, security, workspace isolation, scientific authority, edge cases, concurrency, performance, accessibility, error handling, duplication, dead code, naming, tests, docs, migrations, rollback/repair, and operational support.
3. Compare the result file by file against the supplied audit and original definition of done.
4. Fix every material finding that is within scope.
5. Re-run the complete validation ladder from a clean state.
6. Do not finish with unresolved introduced warnings, failing tests, route shells for core workflows, or unsupported completion claims.

# Required deliverables

Return the complete updated repository. Also create/update:

- `docs/NEXT_SWEEP_FINAL_REPORT.md`;
- `docs/ACCEPTANCE_TRACEABILITY.md` mapping every requirement to code/tests/evidence;
- `docs/FILE_CHANGE_LEDGER.md` listing every created/modified/deleted file and why;
- `docs/VALIDATION_REPORT.md` with exact commands, environment, exit status, and failure classification;
- `docs/SECURITY_AND_THREAT_MODEL.md`;
- `docs/DATA_MODEL_AND_MIGRATION_REPORT.md`;
- `docs/SCIENTIFIC_AUTHORITY_AND_MODEL_GATES.md`;
- `docs/OPERATIONS_BACKUP_RESTORE_RUNBOOK.md`;
- `docs/RELEASE_BLOCKERS.md` containing only genuine external or scientific blockers;
- machine-readable validation/manifest/checksum output;
- a downloadable archive containing only files created or modified during this sweep, preserving relative paths, plus a complete repository archive if the environment supports it.

# Required final response

Report:

1. current-state findings verified before edits;
2. architecture and scope decisions;
3. implementation by workstream and user journey;
4. all files changed and reasons;
5. migrations and data handling;
6. auth/security/privacy/workspace isolation;
7. scientific authority and blocked-model status;
8. exact commands and validation outcomes;
9. E2E/accessibility/performance/backup evidence;
10. failures classified honestly;
11. residual risks, external activation steps, and scientific blockers;
12. technical debt introduced, with owner, payoff, due condition, and removal path;
13. acceptance-criteria status with evidence;
14. archive paths/checksums.

# Completion standard

The next sweep is complete only when the web application supports the required persisted end-to-end breeding journeys, the exact simulation is authoritative and reproducible, scientific review and abstention remain enforced, production security and workspace isolation are tested, workers and operations are functional, and the full validation ladder passes or any remaining blocker is genuinely external or scientifically impossible without new data.

Do not describe the repository as production-ready unless that standard is proven with runtime evidence.
