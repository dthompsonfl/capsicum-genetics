import { notFound } from 'next/navigation';
import { getCatalogRecord } from '@capsicum/application';
import { DefinitionList, PageHeader } from '../../../../components/page-primitives';
import { getDatabasePool } from '../../../../lib/database';
import { formatDate, humanize, text } from '../../../../lib/presentation';
import { requirePrincipal } from '../../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function LocusPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const record = await getCatalogRecord(getDatabasePool(), principal, 'locus', id);
  if (!record) notFound();
  return <>
    <PageHeader eyebrow="Scientific governance" title={`${text(record.canonical_symbol)} · ${text(record.catalog_id)}`} description="Versioned locus evidence record. Allele capitalization is not interpreted as dominance and this record is not itself an executable phenotype rule." action={{ href: '/research/review', label: 'Open review queue' }} />
    <section className="card"><DefinitionList entries={[
      ['Review state', <span className={`badge ${record.review_state === 'approved' ? 'exact' : 'warning'}`}>{humanize(record.review_state)}</span>],
      ['Record version', text(record.record_version)], ['Content hash', <code>{text(record.content_hash)}</code>],
      ['Trait category', text(record.trait_category)], ['Species scope', text(record.species_scope)],
      ['Model class', text(record.model_class)], ['Authored by', <code>{text(record.authored_by)}</code>],
      ['Approved by', <code>{text(record.approved_by)}</code>], ['Approved at', formatDate(record.approved_at)],
    ]} /></section>
    <section className="card section-gap"><h2>Imported source payload</h2><pre className="json">{JSON.stringify(record.raw_source_payload, null, 2)}</pre></section>
  </>;
}
