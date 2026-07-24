import type { Metadata } from 'next';
import { listModelVersions } from '@capsicum/application';
import { PageHeader } from '../../../components/page-primitives';
import { getDatabasePool } from '../../../lib/database';
import { formatDate, humanize, text } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';

export const metadata: Metadata = { title: 'Model registry' };
export const dynamic = 'force-dynamic';

export default async function ModelRegistryPage() {
  const principal = await requirePrincipal();
  const models = await listModelVersions(getDatabasePool(), principal, 100);
  const validated = models.filter((model) => model.state === 'validated');
  return <>
    <PageHeader eyebrow="Model governance" title="Model registry" description="Model artifacts are conditional scientific tools. A validated version requires a dataset hash, model card, evaluation report, promoter identity, applicability limits, and an immutable version record." />
    <div className="notice section-gap"><strong>{validated.length} validated model versions.</strong> Quantitative heat, yield, disease, genomic, G×E, flavor, and learned-vision outputs remain disabled unless an applicable validated version is present.</div>
    <section className="card section-gap"><h2>Registered versions</h2>
      {models.length ? <div className="table-wrap"><table><thead><tr><th>Created</th><th>Model</th><th>Kind</th><th>State</th><th>Dataset hash</th><th>Evaluation</th></tr></thead><tbody>
        {models.map((model) => <tr key={text(model.id)}><td>{formatDate(model.created_at)}</td><td>{text(model.model_key)} v{text(model.version)}</td><td>{humanize(model.model_kind)}</td><td><span className={`badge ${model.state === 'validated' ? 'exact' : 'warning'}`}>{humanize(model.state)}</span></td><td><code>{text(model.training_dataset_hash)}</code></td><td>{model.evaluation_report ? 'Recorded' : 'Missing'}</td></tr>)}
      </tbody></table></div> : <p className="muted">No model versions are registered. This is the scientifically correct state until real training data and independent evaluations exist.</p>}
    </section>
    <section className="card section-gap"><h2>Promotion requirements</h2><ul className="list"><li>Immutable artifact and training-dataset hashes.</li><li>Task-specific model card and known failure modes.</li><li>Held-out evaluation with applicability limits and calibration evidence.</li><li>Independent review and explicit promoter identity.</li><li>Rollback by selecting an earlier immutable version, never rewriting a validated artifact.</li></ul></section>
  </>;
}
