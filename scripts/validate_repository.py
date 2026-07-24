#!/usr/bin/env python3
"""Dependency-free repository, security-boundary, and scientific-safety validation."""
from __future__ import annotations

import ast
from collections import Counter
import json
import hashlib
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
issues: list[str] = []
warnings: list[str] = []
checks: list[dict[str, object]] = []


def check(name: str, condition: bool, detail: str) -> None:
    checks.append({"name": name, "passed": condition, "detail": detail})
    if not condition:
        issues.append(f"{name}: {detail}")


def warning(name: str, condition: bool, detail: str) -> None:
    checks.append({"name": name, "passed": condition, "blocking": False, "detail": detail})
    if not condition:
        warnings.append(f"{name}: {detail}")


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


package_files = sorted([*ROOT.glob("packages/*/package.json"), *ROOT.glob("apps/*/package.json")])
package_names = [json.loads(text(path))["name"] for path in package_files]
check("package-names-unique", len(package_names) == len(set(package_names)), f"{len(package_names)} manifests inspected")

workspace_graph: dict[str, set[str]] = {}
for manifest_path in package_files:
    manifest = json.loads(text(manifest_path))
    package_name = manifest["name"]
    declared = set(manifest.get("dependencies", {})) | set(manifest.get("devDependencies", {})) | set(manifest.get("peerDependencies", {}))
    imported: set[str] = set()
    source_root = manifest_path.parent / "src"
    if source_root.is_dir():
        for source_path in source_root.rglob("*"):
            if source_path.suffix not in {".ts", ".tsx"}:
                continue
            for found in re.findall(r"""(?:from\s+|import\s+)["'](@capsicum/[^"']+)["']""", text(source_path)):
                imported.add("/".join(found.split("/")[:2]))
    missing = sorted(item for item in imported if item != package_name and item not in declared)
    check(f"workspace-dependencies:{package_name}", not missing, f"undeclared workspace imports: {missing}")
    workspace_graph[package_name] = {item for item in declared if item.startswith("@capsicum/")}


def graph_has_cycle(graph: dict[str, set[str]]) -> bool:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> bool:
        if node in visiting:
            return True
        if node in visited:
            return False
        visiting.add(node)
        if any(dependency in graph and visit(dependency) for dependency in graph.get(node, set())):
            return True
        visiting.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in graph)


check("workspace-dependency-acyclic", not graph_has_cycle(workspace_graph), "workspace graph must be acyclic")
check("no-compiled-js-in-source", not list(ROOT.glob("packages/*/src/**/*.js")), "no emitted JS may live beside TypeScript source")

migration_paths = sorted((ROOT / "packages/database/migrations").glob("*.sql"))
migration_manifest_path = ROOT / "packages/database/src/generated/migration-manifest.json"
manifest_document = json.loads(text(migration_manifest_path)) if migration_manifest_path.is_file() else {"migrations": []}
manifest_migrations = manifest_document.get("migrations", [])
expected_migrations = [item.get("version") for item in manifest_migrations if isinstance(item, dict)]
actual_migrations = [path.name for path in migration_paths]
check("migration-manifest-present", migration_manifest_path.is_file(), "generated migration manifest is required")
check("migration-sequence", actual_migrations == expected_migrations, f"migration directory and generated manifest must match exactly ({len(actual_migrations)} files)")
manifest_checksums = {item.get("version"): item.get("checksum") for item in manifest_migrations if isinstance(item, dict)}
for path in migration_paths:
    actual_checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    check(f"migration-checksum:{path.name}", manifest_checksums.get(path.name) == actual_checksum, "generated migration checksum must match source SQL")
check("migration-generated-typescript", "MIGRATION_MANIFEST" in text(ROOT / "packages/database/src/migration-manifest.ts"), "runtime migration identity must use the generated manifest")
migrations = {path.name: text(path) for path in migration_paths}
for name in expected_migrations:
    check(f"migration-present:{name}", name in migrations, "required migration")
for name, sql in migrations.items():
    check(f"sql-transaction:{name}", sql.count("BEGIN;") == 1 and sql.count("COMMIT;") == 1, "one explicit transaction")
    for table_name, body in re.findall(r"CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\((.*?)\n\);", sql, re.DOTALL | re.IGNORECASE):
        columns: list[str] = []
        for line in body.splitlines():
            match = re.match(r"^\s{2}([a-z_][a-z0-9_]*)\s+", line, re.IGNORECASE)
            if not match:
                continue
            candidate = match.group(1).lower()
            if candidate not in {"unique", "foreign", "primary", "check", "constraint", "exclude"}:
                columns.append(candidate)
        duplicates = sorted(column for column, count in Counter(columns).items() if count > 1)
        check(f"sql-columns-unique:{name}:{table_name}", not duplicates, f"duplicate columns: {duplicates}")

