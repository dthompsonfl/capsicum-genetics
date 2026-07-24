import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HEADER_LIMIT = 8_192;

export interface TemporaryUpload {
  directory: string;
  filePath: string;
  byteLength: number;
  sha256: string;
  cleanup(): Promise<void>;
}

export function decodedUploadHeader(request: Request, name: string, maximum: number): string {
  const raw = request.headers.get(name);
  if (!raw || raw.length > Math.min(HEADER_LIMIT, maximum * 3 + 32)) throw new TypeError(`${name} is required.`);
  let value: string;
  try { value = decodeURIComponent(raw); } catch { throw new TypeError(`${name} is not valid encoded text.`); }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError(`${name} must contain between 1 and ${maximum} safe characters.`);
  }
  return normalized;
}

export async function persistBoundedRequestBody(request: Request, maximumBytes: number): Promise<TemporaryUpload> {
  const advertised = Number(request.headers.get('x-capsicum-upload-size'));
  if (!Number.isSafeInteger(advertised) || advertised < 1 || advertised > maximumBytes) {
    throw new RangeError(`Upload size must be between 1 and ${maximumBytes} bytes.`);
  }
  if (!request.body) throw new TypeError('Upload request body is required.');
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed !== advertised) throw new RangeError('Upload byte length does not match the declared size.');
  }

  const directory = await mkdtemp(join(tmpdir(), 'capsicum-web-upload-'));
  const filePath = join(directory, `${randomUUID()}.upload`);
  const handle = await open(filePath, 'wx', 0o600);
  const hash = createHash('sha256');
  let byteLength = 0;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes || byteLength > advertised) throw new RangeError('Upload exceeded its declared or permitted byte length.');
      hash.update(value);
      await handle.write(value);
    }
    if (byteLength !== advertised) throw new RangeError('Upload ended before its declared byte length was received.');
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    await handle.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  await handle.sync();
  await handle.close();
  return {
    directory,
    filePath,
    byteLength,
    sha256: hash.digest('hex'),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

export async function assertUtf8TextFile(filePath: string): Promise<void> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let hasVisibleText = false;
  try {
    for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
      const text = decoder.decode(chunk as Buffer, { stream: true });
      if (text.includes('\0')) throw new TypeError('Research source contains a NUL byte.');
      if (/\S/u.test(text)) hasVisibleText = true;
    }
    const final = decoder.decode();
    if (final.includes('\0')) throw new TypeError('Research source contains a NUL byte.');
    if (/\S/u.test(final)) hasVisibleText = true;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('NUL')) throw error;
    throw new TypeError('Research source must be valid UTF-8 text.');
  }
  if (!hasVisibleText) throw new TypeError('Research source must contain non-whitespace text.');
}
