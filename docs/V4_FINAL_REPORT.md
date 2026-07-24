# Capsicum Breeding Intelligence Platform V4 Final Report

## Release verdict

**BLOCKED.**

V4 is a materially stronger engineering and scientific candidate, but production deployment is not proven. A legitimate frozen installation, Node 24 build, PostgreSQL 18 migration/authority suite, Docker/ClamAV/object-storage integration, browser E2E and WCAG evidence, security scans, and isolated backup restoration could not be executed in this environment.


## Final repository scope

- Baseline repository files: **401**.
- V4 page routes: **54**.
- V4 API routes: **11**.
- Forward migrations: **22** (`0001` through `0022`).
- Static authority-table inventory: **112 unique `CREATE TABLE` declarations**.
- TypeScript-family source files parsed: **147**.
- Approved executable phenotype rules: **0**.

## File-change summary

- Created files: **45**.
- Modified files: **57**.
- Deleted files: **0**.
- Generated evidence or manifest files: **22**.
- Machine-readable ledger: `docs/v4-file-change-ledger.json`.

## Architecture preserved

V4 preserves the approved modular-monolith design:

- Next.js web interface and server actions/API boundaries.
- Canonical application services for authoritative mutations.
- Pure exact-genetics arithmetic with arbitrary-precision rational probabilities.
- Separate advanced scientific calculation primitives.
- PostgreSQL as the authority boundary with RLS, restricted runtime/worker roles, immutable histories, and security-definer transition functions.
- Source-backed scientific catalog, independent review, immutable releases, maternal direction, explicit uncertainty, and abstention.
- Durable Node worker plus explicit Python/R capability boundaries.

Migrations `0001` through `0014` were not rewritten. V4 adds migrations `0015` through `0022`.

## Work completed

### Authentication, abuse controls, and public idempotency

- Failed sign-in accounting and rate-limit consumption commit independently of rejected business transactions.
- Unknown accounts execute the same scrypt path as known accounts.
- Password verification no longer holds credential row locks during the expensive KDF.
- Credential snapshots are rechecked before success is committed.
- Scrypt parameters are versioned and support rehash-on-success.
- Network abuse identifiers use keyed HMAC and explicit proxy trust.
- Public idempotency uses durable terminal outcomes and savepoint-separated rollback semantics.
- Invitation and reset credentials are no longer returned to browser state or query strings.
- Local/test delivery uses protected server-side spool files; production fails closed without an approved delivery adapter.
- Public errors use bounded codes rather than raw exception text.

### Scientific catalog and releases

- Added draft, submission, independent review, and owner publication lifecycle for catalog releases.
- Release snapshots bind exact hashes for loci, alleles, assemblies, variants, markers, assays, sources, passages, protocols, observation definitions, assertions, and executable rules.
- Publication rejects missing normalized allele coverage, stale hashes, unapproved dependencies, author self-approval, and post-publication mutation.
- Added canonical authoring and review workflows for assemblies, alleles, sequence/structural variants, markers, and assays.
- Zero active phenotype rules remains a valid and accurately represented state.

### Biological identity and inventory

- Unknown seed quantity remains unknown instead of becoming known zero.
- Inventory event signs and meanings are canonicalized.
- Reservations support creation, partial consumption, release, expiry, and append-only history.
- Planting exceptions require independently approved requests.
- Plant creation reconciles inventory atomically.
- Transfers create paired immutable movements.
- Existing controlled-cross, selfing, open-pollination, maternal direction, derived progeny identity, and harvest atomicity are preserved.

### Observation authority

- Experiments bind approved protocol versions.
- Authoritative observations bind approved definition, method, unit, vocabulary, quality-term, and device-schema versions.
- Missingness follows definition-specific policy.
- Device provenance is schema-bound.
- Observation correction locks the aggregate, checks the current predecessor, rejects stale branching, and preserves linear history.
- Added governed authoring/review surfaces for protocols, methods, quality terms, device schemas, and definitions.

### Simulation and selection

