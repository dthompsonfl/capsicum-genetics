# Environment and Deployment

## Supported local profile

- Linux, macOS, or Windows with WSL2.
- Docker Engine/Compose.
- Node.js 24 LTS.
- pnpm with Corepack.
- Optional local Python/R tooling for worker development; containers remain authoritative.

## Required services

```text
web
postgres:18
object-storage (MinIO-compatible locally)
worker-python
worker-r
backup
optional local mail catcher
optional observability stack
```

## Environment groups

- application URLs and environment;
- database connection and pool controls;
- auth/session secrets and trusted origins;
- object storage endpoint/bucket/credentials;
- queue controls;
- AI provider keys and selected model IDs;
- embedding provider/model;
- worker endpoints and shared authentication;
- telemetry endpoints;
- upload and job limits;
- feature flags.

Provide `.env.example` with no real secrets and a typed configuration validator that fails early with actionable messages.

## Deployment requirements

- reproducible container builds;
- non-root runtime users;
- health/readiness checks;
- migration job separated from app startup;
- persistent PostgreSQL and object-storage volumes;
- TLS at reverse proxy;
- image and dependency provenance where practical;
- deployment and rollback runbooks;
- catalog and model version rollback independent from application rollback.
