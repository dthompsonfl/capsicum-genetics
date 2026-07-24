# V5 Operations, Backup, and Restore Runbook

## Deployment prerequisites

- Node.js 24.x.
- pnpm 10.14.0 with a reviewed `pnpm-lock.yaml`.
- PostgreSQL 18 with distinct migration, runtime, and worker roles.
- Private S3-compatible object storage.
- ClamAV reachable only from the media worker network.
- Python 3.13 plus pinned Pillow for independent image verification.
- Production secrets supplied explicitly; development defaults are prohibited.

## Build and deployment

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:runtime-artifacts
```

Apply migrations with the migration role, never the runtime or worker role:

```bash
pnpm db:migrate
pnpm db:provision-roles
ALLOW_AUTHORITY_TEST=true pnpm db:verify-authority
```

Start the web and worker from compiled artifacts. Verify liveness first, then readiness, then perform an authenticated smoke journey.

## Worker recovery

1. Inspect queue depth, oldest age, heartbeat, attempts, and dead letters.
2. Confirm the worker version supports each payload contract version.
3. Restart the worker; expired leases are recovered by canonical database functions.
4. Retry only retryable failed/dead-letter work through the admin action.
5. Never update job or aggregate terminal states directly.
6. For media/research/export failures, verify immutable source/object hashes before retry.

## Dead-letter remediation

- Record the failure code and sanitized detail.
- Determine whether the failure is code, environment, malformed immutable input, or unavailable scientific authority.
- Correct the underlying condition.
- Requeue through the canonical service with the same immutable payload/version when safe.
- Create a new request/version when scientific premises change.

## Backup

Use `infra/backup/backup.sh` with production backup encryption and retention configured. Capture:

- PostgreSQL logical backup and migration ledger;
- object manifest with key, size, media type, and SHA-256;
- deployment and worker versions;
- catalog/release/model identifiers;
- audit retention metadata.

## Isolated restore test

Use `infra/backup/restore-test.sh` in a network-isolated environment. Verify:

1. all 27 migrations and checksums;
2. restricted roles and authority functions;
3. row counts for authoritative tables;
4. stable hashes for releases, simulations, observations, revisions, measurements, and exports;
5. object manifest and object hashes;
6. representative authorized downloads;
7. worker claim/heartbeat/recovery;
8. no production credential reuse.

Do not promote a restore test environment into production.

## Rollback and migration recovery

Forward migrations are authoritative. Do not edit applied migrations. If a migration fails:

- stop application traffic;
- preserve database and migration evidence;
- diagnose the exact failed statement;
- restore the pre-migration backup into isolation;
- create a new forward repair migration;
- replay from empty and representative V4 state before resuming.

## Secret rotation

Rotate database, object-storage, session, abuse-control, AI, scanner, and delivery secrets independently. Revoke affected sessions and worker leases where required. Never place rotated values in logs, readiness output, tickets, or repository files.
