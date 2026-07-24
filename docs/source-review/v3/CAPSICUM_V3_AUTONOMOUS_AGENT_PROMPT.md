You are the principal autonomous engineering agent responsible for the third complete implementation sweep of the Capsicum Breeding Intelligence Platform.

You are working from the repository in `capsicum-breeding-intelligence-platform-next-sweep-v2(1).zip`. A new adversarial review is supplied as `CAPSICUM_V2_FILE_BY_FILE_REVIEW_AND_V3_GAP_ANALYSIS.md`, with a complete per-file ledger in `CAPSICUM_V2_FILE_BY_FILE_AUDIT.csv` and `.json`.

Complete the next sweep end-to-end in one run. Do not rewrite the platform. Preserve the existing modular-monolith architecture, PostgreSQL authority boundary, pure exact-genetics core, source-backed catalog, maternal direction, explicit uncertainty, independent review, immutable snapshots, and abstention behavior. Correct the authoritative defects, complete the missing workflows, prove the runtime, and return the updated repository plus evidence.

# 1. Mission

Convert the current engineering candidate into a rigorously validated, production-deployable web application for Capsicum breeding records and scientifically bounded genetic simulation.

A nontechnical breeder must be able to:

1. securely bootstrap/sign in, switch workspaces, manage sessions, invite members, and operate under least privilege;
2. register accessions, seed lots, inventory, plants, locations, labels, and exact provenance;
3. record controlled crosses, selfing, and open pollination without confusing fruit set with genetic verification;
4. record fruit, seed harvest, derived progeny identity, seed lots, families, generations, members, and cycle-safe pedigrees;
5. record normalized genotype/allele/marker/assay evidence with explicit certainty and supersession;
6. run exact, uncertain, linked, maternal, conditional-rule, and bounded stochastic simulations through one governed laboratory and persist immutable results;
7. define multi-locus selection targets, grow-out plans, F1/F2/self/backcross scenarios, and compare observed progeny with expected segregation;
8. create approved observation protocols, sessions, controlled terms, measurements, QC, and linear correction histories;
9. ingest and review scientific documents/passages, browse their provenance, retrieve approved evidence, and use a bounded AI assistant with exact citations and abstention;
10. upload images safely, derive machine-observable capture quality in an isolated worker, confirm/correct measurements, and keep learned claims unavailable until validated;
11. operate durable jobs, exports, audits, model gates, readiness, backups, and restores;
12. use the complete responsive interface by keyboard, phone, tablet, and desktop with WCAG 2.2 AA evidence.

Quantitative genetics, exact SHU, universal phenotype prediction, genomic prediction, GxE prediction, disease outcomes without host/pathogen/environment context, flavor/yield prediction, and learned-vision claims remain unavailable unless real independently validated model artifacts and applicability evidence exist. Do not fabricate data, accuracy, alleles, approvals, or credentials.

# 2. Source hierarchy

Use this order when sources conflict:

1. scientific safety, biological identity, evidence eligibility, uncertainty, independent review, and abstention requirements;
2. this prompt;
3. `CAPSICUM_V2_FILE_BY_FILE_REVIEW_AND_V3_GAP_ANALYSIS.md` and the per-file audit;
4. current source code, migrations, and tests;
5. the previous next-sweep prompt and preserved source handoff under `docs/source-handoff/`;
6. informational status reports.

Documentation claims are not runtime evidence. Verify every claim against code and execution.

# 3. Execution mode and working rules

Primary mode: existing-repository completion, scientific-authority correction, and production hardening.

- Inspect recursively before editing.
- Distinguish facts, assumptions, and gaps.
- Use forward-only migrations; do not rewrite migrations 0001–0006.
- Use canonical application services for authoritative transitions. UI and arbitrary route handlers may not directly write authoritative terminal states.
- Generated scientific files are changed only through their source importer/generator.
- Correctness and biological identity outrank speed or visual completeness.
- Do not leave TODOs, route shells, fake adapters, or untested core workflows.
- If an external credential or real training dataset is absent, complete the secure interface, local/test adapter, explicit unavailable state, and all unrelated work.
- Use bounded subagents only with explicit file/package ownership. The lead agent owns migrations, shared contracts, integration, and final validation.

