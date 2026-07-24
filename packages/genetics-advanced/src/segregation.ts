import { Rational } from '@capsicum/genetics-core';

export interface SegregationCategory {
  categoryId: string;
  observedCount: number;
  expectedProbability: Rational;
}

export interface ExpectedSegregationCount {
  categoryId: string;
  observedCount: number;
  expectedCount: number;
  expectedProbability: string;
}

export interface ObservedSegregationResult {
  method: 'exact_binomial' | 'chi_square' | 'insufficient_for_supported_test';
  sampleSize: number;
  missingCount: number;
  degreesOfFreedom: number | null;
  statistic: number | null;
  pValue: number | null;
  expectedCounts: readonly ExpectedSegregationCount[];
  assumptionsMet: boolean;
  warnings: readonly string[];
  interpretation: string;
}

const LOG_SQRT_TWO_PI = 0.5 * Math.log(2 * Math.PI);
const EPSILON = 1e-12;
const MAX_ITERATIONS = 10_000;

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

function logGamma(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('logGamma requires a positive finite value.');
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }
  const shifted = value - 1;
  let series = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index += 1) {
    series += coefficients[index]! / (shifted + index + 1);
  }
  const t = shifted + coefficients.length - 0.5;
  return LOG_SQRT_TWO_PI + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

function regularizedGammaQ(shape: number, x: number): number {
  if (!Number.isFinite(shape) || shape <= 0 || !Number.isFinite(x) || x < 0) {
    throw new RangeError('Regularized gamma inputs are outside the supported domain.');
  }
  if (x === 0) return 1;
  const logScale = -x + shape * Math.log(x) - logGamma(shape);
  if (x < shape + 1) {
    let term = 1 / shape;
    let sum = term;
    let denominator = shape;
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
      denominator += 1;
      term *= x / denominator;
      sum += term;
      if (Math.abs(term) <= Math.abs(sum) * EPSILON) {
        const p = sum * Math.exp(logScale);
        return Math.min(1, Math.max(0, 1 - p));
      }
    }
    throw new RangeError('Regularized gamma series did not converge.');
  }

  let b = x + 1 - shape;
  let c = 1 / Number.MIN_VALUE;
  let d = 1 / b;
  let h = d;
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const an = -iteration * (iteration - shape);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < Number.MIN_VALUE) d = Number.MIN_VALUE;
    c = b + an / c;
    if (Math.abs(c) < Number.MIN_VALUE) c = Number.MIN_VALUE;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) <= EPSILON) {
      return Math.min(1, Math.max(0, Math.exp(logScale) * h));
    }
  }
  throw new RangeError('Regularized gamma continued fraction did not converge.');
}

function logBinomialProbability(successes: number, trials: number, probability: number): number {
  if (probability === 0) return successes === 0 ? 0 : Number.NEGATIVE_INFINITY;
  if (probability === 1) return successes === trials ? 0 : Number.NEGATIVE_INFINITY;
  return logGamma(trials + 1)
    - logGamma(successes + 1)
    - logGamma(trials - successes + 1)
    + successes * Math.log(probability)
    + (trials - successes) * Math.log1p(-probability);
}

function exactTwoSidedBinomial(successes: number, trials: number, probability: number): number {
  const observedLogProbability = logBinomialProbability(successes, trials, probability);
  let total = 0;
  for (let candidate = 0; candidate <= trials; candidate += 1) {
    const candidateLogProbability = logBinomialProbability(candidate, trials, probability);
    if (candidateLogProbability <= observedLogProbability + EPSILON) {
      total += Math.exp(candidateLogProbability);
    }
  }
  return Math.min(1, Math.max(0, total));
}

