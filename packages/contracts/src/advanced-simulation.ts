import { z } from 'zod';

const identifier = z.string().trim().min(1).max(200);
const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const requestId = z.string().trim().min(8).max(200);

export const rationalInputSchema = z.object({
  numerator: z.string().regex(/^-?\d+$/).max(100),
  denominator: z.string().regex(/^\d+$/).max(100),
}).superRefine((value, context) => {
  if (BigInt(value.denominator) <= 0n) {
    context.addIssue({ code: 'custom', path: ['denominator'], message: 'Denominator must be positive.' });
  }
});

const probabilityInputSchema = rationalInputSchema.superRefine((value, context) => {
  const numerator = BigInt(value.numerator);
  const denominator = BigInt(value.denominator);
  if (numerator < 0n || numerator > denominator) {
    context.addIssue({ code: 'custom', message: 'Probability must be between zero and one.' });
  }
});

const evidenceState = z.enum(['verified', 'inferred', 'assumed', 'unknown', 'conflicting']);
const phaseEvidence = z.enum(['verified', 'inferred', 'assumed']);

const phasedParent = z.object({
  materialId: uuid,
  firstLocusId: identifier,
  secondLocusId: identifier,
  homologOne: z.object({ firstLocusAllele: identifier, secondLocusAllele: identifier }),
  homologTwo: z.object({ firstLocusAllele: identifier, secondLocusAllele: identifier }),
  phaseEvidence,
  recombinationFraction: probabilityInputSchema,
}).superRefine((value, context) => {
  if (value.firstLocusId === value.secondLocusId) {
    context.addIssue({ code: 'custom', path: ['secondLocusId'], message: 'Linked loci must be distinct.' });
  }
  const numerator = BigInt(value.recombinationFraction.numerator);
  const denominator = BigInt(value.recombinationFraction.denominator);
  if (numerator * 2n > denominator) {
    context.addIssue({ code: 'custom', path: ['recombinationFraction'], message: 'Recombination fraction cannot exceed one half.' });
  }
});

const genotype = z.object({
  locusId: identifier,
  alleles: z.tuple([identifier, identifier]),
  evidenceState,
});

