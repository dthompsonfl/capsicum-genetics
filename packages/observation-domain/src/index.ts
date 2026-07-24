export type ObservationAuthority = 'research_draft' | 'authoritative';

export type ObservationValue =
  | { type: 'number'; value: number; unitId: string | null }
  | { type: 'category'; termId: string; vocabularyVersionId: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'text'; value: string }
  | { type: 'missing'; reason: string };

export interface ObservationRevision {
  revisionId: string;
  observationId: string;
  sessionId: string;
  materialId: string;
  definitionId: string;
  definitionVersion: string;
  methodRecordId: string | null;
  methodId: string | null;
  methodVersion: string | null;
  deviceSchemaId: string | null;
  qualityTermIds: readonly string[];
  authority: ObservationAuthority;
  value: ObservationValue;
  observedAt: string;
  recordedBy: string;
  supersedesRevisionId: string | null;
  reason: string | null;
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new TypeError(`${label} is required.`);
}

export function validateObservationRevision(
  revision: ObservationRevision,
  previous?: ObservationRevision,
): void {
  required(revision.revisionId, 'revisionId');
  required(revision.observationId, 'observationId');
  required(revision.sessionId, 'sessionId');
  required(revision.materialId, 'materialId');
  required(revision.definitionId, 'definitionId');
  required(revision.definitionVersion, 'definitionVersion');
  required(revision.recordedBy, 'recordedBy');
  if (!Number.isFinite(Date.parse(revision.observedAt))) {
    throw new TypeError('observedAt must be an ISO-8601 timestamp.');
  }
  if (new Set(revision.qualityTermIds).size !== revision.qualityTermIds.length) {
    throw new RangeError('qualityTermIds cannot contain duplicates.');
  }
  if (revision.authority === 'authoritative' && !revision.methodRecordId) {
    throw new RangeError('Authoritative observations require an approved exact method record.');
  }
  if (revision.authority === 'research_draft' && !revision.methodRecordId && (!revision.methodId?.trim() || !revision.methodVersion?.trim())) {
    throw new RangeError('Draft observations require an approved method record or an explicit method identifier and version.');
  }
  if (revision.value.type === 'number') {
    if (!Number.isFinite(revision.value.value)) throw new RangeError('Numeric observation values must be finite.');
    if (revision.authority === 'authoritative' && !revision.value.unitId?.trim()) {
      throw new RangeError('Authoritative numeric observations require an approved unit version.');
    }
  } else if (revision.value.type === 'category') {
    required(revision.value.termId, 'category termId');
    required(revision.value.vocabularyVersionId, 'category vocabularyVersionId');
  } else if (revision.value.type === 'text') {
    required(revision.value.value, 'text observation value');
  } else if (revision.value.type === 'missing') {
    required(revision.value.reason, 'missing-value reason');
  }

  if (!previous) {
    if (revision.supersedesRevisionId !== null) {
      throw new RangeError('The first observation revision cannot supersede another revision.');
    }
    return;
  }
  if (revision.observationId !== previous.observationId) {
    throw new RangeError('A revision cannot supersede a different observation.');
  }
  if (revision.supersedesRevisionId !== previous.revisionId) {
    throw new RangeError('A correction must directly reference the current revision it supersedes.');
  }
  if (!revision.reason?.trim()) {
    throw new RangeError('A correction reason is required.');
  }
  if (
    revision.sessionId !== previous.sessionId
    || revision.materialId !== previous.materialId
    || revision.definitionId !== previous.definitionId
    || revision.definitionVersion !== previous.definitionVersion
    || revision.authority !== previous.authority
  ) {
    throw new RangeError('Corrections cannot change observation identity, definition version, session, material, or authority. Create a new observation instead.');
  }
}
