import type pg from 'pg';
import {
  crossCreateSchema,
  crossEventSchema,
  crossVerificationRecordSchema,
  crossVerificationReviewSchema,
  germplasmCreateSchema,
  genotypeCallSchema,
  harvestCreateSchema,
  inventoryEventSchema,
  inventoryTransferSchema,
  inventoryExceptionRequestSchema,
  inventoryExceptionReviewSchema,
  inventoryReservationCreateSchema,
  inventoryReservationReleaseSchema,
  plantCreateSchema,
  seedLotCreateSchema,
  type CrossCreateInput,
  type CrossEventInput,
  type CrossVerificationRecordInput,
  type CrossVerificationReviewInput,
  type GermplasmCreateInput,
  type GenotypeCallInput,
  type HarvestCreateInput,
  type InventoryEventInput,
  type InventoryTransferInput,
  type InventoryExceptionRequestInput,
  type InventoryExceptionReviewInput,
  type InventoryReservationCreateInput,
  type InventoryReservationReleaseInput,
  type PlantCreateInput,
  type Principal,
  type SeedLotCreateInput,
} from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import { derivedMaterialClassForPollination, validateDirectedCross } from '@capsicum/breeding-domain';
import { ApplicationError, audit, authorize, executeIdempotent, requestHash } from './internal';

export interface MaterialSummary {
  id: string;
  materialCode: string;
  kind: string;
  status: string;
  displayName: string | null;
  createdAt: string;
  availableQuantity?: number | null;
  identityType?: string | null;
}

export interface CrossSummary {
  id: string;
  crossCode: string;
  pollinationMethod: string;
  status: string;
  operationalState: string;
  verificationState: string;
  maternalCode: string;
  paternalCode: string | null;
  createdAt: string;
}

type Client = pg.PoolClient;

async function createMaterial(
  client: Client,
  principal: Principal,
  kind: string,
  materialCode: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO biological_materials(workspace_id, kind, material_code, created_by)
     VALUES ($1, $2::material_kind, $3, $4) RETURNING id`,
    [principal.workspaceId, kind, materialCode, principal.userId],
  );
  return result.rows[0]!.id;
}

async function issueDeterministicLabel(
  client: Client,
  principal: Principal,
  materialId: string,
  materialCode: string,
): Promise<{ labelId: string; payloadHash: string }> {
  const label = await client.query<{ id: string; public_token: string }>(
    `INSERT INTO material_labels(workspace_id, material_id, label_code, label_type, issued_by)
     VALUES ($1, $2, $3, 'qr', $4)
     RETURNING id, public_token`,
    [principal.workspaceId, materialId, materialCode, principal.userId],
  );
  const payload = {
    schemaVersion: '2.0',
    locatorType: 'capsicum_material_label',
    publicToken: label.rows[0]!.public_token,
    path: `/scan/${label.rows[0]!.public_token}`,
  };
  const payloadHash = requestHash(payload);
  await client.query(
    `INSERT INTO label_generations(
       workspace_id, label_id, payload_version, payload, payload_sha256, generated_by
     ) VALUES ($1, $2, '2.0', $3::jsonb, $4, $5)`,
    [principal.workspaceId, label.rows[0]!.id, JSON.stringify(payload), payloadHash, principal.userId],
  );
  return { labelId: label.rows[0]!.id, payloadHash };
}

async function recordOrigin(
  client: Client,
  principal: Principal,
  input: {
    materialId: string;
    eventType: string;
    occurredAt: string;
    details?: unknown;
    parents?: Array<{ materialId: string; role: string; relationship: string }>;
  },
): Promise<string> {
  const origin = await client.query<{ id: string }>(
    `INSERT INTO material_origin_events(workspace_id, material_id, event_type, occurred_at, recorded_by, details)
     VALUES ($1, $2, $3::origin_event_type, $4, $5, $6::jsonb) RETURNING id`,
    [
      principal.workspaceId,
      input.materialId,
      input.eventType,
      input.occurredAt,
      principal.userId,
      JSON.stringify(input.details ?? {}),
    ],
  );
  for (const parent of input.parents ?? []) {
    await client.query(
      `INSERT INTO material_origin_parents(workspace_id, origin_event_id, parent_material_id, parent_role)
       VALUES ($1, $2, $3, $4)`,
      [principal.workspaceId, origin.rows[0]!.id, parent.materialId, parent.role],
    );
    await client.query(
      `INSERT INTO pedigree_edges(workspace_id, parent_material_id, child_material_id, relationship, origin_event_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [principal.workspaceId, parent.materialId, input.materialId, parent.relationship, origin.rows[0]!.id],
    );
  }
  return origin.rows[0]!.id;
}

export async function dashboardSummary(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'material.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const result = await client.query<{
      germplasm_count: number;
      seed_lot_count: number;
      plant_count: number;
      cross_count: number;
      active_cross_count: number;
      simulation_count: number;
      observation_count: number;
    }>(`SELECT
      count(*) FILTER (WHERE kind = 'germplasm_accession')::int AS germplasm_count,
      count(*) FILTER (WHERE kind = 'seed_lot')::int AS seed_lot_count,
      count(*) FILTER (WHERE kind = 'plant')::int AS plant_count,
      (SELECT count(*)::int FROM crosses WHERE workspace_id = app_current_workspace_id()) AS cross_count,
      (SELECT count(*)::int FROM crosses WHERE workspace_id = app_current_workspace_id() AND operational_state NOT IN ('failed','closed')) AS active_cross_count,
      (SELECT count(*)::int FROM simulation_runs WHERE workspace_id = app_current_workspace_id()) AS simulation_count,
      (SELECT count(*)::int FROM observations WHERE workspace_id = app_current_workspace_id()) AS observation_count
      FROM biological_materials WHERE workspace_id = app_current_workspace_id()`);
    return result.rows[0] ?? {
      germplasm_count: 0,
      seed_lot_count: 0,
      plant_count: 0,
      cross_count: 0,
      active_cross_count: 0,
      simulation_count: 0,
      observation_count: 0,
    };
  });
}

export async function listMaterials(
  pool: pg.Pool,
  principal: Principal,
  kind?: 'germplasm_accession' | 'seed_lot' | 'plant' | 'fruit' | 'seed_harvest' | 'progeny_family',
  limit = 100,
): Promise<MaterialSummary[]> {
  authorize(principal, 'material.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const result = await client.query<{
      id: string;
      material_code: string;
      kind: string;
      status: string;
      display_name: string | null;
      created_at: string;
      available_quantity: number | null;
      identity_type: string | null;
    }>(
      `SELECT material.id, material.material_code, material.kind::text, material.status::text,
              COALESCE(accession.display_name, derived.display_name, material.material_code) AS display_name,
              material.created_at::text,
              CASE WHEN material.kind = 'seed_lot' THEN seed_lot_summary.quantity_estimate ELSE NULL END AS available_quantity,
              derived.material_class::text AS identity_type
       FROM biological_materials material
       LEFT JOIN germplasm_accessions accession
         ON accession.workspace_id = material.workspace_id AND accession.material_id = material.id
       LEFT JOIN breeding_material_identities derived
         ON derived.workspace_id = material.workspace_id AND derived.material_id = material.id
       LEFT JOIN seed_lots seed_lot_summary
         ON seed_lot_summary.workspace_id = material.workspace_id AND seed_lot_summary.material_id = material.id
       WHERE material.workspace_id = app_current_workspace_id()
         AND ($1::text IS NULL OR material.kind::text = $1)
       ORDER BY material.created_at DESC, material.id DESC
       LIMIT $2`,
      [kind ?? null, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map((row) => ({
      id: row.id,
      materialCode: row.material_code,
      kind: row.kind,
      status: row.status,
      displayName: row.display_name,
      createdAt: row.created_at,
      availableQuantity: row.available_quantity,
      identityType: row.identity_type,
    }));
  });
}

