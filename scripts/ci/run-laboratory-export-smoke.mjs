import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
const work = await mkdtemp(join(tmpdir(), 'capsicum-laboratory-export-smoke-'));
try {
  const sourcePath = 'packages/contracts/src/laboratory-export.ts';
  const source = await readFile(sourcePath, 'utf8');
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
  assert.equal(failures.length, 0, `Laboratory export transpile diagnostics: ${JSON.stringify(failures)}`);
  const outputPath = join(work, 'laboratory-export.mjs');
  await writeFile(outputPath, result.outputText, { mode: 0o600, flag: 'wx' });
  const exports = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

  const manifest = exports.createBreedingLedgerManifest({
    exportJobId: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',
    requestedAt: '2026-07-24T04:59:00+00:00',
    snapshotAt: '2026-07-24T05:00:00.000Z',
    generatedAt: '2026-07-24T05:00:01.000Z',
    softwareReleaseIdentifier: 'a'.repeat(40),
  });
  assert.equal(manifest.schemaVersion, '3.1');
  assert.equal(manifest.requestedAt, '2026-07-24T04:59:00.000Z');
  assert.equal(manifest.scientificProfile.parentDirection, 'maternal-and-paternal-identities-preserved');
  assert.deepEqual(manifest.scientificProfile.standardsMappings, {
    miappe: 'not_implemented',
    brapi: 'not_implemented',
    mcpd: 'not_implemented',
  });

  assert.throws(() => exports.createBreedingLedgerManifest({
    ...manifest,
    requestedAt: '2026-07-24T05:01:00.000Z',
  }), /requestedAt/);
  assert.throws(() => exports.createBreedingLedgerManifest({
    ...manifest,
    generatedAt: '2026-07-24T04:59:59.000Z',
  }), /snapshotAt/);
  assert.throws(() => exports.createBreedingLedgerManifest({
    ...manifest,
    softwareReleaseIdentifier: 'latest',
  }), /immutable/);

  console.log(JSON.stringify({
    schemaVersion: '1.0',
    passed: true,
    checks: [
      'canonical-utc-timestamps',
      'request-snapshot-generation-order',
      'immutable-software-release',
      'explicit-parent-direction',
      'honest-interoperability-status',
    ],
  }, null, 2));
} finally {
  await rm(work, { recursive: true, force: true });
}
