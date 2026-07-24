import type { Metadata } from 'next';
import Link from 'next/link';
import { listPhenotypeCaptures } from '@capsicum/application';
import { PageHeader } from '../../components/page-primitives';
import { getDatabasePool } from '../../lib/database';
import { formatDate, humanize, text } from '../../lib/presentation';
import { requirePrincipal } from '../../lib/session';

export const metadata: Metadata = { title: 'Phenotype annotations' };
export const dynamic = 'force-dynamic';

export default async function AnnotationsPage() {
  const principal = await requirePrincipal();
  const captures = await listPhenotypeCaptures(getDatabasePool(), principal, 200);
  return <>
    <PageHeader eyebrow="Correction-only evidence" title="Phenotype annotations" description="Review annotation counts and open the immutable capture record to add a new annotation or a superseding correction revision." action={{ href: '/phenotype-capture', label: 'Capture workspace' }} />
    <section className="card section-gap">
      {captures.length ? <div className="table-wrap"><table><thead><tr><th>Captured</th><th>Material</th><th>View</th><th>Quality</th><th>Annotations</th></tr></thead><tbody>
        {captures.map((capture) => <tr key={text(capture.id)}><td>{formatDate(capture.captured_at)}</td><td><Link href={`/phenotype-capture/${text(capture.id)}`}>{text(capture.material_code)}</Link></td><td>{text(capture.view_name)}</td><td>{humanize(capture.quality_state)}</td><td>{text(capture.annotation_count, '0')}</td></tr>)}
      </tbody></table></div> : <p className="muted">No governed phenotype captures exist yet.</p>}
    </section>
  </>;
}
