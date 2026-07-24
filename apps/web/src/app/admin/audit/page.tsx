import { listAuditEvents } from '@capsicum/application';
import { EmptyState, PageHeader } from '../../../components/page-primitives';
import { formatDate, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function AuditPage() {
  const principal = await requirePrincipal(); const records = await listAuditEvents(getDatabasePool(), principal, 200);
  return <><PageHeader eyebrow="Administration" title="Audit history" description="Append-only records of authoritative mutations, actors, entity identities, and before/after state." />
    {records.length ? <div className="table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>After state</th></tr></thead><tbody>{records.map((record: Record<string, unknown>) => <tr key={String(record.id)}><td>{formatDate(record.occurred_at)}</td><td>{text(record.actor_name)}</td><td className="mono">{text(record.action)}</td><td>{text(record.entity_type)} · <span className="mono">{text(record.entity_id)}</span></td><td><pre className="json compact-json">{JSON.stringify(record.after_state)}</pre></td></tr>)}</tbody></table></div> : <EmptyState title="No audit events">Authoritative mutations will appear here after records are created.</EmptyState>}
  </>;
}
