import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const nonEmptyTextSchema = z.string().trim().min(1).max(4_000);
export const shortCodeSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
export const slugSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const clientRequestIdSchema = uuidSchema;
export const idempotencyKeySchema = z.string().trim().min(8).max(200);

export const workspaceRoleSchema = z.enum([
  'owner',
  'breeder',
  'technician',
  'scientific_reviewer',
  'catalog_curator',
  'administrator',
  'viewer',
]);
export const membershipStateSchema = z.enum(['active', 'suspended', 'revoked']);

export const principalSchema = z.object({
  userId: uuidSchema,
  workspaceId: uuidSchema,
  role: workspaceRoleSchema,
  sessionId: uuidSchema,
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(200),
  mfaVerifiedAt: isoTimestampSchema.nullable(),
});

export const bootstrapOwnerSchema = z.object({
  installationToken: z.string().min(32).max(512),
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(2).max(200),
  password: z.string().min(12).max(256),
  workspaceName: z.string().trim().min(2).max(200),
  workspaceSlug: slugSchema,
});
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(256),
  totpCode: z.string().trim().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().trim().min(8).max(100).optional(),
});
export const workspaceInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: workspaceRoleSchema.exclude(['owner']),
  expiresInHours: z.coerce.number().int().min(1).max(720).default(168),
  idempotencyKey: idempotencyKeySchema,
});
export const workspaceSwitchSchema = z.object({
  workspaceId: uuidSchema,
  idempotencyKey: idempotencyKeySchema,
});
export const sessionRevokeSchema = z.object({
  sessionId: uuidSchema,
  idempotencyKey: idempotencyKeySchema,
});
export const invitationMutationSchema = z.object({
  invitationId: uuidSchema,
  action: z.enum(['revoke', 'resend']),
  expiresInHours: z.coerce.number().int().min(1).max(720).default(168),
  idempotencyKey: idempotencyKeySchema,
});
export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  idempotencyKey: idempotencyKeySchema,
});
export const passwordResetCompleteSchema = z.object({
  token: z.string().trim().min(32).max(512),
  password: z.string().min(12).max(256),
  idempotencyKey: idempotencyKeySchema,
});
export const workspaceMembershipUpdateSchema = z.object({
  userId: uuidSchema,
  role: workspaceRoleSchema.exclude(['owner']),
  state: membershipStateSchema,
  expectedUpdatedAt: isoTimestampSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(200).optional(),
  cursor: z.string().trim().max(500).optional(),
});

