import { createHash, createHmac } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, open, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

const safeSegment = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
const MAX_IMAGE_DIMENSION = 20_000;

function segment(value: string, label: string): string {
  if (!safeSegment.test(value) || value.includes('..')) {
    throw new TypeError(`${label} contains an unsafe object-key segment.`);
  }
  return value;
}

export function buildImmutableObjectKey(input: {
  workspaceId: string;
  entityType: string;
  entityId: string;
  sourceSha256: string;
  extension: string;
}): string {
  if (!sha256Pattern.test(input.sourceSha256)) throw new TypeError('sourceSha256 must be lowercase SHA-256 hex.');
  const extension = segment(input.extension.replace(/^\./, ''), 'extension').toLowerCase();
  return [
    'workspaces', segment(input.workspaceId, 'workspaceId'),
    segment(input.entityType, 'entityType'), segment(input.entityId, 'entityId'),
    `${input.sourceSha256}.${extension}`,
  ].join('/');
}

export type DetectedUpload = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  extension: 'jpg' | 'png' | 'webp' | 'pdf';
  width?: number;
  height?: number;
  sourceSha256: string;
  byteLength: number;
};

const MAX_HEADER_INSPECTION_BYTES = 4 * 1024 * 1024;

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) return null;
    const isSof = [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker);
    if (isSof && length >= 7) {
      return {
        height: (bytes[offset + 3]! << 8) | bytes[offset + 4]!,
        width: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
      };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
      height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21]!; const b1 = bytes[22]!; const b2 = bytes[23]!; const b3 = bytes[24]!;
    return {
      width: 1 + b0 + ((b1 & 0x3f) << 8),
      height: 1 + ((b1 & 0xc0) >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10),
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
    };
  }
  return null;
}

function assertDimensions(dimensions: { width: number; height: number } | null): asserts dimensions is { width: number; height: number } {
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    throw new TypeError('Image dimensions could not be decoded safely.');
  }
  if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
    throw new RangeError(`Image dimensions exceed ${MAX_IMAGE_DIMENSION}px.`);
  }
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    throw new RangeError(`Image exceeds the ${MAX_IMAGE_PIXELS.toLocaleString()} pixel safety limit.`);
  }
}

function detectUpload(
  headerBytes: Uint8Array,
  byteLength: number,
  sourceSha256: string,
  declaredMimeType?: string,
  jpegEndsCorrectly = false,
): DetectedUpload {
  if (byteLength < 8) throw new TypeError('Upload is too small to identify safely.');
  if (byteLength > MAX_UPLOAD_BYTES) throw new RangeError(`Upload exceeds ${MAX_UPLOAD_BYTES} bytes.`);
  let detected: Omit<DetectedUpload, 'sourceSha256' | 'byteLength'>;
  if (headerBytes.slice(0, 8).every((value, index) => value === [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][index])) {
    if (headerBytes.length < 24 || String.fromCharCode(...headerBytes.slice(12, 16)) !== 'IHDR') throw new TypeError('PNG header is malformed.');
    const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
    const dimensions = { width: view.getUint32(16), height: view.getUint32(20) };
    assertDimensions(dimensions);
    detected = { mimeType: 'image/png', extension: 'png', ...dimensions };
  } else if (headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && jpegEndsCorrectly) {
    const dimensions = jpegDimensions(headerBytes); assertDimensions(dimensions);
    detected = { mimeType: 'image/jpeg', extension: 'jpg', ...dimensions };
  } else if (String.fromCharCode(...headerBytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...headerBytes.slice(8, 12)) === 'WEBP') {
    const dimensions = webpDimensions(headerBytes); assertDimensions(dimensions);
    detected = { mimeType: 'image/webp', extension: 'webp', ...dimensions };
  } else if (String.fromCharCode(...headerBytes.slice(0, 5)) === '%PDF-') {
    detected = { mimeType: 'application/pdf', extension: 'pdf' };
  } else {
    throw new TypeError('Unsupported or unrecognized file signature. SVG and executable formats are rejected.');
  }
  if (declaredMimeType && declaredMimeType !== detected.mimeType && declaredMimeType !== 'application/octet-stream') {
    throw new TypeError(`Declared MIME type ${declaredMimeType} does not match detected ${detected.mimeType}.`);
  }
  return { ...detected, sourceSha256, byteLength };
}

