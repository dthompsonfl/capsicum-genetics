import Link from 'next/link';
import { listMaterials } from '@capsicum/application';
import { EmptyState, PageHeader } from '../../components/page-primitives';
import { formatDate, humanize } from '../../lib/presentation';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';

export const dynamic = 'force-dynamic';
export default async function GermplasmPage() {
  const principal = await requirePrincipal();
  const records = await listMaterials(getDatabasePool(), principal, 'germplasm_accession');
  return <><PageHeader eyebrow="Biological identity" title="Germplasm accessions" description="Canonical accession identities and acquisition provenance. Cultivar labels remain labels—not assumed genotypes." action={{ href: '/germplasm/new', label: 'Add accession' }} />
    {records.length ? <div className="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Created</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><Link className="inline-link" href={`/germplasm/${record.id}`}>{record.materialCode}</Link></td><td>{record.displayName}</td><td><span className="badge">{humanize(record.status)}</span></td><td>{formatDate(record.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No germplasm accessions" action={{ href: '/germplasm/new', label: 'Create the first accession' }}>Start with source identity and acquisition provenance before creating seed lots or plants.</EmptyState>}
  </>;
}
