'use client';

import type { GovernedAdvancedSimulationRequest, GovernedSimulationOutcome } from '@capsicum/contracts';
import Link from 'next/link';
import { useMemo, useRef, useState, type FormEvent } from 'react';

type CatalogRuleOption = {
  id: string;
  key: string;
  version: string;
  kind: 'phenotype_rule_graph_node_v1' | 'host_pathogen_rule_v1';
  expression: Record<string, unknown>;
  supportingAssertionId: string;
};
type CatalogReleaseOption = {
  id: string;
  version: string;
  loci: readonly {
    id: string;
    catalogId: string;
    symbol: string;
    alleles: readonly { id: string; symbol: string }[];
  }[];
  rules: readonly CatalogRuleOption[];
};
type Mode = 'linked_two_locus' | 'maternal_state' | 'conditional_rule_graph' | 'host_pathogen' | 'direct_monte_carlo';
type Evidence = 'verified' | 'inferred' | 'assumed';

function firstAllele(release: CatalogReleaseOption | undefined, locusId: string, index = 0): string {
  return release?.loci.find((locus) => locus.id === locusId)?.alleles[index]?.id
    ?? release?.loci.find((locus) => locus.id === locusId)?.alleles[0]?.id
    ?? 'user-declared-allele';
}
function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function optionalText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function predicateLoci(expression: Record<string, unknown>): string[] {
  const predicates = [
    ...(Array.isArray(expression.all) ? expression.all : []),
    ...(Array.isArray(expression.any) ? expression.any : []),
  ];
  return [...new Set(predicates.map((value) => optionalText(objectValue(value).locusId)).filter(Boolean))];
}