required_sql_markers = {
    "0001_foundation.sql": [
        "FORCE ROW LEVEL SECURITY", "simulation_runs_immutable", "pedigree_edges_reject_cycles",
        "phenotype_rules_require_approved_evidence", "require_independent_scientific_approval",
        "scientific_reviews_append_only", "CREATE TYPE pollination_method",
    ],
    "0002_operations_and_observations.sql": [
        "CREATE TABLE jobs", "CREATE TABLE transactional_outbox", "CREATE TABLE observation_revisions",
        "CREATE TABLE model_versions", "jobs_claim_idx", "jobs_lease_expiry_idx",
    ],
    "0003_authenticated_mvp.sql": [
        "CREATE TABLE user_credentials", "CREATE TABLE auth_sessions", "CREATE TABLE workspace_invitations",
        "CREATE TABLE genotype_calls", "CREATE TABLE cross_events", "CREATE TABLE phenotype_annotations",
        "CREATE TABLE ai_interactions", "CREATE TABLE export_jobs", "CREATE ROLE capsicum_runtime",
        "active_membership_visibility", "membership_workspace_isolation",
    ],
    "0004_runtime_authority_guards.sql": [
        "guard_runtime_catalog_record_write", "guard_runtime_scientific_review_write",
        "guard_runtime_catalog_publication_write", "phenotype_annotations_append_only",
        "model_versions_immutable_after_validation", "REVOKE INSERT, UPDATE, DELETE ON catalog_import_batches",
    ],
    "0005_durable_worker_runtime.sql": [
        "CREATE ROLE capsicum_worker", "FOR UPDATE SKIP LOCKED", "app_claim_job", "app_heartbeat_job",
        "app_recover_expired_jobs", "app_claim_outbox", "app_recover_expired_outbox",
        "REVOKE ALL ON FUNCTION app_claim_job(text, text[], integer) FROM capsicum_runtime",
    ],
    "0030_v7_session_mfa_assurance.sql": [
        "mfa_verified_at", "auth_sessions_mfa_verified_after_creation_check",
    ],
    "0031_v8_scientific_export_provenance.sql": [
        "transaction_timestamp()", "softwareReleaseIdentifier", "scientificProfile",
        "sectionCounts", "schemaVersion', '3.1",
    ],
    "0006_membership_bound_rls.sql": [
        "app_workspace_access_allowed", "app_valid_invitation_context", "app_membership_write_allowed",
        "active_membership_workspace_isolation", "membership_insert_authority",
        "guard_runtime_membership_mutation", "workspace membership identity is immutable",
    ],
    "0007_v3_biological_identity_and_cross_authority.sql": [
        "cross_operational_state", "cross_verification_state", "CREATE TABLE breeding_material_identities",
        "CREATE TABLE inventory_reservations", "app_record_cross_verification",
        "app_review_cross_verification", "app_complete_cross_harvest",
    ],
    "0008_v3_genotype_observation_and_simulation_authority.sql": [
        "CREATE TABLE catalog_alleles", "CREATE TABLE catalog_assays",
        "genotype_calls_current_locus_idx", "guard_genotype_call_history",
        "observation_authority", "simulation_calculation_authority",
    ],
    "0009_v3_runtime_media_research_and_auth_hardening.sql": [
        "app_consume_rate_limit", "CREATE TABLE password_reset_tokens",
        "CREATE TABLE media_inspections", "CREATE TABLE immutable_artifacts",
    ],
    "0010_v3_canonical_session_and_runtime_authority.sql": [
        "app_transition_observation_session", "app_resolve_material_label",
        "guard_observation_session_authority",
    ],
    "0011_v3_auth_idempotency_and_token_lifecycle.sql": [
        "CREATE TABLE public_idempotency_records", "delivery_state text",
        "app_mark_password_reset_delivery",
    ],
    "0012_v3_worker_media_export_and_annotation_authority.sql": [
        "app_worker_record_heartbeat", "app_worker_complete_media_inspection",
        "app_worker_breeding_ledger_snapshot", "app_worker_complete_export",
        "guard_runtime_export_authority_mutation",
    ],
    "0013_v3_research_and_label_authority.sql": [
        "public_token", "app_resolve_material_label_token",
        "app_review_research_document", "app_review_research_passage",
        "research_document_reviews_append_only",
    ],
    "0014_v3_runtime_privilege_closure.sql": [
        "ALTER DEFAULT PRIVILEGES", "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC",
        "REVOKE INSERT, UPDATE, DELETE ON TABLE media_inspections",
        "REVOKE INSERT, UPDATE, DELETE ON TABLE immutable_artifacts",
        "REVOKE INSERT, UPDATE, DELETE ON TABLE model_versions",
    ],
    "0015_v4_auth_abuse_and_public_idempotency.sql": [
        "app_record_failed_signin", "public_idempotency_terminal_contract_check",
        "rate_limit_buckets_hmac_key_check", "last_successful_login_at",
    ],
    "0016_v4_selection_plan_scientific_snapshot.sql": [
        "target_expression", "population_calculation", "generation_plan",
        "reject_selection_plan_snapshot_mutation", "selection_plans_probability_not_guarantee_check",
    ],
    "0017_v4_catalog_release_lifecycle.sql": [
        "release_review_state", "catalog_release_sources", "catalog_release_assemblies",
        "catalog_release_passages", "require_independent_catalog_release_review",
        "every V4 release locus requires at least one normalized allele",
    ],
    "0018_v4_normalized_catalog_authoring.sql": [
        "guard_runtime_catalog_record_write", "guard_runtime_allele_alias_write",
        "scientific catalog versions are append-only",
    ],
    "0019_v4_inventory_truth_and_exception_authority.sql": [
        "remaining_quantity", "inventory_exception_requests",
        "guard_inventory_exception_request", "reservation_expired",
    ],
    "0020_v4_observation_protocol_and_method_authority.sql": [
        "CREATE TABLE observation_methods", "CREATE TABLE observation_quality_terms",
        "CREATE TABLE observation_device_schemas", "validate_authoritative_observation_revision_v4",
        "catalog_release_observation_methods",
    ],
    "0021_v4_selection_plan_lifecycle_and_outcomes.sql": [
        "CREATE TABLE selection_plan_transitions", "app_transition_selection_plan",
        "selection_plan_transitions_append_only", "selection plan author cannot approve their own plan",
        "selection plan lifecycle may only change through app_transition_selection_plan",
    ],
    "0022_v4_selection_plan_observed_reconciliation.sql": [
        "CREATE TABLE selection_plan_reconciliations", "selection_plan_reconciliations_immutable",
        "observed segregation reconciliations are immutable", "source_simulation_content_hash",
    ],
}
for name, markers in required_sql_markers.items():
    sql = migrations.get(name, "")
    for marker in markers:
        check(f"sql-marker:{name}:{marker}", marker in sql, "required authority/operability marker")

