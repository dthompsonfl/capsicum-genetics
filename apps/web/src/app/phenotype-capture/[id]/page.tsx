import { MutationForm } from '@/components/mutation-form';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPhenotypeCapture } from '@capsicum/application';
import { hasPermission } from '@capsicum/auth';
import { DefinitionList, ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { correctPhenotypeMeasurementAction, createPhenotypeAnnotationAction } from '../../actions';
import { getDatabasePool } from '../../../lib/database';
import { formatDate, humanize, queryError, text } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';

export const metadata: Metadata = { title: 'Phenotype capture record' };
export const dynamic = 'force-dynamic';

export default async function PhenotypeCaptureDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[]; saved?: string }>;
}) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const record = await getPhenotypeCapture(getDatabasePool(), principal, id);
  if (!record) notFound();
  const capture = record.capture as Record<string, unknown>;
  const annotations = record.annotations as readonly Record<string, unknown>[];
  const measurements = record.measurements as readonly Record<string, unknown>[];
  const measurementRevisions = record.measurementRevisions as readonly Record<string, unknown>[];
  const canCorrectMeasurements = hasPermission(principal.role, 'observation.write');
  const query = await searchParams;
  return (
    <>
      <PageHeader
        eyebrow="Immutable capture"
        title={`${text(capture.material_code)} · ${text(capture.view_name)}`}
        description="The source object, approved protocol version, deterministic quality result, capture metadata, actor, and time are preserved as one scientific record."
        action={{ href: `/api/media/${text(capture.media_object_id)}`, label: 'Open source image' }}
      />
      <ErrorNotice message={queryError(query.error)} />
      {query.saved ? <div className="notice">{query.saved === 'measurement' ? 'Measurement correction recorded as a new immutable revision.' : 'Annotation revision recorded.'}</div> : null}
      <div className="grid two section-gap">
        <section className="card">
          <h2>Capture provenance</h2>
          <DefinitionList entries={[
            ['Quality', <span className={`badge ${capture.quality_state === 'accepted' ? 'exact' : 'warning'}`}>{humanize(capture.quality_state)}</span>],
            ['Protocol', `${text(capture.protocol_key)} v${text(capture.protocol_version)}`],
            ['Captured', formatDate(capture.captured_at)],
            ['Media object', <Link href={`/phenotypes/images/${text(capture.media_object_id)}`}>{text(capture.original_file_name)}</Link>],
            ['Metadata', <pre>{JSON.stringify(capture.capture_metadata, null, 2)}</pre>],
            ['Quality detail', <pre>{JSON.stringify(capture.quality_detail, null, 2)}</pre>],
          ]} />
        </section>
        <section className="card">
          <h2>Add annotation or correction</h2>
          <MutationForm intent="phenotype.annotation" action={createPhenotypeAnnotationAction} className="form-grid">
            <input type="hidden" name="captureId" value={id} />
            <label className="field"><span>Type</span><select name="annotationType" defaultValue="measurement" required>
              <option value="point">Point</option><option value="line">Line</option><option value="polygon">Polygon</option><option value="bounding_box">Bounding box</option><option value="measurement">Measurement</option>
            </select></label>
            <label className="field"><span>Label</span><input name="label" required maxLength={250} placeholder="Fruit longitudinal axis" /></label>
            <label className="field"><span>Geometry JSON</span><textarea name="geometry" required rows={6} defaultValue={'{"x1":0,"y1":0,"x2":100,"y2":0,"units":"pixels"}'} /></label>
            <label className="field"><span>Supersedes annotation (optional)</span><select name="supersedesAnnotationId" defaultValue=""><option value="">New annotation</option>{annotations.filter((annotation) => annotation.is_current === true).map((annotation) => <option key={text(annotation.id)} value={text(annotation.id)}>{text(annotation.label)} · revision {text(annotation.revision)}</option>)}</select></label>
            <label className="field"><span>Correction reason</span><textarea name="correctionReason" rows={3} placeholder="Required when correcting an existing annotation" /></label>
            <button className="button" type="submit">Record append-only annotation</button>
          </MutationForm>
          <p className="muted compact">A correction creates a new row. Existing annotation geometry is never edited or deleted.</p>
        </section>
      </div>
      <section className="card section-gap">
        <h2>Deterministic machine-observable measurements</h2>
        <p className="muted">These records describe image bytes and capture quality only. They are not fruit-trait, disease, flavor, yield, or genotype predictions.</p>
        {measurements.length ? <div className="stack">{measurements.map((measurement) => {
          const history = measurementRevisions.filter((revision) => revision.measurement_id === measurement.id);
          return <article className="record-card" key={text(measurement.id)}>
            <div className="record-card-header"><div><strong>{humanize(measurement.measurement_key)}</strong><br /><span className="muted compact">{text(measurement.algorithm_name)} · {text(measurement.algorithm_version)} · current revision {text(measurement.revision)}</span></div><span className="badge exact">Machine-observed</span></div>
            <pre>{JSON.stringify(measurement.value_payload, null, 2)}</pre>
            {canCorrectMeasurements && measurement.current_revision_id ? <details>
              <summary>Record a human correction</summary>
              <MutationForm intent={`phenotype.measurement.correct.${text(measurement.id)}`} action={correctPhenotypeMeasurementAction} className="form-grid section-gap">
                <input type="hidden" name="captureId" value={id} />
                <input type="hidden" name="measurementId" value={text(measurement.id)} />
                <input type="hidden" name="expectedCurrentRevisionId" value={text(measurement.current_revision_id)} />
                <label className="field"><span>Corrected value JSON</span><textarea name="valuePayload" rows={7} required defaultValue={JSON.stringify(measurement.value_payload, null, 2)} /></label>
                <label className="field"><span>Scientific correction reason</span><textarea name="reason" rows={4} required minLength={10} maxLength={4000} placeholder="Explain the observable error and why this corrected value is justified." /></label>
                <button className="button" type="submit">Append corrected revision</button>
              </MutationForm>
              <p className="muted compact">The original machine result remains immutable. This creates a linear human-authored revision and never retrains or promotes a model.</p>
            </details> : null}
            <details><summary>Revision history ({history.length})</summary><div className="stack section-gap">{history.map((revision) => <div className="card" key={text(revision.id)}><strong>Revision {text(revision.revision)}</strong> · {formatDate(revision.corrected_at)} · {text(revision.corrected_by_name)}<p className="muted compact">{text(revision.reason)}</p><pre>{JSON.stringify(revision.value_payload, null, 2)}</pre></div>)}</div></details>
          </article>;
        })}</div> : <p className="muted">Machine-observable measurement work is queued durably after capture creation.</p>}
      </section>
      <section className="card section-gap">
        <h2>Annotation history</h2>
        {annotations.length ? <div className="stack">{annotations.map((annotation) => <article className="record-card" key={text(annotation.id)}>
          <div><strong>{text(annotation.label)}</strong><br /><span className="muted">{humanize(annotation.annotation_type)} · revision {text(annotation.revision)} · {formatDate(annotation.created_at)} · {text(annotation.created_by_name)}</span></div>
          <pre>{JSON.stringify(annotation.geometry, null, 2)}</pre>
        </article>)}</div> : <p className="muted">No annotations recorded.</p>}
      </section>
    </>
  );
}
