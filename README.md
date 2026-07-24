# Capsicum Breeding Intelligence Platform

A workspace-isolated breeding-record, evidence-management, and inheritance-calculation platform for Capsicum breeding programs. The system preserves biological identity, parent direction, genotype evidence, scientific-review state, measurement provenance, and reproducible calculation inputs. It does not treat a cultivar name, photograph, or visible trait as proof of genotype.

## Release status

**V9 build-hardened laboratory validation candidate; production and authoritative laboratory release remain blocked.**

This repository includes secure installation-token bootstrap, production credential delivery, privileged multi-factor authentication, session-level MFA assurance, role-aware navigation, a plain-language learning path, exact and advanced genetics tools, safer phenotype capture, direct-quote evidence citations, structured operational logging, strict source compilation, official Next.js Core Web Vitals lint configuration, and commit-bound scientific-export provenance.

The remaining blockers are reproducibility and runtime proof: the archive does not contain a legitimate `pnpm-lock.yaml`, and this review environment cannot execute the full Node 24, PostgreSQL 18, Docker, browser, object-storage, malware-scanner, or R validation matrix. Do not call the system production-ready or laboratory-validated until `docs/V9_RELEASE_BLOCKERS.md` is closed with recorded evidence.

## Repository profile

- 57 Next.js page routes and 14 API routes.
- 17 reusable `@capsicum/*` packages plus the web and persistent Node worker applications.
- 31 forward-only PostgreSQL migrations defining 116 `CREATE TABLE` declarations.
- Exact-rational diploid inheritance, independent multi-locus combinations, weighted parent hypotheses, target-recovery planning, phased two-locus linkage, maternal-state transmission, governed penetrance rules, and deterministic bounded Monte Carlo fallback.
- 22 staged loci, 22 staged evidence claims, and 30 staged sources; no executable phenotype rule is activated without independent approval.
- Membership-bound row-level security, restricted runtime/worker roles, opaque hashed sessions, session-specific MFA assurance, append-only scientific and observation histories, immutable approved catalog records, immutable simulation content hashes, and durable idempotency.

## Start here

For a new breeder or hobbyist:

1. Open **Learn** at `/help`.
2. Try **Quick Genetics** at `/quick-genetics` before creating permanent records.
3. Add each starting variety or accession under **Germplasm**.
4. Record physical seed lots and individual plants.
5. Plan a cross using explicit **seed parent** and **pollen parent** roles.
6. Use the standard simulation mode first. Open uncertainty, linkage, or cytoplasmic tools only when the required evidence exists.
7. Record observations, methods, units, environmental context, failures, and unexpected results.

See `docs/USER_GUIDE.md` for the complete plain-language workflow.

## Scientific authority model

The genetics engine calculates consequences of explicit genotype hypotheses. It does not establish that a named cultivar carries a particular allele. Genotype calls retain evidence state and assay provenance; unknown, assumed, inferred, verified, and conflicting states remain distinguishable.

Exact Scoville heat, flavor, yield, disease outcome, mature fruit color, quantitative breeding value, genomic prediction, and learned-image claims remain unavailable unless an independently approved, versioned, applicability-scoped rule or model supports them. See `docs/SCIENTIFIC_AUTHORITY_AND_MODEL_GATES.md` and `docs/SCIENTIFIC_LIMITATIONS.md`.

## Requirements

- Node.js 24 or newer
- Corepack and pnpm 10.14.0
- PostgreSQL 18
- Python 3.13 for catalog/parity validation
- Docker for the integrated local stack
- R only for optional research workloads

## Reproducible dependency bootstrap

