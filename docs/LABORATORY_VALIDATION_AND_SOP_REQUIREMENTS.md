# Laboratory validation and SOP requirements

## Purpose

This document defines the minimum local validation needed before the platform is used as an authoritative record or decision-support system in a doctoral-level Capsicum laboratory.

The software can enforce provenance and calculation boundaries. It cannot establish that a plant was labeled correctly, a pollination was controlled, an assay was valid, an instrument was calibrated, or an observation was biologically representative. Those controls remain laboratory responsibilities.

## Required SOP set

Each SOP must have an identifier, owner, version, effective date, approval, training record, change history, and retirement process.

1. Germplasm accession intake and external-source verification.
2. Seed-lot creation, split, merge prohibition, storage, viability, and inventory reconciliation.
3. Individual-plant identity and physical label replacement.
4. Seed-parent and pollen-parent selection and controlled-pollination procedure.
5. Bagging, emasculation where applicable, contamination handling, failed-cross handling, and harvest authorization.
6. Tissue/sample collection, chain of custody, storage, extraction, and disposal.
7. Genotype-call import, assay identity, reference assembly, quality threshold, conflict review, and correction.
8. Phenotype protocol approval, observation-unit definition, environmental context, units, missingness, and quality flags.
9. Image capture, scale/color reference, orientation, metadata stripping, quarantine, and derivative acceptance.
10. Observation correction and immutable revision review.
11. Catalog evidence review, independent approval, publication, supersession, and conflict handling.
12. Simulation premise selection, result interpretation, and abstention.
13. Data export, publication freeze, checksum verification, citation, retention, and controlled disclosure.
14. User provisioning, privileged MFA, access review, role removal, and incident response.
15. Backup, restore, disaster recovery, and post-restore scientific reconciliation.

## Software validation protocol

### Installation qualification

- Record host, OS, CPU architecture, Node, pnpm, PostgreSQL, Python, R, browser, container, and external-service versions.
- Bind the deployment to an immutable commit and frozen lockfile.
- Record migration identities and checksums.
- Prove separate migration, runtime, and worker database roles.
- Prove production startup fails without required secrets, HTTPS origin, MFA policy, delivery, object storage, and software release identity.

### Operational qualification

Use controlled test workspaces and challenge fixtures to prove:

- first-owner bootstrap cannot be claimed without the deployment token;
- concurrent bootstrap creates exactly one owner;
- privileged access requires current-session MFA assurance;
- invitation, recovery, TOTP replay, recovery-code reuse, and role-switch abuse fail safely;
- workspace isolation holds for reads, writes, exports, media, jobs, and guessed identifiers;
- duplicate requests do not duplicate authoritative records;
- expired job leases recover without duplicate completion;
- immutable records reject mutation and accept only governed correction paths;
- export artifacts retain checksum, request time, snapshot time, generation time, schema version, and source revision;
- backup relocation and isolated restore preserve counts, hashes, identities, histories, and object references.

### Performance qualification

Define representative and worst-case limits before testing:

- accessions, plants, seed lots, crosses, observations, images, genotype calls, and catalog records per workspace;
- concurrent users and workers;
- maximum export size;
- maximum image size and derivative workload;
- maximum exact inheritance state space and Monte Carlo workload.

Record latency distributions, memory, CPU, database locks, queue depth, object-storage throughput, failure behavior, and recovery behavior. Do not publish unmeasured scale claims.

## Scientific challenge set

The laboratory should maintain versioned fixtures covering:

- homozygous, heterozygous, missing, uncertain, and conflicting genotype evidence;
- single-locus and independent multi-locus exact crosses;
- phased linkage at recombination fractions 0, intermediate values, and 0.5;
- reciprocal crosses with cytoplasmic state differences;
- weighted parental hypotheses summing exactly to one and invalid alternatives that must be rejected;
- observed-versus-expected segregation with known counts;
- parent-label reversal and seed/pollen direction challenges;
- unknown alleles, unknown loci, incompatible release membership, and superseded premises;
- failed pollinations, contamination, missing observations, protocol deviations, and corrected measurements;
- positive, negative, and abstention cases for every approved phenotype or host-pathogen rule.

Expected outcomes must be established independently from the implementation under test.

## Acceptance rule

The laboratory may use the system as a primary authoritative record only after engineering qualification, SOP approval, staff training, scientific challenge-set acceptance, backup/restore acceptance, and an independent review are complete.

Until then, use it as a controlled validation candidate with parallel records and documented reconciliation.