export const germplasmCreateSchema = z.object({
  materialCode: shortCodeSchema,
  taxon: z.string().trim().min(2).max(250),
  displayName: z.string().trim().min(1).max(250),
  sourceType: z.enum(['breeder', 'genebank', 'vendor', 'wild_collection', 'exchange', 'unknown']),
  sourceName: z.string().trim().max(500).optional(),
  sourceIdentifier: z.string().trim().max(500).optional(),
  acquiredAt: isoTimestampSchema,
  notes: z.string().trim().max(4_000).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const seedLotCreateSchema = z.object({
  materialCode: shortCodeSchema,
  accessionMaterialId: uuidSchema.optional(),
  derivedMaterialId: uuidSchema.optional(),
  sourceLotMaterialId: uuidSchema.optional(),
  sourceSeedHarvestMaterialId: uuidSchema.optional(),
  quantityEstimate: z.coerce.number().int().min(0).max(2_000_000_000).optional(),
  storageLocation: z.string().trim().max(500).optional(),
  acquiredAt: isoTimestampSchema,
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  if (Boolean(value.accessionMaterialId) === Boolean(value.derivedMaterialId)) {
    context.addIssue({
      code: 'custom',
      path: ['accessionMaterialId'],
      message: 'A seed lot must reference exactly one accession or derived breeding-material identity.',
    });
  }
});

export const inventoryEventTypeSchema = z.enum([
  'received',
  'adjustment',
  'reservation',
  'reservation_release',
  'planting',
  'germination',
  'loss',
  'return',
  'reconciliation',
  'sown',
  'transferred',
  'consumed',
  'discarded',
  'counted',
]);
export const inventoryEventSchema = z.object({
  seedLotMaterialId: uuidSchema,
  eventType: inventoryEventTypeSchema,
  quantityDelta: z.coerce.number().int().min(-2_000_000_000).max(2_000_000_000).default(0),
  resultingQuantity: z.coerce.number().int().min(0).max(2_000_000_000).optional(),
  reason: z.string().trim().min(1).max(1_000),
  occurredAt: isoTimestampSchema,
  reservationId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  const positive = ['received', 'return'];
  const negative = ['planting', 'loss', 'sown', 'consumed', 'discarded'];
  const zero = ['reservation', 'reservation_release'];
  if (positive.includes(value.eventType) && value.quantityDelta <= 0) {
    context.addIssue({ code: 'custom', path: ['quantityDelta'], message: `${value.eventType} must increase physical inventory.` });
  }
  if (negative.includes(value.eventType) && value.quantityDelta >= 0) {
    context.addIssue({ code: 'custom', path: ['quantityDelta'], message: `${value.eventType} must decrease physical inventory.` });
  }
  if (zero.includes(value.eventType) && value.quantityDelta !== 0) {
    context.addIssue({ code: 'custom', path: ['quantityDelta'], message: `${value.eventType} records allocation authority and must not alter physical inventory.` });
  }
  if (['counted', 'reconciliation'].includes(value.eventType) && value.resultingQuantity === undefined) {
    context.addIssue({ code: 'custom', path: ['resultingQuantity'], message: `${value.eventType} requires the resulting physical quantity.` });
  }
});

export const inventoryTransferSchema = z.object({
  sourceSeedLotMaterialId: uuidSchema,
  destinationSeedLotMaterialId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(2_000_000_000),
  reason: z.string().trim().min(3).max(1_000),
  occurredAt: isoTimestampSchema,
  idempotencyKey: idempotencyKeySchema,
}).refine((value) => value.sourceSeedLotMaterialId !== value.destinationSeedLotMaterialId, {
  message: 'Source and destination seed lots must differ.',
  path: ['destinationSeedLotMaterialId'],
});

export const inventoryReservationCreateSchema = z.object({
  seedLotMaterialId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(2_000_000_000),
  purpose: z.string().trim().min(3).max(1_000),
  expiresAt: isoTimestampSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});
export const inventoryReservationReleaseSchema = z.object({
  reservationId: uuidSchema,
  reason: z.string().trim().min(3).max(1_000),
  idempotencyKey: idempotencyKeySchema,
});
export const inventoryExceptionRequestSchema = z.object({
  seedLotMaterialId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(100_000),
  reason: z.string().trim().min(20).max(2_000),
  idempotencyKey: idempotencyKeySchema,
});
export const inventoryExceptionReviewSchema = z.object({
  requestId: uuidSchema,
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  rationale: z.string().trim().min(10).max(2_000),
  idempotencyKey: idempotencyKeySchema,
});

export const plantCreateSchema = z.object({
  materialCode: shortCodeSchema,
  sourceSeedLotMaterialId: uuidSchema,
  germinatedAt: isoTimestampSchema,
  inventoryMode: z.enum(['consume', 'approved_exception', 'uncertain_quantity']).default('consume'),
  seedQuantity: z.coerce.number().int().min(1).max(100_000).default(1),
  inventoryExceptionReason: z.string().trim().min(10).max(2_000).optional(),
  inventoryExceptionRequestId: uuidSchema.optional(),
  reservationId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  locationName: z.string().trim().max(300).optional(),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  if (value.inventoryMode !== 'consume' && !value.inventoryExceptionReason) {
    context.addIssue({
      code: 'custom',
      path: ['inventoryExceptionReason'],
      message: 'A documented exception reason is required when seed inventory is not consumed exactly.',
    });
  }
  if (value.inventoryMode === 'approved_exception' && !value.inventoryExceptionRequestId) {
    context.addIssue({
      code: 'custom',
      path: ['inventoryExceptionRequestId'],
      message: 'An independently approved inventory exception is required.',
    });
  }
  if (value.inventoryMode !== 'approved_exception' && value.inventoryExceptionRequestId) {
    context.addIssue({ code: 'custom', path: ['inventoryExceptionRequestId'], message: 'An inventory exception request may only be used with approved_exception mode.' });
  }
});

export const genotypeEvidenceStateSchema = z.enum(['verified', 'inferred', 'assumed', 'unknown', 'conflicting']);
export const genotypeEvidenceBasisSchema = z.enum([
  'verified_genotype',
  'marker_supported',
  'pedigree_inference',
  'phenotype_inference',
  'user_assumption',
  'imported_claim',
  'unknown',
  'conflicting',
]);
export const genotypePhaseStateSchema = z.enum(['known_phased', 'known_unphased', 'unknown', 'conflicting']);
export const genotypeCallSchema = z.object({
  materialId: uuidSchema,
  catalogReleaseId: uuidSchema.optional(),
  locusCatalogId: z.string().trim().min(1).max(200),
  alleleOneId: uuidSchema.optional(),
  alleleTwoId: uuidSchema.optional(),
  alleleOne: z.string().trim().min(1).max(200).optional(),
  alleleTwo: z.string().trim().min(1).max(200).optional(),
  unresolvedHistoricalNotation: z.string().trim().min(1).max(1_000).optional(),
  evidenceState: genotypeEvidenceStateSchema,
  evidenceBasis: genotypeEvidenceBasisSchema,
  assayId: uuidSchema.optional(),
  markerId: uuidSchema.optional(),
  assayMethod: z.string().trim().max(500).optional(),
  assayIdentifier: z.string().trim().max(500).optional(),
  sourceDocumentId: uuidSchema.optional(),
  ploidy: z.coerce.number().int().min(1).max(16).default(2),
  phaseState: genotypePhaseStateSchema.default('known_unphased'),
  haplotypePayload: z.record(z.string(), z.unknown()).optional(),
  expectedCurrentCallId: uuidSchema.optional(),
  notes: z.string().trim().max(4_000).optional(),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  const normalized = Boolean(value.catalogReleaseId && value.alleleOneId && value.alleleTwoId);
  const unresolved = Boolean(value.unresolvedHistoricalNotation);
  if (normalized === unresolved) {
    context.addIssue({
      code: 'custom',
      message: 'Provide either a release-aware normalized allele pair or unresolved historical notation, never both.',
    });
  }
  if ((value.alleleOneId && !value.alleleTwoId) || (!value.alleleOneId && value.alleleTwoId)) {
    context.addIssue({ code: 'custom', message: 'Both normalized allele identifiers are required.' });
  }
  if (value.evidenceBasis === 'verified_genotype' && !value.assayId && !value.assayIdentifier) {
    context.addIssue({
      code: 'custom',
      path: ['assayId'],
      message: 'Verified genotype calls require assay provenance.',
    });
  }
});

export const pollinationMethodSchema = z.enum(['controlled_cross', 'selfing', 'open_pollination']);
export const crossOperationalStateSchema = z.enum([
  'planned',
  'prepared',
  'pollinated',
  'fruit_set',
  'harvest_ready',
  'harvested',
  'failed',
  'closed',
]);
export const crossVerificationStateSchema = z.enum([
  'unknown',
  'process_documented',
  'isolation_evidence_recorded',
  'morphology_consistent_unconfirmed',
  'marker_confirmed',
  'genotype_confirmed',
  'conflicting',
  'failed',
]);
export const crossVerificationMethodSchema = z.enum([
  'unknown',
  'process_documentation',
  'isolation_record',
  'morphology',
  'marker_assay',
  'genotype_assay',
  'conflict_review',
  'failure_review',
]);
export const crossCreateSchema = z.object({
  crossCode: shortCodeSchema,
  maternalPlantId: uuidSchema,
  paternalPlantId: uuidSchema.optional(),
  pollinationMethod: pollinationMethodSchema,
  plannedAt: isoTimestampSchema,
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  if (value.pollinationMethod === 'controlled_cross') {
    if (!value.paternalPlantId) {
      context.addIssue({ code: 'custom', path: ['paternalPlantId'], message: 'A controlled cross requires a paternal plant.' });
    } else if (value.paternalPlantId === value.maternalPlantId) {
      context.addIssue({ code: 'custom', path: ['paternalPlantId'], message: 'A controlled outcross requires distinct plants.' });
    }
  }
  if (value.pollinationMethod === 'selfing' && value.paternalPlantId !== value.maternalPlantId) {
    context.addIssue({ code: 'custom', path: ['paternalPlantId'], message: 'Selfing must preserve the same plant in both parent roles.' });
  }
  if (value.pollinationMethod === 'open_pollination' && value.paternalPlantId) {
    context.addIssue({ code: 'custom', path: ['paternalPlantId'], message: 'Open pollination must leave the paternal plant unknown.' });
  }
});
export const crossEventSchema = z.object({
  crossId: uuidSchema,
  eventType: z.enum(['prepared', 'pollinated', 'bagged', 'unbagged', 'fruit_set', 'harvest_ready', 'failed', 'closed']),
  occurredAt: isoTimestampSchema,
  notes: z.string().trim().max(4_000).optional(),
  idempotencyKey: idempotencyKeySchema,
});
export const crossVerificationRecordSchema = z.object({
  crossId: uuidSchema,
  verificationState: crossVerificationStateSchema,
  method: crossVerificationMethodSchema,
  sourceType: z.enum(['operator_record', 'media', 'research_document', 'marker_result', 'laboratory_result', 'review']),
  evidenceReferences: z.array(z.object({
    entityType: z.string().trim().min(1).max(100),
    entityId: uuidSchema,
    contentHash: sha256Schema.optional(),
  })).max(100).default([]),
  confidence: z.coerce.number().min(0).max(1).optional(),
  notes: z.string().trim().max(4_000).optional(),
  recordedAt: isoTimestampSchema,
  idempotencyKey: idempotencyKeySchema,
});
export const crossVerificationReviewSchema = z.object({
  verificationId: uuidSchema,
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  rationale: z.string().trim().min(10).max(4_000),
  idempotencyKey: idempotencyKeySchema,
});
export const harvestCreateSchema = z.object({
  crossId: uuidSchema,
  fruitCode: shortCodeSchema,
  harvestCode: shortCodeSchema,
  derivedMaterialCode: shortCodeSchema,
  derivedMaterialName: z.string().trim().min(1).max(250),
  derivedMaterialClass: z.enum(['controlled_cross_progeny', 'selfed_progeny', 'open_pollinated_progeny', 'derived_line', 'population', 'selection']),
  seedLotCode: shortCodeSchema,
  familyCode: shortCodeSchema,
  harvestedAt: isoTimestampSchema,
  seedQuantityEstimate: z.coerce.number().int().min(0).max(2_000_000_000).optional(),
  generationLabel: z.string().trim().min(1).max(80).default('F1'),
  idempotencyKey: idempotencyKeySchema,
});

export const selectionGenerationStepSchema = z.object({
  generation: z.string().trim().min(1).max(80),
  crossType: z.enum(['self', 'intercross', 'backcross_maternal', 'backcross_paternal', 'reciprocal', 'selection']),
  targetDescription: z.string().trim().min(1).max(2_000),
  plannedPopulation: z.coerce.number().int().min(1).max(10_000_000).optional(),
});

export const selectionPlanStatusSchema = z.enum(['draft', 'approved', 'active', 'completed', 'cancelled']);
export const selectionPlanTransitionSchema = z.object({
  selectionPlanId: uuidSchema,
  expectedVersion: z.coerce.number().int().positive(),
  toStatus: z.enum(['approved', 'active', 'completed', 'cancelled']),
  reason: z.string().trim().min(3).max(4_000).optional(),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  if (['completed', 'cancelled'].includes(value.toStatus) && !value.reason) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A completion or cancellation reason is required.' });
  }
});

export const selectionPlanSegregationCategorySchema = z.object({
  categoryId: z.string().trim().min(1).max(200),
  observedCount: z.coerce.number().int().min(0).max(10_000_000),
  expectedNumerator: z.string().max(100).regex(/^\d+$/),
  expectedDenominator: z.string().max(100).regex(/^[1-9]\d*$/),
});
export const selectionPlanReconciliationSchema = z.object({
  selectionPlanId: uuidSchema,
  categories: z.array(selectionPlanSegregationCategorySchema).min(2).max(100),
  missingCount: z.coerce.number().int().min(0).max(10_000_000).default(0),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  const ids = value.categories.map((category) => category.categoryId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['categories'], message: 'Segregation category identifiers must be unique.' });
  }
});

