'use client';

import type { ExactSimulationRequest, ExactSimulationResponse } from '@capsicum/contracts';
import Link from 'next/link';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

type EvidenceState = 'verified' | 'inferred' | 'assumed' | 'unknown' | 'conflicting';

type CatalogReleaseOption = {
  id: string;
  version: string;
  contentHash: string;
  loci: readonly {
    id: string;
    catalogId: string;
    symbol: string;
    recordVersion: string;
    alleles: readonly { id: string; symbol: string; recordVersion: string }[];
  }[];
};

type ScenarioRow = {
  id: string;
  locusId: string;
  alleleA: string;
  alleleB: string;
  evidenceState: EvidenceState;
  numerator: string;
  denominator: string;
};

const evidenceOptions: ReadonlyArray<{ value: EvidenceState; label: string }> = [
  { value: 'verified', label: 'Verified assay' },
  { value: 'inferred', label: 'Inferred from evidence' },
  { value: 'assumed', label: 'User assumption' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'conflicting', label: 'Conflicting evidence' },
];

function rowFromCatalog(
  id: string,
  release: CatalogReleaseOption | undefined,
  locusIndex = 0,
): ScenarioRow {
  const locus = release?.loci[locusIndex] ?? release?.loci[0];
  const firstAllele = locus?.alleles[0];
  const secondAllele = locus?.alleles[1] ?? firstAllele;
  return {
    id,
    locusId: locus?.catalogId ?? 'Pun1',
    alleleA: firstAllele?.id ?? 'functional',
    alleleB: secondAllele?.id ?? 'null-1',
    evidenceState: 'assumed',
    numerator: '1',
    denominator: '1',
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a || 1n;
}

function exactTotal(rows: readonly ScenarioRow[]): { numerator: bigint; denominator: bigint } | null {
  let numerator = 0n;
  let denominator = 1n;
  for (const row of rows) {
    if (!/^\d{1,100}$/.test(row.numerator) || !/^\d{1,100}$/.test(row.denominator)) return null;
    const nextNumerator = BigInt(row.numerator);
    const nextDenominator = BigInt(row.denominator);
    if (nextNumerator <= 0n || nextDenominator <= 0n || nextNumerator > nextDenominator) return null;
    numerator = numerator * nextDenominator + nextNumerator * denominator;
    denominator *= nextDenominator;
    const divisor = greatestCommonDivisor(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
  }
  return { numerator, denominator };
}

function groupRows(rows: readonly ScenarioRow[]): Map<string, ScenarioRow[]> {
  const groups = new Map<string, ScenarioRow[]>();
  for (const row of rows) {
    const current = groups.get(row.locusId) ?? [];
    current.push(row);
    groups.set(row.locusId, current);
  }
  return groups;
}

function exactTotals(rows: readonly ScenarioRow[]) {
  return [...groupRows(rows)].map(([locusId, possibilities]) => ({
    locusId,
    possibilities,
    total: exactTotal(possibilities),
  }));
}

function validateParents(maternal: readonly ScenarioRow[], paternal: readonly ScenarioRow[]): string | null {
  const maternalTotals = exactTotals(maternal);
  const paternalTotals = exactTotals(paternal);
  for (const parent of [
    { name: 'Seed parent', totals: maternalTotals },
    { name: 'Pollen parent', totals: paternalTotals },
  ]) {
    for (const item of parent.totals) {
      if (!item.locusId.trim()) return `${parent.name} locus identifiers are required.`;
      if (!item.possibilities.every((row) => row.alleleA.trim() && row.alleleB.trim())) {
        return `${parent.name} allele identifiers are required for ${item.locusId}.`;
      }
      if (!item.total) return `${parent.name} weights for ${item.locusId} must be positive exact fractions no greater than 1.`;
      if (item.total.numerator !== item.total.denominator) {
        return `${parent.name} weights for ${item.locusId} must sum exactly to 1; current total is ${item.total.numerator}/${item.total.denominator}.`;
      }
    }
  }
  const maternalLoci = maternalTotals.map((item) => item.locusId).sort();
  const paternalLoci = paternalTotals.map((item) => item.locusId).sort();
  if (JSON.stringify(maternalLoci) !== JSON.stringify(paternalLoci)) {
    return 'Seed-parent and pollen-parent scenarios must define the same locus set.';
  }
  return null;
}

function ProbabilityStatus({ rows }: { rows: readonly ScenarioRow[] }) {
  const totals = exactTotals(rows);
  return <div className="notice" aria-live="polite">
    <strong>Exact probability totals</strong>
    <ul className="compact-list">
      {totals.map(({ locusId, total }) => <li key={locusId}>
        {locusId || 'Unnamed locus'}: {total ? `${total.numerator}/${total.denominator}` : 'invalid fraction'}
        {total?.numerator === total?.denominator ? ' ✓' : ' — must equal 1'}
      </li>)}
    </ul>
  </div>;
}

function ScenarioEditor({
  label,
  rows,
  release,
  onChange,
}: {
  label: string;
  rows: readonly ScenarioRow[];
  release: CatalogReleaseOption | undefined;
  onChange: (rows: ScenarioRow[]) => void;
}) {
  function update<K extends keyof ScenarioRow>(id: string, key: K, value: ScenarioRow[K]) {
    onChange(rows.map((row) => row.id === id ? { ...row, [key]: value } : row));
  }

  function changeLocus(row: ScenarioRow, locusId: string) {
    const locus = release?.loci.find((candidate) => candidate.catalogId === locusId);
    const firstAllele = locus?.alleles[0];
    const secondAllele = locus?.alleles[1] ?? firstAllele;
    onChange(rows.map((candidate) => candidate.id === row.id ? {
      ...candidate,
      locusId,
      alleleA: firstAllele?.id ?? candidate.alleleA,
      alleleB: secondAllele?.id ?? firstAllele?.id ?? candidate.alleleB,
    } : candidate));
  }

  function addPossibility() {
    const reference = rows.at(-1) ?? rowFromCatalog('reference', release);
    onChange([...rows, {
      ...reference,
      id: crypto.randomUUID(),
      evidenceState: reference.evidenceState === 'verified' ? 'conflicting' : reference.evidenceState,
      numerator: '1',
      denominator: '2',
    }]);
  }

  function addLocus() {
    const used = new Set(rows.map((row) => row.locusId));
    const unusedIndex = release?.loci.findIndex((locus) => !used.has(locus.catalogId)) ?? -1;
    if (release && unusedIndex < 0) return;
    const row = release
      ? rowFromCatalog(crypto.randomUUID(), release, unusedIndex)
      : {
          ...rowFromCatalog(crypto.randomUUID(), undefined),
          locusId: `Locus-${used.size + 1}`,
          alleleA: 'allele-1',
          alleleB: 'allele-2',
        };
    onChange([...rows, row]);
  }

  return <fieldset className="locus-card">
    <legend>{label}</legend>
    <p className="muted compact">Each row is one possible diploid genotype. Possibilities are grouped by locus and each group must total exactly 1.</p>
    <div className="locus-stack">
      {rows.map((row, index) => {
        const locus = release?.loci.find((candidate) => candidate.catalogId === row.locusId);
        return <section className="card inset-card" key={row.id} aria-labelledby={`${row.id}-title`}>
          <div className="section-heading">
            <h3 id={`${row.id}-title`}>Possibility {index + 1}</h3>
            <button className="text-button danger-text" type="button" disabled={rows.length === 1} onClick={() => onChange(rows.filter((candidate) => candidate.id !== row.id))}>Remove</button>
          </div>
          <div className="form-grid three">
            <label className="field"><span>Locus</span>{release ? <select value={row.locusId} onChange={(event: ChangeEvent<HTMLSelectElement>) => changeLocus(row, event.target.value)}>{release.loci.map((candidate) => <option key={candidate.id} value={candidate.catalogId}>{candidate.catalogId} · {candidate.symbol} · v{candidate.recordVersion}</option>)}</select> : <input value={row.locusId} onChange={(event: ChangeEvent<HTMLInputElement>) => update(row.id, 'locusId', event.target.value)} />}</label>
            <label className="field"><span>Allele 1</span>{release ? <select value={row.alleleA} onChange={(event: ChangeEvent<HTMLSelectElement>) => update(row.id, 'alleleA', event.target.value)}>{locus?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input value={row.alleleA} onChange={(event: ChangeEvent<HTMLInputElement>) => update(row.id, 'alleleA', event.target.value)} />}</label>
            <label className="field"><span>Allele 2</span>{release ? <select value={row.alleleB} onChange={(event: ChangeEvent<HTMLSelectElement>) => update(row.id, 'alleleB', event.target.value)}>{locus?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input value={row.alleleB} onChange={(event: ChangeEvent<HTMLInputElement>) => update(row.id, 'alleleB', event.target.value)} />}</label>
            <label className="field"><span>Evidence state</span><select value={row.evidenceState} onChange={(event: ChangeEvent<HTMLSelectElement>) => update(row.id, 'evidenceState', event.target.value as EvidenceState)}>{evidenceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="field"><span>Weight numerator</span><input inputMode="numeric" pattern="[0-9]+" value={row.numerator} onChange={(event: ChangeEvent<HTMLInputElement>) => update(row.id, 'numerator', event.target.value)} /></label>
            <label className="field"><span>Weight denominator</span><input inputMode="numeric" pattern="[0-9]+" value={row.denominator} onChange={(event: ChangeEvent<HTMLInputElement>) => update(row.id, 'denominator', event.target.value)} /></label>
          </div>
        </section>;
      })}
    </div>
    <div className="button-row">
      <button className="button secondary" type="button" onClick={addPossibility}>Add genotype possibility</button>
      <button className="button secondary" type="button" onClick={addLocus} disabled={Boolean(release && new Set(rows.map((row) => row.locusId)).size >= release.loci.length)}>Add locus</button>
    </div>
    <ProbabilityStatus rows={rows} />
  </fieldset>;
}

export function WeightedSimulationForm({ workspaceId, plants, catalogReleases }: {
  workspaceId: string;
  plants: readonly { id: string; materialCode: string }[];
  catalogReleases: readonly CatalogReleaseOption[];
}) {
  const initialRelease = catalogReleases[0];
  const [maternalMaterialId, setMaternalMaterialId] = useState(plants[0]?.id ?? '');
  const [paternalMaterialId, setPaternalMaterialId] = useState(plants[1]?.id ?? plants[0]?.id ?? '');
  const [catalogReleaseId, setCatalogReleaseId] = useState(initialRelease?.id ?? 'user-declared-v1');
  const [maternalRows, setMaternalRows] = useState<ScenarioRow[]>([rowFromCatalog('maternal-1', initialRelease)]);
  const [paternalRows, setPaternalRows] = useState<ScenarioRow[]>([rowFromCatalog('paternal-1', initialRelease)]);
  const [targetLocusId, setTargetLocusId] = useState(initialRelease?.loci[0]?.catalogId ?? 'Pun1');
  const [targetAlleleOne, setTargetAlleleOne] = useState(initialRelease?.loci[0]?.alleles[0]?.id ?? 'null-1');
  const [targetAlleleTwo, setTargetAlleleTwo] = useState(initialRelease?.loci[0]?.alleles[1]?.id ?? initialRelease?.loci[0]?.alleles[0]?.id ?? 'null-1');
  const [result, setResult] = useState<ExactSimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestIdentity = useRef<{ fingerprint: string; id: string } | null>(null);
  const selectedRelease = useMemo(() => catalogReleases.find((release) => release.id === catalogReleaseId), [catalogReleases, catalogReleaseId]);
  const targetLocus = selectedRelease?.loci.find((locus) => locus.catalogId === targetLocusId);

  const request = useMemo<ExactSimulationRequest>(() => ({
    schemaVersion: '1.0',
    workspaceId,
    catalogReleaseId,
    maternal: {
      materialId: maternalMaterialId,
      genotypes: maternalRows.map((row) => ({
        genotype: { locusId: row.locusId, alleles: [row.alleleA, row.alleleB], evidenceState: row.evidenceState },
        probability: { numerator: row.numerator, denominator: row.denominator },
      })),
    },
    paternal: {
      materialId: paternalMaterialId,
      genotypes: paternalRows.map((row) => ({
        genotype: { locusId: row.locusId, alleles: [row.alleleA, row.alleleB], evidenceState: row.evidenceState },
        probability: { numerator: row.numerator, denominator: row.denominator },
      })),
    },
    target: { locusId: targetLocusId, alleles: [targetAlleleOne, targetAlleleTwo] },
    confidence: 0.95,
    operationalFactors: { germination: 1, survival: 1, observationSuccess: 1, assaySuccess: 1 },
  }), [catalogReleaseId, maternalMaterialId, maternalRows, paternalMaterialId, paternalRows, targetAlleleOne, targetAlleleTwo, targetLocusId, workspaceId]);

  const requestFingerprint = useMemo(() => JSON.stringify(request), [request]);

  function currentRequestId(): string {
    if (requestIdentity.current?.fingerprint === requestFingerprint) {
      return requestIdentity.current.id;
    }
    const identity = { fingerprint: requestFingerprint, id: crypto.randomUUID() };
    requestIdentity.current = identity;
    return identity.id;
  }

  function changeRelease(releaseId: string) {
    const release = catalogReleases.find((candidate) => candidate.id === releaseId);
    const maternal = rowFromCatalog(crypto.randomUUID(), release);
    const paternal = rowFromCatalog(crypto.randomUUID(), release);
    setCatalogReleaseId(releaseId);
    setMaternalRows([maternal]);
    setPaternalRows([paternal]);
    setTargetLocusId(maternal.locusId);
    setTargetAlleleOne(maternal.alleleA);
    setTargetAlleleTwo(maternal.alleleB);
    setResult(null);
  }

  function changeTargetLocus(locusId: string) {
    setTargetLocusId(locusId);
    const locus = selectedRelease?.loci.find((candidate) => candidate.catalogId === locusId);
    const firstAllele = locus?.alleles[0]?.id;
    const secondAllele = locus?.alleles[1]?.id ?? firstAllele;
    if (firstAllele && secondAllele) {
      setTargetAlleleOne(firstAllele);
      setTargetAlleleTwo(secondAllele);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const validationError = validateParents(maternalRows, paternalRows);
      if (validationError) throw new TypeError(validationError);
      const response = await fetch('/api/simulations/exact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': currentRequestId() },
        body: JSON.stringify(request),
      });
      const payload = await response.json() as ExactSimulationResponse | { error: { message: string; code: string } };
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error.message : 'Simulation failed.');
      setResult(payload);
      requestIdentity.current = null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Weighted simulation failed safely.');
    } finally {
      setPending(false);
    }
  }

  const targetLocusOptions = selectedRelease?.loci ?? [...new Set(maternalRows.map((row) => row.locusId))].map((locusId) => ({ id: locusId, catalogId: locusId, symbol: locusId, recordVersion: 'user-declared', alleles: [] }));

  return <details className="card section-gap">
    <summary><strong>Guided weighted genotype uncertainty</strong></summary>
    <p className="muted">Use exact rational weights when a parent genotype is unknown or conflicting. Every locus distribution must sum exactly to 1. Nothing is inferred from a cultivar name, capitalization, or visual phenotype.</p>
    <form onSubmit={submit} className="form-grid">
      <label className="field"><span>Scientific catalog authority</span><select value={catalogReleaseId} onChange={(event: ChangeEvent<HTMLSelectElement>) => changeRelease(event.target.value)}>{catalogReleases.map((release) => <option key={release.id} value={release.id}>Approved release {release.version}</option>)}<option value="user-declared-v1">User-declared research scenario</option></select></label>
      {catalogReleaseId === 'user-declared-v1' ? <div className="warning"><strong>Lower-authority mode.</strong> The engine will calculate the declared fractions exactly, but the locus and allele premises are not validated against a published catalog release.</div> : <div className="notice"><strong>Approved identifier set.</strong> This release constrains locus and allele identity, but it does not prove either selected plant carries the genotype you enter.</div>}
      <div className="form-grid">
        <label className="field"><span>Seed parent plant</span><select value={maternalMaterialId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setMaternalMaterialId(event.target.value)}>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.materialCode}</option>)}</select></label>
        <label className="field"><span>Pollen parent plant</span><select value={paternalMaterialId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPaternalMaterialId(event.target.value)}>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.materialCode}</option>)}</select></label>
      </div>
      <ScenarioEditor label="Seed-parent genotype possibilities" rows={maternalRows} release={selectedRelease} onChange={setMaternalRows} />
      <ScenarioEditor label="Pollen-parent genotype possibilities" rows={paternalRows} release={selectedRelease} onChange={setPaternalRows} />
      <fieldset className="locus-card">
        <legend>Target recovery</legend>
        <div className="form-grid three">
          <label className="field"><span>Target locus</span>{selectedRelease ? <select value={targetLocusId} onChange={(event: ChangeEvent<HTMLSelectElement>) => changeTargetLocus(event.target.value)}>{targetLocusOptions.map((locus) => <option key={locus.id} value={locus.catalogId}>{locus.catalogId} · {locus.symbol}</option>)}</select> : <input value={targetLocusId} onChange={(event: ChangeEvent<HTMLInputElement>) => setTargetLocusId(event.target.value)} />}</label>
          <label className="field"><span>Target allele 1</span>{selectedRelease ? <select value={targetAlleleOne} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTargetAlleleOne(event.target.value)}>{targetLocus?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input value={targetAlleleOne} onChange={(event: ChangeEvent<HTMLInputElement>) => setTargetAlleleOne(event.target.value)} />}</label>
          <label className="field"><span>Target allele 2</span>{selectedRelease ? <select value={targetAlleleTwo} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTargetAlleleTwo(event.target.value)}>{targetLocus?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input value={targetAlleleTwo} onChange={(event: ChangeEvent<HTMLInputElement>) => setTargetAlleleTwo(event.target.value)} />}</label>
        </div>
      </fieldset>
      <button className="button" type="submit" disabled={pending}>{pending ? 'Calculating…' : 'Run weighted exact simulation'}</button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {result ? <div className="notice" aria-live="polite"><strong>{result.distributions.length.toLocaleString()} exact outcomes.</strong> Calculation: {result.calculationAuthority}. Premises: {result.premiseAuthority.replaceAll('_', ' ')}. Interpretation: {result.interpretationAuthority.replaceAll('_', ' ')}. Target probability: {result.targetRecovery ? `${(result.targetRecovery.geneticProbability * 100).toFixed(6)}%` : 'not requested'}. <Link href={`/simulations/${result.runId}`}>Open immutable run</Link>.</div> : null}
    </form>
  </details>;
}
