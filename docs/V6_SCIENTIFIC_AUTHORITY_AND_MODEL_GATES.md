# V6 Scientific Authority and Model Gates

## Authority dimensions

Every simulation or interpretation keeps three separate dimensions:

1. **Calculation authority** — exact or approximate/stochastic.
2. **Premise authority** — verified, mixed, inferred, assumed, conflicting or unknown.
3. **Interpretation authority** — genotype-only, approved conditional phenotype or unsupported.

Exact arithmetic over assumptions is not presented as verified science.

## Evidence grades

- verified genotype/assay evidence;
- marker-supported genotype;
- pedigree inference;
- phenotype inference;
- reviewed imported claim;
- explicit user assumption;
- unknown;
- conflicting.

Unknown and conflicting states remain explicit. Historical notation is not silently normalized.

## Catalog and rule promotion

- source objects, extraction artifacts, passages, assertions, loci, alleles, variants, markers and assays are versioned and hashed;
- author and reviewer must differ;
- approved records are immutable;
- release membership binds exact record/version/hash identity;
- every included locus requires approved normalized allele coverage;
- publication fails on stale, unapproved, superseded or inconsistent dependencies;
- source prose never becomes executable logic directly;
- executable rules require separate structured authoring, applicability and independent review;
- zero active phenotype rules is valid and is the current state.

## Simulation reproducibility

Historical runs preserve catalog release, locus–allele membership, genotype-call versions, evidence IDs, maternal/paternal direction, assumptions, exclusions, engine/model version, input hash, seed, sample count, diagnostics and result hash. A newer catalog/model creates a new run rather than mutating history.

## Abstention gates

The system abstains when:

- a normalized allele/locus pair is not in the selected approved release;
- phase or parentage alternatives are unresolved and not explicitly weighted;
- a phenotype rule is unapproved or outside applicability;
- host, pathogen, strain/isolate, effector/pathotype or environment context is incomplete;
- small multinomial segregation data cannot support the configured test;
- evidence is insufficient, conflicting or outside workspace scope;
- a learned model lacks the required validation artifacts.

## Learned-model promotion

A learned model remains unavailable without:

- immutable dataset hash;
- model card;
- independent held-out evaluation;
- applicability limits;
- calibration report;
- promotion review;
- drift and rollback plans;
- versioned artifact and reproducible inference contract.

V6 does not activate exact SHU, universal fruit color, yield, flavor, environment tolerance, genomic prediction, G×E prediction, disease outcome without full context, or learned biological image claims.

## V6 preservation evidence

Local runtime fixtures pass exact single/multi-locus inheritance, weighted uncertainty, linkage endpoints, maternal reversal, direct Monte Carlo error bounds, segregation analysis and host–pathogen abstention. Catalog reconciliation remains 22 loci / 22 claims / 30 sources / 0 approved executable rules.
