import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('apps/web/.next/standalone');
const server = path.join(root, 'apps/web/server.js');
await access(server);
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!packageJson || typeof packageJson !== 'object') throw new Error('Standalone package manifest is invalid.');
for (const relative of ['apps/web/.next/server', 'apps/web/.next/BUILD_ID']) await access(path.join(root, relative));
console.log(JSON.stringify({ ok: true, server, packageName: packageJson.name ?? null }, null, 2));
