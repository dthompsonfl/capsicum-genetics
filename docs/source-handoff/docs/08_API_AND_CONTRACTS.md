# API and Contract Strategy

## Internal approach

Use typed application services for server-side Next.js workflows and versioned HTTP/job contracts at runtime boundaries. Do not expose database tables directly as APIs.

## Core resource families

- identity/workspaces;
- germplasm and seed lots;
- plants and material events;
- crosses, pollination, harvests, progeny, and pedigrees;
- genotypes and assays;
- catalog loci, alleles, claims, sources, reviews, and releases;
- studies, observation variables, sessions, and observations;
- images, annotations, and measurements;
- simulation models, runs, results, and selection plans;
- research documents and AI runs;
- jobs, models, audit, exports, and backups.

## API rules

- Validate every input at the boundary.
- Authorize every operation against workspace and action.
- Use idempotency keys for create/mutate operations vulnerable to retries or repeated clicks.
- Use optimistic concurrency or version checks for user-edited records.
- Return stable error codes with operator-safe messages.
- Use cursor pagination.
- Do not expose worker internal paths, secrets, model credentials, or raw stack traces.
- Generate OpenAPI for public/versioned HTTP APIs.

## Interoperability

Implement selected BrAPI 2.1 endpoints only after internal domain contracts stabilize. Prioritize germplasm, seed lots, crosses, pedigree, studies, observation variables, observations, images, samples, and variants. Provide MIAPPE 1.2 and MCPD-compatible exports.

## Job contract

All worker requests and results use JSON Schema under `contracts/`, include schema versions, and are validated by both producer and consumer. Large files use signed object-store references and content hashes rather than inline base64.
