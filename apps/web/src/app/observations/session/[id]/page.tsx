import { notFound } from 'next/navigation';
import { getObservationSession, listMaterials, listObservationDefinitions, listObservationInputOptions } from '@capsicum/application';
import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';
import { DefinitionList, ErrorNotice, PageHeader } from '../../../../components/page-primitives';
import { formatDate, humanize, queryError, text } from '../../../../lib/presentation';
import { getDatabasePool } from '../../../../lib/database';
import { requirePrincipal } from '../../../../lib/session';
import { recordObservationAction, transitionObservationSessionAction } from '../../../actions';

export const dynamic = 'force-dynamic';

function transitionsFor(state: string) {
  if (state === 'planned') return ['open'];
  if (state === 'open' || state === 'reopened') return ['pause', 'close', 'cancel'];
  if (state === 'paused') return ['resume', 'close', 'cancel'];
  if (state === 'closed') return ['reopen'];
  return [];
}

export default async function ObservationSessionPage({
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
  const [session, materials, definitions, options] = await Promise.all([
    getObservationSession(pool, principal, id),
    listMaterials(pool, principal),
    listObservationDefinitions(pool, true),
    listObservationInputOptions(pool),
  ]) as [
    (Record<string, unknown> & { observations?: Record<string, unknown>[] }) | null,
    Awaited<ReturnType<typeof listMaterials>>,
    Record<string, unknown>[],
    Awaited<ReturnType<typeof listObservationInputOptions>>,
  ];
  if (!session) notFound();

  const state = text(session.state);
  const stateVersion = Number(session.state_version ?? 1);
  const availableTransitions = transitionsFor(state);
  const writable = state === 'open' || state === 'reopened';
  const methods = options.methods as Record<string, unknown>[];
  const units = options.units as Record<string, unknown>[];
  const vocabularies = options.vocabularies as Record<string, unknown>[];
  const terms = options.terms as Record<string, unknown>[];
  const qualityTerms = options.qualityTerms as Record<string, unknown>[];
  const deviceSchemas = options.deviceSchemas as Record<string, unknown>[];

  return <>
    <PageHeader eyebrow="Observation session" title={text(session.experiment_code)} description={`Structured capture for ${text(session.experiment_name)}. Authoritative values are accepted only when the definition, protocol, method, unit, vocabulary, quality terms, and device schema are approved and mutually applicable.`} />
    <ErrorNotice message={queryError(query.error)} />
    <section className="card">
      <DefinitionList entries={[
        ['State', humanize(state)],
        ['State version', String(stateVersion)],
        ['Governed protocol', `${text(session.governed_protocol_key ?? session.protocol_key)} · v${text(session.governed_protocol_version ?? session.protocol_version)}`],
        ['Opened', formatDate(session.opened_at)],
        ['Closed', formatDate(session.closed_at)],
      ]} />
      {availableTransitions.length ? <MutationForm intent={`observation.session.transition:${id}`} className="inline-form section-gap" action={transitionObservationSessionAction}>
        <input type="hidden" name="sessionId" value={id} />
        <input type="hidden" name="expectedStateVersion" value={stateVersion} />
        <div className="field"><label htmlFor="transition">Session action</label><select id="transition" name="transition">{availableTransitions.map((transition) => <option key={transition} value={transition}>{humanize(transition)}</option>)}</select></div>
        <div className="field"><label htmlFor="transition-reason">Reason</label><input id="transition-reason" name="reason" placeholder="Required for reopen or cancellation" /></div>
        <button className="button secondary" type="submit">Apply session action</button>
      </MutationForm> : <p className="muted section-gap">This session has no available transitions.</p>}
    </section>

    <section className="card section-gap">
      <h2>Record observation</h2>
      <div className="notice">Use <strong>research draft</strong> when any premise is exploratory or unapproved. Selecting “authoritative” does not bypass validation; the service and PostgreSQL independently verify every exact dependency version.</div>
      <MutationForm intent={`observation.record:${id}`} className="form-grid section-gap" action={recordObservationAction}>
        <input type="hidden" name="sessionId" value={id} />
        <div className="field"><label htmlFor="materialId">Biological material</label><select id="materialId" name="materialId" required>{materials.map((material) => <option key={material.id} value={material.id}>{material.materialCode} · {humanize(material.kind)}</option>)}</select></div>
        <div className="field"><label htmlFor="authority">Data authority</label><select id="authority" name="authority"><option value="research_draft">Research draft</option><option value="authoritative" disabled={!definitions.length}>Authoritative reviewed data</option></select></div>
        <div className="field full"><label htmlFor="definitionId">Approved trait definition version</label><select id="definitionId" name="definitionId" required><option value="">Select exact definition</option>{definitions.map((definition) => <option key={String(definition.id)} value={String(definition.id)}>{text(definition.display_name)} · v{text(definition.trait_version)} · {text(definition.method_display_name)} · protocol {text(definition.protocol_key)} v{text(definition.protocol_version)}</option>)}</select></div>
        <div className="field"><label htmlFor="valueType">Value type</label><select id="valueType" name="valueType"><option value="number">Number</option><option value="text">Text</option><option value="boolean">Boolean</option><option value="category">Controlled category</option><option value="missing">Missing value</option></select></div>
        <div className="field"><label htmlFor="value">Value or approved missing reason</label><input id="value" name="value" required /></div>
        <div className="field"><label htmlFor="unitId">Approved unit version</label><select id="unitId" name="unitId"><option value="">Not applicable / draft text unit</option>{units.map((unit) => <option key={String(unit.id)} value={String(unit.id)}>{text(unit.symbol)} · {text(unit.dimension)} · v{text(unit.unit_version)}</option>)}</select></div>
        <div className="field"><label htmlFor="unit">Draft unit text</label><input id="unit" name="unit" aria-describedby="draft-unit-help" /><small id="draft-unit-help">Used only for lower-authority draft values.</small></div>
        <div className="field"><label htmlFor="vocabularyVersionId">Approved vocabulary version</label><select id="vocabularyVersionId" name="vocabularyVersionId"><option value="">Not applicable</option>{vocabularies.map((vocabulary) => <option key={String(vocabulary.id)} value={String(vocabulary.id)}>{text(vocabulary.title)} · v{text(vocabulary.vocabulary_version)}</option>)}</select></div>
        <div className="field"><label htmlFor="termId">Approved controlled term</label><select id="termId" name="termId"><option value="">Not applicable</option>{terms.map((term) => <option key={String(term.id)} value={String(term.id)}>{text(term.label)} · {text(term.term_key)}</option>)}</select></div>
        <div className="field"><label htmlFor="methodRecordId">Approved method version</label><select id="methodRecordId" name="methodRecordId"><option value="">Use explicit draft method below</option>{methods.map((method) => <option key={String(method.id)} value={String(method.id)}>{text(method.display_name)} · {text(method.method_key)} v{text(method.method_version)}</option>)}</select></div>
        <div className="field"><label htmlFor="methodId">Draft method identifier</label><input id="methodId" name="methodId" /></div>
        <div className="field"><label htmlFor="methodVersion">Draft method version</label><input id="methodVersion" name="methodVersion" /></div>
        <div className="field full"><label htmlFor="qualityTermIds">Reviewed quality-control terms</label><select id="qualityTermIds" name="qualityTermIds" multiple size={Math.min(6, Math.max(2, qualityTerms.length))}>{qualityTerms.map((quality) => <option key={String(quality.id)} value={String(quality.id)}>{humanize(quality.severity)} · {text(quality.display_name)} · v{text(quality.quality_version)}</option>)}</select><small>Use Ctrl/Command to select more than one. Definition applicability is checked on save.</small></div>
        <div className="field"><label htmlFor="deviceSchemaId">Approved device-provenance schema</label><select id="deviceSchemaId" name="deviceSchemaId"><option value="">No device provenance</option>{deviceSchemas.map((schema) => <option key={String(schema.id)} value={String(schema.id)}>{text(schema.display_name)} · v{text(schema.schema_version)}</option>)}</select></div>
        <div className="field full"><label htmlFor="deviceProvenance">Device provenance JSON</label><textarea id="deviceProvenance" name="deviceProvenance" rows={3} placeholder='{"deviceId":"scale-01","calibrationDate":"2026-07-22"}' /></div>
        <div className="field"><label htmlFor="observedAt">Observed at</label><LocalDateTimeInput id="observedAt" name="observedAt" /></div>
        <div className="full"><button className="button" type="submit" disabled={!writable || !definitions.length}>Record immutable observation</button></div>
      </MutationForm>
      {!writable ? <p className="error" role="status">Open or reopen the session before recording data.</p> : null}
      {!definitions.length ? <p className="error" role="status">No approved observation definition exists for governed capture.</p> : null}
    </section>

    <section className="card section-gap">
      <h2>Current observations</h2>
      {session.observations?.length ? <div className="table-wrap"><table><thead><tr><th>Material</th><th>Trait</th><th>Authority</th><th>Method</th><th>Version</th><th>Value</th><th>Quality</th><th>Observed</th><th>Correction</th></tr></thead><tbody>{session.observations.map((observation) => <tr key={String(observation.revision_id)}><td>{text(observation.material_code)}</td><td>{text(observation.display_name)}</td><td>{humanize(observation.authority)}</td><td>{text(observation.method_display_name ?? observation.method_key)} · v{text(observation.method_version)}</td><td>{text(observation.revision_number)}</td><td><pre className="json compact-json">{JSON.stringify(observation.value_payload)}</pre></td><td><pre className="json compact-json">{JSON.stringify(observation.quality_terms)}</pre></td><td>{formatDate(observation.observed_at)}</td><td>{text(observation.correction_reason)}</td></tr>)}</tbody></table></div> : <p className="muted">No observations have been recorded in this session.</p>}
    </section>
  </>;
}
