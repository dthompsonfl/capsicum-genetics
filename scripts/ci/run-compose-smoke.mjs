import process from 'node:process';

const baseUrl = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const timeoutMs = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? '10000', 10);

if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
  throw new RangeError('SMOKE_TIMEOUT_MS must be an integer between 1000 and 60000.');
}

async function requestJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

const liveness = await requestJson('/api/health/liveness');
if (liveness.status !== 200 || liveness.body?.status !== 'alive') {
  throw new Error(`Liveness check failed: ${JSON.stringify(liveness)}`);
}

const readiness = await requestJson('/api/health/readiness');
if (readiness.status !== 200 || readiness.body?.status !== 'ready') {
  throw new Error(`Readiness check failed: ${JSON.stringify(readiness)}`);
}

console.log(JSON.stringify({
  schemaVersion: '1.0',
  passed: true,
  baseUrl,
  checks: {
    liveness: liveness.body,
    readiness: readiness.body,
  },
}, null, 2));
