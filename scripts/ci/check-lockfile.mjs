import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const expectedManager = manifest.packageManager;
assert.equal(expectedManager, 'pnpm@10.14.0', 'package.json must pin pnpm@10.14.0.');

try {
  await access('pnpm-lock.yaml');
} catch {
  throw new Error([
    'pnpm-lock.yaml is missing. Dependency installation, CI, SBOM generation, and container builds are not reproducible.',
    'From a trusted networked development environment, run: corepack enable && corepack prepare pnpm@10.14.0 --activate && pnpm install --lockfile-only',
    'Review the complete lockfile diff, run pnpm install --frozen-lockfile, and commit the lockfile before release.',
  ].join('\n'));
}

const lockfile = await readFile('pnpm-lock.yaml', 'utf8');
assert.match(lockfile, /^lockfileVersion:/m, 'pnpm-lock.yaml does not contain a lockfileVersion.');
assert.match(lockfile, /^importers:/m, 'pnpm-lock.yaml does not contain workspace importers.');
console.log(JSON.stringify({ passed: true, packageManager: expectedManager, lockfile: 'pnpm-lock.yaml' }));
