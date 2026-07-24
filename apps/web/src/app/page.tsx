import Link from 'next/link';
import { dashboardSummary, getCatalogDashboard, listCrosses, listSimulationRuns } from '@capsicum/application';
import { PageHeader } from '../components/page-primitives';
import { formatDate, humanize } from '../lib/presentation';
import { getDatabasePool } from '../lib/database';
import { requirePrincipal } from '../lib/session';

export const dynamic = 'force-dynamic';

type SetupStep = {
  title: string;
  description: string;
  href: string;
  action: string;
  complete: boolean;
};

export default async function DashboardPage() {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const [summary, crosses, simulations, catalog] = await Promise.all([
    dashboardSummary(pool, principal),
    listCrosses(pool, principal),
    listSimulationRuns(pool, principal),
    getCatalogDashboard(pool, principal),
  ]);

  const metrics = [
    ['Varieties and accessions', summary.germplasm_count],
    ['Seed lots', summary.seed_lot_count],
    ['Individual plants', summary.plant_count],
    ['Active crosses', summary.active_cross_count],
    ['Saved calculations', summary.simulation_count],
    ['Trait observations', summary.observation_count],
  ] as const;

  const steps: SetupStep[] = [
    { title: 'Record your starting varieties', description: 'Add each named pepper source and where it came from.', href: '/germplasm/new', action: 'Add a variety', complete: summary.germplasm_count > 0 },
    { title: 'Create a seed lot', description: 'Track the physical seed you received or harvested.', href: '/seed-lots', action: 'Manage seed inventory', complete: summary.seed_lot_count > 0 },
    { title: 'Register individual plants', description: 'Give each plant a unique identity before crossing or measuring it.', href: '/plants', action: 'Register plants', complete: summary.plant_count > 0 },
    { title: 'Document a cross', description: 'Select the actual seed parent and pollen parent and preserve direction.', href: '/crosses/new', action: 'Plan a cross', complete: crosses.length > 0 },
    { title: 'Run a genetics calculation', description: 'Calculate segregation from explicit genotype evidence or assumptions.', href: '/simulation-lab', action: 'Open simulation lab', complete: summary.simulation_count > 0 },
    { title: 'Record measurable traits', description: 'Capture observations with units, methods, and biological context.', href: '/phenotype-capture', action: 'Record traits', complete: summary.observation_count > 0 },
  ];
  const nextStep = steps.find((step) => !step.complete);

  return (
    <>
      <PageHeader
        eyebrow="Your breeding workspace"
        title={nextStep ? `Next: ${nextStep.title}` : 'Your breeding program is active.'}
        description={nextStep?.description ?? 'Continue recording crosses, simulations, measurements, and selection decisions so every result remains traceable and reproducible.'}
        action={nextStep ? { href: nextStep.href, label: nextStep.action } : { href: '/crosses/new', label: 'Plan another cross' }}
      />

      <div className="grid metrics six" aria-label="Breeding program summary">
        {metrics.map(([label, value]) => <div className="card metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </div>

      <section className="card section-gap">
        <div className="section-heading"><div><h2>Getting-started checklist</h2><p className="muted compact">Complete these in order when building a new program. You can return to any step later.</p></div><Link className="inline-link" href="/help">Read the plain-language guide</Link></div>
        <ol className="timeline">
          {steps.map((step, index) => <li key={step.title} className={step.complete ? 'complete' : undefined}><span className={step.complete ? 'badge exact' : 'badge'}>{step.complete ? 'Complete' : `Step ${index + 1}`}</span><div><h3>{step.title}</h3><p>{step.description}</p><Link className="inline-link" href={step.href}>{step.action}</Link></div></li>)}
        </ol>
      </section>

      <div className="notice section-gap">
        <strong>Scientific authority status</strong>
        <p>The approved catalog contains {catalog.loci.approved ?? 0} loci, {catalog.alleles.approved ?? 0} alleles, {catalog.assertions.approved ?? 0} evidence assertions, and {catalog.rules.approved ?? 0} executable phenotype rules across {catalog.releases.approved ?? 0} published releases. Genotype calculations remain available from explicit assumptions; phenotype interpretation abstains when reviewed evidence is absent.</p>
        <div className="button-row"><Link className="button secondary" href="/quick-genetics">Try quick genetics</Link><Link className="button secondary" href="/scientific-catalog">Review catalog authority</Link></div>
      </div>

      <div className="grid two section-gap">
        <section className="card"><div className="section-heading"><h2>Recent crosses</h2><Link className="inline-link" href="/crosses">View all</Link></div>{crosses.length ? <ul className="list">{crosses.slice(0,5).map((cross) => <li key={cross.id}><Link href={`/crosses/${cross.id}`}><strong>{cross.crossCode}</strong><br /><span className="muted">Seed parent {cross.maternalCode} × pollen parent {cross.paternalCode ?? 'unknown'} · {humanize(cross.status)} · {formatDate(cross.createdAt)}</span></Link></li>)}</ul> : <p className="muted">No crosses have been recorded yet.</p>}</section>
        <section className="card"><div className="section-heading"><h2>Recent genetics calculations</h2><Link className="inline-link" href="/simulation-lab">Run a calculation</Link></div>{simulations.length ? <ul className="list">{simulations.slice(0,5).map((run: Record<string, unknown>) => <li key={String(run.id)}><Link href={`/simulations/${String(run.id)}`}><strong>{humanize(run.model_type)}</strong><br /><span className="muted mono">{String(run.content_hash).slice(0,20)}… · {formatDate(run.completed_at)}</span></Link></li>)}</ul> : <p className="muted">No calculations have been saved yet. The quick calculator can teach the basics without changing permanent records.</p>}</section>
      </div>
    </>
  );
}
