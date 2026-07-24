# V6 File Change Ledger

Baseline files: **500**. Delivered repository files: **587**. Created: **87**. Modified: **39**. Deleted: **0**.

Ledger files intentionally omit their own recursive final hash in the machine-readable ledger. Final repository hashes are in `docs/V6_SHA256SUMS.txt`.

| Status | Path | Owner | Rationale |
|---|---|---|---|
| created | `apps/web/e2e/authenticated-journeys.spec.ts` | Web experience / security | Connects secure browser workflows and bounded mutation/upload paths. |
| created | `apps/web/src/components/streaming-media-upload-form.tsx` | Storage / worker security | Replaces buffered uploads with bounded disk-backed streaming. |
| created | `apps/web/src/components/streaming-research-upload-form.tsx` | Storage / worker security | Replaces buffered uploads with bounded disk-backed streaming. |
| created | `apps/web/src/lib/bounded-upload.ts` | Storage / worker security | Replaces buffered uploads with bounded disk-backed streaming. |
| created | `apps/web/src/lib/safe-redirect.test.ts` | Web experience / security | Closes redirect and response-hardening defects. |
| created | `apps/web/src/lib/safe-redirect.ts` | Web experience / security | Closes redirect and response-hardening defects. |
| created | `apps/web/src/proxy.test.ts` | Web experience / security | Closes redirect and response-hardening defects. |
| created | `apps/worker-node/src/clamav.integration.test.ts` | Storage / worker security | Defines real object-storage/malware integration evidence. |
| created | `docs/V6_ACCEPTANCE_TRACEABILITY.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/V6_BASELINE_REPORT.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/V6_DATA_MODEL_AND_MIGRATION_REPORT.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/V6_FILE_CHANGE_LEDGER.md` | Release evidence / documentation | Human-readable V5-to-V6 change ledger. |
| created | `docs/V6_FINAL_REPORT.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/V6_OPERATIONS_BACKUP_RESTORE_RUNBOOK.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/V6_RELEASE_BLOCKERS.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/V6_SCIENTIFIC_AUTHORITY_AND_MODEL_GATES.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/V6_SECURITY_AND_THREAT_MODEL.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/V6_SHA256SUMS.txt` | Release evidence / documentation | Final repository SHA-256 manifest; excludes itself. |
| created | `docs/V6_VALIDATION_REPORT.md` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/evidence/README.md` | Release evidence / documentation | Created for V6 correctness and production-proof scope. |
| created | `docs/v4-evidence/README.md` | Release evidence / documentation | Created for V6 correctness and production-proof scope. |
| created | `docs/v5-evidence/README.md` | Release evidence / documentation | Created for V6 correctness and production-proof scope. |
| created | `docs/v6-acceptance-traceability.json` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/v6-baseline.json` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `docs/v6-deletion-manifest.json` | Release evidence / documentation | Machine-readable confirmation that V6 deletes no V5 paths. |
| created | `docs/v6-evidence/README.md` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/backup-portability.exit` | Release evidence / documentation | Makes backup/restore relocatable and content-reconciled. |
| created | `docs/v6-evidence/backup-portability.txt` | Release evidence / documentation | Makes backup/restore relocatable and content-reconciled. |
| created | `docs/v6-evidence/catalog-reconciliation.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/catalog-reconciliation.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/environment-contracts.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/environment-contracts.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/environment.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/genetics-smoke.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/genetics-smoke.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/migration-manifest.exit` | Release evidence / documentation | Generated canonical migration/routine identity used by runtime validation. |
| created | `docs/v6-evidence/migration-manifest.txt` | Release evidence / documentation | Generated canonical migration/routine identity used by runtime validation. |
| created | `docs/v6-evidence/migration-utils.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/migration-utils.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/node-script-syntax.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/node-script-syntax.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/python-worker.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/python-worker.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/registry-install.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/registry-install.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/repository-validator.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/repository-validator.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/routine-manifest.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/routine-manifest.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/runtime-smoke.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/runtime-smoke.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/shell-syntax.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/shell-syntax.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/typescript-parser.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/typescript-parser.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/yaml-validation.exit` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-evidence/yaml-validation.txt` | Release evidence / documentation | Generated local validation evidence; explicitly non-release-authoritative. |
| created | `docs/v6-file-change-ledger.json` | Release evidence / documentation | Machine-readable V5-to-V6 change ledger. |
| created | `docs/v6-file-inventory.json` | Release evidence / documentation | Machine-readable final file inventory; excludes itself and checksum manifest. |
| created | `docs/v6-repository-manifest.json` | Release evidence / documentation | Machine-readable release scope and verdict. |
| created | `docs/v6-route-inventory.json` | Release evidence / documentation | Machine-readable web page/API route inventory. |
| created | `docs/v6-validation-results.json` | Release evidence / documentation | Required V6 report or machine-readable release evidence. |
| created | `infra/backup/authoritative-tables.tsv` | Database / operations | Makes backup/restore relocatable and content-reconciled. |
| created | `infra/backup/authority-snapshot.sh` | Database / operations | Makes backup/restore relocatable and content-reconciled. |
| created | `infra/backup/checksum-portability.test.sh` | Database / operations | Makes backup/restore relocatable and content-reconciled. |
| created | `packages/ai/src/evaluation-corpus.json` | AI governance | Adds versioned adversarial hosted-AI evaluation and support checks. |
| created | `packages/ai/src/evaluation.test.ts` | AI governance | Adds versioned adversarial hosted-AI evaluation and support checks. |
| created | `packages/ai/src/evaluation.ts` | AI governance | Adds versioned adversarial hosted-AI evaluation and support checks. |
| created | `packages/application/src/admission-service.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| created | `packages/application/src/postgres.integration.test.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| created | `packages/application/src/upload-reconciliation-service.ts` | Storage / worker security | Adds canonical admission, reconciliation or integration behavior. |
| created | `packages/database/migrations/0028_v6_pending_object_reconciliation.sql` | Database / operations | Adds pending-object authority and durable reconciliation. |
| created | `packages/database/migrations/0029_v6_storage_cleanup_preview_and_reference_guard.sql` | Database / operations | Adds dry-run cleanup, bounded prefix discovery, retention and authoritative-reference guards. |
| created | `packages/database/scripts/migration-utils.mjs` | Database / operations | Strengthens migration/readiness/authority behavior. |
| created | `packages/database/scripts/migration-utils.test.mjs` | Database / operations | Strengthens migration/readiness/authority behavior. |
| created | `packages/database/scripts/verify-migration-atomicity.mjs` | Database / operations | Strengthens migration/readiness/authority behavior. |
| created | `packages/database/scripts/verify-v6-integration.mjs` | Database / operations | Strengthens migration/readiness/authority behavior. |
| created | `packages/database/src/generated/migration-manifest.json` | Database / operations | Generated canonical migration/routine identity used by runtime validation. |
| created | `packages/database/src/generated/routine-grants.json` | Database / operations | Generated canonical migration/routine identity used by runtime validation. |
| created | `packages/database/src/migration-manifest.ts` | Database / operations | Generated canonical migration/routine identity used by runtime validation. |
| created | `packages/storage/src/minio.integration.test.ts` | Storage / worker security | Defines real object-storage/malware integration evidence. |
| created | `scripts/ci/check-environment-contracts.mjs` | Validation / generated-source tooling | Adds behavioral validation or generated manifest/evidence tooling. |
| created | `scripts/ci/generate-release-evidence.mjs` | Validation / generated-source tooling | Adds behavioral validation or generated manifest/evidence tooling. |
| created | `scripts/ci/run-genetics-runtime-smoke.mjs` | Validation / generated-source tooling | Adds behavioral validation or generated manifest/evidence tooling. |
| created | `scripts/ci/run-v6-runtime-smoke.mjs` | Validation / generated-source tooling | Adds behavioral validation or generated manifest/evidence tooling. |
| created | `scripts/generate-migration-manifest.mjs` | Validation / generated-source tooling | Generated canonical migration/routine identity used by runtime validation. |
| created | `scripts/generate-routine-manifest.mjs` | Validation / generated-source tooling | Adds behavioral validation or generated manifest/evidence tooling. |
| modified | `.env.example` | Platform | Modified for V6 correctness and production-proof scope. |
| modified | `.github/workflows/ci.yml` | CI / deployment | Expands reproducible CI, integration, browser, scan, SBOM and restore gates. |
| modified | `apps/web/src/app/actions.ts` | Web experience / security | Connects secure browser workflows and bounded mutation/upload paths. |
| modified | `apps/web/src/app/admin/jobs/page.tsx` | Web experience / security | Connects secure browser workflows and bounded mutation/upload paths. |
| modified | `apps/web/src/app/api/media/upload/route.ts` | Storage / worker security | Connects secure browser workflows and bounded mutation/upload paths. |
| modified | `apps/web/src/app/api/research/upload/route.ts` | Storage / worker security | Connects secure browser workflows and bounded mutation/upload paths. |
| modified | `apps/web/src/app/phenotypes/images/page.tsx` | Web experience / security | Connects secure browser workflows and bounded mutation/upload paths. |
| modified | `apps/web/src/app/research/page.tsx` | Web experience / security | Connects secure browser workflows and bounded mutation/upload paths. |
| modified | `apps/web/src/lib/environment.ts` | Web experience / security | Connects secure browser workflows and bounded mutation/upload paths. |
| modified | `apps/web/src/proxy.ts` | Web experience / security | Closes redirect and response-hardening defects. |
| modified | `apps/worker-node/package.json` | Storage / worker security | Adds bounded streaming, cleanup, scanner and durable worker behavior. |
| modified | `apps/worker-node/src/media-processing.ts` | Storage / worker security | Adds bounded streaming, cleanup, scanner and durable worker behavior. |
| modified | `apps/worker-node/src/worker.ts` | Storage / worker security | Adds bounded streaming, cleanup, scanner and durable worker behavior. |
| modified | `apps/worker-python/worker.py` | Platform | Hardens isolated deterministic vision resource limits. |
| modified | `docs/repository-validation.json` | Release evidence / documentation | Modified for V6 correctness and production-proof scope. |
| modified | `infra/backup/backup.sh` | Database / operations | Makes backup/restore relocatable and content-reconciled. |
| modified | `infra/backup/restore-test.sh` | Database / operations | Makes backup/restore relocatable and content-reconciled. |
| modified | `infra/compose/docker-compose.yml` | CI / deployment | Modified for V6 correctness and production-proof scope. |
| modified | `package.json` | Platform | Modified for V6 correctness and production-proof scope. |
| modified | `packages/ai/package.json` | AI governance | Modified for V6 correctness and production-proof scope. |
| modified | `packages/ai/src/hosted.ts` | AI governance | Modified for V6 correctness and production-proof scope. |
| modified | `packages/application/src/advanced-simulation-service.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| modified | `packages/application/src/export-service.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| modified | `packages/application/src/index.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| modified | `packages/application/src/media-service.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| modified | `packages/application/src/operations-service.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| modified | `packages/application/src/research-service.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| modified | `packages/application/src/simulation-service.ts` | Application services | Adds canonical admission, reconciliation or integration behavior. |
| modified | `packages/config/src/index.test.ts` | Platform | Enforces fail-closed production environment and hosted-AI cost policy. |
| modified | `packages/config/src/index.ts` | Platform | Enforces fail-closed production environment and hosted-AI cost policy. |
| modified | `packages/contracts/src/platform.ts` | Platform | Adds governed versioned operation contracts. |
| modified | `packages/database/package.json` | Database / operations | Strengthens migration/readiness/authority behavior. |
| modified | `packages/database/scripts/migrate.mjs` | Database / operations | Strengthens migration/readiness/authority behavior. |
| modified | `packages/database/scripts/verify-authority.mjs` | Database / operations | Strengthens migration/readiness/authority behavior. |
| modified | `packages/database/src/index.ts` | Database / operations | Strengthens migration/readiness/authority behavior. |
| modified | `packages/storage/package.json` | Storage / worker security | Corrects S3 signing/streaming/listing and immutable object behavior. |
| modified | `packages/storage/src/index.test.ts` | Storage / worker security | Corrects S3 signing/streaming/listing and immutable object behavior. |
| modified | `packages/storage/src/index.ts` | Storage / worker security | Corrects S3 signing/streaming/listing and immutable object behavior. |
| modified | `scripts/validate_repository.py` | Validation / generated-source tooling | Adds behavioral validation or generated manifest/evidence tooling. |
