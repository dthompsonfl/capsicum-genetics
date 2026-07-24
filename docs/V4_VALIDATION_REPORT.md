# V4 Validation Report

## Environment

See `docs/v4-evidence/environment.txt`.

- Node 22.16.0 available; Node 24 required.
- npm 10.9.2, Python 3.13.5, pytest 9.0.2.
- pnpm, PostgreSQL, Docker, and R unavailable.
- Corepack download of pnpm 10.14.0 failed at the npm registry.

## Passed checks

| Command/check | Outcome | Evidence |
|---|---|---|
| `python3 scripts/validate_repository.py` | 634 checks, 0 source issues, 5 environment warnings | `docs/v4-evidence/repository-validator.json` |
| TypeScript parser over `apps`, `packages`, `scripts` | 147 files, 0 diagnostics, TS 5.8.3 | `docs/v4-evidence/typescript-parser.json` |
| Targeted strict semantic configs | Passed | `docs/v4-evidence/semantic-typecheck.txt` |
| `python3 -m pytest -q apps/worker-python/tests` | 3 passed | `docs/v4-evidence/python-worker-tests.txt` |
| `python3 scripts/import_catalog.py --check` | Passed | `docs/v4-evidence/catalog-reconciliation.txt` |
| Isolated genetics runtime smoke | Exact, multi-locus, linkage, maternal, Monte Carlo, segregation passed | `docs/v4-evidence/genetics-runtime-smoke.json` |
| Isolated authentication runtime smoke | scrypt-v2 and keyed abuse identifiers passed | `docs/v4-evidence/auth-runtime-smoke.json` |
| YAML parsing | 4 files passed | `docs/v4-evidence/yaml-validation.json` |
| Shell syntax | Passed | `docs/v4-evidence/shell-syntax.txt` |
| Node operational script syntax | Passed | `docs/v4-evidence/node-script-syntax.txt` |

## Unavailable validation

The following are **not passes**:

- `pnpm install --frozen-lockfile`, Prettier, ESLint, full TypeScript 5.9.2, Vitest/property tests, Turbo/Next/worker builds.
- PostgreSQL empty replay, V3 upgrade replay, RLS/trigger/function/role matrix, concurrency, idempotency, deadlock, and query-plan tests.
- Object storage, ClamAV, hostile media, durable worker crash/restart, export persistence, and orphan cleanup.
- Playwright, axe, keyboard, phone/tablet/desktop, performance, and nontechnical-user journeys.
- Docker/Compose, scans, SBOM, backup, and isolated restore.
- R health/protocol execution.

## Failure classification

- **Environment/tooling:** registry unavailable; Node 24, pnpm, PostgreSQL, Docker, browser dependencies, and R unavailable.
- **External integration:** production mail/delivery, hosted AI, and production scanner credentials not supplied.
- **Scientific/data:** no approved executable phenotype rules or validated learned model.
- **Introduced source failures remaining:** none found by locally executable checks.
- **Unknown/unclassified:** none.

Two validation-harness invocation errors occurred during the sweep: an unsupported catalog-script flag and initially incorrect smoke-fixture argument shapes. Both were corrected; canonical reruns passed. They were not repository defects.

## Release judgment

`releaseReady=false`. Machine-readable results are in `docs/v4-validation-results.json`, authority status in `docs/v4-authority-matrix-results.json`, and migration replay status in `docs/v4-migration-replay-results.json`.
