import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  governedAdvancedSimulationRequestSchema,
  type GovernedAdvancedSimulationRequest,
  type GovernedSimulationOutcome,
  type Principal,
} from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import {
  crossLinkedTwoLocus,
  evaluateApprovedRuleGraph,
  evaluateHostPathogenInteraction,
  transmitMaternalState,
  type ApprovedHostPathogenRule,
  type ApprovedPhenotypeRuleGraphNode,
  type PhasedDiploidPair,
  type RulePredicate,
} from '@capsicum/genetics-advanced';
import { Rational, type DiploidGenotype } from '@capsicum/genetics-core';
import { stableContentHash } from '@capsicum/simulation-domain';
import { ApplicationError, audit, authorize, executeIdempotent } from './internal';
import { enforceOperationAdmission } from './admission-service';
import { enqueueJobInTransaction } from './operations-service';
import { USER_DECLARED_CATALOG_RELEASE } from './simulation-service';

const CONTRACT_VERSION = '2.0';
const LINKAGE_MODEL = 'capsicum.linked-two-locus/1.0.0';
const MATERNAL_MODEL = 'capsicum.maternal-state/1.0.0';
const RULE_GRAPH_MODEL = 'capsicum.approved-rule-graph/1.0.0';
const HOST_PATHOGEN_MODEL = 'capsicum.host-pathogen/1.0.0';
const MONTE_CARLO_MODEL = 'capsicum.direct-inheritance-monte-carlo/1.0.0';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PremiseAuthority = GovernedSimulationOutcome['premiseAuthority'];
type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationError('scientific_authority_unavailable', `${label} is not a supported executable scientific record.`);
  }
  return value as JsonRecord;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApplicationError('scientific_authority_unavailable', `${label} is missing from the approved scientific record.`);
  }
  return value.trim();
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new ApplicationError('scientific_authority_unavailable', `${label} must be an array in the approved scientific record.`);
  }
  return value.map((item, index) => requiredText(item, `${label}[${index}]`));
}

function rational(value: { numerator: string; denominator: string }): Rational {
  return new Rational(BigInt(value.numerator), BigInt(value.denominator));
}

function scientificInput(request: GovernedAdvancedSimulationRequest): JsonRecord {
  const { clientRequestId: _clientRequestId, traceId: _traceId, ...input } = request;
  return input;
}

function authorityFromEvidence(states: readonly string[]): PremiseAuthority {
  if (states.includes('conflicting')) return 'conflicting';
  if (states.includes('unknown')) return 'unknown';
  const unique = new Set(states);
  if (unique.size > 1) return 'mixed';
  if (unique.has('assumed')) return 'assumed';
  if (unique.has('inferred')) return 'inferred';
  return 'verified';
}

async function requireMaterials(client: pg.PoolClient, materialIds: readonly string[]): Promise<void> {
  const unique = [...new Set(materialIds)];
  const result = await client.query<{ material_id: string }>(
    `SELECT material_id::text
     FROM plants
     WHERE workspace_id = app_current_workspace_id() AND material_id = ANY($1::uuid[])`,
    [unique],
  );
  if (result.rows.length !== unique.length) {
    throw new ApplicationError('validation_failed', 'Every simulation material must be a registered plant in the active workspace.');
  }
}

async function requirePublishedRelease(
  client: pg.PoolClient,
  catalogReleaseId: string,
): Promise<{ id: string | null; version: string; contentHash: string | null }> {
  if (catalogReleaseId === USER_DECLARED_CATALOG_RELEASE) {
    return { id: null, version: USER_DECLARED_CATALOG_RELEASE, contentHash: null };
  }
  if (!UUID.test(catalogReleaseId)) {
    throw new ApplicationError('validation_failed', 'Catalog release identifier is invalid.');
  }
  const result = await client.query<{ id: string; version: string; content_hash: string }>(
    `SELECT id::text, version, content_hash
     FROM catalog_releases
     WHERE id = $1 AND state = 'approved' AND published_at IS NOT NULL`,
    [catalogReleaseId],
  );
  const release = result.rows[0];
  if (!release) {
    throw new ApplicationError('scientific_authority_unavailable', 'The selected catalog release is not independently approved and published.');
  }
  return { id: release.id, version: release.version, contentHash: release.content_hash };
}

