import Link from 'next/link';
import { listCrosses } from '@capsicum/application';
import { EmptyState, PageHeader } from '../../components/page-primitives';
import { formatDate, humanize } from '../../lib/presentation';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';

export const dynamic = 'force-dynamic';
export default async function CrossesPage() {
  const principal = await requirePrincipal(); const records = await listCrosses(getDatabasePool(), principal);
  return <><PageHeader eyebrow="Directed reproduction" title="Crosses" description="The seed parent and pollen parent remain explicit. Controlled crosses, self-pollination, and open pollination are recorded as different biological events." action={{ href: '/crosses/new', label: 'Plan cross' }} />
    {records.length ? <div className="table-wrap"><table><thead><tr><th>Cross</th><th>Parents</th><th>Method</th><th>Status</th><th>Created</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><Link className="inline-link" href={`/crosses/${record.id}`}>{record.crossCode}</Link></td><td>{record.maternalCode} × {record.paternalCode ?? 'unknown pollen'}</td><td>{humanize(record.pollinationMethod)}</td><td><span className="badge">{humanize(record.status)}</span></td><td>{formatDate(record.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No crosses" action={{ href: '/crosses/new', label: 'Record the first cross' }}>Plants must exist before a cross can preserve their directed parent roles.</EmptyState>}
  </>;
}
