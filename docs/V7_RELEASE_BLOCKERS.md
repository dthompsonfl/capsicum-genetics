> **Historical snapshot:** superseded by `V8_RELEASE_BLOCKERS.md`. Do not use this file as current release evidence.

# V7 production release blockers

**Current verdict: blocked.**

The V7 refactor materially improves security, scientific usability, and novice accessibility. It has not been proven in the required production runtime and must remain labeled an engineering candidate.

## Critical blockers

| Blocker | Risk | Required closure evidence |
|---|---|---|
| No genuine `pnpm-lock.yaml` | Dependency graph, build artifact, vulnerability result, and deployment are not reproducible | Reviewed generated lockfile; clean Node 24 `pnpm install --frozen-lockfile`; lock checksum; full CI evidence |
| Full TypeScript/build pipeline not executed | Parser success does not prove types, module resolution, React contracts, or production bundling | Format, lint, typecheck, Vitest, package builds, Next production build, compiled-artifact verification on Node 24 |
| PostgreSQL 18 migrations/RLS not executed | Static SQL review cannot prove syntax, trigger order, privilege behavior, RLS, or concurrent authority controls | Empty and upgrade migration replay; checksums; restricted-role tests; forged-context, revocation, MFA/session, catalog, pedigree, and concurrency tests |
| Browser journeys and accessibility not executed | Source labels and layout do not prove the system is understandable or operable | Chromium/Firefox/WebKit E2E; axe; keyboard-only; zoom; responsive; focus/error; screen-reader spot checks with novice users |
| Integrated services not executed | Delivery, storage, scanner, worker, and health behavior may fail differently at runtime | Compose build/smoke; Resend test domain; S3 round trip; ClamAV failure modes; worker crash/retry/dead-letter proof |
| Backup/restore not executed | Authoritative records and files may be unrecoverable | Timestamped backup; checksum validation; isolated restore; row/hash/object reconciliation; documented RTO/RPO |

## High-priority gates

- Prove secure bootstrap token rotation/removal and concurrent onboarding behavior.
- Prove privileged MFA enrollment, current-session verification, recovery-code rotation, replay prevention, and low-assurance role-switch denial.
- Prove invitation and password-reset abuse controls, one-time use, expiry, generic public errors, and delivery redaction.
- Complete dependency, license, secret, SAST, container, and SBOM scans.
- Resolve or formally accept the CSP `style-src 'unsafe-inline'` residual with browser evidence and a removal plan.
- Characterize export, simulation, image, and worker limits under concurrent load.
- Define supported S3-compatible storage lifecycle and MinIO production ownership or replacement.
- Run optional R workloads reproducibly if they are part of the intended production scope.

## Scientific gates

Exact calculations may be used only for explicit, documented model assumptions. Stronger phenotype or predictive claims require:

- independently reviewed evidence;
- explicit population, species, locus, allele, environment, and method applicability;
- versioned executable rules or models;
- conflict analysis and negative evidence;
- fixtures and external validation where appropriate;
- clear abstention outside the approved scope.

No UI simplification may erase uncertainty, parent direction, provenance, units, protocol, or correction history.

## Release decision rule

Release requires all critical blockers closed with artifacts tied to one immutable commit. A passing static repository validator, manual click-through, or successful development server is insufficient.
