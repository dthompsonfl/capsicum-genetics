# Scientific Governance

## Evidence states

```text
candidate -> extracted -> curator_review -> independent_review -> approved -> released
                                  |                   |
                                  -> rejected         -> superseded/retired
```

## Evidence grades

- **A:** functionally validated causal relationship with strong replicated support.
- **B:** replicated mapping/association or strong mechanistic support.
- **C:** population-specific QTL or association.
- **D:** candidate, preliminary, conflicting, or weakly replicated.
- **U:** unresolved or insufficient.

Evidence grade and executable prediction eligibility are separate decisions.

## Required assertion fields

- narrow claim text;
- claim type;
- species and population;
- biological material/accessions;
- allele or variant identity;
- inheritance/model interpretation;
- experimental method;
- environmental conditions;
- supporting passages;
- limitations and exclusions;
- conflicting evidence;
- evidence grade;
- reviewer decisions;
- release version.

## Genotype evidence states

- verified by sequencing;
- verified by approved marker assay;
- imported verified source;
- pedigree inferred;
- phenotype inferred;
- user assumed;
- unknown;
- conflicting.

Only approved verification pathways can create a verified state.

## Publication governance

- Store DOI/PMID/other identifiers and source version.
- Do not redistribute copyrighted full text unless permitted.
- Store legal source links and user-supplied files according to access rights.
- Track retractions, corrections, and superseding evidence.

## Rule activation

An executable model rule requires:

- approved evidence assertions;
- normalized alleles/variants;
- explicit applicability;
- declarative rule and test fixtures;
- scientific reviewer approval;
- software reviewer approval;
- catalog release publication.

## Change control

Published releases are immutable. Corrections create a new release. Historical simulations retain the prior catalog/model version and remain reproducible.
