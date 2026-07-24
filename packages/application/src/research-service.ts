import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  deterministicResearchAnswer,
  validateAnswerCitations,
  type ResearchAnswer,
  type ResearchEvidence,
} from '@capsicum/ai';
import { generateHostedResearchAnswer } from '@capsicum/ai/hosted';
import { parseEnvironment } from '@capsicum/config';
import {
  researchDocumentIngestionSchema,
  type Principal,
  type ResearchDocumentIngestionInput,
} from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import { ApplicationError, audit, authorize, executeIdempotent } from './internal';
import { enforceOperationAdmission } from './admission-service';
import { enqueueJobInTransaction } from './operations-service';

const DETERMINISTIC_RESEARCH_MODEL = 'deterministic-approved-evidence@1';
const MAX_RETRIEVED_PASSAGES = 12;

export interface NavigableResearchEvidence extends ResearchEvidence {
  navigationPath: string;
  applicability: string | null;
  conflictNote: string | null;
}

async function retrieveApprovedEvidence(
  client: pg.PoolClient,
  principal: Principal,
  question: string,
): Promise<readonly NavigableResearchEvidence[]> {
  const result = await client.query<{
    evidence_id: string;
    title: string;
    passage: string;
    source_locator: string;
    workspace_id: string | null;
    navigation_path: string;
    applicability: string | null;
    conflict_note: string | null;
  }>(
    `WITH query AS (
       SELECT websearch_to_tsquery('english', $2) AS terms
     ), approved_workspace_passages AS (
       SELECT passage.id::text AS evidence_id,
              document.title,
              passage.passage_text AS passage,
              COALESCE(passage.locator, document.source_locator) AS source_locator,
              document.workspace_id::text AS workspace_id,
              '/research/sources/' || document.id::text || '#passage-' || passage.id::text AS navigation_path,
              NULL::text AS applicability,
              NULL::text AS conflict_note,
              ts_rank_cd(to_tsvector('english', document.title || ' ' || passage.passage_text), query.terms) AS rank
       FROM research_passages passage
       JOIN research_documents document
         ON document.workspace_id = passage.workspace_id
        AND document.id = passage.document_id
       CROSS JOIN query
       WHERE document.workspace_id = $1
         AND document.review_state = 'approved'
         AND passage.review_state = 'approved'
         AND passage.approved_by IS NOT NULL
         AND document.approved_by IS NOT NULL
     ), approved_catalog_assertions AS (
       SELECT assertion.id::text AS evidence_id,
              source.citation_text AS title,
              concat_ws(E'\\n', assertion.claim_text,
                'Applicability: ' || assertion.applicability,
                'Required conditions: ' || assertion.required_conditions,
                'Exclusions: ' || assertion.exclusions) AS passage,
              COALESCE(link.passage_locator, source.locator, source.source_id) AS source_locator,
              NULL::text AS workspace_id,
              '/scientific-catalog?assertion=' || assertion.id::text AS navigation_path,
              assertion.applicability,
              NULL::text AS conflict_note,
              ts_rank_cd(to_tsvector('english', source.citation_text || ' ' || assertion.claim_text || ' ' || assertion.applicability), query.terms) AS rank
       FROM evidence_assertions assertion
       JOIN evidence_assertion_sources link ON link.assertion_id = assertion.id
       JOIN scientific_sources source ON source.id = link.source_id
       CROSS JOIN query
       WHERE assertion.review_state = 'approved'
         AND source.review_state = 'approved'
     ), ranked AS (
       SELECT * FROM approved_workspace_passages
       UNION ALL
       SELECT * FROM approved_catalog_assertions
     )
     SELECT evidence_id, title, passage, source_locator, workspace_id,
            navigation_path, applicability, conflict_note
     FROM ranked
     WHERE rank > 0
     ORDER BY rank DESC, evidence_id
     LIMIT $3`,
    [principal.workspaceId, question.trim(), MAX_RETRIEVED_PASSAGES],
  );
  return result.rows.map((row): NavigableResearchEvidence => ({
    evidenceId: row.evidence_id,
    title: row.title,
    passage: row.passage,
    sourceLocator: row.source_locator,
    reviewState: 'approved',
    workspaceId: row.workspace_id,
    navigationPath: row.navigation_path,
    applicability: row.applicability,
    conflictNote: row.conflict_note,
  }));
}

