import type pg from 'pg';
import type { Principal } from '@capsicum/contracts';
import { withWorkspaceTransaction } from '@capsicum/database';
import { ApplicationError, authorize } from './internal';

export type PendingUploadPurpose = 'media_upload' | 'research_source';

function permission(purpose: PendingUploadPurpose): 'media.write' | 'catalog.curate' {
  return purpose === 'media_upload' ? 'media.write' : 'catalog.curate';
}

function uuid(value: string, label: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApplicationError('validation_failed', `${label} is invalid.`);
  }
  return value;
}

export async function registerPendingObjectUpload(
  pool: pg.Pool,
  principal: Principal,
  input: {
    purpose: PendingUploadPurpose;
    clientRequestId: string;
    objectKey: string;
    sourceSha256: string;
    byteLength: number;
    mediaType: string;
    retentionSeconds?: number;
  },
): Promise<{ pendingUploadId: string }> {
  authorize(principal, permission(input.purpose));
  return withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT app_register_pending_object_upload($1,$2,$3,$4,$5,$6,$7)::text AS id`,
      [input.purpose, input.clientRequestId, input.objectKey, input.sourceSha256, input.byteLength, input.mediaType, input.retentionSeconds ?? 86_400],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new ApplicationError('internal_error', 'The pending upload could not be registered.', { retryable: true });
    return { pendingUploadId: id };
  });
}

export async function markPendingObjectStored(pool: pg.Pool, principal: Principal, pendingUploadId: string): Promise<void> {
  uuid(pendingUploadId, 'pendingUploadId');
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    await client.query('SELECT app_mark_pending_object_stored($1)', [pendingUploadId]);
  });
}

export async function failPendingObjectUpload(
  pool: pg.Pool,
  principal: Principal,
  pendingUploadId: string,
  objectPersisted: boolean,
  error: unknown,
): Promise<void> {
  uuid(pendingUploadId, 'pendingUploadId');
  const message = error instanceof Error ? error.message : 'Upload failed.';
  await withWorkspaceTransaction(pool, { workspaceId: principal.workspaceId, actorUserId: principal.userId }, async (client) => {
    await client.query('SELECT app_fail_pending_object_upload($1,$2,$3,$4::jsonb)', [
      pendingUploadId,
      objectPersisted,
      'upload_failed',
      JSON.stringify({ message: message.slice(0, 500) }),
    ]);
  });
}
