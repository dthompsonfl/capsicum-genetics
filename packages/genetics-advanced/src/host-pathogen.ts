import { canonicalAlleles, compareIdentifiers } from '@capsicum/genetics-core';
import type { DiploidGenotype } from '@capsicum/genetics-core';

export interface HostPathogenContext {
  pathogenTaxon?: string;
  strain?: string;
  isolate?: string;
  race?: string;
  pathotype?: string;
  effectorProfile?: readonly string[];
  assayContextId?: string;
  environmentContextId?: string;
}

export interface ApprovedHostPathogenRule {
  id: string;
  version: string;
  approved: true;
  hostLocusId: string;
  hostAlleles: readonly [string, string];
  pathogenTaxon: string;
  strain?: string;
  isolate?: string;
  race?: string;
  pathotype?: string;
  requiredEffectors?: readonly string[];
  assayContextId?: string;
  environmentContextId?: string;
  outcome: 'supported_resistant' | 'supported_susceptible';
  evidenceLevel: 'high' | 'moderate' | 'limited';
  sourceAssertionIds: readonly string[];
  warnings?: readonly string[];
}

export interface HostPathogenResult {
  outcome:
    | 'supported_resistant'
    | 'supported_susceptible'
    | 'conflicting'
    | 'insufficient_evidence';
  authority: 'conditional_supported' | 'unsupported';
  evidenceLevel: 'high' | 'moderate' | 'limited' | 'none';
  matchedRuleIds: readonly string[];
  sourceAssertionIds: readonly string[];
  missingContext: readonly string[];
  warnings: readonly string[];
  abstentions: readonly string[];
}

function present(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function validateRule(rule: ApprovedHostPathogenRule): void {
  for (const [label, value] of [
    ['rule id', rule.id],
    ['rule version', rule.version],
    ['host locus id', rule.hostLocusId],
    ['pathogen taxon', rule.pathogenTaxon],
  ] as const) {
    if (!value.trim()) throw new TypeError(`${label} is required.`);
  }
  canonicalAlleles(rule.hostAlleles);
  if (rule.sourceAssertionIds.length === 0) {
    throw new RangeError(`Host-pathogen rule ${rule.id} requires source assertions.`);
  }
  if (new Set(rule.sourceAssertionIds).size !== rule.sourceAssertionIds.length) {
    throw new TypeError(`Host-pathogen rule ${rule.id} contains duplicate source assertions.`);
  }
  for (const sourceAssertionId of rule.sourceAssertionIds) {
    if (!sourceAssertionId.trim()) throw new TypeError(`Host-pathogen rule ${rule.id} has an empty source assertion id.`);
  }
}

function ruleContextMatches(rule: ApprovedHostPathogenRule, context: HostPathogenContext): boolean {
  if (rule.pathogenTaxon !== context.pathogenTaxon) return false;
  for (const key of ['strain', 'isolate', 'race', 'pathotype', 'assayContextId', 'environmentContextId'] as const) {
    if (rule[key] !== undefined && rule[key] !== context[key]) return false;
  }
  const observedEffectors = new Set(context.effectorProfile ?? []);
  return (rule.requiredEffectors ?? []).every((effector) => observedEffectors.has(effector));
}

function hostMatches(rule: ApprovedHostPathogenRule, host: readonly DiploidGenotype[]): boolean {
  const genotype = host.find((item) => item.locusId === rule.hostLocusId);
  if (!genotype || genotype.evidenceState === 'unknown' || genotype.evidenceState === 'conflicting') return false;
  const expected = canonicalAlleles(rule.hostAlleles);
  const observed = canonicalAlleles(genotype.alleles);
  return expected[0] === observed[0] && expected[1] === observed[1];
}

function combinedEvidenceLevel(levels: readonly ApprovedHostPathogenRule['evidenceLevel'][]): HostPathogenResult['evidenceLevel'] {
  if (levels.includes('limited')) return 'limited';
  if (levels.includes('moderate')) return 'moderate';
  return levels.length > 0 ? 'high' : 'none';
}

export function evaluateHostPathogenInteraction(input: {
  hostGenotypes: readonly DiploidGenotype[];
  context: HostPathogenContext;
  rules: readonly ApprovedHostPathogenRule[];
}): HostPathogenResult {
  const missingContext: string[] = [];
  if (!present(input.context.pathogenTaxon)) missingContext.push('pathogenTaxon');
  if (![input.context.strain, input.context.isolate, input.context.race, input.context.pathotype].some(present)) {
    missingContext.push('strain|isolate|race|pathotype');
  }
  if (!present(input.context.assayContextId)) missingContext.push('assayContextId');
  if (missingContext.length > 0) {
    return {
      outcome: 'insufficient_evidence',
      authority: 'unsupported',
      evidenceLevel: 'none',
      matchedRuleIds: [],
      sourceAssertionIds: [],
      missingContext,
      warnings: [],
      abstentions: ['Disease resistance cannot be evaluated without explicit pathogen and assay context.'],
    };
  }

  const seen = new Set<string>();
  for (const rule of input.rules) {
    validateRule(rule);
    const id = `${rule.id}@${rule.version}`;
    if (seen.has(id)) throw new TypeError(`Duplicate host-pathogen rule ${id}.`);
    seen.add(id);
  }
  const matching = input.rules.filter(
    (rule) => ruleContextMatches(rule, input.context) && hostMatches(rule, input.hostGenotypes),
  );
  if (matching.length === 0) {
    return {
      outcome: 'insufficient_evidence',
      authority: 'unsupported',
      evidenceLevel: 'none',
      matchedRuleIds: [],
      sourceAssertionIds: [],
      missingContext: [],
      warnings: [],
      abstentions: ['No approved host-pathogen rule applies to the declared genotype and context.'],
    };
  }

  const outcomes = [...new Set(matching.map((rule) => rule.outcome))];
  const matchedRuleIds = matching.map((rule) => `${rule.id}@${rule.version}`).sort(compareIdentifiers);
  const sourceAssertionIds = [...new Set(matching.flatMap((rule) => rule.sourceAssertionIds))].sort(compareIdentifiers);
  const warnings = [...new Set(matching.flatMap((rule) => rule.warnings ?? []))].sort(compareIdentifiers);
  if (outcomes.length > 1) {
    return {
      outcome: 'conflicting',
      authority: 'unsupported',
      evidenceLevel: combinedEvidenceLevel(matching.map((rule) => rule.evidenceLevel)),
      matchedRuleIds,
      sourceAssertionIds,
      missingContext: [],
      warnings,
      abstentions: ['Approved evidence conflicts for this host-pathogen context; no resistance decision was made.'],
    };
  }
  return {
    outcome: outcomes[0]!,
    authority: 'conditional_supported',
    evidenceLevel: combinedEvidenceLevel(matching.map((rule) => rule.evidenceLevel)),
    matchedRuleIds,
    sourceAssertionIds,
    missingContext: [],
    warnings,
    abstentions: ['This result is limited to the declared pathogen, assay, environment, genotype, and evidence applicability.'],
  };
}