function releaseGenotypePairs(request: GovernedAdvancedSimulationRequest): Array<{ locusId: string; alleleId: string }> {
  const pairs: Array<{ locusId: string; alleleId: string }> = [];
  const add = (locusId: string, alleles: readonly string[]) => {
    for (const alleleId of alleles) pairs.push({ locusId, alleleId });
  };
  if (request.mode === 'linked_two_locus') {
    for (const parent of [request.maternal, request.paternal]) {
      add(parent.firstLocusId, [parent.homologOne.firstLocusAllele, parent.homologTwo.firstLocusAllele]);
      add(parent.secondLocusId, [parent.homologOne.secondLocusAllele, parent.homologTwo.secondLocusAllele]);
    }
  } else if (request.mode === 'conditional_rule_graph') {
    for (const locus of request.offspring.loci) add(locus.locusId, locus.alleles);
  } else if (request.mode === 'host_pathogen') {
    for (const locus of request.hostGenotypes) add(locus.locusId, locus.alleles);
  } else if (request.mode === 'direct_monte_carlo') {
    for (const hypothesis of [...request.maternalHypotheses, ...request.paternalHypotheses]) {
      for (const locus of hypothesis.loci) add(locus.locusId, locus.alleles);
    }
  }
  return [...new Map(pairs.map((pair) => [`${pair.locusId}:${pair.alleleId}`, pair])).values()];
}

async function requireReleaseGenotypeMembership(
  client: pg.PoolClient,
  releaseId: string | null,
  request: GovernedAdvancedSimulationRequest,
): Promise<void> {
  if (!releaseId) return;
  const pairs = releaseGenotypePairs(request);
  if (pairs.some((pair) => !UUID.test(pair.locusId) || !UUID.test(pair.alleleId))) {
    throw new ApplicationError(
      'scientific_authority_unavailable',
      'Approved-release simulations require exact normalized locus and allele identifiers, not display symbols.',
    );
  }
  if (pairs.length === 0) return;
  const result = await client.query<{ locus_id: string; allele_id: string }>(
    `WITH requested AS (
       SELECT locus_id, allele_id
       FROM jsonb_to_recordset($2::jsonb) AS pair(locus_id uuid, allele_id uuid)
     )
     SELECT requested.locus_id::text, requested.allele_id::text
     FROM requested
     JOIN catalog_release_loci locus_member
       ON locus_member.release_id = $1 AND locus_member.locus_id = requested.locus_id
     JOIN catalog_release_alleles allele_member
       ON allele_member.release_id = $1 AND allele_member.allele_id = requested.allele_id
     JOIN catalog_alleles allele
       ON allele.id = requested.allele_id
      AND allele.locus_id = requested.locus_id
      AND allele.review_state = 'approved'`,
    [releaseId, JSON.stringify(pairs)],
  );
  const approved = new Set(result.rows.map((row) => `${row.locus_id}:${row.allele_id}`));
  if (approved.size !== pairs.length) {
    throw new ApplicationError(
      'scientific_authority_unavailable',
      'One or more locus–allele premises are not approved normalized members of the selected catalog release.',
    );
  }
}

function linkedParent(parent: Extract<GovernedAdvancedSimulationRequest, { mode: 'linked_two_locus' }>['maternal']): PhasedDiploidPair {
  return {
    firstLocusId: parent.firstLocusId,
    secondLocusId: parent.secondLocusId,
    homologOne: parent.homologOne,
    homologTwo: parent.homologTwo,
    phaseEvidence: parent.phaseEvidence,
  };
}

