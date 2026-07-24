'use client';

import { crossSingleLocus, planTargetRecovery, type DiploidGenotype } from '@capsicum/genetics-core';
import { useMemo, useState } from 'react';

type GenotypeChoice = 'AA' | 'AB' | 'BB';

const choices: readonly { value: GenotypeChoice; label: string }[] = [
  { value: 'AA', label: 'Two copies of allele 1' },
  { value: 'AB', label: 'One copy of each allele' },
  { value: 'BB', label: 'Two copies of allele 2' },
];

function genotype(choice: GenotypeChoice, locusId: string, first: string, second: string): DiploidGenotype {
  const alleles: readonly [string, string] = choice === 'AA'
    ? [first, first]
    : choice === 'BB'
      ? [second, second]
      : [first, second];
  return { locusId, alleles, evidenceState: 'assumed' };
}

function percent(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(value);
}

export function QuickGeneticsCalculator() {
  const [locusId, setLocusId] = useState('Pun1');
  const [alleleOne, setAlleleOne] = useState('functional');
  const [alleleTwo, setAlleleTwo] = useState('null');
  const [maternal, setMaternal] = useState<GenotypeChoice>('AB');
  const [paternal, setPaternal] = useState<GenotypeChoice>('AB');
  const [target, setTarget] = useState<GenotypeChoice>('BB');
  const [confidence, setConfidence] = useState(95);
  const [germination, setGermination] = useState(90);
  const [survival, setSurvival] = useState(85);

  const calculation = useMemo(() => {
    try {
      const normalizedLocus = locusId.trim();
      const normalizedAlleleOne = alleleOne.trim();
      const normalizedAlleleTwo = alleleTwo.trim();
      if (!normalizedLocus) throw new RangeError('Enter a locus name.');
      if (!normalizedAlleleOne || !normalizedAlleleTwo) throw new RangeError('Enter both allele identifiers.');
      if (normalizedAlleleOne.toLocaleLowerCase() === normalizedAlleleTwo.toLocaleLowerCase()) {
        throw new RangeError('Allele 1 and allele 2 must have different identifiers.');
      }
      if (!Number.isFinite(confidence) || confidence < 50 || confidence > 99.9) {
        throw new RangeError('Planning confidence must be between 50% and 99.9%.');
      }
      if (!Number.isFinite(germination) || germination <= 0 || germination > 100) {
        throw new RangeError('Expected germination must be greater than 0% and no more than 100%.');
      }
      if (!Number.isFinite(survival) || survival <= 0 || survival > 100) {
        throw new RangeError('Expected survival must be greater than 0% and no more than 100%.');
      }
      const maternalGenotype = genotype(maternal, normalizedLocus, normalizedAlleleOne, normalizedAlleleTwo);
      const paternalGenotype = genotype(paternal, normalizedLocus, normalizedAlleleOne, normalizedAlleleTwo);
      const targetGenotype = genotype(target, normalizedLocus, normalizedAlleleOne, normalizedAlleleTwo);
      const distribution = crossSingleLocus(maternalGenotype, paternalGenotype);
      const targetAlleles = [...targetGenotype.alleles].sort().join('\0');
      const targetResult = distribution.find((item) => [...item.value.alleles].sort().join('\0') === targetAlleles);
      const targetProbability = targetResult?.probability.toNumber() ?? 0;
      const recovery = planTargetRecovery(targetProbability, confidence / 100, {
        germination: germination / 100,
        survival: survival / 100,
        observationSuccess: 1,
        assaySuccess: 1,
      });
      return { distribution, targetProbability, recovery, error: null };
    } catch (error) {
      return {
        distribution: [],
        targetProbability: 0,
        recovery: null,
        error: error instanceof Error ? error.message : 'The calculation could not be completed.',
      };
    }
  }, [alleleOne, alleleTwo, confidence, germination, locusId, maternal, paternal, survival, target]);

  function useGenericPreset() {
    setLocusId('Locus-1');
    setAlleleOne('allele-1');
    setAlleleTwo('allele-2');
    setMaternal('AB');
    setPaternal('AB');
    setTarget('BB');
  }

  function usePun1Preset() {
    setLocusId('Pun1');
    setAlleleOne('functional');
    setAlleleTwo('null');
    setMaternal('AB');
    setPaternal('AB');
    setTarget('BB');
  }

  return (
    <div className="simulation-layout">
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>1. Describe one locus</h2>
            <p className="muted compact">A locus is a location in the genome. The two allele names are identifiers, not automatic claims about dominance or phenotype.</p>
          </div>
          <div className="button-row">
            <button className="button secondary" type="button" onClick={useGenericPreset}>Generic example</button>
            <button className="button secondary" type="button" onClick={usePun1Preset}>Pun1 teaching example</button>
          </div>
        </div>
        <div className="form-grid section-gap">
          <div className="field"><label htmlFor="quick-locus">Locus name</label><input id="quick-locus" value={locusId} onChange={(event) => setLocusId(event.target.value)} /></div>
          <div className="field"><label htmlFor="quick-allele-one">Allele 1 identifier</label><input id="quick-allele-one" value={alleleOne} onChange={(event) => setAlleleOne(event.target.value)} /></div>
          <div className="field"><label htmlFor="quick-allele-two">Allele 2 identifier</label><input id="quick-allele-two" value={alleleTwo} onChange={(event) => setAlleleTwo(event.target.value)} /></div>
        </div>

        <h2 className="section-gap">2. Choose both parent genotypes</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor="quick-maternal">Seed parent genotype</label><select id="quick-maternal" value={maternal} onChange={(event) => setMaternal(event.target.value as GenotypeChoice)}>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.value} — {choice.label}</option>)}</select></div>
          <div className="field"><label htmlFor="quick-paternal">Pollen parent genotype</label><select id="quick-paternal" value={paternal} onChange={(event) => setPaternal(event.target.value as GenotypeChoice)}>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.value} — {choice.label}</option>)}</select></div>
        </div>

        <h2 className="section-gap">3. Plan for a target</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor="quick-target">Target genotype</label><select id="quick-target" value={target} onChange={(event) => setTarget(event.target.value as GenotypeChoice)}>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.value} — {choice.label}</option>)}</select></div>
          <div className="field"><label htmlFor="quick-confidence">Desired chance of recovering at least one target</label><input id="quick-confidence" type="number" min="50" max="99.9" step="0.1" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /><small>95% is a common planning value. It is not a guarantee.</small></div>
          <div className="field"><label htmlFor="quick-germination">Expected germination (%)</label><input id="quick-germination" type="number" min="1" max="100" step="1" value={germination} onChange={(event) => setGermination(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="quick-survival">Expected survival to selection (%)</label><input id="quick-survival" type="number" min="1" max="100" step="1" value={survival} onChange={(event) => setSurvival(Number(event.target.value))} /></div>
        </div>
        <div className="help section-gap"><strong>Scientific boundary</strong><p>This calculator predicts genotype segregation for one diploid nuclear locus under ordinary Mendelian transmission. It does not infer dominance, gene interaction, linkage, cytoplasmic inheritance, exact heat level, fruit color, yield, or disease resistance. Those conclusions require separately reviewed evidence and often multi-locus models.</p></div>
      </section>

      <aside className="card result-panel" aria-live="polite">
        <span className="eyebrow">Exact result</span>
        <h2>Expected offspring genotypes</h2>
        {calculation.error ? <p className="error" role="alert">{calculation.error}</p> : (
          <>
            {calculation.distribution.map((item) => {
              const probability = item.probability.toNumber();
              return <div className="result-row" key={item.value.alleles.join('|')}><div><strong className="mono">{item.value.alleles.join(' / ')}</strong><div className="bar"><span style={{ width: `${probability * 100}%` }} /></div></div><div><strong>{percent(probability)}</strong><br /><span className="muted mono">{item.probability.toString()}</span></div></div>;
            })}
            <div className="notice section-gap">
              <strong>Target probability: {percent(calculation.targetProbability)}</strong>
              <p>For a {confidence}% planning confidence, the genetic minimum is <strong>{calculation.recovery?.geneticPopulation ?? 'unreachable'}</strong> offspring. After the entered germination and survival assumptions, start with approximately <strong>{calculation.recovery?.practicalPopulation ?? 'unreachable'}</strong> seeds.</p>
            </div>
            <p className="muted">These are probabilities across repeated offspring, not a promise about a specific seed or pod.</p>
          </>
        )}
      </aside>
    </div>
  );
}
