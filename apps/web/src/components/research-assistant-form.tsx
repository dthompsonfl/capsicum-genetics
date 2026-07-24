'use client';
import Link from 'next/link';
import { MutationForm } from '@/components/mutation-form';

import { useActionState } from 'react';
import { askResearchQuestionAction, type ResearchQuestionActionState } from '../app/actions';

const initialState: ResearchQuestionActionState = {};

export function ResearchAssistantForm() {
  const [state, action, pending] = useActionState(askResearchQuestionAction, initialState);
  return (
    <div className="grid two">
      <MutationForm intent="research.ask" className="card" action={action}>
        <span className="badge exact">Approved evidence only</span>
        <h2>Ask a scientific evidence question</h2>
        <p className="muted">
          The assistant searches only approved passages in this workspace and approved global catalog assertions.
          It cannot verify a genotype, approve evidence, or create an executable phenotype rule.
        </p>
        <label className="field">
          <span>Question</span>
          <textarea name="question" required minLength={3} maxLength={4000} rows={8} placeholder="What approved evidence supports this claim, and under what applicability limits?" />
        </label>
        <button className="button" type="submit" disabled={pending}>{pending ? 'Reviewing evidence…' : 'Ask with evidence gates'}</button>
        {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      </MutationForm>
      <section className="card" aria-live="polite">
        <span className={`badge ${state.answer?.authority === 'evidence_summary' ? 'exact' : 'warning'}`}>
          {state.answer?.authority ?? 'No answer yet'}
        </span>
        <h2>Bounded answer</h2>
        <p>{state.answer?.answer ?? 'Submit a question to retrieve reviewed evidence. The correct result may be an explicit abstention.'}</p>
        {state.answer?.citations.length ? (
          <>
            <h3>Citations</h3>
            <ul className="list">
              {state.answer.citations.map((citation) => <li key={citation.evidenceId}><strong>{citation.claim}</strong><blockquote>{citation.supportingQuote}</blockquote><span className="muted">{citation.sourceLocator}</span>{citation.applicability ? <><br /><span>Applicability: {citation.applicability}</span></> : null}{citation.conflictNote ? <><br /><span className="warning-text">Conflict or uncertainty: {citation.conflictNote}</span></> : null}<br /><Link href={citation.navigationPath}>Open reviewed passage</Link></li>)}
            </ul>
          </>
        ) : null}
        {state.answer?.abstentions.length ? (
          <div className="notice"><strong>Abstentions</strong><ul className="list">{state.answer.abstentions.map((item) => <li key={item}>{item}</li>)}</ul></div>
        ) : null}
        {state.hostedFallbackCode ? <p className="notice" role="status">Hosted generation was unavailable or failed an authority check. The system used the deterministic approved-evidence fallback.</p> : null}
        {state.modelId ? <p className="muted compact">Provider: {state.provider === 'gateway' ? 'Configured AI gateway' : 'Deterministic local'} · Model: <code>{state.modelId}</code></p> : null}
        {state.interactionId ? <p className="muted compact">Audited interaction: <code>{state.interactionId}</code></p> : null}
      </section>
    </div>
  );
}
