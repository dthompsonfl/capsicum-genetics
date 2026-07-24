# Data model and migration report

## Current migration policy

The repository contains **30 ordered, forward-only SQL migrations**. Applied migration checksums are recorded in `app_schema_migrations`; the runner rejects changed source for an applied migration. New schema changes must be delivered as a new migration.

| Range | Primary responsibility |
|---|---|
| `0001`–`0006` | Foundation, authenticated MVP, scientific authority guards, durable workers, and membership-bound RLS |
| `0007`–`0014` | V3 biological identity, cross/genotype authority, auth hardening, media/research, labels, and runtime privilege closure |
| `0015`–`0022` | V4 abuse controls, selection lifecycle, catalog releases/authoring, inventory truth, and observation protocols |
| `0023`–`0027` | V5 advanced simulations, durable research/media/export, and immutable phenotype measurement correction |
| `0028`–`0029` | V6 pending-object reconciliation, storage cleanup preview, and reference guards |
| `0030` | V7 per-session MFA assurance on `auth_sessions` |

The migrations contain **116 `CREATE TABLE` declarations**. This count includes current authoritative, operational, governance, history, queue, and evidence tables; it supersedes the older six-migration/57-table snapshot.

## Principal data domains

- **Identity and security:** users, credentials, TOTP credentials, recovery codes, sessions, workspaces, memberships, invitations, password reset, abuse/rate-limit state.
- **Scientific catalog:** imports, sources, passages/assertions, loci, alleles, claims, reviews, releases, release membership, applicability, and phenotype/model rules.
- **Biological identity:** germplasm/materials, accessions, seed lots, plants, locations, labels, inventory events/reservations/exceptions, origins, and pedigree edges.
- **Cross and progeny:** crosses, pollination/cross events, verifications, fruits, harvests, seed lots, progeny families, and family members.
- **Genotype and simulation:** genotype calls/evidence, exact and advanced simulation inputs/results, immutable hashes, uncertainty/linkage/cytoplasmic snapshots, and idempotency records.
- **Selection and experimentation:** selection plans, lifecycle transitions, reconciliations, experiments, observation definitions/sessions/values/revisions, and outcomes.
- **Media and phenotype:** capture protocols/views, private media, pending objects, derivatives, quality/scanner state, captures, measurements, revisions, and annotations.
- **Operations:** jobs, attempts, logs, leases, transactional outbox, AI interactions/tool calls, exports, audit events, cleanup previews, backup/restore evidence, and reconciliation state.

## Isolation and referential integrity

Workspace-owned records carry `workspace_id`, use composite workspace foreign keys where identities cross tables, and are protected by forced RLS. Access requires:

1. the row workspace to match transaction context;
2. a transaction actor;
3. an active membership for that actor and workspace.

Membership creation is limited to authorized management, exact invitation context, or the guarded one-time first-owner bootstrap. Membership identity is immutable; revocation is a state transition rather than runtime deletion.

## Integrity and history

The schema preserves append-only or superseding history for scientific review, audit, inventory, observation corrections, phenotype measurement corrections, annotations, job attempts/logs, model validation, and release membership. Approved scientific records, validated models, and simulation inputs/results are immutable or hash-bound.

Directed seed-parent/pollen-parent relationships and pedigree-cycle controls are preserved. Corrections create new authority records rather than rewriting the past.

## Runtime roles

- migration/administrative role — schema, role provisioning, backup, restore;
- `capsicum_runtime_login` / `capsicum_runtime` — restricted web operations;
- `capsicum_worker_login` / `capsicum_worker` — restricted queue/media/export operations through narrowly granted functions.

The web and worker must never run as table owner or superuser.

## Required database proof

Static checks verify ordering, checksums, one explicit transaction per migration, required markers, and generated manifests. PostgreSQL was unavailable in this environment. Production acceptance requires:

- empty-database and upgrade-path migration replay on PostgreSQL 18;
- checksum/idempotency replay;
- role provisioning and effective-grant inspection;
- restricted-role RLS tests for valid, forged, suspended, and revoked principals;
- bootstrap concurrency and installation-token tests;
- MFA/session assurance and privileged workspace-switch tests;
- scientific author/reviewer/publisher separation;
- pedigree, immutable-history, correction, idempotency, queue-lease, stale-recovery, and outbox concurrency tests;
- query-plan and load characterization at realistic breeding-program sizes.
