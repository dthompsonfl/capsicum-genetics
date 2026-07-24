# V4 Scientific Authority and Model Gates

## Three independent authority dimensions

1. **Calculation authority**: exact, approximate/stochastic, or unsupported.
2. **Premise authority**: verified, mixed, inferred, assumed, conflicting, or unknown.
3. **Interpretation authority**: genotype-only, conditional phenotype, or unsupported.

Exact arithmetic over assumed premises is exact mathematics, not verified biological truth.

## Evidence grades

- Verified assay/genotype evidence.
- Marker-supported evidence.
- Pedigree inference.
- Phenotype inference.
- User assumption.
- Imported claim.
- Unknown.
- Conflicting.

These states remain distinct in inputs, snapshots, and user-facing results.

## Catalog and release gates

A release requires:

- Independently reviewed exact snapshot.
- Approved source/assertion/locus membership.
- Normalized allele coverage for every included locus.
- Approved assembly/variant/marker/assay dependencies where referenced.
- Exact record hashes and no stale membership.
- Owner publication after independent approval.

Source prose never becomes executable logic directly.

## Phenotype/rule gates

Executable phenotype or host-pathogen logic requires approved versioned rules, supporting assertions, applicability context, and conflict checks. Zero executable rules is valid. Unapproved or conflicting rules abstain.

## Learned-model gates

A learned model cannot produce authoritative output without dataset hash, model card, held-out evaluation, applicability limits, calibration, promotion record, drift plan, rollback plan, and independent review.

## Historical reproducibility

Simulation snapshots retain parent direction, catalog release and hashes, genotype-call versions, evidence IDs, model/engine versions, assumptions, exclusions, input hash, result hash, seed/sample count for stochastic work, diagnostics, and authority dimensions. A newer model or release creates a new run; historical results are never silently recalculated.

## Unsupported claims

Exact SHU, universal fruit color, yield, flavor, environment tolerance, genomic prediction, G×E prediction, and disease outcomes without complete host/pathogen/environment context remain unavailable.