function normalizedLinkedResult(request: Extract<GovernedAdvancedSimulationRequest, { mode: 'linked_two_locus' }>) {
  const distribution = crossLinkedTwoLocus({
    maternal: linkedParent(request.maternal),
    paternal: linkedParent(request.paternal),
    maternalRecombinationFraction: rational(request.maternal.recombinationFraction),
    paternalRecombinationFraction: rational(request.paternal.recombinationFraction),
  });
  return {
    distribution: distribution.map((item) => ({
      genotype: item.value,
      probability: {
        numerator: item.probability.numerator.toString(),
        denominator: item.probability.denominator.toString(),
        decimal: item.probability.toNumber(),
      },
    })),
  };
}

function parsePredicate(value: unknown): RulePredicate {
  const input = record(value, 'rule predicate');
  const operator = requiredText(input.operator, 'rule predicate operator');
  if (!['contains', 'equals', 'not_contains', 'unknown'].includes(operator)) {
    throw new ApplicationError('scientific_authority_unavailable', `Unsupported approved predicate operator ${operator}.`);
  }
  return {
    locusId: requiredText(input.locusId, 'rule predicate locus'),
    operator: operator as RulePredicate['operator'],
    ...(input.alleleIds === undefined ? {} : { alleleIds: stringArray(input.alleleIds, 'rule predicate alleleIds') }),
    ...(input.genotypeIds === undefined ? {} : { genotypeIds: stringArray(input.genotypeIds, 'rule predicate genotypeIds') }),
  };
}

function parseRuleGraphNode(row: {
  id: string;
  rule_version: string;
  executable_expression: unknown;
  supporting_assertion_id: string;
}): ApprovedPhenotypeRuleGraphNode {
  const expression = record(row.executable_expression, 'approved phenotype rule expression');
  if (expression.kind !== 'phenotype_rule_graph_node_v1') {
    throw new ApplicationError('scientific_authority_unavailable', 'The approved phenotype rule is not an executable V1 rule-graph node.');
  }
  const penetranceInput = expression.penetrance === undefined ? null : record(expression.penetrance, 'rule penetrance');
  return {
    id: row.id,
    version: row.rule_version,
    priority: Number(expression.priority),
    approved: true,
    ...(expression.all === undefined ? {} : { all: (expression.all as unknown[]).map(parsePredicate) }),
    ...(expression.any === undefined ? {} : { any: (expression.any as unknown[]).map(parsePredicate) }),
    outcomePhenotypeId: requiredText(expression.outcomePhenotypeId, 'rule outcome phenotype'),
    ...(penetranceInput ? { penetrance: new Rational(requiredText(penetranceInput.numerator, 'penetrance numerator'), requiredText(penetranceInput.denominator, 'penetrance denominator')) } : {}),
    authority: 'conditional_supported',
    applicabilityId: requiredText(expression.applicabilityId, 'rule applicability'),
    sourceAssertionIds: [row.supporting_assertion_id],
  };
}

