import Link from 'next/link';
import { listAdvancedSimulationRequests, listSimulationRuns } from '@capsicum/application';
import { EmptyState, PageHeader } from '../../components/page-primitives';
import { formatDate, humanize, text } from '../../lib/presentation';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';

export const dynamic = 'force-dynamic';
export default async function SimulationsPage() {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const [records, advancedRequests] = await Promise.all([
    listSimulationRuns(pool, principal),
    listAdvancedSimulationRequests(pool, principal),
  ]);
  const activeRequests = advancedRequests.filter((request: Record<string, unknown>) => request.state !== 'completed');
  return <>
    <PageHeader eyebrow="Reproducible calculations" title="Simulation runs" description="Immutable inheritance results with normalized inputs, explicit engine and evidence authority, catalog provenance, and deterministic content hashes." action={{ href: '/simulation-lab', label: 'Run simulation' }} />
    {activeRequests.length ? <section className="card section-gap"><h2>Advanced work in progress</h2><div className="table-wrap"><table><thead><tr><th>Requested</th><th>Model</th><th>State</th><th>Scientific authority</th><th>Action</th></tr></thead><tbody>{activeRequests.map((record: Record<string, unknown>) => <tr key={String(record.id)}><td>{formatDate(record.requested_at)}</td><td>{humanize(record.mode)}<br /><span className="muted compact">{text(record.model_version)}</span></td><td><span className={`badge ${record.state === 'failed' || record.state === 'dead_letter' ? 'warning' : ''}`}>{humanize(record.state)}</span>{record.last_error_code ? <><br /><span className="muted compact">{humanize(record.last_error_code)}</span></> : null}</td><td>Calculation: {humanize(record.calculation_authority)}<br /><span className="muted compact">Premises: {humanize(record.premise_authority)} · Interpretation: {humanize(record.interpretation_authority)}</span></td><td>{record.job_id ? <Link href="/admin/jobs">Inspect job</Link> : 'Synchronous request'}</td></tr>)}</tbody></table></div></section> : null}
    {records.length ? <div className="table-wrap section-gap"><table><thead><tr><th>Run</th><th>Model</th><th>Scientific authority</th><th>Target</th><th>Completed</th></tr></thead><tbody>{records.map((record: Record<string, unknown>) => <tr key={String(record.id)}><td><Link className="inline-link mono" href={`/simulations/${String(record.id)}`}>{String(record.content_hash).slice(0, 16)}…</Link></td><td>{text(record.model_type)} · {text(record.model_version)}</td><td><span className="badge exact">Calculation: {humanize(record.calculation_authority)}</span><br /><span className="muted compact">Premises: {humanize(record.premise_authority)} · Interpretation: {humanize(record.interpretation_authority)}</span></td><td>{record.target_recovery ? 'Configured' : 'None'}</td><td>{formatDate(record.completed_at)}</td></tr>)}</tbody></table></div> : <EmptyState title="No persisted simulations" action={{ href: '/simulation-lab', label: 'Open simulation lab' }}>Run a governed simulation against real plant identities. Exact or approximate authority will be stored explicitly.</EmptyState>}
  </>;
}