The source archive intentionally does **not** contain a fabricated lockfile. On a registry-enabled Node 24 host:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --lockfile-only
pnpm validate:lockfile
pnpm install --frozen-lockfile
pnpm validate
```

Review and commit the generated `pnpm-lock.yaml`, then repeat the frozen install and complete validation from a clean checkout. See `docs/LOCKFILE_RECOVERY.md`.

## Secure first-owner installation

Generate a random installation token, deliver the raw value out of band to the intended owner, and configure only its SHA-256 digest:

```bash
TOKEN="$(openssl rand -base64 48)"
printf '%s' "$TOKEN" | sha256sum
```

Set the digest as `BOOTSTRAP_TOKEN_SHA256`. The raw token is entered once on `/onboarding`; it must not be stored in source control, browser-visible configuration, logs, or a shared password document.

## Production identity and delivery

Production mode requires:

- `APP_MODE=production`
- `APP_RELEASE_SHA` set to the immutable 40- or 64-character source revision
- an HTTPS `APP_ORIGIN`
- `REQUIRE_PRIVILEGED_MFA=true`
- a 32-byte hexadecimal `MFA_ENCRYPTION_KEY`
- `DELIVERY_ADAPTER=resend`
- a verified `DELIVERY_FROM_EMAIL`
- `RESEND_API_KEY`

Owners, administrators, and scientific reviewers must enroll MFA. Privileged workspace access is tied to the assurance state of the current session, not merely the user account.

## Database and least-privilege roles

Use administrative credentials only for migration and role provisioning. The web and worker use separate restricted logins.

```bash
pnpm db:migrate
pnpm db:provision-roles
pnpm db:seed-catalog
```

Database administration scripts load `.env.local` and then `.env` from the repository root;
values already supplied by the shell retain precedence. Configure `MIGRATION_DATABASE_URL` or
`DATABASE_ADMIN_URL` in `.env.local` before running migrations. Local development may fall back to
`DATABASE_URL`, but production migrations reject the restricted runtime role. The example environment
file is never loaded automatically because its placeholder credentials are not valid secrets.

Run the destructive-gated authority proof only against a disposable database whose name includes `test`, `authority`, or `ci`:

```bash
ALLOW_AUTHORITY_TEST=YES \
AUTHORITY_TEST_DATABASE_URL='postgresql://.../capsicum_authority_test' \
pnpm db:verify-authority
```

## Integrated local stack

Create a private `.env.local` from `.env.example`, replace every placeholder, and run:

```bash
pnpm compose:up
```

The development override permits local HTTP while preserving production fail-closed behavior. Never use the demo/local delivery settings as a production configuration.

## Validation

The repository validator currently performs 906 dependency-free static checks across package boundaries, migrations, scientific controls, routes, security markers, worker design, and release evidence. That validator is a guardrail—not a substitute for runtime proof.

Required production evidence includes:

```bash
pnpm validate
pnpm db:verify-authority
pnpm test:postgres
pnpm test:e2e
pnpm compose:smoke
pnpm backup:restore-test -- ./backups/<bundle>
```

Use the exact scripts available in the generated lockfile checkout and CI workflow. Record outputs and artifacts; do not replace failed gates with manual assertions.

## Documentation

- `docs/USER_GUIDE.md` — plain-language workflow for breeders and hobbyists.
- `docs/PRODUCTION_DEPLOYMENT.md` — secure installation and deployment controls.
- `docs/LOCKFILE_RECOVERY.md` — safe dependency-lock regeneration.
- `docs/V9_BUILD_TYPECHECK_LINT_REMEDIATION.md` — current build, lint, typecheck, and regression-gate evidence.
- `docs/V9_RELEASE_BLOCKERS.md` — current engineering and laboratory blockers.
- `docs/V8_TYPECHECK_LINT_AND_SCIENTIFIC_HARDENING_REPORT_2026-07-24.md` — prior scientific-hardening evidence.
- `docs/LABORATORY_VALIDATION_AND_SOP_REQUIREMENTS.md` — qualification and SOP requirements.
- `docs/SCIENTIFIC_INTEROPERABILITY_GAP_ANALYSIS.md` — MIAPPE, BrAPI, MCPD, and FAIR gaps.
- `docs/SECURITY_AND_THREAT_MODEL.md` — current trust boundaries and residual security work.
- `docs/SCIENTIFIC_AUTHORITY_AND_MODEL_GATES.md` — supported calculations and abstention rules.
- `docs/OPERATIONS_BACKUP_RESTORE_RUNBOOK.md` — operations, backup, restore, and authority verification.

Older V3–V8 reports are historical snapshots. They do not describe the current V9 source tree and must not be used as current release evidence.
