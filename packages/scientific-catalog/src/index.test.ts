import { describe, expect, it } from 'vitest';
import {
  canExecutePhenotypeRule,
  catalogSummary,
  getSeedClaimsForLocus,
  getSeedSources,
  parseSourceIds,
  seedClaims,
  seedLoci,
  seedSources,
  transitionCatalogReview,
  validateCatalogReleaseCandidate,
} from './index';

describe('seed catalog governance', () => {
  it('preserves the reconciled source counts', () => {
    expect(catalogSummary).toMatchObject({
      scientificState: 'draft_pending_review',
      locusCount: 22,
      claimCount: 22,
      sourceCount: 30,
      executableRuleCount: 0,
    });
  });

  it('resolves every locus and claim source reference', () => {
    const sourceIds = new Set(seedSources.map((source) => source.source_id));
    const locusIds = new Set(seedLoci.map((locus) => locus.catalog_id));
    for (const locus of seedLoci) {
      expect(parseSourceIds(locus.primary_sources).every((id) => sourceIds.has(id))).toBe(true);
    }
    for (const claim of seedClaims) {
      expect(locusIds.has(claim.catalog_id)).toBe(true);
      expect(parseSourceIds(claim.source_ids).every((id) => sourceIds.has(id))).toBe(true);
    }
  });

  it('preserves source-row provenance and blocks executable phenotype rules', () => {
    expect(seedLoci[0]?._provenance.sourceRow).toBe(2);
    expect(seedLoci[0]?._provenance.reviewState).toBe('draft_pending_independent_review');
    expect(canExecutePhenotypeRule('LOC001')).toBe(false);
  });

  it('provides linked claims and sources without elevating their review state', () => {
    const claims = getSeedClaimsForLocus('LOC001');
    const sources = getSeedSources(parseSourceIds(claims[0]?.source_ids ?? ''));
    expect(claims).toHaveLength(1);
    expect(sources.map((source) => source.source_id)).toEqual(['SRC001', 'SRC002']);
  });
});

describe('catalog review state machine', () => {
  it('enforces independent review and explicit rationale', () => {
    const draft = {
      entityId: 'LOC001', state: 'draft' as const, authoredBy: 'curator-1',
      submittedBy: null, reviewedBy: null, reviewRationale: null,
    };
    const submitted = transitionCatalogReview(draft, { type: 'submit', actorId: 'curator-1' });
    expect(() => transitionCatalogReview(submitted, {
      type: 'approve', actorId: 'curator-1', rationale: 'Reviewed against primary sources.',
    })).toThrow(/cannot independently review/);
    const approved = transitionCatalogReview(submitted, {
      type: 'approve', actorId: 'reviewer-1', rationale: 'Reviewed against primary sources.',
    });
    expect(approved.state).toBe('approved');
  });

  it('blocks release rules whose approved assertions are not in the release', () => {
    const hash = 'a'.repeat(64);
    expect(() => validateCatalogReleaseCandidate({
      version: 'v1', contentHash: hash,
      loci: [{ id: 'L1', reviewState: 'approved', contentHash: hash }],
      assertions: [],
      rules: [{
        id: 'R1', reviewState: 'approved', contentHash: hash,
        supportingAssertionIds: ['A1'],
      }],
    })).toThrow(/outside the release/);
  });
});
