# V6 Operations, Backup and Restore Runbook

## Deployment prerequisites

- Node 24.18.0 and Corepack-managed pnpm 10.14.0.
- A legitimate committed `pnpm-lock.yaml`.
- PostgreSQL 18 migration, runtime and worker login identities.
- private S3-compatible storage and bucket;
- ClamAV for accepted media;
- all production-required secrets validated by `@capsicum/config`;
- external credential delivery if invitations/recovery are enabled;
- hosted AI configuration only when explicitly approved.

Production must fail closed when required secrets are absent.

## Clean installation and build

```bash
corepack enable
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:runtime-artifacts
```

## Database deployment

```bash
export DATABASE_ADMIN_URL='postgresql://...migration identity...'
pnpm db:provision-roles
pnpm db:migrate
pnpm db:verify-authority
```

Verify readiness reports the exact generated version/checksum manifest. Never repair a checksum by changing a historical migration. Restore the expected source or perform a reviewed forward repair.

## Worker recovery

1. Check `/admin/system` and `/admin/jobs` for heartbeat, queue age, attempts and dead letters.
2. Confirm worker and web use separate role credentials.
3. Restart the worker; stale leases are recovered by database functions.
4. Retry only eligible failed/dead-letter jobs through the browser action.
5. Cancel long-running work cooperatively; do not update job state directly.
6. Inspect sanitized attempt/log evidence.

## Object reconciliation

1. Run **Preview cleanup** in `/admin/jobs` with a retention window and bounded scan/deletion limits.
2. Review candidate counts and scan truncation evidence.
3. Resolve unexpected referenced/untracked objects before deletion.
4. Run **Delete verified orphans** only after preview.
5. The worker inventories only the active workspace prefix, registers discovered old content-addressed orphans, and rechecks all authoritative references before claim.
6. Failed deletions return to `cleanup_requested` for bounded retry.
7. Configure and verify provider lifecycle rules for stale multipart uploads; V6 does not claim this proof locally.

## Backup

```bash
export BACKUP_OUTPUT_DIR=/secure/backup-output
export DATABASE_ADMIN_URL='postgresql://...'
export S3_ENDPOINT='https://...'
export S3_BUCKET='...'
export S3_ACCESS_KEY_ID='...'
export S3_SECRET_ACCESS_KEY='...'
bash infra/backup/backup.sh
```

The bundle contains database dump, migration identity, authoritative table snapshot, object manifest and bundle-relative SHA-256 manifest.

## Isolated restore test

Use independent destination PostgreSQL and object storage credentials:

```bash
export RESTORE_BUNDLE=/secure/copied-bundle
export RESTORE_DATABASE_ADMIN_URL='postgresql://...isolated destination...'
export RESTORE_S3_ENDPOINT='https://...isolated...'
export RESTORE_S3_BUCKET='...'
export RESTORE_S3_ACCESS_KEY_ID='...'
export RESTORE_S3_SECRET_ACCESS_KEY='...'
bash infra/backup/restore-test.sh
```

Required proof:

- manifest schema and every bundle file checksum;
- exact migration version/checksum set;
- deterministic authoritative table counts/hashes;
- every object key, byte length and SHA-256;
- no missing, modified, inaccessible or unexpected object;
- representative authorized download.

## Migration recovery

Because migration body and ledger row are one transaction, a failed migration should leave neither. Confirm the advisory lock holder ended, inspect the error, restore the unchanged migration source, and rerun. Never manually insert a successful migration ledger row.

## Secret rotation

1. Rotate database and object-store credentials per role, not as one shared credential.
2. Rotate session/token/abuse/network secrets under an approved session-invalidation plan.
3. Restart affected services with fail-closed readiness.
4. Revoke old credentials.
5. Verify no secret appears in logs, artifacts, backups, evidence or error responses.

## Incident response

- contain the affected workspace/service;
- preserve immutable audit/job/object evidence;
- revoke sessions and credentials;
- stop risky workers without modifying authority records;
- identify affected biological/scientific records and model applicability;
- restore only from a verified bundle;
- document corrective action and rerun the full validation ladder.