export const selectionPlanCreateSchema = z.object({
  simulationRunId: uuidSchema,
  name: z.string().trim().min(2).max(250),
  targetDescription: z.string().trim().min(2).max(4_000),
  targetExpression: z.record(z.string(), z.unknown()).default({}),
  targetModelVersion: z.string().trim().min(1).max(100).default('1.0.0'),
  plannedPopulation: z.coerce.number().int().min(1).max(10_000_000),
  scenarioType: z.enum(['f1', 'f2_self', 'backcross_maternal', 'backcross_paternal', 'reciprocal', 'multi_generation']).default('f1'),
  confidence: z.coerce.number().gt(0).lt(1).default(0.95),
  assumptions: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
  generationPlan: z.array(selectionGenerationStepSchema).max(20).default([]),
  notes: z.string().trim().max(4_000).optional(),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  if (value.scenarioType === 'multi_generation' && value.generationPlan.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['generationPlan'],
      message: 'A multi-generation plan requires at least one explicit generation step.',
    });
  }
});
export const experimentCreateSchema = z.object({
  code: shortCodeSchema,
  name: z.string().trim().min(2).max(250),
  objective: z.string().trim().min(2).max(4_000),
  environment: z.record(z.string(), z.string().max(1_000)).default({}),
  protocolId: uuidSchema,
  startedAt: isoTimestampSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const observationAuthoritySchema = z.enum(['research_draft', 'authoritative']);
export const observationValueSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('number'),
    value: z.number().finite(),
    unitId: uuidSchema.optional(),
    unit: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({
    type: z.literal('category'),
    value: z.string().trim().min(1).max(250),
    termId: uuidSchema.optional(),
    vocabularyVersionId: uuidSchema.optional(),
    vocabularyId: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({ type: z.literal('boolean'), value: z.boolean() }),
  z.object({ type: z.literal('text'), value: z.string().trim().min(1).max(4_000) }),
  z.object({ type: z.literal('missing'), reason: z.string().trim().min(2).max(500) }),
]);
export const observationRecordSchema = z.object({
  sessionId: uuidSchema,
  materialId: uuidSchema,
  definitionId: uuidSchema,
  authority: observationAuthoritySchema.default('research_draft'),
  methodRecordId: uuidSchema.optional(),
  methodId: z.string().trim().min(1).max(200).optional(),
  methodVersion: z.string().trim().min(1).max(80).optional(),
  value: observationValueSchema,
  observedAt: isoTimestampSchema,
  qualityTermIds: z.array(uuidSchema).max(50).default([]),
  deviceSchemaId: uuidSchema.optional(),
  deviceProvenance: z.record(z.string(), z.unknown()).optional(),
  correctionOfRevisionId: uuidSchema.optional(),
  expectedCurrentRevisionId: uuidSchema.optional(),
  correctionReason: z.string().trim().min(2).max(2_000).optional(),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  const correction = Boolean(value.correctionOfRevisionId || value.expectedCurrentRevisionId || value.correctionReason);
  if (correction && !(value.correctionOfRevisionId && value.expectedCurrentRevisionId && value.correctionReason)) {
    context.addIssue({ code: 'custom', message: 'Corrections require the supplied predecessor, expected current revision, and a correction reason.' });
  }
  if (value.correctionOfRevisionId && value.correctionOfRevisionId !== value.expectedCurrentRevisionId) {
    context.addIssue({ code: 'custom', message: 'The correction predecessor must equal the expected current revision.' });
  }
  if (value.value.type === 'number' && value.authority === 'authoritative' && !value.value.unitId) {
    context.addIssue({ code: 'custom', path: ['value', 'unitId'], message: 'Authoritative numeric observations require an approved unit version.' });
  }
  if (value.value.type === 'category' && value.authority === 'authoritative' && (!value.value.termId || !value.value.vocabularyVersionId)) {
    context.addIssue({ code: 'custom', path: ['value', 'termId'], message: 'Authoritative category observations require an approved controlled term and vocabulary version.' });
  }
  if (value.authority === 'authoritative' && !value.methodRecordId) {
    context.addIssue({ code: 'custom', path: ['methodRecordId'], message: 'Authoritative observations require an approved exact method version.' });
  }
  if (value.authority === 'research_draft' && (!value.methodRecordId && (!value.methodId || !value.methodVersion))) {
    context.addIssue({ code: 'custom', path: ['methodId'], message: 'Draft observations require either an approved method record or an explicit draft method identifier and version.' });
  }
  if (value.deviceProvenance && value.authority === 'authoritative' && !value.deviceSchemaId) {
    context.addIssue({ code: 'custom', path: ['deviceSchemaId'], message: 'Authoritative device provenance requires an approved schema version.' });
  }
});
export const observationSessionTransitionSchema = z.object({
  sessionId: uuidSchema,
  transition: z.enum(['open', 'pause', 'resume', 'close', 'reopen', 'cancel']),
  expectedStateVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().min(2).max(2_000).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const scientificReviewDecisionSchema = z.object({
  entityType: z.enum([
    'scientific_source', 'reference_assembly', 'research_passage', 'locus', 'allele', 'variant', 'marker', 'assay',
    'evidence_assertion', 'phenotype_rule', 'capture_protocol', 'observation_method',
    'observation_quality_term', 'observation_device_schema', 'observation_definition',
  ]),
  entityId: uuidSchema,
  authorUserId: uuidSchema,
  decision: z.enum(['changes_requested', 'approved', 'rejected']),
  rationale: z.string().trim().min(10).max(4_000),
  idempotencyKey: idempotencyKeySchema,
});

export const phenotypeCaptureCreateSchema = z.object({
  materialId: uuidSchema,
  mediaObjectId: uuidSchema,
  protocolId: uuidSchema,
  viewName: z.string().trim().min(1).max(120),
  capturedAt: isoTimestampSchema,
  operatorScaleConfirmed: z.boolean().default(false),
  operatorColorReferenceConfirmed: z.boolean().default(false),
  idempotencyKey: idempotencyKeySchema,
});
export const phenotypeMeasurementCorrectionSchema = z.object({
  measurementId: uuidSchema,
  expectedCurrentRevisionId: uuidSchema,
  valuePayload: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(10).max(4_000),
  idempotencyKey: idempotencyKeySchema,
});

export const phenotypeAnnotationCreateSchema = z.object({
  captureId: uuidSchema,
  annotationType: z.enum(['point', 'line', 'polygon', 'bounding_box', 'measurement']),
  geometry: z.record(z.string(), z.unknown()),
  label: z.string().trim().min(1).max(250),
  supersedesAnnotationId: uuidSchema.optional(),
  expectedCurrentAnnotationId: uuidSchema.optional(),
  correctionReason: z.string().trim().min(2).max(2_000).optional(),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  if (value.supersedesAnnotationId && value.supersedesAnnotationId !== value.expectedCurrentAnnotationId) {
    context.addIssue({ code: 'custom', message: 'Annotation corrections must supersede the current annotation revision.' });
  }
  if (value.supersedesAnnotationId && !value.correctionReason) {
    context.addIssue({ code: 'custom', path: ['correctionReason'], message: 'Annotation corrections require a reason.' });
  }
});
export const mediaUploadMetadataSchema = z.object({
  entityType: z.enum(['plant', 'fruit', 'seed_lot', 'progeny_family', 'research_document']),
  entityId: uuidSchema,
  fileName: z.string().trim().min(1).max(255),
  declaredMimeType: z.string().trim().min(1).max(120),
  byteLength: z.coerce.number().int().min(1).max(50 * 1024 * 1024),
  sourceSha256: sha256Schema.optional(),
  clientRequestId: clientRequestIdSchema,
});

export const jobTypeSchema = z.enum([
  'genetics.direct-inheritance-monte-carlo.v1',
  'media.inspect.v1',
  'media.derivatives.v1',
  'media.measurements.v1',
  'research.ingest.v1',
  'research.extract-passages.v1',
  'export.breeding-ledger.v1',
  'storage.cleanup.v1',
  'worker.health.v1',
]);
export const enqueueJobSchema = z.object({
  jobType: jobTypeSchema,
  contractVersion: z.literal('1.0.0'),
  payload: z.record(z.string(), z.unknown()),
  clientRequestId: clientRequestIdSchema,
  traceId: z.string().trim().min(1).max(200),
});

export const storageCleanupRequestSchema = z.object({
  dryRun: z.boolean(),
  retentionHours: z.coerce.number().int().min(1).max(8_760).default(24),
  deletionLimit: z.coerce.number().int().min(1).max(500).default(100),
  scanLimit: z.coerce.number().int().min(1).max(1_000).default(500),
  clientRequestId: clientRequestIdSchema,
});

export const publicErrorCodeSchema = z.enum([
  'validation_failed',
  'permission_denied',
  'not_found',
  'conflict',
  'stale_version',
  'duplicate_in_progress',
  'duplicate_completed',
  'idempotency_conflict',
  'rate_limited',
  'unavailable',
  'scientific_authority_required',
  'scientific_authority_unavailable',
  'internal_error',
]);
export const standardErrorSchema = z.object({
  error: z.object({
    code: publicErrorCodeSchema,
    message: z.string().trim().min(1).max(2_000),
    requestId: z.string().trim().max(200).optional(),
    retryable: z.boolean().default(false),
    retryAfterSeconds: z.number().int().positive().optional(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type Principal = z.infer<typeof principalSchema>;
export type BootstrapOwnerInput = z.infer<typeof bootstrapOwnerSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type WorkspaceInvitationInput = z.infer<typeof workspaceInvitationSchema>;
export type WorkspaceSwitchInput = z.infer<typeof workspaceSwitchSchema>;
export type SessionRevokeInput = z.infer<typeof sessionRevokeSchema>;
export type InvitationMutationInput = z.infer<typeof invitationMutationSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetCompleteInput = z.infer<typeof passwordResetCompleteSchema>;
export type WorkspaceMembershipUpdateInput = z.infer<typeof workspaceMembershipUpdateSchema>;
export type GermplasmCreateInput = z.infer<typeof germplasmCreateSchema>;
export type SeedLotCreateInput = z.infer<typeof seedLotCreateSchema>;
export type InventoryEventInput = z.infer<typeof inventoryEventSchema>;
export type InventoryTransferInput = z.infer<typeof inventoryTransferSchema>;
export type InventoryReservationCreateInput = z.infer<typeof inventoryReservationCreateSchema>;
export type InventoryReservationReleaseInput = z.infer<typeof inventoryReservationReleaseSchema>;
export type InventoryExceptionRequestInput = z.infer<typeof inventoryExceptionRequestSchema>;
export type InventoryExceptionReviewInput = z.infer<typeof inventoryExceptionReviewSchema>;
export type PlantCreateInput = z.infer<typeof plantCreateSchema>;
export type GenotypeCallInput = z.infer<typeof genotypeCallSchema>;
export type CrossCreateInput = z.infer<typeof crossCreateSchema>;
export type CrossEventInput = z.infer<typeof crossEventSchema>;
export type CrossVerificationRecordInput = z.infer<typeof crossVerificationRecordSchema>;
export type CrossVerificationReviewInput = z.infer<typeof crossVerificationReviewSchema>;
export type HarvestCreateInput = z.infer<typeof harvestCreateSchema>;
export type SelectionPlanCreateInput = z.infer<typeof selectionPlanCreateSchema>;
export type SelectionPlanTransitionInput = z.infer<typeof selectionPlanTransitionSchema>;
export type SelectionPlanReconciliationInput = z.infer<typeof selectionPlanReconciliationSchema>;
export type ExperimentCreateInput = z.infer<typeof experimentCreateSchema>;
export type ObservationRecordInput = z.infer<typeof observationRecordSchema>;
export type ObservationSessionTransitionInput = z.infer<typeof observationSessionTransitionSchema>;
export type ScientificReviewDecisionInput = z.infer<typeof scientificReviewDecisionSchema>;
export type PhenotypeCaptureCreateInput = z.infer<typeof phenotypeCaptureCreateSchema>;
export type PhenotypeAnnotationCreateInput = z.infer<typeof phenotypeAnnotationCreateSchema>;
export type PhenotypeMeasurementCorrectionInput = z.infer<typeof phenotypeMeasurementCorrectionSchema>;
export type MediaUploadMetadata = z.infer<typeof mediaUploadMetadataSchema>;
export type EnqueueJobInput = z.infer<typeof enqueueJobSchema>;
export type StorageCleanupRequestInput = z.infer<typeof storageCleanupRequestSchema>;
export type StandardError = z.infer<typeof standardErrorSchema>;

const catalogRecordVersionSchema = z.string().trim().min(1).max(120);
const scientificApplicabilitySchema = z.string().trim().min(10).max(4_000);
const scientificJsonObjectSchema = z.record(z.string(), z.unknown());

export const normalizedCatalogDraftSchema = z.union([
  z.object({
    entityType: z.literal('reference_assembly'),
    assemblyKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    speciesScope: z.string().trim().min(2).max(250),
    assemblyName: z.string().trim().min(2).max(500),
    accession: z.string().trim().max(500).optional(),
    sourceLocator: z.string().trim().min(5).max(2_000),
    idempotencyKey: idempotencyKeySchema,
  }),
  z.object({
    entityType: z.literal('allele'),
    alleleKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    locusId: uuidSchema,
    canonicalSymbol: z.string().trim().min(1).max(200),
    molecularDefinition: scientificJsonObjectSchema.optional(),
    functionalClass: z.string().trim().max(250).optional(),
    unresolvedSourceNotation: z.string().trim().max(1_000).optional(),
    applicability: scientificApplicabilitySchema,
    aliases: z.array(z.object({
      alias: z.string().trim().min(1).max(200),
      notationContext: z.string().trim().min(2).max(500),
      sourceId: uuidSchema.optional(),
    })).max(100).default([]),
    idempotencyKey: idempotencyKeySchema,
  }),
  z.object({
    entityType: z.literal('sequence_variant'),
    variantKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    assemblyId: uuidSchema,
    chromosome: z.string().trim().min(1).max(120),
    positionStart: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    positionEnd: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    referenceAllele: z.string().trim().min(1).max(10_000),
    alternateAllele: z.string().trim().min(1).max(10_000),
    locusId: uuidSchema.optional(),
    alleleId: uuidSchema.optional(),
    applicability: scientificApplicabilitySchema,
    idempotencyKey: idempotencyKeySchema,
  }).superRefine((value, context) => {
    if (value.positionEnd < value.positionStart) context.addIssue({ code: 'custom', path: ['positionEnd'], message: 'Variant end must not precede its start.' });
    if (value.referenceAllele === value.alternateAllele) context.addIssue({ code: 'custom', path: ['alternateAllele'], message: 'Reference and alternate alleles must differ.' });
  }),
  z.object({
    entityType: z.literal('structural_variant'),
    variantKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    assemblyId: uuidSchema,
    chromosome: z.string().trim().min(1).max(120),
    positionStart: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    positionEnd: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    variantType: z.enum(['deletion', 'insertion', 'duplication', 'inversion', 'translocation', 'copy_number', 'other']),
    locusId: uuidSchema.optional(),
    alleleId: uuidSchema.optional(),
    applicability: scientificApplicabilitySchema,
    idempotencyKey: idempotencyKeySchema,
  }).superRefine((value, context) => {
    if (value.positionEnd < value.positionStart) context.addIssue({ code: 'custom', path: ['positionEnd'], message: 'Variant end must not precede its start.' });
  }),
  z.object({
    entityType: z.literal('marker'),
    markerKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    locusId: uuidSchema.optional(),
    assemblyId: uuidSchema.optional(),
    markerType: z.string().trim().min(2).max(250),
    targetDefinition: scientificJsonObjectSchema,
    applicability: scientificApplicabilitySchema,
    idempotencyKey: idempotencyKeySchema,
  }).refine((value) => Boolean(value.locusId || value.assemblyId), {
    message: 'A marker must reference an approved locus, approved assembly, or both.',
  }),
  z.object({
    entityType: z.literal('assay'),
    assayKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    markerId: uuidSchema.optional(),
    locusId: uuidSchema.optional(),
    assayType: z.string().trim().min(2).max(250),
    protocolLocator: z.string().trim().min(5).max(2_000),
    resultContract: scientificJsonObjectSchema,
    applicability: scientificApplicabilitySchema,
    idempotencyKey: idempotencyKeySchema,
  }).refine((value) => Boolean(value.markerId || value.locusId), {
    message: 'An assay must reference an approved marker, approved locus, or both.',
  }),
  z.object({
    entityType: z.literal('capture_protocol'),
    protocolKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    contract: scientificJsonObjectSchema,
    idempotencyKey: idempotencyKeySchema,
  }),
  z.object({
    entityType: z.literal('observation_method'),
    methodKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    displayName: z.string().trim().min(2).max(500),
    protocolId: uuidSchema.optional(),
    contract: scientificJsonObjectSchema,
    applicability: scientificJsonObjectSchema,
    idempotencyKey: idempotencyKeySchema,
  }),
  z.object({
    entityType: z.literal('observation_quality_term'),
    qualityKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    displayName: z.string().trim().min(2).max(500),
    severity: z.enum(['information', 'warning', 'invalidating']),
    definition: z.string().trim().min(10).max(4_000),
    applicability: scientificJsonObjectSchema,
    idempotencyKey: idempotencyKeySchema,
  }),
  z.object({
    entityType: z.literal('observation_device_schema'),
    schemaKey: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    displayName: z.string().trim().min(2).max(500),
    jsonSchema: scientificJsonObjectSchema,
    applicability: scientificJsonObjectSchema,
    idempotencyKey: idempotencyKeySchema,
  }),
  z.object({
    entityType: z.literal('observation_definition'),
    traitId: shortCodeSchema,
    recordVersion: catalogRecordVersionSchema,
    displayName: z.string().trim().min(2).max(500),
    valueContract: scientificJsonObjectSchema,
    unitId: uuidSchema.optional(),
    vocabularyVersionId: uuidSchema.optional(),
    protocolId: uuidSchema,
    methodId: uuidSchema,
    allowedQualityTermIds: z.array(uuidSchema).max(100).default([]),
    missingPolicy: z.object({
      allowed: z.boolean(),
      allowedReasons: z.array(z.string().trim().min(2).max(500)).max(100).default([]),
    }).superRefine((value, context) => {
      if (value.allowed && value.allowedReasons.length === 0) context.addIssue({ code: 'custom', path: ['allowedReasons'], message: 'Allowed missing values require explicit controlled reasons.' });
      if (!value.allowed && value.allowedReasons.length > 0) context.addIssue({ code: 'custom', path: ['allowedReasons'], message: 'Disallowed missing values cannot list reasons.' });
    }),
    applicability: scientificJsonObjectSchema,
    idempotencyKey: idempotencyKeySchema,
  }),
]);

export type NormalizedCatalogDraftInput = z.infer<typeof normalizedCatalogDraftSchema>;
