import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.');
const packageRoots = (await readdir(path.join(root, 'packages'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(root, 'packages', entry.name));
const errors = [];
for (const packageRoot of packageRoots) {
  const manifestPath = path.join(packageRoot, 'package.json');
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { continue; }
  if (!manifest.exports) continue;
  const exports = Object.values(manifest.exports);
  for (const value of exports) {
    const contract = typeof value === 'string' ? { import: value } : value;
    const runtimePath = contract?.import ?? contract?.default;
    if (typeof runtimePath !== 'string' || !runtimePath.startsWith('./dist/')) {
      errors.push(`${manifest.name} has a runtime export outside dist: ${String(runtimePath)}`);
      continue;
    }
    try { await access(path.join(packageRoot, runtimePath)); }
    catch { errors.push(`${manifest.name} is missing compiled runtime export ${runtimePath}`); }
  }
}
await access(path.join(root, 'apps/worker-node/dist/worker.js')).catch(() => errors.push('worker dist/worker.js is missing'));
if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, packageCount: packageRoots.length, workerArtifact: 'apps/worker-node/dist/worker.js' }, null, 2));
