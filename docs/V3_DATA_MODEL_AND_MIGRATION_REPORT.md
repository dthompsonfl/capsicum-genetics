# V3 Data Model and Migration Report

## Policy

Migrations `0001` through `0006` are preserved byte-for-byte from the supplied V2 baseline. All V3 changes are forward-only in `0007` through `0014`. The application expects 14 applied migrations.

## Migration inventory

| Migration | Purpose |
|---|---|
| `0007_v3_biological_identity_and_cross_authority.sql` | Separate cross operation from verification; add reviewed verification, derived identity, inventory reservation/allocation, movement, current location, and label-generation authority. |
| `0008_v3_genotype_observation_and_simulation_authority.sql` | Add assembly-aware alleles, aliases, variants, markers, assays, release membership, genotype supersession, controlled vocabulary/units, and independent simulation authority dimensions. |
| `0009_v3_runtime_media_research_and_auth_hardening.sql` | Add reset/MFA foundations, shared rate limits, immutable artifacts, job contracts, worker heartbeats, media inspection/derivatives, measurements, and extraction artifacts. |
| `0010_v3_canonical_session_and_runtime_authority.sql` | Centralize observation-session transitions, deterministic label resolution, and immutable simulation authority. |
| `0011_v3_auth_idempotency_and_token_lifecycle.sql` | Add public idempotency, invitation resend state, reset delivery state, and one-time-token lifecycle support. |
| `0012_v3_worker_media_export_and_annotation_authority.sql` | Add worker heartbeat/completion functions, job cancellation/retry, media rejection, immutable export completion, and terminal-state guards. |
| `0013_v3_research_and_label_authority.sql` | Add opaque label tokens, independently reviewed document/passage histories, submission/review/supersession, and exact passage navigation. |
| `0014_v3_runtime_privilege_closure.sql` | Close inherited runtime/default privileges and make future authority opt-in; preserve only required reads/inserts and column-level media job binding. |

## Resulting schema

Static migration inspection identifies 96 unique tables across 14 migrations. Workspace-scoped tables are expected to use forced RLS and active-membership policies. Global scientific tables are separately governed and are not made writable merely by workspace membership.

## Biological identity corrections

- A cultivar/accession is no longer reused as recombinant progeny identity.
- `breeding_material_identities` represents controlled-cross progeny, selfed progeny, open-pollinated progeny, families, lines, populations, and selections.
- Canonical lineage is fruit → seed harvest → derived identity → derived seed lot → family/generation → member plants.
- Controlled, self, and open pollination remain distinct.
- Maternal and paternal direction is preserved; reciprocal crosses remain distinct.
- Unknown paternal identity remains unknown.

## Cross lifecycle

Operational states and verification states are separate enum dimensions. Verification records and independent review records are append-only. Fruit set is an operational event only. `app_complete_cross_harvest` is the only canonical terminal harvest transition.

## Inventory

Inventory events remain immutable. Reservations and plant allocations prevent unbounded plant creation from a depleted lot. Plant creation consumes/reserves inventory in the same transaction, unless a documented exception or uncertain quantity is explicitly recorded.

## Genotype evidence

The schema supports reference assembly/version, allele and alias, sequence/structural variant, marker, assay, laboratory provenance, phase/haplotype fields, evidence basis, certainty, and immutable supersession. Historical unresolved notation remains available and is not silently normalized.

## Observation authority

Approved definitions bind exact unit and vocabulary versions. Draft and authoritative observations are separate authority states. Session transitions and corrections use optimistic versions and row locks. Historical revisions remain append-only.

## RLS and privilege boundaries

- Web runtime and worker are separate non-superuser roles without `BYPASSRLS`.
- Active workspace membership is checked inside PostgreSQL policies.
- Scientific review, publication, model promotion, media inspection completion, export completion, and worker terminal states require canonical security-definer functions.
- Runtime cannot insert/update/delete normalized scientific authority, review history, media inspection outcomes, immutable artifacts, model validation, or worker capability records.
- Runtime may bind only `media_objects.inspection_job_id`; it cannot update upload or inspection authority fields.
- Future table mutation and function execution are opt-in through default-privilege closure.

## Compatibility and transformation

The migrations preserve existing identifiers. Legacy research records lacking an identifiable independent reviewer are returned to review rather than silently grandfathered as approved. Existing media completion state is backfilled into explicit inspection state. Existing simulation and genotype records receive explicit authority/supersession fields without rewriting their historical content.

## Recovery

Migrations are transactional. Recovery is restore-forward, not down-migration based:

1. stop web and workers;
2. restore the verified pre-migration database and object snapshot into isolation;
3. reconcile migration checksums and authoritative row/object hashes;
4. correct the forward migration or add a repair migration;
5. replay from the verified baseline;
6. rerun restricted-role and acceptance tests before cutover.

## Unproven behavior

No PostgreSQL executable was available. SQL syntax, RLS policy behavior, trigger ordering, deferred constraints, concurrent transactions, migration replay from empty/V2 state, and query plans remain release blockers.
