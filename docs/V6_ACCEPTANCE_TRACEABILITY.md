# V6 Acceptance Traceability

Status vocabulary:

- **local_pass** — executed successfully on this host.
- **implemented_unproven** — source, test and CI path exist, but required infrastructure was unavailable.
- **blocked_external** — depends on unavailable tooling/service.
- **scientific_abstention** — intentionally unavailable without approved evidence/model.

| Requirement | Implementation | Executable evidence | Status / blocker |
|---|---|---|---|
| Actual-method SigV4 and immutable storage | `packages/storage/src/index.ts` | `packages/storage/src/index.test.ts`; `minio.integration.test.ts`; `docs/v6-evidence/runtime-smoke.txt` | local_pass for deterministic/local; MinIO implemented_unproven |
| Exact migration identity | generated migration manifest; `packages/database/src/index.ts`; web readiness | manifest checks; repository validator | local_pass source; PG implemented_unproven |
| Exact routine/role authority | generated routine grants; `verify-authority.mjs` | `verify-v6-integration.mjs`; CI PG job | implemented_unproven: PostgreSQL absent |
| Legitimate frozen graph | Node/pnpm pins in manifests, Docker and CI | `docs/v6-evidence/registry-install.txt` | blocked_external: registry DNS; no fabricated lockfile |
| Crash-atomic migration | `migration-utils.mjs`; `migrate.mjs` | `migration-utils.test.mjs`; `verify-migration-atomicity.mjs` | local_pass utility; PG crash proof implemented_unproven |
| Safe internal redirects | `apps/web/src/lib/safe-redirect.ts`; proxy hardening | runtime smoke; unit tests | local_pass source/runtime; browser implemented_unproven |
| Headers on redirects and normal responses | `apps/web/src/proxy.ts` | proxy tests; Playwright CI | implemented_unproven: browser absent |
| Object/DB coordination | migrations `0028`–`0029`; upload-reconciliation service | repository validator; V6 PG integration definition | local_pass source; PG/MinIO implemented_unproven |
| Cleanup dry run and deletion safeguards | worker cleanup handler; `/admin/jobs`; reference-count functions | runtime prefix-list smoke; PG integration definition | local_pass source/local storage; PG/MinIO implemented_unproven |
| Portable backup and content restore | `infra/backup/*` | `docs/v6-evidence/backup-portability.txt`; CI isolated restore job | local_pass fixtures; real restore implemented_unproven |
| Real application concurrency | `packages/application/src/postgres.integration.test.ts` | CI PostgreSQL job | implemented_unproven |
| Restricted roles and cross-workspace denial | RLS/grants; `verify-authority.mjs`; `verify-v6-integration.mjs` | CI PostgreSQL job | implemented_unproven |
| Browser/accessibility matrix | Playwright configuration and authenticated role/viewport journeys | CI browser job | implemented_unproven |
| Durable shared admission | `packages/application/src/admission-service.ts` and service integrations | service tests/validator | source local_pass; PG concurrency implemented_unproven |
| Bounded media execution | streamed upload/object materialization; worker/container limits; ClamAV/Python | eight Python tests; ClamAV integration test; Compose limits | Python local_pass; integrated containers unproven |
| Hosted AI safety | evaluation corpus/policy, cost ceilings, fallback, citation revalidation | AI tests and environment reconciliation | source local_pass; provider execution intentionally optional |
| Exact genetics | `packages/genetics-core`; simulation services | `docs/v6-evidence/genetics-smoke.txt` | local_pass |
| Weighted uncertainty | contracts/core/UI | genetics smoke | local_pass |
| Linkage and phase | `packages/genetics-advanced`; governed laboratory | genetics smoke | local_pass |
| Maternal direction | genetics core/advanced and persistence snapshots | genetics smoke | local_pass |
| Direct Monte Carlo | worker thread sampler; immutable request/result | genetics smoke; worker/PG tests defined | local_pass algorithm; persistence unproven |
| Conditional rules/host–pathogen | approved release/rule applicability gates | genetics smoke abstention | local_pass abstention; zero approved rules |
| Selection and observed segregation | selection services/migrations/UI | genetics smoke | local_pass algorithm; PG lifecycle unproven |
| Scientific catalog integrity | importer, review/release lifecycle, normalized memberships | catalog reconciliation; validator | local_pass source; PG workflow unproven |
| Observation and measurement revisions | approved protocols/definitions; stale-predecessor DB functions | authority tests defined; validator | implemented_unproven: PG absent |
| Historical immutability | DB triggers/functions and immutable hashes | authority verifier definitions | implemented_unproven: PG absent |
| Unsupported quantitative/learned claims | explicit unavailable states/model promotion gates | scientific model-gate report; validator | scientific_abstention |
| Commit-bound evidence | `scripts/ci/generate-release-evidence.mjs`; evidence policy | CI artifact job | implemented_unproven outside CI |
| Security scans and SBOM | CI CodeQL/Gitleaks/audit/license/Trivy/SPDX jobs | workflow definition | blocked_external on frozen graph/images |