export async function getMaterialDetail(pool: pg.Pool, principal: Principal, materialId: string) {
  authorize(principal, 'material.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const material = await client.query(
      `SELECT material.*, accession.display_name, accession.taxon, accession.provenance,
              seed_lot.accession_material_id, seed_lot.derived_material_id,
              seed_lot.source_seed_harvest_material_id, seed_lot.quantity_estimate,
              plant.source_seed_lot_material_id, current_location.location_id
       FROM biological_materials material
       LEFT JOIN germplasm_accessions accession ON accession.workspace_id = material.workspace_id AND accession.material_id = material.id
       LEFT JOIN seed_lots seed_lot ON seed_lot.workspace_id = material.workspace_id AND seed_lot.material_id = material.id
       LEFT JOIN plants plant ON plant.workspace_id = material.workspace_id AND plant.material_id = material.id
       LEFT JOIN material_current_locations current_location ON current_location.workspace_id = material.workspace_id AND current_location.material_id = material.id
       WHERE material.workspace_id = app_current_workspace_id() AND material.id = $1`,
      [materialId],
    );
    if (!material.rows[0]) return null;
    const genotypeCalls = await client.query(
      `SELECT call.id, call.locus_catalog_id, call.locus_id, call.allele_one, call.allele_two,
              allele_one.canonical_symbol AS allele_one_symbol,
              allele_two.canonical_symbol AS allele_two_symbol,
              call.evidence_state::text, call.call_basis::text, call.catalog_release_id,
              call.assay_id, call.marker_id, call.phase::text, call.ploidy,
              call.unresolved_notation, call.call_version, call.notes, call.recorded_at::text
       FROM genotype_calls call
       LEFT JOIN catalog_alleles allele_one ON allele_one.id = call.allele_one_id
       LEFT JOIN catalog_alleles allele_two ON allele_two.id = call.allele_two_id
       WHERE call.workspace_id = app_current_workspace_id() AND call.material_id = $1 AND call.is_current
       ORDER BY call.locus_catalog_id`,
      [materialId],
    );
    const inventory = await client.query(
      `SELECT id, event_type, quantity_delta, running_quantity, reason, reservation_id, occurred_at::text
       FROM inventory_events WHERE workspace_id = app_current_workspace_id() AND seed_lot_material_id = $1
       ORDER BY occurred_at DESC, created_at DESC LIMIT 100`,
      [materialId],
    );
    const reservations = await client.query(
      `SELECT id, quantity, remaining_quantity, purpose, state, reserved_at::text,
              expires_at::text, released_at::text, consumed_at::text, expired_at::text
       FROM inventory_reservations
       WHERE workspace_id = app_current_workspace_id() AND seed_lot_material_id = $1
       ORDER BY reserved_at DESC, id DESC LIMIT 100`,
      [materialId],
    );
    const exceptionRequests = await client.query(
      `SELECT request.id, request.quantity, request.reason, request.review_state::text,
              request.requested_by, requester.display_name AS requester_name,
              request.reviewed_by, reviewer.display_name AS reviewer_name,
              request.reviewed_at::text, request.review_rationale, request.created_at::text,
              EXISTS (
                SELECT 1 FROM plant_inventory_allocations allocation
                WHERE allocation.workspace_id = request.workspace_id
                  AND allocation.exception_request_id = request.id
              ) AS used
       FROM inventory_exception_requests request
       JOIN users requester ON requester.id = request.requested_by
       LEFT JOIN users reviewer ON reviewer.id = request.reviewed_by
       WHERE request.workspace_id = app_current_workspace_id() AND request.seed_lot_material_id = $1
       ORDER BY request.created_at DESC, request.id DESC LIMIT 100`,
      [materialId],
    );
    return {
      ...material.rows[0],
      genotypeCalls: genotypeCalls.rows,
      inventoryEvents: inventory.rows,
      inventoryReservations: reservations.rows,
      inventoryExceptionRequests: exceptionRequests.rows,
    };
  });
}

export async function listPlantingInventoryOptions(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'material.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const [reservations, exceptions] = await Promise.all([
      client.query<{
        id: string;
        seed_lot_material_id: string;
        material_code: string;
        remaining_quantity: number;
        purpose: string;
        expires_at: string | null;
      }>(
        `SELECT reservation.id, reservation.seed_lot_material_id, material.material_code,
                reservation.remaining_quantity, reservation.purpose, reservation.expires_at::text
         FROM inventory_reservations reservation
         JOIN biological_materials material
           ON material.workspace_id = reservation.workspace_id
          AND material.id = reservation.seed_lot_material_id
         WHERE reservation.workspace_id = app_current_workspace_id()
           AND reservation.state IN ('active','partially_consumed')
           AND (reservation.expires_at IS NULL OR reservation.expires_at > clock_timestamp())
         ORDER BY reservation.reserved_at, reservation.id
         LIMIT 250`,
      ),
      client.query<{
        id: string;
        seed_lot_material_id: string;
        material_code: string;
        quantity: number;
        reason: string;
      }>(
        `SELECT request.id, request.seed_lot_material_id, material.material_code,
                request.quantity, request.reason
         FROM inventory_exception_requests request
         JOIN biological_materials material
           ON material.workspace_id = request.workspace_id
          AND material.id = request.seed_lot_material_id
         WHERE request.workspace_id = app_current_workspace_id()
           AND request.review_state = 'approved'
           AND NOT EXISTS (
             SELECT 1 FROM plant_inventory_allocations allocation
             WHERE allocation.workspace_id = request.workspace_id
               AND allocation.exception_request_id = request.id
           )
         ORDER BY request.reviewed_at, request.id
         LIMIT 250`,
      ),
    ]);
    return { reservations: reservations.rows, approvedExceptions: exceptions.rows };
  });
}

export async function createGermplasm(
  pool: pg.Pool,
  principal: Principal,
  rawInput: GermplasmCreateInput,
): Promise<{ materialId: string; materialCode: string }> {
  authorize(principal, 'material.write');
  const input = germplasmCreateSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const materialId = await createMaterial(client, principal, 'germplasm_accession', input.materialCode);
    const provenance = {
      sourceType: input.sourceType,
      sourceName: input.sourceName ?? null,
      sourceIdentifier: input.sourceIdentifier ?? null,
      notes: input.notes ?? null,
    };
    await client.query(
      `INSERT INTO germplasm_accessions(material_id, workspace_id, taxon, display_name, provenance)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [materialId, principal.workspaceId, input.taxon, input.displayName, JSON.stringify(provenance)],
    );
    await recordOrigin(client, principal, {
      materialId,
      eventType: 'acquisition',
      occurredAt: input.acquiredAt,
      details: provenance,
    });
    await issueDeterministicLabel(client, principal, materialId, input.materialCode);
    await audit(client, principal, 'germplasm.created', 'biological_material', materialId, null, input);
    return { materialId, materialCode: input.materialCode };
  }, 'germplasm.create'));
}

export async function createSeedLot(
  pool: pg.Pool,
  principal: Principal,
  rawInput: SeedLotCreateInput,
): Promise<{ materialId: string; materialCode: string; quantity: number | null }> {
  authorize(principal, 'material.write');
  const input = seedLotCreateSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    if (input.accessionMaterialId) {
      const accession = await client.query(
        `SELECT 1 FROM germplasm_accessions WHERE workspace_id = app_current_workspace_id() AND material_id = $1`,
        [input.accessionMaterialId],
      );
      if (!accession.rows[0]) throw new ApplicationError('not_found', 'The selected accession does not exist in this workspace.');
    }
    if (input.derivedMaterialId) {
      const derived = await client.query(
        `SELECT 1 FROM breeding_material_identities WHERE workspace_id = app_current_workspace_id() AND material_id = $1`,
        [input.derivedMaterialId],
      );
      if (!derived.rows[0]) throw new ApplicationError('not_found', 'The selected derived breeding material does not exist in this workspace.');
    }
    if (input.sourceLotMaterialId) {
      const source = await client.query(
        `SELECT accession_material_id, derived_material_id FROM seed_lots
         WHERE workspace_id = app_current_workspace_id() AND material_id = $1`,
        [input.sourceLotMaterialId],
      );
      if (!source.rows[0]) throw new ApplicationError('not_found', 'The selected source seed lot does not exist in this workspace.');
      if (source.rows[0].accession_material_id !== (input.accessionMaterialId ?? null)
          || source.rows[0].derived_material_id !== (input.derivedMaterialId ?? null)) {
        throw new ApplicationError('conflict', 'A child seed lot must preserve the biological identity anchor of its source lot.');
      }
    }
    const materialId = await createMaterial(client, principal, 'seed_lot', input.materialCode);
    await client.query(
      `INSERT INTO seed_lots(
         material_id, workspace_id, accession_material_id, derived_material_id,
         source_lot_material_id, source_seed_harvest_material_id, quantity_estimate
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        materialId,
        principal.workspaceId,
        input.accessionMaterialId ?? null,
        input.derivedMaterialId ?? null,
        input.sourceLotMaterialId ?? null,
        input.sourceSeedHarvestMaterialId ?? null,
        input.quantityEstimate ?? null,
      ],
    );
    const parent = input.sourceLotMaterialId ?? input.derivedMaterialId ?? input.accessionMaterialId!;
    await recordOrigin(client, principal, {
      materialId,
      eventType: input.sourceSeedHarvestMaterialId ? 'seed_harvest' : 'acquisition',
      occurredAt: input.acquiredAt,
      details: { storageLocation: input.storageLocation ?? null },
      parents: [{ materialId: parent, role: 'source', relationship: 'source' }],
    });
    if (input.quantityEstimate !== undefined && input.quantityEstimate > 0) {
      await client.query(
        `INSERT INTO inventory_events(
           workspace_id, seed_lot_material_id, event_type, quantity_delta, running_quantity,
           reason, occurred_at, recorded_by, idempotency_key
         ) VALUES ($1, $2, 'received', $3, $3, 'Initial seed lot quantity', $4, $5, $6)`,
        [principal.workspaceId, materialId, input.quantityEstimate, input.acquiredAt, principal.userId, `${input.idempotencyKey}:inventory`],
      );
    }
    await issueDeterministicLabel(client, principal, materialId, input.materialCode);
    await audit(client, principal, 'seed_lot.created', 'biological_material', materialId, null, input);
    return { materialId, materialCode: input.materialCode, quantity: input.quantityEstimate ?? null };
  }, 'seed_lot.create'));
}