function parseHostPathogenRule(row: {
  id: string;
  rule_version: string;
  executable_expression: unknown;
  supporting_assertion_id: string;
}): ApprovedHostPathogenRule {
  const expression = record(row.executable_expression, 'approved host-pathogen rule expression');
  if (expression.kind !== 'host_pathogen_rule_v1') {
    throw new ApplicationError('scientific_authority_unavailable', 'The approved rule is not an executable V1 host-pathogen rule.');
  }
  const hostAlleles = stringArray(expression.hostAlleles, 'host alleles');
  if (hostAlleles.length !== 2) throw new ApplicationError('scientific_authority_unavailable', 'Host-pathogen rule must declare exactly two host alleles.');
  const outcome = requiredText(expression.outcome, 'host-pathogen outcome');
  const evidenceLevel = requiredText(expression.evidenceLevel, 'host-pathogen evidence level');
  if (!['supported_resistant', 'supported_susceptible'].includes(outcome) || !['high', 'moderate', 'limited'].includes(evidenceLevel)) {
    throw new ApplicationError('scientific_authority_unavailable', 'Host-pathogen rule has unsupported outcome or evidence level.');
  }
  return {
    id: row.id,
    version: row.rule_version,
    approved: true,
    hostLocusId: requiredText(expression.hostLocusId, 'host locus'),
    hostAlleles: [hostAlleles[0]!, hostAlleles[1]!],
    pathogenTaxon: requiredText(expression.pathogenTaxon, 'pathogen taxon'),
    ...(typeof expression.strain === 'string' ? { strain: expression.strain } : {}),
    ...(typeof expression.isolate === 'string' ? { isolate: expression.isolate } : {}),
    ...(typeof expression.race === 'string' ? { race: expression.race } : {}),
    ...(typeof expression.pathotype === 'string' ? { pathotype: expression.pathotype } : {}),
    ...(expression.requiredEffectors === undefined ? {} : { requiredEffectors: stringArray(expression.requiredEffectors, 'required effectors') }),
    ...(typeof expression.assayContextId === 'string' ? { assayContextId: expression.assayContextId } : {}),
    ...(typeof expression.environmentContextId === 'string' ? { environmentContextId: expression.environmentContextId } : {}),
    outcome: outcome as ApprovedHostPathogenRule['outcome'],
    evidenceLevel: evidenceLevel as ApprovedHostPathogenRule['evidenceLevel'],
    sourceAssertionIds: [row.supporting_assertion_id],
    ...(expression.warnings === undefined ? {} : { warnings: stringArray(expression.warnings, 'rule warnings') }),
  };
}

async function loadApprovedRules(
  client: pg.PoolClient,
  releaseId: string,
  ruleIds: readonly string[],
): Promise<Array<{ id: string; rule_version: string; executable_expression: unknown; supporting_assertion_id: string }>> {
  const result = await client.query<{
    id: string;
    rule_version: string;
    executable_expression: unknown;
    supporting_assertion_id: string;
  }>(
    `SELECT rule.id::text, rule.rule_version, rule.executable_expression, rule.supporting_assertion_id::text
     FROM phenotype_rules rule
     WHERE rule.catalog_release_id = $1
       AND rule.id = ANY($2::uuid[])
       AND rule.review_state = 'approved'
       AND rule.approved_by IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM catalog_release_assertions member
         WHERE member.release_id = $1 AND member.assertion_id = rule.supporting_assertion_id
       )`,
    [releaseId, [...ruleIds]],
  );
  if (new Set(result.rows.map((row) => row.id)).size !== new Set(ruleIds).size) {
    throw new ApplicationError('scientific_authority_unavailable', 'Every executable rule must be independently approved and included in the selected release.');
  }
  return result.rows;
}

