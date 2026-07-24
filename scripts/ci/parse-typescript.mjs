import { pathToFileURL } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const excluded = new Set(['.git', '.next', '.turbo', 'coverage', 'dist', 'node_modules', '.validation', '.validation-build']);

async function loadTypeScript() {
  try {
    return await import('typescript');
  } catch {
    const configured = process.env.TYPESCRIPT_MODULE_PATH;
    if (!configured) throw new Error('typescript is not installed and TYPESCRIPT_MODULE_PATH was not provided');
    return await import(pathToFileURL(configured).href);
  }
}

async function collect(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute, output);
    else if (/\.(?:cts|mts|ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) output.push(absolute);
  }
  return output;
}

const ts = await loadTypeScript();
const files = (await collect(root)).sort();
const failures = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  for (const diagnostic of parsed.parseDiagnostics) {
    const position = diagnostic.start === undefined ? undefined : parsed.getLineAndCharacterOfPosition(diagnostic.start);
    failures.push({
      file: path.relative(root, file),
      line: position ? position.line + 1 : null,
      column: position ? position.character + 1 : null,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    });
  }
}
const result = {
  schemaVersion: '1.0',
  parserVersion: ts.version,
  fileCount: files.length,
  failureCount: failures.length,
  failures,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = failures.length ? 1 : 0;