export async function recordInventoryEvent(
  pool: pg.Pool,
  principal: Principal,
  rawInput: InventoryEventInput,
): Promise<{ eventId: string; runningQuantity: number }> {
  authorize(principal, 'material.write');
  const input = inventoryEventSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const lot = await client.query<{ quantity_estimate: number | null }>(
      `SELECT quantity_estimate FROM seed_lots
       WHERE workspace_id = app_current_workspace_id() AND material_id = $1 FOR UPDATE`,
      [input.seedLotMaterialId],
    );
    if (!lot.rows[0]) throw new ApplicationError('not_found', 'Seed lot not found.');
    const currentQuantity = lot.rows[0].quantity_estimate;
    let runningQuantity: number;
    if (input.eventType === 'counted' || input.eventType === 'reconciliation') {
      if (input.resultingQuantity === undefined) throw new ApplicationError('validation_failed', 'Counted and reconciliation events require the resulting physical quantity.');
      runningQuantity = input.resultingQuantity;
    } else if (currentQuantity === null) {
      if (input.eventType !== 'received') {
        throw new ApplicationError('conflict', 'Physical quantity is unknown. Establish it with a received, counted, or reconciliation event before applying a delta.');
      }
      runningQuantity = input.quantityDelta;
    } else {
      runningQuantity = currentQuantity + input.quantityDelta;
    }
    if (runningQuantity < 0) throw new ApplicationError('conflict', 'The inventory event would make seed inventory negative.');
    const effectiveDelta = currentQuantity === null ? runningQuantity : runningQuantity - currentQuantity;
    const event = await client.query<{ id: string }>(
      `INSERT INTO inventory_events(
         workspace_id, seed_lot_material_id, event_type, quantity_delta, running_quantity,
         reason, occurred_at, recorded_by, idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [principal.workspaceId, input.seedLotMaterialId, input.eventType, effectiveDelta, runningQuantity, input.reason, input.occurredAt, principal.userId, input.idempotencyKey],
    );
    await client.query(
      `UPDATE seed_lots SET quantity_estimate = $3 WHERE workspace_id = $1 AND material_id = $2`,
      [principal.workspaceId, input.seedLotMaterialId, runningQuantity],
    );
    await audit(client, principal, 'seed_lot.inventory_recorded', 'seed_lot', input.seedLotMaterialId, lot.rows[0], { runningQuantity, event: input });
    return { eventId: event.rows[0]!.id, runningQuantity };
  }, 'inventory.record'));
}


export async function transferSeedInventory(
  pool: pg.Pool,
  principal: Principal,
  rawInput: InventoryTransferInput,
): Promise<{ sourceRunningQuantity: number; destinationRunningQuantity: number }> {
  authorize(principal, 'material.write');
  const input = inventoryTransferSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const orderedIds = [input.sourceSeedLotMaterialId, input.destinationSeedLotMaterialId].sort();
    const lots = await client.query<{
      material_id: string;
      quantity_estimate: number | null;
      accession_material_id: string | null;
      derived_material_id: string | null;
    }>(
      `SELECT material_id, quantity_estimate, accession_material_id, derived_material_id
       FROM seed_lots
       WHERE workspace_id = app_current_workspace_id() AND material_id = ANY($1::uuid[])
       ORDER BY material_id
       FOR UPDATE`,
      [orderedIds],
    );
    if (lots.rowCount !== 2) throw new ApplicationError('not_found', 'Both seed lots must exist in this workspace.');
    const byId = new Map(lots.rows.map((row) => [row.material_id, row]));
    const source = byId.get(input.sourceSeedLotMaterialId)!;
    const destination = byId.get(input.destinationSeedLotMaterialId)!;
    if (source.accession_material_id !== destination.accession_material_id
        || source.derived_material_id !== destination.derived_material_id) {
      throw new ApplicationError('conflict', 'Inventory may move only between seed lots with the same biological identity anchor.');
    }
    if (source.quantity_estimate === null || destination.quantity_estimate === null) {
      throw new ApplicationError('conflict', 'Both seed-lot quantities must be reconciled before a physical transfer.');
    }
    await expireInventoryReservations(client, principal, input.sourceSeedLotMaterialId);
    const held = await client.query<{ held: number }>(
      `SELECT COALESCE(sum(remaining_quantity),0)::int AS held
       FROM inventory_reservations
       WHERE workspace_id = app_current_workspace_id()
         AND seed_lot_material_id = $1
         AND state IN ('active','partially_consumed')`,
      [input.sourceSeedLotMaterialId],
    );
    if (source.quantity_estimate - Number(held.rows[0]?.held ?? 0) < input.quantity) {
      throw new ApplicationError('conflict', 'Unreserved source inventory is insufficient for this transfer.');
    }
    const sourceRunningQuantity = source.quantity_estimate - input.quantity;
    const destinationRunningQuantity = destination.quantity_estimate + input.quantity;
    await client.query(
      `UPDATE seed_lots
       SET quantity_estimate = CASE material_id WHEN $2 THEN $4 WHEN $3 THEN $5 END
       WHERE workspace_id = $1 AND material_id IN ($2,$3)`,
      [principal.workspaceId, input.sourceSeedLotMaterialId, input.destinationSeedLotMaterialId, sourceRunningQuantity, destinationRunningQuantity],
    );
    await client.query(
      `INSERT INTO inventory_events(
         workspace_id, seed_lot_material_id, event_type, quantity_delta, running_quantity,
         reason, occurred_at, recorded_by, idempotency_key
       ) VALUES
         ($1,$2,'transferred',$4,$6,$8,$9,$10,$11),
         ($1,$3,'transferred',$5,$7,$8,$9,$10,$12)`,
      [
        principal.workspaceId,
        input.sourceSeedLotMaterialId,
        input.destinationSeedLotMaterialId,
        -input.quantity,
        input.quantity,
        sourceRunningQuantity,
        destinationRunningQuantity,
        input.reason,
        input.occurredAt,
        principal.userId,
        `${input.idempotencyKey}:source`,
        `${input.idempotencyKey}:destination`,
      ],
    );
    await audit(client, principal, 'seed_lot.inventory_transferred', 'seed_lot', input.sourceSeedLotMaterialId, source, {
      destinationSeedLotMaterialId: input.destinationSeedLotMaterialId,
      quantity: input.quantity,
      sourceRunningQuantity,
      destinationRunningQuantity,
    });
    return { sourceRunningQuantity, destinationRunningQuantity };
  }, 'inventory.transfer'));
}

async function expireInventoryReservations(
  client: Client,
  principal: Principal,
  seedLotMaterialId: string,
): Promise<number> {
  const expired = await client.query<{ id: string }>(
    `WITH expired AS (
       UPDATE inventory_reservations
       SET state = 'expired', expired_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE workspace_id = app_current_workspace_id()
         AND seed_lot_material_id = $1
         AND state IN ('active','partially_consumed')
         AND expires_at IS NOT NULL
         AND expires_at <= clock_timestamp()
       RETURNING id, seed_lot_material_id
     )
     INSERT INTO inventory_events(
       workspace_id, seed_lot_material_id, event_type, quantity_delta, running_quantity,
       reason, occurred_at, recorded_by, reservation_id, idempotency_key
     )
     SELECT $2, expired.seed_lot_material_id, 'reservation_expired', 0, lot.quantity_estimate,
            'Inventory reservation expired', clock_timestamp(), $3, expired.id,
            'reservation-expired:' || expired.id::text
     FROM expired
     JOIN seed_lots lot
       ON lot.workspace_id = $2 AND lot.material_id = expired.seed_lot_material_id
     ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [seedLotMaterialId, principal.workspaceId, principal.userId],
  );
  return expired.rowCount ?? 0;
}