expected_count_source = text(ROOT / "packages/database/src/index.ts")
check("expected-migration-manifest", "MIGRATION_MANIFEST" in expected_count_source and "EXPECTED_SCHEMA_MIGRATIONS = MIGRATION_MANIFEST.length" in text(ROOT / "packages/database/src/migration-manifest.ts"), "runtime readiness must derive exact migration identity from the generated manifest")

reconciliation = json.loads(text(ROOT / "docs/catalog-reconciliation.json"))
check("catalog-reconciliation", reconciliation.get("passed") is True, "catalog staging validation must pass")
record_counts = {item["file"]: item["recordCount"] for item in reconciliation.get("files", [])}
check("catalog-loci-count", record_counts.get("Locus_Catalog.csv") == 22, "expected 22 locus records")
check("catalog-claims-count", record_counts.get("Evidence_Claims.csv") == 22, "expected 22 evidence claims")
check("catalog-sources-count", record_counts.get("Sources.csv") == 30, "expected 30 sources")
check("catalog-rules-disabled", reconciliation.get("activatedExecutableRules") == 0, "seed catalog must activate zero executable rules")

auth_source = text(ROOT / "packages/auth/src/index.ts")
for helper in ["export function hasPermission", "export function requirePermission", "export function isIndependentCatalogReviewer"]:
    check(f"auth-helper:{helper}", helper in auth_source, "authorization helper required by application and web boundaries")
segregation_source = text(ROOT / "packages/genetics-advanced/src/segregation.ts")
for marker in ["exact_binomial", "chi_square", "insufficient_for_supported_test", "adjustPValuesHolm"]:
    check(f"segregation-analysis:{marker}", marker in segregation_source, "bounded observed-segregation analysis marker")
check("segregation-no-locale-ordering", "localeCompare" not in segregation_source, "scientific serialization and test ordering must not depend on process locale")

required_routes = {
    ".", "sign-in", "onboarding", "accept-invitation", "dashboard", "breeding-ledger",
    "germplasm", "germplasm/new", "germplasm/[id]", "seed-lots", "seed-lots/[id]",
    "plants", "plants/[id]", "crosses", "crosses/new", "crosses/[id]", "families/[id]",
    "pedigrees/[materialId]", "simulations", "simulations/new", "simulations/[id]", "simulation-lab",
    "selection-plans", "selection-plans/[id]", "experiments", "experiments/[id]",
    "observations/session/[id]", "phenotypes/images", "phenotypes/images/[id]", "phenotype-capture",
    "phenotype-capture/[id]", "annotations", "catalog", "scientific-catalog", "catalog/loci/[id]",
    "catalog/claims/[id]", "catalog/releases/[id]", "research-assistant", "research/sources/[id]",
    "research/review", "ai", "reports", "help", "quick-genetics", "settings/security",
    "settings/sessions", "settings/workspace", "settings/users", "admin/jobs",
    "admin/models", "admin/audit", "admin/system",
}
route_names = {str(path.parent.relative_to(ROOT / "apps/web/src/app")) for path in (ROOT / "apps/web/src/app").glob("**/page.tsx")}
for expected in sorted(required_routes):
    check(f"route:{expected}", expected in route_names, "required product route")
check("route-map-complete", required_routes <= route_names, f"{len(required_routes)} required; {len(route_names)} total")

required_api = {
    "api/health", "api/health/liveness", "api/health/readiness", "api/system/readiness",
    "api/simulations/exact", "api/simulations/advanced", "api/media/upload", "api/media/[id]",
    "api/research/upload", "api/media/[id]/derivative/[type]",
    "api/exports/breeding-ledger", "api/exports/[id]",
}
for expected in sorted(required_api):
    check(f"api-route:{expected}", (ROOT / "apps/web/src/app" / expected / "route.ts").is_file(), "required API boundary")

security_files = {
    "session": ROOT / "apps/web/src/lib/session.ts",
    "proxy": ROOT / "apps/web/src/proxy.ts",
    "readiness": ROOT / "apps/web/src/lib/environment.ts",
    "storage": ROOT / "packages/storage/src/index.ts",
}
for name, path in security_files.items():
    check(f"security-file:{name}", path.is_file(), str(path.relative_to(ROOT)))
proxy = text(security_files["proxy"])
for marker in ["Content-Security-Policy", "Strict-Transport-Security", "frame-ancestors 'none'", "capsicum_session"]:
    check(f"proxy-security:{marker}", marker in proxy, "required browser security control")
for public_path in [
    "/forgot-password", "/reset-password",
    "/api/auth/invitation/exchange", "/api/auth/password-reset/exchange",
    "/api/health", "/api/health/liveness", "/api/health/readiness",
]:
    check(f"proxy-public-path:{public_path}", repr(public_path) in proxy, "public recovery or health path must not be intercepted by session redirects")
