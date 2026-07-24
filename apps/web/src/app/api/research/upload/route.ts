import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  createResearchDocumentIngestion,
  enforceOperationAdmission,
  failPendingObjectUpload,
  markPendingObjectStored,
  registerPendingObjectUpload,
} from '@capsicum/application';
import { buildImmutableObjectKey, putImmutableFile } from '@capsicum/storage';
import { assertUtf8TextFile, decodedUploadHeader, persistBoundedRequestBody, type TemporaryUpload } from '../../../../lib/bounded-upload';
import { getDatabasePool } from '../../../../lib/database';
import { getOptionalPrincipal } from '../../../../lib/session';
import { assertSameOrigin, getObjectStorageConfig } from '../../../../lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const MAX_RESEARCH_SOURCE_BYTES = 10 * 1024 * 1024;
const allowedMedia = new Map<string, { mediaType: 'text/plain' | 'text/markdown'; extension: 'txt' | 'md' }>([
  ['text/plain', { mediaType: 'text/plain', extension: 'txt' }],
  ['text/markdown', { mediaType: 'text/markdown', extension: 'md' }],
  ['text/x-markdown', { mediaType: 'text/markdown', extension: 'md' }],
]);

export async function POST(request: Request): Promise<Response> {
  const principal = await getOptionalPrincipal();
  if (!principal) return NextResponse.redirect(new URL('/sign-in', request.url), 303);
  const pool = getDatabasePool();
  let pendingUploadId: string | undefined;
  let objectPersisted = false;
  let temporary: TemporaryUpload | undefined;
  try {
    assertSameOrigin(request);
    await enforceOperationAdmission(pool, principal, { scope: 'research.upload', limit: 12, windowSeconds: 3600 });
    const clientRequestId = decodedUploadHeader(request, 'x-capsicum-client-request-id', 200);
    const title = decodedUploadHeader(request, 'x-capsicum-title', 300);
    const sourceLocator = decodedUploadHeader(request, 'x-capsicum-source-locator', 2_000);
    const documentVersion = decodedUploadHeader(request, 'x-capsicum-document-version', 120);
    const fileName = decodedUploadHeader(request, 'x-capsicum-file-name', 500);
    const declaredMediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim() || 'text/plain';
    const media = allowedMedia.get(declaredMediaType);
    if (!media) throw new TypeError('Only UTF-8 plain text and Markdown sources are supported.');

    temporary = await persistBoundedRequestBody(request, MAX_RESEARCH_SOURCE_BYTES);
    await assertUtf8TextFile(temporary.filePath);
    const objectKey = buildImmutableObjectKey({
      workspaceId: principal.workspaceId, entityType: 'research-sources', entityId: clientRequestId,
      sourceSha256: temporary.sha256, extension: media.extension,
    });
    pendingUploadId = (await registerPendingObjectUpload(pool, principal, {
      purpose: 'research_source', clientRequestId, objectKey, sourceSha256: temporary.sha256,
      byteLength: temporary.byteLength, mediaType: media.mediaType,
    })).pendingUploadId;
    await putImmutableFile(getObjectStorageConfig(), objectKey, temporary.filePath, `${media.mediaType}; charset=utf-8`);
    objectPersisted = true;
    await markPendingObjectStored(pool, principal, pendingUploadId);
    const result = await createResearchDocumentIngestion(pool, principal, {
      schemaVersion: '1.0',
      title, sourceLocator, documentVersion, objectKey, sourceSha256: temporary.sha256,
      byteLength: temporary.byteLength, mediaType: media.mediaType, fileName, clientRequestId,
      traceId: request.headers.get('x-request-id')?.slice(0, 200) || randomUUID(), pendingUploadId,
    });
    const destination = new URL(`/research/sources/${result.documentId}`, request.url);
    destination.searchParams.set('queued', '1');
    destination.searchParams.set('completedRequestId', clientRequestId);
    return NextResponse.redirect(destination, 303);
  } catch (error) {
    if (pendingUploadId) await failPendingObjectUpload(pool, principal, pendingUploadId, objectPersisted, error).catch(() => undefined);
    const destination = new URL('/research', request.url);
    destination.searchParams.set('error', 'research_upload_rejected');
    return NextResponse.redirect(destination, 303);
  } finally {
    await temporary?.cleanup().catch(() => undefined);
  }
}
