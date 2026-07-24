import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  exactSimulationRequestSchema,
  selectionPlanCreateSchema,
  selectionPlanTransitionSchema,
  selectionPlanReconciliationSchema,
  type ExactSimulationRequest,
  type ExactSimulationResponse,
  type Principal,
  type SelectionPlanCreateInput,
  type SelectionPlanTransitionInput,
  type SelectionPlanReconciliationInput,
} from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import { runExactSimulation, stableContentHash } from '@capsicum/simulation-domain';
import { reconcileObservedSegregation } from '@capsicum/genetics-advanced';
import { Rational } from '@capsicum/genetics-core';
import { ApplicationError, audit, authorize, executeIdempotent } from './internal';
import { enforceOperationAdmission } from './admission-service';

export const USER_DECLARED_CATALOG_RELEASE = 'user-declared-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PremiseAuthority = ExactSimulationResponse['premiseAuthority'];

interface GenotypeCallSnapshot {
  callId: string;
  callVersion: number;
  materialId: string;
  locusId: string;
  locusCatalogId: string;
  alleleOneId: string | null;
  alleleTwoId: string | null;
  alleleOne: string;
  alleleTwo: string;
  evidenceState: string;
  callBasis: string;
  catalogReleaseId: string | null;
  sourceDocumentId: string | null;
  markerId: string | null;
  assayId: string | null;
}

interface ReleaseSnapshot {
  id: string;
  version: string;
  contentHash: string;
}

async function validateParentMaterials(client: pg.PoolClient, request: ExactSimulationRequest): Promise<void> {
  const ids = [request.maternal.materialId, request.paternal.materialId];
  const result = await client.query<{ material_id: string }>(
    `SELECT material_id FROM plants
     WHERE workspace_id = app_current_workspace_id() AND material_id = ANY($1::uuid[])`,
    [ids],
  );
  if (result.rows.length !== new Set(ids).size) {
    throw new ApplicationError('validation_failed', 'Both simulation parents must be registered plants in the active workspace.');
  }
}

function uniqueLoci(request: ExactSimulationRequest): string[] {
  return [...new Set([...request.maternal.genotypes, ...request.paternal.genotypes].map((entry) => entry.genotype.locusId))].sort();
}