export async function createInventoryReservation(
  pool: pg.Pool,
  principal: Principal,
  rawInput: InventoryReservationCreateInput,
): Promise<{ reservationId: string; remainingQuantity: number; unreservedQuantity: number }> {
  authorize(principal, 'material.write');
  const input = inventoryReservationCreateSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId, requestId: input.idempotencyKey }, (client) =>
    executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
      await expireInventoryReservations(client, principal, input.seedLotMaterialId);
      const lot = await client.query<{ quantity_estimate: number | null }>(
        `SELECT quantity_estimate FROM seed_lots WHERE workspace_id = app_current_workspace_id() AND material_id = $1 FOR UPDATE`,
        [input.seedLotMaterialId],
      );
      if (!lot.rows[0]) throw new ApplicationError('not_found', 'Seed lot not found.');
      if (lot.rows[0].quantity_estimate === null) throw new ApplicationError('conflict', 'Unknown physical quantity cannot be reserved. Reconcile the lot first.');
      const held = await client.query<{ held: number }>(
        `SELECT COALESCE(sum(remaining_quantity),0)::int AS held FROM inventory_reservations
         WHERE workspace_id = app_current_workspace_id() AND seed_lot_material_id = $1 AND state IN ('active','partially_consumed')`,
        [input.seedLotMaterialId],
      );
      const unreservedQuantity = lot.rows[0].quantity_estimate - Number(held.rows[0]?.held ?? 0);
      if (unreservedQuantity < input.quantity) throw new ApplicationError('conflict', 'The seed lot does not have enough unreserved physical inventory.');
      if (input.expiresAt && new Date(input.expiresAt).valueOf() <= Date.now()) throw new ApplicationError('validation_failed', 'Reservation expiry must be in the future.');
      const result = await client.query<{ id: string }>(
        `INSERT INTO inventory_reservations(
           workspace_id, seed_lot_material_id, quantity, remaining_quantity, purpose, state, reserved_by, expires_at, idempotency_key
         ) VALUES ($1,$2,$3,$3,$4,'active',$5,$6,$7) RETURNING id`,
        [principal.workspaceId, input.seedLotMaterialId, input.quantity, input.purpose, principal.userId, input.expiresAt ?? null, input.idempotencyKey],
      );
      const reservationId = result.rows[0]?.id;
      if (!reservationId) throw new ApplicationError('internal_error', 'Inventory reservation was not created.');
      await client.query(
        `INSERT INTO inventory_events(workspace_id,seed_lot_material_id,event_type,quantity_delta,running_quantity,reason,occurred_at,recorded_by,idempotency_key)
         VALUES ($1,$2,'reservation',0,$3,$4,clock_timestamp(),$5,$6)`,
        [principal.workspaceId, input.seedLotMaterialId, lot.rows[0].quantity_estimate, input.purpose, principal.userId, `${input.idempotencyKey}:event`],
      );
      await audit(client, principal, 'seed_lot.inventory_reserved', 'inventory_reservation', reservationId, null, input);
      return { reservationId, remainingQuantity: input.quantity, unreservedQuantity: unreservedQuantity - input.quantity };
    }, 'inventory.reservation.create'));
}

export async function releaseInventoryReservation(
  pool: pg.Pool,
  principal: Principal,
  rawInput: InventoryReservationReleaseInput,
): Promise<{ reservationId: string; state: 'released' }> {
  authorize(principal, 'material.write');
  const input = inventoryReservationReleaseSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId, requestId: input.idempotencyKey }, (client) =>
    executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
      const reservation = await client.query<{ seed_lot_material_id: string; state: string; remaining_quantity: number; quantity_estimate: number | null }>(
        `SELECT reservation.seed_lot_material_id, reservation.state, reservation.remaining_quantity, lot.quantity_estimate
         FROM inventory_reservations reservation
         JOIN seed_lots lot ON lot.workspace_id = reservation.workspace_id AND lot.material_id = reservation.seed_lot_material_id
         WHERE reservation.workspace_id = app_current_workspace_id() AND reservation.id = $1 FOR UPDATE OF reservation, lot`,
        [input.reservationId],
      );
      const current = reservation.rows[0];
      if (!current) throw new ApplicationError('not_found', 'Inventory reservation was not found.');
      if (current.state === 'released') return { reservationId: input.reservationId, state: 'released' as const };
      if (!['active', 'partially_consumed'].includes(current.state)) throw new ApplicationError('conflict', `A ${current.state} reservation cannot be released.`);
      await client.query(
        `UPDATE inventory_reservations SET state='released', released_at=clock_timestamp(), updated_at=clock_timestamp()
         WHERE workspace_id=app_current_workspace_id() AND id=$1`,
        [input.reservationId],
      );
      await client.query(
        `INSERT INTO inventory_events(workspace_id,seed_lot_material_id,event_type,quantity_delta,running_quantity,reason,occurred_at,recorded_by,reservation_id,idempotency_key)
         VALUES ($1,$2,'reservation_release',0,$3,$4,clock_timestamp(),$5,$6,$7)`,
        [principal.workspaceId, current.seed_lot_material_id, current.quantity_estimate, input.reason, principal.userId, input.reservationId, `${input.idempotencyKey}:event`],
      );
      await audit(client, principal, 'seed_lot.inventory_reservation_released', 'inventory_reservation', input.reservationId, current, { reason: input.reason });
      return { reservationId: input.reservationId, state: 'released' as const };
    }, 'inventory.reservation.release'));
}