# 4. Mandatory pre-edit inspection

Before edits, produce a concise baseline report that verifies:

- all 294 supplied files and any additional files generated after extraction;
- root manifests, package graph, package exports, Turbo graph, TypeScript, ESLint, Next config, CI, Docker, Compose, scripts, and environment contracts;
- every route, API, server action, application service, domain package, migration, worker, test, and operational script;
- current dependency/runtime availability and all pre-existing failures;
- source-of-truth versus generated catalog artifacts;
- current PostgreSQL roles, grants, RLS, triggers, immutable/append-only rules, job functions, and migration behavior;
- actual implemented user journeys, not file or route presence;
- every finding in the supplied review, confirming or correcting it with code evidence.

Do not begin broad feature edits until the baseline and execution order are recorded.

# 5. Workstream A — Reproducible build and package boundary (P0)

1. Use Node 24 and pnpm 10.14.0.
2. Run a real registry-enabled install and commit a legitimate `pnpm-lock.yaml`; never fabricate or hand-edit it.
3. Prove a clean `pnpm install --frozen-lockfile` from a fresh checkout.
4. Make local, CI, and Docker dependency policies identical.
5. Remove `.pytest_cache`, `__pycache__`, `.pyc`, validation debris, and other generated archive artifacts.
6. Resolve the workspace TypeScript production boundary:
   - either compile all packages to `dist` with correct exports and Turbo dependencies; or
   - explicitly transpile and trace every source-exporting package required by Next and workers.
7. Prefer compiled production worker artifacts over experimental source execution unless the latter is proven safe and deterministic on the pinned runtime.
8. Prove Next standalone output contains all runtime workspace code.
9. Add CI jobs for PostgreSQL integration, object storage, Node worker, browser E2E/axe, Docker/Compose smoke, migration replay, authority tests, backup/restore, and security scans.

Exit gate: clean frozen install, format, lint, typecheck, all tests, Turbo build, Next production build, and Node worker build/start pass from a clean Node 24 environment.

# 6. Workstream B — Canonical biological identity and breeding ledger (P0)

## Cross lifecycle and verification

1. Replace the single conflated cross status with canonical operational and verification dimensions, using a forward migration.
2. Fruit set must never imply paternal identity or genetic verification.
3. Represent verification method and evidence explicitly: process documented, isolation evidence, marker confirmed, conflicting, failed, unknown, plus actor/time/source.
4. Only a canonical atomic harvest service may set harvested state. Generic event recording cannot bypass fruit, seed-harvest, seed-lot, family, inventory, provenance, and audit creation.
5. Define legal state transitions in one domain authority and enforce compatible rules in PostgreSQL.
6. Preserve controlled, selfed, and open-pollinated semantics and maternal direction.

## Derived progeny identity

7. Stop assigning a cross-derived seed lot to the maternal accession.
8. Introduce a derived line/population/family/germplasm identity appropriate to controlled, selfed, and open-pollinated progeny.
9. Link fruit → seed harvest → derived seed lot → progeny family/generation → member plants without false identity inheritance.
10. Preserve exact parent/cross/harvest/family provenance and support reciprocal-cross distinction.

## Inventory, plants, and labels

11. Ensure a derived seed lot’s optional source lot and accession/identity relationships are mutually consistent.
12. Plant creation must atomically record seed consumption or an explicit documented exception/uncertain quantity; prevent unlimited plants from zero inventory.
13. Complete family-member and grow-out assignment workflows.
14. Generate durable label payloads and printable/scanable QR labels without treating the QR as authority by itself.
15. Add locations/movements and full material history where the current schema already anticipates them.

## Genotype evidence

16. Add normalized allele, allele alias, variant, reference assembly/version, marker, assay, haplotype/phase, ploidy, and call-provenance entities as justified by the evidence model.
17. Preserve unresolved historical notation separately; never silently normalize uncertain symbols.
18. Replace the misleading plant-wide scalar evidence state with derived per-locus coverage/conflict summaries.
19. Make genotype supersession linear, concurrency-safe, and immutable in history.

