# System Architecture

## Architectural style

Use a modular monorepo with a Next.js web control plane, shared TypeScript domain packages, PostgreSQL, S3-compatible object storage, and isolated Python/R scientific workers. Do not create a distributed microservice estate.

## Runtime topology

```text
Browser
  -> Next.js web application
       -> application/domain services
       -> exact TypeScript simulation engine
       -> PostgreSQL
       -> object storage
       -> PostgreSQL-backed job queue
            -> Python vision/statistics worker
            -> R breeding/statistics worker
       -> provider-agnostic AI gateway
```

## Recommended repository topology

```text
apps/
  web/                         Next.js App Router application
  worker-python/               FastAPI or worker process for vision/statistics
  worker-r/                    Plumber/CLI worker for AlphaSimR and R models
packages/
  auth/                        identity, workspace, roles, policies
  database/                    schema, migrations, repositories, transactions
  contracts/                   schemas, event/job contracts, generated types
  genetics-core/               pure exact inheritance engine
  genetics-advanced/           linkage, cytoplasmic, epistasis, uncertainty
  scientific-catalog/          evidence, rules, releases, eligibility
  breeding-domain/             germplasm, material identity, crosses, pedigree
  observation-domain/          studies, variables, observations, environment
  simulation-domain/           runs, snapshots, artifacts, model registry
  ai/                          bounded agents, retrieval, tools, evals
  vision/                      capture, image metadata, annotations, measurements
  jobs/                        queue contracts, retries, idempotency
  storage/                     object store abstraction and integrity
  observability/               logs, metrics, traces, audit events
  ui/                          design system and accessible components
  config/                      typed runtime configuration
  test-utils/                  fixtures, factories, reference crosses
infra/
  docker/
  compose/
  backup/
  observability/
docs/
```

## Dependency direction

- Domain packages must not import web UI.
- `genetics-core` must remain pure and deterministic with no database, network, AI, or React dependency.
- Catalog rules may call genetics primitives through compiled rule definitions; the engine must not query papers or LLMs.
- AI may call catalog and simulation APIs; catalog and simulation packages must not depend on AI.
- Workers consume versioned job contracts and return immutable artifacts.
- The web app owns authorization and orchestration; workers must not make access-control decisions from user-supplied fields.

## Technology baseline

At the date of this pack:

- Node.js 24 LTS for production.
- Next.js 16.2, using the latest compatible patch.
- AI SDK 6, using schema-validated tools and bounded loops.
- PostgreSQL 18, using the current supported minor release.
- MIAPPE 1.2 with compatibility mappings for 1.1.
- BrAPI 2.1 only for selected interoperability endpoints.

The agent must confirm compatible current patches before locking dependencies and record the final versions.

## Database approach

Use PostgreSQL-native constraints, transactions, JSONB only for genuinely flexible payloads, and SQL migrations as the source of truth. An ORM/query builder may be used, but it must not prevent partial indexes, exclusion constraints, recursive pedigree checks, vector search, or explicit locking.

## Job model

Use a PostgreSQL-backed queue initially. Every job must include:

- immutable input payload or content hash;
- workspace and actor context derived by the application;
- job type and schema version;
- worker and model version;
- idempotency key;
- retry policy;
- status and structured error;
- logs and artifact references;
- cancellation and timeout semantics.

## Deployment

Local and single-server operation uses Docker Compose. The design remains compatible with managed PostgreSQL and S3 storage, but Kubernetes is explicitly out of scope until load evidence justifies it.
