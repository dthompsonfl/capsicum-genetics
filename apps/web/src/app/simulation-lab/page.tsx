import type { Metadata } from 'next';
import { listMaterials, listSimulationCatalogOptions } from '@capsicum/application';
import { EmptyState, PageHeader } from '../../components/page-primitives';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';
import { ExactSimulationForm } from './simulation-form';
import { WeightedSimulationForm } from './weighted-simulation-form';
import { AdvancedSimulationForm } from './advanced-simulation-form';

export const metadata: Metadata = { title: 'Simulation Lab' };
export const dynamic = 'force-dynamic';

export default async function SimulationLabPage() {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const [plants, catalogReleases] = await Promise.all([
    listMaterials(pool, principal, 'plant'),
    listSimulationCatalogOptions(pool, principal),
  ]);
  return <><PageHeader eyebrow="Exact nuclear inheritance" title="Simulation lab" description="Calculate exact segregation from explicitly declared genotype evidence. Alleles are opaque assay identifiers; capitalization never implies dominance." />
    {plants.length ? <>
      <section className="card">
        <h2>Choose the simplest model that matches your evidence</h2>
        <div className="grid three section-gap-sm">
          <div className="help"><strong>Start here: exact parent genotypes</strong><p>Use when each parent has one stated genotype per locus. This is the clearest choice for teaching, verified assays, or explicitly labeled assumptions.</p></div>
          <div className="help"><strong>Uncertain parent genotypes</strong><p>Use when a parent could have multiple genotypes and you can assign defensible probabilities to those alternatives.</p></div>
          <div className="help"><strong>Advanced biological models</strong><p>Use only with evidence for linkage, recombination, cytoplasmic transmission, or reviewed viability rules.</p></div>
        </div>
      </section>
      <details className="workflow-panel section-gap" open>
        <summary><span><strong>Standard exact inheritance</strong><small>One explicit genotype per parent and locus</small></span></summary>
        <ExactSimulationForm
          workspaceId={principal.workspaceId}
          plants={plants.map((plant) => ({ id: plant.id, materialCode: plant.materialCode }))}
          catalogReleases={catalogReleases}
        />
      </details>
      <details className="workflow-panel section-gap">
        <summary><span><strong>Uncertain parent genotypes</strong><small>Weighted genotype hypotheses with visible assumptions</small></span></summary>
        <WeightedSimulationForm
          workspaceId={principal.workspaceId}
          plants={plants.map((plant) => ({ id: plant.id, materialCode: plant.materialCode }))}
          catalogReleases={catalogReleases}
        />
      </details>
      <details className="workflow-panel section-gap">
        <summary><span><strong>Advanced research models</strong><small>Linkage, recombination, cytoplasmic state, viability, and bounded Monte Carlo</small></span></summary>
        <div className="warning section-gap-sm" role="note"><strong>Do not use this mode by default.</strong> Advanced parameters must come from reviewed evidence or remain clearly labeled research assumptions. Seed-parent direction matters for cytoplasmic models.</div>
        <AdvancedSimulationForm
          workspaceId={principal.workspaceId}
          plants={plants.map((plant) => ({ id: plant.id, materialCode: plant.materialCode }))}
          catalogReleases={catalogReleases}
        />
      </details>
    </> : <EmptyState title="Plants are required" action={{ href: '/plants', label: 'Register plants' }}>Saved simulation runs must reference real seed-parent and pollen-parent plant identities. Use Quick Genetics first when you only want to learn or explore.</EmptyState>}
  </>;
}
