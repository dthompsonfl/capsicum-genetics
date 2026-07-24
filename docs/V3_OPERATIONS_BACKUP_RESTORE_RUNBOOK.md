# V3 Operations, Backup, and Restore Runbook

## Preconditions

- Node.js 24 and pnpm 10.14.0.
- A legitimate committed `pnpm-lock.yaml` produced by a registry-enabled install.
- PostgreSQL 18 with distinct migration, runtime, and worker credentials.
- Private S3-compatible object storage.
- All secrets supplied explicitly; production must not use development fallbacks.
- Docker/Compose or equivalent orchestrator with read-only, non-root runtime filesystems.

## Clean deployment

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:catalog
pnpm build
pnpm validate:runtime-artifacts
pnpm db:migrate
pnpm db:provision-roles
ALLOW_AUTHORITY_TEST=YES pnpm db:verify-authority
```

Start the integrated development proof only with a private environment file:

```bash
docker compose --env-file .env.local \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.dev.yml \
  --profile application up --build --wait
```

Verify:

```bash
curl --fail http://127.0.0.1:3000/api/health/liveness
curl --fail http://127.0.0.1:3000/api/health/readiness
```

Readiness must fail closed when PostgreSQL, object storage, required workers, scanner, or enabled providers are unavailable. It must not return secrets.

## Migration

1. Create and verify a database/object backup.
2. Stop web mutations and drain workers.
3. Execute `pnpm db:migrate` with the migration-only role.
4. Verify migration count/checksums and provision restricted roles.
5. Run the full authority verifier against an isolated clone before production cutover.
6. Start worker, then web.
7. Run smoke, acceptance, queue, and audit checks.

Applied migrations are never edited. Corrections use a new forward migration.

## Rollback and recovery

There are no down migrations for authoritative scientific data. On material failure:

1. stop web/workers;
2. preserve failed database/object state for investigation;
3. restore the verified pre-change backup into a new isolated target;
4. reconcile migrations, row counts, authoritative hashes, object manifest/hashes, and representative downloads;
5. redirect traffic only after restricted-role and acceptance tests pass;
6. implement a forward repair migration before attempting the upgrade again.

## Backup

```bash
export DATABASE_ADMIN_URL='postgresql://...'
export S3_ENDPOINT='https://...'
export S3_BUCKET='...'
export S3_ACCESS_KEY_ID='...'
export S3_SECRET_ACCESS_KEY='...'
bash infra/backup/backup.sh /secure/backups/capsicum-$(date -u +%Y%m%dT%H%M%SZ)
```

The bundle contains a custom database dump, SHA-256 files, object mirror when configured, and a manifest. Store it encrypted, access-controlled, immutable, and off the primary failure domain.

## Isolated restore drill

Use a disposable database and bucket only:

```bash
export RESTORE_DATABASE_URL='postgresql://.../capsicum_restore_drill'
export RESTORE_S3_ENDPOINT='https://...'
export RESTORE_S3_BUCKET='capsicum-restore-drill'
export RESTORE_S3_ACCESS_KEY_ID='...'
export RESTORE_S3_SECRET_ACCESS_KEY='...'
export ALLOW_DESTRUCTIVE_RESTORE_TEST=YES
bash infra/backup/restore-test.sh /secure/backups/<bundle>
```

After the script, additionally reconcile:

- all 14 migration records and checksums;
- authoritative table row counts and stable canonical hashes;
- object count, key, size, and SHA-256 manifest;
- representative authorized downloads;
- simulation input/result hashes;
- catalog release content hashes;
- latest audit/job/artifact links.

Destroy the isolated restore target after evidence is retained.

## Worker recovery

1. Inspect capability/version and heartbeat.
2. Stop the unhealthy instance.
3. Let lease expiry occur or run the controlled stale-recovery function.
4. Confirm the job returns to queued/retry/dead-letter per contract.
5. Correct the handler or dependency.
6. Retry through the administrative canonical action; do not update job state directly.
7. Verify idempotent artifact/result completion.

## Dead-letter remediation

- inspect safe error code and redacted attempt logs;
- identify whether payload version, dependency, scientific applicability, or data validation caused failure;
- never edit payload/history in place;
- repair data through canonical correction or enqueue a new versioned job;
- retry only eligible records through `app_retry_job`;
- retain original attempts and audit evidence.

## Secret rotation

Rotate in this order where possible:

1. add new database/storage/provider credentials;
2. deploy consumers accepting new credentials;
3. revoke old credentials;
4. rotate session/token/fingerprint secrets with an explicit session invalidation plan;
5. verify no secret appears in readiness, logs, analytics, archives, or artifacts;
6. rerun security and access smoke.

## Incident response

- suspend affected memberships and revoke sessions;
- quarantine relevant uploads/exports/jobs;
- preserve immutable evidence;
- rotate credentials;
- determine workspace and object scope;
- notify owners under the approved incident policy;
- restore/reconcile if integrity is uncertain;
- add regression tests and forward migrations before reopening.

## Local execution result

This run validated script syntax only. No PostgreSQL, Docker, object storage, or isolated restore runtime was available. A successful restore must be demonstrated before release.
