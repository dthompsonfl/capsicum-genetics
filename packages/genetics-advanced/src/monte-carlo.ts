import {
  Rational,
  assertProbabilityMass,
  canonicalAlleles,
  compareIdentifiers,
  identifierTupleKey,
} from '@capsicum/genetics-core';
import type { MultiLocusOffspring, ParentGenotypeHypothesis, WeightedState } from '@capsicum/genetics-core';

export const MONTE_CARLO_PRNG = 'xorshift32@1' as const;

export interface MonteCarloEstimate {
  key: string;
  count: number;
  probability: number;
  confidenceInterval95: readonly [number, number];
  exactProbability: number;
  absoluteError: number;
}

export interface MonteCarloResult {
  mode: 'sampled';
  authority: 'stochastic_estimate';
  seed: number;
  prng: typeof MONTE_CARLO_PRNG;
  sampleCount: number;
  fallbackReason: 'exact_state_limit' | 'continuous_inputs';
  estimates: readonly MonteCarloEstimate[];
  diagnostics: {
    maximumAbsoluteError: number;
    maximumStandardError: number;
    confidenceIntervalMethod: 'wilson-95';
  };
  warnings: readonly string[];
}

function normalizedSeed(seed: number): number {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError('Monte Carlo seed must be an unsigned 32-bit integer.');
  }
  return (seed === 0 ? 0x6d2b79f5 : seed) >>> 0;
}

function xorshift32(seed: number): () => number {
  let state = normalizedSeed(seed);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

function wilson95(successes: number, total: number): readonly [number, number] {
  const z = 1.959963984540054;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function runCategoricalMonteCarlo<T>(input: {
  states: readonly WeightedState<T>[];
  key: (value: T) => string;
  seed: number;
  sampleCount: number;
  fallbackReason: MonteCarloResult['fallbackReason'];
}): MonteCarloResult {
  if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 100 || input.sampleCount > 5_000_000) {
    throw new RangeError('sampleCount must be a safe integer between 100 and 5,000,000.');
  }
  assertProbabilityMass(input.states, 'Monte Carlo source distribution');
  const aggregated = new Map<string, Rational>();
  for (const state of input.states) {
    const key = input.key(state.value);
    if (!key.trim()) throw new TypeError('Monte Carlo state keys must not be empty.');
    aggregated.set(key, (aggregated.get(key) ?? Rational.ZERO).add(state.probability));
  }
  const states = [...aggregated.entries()]
    .filter(([, probability]) => !probability.isZero())
    .sort(([left], [right]) => compareIdentifiers(left, right));
  if (states.length === 0) throw new RangeError('Monte Carlo requires at least one positive-probability state.');

  const cumulative: Array<{ key: string; threshold: number; exact: number }> = [];
  let threshold = 0;
  for (const [key, probability] of states) {
    const exact = probability.toNumber();
    if (!Number.isFinite(exact) || exact < 0 || (exact === 0 && !probability.isZero())) {
      throw new RangeError(`State ${key} cannot be represented safely for Monte Carlo sampling.`);
    }
    threshold += exact;
    cumulative.push({ key, threshold, exact });
  }
  cumulative[cumulative.length - 1]!.threshold = 1;

  const random = xorshift32(input.seed);
  const counts = new Map(states.map(([key]) => [key, 0]));
  for (let sample = 0; sample < input.sampleCount; sample += 1) {
    const draw = random();
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (draw < cumulative[middle]!.threshold) high = middle;
      else low = middle + 1;
    }
    const selected = cumulative[low]!;
    counts.set(selected.key, (counts.get(selected.key) ?? 0) + 1);
  }

  const estimates = cumulative.map((item): MonteCarloEstimate => {
    const count = counts.get(item.key) ?? 0;
    const probability = count / input.sampleCount;
    return {
      key: item.key,
      count,
      probability,
      confidenceInterval95: wilson95(count, input.sampleCount),
      exactProbability: item.exact,
      absoluteError: Math.abs(probability - item.exact),
    };
  });
  return {
    mode: 'sampled',
    authority: 'stochastic_estimate',
    seed: input.seed,
    prng: MONTE_CARLO_PRNG,
    sampleCount: input.sampleCount,
    fallbackReason: input.fallbackReason,
    estimates,
    diagnostics: {
      maximumAbsoluteError: Math.max(...estimates.map((item) => item.absoluteError)),
      maximumStandardError: Math.max(
        ...estimates.map((item) => Math.sqrt((item.probability * (1 - item.probability)) / input.sampleCount)),
      ),
      confidenceIntervalMethod: 'wilson-95',
    },
    warnings: [
      'Sampled probabilities are estimates, not exact segregation probabilities.',
      'Reproduce this run with the stored seed, PRNG identity, sample count, and source model version.',
    ],
  };
}


export interface DirectInheritanceEstimate {
  genotype: MultiLocusOffspring;
  key: string;
  count: number;
  probability: number;
  confidenceInterval95: readonly [number, number];
}