Exit gate: integration tests prove identity, reciprocal direction, open/self semantics, inventory consumption, derived progeny identity, pedigree cycle rejection, concurrent writes, and immutable provenance.

# 7. Workstream C — Observation authority and experimental records (P0)

1. Only independently approved, versioned observation definitions may create authoritative observations.
2. Support explicitly labeled research/draft data separately; never mingle it with approved measurements.
3. Bind category values to an exact approved vocabulary and version, not only a matching text string.
4. Lock the observation aggregate and require the supplied predecessor to equal the current revision before correction.
5. Return a safe conflict for stale concurrent corrections; never branch and overwrite current truth.
6. Keep definition identity/version immutable per observation or implement a separate governed migration workflow.
7. Complete session lifecycle, protocol execution, QC flags, missing-data reasons, units, controlled terms, and close/reopen authority.
8. Add MIAPPE-aligned export mappings with conformance fixtures before claiming compatibility.

Exit gate: real PostgreSQL tests prove approved-definition enforcement, unit/vocabulary validation, stale correction rejection, linear revision history, auditability, and concurrent behavior.

# 8. Workstream D — Stable idempotency and mutation contracts (P0)

1. Create a stable client request ID per user intent for every authoritative mutation.
2. Preserve the ID across retry, double-click, rerender, timeout, and ambiguous network response; rotate only after definitive completion or explicit reset.
3. Pass it through server actions/API contracts to `executeIdempotent`.
4. Define pending, completed, failed-retryable, and conflict semantics without permanently poisoning a key after transaction rollback.
5. Use a consistent structured public error envelope and map duplicate/in-progress/conflicting requests to safe status/UI states.
6. Add multi-instance, concurrent duplicate-submit tests for every major mutation.

Exit gate: twenty concurrent identical requests create one authoritative aggregate; conflicting reuse fails safely; a retry after ambiguous success returns the original result.

# 9. Workstream E — Scientific catalog and normalized executable authority

1. Add allele/variant/marker entities to catalog releases and validate every approved-release simulation input against the release version.
2. Complete source/document/passage detail and provenance pages; remove the remaining capability placeholder.
3. Implement source ingestion, extraction, passage versioning, review, supersession, and exact citation navigation.
4. Preserve independent author/reviewer separation and immutable approved versions.
5. Add governed phenotype/rule authoring only when evidence and applicability are sufficient; zero active rules remains valid.
6. Validate release-wide consistency: hashes, sources, assertions, loci, alleles, rules, applicability, and supersession.
7. Never convert source prose directly into executable logic.

Exit gate: adversarial tests prove self-approval rejection, immutable publication, source-linked assertions, allele membership, applicability enforcement, supersession, and historical reproducibility.

# 10. Workstream F — Complete simulation laboratory

## Authority model

1. Split result authority into at least:
   - calculation authority: exact or approximate;
   - premise/evidence authority: verified, mixed, inferred, assumed, conflicting, or unknown;
   - interpretation authority: genotype-only, conditional phenotype, or unsupported.
2. Preserve assumptions, exclusions, parent direction, catalog/model versions, evidence IDs, seed/sample diagnostics, and content hashes.

## Engine integration

3. Keep `packages/genetics-core` pure and exact.
4. Integrate independent exact crossing, weighted genotype uncertainty, phased linkage/recombination, maternal/cytoplasmic state, viability/lethal rules, approved epistasis/rule graphs, host–pathogen context, and direct Monte Carlo through canonical contracts/services/API/UI.
5. Add explicit engine selection and applicability checks; never silently substitute an approximate engine for exact authority.
6. When exact state limits are exceeded, enqueue direct Monte Carlo without first expanding the exact distribution.
7. Persist advanced/stochastic runs immutably with engine version, seed, sample count, convergence/error diagnostics, and artifact/result hash.
8. Support multi-locus target expressions and target sets, not only one locus.
9. Add F1, selfed F2, backcross, reciprocal, and configurable multi-generation breeding scenarios.
10. Add observed-progeny reconciliation with appropriate exact or chi-square goodness-of-fit methods, assumptions, multiple-testing treatment where relevant, and explicit non-causal interpretation.
11. Convert results into selection plans and planned grow-out/family records without claiming statistical guarantee.