export interface PersistedResearchAnswer {
  interactionId: string;
  answer: ResearchAnswer;
  evidence: readonly NavigableResearchEvidence[];
  modelId: string;
  provider: 'deterministic_local' | 'gateway';
  hostedFallbackCode?: 'provider_failure' | 'timeout' | 'citation_revalidation_failed';
}

async function loadCurrentlyApprovedEvidenceByIds(
  client: pg.PoolClient,
  principal: Principal,
  evidenceIds: readonly string[],
): Promise<readonly NavigableResearchEvidence[]> {
  if (evidenceIds.length === 0) return [];
  const result = await client.query<{
    evidence_id: string;
    title: string;
    passage: string;
    source_locator: string;
    workspace_id: string | null;
    navigation_path: string;
    applicability: string | null;
    conflict_note: string | null;
  }>(
    `WITH requested AS (SELECT unnest($2::uuid[]) AS evidence_id), approved AS (
       SELECT passage.id AS evidence_uuid,
              passage.id::text AS evidence_id,
              document.title,
              passage.passage_text AS passage,
              COALESCE(passage.locator, document.source_locator) AS source_locator,
              document.workspace_id::text AS workspace_id,
              '/research/sources/' || document.id::text || '#passage-' || passage.id::text AS navigation_path,
              NULL::text AS applicability,
              NULL::text AS conflict_note
       FROM research_passages passage
       JOIN research_documents document
         ON document.workspace_id = passage.workspace_id
        AND document.id = passage.document_id
       WHERE document.workspace_id = $1
         AND document.review_state = 'approved'
         AND passage.review_state = 'approved'
         AND passage.approved_by IS NOT NULL
         AND document.approved_by IS NOT NULL
       UNION ALL
       SELECT assertion.id AS evidence_uuid,
              assertion.id::text AS evidence_id,
              source.citation_text AS title,
              concat_ws(E'\n', assertion.claim_text,
                'Applicability: ' || assertion.applicability,
                'Required conditions: ' || assertion.required_conditions,
                'Exclusions: ' || assertion.exclusions) AS passage,
              COALESCE(link.passage_locator, source.locator, source.source_id) AS source_locator,
              NULL::text AS workspace_id,
              '/scientific-catalog?assertion=' || assertion.id::text AS navigation_path,
              assertion.applicability,
              NULL::text AS conflict_note
       FROM evidence_assertions assertion
       JOIN evidence_assertion_sources link ON link.assertion_id = assertion.id
       JOIN scientific_sources source ON source.id = link.source_id
       WHERE assertion.review_state = 'approved'
         AND source.review_state = 'approved'
     )
     SELECT approved.evidence_id, approved.title, approved.passage, approved.source_locator,
            approved.workspace_id, approved.navigation_path, approved.applicability, approved.conflict_note
     FROM requested
     JOIN approved ON approved.evidence_uuid = requested.evidence_id
     ORDER BY array_position($2::uuid[], requested.evidence_id)`,
    [principal.workspaceId, [...evidenceIds]],
  );
  return result.rows.map((row): NavigableResearchEvidence => ({
    evidenceId: row.evidence_id,
    title: row.title,
    passage: row.passage,
    sourceLocator: row.source_locator,
    reviewState: 'approved',
    workspaceId: row.workspace_id,
    navigationPath: row.navigation_path,
    applicability: row.applicability,
    conflictNote: row.conflict_note,
  }));
}

function hostedFailureCode(error: unknown): 'provider_failure' | 'timeout' {
  if (error instanceof Error && (error.name === 'AbortError' || /timed out|timeout/i.test(error.message))) {
    return 'timeout';
  }
  return 'provider_failure';
}

