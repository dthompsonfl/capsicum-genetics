# V7 implementation report — 2026-07-23

## Decision

The repository was refactored in place. The existing scientific authority model, exact genetics engine, database governance, breeding records, observation model, and worker architecture were preserved. A rewrite would have discarded strong domain controls without solving the primary risks.

## Implemented security corrections

- Added installation-token proof to first-owner bootstrap.
- Added transaction-level advisory locking and a second empty-user check during bootstrap.
- Added a production Resend credential-delivery adapter with timeout, retry, idempotency, and redacted logging.
- Added TOTP MFA, encrypted secrets, one-time recovery codes, replay-step prevention, enrollment, verification, disable, and recovery-code rotation.
- Added per-session MFA assurance and privileged route/workspace-switch enforcement.
- Removed global account lockout behavior that could be weaponized against a known email address while retaining abuse counters and generic public errors.
- Tightened origin, host, protocol, cookie, readiness, and browser-header behavior around explicit `APP_MODE` rather than build mode.
- Added structured web logging through the shared observability package.

## Implemented usability corrections

- Added role-aware, task-grouped navigation.
- Added a permanent Learn area and plain-language user guide.
- Added a temporary single-locus Quick Genetics calculator with exact fractions, percentages, target-recovery planning, and operational success adjustments.
- Reorganized the simulation laboratory into standard, uncertainty, and advanced modes with progressive disclosure.
- Replaced primary breeding terminology with seed parent/pollen parent while retaining maternal/paternal semantics where scientifically required.
- Added local-date defaults, human-readable state labels, responsive behavior, focus styles, reduced-motion support, high-contrast support, error/loading/not-found screens, and persistent help links.
- Reworked phenotype capture so image and biological material cannot be selected inconsistently; protocol-approved views and references are enforced in the form.
- Added clearer role descriptions, invitation expiry language, MFA warnings, session assurance status, and recovery-code health warnings.

## Implemented scientific/evidence corrections

- Preserved exact-rational inheritance, parent direction, weighted uncertainty, linkage, cytoplasmic state, target recovery, and bounded simulation behavior.
- Kept phenotype, heat, disease, yield, color, and learned-vision claims behind reviewed applicability-scoped rules or models.
- Hardened research citations to require a verbatim supporting passage and an exact approved passage excerpt or source title; model-written paraphrase is no longer treated as direct evidence support.
- Preserved unknown, assumed, inferred, verified, and conflicting evidence states.

## Implemented delivery and validation corrections

- Added a lockfile preflight that fails with controlled regeneration instructions.
- Added production environment contract checks for origin, bootstrap, delivery, and MFA.
- Updated CI preflights and Compose environment handling.
- Added one authenticated Playwright setup project to prevent cross-browser bootstrap races and replaced the policy-invalid owner password.
- Expanded authenticated journey coverage to the primary learning, breeding, measurement, evidence, settings, and administration routes.
- Added migration `0030_v7_session_mfa_assurance.sql` and regenerated migration manifests.
- Updated the dependency-free repository validator for V7 routes, MFA, secure cookies, bootstrap, evidence citations, and migration assurance.

## Validation completed in this environment

- TypeScript/TSX syntax parse across 183 files: passed with zero parse failures.
- Environment contract validator: passed.
- Migration manifest: 30 ordered entries verified.
- Routine grant manifest: 29 runtime and 27 worker routines verified.
- Authentication runtime smoke: 7 checks passed.
- Genetics runtime smoke: 8 checks passed; maximum Monte Carlo absolute error was `0.0005900000000000072`.
- Storage/runtime smoke: 11 checks passed.
- Catalog reconciliation: passed.
- Python worker: 8 tests passed.
- Migration utilities: 3 tests passed.
- Backup checksum relocation and tamper rejection: passed.
- JavaScript/ES module syntax, shell syntax, and Git whitespace/conflict checks: passed.
- Repository validator: 810 checks, zero code issues, five environment warnings; release readiness remains false.
- Lockfile preflight: expected hard failure because no legitimate `pnpm-lock.yaml` exists.

## Validation not available here

- Genuine pnpm lock generation and frozen installation.
- Full TypeScript, lint, Vitest, and production build.
- PostgreSQL 18 migration/RLS/trigger/concurrency execution.
- Docker/Compose, object storage, ClamAV, Resend, and persistent worker integration.
- Browser E2E/accessibility execution.
- R worker execution.
- Backup and isolated restore proof.

## Preserved behavior

The refactor intentionally preserves authoritative breeding identities, immutable/revision history, parent direction, exact calculation inputs and hashes, workspace isolation, least-privilege database roles, catalog review/publication separation, worker leases/idempotency, and evidence/model abstention boundaries.

## Release verdict

**Not production-ready.** The source is materially safer and easier to use, but deployment is blocked until `V7_RELEASE_BLOCKERS.md` is closed with runtime evidence tied to the final commit.
