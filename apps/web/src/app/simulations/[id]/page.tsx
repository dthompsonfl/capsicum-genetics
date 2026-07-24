import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSimulationRun } from '@capsicum/application';
import { DefinitionList, PageHeader } from '../../../components/page-primitives';
import { formatDate, humanize, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export default async function SimulationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const found = await getSimulationRun(getDatabasePool(), principal, id) as Record<string, unknown> | null;
  if (!found) notFound();
  const record = found as Record<string, unknown>;
  const result = record.result_payload && typeof record.result_payload === 'object' && !Array.isArray(record.result_payload)
    ? record.result_payload as Record<string, unknown>
    : {};
  const candidateDistribution = result.distributions ?? result.distribution ?? result.outcomes;
  const distributions = Array.isArray(candidateDistribution) ? candidateDistribution as Record<string, unknown>[] : [];
  const assumptions = stringList(record.assumptions);
  const warnings = stringList(record.warnings);
  const abstentions = stringList(record.abstentions);
  return <>
    <PageHeader eyebrow="Immutable simulation" title={`Run ${id.slice(0, 8)}`} description="A frozen scientific calculation with explicit premise and interpretation authority. Historical results are never silently recalculated under a newer catalog or engine." />
    <section className="card"><DefinitionList entries={[["Calculation authority", humanize(record.calculation_authority)], ["Premise authority", humanize(record.premise_authority)], ["Interpretation authority", humanize(record.interpretation_authority)], ["Legacy authority", `${humanize(record.authority)} (compatibility only)`], ["Model", `${text(record.model_type)} · ${text(record.model_version)}`], ["Engine", text(record.engine_version)], ["Catalog release", text(record.catalog_release_id, 'User-declared premises')], ["Input hash", <span className="mono wrap" key="input-hash">{text(record.input_hash)}</span>], ["Result hash", <span className="mono wrap" key="result-hash">{text(record.content_hash)}</span>], ["Completed", formatDate(record.completed_at)], ["Enumerated outcomes", distributions.length.toLocaleString()]]} /></section>
    <div className="grid two section-gap"><section className="card"><h2>Parent direction</h2><pre className="json">{JSON.stringify(record.parent_direction ?? null, null, 2)}</pre><h3>Target recovery</h3><pre className="json">{JSON.stringify(result.targetRecovery ?? null, null, 2)}</pre>{record.random_seed !== null && record.random_seed !== undefined ? <><h3>Stochastic reproducibility</h3><p>Seed: <code>{text(record.random_seed)}</code> · Samples: {text(record.sample_count)}</p><pre className="json">{JSON.stringify(record.diagnostics ?? {}, null, 2)}</pre></> : null}</section><section className="card"><h2>Scientific boundaries</h2><h3>Assumptions</h3>{assumptions.length ? <ul>{assumptions.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">No additional assumptions were recorded.</p>}<h3>Warnings and abstentions</h3>{warnings.length || abstentions.length ? <ul>{[...warnings, ...abstentions].map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">No warnings or abstentions were recorded.</p>}</section></div>
    {distributions.length ? <section className="card section-gap"><h2>Genotype distribution</h2><div className="table-wrap"><table><thead><tr><th>Genotype</th><th>Exact probability</th><th>Decimal</th></tr></thead><tbody>{distributions.slice(0, 500).map((item, index) => { const probability = item.probability && typeof item.probability === 'object' ? item.probability as Record<string, unknown> : {}; return <tr key={index}><td><pre className="json compact-json">{JSON.stringify(item.genotype ?? item.value ?? item)}</pre></td><td className="mono">{probability.numerator !== undefined ? `${text(probability.numerator)}/${text(probability.denominator)}` : 'Approximate'}</td><td>{probability.decimal === undefined ? '—' : Number(probability.decimal).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td></tr>; })}</tbody></table></div>{distributions.length > 500 ? <p className="notice">Displaying the first 500 outcomes; the immutable result contains all {distributions.length}.</p> : null}</section> : <section className="card section-gap"><h2>Governed result payload</h2><pre className="json">{JSON.stringify(result, null, 2)}</pre></section>}
    <section className="card section-gap"><h2>Immutable input snapshot</h2><pre className="json">{JSON.stringify(record.normalized_input, null, 2)}</pre></section>
    <p className="section-gap"><Link className="button" href={`/selection-plans?simulationRunId=${id}`}>Create selection plan</Link></p>
  </>;
}
