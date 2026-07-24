import { describe, expect, it } from 'vitest';
import {
  exactSimulationRequestSchema,
  BREEDING_LEDGER_SCHEMA_VERSION,
  createBreedingLedgerManifest,
  experimentCreateSchema,
  genotypeCallSchema,
  governedAdvancedSimulationRequestSchema,
  inventoryEventSchema,
  inventoryExceptionReviewSchema,
  inventoryReservationCreateSchema,
  inventoryTransferSchema,
  normalizedCatalogDraftSchema,
  observationRecordSchema,
  phenotypeMeasurementCorrectionSchema,
  plantCreateSchema,
  researchDocumentIngestionSchema,
  selectionPlanCreateSchema,
  selectionPlanReconciliationSchema,
  selectionPlanTransitionSchema,
} from './index';

describe('exactSimulationRequestSchema', () => {
  it('rejects an empty genotype list', () => {
    const result = exactSimulationRequestSchema.safeParse({
      schemaVersion: '1.0', workspaceId: 'w', catalogReleaseId: 'c',
      maternal: { materialId: 'm', genotypes: [] },
      paternal: { materialId: 'p', genotypes: [] },
    });
    expect(result.success).toBe(false);
  });
});


describe('V4 scientific contracts', () => {
  it('preserves selection target, scenario, confidence, assumptions, and generation plan', () => {
    const parsed = selectionPlanCreateSchema.parse({
      simulationRunId: '00000000-0000-4000-8000-000000000001',
      name: 'F2 color selection',
      targetDescription: 'Recover the exact approved genotype target.',
      targetExpression: { all: [{ locusId: 'L1', genotype: ['A', 'A'] }] },
      targetModelVersion: '1.0.0',
      plannedPopulation: 128,
      scenarioType: 'multi_generation',
      confidence: 0.95,
      assumptions: ['Parent calls are the immutable versions recorded by the simulation.'],
      generationPlan: [{ generation: 'F2', crossType: 'self', targetDescription: 'Screen F2 progeny', plannedPopulation: 128 }],
      idempotencyKey: 'selection-intent-0001',
    });
    expect(parsed.scenarioType).toBe('multi_generation');
    expect(parsed.generationPlan).toHaveLength(1);
    expect(parsed.confidence).toBe(0.95);
  });

  it('requires governed selection lifecycle transitions and exact reconciliation fractions', () => {
    expect(selectionPlanTransitionSchema.safeParse({
      selectionPlanId: '00000000-0000-4000-8000-000000000001', expectedVersion: 2,
      toStatus: 'completed', idempotencyKey: 'selection-transition-0001',
    }).success).toBe(false);
    expect(selectionPlanTransitionSchema.safeParse({
      selectionPlanId: '00000000-0000-4000-8000-000000000001', expectedVersion: 2,
      toStatus: 'completed', reason: 'Grow-out scoring and harvest are complete.', idempotencyKey: 'selection-transition-0002',
    }).success).toBe(true);
    expect(selectionPlanReconciliationSchema.safeParse({
      selectionPlanId: '00000000-0000-4000-8000-000000000001', missingCount: 1,
      categories: [
        { categoryId: 'target', observedCount: 10, expectedNumerator: '1', expectedDenominator: '4' },
        { categoryId: 'other', observedCount: 30, expectedNumerator: '3', expectedDenominator: '4' },
      ],
      idempotencyKey: 'selection-reconciliation-0001',
    }).success).toBe(true);
  });


  it('preserves unknown inventory and requires explicit physical counts for reconciliation', () => {
    expect(inventoryEventSchema.safeParse({
      seedLotMaterialId: '00000000-0000-4000-8000-000000000001', eventType: 'counted', quantityDelta: 0,
      reason: 'Physical tray count', occurredAt: '2026-07-23T00:00:00.000Z', idempotencyKey: 'inventory-count-0001',
    }).success).toBe(false);
    expect(inventoryEventSchema.parse({
      seedLotMaterialId: '00000000-0000-4000-8000-000000000001', eventType: 'counted', resultingQuantity: 0,
      reason: 'Physical tray count confirmed zero', occurredAt: '2026-07-23T00:00:00.000Z', idempotencyKey: 'inventory-count-0002',
    }).resultingQuantity).toBe(0);
  });

  it('enforces signed physical inventory changes', () => {
    expect(inventoryEventSchema.safeParse({
      seedLotMaterialId: '00000000-0000-4000-8000-000000000001', eventType: 'loss', quantityDelta: 2,
      reason: 'Damaged seed', occurredAt: '2026-07-23T00:00:00.000Z', idempotencyKey: 'inventory-loss-0001',
    }).success).toBe(false);
  });

  it('requires distinct lots for atomic transfers and bounded reservations', () => {
    expect(inventoryTransferSchema.safeParse({
      sourceSeedLotMaterialId: '00000000-0000-4000-8000-000000000001',
      destinationSeedLotMaterialId: '00000000-0000-4000-8000-000000000001',
      quantity: 3, reason: 'Move to fresh envelope', occurredAt: '2026-07-23T00:00:00.000Z', idempotencyKey: 'inventory-transfer-0001',
    }).success).toBe(false);
    expect(inventoryReservationCreateSchema.safeParse({
      seedLotMaterialId: '00000000-0000-4000-8000-000000000001', quantity: 0,
      purpose: 'Grow out', idempotencyKey: 'inventory-reservation-0001',
    }).success).toBe(false);
  });

  it('requires an approved exception identifier for approved-exception planting', () => {
    expect(plantCreateSchema.safeParse({
      materialCode: 'PLANT-001', sourceSeedLotMaterialId: '00000000-0000-4000-8000-000000000001',
      germinatedAt: '2026-07-23T00:00:00.000Z', inventoryMode: 'approved_exception', seedQuantity: 1,
      inventoryExceptionReason: 'Independently reviewed record discrepancy.', idempotencyKey: 'plant-intent-0001',
    }).success).toBe(false);
    expect(inventoryExceptionReviewSchema.safeParse({
      requestId: '00000000-0000-4000-8000-000000000001', decision: 'approved', rationale: 'too short', idempotencyKey: 'inventory-review-0001',
    }).success).toBe(false);
  });

  it('requires an approved dependency shape and explicit applicability for normalized alleles', () => {
    const result = normalizedCatalogDraftSchema.safeParse({
      entityType: 'allele',
      alleleKey: 'allele-a',
      recordVersion: '1.0.0',
      locusId: '00000000-0000-4000-8000-000000000001',
      canonicalSymbol: 'a',
      applicability: 'Validated only in the explicitly reviewed Capsicum population and assay context.',
      aliases: [],
      idempotencyKey: 'catalog-intent-0001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a marker without a locus or assembly authority reference', () => {
    const result = normalizedCatalogDraftSchema.safeParse({
      entityType: 'marker', markerKey: 'marker-a', recordVersion: '1.0.0', markerType: 'SNP',
      targetDefinition: {}, applicability: 'No validated scientific context has been supplied.', idempotencyKey: 'catalog-intent-0002',
    });
    expect(result.success).toBe(false);
  });

  it('requires version-checked, reasoned phenotype measurement corrections', () => {
    expect(phenotypeMeasurementCorrectionSchema.safeParse({
      measurementId: '00000000-0000-4000-8000-000000000001',
      expectedCurrentRevisionId: '00000000-0000-4000-8000-000000000002',
      valuePayload: { value: 42, unit: 'pixels' }, reason: 'Observed calibration target was incorrectly positioned.',
      idempotencyKey: 'measurement-correction-0001',
    }).success).toBe(true);
    expect(phenotypeMeasurementCorrectionSchema.safeParse({
      measurementId: '00000000-0000-4000-8000-000000000001',
      expectedCurrentRevisionId: '00000000-0000-4000-8000-000000000002',
      valuePayload: { value: 42 }, reason: 'short', idempotencyKey: 'measurement-correction-0002',
    }).success).toBe(false);
  });

  it('rejects linked advanced simulations that reverse or mismatch the ordered locus pair', () => {
    const result = governedAdvancedSimulationRequestSchema.safeParse({
      schemaVersion: '2.0', workspaceId: '00000000-0000-4000-8000-000000000001',
      catalogReleaseId: 'user-declared-v1', clientRequestId: 'advanced-intent-0001', traceId: 'advanced-intent-0001',
      mode: 'linked_two_locus',
      maternal: { materialId: '00000000-0000-4000-8000-000000000002', firstLocusId: 'L1', secondLocusId: 'L2', homologOne: { firstLocusAllele: 'A', secondLocusAllele: 'B' }, homologTwo: { firstLocusAllele: 'a', secondLocusAllele: 'b' }, phaseEvidence: 'assumed', recombinationFraction: { numerator: '1', denominator: '4' } },
      paternal: { materialId: '00000000-0000-4000-8000-000000000003', firstLocusId: 'L2', secondLocusId: 'L1', homologOne: { firstLocusAllele: 'B', secondLocusAllele: 'A' }, homologTwo: { firstLocusAllele: 'b', secondLocusAllele: 'a' }, phaseEvidence: 'assumed', recombinationFraction: { numerator: '1', denominator: '4' } },
    });
    expect(result.success).toBe(false);
  });

  it('binds experiments and authoritative observations to approved version identities', () => {
    expect(experimentCreateSchema.safeParse({
      code: 'EXP-2026-001', title: 'F2 segregation grow-out', protocolId: '00000000-0000-4000-8000-000000000001',
      startedAt: '2026-07-23T00:00:00.000Z', idempotencyKey: 'experiment-intent-0001',
    }).success).toBe(true);
    expect(observationRecordSchema.safeParse({
      sessionId: '00000000-0000-4000-8000-000000000001', materialId: '00000000-0000-4000-8000-000000000002',
      definitionId: '00000000-0000-4000-8000-000000000003', authority: 'authoritative',
      value: { type: 'number', value: 72, unitId: '00000000-0000-4000-8000-000000000004' },
      methodRecordId: '00000000-0000-4000-8000-000000000005', qualityTermIds: [],
      observedAt: '2026-07-23T00:00:00.000Z', idempotencyKey: 'observation-intent-0001',
    }).success).toBe(true);
    expect(observationRecordSchema.safeParse({
      sessionId: '00000000-0000-4000-8000-000000000001', materialId: '00000000-0000-4000-8000-000000000002',
      definitionId: '00000000-0000-4000-8000-000000000003', authority: 'authoritative',
      value: { type: 'number', value: 72 }, methodId: 'free-form', methodVersion: '1',
      observedAt: '2026-07-23T00:00:00.000Z', idempotencyKey: 'observation-intent-0002',
    }).success).toBe(false);
  });

});

describe('laboratory boundary contracts', () => {
  it('creates a versioned scientific export manifest with explicit interoperability limits', () => {
    const manifest = createBreedingLedgerManifest({
      exportJobId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      requestedAt: '2026-07-24T04:59:00.000Z',
      snapshotAt: '2026-07-24T05:00:00.000Z',
      generatedAt: '2026-07-24T05:00:01.000Z',
      softwareReleaseIdentifier: 'a'.repeat(40),
    });

    expect(manifest.schemaVersion).toBe(BREEDING_LEDGER_SCHEMA_VERSION);
    expect(manifest.scientificProfile.parentDirection).toContain('preserved');
    expect(manifest.scientificProfile.standardsMappings.miappe).toBe('not_implemented');
    expect(manifest.snapshotAt).toBe('2026-07-24T05:00:00.000Z');
  });

  it('rejects a scientifically impossible export provenance timeline', () => {
    expect(() => createBreedingLedgerManifest({
      exportJobId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      requestedAt: '2026-07-24T05:01:00.000Z',
      snapshotAt: '2026-07-24T05:00:00.000Z',
      generatedAt: '2026-07-24T05:02:00.000Z',
      softwareReleaseIdentifier: 'a'.repeat(40),
    })).toThrow(/requestedAt/);

    expect(() => createBreedingLedgerManifest({
      exportJobId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      requestedAt: '2026-07-24T04:59:00.000Z',
      snapshotAt: '2026-07-24T05:01:00.000Z',
      generatedAt: '2026-07-24T05:00:00.000Z',
      softwareReleaseIdentifier: 'a'.repeat(40),
    })).toThrow(/snapshotAt/);
  });

  it('rejects mutable or ambiguous software release identifiers', () => {
    expect(() => createBreedingLedgerManifest({
      exportJobId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      requestedAt: '2026-07-24T04:59:00.000Z',
      snapshotAt: '2026-07-24T05:00:00.000Z',
      generatedAt: '2026-07-24T05:00:01.000Z',
      softwareReleaseIdentifier: 'latest',
    })).toThrow(/immutable/);
  });

  it('accepts every governed genotype evidence and phase state used by the laboratory form', () => {
    const base = {
      materialId: '00000000-0000-4000-8000-000000000001',
      locusCatalogId: 'Pun1',
      unresolvedHistoricalNotation: 'Pun1: unknown/unknown',
      evidenceState: 'unknown' as const,
      idempotencyKey: 'genotype-call-0001',
    };
    for (const evidenceBasis of [
      'verified_genotype',
      'marker_supported',
      'pedigree_inference',
      'phenotype_inference',
      'user_assumption',
      'imported_claim',
      'unknown',
      'conflicting',
    ] as const) {
      const assayIdentifier = evidenceBasis === 'verified_genotype' ? 'LAB-ASSAY-001' : undefined;
      const result = genotypeCallSchema.safeParse({
        ...base,
        evidenceBasis,
        phaseState: 'known_unphased',
        ...(assayIdentifier ? { assayIdentifier } : {}),
      });
      expect(result.success).toBe(true);
    }
    for (const phaseState of ['known_phased', 'known_unphased', 'unknown', 'conflicting'] as const) {
      expect(genotypeCallSchema.safeParse({
        ...base,
        evidenceBasis: 'user_assumption',
        phaseState,
      }).success).toBe(true);
    }
  });

  it('requires a versioned research-ingestion contract at the HTTP boundary', () => {
    const payload = {
      title: 'Reviewed Capsicum source',
      sourceLocator: 'doi:10.0000/example',
      documentVersion: '1',
      fileName: 'source.md',
      mediaType: 'text/markdown',
      byteLength: 128,
      sourceSha256: 'a'.repeat(64),
      objectKey: 'workspaces/ws/research/source.md',
      clientRequestId: 'research-request-0001',
      traceId: 'research-trace-0001',
    } as const;
    expect(researchDocumentIngestionSchema.safeParse(payload).success).toBe(false);
    expect(
      researchDocumentIngestionSchema.safeParse({ ...payload, schemaVersion: '1.0' }).success,
    ).toBe(true);
  });
});

describe('governed direct Monte Carlo premise validation', () => {
  const base = {
    schemaVersion: '2.0' as const,
    workspaceId: '11111111-1111-4111-8111-111111111111',
    catalogReleaseId: 'user-declared-v1' as const,
    clientRequestId: 'request-12345678',
    traceId: 'trace-12345678',
    mode: 'direct_monte_carlo' as const,
    maternalMaterialId: '22222222-2222-4222-8222-222222222222',
    paternalMaterialId: '33333333-3333-4333-8333-333333333333',
    seed: 7,
    sampleCount: 1000,
  };
  const genotype = (locusId: string) => ({ locusId, alleles: ['A', 'a'] as [string, string], evidenceState: 'assumed' as const });
  const hypothesis = (probability: [string, string], loci: string[]) => ({
    probability: { numerator: probability[0], denominator: probability[1] },
    loci: loci.map(genotype),
    basis: 'user_prior' as const,
    evidenceIds: [],
  });

  it('rejects parent probability mass that does not sum exactly to one', () => {
    expect(governedAdvancedSimulationRequestSchema.safeParse({
      ...base,
      maternalHypotheses: [hypothesis(['1', '3'], ['L1']), hypothesis(['1', '3'], ['L1'])],
      paternalHypotheses: [hypothesis(['1', '1'], ['L1'])],
    }).success).toBe(false);
  });

  it('rejects duplicate or inconsistent hypothesis locus sets before enqueue', () => {
    expect(governedAdvancedSimulationRequestSchema.safeParse({
      ...base,
      maternalHypotheses: [hypothesis(['1', '1'], ['L1', 'L1'])],
      paternalHypotheses: [hypothesis(['1', '1'], ['L1'])],
    }).success).toBe(false);
    expect(governedAdvancedSimulationRequestSchema.safeParse({
      ...base,
      maternalHypotheses: [hypothesis(['1', '2'], ['L1']), hypothesis(['1', '2'], ['L2'])],
      paternalHypotheses: [hypothesis(['1', '1'], ['L1'])],
    }).success).toBe(false);
  });
});
