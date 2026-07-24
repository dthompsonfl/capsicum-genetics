# V3 Validation Report

## Verdict

**BLOCKED for production release.** Source-level and dependency-free scientific checks passed, but the required frozen dependency graph, PostgreSQL authority execution, browser journeys, container deployment, security scans, and restore proof were unavailable. No unavailable gate is represented as passed.

## Environment

| Tool | Observed |
|---|---|
| Node.js 24 runtime | `v24.11.1` |
| Default host Node.js | `v22.16.0` |
| Required package manager | `pnpm 10.14.0` |
| pnpm state | Unavailable; Corepack failed with DNS `EAI_AGAIN registry.npmjs.org` |
| Python | `3.13.5` |
| pytest | `9.0.2` |
| PostgreSQL / psql | Unavailable |
| Docker | Unavailable |
| Rscript | Unavailable |
| Source parser used locally | TypeScript `5.8.3`; the repository-pinned `5.9.2` requires the blocked install |

## Executed commands and results

| Command | Exit | Result | Evidence |
|---|---:|---|---|
| `node24 scripts/ci/parse-typescript.mjs` | 0 | 143 TS/TSX/MTS/CTS files, zero parse diagnostics | `docs/validation-evidence/v3/typescript-parse.json` |
| `python3 -m pytest apps/worker-python/tests -q` | 0 | 3 passed | `docs/validation-evidence/v3/python-tests.txt` |
| `python3 scripts/import_catalog.py --check` | 0 | 22 loci, 22 claims, 30 sources, zero active executable rules | `docs/catalog-reconciliation.json` |
| `CAPSICUM_NODE_BINARY=<node24> python3 scripts/validate_repository.py` | 0 | 527 checks, zero source issues, 4 environment warnings; `releaseReady=false` | `docs/validation-evidence/v3/repository-validator.json` |
| YAML parse of workflows and Compose | 0 | Passed | `docs/validation-evidence/v3/yaml-validation.txt` |
| `bash -n infra/backup/*.sh` | 0 | Passed | `docs/validation-evidence/v3/shell-syntax.txt` |
| `node24 --check` for database and CI scripts | 0 | Passed | `docs/validation-evidence/v3/node-script-syntax.txt` |
| Genetics core temporary build | 0 | Passed with available TypeScript 5.8.3 | `docs/validation-evidence/v3/genetics-core-build.txt` |
| Genetics advanced temporary build | 0 | Passed with available TypeScript 5.8.3 | `docs/validation-evidence/v3/genetics-advanced-build.txt` |
| Exact/linkage/maternal/Monte Carlo/segregation runtime smoke | 0 | Passed; MC maximum absolute error `0.0014000000000000123` | `docs/validation-evidence/v3/genetics-runtime-smoke.json` |
| Credential-delivery local/test runtime smoke | 0 | One deterministic notice, mode `0600`, token absent from filename, production local adapter rejected | `docs/validation-evidence/v3/credential-delivery-smoke.json` |
| Authentication/credential runtime smoke | 0 | Permissions, independent review, scrypt-v2 verification, opaque-token hash passed | `docs/validation-evidence/v3/auth-runtime-smoke.json` |
| `corepack pnpm --version` | 1 | Environment failure: registry DNS `EAI_AGAIN`; no lockfile synthesized | `docs/validation-evidence/v3/registry-install-blocker.txt` |

## Honest scope of the passing evidence

The TypeScript parser proves syntax only. The temporary genetics build proves the dependency-free scientific packages under the available TypeScript 5.8.3 compiler, not the complete workspace under pinned TypeScript 5.9.2. The repository validator proves structural and source assertions, not PostgreSQL behavior or browser usability.

## Unexecuted blocking gates

The following remain **environment/tooling blockers**: legitimate `pnpm-lock.yaml`; clean `pnpm install --frozen-lockfile`; Prettier; ESLint; complete strict type checking; full Vitest/property suite; Turbo, Next.js standalone, and worker production builds; PostgreSQL 18 empty/V2 migration replay; RLS/trigger/role/concurrency proof; object-storage and hostile-media integration; Playwright/axe/responsive/manual keyboard evidence; Docker/Compose; backup/isolated restore; dependency/license/secret/SAST/container scans; SBOM; and R worker health.

The following remain **scientific/data blockers**: no independently approved executable phenotype rules and no promoted learned model artifact with dataset, held-out evaluation, calibration, applicability, drift, and rollback evidence.

## Failure classification

- `corepack pnpm --version`: **environment or tooling**; DNS resolution failure.
- Missing PostgreSQL, Docker, R, browsers, and scanner: **environment or tooling**.
- Missing production email/hosted AI/model artifacts: **external integration or scientific/data blocker**.
- No locally executed command failed because of an introduced source defect after the final correction pass.

## Rerun outcome

The locally possible ladder was rerun after the final credential-delivery privacy correction. All locally executable source, Python, catalog, YAML, shell, Node-script, and scientific runtime checks passed. Production release remains blocked because the high-risk runtime proofs were not available.
