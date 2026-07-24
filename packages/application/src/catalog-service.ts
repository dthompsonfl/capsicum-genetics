import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  normalizedCatalogDraftSchema,
  scientificReviewDecisionSchema,
  type NormalizedCatalogDraftInput,
  type Principal,
} from '@capsicum/contracts';
import { withSystemTransaction, withWorkspaceTransaction } from '@capsicum/database';
import { isIndependentCatalogReviewer } from '@capsicum/auth';
import { ApplicationError, audit, authorize, executeIdempotent, requestHash } from './internal';

export type CatalogEntityType =
  | 'scientific_source'
  | 'reference_assembly'
  | 'research_document'
  | 'research_passage'
  | 'locus'
  | 'allele'
  | 'variant'
  | 'marker'
  | 'assay'
  | 'evidence_assertion'
  | 'phenotype_rule'
  | 'capture_protocol'
  | 'observation_method'
  | 'observation_quality_term'
  | 'observation_device_schema'
  | 'observation_definition';

type DirectCatalogEntity = Exclude<CatalogEntityType, 'research_document' | 'research_passage' | 'variant'>;
type DirectCatalogTable = {
  table:
    | 'scientific_sources'
    | 'reference_assemblies'
    | 'loci'
    | 'catalog_alleles'
    | 'catalog_markers'
    | 'catalog_assays'
    | 'evidence_assertions'
    | 'phenotype_rules'
    | 'capture_protocols'
    | 'observation_methods'
    | 'observation_quality_terms'
    | 'observation_device_schemas'
    | 'observation_definitions';
  reviewEntity: string;
  orderColumn: 'created_at' | 'id';
};

function directCatalogTable(entityType: DirectCatalogEntity): DirectCatalogTable {
  switch (entityType) {
    case 'scientific_source': return { table: 'scientific_sources', reviewEntity: 'scientific_sources', orderColumn: 'created_at' };
    case 'reference_assembly': return { table: 'reference_assemblies', reviewEntity: 'reference_assemblies', orderColumn: 'created_at' };
    case 'locus': return { table: 'loci', reviewEntity: 'loci', orderColumn: 'created_at' };
    case 'allele': return { table: 'catalog_alleles', reviewEntity: 'catalog_alleles', orderColumn: 'created_at' };
    case 'marker': return { table: 'catalog_markers', reviewEntity: 'catalog_markers', orderColumn: 'created_at' };
    case 'assay': return { table: 'catalog_assays', reviewEntity: 'catalog_assays', orderColumn: 'created_at' };
    case 'evidence_assertion': return { table: 'evidence_assertions', reviewEntity: 'evidence_assertions', orderColumn: 'created_at' };
    case 'phenotype_rule': return { table: 'phenotype_rules', reviewEntity: 'phenotype_rules', orderColumn: 'id' };
    case 'capture_protocol': return { table: 'capture_protocols', reviewEntity: 'capture_protocols', orderColumn: 'created_at' };
    case 'observation_method': return { table: 'observation_methods', reviewEntity: 'observation_methods', orderColumn: 'created_at' };
    case 'observation_quality_term': return { table: 'observation_quality_terms', reviewEntity: 'observation_quality_terms', orderColumn: 'created_at' };
    case 'observation_device_schema': return { table: 'observation_device_schemas', reviewEntity: 'observation_device_schemas', orderColumn: 'created_at' };
    case 'observation_definition': return { table: 'observation_definitions', reviewEntity: 'observation_definitions', orderColumn: 'id' };
  }
}



export interface NormalizedCatalogDraftResult {
  entityType: NormalizedCatalogDraftInput['entityType'];
  entityId: string;
  contentHash: string;
}

async function requireApprovedReference(
  client: pg.PoolClient,
  table:
    | 'loci'
    | 'reference_assemblies'
    | 'catalog_alleles'
    | 'catalog_markers'
    | 'scientific_sources'
    | 'capture_protocols'
    | 'observation_methods'
    | 'observation_quality_terms'
    | 'observation_device_schemas'
    | 'measurement_units'
    | 'controlled_vocabularies',
  id: string | undefined,
  label: string,
): Promise<void> {
  if (!id) return;
  const result = await client.query(`SELECT id FROM ${table} WHERE id = $1 AND review_state = 'approved'`, [id]);
  if (!result.rows[0]) {
    throw new ApplicationError('scientific_authority_required', `${label} must reference an approved scientific record.`);
  }
}

