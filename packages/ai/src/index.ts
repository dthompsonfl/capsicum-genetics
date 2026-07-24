import { z } from 'zod';

const identifier = z.string().trim().min(1).max(200);
const questionSchema = z.string().trim().min(1).max(4_000);

export interface ResearchEvidence {
  evidenceId: string;
  title: string;
  passage: string;
  sourceLocator: string;
  reviewState: 'draft' | 'in_review' | 'approved' | 'rejected' | 'superseded';
  workspaceId: string | null;
}

export interface ResearchCitation {
  evidenceId: string;
  claim: string;
  supportingQuote: string;
}

export interface ResearchAnswer {
  schemaVersion: '1.0';
  authority: 'evidence_summary' | 'hypothesis_only' | 'unsupported';
  answer: string;
  citations: ResearchCitation[];
  assumptions: string[];
  abstentions: string[];
}

export const researchEvidenceSchema = z.object({
  evidenceId: identifier,
  title: z.string().trim().min(1).max(500),
  passage: z.string().trim().min(1).max(12_000),
  sourceLocator: z.string().trim().min(1).max(2_000),
  reviewState: z.enum(['draft', 'in_review', 'approved', 'rejected', 'superseded']),
  workspaceId: identifier.nullable(),
});

export const researchAnswerSchema = z.object({
  schemaVersion: z.literal('1.0'),
  authority: z.enum(['evidence_summary', 'hypothesis_only', 'unsupported']),
  answer: z.string().trim().min(1).max(12_000),
  citations: z.array(z.object({
    evidenceId: identifier,
    claim: z.string().trim().min(1).max(2_000),
    supportingQuote: z.string().trim().min(8).max(2_000),
  })).max(50),
  assumptions: z.array(z.string().trim().min(1).max(1_000)).max(50),
  abstentions: z.array(z.string().trim().min(1).max(1_000)).max(50),
});

function validateWorkspaceId(workspaceId: string): string {
  return identifier.parse(workspaceId) as string;
}

export function approvedEvidenceForWorkspace(
  evidence: readonly ResearchEvidence[],
  workspaceId: string,
): readonly ResearchEvidence[] {
  const validatedWorkspaceId = validateWorkspaceId(workspaceId);
  return evidence.filter(
    (item) =>
      item.reviewState === 'approved' &&
      (item.workspaceId === null || item.workspaceId === validatedWorkspaceId),
  );
}

export function validateAnswerCitations(
  answer: ResearchAnswer,
  evidence: readonly ResearchEvidence[],
  workspaceId: string,
): ResearchAnswer {
  const approved = approvedEvidenceForWorkspace(evidence, workspaceId);
  const allowed = new Set(approved.map((item) => item.evidenceId));
  const invalid = answer.citations.filter((citation) => !allowed.has(citation.evidenceId));
  if (invalid.length > 0) {
    throw new RangeError(
      `Answer cites evidence that is unapproved, unavailable, or outside the workspace: ${invalid
        .map((item) => item.evidenceId)
        .join(', ')}.`,
    );
  }
  if (answer.authority === 'evidence_summary' && answer.citations.length === 0) {
    throw new RangeError('An evidence summary must include at least one approved citation.');
  }
  if (answer.authority === 'unsupported' && answer.citations.length > 0) {
    throw new RangeError('An unsupported answer must not cite evidence as support.');
  }
  return researchAnswerSchema.parse(answer) as ResearchAnswer;
}

export function deterministicResearchAnswer(
  question: string,
  evidence: readonly ResearchEvidence[],
  workspaceId: string,
): ResearchAnswer {
  const normalizedQuestion = questionSchema.parse(question) as string;
  const approved = approvedEvidenceForWorkspace(evidence, workspaceId);
  if (approved.length === 0) {
    return {
      schemaVersion: '1.0',
      authority: 'unsupported',
      answer: 'No approved evidence passages are available for an authoritative answer.',
      citations: [],
      assumptions: [],
      abstentions: [
        'Draft, rejected, superseded, or out-of-workspace records were not used as scientific authority.',
        'The assistant did not infer a genotype, phenotype, or causal relationship.',
      ],
    };
  }
  const selected = approved.slice(0, 5);
  return validateAnswerCitations(
    {
      schemaVersion: '1.0',
      authority: 'evidence_summary',
      answer: `Approved evidence relevant to “${normalizedQuestion}” is available in ${selected.length} passage${selected.length === 1 ? '' : 's'}. Review the cited source text and applicability limits before using it in a breeding decision.`,
      citations: selected.map((item) => ({
        evidenceId: item.evidenceId,
        claim: item.title,
        supportingQuote: item.passage.slice(0, 2_000),
      })),
      assumptions: ['Passages were revalidated for the current workspace and approved review state.'],
      abstentions: ['No scientific claim was generated beyond the supplied approved passages.'],
    },
    selected,
    workspaceId,
  );
}

/**
 * Serializes evidence as data rather than markup so passage text cannot terminate
 * an application-defined delimiter. The model must still treat every field as
 * untrusted content, never as an instruction.
 */
export function buildEvidenceContext(evidence: readonly ResearchEvidence[]): string {
  return JSON.stringify(
    evidence.map((item) => ({
      evidenceId: item.evidenceId,
      title: item.title,
      reviewState: item.reviewState,
      sourceLocator: item.sourceLocator,
      passage: item.passage,
    })),
  );
}