export function inspectUpload(bytes: Uint8Array, declaredMimeType?: string): DetectedUpload {
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const jpegEndsCorrectly = bytes.byteLength >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  return detectUpload(bytes, bytes.byteLength, sourceSha256, declaredMimeType, jpegEndsCorrectly);
}

export async function inspectUploadFile(filePath: string, declaredMimeType?: string): Promise<DetectedUpload> {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new TypeError('Upload source must be a regular file.');
  if (metadata.size < 8) throw new TypeError('Upload is too small to identify safely.');
  if (metadata.size > MAX_UPLOAD_BYTES) throw new RangeError(`Upload exceeds ${MAX_UPLOAD_BYTES} bytes.`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath, { highWaterMark: 1024 * 1024 })) hash.update(chunk as Buffer);
  const handle = await open(filePath, 'r');
  try {
    const prefixLength = Math.min(metadata.size, MAX_HEADER_INSPECTION_BYTES);
    const prefix = Buffer.allocUnsafe(prefixLength);
    const { bytesRead } = await handle.read(prefix, 0, prefixLength, 0);
    const ending = Buffer.alloc(2);
    const endingRead = metadata.size >= 2 ? (await handle.read(ending, 0, 2, metadata.size - 2)).bytesRead : 0;
    const jpegEndsCorrectly = endingRead === 2 && ending[0] === 0xff && ending[1] === 0xd9;
    return detectUpload(prefix.subarray(0, bytesRead), metadata.size, hash.digest('hex'), declaredMimeType, jpegEndsCorrectly);
  } finally {
    await handle.close();
  }
}

export function acceptedUploadMimeType(mimeType: string): boolean {
  return new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']).has(mimeType);
}

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

function hmac(key: Uint8Array | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function safeDecodePathSegment(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function canonicalObjectUrl(config: ObjectStorageConfig, key: string): URL {
  const endpoint = new URL(config.endpoint);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new TypeError('S3 endpoint must use HTTP or HTTPS.');
  if (endpoint.username || endpoint.password) throw new TypeError('S3 endpoint credentials must not be embedded in the URL.');
  const baseSegments = endpoint.pathname.split('/').filter(Boolean).map(safeDecodePathSegment);
  const keySegments = key.split('/').filter(Boolean);
  endpoint.pathname = `/${[...baseSegments, config.bucket, ...keySegments].map(awsEncode).join('/')}`;
  return endpoint;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams.entries()]
    .map(([name, value]) => [awsEncode(name), awsEncode(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => compareCodeUnits(leftName, rightName) || compareCodeUnits(leftValue, rightValue))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

export type S3RequestMethod = 'GET' | 'PUT' | 'DELETE' | 'HEAD';

export interface SignedS3Request {
  url: URL;
  headers: Record<string, string>;
  canonicalRequest: string;
  signedHeaders: string;
}

export function buildSignedS3Request(
  config: ObjectStorageConfig,
  input: {
    method: S3RequestMethod;
    key: string;
    payloadHash: string;
    contentType?: string;
    headers?: Readonly<Record<string, string>>;
    query?: Readonly<Record<string, string>>;
    now?: Date;
  },
): SignedS3Request {
  if (!config.accessKeyId || !config.secretAccessKey) throw new Error('S3 credentials are required for HTTP object storage.');
  if (!sha256Pattern.test(input.payloadHash)) throw new TypeError('payloadHash must be lowercase SHA-256 hex.');
  const url = canonicalObjectUrl(config, input.key);
  for (const [name, value] of Object.entries(input.query ?? {})) url.searchParams.append(name, value);
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(input.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value.trim()])),
  };
  if (input.contentType) headers['content-type'] = input.contentType;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]!.replace(/\s+/g, ' ').trim()}\n`).join('');
  const canonicalRequest = [
    input.method,
    url.pathname,
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaderNames.join(';'),
    input.payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const signedHeaders = signedHeaderNames.join(';');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url, headers, canonicalRequest, signedHeaders };
}

async function signedS3Request(
  config: ObjectStorageConfig,
  method: S3RequestMethod,
  key: string,
  bytes?: Uint8Array,
  mimeType?: string,
  additionalHeaders: Readonly<Record<string, string>> = {},
): Promise<Response> {
  const payloadHash = createHash('sha256').update(bytes ?? new Uint8Array()).digest('hex');
  const signed = buildSignedS3Request(config, {
    method,
    key,
    payloadHash,
    ...(mimeType ? { contentType: mimeType } : {}),
    headers: additionalHeaders,
  });
  return fetch(signed.url, {
    method,
    headers: signed.headers,
    ...(bytes ? { body: bytes } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(method === 'GET' || method === 'HEAD' ? 60_000 : 30_000),
  });
}

function safeLocalPath(root: string, key: string): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...key.split('/'));
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${sep}`)) throw new TypeError('Object key escapes storage root.');
  return target;
}

