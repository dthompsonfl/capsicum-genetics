# V6 Release Blockers

Only genuine remaining blockers are listed.

1. **Frozen dependency graph:** registry access is unavailable; no legitimate `pnpm-lock.yaml`, frozen install, full lint/type/test/build, dependency/license review or actual-graph SBOM exists.
2. **Required runtime:** validation host is Node 22.16.0 rather than Node 24.18.0.
3. **PostgreSQL proof:** PostgreSQL 18 is unavailable; 29-migration empty/V5 replay, atomicity, authority/RLS, complete transition matrix, concurrency/idempotency, cleanup, and query-plan suites are unexecuted.
4. **Object/media integration:** Docker/MinIO/ClamAV are unavailable; SigV4, prefix list, scanner, hostile media, derivatives, cleanup and crash/restart paths are source-defined but not production-proven.
5. **Browser/WCAG proof:** complete authenticated Playwright/axe journeys and manual keyboard, zoom, phone and tablet review are unexecuted.
6. **Backup/restore:** local relocation/tamper fixtures pass, but no real isolated PostgreSQL/object restore and hash reconciliation was executed.
7. **Security evidence:** dependency, license, secret, SAST, container scans and SBOM require the legitimate frozen graph and production images.
8. **R worker:** R is unavailable; research-only protocol checks are unexecuted.
9. **Stale multipart uploads:** provider lifecycle/abort behavior needs an approved implementation and integration evidence.
10. **Scientific blockers:** no independently approved executable phenotype rule or validated learned biological model exists. This is a valid abstaining state, not missing fabricated data.
11. **Deferred scientific/product capabilities:** hostile-tested PDF ingestion, MIAPPE conformance fixtures, automated arbitrary multi-generation orchestration, calibrated scale/color workflows and validated biological image measurements require separate evidence-backed releases.

Release verdict remains **blocked** until blockers 1–8 are directly proven and blocker 9 is resolved before production object storage is enabled.
