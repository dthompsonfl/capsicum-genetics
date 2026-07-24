import { listMaterials, listMediaObjects } from '@capsicum/application';
import Image from 'next/image';
import Link from 'next/link';
import { EmptyState, ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { StreamingMediaUploadForm } from '../../../components/streaming-media-upload-form';
import { getDatabasePool } from '../../../lib/database';
import { formatDate, humanize, queryError, text } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';

function positiveDimension(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const query = await searchParams;
  const [records, plants, seedLots, families, fruits] = await Promise.all([
    listMediaObjects(pool, principal),
    listMaterials(pool, principal, 'plant'),
    listMaterials(pool, principal, 'seed_lot'),
    listMaterials(pool, principal, 'progeny_family'),
    listMaterials(pool, principal, 'fruit'),
  ]);
  const options = [
    ...plants.map((record) => ({ ...record, entityType: 'plant' })),
    ...seedLots.map((record) => ({ ...record, entityType: 'seed_lot' })),
    ...families.map((record) => ({ ...record, entityType: 'progeny_family' })),
    ...fruits.map((record) => ({ ...record, entityType: 'fruit' })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Media evidence"
        title="Phenotype media"
        description="Private content-addressed images with signature verification, decoded dimension limits, workspace authorization, and immutable object keys."
      />
      <ErrorNotice message={queryError(query.error)} />
      <div className="notice">
        Uploads remain quarantined until an isolated worker validates their bytes. Media is evidence,
        not a phenotype prediction. No capture protocol or learned model is approved in the bundled
        catalog.
      </div>
      <section className="card section-gap">
        <h2>Upload image evidence</h2>
        {process.env.S3_ENDPOINT && options.length ? (
          <StreamingMediaUploadForm
            options={options.map((record) => ({
              value: `${record.entityType}:${record.id}`,
              label: `${humanize(record.entityType)} · ${record.materialCode}`,
            }))}
          />
        ) : (
          <p className="muted">
            Configure S3_ENDPOINT and create a plant, seed lot, fruit, or family before uploading
            media.
          </p>
        )}
      </section>
      <section className="section-gap">
        {records.length ? (
          <div className="media-grid">
            {records.map((record: Record<string, unknown>) => {
              const mediaId = String(record.id);
              const width = positiveDimension(record.pixel_width, 640);
              const height = positiveDimension(record.pixel_height, 480);
              return (
                <article className="card" key={mediaId}>
                  {record.upload_state === 'complete' &&
                  String(record.mime_type).startsWith('image/') ? (
                    <Image
                      unoptimized
                      className="media-thumbnail"
                      src={`/api/media/${mediaId}`}
                      width={width}
                      height={height}
                      sizes="(max-width: 650px) 100vw, (max-width: 1100px) 50vw, 33vw"
                      alt={`Evidence attached to ${text(record.entity_type)} ${text(record.entity_id)}`}
                    />
                  ) : (
                    <div className="media-placeholder">{humanize(record.upload_state)}</div>
                  )}
                  <h2>
                    <Link className="inline-link" href={`/phenotypes/images/${mediaId}`}>
                      {text(record.original_file_name)}
                    </Link>
                  </h2>
                  <p className="muted">
                    {humanize(record.entity_type)} · {text(record.pixel_width)} ×{' '}
                    {text(record.pixel_height)} · {formatDate(record.created_at)}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No media evidence">
            Uploaded files remain private and are served only after session and workspace
            authorization.
          </EmptyState>
        )}
      </section>
    </>
  );
}
