import lociData from './generated/loci.json';
import claimsData from './generated/claims.json';
import sourcesData from './generated/sources.json';

export interface SourceProvenance {
  sourceFile: string;
  sourceFileSha256: string;
  sourceRow: number;
  rawRowSha256: string;
  reviewState: 'draft_pending_independent_review';
}

export interface SeedLocusRecord {
  catalog_id: string;
  canonical_symbol: string;
  aliases: string;
  gene_or_candidate: string;
  trait_category: string;
  trait_scope: string;
  species_scope: string;
  chromosome: string;
  model_class: string;
  inheritance_summary: string;
  evidence_grade: string;
  evidence_status: string;
  genotype_prediction: string;
  phenotype_prediction: string;
  supported_claim: string;
  prohibited_claim: string;
  required_context: string;
  primary_sources: string;
  release_status: string;
  review_priority: string;
  _provenance: SourceProvenance;
}

export interface SeedEvidenceClaim {
  claim_id: string;
  catalog_id: string;
  claim_text: string;
  claim_type: string;
  evidence_grade: string;
  applicability: string;
  required_conditions: string;
  exclusions: string;
  source_ids: string;
  review_status: string;
  _provenance: SourceProvenance;
}

export interface SeedScientificSource {
  source_id: string;
  year: string;
  title: string;
  authors: string;
  journal: string;
  doi: string;
  pmid: string;
  source_type: string;
  open_access: string;
  url: string;
  key_use: string;
  limitations: string;
  _provenance: SourceProvenance;
}

export interface CatalogSummary {
  version: 'seed-v0.1';
  scientificState: 'draft_pending_review';
  locusCount: number;
  claimCount: number;
  sourceCount: number;
  executableRuleCount: 0;
}

export const seedLoci = lociData as SeedLocusRecord[];
export const seedClaims = claimsData as SeedEvidenceClaim[];
export const seedSources = sourcesData as SeedScientificSource[];

export const catalogSummary: CatalogSummary = Object.freeze({
  version: 'seed-v0.1',
  scientificState: 'draft_pending_review',
  locusCount: seedLoci.length,
  claimCount: seedClaims.length,
  sourceCount: seedSources.length,
  executableRuleCount: 0,
});

export function getSeedLocus(catalogId: string): SeedLocusRecord | undefined {
  return seedLoci.find((locus) => locus.catalog_id === catalogId);
}

export function getSeedClaimsForLocus(catalogId: string): readonly SeedEvidenceClaim[] {
  return seedClaims.filter((claim) => claim.catalog_id === catalogId);
}

export function getSeedSources(sourceIds: readonly string[]): readonly SeedScientificSource[] {
  const requested = new Set(sourceIds);
  return seedSources.filter((source) => requested.has(source.source_id));
}

export function parseSourceIds(value: string): readonly string[] {
  return value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Seed records are evidence inventory only. Executability is denied by design
 * until a separately authored, independently reviewed rule is published.
 */
export function canExecutePhenotypeRule(_catalogId: string): false {
  return false;
}

export * from './governance';
