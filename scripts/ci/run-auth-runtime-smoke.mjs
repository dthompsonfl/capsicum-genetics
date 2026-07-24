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
const work = await mkdtemp(join(tmpdir(), 'capsicum-auth-runtime-smoke-'));
try {
  const sourcePath = 'packages/auth/src/index.ts';
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
  assert.equal(failures.length, 0, `Auth transpile diagnostics: ${JSON.stringify(failures)}`);
  const outputPath = join(work, 'auth.mjs');
  await writeFile(outputPath, result.outputText, { mode: 0o600, flag: 'wx' });
  const auth = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

  const installationToken = 'installation-token-with-more-than-thirty-two-characters';
  const installationDigest = auth.hashInstallationToken(installationToken);
  assert.match(installationDigest, /^[a-f0-9]{64}$/);
  assert.equal(auth.verifyInstallationToken(installationToken, installationDigest), true);
  assert.equal(auth.verifyInstallationToken(`${installationToken}-wrong`, installationDigest), false);

  const rfc = auth.verifyTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', {
    now: new Date(59_000),
    window: 0,
  });
  assert.deepEqual(rfc, { valid: true, step: 1 });
  assert.equal(auth.verifyTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', {
    now: new Date(59_000),
    window: 0,
    lastUsedStep: 1,
  }).valid, false);

  const encryptionKey = 'a'.repeat(64);
  const totpSecret = auth.createTotpSecret();
  assert.match(totpSecret, /^[A-Z2-7]+$/);
  const encrypted = auth.encryptTotpSecret(totpSecret, encryptionKey);
  assert.equal(auth.decryptTotpSecret(encrypted, encryptionKey), totpSecret);
  await assert.rejects(async () => auth.decryptTotpSecret(`${encrypted}A`, encryptionKey));

  const recoveryCodes = auth.createRecoveryCodes();
  assert.equal(recoveryCodes.length, 10);
  assert.equal(new Set(recoveryCodes).size, recoveryCodes.length);
  assert.ok(recoveryCodes.every((code) => /^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/.test(code)));
  const recoverySecret = 'r'.repeat(32);
  assert.equal(
    auth.hashRecoveryCode(recoveryCodes[0], recoverySecret),
    auth.hashRecoveryCode(recoveryCodes[0].toLowerCase().replaceAll('-', ' '), recoverySecret),
  );

  assert.equal(auth.isPrivilegedWorkspaceRole('owner'), true);
  assert.equal(auth.isPrivilegedWorkspaceRole('scientific_reviewer'), true);
  assert.equal(auth.isPrivilegedWorkspaceRole('breeder'), false);

  const passwordHash = await auth.hashPassword('Orchard-Quartz-47-Canopy!');
  assert.equal(await auth.verifyPassword('Orchard-Quartz-47-Canopy!', passwordHash), true);
  assert.equal(await auth.verifyPassword('incorrect-password', passwordHash), false);

  console.log(JSON.stringify({
    schemaVersion: '1.0',
    passed: true,
    checks: [
      'installation-token-proof',
      'totp-rfc-vector',
      'totp-replay-rejection',
      'totp-authenticated-encryption',
      'recovery-code-generation-and-normalization',
      'privileged-role-classification',
      'password-hash-roundtrip',
    ],
  }, null, 2));
} finally {
  await rm(work, { recursive: true, force: true });
}
