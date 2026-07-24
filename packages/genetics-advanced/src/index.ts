import {
  Rational,
  assertProbabilityMass,
  compareIdentifiers,
  identifierTupleKey,
  sumRationals,
} from '@capsicum/genetics-core';
import type { WeightedState } from '@capsicum/genetics-core';

export interface TwoLocusHaplotype {
  firstLocusAllele: string;
  secondLocusAllele: string;
}

export interface PhasedDiploidPair {
  firstLocusId: string;
  secondLocusId: string;
  homologOne: TwoLocusHaplotype;
  homologTwo: TwoLocusHaplotype;
  phaseEvidence: 'verified' | 'inferred' | 'assumed';
}

function haplotypeKey(haplotype: TwoLocusHaplotype): string {
  return identifierTupleKey([haplotype.firstLocusAllele, haplotype.secondLocusAllele]);
}

function aggregateGametes(
  gametes: readonly WeightedState<TwoLocusHaplotype>[],
): readonly WeightedState<TwoLocusHaplotype>[] {
  const aggregated = new Map<string, WeightedState<TwoLocusHaplotype>>();
  for (const gamete of gametes) {
    const key = haplotypeKey(gamete.value);
    const current = aggregated.get(key);
    aggregated.set(key, {
      value: gamete.value,
      probability: current ? current.probability.add(gamete.probability) : gamete.probability,
    });
  }
  const result = [...aggregated.values()]
    .filter((item) => !item.probability.isZero())
    .sort((left, right) => compareIdentifiers(haplotypeKey(left.value), haplotypeKey(right.value)));
  const total = sumRationals(result.map((item) => item.probability));
  if (!total.equals(Rational.ONE)) {
    throw new RangeError(`Linked gamete probabilities must sum exactly to 1; received ${total}.`);
  }
  return result;
}

export function linkedTwoLocusGametes(
  phased: PhasedDiploidPair,
  recombinationFraction: Rational,
): readonly WeightedState<TwoLocusHaplotype>[] {
  if (!phased.firstLocusId.trim() || !phased.secondLocusId.trim()) {
    throw new TypeError('Linked locus identifiers are required.');
  }
  if (phased.firstLocusId === phased.secondLocusId) {
    throw new TypeError('A linked model requires two distinct loci.');
  }
  if (!['verified', 'inferred', 'assumed'].includes(phased.phaseEvidence)) {
    throw new RangeError('Unknown phase requires explicit scenario-separated or weighted phase hypotheses.');
  }
  for (const allele of [
    phased.homologOne.firstLocusAllele,
    phased.homologOne.secondLocusAllele,
    phased.homologTwo.firstLocusAllele,
    phased.homologTwo.secondLocusAllele,
  ]) {
    if (!allele.trim()) throw new TypeError('Linked haplotype allele identifiers are required.');
  }
  if (
    recombinationFraction.isNegative() ||
    recombinationFraction.compare(new Rational(1, 2)) > 0
  ) {
    throw new RangeError('Recombination fraction must be between 0 and 0.5.');
  }
  const half = new Rational(1, 2);
  const parentalWeight = Rational.ONE.subtract(recombinationFraction).multiply(half);
  const recombinantWeight = recombinationFraction.multiply(half);
  return aggregateGametes([
    { value: phased.homologOne, probability: parentalWeight },
    { value: phased.homologTwo, probability: parentalWeight },
    {
      value: {
        firstLocusAllele: phased.homologOne.firstLocusAllele,
        secondLocusAllele: phased.homologTwo.secondLocusAllele,
      },
      probability: recombinantWeight,
    },
    {
      value: {
        firstLocusAllele: phased.homologTwo.firstLocusAllele,
        secondLocusAllele: phased.homologOne.secondLocusAllele,
      },
      probability: recombinantWeight,
    },
  ]);
}

export interface MaternalState {
  systemId: string;
  stateId: string;
  evidenceState: 'verified' | 'inferred' | 'assumed' | 'unknown';
}

export interface MaternalTransmissionResult {
  maternalPlantId: string;
  paternalPlantId: string;
  inheritedState: MaternalState;
  probability: Rational;
  authority: 'conditional_supported';
}

export function transmitMaternalState(input: {
  maternalPlantId: string;
  paternalPlantId: string;
  maternalState: MaternalState;
}): MaternalTransmissionResult {
  if (!input.maternalPlantId.trim() || !input.paternalPlantId.trim()) {
    throw new TypeError('Maternal and paternal plant identifiers are required.');
  }
  if (!input.maternalState.systemId.trim() || !input.maternalState.stateId.trim()) {
    throw new TypeError('Maternal system and state identifiers are required.');
  }
  if (input.maternalState.evidenceState === 'unknown') {
    throw new RangeError('Maternal state is unknown; provide explicit scenarios instead of a hidden assumption.');
  }
  return {
    maternalPlantId: input.maternalPlantId,
    paternalPlantId: input.paternalPlantId,
    inheritedState: input.maternalState,
    probability: Rational.ONE,
    authority: 'conditional_supported',
  };
}

export interface LinkedDiploidOffspring {
  firstLocusId: string;
  secondLocusId: string;
  firstLocusAlleles: readonly [string, string];
  secondLocusAlleles: readonly [string, string];
}

function allelePair(first: string, second: string): [string, string] {
  return first <= second ? [first, second] : [second, first];
}

function linkedOffspringKey(offspring: LinkedDiploidOffspring): string {
  return identifierTupleKey([
    offspring.firstLocusId,
    offspring.firstLocusAlleles[0],
    offspring.firstLocusAlleles[1],
    offspring.secondLocusId,
    offspring.secondLocusAlleles[0],
    offspring.secondLocusAlleles[1],
  ]);
}

