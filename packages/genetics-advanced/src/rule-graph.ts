import {
  Rational,
  canonicalAlleles,
  compareIdentifiers,
  identifierTupleKey,
} from '@capsicum/genetics-core';
import type { DiploidGenotype, MultiLocusOffspring } from '@capsicum/genetics-core';

export type RulePredicateOperator = 'contains' | 'equals' | 'not_contains' | 'unknown';

export interface RulePredicate {
  locusId: string;
  operator: RulePredicateOperator;
  alleleIds?: readonly string[];
  genotypeIds?: readonly string[];
}

export interface ApprovedPhenotypeRuleGraphNode {
  id: string;
  version: string;
  priority: number;
  approved: true;
  all?: readonly RulePredicate[];
  any?: readonly RulePredicate[];
  outcomePhenotypeId: string;
  penetrance?: Rational;
  authority: 'conditional_supported';
  applicabilityId: string;
  sourceAssertionIds: readonly string[];
}

export type RuleGraphResult =
  | {
      state: 'resolved';
      authority: 'conditional_supported';
      outcomePhenotypeId: string;
      penetrance: Rational;
      matchedRuleIds: readonly string[];
      sourceAssertionIds: readonly string[];
      applicabilityId: string;
    }
  | {
      state: 'conflicting';
      authority: 'unsupported';
      matchedRuleIds: readonly string[];
      conflictingOutcomePhenotypeIds: readonly string[];
      abstentions: readonly string[];
    }
  | {
      state: 'insufficient_evidence';
      authority: 'unsupported';
      matchedRuleIds: readonly [];
      abstentions: readonly string[];
    };

function requiredIdentifier(value: string, label: string): void {
  if (!value.trim()) throw new TypeError(`${label} is required.`);
}

function genotypeIdentifier(genotype: DiploidGenotype): string {
  const alleles = canonicalAlleles(genotype.alleles);
  return identifierTupleKey([genotype.locusId, alleles[0], alleles[1]]);
}

function validatePredicate(predicate: RulePredicate): void {
  requiredIdentifier(predicate.locusId, 'predicate locusId');
  const alleleIds = predicate.alleleIds ?? [];
  const genotypeIds = predicate.genotypeIds ?? [];
  for (const alleleId of alleleIds) requiredIdentifier(alleleId, 'predicate alleleId');
  for (const genotypeId of genotypeIds) requiredIdentifier(genotypeId, 'predicate genotypeId');
  if (predicate.operator === 'unknown') {
    if (alleleIds.length > 0 || genotypeIds.length > 0) {
      throw new TypeError('An unknown predicate must not declare allele or genotype identifiers.');
    }
    return;
  }
  if (alleleIds.length === 0 && genotypeIds.length === 0) {
    throw new TypeError(`${predicate.operator} predicate requires alleleIds or genotypeIds.`);
  }
  if (predicate.operator === 'equals' && alleleIds.length !== 2 && genotypeIds.length === 0) {
    throw new TypeError('An equals predicate requires exactly two alleleIds or an explicit genotypeId.');
  }
}

function predicateMatches(offspring: MultiLocusOffspring, predicate: RulePredicate): boolean {
  const genotype = offspring.loci.find((item) => item.locusId === predicate.locusId);
  if (!genotype) return predicate.operator === 'unknown';
  if (predicate.operator === 'unknown') {
    return genotype.evidenceState === 'unknown' || genotype.evidenceState === 'conflicting';
  }

  const alleles = canonicalAlleles(genotype.alleles);
  const alleleSet = new Set(alleles);
  const alleleIds = predicate.alleleIds ?? [];
  const genotypeIds = predicate.genotypeIds ?? [];
  const genotypeMatches = genotypeIds.includes(genotypeIdentifier(genotype));

  switch (predicate.operator) {
    case 'contains':
      return genotypeMatches ||
        (alleleIds.length > 0 && alleleIds.every((alleleId) => alleleSet.has(alleleId)));
    case 'not_contains':
      return !genotypeMatches && alleleIds.every((alleleId) => !alleleSet.has(alleleId));
    case 'equals': {
      if (genotypeMatches) return true;
      if (alleleIds.length !== 2) return false;
      const expected = canonicalAlleles([alleleIds[0]!, alleleIds[1]!]);
      return alleles[0] === expected[0] && alleles[1] === expected[1];
    }
  }
}

