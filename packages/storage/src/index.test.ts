import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildImmutableObjectKey,
  buildSignedS3Request,
  deleteObject,
  getObject,
  openObject,
  putImmutableFile,
  putImmutableObject,
} from './index';

const config = {
  endpoint: 'https://storage.example.invalid/base?x=two words&x=alpha',
  region: 'us-east-1',
  bucket: 'capsicum-test',
  accessKeyId: 'test-access',
  secretAccessKey: 'test-secret',
};

it('signs the actual HTTP method and canonicalizes range headers', () => {
  const request = buildSignedS3Request(config, {
    method: 'GET',
    key: 'workspaces/a/object.bin',
    payloadHash: createHash('sha256').update(new Uint8Array()).digest('hex'),
    headers: { range: 'bytes=0-9' },
    now: new Date('2026-01-02T03:04:05.000Z'),
  });
  expect(request.canonicalRequest.split('\n')[0]).toBe('GET');
  expect(request.canonicalRequest).toContain('range:bytes=0-9\n');
  expect(request.canonicalRequest).toContain('x=alpha&x=two%20words');
  expect(request.headers.authorization).toContain('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date');
  expect(request.headers.authorization).toBe('AWS4-HMAC-SHA256 Credential=test-access/20260102/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f34077bc6193d9bab49d5e161a6e20cd96984321d1b42cf80f0c717f9882ec46');
});

it('uses distinct signatures for GET and PUT over the same key', () => {
  const payloadHash = createHash('sha256').update(new Uint8Array()).digest('hex');
  const now = new Date('2026-01-02T03:04:05.000Z');
  const get = buildSignedS3Request(config, { method: 'GET', key: 'same/key', payloadHash, now });
  const put = buildSignedS3Request(config, { method: 'PUT', key: 'same/key', payloadHash, now });
  expect(get.canonicalRequest).not.toBe(put.canonicalRequest);
  expect(get.headers.authorization).not.toBe(put.headers.authorization);
});

describe('local immutable storage parity', () => {
  it('supports immutable bytes, ranged reads, streaming files, and deletion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'capsicum-storage-'));
    const local = { endpoint: `file://${root}`, region: 'local', bucket: 'bucket' };
    const bytes = new TextEncoder().encode('scientific-object');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const key = buildImmutableObjectKey({ workspaceId: 'workspace', entityType: 'test', entityId: 'entity', sourceSha256: hash, extension: 'txt' });
    await putImmutableObject(local, key, bytes, 'text/plain');
    await putImmutableObject(local, key, bytes, 'text/plain');
    expect(new TextDecoder().decode(await getObject(local, key))).toBe('scientific-object');
    const range = await openObject(local, key, 'bytes=0-9');
    expect(range.status).toBe(206);
    expect(range.contentRange).toBe(`bytes 0-9/${bytes.byteLength}`);
    expect(new TextDecoder().decode(new Uint8Array(await new Response(range.body).arrayBuffer()))).toBe('scientific');

    const file = join(root, 'source.txt');
    await writeFile(file, bytes);
    const fileKey = buildImmutableObjectKey({ workspaceId: 'workspace', entityType: 'test', entityId: 'file', sourceSha256: hash, extension: 'txt' });
    expect(await putImmutableFile(local, fileKey, file, 'text/plain')).toEqual({ sha256: hash, byteLength: bytes.byteLength });
    expect(await readFile(join(root, 'bucket', fileKey))).toEqual(Buffer.from(bytes));
    expect(await deleteObject(local, key)).toBe('deleted');
    expect(await deleteObject(local, key)).toBe('missing');
  });
});
