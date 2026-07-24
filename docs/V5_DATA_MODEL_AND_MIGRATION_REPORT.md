# V5 Data Model and Migration Report

## Migration policy

V5 adds forward-only migrations. Migrations `0001` through `0022` were not modified.

| Migration | Purpose |
|---|---|
| `0023_v5_governed_advanced_simulation_laboratory.sql` | Immutable advanced simulation requests, authority dimensions, exact completion, worker completion, lifecycle synchronization, RLS, and restricted function grants. |
| `0024_v5_durable_research_ingestion.sql` | Durable source-ingestion state, immutable source identity, deterministic extraction artifacts/passages, worker completion, and job synchronization. |
| `0025_v5_durable_media_derivatives_and_measurements.sql` | Derivative and measurement runs, automatic job enqueue after accepted inspection/capture, immutable worker completion, RLS, and state synchronization. |
| `0026_v5_streaming_breeding_ledger_export.sql` | Worker-only repeatable-read export context and bounded keyset page functions. |
| `0027_v5_phenotype_measurement_revision_authority.sql` | Immutable machine measurements, linear correction revisions, stale-predecessor rejection, audit creation, and runtime/worker privilege separation. |

## New authority records

### Simulation requests

`simulation_requests` separates queued/running/stochastic work from completed immutable `simulation_runs`. It stores input snapshot/hash, model/engine versions, catalog release, parent direction, evidence/genotype-call IDs, calculation authority, premise authority, interpretation authority, assumptions, warnings, abstentions, trace, idempotency key, job, and completed run.

### Research ingestion

`research_documents` gains media type, source byte length, ingestion state, and failure code. Existing reviewed passage records are preserved as extracted; legacy documents without passages are marked explicitly unavailable rather than assigned a fictional queued job.

### Media processing

`media_derivative_runs` and `phenotype_measurement_runs` bind one immutable source hash and one durable job to each processing aggregate. Accepted media and approved captures enqueue work through database triggers only after the preceding authority state is valid.

### Measurement revisions

Existing machine measurement identity and result fields remain immutable. `phenotype_measurement_revisions` is the only human-correction path. The current pointer may move only to a revision that belongs to the same measurement and linearly supersedes the previous current revision.

## Compatibility and transformation

- V5 uses additive columns/tables/functions and explicit legacy-state classification.
- No destructive transformation or table rewrite was introduced.
- Existing simulation runs remain historical and are not recalculated under V5.
- Existing research sources retain source hashes and passage identities.
- Existing phenotype measurements remain valid; new correction authority applies after migration.
- V5 does not invent release membership, reviewed passages, measurements, or approved rules during migration.

## RLS and grants

- New workspace tables enable and force RLS using active-membership checks.
- Runtime receives only required read/insert or canonical-function execution rights.
- Worker completion functions are revoked from `PUBLIC` and runtime.
- Human correction is revoked from the worker.
- Trigger functions are not directly callable by runtime or worker roles.
- Export page functions validate active lease ownership and expose only whitelisted workspace tables.

## Runtime proof status

Static transaction, duplicate-column, role-marker, and function-grant checks pass. PostgreSQL 18 replay and adversarial execution remain unavailable and are therefore release blockers.
