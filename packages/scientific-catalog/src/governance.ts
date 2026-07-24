export type CatalogReviewState =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'superseded';

export interface CatalogReviewSnapshot {
  entityId: string;
  state: CatalogReviewState;
  authoredBy: string;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewRationale: string | null;
}

export type CatalogReviewCommand =
  | { type: 'submit'; actorId: string }
  | { type: 'request-changes'; actorId: string; rationale: string }
  | { type: 'approve'; actorId: string; rationale: string }
  | { type: 'reject'; actorId: string; rationale: string }
  | { type: 'revise'; actorId: string }
  | { type: 'supersede'; actorId: string; rationale: string };

function identifier(value: string, label: string): void {
  if (!value.trim()) throw new TypeError(`${label} is required.`);
}

function rationale(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 10) {
    throw new RangeError('Scientific review rationale must contain at least 10 characters.');
  }
  return normalized;
}

function assertIndependentReviewer(snapshot: CatalogReviewSnapshot, actorId: string): void {
  if (actorId === snapshot.authoredBy || actorId === snapshot.submittedBy) {
    throw new RangeError('Catalog authors and submitters cannot independently review their own work.');
  }
}

export function transitionCatalogReview(
  snapshot: Readonly<CatalogReviewSnapshot>,
  command: CatalogReviewCommand,
): CatalogReviewSnapshot {
  identifier(snapshot.entityId, 'entityId');
  identifier(snapshot.authoredBy, 'authoredBy');
  identifier(command.actorId, 'actorId');

  switch (command.type) {
    case 'submit':
      if (!['draft', 'changes_requested'].includes(snapshot.state)) {
        throw new RangeError(`Only draft or changes-requested catalog records may be submitted; received ${snapshot.state}.`);
      }
      return {
        ...snapshot,
        state: 'in_review',
        submittedBy: command.actorId,
        reviewedBy: null,
        reviewRationale: null,
      };
    case 'request-changes':
    case 'approve':
    case 'reject': {
      if (snapshot.state !== 'in_review') {
        throw new RangeError(`Catalog review decision requires in_review state; received ${snapshot.state}.`);
      }
      assertIndependentReviewer(snapshot, command.actorId);
      return {
        ...snapshot,
        state:
          command.type === 'request-changes'
            ? 'changes_requested'
            : command.type === 'approve'
              ? 'approved'
              : 'rejected',
        reviewedBy: command.actorId,
        reviewRationale: rationale(command.rationale),
      };
    }
    case 'revise':
      if (!['changes_requested', 'rejected'].includes(snapshot.state)) {
        throw new RangeError(`Only changes-requested or rejected records may be revised; received ${snapshot.state}.`);
      }
      if (command.actorId !== snapshot.authoredBy) {
        throw new RangeError('Only the record author may open a new draft revision.');
      }
      return {
        ...snapshot,
        state: 'draft',
        submittedBy: null,
        reviewedBy: null,
        reviewRationale: null,
      };
    case 'supersede':
      if (snapshot.state !== 'approved') {
        throw new RangeError('Only an approved catalog record may be superseded.');
      }
      return {
        ...snapshot,
        state: 'superseded',
        reviewedBy: command.actorId,
        reviewRationale: rationale(command.rationale),
      };
  }
}

export interface CatalogReleaseRecord {
  id: string;
  reviewState: CatalogReviewState;
  contentHash: string;
}

export interface CatalogReleaseRule extends CatalogReleaseRecord {
  supportingAssertionIds: readonly string[];
}

export interface CatalogReleaseCandidate {
  version: string;
  contentHash: string;
  loci: readonly CatalogReleaseRecord[];
  assertions: readonly CatalogReleaseRecord[];
  rules: readonly CatalogReleaseRule[];
}

const sha256 = /^[a-f0-9]{64}$/;

function validateApprovedRecords(
  records: readonly CatalogReleaseRecord[],
  label: string,
  allowEmpty: boolean,
): Set<string> {
  if (!allowEmpty && records.length === 0) throw new RangeError(`Catalog release requires at least one ${label}.`);
  const ids = new Set<string>();
  for (const record of records) {
    identifier(record.id, `${label} id`);
    if (ids.has(record.id)) throw new TypeError(`Catalog release contains duplicate ${label} ${record.id}.`);
    ids.add(record.id);
    if (record.reviewState !== 'approved') {
      throw new RangeError(`Catalog release ${label} ${record.id} is not approved.`);
    }
    if (!sha256.test(record.contentHash)) {
      throw new TypeError(`Catalog release ${label} ${record.id} has an invalid content hash.`);
    }
  }
  return ids;
}

export function validateCatalogReleaseCandidate(candidate: CatalogReleaseCandidate): void {
  identifier(candidate.version, 'release version');
  if (!sha256.test(candidate.contentHash)) throw new TypeError('Catalog release contentHash must be lowercase SHA-256 hex.');
  validateApprovedRecords(candidate.loci, 'locus', false);
  const assertionIds = validateApprovedRecords(candidate.assertions, 'assertion', true);
  validateApprovedRecords(candidate.rules, 'rule', true);
  for (const rule of candidate.rules) {
    if (rule.supportingAssertionIds.length === 0) {
      throw new RangeError(`Catalog rule ${rule.id} requires at least one supporting assertion.`);
    }
    for (const assertionId of rule.supportingAssertionIds) {
      if (!assertionIds.has(assertionId)) {
        throw new RangeError(`Catalog rule ${rule.id} references assertion ${assertionId} outside the release.`);
      }
    }
  }
}