export async function putImmutableObject(config: ObjectStorageConfig, key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  const expectedSha256 = key.split('/').pop()?.split('.')[0];
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (!expectedSha256 || !sha256Pattern.test(expectedSha256) || actualSha256 !== expectedSha256) {
    throw new Error('Immutable object key hash does not match the supplied bytes.');
  }
  if (config.endpoint.startsWith('file://')) {
    const target = safeLocalPath(new URL(config.endpoint).pathname, `${config.bucket}/${key}`);
    await mkdir(dirname(target), { recursive: true });
    try {
      const handle = await open(target, 'wx', 0o600);
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(target);
      if (createHash('sha256').update(existing).digest('hex') !== expectedSha256) {
        throw new Error('Immutable object key already exists with different content.');
      }
    }
    return;
  }
  const response = await signedS3Request(config, 'PUT', key, bytes, mimeType, {
    'content-length': String(bytes.byteLength),
    'if-none-match': '*',
  });
  if (response.ok) return;
  if (response.status !== 412) throw new Error(`Object storage PUT failed with ${response.status}.`);
  const existing = await getObject(config, key);
  if (createHash('sha256').update(existing).digest('hex') !== expectedSha256) {
    throw new Error('Immutable object key already exists with different content.');
  }
}

async function sha256File(path: string): Promise<{ sha256: string; byteLength: number }> {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new TypeError('Immutable upload source must be a regular file.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 })) {
    hash.update(chunk as Buffer);
  }
  return { sha256: hash.digest('hex'), byteLength: metadata.size };
}

async function signedS3FilePut(
  config: ObjectStorageConfig,
  key: string,
  filePath: string,
  mimeType: string,
  payloadHash: string,
  byteLength: number,
): Promise<Response> {
  const signed = buildSignedS3Request(config, {
    method: 'PUT',
    key,
    payloadHash,
    contentType: mimeType,
    headers: { 'content-length': String(byteLength), 'if-none-match': '*' },
  });
  const body = Readable.toWeb(createReadStream(filePath, { highWaterMark: 1024 * 1024 })) as ReadableStream<Uint8Array>;
  return fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(10 * 60_000),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

export async function putImmutableFile(
  config: ObjectStorageConfig,
  key: string,
  filePath: string,
  mimeType: string,
): Promise<{ sha256: string; byteLength: number }> {
  const expectedSha256 = key.split('/').pop()?.split('.')[0];
  const source = await sha256File(filePath);
  if (!expectedSha256 || !sha256Pattern.test(expectedSha256) || source.sha256 !== expectedSha256) {
    throw new Error('Immutable object key hash does not match the source file.');
  }
  if (config.endpoint.startsWith('file://')) {
    const target = safeLocalPath(new URL(config.endpoint).pathname, `${config.bucket}/${key}`);
    await mkdir(dirname(target), { recursive: true });
    try {
      await copyFile(filePath, target, fsConstants.COPYFILE_EXCL);
      await chmod(target, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await sha256File(target);
      if (existing.sha256 !== expectedSha256 || existing.byteLength !== source.byteLength) {
        throw new Error('Immutable object key already exists with different file content.');
      }
    }
    return source;
  }
  const response = await signedS3FilePut(config, key, filePath, mimeType, source.sha256, source.byteLength);
  if (!response.ok && response.status !== 412) throw new Error(`Object storage streaming PUT failed with ${response.status}.`);
  if (response.status === 412) {
    const existing = await getObject(config, key);
    if (createHash('sha256').update(existing).digest('hex') !== expectedSha256) {
      throw new Error('Immutable object key already exists with different content.');
    }
  }
  return source;
}

export interface OpenObjectResult {
  body: ReadableStream<Uint8Array>;
  status: 200 | 206;
  byteLength: number;
  contentRange?: string;
  acceptRanges: 'bytes';
}

function parseByteRange(value: string | undefined, total: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (match[1] === '' && match[2] === '')) throw new RangeError('Only one valid byte range is supported.');
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) throw new RangeError('Invalid suffix byte range.');
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? total - 1 : Number(match[2]);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= total) {
    throw new RangeError('Requested byte range is not satisfiable.');
  }
  return { start, end: Math.min(end, total - 1) };
}

