import { describe, expect, it } from 'vitest';
import { runExactSimulation } from './index';

describe('runExactSimulation', () => {
  it('returns provenance and exact result authority', () => {
    const result = runExactSimulation({
      schemaVersion: '1.0',
      workspaceId: 'demo',
      catalogReleaseId: 'seed-v0.1',
      maternal: {
        materialId: 'plant-m',
        genotypes: [
          {
            genotype: {
              locusId: 'Pun1',
              alleles: ['functional', 'null-1'],
              evidenceState: 'assumed',
            },
            probability: { numerator: '1', denominator: '1' },
          },
        ],
      },
      paternal: {
        materialId: 'plant-p',
        genotypes: [
          {
            genotype: {
              locusId: 'Pun1',
              alleles: ['functional', 'null-1'],
              evidenceState: 'assumed',
            },
            probability: { numerator: '1', denominator: '1' },
          },
        ],
      },
      target: { locusId: 'Pun1', alleles: ['null-1', 'null-1'] },
      confidence: 0.95,
    });

    expect(result.authority).toBe('unsupported');
    expect(result.calculationAuthority).toBe('exact');
    expect(result.premiseAuthority).toBe('assumed');
    expect(result.distributions).toHaveLength(3);
    expect(result.targetRecovery?.geneticPopulation).toBe(11);
    expect(result.abstentions).not.toHaveLength(0);
  });
});
