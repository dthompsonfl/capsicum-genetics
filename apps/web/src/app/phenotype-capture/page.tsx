import type { Metadata } from 'next';
import Link from 'next/link';
import {
  listApprovedCaptureProtocols,
  listMaterials,
  listMediaObjects,
  listPhenotypeCaptures,
} from '@capsicum/application';
import { EmptyState, ErrorNotice, PageHeader } from '../../components/page-primitives';
import { getDatabasePool } from '../../lib/database';
import { formatDate, humanize, queryError, text } from '../../lib/presentation';
import { requirePrincipal } from '../../lib/session';
import { PhenotypeCaptureForm, type PhenotypeMediaOption, type PhenotypeProtocolOption } from '../../components/phenotype-capture-form';

export const metadata: Metadata = { title: 'Phenotype capture' };
export const dynamic = 'force-dynamic';

export default async function PhenotypeCapturePage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const [protocols, media, materials, captures] = await Promise.all([
    listApprovedCaptureProtocols(pool, principal),
    listMediaObjects(pool, principal),
    listMaterials(pool, principal, undefined, 100),
    listPhenotypeCaptures(pool, principal, 100),
  ]);
  const params = await searchParams;
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const eligibleMedia = media.filter((record) => record.upload_state === 'complete'
    && typeof record.mime_type === 'string'
    && record.mime_type.startsWith('image/')
    && typeof record.entity_id === 'string');
  return (
    <>
      <PageHeader
        eyebrow="Controlled observations"
        title="Phenotype capture"
        description="Bind an inspected immutable image to an independently approved capture protocol. The deterministic quality gate records resolution, view, calibration references, blur status, and actionable rejection reasons."
        action={{ href: '/phenotypes/images', label: 'Upload source image' }}
      />
      <ErrorNotice message={queryError(params.error)} />
      <div className="grid two section-gap">
        <section className="card">
          <h2>Create governed capture</h2>
          {!protocols.length ? (
            <div className="notice">
              No capture protocol is independently approved. Images may be stored safely, but they cannot become protocol-governed phenotype captures until a curator authors a protocol and a different scientific reviewer approves it.
            </div>
          ) : !eligibleMedia.length ? (
            <EmptyState title="Upload an image first" action={{ href: '/phenotypes/images', label: 'Open media library' }}>
              Completed JPEG, PNG, or WebP images attached to a biological material are eligible for capture registration.
            </EmptyState>
          ) : (
            <PhenotypeCaptureForm
              media={eligibleMedia.map((record): PhenotypeMediaOption => {
                const materialId = String(record.entity_id);
                return {
                  id: text(record.id),
                  fileName: text(record.original_file_name),
                  materialId,
                  materialCode: materialById.get(materialId)?.materialCode ?? materialId,
                };
              })}
              protocols={protocols.map((protocol): PhenotypeProtocolOption => {
                const contract = protocol.contract && typeof protocol.contract === 'object' && !Array.isArray(protocol.contract)
                  ? protocol.contract as Record<string, unknown>
                  : {};
                const requiredViews = Array.isArray(contract.requiredViews)
                  ? contract.requiredViews.filter((view): view is string => typeof view === 'string' && view.trim().length > 0)
                  : [];
                return {
                  id: text(protocol.id),
                  label: `${text(protocol.protocol_key)} · version ${text(protocol.version)}`,
                  requiredViews,
                  requiresScaleReference: contract.requiresScaleReference === true,
                  requiresColorReference: contract.requiresColorReference === true,
                };
              })}
            />
          )}
        </section>
        <section className="card">
          <h2>Authority boundary</h2>
          <ul className="list">
            <li>File signature, byte size, image dimensions, malware result, workspace ownership, and protocol approval are validated server-side; machine facts cannot be operator-entered.</li>
            <li>Rejected captures remain auditable; quality failures are not silently repaired or overwritten.</li>
            <li>Annotations are append-only and corrections supersede a prior annotation.</li>
            <li>Images and deterministic measurements do not establish genotype, pungency, disease resistance, flavor, yield, or breeding value.</li>
            <li>Learned vision stays unavailable until a model version has a dataset hash, model card, independent evaluation, and governed promotion.</li>
          </ul>
        </section>
      </div>
      <section className="card section-gap">
        <h2>Capture history</h2>
        {captures.length ? <div className="table-wrap"><table>
          <thead><tr><th>Captured</th><th>Material</th><th>Protocol</th><th>View</th><th>Quality</th><th>Annotations</th></tr></thead>
          <tbody>{captures.map((capture) => <tr key={text(capture.id)}>
            <td>{formatDate(capture.captured_at)}</td>
            <td><Link href={`/phenotype-capture/${text(capture.id)}`}>{text(capture.material_code)}</Link></td>
            <td>{text(capture.protocol_key)} v{text(capture.protocol_version)}</td>
            <td>{text(capture.view_name)}</td>
            <td><span className={`badge ${capture.quality_state === 'accepted' ? 'exact' : 'warning'}`}>{humanize(capture.quality_state)}</span></td>
            <td>{text(capture.annotation_count, '0')}</td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">No governed captures have been recorded.</p>}
      </section>
    </>
  );
}
