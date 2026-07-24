import { Rational, sumRationals } from './rational';
import type {
  DiploidGenotype,
  ExactCrossResult,
  MultiLocusOffspring,
  ParentGenotypeHypothesis,
  ViabilityRule,
  WeightedState,
} from './types';

export function compareIdentifiers(left: string, right: string): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
}

export function canonicalAlleles(alleles: readonly [string, string]): [string, string] {
  const [first, second] = alleles;
  assertIdentifier(first, 'Allele identifier');
  assertIdentifier(second, 'Allele identifier');
  return first <= second ? [first, second] : [second, first];
}

export function canonicalGenotype(genotype: DiploidGenotype): DiploidGenotype {
  assertIdentifier(genotype.locusId, 'Locus identifier');
  return { ...genotype, alleles: canonicalAlleles(genotype.alleles) };
}

export function identifierTupleKey(parts: readonly string[]): string {
  return JSON.stringify(parts);
}

export function genotypeKey(genotype: DiploidGenotype): string {
  const normalized = canonicalGenotype(genotype);
  return identifierTupleKey([
    normalized.locusId,
    normalized.alleles[0],
    normalized.alleles[1],
  ]);
}

export function offspringKey(offspring: MultiLocusOffspring): string {
  const normalized = [...offspring.loci]
    .map(canonicalGenotype)
    .sort((left, right) => compareIdentifiers(left.locusId, right.locusId));
  return JSON.stringify(
    normalized.map((genotype) => [
      genotype.locusId,
      genotype.alleles[0],
      genotype.alleles[1],
    ]),
  );
}

export function uniqueGametes(genotype: DiploidGenotype): readonly WeightedState<string>[] {
  const normalized = canonicalGenotype(genotype);
  if (normalized.alleles[0] === normalized.alleles[1]) {
    return [{ value: normalized.alleles[0], probability: Rational.ONE }];
  }
  return [
    { value: normalized.alleles[0], probability: new Rational(1n, 2n) },
    { value: normalized.alleles[1], probability: new Rational(1n, 2n) },
  ];
}

export function crossSingleLocus(
  maternal: DiploidGenotype,
  paternal: DiploidGenotype,
): readonly WeightedState<DiploidGenotype>[] {
  if (maternal.locusId !== paternal.locusId) {
    throw new TypeError(`Parents must reference the same locus; received ${maternal.locusId} and ${paternal.locusId}.`);
  }
  const aggregated = new Map<string, WeightedState<DiploidGenotype>>();
  for (const maternalGamete of uniqueGametes(maternal)) {
    for (const paternalGamete of uniqueGametes(paternal)) {
      const value = canonicalGenotype({
        locusId: maternal.locusId,
        alleles: [maternalGamete.value, paternalGamete.value],
        evidenceState: 'assumed',
      });
      const probability = maternalGamete.probability.multiply(paternalGamete.probability);
      const key = genotypeKey(value);
      const current = aggregated.get(key);
      aggregated.set(key, { value, probability: current ? current.probability.add(probability) : probability });
    }
  }
  const result = [...aggregated.values()].sort((a, b) => compareIdentifiers(genotypeKey(a.value), genotypeKey(b.value)));
  assertProbabilityMass(result, 'single-locus offspring');
  return result;
}

function indexByLocus(genotypes: readonly DiploidGenotype[]): Map<string, DiploidGenotype> {
  const index = new Map<string, DiploidGenotype>();
  for (const genotype of genotypes) {
    if (index.has(genotype.locusId)) throw new TypeError(`Duplicate locus ${genotype.locusId}.`);
    index.set(genotype.locusId, genotype);
  }
  return index;
}

