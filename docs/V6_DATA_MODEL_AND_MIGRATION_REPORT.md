# V6 Data Model and Migration Report

## Policy

Migrations `0001` through `0027` are unchanged. V6 adds forward migrations only. Ordered versions and SHA-256 checksums are generated into `packages/database/src/migration-manifest.ts` and `packages/database/src/generated/migration-manifest.json`; readiness, migration execution, authority verification, CI, and repository validation consume that manifest.

## `0028_v6_pending_object_reconciliation.sql`

Adds `pending_object_uploads` and `pending_object_state` to coordinate immutable object persistence with PostgreSQL authority.

Lifecycle:

`registered → stored → attached`

Failure/reconciliation paths:

`registered/stored → failed or cleanup_requested → delete_claimed → deleted`

Controls:

- forced workspace RLS;
- exact workspace-prefix check;
- content SHA-256, byte length, media type, purpose, actor, request ID, expiry, and reference binding;
- runtime register/store/fail/attach functions;
- worker enqueue/claim/finalize functions;
- active `storage.cleanup.v1` job contract;
- immutable audit evidence for deletion.

## `0029_v6_storage_cleanup_preview_and_reference_guard.sql`

Strengthens cleanup with:

- dry-run preview that never claims or mutates candidates;
- retention hours, deletion limit, object scan limit, and exact workspace prefix in the versioned payload;
- bounded content-addressed object discovery;
- discovered-orphan registration under worker authority;
- authoritative-reference counting across media objects, research documents/extraction artifacts, immutable artifacts, export jobs, media derivatives, and model artifacts;
- reference recheck before `delete_claimed` transition;
- production minimum retention enforced by the worker;
- preview audit evidence;
- worker-only execution grants.

## Migration execution

`scripts/migrate.mjs` now:

1. provisions `pgcrypto` required by historical migration bodies;
2. acquires the advisory migration lock;
3. verifies the generated ordered version/checksum manifest;
4. accepts exactly one supported outer transaction wrapper;
5. executes normalized migration SQL and inserts its ledger row in one transaction;
6. rolls both back on schema, ledger, injected, connection, or process failure;
7. fails closed on changed, missing, duplicate, unexpected, or out-of-order identities.

`packages/database/scripts/verify-migration-atomicity.mjs` defines real PostgreSQL fault-injection proof. It remains unexecuted on this host.

## Compatibility and recovery

- No destructive rewrite of historical migrations.
- Existing V5 rows require no identity transformation.
- Pending object records are additive; pre-V6 objects may be discovered by bounded prefix inventory and registered only when old enough, content-addressed, workspace-bound, and unreferenced.
- Failed cleanup returns the row to `cleanup_requested`; deletion is idempotent for missing objects.
- A failed migration leaves no applied ledger row and no partial schema transaction.
- Recovery procedures are in `docs/V6_OPERATIONS_BACKUP_RESTORE_RUNBOOK.md`.

## Authority boundary

- `capsicum_runtime` may invoke only human/application routines listed in the generated grant manifest.
- `capsicum_worker` may invoke only worker routines listed in its generated manifest.
- runtime cannot call cleanup claim/finalize/reconciliation routines;
- worker cannot register human uploads;
- cleanup cannot delete a referenced authoritative or historical object;
- migration execution requires a distinct migration/administrative identity.

## Unproven items

PostgreSQL 18 was unavailable. Empty replay, V5 upgrade replay, function ownership, exact grants, RLS behavior, concurrent claims, crash termination, and query plans remain release blockers.