export function reconcileObservedSegregation(input: {
  categories: readonly SegregationCategory[];
  missingCount?: number;
}): ObservedSegregationResult {
  if (input.categories.length < 2) throw new RangeError('At least two segregation categories are required.');
  const categoryIds = input.categories.map((category) => category.categoryId.trim());
  if (categoryIds.some((categoryId) => !categoryId || categoryId.length > 200)) {
    throw new TypeError('Every segregation category requires an identifier no longer than 200 characters.');
  }
  if (new Set(categoryIds).size !== categoryIds.length) throw new TypeError('Segregation category identifiers must be unique.');
  const missingCount = input.missingCount ?? 0;
  assertCount(missingCount, 'missingCount');
  for (const category of input.categories) {
    assertCount(category.observedCount, `observedCount for ${category.categoryId}`);
    if (category.expectedProbability.isNegative() || category.expectedProbability.compare(Rational.ONE) > 0) {
      throw new RangeError(`Expected probability for ${category.categoryId} must be between zero and one.`);
    }
  }
  const totalProbability = input.categories.reduce(
    (sum, category) => sum.add(category.expectedProbability),
    Rational.ZERO,
  );
  if (!totalProbability.equals(Rational.ONE)) {
    throw new RangeError(`Expected segregation probabilities must sum exactly to one; received ${totalProbability.toString()}.`);
  }
  const sampleSize = input.categories.reduce((sum, category) => sum + category.observedCount, 0);
  if (sampleSize === 0) {
    return {
      method: 'insufficient_for_supported_test',
      sampleSize,
      missingCount,
      degreesOfFreedom: null,
      statistic: null,
      pValue: null,
      expectedCounts: input.categories.map((category) => ({
        categoryId: category.categoryId,
        observedCount: category.observedCount,
        expectedCount: 0,
        expectedProbability: category.expectedProbability.toString(),
      })),
      assumptionsMet: false,
      warnings: ['No scored progeny were supplied. Missing observations are excluded from the test denominator.'],
      interpretation: 'No segregation test was performed. The result does not support a causal or genetic conclusion.',
    };
  }

  const expectedCounts = input.categories.map((category) => ({
    categoryId: category.categoryId,
    observedCount: category.observedCount,
    expectedCount: sampleSize * category.expectedProbability.toNumber(),
    expectedProbability: category.expectedProbability.toString(),
  }));
  const impossibleObserved = input.categories.some(
    (category) => category.expectedProbability.isZero() && category.observedCount > 0,
  );
  if (impossibleObserved) {
    return {
      method: input.categories.length === 2 ? 'exact_binomial' : 'chi_square',
      sampleSize,
      missingCount,
      degreesOfFreedom: input.categories.length - 1,
      statistic: Number.POSITIVE_INFINITY,
      pValue: 0,
      expectedCounts,
      assumptionsMet: true,
      warnings: ['At least one observed category had zero probability under the supplied expectation. Verify identity, scoring, and model premises before interpreting the discrepancy.'],
      interpretation: 'The observations conflict with the supplied expectation. This is not proof of a causal mechanism.',
    };
  }

  const minimumExpected = Math.min(...expectedCounts.map((category) => category.expectedCount));
  if (input.categories.length === 2 && minimumExpected < 5) {
    const first = input.categories[0]!;
    const pValue = exactTwoSidedBinomial(
      first.observedCount,
      sampleSize,
      first.expectedProbability.toNumber(),
    );
    return {
      method: 'exact_binomial',
      sampleSize,
      missingCount,
      degreesOfFreedom: null,
      statistic: null,
      pValue,
      expectedCounts,
      assumptionsMet: true,
      warnings: [
        'A two-sided exact binomial test was used because an expected cell count was below five.',
        ...(missingCount > 0 ? ['Missing observations were excluded from the scored-progeny denominator.'] : []),
      ],
      interpretation: 'The p-value measures compatibility with the supplied segregation expectation; it is not a guarantee and does not identify a cause.',
    };
  }

  if (minimumExpected < 5) {
    return {
      method: 'insufficient_for_supported_test',
      sampleSize,
      missingCount,
      degreesOfFreedom: null,
      statistic: null,
      pValue: null,
      expectedCounts,
      assumptionsMet: false,
      warnings: [
        'At least one expected category count is below five and this implementation does not claim an exact multinomial result.',
        'Combine categories only when scientifically justified, increase the scored sample, or use an independently validated bounded exact protocol.',
      ],
      interpretation: 'No supported goodness-of-fit conclusion was produced. The result does not support a causal or genetic conclusion.',
    };
  }

  const statistic = expectedCounts.reduce((sum, category) => {
    const delta = category.observedCount - category.expectedCount;
    return sum + (delta * delta) / category.expectedCount;
  }, 0);
  const degreesOfFreedom = input.categories.length - 1;
  const pValue = regularizedGammaQ(degreesOfFreedom / 2, statistic / 2);
  return {
    method: 'chi_square',
    sampleSize,
    missingCount,
    degreesOfFreedom,
    statistic,
    pValue,
    expectedCounts,
    assumptionsMet: true,
    warnings: [
      'Chi-square goodness-of-fit was used because every expected category count was at least five.',
      ...(missingCount > 0 ? ['Missing observations were excluded from the scored-progeny denominator.'] : []),
    ],
    interpretation: 'The p-value measures compatibility with the supplied segregation expectation; it is not a guarantee and does not identify a cause.',
  };
}

export interface MultipleTestResult {
  testId: string;
  rawPValue: number;
  holmAdjustedPValue: number;
}

export function adjustPValuesHolm(tests: readonly { testId: string; pValue: number }[]): readonly MultipleTestResult[] {
  const ids = tests.map((test) => test.testId.trim());
  if (ids.some((id) => !id || id.length > 200) || new Set(ids).size !== ids.length) {
    throw new TypeError('Multiple-testing identifiers must be unique, non-empty, and no longer than 200 characters.');
  }
  for (const test of tests) {
    if (!Number.isFinite(test.pValue) || test.pValue < 0 || test.pValue > 1) {
      throw new RangeError(`pValue for ${test.testId} must be between zero and one.`);
    }
  }
  const ordered = tests
    .map((test, originalIndex) => ({ ...test, originalIndex }))
    .sort((left, right) => left.pValue - right.pValue || (left.testId < right.testId ? -1 : left.testId > right.testId ? 1 : 0));
  let runningMaximum = 0;
  const adjusted = ordered.map((test, index) => {
    runningMaximum = Math.max(runningMaximum, Math.min(1, (ordered.length - index) * test.pValue));
    return { originalIndex: test.originalIndex, testId: test.testId, rawPValue: test.pValue, holmAdjustedPValue: runningMaximum };
  });
  return adjusted.sort((left, right) => left.originalIndex - right.originalIndex).map(({ originalIndex: _ignored, ...result }) => result);
}
