import { ResearchAssistantForm } from '../../components/research-assistant-form';
import { PageHeader } from '../../components/page-primitives';

export const metadata = { title: 'Research Assistant' };

export default function ResearchAssistantPage() {
  return (
    <>
      <PageHeader
        eyebrow="Evidence-bounded AI"
        title="Research assistant"
        description="Retrieve only independently approved scientific passages, preserve citations, audit tool use, and abstain when the available evidence cannot support an answer."
      />
      <ResearchAssistantForm />
      <section className="card section-gap">
        <h2>Authority boundary</h2>
        <ul className="list">
          <li>Draft, rejected, superseded, and cross-workspace evidence is excluded inside the application service.</li>
          <li>Passage text is treated as untrusted data and cannot grant the assistant new authority.</li>
          <li>Every interaction and retrieval tool call is persisted for audit.</li>
          <li>AI output cannot approve records, publish releases, verify assays, or override deterministic calculations.</li>
        </ul>
      </section>
    </>
  );
}
