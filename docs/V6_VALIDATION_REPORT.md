# V6 Validation Report

## Environment

Evidence timestamp: `2026-07-23T19:22:56Z`.

| Tool | Result |
|---|---|
| Node | `v22.16.0` — repository requires Node 24.18.0 |
| Corepack | `0.32.0` |
| Python | `3.13.5` |
| available TypeScript parser | `5.8.3` — repository declares 5.9.2 |
| pnpm | unavailable; Corepack registry fetch failed |
| PostgreSQL/psql | unavailable |
| Docker | unavailable |
| Rscript | unavailable |

Implementation source hash excluding local evidence and V6 generated reports: `7b0c1cd425a9ba5a26140ed1d3be92f7b0bfe030ee896b40b143e6de64633ab4`.

## Commands and outcomes

| Command | Exit | Outcome | Evidence |
|---|---:|---|---|
| `node scripts/generate-migration-manifest.mjs --check` | 0 | 29 ordered migration identities/checksums verified | `docs/v6-evidence/migration-manifest.txt` |
| `node scripts/generate-routine-manifest.mjs --check` | 0 | 29 runtime and 27 worker routine grants verified | `docs/v6-evidence/routine-manifest.txt` |
| `node packages/database/scripts/migration-utils.test.mjs` | 0 | 3/3 transaction-normalization/fault tests passed | `docs/v6-evidence/migration-utils.txt` |
| `TYPESCRIPT_MODULE_PATH=... node scripts/ci/run-v6-runtime-smoke.mjs` | 0 | SigV4, immutable local storage, range, prefix LIST, upload inspection, redirect and delete checks passed | `docs/v6-evidence/runtime-smoke.txt` |
| `TYPESCRIPT_MODULE_PATH=... node scripts/ci/run-genetics-runtime-smoke.mjs` | 0 | exact, multi-locus, uncertainty, linkage, maternal, Monte Carlo, segregation and abstention fixtures passed | `docs/v6-evidence/genetics-smoke.txt` |
| `TYPESCRIPT_MODULE_PATH=... node scripts/ci/check-environment-contracts.mjs` | 0 | production/web/worker/hosted-AI environment requirements reconciled | `docs/v6-evidence/environment-contracts.txt` |
| `TYPESCRIPT_MODULE_PATH=... node scripts/ci/parse-typescript.mjs` | 0 | 170 TypeScript-family files, 0 parse diagnostics | `docs/v6-evidence/typescript-parser.txt` |
| `python3 -m pytest -q apps/worker-python/tests` | 0 | 8/8 deterministic/hostile image and health tests passed | `docs/v6-evidence/python-worker.txt` |
| `python3 scripts/import_catalog.py --check` | 0 | source catalog reconciled; no generated drift | `docs/v6-evidence/catalog-reconciliation.txt` |
| `bash infra/backup/checksum-portability.test.sh` | 0 | relocated bundle verified and tampering rejected | `docs/v6-evidence/backup-portability.txt` |
| `python3 scripts/validate_repository.py` | 0 | 778 checks, 0 source issues, 5 environment warnings | `docs/v6-evidence/repository-validator.txt` |
| YAML parsing with PyYAML | 0 | workflow/Compose YAML parsed | `docs/v6-evidence/yaml-validation.txt` |
| `bash -n` over shell scripts | 0 | shell syntax passed | `docs/v6-evidence/shell-syntax.txt` |
| `node --check` over `.mjs` scripts | 0 | Node script syntax passed | `docs/v6-evidence/node-script-syntax.txt` |
| `corepack pnpm --version` | 1 | `EAI_AGAIN registry.npmjs.org`; legitimate pnpm graph unavailable | `docs/v6-evidence/registry-install.txt` |

Monte Carlo fixture maximum absolute error: `0.0005900000000000072` under the deterministic test seed/sample fixture. This is a test observation, not a universal accuracy claim.

## Defined but unexecuted integration evidence

- `packages/database/scripts/verify-migration-atomicity.mjs` — PostgreSQL crash/fault atomicity.
- `packages/database/scripts/verify-authority.mjs` — exact roles, grants, RLS and authority matrix.
- `packages/database/scripts/verify-v6-integration.mjs` — migration identity, runtime/worker separation, pending-object RLS and cleanup dry-run/claim.
- `packages/application/src/postgres.integration.test.ts` — 20-way duplicate intent, conflicting key, rollback retry, inventory and cross-workspace denial.
- `packages/storage/src/minio.integration.test.ts` — real S3-compatible immutable/range/list/error behavior.
- `apps/worker-node/src/malware-scanner.integration.test.ts` — ClamAV clean/EICAR protocol.
- authenticated Playwright role/viewport journeys and axe checks.
- CI production builds, standalone/compiled artifact verification, security scans, SBOM, containers and isolated restore.

## Failure classification

| Failure | Classification | V6 action |
|---|---|---|
| Registry/pnpm unavailable | environment/tooling | recorded; lockfile not fabricated |
| Node 24 unavailable | environment/tooling | Node 24 pinned in CI/Docker; local proof blocked |
| PostgreSQL unavailable | environment/tooling | real suites implemented; no pass claimed |
| Docker/MinIO/ClamAV unavailable | environment/tooling | integration suites/Compose definitions implemented |
| Browser/axe unavailable | environment/tooling | CI journeys expanded; no pass claimed |
| R unavailable | environment/tooling | research-only boundary remains inactive |
| no approved phenotype rule/model | scientific/data blocker | abstention preserved |
| introduced relevant source failure | introduced by V6 | none remaining after final local rerun |
| unknown | unknown | none recorded |

## Release conclusion

Locally executable checks are green. Production release remains **blocked** because the high-risk infrastructure and browser gates are unexecuted and a legitimate frozen dependency graph does not exist.