export async function requestInventoryException(
  pool: pg.Pool,
  principal: Principal,
  rawInput: InventoryExceptionRequestInput,
): Promise<{ requestId: string; reviewState: 'in_review' }> {
  authorize(principal, 'material.write');
  const input = inventoryExceptionRequestSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId, requestId: input.idempotencyKey }, (client) =>
    executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
      const lot = await client.query(`SELECT 1 FROM seed_lots WHERE workspace_id=app_current_workspace_id() AND material_id=$1`, [input.seedLotMaterialId]);
      if (!lot.rows[0]) throw new ApplicationError('not_found', 'Seed lot not found.');
      const result = await client.query<{ id: string }>(
        `INSERT INTO inventory_exception_requests(workspace_id,seed_lot_material_id,quantity,reason,requested_by,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [principal.workspaceId, input.seedLotMaterialId, input.quantity, input.reason, principal.userId, input.idempotencyKey],
      );
      const requestId = result.rows[0]?.id;
      if (!requestId) throw new ApplicationError('internal_error', 'Inventory exception request was not created.');
      await audit(client, principal, 'seed_lot.inventory_exception_requested', 'inventory_exception_request', requestId, null, input);
      return { requestId, reviewState: 'in_review' as const };
    }, 'inventory.exception.request'));
}

export async function reviewInventoryException(
  pool: pg.Pool,
  principal: Principal,
  rawInput: InventoryExceptionReviewInput,
): Promise<{ requestId: string; decision: 'approved' | 'changes_requested' | 'rejected' }> {
  authorize(principal, 'workspace.manage');
  const input = inventoryExceptionReviewSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId, requestId: input.idempotencyKey }, (client) =>
    executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
      const result = await client.query<{ requested_by: string; review_state: string }>(
        `SELECT requested_by::text, review_state::text FROM inventory_exception_requests
         WHERE workspace_id=app_current_workspace_id() AND id=$1 FOR UPDATE`, [input.requestId],
      );
      const request = result.rows[0];
      if (!request) throw new ApplicationError('not_found', 'Inventory exception request was not found.');
      if (request.requested_by === principal.userId) throw new ApplicationError('permission_denied', 'Inventory exception requests require an independent reviewer.');
      if (request.review_state === input.decision) return { requestId: input.requestId, decision: input.decision };
      if (request.review_state !== 'in_review') throw new ApplicationError('conflict', 'The inventory exception already has a final review decision.');
      await client.query(
        `INSERT INTO inventory_exception_reviews(workspace_id,request_id,author_user_id,reviewer_user_id,decision,rationale)
         VALUES ($1,$2,$3,$4,$5::review_state,$6)`,
        [principal.workspaceId, input.requestId, request.requested_by, principal.userId, input.decision, input.rationale],
      );
      await client.query(
        `UPDATE inventory_exception_requests SET review_state=$2::review_state,reviewed_by=$3,reviewed_at=clock_timestamp(),review_rationale=$4
         WHERE workspace_id=app_current_workspace_id() AND id=$1`,
        [input.requestId, input.decision, principal.userId, input.rationale],
      );
      await audit(client, principal, 'seed_lot.inventory_exception_reviewed', 'inventory_exception_request', input.requestId, request, { decision: input.decision });
      return { requestId: input.requestId, decision: input.decision };
    }, 'inventory.exception.review'));
}

export async function createPlant(
  pool: pg.Pool,
  principal: Principal,
  rawInput: PlantCreateInput,
): Promise<{ materialId: string; materialCode: string; runningQuantity: number | null }> {
  authorize(principal, 'material.write');
  const input = plantCreateSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const seedLot = await client.query<{
      quantity_estimate: number | null;
      derived_material_id: string | null;
    }>(
      `SELECT quantity_estimate, derived_material_id FROM seed_lots
       WHERE workspace_id = app_current_workspace_id() AND material_id = $1 FOR UPDATE`,
      [input.sourceSeedLotMaterialId],
    );
    if (!seedLot.rows[0]) throw new ApplicationError('not_found', 'Source seed lot not found.');

    await expireInventoryReservations(client, principal, input.sourceSeedLotMaterialId);
    let runningQuantity: number | null = seedLot.rows[0].quantity_estimate;
    let inventoryEventId: string | null = null;
    let reservationId: string | null = null;
    let allocationMode: 'consumed' | 'reserved' | 'documented_exception' | 'uncertain_quantity';

    if (input.inventoryMode === 'consume') {
      if (runningQuantity === null) {
        throw new ApplicationError('conflict', 'The seed lot quantity is unknown. Use the explicit uncertain-quantity workflow.');
      }
      if (runningQuantity < input.seedQuantity) {
        throw new ApplicationError('conflict', 'The seed lot does not contain enough available seed for this planting.');
      }
      if (input.reservationId) {
        const reservation = await client.query<{ remaining_quantity: number; state: string }>(
          `SELECT remaining_quantity, state FROM inventory_reservations
           WHERE workspace_id = app_current_workspace_id() AND id = $1 AND seed_lot_material_id = $2 FOR UPDATE`,
          [input.reservationId, input.sourceSeedLotMaterialId],
        );
        if (!reservation.rows[0] || !['active','partially_consumed'].includes(reservation.rows[0].state) || reservation.rows[0].remaining_quantity < input.seedQuantity) {
          throw new ApplicationError('conflict', 'The selected inventory reservation is unavailable or insufficient.');
        }
        const reservationRemaining = reservation.rows[0].remaining_quantity - input.seedQuantity;
        await client.query(
          `UPDATE inventory_reservations
           SET remaining_quantity=$3,
               state=CASE WHEN $3=0 THEN 'consumed' ELSE 'partially_consumed' END,
               consumed_at=CASE WHEN $3=0 THEN clock_timestamp() ELSE NULL END,
               updated_at=clock_timestamp()
           WHERE workspace_id = $1 AND id = $2`,
          [principal.workspaceId, input.reservationId, reservationRemaining],
        );
        reservationId = input.reservationId;
        allocationMode = 'reserved';
      } else {
        const reserved = await client.query<{ held: number }>(
          `SELECT COALESCE(sum(remaining_quantity),0)::int AS held FROM inventory_reservations
           WHERE workspace_id=app_current_workspace_id() AND seed_lot_material_id=$1 AND state IN ('active','partially_consumed')`,
          [input.sourceSeedLotMaterialId],
        );
        if (runningQuantity - Number(reserved.rows[0]?.held ?? 0) < input.seedQuantity) {
          throw new ApplicationError('conflict', 'Available unreserved inventory is insufficient. Use the matching reservation or release it first.');
        }
        allocationMode = 'consumed';
      }
      runningQuantity -= input.seedQuantity;
      const inventory = await client.query<{ id: string }>(
        `INSERT INTO inventory_events(
           workspace_id, seed_lot_material_id, event_type, quantity_delta, running_quantity,
           reason, occurred_at, recorded_by, idempotency_key
         ) VALUES ($1,$2,'planting',$3,$4,$5,$6,$7,$8) RETURNING id`,
        [principal.workspaceId, input.sourceSeedLotMaterialId, -input.seedQuantity, runningQuantity, `Seed consumed for plant ${input.materialCode}`, input.germinatedAt, principal.userId, `${input.idempotencyKey}:inventory`],
      );
      inventoryEventId = inventory.rows[0]!.id;
      await client.query(
        `UPDATE seed_lots SET quantity_estimate = $3 WHERE workspace_id = $1 AND material_id = $2`,
        [principal.workspaceId, input.sourceSeedLotMaterialId, runningQuantity],
      );
    } else {
      allocationMode = input.inventoryMode === 'approved_exception' ? 'documented_exception' : 'uncertain_quantity';
      if (input.inventoryMode === 'approved_exception') {
        const exception = await client.query<{ quantity: number; reason: string }>(
          `SELECT quantity, reason FROM inventory_exception_requests
           WHERE workspace_id=app_current_workspace_id() AND id=$1 AND seed_lot_material_id=$2 AND review_state='approved'
           FOR UPDATE`,
          [input.inventoryExceptionRequestId, input.sourceSeedLotMaterialId],
        );
        if (!exception.rows[0] || exception.rows[0].quantity !== input.seedQuantity) {
          throw new ApplicationError('scientific_authority_required', 'The selected independently approved inventory exception does not match this seed lot and quantity.');
        }
      }
    }

    const materialId = await createMaterial(client, principal, 'plant', input.materialCode);
    await client.query(
      `INSERT INTO plants(material_id, workspace_id, source_seed_lot_material_id) VALUES ($1, $2, $3)`,
      [materialId, principal.workspaceId, input.sourceSeedLotMaterialId],
    );
    await client.query(
      `INSERT INTO plant_inventory_allocations(
         workspace_id, plant_material_id, seed_lot_material_id, inventory_event_id,
         reservation_id, allocation_mode, quantity, exception_reason, recorded_by,
         exception_request_id, exception_authority
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        principal.workspaceId,
        materialId,
        input.sourceSeedLotMaterialId,
        inventoryEventId,
        reservationId,
        allocationMode,
        input.inventoryMode === 'consume' || input.inventoryMode === 'approved_exception' ? input.seedQuantity : null,
        input.inventoryExceptionReason ?? null,
        principal.userId,
        input.inventoryExceptionRequestId ?? null,
        input.inventoryMode === 'approved_exception' ? 'independently_approved' : input.inventoryMode === 'uncertain_quantity' ? 'explicit_uncertainty' : 'none',
      ],
    );
    await recordOrigin(client, principal, {
      materialId,
      eventType: 'germination',
      occurredAt: input.germinatedAt,
      details: {
        locationName: input.locationName ?? null,
        inventoryMode: input.inventoryMode,
        seedQuantity: input.inventoryMode === 'consume' ? input.seedQuantity : null,
      },
      parents: [{ materialId: input.sourceSeedLotMaterialId, role: 'source_seed_lot', relationship: 'germinated_from' }],
    });
    if (seedLot.rows[0].derived_material_id) {
      const family = await client.query(
        `SELECT 1 FROM progeny_families WHERE workspace_id = app_current_workspace_id() AND material_id = $1`,
        [seedLot.rows[0].derived_material_id],
      );
      if (family.rows[0]) {
        await client.query(
          `INSERT INTO family_members(workspace_id, family_material_id, plant_material_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [principal.workspaceId, seedLot.rows[0].derived_material_id, materialId],
        );
      }
    }
    let locationId = input.locationId ?? null;
    if (!locationId && input.locationName) {
      const location = await client.query<{ id: string }>(
        `INSERT INTO material_locations(workspace_id, name, location_type, created_by)
         VALUES ($1, $2, 'other', $3)
         ON CONFLICT (workspace_id, name) DO UPDATE SET active = true
         RETURNING id`,
        [principal.workspaceId, input.locationName, principal.userId],
      );
      locationId = location.rows[0]!.id;
    }
    if (locationId) {
      const location = await client.query(`SELECT 1 FROM material_locations WHERE workspace_id = app_current_workspace_id() AND id = $1 AND active`, [locationId]);
      if (!location.rows[0]) throw new ApplicationError('not_found', 'The selected material location is unavailable.');
      const movement = await client.query<{ id: string }>(
        `INSERT INTO material_movements(workspace_id, material_id, from_location_id, to_location_id, moved_at, reason, moved_by, idempotency_key)
         VALUES ($1,$2,NULL,$3,$4,'Initial plant placement',$5,$6) RETURNING id`,
        [principal.workspaceId, materialId, locationId, input.germinatedAt, principal.userId, `${input.idempotencyKey}:movement`],
      );
      await client.query(
        `INSERT INTO material_current_locations(workspace_id, material_id, location_id, movement_id, updated_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [principal.workspaceId, materialId, locationId, movement.rows[0]!.id, input.germinatedAt],
      );
    }
    await issueDeterministicLabel(client, principal, materialId, input.materialCode);
    await audit(client, principal, 'plant.created', 'biological_material', materialId, null, {
      ...input,
      inventoryEventId,
      runningQuantity,
    });
    return { materialId, materialCode: input.materialCode, runningQuantity };
  }, 'plant.create'));
}

