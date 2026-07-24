# V4 Data Model and Migration Report

## Migration policy

V4 is forward-only. Migrations `0001`-`0014` are unchanged. New migrations:

| Migration | Purpose |
|---|---|
| `0015_v4_auth_abuse_and_public_idempotency.sql` | Durable abuse counters, lockout/rate-limit state, public idempotency terminal outcomes, token lifecycle support. |
| `0016_v4_selection_plan_scientific_snapshot.sql` | Persist every accepted selection target, scenario, confidence, model, assumption, population, and generation-plan field. |
| `0017_v4_catalog_release_lifecycle.sql` | Draft/review/publication lifecycle and hash-bound normalized release membership. |
| `0018_v4_normalized_catalog_authoring.sql` | Governed assembly, allele, variant, marker, and assay authoring/review authority. |
| `0019_v4_inventory_truth_and_exception_authority.sql` | Nullable quantity truth, signed events, reservations, expiry, partial consumption, transfers, and reviewed planting exceptions. |
| `0020_v4_observation_protocol_and_method_authority.sql` | Approved protocol/method/unit/vocabulary/QC/device-schema bindings and authoritative observation validation. |
| `0021_v4_selection_plan_lifecycle_and_outcomes.sql` | Versioned canonical selection transitions and append-only history. |
| `0022_v4_selection_plan_observed_reconciliation.sql` | Immutable expected-versus-observed segregation records. |

## Authority boundaries

- Workspace-scoped records require active membership through forced RLS.
- Scientific authorship is actor-bound.
- Authors cannot independently approve their own scientific records or release snapshots.
- Approved scientific records and published releases are immutable.
- Selection lifecycle is writable only through `app_transition_selection_plan`.
- Selection transition history and observed reconciliations are append-only.
- Runtime cannot invoke worker-only functions.
- Media authority fields are worker-controlled; runtime may only bind the canonical inspection job.

## Biological corrections

- Unknown inventory is represented as unknown, not zero.
- Planting consumes/reserves inventory or references an independently approved exception.
- Cross-derived progeny retain derived-material identity rather than maternal accession identity.
- Fruit set remains operational evidence only and never verifies paternal identity.
- Reciprocal parent direction remains distinct.

## Compatibility and recovery

The migrations include deterministic legacy backfills where possible. Legacy selection terminal states receive explicitly labeled migration provenance rather than fabricated detail. Legacy records without independent scientific reviewers are returned to review when authority cannot be reconstructed honestly.

Runtime replay and upgrade proof require PostgreSQL 18 and remain blocked in this environment. Recovery procedures are documented in `docs/V4_OPERATIONS_BACKUP_RESTORE_RUNBOOK.md`.