function ruleMatches(offspring: MultiLocusOffspring, rule: ApprovedPhenotypeRuleGraphNode): boolean {
  const all = rule.all ?? [];
  const any = rule.any ?? [];
  if (all.length === 0 && any.length === 0) {
    throw new TypeError(`Rule ${rule.id} must declare all or any predicates.`);
  }
  return all.every((predicate) => predicateMatches(offspring, predicate)) &&
    (any.length === 0 || any.some((predicate) => predicateMatches(offspring, predicate)));
}

function validateRule(rule: ApprovedPhenotypeRuleGraphNode): void {
  requiredIdentifier(rule.id, 'rule id');
  requiredIdentifier(rule.version, 'rule version');
  requiredIdentifier(rule.outcomePhenotypeId, 'outcome phenotype id');
  requiredIdentifier(rule.applicabilityId, 'applicability id');
  if (!Number.isSafeInteger(rule.priority)) throw new RangeError(`Rule ${rule.id} priority must be a safe integer.`);
  if (rule.sourceAssertionIds.length === 0) {
    throw new RangeError(`Rule ${rule.id} requires at least one approved source assertion.`);
  }
  if (new Set(rule.sourceAssertionIds).size !== rule.sourceAssertionIds.length) {
    throw new TypeError(`Rule ${rule.id} contains duplicate source assertions.`);
  }
  for (const predicate of [...(rule.all ?? []), ...(rule.any ?? [])]) validatePredicate(predicate);
  const penetrance = rule.penetrance ?? Rational.ONE;
  if (penetrance.isNegative() || penetrance.compare(Rational.ONE) > 0) {
    throw new RangeError(`Rule ${rule.id} penetrance must be between 0 and 1.`);
  }
}

export function evaluateApprovedRuleGraph(input: {
  offspring: MultiLocusOffspring;
  applicabilityId: string;
  rules: readonly ApprovedPhenotypeRuleGraphNode[];
}): RuleGraphResult {
  requiredIdentifier(input.applicabilityId, 'applicabilityId');
  const seen = new Set<string>();
  for (const rule of input.rules) {
    validateRule(rule);
    const versionedId = `${rule.id}@${rule.version}`;
    if (seen.has(versionedId)) throw new TypeError(`Duplicate rule ${versionedId}.`);
    seen.add(versionedId);
  }

  const matching = input.rules
    .filter((rule) => rule.applicabilityId === input.applicabilityId)
    .filter((rule) => ruleMatches(input.offspring, rule))
    .sort((left, right) => right.priority - left.priority || compareIdentifiers(left.id, right.id));

  if (matching.length === 0) {
    return {
      state: 'insufficient_evidence',
      authority: 'unsupported',
      matchedRuleIds: [],
      abstentions: ['No approved phenotype rule resolved the declared genotype and applicability context.'],
    };
  }

  const highestPriority = matching[0]!.priority;
  const decisive = matching.filter((rule) => rule.priority === highestPriority);
  const outcomes = [...new Set(decisive.map((rule) => rule.outcomePhenotypeId))].sort(compareIdentifiers);
  const matchedRuleIds = decisive.map((rule) => `${rule.id}@${rule.version}`);
  if (outcomes.length !== 1) {
    return {
      state: 'conflicting',
      authority: 'unsupported',
      matchedRuleIds,
      conflictingOutcomePhenotypeIds: outcomes,
      abstentions: ['Equal-priority approved rules resolve to conflicting outcomes; scientific review is required.'],
    };
  }

  const penetrances = [...new Set(decisive.map((rule) => (rule.penetrance ?? Rational.ONE).toString()))];
  if (penetrances.length !== 1) {
    return {
      state: 'conflicting',
      authority: 'unsupported',
      matchedRuleIds,
      conflictingOutcomePhenotypeIds: outcomes,
      abstentions: ['Equal-priority approved rules disagree on penetrance; scientific review is required.'],
    };
  }

  return {
    state: 'resolved',
    authority: 'conditional_supported',
    outcomePhenotypeId: outcomes[0]!,
    penetrance: Rational.from(decisive[0]!.penetrance ?? Rational.ONE),
    matchedRuleIds,
    sourceAssertionIds: [...new Set(decisive.flatMap((rule) => rule.sourceAssertionIds))].sort(compareIdentifiers),
    applicabilityId: input.applicabilityId,
  };
}
