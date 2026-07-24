import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';
import { listMaterials } from '@capsicum/application';
import { ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { queryError } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';
import { createCrossAction } from '../../actions';

export const dynamic = 'force-dynamic';
export default async function NewCrossPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const principal = await requirePrincipal(); const plants = await listMaterials(getDatabasePool(), principal, 'plant'); const query = await searchParams;
  return <><PageHeader eyebrow="Directed parentage" title="Plan a cross" description="Select the actual individual plants. For selfing, the service records the maternal plant in both roles. Open pollination intentionally leaves paternal identity unknown." />
    <ErrorNotice message={queryError(query.error)} />
    <MutationForm intent="cross.create" className="card form-grid" action={createCrossAction}>
      <div className="field"><label htmlFor="crossCode">Cross code</label><input id="crossCode" name="crossCode" placeholder="CROSS-2026-001" required /></div>
      <div className="field"><label htmlFor="pollinationMethod">Pollination method</label><select id="pollinationMethod" name="pollinationMethod"><option value="controlled_cross">Controlled outcross</option><option value="selfing">Self-pollination</option><option value="open_pollination">Open pollination</option></select></div>
      <div className="field"><label htmlFor="maternalPlantId">Seed parent (maternal plant)</label><select id="maternalPlantId" name="maternalPlantId" required><option value="">Select the plant that will carry the fruit</option>{plants.map((p) => <option key={p.id} value={p.id}>{p.materialCode}</option>)}</select><small>This plant receives pollen and produces the fruit and seeds.</small></div>
      <div className="field"><label htmlFor="paternalPlantId">Pollen parent (paternal plant)</label><select id="paternalPlantId" name="paternalPlantId"><option value="">Unknown / determined by crossing method</option>{plants.map((p) => <option key={p.id} value={p.id}>{p.materialCode}</option>)}</select><small>Choose a different plant for a controlled outcross. Leave blank for open pollination. Self-pollination uses the seed parent automatically.</small></div>
      <div className="field"><label htmlFor="plannedAt">Planned date and time</label><LocalDateTimeInput id="plannedAt" name="plannedAt" /></div>
      <div className="full"><button className="button" type="submit" disabled={plants.length === 0}>Create cross</button></div>
    </MutationForm></>;
}
