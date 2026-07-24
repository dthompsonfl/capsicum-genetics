'use client';

import type { ExactSimulationRequest, ExactSimulationResponse } from '@capsicum/contracts';
import Link from 'next/link';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

type EvidenceState = 'verified' | 'inferred' | 'assumed';

type LocusRow = {
  id: string;
  locusId: string;
  maternalA: string;
  maternalB: string;
  maternalEvidence: EvidenceState;
  paternalA: string;
  paternalB: string;
  paternalEvidence: EvidenceState;
};

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

type FormState = {
  catalogReleaseId: string;
  maternalMaterialId: string;
  paternalMaterialId: string;
  loci: LocusRow[];
  targetLocusRowId: string;
  targetA: string;
  targetB: string;
  confidence: string;
  germination: string;
  survival: string;
  observationSuccess: string;
  assaySuccess: string;
};

const initialLocus: LocusRow = {
  id: 'locus-1',
  locusId: 'Pun1',
  maternalA: 'functional',
  maternalB: 'null-1',
  maternalEvidence: 'assumed',
  paternalA: 'functional',
  paternalB: 'null-1',
  paternalEvidence: 'assumed',
};

const initialState: FormState = {
  catalogReleaseId: 'user-declared-v1',
  maternalMaterialId: '',
  paternalMaterialId: '',
  loci: [initialLocus],
  targetLocusRowId: initialLocus.id,
  targetA: 'null-1',
  targetB: 'null-1',
  confidence: '0.95',
  germination: '0.90',
  survival: '0.85',
  observationSuccess: '1',
  assaySuccess: '1',
};

const MAX_UI_LOCI = 7;
const MAX_VISIBLE_RESULTS = 250;

function nextLocus(index: number): LocusRow {
  return {
    id: crypto.randomUUID(),
    locusId: `Locus-${index + 1}`,
    maternalA: 'allele-1',
    maternalB: 'allele-2',
    maternalEvidence: 'assumed',
    paternalA: 'allele-1',
    paternalB: 'allele-2',
    paternalEvidence: 'assumed',
  };
}

