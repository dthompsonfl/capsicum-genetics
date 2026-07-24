# V4 Operations, Backup, and Restore Runbook

## Deployment prerequisites

- Node 24.x and pnpm 10.14.0.
- Legitimate committed `pnpm-lock.yaml`.
- PostgreSQL 18 migration authority separate from runtime and worker credentials.
- Private S3-compatible storage or approved local development storage.
- ClamAV scanner for media acceptance.
- Production secrets supplied externally; production must fail closed when absent.

## Clean deployment

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:catalog
pnpm validate:repository
pnpm db:migrate
pnpm db:provision-roles
ALLOW_AUTHORITY_TEST=YES pnpm db:verify-authority
pnpm validate:runtime-artifacts
```

Start web and compiled worker only after migrations and restricted roles succeed.

## Migration recovery

1. Stop web/worker writes.
2. Capture database and object manifests.
3. Review `app_schema_migrations` checksums.
4. Never edit an applied migration.
5. Correct with a new forward migration or restore from a verified pre-migration backup.
6. Re-run restricted-role authority tests before reopening.

## Backup

```bash
bash infra/backup/backup.sh
```

The backup must include PostgreSQL dump, migration ledger, authoritative table hashes/counts, object manifest, object hashes, and configuration metadata without secrets.

## Isolated restore

```bash
bash infra/backup/restore-test.sh
```

Restore into an isolated database/bucket. Reconcile:

- Migration versions/checksums.
- Authoritative row counts and stable hashes.
- Object references and content hashes.
- Representative authorized downloads.
- Worker/job state and immutable artifacts.

Do not call a backup verified until the isolated restore and reconciliation pass.

## Worker recovery

- Inspect heartbeat, oldest queue age, lease owner, attempts, cancellation, and dead-letter counts.
- Expired leases are recovered through canonical functions.
- Retry only retryable jobs with unchanged versioned payload contracts.
- Dead-letter remediation must preserve prior attempts and audit evidence.

## Secret rotation

Rotate database login credentials, session/token/abuse secrets, object-storage keys, scanner credentials, and provider keys separately. Revoke sessions when session/token derivation secrets are rotated.

## Incident response

Fail closed, isolate affected services, preserve evidence, revoke credentials, reconcile database/object hashes, independently review any affected scientific records, and document the release decision.

## Current proof status

Scripts pass syntax validation only in this environment. Docker deployment and isolated restoration were not executable and remain release blockers.
