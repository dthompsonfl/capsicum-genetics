# Next-sweep final report

**Date:** 2026-07-22  
**Verdict:** substantial integrated implementation completed; production release is still blocked pending runtime proof.

## Executive result

This sweep converted the prior scientific starter into a persistence-backed application architecture. The most important change is not the number of pages: authoritative operations now pass through authenticated application services, workspace transactions, database authority controls, immutable provenance, and explicit scientific abstention.

The delivered source contains:

- 48 page routes and 7 API boundaries;
- 17 reusable `@capsicum/*` packages, a Next.js web application, and a persistent Node worker;
- 6 forward-only PostgreSQL migrations and 57 authoritative tables;
- secure first-owner bootstrap, password/session storage, invitations, membership state changes, session revocation, and route protection;
- core breeder workflows from accession through seed lot, plant, cross, harvest, family, pedigree, observation, and selection;
- exact and weighted simulations persisted with input evidence, release provenance, model version, content hash, and idempotency;
- governed catalog review and publication with separation of duties and hash-bound release membership;
- evidence-bounded research answers that cite only approved in-scope evidence and abstain otherwise;
- immutable uploads, capture protocols, quality gates, correction-only annotations, and model-promotion gates;
- durable jobs, attempts, logs, cancellation, leases, retry/backoff, dead-letter handling, stale recovery, and transactional outbox claiming;
- restricted migration, runtime, and worker database roles plus membership-bound row-level security;
- sanitized readiness, structured secret redaction, export, backup, and isolated restore tooling.

## Material corrections made during the sweep

1. **Selfing and open pollination are valid biological events.** The cross model now distinguishes controlled outcrossing, self-pollination, and open pollination with an unknown paternal plant instead of requiring two different known parents.
2. **Workspace context alone is not authorization.** Database policies now require both the selected workspace and an active membership for the transaction actor. A forged workspace GUC no longer grants access.
3. **Approved is not a writable label.** Catalog publication requires version hashes, supporting evidence, distinct authors/reviewers, approved review state, and database-enforced role authority.
4. **Unknown genotype is not silently converted to certainty.** The browser and engine support explicit weighted hypotheses, and persisted simulations retain their evidence basis.
5. **Monte Carlo is not an excuse to expand exact state first.** The fallback samples parent hypotheses, gametes, and offspring directly with a versioned deterministic seed.
6. **Readiness must never leak configuration secrets.** Readiness responses contain sanitized flags and live probe outcomes only.
7. **A job state machine without durable claiming is not a worker system.** PostgreSQL now owns claiming, leases, retry/dead-letter transitions, and outbox publication authority.

## Implemented product domains

| Domain | Implemented source behavior | Authority notes |
|---|---|---|
| Identity and access | One-time owner bootstrap, sign-in, opaque hashed sessions, invitations, role/state administration, revocation | Password recovery, 2FA, and email delivery remain future hardening |
| Germplasm and inventory | Accession, seed lot, inventory events, material locations, labels, plant creation | Inventory is event-based; physical QR printing/scanning is not complete |
| Cross lifecycle | Controlled, self, and open crosses; cross events; fruit/harvest; derived seed lots and families | Maternal direction is preserved; open pollination never invents a father |
| Genotype evidence | Versioned calls with allele pair, evidence state, assay identifiers, notes, supersession | A call is evidence, not proof beyond its assay quality/applicability |
| Simulations | Exact rational distributions, weighted hypotheses, release/user-declared modes, immutable persistence, target recovery | Phenotype execution requires approved rules; user assumptions are visibly lower authority |
| Experiments/observations | Experiment/session definitions, typed values, append-only corrections, actor/material context | Live browser E2E and concurrent correction tests remain required |
| Catalog | Import staging, review transitions, independent reviewer checks, release publication and immutable hashes | Seed catalog remains pending independent scientific review |
| Media/phenotype capture | Content-addressed uploads, signature/dimension checks, approved protocol binding, deterministic quality gate, append-only annotations | Malware scanning and validated learned models are absent |
| AI/research | Approved-evidence retrieval, citations, interaction/tool audit, abstention | Hosted generation is optional and cannot become scientific authority |
| Operations | Jobs/outbox worker, audit, readiness, export, backup/restore scripts | Runtime/container/restore proof is blocked by the host environment |

## Validation outcome

Executed validation passed:

- strict package TypeScript check;
- strict web plus worker TypeScript check using controlled local declarations;
- database JavaScript syntax checks;
- backup/restore shell syntax checks;
- Python parity suite: 3 passed;
- catalog reconciliation: 22 loci, 22 claims, 30 sources, 0 activated rules;
- repository validator: 381 checks, 0 structural issues, 5 environment warnings;
- rebuilt runtime smoke: 3 single-locus outcomes, 9 independent two-locus outcomes, 2 weighted-uncertainty outcomes, 2 zero-recombination haplotypes, 3 sampled Monte Carlo states, and a successful queued-to-running job transition.

The validation host could not provide a frozen dependency install, Node 24, PostgreSQL, Docker, R, or a browser. Therefore no claim is made that migrations, RLS, containers, Next production build, accessibility, or restore behavior have executed successfully.

## Technical debt intentionally retained

| Item | Risk | Required owner/action |
|---|---|---|
| No `pnpm-lock.yaml` | Build is not reproducible | Platform owner: create through a real Node 24 registry install and commit |
| Worker consumes workspace TypeScript source under Node type stripping | Container behavior depends on Node 24 source execution | Platform owner: either prove this deployment pattern or publish compiled package outputs before release |
| Export is bounded synchronous generation | Large programs may exceed practical request limits | Application owner: enqueue large exports and stream from object storage |
| No malware scanner/metadata stripping/thumbnail pipeline | Uploaded files have signature controls but incomplete hostile-content treatment | Security/media owner: add quarantine scanning and derivative generation |
| No password recovery, 2FA, external identity, or invitation email delivery | Account lifecycle is not enterprise-complete | Identity owner: implement and threat-test the chosen production identity model |
| No QR print/scan workflow | Labels exist in authority data but physical operator flow is incomplete | Product owner: implement tested print/scan templates and collision handling |
| No approved scientific rules/models/protocol seed set | Many advanced outputs correctly remain unavailable | Scientific governance owner: independently review evidence and approve scoped artifacts |
| Dynamic membership-bound RLS migration not executed | Static inspection cannot prove PostgreSQL semantics | Database owner: run clean PG18 migration and attack/concurrency suite |

## Release verdict

The application is a credible engineering candidate and a materially more complete scientific platform than the baseline. It is **not production-ready** until every critical blocker in `RELEASE_BLOCKERS.md` has objective evidence. Any release that skips PostgreSQL authority tests or scientific approval would convert carefully designed constraints into unproven assumptions.
