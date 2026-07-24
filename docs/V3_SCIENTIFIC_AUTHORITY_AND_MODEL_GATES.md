# V3 Scientific Authority and Model Gates

## Three authority dimensions

Every scientific result must distinguish:

1. **Calculation authority** — exact, approximate/stochastic, or unavailable.
2. **Premise and evidence authority** — verified, mixed, inferred, assumed, conflicting, or unknown.
3. **Interpretation authority** — genotype-only, conditional phenotype, or unsupported.

A mathematically exact result over assumed premises is not described as fully authoritative.

## Evidence grades

- Independently approved source and passage.
- Independently approved genotype/assay evidence.
- Marker-supported evidence.
- Pedigree inference.
- Phenotype inference.
- User-declared assumption.
- Imported claim pending review.
- Unknown.
- Conflicting.

The original evidence and uncertainty remain reproducible after correction or supersession.

## Simulation gates

Approved-release simulation requires:

- an approved published release and content hash;
- exact locus membership;
- exact approved allele membership;
- immutable parent direction;
- exact genotype-call versions where verified calls are claimed;
- recorded assumptions, exclusions, evidence IDs, engine/model version, input/result hash;
- explicit seed, sample count, diagnostics, and error estimate for stochastic runs.

A historical run is never recalculated under a new release/model in place. It becomes a new run/version.

## Rule promotion

Source prose is never executable. Promotion requires:

1. immutable source object and locator;
2. reviewed passage boundaries and hash;
3. structured assertion and applicability;
4. independently approved evidence graph;
5. explicit genotype/condition inputs and excluded contexts;
6. deterministic executable representation and version;
7. independent reviewer distinct from author;
8. publication in a hash-bound release;
9. golden fixtures and abstention tests.

Zero active phenotype rules is a valid safe state. The supplied catalog remains at zero.

## Host–pathogen gate

No disease outcome may be produced unless the rule’s applicability has the required host allele/genotype, pathogen identity, strain/isolate, effector/pathotype, and environmental/protocol context. Missing or conflicting context produces abstention.

## Learned-model promotion

Learned outputs remain unavailable until a version has:

- immutable dataset hash and provenance;
- model card and intended use;
- independently held-out evaluation;
- applicability and exclusion limits;
- calibration and uncertainty report;
- promotion record by an independent reviewer;
- drift monitoring and rollback plan;
- runtime artifact hash and compatible capture protocol.

No such validated model artifact is supplied. Learned phenotype claims remain disabled.

## Observed segregation

V3 supports:

- chi-square goodness-of-fit only when every expected count is at least five;
- exact two-sided binomial testing for small two-category samples;
- explicit exclusion/counting of missing observations;
- Holm adjustment for multiple tests;
- explicit abstention for unsupported small multinomial cases;
- language that describes compatibility, not causality or guarantee.

## Mandatory abstentions

The platform must abstain from:

- cultivar genotype inference from name or appearance;
- exact Scoville heat prediction;
- universal fruit color, flavor, yield, maturity, or tolerance prediction;
- genomic prediction without a validated genomic model;
- G×E prediction without applicable environments and validation;
- disease claims without host/pathogen/context;
- learned image claims without a promoted model;
- source-free or citation-mismatched AI answers;
- small multinomial segregation claims without a validated exact protocol.
