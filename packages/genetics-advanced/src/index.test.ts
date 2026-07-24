import { describe, expect, it } from 'vitest';
import { crossIndependentLoci, Rational } from '@capsicum/genetics-core';
import { applyApprovedBinaryPenetrance, crossLinkedTwoLocus, evaluateApprovedRuleGraph, evaluateHostPathogenInteraction, linkedTwoLocusGametes, runCategoricalMonteCarlo, transmitMaternalState } from './index';

const phased = {
  firstLocusId: 'L1', secondLocusId: 'L2',
  homologOne: { firstLocusAllele: 'A', secondLocusAllele: 'B' },
  homologTwo: { firstLocusAllele: 'a', secondLocusAllele: 'b' },
  phaseEvidence: 'verified' as const,
};

describe('linked loci', () => {
  it('produces only parental haplotypes at r=0', () => {
    const result = linkedTwoLocusGametes(phased, Rational.ZERO);
    expect(result.filter((item) => !item.probability.isZero())).toHaveLength(2);
  });

  it('does not collapse delimiter-containing haplotypes into the same internal state', () => {
    const collisionProne = {
      firstLocusId: 'L1',
      secondLocusId: 'L2',
      homologOne: { firstLocusAllele: 'A::B', secondLocusAllele: 'C' },
      homologTwo: { firstLocusAllele: 'A', secondLocusAllele: 'B::C' },
      phaseEvidence: 'verified' as const,
    };
    expect(linkedTwoLocusGametes(collisionProne, new Rational(1, 2))).toHaveLength(4);
  });

  it('rejects recombination fractions above the biological maximum exactly', () => {
    expect(() => linkedTwoLocusGametes(phased, new Rational(5000000000000001n, 10000000000000000n))).toThrow(/between 0 and 0.5/);
  });

  it('converges to independent gametes at r=0.5', () => {
    const result = linkedTwoLocusGametes(phased, new Rational(1, 2));
    expect(result.map((item) => item.probability.toString())).toEqual(['1/4', '1/4', '1/4', '1/4']);
  });
});

describe('maternal inheritance', () => {
  it('preserves parent direction', () => {
    const result = transmitMaternalState({ maternalPlantId: 'M', paternalPlantId: 'P', maternalState: { systemId: 'cms', stateId: 'S', evidenceState: 'verified' } });
    expect(result.maternalPlantId).toBe('M');
    expect(result.inheritedState.stateId).toBe('S');
  });
});


describe('linked offspring', () => {
  it('crosses phased parents with exact recombination fractions', () => {
    const result = crossLinkedTwoLocus({
      maternal: phased,
      paternal: phased,
      maternalRecombinationFraction: Rational.ZERO,
      paternalRecombinationFraction: Rational.ZERO,
    });
    expect(result.reduce((sum, item) => sum.add(item.probability), Rational.ZERO).toString()).toBe('1/1');
    expect(result).toHaveLength(3);
  });
});

describe('approved penetrance rules', () => {
  it('keeps phenotype interpretation conditional and versioned', () => {
    const genotype = (locusId: string, a: string, b: string) => ({
      locusId, alleles: [a, b] as const, evidenceState: 'verified' as const,
    });
    const distribution = crossIndependentLoci(
      [genotype('L1', 'A', 'B')],
      [genotype('L1', 'A', 'B')],
    );
    const result = applyApprovedBinaryPenetrance(distribution, {
      ruleId: 'synthetic-rule',
      ruleVersion: 'test-only-1',
      approved: true,
      requirements: [{ locusId: 'L1', alleles: ['B', 'B'] }],
      penetrance: new Rational(4, 5),
      supportingAssertionIds: ['synthetic-approved-fixture'],
      applicabilityContext: { environment: 'test-only' },
    });
    expect(result.present.toString()).toBe('1/5');
    expect(result.authority).toBe('conditional_supported');
  });
});

