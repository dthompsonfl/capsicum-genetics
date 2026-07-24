import type pg from 'pg';
import {
  experimentCreateSchema,
  observationRecordSchema,
  observationSessionTransitionSchema,
  type ExperimentCreateInput,
  type ObservationRecordInput,
  type ObservationSessionTransitionInput,
  type Principal,
} from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import { ApplicationError, audit, authorize, executeIdempotent } from './internal';

interface DefinitionRow {
  id: string;
  trait_id: string;
  trait_version: string;
  value_contract: unknown;
  review_state: string;
  unit_id: string | null;
  vocabulary_version_id: string | null;
  applicability: unknown;
  protocol_id: string | null;
  method_id: string | null;
  missing_policy: unknown;
}

interface MethodRow {
  id: string;
  method_key: string;
  method_version: string;
  protocol_id: string | null;
  contract: unknown;
  review_state: string;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function assertValueContract(
  definition: DefinitionRow,
  input: ObservationRecordInput,
  termVocabularyId: string | null,
): void {
  const contract = object(definition.value_contract);
  const requiredType = typeof contract.type === 'string' ? contract.type : null;
  if (!requiredType) {
    throw new ApplicationError('scientific_authority_required', 'The observation definition has no executable value contract.');
  }
  if (requiredType !== input.value.type && input.value.type !== 'missing') {
    throw new ApplicationError('validation_failed', `This observation requires a ${requiredType} value.`);
  }
  if (input.authority === 'authoritative' && definition.review_state !== 'approved') {
    throw new ApplicationError('scientific_authority_required', 'Only independently approved observation definitions may create authoritative observations.');
  }
  if (input.value.type === 'number') {
    if (definition.unit_id && input.value.unitId !== definition.unit_id) {
      throw new ApplicationError('validation_failed', 'The selected unit does not match the approved definition version.');
    }
    if (typeof contract.minimum === 'number' && input.value.value < contract.minimum) {
      throw new ApplicationError('validation_failed', `The value must be at least ${contract.minimum}.`);
    }
    if (typeof contract.maximum === 'number' && input.value.value > contract.maximum) {
      throw new ApplicationError('validation_failed', `The value must be at most ${contract.maximum}.`);
    }
    if (typeof contract.precision === 'number' && Number.isInteger(contract.precision)) {
      const factor = 10 ** Math.max(0, Math.min(12, contract.precision));
      if (Math.abs(Math.round(input.value.value * factor) - input.value.value * factor) > Number.EPSILON * factor) {
        throw new ApplicationError('validation_failed', `The value exceeds the approved precision of ${contract.precision} decimal places.`);
      }
    }
  }
  if (input.value.type === 'category') {
    if (definition.vocabulary_version_id && input.value.vocabularyVersionId !== definition.vocabulary_version_id) {
      throw new ApplicationError('validation_failed', 'The selected vocabulary version does not match the approved definition version.');
    }
    if (termVocabularyId && termVocabularyId !== definition.vocabulary_version_id) {
      throw new ApplicationError('validation_failed', 'The selected controlled term does not belong to the required vocabulary version.');
    }
  }
  if (input.value.type === 'missing') {
    const policy = object(definition.missing_policy);
    const allowed = policy.allowed === true;
    const reasons = stringArray(policy.allowedReasons);
    if (!allowed || !reasons.includes(input.value.reason)) {
      throw new ApplicationError('validation_failed', 'The missing-value reason is not permitted by the approved definition version.');
    }
  }
  const applicability = object(definition.applicability);
  if (Array.isArray(applicability.allowedAuthorities)
      && !applicability.allowedAuthorities.includes(input.authority)) {
    throw new ApplicationError('scientific_authority_required', 'The definition is not applicable to the requested observation authority.');
  }
}

function valueMatchesJsonType(value: unknown, expected: string): boolean {
  if (expected === 'string') return typeof value === 'string';
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (expected === 'boolean') return typeof value === 'boolean';
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  if (expected === 'null') return value === null;
  return false;
}

function assertDeviceSchema(schemaValue: unknown, provenance: Record<string, unknown>): void {
  const schema = object(schemaValue);
  if (schema.type !== undefined && schema.type !== 'object') {
    throw new ApplicationError('scientific_authority_required', 'Only bounded object schemas are supported for authoritative device provenance.');
  }
  for (const key of stringArray(schema.required)) {
    if (!(key in provenance)) throw new ApplicationError('validation_failed', `Device provenance is missing required field “${key}”.`);
  }
  const properties = object(schema.properties);
  for (const [key, descriptorValue] of Object.entries(properties)) {
    if (!(key in provenance)) continue;
    const descriptor = object(descriptorValue);
    const expected = descriptor.type;
    if (typeof expected === 'string' && !valueMatchesJsonType(provenance[key], expected)) {
      throw new ApplicationError('validation_failed', `Device provenance field “${key}” must be ${expected}.`);
    }
    if (Array.isArray(descriptor.enum) && !descriptor.enum.some((item) => Object.is(item, provenance[key]))) {
      throw new ApplicationError('validation_failed', `Device provenance field “${key}” is outside its approved value set.`);
    }
  }
  if (schema.additionalProperties === false) {
    const allowed = new Set(Object.keys(properties));
    const unknown = Object.keys(provenance).find((key) => !allowed.has(key));
    if (unknown) throw new ApplicationError('validation_failed', `Device provenance field “${unknown}” is not allowed by the approved schema.`);
  }
}

export async function createExperiment(
  pool: pg.Pool,
  principal: Principal,
  rawInput: ExperimentCreateInput,
): Promise<{ experimentId: string; sessionId: string }> {
  authorize(principal, 'observation.write');
  const input = experimentCreateSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const protocolResult = await client.query<{
      id: string;
      protocol_key: string;
      version: string;
      contract: unknown;
      review_state: string;
    }>(
      `SELECT id::text, protocol_key, version, contract, review_state::text
       FROM capture_protocols WHERE id = $1`,
      [input.protocolId],
    );
    const protocol = protocolResult.rows[0];
    if (!protocol || protocol.review_state !== 'approved') {
      throw new ApplicationError('scientific_authority_required', 'Experiments require an independently approved exact observation protocol version.');
    }
    const protocolSnapshot = {
      id: protocol.id,
      protocolKey: protocol.protocol_key,
      version: protocol.version,
      contract: protocol.contract,
    };
    const experiment = await client.query<{ id: string }>(
      `INSERT INTO experiments(
         workspace_id, code, name, objective, environment, state, started_at, created_by,
         idempotency_key, protocol_id, protocol_snapshot
       ) VALUES ($1,$2,$3,$4,$5::jsonb,'active',$6,$7,$8,$9,$10::jsonb) RETURNING id`,
      [principal.workspaceId, input.code, input.name, input.objective, JSON.stringify(input.environment), input.startedAt,
        principal.userId, input.idempotencyKey, protocol.id, JSON.stringify(protocolSnapshot)],
    );
    const experimentId = experiment.rows[0]!.id;
    const session = await client.query<{ id: string }>(
      `INSERT INTO observation_sessions(
         workspace_id, experiment_id, protocol_id, protocol_key, protocol_version,
         state, state_version, opened_by, opened_at
       ) VALUES ($1,$2,$3,$4,$5,'open',1,$6,$7) RETURNING id`,
      [principal.workspaceId, experimentId, protocol.id, protocol.protocol_key, protocol.version, principal.userId, input.startedAt],
    );
    const sessionId = session.rows[0]!.id;
    await audit(client, principal, 'experiment.created', 'experiment', experimentId, null, {
      ...input,
      protocolSnapshot,
    });
    return { experimentId, sessionId };
  }, 'experiment.create'));
}