export async function answerResearchQuestion(
  pool: pg.Pool,
  principal: Principal,
  question: string,
): Promise<PersistedResearchAnswer> {
  await enforceOperationAdmission(pool, principal, { scope: 'research.answer', limit: 60, windowSeconds: 3600 });
  authorize(principal, 'research.ask');
  const normalizedQuestion = question.trim();
  if (!normalizedQuestion || normalizedQuestion.length > 4_000) {
    throw new TypeError('Question is required and must not exceed 4,000 characters.');
  }

  const retrievedEvidence = await withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, (client) => retrieveApprovedEvidence(client, principal, normalizedQuestion));

  const environment = parseEnvironment(process.env);
  let answer = deterministicResearchAnswer(normalizedQuestion, retrievedEvidence, principal.workspaceId);
  let modelId = DETERMINISTIC_RESEARCH_MODEL;
  let provider: 'deterministic_local' | 'gateway' = 'deterministic_local';
  let providerModelVersion: string | null = DETERMINISTIC_RESEARCH_MODEL;
  let latencyMs = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let costMicrounits: number | null = null;
  let fallbackCode: PersistedResearchAnswer['hostedFallbackCode'];
  let hostedSafetyEvaluation: unknown = null;
  let promptPolicyVersion: string | null = null;

  if (
    environment.ENABLE_HOSTED_AI === 'true'
    && environment.AI_PROVIDER === 'gateway'
    && environment.AI_GATEWAY_API_KEY
    && retrievedEvidence.length > 0
  ) {
    try {
      const hosted = await generateHostedResearchAnswer({
        modelId: environment.AI_MODEL_ID,
        workspaceId: principal.workspaceId,
        question: normalizedQuestion,
        evidence: retrievedEvidence,
        timeoutMs: environment.AI_TIMEOUT_MS,
        maxRetries: environment.AI_MAX_RETRIES,
        maxOutputTokens: environment.AI_MAX_OUTPUT_TOKENS,
        inputCostMicrounitsPerMillionTokens: environment.AI_INPUT_COST_MICROUNITS_PER_MILLION_TOKENS,
        outputCostMicrounitsPerMillionTokens: environment.AI_OUTPUT_COST_MICROUNITS_PER_MILLION_TOKENS,
        maxCostMicrounits: environment.AI_MAX_COST_MICROUNITS_PER_REQUEST,
      });
      answer = hosted.answer;
      modelId = hosted.modelId;
      provider = hosted.provider;
      providerModelVersion = hosted.providerModelVersion;
      latencyMs = hosted.latencyMs;
      inputTokens = hosted.inputTokens ?? null;
      outputTokens = hosted.outputTokens ?? null;
      costMicrounits = hosted.costMicrounits ?? null;
      hostedSafetyEvaluation = hosted.safetyEvaluation;
      promptPolicyVersion = hosted.promptPolicyVersion;
    } catch (error) {
      fallbackCode = hostedFailureCode(error);
    }
  }

  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const citationIds = answer.citations.map((citation) => citation.evidenceId);
    let currentEvidence = await loadCurrentlyApprovedEvidenceByIds(client, principal, citationIds);
    try {
      answer = validateAnswerCitations(answer, currentEvidence, principal.workspaceId);
      if (currentEvidence.length !== new Set(citationIds).size) {
        throw new RangeError('One or more cited passages are no longer approved.');
      }
    } catch {
      const refreshedEvidence = await retrieveApprovedEvidence(client, principal, normalizedQuestion);
      answer = deterministicResearchAnswer(normalizedQuestion, refreshedEvidence, principal.workspaceId);
      currentEvidence = await loadCurrentlyApprovedEvidenceByIds(
        client,
        principal,
        answer.citations.map((citation) => citation.evidenceId),
      );
      modelId = DETERMINISTIC_RESEARCH_MODEL;
      provider = 'deterministic_local';
      providerModelVersion = DETERMINISTIC_RESEARCH_MODEL;
      latencyMs = 0;
      inputTokens = null;
      outputTokens = null;
      costMicrounits = null;
      fallbackCode = 'citation_revalidation_failed';
    }

    const interaction = await client.query<{ id: string }>(
      `INSERT INTO ai_interactions(
         workspace_id, question, answer_payload, authority, model_id, evidence_ids, created_by,
         provider, provider_model_version, latency_ms, input_tokens, output_tokens,
         cost_microunits, abstained
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6::uuid[], $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        principal.workspaceId,
        normalizedQuestion,
        JSON.stringify(answer),
        answer.authority,
        modelId,
        answer.citations.map((item) => item.evidenceId),
        principal.userId,
        provider,
        providerModelVersion,
        latencyMs,
        inputTokens,
        outputTokens,
        costMicrounits,
        answer.authority === 'unsupported',
      ],
    );
    const interactionId = interaction.rows[0]?.id;
    if (!interactionId) throw new Error('Research interaction was not persisted.');
    await client.query(
      `INSERT INTO ai_tool_calls(
         workspace_id, interaction_id, tool_name, input_payload, output_payload, authorized
       ) VALUES ($1, $2, 'retrieve_approved_evidence', $3::jsonb, $4::jsonb, true)`,
      [
        principal.workspaceId,
        interactionId,
        JSON.stringify({ queryLength: normalizedQuestion.length, maximumCandidates: MAX_RETRIEVED_PASSAGES }),
        JSON.stringify({ evidenceIds: retrievedEvidence.map((item) => item.evidenceId), count: retrievedEvidence.length }),
      ],
    );
    if (provider === 'gateway' || fallbackCode) {
      await client.query(
        `INSERT INTO ai_tool_calls(
           workspace_id, interaction_id, tool_name, input_payload, output_payload, authorized
         ) VALUES ($1, $2, 'hosted_structured_generation', $3::jsonb, $4::jsonb, true)`,
        [
          principal.workspaceId,
          interactionId,
          JSON.stringify({ modelId, evidenceCount: retrievedEvidence.length, timeoutMs: environment.AI_TIMEOUT_MS }),
          JSON.stringify({ provider, fallbackCode: fallbackCode ?? null, citationCount: answer.citations.length, promptPolicyVersion, safetyEvaluation: hostedSafetyEvaluation, costMicrounits }),
        ],
      );
    }
    await audit(client, principal, 'research.answer.created', 'ai_interaction', interactionId, null, {
      authority: answer.authority,
      evidenceCount: currentEvidence.length,
      modelId,
      provider,
      fallbackCode: fallbackCode ?? null,
    });
    return {
      interactionId,
      answer,
      evidence: currentEvidence,
      modelId,
      provider,
      ...(fallbackCode === undefined ? {} : { hostedFallbackCode: fallbackCode }),
    };
  });
}

export async function listResearchInteractions(
  pool: pg.Pool,
  principal: Principal,
  limit = 25,
): Promise<readonly Record<string, unknown>[]> {
  authorize(principal, 'research.ask');
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const result = await client.query(
      `SELECT id, question, answer_payload, authority, model_id, evidence_ids, created_at
       FROM ai_interactions
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [principal.workspaceId, safeLimit],
    );
    return result.rows;
  });
}


