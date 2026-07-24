# V3 Verified Pre-Edit Baseline

This report was generated before broad implementation edits. It distinguishes source facts from runtime proof.

## Repository and review integrity

- Extracted repository files: **294**.
- Extracted repository directories below root: **135**.
- Supplied audit rows: **294**.
- Audit paths missing from repository: **0**.
- Repository paths absent from supplied audit: **0**.
- Workspace manifests: **20** package.json files.
- Routes discovered: **48 pages**, **7 APIs**, plus layouts and route-state files.
- Forward migrations present: **6**, numbered 0001 through 0006.

## Runtime availability and pre-existing failures

| Capability | Verified pre-edit state |
|---|---|
| Node | v22.16.0; repository requires Node 24 |
| pnpm | unavailable |
| Registry/DNS | unavailable from the execution container |
| Lockfile | absent |
| PostgreSQL client/server | unavailable |
| Docker | unavailable |
| R | unavailable |
| Python | 3.13.5 |

Therefore a real frozen registry install, PostgreSQL 18 replay, Docker/Compose smoke, browser execution, object-storage integration, R execution, and restore drill were not pre-proven. These are blockers until executed or honestly retained as environment blockers.

## Confirmed authoritative defects

- No pnpm-lock.yaml exists while CI and Docker require frozen installs.
- Next transpilePackages omits source-exporting runtime packages imported by the web app.
- Server actions mint random idempotency keys inside each invocation.
- Cross operational state conflates fruit_set with verified paternal identity.
- Generic cross events can set harvested without creating harvest artifacts.
- Cross-derived seed lots inherit the maternal accession identifier.
- Plant creation does not consume or reserve seed inventory.
- Genotype alleles are free-form strings and are not release-member validated.
- Observation recording permits unapproved definitions and correction from stale predecessors.
- Upload route buffers multipart data before applying the application byte limit.
- Machine-observable phenotype capture fields are operator supplied.
- Worker handles only a narrow subset of declared durable jobs and lacks chunk heartbeats.

## Authority and architecture facts

- PostgreSQL is the intended authority boundary; application services issue parameterized SQL inside workspace transactions.
- RLS is membership-bound by migration 0006, but the supplied verifier covers only a subset and no live PostgreSQL proof was available.
- Migrations 0001–0006 are immutable baseline history and will not be rewritten.
- Exact genetics is implemented as pure TypeScript rational arithmetic; advanced linkage, maternal, rule-graph, host–pathogen, and Monte Carlo primitives exist but are incompletely integrated.
- Generated catalog JSON is produced from preserved source handoff data; generated scientific files must remain generator-controlled.
- Current scientific catalog reconciliation reports 22 loci, 22 claims, 30 sources, and zero active executable phenotype rules. Zero remains a valid governed state.

## Direct write and boundary inspection

- Files containing SQL mutation statements: **14**. Authoritative mutations are concentrated in application services and database scripts; web actions call services but currently generate unstable request IDs.
- Database connection/configuration references: **14 files**.
- Job/outbox-related sources: **113 files**.
- Upload/media-related sources: **6 files**.
- AI/retrieval/citation-related sources: **9 files**.
- Test sources: **18**; sources containing mock/stub/sentinel markers: **1**. Unit/static evidence does not substitute for PostgreSQL, worker, storage, or browser proof.

## Execution order

1. Reproducible package/build boundary and baseline evidence
2. Forward migration for biological identity, cross verification, inventory, genotype, observation, idempotency and worker authority
3. Canonical application services and stable public error/idempotency contracts
4. Simulation authority and advanced engine integration
5. Media/research/job hardening
6. Web workflows and accessibility primitives
7. Integration/authority/E2E harnesses and operations evidence
8. File-by-file reconciliation, manifests and archives

## Initial release judgment

**Blocked.** The V2 archive is an engineering candidate, not a production-proven application. The V3 sweep will correct locally actionable defects and retain only genuine external/runtime/scientific blockers.
