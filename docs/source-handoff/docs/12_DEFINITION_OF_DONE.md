# Definition of Done

The application is complete for this handoff only when all of the following are true.

## Product

- The web interface is functional across the required route map.
- A user can complete onboarding and create or use a seeded workspace.
- A full breeding cycle can be recorded without an external spreadsheet.
- A supported cross can be simulated and converted into a breeding plan.
- Evidence and uncertainty are visible at the point of prediction.
- Unsupported predictions abstain clearly.

## Science

- The supplied catalog imports without silent information loss.
- No spreadsheet row is directly treated as executable logic.
- All executable rules are versioned, source-linked, applicability-limited, and tested.
- Material identity, parent direction, genotype evidence state, and provenance are preserved.

## Engineering

- Repository package boundaries are enforced.
- Database migrations, seed import, and rollback/repair paths are documented.
- Exact simulation is deterministic and independently verified.
- Jobs are idempotent, observable, retryable, and bounded.
- AI and workers can be unavailable without breaking core workflows.
- Security, authorization, and workspace isolation tests pass.
- CI runs formatting, lint, types, tests, builds, security checks, and E2E smoke.

## UX

- WCAG 2.2 AA blocking issues are resolved.
- Mobile/tablet/desktop layouts are tested.
- Empty, loading, error, partial, degraded, and permission states exist.
- High-risk actions have confirmation and recovery behavior.
- Nontechnical users receive actionable guidance rather than raw errors.

## Operations

- Docker Compose starts the supported local stack.
- Environment variables are documented and validated.
- Backup and restore are proven.
- Logs, metrics, and health checks are present.
- All user data can be exported.

## Reporting

The final agent report maps every acceptance criterion to evidence, lists all files changed, reports exact commands and outcomes, classifies failures, and identifies residual scientific gates without overstating readiness.
