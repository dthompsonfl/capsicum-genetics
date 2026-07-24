import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  ApplicationError,
  runAndPersistExactSimulation,
  toPublicError,
} from '@capsicum/application';
import { getDatabasePool } from '../../../../lib/database';
import { getOptionalPrincipal } from '../../../../lib/session';
import { assertSameOrigin } from '../../../../lib/storage';

export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 1_000_000;

function statusFor(error: unknown): number {
  if (!(error instanceof ApplicationError)) {
    return error instanceof TypeError || error instanceof RangeError || (error instanceof Error && error.name === 'ZodError') ? 400 : 500;
  }
  switch (error.code) {
    case 'validation_failed': return 400;
    case 'permission_denied': return 403;
    case 'not_found': return 404;
    case 'conflict':
    case 'stale_version':
    case 'idempotency_conflict': return 409;
    case 'duplicate_in_progress': return 425;
    case 'rate_limited': return 429;
    case 'unavailable':
    case 'scientific_authority_unavailable': return 503;
    case 'scientific_authority_required': return 422;
    default: return 500;
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new ApplicationError('validation_failed', 'Request body exceeds 1 MB.');
  }
  if (!request.body) throw new ApplicationError('validation_failed', 'A JSON request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_REQUEST_BYTES) {
        await reader.cancel('request body limit exceeded');
        throw new ApplicationError('validation_failed', 'Request body exceeds 1 MB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (cause) {
    throw new ApplicationError('validation_failed', 'The request body must be valid UTF-8 JSON.', { cause });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = request.headers.get('x-request-id')?.slice(0, 200) || randomUUID();
  try {
    assertSameOrigin(request);
    const principal = await getOptionalPrincipal();
    if (!principal) throw new ApplicationError('permission_denied', 'Authentication is required.');
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new ApplicationError('validation_failed', 'A valid idempotency-key header is required.');
    }
    const body = await readBoundedJson(request);
    const result = await runAndPersistExactSimulation(getDatabasePool(), principal, body, idempotencyKey);
    return NextResponse.json(result, {
      status: 201,
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
      },
    });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json(toPublicError(error, requestId), {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
        ...(error instanceof ApplicationError && error.retryAfterSeconds
          ? { 'Retry-After': String(error.retryAfterSeconds) }
          : {}),
      },
    });
  }
}