async function normalizeApprovedReleaseRequest(
  client: pg.PoolClient,
  request: ExactSimulationRequest,
): Promise<{ request: ExactSimulationRequest; release: ReleaseSnapshot | null }> {
  if (request.catalogReleaseId === USER_DECLARED_CATALOG_RELEASE) return { request, release: null };
  if (!UUID.test(request.catalogReleaseId)) throw new ApplicationError('validation_failed', 'Catalog release identifier is invalid.');
  const releaseResult = await client.query<ReleaseSnapshot & { state: string; published_at: string | null }>(
    `SELECT id, version, content_hash AS "contentHash", state::text, published_at::text
     FROM catalog_releases WHERE id = $1`,
    [request.catalogReleaseId],
  );
  const releaseRow = releaseResult.rows[0];
  if (!releaseRow || releaseRow.state !== 'approved' || !releaseRow.published_at) {
    throw new ApplicationError('scientific_authority_unavailable', 'The selected catalog release is not independently approved and published.');
  }
  const release = releaseRow;
  const loci = uniqueLoci(request);
  const releaseLoci = await client.query<{ catalog_id: string }>(
    `SELECT locus.catalog_id
     FROM catalog_release_loci member
     JOIN loci locus ON locus.id = member.locus_id
     WHERE member.release_id = $1 AND locus.catalog_id = ANY($2::text[])`,
    [request.catalogReleaseId, loci],
  );
  if (new Set(releaseLoci.rows.map((row) => row.catalog_id)).size !== loci.length) {
    throw new ApplicationError('scientific_authority_unavailable', 'One or more requested loci are not members of the selected catalog release.');
  }
  const alleleRows = await client.query<{ id: string; canonical_symbol: string; locus_catalog_id: string }>(
    `SELECT allele.id::text, allele.canonical_symbol, locus.catalog_id AS locus_catalog_id
     FROM catalog_release_alleles member
     JOIN catalog_alleles allele ON allele.id = member.allele_id
     JOIN loci locus ON locus.id = allele.locus_id
     WHERE member.release_id = $1 AND locus.catalog_id = ANY($2::text[])
       AND allele.review_state = 'approved'`,
    [request.catalogReleaseId, loci],
  );
  const byLocus = new Map<string, Array<{ id: string; symbol: string }>>();
  for (const row of alleleRows.rows) {
    const current = byLocus.get(row.locus_catalog_id) ?? [];
    current.push({ id: row.id, symbol: row.canonical_symbol });
    byLocus.set(row.locus_catalog_id, current);
  }
  function resolve(locusId: string, token: string): string {
    const members = byLocus.get(locusId) ?? [];
    const matches = members.filter((member) => member.id === token || member.symbol === token);
    if (matches.length !== 1) {
      throw new ApplicationError(
        'scientific_authority_unavailable',
        matches.length === 0
          ? `Allele ${token} is not an approved member of release ${release.version} at locus ${locusId}.`
          : `Allele symbol ${token} is ambiguous in release ${release.version}; select its exact catalog identifier.`,
      );
    }
    return matches[0]!.id;
  }
  const normalizeParent = (parent: ExactSimulationRequest['maternal']): ExactSimulationRequest['maternal'] => ({
    ...parent,
    genotypes: parent.genotypes.map((entry) => ({
      ...entry,
      genotype: {
        ...entry.genotype,
        alleles: [resolve(entry.genotype.locusId, entry.genotype.alleles[0]), resolve(entry.genotype.locusId, entry.genotype.alleles[1])],
      },
    })),
  });
  return {
    request: {
      ...request,
      maternal: normalizeParent(request.maternal),
      paternal: normalizeParent(request.paternal),
      ...(request.target ? { target: { locusId: request.target.locusId, alleles: [resolve(request.target.locusId, request.target.alleles[0]), resolve(request.target.locusId, request.target.alleles[1])] } } : {}),
    },
    release: { id: release.id, version: release.version, contentHash: release.contentHash },
  };
}