export function ExactSimulationForm({ workspaceId, plants, catalogReleases }: {
  workspaceId: string;
  plants: readonly { id: string; materialCode: string }[];
  catalogReleases: readonly CatalogReleaseOption[];
}) {
  const [form, setForm] = useState<FormState>(() => {
    const release = catalogReleases[0];
    const firstLocus = release?.loci[0];
    const firstAllele = firstLocus?.alleles[0];
    const secondAllele = firstLocus?.alleles[1] ?? firstAllele;
    const locus = firstLocus && firstAllele && secondAllele
      ? {
          id: initialLocus.id,
          locusId: firstLocus.catalogId,
          maternalA: firstAllele.id,
          maternalB: secondAllele.id,
          maternalEvidence: 'assumed' as const,
          paternalA: firstAllele.id,
          paternalB: secondAllele.id,
          paternalEvidence: 'assumed' as const,
        }
      : initialLocus;
    return {
      ...initialState,
      catalogReleaseId: release?.id ?? 'user-declared-v1',
      loci: [locus],
      targetLocusRowId: locus.id,
      targetA: locus.maternalA,
      targetB: locus.maternalB,
      maternalMaterialId: plants[0]?.id ?? '',
      paternalMaterialId: plants[1]?.id ?? plants[0]?.id ?? '',
    };
  });
  const [result, setResult] = useState<ExactSimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestIdentity = useRef<{ fingerprint: string; id: string } | null>(null);
  const selectedRelease = useMemo(
    () => catalogReleases.find((release) => release.id === form.catalogReleaseId),
    [catalogReleases, form.catalogReleaseId],
  );

  const request = useMemo<ExactSimulationRequest>(() => {
    const targetLocus = form.loci.find((locus) => locus.id === form.targetLocusRowId);
    return {
      schemaVersion: '1.0',
      workspaceId,
      catalogReleaseId: form.catalogReleaseId,
      maternal: {
        materialId: form.maternalMaterialId,
        genotypes: form.loci.map((locus) => ({
          genotype: {
            locusId: locus.locusId,
            alleles: [locus.maternalA, locus.maternalB],
            evidenceState: locus.maternalEvidence,
          },
          probability: { numerator: '1', denominator: '1' },
        })),
      },
      paternal: {
        materialId: form.paternalMaterialId,
        genotypes: form.loci.map((locus) => ({
          genotype: {
            locusId: locus.locusId,
            alleles: [locus.paternalA, locus.paternalB],
            evidenceState: locus.paternalEvidence,
          },
          probability: { numerator: '1', denominator: '1' },
        })),
      },
      ...(targetLocus
        ? {
            target: {
              locusId: targetLocus.locusId,
              alleles: [form.targetA, form.targetB],
            },
          }
        : {}),
      confidence: Number(form.confidence),
      operationalFactors: {
        germination: Number(form.germination),
        survival: Number(form.survival),
        observationSuccess: Number(form.observationSuccess),
        assaySuccess: Number(form.assaySuccess),
      },
    };
  }, [form, workspaceId]);

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
    if (!release) {
      setForm((current) => ({ ...current, catalogReleaseId: releaseId }));
      return;
    }
    const locusRecord = release.loci[0];
    const firstAllele = locusRecord?.alleles[0];
    const secondAllele = locusRecord?.alleles[1] ?? firstAllele;
    if (!locusRecord || !firstAllele || !secondAllele) return;
    const locus: LocusRow = {
      id: crypto.randomUUID(),
      locusId: locusRecord.catalogId,
      maternalA: firstAllele.id,
      maternalB: secondAllele.id,
      maternalEvidence: 'assumed',
      paternalA: firstAllele.id,
      paternalB: secondAllele.id,
      paternalEvidence: 'assumed',
    };
    setForm((current) => ({
      ...current,
      catalogReleaseId: releaseId,
      loci: [locus],
      targetLocusRowId: locus.id,
      targetA: firstAllele.id,
      targetB: secondAllele.id,
    }));
  }

  function updateRoot<K extends Exclude<keyof FormState, 'loci'>>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLocus<K extends keyof LocusRow>(id: string, key: K, value: LocusRow[K]) {
    setForm((current) => ({
      ...current,
      loci: current.loci.map((locus) =>
        locus.id === id ? { ...locus, [key]: value } : locus,
      ),
    }));
  }

  function addLocus() {
    setForm((current) => {
      if (current.loci.length >= MAX_UI_LOCI) return current;
      const release = catalogReleases.find((candidate) => candidate.id === current.catalogReleaseId);
      const unused = release?.loci.find((candidate) => !current.loci.some((locus) => locus.locusId === candidate.catalogId));
      if (release && !unused) return current;
      const firstAllele = unused?.alleles[0];
      const secondAllele = unused?.alleles[1] ?? firstAllele;
      const locus = unused && firstAllele && secondAllele
        ? {
            id: crypto.randomUUID(),
            locusId: unused.catalogId,
            maternalA: firstAllele.id,
            maternalB: secondAllele.id,
            maternalEvidence: 'assumed' as const,
            paternalA: firstAllele.id,
            paternalB: secondAllele.id,
            paternalEvidence: 'assumed' as const,
          }
        : nextLocus(current.loci.length);
      return { ...current, loci: [...current.loci, locus] };
    });
  }

  function changeTargetLocus(rowId: string) {
    setForm((current) => {
      const locus = current.loci.find((candidate) => candidate.id === rowId);
      if (!locus) return current;
      const release = catalogReleases.find((candidate) => candidate.id === current.catalogReleaseId);
      const releaseLocus = release?.loci.find((candidate) => candidate.catalogId === locus.locusId);
      const firstAllele = releaseLocus?.alleles[0]?.id ?? locus.maternalA;
      const secondAllele = releaseLocus?.alleles[1]?.id ?? releaseLocus?.alleles[0]?.id ?? locus.maternalB;
      return {
        ...current,
        targetLocusRowId: rowId,
        targetA: firstAllele,
        targetB: secondAllele,
      };
    });
  }

  function removeLocus(id: string) {
    setForm((current) => {
      if (current.loci.length === 1) return current;
      const loci = current.loci.filter((locus) => locus.id !== id);
      return {
        ...current,
        loci,
        targetLocusRowId:
          current.targetLocusRowId === id
            ? (loci[0]?.id ?? current.targetLocusRowId)
            : current.targetLocusRowId,
      };
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/simulations/exact', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': currentRequestId(),
        },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as
        | ExactSimulationResponse
        | { error: { message: string; code: string } };
      if (!response.ok || 'error' in payload) {
        throw new Error('error' in payload ? payload.error.message : 'Simulation failed.');
      }
      setResult(payload);
      requestIdentity.current = null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Simulation failed.');
    } finally {
      setPending(false);
    }
  }

  const visibleResults = result?.distributions.slice(0, MAX_VISIBLE_RESULTS) ?? [];
  const canAddLocus = form.loci.length < MAX_UI_LOCI
    && (!selectedRelease || form.loci.length < selectedRelease.loci.length);

  return (
    <div className="simulation-layout" style={{ marginTop: 22 }}>
      <form className="card" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <h2>Parent genotype assumptions</h2>
            <p className="muted compact">
              Add independent loci. Alleles are opaque assay identifiers, never dominance codes.
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={addLocus}
            disabled={!canAddLocus}
          >
            Add locus
          </button>
        </div>

        <div className="field" style={{ marginBottom: 18 }}>
          <label htmlFor="catalog-release">Scientific catalog authority</label>
          <select
            id="catalog-release"
            value={form.catalogReleaseId}
            onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => changeRelease(event.target.value)}
          >
            {catalogReleases.map((release) => (
              <option key={release.id} value={release.id}>
                Approved release {release.version}
              </option>
            ))}
            <option value="user-declared-v1">User-declared loci and alleles (not catalog-authoritative)</option>
          </select>
          <p className="muted compact">
            Approved releases restrict locus identifiers to reviewed release members. User-declared mode calculates exact inheritance from your explicit assumptions but does not validate those assumptions against the scientific catalog.
          </p>
        </div>

        <div className="form-grid parent-selector">
          <div className="field">
            <label htmlFor="maternal-material">Seed parent plant</label>
            <select id="maternal-material" value={form.maternalMaterialId} onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRoot('maternalMaterialId', event.target.value)} required>
              {plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.materialCode}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="paternal-material">Pollen parent plant</label>
            <select id="paternal-material" value={form.paternalMaterialId} onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRoot('paternalMaterialId', event.target.value)} required>
              {plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.materialCode}</option>)}
            </select>
          </div>
        </div>

        <div className="locus-stack">
          {form.loci.map((locus, index) => (
            <fieldset className="locus-card" key={locus.id}>
              <legend>Locus {index + 1}</legend>
              <div className="locus-toolbar">
                <div className="field locus-name">
                  <label htmlFor={`locus-${locus.id}`}>Locus identifier</label>
                  {selectedRelease ? <select
                    id={`locus-${locus.id}`}
                    value={locus.locusId}
                    onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
                      const record = selectedRelease.loci.find((candidate) => candidate.catalogId === event.target.value);
                      const firstAllele = record?.alleles[0];
                      const secondAllele = record?.alleles[1] ?? firstAllele;
                      if (!record || !firstAllele || !secondAllele) return;
                      setForm((current) => ({
                        ...current,
                        loci: current.loci.map((candidate) => candidate.id === locus.id ? {
                          ...candidate, locusId: record.catalogId, maternalA: firstAllele.id, maternalB: secondAllele.id,
                          paternalA: firstAllele.id, paternalB: secondAllele.id,
                        } : candidate),
                      }));
                    }}
                    required
                  >{selectedRelease.loci.map((record) => <option key={record.id} value={record.catalogId}>{record.catalogId} · {record.symbol} · v{record.recordVersion}</option>)}</select> : <input
                    id={`locus-${locus.id}`}
                    value={locus.locusId}
                    onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'locusId', event.target.value)}
                    required
                  />}
                </div>
                <button
                  className="text-button danger-text"
                  type="button"
                  onClick={() => removeLocus(locus.id)}
                  disabled={form.loci.length === 1}
                  aria-label={`Remove locus ${index + 1}`}
                >
                  Remove
                </button>
              </div>

              <div className="parent-grid">
                <section>
                  <h3>Seed parent genotype</h3>
                  <div className="form-grid three">
                    <div className="field">
                      <label htmlFor={`ma-${locus.id}`}>Allele 1</label>
                      {selectedRelease ? <select
                        id={`ma-${locus.id}`}
                        value={locus.maternalA}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'maternalA', event.target.value)}
                        required
                      >{selectedRelease.loci.find((record) => record.catalogId === locus.locusId)?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input
                        id={`ma-${locus.id}`}
                        value={locus.maternalA}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'maternalA', event.target.value)}
                        required
                      />}
                    </div>
                    <div className="field">
                      <label htmlFor={`mb-${locus.id}`}>Allele 2</label>
                      {selectedRelease ? <select
                        id={`mb-${locus.id}`}
                        value={locus.maternalB}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'maternalB', event.target.value)}
                        required
                      >{selectedRelease.loci.find((record) => record.catalogId === locus.locusId)?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input
                        id={`mb-${locus.id}`}
                        value={locus.maternalB}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'maternalB', event.target.value)}
                        required
                      />}
                    </div>
                    <div className="field">
                      <label htmlFor={`me-${locus.id}`}>Evidence</label>
                      <select
                        id={`me-${locus.id}`}
                        value={locus.maternalEvidence}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
                          updateLocus(
                            locus.id,
                            'maternalEvidence',
                            event.target.value as EvidenceState,
                          )
                        }
                      >
                        <option value="verified">Verified assay</option>
                        <option value="inferred">Inferred</option>
                        <option value="assumed">Assumed</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <h3>Pollen parent genotype</h3>
                  <div className="form-grid three">
                    <div className="field">
                      <label htmlFor={`pa-${locus.id}`}>Allele 1</label>
                      {selectedRelease ? <select
                        id={`pa-${locus.id}`}
                        value={locus.paternalA}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'paternalA', event.target.value)}
                        required
                      >{selectedRelease.loci.find((record) => record.catalogId === locus.locusId)?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input
                        id={`pa-${locus.id}`}
                        value={locus.paternalA}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'paternalA', event.target.value)}
                        required
                      />}
                    </div>
                    <div className="field">
                      <label htmlFor={`pb-${locus.id}`}>Allele 2</label>
                      {selectedRelease ? <select
                        id={`pb-${locus.id}`}
                        value={locus.paternalB}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'paternalB', event.target.value)}
                        required
                      >{selectedRelease.loci.find((record) => record.catalogId === locus.locusId)?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input
                        id={`pb-${locus.id}`}
                        value={locus.paternalB}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateLocus(locus.id, 'paternalB', event.target.value)}
                        required
                      />}
                    </div>
                    <div className="field">
                      <label htmlFor={`pe-${locus.id}`}>Evidence</label>
                      <select
                        id={`pe-${locus.id}`}
                        value={locus.paternalEvidence}
                        onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
                          updateLocus(
                            locus.id,
                            'paternalEvidence',
                            event.target.value as EvidenceState,
                          )
                        }
                      >
                        <option value="verified">Verified assay</option>
                        <option value="inferred">Inferred</option>
                        <option value="assumed">Assumed</option>
                      </select>
                    </div>
                  </div>
                </section>
              </div>
            </fieldset>
          ))}
        </div>

        <fieldset className="locus-card target-card">
          <legend>Target recovery plan</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="target-locus">Target locus</label>
              <select
                id="target-locus"
                value={form.targetLocusRowId}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => changeTargetLocus(event.target.value)}
              >
                {form.loci.map((locus, index) => (
                  <option key={locus.id} value={locus.id}>
                    {locus.locusId || `Locus ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="confidence">Desired confidence</label>
              <input
                id="confidence"
                type="number"
                min="0.01"
                max="0.999"
                step="0.01"
                value={form.confidence}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRoot('confidence', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ta">Target allele 1</label>
              {selectedRelease ? <select
                id="ta"
                value={form.targetA}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRoot('targetA', event.target.value)}
                required
              >{selectedRelease.loci.find((record) => record.catalogId === form.loci.find((locus) => locus.id === form.targetLocusRowId)?.locusId)?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input
                id="ta"
                value={form.targetA}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRoot('targetA', event.target.value)}
                required
              />}
            </div>
            <div className="field">
              <label htmlFor="tb">Target allele 2</label>
              {selectedRelease ? <select
                id="tb"
                value={form.targetB}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRoot('targetB', event.target.value)}
                required
              >{selectedRelease.loci.find((record) => record.catalogId === form.loci.find((locus) => locus.id === form.targetLocusRowId)?.locusId)?.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol} · v{allele.recordVersion}</option>)}</select> : <input
                id="tb"
                value={form.targetB}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRoot('targetB', event.target.value)}
                required
              />}
            </div>
          </div>
          <h3>Operational factors</h3>
          <div className="form-grid four">
            {(
              [
                ['germination', 'Expected germination'],
                ['survival', 'Expected survival'],
                ['observationSuccess', 'Observation success'],
                ['assaySuccess', 'Assay success'],
              ] as const
            ).map(([key, label]) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  id={key}
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form[key]}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRoot(key, event.target.value)}
                  required
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="notice" style={{ margin: '16px 0' }}>
          {form.catalogReleaseId === 'user-declared-v1' ? <><strong>User-declared catalog mode is active.</strong>{' '}</> : null}
          Inputs marked <strong>assumed</strong> are explicit working hypotheses. A cultivar name
          alone is not a genotype. Unknown or conflicting genotype states require weighted
          scenarios through the API rather than a hidden default.
        </div>
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Calculating…' : 'Run exact simulation'}
        </button>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      <section className="card result-panel" aria-live="polite">
        <div className="section-heading">
          <h2>Exact genotype result</h2>
          {result ? (
            <div className="badge-row" aria-label="Simulation authority">
              <span className="badge exact">Calculation: {result.calculationAuthority}</span>
              <span className="badge">Premises: {result.premiseAuthority.replaceAll('_', ' ')}</span>
              <span className="badge">Interpretation: {result.interpretationAuthority.replaceAll('_', ' ')}</span>
            </div>
          ) : null}
        </div>
        {!result ? (
          <p className="muted">
            Run the simulation to see exact fractions, target recovery, provenance, warnings,
            and abstentions.
          </p>
        ) : (
          <>
            <p className="muted compact">
              {result.distributions.length.toLocaleString()} unique multilocus genotype outcomes. Exact calculation does not upgrade assumed, inferred, conflicting, or unknown premises into verified evidence.
            </p>
            {visibleResults.map((entry) => {
              const percent = entry.probability.decimal * 100;
              const label = entry.genotype
                .map((locus) => `${locus.locusId}: ${locus.alleles.join(' / ')}`)
                .join(' · ');
              return (
                <div className="result-row" key={label}>
                  <div>
                    <strong>{label}</strong>
                    <div className="bar">
                      <span style={{ width: `${Math.min(percent, 100)}%` }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{percent.toFixed(4)}%</strong>
                    <div className="mono muted">
                      {entry.probability.numerator}/{entry.probability.denominator}
                    </div>
                  </div>
                </div>
              );
            })}
            {result.distributions.length > MAX_VISIBLE_RESULTS ? (
              <div className="notice" style={{ marginTop: 14 }}>
                Showing the first {MAX_VISIBLE_RESULTS} deterministic outcomes. The API response
                contains all {result.distributions.length.toLocaleString()} outcomes.
              </div>
            ) : null}
            {result.targetRecovery ? (
              <div className="notice" style={{ marginTop: 18 }}>
                <strong>Target probability:</strong>{' '}
                {(result.targetRecovery.geneticProbability * 100).toFixed(4)}%.{' '}
                {result.targetRecovery.geneticReachable ? (
                  <>
                    Screen at least {result.targetRecovery.geneticPopulation} genetically expected
                    offspring, or {result.targetRecovery.practicalPopulation ?? 'an unreachable number of'}{' '}
                    starting seeds after the stated operational factors, for{' '}
                    {(result.targetRecovery.confidence * 100).toFixed(0)}% probability of observing
                    at least one target.
                  </>
                ) : (
                  <>The requested target is unreachable under the declared parent genotype model.</>
                )}{' '}
                This is a probability threshold, not a guarantee.
              </div>
            ) : null}
            <h3>Scientific boundaries</h3>
            <ul>
              {result.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {result.abstentions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p><Link className="button secondary" href={`/simulations/${result.runId}`}>Open persisted run</Link></p>
            <p className="mono muted result-provenance">
              Model {result.modelVersion} · catalog {result.catalogReleaseId} · hash{' '}
              {result.contentHash}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
