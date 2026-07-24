import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { hostname } from 'node:os';
import { connect } from 'node:net';
import process from 'node:process';
import { Worker } from 'node:worker_threads';
import {
  buildImmutableObjectKey,
  deleteObject,
  inspectUploadFile,
  listObjects,
  openObject,
  putImmutableObject,
  putImmutableFile,
  type ObjectStorageConfig,
} from '@capsicum/storage';
import pg from 'pg';
import {
  BREEDING_LEDGER_SCHEMA_VERSION,
  DEVELOPMENT_RELEASE_IDENTIFIER,
  createBreedingLedgerManifest,
} from '@capsicum/contracts';
import { stableContentHash } from '@capsicum/simulation-domain';
import { parseClamdResponse, type ScannerResult } from './malware-scanner';
import { createDeterministicDerivatives, verifiedImageFacts } from './media-processing';

const { Pool } = pg;
const WORKER_VERSION = '0.6.0';
const CONTRACT_VERSION = '1.0.0';
const SUPPORTED_JOBS = [
  'genetics.direct-inheritance-monte-carlo.v1',
  'media.inspect.v1',
  'media.derivatives.v1',
  'media.measurements.v1',
  'research.ingest.v1',
  'export.breeding-ledger.v1',
  'storage.cleanup.v1',
  'worker.health.v1',
] as const;
type SupportedJobType = (typeof SUPPORTED_JOBS)[number];
interface JsonRecord { [key: string]: unknown }
interface ClaimedJob {
  id: string;
  workspaceId: string;
  jobType: SupportedJobType;
  contractVersion: string;
  payload: unknown;
  attempt: number;
  maxAttempts: number;
  leaseExpiresAt: string;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value as JsonRecord;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} is required.`);
  return value.trim();
}
function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  return Number(value);
}
function safeError(error: unknown): { code: string; detail: JsonRecord } {
  const candidate = error instanceof Error ? error : new Error('Unknown worker failure.');
  const code = 'code' in candidate && typeof candidate.code === 'string' ? candidate.code : 'job_execution_failed';
  return { code, detail: { name: candidate.name, message: candidate.message.slice(0, 2_000) } };
}
function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[depth-limited]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, item]) => [
      key,
      /token|secret|password|authorization|cookie|payload|document|passage|image|bytes/i.test(key) ? '[redacted]' : redact(item, depth + 1),
    ]));
  }
  return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value;
}
function log(event: string, detail: JsonRecord = {}): void {
  console.info(JSON.stringify({ event, workerId, at: new Date().toISOString(), detail: redact(detail) }));
}
function storageConfig(): ObjectStorageConfig {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  if (!endpoint || !bucket) throw Object.assign(new Error('Object storage is not configured for the worker.'), { code: 'storage_unavailable' });
  return {
    endpoint,
    bucket,
    region: process.env.S3_REGION?.trim() || 'us-east-1',
    ...(process.env.S3_ACCESS_KEY_ID ? { accessKeyId: process.env.S3_ACCESS_KEY_ID } : {}),
    ...(process.env.S3_SECRET_ACCESS_KEY ? { secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } : {}),
  };
}

function resolveSoftwareReleaseIdentifier(): string {
  const configured = process.env.APP_RELEASE_SHA?.trim();
  if (configured) {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(configured)) {
      throw new Error('APP_RELEASE_SHA must be an immutable 40- or 64-character hexadecimal source revision.');
    }
    return configured.toLowerCase();
  }
  if (process.env.APP_MODE === 'production') {
    throw new Error('APP_RELEASE_SHA is required when APP_MODE=production.');
  }
  return DEVELOPMENT_RELEASE_IDENTIFIER;
}

const databaseUrl = process.env.WORKER_DATABASE_URL;
if (!databaseUrl) throw new Error('WORKER_DATABASE_URL is required.');
const softwareReleaseIdentifier = resolveSoftwareReleaseIdentifier();
const workerId = process.env.WORKER_ID?.trim() || `${hostname()}:${process.pid}`;
const workerStartedAt = new Date();
const pollMilliseconds = integer(Number(process.env.WORKER_POLL_MS ?? 1_000), 'WORKER_POLL_MS', 100, 60_000);
const leaseSeconds = integer(Number(process.env.WORKER_LEASE_SECONDS ?? 90), 'WORKER_LEASE_SECONDS', 15, 3_600);
const maximumMediaBytes = integer(Number(process.env.WORKER_MAX_MEDIA_BYTES ?? 25 * 1024 * 1024), 'WORKER_MAX_MEDIA_BYTES', 1_048_576, 25 * 1024 * 1024);
const mediaConcurrency = integer(Number(process.env.WORKER_MEDIA_CONCURRENCY ?? 1), 'WORKER_MEDIA_CONCURRENCY', 1, 1);
const pool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'capsicum-node-worker' });
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { stopping = true; });

async function recordHeartbeat(currentJobId: string | null): Promise<void> {
  await pool.query('SELECT app_worker_record_heartbeat($1,$2,$3,$4::text[],$5,$6,$7::jsonb)', [
    workerId,
    'node',
    WORKER_VERSION,
    [...SUPPORTED_JOBS],
    workerStartedAt.toISOString(),
    currentJobId,
    JSON.stringify({ pid: process.pid, hostname: hostname(), mediaConcurrency, maximumMediaBytes }),
  ]);
}
async function claim(): Promise<ClaimedJob | null> {
  const result = await pool.query<{ job: ClaimedJob | null }>('SELECT app_claim_job($1,$2::text[],$3) AS job', [workerId, [...SUPPORTED_JOBS], leaseSeconds]);
  return result.rows[0]?.job ?? null;
}
async function cancellationRequested(jobId: string): Promise<boolean> {
  const result = await pool.query<{ requested: boolean }>('SELECT app_job_cancellation_requested($1,$2) AS requested', [jobId, workerId]);
  return result.rows[0]?.requested === true;
}

class LeaseGuard {
  private timer: NodeJS.Timeout | undefined;
  private cancelled = false;
  private failed: unknown;
  constructor(private readonly job: ClaimedJob) {}
  start(): void {
    const interval = Math.max(2_000, Math.floor((leaseSeconds * 1_000) / 3));
    this.timer = setInterval(() => {
      void (async () => {
        try {
          const result = await pool.query<{ requested: boolean }>(
            `SELECT app_heartbeat_job($1,$2,$3), app_job_cancellation_requested($1,$2) AS requested`,
            [this.job.id, workerId, leaseSeconds],
          );
          this.cancelled = result.rows[0]?.requested === true;
          await recordHeartbeat(this.job.id);
        } catch (error) {
          this.failed = error;
        }
      })();
    }, interval);
    this.timer.unref();
  }
  assertActive(): void {
    if (this.failed) throw Object.assign(new Error('The worker lost its durable lease.'), { code: 'lease_lost', cause: this.failed });
    if (this.cancelled) throw Object.assign(new Error('Cancellation was requested.'), { code: 'job_cancelled' });
  }
  async refresh(): Promise<void> {
    const result = await pool.query<{ requested: boolean }>(
      `SELECT app_heartbeat_job($1,$2,$3), app_job_cancellation_requested($1,$2) AS requested`,
      [this.job.id, workerId, leaseSeconds],
    );
    this.cancelled = result.rows[0]?.requested === true;
    this.assertActive();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); }
}

async function runMonteCarlo(payload: unknown, guard: LeaseGuard): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./monte-carlo-task.js', import.meta.url), { workerData: payload });
    let settled = false;
    const cancellationTimer = setInterval(() => {
      try { guard.assertActive(); } catch (error) {
        void worker.terminate();
        if (!settled) { settled = true; reject(error); }
      }
    }, 1_000);
    cancellationTimer.unref();
    worker.once('message', (message: unknown) => {
      clearInterval(cancellationTimer);
      if (settled) return;
      settled = true;
      const response = record(message, 'Monte Carlo worker response');
      if (response.ok === true) resolve(response.result);
      else {
        const failure = record(response.error, 'Monte Carlo worker error');
        reject(Object.assign(new Error(text(failure.message, 'Monte Carlo error message')), { code: typeof failure.code === 'string' ? failure.code : 'monte_carlo_failed' }));
      }
    });
    worker.once('error', (error) => { clearInterval(cancellationTimer); if (!settled) { settled = true; reject(error); } });
    worker.once('exit', (code) => { clearInterval(cancellationTimer); if (!settled && code !== 0) { settled = true; reject(new Error(`Monte Carlo worker exited with code ${code}.`)); } });
  });
}

interface MaterializedObject {
  directory: string;
  filePath: string;
  sourceSha256: string;
  byteLength: number;
  cleanup(): Promise<void>;
}

async function materializeObjectToTemporaryFile(
  objectKey: string,
  expectedSha256: string,
  maximumBytes: number,
  guard: LeaseGuard,
): Promise<MaterializedObject> {
  const opened = await openObject(storageConfig(), objectKey);
  if (opened.byteLength < 1 || opened.byteLength > maximumBytes) {
    throw Object.assign(new RangeError(`Object length is outside the approved 1-${maximumBytes} byte envelope.`), { code: 'object_size_rejected' });
  }
  const directory = await mkdtemp(join(tmpdir(), 'capsicum-worker-object-'));
  const filePath = join(directory, 'source.bin');
  const stream = createWriteStream(filePath, { flags: 'wx', mode: 0o600, highWaterMark: 1024 * 1024 });
  const hash = createHash('sha256');
  const reader = opened.body.getReader();
  let byteLength = 0;
  try {
    for (;;) {
      guard.assertActive();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes || byteLength > opened.byteLength) {
        throw Object.assign(new RangeError('Object exceeded its approved byte envelope while streaming.'), { code: 'object_size_rejected' });
      }
      hash.update(value);
      if (!stream.write(value)) await once(stream, 'drain');
    }
    if (byteLength !== opened.byteLength) throw Object.assign(new Error('Object stream ended before Content-Length was satisfied.'), { code: 'object_length_mismatch' });
    stream.end();
    await once(stream, 'finish');
    const actualSha256 = hash.digest('hex');
    if (actualSha256 !== expectedSha256) throw Object.assign(new Error('Object bytes do not match the immutable source hash.'), { code: 'source_hash_mismatch' });
    return { directory, filePath, sourceSha256: actualSha256, byteLength, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    stream.destroy();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function writeSocket(socket: ReturnType<typeof connect>, bytes: Uint8Array): Promise<void> {
  if (!socket.write(bytes)) await once(socket, 'drain');
}

async function scanWithClamdFile(filePath: string): Promise<ScannerResult> {
  const host = process.env.MEDIA_SCANNER_HOST?.trim();
  if (!host) return { result: 'unavailable', scanner: 'none', version: 'unconfigured', detail: 'No production malware scanner is configured.' };
  const port = integer(Number(process.env.MEDIA_SCANNER_PORT ?? 3310), 'MEDIA_SCANNER_PORT', 1, 65_535);
  return new Promise<ScannerResult>((resolve) => {
    const socket = connect({ host, port });
    const timeout = setTimeout(() => socket.destroy(new Error('ClamAV scan timed out.')), 30_000);
    let response = '';
    let settled = false;
    const finish = (result: ScannerResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(result);
    };
    socket.on('connect', () => {
      void (async () => {
        try {
          await writeSocket(socket, Buffer.from('zINSTREAM\0', 'utf8'));
          for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
            const bytes = chunk as Buffer;
            const length = Buffer.allocUnsafe(4);
            length.writeUInt32BE(bytes.byteLength, 0);
            await writeSocket(socket, length);
            await writeSocket(socket, bytes);
          }
          await writeSocket(socket, Buffer.alloc(4));
        } catch (error) {
          socket.destroy(error instanceof Error ? error : new Error('ClamAV stream failed.'));
        }
      })();
    });
    socket.on('data', (chunk: Buffer) => {
      response += chunk.toString('utf8');
      if (!response.includes('\0') && !response.includes('\n')) return;
      finish(parseClamdResponse(response));
    });
    socket.on('error', (error) => finish({ result: 'unavailable', scanner: 'clamd-instream', version: 'server-managed', detail: error.message.slice(0, 500) }));
    socket.on('end', () => {
      if (!settled) finish({ result: 'unavailable', scanner: 'clamd-instream', version: 'server-managed', detail: response.trim().slice(0, 500) || 'Scanner closed without a result.' });
    });
  });
}

async function scanMalwareFile(filePath: string, sourceSha256: string, mimeType: string, byteLength: number): Promise<ScannerResult> {
  const scannerUrl = process.env.MEDIA_SCANNER_URL?.trim();
  if (!scannerUrl) return scanWithClamdFile(filePath);
  const body = Readable.toWeb(createReadStream(filePath, { highWaterMark: 64 * 1024 })) as ReadableStream<Uint8Array>;
  const response = await fetch(scannerUrl, {
    method: 'POST',
    headers: {
      'content-type': mimeType,
      'content-length': String(byteLength),
      'x-content-sha256': sourceSha256,
      ...(process.env.MEDIA_SCANNER_BEARER_TOKEN ? { authorization: `Bearer ${process.env.MEDIA_SCANNER_BEARER_TOKEN}` } : {}),
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  if (!response.ok) return { result: 'unavailable', scanner: 'configured-http', version: 'unknown', detail: `Scanner returned ${response.status}.` };
  const parsed = record(await response.json(), 'scanner response');
  const result = text(parsed.result, 'scanner result');
  if (!['clean', 'suspicious', 'infected'].includes(result)) throw new TypeError('Scanner returned an unsupported result.');
  return {
    result: result as ScannerResult['result'],
    scanner: typeof parsed.scanner === 'string' ? parsed.scanner.slice(0, 120) : 'configured-http',
    version: typeof parsed.version === 'string' ? parsed.version.slice(0, 120) : 'unknown',
  };
}

async function inspectMedia(job: ClaimedJob, guard: LeaseGuard): Promise<void> {
  const payload = record(job.payload, 'payload');
  const mediaObjectId = text(payload.mediaObjectId, 'payload.mediaObjectId');
  const objectKey = text(payload.objectKey, 'payload.objectKey');
  const sourceSha256 = text(payload.sourceSha256, 'payload.sourceSha256');
  const declaredMimeType = text(payload.declaredMimeType, 'payload.declaredMimeType');
  await guard.refresh();
  const materialized = await materializeObjectToTemporaryFile(objectKey, sourceSha256, maximumMediaBytes, guard);
  try {
    const inspected = await inspectUploadFile(materialized.filePath, declaredMimeType === 'application/octet-stream' ? undefined : declaredMimeType);
    const malware = await scanMalwareFile(materialized.filePath, sourceSha256, inspected.mimeType, materialized.byteLength);
    await guard.refresh();
    const rejected = malware.result === 'infected' || malware.result === 'suspicious';
    const accepted = malware.result === 'clean';
    const result = {
      mediaObjectId,
      sourceSha256,
      inspectionState: rejected ? 'rejected' : accepted ? 'accepted' : 'needs_review',
      inspectorKind: 'streamed_header_and_malware_boundary',
      inspectorVersion: WORKER_VERSION,
      detectedMimeType: inspected.mimeType,
      widthPx: inspected.width ?? null,
      heightPx: inspected.height ?? null,
      pixelCount: inspected.width && inspected.height ? inspected.width * inspected.height : null,
      frameCount: inspected.mimeType.startsWith('image/') ? 1 : null,
      blurScore: null,
      exposureScore: null,
      orientation: null,
      metadataDetected: {},
      metadataStripped: false,
      malwareResult: malware.result,
      decoderResult: 'accepted',
      rejectionCode: rejected ? `malware_${malware.result}` : null,
      reviewReason: accepted ? null : rejected ? 'Malware policy rejected the upload.' : 'A production malware scanner is unavailable; human review cannot replace malware inspection.',
      findings: [
        { code: 'bounded_streamed_header_decode', severity: 'info', detail: 'File signature and dimensions were decoded from a bounded file prefix after a streamed hash-verified object read.' },
        { code: 'malware_policy', severity: accepted ? 'info' : rejected ? 'error' : 'warning', scanner: malware.scanner, scannerVersion: malware.version, result: malware.result },
        { code: 'biological_interpretation_unavailable', severity: 'warning', detail: 'Byte-derived image facts are not biological phenotype, genotype, disease, flavor, yield, or pungency claims.' },
      ],
    };
    guard.assertActive();
    await pool.query('SELECT app_worker_complete_media_inspection($1,$2,$3::jsonb)', [job.id, workerId, JSON.stringify(result)]);
  } finally {
    await materialized.cleanup();
  }
}


interface ExtractedPassage {
  passageIndex: number;
  passageText: string;
  passageSha256: string;
  tokenCount: number;
  characterStart: number;
  characterEnd: number;
  locator: string;
}

function normalizedResearchText(bytes: Uint8Array, mediaType: string): string {
  if (mediaType !== 'text/plain' && mediaType !== 'text/markdown') {
    throw Object.assign(new Error('Only UTF-8 plain text and Markdown have an approved deterministic extractor in this deployment.'), { code: 'research_media_type_unavailable' });
  }
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw Object.assign(new Error('Research source is not valid UTF-8.'), { code: 'research_invalid_utf8' });
  }
  const withoutBom = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
  const normalized = withoutBom.replace(/\r\n?/g, '\n');
  if (normalized.includes('\u0000')) throw Object.assign(new Error('Research source contains a NUL character.'), { code: 'research_invalid_text' });
  if (!normalized.trim()) throw Object.assign(new Error('Research source contains no reviewable text.'), { code: 'research_empty_source' });
  return normalized;
}

function passageChunks(textValue: string, maximumCharacters = 4_000): ExtractedPassage[] {
  const passages: ExtractedPassage[] = [];
  const paragraphPattern = /(?:^|\n{2,})([^\n](?:.|\n(?!\n{2,}))*?)(?=\n{2,}|$)/gs;
  for (const match of textValue.matchAll(paragraphPattern)) {
    const raw = match[1] ?? '';
    const base = (match.index ?? 0) + match[0]!.indexOf(raw);
    let left = 0;
    while (left < raw.length && /\s/.test(raw[left]!)) left += 1;
    let right = raw.length;
    while (right > left && /\s/.test(raw[right - 1]!)) right -= 1;
    let cursor = left;
    while (cursor < right) {
      let end = Math.min(cursor + maximumCharacters, right);
      if (end < right) {
        const boundary = raw.lastIndexOf(' ', end);
        if (boundary > cursor + Math.floor(maximumCharacters * 0.6)) end = boundary;
      }
      const passageText = raw.slice(cursor, end).trim();
      if (passageText) {
        const leading = raw.slice(cursor, end).indexOf(passageText);
        const characterStart = base + cursor + Math.max(0, leading);
        const characterEnd = characterStart + passageText.length;
        passages.push({
          passageIndex: passages.length,
          passageText,
          passageSha256: createHash('sha256').update(passageText).digest('hex'),
          tokenCount: passageText.split(/\s+/u).filter(Boolean).length,
          characterStart,
          characterEnd,
          locator: `chars:${characterStart}-${characterEnd}`,
        });
      }
      cursor = end;
      while (cursor < right && /\s/.test(raw[cursor]!)) cursor += 1;
      if (passages.length > 10_000) throw Object.assign(new Error('Research source produced too many passages.'), { code: 'research_passage_limit_exceeded' });
    }
  }
  if (passages.length === 0) throw Object.assign(new Error('Research source produced no reviewable passages.'), { code: 'research_empty_extraction' });
  return passages;
}

async function ingestResearch(job: ClaimedJob, guard: LeaseGuard): Promise<void> {
  const payload = record(job.payload, 'payload');
  const documentId = text(payload.documentId, 'payload.documentId');
  const objectKey = text(payload.objectKey, 'payload.objectKey');
  const sourceSha256 = text(payload.sourceSha256, 'payload.sourceSha256');
  const mediaType = text(payload.mediaType, 'payload.mediaType');
  await guard.refresh();
  const materialized = await materializeObjectToTemporaryFile(objectKey, sourceSha256, 10 * 1024 * 1024, guard);
  try {
    const bytes = new Uint8Array(await readFile(materialized.filePath));
    const normalizedText = normalizedResearchText(bytes, mediaType);
    const passages = passageChunks(normalizedText);
    for (let index = 0; index < passages.length; index += 100) {
      await guard.refresh();
    }
    const artifactPayload = {
      schemaVersion: '1.0',
      sourceSha256,
      mediaType,
      normalization: 'utf8-bom-strip+crlf-to-lf',
      normalizedText,
    };
    const artifactBytes = new TextEncoder().encode(`${JSON.stringify(artifactPayload)}\n`);
    const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
    const artifactObjectKey = buildImmutableObjectKey({
      workspaceId: job.workspaceId,
      entityType: 'research-extractions',
      entityId: documentId,
      sourceSha256: artifactSha256,
      extension: 'json',
    });
    await putImmutableObject(storageConfig(), artifactObjectKey, artifactBytes, 'application/json');
    await guard.refresh();
    const result = {
      documentId,
      sourceSha256,
      artifactSha256,
      artifactObjectKey,
      extractorName: 'capsicum-deterministic-text',
      extractorVersion: '1.0.0',
      pageCount: null,
      extractionMetadata: {
        mediaType,
        sourceByteLength: bytes.byteLength,
        normalizedCharacterCount: normalizedText.length,
        passageCount: passages.length,
        tokenCountMethod: 'unicode-whitespace-approximation',
        normalization: 'utf8-bom-strip+crlf-to-lf',
      },
      passages,
    };
    guard.assertActive();
    await pool.query('SELECT app_worker_complete_research_ingestion($1,$2,$3::jsonb)', [job.id, workerId, JSON.stringify(result)]);
  } finally {
    await materialized.cleanup();
  }
}

async function readVerifiedMedia(payload: JsonRecord, guard: LeaseGuard): Promise<MaterializedObject> {
  const objectKey = text(payload.objectKey, 'payload.objectKey');
  const sourceSha256 = text(payload.sourceSha256, 'payload.sourceSha256');
  await guard.refresh();
  return materializeObjectToTemporaryFile(objectKey, sourceSha256, maximumMediaBytes, guard);
}

async function createMediaDerivatives(job: ClaimedJob, guard: LeaseGuard): Promise<void> {
  const payload = record(job.payload, 'payload');
  const mediaObjectId = text(payload.mediaObjectId, 'payload.mediaObjectId');
  const materialized = await readVerifiedMedia(payload, guard);
  const sourceSha256 = materialized.sourceSha256;
  try {
    const outputs = await createDeterministicDerivatives(materialized.filePath);
    const derivatives: Array<Record<string, unknown>> = [];
    for (const output of outputs) {
      guard.assertActive();
      const resultSha256 = createHash('sha256').update(output.bytes).digest('hex');
      const objectKey = buildImmutableObjectKey({
        workspaceId: job.workspaceId, entityType: 'media-derivatives', entityId: mediaObjectId,
        sourceSha256: resultSha256, extension: output.extension,
      });
      await putImmutableObject(storageConfig(), objectKey, output.bytes, output.mediaType);
      derivatives.push({
        derivativeType: output.derivativeType, sourceSha256, algorithmName: output.algorithmName,
        algorithmVersion: output.algorithmVersion, parameters: output.parameters, objectKey, resultSha256,
        widthPx: output.widthPx, heightPx: output.heightPx,
      });
      await guard.refresh();
    }
    await pool.query('SELECT app_worker_complete_media_derivatives($1,$2,$3::jsonb)', [
      job.id, workerId, JSON.stringify({ sourceSha256, derivatives }),
    ]);
  } finally {
    await materialized.cleanup();
  }
}

async function createPhenotypeMeasurements(job: ClaimedJob, guard: LeaseGuard): Promise<void> {
  const payload = record(job.payload, 'payload');
  const captureId = text(payload.captureId, 'payload.captureId');
  const materialized = await readVerifiedMedia(payload, guard);
  const sourceSha256 = materialized.sourceSha256;
  try {
    const facts = await verifiedImageFacts(materialized.filePath, sourceSha256);
    const common = { algorithmName: facts.algorithmName, algorithmVersion: facts.algorithmVersion };
    const measurements = [
      { ...common, measurementKey: 'image_width_px', valuePayload: { value: facts.width, unit: 'pixel', authority: 'machine_observed', parityEvidence: facts.parityEvidence } },
      { ...common, measurementKey: 'image_height_px', valuePayload: { value: facts.height, unit: 'pixel', authority: 'machine_observed', parityEvidence: facts.parityEvidence } },
      { ...common, measurementKey: 'mean_luminance_0_255', valuePayload: { value: facts.meanLuminance, unit: '0-255', authority: 'machine_observed', parityEvidence: facts.parityEvidence } },
      { ...common, measurementKey: 'luminance_standard_deviation_0_255', valuePayload: { value: facts.luminanceStandardDeviation, unit: '0-255', authority: 'machine_observed', parityEvidence: facts.parityEvidence } },
    ];
    await guard.refresh();
    await pool.query('SELECT app_worker_complete_phenotype_measurements($1,$2,$3::jsonb)', [
      job.id, workerId, JSON.stringify({ captureId, sourceSha256, measurements }),
    ]);
  } finally {
    await materialized.cleanup();
  }
}

const EXPORT_SECTIONS = [
  'materials', 'accessions', 'seedLots', 'plants', 'locations', 'movements',
  'inventoryEvents', 'inventoryReservations', 'inventoryExceptions',
  'crosses', 'crossEvents', 'crossVerifications', 'fruits', 'seedHarvests', 'families',
  'genotypeCalls', 'experiments', 'observationSessions', 'observations', 'observationRevisions',
  'simulationRuns', 'simulationRequests', 'selectionPlans', 'selectionAnalyses',
  'mediaObjects', 'phenotypeCaptures', 'phenotypeMeasurements',
] as const;

interface ExportPage {
  rows: unknown[];
  nextAfter: string | null;
  hasMore: boolean;
}

async function writeHashed(
  stream: ReturnType<typeof createWriteStream>,
  hash: ReturnType<typeof createHash>,
  value: string,
): Promise<void> {
  const bytes = Buffer.from(value, 'utf8');
  hash.update(bytes);
  if (!stream.write(bytes)) await once(stream, 'drain');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function createExport(job: ClaimedJob, guard: LeaseGuard): Promise<void> {
  const payload = record(job.payload, 'payload');
  const exportJobId = text(payload.exportJobId, 'payload.exportJobId');
  const format = text(payload.format, 'payload.format');
  const requestedSchemaVersion = text(payload.schemaVersion, 'payload.schemaVersion');
  if (format !== 'json' && format !== 'csv') throw new TypeError('Export format must be json or csv.');
  const directory = await mkdtemp(join(tmpdir(), 'capsicum-export-'));
  const filePath = join(directory, `breeding-ledger.${format}`);
  const stream = createWriteStream(filePath, { flags: 'wx', mode: 0o600, highWaterMark: 1024 * 1024 });
  const hash = createHash('sha256');
  const sectionCounts: Record<string, number> = {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const contextResult = await client.query<{ context: JsonRecord }>(
      'SELECT app_worker_breeding_ledger_export_context($1,$2) AS context',
      [job.id, workerId],
    );
    const context = contextResult.rows[0]?.context;
    if (
      !context
      || context.exportJobId !== exportJobId
      || context.format !== format
      || context.schemaVersion !== requestedSchemaVersion
      || context.schemaVersion !== BREEDING_LEDGER_SCHEMA_VERSION
    ) {
      throw Object.assign(new Error('Export context does not match the immutable job request.'), { code: 'export_context_mismatch' });
    }
    const manifest = createBreedingLedgerManifest({
      exportJobId,
      workspaceId: text(context.workspaceId, 'export context workspaceId'),
      requestedAt: text(context.requestedAt, 'export context requestedAt'),
      snapshotAt: text(context.snapshotAt, 'export context snapshotAt'),
      generatedAt: new Date().toISOString(),
      softwareReleaseIdentifier,
    });
    if (format === 'json') {
      await writeHashed(stream, hash, JSON.stringify(manifest).replace(/}\s*$/, ''));
    } else {
      await writeHashed(stream, hash, 'section,record_json\n');
      await writeHashed(stream, hash, `${csvCell('manifest')},${csvCell(JSON.stringify(manifest))}\n`);
    }
    for (const [sectionIndex, section] of EXPORT_SECTIONS.entries()) {
      guard.assertActive();
      let afterId: string | null = null;
      let firstRow = true;
      let count = 0;
      if (format === 'json') await writeHashed(stream, hash, `,"${section}":[`);
      do {
        const pageResult: { rows: Array<{ page: ExportPage }> } = await client.query<{ page: ExportPage }>(
          'SELECT app_worker_breeding_ledger_page($1,$2,$3,$4,$5) AS page',
          [job.id, workerId, section, afterId, 1000],
        );
        const page: ExportPage | undefined = pageResult.rows[0]?.page;
        if (!page || !Array.isArray(page.rows)) throw new Error(`Export page ${section} was malformed.`);
        for (const row of page.rows) {
          const serialized = JSON.stringify(row);
          if (format === 'json') {
            await writeHashed(stream, hash, `${firstRow ? '' : ','}${serialized}`);
            firstRow = false;
          } else {
            await writeHashed(stream, hash, `${csvCell(section)},${csvCell(serialized)}\n`);
          }
          count += 1;
        }
        afterId = page.nextAfter;
        if (page.hasMore && !afterId) throw new Error(`Export page ${section} did not advance its cursor.`);
        if (!page.hasMore) break;
        await guard.refresh();
      } while (true);
      sectionCounts[section] = count;
      if (format === 'json') await writeHashed(stream, hash, ']');
      if (sectionIndex % 4 === 3) await guard.refresh();
    }
    if (format === 'json') await writeHashed(stream, hash, '}\n');
    await client.query('COMMIT');
    stream.end();
    await once(stream, 'finish');
    const contentSha256 = hash.digest('hex');
    const objectKey = buildImmutableObjectKey({
      workspaceId: job.workspaceId,
      entityType: 'exports',
      entityId: exportJobId,
      sourceSha256: contentSha256,
      extension: format,
    });
    const mediaType = format === 'json' ? 'application/json' : 'text/csv';
    const uploaded = await putImmutableFile(storageConfig(), objectKey, filePath, mediaType);
    const metadata = await stat(filePath);
    if (uploaded.byteLength !== metadata.size || uploaded.sha256 !== contentSha256) {
      throw new Error('Streamed export artifact verification failed before completion.');
    }
    await guard.refresh();
    await pool.query('SELECT app_worker_complete_export($1,$2,$3,$4,$5,$6,$7::jsonb)', [
      job.id,
      workerId,
      objectKey,
      contentSha256,
      uploaded.byteLength,
      mediaType,
      JSON.stringify({
        exportJobId,
        format,
        schemaVersion: context.schemaVersion,
        sectionCounts,
        requestedAt: manifest.requestedAt,
        snapshotAt: manifest.snapshotAt,
        generatedAt: manifest.generatedAt,
        softwareReleaseIdentifier: manifest.softwareReleaseIdentifier,
        scientificProfile: manifest.scientificProfile,
      }),
    ]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    stream.destroy();
    throw error;
  } finally {
    client.release();
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}


async function cleanupPendingObjects(job: ClaimedJob, guard: LeaseGuard): Promise<{
  mode: 'dry_run' | 'delete';
  candidates: number;
  deleted: number;
  failed: number;
  sample: Array<{ id: string; objectKey: string; sourceSha256: string; cleanupReason: string }>;
  scannedObjects: number;
  scanTruncated: boolean;
  discoveredCandidates?: number;
  registeredOrphans?: number;
  referencedObjects: number;
}> {
  const payload = record(job.payload, 'storage cleanup payload');
  const dryRun = payload.dryRun === true;
  const deletionLimit = integer(payload.deletionLimit, 'storage cleanup deletionLimit', 1, 500);
  const scanLimit = integer(payload.scanLimit, 'storage cleanup scanLimit', 1, 1_000);
  const retentionHours = integer(payload.retentionHours, 'storage cleanup retentionHours', 1, 8_760);
  const expectedPrefix = `workspaces/${job.workspaceId}/`;
  if (text(payload.workspaceId, 'storage cleanup workspaceId') !== job.workspaceId
      || text(payload.prefix, 'storage cleanup prefix') !== expectedPrefix) {
    throw Object.assign(new Error('Storage cleanup payload is not bound to the claimed workspace.'), { code: 'cleanup_workspace_mismatch' });
  }
  if (retentionHours < 24 && process.env.APP_MODE === 'production') {
    throw Object.assign(new Error('Production storage cleanup requires at least 24 hours of retention.'), { code: 'cleanup_retention_rejected' });
  }

  const listed = await listObjects(storageConfig(), expectedPrefix, scanLimit);
  let discoveredCandidates = 0;
  let registeredOrphans = 0;
  let referencedObjects = 0;
  for (const object of listed.objects) {
    await guard.refresh();
    const fileName = object.key.split('/').pop() ?? '';
    const sourceSha256 = /^([a-f0-9]{64})\./.exec(fileName)?.[1];
    if (!sourceSha256) continue;
    const classification = await pool.query<{ classification: string }>(
      'SELECT app_worker_reconcile_discovered_storage_object($1,$2,$3,$4,$5,$6,$7)::text AS classification',
      [job.id, workerId, object.key, sourceSha256, object.byteLength, object.lastModified, !dryRun],
    );
    const value = classification.rows[0]?.classification;
    if (value === 'orphan_candidate') discoveredCandidates += 1;
    else if (value === 'registered_orphan') registeredOrphans += 1;
    else if (value === 'referenced') referencedObjects += 1;
  }

  if (dryRun) {
    const preview = await pool.query<{
      id: string;
      object_key: string;
      source_sha256: string;
      cleanup_reason: string;
      reference_count: number;
    }>(
      'SELECT id::text, object_key, source_sha256, cleanup_reason, reference_count FROM app_worker_preview_pending_object_cleanup($1,$2,$3)',
      [job.id, workerId, deletionLimit],
    );
    await guard.refresh();
    const sample = preview.rows.slice(0, 25).map((candidate) => ({
      id: candidate.id,
      objectKey: candidate.object_key,
      sourceSha256: candidate.source_sha256,
      cleanupReason: candidate.cleanup_reason,
    }));
    await pool.query('SELECT app_worker_record_storage_cleanup_preview($1,$2,$3,$4::jsonb)', [
      job.id,
      workerId,
      preview.rowCount ?? preview.rows.length,
      JSON.stringify(sample),
    ]);
    return { mode: 'dry_run', candidates: (preview.rowCount ?? preview.rows.length) + discoveredCandidates, deleted: 0, failed: 0, sample, scannedObjects: listed.objects.length, scanTruncated: listed.truncated, discoveredCandidates, referencedObjects };
  }

  const claimed = await pool.query<{
    id: string;
    object_key: string;
    source_sha256: string;
  }>('SELECT id::text, object_key, source_sha256 FROM app_worker_claim_pending_object_cleanup($1,$2,$3)', [job.id, workerId, deletionLimit]);
  let deleted = 0;
  let failed = 0;
  const sample = claimed.rows.slice(0, 25).map((candidate) => ({
    id: candidate.id,
    objectKey: candidate.object_key,
    sourceSha256: candidate.source_sha256,
    cleanupReason: 'eligible_unreferenced_object',
  }));
  for (const candidate of claimed.rows) {
    await guard.refresh();
    try {
      await deleteObject(storageConfig(), candidate.object_key);
      await pool.query('SELECT app_worker_finalize_pending_object_cleanup($1,$2,$3,$4,$5)', [job.id, workerId, candidate.id, true, null]);
      deleted += 1;
    } catch (error) {
      const failure = safeError(error);
      await pool.query('SELECT app_worker_finalize_pending_object_cleanup($1,$2,$3,$4,$5)', [job.id, workerId, candidate.id, false, failure.code]).catch(() => undefined);
      failed += 1;
    }
  }
  return { mode: 'delete', candidates: claimed.rowCount ?? claimed.rows.length, deleted, failed, sample, scannedObjects: listed.objects.length, scanTruncated: listed.truncated, registeredOrphans, referencedObjects };
}

async function executeJob(job: ClaimedJob, guard: LeaseGuard): Promise<'finalized' | { result: unknown }> {
  if (job.contractVersion !== CONTRACT_VERSION) throw Object.assign(new Error(`Unsupported contract version ${job.contractVersion}.`), { code: 'unsupported_contract_version' });
  if (job.jobType === 'worker.health.v1') return { result: { status: 'ok', authority: 'operational', workerVersion: WORKER_VERSION, capabilities: SUPPORTED_JOBS } };
  if (job.jobType === 'genetics.direct-inheritance-monte-carlo.v1') {
    const result = await runMonteCarlo(job.payload, guard);
    const resultHash = stableContentHash({ jobType: job.jobType, contractVersion: job.contractVersion, payload: job.payload, result });
    await guard.refresh();
    await pool.query('SELECT app_worker_complete_advanced_simulation($1,$2,$3::jsonb,$4)', [job.id, workerId, JSON.stringify(result), resultHash]);
    return 'finalized';
  }
  if (job.jobType === 'media.inspect.v1') { await inspectMedia(job, guard); return 'finalized'; }
  if (job.jobType === 'media.derivatives.v1') { await createMediaDerivatives(job, guard); return 'finalized'; }
  if (job.jobType === 'media.measurements.v1') { await createPhenotypeMeasurements(job, guard); return 'finalized'; }
  if (job.jobType === 'research.ingest.v1') { await ingestResearch(job, guard); return 'finalized'; }
  if (job.jobType === 'export.breeding-ledger.v1') { await createExport(job, guard); return 'finalized'; }
  if (job.jobType === 'storage.cleanup.v1') return { result: await cleanupPendingObjects(job, guard) };
  throw Object.assign(new Error(`Unsupported job type ${job.jobType}.`), { code: 'unsupported_job_type' });
}

async function runLoop(): Promise<void> {
  let lastRecovery = 0;
  await recordHeartbeat(null);
  while (!stopping) {
    const now = Date.now();
    if (now - lastRecovery >= 30_000) {
      await pool.query('SELECT app_recover_expired_jobs($1)', [100]);
      await pool.query('SELECT app_recover_expired_outbox($1)', [100]);
      await pool.query('SELECT app_worker_enqueue_storage_cleanup()');
      lastRecovery = now;
    }
    const job = await claim();
    if (!job) {
      await recordHeartbeat(null);
      await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
      continue;
    }
    log('job.claimed', { jobId: job.id, jobType: job.jobType, attempt: job.attempt });
    const guard = new LeaseGuard(job);
    guard.start();
    try {
      if (await cancellationRequested(job.id)) {
        await pool.query('SELECT app_cancel_leased_job($1,$2)', [job.id, workerId]);
        continue;
      }
      await recordHeartbeat(job.id);
      const execution = await executeJob(job, guard);
      guard.assertActive();
      if (execution !== 'finalized') {
        await pool.query('SELECT app_complete_job($1,$2,$3::jsonb)', [job.id, workerId, JSON.stringify(execution.result)]);
      }
      log('job.completed', { jobId: job.id, jobType: job.jobType });
    } catch (error) {
      const failure = safeError(error);
      if (failure.code === 'job_cancelled') {
        await pool.query('SELECT app_cancel_leased_job($1,$2)', [job.id, workerId]).catch(() => undefined);
      } else {
        await pool.query('SELECT app_fail_job($1,$2,$3,$4::jsonb,$5)', [job.id, workerId, failure.code, JSON.stringify(failure.detail), 10]).catch((reportError: unknown) => {
          log('job.failure_report_failed', { jobId: job.id, error: safeError(reportError) });
        });
      }
      log('job.failed', { jobId: job.id, jobType: job.jobType, code: failure.code });
    } finally {
      guard.stop();
      await recordHeartbeat(null).catch(() => undefined);
    }
  }
}

runLoop()
  .catch((error: unknown) => { console.error(JSON.stringify({ event: 'worker.fatal', workerId, error: redact(safeError(error)) })); process.exitCode = 1; })
  .finally(async () => { await pool.end(); });
