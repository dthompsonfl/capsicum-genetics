import type { Metadata } from 'next';
import Link from 'next/link';
import { dashboardSummary } from '@capsicum/application';
import { PageHeader } from '../../components/page-primitives';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';

export const metadata: Metadata = { title: 'Breeding ledger' };
export const dynamic = 'force-dynamic';

export default async function BreedingLedgerPage() {
  const principal = await requirePrincipal();
  const summary = await dashboardSummary(getDatabasePool(), principal);
  const stages = [
    ['/germplasm', '1. Germplasm accession', summary.germplasm_count, 'Identity, taxon, acquisition source, and provenance.'],
    ['/seed-lots', '2. Seed lots and inventory', summary.seed_lot_count, 'Lot lineage and append-only quantity events.'],
    ['/plants', '3. Individual plants', summary.plant_count, 'Plant identity, source lot, location, labels, and genotype evidence.'],
    ['/crosses', '4. Directed crosses', summary.cross_count, 'Controlled outcrossing, selfing, open pollination, events, fruits, and harvest.'],
    ['/experiments', '5. Experiments and observations', summary.observation_count, 'Protocol sessions and append-only correction revisions.'],
    ['/simulations', '6. Exact simulations', summary.simulation_count, 'Immutable inputs/results tied to actual parents and declared evidence.'],
  ] as const;
  return <>
    <PageHeader eyebrow="Biological provenance" title="Breeding ledger" description="The complete identity chain is persisted inside one workspace-scoped, audited ledger. A breeder can move from acquired germplasm through seed lots, plants, crosses, harvests, progeny, observations, exact simulations, and selection plans without an external spreadsheet." action={{ href: '/reports', label: 'Export ledger' }} />
    <div className="grid three section-gap">{stages.map(([href, title, count, detail]) => <Link className="card" href={href} key={href}><span className="metric">{count.toLocaleString()}</span><h2>{title}</h2><p className="muted">{detail}</p></Link>)}</div>
    <section className="card section-gap"><h2>Non-negotiable controls</h2><ul className="list"><li>Every authoritative mutation derives workspace and actor identity from a server-side session.</li><li>Repeated actions use durable idempotency records; conflicting key reuse is rejected.</li><li>Inventory, origin, pedigree, cross events, observation revisions, audit records, captures, and annotation corrections preserve append-only history.</li><li>Selfing and open pollination are represented explicitly rather than forced into an invalid outcross model.</li><li>Pedigree cycles and cross-workspace references are rejected in PostgreSQL.</li><li>Completed simulations and published catalog releases are immutable.</li></ul></section>
  </>;
}