async function validateAndSnapshotGenotypes(
  client: pg.PoolClient,
  request: ExactSimulationRequest,
): Promise<{ calls: GenotypeCallSnapshot[]; evidenceIds: string[]; premiseAuthority: PremiseAuthority }> {
  const calls: GenotypeCallSnapshot[] = [];
  let premiseAuthority: PremiseAuthority = request.catalogReleaseId === USER_DECLARED_CATALOG_RELEASE ? 'assumed' : 'verified';
  for (const parent of [request.maternal, request.paternal]) {
    const result = await client.query<{
      id: string; call_version: number; material_id: string; locus_catalog_id: string; locus_id: string | null;
      allele_one_id: string | null; allele_two_id: string | null; allele_one: string; allele_two: string;
      evidence_state: string; call_basis: string; catalog_release_id: string | null; source_document_id: string | null;
      marker_id: string | null; assay_id: string | null;
    }>(
      `SELECT id, call_version, material_id, locus_catalog_id, locus_id::text,
              allele_one_id::text, allele_two_id::text, allele_one, allele_two,
              evidence_state::text, call_basis::text, catalog_release_id::text,
              source_document_id::text, marker_id::text, assay_id::text
       FROM genotype_calls
       WHERE workspace_id = app_current_workspace_id() AND material_id = $1 AND is_current
         AND locus_catalog_id = ANY($2::text[])`,
      [parent.materialId, [...new Set(parent.genotypes.map((item) => item.genotype.locusId))]],
    );
    const byLocus = new Map(result.rows.map((row) => [row.locus_catalog_id, row]));
    for (const possibility of parent.genotypes) {
      const call = byLocus.get(possibility.genotype.locusId);
      if (possibility.genotype.evidenceState === 'verified') {
        if (!call || call.evidence_state !== 'verified' || call.call_basis !== 'verified_genotype') {
          throw new ApplicationError('scientific_authority_unavailable', `Verified premise requested for ${parent.materialId} at ${possibility.genotype.locusId}, but no current verified-genotype call supports it.`);
        }
        const declared = [...possibility.genotype.alleles].sort().join('\u0000');
        const recordedValues = request.catalogReleaseId === USER_DECLARED_CATALOG_RELEASE
          ? [call.allele_one, call.allele_two]
          : [call.allele_one_id ?? '', call.allele_two_id ?? ''];
        if (declared !== recordedValues.sort().join('\u0000') || (request.catalogReleaseId !== USER_DECLARED_CATALOG_RELEASE && call.catalog_release_id !== request.catalogReleaseId)) {
          throw new ApplicationError('scientific_authority_unavailable', `The declared verified genotype does not match the immutable current call for ${parent.materialId} at ${possibility.genotype.locusId}.`);
        }
      }
      if (!call && possibility.genotype.evidenceState === 'verified') {
        premiseAuthority = 'unknown';
      } else if (possibility.genotype.evidenceState === 'conflicting') premiseAuthority = 'conflicting';
      else if (possibility.genotype.evidenceState === 'unknown' && premiseAuthority !== 'conflicting') premiseAuthority = 'unknown';
      else if (possibility.genotype.evidenceState === 'assumed' && !['conflicting','unknown'].includes(premiseAuthority)) premiseAuthority = premiseAuthority === 'verified' ? 'assumed' : 'mixed';
      else if (possibility.genotype.evidenceState === 'inferred' && !['conflicting','unknown','assumed'].includes(premiseAuthority)) premiseAuthority = premiseAuthority === 'verified' ? 'inferred' : 'mixed';
    }
    for (const row of result.rows) {
      calls.push({
        callId: row.id, callVersion: row.call_version, materialId: row.material_id,
        locusId: row.locus_id ?? row.locus_catalog_id, locusCatalogId: row.locus_catalog_id,
        alleleOneId: row.allele_one_id, alleleTwoId: row.allele_two_id,
        alleleOne: row.allele_one, alleleTwo: row.allele_two,
        evidenceState: row.evidence_state, callBasis: row.call_basis,
        catalogReleaseId: row.catalog_release_id, sourceDocumentId: row.source_document_id,
        markerId: row.marker_id, assayId: row.assay_id,
      });
    }
  }
  const evidenceIds = [...new Set(calls.flatMap((call) => [call.sourceDocumentId, call.markerId, call.assayId].filter((item): item is string => Boolean(item))))].sort();
  return { calls: calls.sort((left, right) => left.callId < right.callId ? -1 : left.callId > right.callId ? 1 : 0), evidenceIds, premiseAuthority };
}

