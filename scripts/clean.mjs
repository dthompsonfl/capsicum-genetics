import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const removableDirectories = new Set([
  'dist', '.next', 'coverage', '.turbo', '.pytest_cache', '__pycache__',
  '.validation', '.validation-build', '.runtime', 'playwright-report', 'test-results',
]);
const removableExtensions = new Set(['.pyc', '.pyo']);

async function walk(directory) {
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (removableDirectories.has(entry.name)) {
        await rm(fullPath, { recursive: true, force: true });
      } else {
        await walk(fullPath);
      }
      continue;
    }
    if (removableExtensions.has(path.extname(entry.name))) {
      await rm(fullPath, { force: true });
    }
  }
}

await walk(path.resolve('.'));
