import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

async function loadTypeScript() {
  try { return await import('typescript'); }
  catch {
    const configured = process.env.TYPESCRIPT_MODULE_PATH;
    if (!configured) throw new Error('typescript package or TYPESCRIPT_MODULE_PATH is required.');
    return import(pathToFileURL(configured).href);
  }
}

const ts = await loadTypeScript();
const configPath = 'packages/config/src/index.ts';
const sourceText = await readFile(configPath, 'utf8');
const source = ts.createSourceFile(configPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function stringArray(name) {
  let values;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      let initializer = node.initializer;
      if (ts.isAsExpression(initializer)) initializer = initializer.expression;
      assert(ts.isArrayLiteralExpression(initializer), `${name} must be an array literal.`);
      values = initializer.elements.map((element) => {
        assert(ts.isStringLiteral(element), `${name} entries must be strings.`);
        return element.text;
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert(values && values.length > 0, `${name} was not found.`);
  return values;
}

const productionRequired = stringArray('PRODUCTION_REQUIRED_ENVIRONMENT_KEYS');
const hostedCostRequired = stringArray('HOSTED_AI_COST_ENVIRONMENT_KEYS');
const envExample = await readFile('.env.example', 'utf8');
const compose = await readFile('infra/compose/docker-compose.yml', 'utf8');
const ci = await readFile('.github/workflows/ci.yml', 'utf8');

function assertMarkers(document, label, keys, marker) {
  for (const key of keys) assert(document.includes(marker(key)), `${label} is missing ${key}.`);
}

assertMarkers(envExample, '.env.example', [...productionRequired, ...hostedCostRequired], (key) => `${key}=`);
assertMarkers(compose, 'production Compose web environment', [...productionRequired, ...hostedCostRequired], (key) => `      ${key}:`);
assertMarkers(ci, 'browser/Compose CI environment', productionRequired, (key) => key);
for (const key of hostedCostRequired) assert(compose.includes(`      ${key}:`), `Compose must pass ${key}.`);

const workerRequired = [
  'APP_RELEASE_SHA', 'WORKER_DATABASE_URL', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
  'MEDIA_SCANNER_HOST', 'MEDIA_SCANNER_PORT', 'WORKER_MAX_MEDIA_BYTES', 'WORKER_MEDIA_CONCURRENCY',
  'PYTHON_VISION_MEMORY_MB', 'PYTHON_VISION_CPU_SECONDS',
];
assertMarkers(compose, 'production Compose worker environment', workerRequired, (key) => `      ${key}:`);

console.log(JSON.stringify({
  schemaVersion: '1.0',
  passed: true,
  productionRequired,
  hostedCostRequired,
  workerRequired,
}, null, 2));
