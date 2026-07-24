import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="lede">{description}</p>
      </div>
      {action ? <Link className="button" href={action.href}>{action.label}</Link> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: {
  title: string;
  children: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <section className="card empty-state">
      <h2>{title}</h2>
      <div className="muted">{children}</div>
      {action ? <p><Link className="button" href={action.href}>{action.label}</Link></p> : null}
    </section>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  return message ? <div className="notice error-notice" role="alert">{message}</div> : null;
}

export function DefinitionList({ entries }: { entries: readonly [string, ReactNode][] }) {
  return (
    <dl className="definition-grid">
      {entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}