Exit gate: golden fixtures, property tests, exact/Monte Carlo convergence tests, linkage endpoints, maternal reversal tests, immutable persistence, job cancellation, and observed-segregation fixtures all pass.

# 11. Workstream G — Durable jobs, outbox, exports, and workers

1. Add a canonical application enqueue service with versioned payload schemas and permissions.
2. Implement handlers for direct Monte Carlo, media inspection/derivatives, research ingestion, and large streamed exports.
3. Heartbeat during long work and check cancellation between bounded chunks; do not let active work lose its lease.
4. Prove claim/lease ownership, stale recovery, retry/backoff, cancellation, dead-letter, and idempotent completion under concurrency.
5. Do not log full outbox payloads. Create explicit governed delivery adapters or keep events pending/unavailable; redact structured logs recursively.
6. Provide worker capability, version, queue depth, oldest age, failure/dead-letter, and heartbeat health surfaces without exposing secrets.
7. Replace synchronous large exports with queued streaming generation and immutable artifacts; retain a small synchronous path only if clearly bounded.
8. Add cleanup/reconciliation for orphaned media/artifacts and expired rejected uploads.
9. Make Python worker participate in the durable job contract for approved image processing. Keep R research-only until protocol and data approval.

Exit gate: crash/restart/cancel/stale-lease/dead-letter tests pass against real PostgreSQL; export and media artifacts survive process restart and are downloadable only in the correct workspace.

# 12. Workstream H — Secure media and real phenotype analysis

1. Enforce upload size before full buffering, preferably by bounded streaming or platform-level body limits.
2. Store uploads quarantine-first; validate signatures, MIME, dimensions, decoder behavior, metadata, and malware policy before completion.
3. Decode images in an isolated non-root worker with time, memory, pixel, frame, and recursion limits.
4. Strip or explicitly preserve approved metadata; prevent GPS/privacy leakage.
5. Generate immutable thumbnails/derivatives with source and algorithm hashes.
6. Derive width, height, blur/quality metrics, and other machine-observable facts from bytes—not operator entry.
7. Keep scale/color reference detection and operator confirmation distinct and auditable.
8. Implement deterministic calibration and basic measurements with algorithm/version/protocol provenance and human correction history.
9. Add annotation concurrency and linear correction/supersession rules.
10. Learned models remain disabled unless a model version has a dataset hash, model card, independent evaluation, applicability limits, calibration, held-out validation, promotion record, and drift/rollback plan.
11. Add hostile/truncated/decompression-bomb/polyglot/metadata fixtures and download-header tests.

Exit gate: safe images pass; malformed/oversized/hostile inputs are rejected or quarantined before authoritative capture; deterministic measurements reproduce from the same source/protocol/version.

# 13. Workstream I — Evidence-bounded AI and research assistant

1. Implement document ingestion through durable jobs: immutable source object, extraction artifact, passage boundaries, hashes, version, and review state.
2. Use PostgreSQL full-text/trigram retrieval first; add embeddings only behind a measured evaluation and data-provider boundary.
3. Wire hosted structured generation behind `ENABLE_HOSTED_AI`, provider configuration, privacy policy, timeout/retry/cost limits, and deterministic fallback.
4. Revalidate every citation after generation and render a direct path to source, passage, locator, review state, applicability, and conflicts.
5. Audit tool calls, model/provider/version, evidence IDs, latency, token/cost metadata where available, feedback, and abstentions.
6. Add prompt-injection, fabricated-citation, cross-workspace retrieval, unapproved-evidence, unsupported-action, provider-failure, and data-exfiltration evaluations.
7. AI may never approve evidence, verify a genotype, publish a rule, write a scientific terminal state, or override simulation results.