async function persistCompleted(
  client: pg.PoolClient,
  principal: Principal,
  request: GovernedAdvancedSimulationRequest,
  inputHash: string,
  releaseId: string | null,
  modelType: string,
  modelVersion: string,
  calculationAuthority: GovernedSimulationOutcome['calculationAuthority'],
  premiseAuthority: PremiseAuthority,
  interpretationAuthority: GovernedSimulationOutcome['interpretationAuthority'],
  result: JsonRecord,
  assumptions: readonly string[],
  warnings: readonly string[],
  abstentions: readonly string[],
  evidenceIds: readonly string[] = [],
  diagnostics: JsonRecord = {},
): Promise<GovernedSimulationOutcome> {
  const requestId = randomUUID();
  const resultHash = stableContentHash({
    schemaVersion: CONTRACT_VERSION,
    inputHash,
    modelType,
    modelVersion,
    result,
    assumptions,
    warnings,
    abstentions,
  });
  const parentDirection = request.mode === 'linked_two_locus'
    ? { maternalMaterialId: request.maternal.materialId, paternalMaterialId: request.paternal.materialId, preserved: true }
    : request.mode === 'maternal_state'
      ? { maternalMaterialId: request.maternalMaterialId, paternalMaterialId: request.paternalMaterialId, preserved: true }
      : { preserved: false, reason: 'This governed interpretation evaluates one recorded material rather than a cross.' };
  const persisted = await client.query<{ value: { requestId: string; simulationRunId: string; resultHash: string } }>(
    `SELECT app_record_completed_advanced_simulation(
       $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,
       $10::simulation_calculation_authority,$11::simulation_premise_authority,$12::simulation_interpretation_authority,
       $13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22,$23::jsonb
     ) AS value`,
    [
      requestId,
      request.mode,
      CONTRACT_VERSION,
      releaseId,
      JSON.stringify(scientificInput(request)),
      inputHash,
      modelType,
      modelVersion,
      modelVersion,
      calculationAuthority,
      premiseAuthority,
      interpretationAuthority,
      JSON.stringify(parentDirection),
      JSON.stringify(evidenceIds),
      JSON.stringify([]),
      JSON.stringify(result),
      resultHash,
      JSON.stringify(assumptions),
      JSON.stringify(warnings),
      JSON.stringify(abstentions),
      request.clientRequestId,
      request.traceId,
      JSON.stringify(diagnostics),
    ],
  );
  const value = persisted.rows[0]?.value;
  if (!value) throw new ApplicationError('internal_error', 'The governed simulation was not persisted.', { retryable: true });
  await audit(client, principal, 'simulation.advanced.completed', 'simulation_run', value.simulationRunId, null, {
    requestId: value.requestId,
    mode: request.mode,
    inputHash,
    resultHash,
    calculationAuthority,
    premiseAuthority,
    interpretationAuthority,
  });
  return {
    schemaVersion: '2.0',
    requestId: value.requestId,
    state: 'completed',
    simulationRunId: value.simulationRunId,
    modelType,
    modelVersion,
    calculationAuthority,
    premiseAuthority,
    interpretationAuthority,
    inputHash,
    resultHash,
    result,
    warnings: [...warnings],
    abstentions: [...abstentions],
  };
}