export async function openObject(
  config: ObjectStorageConfig,
  key: string,
  rangeHeader?: string,
): Promise<OpenObjectResult> {
  if (config.endpoint.startsWith('file://')) {
    const target = safeLocalPath(new URL(config.endpoint).pathname, `${config.bucket}/${key}`);
    const metadata = await stat(target);
    if (!metadata.isFile()) throw new TypeError('Object key does not reference a regular file.');
    const range = parseByteRange(rangeHeader, metadata.size);
    const start = range?.start ?? 0;
    const end = range?.end ?? metadata.size - 1;
    const nodeStream = createReadStream(target, { start, end, highWaterMark: 64 * 1024 });
    const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return {
      body,
      status: range ? 206 : 200,
      byteLength: Math.max(0, end - start + 1),
      ...(range ? { contentRange: `bytes ${start}-${end}/${metadata.size}` } : {}),
      acceptRanges: 'bytes',
    };
  }

  const response = await signedS3Request(config, 'GET', key, undefined, undefined, rangeHeader ? { range: rangeHeader } : {});
  if (response.status === 416) throw new RangeError('Requested byte range is not satisfiable.');
  if (!response.ok || !response.body) throw new Error(`Object storage GET failed with ${response.status}.`);
  const byteLength = Number(response.headers.get('content-length'));
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error('Object storage response omitted a valid Content-Length.');
  return {
    body: response.body,
    status: response.status === 206 ? 206 : 200,
    byteLength,
    ...(response.headers.get('content-range') ? { contentRange: response.headers.get('content-range')! } : {}),
    acceptRanges: 'bytes',
  };
}

