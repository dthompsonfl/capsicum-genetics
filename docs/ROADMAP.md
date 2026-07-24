# Roadmap

## Release gate 1 — reproducible build

1. Use Node 24 and pnpm 10.14 on a registry-enabled clean host.
2. Generate and commit a genuine `pnpm-lock.yaml`.
3. Pass frozen install, format, lint, typecheck, Vitest, Next production build, dependency/license/secret/SAST scans, and SBOM generation.

## Release gate 2 — PostgreSQL authority proof

1. Apply all six migrations to empty PostgreSQL 18.
2. Provision migration, runtime, and worker logins.
3. Run `db:verify-authority` and expand it to every workspace table.
4. Test revoked/suspended users, invitation acceptance, catalog separation of duties, immutable records, pedigree cycles, idempotency concurrency, job/outbox concurrency, and migration checksum replay.

## Release gate 3 — integrated runtime

1. Build and start Compose with PostgreSQL, object storage, migrations, web, and persistent worker.
2. Verify bucket bootstrap, upload/download hashes, health/readiness, job crash recovery, cancellation, retries, dead-lettering, and outbox recovery.
3. Resolve the long-term S3-compatible local-storage maintenance strategy.

## Release gate 4 — product and accessibility proof

1. Automate the complete accession → seed lot → plant → genotype → cross → harvest → family → observation → simulation → selection journey.
2. Add Playwright, axe, keyboard-only, responsive, error-state, permission-state, and screen-reader evidence.
3. Implement physical QR/barcode label print/scan workflows.
4. Add password recovery, invitation delivery, stronger authentication, and abuse/rate controls.

## Release gate 5 — recovery and scale

1. Execute encrypted backup and isolated restore with count/hash/object reconciliation.
2. Convert large exports to job-backed object delivery.
3. Run load tests for large pedigrees, observations, simulations, uploads, and concurrent workers.

## Scientific program

1. Independently review the 22 loci, 22 claims, and 30 sources.
2. Publish only hash-bound, applicability-scoped catalog releases.
3. Seed and approve capture protocols.
4. Build observed-progeny reconciliation and segregation diagnostics.
5. Promote phenotype, quantitative, disease, genomic, or learned-vision models only after external validation and independent governance.