export async function recordGenotypeCall(
  pool: pg.Pool,
  principal: Principal,
  rawInput: GenotypeCallInput,
): Promise<{ callId: string; callVersion: number }> {
  authorize(principal, 'material.write');
  const input = genotypeCallSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const material = await client.query(`SELECT 1 FROM biological_materials WHERE workspace_id = app_current_workspace_id() AND id = $1`, [input.materialId]);
    if (!material.rows[0]) throw new ApplicationError('not_found', 'Material not found.');
    const current = await client.query<{ id: string; call_version: number }>(
      `SELECT id, call_version FROM genotype_calls
       WHERE workspace_id = app_current_workspace_id() AND material_id = $1 AND locus_catalog_id = $2 AND is_current
       FOR UPDATE`,
      [input.materialId, input.locusCatalogId],
    );
    const currentId = current.rows[0]?.id ?? null;
    if (currentId && input.expectedCurrentCallId !== currentId) {
      throw new ApplicationError('stale_version', 'The genotype call changed before this correction was saved. Reload and review the current call.');
    }
    if (!currentId && input.expectedCurrentCallId) {
      throw new ApplicationError('stale_version', 'The expected genotype call no longer exists as the current version.');
    }

    let locusId: string | null = null;
    let alleleOneText = input.alleleOne ?? input.unresolvedHistoricalNotation ?? 'unresolved';
    let alleleTwoText = input.alleleTwo ?? input.unresolvedHistoricalNotation ?? 'unresolved';
    if (input.catalogReleaseId && input.alleleOneId && input.alleleTwoId) {
      const normalized = await client.query<{
        locus_id: string;
        locus_key: string;
        allele_one_symbol: string;
        allele_two_symbol: string;
      }>(
        `SELECT locus.id AS locus_id, locus.locus_key,
                allele_one.canonical_symbol AS allele_one_symbol,
                allele_two.canonical_symbol AS allele_two_symbol
         FROM catalog_releases release
         JOIN catalog_release_loci release_locus ON release_locus.release_id = release.id
         JOIN loci locus ON locus.id = release_locus.locus_id
         JOIN catalog_release_alleles release_allele_one ON release_allele_one.release_id = release.id AND release_allele_one.allele_id = $2
         JOIN catalog_alleles allele_one ON allele_one.id = release_allele_one.allele_id AND allele_one.locus_id = locus.id
         JOIN catalog_release_alleles release_allele_two ON release_allele_two.release_id = release.id AND release_allele_two.allele_id = $3
         JOIN catalog_alleles allele_two ON allele_two.id = release_allele_two.allele_id AND allele_two.locus_id = locus.id
         WHERE release.id = $1 AND release.state = 'approved' AND locus.locus_key = $4`,
        [input.catalogReleaseId, input.alleleOneId, input.alleleTwoId, input.locusCatalogId],
      );
      if (!normalized.rows[0]) {
        throw new ApplicationError('scientific_authority_required', 'The selected locus and alleles are not approved members of the chosen catalog release.');
      }
      locusId = normalized.rows[0].locus_id;
      alleleOneText = normalized.rows[0].allele_one_symbol;
      alleleTwoText = normalized.rows[0].allele_two_symbol;
    }

    const callVersion = (current.rows[0]?.call_version ?? 0) + 1;
    const call = await client.query<{ id: string }>(
      `INSERT INTO genotype_calls(
         workspace_id, material_id, locus_catalog_id, allele_one, allele_two, evidence_state,
         assay_method, assay_identifier, source_document_id, notes, recorded_by,
         supersedes_call_id, is_current, idempotency_key, locus_id, allele_one_id,
         allele_two_id, catalog_release_id, marker_id, assay_id, call_basis, ploidy,
         phase, haplotype_payload, unresolved_notation, call_version
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25
       ) RETURNING id`,
      [
        principal.workspaceId,
        input.materialId,
        input.locusCatalogId,
        alleleOneText,
        alleleTwoText,
        input.evidenceState,
        input.assayMethod ?? null,
        input.assayIdentifier ?? null,
        input.sourceDocumentId ?? null,
        input.notes ?? null,
        principal.userId,
        currentId,
        input.idempotencyKey,
        locusId,
        input.alleleOneId ?? null,
        input.alleleTwoId ?? null,
        input.catalogReleaseId ?? null,
        input.markerId ?? null,
        input.assayId ?? null,
        input.evidenceBasis,
        input.ploidy,
        input.phaseState,
        input.haplotypePayload ? JSON.stringify(input.haplotypePayload) : null,
        input.unresolvedHistoricalNotation ? JSON.stringify({ notation: input.unresolvedHistoricalNotation }) : null,
        callVersion,
      ],
    );
    await audit(client, principal, 'genotype_call.recorded', 'genotype_call', call.rows[0]!.id, current.rows[0] ?? null, {
      callVersion,
      catalogReleaseId: input.catalogReleaseId ?? null,
      evidenceState: input.evidenceState,
      evidenceBasis: input.evidenceBasis,
    });
    return { callId: call.rows[0]!.id, callVersion };
  }, 'genotype_call.record'));
}

export async function listCrosses(pool: pg.Pool, principal: Principal): Promise<CrossSummary[]> {
  authorize(principal, 'cross.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const result = await client.query<{
      id: string;
      cross_code: string;
      pollination_method: string;
      operational_state: string;
      verification_state: string;
      maternal_code: string;
      paternal_code: string | null;
      created_at: string;
    }>(
      `SELECT cross_record.id, cross_record.cross_code, cross_record.pollination_method::text,
              cross_record.operational_state::text, cross_record.verification_state::text,
              maternal.material_code AS maternal_code, paternal.material_code AS paternal_code,
              cross_record.created_at::text
       FROM crosses cross_record
       JOIN biological_materials maternal ON maternal.workspace_id = cross_record.workspace_id AND maternal.id = cross_record.maternal_plant_id
       LEFT JOIN biological_materials paternal ON paternal.workspace_id = cross_record.workspace_id AND paternal.id = cross_record.paternal_plant_id
       WHERE cross_record.workspace_id = app_current_workspace_id()
       ORDER BY cross_record.created_at DESC, cross_record.id DESC LIMIT 100`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      crossCode: row.cross_code,
      pollinationMethod: row.pollination_method,
      status: row.operational_state,
      operationalState: row.operational_state,
      verificationState: row.verification_state,
      maternalCode: row.maternal_code,
      paternalCode: row.paternal_code,
      createdAt: row.created_at,
    }));
  });
}

export async function getCrossDetail(pool: pg.Pool, principal: Principal, crossId: string) {
  authorize(principal, 'cross.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const cross = await client.query(
      `SELECT cross_record.*, maternal.material_code AS maternal_code, paternal.material_code AS paternal_code
       FROM crosses cross_record
       JOIN biological_materials maternal ON maternal.workspace_id = cross_record.workspace_id AND maternal.id = cross_record.maternal_plant_id
       LEFT JOIN biological_materials paternal ON paternal.workspace_id = cross_record.workspace_id AND paternal.id = cross_record.paternal_plant_id
       WHERE cross_record.workspace_id = app_current_workspace_id() AND cross_record.id = $1`,
      [crossId],
    );
    if (!cross.rows[0]) return null;
    const events = await client.query(
      `SELECT id, event_type, occurred_at::text, notes, recorded_at::text
       FROM cross_events WHERE workspace_id = app_current_workspace_id() AND cross_id = $1
       ORDER BY occurred_at, recorded_at, id`,
      [crossId],
    );
    const verifications = await client.query(
      `SELECT verification.id, verification.verification_state::text, verification.method::text,
              verification.source_type, verification.evidence_references, verification.confidence,
              verification.statement, verification.recorded_at::text, verification.recorded_by,
              review.decision::text AS review_decision, review.rationale, review.reviewed_at::text
       FROM cross_verifications verification
       LEFT JOIN cross_verification_reviews review
         ON review.workspace_id = verification.workspace_id AND review.verification_id = verification.id
       WHERE verification.workspace_id = app_current_workspace_id() AND verification.cross_id = $1
       ORDER BY verification.recorded_at, verification.id`,
      [crossId],
    );
    return { ...cross.rows[0], events: events.rows, verifications: verifications.rows };
  });
}

