# Scientific authority and model gates

## Core principle

The platform separates **calculation correctness** from **biological premise validity**. Exact arithmetic can correctly calculate the consequences of a false genotype assumption. Therefore every persisted result retains the parent identities, directional roles, genotype hypotheses, evidence basis, catalog release or user-declared assumption mode, engine/model version, warnings, and content hash.

## Supported deterministic calculations

| Capability | Authority |
|---|---|
| Diploid multi-allelic single-locus crosses | Exact when parent genotype hypotheses are explicit |
| Independent multi-locus crosses | Exact under the explicit independence assumption |
| Weighted uncertain parent hypotheses | Exact mixture over user/assay/evidence-labelled hypotheses |
| Target recovery and population size | Exact from the calculated target probability; impossible targets return `null`, never JSON infinity |
| Phased two-locus linkage | Conditional on explicit phase and recombination fractions |
| Maternal/cytoplasmic state transmission | Conditional on explicit maternal state and evidence status |
| Approved penetrance/rule graphs | Conditional and executable only for approved versioned rules with supporting assertions and applicability context |
| Direct Monte Carlo fallback | Approximate, deterministic by seed/version, with sample counts and diagnostics; it does not silently replace exact authority |

## Explicitly unsupported inference

The application must not infer genotype or authority from:

- cultivar or market name;
- phenotype or image appearance alone;
- capitalization conventions such as `Pun1` versus `pun1`;
- breeder anecdotes or spreadsheet prose;
- a source citation that has not been reviewed for the exact claim and context;
- a model trained on an undocumented or inapplicable population.

## Evidence states

Genotype calls and scientific assertions retain states such as verified, inferred, assumed, unknown, or conflicting. Unknown/conflicting parent states require separate or weighted scenarios. The UI may offer a user-declared assumption mode, but that mode is visibly lower authority than an approved catalog release and verified genotype evidence.

## Catalog governance

The staged source bundle reconciles to:

- 22 locus records;
- 22 evidence claims;
- 30 sources;
- 0 activated executable phenotype rules.

Publication requires versioned SHA-256 content hashes, source links, independent review, distinct author and reviewer identities, authorized catalog roles, and release-member hashes matching the approved record versions. Approved records and reviews are append-only/immutable; corrections require superseding versions.

## Phenotype and model promotion

A phenotype rule or model must remain unavailable until it has:

1. a versioned artifact and content/dataset hash;
2. defined input variables and output interpretation;
3. applicability boundaries covering taxon, population, environment, developmental stage, pathogen isolate, and measurement method as relevant;
4. supporting approved evidence;
5. calibration and discrimination/error metrics appropriate to the claim;
6. external or held-out validation;
7. known limitations, conflicts, and abstention conditions;
8. independent review and governed promotion;
9. fixtures that prove the implementation matches the reviewed specification.

## Claims that remain blocked

- universal phenotype prediction from genotype;
- exact Scoville Heat Units from a Pun1 call;
- yield, flavor, fruit mass, maturity, or breeding value without validated quantitative models;
- disease resistance without host genotype, pathogen isolate, environment, and approved model context;
- genomic prediction without a validated training population and marker pipeline;
- learned-image predictions without a promoted model card and validation dataset;
- causal claims from observational associations alone.

## Validation priority

Observed progeny are not merely product data; they are the primary feedback loop for testing genotype assumptions, segregation expectations, penetrance, linkage, and environmental applicability. The scientific roadmap should prioritize reliable identity, sampling, assay provenance, observation protocols, and progeny reconciliation before adding broader predictive claims.
