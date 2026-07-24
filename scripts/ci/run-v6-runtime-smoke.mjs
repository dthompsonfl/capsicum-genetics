import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadTypeScript() {
  try {
    return await import('typescript');
  } catch {
    const configured = process.env.TYPESCRIPT_MODULE_PATH;
    if (!configured) throw new Error('typescript package or TYPESCRIPT_MODULE_PATH is required.');
    return import(pathToFileURL(configured).href);
  }
}

const ts = await loadTypeScript();

async function loadTypeScriptModule(sourcePath, outputDirectory, outputName) {
  const source = await (await import('node:fs/promises')).readFile(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      verbatimModuleSyntax: true,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  });
  const failures = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(failures.length, 0, `Transpile diagnostics for ${sourcePath}: ${JSON.stringify(failures)}`);
  const outputPath = join(outputDirectory, outputName);
  await writeFile(outputPath, result.outputText, { mode: 0o600, flag: 'wx' });
  return import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
}

async function readBody(stream) {
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    chunks.push(bytes);
    length += bytes.byteLength;
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

const work = await mkdtemp(join(tmpdir(), 'capsicum-v6-runtime-smoke-'));
try {
  const storage = await loadTypeScriptModule('packages/storage/src/index.ts', work, 'storage.mjs');
  const redirect = await loadTypeScriptModule('apps/web/src/lib/safe-redirect.ts', work, 'safe-redirect.mjs');

  const signerConfig = {
    endpoint: 'https://storage.example.test/base',
    region: 'us-east-1',
    bucket: 'capsicum',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'example-secret-key',
  };
  const emptyHash = createHash('sha256').update(new Uint8Array()).digest('hex');
  const now = new Date('2026-01-02T03:04:05.000Z');
  const getRequest = storage.buildSignedS3Request(signerConfig, {
    method: 'GET', key: 'workspaces/ws-1/media/a.bin', payloadHash: emptyHash, headers: { range: 'bytes=0-3' }, now,
  });
  const putRequest = storage.buildSignedS3Request(signerConfig, {
    method: 'PUT', key: 'workspaces/ws-1/media/a.bin', payloadHash: emptyHash, contentType: 'application/octet-stream', now,
  });
  assert.equal(getRequest.canonicalRequest.split('\n', 1)[0], 'GET');
  assert.equal(putRequest.canonicalRequest.split('\n', 1)[0], 'PUT');
  assert.match(getRequest.signedHeaders, /range/);
  assert.notEqual(getRequest.headers.authorization, putRequest.headers.authorization);
  const listRequest = storage.buildSignedS3Request(signerConfig, {
    method: 'GET', key: '', payloadHash: emptyHash, query: { prefix: 'workspaces/ws-1/', 'list-type': '2', 'max-keys': '25' }, now,
  });
  assert.equal(listRequest.canonicalRequest.split('\n')[2], 'list-type=2&max-keys=25&prefix=workspaces%2Fws-1%2F');

  const objectRoot = join(work, 'objects');
  const config = { endpoint: pathToFileURL(objectRoot).href, region: 'us-east-1', bucket: 'capsicum-local' };
  const bytes = new TextEncoder().encode('capsicum-v6-object-roundtrip');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const key = storage.buildImmutableObjectKey({
    workspaceId: 'workspace-1', entityType: 'research', entityId: 'document-1', sourceSha256: digest, extension: 'txt',
  });
  await storage.putImmutableObject(config, key, bytes, 'text/plain');
  await storage.putImmutableObject(config, key, bytes, 'text/plain');
  assert.deepEqual(Buffer.from(await storage.getObject(config, key)), Buffer.from(bytes));

  const full = await storage.openObject(config, key);
  assert.equal(full.status, 200);
  assert.deepEqual(Buffer.from(await readBody(full.body)), Buffer.from(bytes));
  const ranged = await storage.openObject(config, key, 'bytes=1-4');
  assert.equal(ranged.status, 206);
  assert.equal(new TextDecoder().decode(await readBody(ranged.body)), 'apsi');
  assert.equal(ranged.contentRange, `bytes 1-4/${bytes.byteLength}`);
  await assert.rejects(() => storage.openObject(config, key, `bytes=${bytes.byteLength}-`), /not satisfiable/i);

  const sourceFile = join(work, 'source.txt');
  await writeFile(sourceFile, bytes, { mode: 0o600, flag: 'wx' });
  const fileKey = storage.buildImmutableObjectKey({
    workspaceId: 'workspace-1', entityType: 'exports', entityId: 'export-1', sourceSha256: digest, extension: 'json',
  });
  const fileResult = await storage.putImmutableFile(config, fileKey, sourceFile, 'application/json');
  assert.equal(fileResult.sha256, digest);
  assert.equal(fileResult.byteLength, bytes.byteLength);
  const listed = await storage.listObjects(config, 'workspaces/workspace-1/', 10);
  assert.equal(listed.truncated, false);
  assert.deepEqual(listed.objects.map((entry) => entry.key), [fileKey, key].sort());
  assert.ok(listed.objects.every((entry) => entry.byteLength === bytes.byteLength));

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2x9sAAAAASUVORK5CYII=', 'base64');
  const pngPath = join(work, 'pixel.png');
  await writeFile(pngPath, png, { mode: 0o600, flag: 'wx' });
  const detected = await storage.inspectUploadFile(pngPath, 'image/png');
  assert.equal(detected.mimeType, 'image/png');
  assert.equal(detected.width, 1);
  assert.equal(detected.height, 1);
  assert.equal(detected.sourceSha256, createHash('sha256').update(png).digest('hex'));

  assert.equal(redirect.safeInternalDestination('/dashboard?tab=plants#active', '/', 'https://capsicum.example'), '/dashboard?tab=plants#active');
  for (const unsafe of ['//evil.example', '/\\evil.example', '/%5cevil.example', 'https://evil.example', '/%0d%0aLocation:%20https://evil.example']) {
    assert.equal(redirect.safeInternalDestination(unsafe, '/safe', 'https://capsicum.example'), '/safe');
  }

  assert.equal(await storage.deleteObject(config, key), 'deleted');
  assert.equal(await storage.deleteObject(config, key), 'missing');

  console.log(JSON.stringify({
    schemaVersion: '1.0',
    passed: true,
    checks: [
      'sigv4-actual-method', 'sigv4-range-header', 'local-immutable-put', 'local-full-get', 'local-range-get',
      'range-416-equivalent', 'streamed-file-put', 'bounded-prefix-list', 'upload-file-inspection', 'safe-internal-redirect', 'object-delete',
    ],
  }, null, 2));
} finally {
  await rm(work, { recursive: true, force: true });
}
