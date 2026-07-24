import { describe, expect, it } from 'vitest';
import {
  Rational,
  applyViability,
  crossIndependentLoci,
  crossSingleLocus,
  crossUncertainParents,
  genotypeKey,
  planTargetRecovery,
  requiredPopulation,
} from './index';
import type { DiploidGenotype, ParentGenotypeHypothesis } from './types';

const genotype = (locusId: string, first: string, second: string): DiploidGenotype => ({
  locusId, alleles: [first, second], evidenceState: 'verified',
});

function distribution(entries: ReturnType<typeof crossSingleLocus>): Record<string, string> {
  return Object.fromEntries(
    entries.map((entry) => [entry.value.alleles.join(' / '), entry.probability.toString()]),
  );
}

describe('rational numeric projection', () => {
  it('avoids Infinity divided by Infinity for very large exact fractions', () => {
    const numerator = `${'9'.repeat(350)}1`;
    const denominator = `${'9'.repeat(350)}3`;
    expect(new Rational(numerator, denominator).toNumber()).toBeCloseTo(1, 12);
  });
});

describe('exact nuclear genetics', () => {
  it('calculates a heterozygote self-cross exactly', () => {
    expect(distribution(crossSingleLocus(genotype('L1', 'A1', 'A2'), genotype('L1', 'A1', 'A2')))).toEqual({
      'A1 / A1': '1/4', 'A1 / A2': '1/2', 'A2 / A2': '1/4',
    });
  });

  it('uses collision-safe structured genotype keys', () => {
    const first = genotypeKey(genotype('L::1', 'A|B', 'C'));
    const second = genotypeKey(genotype('L::1', 'A', 'B|C'));
    expect(first).not.toBe(second);
  });

  it('does not interpret capitalization as dominance', () => {
    expect(distribution(crossSingleLocus(genotype('Pun1', 'functional', 'null-1'), genotype('Pun1', 'functional', 'null-1')))).toEqual({
      'functional / functional': '1/4',
      'functional / null-1': '1/2',
      'null-1 / null-1': '1/4',
    });
  });

  it('is invariant to parent swap for nuclear inheritance', () => {
    const left = crossSingleLocus(genotype('L1', 'A', 'B'), genotype('L1', 'A', 'C'));
    const right = crossSingleLocus(genotype('L1', 'A', 'C'), genotype('L1', 'A', 'B'));
    expect(distribution(left)).toEqual(distribution(right));
  });

  it('rejects an empty cross rather than returning a vacuous state', () => {
    expect(() => crossIndependentLoci([], [])).toThrow(/at least one locus/);
  });

  it('combines independent loci without floating point probability authority', () => {
    const result = crossIndependentLoci(
      [genotype('L1', 'A', 'B'), genotype('L2', 'C', 'D')],
      [genotype('L1', 'A', 'B'), genotype('L2', 'C', 'D')],
    );
    expect(result).toHaveLength(9);
    expect(result.reduce((sum, item) => sum.add(item.probability), Rational.ZERO).toString()).toBe('1/1');
  });


  it('rejects state spaces above the configured exact-computation limit', () => {
    expect(() =>
      crossIndependentLoci(
        [genotype('L1', 'A', 'B'), genotype('L2', 'C', 'D')],
        [genotype('L1', 'A', 'B'), genotype('L2', 'C', 'D')],
        8,
      ),
    ).toThrow(/state space exceeds/);
  });

  it('marginalizes uncertain parent genotypes', () => {
    const maternal: ParentGenotypeHypothesis[] = [
      { loci: [genotype('L1', 'A', 'A')], probability: new Rational(1, 2), basis: 'user_prior', evidenceIds: [] },
      { loci: [genotype('L1', 'A', 'B')], probability: new Rational(1, 2), basis: 'user_prior', evidenceIds: [] },
    ];
    const paternal: ParentGenotypeHypothesis[] = [
      { loci: [genotype('L1', 'B', 'B')], probability: Rational.ONE, basis: 'assay', evidenceIds: ['assay-1'] },
    ];
    const result = Object.fromEntries(crossUncertainParents(maternal, paternal).map((entry) => [entry.value.loci[0]?.alleles.join('|'), entry.probability.toString()]));
    expect(result).toEqual({ 'A|B': '3/4', 'B|B': '1/4' });
  });

  it('rejects biologically invalid viability weights', () => {
    const conception = crossIndependentLoci([genotype('L1', 'A', 'B')], [genotype('L1', 'A', 'B')]);
    expect(() => applyViability(conception, [{
      id: 'invalid', locusId: 'L1', alleles: ['B', 'B'],
      viability: new Rational(3, 2), sourceAssertionIds: ['synthetic-test'],
    }])).toThrow(/between 0 and 1/);
  });


  it('requires provenance for viability claims', () => {
    const conception = crossIndependentLoci([genotype('L1', 'A', 'B')], [genotype('L1', 'A', 'B')]);
    expect(() => applyViability(conception, [{
      id: 'unsupported', locusId: 'L1', alleles: ['B', 'B'],
      viability: Rational.ZERO, sourceAssertionIds: [],
    }])).toThrow(/supporting assertion/);
  });

  it('separates conception from surviving-offspring probability', () => {
    const conception = crossIndependentLoci([genotype('L1', 'A', 'B')], [genotype('L1', 'A', 'B')]);
    const result = applyViability(conception, [{ id: 'lethal-bb', locusId: 'L1', alleles: ['B', 'B'], viability: Rational.ZERO, sourceAssertionIds: ['synthetic-test'] }]);
    expect(result.excludedProbability.toString()).toBe('1/4');
    expect(result.surviving.map((entry) => entry.probability.toString())).toEqual(['1/3', '2/3']);
  });
});