session = text(security_files["session"])
for marker in ["httpOnly: true", "sameSite: 'strict'", "secure: process.env.APP_MODE === 'production'"]:
    check(f"session-cookie:{marker}", marker in session, "required secure cookie attribute")
for marker in ["mfaVerifiedAt", "allowUnverifiedMfa", "REQUIRE_PRIVILEGED_MFA"]:
    check(f"session-mfa:{marker}", marker in session, "privileged sessions require explicit MFA assurance")
readiness = text(security_files["readiness"])
check("readiness-no-secret-serialization", "...parsed.data" not in readiness and "config: parsed.data" not in readiness and "environment: parsed.data" not in readiness, "readiness output must not serialize parsed environment values")
credential_delivery = text(ROOT / "apps/web/src/lib/credential-delivery.ts")
actions_source = text(ROOT / "apps/web/src/app/actions.ts")
for marker in ["flag: 'wx'", "mode: 0o600", "chmod(spoolRoot, 0o700)", "local_adapter_forbidden"]:
    check(f"credential-delivery:{marker}", marker in credential_delivery, "protected deterministic local/test credential spool")
check("credential-delivery-no-browser-url-state", "invitationUrl" not in actions_source and "resetUrl" not in actions_source, "one-time credentials must not be reflected into browser state")
check("credential-delivery-preflight", "requireCredentialDeliveryAdapter" in actions_source, "invitation mutations fail before authority changes when delivery is unavailable")
for marker in ["BOOTSTRAP_TOKEN_SHA256", "verifyInstallationToken", "REQUIRE_PRIVILEGED_MFA"]:
    check(f"v7-auth-hardening:{marker}", marker in text(ROOT / "packages/application/src/auth-service.ts") or marker in text(ROOT / "packages/config/src/index.ts"), "secure installation and privileged authentication marker")
for marker in ["supportingQuote", "quotePresent", "claimVerbatim"]:
    check(f"v7-evidence-boundary:{marker}", marker in text(ROOT / "packages/ai/src/evaluation.ts") or marker in text(ROOT / "packages/ai/src/index.ts"), "evidence citations require direct supporting text")

worker = ROOT / "apps/worker-node/src/worker.ts"
check("persistent-node-worker", worker.is_file() and "while (!stopping)" in text(worker), "persistent bounded worker loop")
check("worker-contract-version-gate", worker.is_file() and "unsupported_contract_version" in text(worker), "unknown payload versions are rejected")
check("worker-separate-database-url", worker.is_file() and "WORKER_DATABASE_URL" in text(worker), "worker uses separate credentials")
worker_source = text(worker)
compose = text(ROOT / "infra/compose/docker-compose.yml")
environment_example = text(ROOT / ".env.example")
for scanner_variable in ["MEDIA_SCANNER_URL", "MEDIA_SCANNER_BEARER_TOKEN"]:
    check(
        f"scanner-contract:{scanner_variable}",
        scanner_variable in worker_source and scanner_variable in compose and scanner_variable in environment_example,
        "worker, Compose, and environment contract must use the same scanner variable",
    )
for marker in ["service_completed_successfully", "capsicum_runtime_login", "capsicum_worker_login", "minio-init", "worker-node"]:
    check(f"compose:{marker}", marker in compose, "required local-stack boundary")
for dockerfile in [ROOT / "apps/web/Dockerfile", ROOT / "apps/worker-node/Dockerfile"]:
    check(f"docker-frozen:{dockerfile.relative_to(ROOT)}", "--frozen-lockfile" in text(dockerfile), "Docker must use frozen dependency graph")
    check(f"docker-non-root:{dockerfile.relative_to(ROOT)}", "USER capsicum" in text(dockerfile), "runtime must be non-root")

for python_path in [ROOT / "scripts/import_catalog.py", ROOT / "scripts/validate_repository.py", ROOT / "apps/worker-python/worker.py"]:
    try:
        ast.parse(text(python_path))
        check(f"python-syntax:{python_path.relative_to(ROOT)}", True, "parsed")
    except SyntaxError as error:
        check(f"python-syntax:{python_path.relative_to(ROOT)}", False, str(error))

for script in sorted((ROOT / "packages/database/scripts").glob("*.mjs")):
    if shutil.which("node"):
        completed = subprocess.run(["node", "--check", str(script)], capture_output=True, text=True, check=False)
        check(f"node-syntax:{script.relative_to(ROOT)}", completed.returncode == 0, completed.stderr.strip() or "parsed")

authority_verifier = text(ROOT / "packages/database/scripts/verify-authority.mjs")
for marker in ["ALLOW_AUTHORITY_TEST", "routine-grants.json", "migrationManifest", "forged workspace context", "workspace membership identity is immutable", "all workspace-scoped tables", "worker-only function"]:
    check(f"authority-verifier:{marker}", marker in authority_verifier, "destructive-gated PostgreSQL authority proof")

for backup_script in [ROOT / "infra/backup/backup.sh", ROOT / "infra/backup/restore-test.sh"]:
    check(f"backup-script:{backup_script.relative_to(ROOT)}", backup_script.is_file(), "required backup/restore evidence path")
    if backup_script.is_file() and shutil.which("bash"):
        completed = subprocess.run(["bash", "-n", str(backup_script)], capture_output=True, text=True, check=False)
        check(f"shell-syntax:{backup_script.relative_to(ROOT)}", completed.returncode == 0, completed.stderr.strip() or "parsed")