export async function runAndPersistExactSimulation(
  pool: pg.Pool,
  principal: Principal,
  rawRequest: unknown,
  idempotencyKey: string,
): Promise<ExactSimulationResponse> {
  await enforceOperationAdmission(pool, principal, { scope: 'simulation.exact', limit: 120, windowSeconds: 3600 });
  authorize(principal, 'simulation.run');
  const parsed = exactSimulationRequestSchema.parse(rawRequest) as ExactSimulationRequest;
  if (parsed.workspaceId !== principal.workspaceId) throw new ApplicationError('permission_denied', 'Simulation workspace must match the active workspace.');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, (client) =>
    executeIdempotent(client, principal, idempotencyKey, parsed, async () => {
      await validateParentMaterials(client, parsed);
      const normalized = await normalizeApprovedReleaseRequest(client, parsed);
      const evidence = await validateAndSnapshotGenotypes(client, normalized.request);
      const calculated = runExactSimulation(normalized.request);
      const inputSnapshot = {
        request: normalized.request,
        catalogRelease: normalized.release,
        genotypeCalls: evidence.calls,
        capturedAt: null,
      };
      const inputHash = stableContentHash(inputSnapshot);
      const { targetRecovery, ...calculatedWithoutOptionalTarget } = calculated;
      const resultWithoutIdentity = {
        ...calculatedWithoutOptionalTarget,
        ...(targetRecovery ? { targetRecovery } : {}),
        runId: '',
        inputHash,
        authority: evidence.premiseAuthority === 'verified' ? 'exact_supported' as const : 'unsupported' as const,
        premiseAuthority: evidence.premiseAuthority,
        genotypeCallVersions: evidence.calls.map((call) => ({ callId: call.callId, callVersion: call.callVersion, materialId: call.materialId, locusId: call.locusCatalogId })),
        evidenceIds: evidence.evidenceIds,
      };
      const contentHash = stableContentHash({ inputSnapshot, result: resultWithoutIdentity });
      const existing = await client.query<{ id: string; result_payload: ExactSimulationResponse }>(
        `SELECT id, result_payload FROM simulation_runs
         WHERE workspace_id = app_current_workspace_id() AND created_by = $1 AND content_hash = $2`,
        [principal.userId, contentHash],
      );
      if (existing.rows[0]) return { ...existing.rows[0].result_payload, runId: existing.rows[0].id };
      const runId = randomUUID();
      const response: ExactSimulationResponse = { ...resultWithoutIdentity, runId, contentHash };
      await client.query(
        `INSERT INTO simulation_runs(
          id, workspace_id, created_by, model_type, model_version, catalog_release_id,
          authority, calculation_authority, premise_authority, interpretation_authority,
          engine_version, input_hash, parent_direction, evidence_ids, genotype_call_ids,
          normalized_input, result_payload, assumptions, warnings, abstentions, content_hash, completed_at
        ) VALUES ($1,$2,$3,'exact_nuclear',$4,$5,$6,'exact',$7,'genotype_only',$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,clock_timestamp())`,
        [
          runId, principal.workspaceId, principal.userId, response.modelVersion,
          normalized.release?.id ?? null, response.authority, evidence.premiseAuthority, response.engineVersion, inputHash,
          JSON.stringify(response.parentDirection), JSON.stringify(evidence.evidenceIds), JSON.stringify(evidence.calls.map((call) => call.callId)),
          JSON.stringify(inputSnapshot), JSON.stringify(response), JSON.stringify(response.assumptions),
          JSON.stringify(response.warnings), JSON.stringify(response.abstentions), contentHash,
        ],
      );
      await audit(client, principal, 'simulation.completed', 'simulation_run', runId, null, {
        calculationAuthority: 'exact', premiseAuthority: evidence.premiseAuthority,
        interpretationAuthority: 'genotype_only', contentHash, inputHash,
      });
      return response;
    }, 'simulation.exact'),
  );
}

export async function listSimulationRuns(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'simulation.read');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => (await client.query(
    `SELECT id, model_type, model_version, calculation_authority::text, premise_authority::text,
            interpretation_authority::text, content_hash, input_hash, completed_at::text, created_at::text,
            COALESCE(result_payload->'parentDirection', parent_direction) AS parent_direction,
            result_payload->'targetRecovery' AS target_recovery
     FROM simulation_runs WHERE workspace_id = app_current_workspace_id()
     ORDER BY completed_at DESC LIMIT 100`,
  )).rows);
}

export async function getSimulationRun(pool: pg.Pool, principal: Principal, runId: string) {
  authorize(principal, 'simulation.read');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query(
      `SELECT id, model_type, model_version, authority::text, calculation_authority::text,
              premise_authority::text, interpretation_authority::text, engine_version,
              normalized_input, result_payload, input_hash, content_hash, evidence_ids,
              genotype_call_ids, random_seed, sample_count, diagnostics, parent_direction,
              assumptions, warnings, abstentions, catalog_release_id,
              completed_at::text, created_at::text
       FROM simulation_runs WHERE workspace_id = app_current_workspace_id() AND id = $1`,
      [runId],
    );
    return result.rows[0] ?? null;
  });
}

