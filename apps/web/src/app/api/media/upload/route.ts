import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  createQuarantinedMediaObject,
  enforceOperationAdmission,
  failPendingObjectUpload,
  markPendingObjectStored,
  registerPendingObjectUpload,
  rejectQuarantinedMediaObject,
  type MediaEntityType,
} from '@capsicum/application';
import { buildImmutableObjectKey, inspectUploadFile, MAX_UPLOAD_BYTES, putImmutableFile } from '@capsicum/storage';
import { decodedUploadHeader, persistBoundedRequestBody, type TemporaryUpload } from '../../../../lib/bounded-upload';
import { getDatabasePool } from '../../../../lib/database';
import { getOptionalPrincipal } from '../../../../lib/session';
import { assertSameOrigin, getObjectStorageConfig } from '../../../../lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const principal = await getOptionalPrincipal();
  if (!principal) return NextResponse.redirect(new URL('/sign-in', request.url), 303);
  const pool = getDatabasePool();
  let mediaId: string | undefined;
  let pendingUploadId: string | undefined;
  let objectPersisted = false;
  let temporary: TemporaryUpload | undefined;
  try {
    assertSameOrigin(request);
    await enforceOperationAdmission(pool, principal, { scope: 'media.upload', limit: 30, windowSeconds: 3600 });
    const entityKey = decodedUploadHeader(request, 'x-capsicum-entity-key', 500);
    const clientRequestId = decodedUploadHeader(request, 'x-capsicum-client-request-id', 200);
    const fileName = decodedUploadHeader(request, 'x-capsicum-file-name', 500);
    const declaredMimeType = request.headers.get('content-type')?.split(';', 1)[0]?.trim() || 'application/octet-stream';
    const separator = entityKey.indexOf(':');
    if (separator < 1) throw new TypeError('Entity selection is invalid.');
    const entityType = entityKey.slice(0, separator) as MediaEntityType;
    const entityId = entityKey.slice(separator + 1);

    temporary = await persistBoundedRequestBody(request, MAX_UPLOAD_BYTES);
    const upload = await inspectUploadFile(temporary.filePath, declaredMimeType === 'application/octet-stream' ? undefined : declaredMimeType);
    if (upload.sourceSha256 !== temporary.sha256 || upload.byteLength !== temporary.byteLength) throw new Error('Upload changed during bounded persistence.');
    if (entityType !== 'research_document' && upload.mimeType === 'application/pdf') throw new TypeError('PDF files may only be attached to research documents.');
    const objectKey = buildImmutableObjectKey({
      workspaceId: principal.workspaceId,
      entityType: 'quarantine',
      entityId,
      sourceSha256: upload.sourceSha256,
      extension: upload.extension,
    });
    pendingUploadId = (await registerPendingObjectUpload(pool, principal, {
      purpose: 'media_upload', clientRequestId, objectKey,
      sourceSha256: upload.sourceSha256, byteLength: upload.byteLength, mediaType: upload.mimeType,
    })).pendingUploadId;
    await putImmutableFile(getObjectStorageConfig(), objectKey, temporary.filePath, upload.mimeType);
    objectPersisted = true;
    await markPendingObjectStored(pool, principal, pendingUploadId);
    const queued = await createQuarantinedMediaObject(pool, principal, {
      entityType, entityId, fileName, declaredMimeType,
      byteLength: upload.byteLength, sourceSha256: upload.sourceSha256, clientRequestId,
      traceId: request.headers.get('x-request-id')?.slice(0, 200) || randomUUID(), objectKey, upload, pendingUploadId,
    });
    mediaId = queued.mediaId;
    return NextResponse.redirect(new URL(`/phenotypes/images/${mediaId}?queued=1`, request.url), 303);
  } catch (error) {
    if (pendingUploadId) await failPendingObjectUpload(pool, principal, pendingUploadId, objectPersisted, error).catch(() => undefined);
    if (mediaId) await rejectQuarantinedMediaObject(pool, principal, mediaId, error instanceof Error ? error.message : 'Upload failed').catch(() => undefined);
    const url = new URL('/phenotypes/images', request.url);
    url.searchParams.set('error', 'upload_rejected');
    return NextResponse.redirect(url, 303);
  } finally {
    await temporary?.cleanup().catch(() => undefined);
  }
}