excluded_parts = {"source-handoff", ".git", ".validation", ".validation-build", "__pycache__", ".pytest_cache"}
for path in ROOT.rglob("*"):
    if not path.is_file() or path == Path(__file__) or any(part in excluded_parts for part in path.parts):
        continue
    if path.name.startswith("CAPSICUM_") and path.parent == ROOT / "docs":
        continue
    if path.suffix not in {".ts", ".tsx", ".py", ".sql", ".sh", ".R"}:
        continue
    try:
        source = text(path)
    except UnicodeDecodeError:
        continue
    check(f"no-placeholder:{path.relative_to(ROOT)}", not re.search(r"\bTODO\b|\bFIXME\b", source), "no unresolved source placeholder")

storage_source = text(ROOT / "packages/storage/src/index.ts")
check("v6-sigv4-actual-method", "input.method," in storage_source and "buildSignedS3Request" in storage_source, "SigV4 canonical request must use the actual HTTP method")
check("v6-s3-integration-test", (ROOT / "packages/storage/src/minio.integration.test.ts").is_file(), "MinIO round-trip integration suite is required")
for route in [ROOT / "apps/web/src/app/api/media/upload/route.ts", ROOT / "apps/web/src/app/api/research/upload/route.ts"]:
    route_source = text(route)
    check(f"v6-upload-streaming:{route.relative_to(ROOT)}", "request.formData()" not in route_source and "arrayBuffer()" not in route_source and "persistBoundedRequestBody" in route_source, "uploads must use bounded disk-backed request streaming")
check("v6-worker-streamed-malware", "scanMalwareFile" in worker_source and "materializeObjectToTemporaryFile" in worker_source, "worker inspection must stream object bytes to disk and malware scanner")
check("v6-pending-object-reconciliation", "storage.cleanup.v1" in worker_source and "pending_object_uploads" in migrations.get("0028_v6_pending_object_reconciliation.sql", ""), "orphaned object writes require durable reconciliation")
check("v6-cleanup-dry-run", "app_worker_preview_pending_object_cleanup" in migrations.get("0029_v6_storage_cleanup_preview_and_reference_guard.sql", "") and "dry_run" in worker_source, "storage cleanup exposes a non-destructive preview")
check("v6-cleanup-reference-guard", "app_pending_object_reference_count" in migrations.get("0029_v6_storage_cleanup_preview_and_reference_guard.sql", "") and "retentionHours" in worker_source, "cleanup rechecks authoritative references and retention before deletion")
check("v6-migration-atomicity", "applyMigrationAtomically" in text(ROOT / "packages/database/scripts/migrate.mjs"), "migration body and ledger insertion must commit atomically")
check("v6-safe-redirect", "/%255cevil.example" in text(ROOT / "apps/web/src/lib/safe-redirect.test.ts") and "applySecurityHeaders" in proxy, "internal redirects and redirect responses require origin-safe handling")
check("v6-backup-relative-checksums", 'cd "$out_dir"' in text(ROOT / "infra/backup/backup.sh"), "backup checksums must be bundle-relative")
check("v6-ai-evaluation-corpus", (ROOT / "packages/ai/src/evaluation-corpus.json").is_file() and "evaluateResearchAnswerSafety" in text(ROOT / "packages/ai/src/evaluation.ts"), "hosted AI requires a versioned adversarial safety corpus")
check("v6-resource-envelope", "mem_limit:" in compose and "PYTHON_VISION_MEMORY_MB" in compose, "production media processing requires explicit process and container resource limits")

check("v6-environment-contract-reconciliation", (ROOT / "scripts/ci/check-environment-contracts.mjs").is_file() and "ABUSE_CONTROL_SECRET" in compose and "AI_MAX_COST_MICROUNITS_PER_REQUEST" in compose, "production environment contracts must be reconciled across config and Compose")
check("v6-release-evidence-policy", (ROOT / "docs/evidence/README.md").is_file() and (ROOT / "scripts/ci/generate-release-evidence.mjs").is_file(), "local reports must be distinguished from commit-bound CI release evidence")
check("v6-runtime-smoke", (ROOT / "scripts/ci/run-v6-runtime-smoke.mjs").is_file(), "deterministic storage and redirect runtime smoke is required")
check("v6-genetics-runtime-smoke", (ROOT / "scripts/ci/run-genetics-runtime-smoke.mjs").is_file(), "exact and advanced genetics runtime smoke is required")
check("v6-security-ci", "security-supply-chain:" in text(ROOT / ".github/workflows/ci.yml") and "container-security:" in text(ROOT / ".github/workflows/ci.yml"), "dependency, secret, SAST, SBOM, and container scan jobs are required")
check("v6-backup-restore-ci", "Create, relocate, restore, and reconcile backup" in text(ROOT / ".github/workflows/ci.yml"), "CI must execute a relocated isolated backup/restore reconciliation")

warning("frozen-lockfile", (ROOT / "pnpm-lock.yaml").is_file(), "pnpm-lock.yaml requires a registry-enabled clean install")
node_version = "unavailable"
node_24 = False
if shutil.which("node"):
    node_binary = Path(__import__("os").environ.get("CAPSICUM_NODE_BINARY", shutil.which("node") or "node"))
    completed = subprocess.run([str(node_binary), "--version"], capture_output=True, text=True, check=False)
    node_version = completed.stdout.strip() or completed.stderr.strip() or "unknown"
    match = re.match(r"v?(\d+)", node_version)
    node_24 = bool(match and int(match.group(1)) >= 24)
