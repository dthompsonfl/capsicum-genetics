# Expected Repository Tree

```text
capsicum-breeding-intelligence/
  AGENTS.md
  README.md
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .env.example
  .gitignore
  .github/workflows/ci.yml
  apps/
    web/
    worker-python/
    worker-r/
  packages/
    auth/
    database/
    contracts/
    config/
    genetics-core/
    genetics-advanced/
    scientific-catalog/
    breeding-domain/
    observation-domain/
    simulation-domain/
    ai/
    vision/
    jobs/
    storage/
    observability/
    ui/
    test-utils/
  infra/
    compose/
    docker/
    backup/
    observability/
  docs/
  scripts/
```

The coding agent may refine names but must preserve domain boundaries and dependency direction.
