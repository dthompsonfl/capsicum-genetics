import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMaterialDetail } from '@capsicum/application';
import { DefinitionList, PageHeader } from '../../../components/page-primitives';
import { formatDate, humanize } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal(); const { id } = await params;
  const record = await getMaterialDetail(getDatabasePool(), principal, id) as Record<string, unknown> | null;
  if (!record || record.kind !== 'progeny_family') notFound();
  return <><PageHeader eyebrow="Progeny family" title={String(record.material_code)} description="A cross-derived family identity. Individual plants must still be registered separately from its source seed lot." />
    <section className="card"><DefinitionList entries={[["Status", humanize(record.status)], ["Created", formatDate(record.created_at)], ["Material ID", <span className="mono" key="id">{id}</span>]]} /></section>
    <p className="section-gap"><Link className="button" href={`/pedigrees/${id}`}>View pedigree graph</Link></p></>;
}
