import { notFound } from 'next/navigation';
import { getCatalogRecord } from '@capsicum/application';
import { DefinitionList, PageHeader } from '../../../../components/page-primitives';
import { getDatabasePool } from '../../../../lib/database';
import { formatDate, humanize, text } from '../../../../lib/presentation';
import { requirePrincipal } from '../../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const record = await getCatalogRecord(getDatabasePool(), principal, 'evidence_assertion', id);
  if (!record) notFound();
  return <>
    <PageHeader eyebrow="Scientific governance" title={`Evidence assertion · ${text(record.claim_id)}`} description="A reviewable claim with explicit applicability, required conditions, exclusions, provenance, and immutable content identity." action={{ href: '/research/review', label: 'Open review queue' }} />
    <section className="card"><h2>Claim</h2><p>{text(record.claim_text)}</p><DefinitionList entries={[
      ['Review state', <span className={`badge ${record.review_state === 'approved' ? 'exact' : 'warning'}`}>{humanize(record.review_state)}</span>],
      ['Applicability', text(record.applicability)], ['Required conditions', text(record.required_conditions)], ['Exclusions', text(record.exclusions)],
      ['Content hash', <code>{text(record.content_hash)}</code>], ['Authored by', <code>{text(record.authored_by)}</code>], ['Approved at', formatDate(record.approved_at)],
    ]} /></section>
    <section className="card section-gap"><h2>Imported source payload</h2><pre className="json">{JSON.stringify(record.raw_source_payload, null, 2)}</pre></section>
  </>;
}
