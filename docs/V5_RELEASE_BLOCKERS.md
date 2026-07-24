# V5 Genuine Release Blockers

V5 remains **BLOCKED** for production release.

## Environment and proof blockers

1. The registry is unreachable, so a legitimate `pnpm-lock.yaml`, frozen install, and dependency graph cannot be produced or verified.
2. Node 24 is unavailable; full TypeScript 5.9.2, lint, test, Turbo, Next.js standalone, and worker builds are unproven.
3. PostgreSQL 18 is unavailable; all 27 migrations, V4-to-V5 upgrade, RLS, grants, triggers, concurrency, idempotency, lease, and query-plan behavior are unproven.
4. Docker is unavailable; web, worker, MinIO, ClamAV, and Python integration cannot be exercised.
5. Browser tooling is unavailable; Playwright, axe, keyboard, zoom, responsive, CSRF, CSP nonce, and all acceptance journeys are unproven.
6. Backup and isolated restore have not been executed.
7. Dependency, license, secret, SAST, container scans, and SBOM generation have not run.
8. R is unavailable.

## Remaining implementation/scientific blockers

1. PDF ingestion is disabled until a bounded extractor and hostile PDF suite are approved.
2. MIAPPE compatibility is not claimed because mappings and conformance fixtures are incomplete.
3. Full automated multi-generation F1/F2/backcross orchestration is incomplete.
4. Deterministic vision is limited to byte-derived image facts and derivatives; biological phenotype measurements require approved calibration protocols and validation populations.
5. No independently approved executable phenotype rule exists.
6. No independently validated learned model exists.
7. Complete authenticated browser E2E and WCAG coverage for all journeys is incomplete.

These blockers are not satisfied by route, table, interface, or documentation presence.
