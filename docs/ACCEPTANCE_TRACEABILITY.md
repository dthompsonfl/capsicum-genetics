# V7 acceptance traceability

Status meanings:

- **Implemented in source** — the end-to-end code path exists; runtime proof may remain outstanding.
- **Partial** — a safe core exists but a production or operator requirement remains open.
- **Governed unavailable** — the correct behavior is abstention/blocking until reviewed evidence or infrastructure exists.

| # | Acceptance journey | Status | Current source evidence | Remaining proof or gap |
|---:|---|---|---|---|
| 1 | Securely bootstrap the intended first owner | Implemented in source | Installation-token verification, abuse limit, PostgreSQL advisory lock, transactional empty-user recheck, onboarding UI | PG18/browser concurrent bootstrap, token delivery/rotation/removal proof |
| 2 | Sign in, recover access, invite users, manage roles, and revoke sessions | Implemented in source | Password hashing, generic sign-in errors, Resend/local delivery boundary, invitation/reset exchange, session management | Real delivery, abuse, expiry, one-time-use, CSRF/origin, and browser E2E proof |
| 3 | Require MFA for privileged scientific/administrative authority | Implemented in source | TOTP, encrypted secret, recovery codes, replay rejection, per-session assurance, route and workspace-switch guards | PG18 and cross-browser enrollment, recovery, replay, multi-workspace, and revocation proof |
| 4 | Teach a beginner without creating misleading permanent data | Implemented in source | `/help`, `/quick-genetics`, exact fractions, visible assumptions, target-recovery planning, scientific boundary | Novice usability study, responsive/keyboard/screen-reader proof |
| 5 | Create germplasm, seed lots, plants, inventory history, and labels | Partial | Canonical breeding services/routes, plain-language fields and state labels | QR/barcode physical workflow and live DB/E2E proof |
| 6 | Record controlled outcross, selfing, open pollination, harvest, family, and pedigree | Implemented in source | Directed seed/pollen parents, cross events, harvest/family services, cycle guards | PostgreSQL constraint/concurrency proof and large-pedigree performance |
| 7 | Run exact, uncertainty, linkage, cytoplasmic, and bounded stochastic calculations without overstating authority | Implemented in source | Progressive simulation lab, exact rational engine, advanced engine, runtime genetics smoke | Full type/build tests, persisted DB integration, reviewed biological premises |
| 8 | Pre-plan a target population and preserve assumptions | Implemented in source | Target recovery and operational germination/survival adjustments | Browser validation and field comparison against real programs |
| 9 | Record observations and immutable corrections | Implemented in source | Experiment/observation contracts, sessions, revisions, units/methods | PG18 value/constraint and concurrent correction tests |
| 10 | Upload media and create protocol-governed phenotype records | Partial | Material-bound image selection, protocol-approved views, scale/color references, quarantine/derivative services | Object-store, ClamAV, hostile media, metadata, and browser proof; approved protocol set |
| 11 | Curate, independently review, and publish scientific evidence | Implemented in source / governed gate | Catalog roles, review/release guards, hash-bound publication, direct-quote citations | PG18 role/trigger tests and independent domain-expert review of records |
| 12 | Ask research questions and receive approved support or abstention | Implemented in source / governed gate | Approved in-workspace retrieval, verbatim quote requirement, exact claim/title support, AI audit | Hosted-provider evaluation, prompt-injection and exfiltration red-team suite |
| 13 | Operate jobs, exports, readiness, audit, backup, and restore | Partial | Durable queue/outbox, restricted roles, export/storage paths, sanitized readiness, backup scripts | Compose, crash/retry/dead-letter, load, backup and isolated restore proof |
| 14 | Reproduce and verify a release | Partial | Lockfile preflight, environment contracts, manifests, static validator, CI gates, release docs | Genuine lockfile, Node 24 frozen install, full CI/security/runtime evidence |

## Definition-of-done conclusion

The central breeder journey and authority boundaries are implemented in source. Production definition of done is not satisfied until the exact dependency graph, PostgreSQL behavior, browsers/accessibility, integrated services, security scans, and isolated restore are proven against one immutable commit.
