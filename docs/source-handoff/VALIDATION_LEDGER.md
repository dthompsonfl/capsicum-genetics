# Validation Ledger

The coding agent must replace command placeholders with discovered repository commands and record exact outcomes.

| Layer | Required proof | Blocking |
|---|---|---:|
| Repository | clean install from lockfile; task graph works | Yes |
| Formatting/lint | no introduced errors or material warnings | Yes |
| Type safety | strict TypeScript, Python type/lint, R checks | Yes |
| Contracts | TypeScript/Python/R contract parity | Yes |
| Database | empty install, upgrade migration, constraints, seed import | Yes |
| Auth/security | workspace isolation, permissions, CSRF/session, file safety | Yes |
| Exact genetics | golden, property, independent parity, performance | Yes |
| Advanced genetics | linkage/maternal/uncertainty fixtures and invariants | Yes for released engines |
| Web | component/integration/E2E, responsive, accessibility | Yes |
| Catalog | reconciliation, review transitions, immutable release | Yes |
| Breeding ledger | complete breeding-cycle E2E and pedigree integrity | Yes |
| AI | mock provider, citations, tool policy, injection, isolation | Yes if feature enabled |
| Vision | capture quality, deterministic measurement, correction flow | Yes if feature enabled |
| Workers/jobs | idempotency, retry, timeout, cancellation, artifacts | Yes |
| Build/deploy | production builds and Compose smoke | Yes |
| Operations | backup/restore, health, logs, metrics, export | Yes |
| Scientific claims | model-specific release gate | Yes for each promoted claim |
