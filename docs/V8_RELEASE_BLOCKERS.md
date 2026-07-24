# V8 production and laboratory release blockers

**Current verdict: blocked for production certification and blocked for use as the sole authoritative PhD-laboratory record system.**

The source tree has no known reproducible TypeScript defect under the available strict compiler harness, and the dependency-independent runtime checks pass. The remaining blockers require the exact declared environment, real services, controlled users, and biological validation.

## Critical engineering blockers

| Blocker | Risk | Closure evidence |
|---|---|---|
| Missing genuine `pnpm-lock.yaml` | Dependency graph, vulnerabilities, licenses, build output, and container contents are not reproducible | Reviewed lockfile; clean Node 24 frozen install; lock checksum; CI artifact |
| Pinned lint/format/build stack not executed | Source-level review does not prove exact ESLint, Prettier, Vitest, or Next.js behavior | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` on a clean checkout |
| PostgreSQL 18 not executed | SQL syntax, RLS, trigger order, role grants, and concurrent authority controls remain unproven | Empty and upgrade migration replay; restricted-role suite; concurrency and rollback evidence |
| Browser/accessibility stack not executed | Correct labels and components do not prove novice or assistive-technology usability | Chromium/Firefox/WebKit, axe, keyboard, 200%/400% zoom, screen-reader, and moderated novice studies |
| Integrated services not executed | Delivery, S3, malware scanning, image processing, and durable jobs may fail at real boundaries | Resend test domain; S3/MinIO; ClamAV; worker lease/retry/cancel/dead-letter; fault injection |
| Full restore drill unavailable | Primary research records and immutable media may not be recoverable | Isolated restore with database, object, hash, authority, and count reconciliation |

## Critical laboratory blockers

1. Approve and version laboratory SOPs for accession intake, seed-lot identity, plant labeling, controlled pollination, sample custody, observation capture, correction, and export.
2. Establish instrument calibration, unit, method, uncertainty, and maintenance records for every quantitative observation.
3. Validate each active locus/allele/assay premise against the laboratory's germplasm, population, assay method, and reference assembly.
4. Run blinded genotype and phenotype fixtures with independently known expected outcomes.
5. Establish duplicate-entry, label-swap, parent-direction, contamination, failed-cross, missing-data, and conflicting-evidence challenge sets.
6. Define electronic-record ownership, retention, access review, incident response, correction authority, and publication freeze procedures.
7. Implement and validate MIAPPE mappings for experiment metadata before claiming MIAPPE compatibility.
8. Implement selected BrAPI 2.1 endpoints and validate them with BrAPI tooling before claiming interoperability.
9. Implement MCPD v2.1 passport mappings before claiming genebank-compatible accession exchange.
10. Assign persistent identifiers, data licenses, rich metadata, and qualified links if FAIR publication is required.

## Release decision rule

A release candidate must be tied to one immutable source commit and one frozen lockfile. Every critical engineering and laboratory blocker must have machine-readable evidence, an accountable owner, an execution date, and a reviewer independent from the implementer.

A passing static validator or a successful development-server demonstration is not release evidence.