export async function createSelectionPlan(
  pool: pg.Pool,
  principal: Principal,
  rawInput: SelectionPlanCreateInput,
): Promise<{ selectionPlanId: string }> {
  authorize(principal, 'cross.write');
  const input = selectionPlanCreateSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const simulation = await client.query<{
      id: string;
      model_version: string;
      content_hash: string;
      calculation_authority: string;
      premise_authority: string;
      interpretation_authority: string;
      assumptions: unknown;
      result_payload: Record<string, unknown>;
    }>(
      `SELECT id, model_version, content_hash, calculation_authority::text,
              premise_authority::text, interpretation_authority::text,
              assumptions, result_payload
       FROM simulation_runs
       WHERE workspace_id = app_current_workspace_id() AND id = $1`,
      [input.simulationRunId],
    );
    const source = simulation.rows[0];
    if (!source) throw new RangeError('Simulation run not found.');
    const targetExpression = Object.keys(input.targetExpression).length > 0
      ? input.targetExpression
      : { description: input.targetDescription };
    const probabilityBasis = {
      simulationRunId: source.id,
      simulationContentHash: source.content_hash,
      calculationAuthority: source.calculation_authority,
      premiseAuthority: source.premise_authority,
      interpretationAuthority: source.interpretation_authority,
      targetRecovery: source.result_payload.targetRecovery ?? null,
      guarantee: false,
    };
    const populationCalculation = {
      plannedPopulation: input.plannedPopulation,
      confidence: input.confidence,
      statisticalPlanningOnly: true,
      guarantee: false,
      sourceTargetRecovery: source.result_payload.targetRecovery ?? null,
    };
    const assumptions = [
      ...(Array.isArray(source.assumptions) ? source.assumptions : []),
      ...input.assumptions,
      'Population requirements are probabilistic planning values, not guarantees.',
    ];
    const result = await client.query<{ id: string }>(
      `INSERT INTO selection_plans(
        workspace_id, simulation_run_id, name, target_description, target_expression,
        target_model, target_model_version, planned_population, scenario_type, confidence,
        probability_basis, population_calculation, assumptions, generation_plan,
        originating_simulation_model_version, originating_simulation_content_hash,
        notes, created_by, idempotency_key
      ) VALUES (
        $1,$2,$3,$4,$5::jsonb,'capsicum.selection-target',$6,$7,$8,$9,
        $10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18
      ) RETURNING id`,
      [
        principal.workspaceId,
        input.simulationRunId,
        input.name,
        input.targetDescription,
        JSON.stringify(targetExpression),
        input.targetModelVersion,
        input.plannedPopulation,
        input.scenarioType,
        input.confidence,
        JSON.stringify(probabilityBasis),
        JSON.stringify(populationCalculation),
        JSON.stringify(assumptions),
        JSON.stringify(input.generationPlan),
        source.model_version,
        source.content_hash,
        input.notes ?? null,
        principal.userId,
        input.idempotencyKey,
      ],
    );
    const selectionPlanId = result.rows[0]!.id;
    await audit(client, principal, 'selection_plan.created', 'selection_plan', selectionPlanId, null, input);
    return { selectionPlanId };
  }));
}

