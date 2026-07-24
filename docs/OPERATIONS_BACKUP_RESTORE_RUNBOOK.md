# Operations, backup, and restore runbook

## Environment separation

Never use the migration/admin database URL as the web or worker runtime URL.

- `MIGRATION_DATABASE_URL` / `DATABASE_ADMIN_URL` — migrations, role provisioning, backup.
- `DATABASE_URL` — restricted web runtime login.
- `WORKER_DATABASE_URL` — restricted persistent worker login.
- S3 credentials — object storage only; never returned by readiness APIs.

Use a secrets manager in production. `.env.example` contains placeholders, not deployable values.

## Initial database deployment

```bash
pnpm db:migrate
pnpm db:provision-roles
pnpm db:seed-catalog
```

Confirm readiness reports exactly 6 migrations. Re-running migration must report applied versions as skipped and must reject changed checksums.

## PostgreSQL authority verification

Use only a disposable isolated database. The script refuses to run unless the database name includes `test`, `authority`, or `ci` and `ALLOW_AUTHORITY_TEST=YES` is set.

```bash
ALLOW_AUTHORITY_TEST=YES \
AUTHORITY_TEST_DATABASE_URL='postgresql://admin:.../capsicum_authority_test' \
pnpm db:verify-authority
```

Expected checks:

- runtime and worker roles exist;
- six migrations are recorded;
- forged workspace context reads zero protected rows;
- active member reads the authorized row;
- membership identity reassignment is rejected;
- owner demotion is rejected.

Expand this script in CI with revoked-user, invitation, catalog, immutable-record, cycle, idempotency, and queue-concurrency tests.

## Local integrated stack

```bash
docker compose -f infra/compose/docker-compose.yml --profile application up --build
```

Expected sequence:

1. PostgreSQL and object storage become healthy.
2. Bucket initializer creates the configured bucket.
3. Migration service applies schema and provisions roles.
4. Web and Node worker start with separate restricted logins.
5. `/api/health` reports process health; authenticated readiness reports dependency/capability state without secrets.

The Python and R workers are separate optional profiles and must not be presented as production-proven until their own runtime tests pass.

## Persistent worker operations

The Node worker loops until shutdown, periodically recovers stale leases, claims jobs and outbox rows through database functions, heartbeats long work, and records success/failure/cancellation. Unknown contract versions are rejected. Operational tests must include:

- two workers claiming concurrently without duplicate ownership;
- process death followed by stale-lease recovery;
- cancellation before and during work;
- retry backoff and dead-letter exhaustion;
- outbox publish failure and retry;
- restricted runtime role unable to invoke worker functions.

## Backup creation

Requirements: `pg_dump`, `sha256sum`, Python 3; `mc` when object storage is configured.

```bash
DATABASE_ADMIN_URL='postgresql://admin:.../capsicum' \
S3_ENDPOINT='https://...' \
S3_BUCKET='capsicum-production' \
S3_ACCESS_KEY_ID='...' \
S3_SECRET_ACCESS_KEY='...' \
pnpm backup:create -- ./backups/capsicum-$(date -u +%Y%m%dT%H%M%SZ)
```

The bundle contains:

- `database.dump` and checksum;
- optional mirrored `objects/` and per-object checksums;
- `manifest.json`;
- `bundle.sha256` covering all bundle files.

Store bundles encrypted, access-controlled, off the primary failure domain, and under a documented retention/rotation policy.

## Isolated restore test

Never target a production database. The script requires explicit acknowledgement:

```bash
ALLOW_DESTRUCTIVE_RESTORE_TEST=YES \
RESTORE_DATABASE_URL='postgresql://admin:.../capsicum_restore_test' \
RESTORE_S3_ENDPOINT='https://...' \
RESTORE_S3_BUCKET='capsicum-restore-test' \
RESTORE_S3_ACCESS_KEY_ID='...' \
RESTORE_S3_SECRET_ACCESS_KEY='...' \
pnpm backup:restore-test -- ./backups/<bundle>
```

The script verifies checksums, performs a clean restore, queries migration/workspace/catalog counts, restores objects when present, and compares object counts.

## Release-grade restore evidence

The automated script is a minimum. Record and retain:

- backup and restore timestamps, versions, operators, and environment IDs;
- dump/object/bundle checksums;
- migration count and schema version;
- authoritative row counts per workspace/domain;
- catalog release member hashes and simulation content hashes;
- pedigree edge/cycle checks;
- media database rows matched to object keys and hashes;
- successful sign-in and representative breeder journey on the restored environment;
- measured recovery time and recovery point objectives.

## Incident posture

If integrity is uncertain, freeze writes, preserve logs/backups, rotate affected credentials, restore into isolation, reconcile hashes and evidence histories, and avoid rewriting scientific records in place. Corrections should remain append-only and attributable.
