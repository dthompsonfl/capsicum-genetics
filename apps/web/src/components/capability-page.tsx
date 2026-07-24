import Link from 'next/link';

export interface CapabilityPageProps {
  eyebrow: string;
  title: string;
  summary: string;
  state: 'implemented' | 'foundation' | 'blocked';
  available: readonly string[];
  required: readonly string[];
  primaryLink?: { href: string; label: string };
}

const stateLabel = {
  implemented: 'Implemented vertical slice',
  foundation: 'Domain foundation',
  blocked: 'Explicitly unavailable',
} as const;

export function CapabilityPage({
  eyebrow,
  title,
  summary,
  state,
  available,
  required,
  primaryLink,
}: CapabilityPageProps) {
  return (
    <>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p className="lede">{summary}</p>
      <div className={state === 'blocked' ? 'notice' : 'card status-card'}>
        <span className={state === 'implemented' ? 'badge exact' : 'badge warning'}>
          {stateLabel[state]}
        </span>
        {state !== 'implemented' ? (
          <p className="muted">
            This route exists so the product degrades honestly. It does not imply that the full
            workflow, persistence, authorization, or release evidence is complete.
          </p>
        ) : null}
      </div>
      <div className="grid two section-gap">
        <section className="card">
          <h2>Available now</h2>
          <ul className="list">
            {available.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="card">
          <h2>Required before release</h2>
          <ul className="list">
            {required.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
      {primaryLink ? (
        <p className="section-gap"><Link className="button" href={primaryLink.href}>{primaryLink.label}</Link></p>
      ) : null}
    </>
  );
}
