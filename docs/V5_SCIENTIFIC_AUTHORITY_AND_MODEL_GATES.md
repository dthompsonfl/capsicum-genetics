# V5 Scientific Authority and Model Gates

## Three independent authority dimensions

Every simulation records:

1. **Calculation authority** — exact, approximate, or unsupported.
2. **Premise authority** — verified, mixed, inferred, assumed, conflicting, or unknown.
3. **Interpretation authority** — genotype-only, conditional phenotype, or unsupported.

Exact arithmetic over assumptions is not fully authoritative science.

## Evidence grades

- **Verified:** supported by approved normalized assay/genotype or independently reviewed source evidence.
- **Inferred:** derived from pedigree or another declared inference model.
- **Assumed:** entered as an explicit scenario premise.
- **Unknown:** unresolved and not silently imputed.
- **Conflicting:** incompatible evidence is preserved rather than suppressed.

## Executable-rule gate

A rule can execute only when it is independently approved, immutable, included in the exact published release, linked to approved supporting assertions, and applicable to the supplied context. Source prose is never executed directly. Zero approved rules is valid.

## Advanced model gates

- **Linkage:** requires ordered loci, explicit phase, and recombination fraction in `[0, 0.5]`.
- **Maternal state:** preserves direction; unknown state requires explicit alternative scenarios.
- **Conditional phenotype:** requires approved release rule and matching applicability.
- **Host–pathogen:** requires host genotype plus pathogen taxon, assay context, and any rule-required strain/isolate/race/pathotype/effector/environment context.
- **Direct Monte Carlo:** requires positive exact hypothesis probabilities summing to one, identical locus sets, immutable seed/PRNG/sample count, and reports confidence intervals and diagnostics. It never expands the exact distribution first.

## Vision gates

Deterministic image facts are machine observations only. Derivatives and luminance/dimension facts do not establish fruit phenotype, disease, flavor, yield, pungency, genotype, or causation. Human correction preserves the original machine result. Learned outputs remain disabled without dataset hash, model card, held-out evaluation, calibration, applicability limits, promotion, drift plan, and rollback plan.

## AI gates

AI may explain approved evidence and produce draft structured text. It may not approve evidence, publish a rule, promote a model, verify genotype, write scientific terminal states, invent cultivar genotype, invent pathogen applicability, or override a calculation. Insufficient, conflicting, or out-of-scope evidence requires abstention.

## Historical reproducibility

Historical results retain exact input snapshots, hashes, release/model/engine versions, parent direction, evidence IDs, genotype-call versions, stochastic seed/sample/diagnostics, and result hash. A new catalog or model creates a new run; it does not mutate an old result.

## Unsupported claims

The platform does not claim exact SHU, universal mature color, flavor, yield, environmental tolerance, genomic prediction, G×E prediction, disease outcome without full host/pathogen/context, or learned vision accuracy without a promoted validated model.
