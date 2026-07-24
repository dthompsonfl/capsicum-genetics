import type { Metadata } from 'next';
import Link from 'next/link';
import { listExportJobs } from '@capsicum/application';
import { MutationForm } from '../../components/mutation-form';
import { ErrorNotice, PageHeader } from '../../components/page-primitives';
import { getDatabasePool } from '../../lib/database';
import { formatDate, humanize, queryError, text } from '../../lib/presentation';
import { requirePrincipal } from '../../lib/session';

export const metadata: Metadata = { title: 'Reports and exports' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; queued?: string }> }) {
  const principal = await requirePrincipal();
  const records = await listExportJobs(getDatabasePool(), principal, 100);
  const params = await searchParams;
  return (
    <>
      <PageHeader
        eyebrow="Interoperability"
        title="Reports and exports"
        description="Create immutable, workspace-scoped breeding-ledger snapshots. Every export is content-hashed, audited, stored in immutable object storage, and downloadable only through an authenticated workspace check."
      />
      <ErrorNotice message={queryError(params.error)} />
      {params.queued ? <div className="notice" role="status">Export queued. The durable worker will create and hash the immutable artifact; refresh this page to see progress.</div> : null}
      <div className="grid two section-gap">
        <section className="card">
          <h2>Create breeding-ledger export</h2>
          <p className="muted">JSON preserves structured scientific records. CSV emits one canonical JSON record per row for broad spreadsheet compatibility without flattening away provenance.</p>
          <div className="stack">
            <MutationForm intent="export-breeding-ledger-json" action="/api/exports/breeding-ledger" method="post">
              <input type="hidden" name="format" value="json" />
              <button className="button" type="submit">Queue JSON export</button>
            </MutationForm>
            <MutationForm intent="export-breeding-ledger-csv" action="/api/exports/breeding-ledger" method="post">
              <input type="hidden" name="format" value="csv" />
              <button className="button secondary" type="submit">Queue CSV export</button>
            </MutationForm>
          </div>
          <p className="muted compact">Exports run through the durable worker, survive web restarts, and become downloadable only after immutable storage and SHA-256 finalization succeed.</p>
        </section>
        <section className="card">
          <h2>Scientific scope</h2>
          <ul className="list">
            <li>Materials, seed lots, plants, crosses, cross events, and progeny families.</li>
            <li>Genotype calls with evidence state and assay/source identifiers.</li>
            <li>Current observation revisions with method and value contracts.</li>
            <li>Immutable simulation snapshots and selection plans.</li>
          </ul>
          <p className="muted">MIAPPE, MCPD, and BrAPI adapters remain blocked until their field mappings and conformance tests are implemented.</p>
        </section>
      </div>
      <section className="card section-gap">
        <h2>Export history</h2>
        {records.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Requested</th><th>Type</th><th>State</th><th>Content hash</th><th /></tr></thead>
              <tbody>{records.map((record) => (
                <tr key={text(record.id)}>
                  <td>{formatDate(record.requested_at)}</td>
                  <td>{humanize(record.export_type)}</td>
                  <td><span className={`badge ${record.state === 'succeeded' ? 'exact' : record.state === 'failed' ? 'warning' : ''}`}>{humanize(record.state)}</span></td>
                  <td><code>{text(record.content_sha256, '—')}</code></td>
                  <td>{record.state === 'succeeded' ? <Link href={`/api/exports/${text(record.id)}`}>Download</Link> : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">No exports have been created.</p>}
      </section>
    </>
  );
}
