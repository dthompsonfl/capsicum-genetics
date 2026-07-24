import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMaterialDetail } from '@capsicum/application';
import { DefinitionList, PageHeader } from '../../../components/page-primitives';
import { formatDate, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function GermplasmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal(); const { id } = await params;
  const record = await getMaterialDetail(getDatabasePool(), principal, id) as Record<string, unknown> | null;
  if (!record || record.kind !== 'germplasm_accession') notFound();
  return <><PageHeader eyebrow="Germplasm accession" title={String(record.display_name ?? record.material_code)} description="Canonical identity and acquisition provenance. No allele is inferred from this name." />
    <section className="card"><DefinitionList entries={[["Material code", text(record.material_code)], ["Taxon", text(record.taxon)], ["Status", text(record.status)], ["Created", formatDate(record.created_at)], ["Provenance", <pre className="json" key="provenance">{JSON.stringify(record.provenance, null, 2)}</pre>]]} /></section>
    <p className="section-gap"><Link className="button" href={`/pedigrees/${id}`}>View pedigree</Link></p></>;
}