export async function getObject(config: ObjectStorageConfig, key: string): Promise<Uint8Array> {
  if (config.endpoint.startsWith('file://')) {
    return readFile(safeLocalPath(new URL(config.endpoint).pathname, `${config.bucket}/${key}`));
  }
  const response = await signedS3Request(config, 'GET', key);
  if (!response.ok) throw new Error(`Object storage GET failed with ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteObject(config: ObjectStorageConfig, key: string): Promise<'deleted' | 'missing'> {
  if (config.endpoint.startsWith('file://')) {
    const target = safeLocalPath(new URL(config.endpoint).pathname, `${config.bucket}/${key}`);
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(target);
      return 'deleted';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
      throw error;
    }
  }
  const response = await signedS3Request(config, 'DELETE', key);
  if (response.ok || response.status === 204) return 'deleted';
  if (response.status === 404) return 'missing';
  throw new Error(`Object storage DELETE failed with ${response.status}.`);
}

export interface ObjectStorageProbe {
  ok: boolean;
  mode: 'local' | 's3';
  detail: string;
  statusCode?: number;
}

export async function probeObjectStorage(config: ObjectStorageConfig): Promise<ObjectStorageProbe> {
  if (config.endpoint.startsWith('file://')) {
    const root = safeLocalPath(new URL(config.endpoint).pathname, config.bucket);
    try {
      await mkdir(root, { recursive: true });
      return { ok: true, mode: 'local', detail: 'Local immutable object-storage root is writable.' };
    } catch {
      return { ok: false, mode: 'local', detail: 'Local object-storage root is unavailable.' };
    }
  }
  try {
    const response = await signedS3Request(config, 'GET', '__capsicum_readiness_probe_missing_object__');
    if (response.ok || response.status === 404) {
      return {
        ok: true,
        mode: 's3',
        detail: response.status === 404
          ? 'S3-compatible endpoint, credentials, and bucket accepted the signed probe.'
          : 'S3-compatible endpoint returned a successful signed probe.',
        statusCode: response.status,
      };
    }
    return { ok: false, mode: 's3', detail: `S3-compatible signed probe was rejected with status ${response.status}.`, statusCode: response.status };
  } catch {
    return { ok: false, mode: 's3', detail: 'S3-compatible endpoint could not be reached safely.' };
  }
}


export interface ListedObject {
  key: string;
  byteLength: number;
  lastModified: string;
}

export interface ObjectListResult {
  objects: ListedObject[];
  truncated: boolean;
  nextContinuationToken?: string;
}

function assertWorkspacePrefix(prefix: string): void {
  const segments = prefix.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'workspaces') throw new TypeError('Object listing prefix must be workspace-scoped.');
  segment(segments[1]!, 'workspaceId');
  if (!prefix.endsWith('/')) throw new TypeError('Object listing prefix must end with a slash.');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmlValue(fragment: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(fragment);
  return match?.[1] === undefined ? undefined : decodeXml(match[1]);
}

export async function listObjects(
  config: ObjectStorageConfig,
  prefix: string,
  limit = 500,
  continuationToken?: string,
): Promise<ObjectListResult> {
  assertWorkspacePrefix(prefix);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new RangeError('Object listing limit must be between 1 and 1000.');
  if (continuationToken && continuationToken.length > 2_000) throw new RangeError('Continuation token is too long.');

  if (config.endpoint.startsWith('file://')) {
    if (continuationToken) throw new TypeError('Local object storage does not use continuation tokens.');
    const storageRoot = safeLocalPath(new URL(config.endpoint).pathname, config.bucket);
    const prefixRoot = safeLocalPath(storageRoot, prefix);
    const objects: ListedObject[] = [];
    const pending = [prefixRoot];
    while (pending.length && objects.length <= limit) {
      const current = pending.pop()!;
      const entries = await readdir(current, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      for (const entry of entries.sort((left, right) => compareCodeUnits(left.name, right.name))) {
        if (entry.isSymbolicLink()) continue;
        const absolute = resolve(current, entry.name);
        if (entry.isDirectory()) pending.push(absolute);
        else if (entry.isFile()) {
          const metadata = await stat(absolute);
          const key = relative(storageRoot, absolute).split(sep).join('/');
          if (!key.startsWith(prefix)) continue;
          objects.push({ key, byteLength: metadata.size, lastModified: metadata.mtime.toISOString() });
          if (objects.length > limit) break;
        }
      }
    }
    objects.sort((left, right) => compareCodeUnits(left.key, right.key));
    return { objects: objects.slice(0, limit), truncated: objects.length > limit };
  }

  const query: Record<string, string> = { 'list-type': '2', prefix, 'max-keys': String(limit), 'encoding-type': 'url' };
  if (continuationToken) query['continuation-token'] = continuationToken;
  const signed = buildSignedS3Request(config, {
    method: 'GET',
    key: '',
    payloadHash: createHash('sha256').update(new Uint8Array()).digest('hex'),
    query,
  });
  const response = await fetch(signed.url, { method: 'GET', headers: signed.headers, redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Object storage LIST failed with ${response.status}.`);
  const xml = await response.text();
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => {
    const encodedKey = xmlValue(match[1]!, 'Key');
    const size = Number(xmlValue(match[1]!, 'Size'));
    const lastModified = xmlValue(match[1]!, 'LastModified');
    if (!encodedKey || !Number.isSafeInteger(size) || size < 0 || !lastModified || Number.isNaN(Date.parse(lastModified))) {
      throw new Error('Object storage LIST returned malformed object metadata.');
    }
    const key = decodeURIComponent(encodedKey);
    if (!key.startsWith(prefix)) throw new Error('Object storage LIST escaped the requested workspace prefix.');
    return { key, byteLength: size, lastModified: new Date(lastModified).toISOString() };
  });
  const truncated = xmlValue(xml, 'IsTruncated') === 'true';
  const encodedNext = xmlValue(xml, 'NextContinuationToken');
  return {
    objects,
    truncated,
    ...(encodedNext ? { nextContinuationToken: decodeURIComponent(encodedNext) } : {}),
  };
}