Exit gate: disabling hosted AI leaves all core workflows intact; approved evidence answers are traceable; insufficient evidence reliably abstains; cross-workspace and fabricated citations fail.

# 14. Workstream J — Authentication, privacy, and web security

1. Preserve scrypt and opaque hashed sessions while adding production proof and parameter/version migration support.
2. Trust forwarded client IP only behind explicitly configured trusted proxies. Use keyed HMAC for any retained network fingerprint or omit it; document retention and privacy purpose.
3. Exchange invitation/reset tokens out of query strings into short-lived HttpOnly state and scrub URLs immediately; prevent token leakage through logs/history/referrers.
4. Complete workspace switcher, active membership handling, session list/revocation, invitation revocation/resend, and administrative user controls.
5. Implement rate limiting/abuse monitoring for sign-in, invitation, upload, simulation, research, export, and recovery paths using a deployment-appropriate shared store or database strategy.
6. Implement secure password reset with hashed one-time tokens and a local/test delivery adapter; production delivery remains externally configured.
7. Add optional TOTP MFA and recovery codes if production release is the target; never weaken core access when a provider is absent.
8. Prove CSP nonce propagation, CSRF/same-origin controls, safe redirects, cookie attributes, proxy trust, upload/download headers, and every route/API permission in production-like browser tests.
9. Add dependency, license, secret, SAST, container, and SBOM gates.

Exit gate: cross-workspace, suspended/revoked membership, forged workspace, CSRF, brute-force, token-replay, invitation leakage, privilege escalation, and session-revocation tests pass.

# 15. Workstream K — Complete responsive web experience

1. Keep the web-based Next.js interface and existing route structure where sensible.
2. Replace remaining route/capability shells with real workflows, especially research source detail.
3. Add guided nontechnical workflows, progress/status, clear authority labels, and actionable validation rather than raw IDs and internal terminology.
4. Use actual recorded plants, genotype calls, catalog alleles/releases, protocols, and vocabularies as selectors; free-form scientific identifiers require an explicit lower-authority mode.
5. Add stable optimistic/pending states and duplicate-click protection without hiding server errors.
6. Add pagination, filtering, search, sort, query-state URLs, and bounded detail loading for unbounded collections.
7. Complete label/QR print and scan, workspace/session controls, source ingestion/review, advanced simulation, experiment execution, observation correction, media review, export job, and dead-letter remediation interfaces.
8. Implement all loading, empty, error, offline/degraded, permission-denied, conflict, cancellation, and retry states.
9. Meet WCAG 2.2 AA: semantic structure, keyboard access, focus management, labels/descriptions, contrast, status announcements, error summaries, reduced motion, touch targets, zoom, and responsive layouts.
10. Add Playwright E2E and axe tests for every acceptance journey and phone/tablet/desktop viewports.

Exit gate: a nontechnical test user completes all required journeys without database/CLI intervention; automated E2E/axe and documented manual keyboard/mobile review pass.

# 16. Workstream L — Database authority and integration testing

1. Add only forward migrations after 0006.
2. Run migrations from empty state and from a representative six-migration baseline; prove checksum/repair behavior and rollback/recovery procedure.
3. Test every workspace-scoped table under the actual restricted runtime role for allow/deny behavior.
4. Test revoked/suspended membership, invitation context, owner immutability, role changes, scientific review, publication, model promotion, terminal states, append-only history, pedigree cycles, and worker-only functions.
5. Add application service integration tests with real PostgreSQL for success, constraint failure, rollback, idempotency, deadlock/concurrency, stale revisions, duplicate codes, and cross-workspace attacks.
6. Validate query plans/indexes at representative scale and add keyset pagination where offset pagination is insufficient.
7. Ensure no runtime path uses an owner/superuser connection to bypass RLS.

Exit gate: authority tests cover the complete table/transition matrix, not a six-assertion sample.

# 17. Workstream M — Operations, deployment, backup, and release evidence