warning("runtime-node-24", node_24, f"validation host: {node_version}; Node 24+ required")
for name, executable, label in [
    ("postgres-runtime-validation", "psql", "PostgreSQL psql"),
    ("docker-runtime-validation", "docker", "Docker CLI"),
    ("r-runtime-validation", "Rscript", "Rscript"),
]:
    available = shutil.which(executable) is not None
    warning(name, available, f"{label} {'available' if available else 'unavailable'} on validation host")


# V4 critical authority and runtime closure checks.
auth_source = text(ROOT / "packages/application/src/auth-service.ts")
check("v4-auth-constant-cost-unknown-account", "verifyPasswordOrDummy" in auth_source, "unknown accounts must execute the same password KDF path")
check("v4-auth-durable-rate-limit", "async function consumeRateLimit(" in auth_source and "withSystemTransaction(pool" in auth_source, "rate-limit decisions must commit outside rejected business transactions")
check("v4-public-idempotency-savepoint", "ROLLBACK TO SAVEPOINT public_idempotent_operation" in auth_source, "terminal outcomes must survive business rollback")
selection_source = text(ROOT / "packages/application/src/simulation-service.ts")
for field in ["target_expression", "target_model_version", "scenario_type", "population_calculation", "generation_plan"]:
    check(f"v4-selection-persists:{field}", field in selection_source, "selection plans must preserve the scientific field")
catalog_source = text(ROOT / "packages/application/src/catalog-service.ts")
for marker_text in ["createCatalogReleaseDraft", "submitCatalogReleaseForReview", "reviewCatalogRelease", "publishCatalogRelease", "catalog_release_alleles", "catalog_release_sources"]:
    check(f"v4-catalog-lifecycle:{marker_text}", marker_text in catalog_source, "normalized independently reviewed release lifecycle is required")
worker_source = text(ROOT / "apps/worker-node/src/worker.ts")
check("v4-media-clamd-streaming", "zINSTREAM\\0" in worker_source and "MEDIA_SCANNER_HOST" in worker_source, "default worker must support a bounded streaming malware scanner")
compose_source = text(ROOT / "infra/compose/docker-compose.yml")
check("v4-compose-malware-scanner", "clamav:" in compose_source and "condition: service_healthy" in compose_source, "default Compose must provide an accepted-media scanner path")

observation_source = text(ROOT / "packages/application/src/observation-service.ts")
for marker_text in ["protocol_snapshot", "method_record_id", "quality_term_ids", "device_schema_id", "FOR UPDATE"]:
    check(f"v4-observation-authority:{marker_text}", marker_text in observation_source, "version-bound observation authority and linear correction required")
storage_source = text(ROOT / "packages/storage/src/index.ts")
for marker_text in ["export async function openObject", "Readable.toWeb", "contentRange", "parseByteRange"]:
    check(f"v4-storage-streaming:{marker_text}", marker_text in storage_source, "downloads must stream with bounded memory and byte-range support")
mutation_form = text(ROOT / "apps/web/src/components/mutation-form.tsx")
check("v4-file-intent-content-hash", "crypto.subtle.digest('SHA-256'" in mutation_form, "file mutation intent must include the content digest")
simulation_ui = text(ROOT / "apps/web/src/app/simulation-lab/simulation-form.tsx")
check("v4-simulation-authority-dimensions", all(marker in simulation_ui for marker in ["Calculation:", "Premises:", "Interpretation:"]), "simulation UI must not collapse scientific authority dimensions")

# V5 behavioral and authority checks.
advanced_contract = text(ROOT / "packages/contracts/src/advanced-simulation.ts")
advanced_service = text(ROOT / "packages/application/src/advanced-simulation-service.ts")
for marker_text in ["linked_two_locus", "maternal_state", "conditional_rule_graph", "host_pathogen", "direct_monte_carlo"]:
    check(f"v5-advanced-mode:{marker_text}", marker_text in advanced_contract and marker_text in advanced_service, "all advanced modes require one governed contract and service")
check("v5-advanced-release-locus-allele-pairs", "requireReleaseGenotypeMembership" in advanced_service and "allele.locus_id = requested.locus_id" in advanced_service, "approved-release premises require exact locus–allele membership")
for marker_text in ["Parent hypothesis probabilities must sum exactly to one.", "A parent hypothesis cannot repeat a locus.", "Every hypothesis for one parent must describe the same locus set.", "Maternal and paternal hypotheses must describe the same locus set."]:
    check(f"v5-monte-carlo-premise:{marker_text}", marker_text in advanced_contract, "invalid stochastic premises must fail before durable enqueue")
research_service = text(ROOT / "packages/application/src/research-service.ts")
research_worker = text(ROOT / "apps/worker-node/src/worker.ts")
for marker_text in ["research.ingest.v1", "app_worker_complete_research_ingestion", "sourceSha256", "passages"]:
    check(f"v5-research-ingestion:{marker_text}", marker_text in research_service or marker_text in research_worker or marker_text in migrations["0024_v5_durable_research_ingestion.sql"], "durable immutable research ingestion boundary")
media_processing = text(ROOT / "apps/worker-node/src/media-processing.ts")
for marker_text in ["metadata: 'stripped'", "independentPythonImageFacts", "sourceSha256", "image_fact_parity_mismatch", "sharp-libvips-oriented-grayscale-buffer"]:
    check(f"v5-media-processing:{marker_text}", marker_text in media_processing, "deterministic media processing with independent decoder parity")