export function crossIndependentLoci(
  maternal: readonly DiploidGenotype[],
  paternal: readonly DiploidGenotype[],
  maxStates = 100_000,
): readonly WeightedState<MultiLocusOffspring>[] {
  if (!Number.isSafeInteger(maxStates) || maxStates < 1) {
    throw new RangeError('maxStates must be a positive safe integer.');
  }
  if (maternal.length === 0 || paternal.length === 0) {
    throw new RangeError('Exact crossing requires at least one locus for each parent.');
  }
  const maternalIndex = indexByLocus(maternal);
  const paternalIndex = indexByLocus(paternal);
  const maternalLoci = [...maternalIndex.keys()].sort();
  const paternalLoci = [...paternalIndex.keys()].sort();
  if (identifierTupleKey(maternalLoci) !== identifierTupleKey(paternalLoci)) {
    throw new TypeError('Maternal and paternal parents must define the same locus set.');
  }

  let states: Array<WeightedState<MultiLocusOffspring>> = [
    { value: { loci: [] }, probability: Rational.ONE },
  ];
  for (const locusId of maternalLoci) {
    const maternalGenotype = maternalIndex.get(locusId);
    const paternalGenotype = paternalIndex.get(locusId);
    if (!maternalGenotype || !paternalGenotype) throw new TypeError(`Missing locus ${locusId}.`);
    const locusOutcomes = crossSingleLocus(maternalGenotype, paternalGenotype);
    if (states.length > Math.floor(maxStates / locusOutcomes.length)) {
      throw new RangeError(
        `Exact state space exceeds the configured limit of ${maxStates.toLocaleString('en-US')} outcomes.`,
      );
    }
    const next: Array<WeightedState<MultiLocusOffspring>> = [];
    for (const state of states) {
      for (const outcome of locusOutcomes) {
        next.push({
          value: { loci: [...state.value.loci, outcome.value] },
          probability: state.probability.multiply(outcome.probability),
        });
      }
    }
    states = next;
  }
  assertProbabilityMass(states, 'multi-locus offspring');
  return states;
}