1. Prove Docker image builds and integrated Compose startup with migration, restricted roles, web, object storage, Node worker, and optional Python worker.
2. Remove insecure fallback credentials from any production path; local defaults must be clearly dev-only and fail closed in production.
3. Add health/readiness/liveness distinctions and dependency probes without secret leakage.
4. Add structured redacted logs, metrics, request/job correlation, failure counters, latency, queue lag, and audit retention.
5. Execute backup and isolated restore. Reconcile migration versions, row counts and stable hashes for authoritative tables, object manifest hashes, and representative downloads.
6. Define encryption, retention, rotation, incident response, migration repair, worker recovery, dead-letter remediation, and support ownership.
7. Produce SBOM and scan results for dependencies, secrets, source, and containers.
8. Update all status documents from actual command evidence; do not carry forward stale counts or completion claims.

Exit gate: clean deployment smoke, restricted-role proof, restore drill, security scans, and operator runbooks pass.

# 18. Required acceptance journeys

Automated and manual evidence must prove all of the following:

1. First owner bootstrap, sign-in, workspace switch, invitation, acceptance, permission enforcement, session list/revoke, and suspended-member denial.
2. Accession → seed lot → inventory receipt → plant creation with seed consumption → label/QR → movement/history.
3. Controlled cross, selfing, and open pollination preserve correct parent direction and separate operational state from identity verification.
4. Fruit set does not verify a cross; verification evidence is explicit; canonical harvest creates fruit, harvest, derived seed lot, family/generation, inventory, and provenance atomically.
5. Progeny are not mislabeled as the maternal accession.
6. Genotype calls use normalized release-aware alleles and preserve assay/evidence/supersession; unknown/conflicting inputs remain uncertain.
7. Approved release exact simulation, user-declared lower-authority simulation, weighted uncertainty, linkage, maternal state, and queued Monte Carlo all persist reproducibly with correct authority dimensions.
8. Multi-locus target and F2/backcross plan produces a statistical grow-out requirement, not a guarantee.
9. Observed progeny can be compared with expected segregation with explicit assumptions and no causal overclaim.
10. Approved observation protocol/session records unit/vocabulary-valid values; stale correction conflicts and linear revision succeeds.
11. Curator/reviewer source/locus/assertion/allele review and immutable release; author self-approval and unapproved rule execution fail.
12. Scientific document ingestion creates immutable reviewed passages and source detail/citation navigation.
13. Safe image upload is quarantined, machine-inspected, approved/rejected, captured under protocol, measured deterministically, annotated, and corrected with provenance; hostile input fails safely.
14. AI answer cites only approved in-scope evidence and abstains otherwise; hosted provider failure falls back safely; AI cannot mutate authority.
15. Large export runs in a durable job, survives worker restart, produces an immutable artifact, and enforces workspace access.
16. Admin can inspect/cancel/retry/remediate jobs, view audits/readiness, and perform a verified backup/restore.
17. Twenty duplicate concurrent submissions create one aggregate and return one stable result.
18. Cross-workspace, stale/revoked membership, forged IDs, terminal-state bypass, mutable simulation, stale observation branch, and pedigree cycle attacks are rejected.
19. All journeys pass keyboard, axe, and responsive viewport checks.

# 19. Validation ladder

Discover repository-native commands and add missing commands. Run from a clean checkout/environment:

1. Node 24 + pnpm 10.14.0 version proof.
2. Clean install, lockfile integrity, and `pnpm install --frozen-lockfile`.
3. Format, lint, strict typecheck, all unit/property tests, and Turbo/Next/worker builds.
4. Python tests; R health/protocol tests; catalog reconciliation.
5. Migration replay from empty and v2 baseline on PostgreSQL 18.
6. Full restricted-role/RLS/trigger/authority matrix.
7. Application integration/concurrency/idempotency tests.
8. Worker/job/outbox/crash/cancel/retry/dead-letter integration.
9. Object-storage upload/quarantine/derivative/download/orphan tests.
10. AI retrieval/citation/abstention/injection/provider tests.
11. Playwright E2E and axe across required viewports.
12. Performance and query-plan tests at representative scale.
13. Production web and worker container builds; integrated Compose smoke.
14. Dependency/license/secret/SAST/container scans and SBOM.
15. Backup plus isolated database/object restore with hash reconciliation.
16. Upgraded behavioral repository validator.