export function crossLinkedTwoLocus(input: {
  maternal: PhasedDiploidPair;
  paternal: PhasedDiploidPair;
  maternalRecombinationFraction: Rational;
  paternalRecombinationFraction: Rational;
}): readonly WeightedState<LinkedDiploidOffspring>[] {
  if (
    input.maternal.firstLocusId !== input.paternal.firstLocusId ||
    input.maternal.secondLocusId !== input.paternal.secondLocusId
  ) {
    throw new TypeError('Maternal and paternal linked models must reference the same ordered locus pair.');
  }
  if (input.maternal.firstLocusId === input.maternal.secondLocusId) {
    throw new TypeError('A linked model requires two distinct loci.');
  }
  const maternalGametes = linkedTwoLocusGametes(input.maternal, input.maternalRecombinationFraction);
  const paternalGametes = linkedTwoLocusGametes(input.paternal, input.paternalRecombinationFraction);
  const aggregated = new Map<string, WeightedState<LinkedDiploidOffspring>>();
  for (const maternal of maternalGametes) {
    for (const paternal of paternalGametes) {
      const value: LinkedDiploidOffspring = {
        firstLocusId: input.maternal.firstLocusId,
        secondLocusId: input.maternal.secondLocusId,
        firstLocusAlleles: allelePair(
          maternal.value.firstLocusAllele,
          paternal.value.firstLocusAllele,
        ),
        secondLocusAlleles: allelePair(
          maternal.value.secondLocusAllele,
          paternal.value.secondLocusAllele,
        ),
      };
      const probability = maternal.probability.multiply(paternal.probability);
      const key = linkedOffspringKey(value);
      const current = aggregated.get(key);
      aggregated.set(key, {
        value,
        probability: current ? current.probability.add(probability) : probability,
      });
    }
  }
  const result = [...aggregated.values()].sort((left, right) =>
    compareIdentifiers(linkedOffspringKey(left.value), linkedOffspringKey(right.value)),
  );
  const total = sumRationals(result.map((item) => item.probability));
  if (!total.equals(Rational.ONE)) {
    throw new RangeError(`Linked offspring probabilities must sum exactly to 1; received ${total}.`);
  }
  return result;
}

export interface GenotypeRequirement {
  locusId: string;
  alleles: readonly [string, string];
}

export interface ApprovedBinaryPhenotypeRule {
  ruleId: string;
  ruleVersion: string;
  approved: true;
  requirements: readonly GenotypeRequirement[];
  penetrance: Rational;
  supportingAssertionIds: readonly string[];
  applicabilityContext: Readonly<Record<string, string>>;
}

export interface PhenotypeProbabilityResult {
  present: Rational;
  absent: Rational;
  authority: 'conditional_supported';
  ruleId: string;
  ruleVersion: string;
  supportingAssertionIds: readonly string[];
  applicabilityContext: Readonly<Record<string, string>>;
}

function requirementMatches(
  offspring: { loci: readonly { locusId: string; alleles: readonly [string, string] }[] },
  requirement: GenotypeRequirement,
): boolean {
  const observed = offspring.loci.find((locus) => locus.locusId === requirement.locusId);
  if (!observed) return false;
  const observedPair = allelePair(observed.alleles[0], observed.alleles[1]);
  const requiredPair = allelePair(requirement.alleles[0], requirement.alleles[1]);
  return observedPair[0] === requiredPair[0] && observedPair[1] === requiredPair[1];
}

export function applyApprovedBinaryPenetrance(
  distribution: readonly WeightedState<{
    loci: readonly { locusId: string; alleles: readonly [string, string] }[];
  }>[],
  rule: ApprovedBinaryPhenotypeRule,
): PhenotypeProbabilityResult {
  if (rule.approved !== true) {
    throw new RangeError('A phenotype rule must be explicitly approved before execution.');
  }
  if (rule.penetrance.isNegative() || rule.penetrance.compare(Rational.ONE) > 0) {
    throw new RangeError('Penetrance must be between 0 and 1.');
  }
  if (rule.supportingAssertionIds.length === 0) {
    throw new RangeError('A phenotype rule requires at least one supporting approved assertion.');
  }
  if (rule.requirements.length === 0) {
    throw new RangeError('A phenotype rule requires at least one explicit genotype requirement.');
  }
  const requirementLoci = rule.requirements.map((requirement) => requirement.locusId);
  if (new Set(requirementLoci).size !== requirementLoci.length) {
    throw new TypeError('A phenotype rule cannot contain duplicate locus requirements.');
  }
  if (new Set(rule.supportingAssertionIds).size !== rule.supportingAssertionIds.length) {
    throw new TypeError('A phenotype rule cannot contain duplicate supporting assertions.');
  }
  assertProbabilityMass(distribution, 'phenotype input genotype distribution');
  let eligible = Rational.ZERO;
  for (const state of distribution) {
    if (rule.requirements.every((requirement) => requirementMatches(state.value, requirement))) {
      eligible = eligible.add(state.probability);
    }
  }
  const present = eligible.multiply(rule.penetrance);
  return {
    present,
    absent: Rational.ONE.subtract(present),
    authority: 'conditional_supported',
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    supportingAssertionIds: rule.supportingAssertionIds,
    applicabilityContext: rule.applicabilityContext,
  };
}

export * from './rule-graph';
export * from './host-pathogen';
export * from './monte-carlo';

export * from './segregation';
