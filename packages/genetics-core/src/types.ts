import type { Rational } from './rational';

export type EvidenceState = 'verified' | 'inferred' | 'assumed' | 'unknown' | 'conflicting';

export interface DiploidGenotype {
  locusId: string;
  alleles: readonly [string, string];
  evidenceState: EvidenceState;
}

export interface WeightedState<T> { value: T; probability: Rational }
export interface ParentGenotypeHypothesis {
  loci: readonly DiploidGenotype[];
  probability: Rational;
  basis: 'assay' | 'pedigree' | 'phenotype' | 'user_prior' | 'model';
  evidenceIds: readonly string[];
}

export interface MultiLocusOffspring {
  loci: readonly DiploidGenotype[];
}

export interface ViabilityRule {
  id: string;
  locusId: string;
  alleles: readonly [string, string];
  viability: Rational;
  sourceAssertionIds: readonly string[];
}

export interface ExactCrossResult {
  conception: readonly WeightedState<MultiLocusOffspring>[];
  surviving: readonly WeightedState<MultiLocusOffspring>[];
  excludedProbability: Rational;
  warnings: readonly string[];
}