export async function runGovernedAdvancedSimulation(
  pool: pg.Pool,
  principal: Principal,
  rawInput: GovernedAdvancedSimulationRequest,
): Promise<GovernedSimulationOutcome> {
  await enforceOperationAdmission(pool, principal, { scope: 'simulation.advanced', limit: 30, windowSeconds: 3600, activeJobTypes: ['genetics.direct-inheritance-monte-carlo.v1'], maxActiveJobs: 5 });
  authorize(principal, 'simulation.run');
  const request = governedAdvancedSimulationRequestSchema.parse(rawInput) as GovernedAdvancedSimulationRequest;
  if (request.workspaceId !== principal.workspaceId) {
    throw new ApplicationError('permission_denied', 'Simulation workspace does not match the active session.');
  }
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: request.traceId,
  }, (client) => executeIdempotent(client, principal, request.clientRequestId, request, async () => {
    const release = await requirePublishedRelease(client, request.catalogReleaseId);
    await requireReleaseGenotypeMembership(client, release.id, request);
    const inputHash = stableContentHash(scientificInput(request));

    if (request.mode === 'linked_two_locus') {
      await requireMaterials(client, [request.maternal.materialId, request.paternal.materialId]);
      const premiseAuthority = authorityFromEvidence([request.maternal.phaseEvidence, request.paternal.phaseEvidence]);
      const result = normalizedLinkedResult(request);
      return persistCompleted(
        client,
        principal,
        request,
        inputHash,
        release.id,
        'linked_two_locus',
        LINKAGE_MODEL,
        'exact',
        premiseAuthority,
        'genotype_only',
        result,
        ['Haplotype phase and recombination fractions are exactly those declared in the immutable input snapshot.'],
        premiseAuthority === 'verified' ? [] : ['Mathematical exactness does not upgrade inferred or assumed phase evidence.'],
        ['No phenotype, yield, flavor, pungency, or environmental outcome is inferred from this linked-genotype distribution.'],
      );
    }

    if (request.mode === 'maternal_state') {
      await requireMaterials(client, [request.maternalMaterialId, request.paternalMaterialId]);
      if (request.maternalState.evidenceState === 'unknown') {
        throw new ApplicationError('scientific_authority_unavailable', 'Unknown maternal state requires explicit alternative scenarios; it cannot be hidden inside one run.');
      }
      const result = transmitMaternalState({
        maternalPlantId: request.maternalMaterialId,
        paternalPlantId: request.paternalMaterialId,
        maternalState: request.maternalState,
      });
      return persistCompleted(
        client,
        principal,
        request,
        inputHash,
        release.id,
        'maternal_state',
        MATERNAL_MODEL,
        'exact',
        authorityFromEvidence([request.maternalState.evidenceState]),
        'genotype_only',
        {
          ...result,
          probability: {
            numerator: result.probability.numerator.toString(),
            denominator: result.probability.denominator.toString(),
            decimal: result.probability.toNumber(),
          },
        },
        ['The declared maternal state is transmitted under the selected maternal-inheritance system.'],
        [],
        ['This model does not establish nuclear genotype, fertility, yield, disease outcome, or phenotype.'],
      );
    }

    if (request.mode === 'conditional_rule_graph') {
      if (!release.id) throw new ApplicationError('scientific_authority_required', 'Conditional phenotype execution requires a published catalog release.');
      await requireMaterials(client, [request.materialId]);
      const rows = await loadApprovedRules(client, release.id, request.ruleIds);
      const rules = rows.map(parseRuleGraphNode);
      const result = evaluateApprovedRuleGraph({
        offspring: { loci: request.offspring.loci as DiploidGenotype[] },
        applicabilityId: request.applicabilityId,
        rules,
      });
      const premiseAuthority = authorityFromEvidence(request.offspring.loci.map((locus) => locus.evidenceState));
      const interpretationAuthority = result.authority === 'conditional_supported' ? 'conditional_phenotype' : 'unsupported';
      return persistCompleted(
        client,
        principal,
        request,
        inputHash,
        release.id,
        'conditional_rule_graph',
        RULE_GRAPH_MODEL,
        'exact',
        premiseAuthority,
        interpretationAuthority,
        {
          ...result,
          ...(result.state === 'resolved' ? {
            penetrance: {
              numerator: result.penetrance.numerator.toString(),
              denominator: result.penetrance.denominator.toString(),
              decimal: result.penetrance.toNumber(),
            },
          } : {}),
        },
        ['Only independently approved rules from the selected immutable release were eligible.'],
        result.state === 'conflicting' ? ['Approved equal-priority rules conflict.'] : [],
        result.state === 'resolved' ? ['The interpretation is conditional on exact genotype premises and the rule applicability context.'] : [...result.abstentions],
        rows.map((row) => row.supporting_assertion_id),
      );
    }

    if (request.mode === 'host_pathogen') {
      if (!release.id) throw new ApplicationError('scientific_authority_required', 'Host-pathogen interpretation requires a published catalog release.');
      await requireMaterials(client, [request.materialId]);
      const rows = await loadApprovedRules(client, release.id, request.ruleIds);
      const rules = rows.map(parseHostPathogenRule);
      const result = evaluateHostPathogenInteraction({
        hostGenotypes: request.hostGenotypes as DiploidGenotype[],
        context: request.context,
        rules,
      });
      const premiseAuthority = authorityFromEvidence(request.hostGenotypes.map((locus) => locus.evidenceState));
      return persistCompleted(
        client,
        principal,
        request,
        inputHash,
        release.id,
        'host_pathogen',
        HOST_PATHOGEN_MODEL,
        'exact',
        premiseAuthority,
        result.authority === 'conditional_supported' ? 'conditional_phenotype' : 'unsupported',
        { ...result },
        ['Host, pathogen, assay, and environment context are part of the immutable premise snapshot.'],
        result.warnings,
        result.abstentions,
        result.sourceAssertionIds,
      );
    }

    await requireMaterials(client, [request.maternalMaterialId, request.paternalMaterialId]);
    const states = [...request.maternalHypotheses, ...request.paternalHypotheses]
      .flatMap((hypothesis) => hypothesis.loci)
      .map((locus) => locus.evidenceState);
    const premiseAuthority = authorityFromEvidence(states);
    const requestId = randomUUID();
    const job = await enqueueJobInTransaction(client, principal, {
      jobType: 'genetics.direct-inheritance-monte-carlo.v1',
      contractVersion: '1.0.0',
      clientRequestId: `${request.clientRequestId}:worker`,
      traceId: request.traceId,
      payload: {
        requestId,
        maternalHypotheses: request.maternalHypotheses,
        paternalHypotheses: request.paternalHypotheses,
        seed: request.seed,
        sampleCount: request.sampleCount,
      },
    });
    await client.query(
      `INSERT INTO simulation_requests(
         id, workspace_id, requested_by, mode, contract_version, state, catalog_release_id,
         input_snapshot, input_hash, model_type, model_version, engine_version,
         calculation_authority, premise_authority, interpretation_authority,
         parent_direction, evidence_ids, genotype_call_ids, assumptions, warnings, abstentions,
         idempotency_key, trace_id, job_id
       ) VALUES (
         $1, app_current_workspace_id(), app_current_actor_user_id(), 'direct_monte_carlo', $2, 'queued', $3,
         $4::jsonb, $5, 'direct_monte_carlo', $6, $6,
         'approximate', $7, 'genotype_only', $8::jsonb, $9::jsonb, '[]'::jsonb,
         $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15
       )`,
      [
        requestId,
        CONTRACT_VERSION,
        release.id,
        JSON.stringify(scientificInput(request)),
        inputHash,
        MONTE_CARLO_MODEL,
        premiseAuthority,
        JSON.stringify({ maternalMaterialId: request.maternalMaterialId, paternalMaterialId: request.paternalMaterialId, preserved: true }),
        JSON.stringify([...new Set([...request.maternalHypotheses, ...request.paternalHypotheses].flatMap((hypothesis) => hypothesis.evidenceIds))]),
        JSON.stringify(['Direct meiosis sampling is used without enumerating the exact offspring state space.']),
        JSON.stringify(['This is a stochastic estimate with immutable seed, PRNG, sample count, and diagnostics.']),
        JSON.stringify(['The estimate does not guarantee recovery of any genotype and does not infer unsupported phenotype.']),
        request.clientRequestId,
        request.traceId,
        job.jobId,
      ],
    );
    await audit(client, principal, 'simulation.advanced.queued', 'simulation_request', requestId, null, {
      mode: request.mode,
      jobId: job.jobId,
      inputHash,
      seed: request.seed,
      sampleCount: request.sampleCount,
      premiseAuthority,
    });
    return {
      schemaVersion: '2.0',
      requestId,
      state: 'queued',
      jobId: job.jobId,
      modelType: 'direct_monte_carlo',
      modelVersion: MONTE_CARLO_MODEL,
      calculationAuthority: 'approximate',
      premiseAuthority,
      interpretationAuthority: 'genotype_only',
      inputHash,
      warnings: ['This queued result is a stochastic estimate, not an exact distribution.'],
      abstentions: ['No phenotype, yield, flavor, pungency, or environment claim will be generated.'],
    };
  }, 'simulation.advanced'));
}

export async function listAdvancedSimulationRequests(pool: pg.Pool, principal: Principal, limit = 100) {
  authorize(principal, 'simulation.read');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT request.id, request.mode, request.state::text, request.model_type, request.model_version,
            request.calculation_authority::text, request.premise_authority::text,
            request.interpretation_authority::text, request.input_hash, request.failure_code,
            request.job_id, request.simulation_run_id, request.requested_at::text, request.completed_at::text,
            job.state::text AS job_state, job.last_error_code
     FROM simulation_requests request
     LEFT JOIN jobs job ON job.workspace_id = request.workspace_id AND job.id = request.job_id
     WHERE request.workspace_id = app_current_workspace_id()
     ORDER BY request.requested_at DESC, request.id DESC
     LIMIT $1`,
    [Math.max(1, Math.min(250, Math.trunc(limit)))],
  )).rows);
}
