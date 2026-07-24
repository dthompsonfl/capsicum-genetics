import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import process from 'node:process';

const root = resolve(process.cwd());
const output = resolve(process.env.EVIDENCE_OUTPUT || 'artifacts/release-evidence');
const excludedDirectories = new Set(['.git', '.next', '.turbo', '.validation', 'node_modules', 'dist', 'coverage', 'artifacts']);
const excludedPrefixes = ['docs/v3-evidence/', 'docs/v4-evidence/', 'docs/v5-evidence/', 'docs/v6-evidence/'];

function normalize(path) { return path.split(sep).join('/'); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function filesUnder(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const path = normalize(relative(root, absolute));
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name) || excludedPrefixes.some((prefix) => `${path}/`.startsWith(prefix))) continue;
      found.push(...await filesUnder(absolute));
    } else if (entry.isFile()) {
      if (!excludedPrefixes.some((prefix) => path.startsWith(prefix))) found.push(absolute);
    }
  }
  return found;
}

const files = (await filesUnder(root)).sort((left, right) => normalize(relative(root, left)).localeCompare(normalize(relative(root, right))));
const entries = [];
for (const absolute of files) {
  const bytes = await readFile(absolute);
  const metadata = await stat(absolute);
  entries.push({ path: normalize(relative(root, absolute)), byteLength: metadata.size, sha256: digest(bytes) });
}
const checksumPayload = entries.map((entry) => `${entry.sha256}  ${entry.path}`).join('\n') + '\n';
const sourceTreeSha256 = digest(Buffer.from(entries.map((entry) => `${entry.path}\0${entry.byteLength}\0${entry.sha256}\n`).join(''), 'utf8'));
const manifest = {
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  sourceTreeSha256,
  fileCount: entries.length,
  provenance: {
    commitSha: process.env.GITHUB_SHA || process.env.SOURCE_COMMIT_SHA || 'unavailable-no-git-metadata',
    repository: process.env.GITHUB_REPOSITORY || 'local',
    workflow: process.env.GITHUB_WORKFLOW || 'local',
    runId: process.env.GITHUB_RUN_ID || 'local',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || 'local',
    runnerOs: process.env.RUNNER_OS || process.platform,
    nodeVersion: process.version,
    pnpmVersion: process.env.PNPM_VERSION || 'unavailable',
  },
  evidencePolicy: 'docs/evidence/README.md',
  checksumManifest: 'source-tree.sha256',
};
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(resolve(output, 'source-tree.sha256'), checksumPayload, { mode: 0o600 });
await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(manifest, null, 2));
