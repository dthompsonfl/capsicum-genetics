import { describe, expect, it } from 'vitest';
import { Rational, crossSingleLocus } from './index';

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}

describe('property-style invariants', () => {
  it('preserves exact mass and parent-swap symmetry over randomized allele identifiers', () => {
    const random = pseudoRandom(20260722);
    for (let index = 0; index < 250; index += 1) {
      const alleles = Array.from({ length: 4 }, (_, alleleIndex) => `a-${Math.floor(random() * 8)}-${alleleIndex}`);
      const maternal = { locusId: `l-${index}`, alleles: [alleles[0]!, alleles[1]!] as const, evidenceState: 'verified' as const };
      const paternal = { locusId: `l-${index}`, alleles: [alleles[2]!, alleles[3]!] as const, evidenceState: 'verified' as const };
      const forward = crossSingleLocus(maternal, paternal);
      const reverse = crossSingleLocus(paternal, maternal);
      expect(forward.reduce((sum, item) => sum.add(item.probability), Rational.ZERO).equals(Rational.ONE)).toBe(true);
      expect(forward.map((item) => [item.value.alleles, item.probability.toString()])).toEqual(reverse.map((item) => [item.value.alleles, item.probability.toString()]));
    }
  });
});