export async function transitionSelectionPlan(
  pool: pg.Pool,
  principal: Principal,
  rawInput: SelectionPlanTransitionInput,
): Promise<{ selectionPlanId: string; fromStatus: string; toStatus: string; statusVersion: number }> {
  const input = selectionPlanTransitionSchema.parse(rawInput);
  authorize(principal, input.toStatus === 'approved' ? 'catalog.review' : 'cross.write');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const current = await client.query<{ status: string; status_version: number }>(
      `SELECT status, status_version
       FROM selection_plans
       WHERE workspace_id = app_current_workspace_id() AND id = $1
       FOR UPDATE`,
      [input.selectionPlanId],
    );
    const snapshot = current.rows[0];
    if (!snapshot) throw new ApplicationError('not_found', 'The selection plan is unavailable.');
    if (snapshot.status_version !== input.expectedVersion) {
      throw new ApplicationError('stale_version', 'The selection plan changed after it was opened. Refresh and try again.');
    }
    const result = await client.query<{ transition: { selectionPlanId: string; fromStatus: string; toStatus: string; statusVersion: number } }>(
      'SELECT app_transition_selection_plan($1,$2,$3,$4) AS transition',
      [input.selectionPlanId, input.expectedVersion, input.toStatus, input.reason ?? null],
    );
    const transition = result.rows[0]?.transition;
    if (!transition) throw new ApplicationError('internal_error', 'The selection-plan transition did not return a result.');
    await audit(client, principal, `selection_plan.${input.toStatus}`, 'selection_plan', input.selectionPlanId, null, transition);
    return transition;
  }, 'selection_plan.transition'));
}

export async function recordSelectionPlanReconciliation(
  pool: pg.Pool,
  principal: Principal,
  rawInput: SelectionPlanReconciliationInput,
): Promise<{ reconciliationId: string; result: Record<string, unknown> }> {
  authorize(principal, 'cross.write');
  const input = selectionPlanReconciliationSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const planResult = await client.query<{
      status: string;
      status_version: number;
      originating_simulation_content_hash: string;
    }>(
      `SELECT status, status_version, originating_simulation_content_hash
       FROM selection_plans
       WHERE workspace_id = app_current_workspace_id() AND id = $1
       FOR SHARE`,
      [input.selectionPlanId],
    );
    const plan = planResult.rows[0];
    if (!plan) throw new ApplicationError('not_found', 'The selection plan is unavailable.');
    if (!['active', 'completed'].includes(plan.status)) {
      throw new ApplicationError('conflict', 'Observed segregation may be recorded only for an active or completed selection plan.');
    }
    const categories = input.categories.map((category) => ({
      categoryId: category.categoryId,
      observedCount: category.observedCount,
      expectedProbability: new Rational(BigInt(category.expectedNumerator), BigInt(category.expectedDenominator)),
    }));
    const result = reconcileObservedSegregation({ categories, missingCount: input.missingCount });
    const inputSnapshot = {
      selectionPlanId: input.selectionPlanId,
      selectionPlanStatusVersion: plan.status_version,
      sourceSimulationContentHash: plan.originating_simulation_content_hash,
      categories: input.categories,
      missingCount: input.missingCount,
    };
    const normalizedResult = {
      ...result,
      statistic: result.statistic === Number.POSITIVE_INFINITY ? 'positive_infinity' : result.statistic,
    };
    const inputHash = stableContentHash(inputSnapshot);
    const resultHash = stableContentHash({ engineVersion: 'capsicum.segregation-reconciliation/1.0.0', inputHash, result: normalizedResult });
    const persisted = await client.query<{ id: string }>(
      `INSERT INTO selection_plan_reconciliations(
        workspace_id, selection_plan_id, selection_plan_status_version, source_simulation_content_hash,
        categories, missing_count, method, sample_size, degrees_of_freedom, statistic, infinite_statistic,
        p_value, expected_counts, assumptions_met, warnings, interpretation, engine_version,
        input_hash, result_hash, created_by, idempotency_key
      ) VALUES (
        $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17,$18,$19,$20,$21
      ) RETURNING id`,
      [
        principal.workspaceId, input.selectionPlanId, plan.status_version, plan.originating_simulation_content_hash,
        JSON.stringify(input.categories), input.missingCount, result.method, result.sampleSize, result.degreesOfFreedom,
        result.statistic !== null && Number.isFinite(result.statistic) ? result.statistic : null,
        result.statistic === Number.POSITIVE_INFINITY, result.pValue, JSON.stringify(result.expectedCounts),
        result.assumptionsMet, JSON.stringify(result.warnings), result.interpretation,
        'capsicum.segregation-reconciliation/1.0.0', inputHash, resultHash, principal.userId, input.idempotencyKey,
      ],
    );
    const reconciliationId = persisted.rows[0]!.id;
    await audit(client, principal, 'selection_plan.reconciliation_recorded', 'selection_plan_reconciliation', reconciliationId, null, {
      selectionPlanId: input.selectionPlanId, inputHash, resultHash, method: result.method, assumptionsMet: result.assumptionsMet,
    });
    return { reconciliationId, result: normalizedResult };
  }, 'selection_plan.reconciliation'));
}

