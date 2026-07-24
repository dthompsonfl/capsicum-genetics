# V8 typecheck, lint, and scientific hardening report

**Date:** 2026-07-24  
**Disposition:** source-quality pass complete; production and laboratory release remain blocked pending environment-bound evidence.

## Executive verdict

The V8 pass corrected every reproducible source-level TypeScript defect found by strict compilation, repaired the lint configuration so the official Next.js Core Web Vitals rules are included, removed the Next.js warnings identified by static review, strengthened scientific-export provenance, and expanded the root validation surface.

The repository is now a stronger **laboratory validation candidate**. It is not yet a validated laboratory information system, a regulatory system, or a production-certified research platform. Those statuses require an immutable dependency graph, the declared Node 24 toolchain, PostgreSQL execution, browser/accessibility evidence, external-service integration, restore proof, controlled SOPs, and biological-method validation.

## Scope completed

- Reviewed all 17 shared packages, the persistent Node worker, and the complete Next.js web source.
- Strictly typechecked all 36 checked-in TypeScript configurations with unused-local and unused-parameter diagnostics enabled.
- Parsed 184 production/test TypeScript and TSX source files with zero syntax failures.
- Enabled `eslint-config-next/core-web-vitals` in the flat ESLint configuration.
- Preserved typed lint rules for explicit `any`, floating promises, switch exhaustiveness, and type-only imports.
- Corrected repository package-boundary drift found by the validator.
- Added immutable software-revision provenance to scientific exports.
- Added forward migration `0031_v8_scientific_export_provenance.sql` and regenerated migration/routine manifests.
- Added discoverable root commands for PostgreSQL, browser, accessibility, storage, and Compose smoke validation.
- Added bounded liveness/readiness and laboratory-export provenance smoke runners and wired them into the validation surface.

## Corrected defects

### Type-system and contract defects

1. Generalized migration comparison types so test and future migration identifiers are not narrowed to the current generated literal set.
2. Added complete missing/unexpected/checksum/order migration-drift tests.
3. Corrected reference-assembly catalog routing.
4. Corrected advanced-simulation result persistence typing.
5. Corrected export pagination inference.
6. Removed `exactOptionalPropertyTypes` violations across server-action boundaries.
7. Added runtime validation for optional JSON and enum-backed form values rather than relying on assertions.
8. Corrected observation/catalog transition inputs and geometry guards.
9. Added the required research-ingestion schema version.
10. Corrected the simulation service contract so it accepts unknown boundary input and validates internally.
11. Declared the Node worker's actual `@capsicum/contracts` runtime dependency.
12. Corrected PostgreSQL integration-test environment narrowing.

### Next.js and React quality defects

1. Enabled the official Next.js Core Web Vitals lint rules.
2. Replaced raw authenticated `<img>` use with `next/image` while preserving direct authorized media delivery through `unoptimized`.
3. Added explicit dimensions and responsive image sizing to prevent layout instability.
4. Replaced internal raw anchor navigation with `next/link`.
5. Removed effect-driven request-identity churn from all simulation forms.
6. Moved request identity to event-time, fingerprint-bound refs so retries remain idempotent and successful submissions rotate identity.
7. Reworked advanced-simulation mode/release/rule transitions into explicit handlers instead of effect-based state repair.
8. Added a CSS side-effect declaration compatible with strict `noUncheckedSideEffectImports` compilation.

### Scientific reproducibility defects

1. Upgraded breeding-ledger schema identity from `3.0` to `3.1`.
2. Added request, repeatable-read snapshot, manifest-generation, workspace, export-job, and immutable software-release provenance.
3. Required a 40- or 64-character hexadecimal `APP_RELEASE_SHA` in production configuration.
4. Made the persistent worker fail at startup when production software provenance is absent or malformed.
5. Persisted the scientific authority profile and section counts with the immutable export artifact.
6. Required the export result to match the authoritative job ID, requested format, and schema version.
7. Explicitly records MIAPPE, BrAPI, and MCPD mappings as `not_implemented`; no standards-conformance claim is made.
8. Enforced `requestedAt <= snapshotAt <= generatedAt` in both the TypeScript manifest contract and PostgreSQL completion authority.
9. Kept exact calculation authority, reviewed premise authority, and interpretation authority separate in every laboratory export.

## Validation evidence completed

| Gate | Result |
|---|---|
| Strict TypeScript source check | Passed across all checked-in app/package configurations |
| Unused locals and parameters | Passed |
| TypeScript/TSX parser | 184 files, 0 failures |
| Package and worker emission | Passed for all 17 packages and the Node worker |
| Compiled runtime artifact presence | Passed for 17 packages and Node worker |
| Migration manifest | 31 migrations verified |
| Routine grant manifest | 29 runtime and 27 worker routines verified |
| Environment contract | Passed |
| Authentication runtime smoke | 7 checks passed |
| Genetics runtime smoke | 8 checks passed |
| Laboratory export provenance smoke | 5 checks passed |
| Monte Carlo maximum absolute error | `0.0005900000000000072` |
| Storage/runtime smoke | 11 checks passed |
| Migration utility tests | 3 passed |
| Python worker tests | 8 passed |
| Catalog regeneration check | Passed |
| Backup relocation/tamper test | Passed |
| Shell/Node/Python syntax | Passed |
| Repository validator | 896 checks, 0 source issues, 5 environment blockers |

## Gates that could not be honestly completed

The exact repository toolchain could not be installed because the archive still lacks `pnpm-lock.yaml` and the available package registry returned service errors. Therefore the following remain unproven rather than silently waived:

- `pnpm install --frozen-lockfile` on Node 24;
- repository-pinned TypeScript 5.9.2 rather than the available TypeScript 5.8.3;
- actual ESLint 9.32.0, `typescript-eslint` 8.38.0, and `eslint-config-next` 16.2.11 execution;
- actual Prettier 3.6.2 whole-repository check;
- Vitest execution through the repository dependency graph;
- Next.js 16.2.11 production build and standalone verification;
- PostgreSQL 18 migration, RLS, trigger, privilege, and concurrency execution;
- Playwright, axe, screen-reader, object-storage, ClamAV, Docker, and R execution.

These are release blockers, not optional follow-up work.

## Scientific readiness judgment

The application is scientifically conservative in the correct places. It calculates inheritance from explicit premises, preserves seed-parent and pollen-parent direction, retains uncertainty and evidence states, and abstains from unsupported phenotype claims. Those are appropriate foundations for doctoral-level research.

A PhD laboratory still needs controlled local validation before relying on the application for primary records or publication-grade datasets. Required controls are defined in `LABORATORY_VALIDATION_AND_SOP_REQUIREMENTS.md`. Standards gaps are defined in `SCIENTIFIC_INTEROPERABILITY_GAP_ANALYSIS.md`.
