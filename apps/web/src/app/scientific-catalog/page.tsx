import Link from 'next/link';
import type { Metadata } from 'next';
import { listCatalogRecords } from '@capsicum/application';
import { catalogSummary } from '@capsicum/scientific-catalog';
import { EmptyState, PageHeader } from '../../components/page-primitives';
import { getDatabasePool } from '../../lib/database';
import { humanize, text } from '../../lib/presentation';
import { requirePrincipal } from '../../lib/session';

export const metadata: Metadata = { title: 'Scientific Catalog' };
export const dynamic = 'force-dynamic';

export default async function ScientificCatalogPage() {
  const principal = await requirePrincipal();
  const [loci, assertions, sources] = await Promise.all([
    listCatalogRecords(getDatabasePool(), principal, 'locus', undefined, 250),
    listCatalogRecords(getDatabasePool(), principal, 'evidence_assertion', undefined, 250),
    listCatalogRecords(getDatabasePool(), principal, 'scientific_source', undefined, 250),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Evidence governance"
        title="Scientific catalog"
        description="Versioned loci, evidence assertions, and sources. Catalog prose remains non-executable; only separately authored and independently approved rules may produce conditional phenotype interpretations."
        action={{ href: '/catalog', label: 'Open governance controls' }}
      />
      <div className="notice">
        <strong>Bundled seed inventory:</strong> {catalogSummary.locusCount} loci, {catalogSummary.claimCount} claims, {catalogSummary.sourceCount} sources, and {catalogSummary.executableRuleCount} executable rules. Database records below are the authoritative review workflow.
      </div>
      <section className="card section-gap">
        <h2>Versioned loci</h2>
        {loci.length ? <div className="table-wrap"><table><thead><tr><th>Locus</th><th>Trait category</th><th>Species scope</th><th>Model class</th><th>Review</th></tr></thead><tbody>
          {loci.map((record) => <tr key={String(record.id)}><td><Link href={`/catalog/loci/${String(record.id)}`}><strong>{text(record.canonical_symbol)}</strong></Link><br /><code>{text(record.catalog_id)}@{text(record.record_version)}</code></td><td>{text(record.trait_category)}</td><td>{text(record.species_scope)}</td><td>{text(record.model_class)}</td><td><span className={`badge ${record.review_state === 'approved' ? 'exact' : 'warning'}`}>{humanize(record.review_state)}</span></td></tr>)}
        </tbody></table></div> : <EmptyState title="No imported loci">Run the governed catalog importer after bootstrapping an owner. Seed JSON is not automatically promoted into authority tables.</EmptyState>}
      </section>
      <section className="card section-gap">
        <h2>Evidence assertions</h2>
        {assertions.length ? <div className="table-wrap"><table><thead><tr><th>Claim</th><th>Applicability</th><th>Required conditions</th><th>Review</th></tr></thead><tbody>
          {assertions.map((record) => <tr key={String(record.id)}><td><Link href={`/catalog/claims/${String(record.id)}`}><strong>{text(record.claim_id)}</strong></Link><br />{text(record.claim_text)}</td><td>{text(record.applicability)}</td><td>{text(record.required_conditions)}</td><td><span className={`badge ${record.review_state === 'approved' ? 'exact' : 'warning'}`}>{humanize(record.review_state)}</span></td></tr>)}
        </tbody></table></div> : <p className="muted">No assertions have been imported.</p>}
      </section>
      <section className="card section-gap">
        <h2>Scientific sources</h2>
        <p className="muted">{sources.length} versioned source records are present in the database. Source approval alone never makes a claim executable.</p>
      </section>
    </>
  );
}
