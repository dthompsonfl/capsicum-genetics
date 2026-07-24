import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readManifest = async (relativePath) =>
  JSON.parse(await fs.readFile(path.join(repositoryRoot, relativePath), 'utf8'));
const root = await readManifest('package.json');
const web = await readManifest('apps/web/package.json');
const failures = [];

function requireEqual(label, left, right) {
  if (left !== right) {
    failures.push(`${label}: expected ${JSON.stringify(left)} to equal ${JSON.stringify(right)}`);
  }
}

function majorMinor(version) {
  const match = /^(\d+)\.(\d+)\./.exec(version ?? '');
  return match ? `${match[1]}.${match[2]}` : null;
}

requireEqual(
  'Next.js and eslint-config-next versions',
  web.dependencies?.next,
  root.devDependencies?.['eslint-config-next'],
);
requireEqual(
  'React and React DOM versions',
  web.dependencies?.react,
  web.dependencies?.['react-dom'],
);
requireEqual(
  'React runtime and type major/minor',
  majorMinor(web.dependencies?.react),
  majorMinor(web.devDependencies?.['@types/react']),
);
requireEqual(
  'React DOM runtime and type major/minor',
  majorMinor(web.dependencies?.['react-dom']),
  majorMinor(web.devDependencies?.['@types/react-dom']),
);

if (root.devDependencies?.['typescript-eslint']) {
  failures.push(
    'The root must not load a second typescript-eslint instance; eslint-config-next owns the configured parser/plugin.',
  );
}

const packageManagerMatch = /^pnpm@(\d+\.\d+\.\d+)$/.exec(root.packageManager ?? '');
if (!packageManagerMatch) {
  failures.push('packageManager must pin an exact pnpm version.');
}

const ci = await fs.readFile(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
if (packageManagerMatch && !ci.includes(`PNPM_VERSION: ${packageManagerMatch[1]}`)) {
  failures.push('CI PNPM_VERSION does not match packageManager.');
}

const nodeEngineMatch = /^>=(\d+)\./.exec(root.engines?.node ?? '');
if (!nodeEngineMatch || Number(nodeEngineMatch[1]) < 24) {
  failures.push('Node.js 24 or newer must remain the minimum runtime.');
}
if (!ci.includes('NODE_VERSION: 24.')) {
  failures.push('CI must execute on Node.js 24.x.');
}

for (const rootName of ['apps', 'packages']) {
  const entries = await fs.readdir(path.join(repositoryRoot, rootName), {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const relative = `${rootName}/${entry.name}/package.json`;
    let manifest;

    try {
      manifest = await readManifest(relative);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    const workspaceTypeScript = manifest.devDependencies?.typescript;
    if (workspaceTypeScript) {
      requireEqual(
        `${manifest.name ?? relative} TypeScript version`,
        workspaceTypeScript,
        root.devDependencies?.typescript,
      );
    }

    const workspaceVitest = manifest.devDependencies?.vitest;
    if (workspaceVitest) {
      requireEqual(
        `${manifest.name ?? relative} Vitest version`,
        workspaceVitest,
        root.devDependencies?.vitest,
      );
    }

    const workspaceNodeTypes = manifest.devDependencies?.['@types/node'];
    if (workspaceNodeTypes) {
      requireEqual(
        `${manifest.name ?? relative} @types/node version`,
        workspaceNodeTypes,
        root.devDependencies?.['@types/node'],
      );
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ failures, ok: false }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true }, null, 2));
}
