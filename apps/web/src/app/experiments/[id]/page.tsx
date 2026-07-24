import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getExperiment } from '@capsicum/application';
import { DefinitionList, PageHeader } from '../../../components/page-primitives';
import { formatDate, humanize, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal(); const { id } = await params;
  const record = await getExperiment(getDatabasePool(), principal, id) as (Record<string, unknown> & { sessions?: Record<string, unknown>[] }) | null;
  if (!record) notFound();
  return <><PageHeader eyebrow="Experiment" title={`${text(record.code)} · ${text(record.name)}`} description="A governed observation context with explicit objective and environment metadata." />
    <section className="card"><DefinitionList entries={[["State", humanize(record.state)], ["Objective", text(record.objective)], ["Started", formatDate(record.started_at)], ["Environment", <pre className="json" key="environment">{JSON.stringify(record.environment, null, 2)}</pre>]]} /></section>
    <section className="card section-gap"><h2>Observation sessions</h2>{record.sessions?.length ? <ul className="list">{record.sessions.map((session) => <li key={String(session.id)}><Link className="inline-link" href={`/observations/session/${String(session.id)}`}>{text(session.code)}</Link><br /><span className="muted">{humanize(session.state)} · {formatDate(session.started_at)}</span></li>)}</ul> : <p className="muted">No sessions.</p>}</section></>;
}
