import { parentPort, workerData } from 'node:worker_threads';
import { runDirectInheritanceMonteCarlo } from '@capsicum/genetics-advanced';
import { Rational, type DiploidGenotype, type ParentGenotypeHypothesis } from '@capsicum/genetics-core';

interface JsonRecord { [key: string]: unknown }
function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value as JsonRecord;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} is required.`);
  return value.trim();
}
function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value as number;
}
function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value.map((item, index) => text(item, `${label}[${index}]`));
}
function genotype(value: unknown, label: string): DiploidGenotype {
  const input = record(value, label);
  const alleles = stringArray(input.alleles, `${label}.alleles`);
  if (alleles.length !== 2) throw new RangeError(`${label}.alleles must contain exactly two values.`);
  const evidenceState = text(input.evidenceState, `${label}.evidenceState`);
  if (!['verified', 'inferred', 'assumed', 'unknown', 'conflicting'].includes(evidenceState)) {
    throw new RangeError(`${label}.evidenceState is invalid.`);
  }
  return { locusId: text(input.locusId, `${label}.locusId`), alleles: [alleles[0]!, alleles[1]!], evidenceState: evidenceState as DiploidGenotype['evidenceState'] };
}
function hypotheses(value: unknown, label: string): ParentGenotypeHypothesis[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new RangeError(`${label} must contain between 1 and 100 hypotheses.`);
  return value.map((item, index) => {
    const input = record(item, `${label}[${index}]`);
    const probability = record(input.probability, `${label}[${index}].probability`);
    const basis = text(input.basis, `${label}[${index}].basis`);
    if (!['assay', 'pedigree', 'phenotype', 'user_prior', 'model'].includes(basis)) throw new RangeError(`${label}[${index}].basis is invalid.`);
    if (!Array.isArray(input.loci) || input.loci.length === 0 || input.loci.length > 32) throw new RangeError(`${label}[${index}].loci is invalid.`);
    return {
      loci: input.loci.map((locus, locusIndex) => genotype(locus, `${label}[${index}].loci[${locusIndex}]`)),
      probability: new Rational(text(probability.numerator, 'probability.numerator'), text(probability.denominator, 'probability.denominator')),
      basis: basis as ParentGenotypeHypothesis['basis'],
      evidenceIds: stringArray(input.evidenceIds ?? [], `${label}[${index}].evidenceIds`),
    };
  });
}

try {
  const payload = record(workerData, 'payload');
  const result = runDirectInheritanceMonteCarlo({
    maternalHypotheses: hypotheses(payload.maternalHypotheses, 'payload.maternalHypotheses'),
    paternalHypotheses: hypotheses(payload.paternalHypotheses, 'payload.paternalHypotheses'),
    seed: integer(payload.seed, 'payload.seed', 0, 0xffff_ffff),
    sampleCount: integer(payload.sampleCount, 'payload.sampleCount', 1_000, 5_000_000),
  });
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: {
      code: error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'monte_carlo_failed',
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message.slice(0, 2_000) : 'Monte Carlo failed.',
    },
  });
}
