import type { Metadata } from 'next';
import { listResearchInteractions } from '@capsicum/application';
import { PageHeader } from '../../components/page-primitives';
import { getDatabasePool } from '../../lib/database';
import { formatDate, humanize, text } from '../../lib/presentation';
import { requirePrincipal } from '../../lib/session';

export const metadata: Metadata = { title: 'Evidence-bounded AI' };
export const dynamic = 'force-dynamic';

export default async function AiPage() {
  const principal = await requirePrincipal();
  const interactions = await listResearchInteractions(getDatabasePool(), principal, 50);
  return <>
    <PageHeader eyebrow="Evidence-bounded AI" title="AI interaction audit" description="The assistant retrieves only approved workspace passages and approved catalog assertions, records every evidence identifier and tool call, and abstains when the reviewed evidence is insufficient." action={{ href: '/research-assistant', label: 'Ask a research question' }} />
    <div className="grid two section-gap">
      <section className="card"><h2>Hard authority boundary</h2><ul className="list">
        <li>AI cannot approve evidence, verify a genotype, publish a catalog release, promote a model, or alter a deterministic simulation.</li>
        <li>Draft, rejected, superseded, or cross-workspace passages are excluded from retrieval.</li>
        <li>Citations are validated against the retrieved approved evidence set before persistence.</li>
        <li>Core breeding, observations, and exact-genetics workflows remain available when hosted AI is disabled.</li>
      </ul></section>
      <section className="card"><h2>Current implementation</h2><p className="notice"><strong>Deterministic evidence summarizer:</strong> active when approved evidence exists.</p><p className="muted">Hosted generative models remain optional and degraded until provider credentials, rate limits, evaluation suites, prompt-injection tests, and deployment approval are supplied.</p></section>
    </div>
    <section className="card section-gap"><h2>Recent interactions</h2>
      {interactions.length ? <div className="stack">{interactions.map((interaction) => {
        const answer = interaction.answer_payload as Record<string, unknown> | undefined;
        return <article className="record-card" key={text(interaction.id)}><div><strong>{text(interaction.question)}</strong><br /><span className="muted">{formatDate(interaction.created_at)} · {humanize(interaction.authority)} · {text(interaction.model_id)}</span></div><p>{text(answer?.answer, 'No answer text persisted.')}</p><p className="muted">Evidence IDs: {Array.isArray(interaction.evidence_ids) && interaction.evidence_ids.length ? interaction.evidence_ids.map(String).join(', ') : 'none; answer abstained or no approved evidence was available'}</p></article>;
      })}</div> : <p className="muted">No research interactions have been recorded.</p>}
    </section>
  </>;
}
