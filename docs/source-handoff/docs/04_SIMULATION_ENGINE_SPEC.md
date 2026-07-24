# Simulation Engine Specification

## Authority model

Simulation results are authoritative only within the approved model, validated applicability, and declared inputs. The engine must abstain when a requested claim is unsupported.

## Shared run contract

Every run stores:

- run ID and workspace;
- parent/material identifiers;
- complete normalized input;
- genotype evidence states;
- catalog release;
- model type and version;
- exact or sampled mode;
- random seed when sampled;
- result distribution;
- assumptions, warnings, exclusions, and abstentions;
- code/worker version;
- timestamps and content hashes.

## Engine A — Exact nuclear inheritance

Implement:

- diploid single-locus crosses;
- multiple alleles;
- independent multi-locus crosses;
- complete, incomplete, and codominance through declarative phenotype rules;
- penetrance and expressivity distributions where explicitly supported;
- lethal combinations with conception and surviving-offspring distributions kept separate;
- exact rational probability arithmetic.

Never infer dominance from capitalization.

## Engine B — Linked loci

Inputs include chromosome, haplotype phase, and recombination fraction or validated map distance. Support coupling and repulsion. Unknown phase must generate scenario-separated or marginalized results rather than a hidden assumption.

Invariants:

- `r = 0` yields parental haplotypes only;
- `r = 0.5` converges to independent assortment;
- gamete probabilities sum exactly to 1.

## Engine C — Cytoplasmic and maternal models

Keep parent direction. Support maternal cytoplasm, nuclear restorer loci, maternal effects, and reciprocal-cross outcome differences through explicit model rules.

## Engine D — Epistasis and rule graphs

Use versioned declarative rules over normalized genotypes and context. Rules require priorities, conflict detection, source assertions, applicability, and an abstention result when no approved rule resolves the request.

## Engine E — Host–pathogen interaction

Inputs include host allele/genotype, pathogen taxon, strain/isolate/race/pathotype, effector status, environment, and evidence applicability. Results are context-specific and may be `supported_resistant`, `supported_susceptible`, `conflicting`, or `insufficient_evidence`.

## Engine F — Uncertain genotypes

Represent parent genotype as a weighted distribution. Marginalize across parent distributions and genetic outcomes:

```text
P(offspring) = sum P(parentA genotype) * P(parentB genotype) * P(offspring | parent genotypes)
```

Expose how much uncertainty comes from parent identity, genotype inference, or the biological model.

## Engine G — Target recovery

For independent target probability `p` and desired confidence `c`:

```text
N = ceil(log(1-c) / log(1-p))
```

Apply germination, survival, assay success, and phenotyping sensitivity as separate transparent operational factors. Never label the result a guarantee.

## Engine H — Monte Carlo fallback

Use only when exact state space exceeds configured thresholds. Store random seed, sample count, convergence diagnostics, confidence intervals, and exact-fallback reason. Provide deterministic repeatability from the stored seed.

## Engine I — Forward breeding-program simulation

Use an isolated R worker and AlphaSimR or a justified alternative. Support founder population creation, mating design, selection cycles, genomic selection experiments, and comparison of strategies. These stochastic research simulations must never overwrite exact calculator results.

## Engine J — Quantitative and genomic prediction

Implement framework and registry support for:

- mixed models and BLUP;
- GBLUP/genomic selection;
- Bayesian models when justified;
- multi-trait selection;
- genotype-by-environment models;
- reaction norms;
- selection indices and Pareto optimization.

Promotion requires frozen training data, leakage-resistant validation, uncertainty, calibration, model cards, and applicability boundaries. Without adequate data, return `model_unavailable`.

## Engine K — In-silico genotype manipulation

Allow users to explore hypothetical allele edits or selections as scenarios. Label outputs as virtual scenarios. Do not provide laboratory gene-editing instructions or imply that an edit will produce a phenotype outside an approved model.

## Performance targets

- Typical exact crosses: interactive response under 500 ms server compute.
- Larger exact crosses: under 2 seconds or move to a job with progress.
- No unbounded Cartesian enumeration.
- Sparse weighted distributions and dynamic programming where applicable.
- Configured hard limits and cost estimates before expensive simulations.

## Testing

Use golden fixtures, property-based tests, an independent reference implementation, randomized cross comparisons, and mathematical invariants. Every model version must be reproducible after future catalog releases.