export async function listSelectionPlans(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'cross.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT plan.id, plan.name, plan.target_description, plan.planned_population,
            plan.scenario_type, plan.confidence, plan.target_model_version,
            plan.status, plan.created_at::text, run.content_hash AS simulation_hash
     FROM selection_plans plan
     JOIN simulation_runs run ON run.workspace_id = plan.workspace_id AND run.id = plan.simulation_run_id
     WHERE plan.workspace_id = app_current_workspace_id()
     ORDER BY plan.created_at DESC LIMIT 100`,
  )).rows);
}

export async function getSelectionPlan(pool: pg.Pool, principal: Principal, selectionPlanId: string) {
  authorize(principal, 'cross.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const result = await client.query(
      `SELECT plan.*, run.model_type, run.model_version, run.authority::text,
              run.content_hash AS simulation_hash, run.result_payload AS simulation_result,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', transition.id,
                  'fromStatus', transition.from_status,
                  'toStatus', transition.to_status,
                  'fromVersion', transition.from_version,
                  'toVersion', transition.to_version,
                  'actorDisplayName', actor.display_name,
                  'reason', transition.reason,
                  'occurredAt', transition.occurred_at
                ) ORDER BY transition.to_version)
                FROM selection_plan_transitions transition
                JOIN users actor ON actor.id = transition.actor_user_id
                WHERE transition.workspace_id = plan.workspace_id
                  AND transition.selection_plan_id = plan.id
              ), '[]'::jsonb) AS transition_history,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', reconciliation.id,
                  'method', reconciliation.method,
                  'sampleSize', reconciliation.sample_size,
                  'missingCount', reconciliation.missing_count,
                  'degreesOfFreedom', reconciliation.degrees_of_freedom,
                  'statistic', CASE WHEN reconciliation.infinite_statistic THEN '"positive_infinity"'::jsonb ELSE to_jsonb(reconciliation.statistic) END,
                  'pValue', reconciliation.p_value,
                  'expectedCounts', reconciliation.expected_counts,
                  'assumptionsMet', reconciliation.assumptions_met,
                  'warnings', reconciliation.warnings,
                  'interpretation', reconciliation.interpretation,
                  'engineVersion', reconciliation.engine_version,
                  'inputHash', reconciliation.input_hash,
                  'resultHash', reconciliation.result_hash,
                  'createdBy', creator.display_name,
                  'createdAt', reconciliation.created_at
                ) ORDER BY reconciliation.created_at DESC)
                FROM selection_plan_reconciliations reconciliation
                JOIN users creator ON creator.id = reconciliation.created_by
                WHERE reconciliation.workspace_id = plan.workspace_id
                  AND reconciliation.selection_plan_id = plan.id
              ), '[]'::jsonb) AS reconciliations
       FROM selection_plans plan
       JOIN simulation_runs run
         ON run.workspace_id = plan.workspace_id AND run.id = plan.simulation_run_id
       WHERE plan.workspace_id = app_current_workspace_id() AND plan.id = $1`,
      [selectionPlanId],
    );
    return result.rows[0] ?? null;
  });
}

export interface SimulationCatalogAlleleOption {
  id: string;
  symbol: string;
  recordVersion: string;
}

export interface SimulationCatalogLocusOption {
  id: string;
  catalogId: string;
  symbol: string;
  recordVersion: string;
  alleles: SimulationCatalogAlleleOption[];
}

export interface SimulationCatalogRuleOption {
  id: string;
  key: string;
  version: string;
  kind: 'phenotype_rule_graph_node_v1' | 'host_pathogen_rule_v1';
  expression: Record<string, unknown>;
  supportingAssertionId: string;
}

export interface SimulationCatalogReleaseOption {
  id: string;
  version: string;
  contentHash: string;
  loci: SimulationCatalogLocusOption[];
  rules: SimulationCatalogRuleOption[];
}

export async function listSimulationCatalogOptions(
  pool: pg.Pool,
  principal: Principal,
): Promise<SimulationCatalogReleaseOption[]> {
  authorize(principal, 'simulation.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const releases = await client.query<{ id: string; version: string; content_hash: string }>(
      `SELECT id::text, version, content_hash
       FROM catalog_releases
       WHERE state = 'approved' AND published_at IS NOT NULL
       ORDER BY published_at DESC, version DESC`,
    );
    const output: SimulationCatalogReleaseOption[] = [];
    for (const release of releases.rows) {
      const rows = await client.query<{
        locus_id: string;
        catalog_id: string;
        locus_symbol: string;
        locus_version: string;
        allele_id: string;
        allele_symbol: string;
        allele_version: string;
      }>(
        `SELECT locus.id::text AS locus_id, locus.catalog_id, locus.canonical_symbol AS locus_symbol,
                locus.record_version AS locus_version, allele.id::text AS allele_id,
                allele.canonical_symbol AS allele_symbol, allele.record_version AS allele_version
         FROM catalog_release_loci locus_member
         JOIN loci locus ON locus.id = locus_member.locus_id
         JOIN catalog_release_alleles allele_member
           ON allele_member.release_id = locus_member.release_id
         JOIN catalog_alleles allele
           ON allele.id = allele_member.allele_id AND allele.locus_id = locus.id
         WHERE locus_member.release_id = $1
         ORDER BY locus.catalog_id, locus.record_version, allele.canonical_symbol, allele.record_version, allele.id`,
        [release.id],
      );
      const byLocus = new Map<string, SimulationCatalogLocusOption>();
      for (const row of rows.rows) {
        const locus = byLocus.get(row.locus_id) ?? {
          id: row.locus_id,
          catalogId: row.catalog_id,
          symbol: row.locus_symbol,
          recordVersion: row.locus_version,
          alleles: [],
        };
        locus.alleles.push({ id: row.allele_id, symbol: row.allele_symbol, recordVersion: row.allele_version });
        byLocus.set(row.locus_id, locus);
      }
      const ruleRows = await client.query<{
        id: string; rule_key: string; rule_version: string;
        executable_expression: Record<string, unknown>; supporting_assertion_id: string;
      }>(
        `SELECT rule.id::text, rule.rule_key, rule.rule_version,
                rule.executable_expression, rule.supporting_assertion_id::text
         FROM phenotype_rules rule
         WHERE rule.catalog_release_id = $1
           AND rule.review_state = 'approved'
           AND rule.approved_by IS NOT NULL
           AND rule.executable_expression->>'kind' IN ('phenotype_rule_graph_node_v1','host_pathogen_rule_v1')
           AND EXISTS (
             SELECT 1 FROM catalog_release_assertions member
             WHERE member.release_id = $1 AND member.assertion_id = rule.supporting_assertion_id
           )
         ORDER BY rule.rule_key, rule.rule_version, rule.id`,
        [release.id],
      );
      const rules: SimulationCatalogRuleOption[] = ruleRows.rows.map((rule) => ({
        id: rule.id,
        key: rule.rule_key,
        version: rule.rule_version,
        kind: rule.executable_expression.kind as SimulationCatalogRuleOption['kind'],
        expression: rule.executable_expression,
        supportingAssertionId: rule.supporting_assertion_id,
      }));
      const loci = [...byLocus.values()];
      if (loci.length > 0 && loci.every((locus) => locus.alleles.length > 0)) {
        output.push({ id: release.id, version: release.version, contentHash: release.content_hash, loci, rules });
      }
    }
    return output;
  });
}