export async function listResearchSources(pool: pg.Pool, principal: Principal, limit = 100) {
  authorize(principal, 'research.ask');
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => (await client.query(
    `SELECT document.id, document.title, document.source_locator, document.document_version,
            document.source_sha256, document.review_state::text, document.ingestion_state::text,
            document.ingestion_failure_code, document.ingestion_job_id, document.created_at::text,
            job.state::text AS worker_state, job.last_error_code,
            count(passage.id)::int AS passage_count,
            count(passage.id) FILTER (WHERE passage.review_state = 'approved')::int AS approved_passage_count
     FROM research_documents document
     LEFT JOIN research_passages passage
       ON passage.workspace_id = document.workspace_id AND passage.document_id = document.id
     LEFT JOIN jobs job
       ON job.workspace_id = document.workspace_id AND job.id = document.ingestion_job_id
     WHERE document.workspace_id = app_current_workspace_id()
     GROUP BY document.id
     ORDER BY document.created_at DESC, document.id DESC
     LIMIT $1`,
    [safeLimit],
  )).rows);
}

export async function getResearchSourceDetail(pool: pg.Pool, principal: Principal, documentId: string) {
  authorize(principal, 'research.ask');
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
  }, async (client) => {
    const document = (await client.query(
      `SELECT document.id, document.title, document.source_locator, document.document_version,
              document.source_sha256, document.object_key, document.review_state::text,
              document.source_media_type, document.source_byte_length, document.ingestion_state::text,
              document.ingestion_failure_code, document.ingestion_job_id,
              job.state::text AS worker_state, job.attempt AS worker_attempt,
              job.last_error_code AS worker_error_code,
              document.created_at::text, creator.display_name AS created_by_name,
              approver.display_name AS approved_by_name, document.approved_at::text
       FROM research_documents document
       JOIN users creator ON creator.id = document.created_by
       LEFT JOIN jobs job ON job.workspace_id = document.workspace_id AND job.id = document.ingestion_job_id
       LEFT JOIN users approver ON approver.id = document.approved_by
       WHERE document.workspace_id = app_current_workspace_id() AND document.id = $1`,
      [documentId],
    )).rows[0] ?? null;
    if (!document) return null;
    const passages = (await client.query(
      `SELECT passage.id, passage.passage_index, passage.passage_version,
              passage.passage_text, passage.passage_sha256, passage.locator,
              passage.page_start, passage.page_end, passage.character_start, passage.character_end,
              passage.review_state::text, passage.approved_at::text,
              author.display_name AS authored_by_name, reviewer.display_name AS approved_by_name
       FROM research_passages passage
       LEFT JOIN users author ON author.id = passage.authored_by
       LEFT JOIN users reviewer ON reviewer.id = passage.approved_by
       WHERE passage.workspace_id = app_current_workspace_id() AND passage.document_id = $1
       ORDER BY passage.passage_index, passage.passage_version DESC`,
      [documentId],
    )).rows;
    const artifacts = (await client.query(
      `SELECT id, extractor_name, extractor_version, source_sha256, artifact_sha256,
              page_count, extraction_metadata, created_at::text
       FROM research_extraction_artifacts
       WHERE workspace_id = app_current_workspace_id() AND document_id = $1
       ORDER BY created_at DESC`,
      [documentId],
    )).rows;
    return { document, passages, artifacts };
  });
}


