import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';
import { notFound } from 'next/navigation';
import { getCrossDetail } from '@capsicum/application';
import { DefinitionList, ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { formatDate, humanize, queryError, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';
import {
  harvestCrossAction,
  recordCrossEventAction,
  recordCrossVerificationAction,
  reviewCrossVerificationAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

const REVIEW_ROLES = new Set(['owner', 'administrator', 'scientific_reviewer']);

function derivedClass(method: unknown) {
  if (method === 'selfing') return 'selfed_progeny';
  if (method === 'open_pollination') return 'open_pollinated_progeny';
  return 'controlled_cross_progeny';
}

export default async function CrossDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const query = await searchParams;
  const record = await getCrossDetail(getDatabasePool(), principal, id) as
    | (Record<string, unknown> & {
        events?: Record<string, unknown>[];
        verifications?: Record<string, unknown>[];
      })
    | null;
  if (!record) notFound();

  const operationalState = text(record.operational_state ?? record.status);
  const verificationState = text(record.verification_state ?? 'unknown');
  const canReview = REVIEW_ROLES.has(principal.role);
  const progenyClass = derivedClass(record.pollination_method);
  const harvestAllowed = operationalState === 'fruit_set' || operationalState === 'harvest_ready';

  return <>
    <PageHeader
      eyebrow="Cross record"
      title={text(record.cross_code)}
      description="Directed parentage, operational lifecycle, independently reviewed identity verification, and harvest-derived progeny identity. Fruit set never verifies paternal identity."
    />
    <ErrorNotice message={queryError(query.error)} />
    <section className="card">
      <DefinitionList entries={[
        ['Seed parent (maternal)', text(record.maternal_code)],
        ['Pollen parent (paternal)', text(record.paternal_code ?? 'Unknown pollen source')],
        ['Pollination method', humanize(record.pollination_method)],
        ['Operational state', humanize(operationalState)],
        ['Verification state', humanize(verificationState)],
        ['Planned', formatDate(record.planned_at)],
        ['Created', formatDate(record.created_at)],
      ]} />
      <p className="muted section-gap">
        Operational state describes what happened in the breeding workflow. Verification state describes the strength of parentage evidence. They are intentionally independent.
      </p>
    </section>

    <div className="grid two section-gap">
      <section className="card">
        <h2>Operational event history</h2>
        {record.events?.length ? <ol className="timeline">
          {record.events.map((event) => <li key={String(event.id)}>
            <strong>{humanize(event.event_type)}</strong>
            <span>{formatDate(event.occurred_at)}</span>
            {event.notes ? <p>{text(event.notes)}</p> : null}
          </li>)}
        </ol> : <p className="muted">No events recorded.</p>}
      </section>
      <section className="card">
        <h2>Record operational event</h2>
        <MutationForm intent={`cross.event:${id}`} className="stack-form" action={recordCrossEventAction}>
          <input type="hidden" name="crossId" value={id} />
          <div className="field"><label htmlFor="eventType">Event</label><select id="eventType" name="eventType">
            <option value="prepared">Prepared or isolated</option>
            <option value="pollinated">Pollinated</option>
            <option value="bagged">Bagged</option>
            <option value="unbagged">Unbagged</option>
            <option value="fruit_set">Fruit set</option>
            <option value="harvest_ready">Harvest ready</option>
            <option value="failed">Failed</option>
            <option value="closed">Closed</option>
          </select></div>
          <div className="field"><label htmlFor="occurredAt">Occurred at</label><LocalDateTimeInput id="occurredAt" name="occurredAt" /></div>
          <div className="field"><label htmlFor="event-notes">Notes</label><textarea id="event-notes" name="notes" rows={3} /></div>
          <button className="button" type="submit">Record event</button>
        </MutationForm>
      </section>
    </div>

    <section className="card section-gap">
      <h2>Parentage and identity verification</h2>
      <p className="muted">Record evidence as a draft. A different authorized reviewer must approve it before it changes the cross verification state.</p>
      <div className="grid two section-gap">
        <MutationForm intent={`cross.verification:${id}`} className="stack-form" action={recordCrossVerificationAction}>
          <input type="hidden" name="crossId" value={id} />
          <div className="field"><label htmlFor="verificationState">Evidence conclusion</label><select id="verificationState" name="verificationState">
            <option value="process_documented">Process documented</option>
            <option value="isolation_evidence_recorded">Isolation evidence recorded</option>
            <option value="morphology_consistent_unconfirmed">Morphology consistent, unconfirmed</option>
            <option value="marker_confirmed">Marker confirmed</option>
            <option value="genotype_confirmed">Genotype confirmed</option>
            <option value="conflicting">Conflicting evidence</option>
            <option value="failed">Verification failed</option>
          </select></div>
          <div className="field"><label htmlFor="method">Verification method</label><select id="method" name="method">
            <option value="process_documentation">Process documentation</option>
            <option value="isolation_record">Isolation record</option>
            <option value="morphology">Morphology review</option>
            <option value="marker_assay">Marker assay</option>
            <option value="genotype_assay">Genotype assay</option>
            <option value="conflict_review">Conflict review</option>
            <option value="failure_review">Failure review</option>
          </select></div>
          <div className="field"><label htmlFor="sourceType">Evidence source type</label><select id="sourceType" name="sourceType">
            <option value="operator_record">Operator record</option>
            <option value="media">Media record</option>
            <option value="research_document">Research document</option>
            <option value="marker_result">Marker result</option>
            <option value="laboratory_result">Laboratory result</option>
            <option value="review">Prior review</option>
          </select></div>
          <div className="field"><label htmlFor="confidence">Confidence, 0 to 1</label><input id="confidence" name="confidence" type="number" min="0" max="1" step="0.01" /></div>
          <div className="field"><label htmlFor="evidenceEntityType">Referenced record type</label><input id="evidenceEntityType" name="evidenceEntityType" placeholder="laboratory_result" /></div>
          <div className="field"><label htmlFor="evidenceEntityId">Referenced record ID</label><input id="evidenceEntityId" name="evidenceEntityId" inputMode="text" /></div>
          <div className="field"><label htmlFor="recordedAt">Recorded at</label><LocalDateTimeInput id="recordedAt" name="recordedAt" /></div>
          <div className="field full"><label htmlFor="verification-notes">Evidence statement</label><textarea id="verification-notes" name="notes" rows={4} required /></div>
          <div className="full"><button className="button" type="submit">Submit verification evidence</button></div>
        </MutationForm>
        <div>
          <h3>Verification history</h3>
          {record.verifications?.length ? <ol className="timeline">
            {record.verifications.map((verification) => <li key={String(verification.id)}>
              <strong>{humanize(verification.verification_state)} · {humanize(verification.method)}</strong>
              <span>{formatDate(verification.recorded_at)} · review {humanize(verification.review_decision ?? 'pending')}</span>
              <p>{text(verification.statement)}</p>
              {canReview && !verification.review_decision ? <MutationForm intent={`cross.verification.review:${String(verification.id)}`} className="stack-form section-gap" action={reviewCrossVerificationAction}>
                <input type="hidden" name="crossId" value={id} />
                <input type="hidden" name="verificationId" value={String(verification.id)} />
                <div className="field"><label htmlFor={`decision-${String(verification.id)}`}>Decision</label><select id={`decision-${String(verification.id)}`} name="decision"><option value="approved">Approve</option><option value="changes_requested">Request changes</option><option value="rejected">Reject</option></select></div>
                <div className="field"><label htmlFor={`rationale-${String(verification.id)}`}>Independent-review rationale</label><textarea id={`rationale-${String(verification.id)}`} name="rationale" minLength={10} required /></div>
                <button className="button secondary" type="submit">Record review</button>
              </MutationForm> : null}
            </li>)}
          </ol> : <p className="muted">No verification evidence has been recorded.</p>}
        </div>
      </div>
    </section>

    <section className="card section-gap">
      <h2>Harvest fruit and establish derived progeny</h2>
      <p className="muted">
        This canonical transaction creates fruit, seed harvest, a derived breeding-material identity, seed lot, family, inventory, provenance, and the harvested event. It never assigns recombinant progeny to the maternal accession.
      </p>
      {!harvestAllowed ? <div className="notice">Record fruit set or harvest-ready state before harvesting. Verification is not required for harvest, but its current evidence state will remain visible.</div> : null}
      <MutationForm intent={`cross.harvest:${id}`} className="form-grid section-gap" action={harvestCrossAction}>
        <input type="hidden" name="crossId" value={id} />
        <input type="hidden" name="derivedMaterialClass" value={progenyClass} />
        <div className="field"><label htmlFor="fruitCode">Fruit code</label><input id="fruitCode" name="fruitCode" required /></div>
        <div className="field"><label htmlFor="harvestCode">Harvest code</label><input id="harvestCode" name="harvestCode" required /></div>
        <div className="field"><label htmlFor="derivedMaterialCode">Derived material code</label><input id="derivedMaterialCode" name="derivedMaterialCode" required /></div>
        <div className="field"><label htmlFor="derivedMaterialName">Derived material name</label><input id="derivedMaterialName" name="derivedMaterialName" placeholder={`${text(record.cross_code)} progeny`} required /></div>
        <div className="field"><label htmlFor="seedLotCode">Derived seed-lot code</label><input id="seedLotCode" name="seedLotCode" required /></div>
        <div className="field"><label htmlFor="familyCode">Family code</label><input id="familyCode" name="familyCode" required /></div>
        <div className="field"><label htmlFor="generationLabel">Generation</label><input id="generationLabel" name="generationLabel" defaultValue="F1" required /></div>
        <div className="field"><label htmlFor="seedQuantityEstimate">Seed estimate</label><input id="seedQuantityEstimate" name="seedQuantityEstimate" type="number" min="0" /></div>
        <div className="field"><label htmlFor="harvestedAt">Harvested at</label><LocalDateTimeInput id="harvestedAt" name="harvestedAt" /></div>
        <div className="full"><button className="button" type="submit" disabled={!harvestAllowed}>Create harvest lineage</button></div>
      </MutationForm>
    </section>
  </>;
}