export async function transitionObservationSession(
  pool: pg.Pool,
  principal: Principal,
  rawInput: ObservationSessionTransitionInput,
): Promise<{ sessionId: string; state: string; stateVersion: number }> {
  authorize(principal, 'observation.write');
  const input = observationSessionTransitionSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const result = await client.query<{ state: string; state_version: number }>(
      `SELECT state, state_version FROM app_transition_observation_session($1,$2,$3,$4)`,
      [input.sessionId, input.transition, input.expectedStateVersion, input.reason ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new ApplicationError('internal_error', 'The observation session transition did not return a result.', { retryable: true });
    await audit(client, principal, `observation_session.${input.transition}`, 'observation_session', input.sessionId, null, row);
    return { sessionId: input.sessionId, state: row.state, stateVersion: row.state_version };
  }, 'observation_session.transition'));
}

export async function recordObservation(
  pool: pg.Pool,
  principal: Principal,
  rawInput: ObservationRecordInput,
): Promise<{ observationId: string; revisionId: string; revisionNumber: number; authority: string }> {
  authorize(principal, 'observation.write');
  const input = observationRecordSchema.parse(rawInput);
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.idempotencyKey,
  }, (client) => executeIdempotent(client, principal, input.idempotencyKey, input, async () => {
    const sessionResult = await client.query<{ state: string; protocol_id: string | null }>(
      `SELECT state, protocol_id::text FROM observation_sessions
       WHERE workspace_id = app_current_workspace_id() AND id = $1 FOR SHARE`,
      [input.sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) throw new ApplicationError('not_found', 'Observation session not found.');
    if (!['open', 'reopened'].includes(session.state)) {
      throw new ApplicationError('conflict', 'Observation session is not open for recording.');
    }
    const material = await client.query(
      `SELECT 1 FROM biological_materials WHERE workspace_id = app_current_workspace_id() AND id = $1`,
      [input.materialId],
    );
    if (!material.rows[0]) throw new ApplicationError('not_found', 'The selected biological material does not exist in this workspace.');

    const definitionResult = await client.query<DefinitionRow>(
      `SELECT id::text, trait_id, trait_version, value_contract, review_state::text,
              unit_id::text, vocabulary_version_id::text, applicability,
              protocol_id::text, method_id::text, missing_policy
       FROM observation_definitions WHERE id = $1`,
      [input.definitionId],
    );
    const definition = definitionResult.rows[0];
    if (!definition) throw new ApplicationError('not_found', 'Observation definition not found.');
    if (input.authority === 'authoritative' && (!definition.protocol_id || definition.protocol_id !== session.protocol_id)) {
      throw new ApplicationError('scientific_authority_required', 'The session protocol does not match the approved observation definition.');
    }

    let methodRecord: MethodRow | null = null;
    if (input.methodRecordId) {
      const result = await client.query<MethodRow>(
        `SELECT id::text, method_key, method_version, protocol_id::text, contract, review_state::text
         FROM observation_methods WHERE id = $1`,
        [input.methodRecordId],
      );
      methodRecord = result.rows[0] ?? null;
      if (!methodRecord || methodRecord.review_state !== 'approved') {
        throw new ApplicationError('scientific_authority_required', 'The selected observation method version is not approved.');
      }
      if (methodRecord.protocol_id && methodRecord.protocol_id !== session.protocol_id) {
        throw new ApplicationError('scientific_authority_required', 'The selected method is not applicable to this session protocol.');
      }
      if (input.authority === 'authoritative' && methodRecord.id !== definition.method_id) {
        throw new ApplicationError('scientific_authority_required', 'The authoritative method does not match the approved definition version.');
      }
    }
    const methodId = methodRecord?.method_key ?? input.methodId;
    const methodVersion = methodRecord?.method_version ?? input.methodVersion;
    if (!methodId || !methodVersion) throw new ApplicationError('validation_failed', 'An observation method identifier and version are required.');

    let termVocabularyId: string | null = null;
    let termId: string | null = null;
    let unitId: string | null = null;
    let missingReason: string | null = null;
    if (input.value.type === 'category' && input.value.termId) {
      const term = await client.query<{ vocabulary_id: string; active: boolean; vocabulary_review_state: string }>(
        `SELECT term.vocabulary_id::text, term.active, vocabulary.review_state::text AS vocabulary_review_state
         FROM controlled_terms term
         JOIN controlled_vocabularies vocabulary ON vocabulary.id = term.vocabulary_id
         WHERE term.id = $1`,
        [input.value.termId],
      );
      if (!term.rows[0]?.active || term.rows[0].vocabulary_review_state !== 'approved') {
        throw new ApplicationError('validation_failed', 'The selected controlled term or vocabulary version is unavailable.');
      }
      termVocabularyId = term.rows[0].vocabulary_id;
      termId = input.value.termId;
    }
    if (input.value.type === 'number') {
      unitId = input.value.unitId ?? definition.unit_id;
      if (unitId) {
        const unit = await client.query<{ review_state: string }>('SELECT review_state::text FROM measurement_units WHERE id = $1', [unitId]);
        if (unit.rows[0]?.review_state !== 'approved') throw new ApplicationError('validation_failed', 'The selected unit version is not approved.');
      }
    }
    if (input.value.type === 'missing') missingReason = input.value.reason;
    assertValueContract(definition, input, termVocabularyId);

    const qualityTermIds = [...new Set(input.qualityTermIds)].sort();
    if (qualityTermIds.length > 0) {
      const qualities = await client.query<{ id: string; review_state: string; allowed: boolean }>(
        `SELECT quality.id::text, quality.review_state::text,
                EXISTS (
                  SELECT 1 FROM observation_definition_quality_terms allowed
                  WHERE allowed.definition_id = $1 AND allowed.quality_term_id = quality.id
                ) AS allowed
         FROM observation_quality_terms quality WHERE quality.id = ANY($2::uuid[])`,
        [input.definitionId, qualityTermIds],
      );
      if (qualities.rows.length !== qualityTermIds.length || qualities.rows.some((row) => row.review_state !== 'approved')) {
        throw new ApplicationError('validation_failed', 'Every quality flag must reference an approved exact term version.');
      }
      if (input.authority === 'authoritative' && qualities.rows.some((row) => !row.allowed)) {
        throw new ApplicationError('scientific_authority_required', 'One or more quality terms are not allowed by the approved definition.');
      }
    }

    if (input.deviceProvenance) {
      if (input.deviceSchemaId) {
        const schemaResult = await client.query<{ json_schema: unknown; review_state: string }>(
          `SELECT json_schema, review_state::text FROM observation_device_schemas WHERE id = $1`,
          [input.deviceSchemaId],
        );
        const schema = schemaResult.rows[0];
        if (!schema || schema.review_state !== 'approved') {
          throw new ApplicationError('scientific_authority_required', 'The selected device schema version is not approved.');
        }
        assertDeviceSchema(schema.json_schema, input.deviceProvenance);
      } else if (input.authority === 'authoritative') {
        throw new ApplicationError('scientific_authority_required', 'Authoritative device provenance requires an approved schema version.');
      }
    }

    let observationId: string;
    let previousRevision: Record<string, unknown> | null = null;
    let revisionNumber = 1;
    if (input.correctionOfRevisionId) {
      const observation = await client.query<{
        id: string;
        material_id: string;
        definition_id: string;
        authority: string;
        current_revision_id: string | null;
        session_id: string | null;
      }>(
        `SELECT id, material_id::text, definition_id::text, authority::text, current_revision_id::text, session_id::text
         FROM observations
         WHERE workspace_id = app_current_workspace_id() AND id = (
           SELECT observation_id FROM observation_revisions
           WHERE workspace_id = app_current_workspace_id() AND id = $1
         )
         FOR UPDATE`,
        [input.expectedCurrentRevisionId],
      );
      const row = observation.rows[0];
      if (!row || row.current_revision_id !== input.correctionOfRevisionId) {
        throw new ApplicationError('stale_version', 'The observation changed before this correction was saved. Reload the current revision.');
      }
      if (row.material_id !== input.materialId || row.definition_id !== input.definitionId
          || row.authority !== input.authority || row.session_id !== input.sessionId) {
        throw new ApplicationError('conflict', 'Corrections cannot change observation identity, definition, session, material, or authority.');
      }
      const previous = await client.query<{ revision_number: number; [key: string]: unknown }>(
        `SELECT * FROM observation_revisions
         WHERE workspace_id = app_current_workspace_id() AND id = $1 FOR SHARE`,
        [input.correctionOfRevisionId],
      );
      if (!previous.rows[0]) throw new ApplicationError('not_found', 'The current observation revision does not exist.');
      previousRevision = previous.rows[0];
      revisionNumber = previous.rows[0].revision_number + 1;
      observationId = row.id;
    } else {
      const observation = await client.query<{ id: string }>(
        `INSERT INTO observations(
           workspace_id, material_id, definition_id, session_id, authority,
           definition_trait_id, definition_trait_version, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [principal.workspaceId, input.materialId, input.definitionId, input.sessionId, input.authority,
          definition.trait_id, definition.trait_version, principal.userId],
      );
      observationId = observation.rows[0]!.id;
    }

    const valuePayload = input.value.type === 'missing'
      ? { type: 'missing', reason: input.value.reason }
      : input.value;
    const revision = await client.query<{ id: string }>(
      `INSERT INTO observation_revisions(
         workspace_id, observation_id, method_id, method_version, method_record_id,
         value_payload, observed_at, recorded_by, supersedes_revision_id, correction_reason,
         revision_number, definition_id, authority, unit_id, term_id, quality_flags,
         quality_term_ids, missing_reason, device_schema_id, device_provenance, observer_timestamp
       ) VALUES (
         $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,'[]'::jsonb,
         $16::uuid[],$17,$18,$19::jsonb,$20
       ) RETURNING id`,
      [principal.workspaceId, observationId, methodId, methodVersion, methodRecord?.id ?? null,
        JSON.stringify(valuePayload), input.observedAt, principal.userId, input.correctionOfRevisionId ?? null,
        input.correctionReason ?? null, revisionNumber, input.definitionId, input.authority, unitId, termId,
        qualityTermIds, missingReason, input.deviceSchemaId ?? null,
        input.deviceProvenance ? JSON.stringify(input.deviceProvenance) : null, input.observedAt],
    );
    const revisionId = revision.rows[0]!.id;
    const updated = await client.query(
      `UPDATE observations SET current_revision_id = $3
       WHERE workspace_id = $1 AND id = $2 AND current_revision_id IS NOT DISTINCT FROM $4 RETURNING id`,
      [principal.workspaceId, observationId, revisionId, input.correctionOfRevisionId ?? null],
    );
    if (!updated.rows[0]) throw new ApplicationError('stale_version', 'The observation changed concurrently. No branch was created.');
    await audit(client, principal, input.correctionOfRevisionId ? 'observation.corrected' : 'observation.recorded',
      'observation', observationId, previousRevision, {
        revisionId,
        revisionNumber,
        authority: input.authority,
        definitionId: input.definitionId,
        methodRecordId: methodRecord?.id ?? null,
        qualityTermIds,
        deviceSchemaId: input.deviceSchemaId ?? null,
      });
    return { observationId, revisionId, revisionNumber, authority: input.authority };
  }, 'observation.record'));
}

export async function listExperiments(pool: pg.Pool, principal: Principal) {
  authorize(principal, 'observation.read');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => (
    await client.query(
      `SELECT experiment.id, experiment.code, experiment.name, experiment.objective,
              experiment.state, experiment.started_at::text, experiment.ended_at::text,
              protocol.protocol_key, protocol.version AS protocol_version,
              count(session.id)::int AS session_count
       FROM experiments experiment
       LEFT JOIN capture_protocols protocol ON protocol.id = experiment.protocol_id
       LEFT JOIN observation_sessions session ON session.workspace_id = experiment.workspace_id AND session.experiment_id = experiment.id
       WHERE experiment.workspace_id = app_current_workspace_id()
       GROUP BY experiment.id, protocol.protocol_key, protocol.version
       ORDER BY experiment.started_at DESC, experiment.id DESC LIMIT 100`,
    )
  ).rows);
}

export async function listObservationDefinitions(pool: pg.Pool, approvedOnly = true) {
  return (await pool.query(
    `SELECT definition.id, definition.trait_id, definition.trait_version, definition.display_name,
            definition.value_contract, definition.vocabulary_id, definition.review_state::text,
            definition.unit_id, definition.vocabulary_version_id, definition.applicability,
            definition.protocol_id, definition.method_id, definition.missing_policy,
            unit.symbol AS unit_symbol, vocabulary.title AS vocabulary_title,
            protocol.protocol_key, protocol.version AS protocol_version,
            method.method_key, method.method_version, method.display_name AS method_display_name,
            COALESCE(array_agg(quality.id::text ORDER BY quality.quality_key, quality.quality_version)
              FILTER (WHERE quality.id IS NOT NULL), '{}') AS allowed_quality_term_ids
     FROM observation_definitions definition
     LEFT JOIN measurement_units unit ON unit.id = definition.unit_id
     LEFT JOIN controlled_vocabularies vocabulary ON vocabulary.id = definition.vocabulary_version_id
     LEFT JOIN capture_protocols protocol ON protocol.id = definition.protocol_id
     LEFT JOIN observation_methods method ON method.id = definition.method_id
     LEFT JOIN observation_definition_quality_terms allowed ON allowed.definition_id = definition.id
     LEFT JOIN observation_quality_terms quality ON quality.id = allowed.quality_term_id
     WHERE ($1::boolean = false OR definition.review_state = 'approved')
     GROUP BY definition.id, unit.symbol, vocabulary.title, protocol.protocol_key, protocol.version,
              method.method_key, method.method_version, method.display_name
     ORDER BY definition.display_name, definition.trait_version`,
    [approvedOnly],
  )).rows;
}

export async function listObservationInputOptions(pool: pg.Pool) {
  const [protocols, methods, qualities, deviceSchemas, units, vocabularies, terms] = await Promise.all([
    pool.query(`SELECT id, protocol_key, version, contract FROM capture_protocols WHERE review_state = 'approved' ORDER BY protocol_key, version`),
    pool.query(`SELECT id, method_key, method_version, display_name, protocol_id, contract FROM observation_methods WHERE review_state = 'approved' ORDER BY display_name, method_version`),
    pool.query(`SELECT id, quality_key, quality_version, display_name, severity, definition FROM observation_quality_terms WHERE review_state = 'approved' ORDER BY severity, display_name`),
    pool.query(`SELECT id, schema_key, schema_version, display_name, json_schema FROM observation_device_schemas WHERE review_state = 'approved' ORDER BY display_name, schema_version`),
    pool.query(`SELECT id, unit_key, unit_version, symbol, dimension FROM measurement_units WHERE review_state = 'approved' ORDER BY dimension, symbol`),
    pool.query(`SELECT id, vocabulary_key, vocabulary_version, title FROM controlled_vocabularies WHERE review_state = 'approved' ORDER BY title, vocabulary_version`),
    pool.query(`SELECT term.id, term.vocabulary_id, term.term_key, term.label FROM controlled_terms term JOIN controlled_vocabularies vocabulary ON vocabulary.id = term.vocabulary_id WHERE term.active AND vocabulary.review_state = 'approved' ORDER BY term.vocabulary_id, term.label`),
  ]);
  return {
    protocols: protocols.rows,
    methods: methods.rows,
    qualityTerms: qualities.rows,
    deviceSchemas: deviceSchemas.rows,
    units: units.rows,
    vocabularies: vocabularies.rows,
    terms: terms.rows,
  };
}

export async function getObservationSession(pool: pg.Pool, principal: Principal, sessionId: string) {
  authorize(principal, 'observation.read');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const session = await client.query(
      `SELECT session.*, experiment.code AS experiment_code, experiment.name AS experiment_name,
              protocol.protocol_key AS governed_protocol_key, protocol.version AS governed_protocol_version
       FROM observation_sessions session
       LEFT JOIN experiments experiment ON experiment.workspace_id = session.workspace_id AND experiment.id = session.experiment_id
       LEFT JOIN capture_protocols protocol ON protocol.id = session.protocol_id
       WHERE session.workspace_id = app_current_workspace_id() AND session.id = $1`,
      [sessionId],
    );
    if (!session.rows[0]) return null;
    const observations = await client.query(
      `SELECT observation.id, observation.authority::text, material.material_code,
              definition.display_name, definition.trait_id, definition.trait_version,
              revision.id AS revision_id, revision.revision_number, revision.value_payload,
              revision.observed_at::text, revision.correction_reason, revision.quality_term_ids,
              revision.missing_reason, revision.device_provenance, unit.symbol AS unit_symbol,
              term.label AS term_label, method.display_name AS method_display_name,
              method.method_key, method.method_version, device_schema.display_name AS device_schema_name,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', quality.id,
                  'label', quality.display_name,
                  'severity', quality.severity,
                  'version', quality.quality_version
                ) ORDER BY quality.display_name)
                FROM observation_quality_terms quality
                WHERE quality.id = ANY(revision.quality_term_ids)
              ), '[]'::jsonb) AS quality_terms
       FROM observations observation
       JOIN biological_materials material ON material.workspace_id = observation.workspace_id AND material.id = observation.material_id
       JOIN observation_definitions definition ON definition.id = observation.definition_id
       JOIN observation_revisions revision ON revision.workspace_id = observation.workspace_id AND revision.id = observation.current_revision_id
       LEFT JOIN measurement_units unit ON unit.id = revision.unit_id
       LEFT JOIN controlled_terms term ON term.id = revision.term_id
       LEFT JOIN observation_methods method ON method.id = revision.method_record_id
       LEFT JOIN observation_device_schemas device_schema ON device_schema.id = revision.device_schema_id
       WHERE observation.workspace_id = app_current_workspace_id() AND observation.session_id = $1
       ORDER BY revision.observed_at DESC, observation.id`,
      [sessionId],
    );
    return { ...session.rows[0], observations: observations.rows };
  });
}

export async function getExperiment(pool: pg.Pool, principal: Principal, experimentId: string) {
  authorize(principal, 'observation.read');
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const experiment = await client.query(
      `SELECT experiment.*, protocol.protocol_key, protocol.version AS protocol_version
       FROM experiments experiment
       LEFT JOIN capture_protocols protocol ON protocol.id = experiment.protocol_id
       WHERE experiment.workspace_id = app_current_workspace_id() AND experiment.id = $1`,
      [experimentId],
    );
    if (!experiment.rows[0]) return null;
    const sessions = await client.query(
      `SELECT id, state, state_version, protocol_id, protocol_key, protocol_version,
              opened_at::text, closed_at::text, created_at::text
       FROM observation_sessions
       WHERE workspace_id = app_current_workspace_id() AND experiment_id = $1
       ORDER BY opened_at DESC, id DESC`,
      [experimentId],
    );
    return { ...experiment.rows[0], sessions: sessions.rows };
  });
}