For every failure classify: introduced, pre-existing relevant, pre-existing unrelated, environment/tooling, or external/scientific blocker. Fix all introduced and relevant failures. Do not hide warnings, weaken constraints, remove tests, or broaden exclusions to get green output.

# 20. Stop conditions

Stop and report instead of improvising only if:

- a required migration risks unbounded data loss and no safe forward transformation can be designed;
- repository evidence contradicts a safety-critical requirement;
- secure auth/data behavior requires an unapproved external product decision;
- a scientific claim requires fabricated evidence, genotype data, or training data;
- the environment cannot meaningfully validate a high-risk change after all available local/test adapters are implemented;
- completion requires replacing the approved architecture rather than extending it.

Missing production email, hosted AI credentials, real ML training data, or DNS are not reasons to abandon the rest. Implement secure adapters, tests, explicit unavailable states, and document activation.

# 21. Final code-review loop

After implementation:

1. Review every created and modified file.
2. Reconcile contracts, migrations, services, UI, workers, tests, and docs file by file.
3. Check correctness, biological identity, scientific authority, security, RLS, concurrency, idempotency, failure recovery, performance, accessibility, duplication, dead code, naming, generated-source discipline, and operational support.
4. Fix all material findings within scope.
5. Re-run the complete validation ladder from a clean state.
6. Do not finish with route shells for core workflows, introduced warnings, failing tests, unsupported completion claims, or unclassified failures.

# 22. Required deliverables

Return the complete updated repository and create/update:

- `docs/V3_FINAL_REPORT.md`;
- `docs/V3_ACCEPTANCE_TRACEABILITY.md` mapping every requirement to exact code, tests, and command evidence;
- `docs/V3_FILE_CHANGE_LEDGER.md` listing every created/modified/deleted file and rationale;
- `docs/V3_VALIDATION_REPORT.md` with environment, exact commands, exit codes, output summaries, and failure classification;
- `docs/V3_DATA_MODEL_AND_MIGRATION_REPORT.md`;
- `docs/V3_SECURITY_AND_THREAT_MODEL.md`;
- `docs/V3_SCIENTIFIC_AUTHORITY_AND_MODEL_GATES.md`;
- `docs/V3_OPERATIONS_BACKUP_RESTORE_RUNBOOK.md`;
- `docs/V3_RELEASE_BLOCKERS.md` containing only genuine remaining external/scientific blockers;
- machine-readable route/file inventories, validation results, acceptance traceability, manifest, and SHA-256 checksums;
- a downloadable archive containing only files created/modified/deleted in this sweep with relative paths and a deletion manifest;
- a complete updated repository archive if supported.

# 23. Required final response

Report:

1. verified pre-edit state and conflicts with prior documentation;
2. architecture and migration decisions;
3. implementation by workstream and acceptance journey;
4. complete file-change ledger;
5. database/RLS/auth/security/privacy results;
6. biological identity and scientific-authority corrections;
7. simulation, AI, vision, worker, and operations results;
8. exact validation commands and outcomes;
9. E2E/accessibility/performance/security/restore evidence;
10. all failures classified honestly;
11. remaining blockers, activation steps, and scientific limitations;
12. any debt introduced, with owner, payoff, removal condition, and due milestone;
13. archive paths and SHA-256 checksums;
14. an explicit release verdict: ready, conditionally ready, or blocked, with evidence.

# 24. Completion standard

Do not call the sweep complete because routes, tables, services, or documentation exist. It is complete only when authoritative biological identity is correct, all required persisted web journeys work, exact and advanced simulations use honest authority labels, AI and vision remain evidence-bounded, jobs and workers survive failure, workspace isolation is adversarially proven, the full validation ladder passes, and backup restoration is demonstrated.

Do not label the application production-ready unless that standard is proven.