export async function createCross(
  pool: pg.Pool,
  principal: Principal,
  rawInput: CrossCreateInput,
): Promise<{ crossId: string; crossCode: string }> {
  authorize(principal, 'cross.write');
  const input = crossCreateSchema.parse(rawInput);
  validateDirectedCross({
    id: input.crossCode,
    workspaceId: principal.workspaceId,
    pollinationMethod: input.pollinationMethod,
    maternalPlantId: input.maternalPlantId,
    paternalPlantId: input.paternalPlantId ?? null,
  });
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const plantIds = [input.maternalPlantId, ...(input.paternalPlantId ? [input.paternalPlantId] : [])];
    const plants = await client.query<{ material_id: string }>(
      `SELECT material_id FROM plants WHERE workspace_id = app_current_workspace_id() AND material_id = ANY($1::uuid[])`,
      [plantIds],
    );
    if (plants.rows.length !== new Set(plantIds).size) {
      throw new ApplicationError('not_found', 'One or more parent plants do not exist in this workspace.');
    }
    const cross = await client.query<{ id: string }>(
      `INSERT INTO crosses(
         workspace_id, cross_code, maternal_plant_id, paternal_plant_id,
         pollination_method, operational_state, verification_state, created_by
       ) VALUES ($1,$2,$3,$4,$5,'planned','unknown',$6) RETURNING id`,
      [principal.workspaceId, input.crossCode, input.maternalPlantId, input.paternalPlantId ?? null, input.pollinationMethod, principal.userId],
    );
    const crossId = cross.rows[0]!.id;
    await client.query(`SELECT * FROM app_record_cross_event($1,'planned',$2,NULL,$3)`, [crossId, input.plannedAt, `${input.idempotencyKey}:planned`]);
    await audit(client, principal, 'cross.created', 'cross', crossId, null, {
      crossCode: input.crossCode,
      maternalPlantId: input.maternalPlantId,
      paternalPlantId: input.paternalPlantId ?? null,
      pollinationMethod: input.pollinationMethod,
      verificationState: 'unknown',
    });
    return { crossId, crossCode: input.crossCode };
  }, 'cross.create'));
}

export async function recordCrossEvent(
  pool: pg.Pool,
  principal: Principal,
  rawInput: CrossEventInput,
): Promise<{ eventId: string; status: string; operationalState: string }> {
  authorize(principal, 'cross.write');
  const input = crossEventSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const event = await client.query<{ event_id: string; operational_state: string }>(
      `SELECT event_id, operational_state::text FROM app_record_cross_event($1,$2,$3,$4,$5)`,
      [input.crossId, input.eventType, input.occurredAt, input.notes ?? null, input.idempotencyKey],
    );
    const row = event.rows[0];
    if (!row) throw new ApplicationError('internal_error', 'The cross event could not be recorded.', { retryable: true });
    await audit(client, principal, `cross.${input.eventType}`, 'cross', input.crossId, null, {
      operationalState: row.operational_state,
      eventId: row.event_id,
    });
    return { eventId: row.event_id, status: row.operational_state, operationalState: row.operational_state };
  }, 'cross.event.record'));
}

export async function recordCrossVerification(
  pool: pg.Pool,
  principal: Principal,
  rawInput: CrossVerificationRecordInput,
): Promise<{ verificationId: string; reviewState: 'draft' }> {
  authorize(principal, 'cross.write');
  const input = crossVerificationRecordSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const verification = await client.query<{ id: string }>(
      `SELECT app_record_cross_verification($1,$2,$3,$4,$5::jsonb,$6,$7,$8) AS id`,
      [
        input.crossId,
        input.verificationState,
        input.method,
        input.sourceType,
        JSON.stringify(input.evidenceReferences),
        input.confidence ?? null,
        input.notes ?? `${input.verificationState} recorded through ${input.method}`,
        input.idempotencyKey,
      ],
    );
    const verificationId = verification.rows[0]!.id;
    await audit(client, principal, 'cross.verification_recorded', 'cross_verification', verificationId, null, {
      crossId: input.crossId,
      verificationState: input.verificationState,
      method: input.method,
      evidenceReferences: input.evidenceReferences,
    });
    return { verificationId, reviewState: 'draft' as const };
  }, 'cross.verification.record'));
}

export async function reviewCrossVerification(
  pool: pg.Pool,
  principal: Principal,
  rawInput: CrossVerificationReviewInput,
): Promise<{ reviewId: string }> {
  authorize(principal, 'catalog.review');
  const input = crossVerificationReviewSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const review = await client.query<{ id: string }>(
      `SELECT app_review_cross_verification($1,$2::review_state,$3) AS id`,
      [input.verificationId, input.decision, input.rationale],
    );
    await audit(client, principal, 'cross.verification_reviewed', 'cross_verification', input.verificationId, null, {
      decision: input.decision,
      rationale: input.rationale,
      reviewId: review.rows[0]!.id,
    });
    return { reviewId: review.rows[0]!.id };
  }, 'cross.verification.review'));
}

