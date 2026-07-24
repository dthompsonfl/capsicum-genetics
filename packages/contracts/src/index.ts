import { z } from 'zod';

export const rationalValueSchema = z
  .object({
    numerator: z.string().max(100).regex(/^-?\d+$/),
    denominator: z.string().max(100).regex(/^\d+$/),
  })
  .refine(
    (value: { denominator: string }) => BigInt(value.denominator) > 0n,
    'denominator must be positive',
  );

export const probabilityValueSchema = z
  .object({
    numerator: z.string().max(100).regex(/^\d+$/),
    denominator: z.string().max(100).regex(/^\d+$/),
  })
  .superRefine((
    value: { numerator: string; denominator: string },
    context: { addIssue: (issue: { code: 'custom'; message: string }) => void },
  ) => {
    const numerator = BigInt(value.numerator);
    const denominator = BigInt(value.denominator);
    if (denominator <= 0n) {
      context.addIssue({ code: 'custom', message: 'denominator must be positive' });
    } else if (numerator <= 0n || numerator > denominator) {
      context.addIssue({
        code: 'custom',
        message: 'probability must be greater than 0 and at most 1',
      });
    }
  });

export const evidenceStateSchema = z.enum([
  'verified',
  'inferred',
  'assumed',
  'unknown',
  'conflicting',
]);

const identifierSchema = z.string().trim().min(1).max(200);

export const diploidGenotypeSchema = z.object({
  locusId: identifierSchema,
  alleles: z.tuple([identifierSchema, identifierSchema]),
  evidenceState: evidenceStateSchema,
});

export const weightedGenotypeSchema = z.object({
  genotype: diploidGenotypeSchema,
  probability: probabilityValueSchema,
});

const parentSchema = z.object({
  materialId: identifierSchema,
  genotypes: z.array(weightedGenotypeSchema).min(1).max(256),
});

export const exactSimulationRequestSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    workspaceId: identifierSchema,
    catalogReleaseId: identifierSchema,
    maternal: parentSchema,
    paternal: parentSchema,
    target: z
      .object({
        locusId: identifierSchema,
        alleles: z.tuple([identifierSchema, identifierSchema]),
      })
      .optional(),
    confidence: z.number().gt(0).lt(1).optional(),
    operationalFactors: z
      .object({
        germination: z.number().min(0).max(1),
        survival: z.number().min(0).max(1),
        observationSuccess: z.number().min(0).max(1),
        assaySuccess: z.number().min(0).max(1),
      })
      .optional(),
  })
  .strict();

export interface ExactSimulationRequest {
  schemaVersion: '1.0';
  workspaceId: string;
  catalogReleaseId: string;
  maternal: ExactParentInput;
  paternal: ExactParentInput;
  target?: { locusId: string; alleles: [string, string] };
  confidence?: number;
  operationalFactors?: {
    germination: number;
    survival: number;
    observationSuccess: number;
    assaySuccess: number;
  };
}

export interface ExactParentInput {
  materialId: string;
  genotypes: Array<{
    genotype: {
      locusId: string;
      alleles: [string, string];
      evidenceState: 'verified' | 'inferred' | 'assumed' | 'unknown' | 'conflicting';
    };
    probability: { numerator: string; denominator: string };
  }>;
}

export interface NormalizedParentEvidence {
  materialId: string;
  loci: Array<{
    locusId: string;
    possibilities: Array<{
      alleles: [string, string];
      evidenceState: 'verified' | 'inferred' | 'assumed' | 'unknown' | 'conflicting';
      probability: { numerator: string; denominator: string };
    }>;
  }>;
}

export interface ExactSimulationResponse {
  schemaVersion: '1.0';
  runId: string;
  /** @deprecated Use the three explicit authority dimensions below. Non-verified premises return unsupported here. */
  authority: 'exact_supported' | 'unsupported';
  modelVersion: string;
  catalogReleaseId: string;
  calculationMode: 'exact';
  calculationAuthority: 'exact';
  premiseAuthority: 'verified' | 'mixed' | 'inferred' | 'assumed' | 'conflicting' | 'unknown';
  interpretationAuthority: 'genotype_only' | 'conditional_phenotype' | 'unsupported';
  engineVersion: string;
  inputHash: string;
  genotypeCallVersions: Array<{ callId: string; callVersion: number; materialId: string; locusId: string }>;
  evidenceIds: string[];
  parentDirection: { maternalMaterialId: string; paternalMaterialId: string };
  inputEvidence: {
    maternal: NormalizedParentEvidence;
    paternal: NormalizedParentEvidence;
  };
  distributions: Array<{
    genotype: Array<{ locusId: string; alleles: [string, string] }>;
    probability: { numerator: string; denominator: string; decimal: number };
  }>;
  targetRecovery?: {
    geneticProbability: number;
    practicalProbability: number;
    confidence: number;
    geneticPopulation: number | null;
    practicalPopulation: number | null;
    geneticReachable: boolean;
    operationallyReachable: boolean;
  };
  assumptions: string[];
  warnings: string[];
  abstentions: string[];
  contentHash: string;
}

export * from './platform';

export * from './advanced-simulation';
export * from './research-ingestion';
export * from './laboratory-export';