export function crossUncertainParents(
  maternal: readonly ParentGenotypeHypothesis[],
  paternal: readonly ParentGenotypeHypothesis[],
  maxStates = 100_000,
  maxHypothesisPairs = 10_000,
  maxExpandedStates = 1_000_000,
): readonly WeightedState<MultiLocusOffspring>[] {
  if (maternal.length === 0 || paternal.length === 0) {
    throw new RangeError('Uncertain-parent crossing requires at least one hypothesis for each parent.');
  }
  if (!Number.isSafeInteger(maxHypothesisPairs) || maxHypothesisPairs < 1) {
    throw new RangeError('maxHypothesisPairs must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(maxExpandedStates) || maxExpandedStates < 1) {
    throw new RangeError('maxExpandedStates must be a positive safe integer.');
  }
  if (maternal.length > Math.floor(maxHypothesisPairs / paternal.length)) {
    throw new RangeError(
      `Parent uncertainty expands beyond the configured limit of ${maxHypothesisPairs.toLocaleString('en-US')} hypothesis pairs.`,
    );
  }
  for (const hypothesis of [...maternal, ...paternal]) {
    if (hypothesis.probability.isZero()) {
      throw new RangeError('Parent genotype hypotheses must have positive probability.');
    }
  }
  assertProbabilityMass(maternal.map((state) => ({ value: state, probability: state.probability })), 'maternal hypotheses');
  assertProbabilityMass(paternal.map((state) => ({ value: state, probability: state.probability })), 'paternal hypotheses');
  const aggregated = new Map<string, WeightedState<MultiLocusOffspring>>();
  let expandedStates = 0;
  for (const maternalHypothesis of maternal) {
    for (const paternalHypothesis of paternal) {
      const prior = maternalHypothesis.probability.multiply(paternalHypothesis.probability);
      const pairOutcomes = crossIndependentLoci(
        maternalHypothesis.loci,
        paternalHypothesis.loci,
        maxStates,
      );
      if (expandedStates > maxExpandedStates - pairOutcomes.length) {
        throw new RangeError(
          `Uncertainty expansion exceeds the configured computation budget of ${maxExpandedStates.toLocaleString('en-US')} weighted offspring states.`,
        );
      }
      expandedStates += pairOutcomes.length;
      for (const outcome of pairOutcomes) {
        const probability = prior.multiply(outcome.probability);
        const key = offspringKey(outcome.value);
        const current = aggregated.get(key);
        if (!current && aggregated.size >= maxStates) {
          throw new RangeError(
            `Marginalized exact state space exceeds the configured limit of ${maxStates.toLocaleString('en-US')} outcomes.`,
          );
        }
        aggregated.set(key, {
          value: outcome.value,
          probability: current ? current.probability.add(probability) : probability,
        });
      }
    }
  }
  const result = [...aggregated.values()].sort((a, b) => compareIdentifiers(offspringKey(a.value), offspringKey(b.value)));
  assertProbabilityMass(result, 'uncertain-parent offspring');
  return result;
}

function matchesViabilityRule(offspring: MultiLocusOffspring, rule: ViabilityRule): boolean {
  const genotype = offspring.loci.find((item) => item.locusId === rule.locusId);
  if (!genotype) return false;
  const expected = canonicalAlleles(rule.alleles);
  const actual = canonicalAlleles(genotype.alleles);
  return expected[0] === actual[0] && expected[1] === actual[1];
}

export function applyViability(
  conception: readonly WeightedState<MultiLocusOffspring>[],
  rules: readonly ViabilityRule[],
): ExactCrossResult {
  assertProbabilityMass(conception, 'conception offspring');
  const ruleIds = new Set<string>();
  const availableLoci = new Set(conception[0]?.value.loci.map((locus) => locus.locusId) ?? []);
  for (const rule of rules) {
    if (ruleIds.has(rule.id)) throw new TypeError(`Duplicate viability rule id ${rule.id}.`);
    ruleIds.add(rule.id);
    if (!availableLoci.has(rule.locusId)) {
      throw new TypeError(`Viability rule ${rule.id} references absent locus ${rule.locusId}.`);
    }
    if (rule.sourceAssertionIds.length === 0) {
      throw new RangeError(`Viability rule ${rule.id} requires at least one supporting assertion.`);
    }
    if (new Set(rule.sourceAssertionIds).size !== rule.sourceAssertionIds.length) {
      throw new TypeError(`Viability rule ${rule.id} contains duplicate supporting assertions.`);
    }
    if (rule.viability.isNegative() || rule.viability.compare(Rational.ONE) > 0) {
      throw new RangeError(`Viability for rule ${rule.id} must be between 0 and 1.`);
    }
  }
  const weighted: Array<WeightedState<MultiLocusOffspring>> = [];
  for (const state of conception) {
    let viability = Rational.ONE;
    for (const rule of rules) if (matchesViabilityRule(state.value, rule)) viability = viability.multiply(rule.viability);
    weighted.push({ value: state.value, probability: state.probability.multiply(viability) });
  }
  const survivingMass = sumRationals(weighted.map((state) => state.probability));
  const excludedProbability = Rational.ONE.subtract(survivingMass);
  const surviving = survivingMass.isZero()
    ? []
    : weighted.filter((state) => !state.probability.isZero()).map((state) => ({
        value: state.value,
        probability: state.probability.divide(survivingMass),
      }));
  if (surviving.length > 0) assertProbabilityMass(surviving, 'surviving offspring');
  return {
    conception,
    surviving,
    excludedProbability,
    warnings: excludedProbability.isZero() ? [] : ['Surviving-offspring probabilities were renormalized after explicit viability filtering.'],
  };
}

export function assertProbabilityMass<T>(states: readonly WeightedState<T>[], label: string): void {
  if (states.length === 0) throw new RangeError(`${label} must contain at least one state.`);
  for (const state of states) if (state.probability.isNegative()) throw new RangeError(`${label} contains a negative probability.`);
  const total = sumRationals(states.map((state) => state.probability));
  if (!total.equals(Rational.ONE)) throw new RangeError(`${label} probabilities must sum exactly to 1; received ${total.toString()}.`);
}
