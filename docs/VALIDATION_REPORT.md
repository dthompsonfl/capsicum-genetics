# V7 validation report

**Date:** 2026-07-23
**Release-ready:** no
**Source verdict:** materially improved and internally consistent; runtime certification remains blocked

## Executed results

| Validation | Observed result |
|---|---|
| TypeScript/TSX parser validation | Passed: 183 files parsed, 0 syntax failures |
| Environment contract validator | Passed; production, hosted-cost, and worker keys are declared consistently |
| Migration manifest | Passed: 30 ordered migration entries verified |
| Routine grant manifest | Passed: 29 runtime routines and 27 worker routines verified |
| Authentication runtime smoke | Passed: 7 checks covering installation proof, RFC TOTP, replay rejection, encrypted secrets, recovery codes, privileged roles, and password hashing |
| Genetics runtime smoke | Passed: 8 checks covering exact single/multi-locus inheritance, parent uncertainty, linkage, maternal direction, Monte Carlo, observed segregation, and host-pathogen abstention |
| Genetics Monte Carlo tolerance | Maximum absolute error observed: `0.0005900000000000072` |
| Storage/runtime smoke | Passed: 11 checks covering request signing, range behavior, immutable local storage, streamed writes, bounded listing, upload inspection, safe redirects, and deletion |
| Catalog reconciliation | Passed |
| Python parity worker | Passed: 8 tests |
| Migration utility tests | Passed: 3 tests |
| Backup checksum portability | Passed: relocated bundle verification and tamper rejection |
| Repository structural validator | Passed: 810 checks, 0 issues, 5 environment warnings; `releaseReady=false` |
| JavaScript/ES module syntax | Passed for repository `.js`, `.cjs`, and `.mjs` files |
| Shell syntax | Passed for repository shell scripts |
| Git whitespace/conflict check | Passed |
| Lockfile preflight | Expected hard failure: `pnpm-lock.yaml` is absent |

## Repository validator scope

The structural validator checks, among other controls:

- unique packages, declared workspace dependencies, and an acyclic workspace graph;
- absence of emitted JavaScript beside TypeScript source;
- all 30 migrations, checksums, ordering, transaction boundaries, and generated manifests;
- database authority, immutability, RLS, worker, and routine-grant markers;
- catalog counts, evidence references, hashes, and activation boundaries;
- 57 page routes and 14 API boundaries;
- installation proof, MFA assurance, session security, credential delivery, origin enforcement, readiness sanitization, storage, worker, Compose, backup, and browser-security controls;
- evidence-citation support requirements and scientific abstention boundaries;
- unresolved placeholders and known unsafe source patterns.

This validator is strong static evidence. It is not a substitute for compilation, database execution, browser journeys, integration tests, or release drills.

## Expected lockfile failure

The release preflight correctly fails with:

```text
pnpm-lock.yaml is missing. Dependency installation, CI, SBOM generation,
and container builds are not reproducible.
```

A lockfile was not fabricated. It must be generated from a trusted, registry-enabled Node 24 environment, reviewed, frozen-installed, and committed.

## Environment warnings

| Warning | Host condition | Release effect |
|---|---|---|
| `frozen-lockfile` | No legitimate `pnpm-lock.yaml` is present | Blocks reproducible install, dependency audit, build, and SBOM proof |
| `runtime-node-24` | Validation host uses Node `v22.16.0`; repository requires Node 24+ | Blocks supported production compilation/build proof |
| `postgres-runtime-validation` | PostgreSQL/`psql` unavailable | Blocks migration, RLS, trigger, role, isolation, and concurrency proof |
| `docker-runtime-validation` | Docker CLI unavailable | Blocks integrated web/worker/object-storage/scanner proof |
| `r-runtime-validation` | `Rscript` unavailable | Blocks optional R research-worker proof |

## Not executed

- registry-backed dependency resolution and clean frozen reinstall;
- repository Prettier, ESLint, full TypeScript semantic typecheck, Vitest, and Turbo build graph;
- Next.js production build, standalone start, and runtime-artifact verification;
- PostgreSQL 18 migrations, role provisioning, RLS, triggers, advisory-lock behavior, and concurrent bootstrap/session tests;
- Playwright browser journeys, axe checks, screen-reader review, responsive devices, and keyboard-only operation;
- Docker Compose, MinIO/S3, ClamAV, Resend, and persistent-worker integration;
- complete backup creation, isolated restore, authority reconciliation, and disaster-recovery timing;
- dependency, license, secret, SAST, container, and SBOM scans;
- R worker execution;
- moderated usability testing with novice growers and breeders;
- biological validation of catalog premises against the exact germplasm and environment in which the system will be used.

## Required clean-host validation ladder

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --lockfile-only
# Review and commit pnpm-lock.yaml, then repeat from a clean checkout:
pnpm install --frozen-lockfile
pnpm validate:lockfile
pnpm validate:manifests
pnpm validate:environment
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:catalog
pnpm validate:smoke
pnpm test:python
pnpm validate:repository
pnpm db:migrate
pnpm db:provision-roles
pnpm db:seed-catalog
ALLOW_AUTHORITY_TEST=YES AUTHORITY_TEST_DATABASE_URL='postgresql://.../capsicum_authority_test' pnpm db:verify-authority
pnpm --filter @capsicum/web exec playwright test
pnpm validate:runtime-artifacts
docker compose --env-file .env.local -f infra/compose/docker-compose.yml --profile application up --build
```

After the command ladder, complete adversarial authentication tests, production-delivery tests, object-storage/scanner failure injection, worker lease/crash recovery, load/concurrency tests, backup/restore drills, and authoritative count/hash reconciliation.

## Release decision

Production release remains blocked until every item in `docs/V7_RELEASE_BLOCKERS.md` is closed with evidence tied to the final commit and deployment artifact.
