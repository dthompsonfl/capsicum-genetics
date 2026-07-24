import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] ?? 'dist');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return fullPath;
  }))).flat();
}

function withJavaScriptExtension(specifier) {
  if (!specifier.startsWith('.')) return specifier;
  if (/\.(?:[cm]?js|json|node|wasm)$/u.test(specifier)) return specifier;
  return `${specifier}.js`;
}

const files = (await walk(root)).filter((file) => /\.[cm]?js$/u.test(file));
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const rewritten = source
    .replace(/(\bfrom\s+['"])(\.{1,2}\/[^'"]+)(['"])/gu, (_match, prefix, specifier, suffix) => `${prefix}${withJavaScriptExtension(specifier)}${suffix}`)
    .replace(/(\bimport\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/gu, (_match, prefix, specifier, suffix) => `${prefix}${withJavaScriptExtension(specifier)}${suffix}`)
    .replace(/(\bexport\s+\*\s+from\s+['"])(\.{1,2}\/[^'"]+)(['"])/gu, (_match, prefix, specifier, suffix) => `${prefix}${withJavaScriptExtension(specifier)}${suffix}`);
  if (rewritten !== source) await writeFile(file, rewritten);
}