- Exact approved-release simulation consumes exact release locus/allele members.
- Calculation, premise, and interpretation authority are displayed separately.
- Exact arithmetic over assumed or conflicting premises is never labeled fully scientifically authoritative.
- Weighted uncertainty now uses a guided exact-rational interface, validates per-locus totals of exactly one, requires matching parent locus sets, preserves stable request IDs, and clearly labels user-declared lower-authority mode.
- Selection plans preserve target expression, scenario, confidence, model version, assumptions, population calculation, and generation plan.
- Selection-plan lifecycle is canonical, versioned, independently approved, terminal-state protected, and append-only.
- Observed-versus-expected segregation analyses are immutable scientific records using exact binomial or chi-square only when valid, with explicit abstention for unsupported small multinomial cases and non-causal interpretation.

### Media, workers, storage, and exports

- Uploads remain quarantined until scanner-confirmed clean.
- The default Compose design now includes ClamAV and the worker uses bounded INSTREAM scanning.
- Scanner failure, suspicious content, or infection cannot become authoritative capture.
- Media/export downloads stream with byte ranges, safe headers, workspace authorization, and structured errors.
- Durable jobs retain leases, heartbeats, retries, cancellation, dead-lettering, stale recovery, and restricted worker functions.
- Administrators can cancel/retry jobs through canonical actions.
- Compiled worker artifacts replace production source execution.

### Database authority

- Added least-privilege closure for scientific review, release publication, media inspection, immutable artifacts, model gates, selection transitions, and observed segregation.
- Runtime cannot directly rewrite selection lifecycle or transition history.
- Runtime can record immutable reconciliation results but cannot update/delete them.
- The destructive-gated authority verifier now covers role properties, all workspace RLS tables, worker-only functions, normalized catalog privileges, media column privileges, selection lifecycle privileges, forged workspace context, suspended membership, owner immutability, and catalog authorship.

## Validation summary

Locally passed:

- Repository validator: **634 checks, 0 source issues, 5 environment warnings**.
- TypeScript parser: **147 files, 0 diagnostics** using TypeScript 5.8.3.
- Targeted strict semantic checks for genetics, breeding, observation, storage, and simulation domains.
- Python worker: **3 tests passed**.
- Catalog reconciliation: **22 loci, 22 claims, 30 sources, 0 executable phenotype rules**.
- Runtime scientific smoke: exact single locus, independent multi-locus, zero-recombination linkage, maternal direction, direct Monte Carlo, and observed segregation passed.
- Authentication runtime smoke: scrypt-v2, valid/invalid password behavior, dummy KDF path, rehash decision, and keyed subject hash passed.
- YAML, shell, and Node operational-script syntax passed.

Unavailable and therefore not passed:

- Legitimate `pnpm-lock.yaml` and frozen install.
- Node 24 / TypeScript 5.9.2 full workspace validation.
- Full lint, format, Vitest/property, Turbo, Next.js standalone, and worker production builds.
- PostgreSQL 18 empty replay, V3-to-V4 replay, RLS/authority/concurrency/idempotency tests.
- Object-storage, ClamAV, hostile media, worker crash/restart, and large-export integration.
- Playwright, axe, keyboard, responsive, performance, and query-plan evidence.
- Docker/Compose smoke, security scans, SBOM, and backup/restore reconciliation.

## Remaining implementation blockers

The following are not hidden behind environment limitations:

- Advanced linkage, maternal, conditional-rule, host-pathogen, and Monte Carlo engines are not yet unified through one persisted API/job/UI contract.
- Research document ingestion and passage extraction job contracts remain inactive.
- Media derivative generation, metadata stripping, deterministic measurement, and Python-worker durable integration remain incomplete.
- Large breeding-ledger export still requires a fully streamed normalized artifact implementation.
- Hosted AI remains intentionally unwired pending an approved privacy/cost/provider policy and adversarial evaluation.
- Full MIAPPE conformance fixtures are not present.

## Scientific limitations

No approved executable phenotype rule or independently validated learned vision model exists. The application therefore does not claim exact SHU, universal fruit color, yield, flavor, G×E, genomic prediction, or disease outcome without complete host/pathogen/environment applicability.

## Conclusion

V4 corrects the review's central transaction, catalog, inventory, observation, selection, media, and authority defects at source level. It is a real scientific record and exact-inheritance platform candidate, but it remains blocked until runtime authority and deployment evidence are directly demonstrated and the listed implementation gaps are closed.
