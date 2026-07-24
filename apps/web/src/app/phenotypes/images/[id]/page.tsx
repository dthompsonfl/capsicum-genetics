import { getMediaObject, listMediaDerivatives } from '@capsicum/application';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { DefinitionList, PageHeader } from '../../../../components/page-primitives';
import { getDatabasePool } from '../../../../lib/database';
import { formatDate, humanize, text } from '../../../../lib/presentation';
import { requirePrincipal } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

function positiveDimension(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const pool = getDatabasePool();
  const [record, derivatives] = await Promise.all([
    getMediaObject(pool, principal, id) as Promise<Record<string, unknown> | null>,
    listMediaDerivatives(pool, principal, id),
  ]);

  if (!record) notFound();

  const analysisDerivative = derivatives.find(
    (item) => item.derivative_type === 'analysis_ready',
  );
  const imageSource = analysisDerivative
    ? `/api/media/${id}/derivative/analysis_ready`
    : `/api/media/${id}`;
  const imageWidth = positiveDimension(
    analysisDerivative?.width_px ?? record.pixel_width,
    1_200,
  );
  const imageHeight = positiveDimension(
    analysisDerivative?.height_px ?? record.pixel_height,
    800,
  );

  return (
    <>
      <PageHeader
        eyebrow="Media evidence"
        title={text(record.original_file_name)}
        description="Workspace-private immutable content with isolated inspection, deterministic derivatives, source checksum, and explicit processing authority."
      />
      {record.upload_state === 'complete' && String(record.mime_type).startsWith('image/') ? (
        <Image
          unoptimized
          className="media-detail"
          src={imageSource}
          width={imageWidth}
          height={imageHeight}
          sizes="(max-width: 1000px) 100vw, 1100px"
          alt={`Evidence attached to ${text(record.entity_type)} ${text(record.entity_id)}`}
        />
      ) : (
        <div className="notice">
          This object is {humanize(record.upload_state)} and cannot be rendered.
        </div>
      )}
      <section className="card section-gap">
        <DefinitionList
          entries={[
            ['Entity', `${humanize(record.entity_type)} · ${text(record.entity_id)}`],
            ['MIME type', text(record.mime_type)],
            ['Dimensions', `${text(record.pixel_width)} × ${text(record.pixel_height)}`],
            ['Bytes', Number(record.byte_length ?? 0).toLocaleString()],
            [
              'SHA-256',
              <span className="mono wrap" key="hash">
                {text(record.source_sha256)}
              </span>,
            ],
            ['Upload state', humanize(record.upload_state)],
            [
              'Inspection',
              humanize(record.latest_inspection_state ?? record.inspection_state),
            ],
            ['Created', formatDate(record.created_at)],
          ]}
        />
      </section>
      <section className="card section-gap">
        <h2>Deterministic derivatives</h2>
        {derivatives.length ? (
          <div className="grid two">
            {derivatives.map((item) => (
              <article className="record-card" key={text(item.id)}>
                <div>
                  <strong>{humanize(item.derivative_type)}</strong>
                  <br />
                  <span className="muted">
                    {text(item.width_px)} × {text(item.height_px)} · {text(item.algorithm_name)} ·{' '}
                    {text(item.algorithm_version)}
                  </span>
                </div>
                <a
                  className="button secondary"
                  href={`/api/media/${id}/derivative/${text(item.derivative_type)}`}
                >
                  Open derivative
                </a>
                <p className="mono wrap compact">{text(item.result_sha256)}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">
            Derivative processing is queued after a clean accepted inspection. Missing derivatives
            do not make the original source authoritative phenotype evidence.
          </p>
        )}
      </section>
    </>
  );
}
