import Link from 'next/link';
import { listExperiments, listObservationInputOptions } from '@capsicum/application';
import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';
import { EmptyState, ErrorNotice, PageHeader } from '../../components/page-primitives';
import { formatDate, humanize, queryError, text } from '../../lib/presentation';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';
import { createExperimentAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ExperimentsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const [records, observationOptions, query] = await Promise.all([
    listExperiments(pool, principal),
    listObservationInputOptions(pool),
    searchParams,
  ]);
  const protocols = observationOptions.protocols as Record<string, unknown>[];
  return <>
    <PageHeader
      eyebrow="Observed evidence"
      title="Experiments"
      description="Create an experiment under one exact independently approved observation protocol. The protocol snapshot is immutable for the experiment and every session."
    />
    <ErrorNotice message={queryError(query.error)} />
    <section className="card">
      <h2>Create experiment and first session</h2>
      {!protocols.length ? <div className="notice" role="status">No approved observation protocol is available. A curator must author one and a distinct reviewer must approve it before authoritative data collection can begin.</div> : null}
      <MutationForm intent="experiment.create" className="form-grid" action={createExperimentAction}>
        <div className="field"><label htmlFor="code">Experiment code</label><input id="code" name="code" required /></div>
        <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" required /></div>
        <div className="field full"><label htmlFor="objective">Objective</label><textarea id="objective" name="objective" rows={3} required /></div>
        <div className="field"><label htmlFor="protocolId">Approved protocol version</label><select id="protocolId" name="protocolId" required disabled={!protocols.length}><option value="">Select approved protocol</option>{protocols.map((protocol) => <option key={String(protocol.id)} value={String(protocol.id)}>{text(protocol.protocol_key)} · v{text(protocol.version)}</option>)}</select></div>
        <div className="field"><label htmlFor="startedAt">Started at</label><LocalDateTimeInput id="startedAt" name="startedAt" /></div>
        <div className="field"><label htmlFor="location">Location / environment</label><input id="location" name="location" /></div>
        <div className="field"><label htmlFor="season">Season</label><input id="season" name="season" /></div>
        <div className="full"><button className="button" type="submit" disabled={!protocols.length}>Create experiment</button></div>
      </MutationForm>
    </section>
    <div className="section-gap">{records.length ? <div className="table-wrap"><table><thead><tr><th>Experiment</th><th>Protocol</th><th>Objective</th><th>State</th><th>Sessions</th><th>Started</th></tr></thead><tbody>{records.map((record: Record<string, unknown>) => <tr key={String(record.id)}><td><Link className="inline-link" href={`/experiments/${String(record.id)}`}>{text(record.code)} · {text(record.name)}</Link></td><td>{text(record.protocol_key)} · v{text(record.protocol_version)}</td><td>{text(record.objective)}</td><td>{humanize(record.state)}</td><td>{text(record.session_count)}</td><td>{formatDate(record.started_at)}</td></tr>)}</tbody></table></div> : <EmptyState title="No experiments">Approve an observation protocol, then create an experiment before collecting structured phenotype observations.</EmptyState>}</div>
  </>;
}
