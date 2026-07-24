import { MutationForm } from '@/components/mutation-form';
import { notFound } from 'next/navigation';
import { getCatalogRelease } from '@capsicum/application';
import { DefinitionList, ErrorNotice, PageHeader } from '../../../../components/page-primitives';
import {
  publishCatalogReleaseAction,
  reviewCatalogReleaseAction,
  submitCatalogReleaseAction,
} from '../../../actions';
import { getDatabasePool } from '../../../../lib/database';
import { formatDate, humanize, queryError, text } from '../../../../lib/presentation';
import { requirePrincipal } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

function records(release: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  return Array.isArray(release[key]) ? release[key] as Array<Record<string, unknown>> : [];
}

export default async function ReleasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string | string[]; saved?: string }> }) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const query = await searchParams;
  const release = await getCatalogRelease(getDatabasePool(), principal, id);
  if (!release) notFound();
  const loci = records(release, 'loci');
  const alleles = records(release, 'alleles');
  const assertions = records(release, 'assertions');
  const sources = records(release, 'sources');
  const canCurate = ['owner', 'catalog_curator'].includes(principal.role);
  const canReview = ['owner', 'scientific_reviewer'].includes(principal.role);
  const canPublish = principal.role === 'owner';
  return <>
    <PageHeader eyebrow="Governed scientific release" title={`Catalog ${text(release.version)}`} description="A content-addressed snapshot whose membership locks during independent review and becomes permanently immutable after publication." action={{ href: '/catalog', label: 'Back to catalog controls' }} />
    <ErrorNotice message={queryError(query.error)} />
    {query.saved ? <div className="notice">The release transition completed.</div> : null}
    <section className="card"><DefinitionList entries={[
      ['Publication state', <span className={`badge ${release.state === 'approved' ? 'exact' : 'warning'}`}>{humanize(release.state)}</span>],
      ['Review state', <span className={`badge ${release.release_review_state === 'approved' ? 'exact' : 'warning'}`}>{humanize(release.release_review_state ?? 'legacy')}</span>],
      ['Schema', text(release.publication_schema_version)],
      ['Content hash', <code>{text(release.content_hash)}</code>],
      ['Author', <code>{text(release.authored_by)}</code>],
      ['Reviewer', <code>{text(release.reviewed_by)}</code>],
      ['Review rationale', text(release.review_rationale)],
      ['Published by', <code>{text(release.published_by)}</code>],
      ['Published at', formatDate(release.published_at)],
      ['Sources', sources.length], ['Loci', loci.length], ['Alleles', alleles.length], ['Assertions', assertions.length],
    ]} /></section>

    {release.state !== 'approved' ? <div className="grid three section-gap">
      <section className="card"><h2>1. Submit</h2><p className="muted">Locks membership so the reviewer evaluates one exact snapshot.</p>
        {canCurate && ['draft', 'changes_requested'].includes(String(release.release_review_state)) ? <MutationForm intent="catalog.release.submit" action={submitCatalogReleaseAction}><input type="hidden" name="releaseId" value={id} /><button className="button secondary" type="submit">Submit exact snapshot</button></MutationForm> : <span className="muted">Not currently eligible.</span>}
      </section>
      <section className="card"><h2>2. Independent review</h2><p className="muted">The author cannot approve this release.</p>
        {canReview && release.release_review_state === 'in_review' && release.authored_by !== principal.userId ? <MutationForm intent="catalog.release.review" action={reviewCatalogReleaseAction} className="form-grid">
          <input type="hidden" name="releaseId" value={id} /><input type="hidden" name="authorUserId" value={String(release.authored_by)} />
          <label className="field"><span>Decision</span><select name="decision" defaultValue="approved"><option value="approved">Approve</option><option value="changes_requested">Request changes</option><option value="rejected">Reject</option></select></label>
          <label className="field"><span>Scientific rationale</span><textarea name="rationale" required minLength={10} maxLength={4000} rows={4} /></label>
          <button className="button" type="submit">Record decision</button>
        </MutationForm> : <span className="muted">Requires an independent reviewer and in-review state.</span>}
      </section>
      <section className="card"><h2>3. Publish</h2><p className="muted">PostgreSQL revalidates approval, hashes, normalized allele coverage, references, and rule applicability.</p>
        {canPublish && release.release_review_state === 'approved' ? <MutationForm intent="catalog.release.publish" action={publishCatalogReleaseAction}><input type="hidden" name="releaseId" value={id} /><button className="button" type="submit">Publish reviewed release</button></MutationForm> : <span className="muted">Owner publication requires approved release review.</span>}
      </section>
    </div> : null}

    <div className="grid two section-gap">
      <section className="card"><h2>Normalized loci and alleles</h2>{loci.length ? <ul className="list">{loci.map((record) => <li key={String(record.id)}><strong>{text(record.symbol ?? record.key)}</strong><br /><code>{text(record.record_hash)}</code></li>)}</ul> : <p className="muted">No locus membership.</p>}<hr />{alleles.length ? <ul className="list">{alleles.map((record) => <li key={String(record.id)}><strong>{text(record.symbol ?? record.key)}</strong><br /><code>{text(record.record_hash)}</code></li>)}</ul> : <div className="notice"><strong>Publication blocker:</strong> no normalized approved allele membership.</div>}</section>
      <section className="card"><h2>Evidence graph</h2><p><strong>{sources.length}</strong> sources and <strong>{assertions.length}</strong> assertions.</p><ul className="list">{assertions.map((record) => <li key={String(record.id)}><strong>{text(record.key)}</strong><br /><code>{text(record.record_hash)}</code></li>)}</ul></section>
    </div>
    <div className="notice section-gap"><strong>Interpretation boundary:</strong> release publication does not turn source prose into phenotype logic. Executable rules remain separately authored, independently reviewed, applicability-bounded, and may validly remain at zero.</div>
  </>;
}