describe('target recovery', () => {
  it('requires 11 individuals for p=0.25 at 95% confidence', () => {
    expect(requiredPopulation(0.25, 0.95)).toBe(11);
  });
  it('represents unreachable targets without serializing Infinity', () => {
    const plan = planTargetRecovery(0, 0.95);
    expect(plan.geneticPopulation).toBeNull();
    expect(plan.practicalPopulation).toBeNull();
    expect(plan.geneticReachable).toBe(false);
  });
  it('keeps operational attrition explicit', () => {
    const plan = planTargetRecovery(0.25, 0.95, {
      germination: 0.9,
      survival: 0.8,
      observationSuccess: 0.95,
      assaySuccess: 1,
    });
    expect(plan.geneticPopulation).toBe(11);
    expect(plan.practicalPopulation).not.toBeNull();
    if (plan.geneticPopulation === null || plan.practicalPopulation === null) {
      throw new Error(
        'A reachable target with non-zero operational success must produce finite population sizes.',
      );
    }
    expect(plan.practicalPopulation).toBeGreaterThan(plan.geneticPopulation);
  });
});

describe('uncertainty state-space guards', () => {

  it('rejects empty or zero-weight parent hypotheses', () => {
    expect(() => crossUncertainParents([], [])).toThrow(/at least one hypothesis/);
    const zero: ParentGenotypeHypothesis = {
      loci: [genotype('L1', 'A', 'A')],
      probability: Rational.ZERO,
      basis: 'user_prior',
      evidenceIds: [],
    };
    const one: ParentGenotypeHypothesis = {
      ...zero,
      probability: Rational.ONE,
    };
    expect(() => crossUncertainParents([zero, one], [one])).toThrow(/positive probability/);
  });

  it('bounds total uncertainty expansion work, not only unique output states', () => {
    const hypothesis = (allele: string, probability: Rational): ParentGenotypeHypothesis => ({
      loci: [genotype('L1', allele, allele)],
      probability,
      basis: 'user_prior',
      evidenceIds: [],
    });
    const maternal = [
      hypothesis('A', new Rational(1, 2)),
      hypothesis('B', new Rational(1, 2)),
    ];
    const paternal = [
      hypothesis('C', new Rational(1, 2)),
      hypothesis('D', new Rational(1, 2)),
    ];
    expect(() => crossUncertainParents(maternal, paternal, 100, 100, 3)).toThrow(
      /computation budget/,
    );
  });

  it('bounds the marginalized unique offspring distribution', () => {
    const maternal: ParentGenotypeHypothesis[] = [
      { loci: [genotype('L1', 'A', 'B'), genotype('L2', 'C', 'D')], probability: Rational.ONE, basis: 'user_prior', evidenceIds: [] },
    ];
    const paternal: ParentGenotypeHypothesis[] = [
      { loci: [genotype('L1', 'A', 'B'), genotype('L2', 'C', 'D')], probability: Rational.ONE, basis: 'user_prior', evidenceIds: [] },
    ];
    expect(() => crossUncertainParents(maternal, paternal, 8)).toThrow(/state space exceeds/);
  });
});
