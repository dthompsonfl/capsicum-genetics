# V3 File Change Ledger

Compared with the supplied V2 baseline. **107 added, 82 modified, 0 deleted.** Generated evidence files are identified explicitly.

## Added files

| File | Workstream | Rationale | Generated |
|---|---|---|---|
| `.github/workflows/security.yml` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. | no |
| `apps/web/e2e/accessibility.spec.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. | no |
| `apps/web/e2e/public-boundary.spec.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. | no |
| `apps/web/playwright.config.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. | no |
| `apps/web/src/app/api/auth/invitation/exchange/route.ts` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. | no |
| `apps/web/src/app/api/auth/password-reset/exchange/route.ts` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. | no |
| `apps/web/src/app/api/health/liveness/route.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. | no |
| `apps/web/src/app/api/health/readiness/route.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. | no |
| `apps/web/src/app/forgot-password/page.tsx` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. | no |
| `apps/web/src/app/research/page.tsx` | I — Evidence-bounded AI | Reviewed-source retrieval, passage provenance, abstention, or AI audit. | no |
| `apps/web/src/app/reset-password/page.tsx` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. | no |
| `apps/web/src/app/scan/[token]/page.tsx` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. | no |
| `apps/web/src/app/settings/sessions/page.tsx` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. | no |
| `apps/web/src/components/mutation-form.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. | no |
| `apps/web/src/lib/credential-delivery.test.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. | no |
| `apps/web/src/lib/credential-delivery.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. | no |
| `apps/worker-node/src/monte-carlo-task.ts` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. | no |
| `apps/worker-node/tsconfig.build.json` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. | no |
| `docs/V3_ACCEPTANCE_TRACEABILITY.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/V3_BASELINE_REPORT.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/V3_DATA_MODEL_AND_MIGRATION_REPORT.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/V3_FILE_CHANGE_LEDGER.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/V3_FINAL_REPORT.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/V3_OPERATIONS_BACKUP_RESTORE_RUNBOOK.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/V3_RELEASE_BLOCKERS.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/V3_SCIENTIFIC_AUTHORITY_AND_MODEL_GATES.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/V3_SECURITY_AND_THREAT_MODEL.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/V3_SHA256SUMS.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/V3_VALIDATION_REPORT.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/source-review/v3/CAPSICUM_V2_FILE_BY_FILE_AUDIT.csv` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/source-review/v3/CAPSICUM_V2_FILE_BY_FILE_AUDIT.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/source-review/v3/CAPSICUM_V2_FILE_BY_FILE_REVIEW_AND_V3_GAP_ANALYSIS.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/source-review/v3/CAPSICUM_V3_AUTONOMOUS_AGENT_PROMPT.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/source-review/v3/MANIFEST.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/source-review/v3/README.md` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/source-review/v3/SHA256SUMS.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/v3-acceptance-traceability.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/v3-baseline.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | no |
| `docs/v3-deletion-manifest.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/v3-file-inventory.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/v3-repository-manifest.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/v3-route-inventory.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/v3-validation-results.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/auth-runtime-smoke.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/auth-runtime-smoke.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/auth-runtime-smoke.stderr` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/catalog-reconciliation.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/catalog-reconciliation.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/credential-delivery-smoke.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/credential-delivery-smoke.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/credential-delivery-smoke.stderr` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/environment.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/genetics-advanced-build.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/genetics-advanced-build.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/genetics-core-build.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/genetics-core-build.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/genetics-runtime-smoke.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/genetics-runtime-smoke.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/genetics-runtime-smoke.stderr` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/node-script-syntax.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/node-script-syntax.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/python-tests.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/python-tests.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/registry-install-blocker.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/registry-install-blocker.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/repository-validator.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/repository-validator.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/repository-validator.stderr` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/shell-syntax.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/shell-syntax.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/typescript-parse.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/typescript-parse.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/typescript-parse.stderr` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/yaml-validation.exit` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `docs/validation-evidence/v3/yaml-validation.txt` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. | yes |
| `infra/compose/docker-compose.dev.yml` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. | no |
| `packages/ai/tsconfig.build.json` | I — Evidence-bounded AI | Reviewed-source retrieval, passage provenance, abstention, or AI audit. | no |
| `packages/application/tsconfig.build.json` | Integration | Package boundary or integrated platform support. | no |
| `packages/auth/tsconfig.build.json` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. | no |
| `packages/breeding-domain/tsconfig.build.json` | Integration | Package boundary or integrated platform support. | no |
| `packages/config/tsconfig.build.json` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. | no |
| `packages/contracts/tsconfig.build.json` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. | no |
| `packages/database/migrations/0007_v3_biological_identity_and_cross_authority.sql` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/database/migrations/0008_v3_genotype_observation_and_simulation_authority.sql` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/database/migrations/0009_v3_runtime_media_research_and_auth_hardening.sql` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/database/migrations/0010_v3_canonical_session_and_runtime_authority.sql` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/database/migrations/0011_v3_auth_idempotency_and_token_lifecycle.sql` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/database/migrations/0012_v3_worker_media_export_and_annotation_authority.sql` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/database/migrations/0013_v3_research_and_label_authority.sql` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/database/migrations/0014_v3_runtime_privilege_closure.sql` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/database/tsconfig.build.json` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. | no |
| `packages/genetics-advanced/src/segregation.ts` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. | no |
| `packages/genetics-advanced/tsconfig.build.json` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. | no |
| `packages/genetics-core/tsconfig.build.json` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. | no |
| `packages/jobs/tsconfig.build.json` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. | no |
| `packages/observability/tsconfig.build.json` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. | no |
| `packages/observation-domain/tsconfig.build.json` | C — Observation authority | Versioned protocol, value validation, lifecycle, or linear correction authority. | no |
| `packages/scientific-catalog/tsconfig.build.json` | Integration | Package boundary or integrated platform support. | no |
| `packages/simulation-domain/tsconfig.build.json` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. | no |
| `packages/storage/tsconfig.build.json` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. | no |
| `packages/test-utils/tsconfig.build.json` | Integration | Package boundary or integrated platform support. | no |
| `packages/vision/tsconfig.build.json` | H — Secure media | Quarantine, inspection, capture, annotation, or learned-model gating. | no |
| `scripts/ci/parse-typescript.mjs` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. | no |
| `scripts/ci/verify-compiled-artifacts.mjs` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. | no |
| `scripts/ci/verify-standalone.mjs` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. | no |
| `scripts/clean.mjs` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. | no |
| `scripts/fix-esm-imports.mjs` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. | no |