python_vision_tests = text(ROOT / "apps/worker-python/tests/test_worker.py")
for marker_text in ["test_image_facts_rejects_hash_mismatch", "test_image_facts_rejects_path_escape", "test_image_facts_rejects_multiframe_input", "test_image_facts_applies_exif_orientation_before_dimensions"]:
    check(f"v5-media-hostile-fixture:{marker_text}", marker_text in python_vision_tests, "hostile and orientation-aware deterministic image fixtures are required")
measurement_service = text(ROOT / "packages/application/src/phenotype-service.ts")
measurement_migration = migrations["0027_v5_phenotype_measurement_revision_authority.sql"]
for marker_text in ["correctPhenotypeMeasurement", "expectedCurrentRevisionId", "app_correct_phenotype_measurement", "phenotype measurement revision is stale", "phenotype_measurement_correction"]:
    check(f"v5-measurement-correction:{marker_text}", marker_text in measurement_service or marker_text in measurement_migration, "linear immutable phenotype measurement correction authority")
export_worker = text(ROOT / "apps/worker-node/src/worker.ts")
export_storage = text(ROOT / "packages/storage/src/index.ts")
for marker_text in ["app_worker_breeding_ledger_page", "putImmutableFile", "createHash('sha256')", "REPEATABLE READ"]:
    check(f"v5-streaming-export:{marker_text}", marker_text in export_worker or marker_text in export_storage or marker_text in migrations["0026_v5_streaming_breeding_ledger_export.sql"], "streaming immutable export generation")
hosted_ai = text(ROOT / "packages/ai/src/hosted.ts")
for marker_text in ["AbortController", "maxOutputTokens", "maxRetries", "validateAnswerCitations"]:
    check(f"v5-hosted-ai:{marker_text}", marker_text in hosted_ai, "hosted generation must be bounded and citation-revalidated")

# V8 source-quality and laboratory provenance checks.
laboratory_export_contract = text(ROOT / "packages/contracts/src/laboratory-export.ts")
configuration_source = text(ROOT / "packages/config/src/index.ts")
workflow_source = text(ROOT / ".github/workflows/ci.yml")
eslint_source = text(ROOT / "eslint.config.mjs")
root_manifest = json.loads(text(ROOT / "package.json"))
check(
    "v8-laboratory-export-schema",
    "BREEDING_LEDGER_SCHEMA_VERSION = '3.1'" in laboratory_export_contract
    and all(marker in laboratory_export_contract for marker in ["requestedAt", "snapshotAt", "generatedAt", "softwareReleaseIdentifier"]),
    "immutable breeding-ledger exports require explicit request, snapshot, generation, and software provenance",
)
check(
    "v8-scientific-standards-honesty",
    all(f"{standard}: 'not_implemented'" in laboratory_export_contract for standard in ["miappe", "brapi", "mcpd"]),
    "exports must not claim standards conformance before mappings and fixtures exist",
)
check(
    "v8-release-identity-contract",
    "APP_RELEASE_SHA" in configuration_source and "APP_RELEASE_SHA" in compose_source and "APP_RELEASE_SHA: ${{ github.sha }}" in workflow_source,
    "production web, worker, Compose, and CI must bind scientific artifacts to one immutable source revision",
)
check(
    "v8-release-identity-worker-fail-closed",
    "resolveSoftwareReleaseIdentifier" in worker_source and "APP_RELEASE_SHA is required when APP_MODE=production" in worker_source,
    "the worker must reject production startup without immutable software provenance",
)
check(
    "v8-next-core-web-vitals",
    "eslint-config-next/core-web-vitals" in eslint_source and "...nextVitals" in eslint_source,
    "Next.js linting must include the official Core Web Vitals rule set",
)
check(
    "v8-source-quality-rules",
    all(rule in eslint_source for rule in ["no-explicit-any", "no-floating-promises", "switch-exhaustiveness-check", "consistent-type-imports"]),
    "typed linting must reject unsafe promises, explicit any, non-exhaustive switches, and value imports used only as types",
)
check(
    "v8-compose-smoke-contract",
    (ROOT / "scripts/ci/run-compose-smoke.mjs").is_file() and root_manifest.get("scripts", {}).get("compose:smoke") == "node scripts/ci/run-compose-smoke.mjs",
    "liveness and readiness smoke checks require one bounded repository command",
)
check(
    "v8-laboratory-export-runtime-smoke",
    (ROOT / "scripts/ci/run-laboratory-export-smoke.mjs").is_file()
    and root_manifest.get("scripts", {}).get("validate:lab-export-smoke") == "node scripts/ci/run-laboratory-export-smoke.mjs"
    and "validate:lab-export-smoke" in root_manifest.get("scripts", {}).get("validate:smoke", ""),
    "scientific export provenance and temporal ordering require a dependency-independent runtime gate",
)
check(
    "v8-export-provenance-temporal-chain",
    all(marker in laboratory_export_contract for marker in [
        "requestedAt cannot be later than snapshotAt",
        "snapshotAt cannot be later than generatedAt",
    ])
    and "requestedAt <= snapshotAt <= generatedAt" in migrations["0031_v8_scientific_export_provenance.sql"],
    "laboratory artifacts must prove request, database snapshot, and generation time in chronological order",
)
check(
    "v8-root-validation-entrypoints",
    all(name in root_manifest.get("scripts", {}) for name in ["test:postgres", "test:e2e", "test:e2e:accessibility", "test:storage-integration", "compose:smoke", "validate:lab-export-smoke"]),
    "all release-critical test domains require discoverable root entrypoints",
)