export async function createNormalizedCatalogDraft(
  pool: pg.Pool,
  principal: Principal,
  rawInput: unknown,
): Promise<NormalizedCatalogDraftResult> {
  authorize(principal, 'catalog.curate');
  const input = normalizedCatalogDraftSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) =>
    executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
      const semanticInput = Object.fromEntries(
        Object.entries(input).filter(([key]) => key !== 'idempotencyKey'),
      );
      const contentHash = requestHash(semanticInput);
      let entityId: string | undefined;

      if (input.entityType === 'reference_assembly') {
        const result = await client.query<{ id: string }>(
          `INSERT INTO reference_assemblies(
             assembly_key, record_version, content_hash, species_scope, assembly_name, accession, source_locator, authored_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [input.assemblyKey, input.recordVersion, contentHash, input.speciesScope, input.assemblyName, input.accession ?? null, input.sourceLocator, principal.userId],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'allele') {
        await requireApprovedReference(client, 'loci', input.locusId, 'Allele locus');
        for (const alias of input.aliases) await requireApprovedReference(client, 'scientific_sources', alias.sourceId, 'Alias source');
        const result = await client.query<{ id: string }>(
          `INSERT INTO catalog_alleles(
             allele_key, record_version, content_hash, locus_id, canonical_symbol, molecular_definition,
             functional_class, unresolved_source_notation, applicability, authored_by
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING id`,
          [input.alleleKey, input.recordVersion, contentHash, input.locusId, input.canonicalSymbol,
            input.molecularDefinition ? JSON.stringify(input.molecularDefinition) : null, input.functionalClass ?? null,
            input.unresolvedSourceNotation ?? null, input.applicability, principal.userId],
        );
        entityId = result.rows[0]?.id;
        if (entityId) {
          for (const alias of input.aliases) {
            await client.query(
              `INSERT INTO allele_aliases(allele_id, alias, notation_context, source_id) VALUES ($1,$2,$3,$4)`,
              [entityId, alias.alias, alias.notationContext, alias.sourceId ?? null],
            );
          }
        }
      } else if (input.entityType === 'sequence_variant') {
        await requireApprovedReference(client, 'reference_assemblies', input.assemblyId, 'Sequence variant assembly');
        await requireApprovedReference(client, 'loci', input.locusId, 'Sequence variant locus');
        await requireApprovedReference(client, 'catalog_alleles', input.alleleId, 'Sequence variant allele');
        const result = await client.query<{ id: string }>(
          `INSERT INTO sequence_variants(
             variant_key, record_version, content_hash, assembly_id, chromosome, position_start, position_end,
             reference_allele, alternate_allele, locus_id, allele_id, applicability, authored_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [input.variantKey, input.recordVersion, contentHash, input.assemblyId, input.chromosome, input.positionStart,
            input.positionEnd, input.referenceAllele, input.alternateAllele, input.locusId ?? null, input.alleleId ?? null,
            input.applicability, principal.userId],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'structural_variant') {
        await requireApprovedReference(client, 'reference_assemblies', input.assemblyId, 'Structural variant assembly');
        await requireApprovedReference(client, 'loci', input.locusId, 'Structural variant locus');
        await requireApprovedReference(client, 'catalog_alleles', input.alleleId, 'Structural variant allele');
        const result = await client.query<{ id: string }>(
          `INSERT INTO structural_variants(
             variant_key, record_version, content_hash, assembly_id, chromosome, position_start, position_end,
             variant_type, locus_id, allele_id, applicability, authored_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [input.variantKey, input.recordVersion, contentHash, input.assemblyId, input.chromosome, input.positionStart,
            input.positionEnd, input.variantType, input.locusId ?? null, input.alleleId ?? null, input.applicability, principal.userId],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'marker') {
        await requireApprovedReference(client, 'loci', input.locusId, 'Marker locus');
        await requireApprovedReference(client, 'reference_assemblies', input.assemblyId, 'Marker assembly');
        const result = await client.query<{ id: string }>(
          `INSERT INTO catalog_markers(
             marker_key, record_version, content_hash, locus_id, assembly_id, marker_type, target_definition, applicability, authored_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING id`,
          [input.markerKey, input.recordVersion, contentHash, input.locusId ?? null, input.assemblyId ?? null,
            input.markerType, JSON.stringify(input.targetDefinition), input.applicability, principal.userId],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'assay') {
        await requireApprovedReference(client, 'catalog_markers', input.markerId, 'Assay marker');
        await requireApprovedReference(client, 'loci', input.locusId, 'Assay locus');
        const result = await client.query<{ id: string }>(
          `INSERT INTO catalog_assays(
             assay_key, record_version, content_hash, marker_id, locus_id, assay_type, protocol_locator, result_contract, applicability, authored_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING id`,
          [input.assayKey, input.recordVersion, contentHash, input.markerId ?? null, input.locusId ?? null, input.assayType,
            input.protocolLocator, JSON.stringify(input.resultContract), input.applicability, principal.userId],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'capture_protocol') {
        const result = await client.query<{ id: string }>(
          `INSERT INTO capture_protocols(protocol_key, version, contract, authored_by)
           VALUES ($1,$2,$3::jsonb,$4) RETURNING id`,
          [input.protocolKey, input.recordVersion, JSON.stringify(input.contract), principal.userId],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'observation_method') {
        await requireApprovedReference(client, 'capture_protocols', input.protocolId, 'Observation method protocol');
        const result = await client.query<{ id: string }>(
          `INSERT INTO observation_methods(
             method_key, method_version, display_name, protocol_id, contract, applicability, authored_by, content_hash
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) RETURNING id`,
          [input.methodKey, input.recordVersion, input.displayName, input.protocolId ?? null,
            JSON.stringify(input.contract), JSON.stringify(input.applicability), principal.userId, contentHash],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'observation_quality_term') {
        const result = await client.query<{ id: string }>(
          `INSERT INTO observation_quality_terms(
             quality_key, quality_version, display_name, severity, definition, applicability, authored_by, content_hash
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING id`,
          [input.qualityKey, input.recordVersion, input.displayName, input.severity, input.definition,
            JSON.stringify(input.applicability), principal.userId, contentHash],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'observation_device_schema') {
        const result = await client.query<{ id: string }>(
          `INSERT INTO observation_device_schemas(
             schema_key, schema_version, display_name, json_schema, applicability, authored_by, content_hash
           ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) RETURNING id`,
          [input.schemaKey, input.recordVersion, input.displayName, JSON.stringify(input.jsonSchema),
            JSON.stringify(input.applicability), principal.userId, contentHash],
        );
        entityId = result.rows[0]?.id;
      } else if (input.entityType === 'observation_definition') {
        await requireApprovedReference(client, 'capture_protocols', input.protocolId, 'Observation definition protocol');
        await requireApprovedReference(client, 'observation_methods', input.methodId, 'Observation definition method');
        await requireApprovedReference(client, 'measurement_units', input.unitId, 'Observation definition unit');
        await requireApprovedReference(client, 'controlled_vocabularies', input.vocabularyVersionId, 'Observation definition vocabulary');
        for (const qualityTermId of input.allowedQualityTermIds) {
          await requireApprovedReference(client, 'observation_quality_terms', qualityTermId, 'Observation definition quality term');
        }
        const method = await client.query<{ protocol_id: string | null }>(
          'SELECT protocol_id FROM observation_methods WHERE id = $1',
          [input.methodId],
        );
        if (method.rows[0]?.protocol_id && method.rows[0].protocol_id !== input.protocolId) {
          throw new ApplicationError('scientific_authority_required', 'The approved method is not applicable to the selected protocol version.');
        }
        const result = await client.query<{ id: string }>(
          `INSERT INTO observation_definitions(
             trait_id, trait_version, display_name, value_contract, review_state, authored_by, content_hash,
             unit_id, vocabulary_version_id, applicability, protocol_id, method_id, missing_policy
           ) VALUES ($1,$2,$3,$4::jsonb,'draft',$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb) RETURNING id`,
          [input.traitId, input.recordVersion, input.displayName, JSON.stringify(input.valueContract), principal.userId, contentHash,
            input.unitId ?? null, input.vocabularyVersionId ?? null, JSON.stringify(input.applicability), input.protocolId, input.methodId,
            JSON.stringify(input.missingPolicy)],
        );
        entityId = result.rows[0]?.id;
        if (entityId) {
          for (const qualityTermId of input.allowedQualityTermIds) {
            await client.query(
              'INSERT INTO observation_definition_quality_terms(definition_id, quality_term_id) VALUES ($1,$2)',
              [entityId, qualityTermId],
            );
          }
        }
      }

      if (!entityId) throw new ApplicationError('internal_error', 'The normalized scientific draft was not created.');
      await audit(client, principal, 'catalog.normalized_record.drafted', input.entityType, entityId, null, { contentHash });
      return { entityType: input.entityType, entityId, contentHash };
    }, 'catalog.normalized_record.create'),
  );
}

export interface CatalogDashboard {
  sources: Record<string, number>;
  loci: Record<string, number>;
  alleles: Record<string, number>;
  assertions: Record<string, number>;
  rules: Record<string, number>;
  releases: Record<string, number>;
}

async function groupedCounts(client: pg.PoolClient, table: string, stateColumn: 'review_state' | 'state'): Promise<Record<string, number>> {
  const result = await client.query<{ state: string; count: number }>(
    `SELECT ${stateColumn}::text AS state, count(*)::int AS count FROM ${table} GROUP BY ${stateColumn} ORDER BY ${stateColumn}`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.state, Number(row.count)]));
}

export async function getCatalogDashboard(pool: pg.Pool, principal: Principal): Promise<CatalogDashboard> {
  authorize(principal, 'catalog.read');
  return withSystemTransaction(pool, async (client) => ({
    sources: await groupedCounts(client, 'scientific_sources', 'review_state'),
    loci: await groupedCounts(client, 'loci', 'review_state'),
    alleles: await groupedCounts(client, 'catalog_alleles', 'review_state'),
    assertions: await groupedCounts(client, 'evidence_assertions', 'review_state'),
    rules: await groupedCounts(client, 'phenotype_rules', 'review_state'),
    releases: await groupedCounts(client, 'catalog_releases', 'state'),
  }));
}

export async function listCatalogRecords(
  pool: pg.Pool,
  principal: Principal,
  entityType: CatalogEntityType,
  state?: string,
  limit = 100,
): Promise<readonly Record<string, unknown>[]> {
  authorize(principal, 'catalog.read');
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  if (entityType === 'research_document') {
    return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
      const result = state
        ? await client.query(
          `SELECT document.*, document.created_by AS authored_by,
                  creator.display_name AS authored_by_name,
                  'research_document'::text AS entity_kind
           FROM research_documents document
           JOIN users creator ON creator.id = document.created_by
           WHERE document.workspace_id = $1 AND document.review_state::text = $2
           ORDER BY document.created_at DESC, document.id DESC LIMIT $3`,
          [principal.workspaceId, state, safeLimit],
        )
        : await client.query(
          `SELECT document.*, document.created_by AS authored_by,
                  creator.display_name AS authored_by_name,
                  'research_document'::text AS entity_kind
           FROM research_documents document
           JOIN users creator ON creator.id = document.created_by
           WHERE document.workspace_id = $1
           ORDER BY document.created_at DESC, document.id DESC LIMIT $2`,
          [principal.workspaceId, safeLimit],
        );
      return result.rows;
    });
  }
  if (entityType === 'research_passage') {
    return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
      const result = state
        ? await client.query(
          `SELECT passage.*, document.title AS document_title, 'research_passage'::text AS entity_kind
           FROM research_passages passage
           JOIN research_documents document ON document.workspace_id = passage.workspace_id AND document.id = passage.document_id
           WHERE passage.workspace_id = $1 AND passage.review_state::text = $2
           ORDER BY passage.created_at DESC, passage.passage_index LIMIT $3`,
          [principal.workspaceId, state, safeLimit],
        )
        : await client.query(
          `SELECT passage.*, document.title AS document_title, 'research_passage'::text AS entity_kind
           FROM research_passages passage
           JOIN research_documents document ON document.workspace_id = passage.workspace_id AND document.id = passage.document_id
           WHERE passage.workspace_id = $1 ORDER BY passage.created_at DESC, passage.passage_index LIMIT $2`,
          [principal.workspaceId, safeLimit],
        );
      return result.rows;
    });
  }
  if (entityType === 'variant') {
    return withSystemTransaction(pool, async (client) => {
      const result = await client.query(
        `SELECT * FROM (
           SELECT variant.*, 'sequence_variant'::text AS entity_kind FROM sequence_variants variant
           UNION ALL
           SELECT variant.*, 'structural_variant'::text AS entity_kind FROM structural_variants variant
         ) variants
         WHERE ($1::text IS NULL OR variants.review_state::text = $1)
         ORDER BY variants.created_at DESC LIMIT $2`,
        [state ?? null, safeLimit],
      );
      return result.rows;
    });
  }
  const { table, orderColumn } = directCatalogTable(entityType);
  return withSystemTransaction(pool, async (client) => {
    const result = state
      ? await client.query(`SELECT * FROM ${table} WHERE review_state::text = $1 ORDER BY ${orderColumn} DESC LIMIT $2`, [state, safeLimit])
      : await client.query(`SELECT * FROM ${table} ORDER BY ${orderColumn} DESC LIMIT $1`, [safeLimit]);
    return result.rows;
  });
}

async function resolveVariantTable(client: pg.PoolClient, entityId: string): Promise<{ table: 'sequence_variants' | 'structural_variants'; reviewEntity: string }> {
  const result = await client.query<{ table_name: 'sequence_variants' | 'structural_variants' }>(
    `SELECT 'sequence_variants'::text AS table_name FROM sequence_variants WHERE id = $1
     UNION ALL
     SELECT 'structural_variants'::text AS table_name FROM structural_variants WHERE id = $1`,
    [entityId],
  );
  if (result.rows.length !== 1) throw new ApplicationError('not_found', 'The requested catalog variant was not found or is ambiguous.');
  const table = result.rows[0]!.table_name;
  return { table, reviewEntity: table };
}

export async function submitCatalogRecordForReview(
  pool: pg.Pool,
  principal: Principal,
  entityType: CatalogEntityType,
  entityId: string,
): Promise<void> {
  authorize(principal, 'catalog.curate');
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    if (entityType === 'research_document') {
      await client.query('SELECT app_submit_research_document($1)', [entityId]);
      await audit(client, principal, 'research.document.submitted', 'research_document', entityId, null, { reviewState: 'in_review' });
      return;
    }
    if (entityType === 'research_passage') {
      await client.query('SELECT app_submit_research_passage($1)', [entityId]);
      return;
    }
    const resolved = entityType === 'variant' ? await resolveVariantTable(client, entityId) : directCatalogTable(entityType);
    const record = await client.query<{ review_state: string; authored_by: string | null }>(
      `SELECT review_state::text, authored_by::text FROM ${resolved.table} WHERE id = $1 FOR UPDATE`,
      [entityId],
    );
    const current = record.rows[0];
    if (!current) throw new ApplicationError('not_found', 'The catalog record was not found.');
    if (!current.authored_by) throw new ApplicationError('scientific_authority_required', 'The record requires an identified human author before review.');
    if (!['draft', 'changes_requested'].includes(current.review_state)) {
      throw new ApplicationError('conflict', `Only draft or changes-requested records may enter review; current state is ${current.review_state}.`);
    }
    await client.query(`UPDATE ${resolved.table} SET review_state = 'in_review' WHERE id = $1`, [entityId]);
    await audit(client, principal, 'catalog.record.submitted', entityType, entityId, current, { reviewState: 'in_review' });
  });
}

export async function reviewCatalogRecord(pool: pg.Pool, principal: Principal, input: unknown): Promise<void> {
  authorize(principal, 'catalog.review');
  const parsed = scientificReviewDecisionSchema.parse(input) as {
    entityType: CatalogEntityType;
    entityId: string;
    authorUserId: string;
    decision: 'changes_requested' | 'approved' | 'rejected';
    rationale: string;
    idempotencyKey: string;
  };
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    if (parsed.entityType === 'research_document') {
      await client.query('SELECT app_review_research_document($1, $2::review_state, $3)', [parsed.entityId, parsed.decision, parsed.rationale]);
      await audit(client, principal, 'research.document.reviewed', 'research_document', parsed.entityId, null, {
        decision: parsed.decision,
        rationale: parsed.rationale,
      });
      return;
    }
    if (parsed.entityType === 'research_passage') {
      await client.query('SELECT app_review_research_passage($1, $2::review_state, $3)', [parsed.entityId, parsed.decision, parsed.rationale]);
      return;
    }
    const resolved = parsed.entityType === 'variant' ? await resolveVariantTable(client, parsed.entityId) : directCatalogTable(parsed.entityType);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`catalog-review:${resolved.table}:${parsed.entityId}`]);
    const record = await client.query<{ review_state: string; authored_by: string }>(
      `SELECT review_state::text, authored_by::text FROM ${resolved.table} WHERE id = $1 FOR UPDATE`,
      [parsed.entityId],
    );
    const current = record.rows[0];
    if (!current) throw new ApplicationError('not_found', 'The catalog record was not found.');
    if (current.authored_by !== parsed.authorUserId) throw new ApplicationError('conflict', 'The supplied author identity does not match the record.');
    if (!isIndependentCatalogReviewer({ actorId: principal.userId, authorId: current.authored_by })) {
      throw new ApplicationError('scientific_authority_required', 'Scientific records require an independent reviewer.');
    }
    const existing = await client.query<{ decision: string }>(
      `SELECT decision::text FROM scientific_reviews
       WHERE entity_type = $1 AND entity_id = $2 AND reviewer_user_id = $3 AND decision = $4::review_state`,
      [resolved.reviewEntity, parsed.entityId, principal.userId, parsed.decision],
    );
    if (existing.rows.length > 0 && current.review_state === parsed.decision) return;
    if (current.review_state !== 'in_review') {
      throw new ApplicationError('conflict', `Only in-review records may receive a decision; current state is ${current.review_state}.`);
    }
    await client.query(
      `INSERT INTO scientific_reviews(entity_type, entity_id, author_user_id, reviewer_user_id, decision, rationale)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [resolved.reviewEntity, parsed.entityId, current.authored_by, principal.userId, parsed.decision, parsed.rationale],
    );
    await client.query(
      `UPDATE ${resolved.table}
       SET review_state = $2::review_state,
           approved_by = CASE WHEN $2 = 'approved' THEN $3::uuid ELSE NULL END,
           approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END
       WHERE id = $1`,
      [parsed.entityId, parsed.decision, principal.userId],
    );
    const reviewFingerprint = createHash('sha256').update(`${principal.workspaceId}:${principal.userId}:${parsed.idempotencyKey}`).digest('hex');
    await audit(client, principal, 'catalog.review.decision', parsed.entityType, parsed.entityId, current, {
      decision: parsed.decision, reviewerUserId: principal.userId, reviewFingerprint,
    });
  });
}

type SnapshotRecord = { id: string; content_hash: string };
type PassageSnapshot = { workspace_id: string; id: string; passage_sha256: string };

type CatalogReleaseSnapshot = {
  schemaVersion: 'v4';
  version: string;
  governingWorkspaceId: string;
  sources: SnapshotRecord[];
  loci: SnapshotRecord[];
  assemblies: SnapshotRecord[];
  alleles: SnapshotRecord[];
  sequenceVariants: SnapshotRecord[];
  structuralVariants: SnapshotRecord[];
  markers: SnapshotRecord[];
  assays: SnapshotRecord[];
  assertions: SnapshotRecord[];
  passages: Array<{ workspace_id: string; id: string; content_hash: string }>;
  captureProtocols: SnapshotRecord[];
  observationMethods: SnapshotRecord[];
  observationQualityTerms: SnapshotRecord[];
  observationDeviceSchemas: SnapshotRecord[];
  observationDefinitions: SnapshotRecord[];
  rules: readonly [];
};

function protocolHash(row: Record<string, unknown>): string {
  return requestHash({ protocolKey: row.protocol_key, version: row.version, contract: row.contract });
}

async function approvedRecords(client: pg.PoolClient, table: string, order: string): Promise<SnapshotRecord[]> {
  const result = await client.query<SnapshotRecord>(
    `SELECT id::text, content_hash FROM ${table} WHERE review_state = 'approved' ORDER BY ${order}`,
  );
  return result.rows;
}

async function buildReleaseSnapshot(client: pg.PoolClient, workspaceId: string, version: string): Promise<CatalogReleaseSnapshot> {
  const [
    sources, loci, assemblies, alleles, sequenceVariants, structuralVariants, markers, assays, assertions,
    passagesResult, protocolsResult, observationMethods, observationQualityTerms, observationDeviceSchemas, definitions,
  ] = await Promise.all([
    client.query<SnapshotRecord>(
      `SELECT DISTINCT source.id::text, source.content_hash
       FROM scientific_sources source
       JOIN evidence_assertion_sources link ON link.source_id = source.id
       JOIN evidence_assertions assertion ON assertion.id = link.assertion_id AND assertion.review_state = 'approved'
       WHERE source.review_state = 'approved' ORDER BY source.id`,
    ).then((result) => result.rows),
    approvedRecords(client, 'loci', 'catalog_id, record_version'),
    approvedRecords(client, 'reference_assemblies', 'assembly_key, record_version'),
    approvedRecords(client, 'catalog_alleles', 'allele_key, record_version'),
    approvedRecords(client, 'sequence_variants', 'variant_key, record_version'),
    approvedRecords(client, 'structural_variants', 'variant_key, record_version'),
    approvedRecords(client, 'catalog_markers', 'marker_key, record_version'),
    approvedRecords(client, 'catalog_assays', 'assay_key, record_version'),
    approvedRecords(client, 'evidence_assertions', 'claim_id, record_version'),
    client.query<PassageSnapshot>(
      `SELECT passage.workspace_id::text, passage.id::text, passage.passage_sha256
       FROM research_passages passage
       JOIN research_documents document ON document.workspace_id = passage.workspace_id AND document.id = passage.document_id
       JOIN scientific_sources source ON source.id = document.source_id
       WHERE passage.workspace_id = $1 AND passage.review_state = 'approved' AND source.review_state = 'approved'
       ORDER BY passage.document_id, passage.passage_index, passage.passage_version`,
      [workspaceId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT id::text, protocol_key, version, contract FROM capture_protocols WHERE review_state = 'approved' ORDER BY protocol_key, version`,
    ),
    approvedRecords(client, 'observation_methods', 'method_key, method_version'),
    approvedRecords(client, 'observation_quality_terms', 'quality_key, quality_version'),
    approvedRecords(client, 'observation_device_schemas', 'schema_key, schema_version'),
    client.query<SnapshotRecord>(
      `SELECT id::text, content_hash FROM observation_definitions
       WHERE review_state = 'approved' AND content_hash IS NOT NULL ORDER BY trait_id, trait_version`,
    ).then((result) => result.rows),
  ]);
  return {
    schemaVersion: 'v4',
    version,
    governingWorkspaceId: workspaceId,
    sources,
    loci,
    assemblies,
    alleles,
    sequenceVariants,
    structuralVariants,
    markers,
    assays,
    assertions,
    passages: passagesResult.rows.map((row) => ({ workspace_id: row.workspace_id, id: row.id, content_hash: row.passage_sha256 })),
    captureProtocols: protocolsResult.rows.map((row) => ({ id: String(row.id), content_hash: protocolHash(row) })),
    observationMethods,
    observationQualityTerms,
    observationDeviceSchemas,
    observationDefinitions: definitions,
    rules: [],
  };
}

async function insertMemberships(client: pg.PoolClient, releaseId: string, snapshot: CatalogReleaseSnapshot): Promise<void> {
  const inserts: Array<{ sql: string; rows: Array<{ id: string; content_hash: string }> }> = [
    { sql: 'INSERT INTO catalog_release_sources(release_id, source_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.sources },
    { sql: 'INSERT INTO catalog_release_loci(release_id, locus_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.loci },
    { sql: 'INSERT INTO catalog_release_assemblies(release_id, assembly_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.assemblies },
    { sql: 'INSERT INTO catalog_release_alleles(release_id, allele_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.alleles },
    { sql: 'INSERT INTO catalog_release_sequence_variants(release_id, variant_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.sequenceVariants },
    { sql: 'INSERT INTO catalog_release_structural_variants(release_id, variant_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.structuralVariants },
    { sql: 'INSERT INTO catalog_release_markers(release_id, marker_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.markers },
    { sql: 'INSERT INTO catalog_release_assays(release_id, assay_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.assays },
    { sql: 'INSERT INTO catalog_release_assertions(release_id, assertion_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.assertions },
    { sql: 'INSERT INTO catalog_release_capture_protocols(release_id, protocol_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.captureProtocols },
    { sql: 'INSERT INTO catalog_release_observation_methods(release_id, method_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.observationMethods },
    { sql: 'INSERT INTO catalog_release_observation_quality_terms(release_id, quality_term_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.observationQualityTerms },
    { sql: 'INSERT INTO catalog_release_observation_device_schemas(release_id, device_schema_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.observationDeviceSchemas },
    { sql: 'INSERT INTO catalog_release_observation_definitions(release_id, definition_id, record_hash) VALUES ($1, $2, $3)', rows: snapshot.observationDefinitions },
  ];
  for (const group of inserts) {
    for (const row of group.rows) await client.query(group.sql, [releaseId, row.id, row.content_hash]);
  }
  for (const passage of snapshot.passages) {
    await client.query(
      'INSERT INTO catalog_release_passages(release_id, workspace_id, passage_id, record_hash) VALUES ($1, $2, $3, $4)',
      [releaseId, passage.workspace_id, passage.id, passage.content_hash],
    );
  }
}

export interface CatalogReleaseDraftResult {
  releaseId: string;
  contentHash: string;
  manifest: CatalogReleaseSnapshot;
}

export async function createCatalogReleaseDraft(pool: pg.Pool, principal: Principal, versionInput: string): Promise<CatalogReleaseDraftResult> {
  authorize(principal, 'catalog.curate');
  const version = versionInput.trim();
  if (!version || version.length > 120) throw new ApplicationError('validation_failed', 'Release version is required and must not exceed 120 characters.');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('catalog-release-draft:' || $1, 0))", [version]);
    const snapshot = await buildReleaseSnapshot(client, principal.workspaceId, version);
    if (snapshot.loci.length === 0 || snapshot.assertions.length === 0 || snapshot.sources.length === 0) {
      throw new ApplicationError('scientific_authority_unavailable', 'A release draft requires approved loci, source-linked assertions, and approved scientific sources.');
    }
    const contentHash = requestHash(snapshot);
    const release = await client.query<{ id: string }>(
      `INSERT INTO catalog_releases(
         version, state, content_hash, governing_workspace_id, authored_by,
         release_review_state, publication_schema_version, content_manifest
       ) VALUES ($1, 'draft', $2, $3, $4, 'draft', 'v4', $5)
       RETURNING id`,
      [version, contentHash, principal.workspaceId, principal.userId, snapshot],
    );
    const releaseId = release.rows[0]?.id;
    if (!releaseId) throw new ApplicationError('internal_error', 'Catalog release draft was not created.');
    await insertMemberships(client, releaseId, snapshot);
    await audit(client, principal, 'catalog.release.drafted', 'catalog_release', releaseId, null, {
      version, contentHash, counts: Object.fromEntries(Object.entries(snapshot).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
    });
    return { releaseId, contentHash, manifest: snapshot };
  });
}

export async function submitCatalogReleaseForReview(pool: pg.Pool, principal: Principal, releaseId: string): Promise<void> {
  authorize(principal, 'catalog.curate');
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<{ release_review_state: string; authored_by: string; governing_workspace_id: string }>(
      `SELECT release_review_state::text, authored_by::text, governing_workspace_id::text
       FROM catalog_releases WHERE id = $1 FOR UPDATE`,
      [releaseId],
    );
    const release = result.rows[0];
    if (!release || release.governing_workspace_id !== principal.workspaceId) throw new ApplicationError('not_found', 'Catalog release draft was not found.');
    if (!['draft', 'changes_requested'].includes(release.release_review_state)) throw new ApplicationError('conflict', 'Only a draft or changes-requested release may enter review.');
    await client.query(`UPDATE catalog_releases SET release_review_state = 'in_review', submitted_at = now(), reviewed_by = NULL, reviewed_at = NULL, review_rationale = NULL WHERE id = $1`, [releaseId]);
    await audit(client, principal, 'catalog.release.submitted', 'catalog_release', releaseId, release, { releaseReviewState: 'in_review' });
  });
}

export async function reviewCatalogRelease(
  pool: pg.Pool,
  principal: Principal,
  input: { releaseId: string; authorUserId: string; decision: 'approved' | 'changes_requested' | 'rejected'; rationale: string },
): Promise<void> {
  authorize(principal, 'catalog.review');
  if (input.rationale.trim().length < 10) throw new ApplicationError('validation_failed', 'A scientific rationale of at least 10 characters is required.');
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<{ release_review_state: string; authored_by: string; governing_workspace_id: string }>(
      `SELECT release_review_state::text, authored_by::text, governing_workspace_id::text FROM catalog_releases WHERE id = $1 FOR UPDATE`,
      [input.releaseId],
    );
    const release = result.rows[0];
    if (!release || release.governing_workspace_id !== principal.workspaceId) throw new ApplicationError('not_found', 'Catalog release was not found.');
    if (release.authored_by !== input.authorUserId) throw new ApplicationError('conflict', 'The supplied release author does not match the immutable release record.');
    if (release.authored_by === principal.userId) throw new ApplicationError('scientific_authority_required', 'Release authors cannot approve their own release.');
    if (release.release_review_state !== 'in_review') throw new ApplicationError('conflict', 'Only an in-review release may receive a decision.');
    await client.query(
      `INSERT INTO scientific_reviews(entity_type, entity_id, author_user_id, reviewer_user_id, decision, rationale)
       VALUES ('catalog_releases', $1, $2, $3, $4, $5)
       ON CONFLICT (entity_type, entity_id, reviewer_user_id, decision) DO NOTHING`,
      [input.releaseId, release.authored_by, principal.userId, input.decision, input.rationale.trim()],
    );
    await client.query(
      `UPDATE catalog_releases
       SET release_review_state = $2::review_state,
           reviewed_by = $3,
           reviewed_at = now(),
           review_rationale = $4
       WHERE id = $1`,
      [input.releaseId, input.decision, principal.userId, input.rationale.trim()],
    );
    await audit(client, principal, 'catalog.release.reviewed', 'catalog_release', input.releaseId, release, { decision: input.decision });
  });
}

export async function publishCatalogRelease(pool: pg.Pool, principal: Principal, releaseId: string): Promise<void> {
  authorize(principal, 'catalog.publish');
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<{ state: string; release_review_state: string; governing_workspace_id: string }>(
      `SELECT state::text, release_review_state::text, governing_workspace_id::text FROM catalog_releases WHERE id = $1 FOR UPDATE`,
      [releaseId],
    );
    const release = result.rows[0];
    if (!release || release.governing_workspace_id !== principal.workspaceId) throw new ApplicationError('not_found', 'Catalog release was not found.');
    if (release.state === 'approved') return;
    if (release.release_review_state !== 'approved') throw new ApplicationError('scientific_authority_required', 'Independent release approval is required before publication.');
    await client.query(`UPDATE catalog_releases SET state = 'approved', published_by = $2, published_at = now() WHERE id = $1`, [releaseId, principal.userId]);
    await audit(client, principal, 'catalog.release.published', 'catalog_release', releaseId, release, { publishedBy: principal.userId });
  });
}

export async function listCatalogReleases(pool: pg.Pool, principal: Principal): Promise<readonly Record<string, unknown>[]> {
  authorize(principal, 'catalog.read');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query(
      `SELECT release.*,
              count(DISTINCT source.source_id)::int AS source_count,
              count(DISTINCT locus.locus_id)::int AS locus_count,
              count(DISTINCT allele.allele_id)::int AS allele_count,
              count(DISTINCT assertion.assertion_id)::int AS assertion_count,
              count(DISTINCT rule.id)::int AS rule_count
       FROM catalog_releases release
       LEFT JOIN catalog_release_sources source ON source.release_id = release.id
       LEFT JOIN catalog_release_loci locus ON locus.release_id = release.id
       LEFT JOIN catalog_release_alleles allele ON allele.release_id = release.id
       LEFT JOIN catalog_release_assertions assertion ON assertion.release_id = release.id
       LEFT JOIN phenotype_rules rule ON rule.catalog_release_id = release.id
       WHERE release.state = 'approved'
          OR release.governing_workspace_id = $1
       GROUP BY release.id ORDER BY release.created_at DESC`,
      [principal.workspaceId],
    );
    return result.rows;
  });
}

export async function getCatalogRecord(pool: pg.Pool, principal: Principal, entityType: CatalogEntityType, entityId: string): Promise<Record<string, unknown> | null> {
  authorize(principal, 'catalog.read');
  if (entityType === 'research_document') {
    return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
      const result = await client.query(
        `SELECT document.*, document.created_by AS authored_by,
                creator.display_name AS authored_by_name,
                reviewer.display_name AS approved_by_name
         FROM research_documents document
         JOIN users creator ON creator.id = document.created_by
         LEFT JOIN users reviewer ON reviewer.id = document.approved_by
         WHERE document.workspace_id = $1 AND document.id = $2`,
        [principal.workspaceId, entityId],
      );
      return result.rows[0] ?? null;
    });
  }
  if (entityType === 'research_passage') {
    return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
      const result = await client.query('SELECT * FROM research_passages WHERE workspace_id = $1 AND id = $2', [principal.workspaceId, entityId]);
      return result.rows[0] ?? null;
    });
  }
  return withSystemTransaction(pool, async (client) => {
    if (entityType === 'variant') {
      const resolved = await resolveVariantTable(client, entityId);
      const result = await client.query(`SELECT *, $2::text AS entity_kind FROM ${resolved.table} WHERE id = $1`, [entityId, resolved.reviewEntity]);
      return result.rows[0] ?? null;
    }
    const { table } = directCatalogTable(entityType);
    const result = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [entityId]);
    return result.rows[0] ?? null;
  });
}

export async function getCatalogRelease(pool: pg.Pool, principal: Principal, releaseId: string): Promise<Record<string, unknown> | null> {
  authorize(principal, 'catalog.read');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const release = await client.query(
      `SELECT *
       FROM catalog_releases
       WHERE id = $1
         AND (state = 'approved' OR governing_workspace_id = $2)`,
      [releaseId, principal.workspaceId],
    );
    if (!release.rows[0]) return null;
    const membershipQueries: Array<[string, string]> = [
      ['sources', `SELECT source.id, source.source_id AS key, member.record_hash FROM catalog_release_sources member JOIN scientific_sources source ON source.id = member.source_id WHERE member.release_id = $1 ORDER BY source.source_id`],
      ['loci', `SELECT locus.id, locus.catalog_id AS key, locus.canonical_symbol AS symbol, member.record_hash FROM catalog_release_loci member JOIN loci locus ON locus.id = member.locus_id WHERE member.release_id = $1 ORDER BY locus.catalog_id`],
      ['alleles', `SELECT allele.id, allele.allele_key AS key, allele.canonical_symbol AS symbol, member.record_hash FROM catalog_release_alleles member JOIN catalog_alleles allele ON allele.id = member.allele_id WHERE member.release_id = $1 ORDER BY allele.allele_key`],
      ['assertions', `SELECT assertion.id, assertion.claim_id AS key, member.record_hash FROM catalog_release_assertions member JOIN evidence_assertions assertion ON assertion.id = member.assertion_id WHERE member.release_id = $1 ORDER BY assertion.claim_id`],
      ['assemblies', `SELECT assembly.id, assembly.assembly_key AS key, member.record_hash FROM catalog_release_assemblies member JOIN reference_assemblies assembly ON assembly.id = member.assembly_id WHERE member.release_id = $1 ORDER BY assembly.assembly_key`],
      ['markers', `SELECT marker.id, marker.marker_key AS key, member.record_hash FROM catalog_release_markers member JOIN catalog_markers marker ON marker.id = member.marker_id WHERE member.release_id = $1 ORDER BY marker.marker_key`],
      ['assays', `SELECT assay.id, assay.assay_key AS key, member.record_hash FROM catalog_release_assays member JOIN catalog_assays assay ON assay.id = member.assay_id WHERE member.release_id = $1 ORDER BY assay.assay_key`],
      ['passages', `SELECT passage.id, passage.locator AS key, member.record_hash FROM catalog_release_passages member JOIN research_passages passage ON passage.workspace_id = member.workspace_id AND passage.id = member.passage_id WHERE member.release_id = $1 ORDER BY passage.document_id, passage.passage_index`],
      ['captureProtocols', `SELECT protocol.id, protocol.protocol_key AS key, protocol.version AS version, member.record_hash FROM catalog_release_capture_protocols member JOIN capture_protocols protocol ON protocol.id = member.protocol_id WHERE member.release_id = $1 ORDER BY protocol.protocol_key, protocol.version`],
      ['observationMethods', `SELECT method.id, method.method_key AS key, method.method_version AS version, member.record_hash FROM catalog_release_observation_methods member JOIN observation_methods method ON method.id = member.method_id WHERE member.release_id = $1 ORDER BY method.method_key, method.method_version`],
      ['observationQualityTerms', `SELECT quality.id, quality.quality_key AS key, quality.quality_version AS version, member.record_hash FROM catalog_release_observation_quality_terms member JOIN observation_quality_terms quality ON quality.id = member.quality_term_id WHERE member.release_id = $1 ORDER BY quality.quality_key, quality.quality_version`],
      ['observationDeviceSchemas', `SELECT schema_record.id, schema_record.schema_key AS key, schema_record.schema_version AS version, member.record_hash FROM catalog_release_observation_device_schemas member JOIN observation_device_schemas schema_record ON schema_record.id = member.device_schema_id WHERE member.release_id = $1 ORDER BY schema_record.schema_key, schema_record.schema_version`],
      ['observationDefinitions', `SELECT definition.id, definition.trait_id AS key, definition.trait_version AS version, member.record_hash FROM catalog_release_observation_definitions member JOIN observation_definitions definition ON definition.id = member.definition_id WHERE member.release_id = $1 ORDER BY definition.trait_id, definition.trait_version`],
    ];
    const entries = await Promise.all(membershipQueries.map(async ([key, sql]) => [key, (await client.query(sql, [releaseId])).rows] as const));
    return { ...release.rows[0], ...Object.fromEntries(entries) };
  });
}