## Modified files

| File | Workstream | Rationale |
|---|---|---|
| `.env.example` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. |
| `.github/workflows/ci.yml` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. |
| `apps/web/Dockerfile` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. |
| `apps/web/next.config.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/package.json` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/accept-invitation/page.tsx` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. |
| `apps/web/src/app/actions.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/admin/jobs/page.tsx` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. |
| `apps/web/src/app/api/exports/breeding-ledger/route.ts` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. |
| `apps/web/src/app/api/media/upload/route.ts` | H — Secure media | Quarantine, inspection, capture, annotation, or learned-model gating. |
| `apps/web/src/app/catalog/page.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/crosses/[id]/page.tsx` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. |
| `apps/web/src/app/crosses/new/page.tsx` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. |
| `apps/web/src/app/experiments/page.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/germplasm/new/page.tsx` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. |
| `apps/web/src/app/layout.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/observations/session/[id]/page.tsx` | C — Observation authority | Versioned protocol, value validation, lifecycle, or linear correction authority. |
| `apps/web/src/app/phenotype-capture/[id]/page.tsx` | H — Secure media | Quarantine, inspection, capture, annotation, or learned-model gating. |
| `apps/web/src/app/phenotype-capture/page.tsx` | H — Secure media | Quarantine, inspection, capture, annotation, or learned-model gating. |
| `apps/web/src/app/phenotypes/images/page.tsx` | H — Secure media | Quarantine, inspection, capture, annotation, or learned-model gating. |
| `apps/web/src/app/plants/[id]/page.tsx` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. |
| `apps/web/src/app/plants/page.tsx` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. |
| `apps/web/src/app/reports/page.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/research/review/page.tsx` | I — Evidence-bounded AI | Reviewed-source retrieval, passage provenance, abstention, or AI audit. |
| `apps/web/src/app/research/sources/[id]/page.tsx` | I — Evidence-bounded AI | Reviewed-source retrieval, passage provenance, abstention, or AI audit. |
| `apps/web/src/app/seed-lots/[id]/page.tsx` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. |
| `apps/web/src/app/seed-lots/page.tsx` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. |
| `apps/web/src/app/selection-plans/page.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/settings/users/page.tsx` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. |
| `apps/web/src/app/settings/workspace/page.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/sign-in/page.tsx` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. |
| `apps/web/src/app/simulation-lab/simulation-form.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/app/simulation-lab/weighted-simulation-form.tsx` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/components/invitation-form.tsx` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. |
| `apps/web/src/components/research-assistant-form.tsx` | I — Evidence-bounded AI | Reviewed-source retrieval, passage provenance, abstention, or AI audit. |
| `apps/web/src/lib/session.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/web/src/proxy.ts` | K — Web experience | Authenticated responsive workflow, safe mutation contract, or operator state. |
| `apps/worker-node/Dockerfile` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. |
| `apps/worker-node/package.json` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. |
| `apps/worker-node/src/worker.ts` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. |
| `docs/repository-validation.json` | Evidence | Verified review, traceability, validation, runbook, manifest, or release judgment. |
| `infra/compose/docker-compose.yml` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. |
| `package.json` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. |
| `packages/ai/package.json` | I — Evidence-bounded AI | Reviewed-source retrieval, passage provenance, abstention, or AI audit. |
| `packages/application/package.json` | Integration | Package boundary or integrated platform support. |
| `packages/application/src/auth-service.ts` | Integration | Package boundary or integrated platform support. |
| `packages/application/src/breeding-service.ts` | B — Breeding ledger | Biological identity, inventory, cross, harvest, pedigree, or label workflow. |
| `packages/application/src/export-service.ts` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. |
| `packages/application/src/internal.ts` | Integration | Package boundary or integrated platform support. |
| `packages/application/src/media-service.ts` | H — Secure media | Quarantine, inspection, capture, annotation, or learned-model gating. |
| `packages/application/src/observation-service.ts` | C — Observation authority | Versioned protocol, value validation, lifecycle, or linear correction authority. |
| `packages/application/src/operations-service.ts` | Integration | Package boundary or integrated platform support. |
| `packages/application/src/phenotype-service.ts` | H — Secure media | Quarantine, inspection, capture, annotation, or learned-model gating. |
| `packages/application/src/research-service.ts` | I — Evidence-bounded AI | Reviewed-source retrieval, passage provenance, abstention, or AI audit. |
| `packages/application/src/simulation-service.ts` | Integration | Package boundary or integrated platform support. |
| `packages/auth/package.json` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. |
| `packages/auth/src/index.ts` | J — Authentication and privacy | Authentication, token privacy, session, membership, or least-privilege control. |
| `packages/breeding-domain/package.json` | Integration | Package boundary or integrated platform support. |
| `packages/breeding-domain/src/index.ts` | Integration | Package boundary or integrated platform support. |
| `packages/config/package.json` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. |
| `packages/config/src/index.ts` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. |
| `packages/contracts/package.json` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. |
| `packages/contracts/src/index.ts` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. |
| `packages/contracts/src/platform.ts` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. |
| `packages/database/package.json` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. |
| `packages/database/scripts/verify-authority.mjs` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. |
| `packages/database/src/index.ts` | L — Database authority | Forward-only schema, RLS, transition, role, or verification authority. |
| `packages/genetics-advanced/package.json` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. |
| `packages/genetics-advanced/src/index.test.ts` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. |
| `packages/genetics-advanced/src/index.ts` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. |
| `packages/genetics-core/package.json` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. |
| `packages/jobs/package.json` | G — Durable jobs | Lease, cancellation, retry, export, or worker execution boundary. |
| `packages/observability/package.json` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. |
| `packages/observation-domain/package.json` | C — Observation authority | Versioned protocol, value validation, lifecycle, or linear correction authority. |
| `packages/scientific-catalog/package.json` | Integration | Package boundary or integrated platform support. |
| `packages/simulation-domain/package.json` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. |
| `packages/simulation-domain/src/index.ts` | F — Simulation laboratory | Exact/advanced genetics integration, authority, or scientific reconciliation. |
| `packages/storage/package.json` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. |
| `packages/storage/src/index.ts` | D — Shared contracts | Canonical validation, idempotency, configuration, storage, or observability contract. |
| `packages/test-utils/package.json` | Integration | Package boundary or integrated platform support. |
| `packages/vision/package.json` | H — Secure media | Quarantine, inspection, capture, annotation, or learned-model gating. |
| `scripts/validate_repository.py` | A/M — Build and operations | Reproducible build, CI, deployment, cleanup, or runtime evidence. |

## Deleted files

No V2 baseline files were deleted.

## Generated-source discipline

- Seed scientific CSV/JSON artifacts were not hand-edited; source-backed catalog reconciliation remains generator-controlled.
- Applied migrations `0001`–`0006` were not modified. V3 uses forward migrations `0007`–`0014`.
- Build output, dependency directories, caches, local delivery spools, logs, and runtime artifacts are excluded from this ledger and final archives.