# V9 build and lint reproducibility checks.
web_manifest = json.loads(text(ROOT / "apps/web/package.json"))
check(
    "v9-eslint-single-typescript-plugin",
    "eslint-config-next/typescript" in eslint_source
    and "typescript-eslint" not in root_manifest.get("devDependencies", {})
    and "from 'typescript-eslint'" not in eslint_source,
    "Next.js must own the TypeScript ESLint parser/plugin instance to prevent flat-config plugin redefinition failures",
)
check(
    "v9-eslint-zero-warning-policy",
    all(json.loads(text(path)).get("scripts", {}).get("lint", "").endswith("--max-warnings=0") for path in package_files),
    "every workspace lint command must fail on warnings",
)
check(
    "v9-react-runtime-type-alignment",
    web_manifest.get("dependencies", {}).get("react") == web_manifest.get("dependencies", {}).get("react-dom")
    and web_manifest.get("devDependencies", {}).get("@types/react", "").startswith("19.2.")
    and web_manifest.get("devDependencies", {}).get("@types/react-dom", "").startswith("19.2."),
    "React 19.2 runtime packages require aligned 19.2 type definitions",
)
check(
    "v9-next-eslint-version-alignment",
    web_manifest.get("dependencies", {}).get("next") == root_manifest.get("devDependencies", {}).get("eslint-config-next"),
    "Next.js and eslint-config-next must be pinned to the same exact version",
)
check(
    "v9-workspace-dependency-validator",
    (ROOT / "scripts/ci/check-workspace-dependencies.mjs").is_file()
    and root_manifest.get("scripts", {}).get("validate:workspace-dependencies") == "node scripts/ci/check-workspace-dependencies.mjs"
    and "validate:workspace-dependencies" in workflow_source,
    "undeclared package imports must fail locally and in CI",
)
check(
    "v9-toolchain-alignment-validator",
    (ROOT / "scripts/ci/check-toolchain-alignment.mjs").is_file()
    and root_manifest.get("scripts", {}).get("validate:toolchain") == "node scripts/ci/check-toolchain-alignment.mjs"
    and "validate:toolchain" in workflow_source,
    "framework, lint, runtime type, package-manager, and compiler versions require a machine-enforced alignment gate",
)
check(
    "v9-next-app-contract-validator",
    (ROOT / "scripts/ci/check-next-app-contracts.mjs").is_file()
    and root_manifest.get("scripts", {}).get("validate:next-contracts") == "node scripts/ci/check-next-app-contracts.mjs"
    and "validate:next-contracts" in workflow_source,
    "Next.js route exports and asynchronous request props require a pre-build contract gate",
)
check(
    "v9-web-database-boundary",
    "from 'pg'" not in text(ROOT / "apps/web/src/lib/database.ts")
    and "DatabasePool" in text(ROOT / "packages/database/src/index.ts"),
    "the web app must consume the database package contract rather than importing an undeclared transitive pg dependency",
)
check(
    "v9-browser-worker-build-graph",
    "pnpm build:web && pnpm build:worker" in workflow_source
    and "pnpm build:web && pnpm --filter @capsicum/worker-node build" not in workflow_source,
    "browser CI must build the worker through Turbo so every upstream package artifact exists",
)
check(
    "v9-proxy-special-file-exports",
    "export function applySecurityHeaders" not in proxy
    and "const proxyExports = new Set(['config', 'default', 'proxy'])" in text(ROOT / "scripts/ci/check-next-app-contracts.mjs"),
    "Next.js proxy files may export only the proxy function and optional config",
)

# V10 repository-root migration and exact test typing checks.
migration_script = text(ROOT / "packages/database/scripts/migrate.mjs")
migration_environment = text(ROOT / "packages/database/scripts/repository-env.mjs")
migration_manifest = json.loads(text(ROOT / "packages/database/package.json"))
genetics_exact_tests = text(ROOT / "packages/genetics-core/src/exact.test.ts")
check(
    "v10-repository-root-migration-environment",
    "requireMigrationDatabaseUrl(repositoryRoot)" in migration_script
    and "resolve(repositoryRoot, '.env.local')" in migration_environment
    and "DATABASE_ADMIN_URL" in migration_environment,
    "repo-root migration commands must load private local configuration and accept the documented admin credential",
)
check(
    "v10-production-migration-role-boundary",
    "Production migrations require MIGRATION_DATABASE_URL or DATABASE_ADMIN_URL" in migration_environment
    and "selected.source === 'DATABASE_URL'" in migration_environment,
    "production migrations must not silently elevate the restricted web runtime credential",
)
check(
    "v10-migrator-regression-tests",
    migration_manifest.get("scripts", {}).get("test:migrator") == "node --test scripts/*.test.mjs"
    and "pnpm test:migrator" in root_manifest.get("scripts", {}).get("validate", ""),
    "migration environment and atomicity tests must run through the release validation ladder",
)
check(
    "v10-target-recovery-null-narrowing",
    "plan.geneticPopulation === null || plan.practicalPopulation === null" in genetics_exact_tests
    and "toBeGreaterThan(plan.geneticPopulation)" in genetics_exact_tests,
    "nullable target-recovery results must be narrowed before numeric matcher comparison",
)

report = {
    "schemaVersion": "2.0",
    "passed": not issues,
    "releaseReady": not issues and not warnings,
    "summary": {"checkCount": len(checks), "issueCount": len(issues), "warningCount": len(warnings)},
    "checks": checks,
    "issues": issues,
    "environmentWarnings": warnings,
}
(ROOT / "docs/repository-validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
raise SystemExit(0 if not issues else 1)
