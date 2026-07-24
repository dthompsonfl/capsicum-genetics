import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMaterialDetail, listMaterials } from '@capsicum/application';
import { DefinitionList, EmptyState, ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { formatDate, queryError, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';
import {
  createInventoryReservationAction,
  recordInventoryAction,
  releaseInventoryReservationAction,
  requestInventoryExceptionAction,
  reviewInventoryExceptionAction,
  transferSeedInventoryAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

type InventoryEvent = {
  id: string;
  event_type: string;
  quantity_delta: number;
  running_quantity: number;
  reason: string;
  occurred_at: string;
};

type Reservation = {
  id: string;
  quantity: number;
  remaining_quantity: number;
  purpose: string;
  state: string;
  reserved_at: string;
  expires_at: string | null;
};

type ExceptionRequest = {
  id: string;
  quantity: number;
  reason: string;
  review_state: string;
  requester_name: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_rationale: string | null;
  created_at: string;
  used: boolean;
};

type SeedLotRecord = Record<string, unknown> & {
  inventoryEvents: InventoryEvent[];
  inventoryReservations: Reservation[];
  inventoryExceptionRequests: ExceptionRequest[];
};

function quantity(value: unknown): string {
  return value === null || value === undefined ? 'Unknown — reconcile before reservation or exact planting' : `${String(value)} seed`;
}

export default async function SeedLotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const query = await searchParams;
  const pool = getDatabasePool();
  const [record, seedLots] = await Promise.all([
    getMaterialDetail(pool, principal, id) as Promise<SeedLotRecord | null>,
    listMaterials(pool, principal, 'seed_lot'),
  ]);
  if (!record || record.kind !== 'seed_lot') notFound();
  const canReviewExceptions = principal.role === 'owner' || principal.role === 'administrator';

  return <>
    <PageHeader
      eyebrow="Seed lot"
      title={String(record.material_code)}
      description="A traceable physical seed lot. Unknown quantity is distinct from zero; every count, reservation, planting, release, and exception remains in immutable history."
    />
    <ErrorNotice message={queryError(query.error)} />
    <section className="card">
      <DefinitionList entries={[
        ['Status', text(record.status)],
        ['Recorded physical quantity', quantity(record.quantity_estimate)],
        ['Accession identity', record.accession_material_id ? <Link className="inline-link" href={`/germplasm/${String(record.accession_material_id)}`} key="accession">View accession</Link> : 'Not accession-anchored'],
        ['Derived material identity', record.derived_material_id ? <Link className="inline-link" href={`/pedigrees/${String(record.derived_material_id)}`} key="derived">View derived pedigree</Link> : 'Not derived material'],
        ['Created', formatDate(record.created_at)],
      ]} />
    </section>

    <section className="card section-gap">
      <h2>Record physical inventory</h2>
      <p className="muted">For a count or reconciliation, enter the resulting physical quantity. For other events, enter a signed change: receipts and returns are positive; planting, loss, sowing, consumption, and discard are negative.</p>
      <MutationForm intent="inventory.record" className="form-grid" action={recordInventoryAction}>
        <input type="hidden" name="seedLotMaterialId" value={id} />
        <div className="field"><label htmlFor="eventType">Event</label><select id="eventType" name="eventType" defaultValue="counted">
          <option value="counted">Physical count</option><option value="reconciliation">Reconciliation</option><option value="received">Receipt</option><option value="return">Return</option><option value="loss">Loss</option><option value="sown">Sown</option><option value="consumed">Consumed</option><option value="discarded">Discarded</option><option value="adjustment">Signed adjustment</option><option value="transferred">Signed transfer adjustment</option>
        </select></div>
        <div className="field"><label htmlFor="quantityDelta">Signed quantity change</label><input id="quantityDelta" name="quantityDelta" type="number" defaultValue="0" aria-describedby="inventory-delta-help" /></div>
        <div className="field"><label htmlFor="resultingQuantity">Resulting physical quantity</label><input id="resultingQuantity" name="resultingQuantity" type="number" min="0" aria-describedby="inventory-result-help" /></div>
        <p className="muted" id="inventory-delta-help">Use zero for count and reconciliation.</p>
        <p className="muted" id="inventory-result-help">Required for count and reconciliation; ignored for ordinary delta events.</p>
        <div className="field full"><label htmlFor="inventoryReason">Reason</label><input id="inventoryReason" name="reason" minLength={1} required /></div>
        <div className="field"><label htmlFor="occurredAt">Occurred at</label><LocalDateTimeInput id="occurredAt" name="occurredAt" /></div>
        <div className="full"><button className="button" type="submit">Record immutable event</button></div>
      </MutationForm>
    </section>

    <section className="card section-gap">
      <h2>Transfer physical seed</h2>
      <p className="muted">A transfer creates paired immutable events and is allowed only between lots with the same accession or derived-material identity. Reserved seed cannot be transferred.</p>
      {seedLots.some((lot) => lot.id !== id) ? <MutationForm intent="inventory.transfer" className="form-grid" action={transferSeedInventoryAction}>
        <input type="hidden" name="sourceSeedLotMaterialId" value={id} />
        <div className="field"><label htmlFor="destinationSeedLotMaterialId">Destination lot</label><select id="destinationSeedLotMaterialId" name="destinationSeedLotMaterialId" required>{seedLots.filter((lot) => lot.id !== id).map((lot) => <option key={lot.id} value={lot.id}>{lot.materialCode} · {lot.availableQuantity === null || lot.availableQuantity === undefined ? 'quantity unknown' : `${lot.availableQuantity} seed`}</option>)}</select></div>
        <div className="field"><label htmlFor="transferQuantity">Quantity</label><input id="transferQuantity" name="quantity" type="number" min="1" required /></div>
        <div className="field full"><label htmlFor="transferReason">Reason</label><input id="transferReason" name="reason" minLength={3} required /></div>
        <div className="field"><label htmlFor="transferOccurredAt">Occurred at</label><LocalDateTimeInput id="transferOccurredAt" name="occurredAt" /></div>
        <div className="full"><button className="button" type="submit">Record paired transfer</button></div>
      </MutationForm> : <p className="muted">Create a second seed lot with the same biological identity before recording a transfer.</p>}
    </section>

    <section className="card section-gap">
      <h2>Reserve seed for planned planting</h2>
      <p className="muted">Reservations hold known physical inventory without changing the lot count. Partial use keeps the remainder active; release and expiry are recorded separately.</p>
      <MutationForm intent="inventory.reservation.create" className="form-grid" action={createInventoryReservationAction}>
        <input type="hidden" name="seedLotMaterialId" value={id} />
        <div className="field"><label htmlFor="reservationQuantity">Quantity</label><input id="reservationQuantity" name="quantity" type="number" min="1" required /></div>
        <div className="field"><label htmlFor="expiresAt">Expires at</label><input id="expiresAt" name="expiresAt" type="datetime-local" /></div>
        <div className="field full"><label htmlFor="purpose">Purpose</label><input id="purpose" name="purpose" minLength={3} placeholder="F2 grow-out tray A" required /></div>
        <div className="full"><button className="button" type="submit">Create reservation</button></div>
      </MutationForm>
      <div className="section-gap">
        {record.inventoryReservations.length ? <div className="table-wrap"><table><thead><tr><th>Purpose</th><th>Reserved</th><th>Remaining</th><th>State</th><th>Expiry</th><th>Action</th></tr></thead><tbody>{record.inventoryReservations.map((reservation) => <tr key={reservation.id}><td>{reservation.purpose}</td><td>{reservation.quantity}</td><td>{reservation.remaining_quantity}</td><td>{reservation.state.replaceAll('_', ' ')}</td><td>{reservation.expires_at ? formatDate(reservation.expires_at) : 'No expiry'}</td><td>{['active', 'partially_consumed'].includes(reservation.state) ? <MutationForm intent={`inventory.reservation.release:${reservation.id}`} action={releaseInventoryReservationAction}><input type="hidden" name="seedLotMaterialId" value={id} /><input type="hidden" name="reservationId" value={reservation.id} /><label className="sr-only" htmlFor={`release-${reservation.id}`}>Release reason</label><input id={`release-${reservation.id}`} name="reason" placeholder="Plan changed" minLength={3} required /><button className="button secondary" type="submit">Release</button></MutationForm> : 'Final'}</td></tr>)}</tbody></table></div> : <EmptyState title="No reservations">Create a reservation when seed is allocated to a planned grow-out but not yet planted.</EmptyState>}
      </div>
    </section>

    <section className="card section-gap">
      <h2>Request an inventory exception</h2>
      <p className="muted">Use only when a plant must be registered without exact physical consumption. A different owner or administrator must review the request before it can authorize planting.</p>
      <MutationForm intent="inventory.exception.request" className="form-grid" action={requestInventoryExceptionAction}>
        <input type="hidden" name="seedLotMaterialId" value={id} />
        <div className="field"><label htmlFor="exceptionQuantity">Quantity represented</label><input id="exceptionQuantity" name="quantity" type="number" min="1" required /></div>
        <div className="field full"><label htmlFor="exceptionReason">Scientific and operational reason</label><textarea id="exceptionReason" name="reason" minLength={20} rows={3} required /></div>
        <div className="full"><button className="button" type="submit">Submit for independent review</button></div>
      </MutationForm>
      <div className="section-gap">
        {record.inventoryExceptionRequests.length ? <div className="table-wrap"><table><thead><tr><th>Quantity</th><th>Reason</th><th>Requested by</th><th>Review</th><th>Use</th><th>Independent decision</th></tr></thead><tbody>{record.inventoryExceptionRequests.map((request) => <tr key={request.id}><td>{request.quantity}</td><td>{request.reason}</td><td>{request.requester_name}</td><td>{request.review_state.replaceAll('_', ' ')}{request.reviewer_name ? ` by ${request.reviewer_name}` : ''}</td><td>{request.used ? 'Consumed by plant record' : request.review_state === 'approved' ? 'Available' : 'Not authorized'}</td><td>{canReviewExceptions && request.review_state === 'in_review' ? <MutationForm intent={`inventory.exception.review:${request.id}`} action={reviewInventoryExceptionAction}><input type="hidden" name="seedLotMaterialId" value={id} /><input type="hidden" name="requestId" value={request.id} /><label className="sr-only" htmlFor={`decision-${request.id}`}>Decision</label><select id={`decision-${request.id}`} name="decision"><option value="approved">Approve</option><option value="changes_requested">Request changes</option><option value="rejected">Reject</option></select><label className="sr-only" htmlFor={`rationale-${request.id}`}>Review rationale</label><input id={`rationale-${request.id}`} name="rationale" minLength={10} placeholder="Independent rationale" required /><button className="button secondary" type="submit">Record decision</button></MutationForm> : request.review_rationale ?? '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="No exception requests">Exact inventory reconciliation is the default and preferred workflow.</EmptyState>}
      </div>
    </section>

    <section className="card section-gap">
      <h2>Immutable inventory history</h2>
      {record.inventoryEvents.length ? <div className="table-wrap"><table><thead><tr><th>When</th><th>Event</th><th>Change</th><th>Result</th><th>Reason</th></tr></thead><tbody>{record.inventoryEvents.map((event) => <tr key={event.id}><td>{formatDate(event.occurred_at)}</td><td>{event.event_type.replaceAll('_', ' ')}</td><td>{event.quantity_delta > 0 ? `+${event.quantity_delta}` : event.quantity_delta}</td><td>{event.running_quantity}</td><td>{event.reason}</td></tr>)}</tbody></table></div> : <EmptyState title="No inventory events">The quantity remains unknown until a receipt, count, or reconciliation establishes physical truth.</EmptyState>}
    </section>
    <p><Link className="inline-link" href={`/pedigrees/${id}`}>View complete pedigree and provenance</Link></p>
  </>;
}
