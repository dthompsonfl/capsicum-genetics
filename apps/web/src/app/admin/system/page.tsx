import { hasPermission } from '@capsicum/auth';
import { notFound } from 'next/navigation';
import { getSafeSystemReadiness } from '../../../lib/environment';
import { PageHeader } from '../../../components/page-primitives';
import { humanize } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export default async function SystemReadinessPage() {
  const principal = await requirePrincipal();
  if (!hasPermission(principal.role, 'system.read')) notFound();
  const report = await getSafeSystemReadiness(true);
  return (
    <>
      <PageHeader eyebrow="Operations" title="System readiness" description="Sanitized configuration state and live dependency probes. Secret values are never returned or rendered." action={{ href: '/api/system/readiness', label: 'Open safe readiness JSON' }} />
      <div className="metric-grid">
        <article className="metric"><span>Environment contract</span><strong>{report.valid ? 'Valid' : 'Blocked'}</strong><small>{report.runtime.appMode}</small></article>
        <article className="metric"><span>Node runtime</span><strong>{report.runtime.nodeVersion}</strong><small>{report.runtime.node24OrNewer ? 'Meets Node 24 policy' : 'Upgrade required'}</small></article>
        <article className="metric"><span>Database</span><strong>{report.live?.database.ok ? 'Ready' : 'Blocked'}</strong><small>{report.live?.database.migrationCount ?? 0}/{report.live?.database.expectedMigrationCount ?? 0} migrations</small></article>
        <article className="metric"><span>Object storage</span><strong>{report.live?.objectStorage.ok ? 'Ready' : 'Blocked'}</strong><small>{report.live?.objectStorage.mode ?? 'not configured'}</small></article>
      </div>
      {report.issues.length ? <section className="card section-gap"><h2>Configuration issues</h2><ul className="list">{report.issues.map((issue) => <li key={`${issue.path}:${issue.message}`}><strong>{issue.path}</strong>: {issue.message}</li>)}</ul></section> : null}
      <section className="card section-gap"><h2>Live checks</h2><ul className="list"><li>{report.live?.database.detail ?? 'Database live check was not run.'}</li><li>{report.live?.objectStorage.detail ?? 'Object-storage live check was not run.'}</li></ul></section>
      <section className="card section-gap"><h2>Capability gates</h2><div className="stack">{report.readiness.map((check) => <article className="record-card" key={check.name}><div><strong>{humanize(check.name)}</strong><p className="muted compact">{check.detail}</p></div><span className={`badge ${check.state === 'ready' ? 'exact' : check.state === 'blocked' ? 'danger' : 'warning'}`}>{humanize(check.state)}</span></article>)}</div></section>
      <div className="notice section-gap"><strong>Deliberate unavailable states:</strong> quantitative genetics, exact SHU, universal phenotype prediction, genomic prediction, disease outcomes without isolate/environment context, and learned visual predictions remain blocked until validated model evidence exists.</div>
    </>
  );
}