describe('governed advanced model boundaries', () => {
  it('resolves only approved applicability-scoped rule graphs', () => {
    const result = evaluateApprovedRuleGraph({
      offspring: {
        loci: [{ locusId: 'L1', alleles: ['a', 'a'], evidenceState: 'verified' }],
      },
      applicabilityId: 'fruit-color-context-v1',
      rules: [{
        id: 'rule-red', version: '1', priority: 100, approved: true,
        all: [{ locusId: 'L1', operator: 'equals', alleleIds: ['a', 'a'] }],
        outcomePhenotypeId: 'red', authority: 'conditional_supported',
        applicabilityId: 'fruit-color-context-v1', sourceAssertionIds: ['assertion-1'],
      }],
    });
    expect(result.state).toBe('resolved');
  });

  it('abstains from host-pathogen claims when pathogen context is incomplete', () => {
    const result = evaluateHostPathogenInteraction({
      hostGenotypes: [{ locusId: 'R1', alleles: ['r', 'r'], evidenceState: 'verified' }],
      context: { pathogenTaxon: 'Synthetic pathogen' },
      rules: [],
    });
    expect(result.outcome).toBe('insufficient_evidence');
    expect(result.missingContext).not.toHaveLength(0);
  });

  it('produces deterministic sampled estimates from a stored seed', () => {
    const input = {
      states: [
        { value: 'target', probability: new Rational(1, 4) },
        { value: 'other', probability: new Rational(3, 4) },
      ],
      key: (value: string) => value,
      seed: 20260722,
      sampleCount: 20_000,
      fallbackReason: 'exact_state_limit' as const,
    };
    const first = runCategoricalMonteCarlo(input);
    const second = runCategoricalMonteCarlo(input);
    expect(first).toEqual(second);
    expect(first.diagnostics.maximumAbsoluteError).toBeLessThan(0.02);
  });
});

import { adjustPValuesHolm, reconcileObservedSegregation } from './segregation';

describe('observed segregation reconciliation', () => {
  it('returns a perfect chi-square fit for a sufficiently large 3:1 fixture', () => {
    const result = reconcileObservedSegregation({
      categories: [
        { categoryId: 'dominant', observedCount: 75, expectedProbability: new Rational(3, 4) },
        { categoryId: 'recessive', observedCount: 25, expectedProbability: new Rational(1, 4) },
      ],
    });
    expect(result.method).toBe('chi_square');
    expect(result.statistic).toBe(0);
    expect(result.pValue).toBe(1);
  });

  it('uses an exact binomial test when a two-category expected count is small', () => {
    const result = reconcileObservedSegregation({
      categories: [
        { categoryId: 'target', observedCount: 1, expectedProbability: new Rational(1, 4) },
        { categoryId: 'other', observedCount: 3, expectedProbability: new Rational(3, 4) },
      ],
      missingCount: 2,
    });
    expect(result.method).toBe('exact_binomial');
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
    expect(result.sampleSize).toBe(4);
    expect(result.missingCount).toBe(2);
  });

  it('abstains from unsupported small multinomial inference', () => {
    const result = reconcileObservedSegregation({
      categories: [
        { categoryId: 'AA', observedCount: 1, expectedProbability: new Rational(1, 4) },
        { categoryId: 'Aa', observedCount: 2, expectedProbability: new Rational(1, 2) },
        { categoryId: 'aa', observedCount: 1, expectedProbability: new Rational(1, 4) },
      ],
    });
    expect(result.method).toBe('insufficient_for_supported_test');
    expect(result.pValue).toBeNull();
    expect(result.assumptionsMet).toBe(false);
  });

  it('applies monotone Holm correction in original test order', () => {
    expect(adjustPValuesHolm([
      { testId: 'a', pValue: 0.01 },
      { testId: 'b', pValue: 0.04 },
      { testId: 'c', pValue: 0.03 },
    ])).toEqual([
      { testId: 'a', rawPValue: 0.01, holmAdjustedPValue: 0.03 },
      { testId: 'b', rawPValue: 0.04, holmAdjustedPValue: 0.06 },
      { testId: 'c', rawPValue: 0.03, holmAdjustedPValue: 0.06 },
    ]);
  });
});
