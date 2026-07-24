import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveMaterialLabel } from '@capsicum/application';
import { PageHeader } from '../../../components/page-primitives';
import { getDatabasePool } from '../../../lib/database';
import { humanize } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';

function destination(kind: string, materialId: string): string {
  switch (kind) {
    case 'plant': return `/plants/${materialId}`;
    case 'seed_lot': return `/seed-lots/${materialId}`;
    case 'germplasm_accession': return `/germplasm/${materialId}`;
    case 'progeny_family': return `/families/${materialId}`;
    default: return `/pedigrees/${materialId}`;
  }
}

export default async function ScanResultPage({ params }: { params: Promise<{ token: string }> }) {
  const principal = await requirePrincipal();
  const { token } = await params;
  const record = await resolveMaterialLabel(getDatabasePool(), principal, token);
  if (!record) notFound();
  return <>
    <PageHeader eyebrow="Verified label lookup" title={record.materialCode} description="The QR value is only an opaque locator. This signed-in, workspace-scoped database lookup is the authoritative identity check." />
    <section className="card">
      <dl className="definition-list"><div><dt>Material type</dt><dd>{humanize(record.kind)}</dd></div><div><dt>Status</dt><dd>{humanize(record.status)}</dd></div></dl>
      <div className="notice"><strong>Identity rule:</strong> a printed or copied QR code does not prove physical custody, parentage, genotype, or authenticity. Confirm the plant or seed lot against its full provenance record.</div>
      <p><Link className="button" href={destination(record.kind, record.materialId)}>Open authoritative record</Link></p>
    </section>
  </>;
}
