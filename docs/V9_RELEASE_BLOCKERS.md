# V9 production and laboratory release blockers

**Current verdict: source-hardened build candidate; production certification and sole-authority PhD laboratory use remain blocked.**

## Engineering blockers

The V9 source pass corrected undeclared workspace imports, duplicate ESLint plugin authority, React runtime/type skew, Next.js App Router contract drift, and an invalid proxy special-file export surface.

| Blocker | Why it remains blocking | Required closure evidence |
|---|---|---|
| No genuine `pnpm-lock.yaml` | The exact dependency graph, peer resolution, native binaries, vulnerabilities, licenses, and output are not reproducible | Reviewed lockfile and clean Node 24 frozen install tied to one commit |
| Exact pinned lint/type/test/build stack not executed | Dependency-independent compilation cannot prove real Next.js generated types, ESLint plugins, Vitest, SWC/Turbopack, or native packages | Successful `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` from a clean checkout |
| PostgreSQL 18 authority suite unavailable | SQL syntax, migrations, RLS, grants, triggers, concurrency, and rollback remain unexecuted | Empty and upgrade replay plus restricted-role, concurrency, atomicity, and rollback evidence |
| Browser and accessibility suite unavailable | Source semantics do not prove rendered behavior | Playwright, axe, keyboard, zoom, screen-reader, and moderated novice-user evidence |
| Integrated service boundaries unavailable | Email, object storage, malware scanning, durable workers, and recovery may fail under real faults | Resend, S3/MinIO, ClamAV, worker lease/retry/dead-letter, and fault-injection evidence |
| Full restore drill unavailable | Research records and immutable artifacts may not be recoverable together | Isolated database/object restore with checksums, counts, identities, and authority reconciliation |

## Laboratory blockers

1. Approve versioned SOPs for accession intake, plant and seed identity, controlled pollination, sample custody, observations, corrections, and exports.
2. Validate each active locus, allele, assay, rule, and reference-assembly premise against the laboratory's actual germplasm and methods.
3. Establish instrument calibration, uncertainty, maintenance, and traceability records.
4. Run blinded genotype, phenotype, pedigree, parent-direction, contamination, missing-data, and label-swap challenge sets.
5. Establish data ownership, retention, access review, incident response, correction authority, and publication-freeze governance.
6. Implement and validate MIAPPE, BrAPI, and MCPD mappings before claiming those interoperability standards.

## Release rule

A release candidate must be tied to one immutable source revision and one reviewed frozen lockfile. Every blocking gate must have machine-readable evidence, an execution date, an accountable owner, and independent review. A dependency-independent validator or development demonstration is not production or laboratory certification.
