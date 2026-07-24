import { createHash, randomUUID } from 'node:crypto';
import type {
  ExactParentInput,
  ExactSimulationRequest,
  ExactSimulationResponse,
  NormalizedParentEvidence,
} from '@capsicum/contracts';
import {
  EXACT_MODEL_VERSION,
  Rational,
  canonicalAlleles,
  compareIdentifiers,
  crossUncertainParents,
  genotypeKey,
  identifierTupleKey,
  planTargetRecovery,
} from '@capsicum/genetics-core';
import type { DiploidGenotype, ParentGenotypeHypothesis } from '@capsicum/genetics-core';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareIdentifiers(left, right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function stableContentHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}

function groupParent(parent: ExactParentInput): Map<string, ExactParentInput['genotypes']> {
  const byLocus = new Map<string, ExactParentInput['genotypes']>();
  for (const entry of parent.genotypes) {
    const current = byLocus.get(entry.genotype.locusId) ?? [];
    current.push(entry);
    byLocus.set(entry.genotype.locusId, current);
  }
  return byLocus;
}

function normalizeParent(parent: ExactParentInput): NormalizedParentEvidence {
  return {
    materialId: parent.materialId,
    loci: [...groupParent(parent).entries()]
      .sort(([left], [right]) => compareIdentifiers(left, right))
      .map(([locusId, possibilities]) => ({
        locusId,
        possibilities: possibilities
          .map((possibility) => ({
            alleles: canonicalAlleles(possibility.genotype.alleles),
            evidenceState: possibility.genotype.evidenceState,
            probability: Rational.from(possibility.probability).toJSON(),
          }))
          .sort((left, right) => {
            const alleleOrder = compareIdentifiers(
              identifierTupleKey(left.alleles),
              identifierTupleKey(right.alleles),
            );
            return alleleOrder !== 0
              ? alleleOrder
              : compareIdentifiers(left.evidenceState, right.evidenceState);
          }),
      })),
  };
}

function toHypotheses(entries: ExactParentInput['genotypes']): ParentGenotypeHypothesis[] {
  const byLocus = groupParent({ materialId: 'normalization-only', genotypes: entries });
  let hypotheses: ParentGenotypeHypothesis[] = [
    {
      loci: [],
      probability: Rational.ONE,
      basis: 'user_prior',
      evidenceIds: [],
    },
  ];

  for (const [locusId, possibilities] of [...byLocus.entries()].sort(([left], [right]) =>
    compareIdentifiers(left, right),
  )) {
    const mass = possibilities.reduce(
      (sum, item) => sum.add(Rational.from(item.probability)),
      Rational.ZERO,
    );
    if (!mass.equals(Rational.ONE)) {
      throw new RangeError(`Parent locus ${locusId} possibility distribution must sum exactly to 1.`);
    }

    const uniqueStates = new Set<string>();
    for (const possibility of possibilities) {
      const key = genotypeKey(possibility.genotype as DiploidGenotype);
      if (uniqueStates.has(key)) {
        throw new TypeError(`Parent locus ${locusId} contains duplicate genotype possibility ${key}.`);
      }
      uniqueStates.add(key);
    }

    if (
      possibilities.length === 1 &&
      ['unknown', 'conflicting'].includes(possibilities[0]?.genotype.evidenceState ?? '')
    ) {
      throw new RangeError(
        `Parent locus ${locusId} is ${possibilities[0]?.genotype.evidenceState}; provide explicit weighted genotype scenarios.`,
      );
    }

    if (hypotheses.length > Math.floor(10_000 / possibilities.length)) {
      throw new RangeError('Parent genotype uncertainty expands beyond 10,000 combined hypotheses.');
    }

    hypotheses = hypotheses.flatMap((hypothesis) =>
      possibilities.map((possibility) => ({
        loci: [...hypothesis.loci, possibility.genotype as DiploidGenotype],
        probability: hypothesis.probability.multiply(Rational.from(possibility.probability)),
        basis: 'user_prior' as const,
        evidenceIds: [],
      })),
    );
  }

  return hypotheses;
}

function premiseAuthority(inputs: readonly NormalizedParentEvidence[]): ExactSimulationResponse['premiseAuthority'] {
  const states = new Set(inputs.flatMap((parent) => parent.loci.flatMap((locus) => locus.possibilities.map((item) => item.evidenceState))));
  if (states.has('conflicting')) return 'conflicting';
  if (states.has('unknown')) return 'unknown';
  if (states.size === 1 && states.has('verified')) return 'verified';
  if (states.has('assumed')) return states.size === 1 ? 'assumed' : 'mixed';
  if (states.has('inferred')) return states.size === 1 ? 'inferred' : 'mixed';
  return states.size > 1 ? 'mixed' : 'unknown';
}

function evidenceWarnings(input: NormalizedParentEvidence): string[] {
  const warnings = new Set<string>();
  for (const locus of input.loci) {
    for (const possibility of locus.possibilities) {
      if (possibility.evidenceState !== 'verified') {
        warnings.add(
          `${input.materialId} locus ${locus.locusId} includes ${possibility.evidenceState} genotype evidence.`,
        );
      }
    }
  }
  return [...warnings];
}

