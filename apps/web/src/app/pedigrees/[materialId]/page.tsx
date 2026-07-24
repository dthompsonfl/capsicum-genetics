import { notFound } from 'next/navigation';
import { getPedigree } from '@capsicum/application';
import { PageHeader } from '../../../components/page-primitives';
import { humanize, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function PedigreePage({ params }: { params: Promise<{ materialId: string }> }) {
  const principal = await requirePrincipal(); const { materialId } = await params;
  const pedigree = await getPedigree(getDatabasePool(), principal, materialId) as { root?: Record<string, unknown>; ancestors?: Record<string, unknown>[] } | null;
  if (!pedigree?.root) notFound();
  return <><PageHeader eyebrow="Provenance graph" title={`Pedigree · ${text(pedigree.root.material_code)}`} description="Directed ancestry is generated from immutable origin events and parent-role edges. Missing parentage remains explicitly missing." />
    <section className="card"><h2>Root material</h2><p><strong>{text(pedigree.root.material_code)}</strong> · {humanize(pedigree.root.kind)} · {humanize(pedigree.root.status)}</p></section>
    <section className="card section-gap"><h2>Ancestor edges</h2>{pedigree.ancestors?.length ? <div className="table-wrap"><table><thead><tr><th>Depth</th><th>Child</th><th>Parent</th><th>Role</th><th>Origin</th></tr></thead><tbody>{pedigree.ancestors.map((edge, index) => <tr key={`${text(edge.child_id)}-${text(edge.parent_id)}-${index}`}><td>{text(edge.depth)}</td><td>{text(edge.child_code)}</td><td>{text(edge.parent_code)}</td><td>{humanize(edge.parent_role)}</td><td>{humanize(edge.event_type)}</td></tr>)}</tbody></table></div> : <p className="muted">No recorded ancestors. This may be an acquired accession or incomplete historical record.</p>}</section>
  </>;
}