export interface DirectInheritanceMonteCarloResult {
  mode: 'direct_inheritance_sampled';
  authority: 'stochastic_estimate';
  seed: number;
  prng: typeof MONTE_CARLO_PRNG;
  sampleCount: number;
  estimates: readonly DirectInheritanceEstimate[];
  diagnostics: {
    observedStateCount: number;
    maximumStandardError: number;
    confidenceIntervalMethod: 'wilson-95';
  };
  warnings: readonly string[];
}

function hypothesisSelector(
  hypotheses: readonly ParentGenotypeHypothesis[],
): Array<{ hypothesis: ParentGenotypeHypothesis; threshold: number }> {
  assertProbabilityMass(hypotheses.map((hypothesis) => ({ value: hypothesis, probability: hypothesis.probability })), 'parent hypotheses');
  let threshold = 0;
  const cumulative = hypotheses.map((hypothesis) => {
    const probability = hypothesis.probability.toNumber();
    if (!Number.isFinite(probability) || probability < 0 || (probability === 0 && !hypothesis.probability.isZero())) {
      throw new RangeError('A parent hypothesis cannot be represented safely for direct stochastic sampling.');
    }
    threshold += probability;
    return { hypothesis, threshold };
  });
  if (cumulative.length === 0) throw new RangeError('At least one parent hypothesis is required.');
  cumulative[cumulative.length - 1]!.threshold = 1;
  return cumulative;
}

function selectHypothesis(
  cumulative: readonly { hypothesis: ParentGenotypeHypothesis; threshold: number }[],
  random: () => number,
): ParentGenotypeHypothesis {
  const draw = random();
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (draw < cumulative[middle]!.threshold) high = middle;
    else low = middle + 1;
  }
  return cumulative[low]!.hypothesis;
}

function genotypeSample(
  maternal: ParentGenotypeHypothesis,
  paternal: ParentGenotypeHypothesis,
  random: () => number,
): MultiLocusOffspring {
  const paternalByLocus = new Map(paternal.loci.map((locus) => [locus.locusId, locus]));
  if (maternal.loci.length !== paternal.loci.length) {
    throw new TypeError('Direct stochastic inheritance requires matching parent locus sets.');
  }
  return {
    loci: maternal.loci
      .map((maternalLocus) => {
        const paternalLocus = paternalByLocus.get(maternalLocus.locusId);
        if (!paternalLocus) {
          throw new TypeError(`Paternal hypotheses are missing locus ${maternalLocus.locusId}.`);
        }
        const maternalAllele = maternalLocus.alleles[random() < 0.5 ? 0 : 1];
        const paternalAllele = paternalLocus.alleles[random() < 0.5 ? 0 : 1];
        return {
          locusId: maternalLocus.locusId,
          alleles: canonicalAlleles([maternalAllele, paternalAllele]),
          evidenceState: 'inferred' as const,
        };
      })
      .sort((left, right) => compareIdentifiers(left.locusId, right.locusId)),
  };
}

function multiLocusKey(value: MultiLocusOffspring): string {
  return identifierTupleKey(
    value.loci.flatMap((locus) => [locus.locusId, locus.alleles[0], locus.alleles[1]]),
  );
}

export function runDirectInheritanceMonteCarlo(input: {
  maternalHypotheses: readonly ParentGenotypeHypothesis[];
  paternalHypotheses: readonly ParentGenotypeHypothesis[];
  seed: number;
  sampleCount: number;
}): DirectInheritanceMonteCarloResult {
  if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 1_000 || input.sampleCount > 5_000_000) {
    throw new RangeError('Direct inheritance sampleCount must be between 1,000 and 5,000,000.');
  }
  const maternal = hypothesisSelector(input.maternalHypotheses);
  const paternal = hypothesisSelector(input.paternalHypotheses);
  const random = xorshift32(input.seed);
  const counts = new Map<string, { genotype: MultiLocusOffspring; count: number }>();
  for (let sample = 0; sample < input.sampleCount; sample += 1) {
    const genotype = genotypeSample(
      selectHypothesis(maternal, random),
      selectHypothesis(paternal, random),
      random,
    );
    const key = multiLocusKey(genotype);
    const current = counts.get(key);
    counts.set(key, { genotype, count: (current?.count ?? 0) + 1 });
  }
  const estimates = [...counts.entries()]
    .sort(([left], [right]) => compareIdentifiers(left, right))
    .map(([key, state]) => ({
      genotype: state.genotype,
      key,
      count: state.count,
      probability: state.count / input.sampleCount,
      confidenceInterval95: wilson95(state.count, input.sampleCount),
    }));
  return {
    mode: 'direct_inheritance_sampled',
    authority: 'stochastic_estimate',
    seed: input.seed,
    prng: MONTE_CARLO_PRNG,
    sampleCount: input.sampleCount,
    estimates,
    diagnostics: {
      observedStateCount: estimates.length,
      maximumStandardError: Math.max(
        ...estimates.map((item) => Math.sqrt((item.probability * (1 - item.probability)) / input.sampleCount)),
      ),
      confidenceIntervalMethod: 'wilson-95',
    },
    warnings: [
      'This fallback samples meiosis directly and does not enumerate the exact offspring state space.',
      'Results are stochastic estimates and must retain seed, PRNG, sample count, parent hypotheses, and model version.',
    ],
  };
}
