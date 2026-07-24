import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';
import Link from 'next/link';
import { listMaterials } from '@capsicum/application';
import { EmptyState, ErrorNotice, PageHeader } from '../../components/page-primitives';
import { formatDate, humanize, queryError } from '../../lib/presentation';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';
import { createSeedLotAction } from '../actions';

export const dynamic = 'force-dynamic';
export default async function SeedLotsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const principal = await requirePrincipal(); const pool = getDatabasePool();
  const [lots, accessions] = await Promise.all([listMaterials(pool, principal, 'seed_lot'), listMaterials(pool, principal, 'germplasm_accession')]);
  const query = await searchParams;
  return <><PageHeader eyebrow="Inventory provenance" title="Seed lots" description="Seed identity, accession origin, quantity history, and storage context. Inventory is event-sourced; corrections are compensating events." />
    <ErrorNotice message={queryError(query.error)} />
    <section className="card"><h2>Create seed lot</h2>{accessions.length ? <MutationForm intent="seed-lot.create" className="form-grid" action={createSeedLotAction}>
      <div className="field"><label htmlFor="materialCode">Lot code</label><input id="materialCode" name="materialCode" placeholder="LOT-2026-001" required /></div>
      <div className="field"><label htmlFor="accessionMaterialId">Accession</label><select id="accessionMaterialId" name="accessionMaterialId" required>{accessions.map((a) => <option value={a.id} key={a.id}>{a.materialCode} · {a.displayName}</option>)}</select></div>
      <div className="field"><label htmlFor="quantityEstimate">Initial seed quantity</label><input id="quantityEstimate" name="quantityEstimate" type="number" min="0" /></div>
      <div className="field"><label htmlFor="storageLocation">Storage location</label><input id="storageLocation" name="storageLocation" /></div>
      <div className="field"><label htmlFor="acquiredAt">Received or harvested at</label><LocalDateTimeInput id="acquiredAt" name="acquiredAt" /></div>
      <div className="full"><button className="button" type="submit">Create seed lot</button></div>
    </MutationForm> : <p className="muted">Create a germplasm accession before creating a seed lot.</p>}</section>
    <div className="section-gap">{lots.length ? <div className="table-wrap"><table><thead><tr><th>Lot</th><th>Status</th><th>Created</th></tr></thead><tbody>{lots.map((lot) => <tr key={lot.id}><td><Link className="inline-link" href={`/seed-lots/${lot.id}`}>{lot.materialCode}</Link></td><td>{humanize(lot.status)}</td><td>{formatDate(lot.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No seed lots">Seed lots can be acquired directly or generated from a recorded cross harvest.</EmptyState>}</div>
  </>;
}
