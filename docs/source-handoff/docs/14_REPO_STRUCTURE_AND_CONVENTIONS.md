# Repository Structure and Conventions

## Monorepo

Use pnpm workspaces and Turborepo or an equivalent task graph. Keep app deployables and domain packages explicit.

## TypeScript rules

- strict mode;
- no `any` at domain boundaries;
- branded identifiers or validated ID types;
- discriminated unions for scientific states;
- exhaustive switches;
- no floating-point probability authority in the exact engine;
- schema validation for untrusted data;
- domain errors mapped to stable user-facing error codes.

## Database rules

- repositories/services own transactions;
- no direct database access from UI components;
- no generic unscoped CRUD for workspace data;
- migrations are reviewed artifacts;
- generated clients/types are regenerated from source contracts;
- query performance is tested for pedigree, catalog search, and observation pages.

## UI rules

- server components by default;
- client components only for interactive state;
- URL-addressable filters and views;
- accessible shared form primitives;
- consistent status badges and authority labels;
- prevent duplicate submissions at both UI and server layers;
- optimistic UI only when rollback is safe and clear.

## Testing rules

- test behavior, invariants, and contracts;
- no snapshot-only scientific tests;
- fixtures state their scientific source or synthetic purpose;
- flaky tests are defects;
- tests must run in CI without private provider credentials.
