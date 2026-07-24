import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const migrationsDirectory = resolve(root, 'packages/database/migrations');
const outputPath = resolve(root, 'packages/database/src/generated/routine-grants.json');
const checkOnly = process.argv.includes('--check');
const files = (await readdir(migrationsDirectory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
const grants = { capsicum_runtime: new Set(), capsicum_worker: new Set() };
for (const file of files) {
  const sql = await readFile(resolve(migrationsDirectory, file), 'utf8');
  const pattern = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+([^;]+?)\s+TO\s+(capsicum_runtime|capsicum_worker)\s*;/gims;
  for (const match of sql.matchAll(pattern)) {
    const signature = match[1].replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim();
    grants[match[2]].add(signature);
  }
}
const payload = {
  schemaVersion: '1.0',
  generatedFrom: files,
  roles: {
    capsicum_runtime: [...grants.capsicum_runtime].sort(),
    capsicum_worker: [...grants.capsicum_worker].sort(),
  },
};
const content = `${JSON.stringify(payload, null, 2)}\n`;
if (checkOnly) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  if (existing !== content) throw new Error('Generated routine grant manifest is stale. Run pnpm generate:manifests.');
  process.stdout.write(`routine grant manifest verified (${payload.roles.capsicum_runtime.length} runtime, ${payload.roles.capsicum_worker.length} worker)\n`);
} else {
  await writeFile(outputPath, content);
  process.stdout.write(`wrote ${outputPath}\n`);
}
