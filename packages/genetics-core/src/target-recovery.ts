export interface OperationalFactors {
  germination: number;
  survival: number;
  observationSuccess: number;
  assaySuccess: number;
}

export interface TargetRecoveryPlan {
  geneticProbability: number;
  practicalProbability: number;
  confidence: number;
  geneticPopulation: number | null;
  practicalPopulation: number | null;
  geneticReachable: boolean;
  operationallyReachable: boolean;
}

function validateProbability(value: number, label: string, allowZero = false): void {
  const valid = Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) && value <= 1;
  if (!valid) {
    throw new RangeError(
      `${label} must be ${allowZero ? 'between 0 and 1' : 'greater than 0 and at most 1'}.`,
    );
  }
}

export function requiredPopulation(probability: number, confidence: number): number {
  validateProbability(probability, 'Target probability');
  validateProbability(confidence, 'Confidence');
  if (confidence === 1) throw new RangeError('Finite population cannot guarantee 100% confidence.');
  if (probability === 1) return 1;
  const population = Math.ceil(Math.log1p(-confidence) / Math.log1p(-probability));
  if (!Number.isSafeInteger(population)) {
    throw new RangeError('Required population exceeds JavaScript safe-integer capacity.');
  }
  return population;
}

export function planTargetRecovery(
  geneticProbability: number,
  confidence: number,
  factors: OperationalFactors = {
    germination: 1,
    survival: 1,
    observationSuccess: 1,
    assaySuccess: 1,
  },
): TargetRecoveryPlan {
  validateProbability(geneticProbability, 'Genetic probability', true);
  validateProbability(confidence, 'Confidence');
  if (confidence === 1) throw new RangeError('Finite population cannot guarantee 100% confidence.');
  for (const [label, value] of Object.entries(factors)) validateProbability(value, label, true);
  const practicalProbability =
    geneticProbability *
    factors.germination *
    factors.survival *
    factors.observationSuccess *
    factors.assaySuccess;
  return {
    geneticProbability,
    practicalProbability,
    confidence,
    geneticPopulation:
      geneticProbability > 0 ? requiredPopulation(geneticProbability, confidence) : null,
    practicalPopulation:
      practicalProbability > 0 ? requiredPopulation(practicalProbability, confidence) : null,
    geneticReachable: geneticProbability > 0,
    operationallyReachable: practicalProbability > 0,
  };
}
