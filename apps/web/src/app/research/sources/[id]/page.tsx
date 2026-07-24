import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getResearchSourceDetail } from '@capsicum/application';
import { PageHeader } from '../../../../components/page-primitives';
import { formatDate, humanize, text } from '../../../../lib/presentation';
import { getDatabasePool } from '../../../../lib/database';
import { requirePrincipal } from '../../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function ResearchSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const detail = await getResearchSourceDetail(getDatabasePool(), principal, id);
  if (!detail) notFound();
  const document = detail.document as Record<string, unknown>;
  return <>
    <PageHeader eyebrow="Research source" title={text(document.title)} description="Immutable document provenance and versioned passage boundaries. Only independently approved passages are eligible for AI retrieval or scientific citation." action={{ href: '/research', label: 'All sources' }} />
    <section className="card"><dl className="definition-list"><div><dt>Source locator</dt><dd>{text(document.source_locator)}</dd></div><div><dt>Document version</dt><dd>{text(document.document_version)}</dd></div><div><dt>Review state</dt><dd><span className={`badge ${String(document.review_state) === 'approved' ? 'exact' : 'warning'}`}>{humanize(String(document.review_state))}</span></dd></div><div><dt>Ingestion state</dt><dd><span className={`badge ${String(document.ingestion_state) === 'completed' ? 'exact' : 'warning'}`}>{humanize(String(document.ingestion_state))}</span>{document.ingestion_failure_code ? <><br /><span className="muted compact">Failure code: {text(document.ingestion_failure_code)}</span></> : null}</dd></div><div><dt>Ingestion job</dt><dd>{document.ingestion_job_id ? <Link href={`/jobs?job=${text(document.ingestion_job_id)}`}>{text(document.ingestion_job_id)}</Link> : 'Not queued'}</dd></div><div><dt>Source media</dt><dd>{text(document.source_media_type)} · {text(document.source_byte_length)} bytes</dd></div><div><dt>Source SHA-256</dt><dd className="mono break-all">{text(document.source_sha256)}</dd></div><div><dt>Created by</dt><dd>{text(document.created_by_name)} · {formatDate(document.created_at)}</dd></div><div><dt>Approved by</dt><dd>{text(document.approved_by_name)} · {formatDate(document.approved_at)}</dd></div></dl></section>
    <section className="card section-gap"><h2>Extraction artifacts</h2>{detail.artifacts.length ? <ul className="list">{detail.artifacts.map((artifact: Record<string, unknown>) => <li key={String(artifact.id)}><strong>{text(artifact.extractor_name)} {text(artifact.extractor_version)}</strong> · {text(artifact.page_count)} pages<br /><span className="mono break-all">Artifact {text(artifact.artifact_sha256)}</span></li>)}</ul> : <p className="muted">No extraction artifact has been persisted.</p>}</section>
    <section className="section-gap"><h2>Versioned passages</h2><div className="stack">{detail.passages.map((passage: Record<string, unknown>) => <article className="card" id={`passage-${String(passage.id)}`} key={String(passage.id)}><div className="split"><strong>Passage {text(passage.passage_index)} · version {text(passage.passage_version)}</strong><span className={`badge ${String(passage.review_state) === 'approved' ? 'exact' : 'warning'}`}>{humanize(String(passage.review_state))}</span></div><p className="preserve-whitespace">{text(passage.passage_text)}</p><dl className="definition-list"><div><dt>Locator</dt><dd>{text(passage.locator)}</dd></div><div><dt>Page range</dt><dd>{text(passage.page_start)}–{text(passage.page_end)}</dd></div><div><dt>Passage hash</dt><dd className="mono break-all">{text(passage.passage_sha256)}</dd></div><div><dt>Review</dt><dd>{text(passage.approved_by_name)} · {formatDate(passage.approved_at)}</dd></div></dl></article>)}</div></section>
  </>;
}