export async function harvestCross(
  pool: pg.Pool,
  principal: Principal,
  rawInput: HarvestCreateInput,
): Promise<{ fruitId: string; harvestId: string; derivedMaterialId: string; seedLotId: string; familyId: string }> {
  authorize(principal, 'cross.write');
  const input = harvestCreateSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const crossResult = await client.query<{
      operational_state: string;
      verification_state: string;
      pollination_method: 'controlled_cross' | 'selfing' | 'open_pollination';
      maternal_plant_id: string;
      paternal_plant_id: string | null;
      fruit_set_at: string | null;
    }>(
      `SELECT cross_record.operational_state::text, cross_record.verification_state::text,
              cross_record.pollination_method::text, cross_record.maternal_plant_id,
              cross_record.paternal_plant_id,
              (SELECT max(event.occurred_at)::text FROM cross_events event
               WHERE event.workspace_id = cross_record.workspace_id AND event.cross_id = cross_record.id AND event.event_type = 'fruit_set') AS fruit_set_at
       FROM crosses cross_record
       WHERE cross_record.workspace_id = app_current_workspace_id() AND cross_record.id = $1
       FOR UPDATE`,
      [input.crossId],
    );
    const cross = crossResult.rows[0];
    if (!cross) throw new ApplicationError('not_found', 'Cross not found.');
    if (!['fruit_set', 'harvest_ready'].includes(cross.operational_state)) {
      throw new ApplicationError('conflict', 'Fruit set must be recorded before canonical harvest. Verification is tracked separately.');
    }
    const requiredClass = derivedMaterialClassForPollination(cross.pollination_method);
    if (input.derivedMaterialClass !== requiredClass) {
      throw new ApplicationError('validation_failed', `The derived material class must be ${requiredClass} for ${cross.pollination_method}.`);
    }

    const fruitId = await createMaterial(client, principal, 'fruit', input.fruitCode);
    await client.query(
      `INSERT INTO fruits(material_id, workspace_id, cross_id, maternal_plant_id, set_at, harvested_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [fruitId, principal.workspaceId, input.crossId, cross.maternal_plant_id, cross.fruit_set_at, input.harvestedAt],
    );
    const parents = [
      { materialId: cross.maternal_plant_id, role: 'maternal', relationship: 'maternal_parent' },
      ...(cross.paternal_plant_id ? [{ materialId: cross.paternal_plant_id, role: 'paternal', relationship: 'paternal_parent' }] : []),
    ];
    await recordOrigin(client, principal, {
      materialId: fruitId,
      eventType: cross.pollination_method,
      occurredAt: input.harvestedAt,
      details: { crossId: input.crossId, verificationState: cross.verification_state },
      parents,
    });

    const harvestId = await createMaterial(client, principal, 'seed_harvest', input.harvestCode);
    await client.query(
      `INSERT INTO seed_harvests(material_id, workspace_id, fruit_material_id, quantity_estimate, harvested_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [harvestId, principal.workspaceId, fruitId, input.seedQuantityEstimate ?? null, input.harvestedAt],
    );
    await recordOrigin(client, principal, {
      materialId: harvestId,
      eventType: 'seed_harvest',
      occurredAt: input.harvestedAt,
      parents: [{ materialId: fruitId, role: 'fruit', relationship: 'harvested_from' }],
    });

    // The progeny family is the canonical derived breeding-material identity. It
    // is never assigned the maternal accession identity.
    const familyId = await createMaterial(client, principal, 'progeny_family', input.derivedMaterialCode);
    if (input.familyCode !== input.derivedMaterialCode) {
      throw new ApplicationError('validation_failed', 'The family code and derived material code must match for the initial progeny identity.');
    }
    await client.query(
      `INSERT INTO breeding_material_identities(
         material_id, workspace_id, material_class, cross_id,
         maternal_parent_material_id, paternal_parent_material_id,
         paternal_identity_known, pollination_method, verification_state,
         generation_label, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        familyId,
        principal.workspaceId,
        input.derivedMaterialClass,
        input.crossId,
        cross.maternal_plant_id,
        cross.paternal_plant_id,
        cross.paternal_plant_id !== null,
        cross.pollination_method,
        cross.verification_state,
        input.generationLabel,
        principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO progeny_families(material_id, workspace_id, cross_id, source_seed_harvest_material_id, generation_label)
       VALUES ($1,$2,$3,$4,$5)`,
      [familyId, principal.workspaceId, input.crossId, harvestId, input.generationLabel],
    );
    await recordOrigin(client, principal, {
      materialId: familyId,
      eventType: 'seed_harvest',
      occurredAt: input.harvestedAt,
      details: {
        generationLabel: input.generationLabel,
        displayName: input.derivedMaterialName,
        pollinationMethod: cross.pollination_method,
        verificationState: cross.verification_state,
      },
      parents: [{ materialId: harvestId, role: 'seed_harvest', relationship: 'defines_family' }],
    });

    const seedLotId = await createMaterial(client, principal, 'seed_lot', input.seedLotCode);
    await client.query(
      `INSERT INTO seed_lots(
         material_id, workspace_id, accession_material_id, derived_material_id,
         source_seed_harvest_material_id, quantity_estimate
       ) VALUES ($1,$2,NULL,$3,$4,$5)`,
      [seedLotId, principal.workspaceId, familyId, harvestId, input.seedQuantityEstimate ?? 0],
    );
    await recordOrigin(client, principal, {
      materialId: seedLotId,
      eventType: 'seed_harvest',
      occurredAt: input.harvestedAt,
      details: { seedHarvestMaterialId: harvestId, derivedMaterialId: familyId },
      parents: [
        { materialId: harvestId, role: 'seed_harvest', relationship: 'packaged_as' },
        { materialId: familyId, role: 'derived_identity', relationship: 'identity_anchor' },
      ],
    });
    if ((input.seedQuantityEstimate ?? 0) > 0) {
      await client.query(
        `INSERT INTO inventory_events(
           workspace_id, seed_lot_material_id, event_type, quantity_delta, running_quantity,
           reason, occurred_at, recorded_by, idempotency_key
         ) VALUES ($1,$2,'received',$3,$3,'Canonical cross harvest',$4,$5,$6)`,
        [principal.workspaceId, seedLotId, input.seedQuantityEstimate, input.harvestedAt, principal.userId, `${input.idempotencyKey}:inventory`],
      );
    }
    await issueDeterministicLabel(client, principal, fruitId, input.fruitCode);
    await issueDeterministicLabel(client, principal, harvestId, input.harvestCode);
    await issueDeterministicLabel(client, principal, familyId, input.derivedMaterialCode);
    await issueDeterministicLabel(client, principal, seedLotId, input.seedLotCode);
    await client.query(
      `SELECT app_complete_cross_harvest($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.crossId, fruitId, harvestId, seedLotId, familyId, input.harvestedAt, `Created derived progeny ${input.derivedMaterialCode}`, `${input.idempotencyKey}:cross-event`],
    );
    const response = { fruitId, harvestId, derivedMaterialId: familyId, seedLotId, familyId };
    await audit(client, principal, 'cross.harvested', 'cross', input.crossId, {
      operationalState: cross.operational_state,
      verificationState: cross.verification_state,
    }, response);
    return response;
  }, 'cross.harvest'));
}

export async function listFamilies(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'material.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT family.material_id, material.material_code, family.generation_label,
            identity.material_class::text, identity.pollination_method::text,
            identity.verification_state::text, cross_record.id AS cross_id,
            cross_record.cross_code, family.created_at::text,
            count(member.plant_material_id)::int AS member_count
     FROM progeny_families family
     JOIN biological_materials material ON material.workspace_id = family.workspace_id AND material.id = family.material_id
     JOIN breeding_material_identities identity ON identity.workspace_id = family.workspace_id AND identity.material_id = family.material_id
     JOIN crosses cross_record ON cross_record.workspace_id = family.workspace_id AND cross_record.id = family.cross_id
     LEFT JOIN family_members member ON member.workspace_id = family.workspace_id AND member.family_material_id = family.material_id
     WHERE family.workspace_id = app_current_workspace_id()
     GROUP BY family.material_id, material.material_code, family.generation_label,
              identity.material_class, identity.pollination_method, identity.verification_state,
              cross_record.id, cross_record.cross_code, family.created_at
     ORDER BY family.created_at DESC LIMIT 100`,
  )).rows);
}

export async function getPedigree(pool: pg.Pool, principal: Principal, materialId: string) {
  authorize(principal, 'material.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const root = await client.query(
      `SELECT material.id, material.material_code, material.kind::text, material.status::text,
              identity.material_class::text, identity.pollination_method::text,
              identity.verification_state::text
       FROM biological_materials material
       LEFT JOIN breeding_material_identities identity
         ON identity.workspace_id = material.workspace_id AND identity.material_id = material.id
       WHERE material.workspace_id = app_current_workspace_id() AND material.id = $1`,
      [materialId],
    );
    if (!root.rows[0]) return null;
    const ancestors = await client.query(
      `WITH RECURSIVE ancestry AS (
         SELECT edge.parent_material_id, edge.child_material_id, edge.relationship, 1 AS depth,
                ARRAY[edge.child_material_id, edge.parent_material_id] AS path
         FROM pedigree_edges edge
         WHERE edge.workspace_id = app_current_workspace_id() AND edge.child_material_id = $1
         UNION ALL
         SELECT edge.parent_material_id, edge.child_material_id, edge.relationship, ancestry.depth + 1,
                ancestry.path || edge.parent_material_id
         FROM pedigree_edges edge
         JOIN ancestry ON ancestry.parent_material_id = edge.child_material_id
         WHERE edge.workspace_id = app_current_workspace_id()
           AND ancestry.depth < 50
           AND NOT edge.parent_material_id = ANY(ancestry.path)
       )
       SELECT ancestry.*, parent.material_code AS parent_code, child.material_code AS child_code
       FROM ancestry
       JOIN biological_materials parent ON parent.workspace_id = app_current_workspace_id() AND parent.id = ancestry.parent_material_id
       JOIN biological_materials child ON child.workspace_id = app_current_workspace_id() AND child.id = ancestry.child_material_id
       ORDER BY ancestry.depth, parent.material_code`,
      [materialId],
    );
    return { root: root.rows[0], ancestors: ancestors.rows };
  });
}


export async function resolveMaterialLabel(
  pool: pg.Pool,
  principal: Principal,
  publicToken: string,
): Promise<{ materialId: string; materialCode: string; kind: string; status: string; labelId: string } | null> {
  authorize(principal, 'material.read');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicToken)) {
    return null;
  }
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const row = (await client.query<{
      material_id: string; material_code: string; kind: string; status: string; label_id: string;
    }>(
      `SELECT material_id, material_code, kind, status, label_id
       FROM app_resolve_material_label_token($1)`,
      [publicToken],
    )).rows[0];
    if (!row) return null;
    await audit(client, principal, 'material.label.resolved', 'material_label', row.label_id, null, {
      materialId: row.material_id,
    });
    return {
      materialId: row.material_id,
      materialCode: row.material_code,
      kind: row.kind,
      status: row.status,
      labelId: row.label_id,
    };
  });
}
