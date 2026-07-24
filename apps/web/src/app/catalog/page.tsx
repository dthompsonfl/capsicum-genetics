import { MutationForm } from '@/components/mutation-form';
import Link from 'next/link';
import { getCatalogDashboard, listCatalogReleases } from '@capsicum/application';
import { ErrorNotice, PageHeader } from '../../components/page-primitives';
import { createCatalogReleaseDraftAction } from '../actions';
import { getDatabasePool } from '../../lib/database';
import { formatDate, humanize, queryError, text } from '../../lib/presentation';
import { requirePrincipal } from '../../lib/session';

export const dynamic = 'force-dynamic';

function total(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const principal = await requirePrincipal();
  const [dashboard, releases] = await Promise.all([
    getCatalogDashboard(getDatabasePool(), principal),
    listCatalogReleases(getDatabasePool(), principal),
  ]);
  const params = await searchParams;
  const canCurate = ['owner', 'catalog_curator'].includes(principal.role);
  return (
    <>
      <PageHeader
        eyebrow="Scientific governance"
        title="Catalog control plane"
        description="Versioned scientific records, independent review, normalized executable authority, and immutable release publication."
        action={{ href: '/scientific-catalog', label: 'Browse catalog records' }}
      />
      <ErrorNotice message={queryError(params.error)} />
      <div className="metric-grid">
        <article className="metric"><span>Sources</span><strong>{total(dashboard.sources)}</strong><small>{dashboard.sources.approved ?? 0} approved</small></article>
        <article className="metric"><span>Loci</span><strong>{total(dashboard.loci)}</strong><small>{dashboard.loci.approved ?? 0} approved</small></article>
        <article className="metric"><span>Normalized alleles</span><strong>{total(dashboard.alleles)}</strong><small>{dashboard.alleles.approved ?? 0} approved</small></article>
        <article className="metric"><span>Executable rules</span><strong>{total(dashboard.rules)}</strong><small>{dashboard.rules.approved ?? 0} approved</small></article>
      </div>
      <div className="grid two section-gap">
        <section className="card">
          <h2>Review-state inventory</h2>
          {Object.entries({ Sources: dashboard.sources, Loci: dashboard.loci, Alleles: dashboard.alleles, Assertions: dashboard.assertions, Rules: dashboard.rules }).map(([label, states]) => (
            <div key={label} className="section-gap-sm">
              <strong>{label}</strong>
              <div className="badge-row">
                {Object.entries(states).map(([state, count]) => <span className={`badge ${state === 'approved' ? 'exact' : state === 'rejected' ? 'danger' : 'warning'}`} key={state}>{humanize(state)}: {count}</span>)}
                {Object.keys(states).length === 0 ? <span className="muted">No database records</span> : null}
              </div>
            </div>
          ))}
          <p><Link href="/research/review">Open the independent review queue</Link></p>
        </section>
        <section className="card">
          <h2>Create governed release draft</h2>
          <p><Link href="/catalog/normalized">Author normalized assemblies, alleles, variants, markers, and assays</Link></p>
          <p className="muted">A draft snapshots exact approved record versions and hashes. It must then be submitted, independently reviewed, and published by an owner. Publication is blocked until every included locus has normalized approved allele coverage.</p>
          {canCurate ? (
            <MutationForm intent="catalog.release.draft" action={createCatalogReleaseDraftAction} className="form-grid">
              <label className="field"><span>Release version</span><input name="version" required maxLength={120} placeholder="2026.07-scientific-1" /></label>
              <button className="button" type="submit">Create immutable review snapshot</button>
            </MutationForm>
          ) : <div className="notice">Only an owner or catalog curator may create a release draft.</div>}
          <div className="notice section-gap-sm"><strong>Scientific gate:</strong> the supplied seed catalog contains no approved normalized alleles. A V4 release therefore cannot be published until real reviewed allele records exist. The system does not invent them.</div>
        </section>
      </div>
      <section className="card section-gap">
        <h2>Release lifecycle</h2>
        {releases.length ? (
          <div className="table-wrap"><table><thead><tr><th>Version</th><th>Publication</th><th>Independent review</th><th>Contents</th><th>Published</th><th>Hash</th></tr></thead><tbody>
            {releases.map((release) => <tr key={String(release.id)}>
              <td><Link href={`/catalog/releases/${String(release.id)}`}><strong>{text(release.version)}</strong></Link></td>
              <td><span className={`badge ${release.state === 'approved' ? 'exact' : 'warning'}`}>{humanize(release.state)}</span></td>
              <td><span className={`badge ${release.release_review_state === 'approved' ? 'exact' : 'warning'}`}>{humanize(release.release_review_state ?? 'legacy')}</span></td>
              <td>{text(release.source_count)} sources · {text(release.locus_count)} loci · {text(release.allele_count)} alleles · {text(release.assertion_count)} assertions · {text(release.rule_count)} rules</td>
              <td>{formatDate(release.published_at)}</td>
              <td><code>{text(release.content_hash)}</code></td>
            </tr>)}
          </tbody></table></div>
        ) : <p className="muted">No release draft exists. Scientific records remain individually reviewable and non-executable until a reviewed release is published.</p>}
      </section>
    </>
  );
}