const parentHypothesis = z.object({
  probability: probabilityInputSchema,
  loci: z.array(genotype).min(1).max(64),
  basis: z.enum(['assay', 'pedigree', 'phenotype', 'user_prior', 'model']),
  evidenceIds: z.array(identifier).max(100).default([]),
}).superRefine((value, context) => {
  if (BigInt(value.probability.numerator) <= 0n) {
    context.addIssue({ code: 'custom', path: ['probability'], message: 'Every parent hypothesis must have positive probability.' });
  }
  const seen = new Set<string>();
  value.loci.forEach((locus, index) => {
    if (seen.has(locus.locusId)) {
      context.addIssue({ code: 'custom', path: ['loci', index, 'locusId'], message: 'A parent hypothesis cannot repeat a locus.' });
    }
    seen.add(locus.locusId);
  });
});

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function exactProbabilityTotal(values: readonly { numerator: string; denominator: string }[]): { numerator: bigint; denominator: bigint } {
  let numerator = 0n;
  let denominator = 1n;
  for (const value of values) {
    const nextNumerator = BigInt(value.numerator);
    const nextDenominator = BigInt(value.denominator);
    numerator = numerator * nextDenominator + nextNumerator * denominator;
    denominator *= nextDenominator;
    const divisor = greatestCommonDivisor(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
  }
  return { numerator, denominator };
}

function canonicalLocusSet(hypothesis: z.infer<typeof parentHypothesis>): string {
  return [...hypothesis.loci.map((locus) => locus.locusId)].sort().join('\0');
}

function validateHypothesisCollection(
  hypotheses: readonly z.infer<typeof parentHypothesis>[],
  path: 'maternalHypotheses' | 'paternalHypotheses',
  context: z.RefinementCtx,
): string | null {
  const total = exactProbabilityTotal(hypotheses.map((hypothesis) => hypothesis.probability));
  if (total.numerator !== total.denominator) {
    context.addIssue({ code: 'custom', path: [path], message: 'Parent hypothesis probabilities must sum exactly to one.' });
  }
  const expected = hypotheses[0] ? canonicalLocusSet(hypotheses[0]) : null;
  hypotheses.forEach((hypothesis, index) => {
    if (expected !== null && canonicalLocusSet(hypothesis) !== expected) {
      context.addIssue({ code: 'custom', path: [path, index, 'loci'], message: 'Every hypothesis for one parent must describe the same locus set.' });
    }
  });
  return expected;
}

const common = {
  schemaVersion: z.literal('2.0'),
  workspaceId: uuid,
  catalogReleaseId: z.union([uuid, z.literal('user-declared-v1')]),
  clientRequestId: requestId,
  traceId: requestId,
};

export const governedAdvancedSimulationRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    ...common,
    mode: z.literal('linked_two_locus'),
    maternal: phasedParent,
    paternal: phasedParent,
  }).superRefine((value, context) => {
    if (value.maternal.firstLocusId !== value.paternal.firstLocusId || value.maternal.secondLocusId !== value.paternal.secondLocusId) {
      context.addIssue({ code: 'custom', message: 'Maternal and paternal linked models must use the same ordered locus pair.' });
    }
  }),
  z.object({
    ...common,
    mode: z.literal('maternal_state'),
    maternalMaterialId: uuid,
    paternalMaterialId: uuid,
    maternalState: z.object({
      systemId: identifier,
      stateId: identifier,
      evidenceState: z.enum(['verified', 'inferred', 'assumed', 'unknown']),
    }),
  }),
  z.object({
    ...common,
    mode: z.literal('conditional_rule_graph'),
    materialId: uuid,
    applicabilityId: identifier,
    offspring: z.object({ loci: z.array(genotype).min(1).max(64) }),
    ruleIds: z.array(uuid).min(1).max(100),
  }),
  z.object({
    ...common,
    mode: z.literal('host_pathogen'),
    materialId: uuid,
    hostGenotypes: z.array(genotype).min(1).max(64),
    context: z.object({
      pathogenTaxon: identifier,
      strain: identifier.optional(),
      isolate: identifier.optional(),
      race: identifier.optional(),
      pathotype: identifier.optional(),
      effectorProfile: z.array(identifier).max(100).optional(),
      assayContextId: identifier,
      environmentContextId: identifier.optional(),
    }),
    ruleIds: z.array(uuid).min(1).max(100),
  }),
  z.object({
    ...common,
    mode: z.literal('direct_monte_carlo'),
    maternalMaterialId: uuid,
    paternalMaterialId: uuid,
    maternalHypotheses: z.array(parentHypothesis).min(1).max(256),
    paternalHypotheses: z.array(parentHypothesis).min(1).max(256),
    seed: z.number().int().min(0).max(0xffff_ffff),
    sampleCount: z.number().int().min(1_000).max(5_000_000),
  }).superRefine((value, context) => {
    const maternalLoci = validateHypothesisCollection(value.maternalHypotheses, 'maternalHypotheses', context);
    const paternalLoci = validateHypothesisCollection(value.paternalHypotheses, 'paternalHypotheses', context);
    if (maternalLoci !== null && paternalLoci !== null && maternalLoci !== paternalLoci) {
      context.addIssue({ code: 'custom', message: 'Maternal and paternal hypotheses must describe the same locus set.' });
    }
  }),
]);

export const governedSimulationOutcomeSchema = z.object({
  schemaVersion: z.literal('2.0'),
  requestId: uuid,
  state: z.enum(['completed', 'queued']),
  simulationRunId: uuid.optional(),
  jobId: uuid.optional(),
  modelType: identifier,
  modelVersion: identifier,
  calculationAuthority: z.enum(['exact', 'approximate', 'unsupported']),
  premiseAuthority: z.enum(['verified', 'mixed', 'inferred', 'assumed', 'conflicting', 'unknown']),
  interpretationAuthority: z.enum(['genotype_only', 'conditional_phenotype', 'unsupported']),
  inputHash: sha256,
  resultHash: sha256.optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  warnings: z.array(z.string()),
  abstentions: z.array(z.string()),
});

export type GovernedAdvancedSimulationRequest = z.infer<typeof governedAdvancedSimulationRequestSchema>;
export type GovernedSimulationOutcome = z.infer<typeof governedSimulationOutcomeSchema>;