export function runExactSimulation(request: ExactSimulationRequest): ExactSimulationResponse {
  const normalizedMaternal = normalizeParent(request.maternal);
  const normalizedPaternal = normalizeParent(request.paternal);
  const maternalLoci = normalizedMaternal.loci.map((item) => item.locusId);
  const paternalLoci = normalizedPaternal.loci.map((item) => item.locusId);
  if (identifierTupleKey(maternalLoci) !== identifierTupleKey(paternalLoci)) {
    throw new TypeError('Maternal and paternal parents must define the same locus set.');
  }
  if (request.target && !maternalLoci.includes(request.target.locusId)) {
    throw new TypeError(`Target locus ${request.target.locusId} is not present in both parents.`);
  }

  const distributions = crossUncertainParents(
    toHypotheses(request.maternal.genotypes),
    toHypotheses(request.paternal.genotypes),
    10_000,
    10_000,
  );

  let targetRecovery: ExactSimulationResponse['targetRecovery'];
  if (request.target) {
    const targetAlleles = canonicalAlleles(request.target.alleles);
    const exactTargetProbability = distributions
      .filter((item) => {
        const locus = item.value.loci.find(
          (candidate) => candidate.locusId === request.target?.locusId,
        );
        if (!locus) return false;
        const alleles = canonicalAlleles(locus.alleles);
        return alleles[0] === targetAlleles[0] && alleles[1] === targetAlleles[1];
      })
      .reduce((sum, item) => sum.add(item.probability), Rational.ZERO);
    const targetProbability = exactTargetProbability.toNumber();
    if (!exactTargetProbability.isZero() && targetProbability === 0) {
      throw new RangeError(
        'Target probability is positive but below supported operational-planning precision; inspect the exact genotype fraction instead.',
      );
    }

    targetRecovery = planTargetRecovery(
      targetProbability,
      request.confidence ?? 0.95,
      request.operationalFactors,
    );
  }

  const calculatedPremiseAuthority = premiseAuthority([normalizedMaternal, normalizedPaternal]);
  const core = {
    schemaVersion: '1.0' as const,
    authority: calculatedPremiseAuthority === 'verified' ? 'exact_supported' as const : 'unsupported' as const,
    modelVersion: EXACT_MODEL_VERSION,
    catalogReleaseId: request.catalogReleaseId,
    calculationMode: 'exact' as const,
    calculationAuthority: 'exact' as const,
    premiseAuthority: calculatedPremiseAuthority,
    interpretationAuthority: 'genotype_only' as const,
    engineVersion: EXACT_MODEL_VERSION,
    inputHash: '',
    genotypeCallVersions: [],
    evidenceIds: [],
    parentDirection: {
      maternalMaterialId: request.maternal.materialId,
      paternalMaterialId: request.paternal.materialId,
    },
    inputEvidence: {
      maternal: normalizedMaternal,
      paternal: normalizedPaternal,
    },
    distributions: distributions.map((item) => ({
      genotype: [...item.value.loci]
        .sort((left, right) => compareIdentifiers(left.locusId, right.locusId))
        .map((locus) => ({
          locusId: locus.locusId,
          alleles: canonicalAlleles(locus.alleles),
        })),
      probability: {
        ...item.probability.toJSON(),
        decimal: item.probability.toNumber(),
      },
    })),
    ...(targetRecovery ? { targetRecovery } : {}),
    assumptions: [
      'Independent assortment is assumed between configured loci.',
      'Allele identifiers are opaque; capitalization does not encode dominance.',
      'Each weighted parent genotype distribution is treated as an explicit user-supplied hypothesis.',
    ],
    warnings: [
      ...evidenceWarnings(normalizedMaternal),
      ...evidenceWarnings(normalizedPaternal),
      'No phenotype interpretation was executed because the seed catalog has no approved executable rules.',
    ],
    abstentions: [
      'Phenotype, heat level, exact SHU, disease resistance, and quantitative trait predictions are not inferred from this calculation.',
    ],
  };

  const normalizedRequest = {
    schemaVersion: request.schemaVersion,
    workspaceId: request.workspaceId,
    catalogReleaseId: request.catalogReleaseId,
    maternal: normalizedMaternal,
    paternal: normalizedPaternal,
    target: request.target
      ? { locusId: request.target.locusId, alleles: canonicalAlleles(request.target.alleles) }
      : null,
    confidence: request.confidence ?? 0.95,
    operationalFactors: request.operationalFactors ?? {
      germination: 1,
      survival: 1,
      observationSuccess: 1,
      assaySuccess: 1,
    },
  };
  const inputHash = stableContentHash(normalizedRequest);
  const responseCore = { ...core, inputHash };
  return {
    ...responseCore,
    runId: randomUUID(),
    contentHash: stableContentHash({ normalizedRequest, result: responseCore }),
  };
}