export async function createResearchDocumentIngestion(
  pool: pg.Pool,
  principal: Principal,
  rawInput: ResearchDocumentIngestionInput & { pendingUploadId: string },
): Promise<{ documentId: string; jobId: string; state: 'queued' }> {
  await enforceOperationAdmission(pool, principal, { scope: 'research.ingestion', limit: 12, windowSeconds: 3600, activeJobTypes: ['research.ingest.v1'], maxActiveJobs: 4 });
  authorize(principal, 'catalog.curate');
  const input = researchDocumentIngestionSchema.parse(rawInput) as ResearchDocumentIngestionInput;
  if (input.mediaType === 'application/pdf') {
    throw new ApplicationError(
      'unavailable',
      'PDF ingestion requires an approved bounded PDF extraction adapter. Upload UTF-8 plain text or Markdown in this deployment.',
      { retryable: false },
    );
  }
  return withWorkspaceTransaction(pool, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    requestId: input.traceId,
  }, (client) => executeIdempotent(client, principal, input.clientRequestId, input, async () => {
    if (input.supersedesDocumentId) {
      const predecessor = await client.query<{ review_state: string }>(
        `SELECT review_state::text
         FROM research_documents
         WHERE workspace_id = app_current_workspace_id() AND id = $1
         FOR SHARE`,
        [input.supersedesDocumentId],
      );
      if (!predecessor.rows[0]) throw new ApplicationError('not_found', 'The superseded research document was not found.');
      if (predecessor.rows[0].review_state !== 'approved') {
        throw new ApplicationError('conflict', 'Only an approved research document may be superseded by a new immutable version.');
      }
    }
    const documentId = randomUUID();
    const job = await enqueueJobInTransaction(client, principal, {
      jobType: 'research.ingest.v1',
      contractVersion: '1.0.0',
      clientRequestId: `${input.clientRequestId}:worker`,
      traceId: input.traceId,
      payload: {
        documentId,
        objectKey: input.objectKey,
        sourceSha256: input.sourceSha256,
        mediaType: input.mediaType,
        byteLength: input.byteLength,
        fileName: input.fileName,
      },
    });
    await client.query(
      `INSERT INTO research_documents(
         id, workspace_id, title, source_locator, document_version, source_sha256,
         object_key, review_state, created_by, supersedes_document_id, ingestion_job_id,
         source_media_type, source_byte_length, ingestion_state
       ) VALUES (
         $1, app_current_workspace_id(), $2, $3, $4, $5, $6,
         'draft', app_current_actor_user_id(), $7, $8, $9, $10, 'queued'
       )`,
      [
        documentId,
        input.title,
        input.sourceLocator,
        input.documentVersion,
        input.sourceSha256,
        input.objectKey,
        input.supersedesDocumentId ?? null,
        job.jobId,
        input.mediaType,
        input.byteLength,
      ],
    );
    await audit(client, principal, 'research.document.ingestion_queued', 'research_document', documentId, null, {
      jobId: job.jobId,
      sourceSha256: input.sourceSha256,
      mediaType: input.mediaType,
      byteLength: input.byteLength,
      supersedesDocumentId: input.supersedesDocumentId ?? null,
    });
    await client.query('SELECT app_attach_pending_object_upload($1,$2,$3)', [rawInput.pendingUploadId, 'research_document', documentId]);
    return { documentId, jobId: job.jobId, state: 'queued' as const };
  }, 'research.document.ingest'));
}
