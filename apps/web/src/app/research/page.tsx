import Link from 'next/link';
import { listResearchSources } from '@capsicum/application';
import { StreamingResearchUploadForm } from '../../components/streaming-research-upload-form';
import { EmptyState, PageHeader } from '../../components/page-primitives';
import { formatDate, humanize, text } from '../../lib/presentation';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';

export const dynamic = 'force-dynamic';
export default async function ResearchSourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requirePrincipal();
  const query = await searchParams;
  const records = await listResearchSources(getDatabasePool(), principal, 200);
  return <>
    <PageHeader eyebrow="Research provenance" title="Scientific documents and passages" description="Upload immutable UTF-8 scientific sources, extract deterministic passages through a durable worker, and independently review exact citation units before they become answer authority." action={{ href: '/research-assistant', label: 'Ask reviewed evidence' }} />
    {query.error === 'research_upload_rejected' ? <p className="error" role="alert">The source was rejected. Use a non-empty UTF-8 plain-text or Markdown file no larger than 10 MB and verify the source details.</p> : null}
    <section className="panel stack" aria-labelledby="research-upload-title">
      <div><p className="eyebrow">Durable ingestion</p><h2 id="research-upload-title">Add a scientific source</h2><p className="muted">The original bytes and SHA-256 remain immutable. Extracted passages begin as drafts and cannot support the assistant until independent review. PDF extraction remains unavailable in this deployment.</p></div>
      <StreamingResearchUploadForm />
    </section>
    {records.length ? <div className="table-wrap"><table><thead><tr><th>Source</th><th>Version</th><th>Ingestion</th><th>Review</th><th>Passages</th><th>Created</th></tr></thead><tbody>{records.map((record: Record<string, unknown>) => <tr key={String(record.id)}><td><Link href={`/research/sources/${String(record.id)}`}>{text(record.title)}</Link><br /><span className="muted">{text(record.source_locator)}</span></td><td>{text(record.document_version)}</td><td>{humanize(String(record.ingestion_state))}{record.worker_state ? <><br /><span className="muted compact">Worker: {humanize(String(record.worker_state))}</span></> : null}</td><td>{humanize(String(record.review_state))}</td><td>{text(record.approved_passage_count)} approved / {text(record.passage_count)} total</td><td>{formatDate(record.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState title="No research documents">Upload a source to create an immutable, review-gated research record.</EmptyState>}
  </>;
}
