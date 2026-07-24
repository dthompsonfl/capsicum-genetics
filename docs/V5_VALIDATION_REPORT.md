# V5 Validation Report

## Environment

See `docs/v5-evidence/environment.txt`.

- Node 22.16.0 is available; Node 24 is required.
- Python and pytest are available.
- pnpm, PostgreSQL, Docker, and R are unavailable.
- Corepack could not download pnpm 10.14.0 from the npm registry.

## Executed checks

| Check | Outcome | Evidence |
|---|---|---|
| `TYPESCRIPT_MODULE_PATH=... node scripts/ci/parse-typescript.mjs` | **passed** — 155 files; 0 parse diagnostics | `docs/v5-evidence/typescript-parser.json` |
| `python3 scripts/validate_repository.py` | **passed source release blocked** — 699 checks; 0 source issues; 5 environment warnings | `docs/v5-evidence/repository-validator.json` |
| `python3 -m pytest apps/worker-python/tests -q` | **passed** — 8 tests passed, including hash mismatch, path escape, multiframe, and EXIF orientation fixtures | `docs/v5-evidence/python-worker-tests.txt` |
| `python3 scripts/import_catalog.py --check` | **passed draft only** — 22 loci, 22 evidence claims, 30 sources, 0 executable rules; all remain pending independent review | `docs/catalog-reconciliation.json` |
| `temporary isolated TypeScript build plus node genetics smoke` | **passed** — exact/independent/uncertainty/linkage/maternal/Monte Carlo/segregation/abstention passed; MC max absolute error 0.0003499999999999892 | `docs/v5-evidence/genetics-runtime-smoke.json` |
| `node --experimental-strip-types isolated auth smoke` | **passed with experimental host loader** — scrypt-v2; keyed digest and opaque token hashing passed | `docs/v5-evidence/auth-runtime-smoke.json` |
| `node --check scripts/*.mjs scripts/ci/*.mjs packages/database/scripts/*.mjs` | **passed** — Operational JavaScript syntax passed | `docs/v5-evidence/node-script-syntax.txt` |
| `find infra -name '*.sh' -print0 | xargs -0 -n1 bash -n` | **passed** — Backup and operational shell syntax passed | `docs/v5-evidence/shell-syntax.txt` |
| `python yaml.safe_load over GitHub and infra YAML` | **passed** — 4 YAML files parsed | `docs/v5-evidence/yaml-validation.txt` |
| `corepack prepare pnpm@10.14.0 --activate && pnpm install --lockfile-only` | **blocked environment** — Corepack registry download failed; pnpm unavailable; no lockfile fabricated | `docs/v5-evidence/frozen-install-attempt.txt` |

## Unavailable validation

- **node24-full-workspace** — Only Node 22.16.0 is installed; dependency graph is unavailable. Classification: `environment_or_tooling`.
- **postgres18-runtime** — psql/PostgreSQL unavailable. Classification: `environment_or_tooling`.
- **docker-compose** — Docker unavailable. Classification: `environment_or_tooling`.
- **browser-e2e-a11y** — Installed dependency/browser runtime unavailable; full journey coverage incomplete. Classification: `environment_or_tooling_and_coverage`.
- **backup-restore** — PostgreSQL, Docker, and object storage unavailable. Classification: `environment_or_tooling`.
- **security-scans-sbom** — No frozen dependency/container graph. Classification: `environment_or_tooling`.
- **r-worker** — Rscript unavailable. Classification: `environment_or_tooling`.

## Failure classification

- **Introduced source failures remaining:** none found by locally executable checks.
- **Environment/tooling:** registry, Node 24, pnpm, PostgreSQL, Docker, browser dependencies, and R.
- **External integration:** production delivery, hosted AI credentials/policy, and production infrastructure.
- **Scientific/data:** zero approved phenotype rules and zero validated learned models.
- **Unknown/unclassified:** none.

## Release judgment

`releaseVerdict=blocked`. Source-level validation is green, but production authority and deployment proof are incomplete.
