# V6 Baseline Report

Generated: 2026-07-23T18:55:02.210275+00:00

## Verified source

- Baseline archive: `capsicum-breeding-intelligence-platform-v5-complete.zip`
- Files: **500**
- Forward migrations: **27** (`0001_foundation.sql` through `0027_v5_phenotype_measurement_revision_authority.sql`)
- Next.js page routes: **54**
- API routes: **14**
- Node available: `v22.16.0` (repository requires Node 24)
- Python available: `Python 3.13.5`
- pnpm, PostgreSQL client/server, Docker, and R are unavailable on the initial host.

## Confirmed conflicts with V5 reports

The V5 reports correctly withheld production readiness, but several source-level passes were overstated:

1. S3-compatible GET and ranged GET requests are signed with a `PUT` canonical method.
2. readiness expects 22 migrations while the repository contains 27.
3. the authority verifier references routines that do not exist with those signatures.
4. all frozen build paths require a lockfile that is absent.
5. migration body application and migration-ledger insertion are separate commits.
6. the sign-in `next` destination accepts a backslash-based external-origin escape.
7. backup checksum paths are not relocation-safe and object restore checks count rather than digest equality.
8. upload object persistence can outlive a failed database operation without an active reconciliation worker.

## Scientific state preserved

The V5 exact-genetics core, maternal direction, explicit uncertainty, independent review, immutable simulation snapshots, normalized catalog authority, observation revisions, deterministic image facts, selection reconciliation, and abstention boundaries are treated as protected architecture. V6 changes may extend but not weaken them.

## Execution order

1. Repair S3 SigV4 signing and add executable MinIO integration coverage.
2. Generate one migration identity/checksum manifest and use it for readiness, migration verification, and repository validation.
3. Generate routine privilege manifests and repair authority preflight checks.
4. Attempt a legitimate Node 24/pnpm 10.14.0 frozen graph; never synthesize a lockfile.
5. Make migration execution and bookkeeping crash-atomic.
6. close redirect, security-header, backup, object-reconciliation, quota, media-isolation, and AI-evaluation gaps.
7. add PostgreSQL, object-storage, worker, browser, and accessibility integration definitions.
8. rerun every locally available validation gate and package only verified source/evidence.

## Initial release verdict

**Blocked.** The baseline cannot build reproducibly and contains source defects that break readiness, S3 reads, and the authority verifier.
