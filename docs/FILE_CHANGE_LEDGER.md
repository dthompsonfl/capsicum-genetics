# File change ledger

**Baseline:** prior built-v1 repository extracted from the next-sweep bundle  
**Comparison:** SHA-256 by repository-relative path; generated files/caches excluded  
**Added:** 56  
**Modified:** 82  
**Deleted:** 0

| Status | Path | Workstream | Purpose |
|---|---|---|---|
| Added | `apps/web/src/app/accept-invitation/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/app/actions.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/app/api/exports/[id]/route.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/app/api/exports/breeding-ledger/route.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/app/api/media/[id]/route.ts` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Added | `apps/web/src/app/api/media/upload/route.ts` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Added | `apps/web/src/app/phenotype-capture/[id]/page.tsx` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Added | `apps/web/src/app/simulation-lab/weighted-simulation-form.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/components/invitation-form.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/components/page-primitives.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/components/research-assistant-form.tsx` | Evidence / AI | Approved-evidence retrieval, audit, citation validation, and abstention. |
| Added | `apps/web/src/lib/database.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/lib/presentation.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/lib/session.ts` | Identity / security | Authentication, permissions, session, or request-boundary hardening. |
| Added | `apps/web/src/lib/storage.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Added | `apps/web/src/proxy.ts` | Identity / security | Authentication, permissions, session, or request-boundary hardening. |
| Added | `apps/worker-node/Dockerfile` | Durable worker | Persistent bounded execution and outbox processing. |
| Added | `apps/worker-node/package.json` | Durable worker | Persistent bounded execution and outbox processing. |
| Added | `apps/worker-node/src/worker.ts` | Durable worker | Persistent bounded execution and outbox processing. |
| Added | `apps/worker-node/tsconfig.json` | Durable worker | Persistent bounded execution and outbox processing. |
| Added | `docs/ACCEPTANCE_TRACEABILITY.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/CAPSICUM_FILE_BY_FILE_REVIEW_AND_NEXT_SWEEP_GAP_ANALYSIS.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/CAPSICUM_NEXT_SWEEP_AUTONOMOUS_AGENT_PROMPT.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/DATA_MODEL_AND_MIGRATION_REPORT.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/FILE_CHANGE_LEDGER.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/NEXT_SWEEP_FINAL_REPORT.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/NEXT_SWEEP_HANDOFF_SHA256SUMS.txt` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/NEXT_SWEEP_SOURCE_SHA256SUMS.txt` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/OPERATIONS_BACKUP_RESTORE_RUNBOOK.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/SCIENTIFIC_AUTHORITY_AND_MODEL_GATES.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/SECURITY_AND_THREAT_MODEL.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `docs/next-sweep-validation.json` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Added | `packages/application/package.json` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/auth-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/breeding-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/catalog-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/export-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/index.test.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/index.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/internal.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/media-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/observation-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/operations-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/phenotype-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/research-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/src/simulation-service.ts` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/application/tsconfig.json` | Application services | Canonical authenticated persistence-backed domain orchestration. |
| Added | `packages/contracts/src/platform.ts` | Contracts | Versioned runtime input/output validation and shared types. |
| Added | `packages/database/migrations/0003_authenticated_mvp.sql` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Added | `packages/database/migrations/0004_runtime_authority_guards.sql` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Added | `packages/database/migrations/0005_durable_worker_runtime.sql` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Added | `packages/database/migrations/0006_membership_bound_rls.sql` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Added | `packages/database/scripts/import-catalog.mjs` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Added | `packages/database/scripts/migrate.mjs` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Added | `packages/database/scripts/provision-roles.mjs` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Added | `packages/database/scripts/verify-authority.mjs` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Modified | `.env.example` | Platform | Integrated build, environment, or repository configuration. |
| Modified | `README.md` | Platform | Integrated build, environment, or repository configuration. |
| Modified | `apps/web/Dockerfile` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/package.json` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/admin/audit/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/admin/jobs/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/admin/models/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/admin/system/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/ai/page.tsx` | Evidence / AI | Approved-evidence retrieval, audit, citation validation, and abstention. |
| Modified | `apps/web/src/app/annotations/page.tsx` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Modified | `apps/web/src/app/api/simulations/exact/route.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/api/system/readiness/route.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/breeding-ledger/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/catalog/claims/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/catalog/loci/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/catalog/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/catalog/releases/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/crosses/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/crosses/new/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/crosses/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/dashboard/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/experiments/[id]/page.tsx` | Experiments / observations | Typed experiment, observation, and correction workflows. |
| Modified | `apps/web/src/app/experiments/page.tsx` | Experiments / observations | Typed experiment, observation, and correction workflows. |
| Modified | `apps/web/src/app/families/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/germplasm/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/germplasm/new/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/germplasm/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/layout.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/observations/session/[id]/page.tsx` | Experiments / observations | Typed experiment, observation, and correction workflows. |
| Modified | `apps/web/src/app/onboarding/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/pedigrees/[materialId]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/phenotype-capture/page.tsx` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Modified | `apps/web/src/app/phenotypes/images/[id]/page.tsx` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Modified | `apps/web/src/app/phenotypes/images/page.tsx` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Modified | `apps/web/src/app/plants/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/plants/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/reports/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/research-assistant/page.tsx` | Evidence / AI | Approved-evidence retrieval, audit, citation validation, and abstention. |
| Modified | `apps/web/src/app/research/review/page.tsx` | Evidence / AI | Approved-evidence retrieval, audit, citation validation, and abstention. |
| Modified | `apps/web/src/app/scientific-catalog/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/seed-lots/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/seed-lots/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/selection-plans/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/selection-plans/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/settings/users/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/settings/workspace/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/sign-in/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/simulation-lab/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/simulation-lab/simulation-form.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/simulations/[id]/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/simulations/new/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/app/simulations/page.tsx` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `apps/web/src/lib/environment.ts` | Web application | Authenticated operator workflow, API boundary, or presentation support. |
| Modified | `docs/BUILD_MANIFEST.json` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/EXECUTION_MEMO.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/FILE_INVENTORY.txt` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/FINAL_REPORT.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/RELEASE_BLOCKERS.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/ROADMAP.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/ROUTE_INVENTORY.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/SCIENTIFIC_LIMITATIONS.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/VALIDATION_REPORT.md` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `docs/repository-validation.json` | Evidence / documentation | Release truth, traceability, scientific limits, checksum, or generated inventory. |
| Modified | `infra/backup/backup.sh` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Modified | `infra/backup/restore-test.sh` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Modified | `infra/compose/docker-compose.yml` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Modified | `package.json` | Platform | Integrated build, environment, or repository configuration. |
| Modified | `packages/auth/package.json` | Identity / security | Authentication, permissions, session, or request-boundary hardening. |
| Modified | `packages/auth/src/index.test.ts` | Identity / security | Authentication, permissions, session, or request-boundary hardening. |
| Modified | `packages/auth/src/index.ts` | Identity / security | Authentication, permissions, session, or request-boundary hardening. |
| Modified | `packages/config/src/index.ts` | Platform | Integrated build, environment, or repository configuration. |
| Modified | `packages/contracts/src/index.ts` | Contracts | Versioned runtime input/output validation and shared types. |
| Modified | `packages/database/package.json` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Modified | `packages/database/src/index.ts` | Database / operations | Authority schema, roles, workers, deployment, or recovery controls. |
| Modified | `packages/genetics-advanced/src/monte-carlo.ts` | Scientific computation | Exact, linked, uncertainty, stochastic, or provenance correctness. |
| Modified | `packages/observability/src/index.test.ts` | Experiments / observations | Typed experiment, observation, and correction workflows. |
| Modified | `packages/observability/src/index.ts` | Experiments / observations | Typed experiment, observation, and correction workflows. |
| Modified | `packages/storage/package.json` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Modified | `packages/storage/src/index.test.ts` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Modified | `packages/storage/src/index.ts` | Media / phenotype | Governed upload, capture, quality, annotation, or model boundary. |
| Modified | `scripts/validate_repository.py` | Validation / tooling | Repository or catalog validation automation. |

No baseline files were deleted. Existing source-handoff materials were preserved.
