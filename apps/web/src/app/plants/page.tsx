import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';
import Link from 'next/link';
import { listMaterials, listPlantingInventoryOptions } from '@capsicum/application';
import { EmptyState, ErrorNotice, PageHeader } from '../../components/page-primitives';
import { formatDate, humanize, queryError } from '../../lib/presentation';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';
import { createPlantAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PlantsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const query = await searchParams;
  const [plants, lots, inventoryOptions] = await Promise.all([
    listMaterials(pool, principal, 'plant'),
    listMaterials(pool, principal, 'seed_lot'),
    listPlantingInventoryOptions(pool, principal),
  ]);

  return <>
    <PageHeader eyebrow="Individual identity" title="Plants" description="Every plant is a distinct biological individual. Exact planting consumes physical inventory atomically; reservations and independently reviewed exceptions remain explicit." />
    <ErrorNotice message={queryError(query.error)} />
    <section className="card">
      <h2>Register plant</h2>
      {lots.length ? <MutationForm intent="plant.create" className="form-grid" action={createPlantAction}>
        <div className="field"><label htmlFor="materialCode">Plant code</label><input id="materialCode" name="materialCode" placeholder="PLANT-2026-001" required /></div>
        <div className="field"><label htmlFor="sourceSeedLotMaterialId">Source seed lot</label><select id="sourceSeedLotMaterialId" name="sourceSeedLotMaterialId" required>{lots.map((lot) => <option value={lot.id} key={lot.id}>{lot.materialCode} · {lot.availableQuantity === null || lot.availableQuantity === undefined ? 'quantity unknown' : `${lot.availableQuantity} seed recorded`}</option>)}</select></div>
        <div className="field"><label htmlFor="inventoryMode">Inventory authority</label><select id="inventoryMode" name="inventoryMode" defaultValue="consume"><option value="consume">Consume recorded physical inventory</option><option value="uncertain_quantity">Explicitly uncertain quantity</option><option value="approved_exception">Independently approved exception</option></select></div>
        <div className="field"><label htmlFor="seedQuantity">Seeds represented</label><input id="seedQuantity" name="seedQuantity" type="number" min="1" max="100000" defaultValue="1" required /></div>
        <div className="field"><label htmlFor="reservationId">Reservation, when used</label><select id="reservationId" name="reservationId" defaultValue=""><option value="">No reservation</option>{inventoryOptions.reservations.map((reservation) => <option key={reservation.id} value={reservation.id}>{reservation.material_code} · {reservation.remaining_quantity} remaining · {reservation.purpose}</option>)}</select></div>
        <div className="field"><label htmlFor="inventoryExceptionRequestId">Approved exception, when used</label><select id="inventoryExceptionRequestId" name="inventoryExceptionRequestId" defaultValue=""><option value="">No approved exception</option>{inventoryOptions.approvedExceptions.map((exception) => <option key={exception.id} value={exception.id}>{exception.material_code} · {exception.quantity} seed · {exception.reason}</option>)}</select></div>
        <div className="field full"><label htmlFor="inventoryExceptionReason">Exception or uncertainty explanation</label><textarea id="inventoryExceptionReason" name="inventoryExceptionReason" rows={3} aria-describedby="inventory-help" /></div>
        <p className="muted full" id="inventory-help">Required for uncertain quantity and approved-exception modes. The selected reservation or exception must belong to the selected seed lot and cover the exact quantity.</p>
        <div className="field"><label htmlFor="germinatedAt">Germinated at</label><LocalDateTimeInput id="germinatedAt" name="germinatedAt" /></div>
        <div className="field"><label htmlFor="locationName">Location</label><input id="locationName" name="locationName" placeholder="Greenhouse bench A3" /></div>
        <div className="full"><button className="button" type="submit">Register plant and reconcile inventory</button></div>
      </MutationForm> : <p className="muted">Create a seed lot before registering plants.</p>}
    </section>
    <div className="section-gap">{plants.length ? <div className="table-wrap"><table><thead><tr><th>Plant</th><th>Status</th><th>Created</th></tr></thead><tbody>{plants.map((plant) => <tr key={plant.id}><td><Link className="inline-link" href={`/plants/${plant.id}`}>{plant.materialCode}</Link></td><td>{humanize(plant.status)}</td><td>{formatDate(plant.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No plants">Register individual plants from traceable seed lots before recording crosses or phenotype observations.</EmptyState>}</div>
  </>;
}
