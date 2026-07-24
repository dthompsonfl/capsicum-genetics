import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildImmutableObjectKey,
  buildSignedS3Request,
  deleteObject,
  getObject,
  listObjects,
  openObject,
  probeObjectStorage,
  putImmutableFile,
  putImmutableObject,
  type ObjectStorageConfig,
} from './index';

const configured = Boolean(process.env.MINIO_INTEGRATION_ENDPOINT && process.env.MINIO_INTEGRATION_ACCESS_KEY && process.env.MINIO_INTEGRATION_SECRET_KEY);
const describeIntegration = configured ? describe : describe.skip;

function config(overrides: Partial<ObjectStorageConfig> = {}): ObjectStorageConfig {
  return {
    endpoint: process.env.MINIO_INTEGRATION_ENDPOINT!,
    region: process.env.MINIO_INTEGRATION_REGION || 'us-east-1',
    bucket: process.env.MINIO_INTEGRATION_BUCKET || 'capsicum-storage-integration',
    accessKeyId: process.env.MINIO_INTEGRATION_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_INTEGRATION_SECRET_KEY!,
    ...overrides,
  };
}
async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of stream) { chunks.push(chunk); size += chunk.byteLength; }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

describeIntegration('MinIO immutable storage integration', () => {
  it('proves immutable PUT, GET, range, duplicate, file PUT, readiness, and denial paths', async () => {
    const cfg = config();
    expect((await probeObjectStorage(cfg)).ok).toBe(true);
    const workspaceId = randomUUID();
    const bytes = new TextEncoder().encode('capsicum-object-storage-round-trip');
    const sha = createHash('sha256').update(bytes).digest('hex');
    const key = buildImmutableObjectKey({ workspaceId, entityType: 'integration', entityId: randomUUID(), sourceSha256: sha, extension: 'txt' });
    await putImmutableObject(cfg, key, bytes, 'text/plain');
    await putImmutableObject(cfg, key, bytes, 'text/plain');
    expect(await getObject(cfg, key)).toEqual(bytes);
    const range = await openObject(cfg, key, 'bytes=9-14');
    expect(range.status).toBe(206);
    expect(new TextDecoder().decode(await readStream(range.body))).toBe('object');
    await expect(openObject(cfg, key, 'bytes=9999-10000')).rejects.toThrow(/not satisfiable/i);

    const directory = await mkdtemp(join(tmpdir(), 'capsicum-minio-integration-'));
    try {
      const fileBytes = new TextEncoder().encode('streamed immutable file');
      const fileSha = createHash('sha256').update(fileBytes).digest('hex');
      const filePath = join(directory, 'source.txt');
      await writeFile(filePath, fileBytes);
      const fileKey = buildImmutableObjectKey({ workspaceId, entityType: 'integration', entityId: randomUUID(), sourceSha256: fileSha, extension: 'txt' });
      await putImmutableFile(cfg, fileKey, filePath, 'text/plain');
      expect(await getObject(cfg, fileKey)).toEqual(fileBytes);
      const listed = await listObjects(cfg, `workspaces/${workspaceId}/`, 25);
      expect(listed.objects.map((entry) => entry.key)).toContain(key);
      expect(listed.objects.map((entry) => entry.key)).toContain(fileKey);
      expect(listed.objects.every((entry) => entry.key.startsWith(`workspaces/${workspaceId}/`))).toBe(true);
      await deleteObject(cfg, fileKey);
    } finally { await rm(directory, { recursive: true, force: true }); }

    const maliciousBytes = new TextEncoder().encode('server content that violates the key hash');
    const maliciousHash = createHash('sha256').update(maliciousBytes).digest('hex');
    const conflictKey = buildImmutableObjectKey({ workspaceId, entityType: 'integration', entityId: randomUUID(), sourceSha256: sha, extension: 'txt' });
    const signed = buildSignedS3Request(cfg, { method: 'PUT', key: conflictKey, payloadHash: maliciousHash, contentType: 'text/plain', headers: { 'content-length': String(maliciousBytes.byteLength) } });
    const seeded = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: maliciousBytes, redirect: 'error' });
    expect(seeded.ok).toBe(true);
    await expect(putImmutableObject(cfg, conflictKey, bytes, 'text/plain')).rejects.toThrow(/different content/i);

    expect((await probeObjectStorage(config({ secretAccessKey: `${cfg.secretAccessKey!}wrong` }))).ok).toBe(false);
    expect((await probeObjectStorage(config({ bucket: `missing-${randomUUID()}` }))).ok).toBe(false);
    expect(() => buildImmutableObjectKey({ workspaceId: '../escape', entityType: 'x', entityId: 'y', sourceSha256: sha, extension: 'txt' })).toThrow(/unsafe/i);
    await deleteObject(cfg, key); await deleteObject(cfg, conflictKey);
  }, 60_000);
});