export function AdvancedSimulationForm({ workspaceId, plants, catalogReleases }: {
  workspaceId: string;
  plants: readonly { id: string; materialCode: string }[];
  catalogReleases: readonly CatalogReleaseOption[];
}) {
  const initialRelease = catalogReleases[0];
  const [mode, setMode] = useState<Mode>('linked_two_locus');
  const [catalogReleaseId, setCatalogReleaseId] = useState(initialRelease?.id ?? 'user-declared-v1');
  const selectedRelease = useMemo(() => catalogReleases.find((candidate) => candidate.id === catalogReleaseId), [catalogReleaseId, catalogReleases]);
  const conditionalRules = useMemo(() => selectedRelease?.rules.filter((rule) => rule.kind === 'phenotype_rule_graph_node_v1') ?? [], [selectedRelease]);
  const hostRules = useMemo(() => selectedRelease?.rules.filter((rule) => rule.kind === 'host_pathogen_rule_v1') ?? [], [selectedRelease]);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const selectedRule = selectedRelease?.rules.find((rule) => rule.id === selectedRuleId);
  const ruleExpression = objectValue(selectedRule?.expression);

  const initialFirstLocus = initialRelease?.loci[0]?.id ?? 'Locus-A';
  const initialSecondLocus = initialRelease?.loci[1]?.id ?? 'Locus-B';
  const [maternalMaterialId, setMaternalMaterialId] = useState(plants[0]?.id ?? '');
  const [paternalMaterialId, setPaternalMaterialId] = useState(plants[1]?.id ?? plants[0]?.id ?? '');
  const [locusOne, setLocusOne] = useState(initialFirstLocus);
  const [locusTwo, setLocusTwo] = useState(initialSecondLocus);
  const [maternalA1, setMaternalA1] = useState(firstAllele(initialRelease, initialFirstLocus));
  const [maternalA2, setMaternalA2] = useState(firstAllele(initialRelease, initialSecondLocus));
  const [maternalB1, setMaternalB1] = useState(firstAllele(initialRelease, initialFirstLocus, 1));
  const [maternalB2, setMaternalB2] = useState(firstAllele(initialRelease, initialSecondLocus, 1));
  const [paternalA1, setPaternalA1] = useState(firstAllele(initialRelease, initialFirstLocus));
  const [paternalA2, setPaternalA2] = useState(firstAllele(initialRelease, initialSecondLocus));
  const [paternalB1, setPaternalB1] = useState(firstAllele(initialRelease, initialFirstLocus, 1));
  const [paternalB2, setPaternalB2] = useState(firstAllele(initialRelease, initialSecondLocus, 1));
  const [phaseEvidence, setPhaseEvidence] = useState<Evidence>('assumed');
  const [maternalRecombination, setMaternalRecombination] = useState('1');
  const [paternalRecombination, setPaternalRecombination] = useState('1');
  const [recombinationDenominator, setRecombinationDenominator] = useState('4');
  const [maternalSystemId, setMaternalSystemId] = useState('cytoplasmic-state');
  const [maternalStateId, setMaternalStateId] = useState('declared-state');
  const [pathogenTaxon, setPathogenTaxon] = useState('');
  const [strain, setStrain] = useState('');
  const [isolate, setIsolate] = useState('');
  const [race, setRace] = useState('');
  const [pathotype, setPathotype] = useState('');
  const [assayContextId, setAssayContextId] = useState('');
  const [environmentContextId, setEnvironmentContextId] = useState('');
  const [effectorProfile, setEffectorProfile] = useState('');
  const [seed, setSeed] = useState('20260723');
  const [sampleCount, setSampleCount] = useState('100000');
  const requestIdentity = useRef<{ fingerprint: string; id: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GovernedSimulationOutcome | null>(null);

  function resetLociForRelease(release: CatalogReleaseOption | undefined): void {
    const one = release?.loci[0]?.id ?? 'Locus-A';
    const two = release?.loci[1]?.id ?? 'Locus-B';
    setLocusOne(one);
    setLocusTwo(two);
    setMaternalA1(firstAllele(release, one));
    setMaternalB1(firstAllele(release, one, 1));
    setPaternalA1(firstAllele(release, one));
    setPaternalB1(firstAllele(release, one, 1));
    setMaternalA2(firstAllele(release, two));
    setMaternalB2(firstAllele(release, two, 1));
    setPaternalA2(firstAllele(release, two));
    setPaternalB2(firstAllele(release, two, 1));
  }

  function applyRule(
    rule: CatalogRuleOption | undefined,
    release: CatalogReleaseOption | undefined,
  ): void {
    if (!rule) return;
    const expression = objectValue(rule.expression);
    if (rule.kind === 'phenotype_rule_graph_node_v1') {
      const loci = predicateLoci(expression);
      const one = loci[0] ?? release?.loci[0]?.id ?? 'Locus-A';
      const two = loci[1] ?? release?.loci.find((candidate) => candidate.id !== one)?.id ?? one;
      setLocusOne(one);
      setLocusTwo(two);
      setMaternalA1(firstAllele(release, one));
      setMaternalB1(firstAllele(release, one, 1));
      setMaternalA2(firstAllele(release, two));
      setMaternalB2(firstAllele(release, two, 1));
      return;
    }

    const hostLocus = optionalText(expression.hostLocusId) || release?.loci[0]?.id || 'Locus-A';
    const declaredAlleles = Array.isArray(expression.hostAlleles)
      ? expression.hostAlleles.filter((value): value is string => typeof value === 'string')
      : [];
    setLocusOne(hostLocus);
    setMaternalA1(declaredAlleles[0] ?? firstAllele(release, hostLocus));
    setMaternalB1(declaredAlleles[1] ?? firstAllele(release, hostLocus, 1));
    setPathogenTaxon(optionalText(expression.pathogenTaxon));
    setStrain(optionalText(expression.strain));
    setIsolate(optionalText(expression.isolate));
    setRace(optionalText(expression.race));
    setPathotype(optionalText(expression.pathotype));
    setAssayContextId(optionalText(expression.assayContextId));
    setEnvironmentContextId(optionalText(expression.environmentContextId));
    setEffectorProfile(
      Array.isArray(expression.requiredEffectors)
        ? expression.requiredEffectors
            .filter((value): value is string => typeof value === 'string')
            .join(', ')
        : '',
    );
  }

  function defaultRuleFor(
    nextMode: Mode,
    release: CatalogReleaseOption | undefined,
  ): CatalogRuleOption | undefined {
    const kind = nextMode === 'conditional_rule_graph'
      ? 'phenotype_rule_graph_node_v1'
      : nextMode === 'host_pathogen'
        ? 'host_pathogen_rule_v1'
        : null;
    return kind ? release?.rules.find((rule) => rule.kind === kind) : undefined;
  }

  function changeMode(nextMode: Mode): void {
    setMode(nextMode);
    resetLociForRelease(selectedRelease);
    const rule = defaultRuleFor(nextMode, selectedRelease);
    setSelectedRuleId(rule?.id ?? '');
    applyRule(rule, selectedRelease);
    setResult(null);
  }

  function changeRelease(releaseId: string): void {
    const release = catalogReleases.find((candidate) => candidate.id === releaseId);
    setCatalogReleaseId(releaseId);
    resetLociForRelease(release);
    const rule = defaultRuleFor(mode, release);
    setSelectedRuleId(rule?.id ?? '');
    applyRule(rule, release);
    setResult(null);
  }

  function changeRule(ruleId: string): void {
    const rule = selectedRelease?.rules.find((candidate) => candidate.id === ruleId);
    setSelectedRuleId(ruleId);
    applyRule(rule, selectedRelease);
    setResult(null);
  }

  function alleleOptions(locusId: string, value: string, onChange: (value: string) => void) {
    const locus = selectedRelease?.loci.find((candidate) => candidate.id === locusId);
    return locus
      ? <select value={value} onChange={(event) => onChange(event.target.value)} required>{locus.alleles.map((allele) => <option key={allele.id} value={allele.id}>{allele.symbol}</option>)}</select>
      : <input value={value} onChange={(event) => onChange(event.target.value)} required />;
  }
  function locusSelector(value: string, onChange: (value: string) => void, label: string) {
    return selectedRelease
      ? <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} required>{selectedRelease.loci.map((locus) => <option key={locus.id} value={locus.id}>{locus.catalogId} · {locus.symbol}</option>)}</select>
      : <input value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} required />;
  }

  const fingerprint = JSON.stringify({ mode, catalogReleaseId, selectedRuleId, maternalMaterialId, paternalMaterialId, locusOne, locusTwo, maternalA1, maternalA2, maternalB1, maternalB2, paternalA1, paternalA2, paternalB1, paternalB2, phaseEvidence, maternalRecombination, paternalRecombination, recombinationDenominator, maternalSystemId, maternalStateId, pathogenTaxon, strain, isolate, race, pathotype, assayContextId, environmentContextId, effectorProfile, seed, sampleCount });

  function currentRequestId(): string {
    if (requestIdentity.current?.fingerprint === fingerprint) {
      return requestIdentity.current.id;
    }
    const identity = { fingerprint, id: crypto.randomUUID() };
    requestIdentity.current = identity;
    return identity.id;
  }

  function request(clientRequestId: string): GovernedAdvancedSimulationRequest {
    const common = { schemaVersion: '2.0' as const, workspaceId, catalogReleaseId, clientRequestId, traceId: clientRequestId };
    if (mode === 'maternal_state') return { ...common, mode, maternalMaterialId, paternalMaterialId, maternalState: { systemId: maternalSystemId, stateId: maternalStateId, evidenceState: phaseEvidence } };
    if (mode === 'conditional_rule_graph') {
      if (!selectedRule || selectedRule.kind !== 'phenotype_rule_graph_node_v1') throw new Error('Select an approved conditional phenotype rule.');
      const locusIds = predicateLoci(ruleExpression);
      if (locusIds.length === 0 || locusIds.length > 2) throw new Error('This approved rule requires a genotype form that is not yet supported by the guided two-locus interface.');
      return {
        ...common, mode, materialId: maternalMaterialId,
        applicabilityId: optionalText(ruleExpression.applicabilityId), ruleIds: [selectedRule.id],
        offspring: { loci: locusIds.map((locusId, index) => ({ locusId, alleles: (index === 0 ? [maternalA1, maternalB1] : [maternalA2, maternalB2]) as [string, string], evidenceState: phaseEvidence })) },
      };
    }
    if (mode === 'host_pathogen') {
      if (!selectedRule || selectedRule.kind !== 'host_pathogen_rule_v1') throw new Error('Select an approved host–pathogen rule.');
      return {
        ...common, mode, materialId: maternalMaterialId,
        hostGenotypes: [{ locusId: locusOne, alleles: [maternalA1, maternalB1] as [string, string], evidenceState: phaseEvidence }],
        context: {
          pathogenTaxon, assayContextId,
          ...(strain ? { strain } : {}), ...(isolate ? { isolate } : {}), ...(race ? { race } : {}), ...(pathotype ? { pathotype } : {}),
          ...(environmentContextId ? { environmentContextId } : {}),
          ...(effectorProfile.trim() ? { effectorProfile: effectorProfile.split(',').map((value) => value.trim()).filter(Boolean) } : {}),
        },
        ruleIds: [selectedRule.id],
      };
    }
    if (mode === 'direct_monte_carlo') {
      const maternalLoci = [{ locusId: locusOne, alleles: [maternalA1, maternalB1] as [string, string], evidenceState: phaseEvidence }, { locusId: locusTwo, alleles: [maternalA2, maternalB2] as [string, string], evidenceState: phaseEvidence }];
      const paternalLoci = [{ locusId: locusOne, alleles: [paternalA1, paternalB1] as [string, string], evidenceState: phaseEvidence }, { locusId: locusTwo, alleles: [paternalA2, paternalB2] as [string, string], evidenceState: phaseEvidence }];
      return { ...common, mode, maternalMaterialId, paternalMaterialId, maternalHypotheses: [{ probability: { numerator: '1', denominator: '1' }, loci: maternalLoci, basis: phaseEvidence === 'verified' ? 'assay' : 'user_prior', evidenceIds: [] }], paternalHypotheses: [{ probability: { numerator: '1', denominator: '1' }, loci: paternalLoci, basis: phaseEvidence === 'verified' ? 'assay' : 'user_prior', evidenceIds: [] }], seed: Number(seed), sampleCount: Number(sampleCount) };
    }
    return {
      ...common, mode,
      maternal: { materialId: maternalMaterialId, firstLocusId: locusOne, secondLocusId: locusTwo, homologOne: { firstLocusAllele: maternalA1, secondLocusAllele: maternalA2 }, homologTwo: { firstLocusAllele: maternalB1, secondLocusAllele: maternalB2 }, phaseEvidence, recombinationFraction: { numerator: maternalRecombination, denominator: recombinationDenominator } },
      paternal: { materialId: paternalMaterialId, firstLocusId: locusOne, secondLocusId: locusTwo, homologOne: { firstLocusAllele: paternalA1, secondLocusAllele: paternalA2 }, homologTwo: { firstLocusAllele: paternalB1, secondLocusAllele: paternalB2 }, phaseEvidence, recombinationFraction: { numerator: paternalRecombination, denominator: recombinationDenominator } },
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError(null);
    try {
      if (['linked_two_locus', 'direct_monte_carlo'].includes(mode) && locusOne === locusTwo) throw new Error('Linked or Monte Carlo loci must be distinct.');
      if (['conditional_rule_graph', 'host_pathogen'].includes(mode) && !selectedRelease) throw new Error('Conditional scientific interpretation requires an approved published catalog release.');
      const clientRequestId = currentRequestId();
      const response = await fetch('/api/simulations/advanced', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': clientRequestId }, body: JSON.stringify(request(clientRequestId)) });
      const payload = await response.json() as GovernedSimulationOutcome | { error: { message: string } };
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error.message : 'Advanced simulation failed.');
      setResult(payload); requestIdentity.current = null;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Advanced simulation failed safely.'); }
    finally { setPending(false); }
  }

  const guidedRuleLoci = mode === 'conditional_rule_graph' ? predicateLoci(ruleExpression) : [];
  const unsupportedGuidedRule = mode === 'conditional_rule_graph' && selectedRule && (guidedRuleLoci.length === 0 || guidedRuleLoci.length > 2);
  return <details className="card section-gap">
    <summary><strong>Governed advanced laboratory</strong></summary>
    <p className="muted">Parent direction, phase, evidence authority, release identity, engine version, seed, and diagnostics are preserved in immutable snapshots. Exact calculations do not upgrade assumed premises.</p>
    <form className="form-grid" onSubmit={submit}>
      <label className="field"><span>Advanced model</span><select value={mode} onChange={(event) => changeMode(event.target.value as Mode)}><option value="linked_two_locus">Phased two-locus linkage</option><option value="maternal_state">Seed-parent or cytoplasmic state</option><option value="direct_monte_carlo">Queued direct Monte Carlo</option><option value="conditional_rule_graph" disabled={!catalogReleases.some((item) => item.rules.some((rule) => rule.kind === 'phenotype_rule_graph_node_v1'))}>Approved conditional phenotype rule</option><option value="host_pathogen" disabled={!catalogReleases.some((item) => item.rules.some((rule) => rule.kind === 'host_pathogen_rule_v1'))}>Approved host–pathogen rule</option></select></label>
      <label className="field"><span>Scientific catalog</span><select value={catalogReleaseId} onChange={(event) => changeRelease(event.target.value)}>{catalogReleases.map((item) => <option key={item.id} value={item.id}>Approved release {item.version}</option>)}<option value="user-declared-v1" disabled={mode === 'conditional_rule_graph' || mode === 'host_pathogen'}>User-declared lower-authority scenario</option></select></label>
      {(mode === 'conditional_rule_graph' || mode === 'host_pathogen') ? <label className="field"><span>Approved executable rule</span><select value={selectedRuleId} onChange={(event) => changeRule(event.target.value)} required>{(mode === 'conditional_rule_graph' ? conditionalRules : hostRules).map((rule) => <option key={rule.id} value={rule.id}>{rule.key} · {rule.version}</option>)}</select><small>Only independently approved rules bound to this immutable release appear here.</small></label> : null}
      <div className="form-grid"><label className="field"><span>{mode === 'conditional_rule_graph' || mode === 'host_pathogen' ? 'Evaluated plant' : 'Seed parent plant'}</span><select value={maternalMaterialId} onChange={(event) => setMaternalMaterialId(event.target.value)}>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.materialCode}</option>)}</select></label>{mode !== 'conditional_rule_graph' && mode !== 'host_pathogen' ? <label className="field"><span>Pollen parent plant</span><select value={paternalMaterialId} onChange={(event) => setPaternalMaterialId(event.target.value)}>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.materialCode}</option>)}</select></label> : null}</div>
      {mode === 'maternal_state' ? <div className="form-grid"><label className="field"><span>Seed-parent inheritance system</span><input value={maternalSystemId} onChange={(event) => setMaternalSystemId(event.target.value)} required /></label><label className="field"><span>Recorded seed-parent state</span><input value={maternalStateId} onChange={(event) => setMaternalStateId(event.target.value)} required /></label></div> : null}
      {mode === 'linked_two_locus' || mode === 'direct_monte_carlo' ? <><div className="form-grid"><label className="field"><span>First locus</span>{locusSelector(locusOne, setLocusOne, 'First locus')}</label><label className="field"><span>Second locus</span>{locusSelector(locusTwo, setLocusTwo, 'Second locus')}</label></div><fieldset className="locus-card"><legend>Seed-parent phased homologs</legend><div className="form-grid four"><label>H1 · locus 1{alleleOptions(locusOne, maternalA1, setMaternalA1)}</label><label>H1 · locus 2{alleleOptions(locusTwo, maternalA2, setMaternalA2)}</label><label>H2 · locus 1{alleleOptions(locusOne, maternalB1, setMaternalB1)}</label><label>H2 · locus 2{alleleOptions(locusTwo, maternalB2, setMaternalB2)}</label></div></fieldset><fieldset className="locus-card"><legend>Pollen-parent phased homologs</legend><div className="form-grid four"><label>H1 · locus 1{alleleOptions(locusOne, paternalA1, setPaternalA1)}</label><label>H1 · locus 2{alleleOptions(locusTwo, paternalA2, setPaternalA2)}</label><label>H2 · locus 1{alleleOptions(locusOne, paternalB1, setPaternalB1)}</label><label>H2 · locus 2{alleleOptions(locusTwo, paternalB2, setPaternalB2)}</label></div></fieldset></> : null}
      {mode === 'conditional_rule_graph' ? unsupportedGuidedRule ? <div className="notice warning">This approved rule references {guidedRuleLoci.length} loci. The guided interface currently supports one or two loci and will abstain rather than truncate its premises.</div> : <fieldset className="locus-card"><legend>Evaluated offspring genotype premises</legend>{guidedRuleLoci.map((locusId, index) => <div className="form-grid" key={locusId}><label>Locus {selectedRelease?.loci.find((locus) => locus.id === locusId)?.symbol ?? locusId} · allele one{alleleOptions(locusId, index === 0 ? maternalA1 : maternalA2, index === 0 ? setMaternalA1 : setMaternalA2)}</label><label>Allele two{alleleOptions(locusId, index === 0 ? maternalB1 : maternalB2, index === 0 ? setMaternalB1 : setMaternalB2)}</label></div>)}</fieldset> : null}
      {mode === 'host_pathogen' ? <><fieldset className="locus-card"><legend>Host genotype premise</legend><label>Host locus{locusSelector(locusOne, setLocusOne, 'Host locus')}</label><div className="form-grid"><label>Host allele one{alleleOptions(locusOne, maternalA1, setMaternalA1)}</label><label>Host allele two{alleleOptions(locusOne, maternalB1, setMaternalB1)}</label></div></fieldset><fieldset className="locus-card"><legend>Pathogen and assay context</legend><div className="form-grid"><label>Pathogen taxon<input value={pathogenTaxon} onChange={(event) => setPathogenTaxon(event.target.value)} required /></label><label>Assay context<input value={assayContextId} onChange={(event) => setAssayContextId(event.target.value)} required /></label><label>Strain<input value={strain} onChange={(event) => setStrain(event.target.value)} /></label><label>Isolate<input value={isolate} onChange={(event) => setIsolate(event.target.value)} /></label><label>Race<input value={race} onChange={(event) => setRace(event.target.value)} /></label><label>Pathotype<input value={pathotype} onChange={(event) => setPathotype(event.target.value)} /></label><label>Environment context<input value={environmentContextId} onChange={(event) => setEnvironmentContextId(event.target.value)} /></label><label>Effector profile, comma separated<input value={effectorProfile} onChange={(event) => setEffectorProfile(event.target.value)} /></label></div></fieldset></> : null}
      <label className="field"><span>Premise evidence</span><select value={phaseEvidence} onChange={(event) => setPhaseEvidence(event.target.value as Evidence)}><option value="verified">Verified assay/phase evidence</option><option value="inferred">Inferred evidence</option><option value="assumed">User assumption</option></select></label>
      {mode === 'linked_two_locus' ? <div className="form-grid three"><label>Seed-parent recombination numerator<input inputMode="numeric" value={maternalRecombination} onChange={(event) => setMaternalRecombination(event.target.value)} /></label><label>Pollen-parent recombination numerator<input inputMode="numeric" value={paternalRecombination} onChange={(event) => setPaternalRecombination(event.target.value)} /></label><label>Shared denominator<input inputMode="numeric" value={recombinationDenominator} onChange={(event) => setRecombinationDenominator(event.target.value)} /></label></div> : null}
      {mode === 'direct_monte_carlo' ? <div className="form-grid"><label>Deterministic seed<input type="number" min={0} max={4294967295} value={seed} onChange={(event) => setSeed(event.target.value)} /></label><label>Sample count<input type="number" min={1000} max={5000000} step={1000} value={sampleCount} onChange={(event) => setSampleCount(event.target.value)} /></label></div> : null}
      {!catalogReleases.some((item) => item.rules.length > 0) ? <p className="muted">No independently approved executable phenotype or host–pathogen rules exist. Those modes remain unavailable; exact genotype simulation still works.</p> : null}
      <button type="submit" disabled={pending || Boolean(unsupportedGuidedRule)}>{pending ? 'Submitting…' : mode === 'direct_monte_carlo' ? 'Queue Monte Carlo run' : 'Run governed model'}</button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {result ? <div className="notice" aria-live="polite"><strong>{result.state === 'queued' ? 'Run queued.' : 'Immutable result persisted.'}</strong> Calculation: {result.calculationAuthority}. Premises: {result.premiseAuthority}. Interpretation: {result.interpretationAuthority}. {result.simulationRunId ? <Link href={`/simulations/${result.simulationRunId}`}>Open run</Link> : <Link href="/jobs">Track durable job</Link>}.</div> : null}
    </form>
  </details>;
}
