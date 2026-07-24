import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getMediaDerivative } from '@capsicum/application';
import { openObject } from '@capsicum/storage';
import { getDatabasePool } from '../../../../../../lib/database';
import { getOptionalPrincipal } from '../../../../../../lib/session';
import { getObjectStorageConfig } from '../../../../../../lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string; type: string }> }): Promise<Response> {
  const principal = await getOptionalPrincipal();
  if (!principal) return NextResponse.json({ error: { code: 'permission_denied', message: 'Authentication is required.', retryable: false } }, { status: 401 });
  const { id, type } = await params;
  if (type !== 'thumbnail' && type !== 'analysis_ready') {
    return NextResponse.json({ error: { code: 'not_found', message: 'The derivative type is unavailable.', retryable: false } }, { status: 404 });
  }
  const record = await getMediaDerivative(getDatabasePool(), principal, id, type);
  if (!record) return NextResponse.json({ error: { code: 'not_found', message: 'The media derivative is unavailable or inaccessible.', retryable: false } }, { status: 404 });
  try {
    const object = await openObject(getObjectStorageConfig(), String(record.object_key), request.headers.get('range') ?? undefined);
    return new Response(object.body, {
      status: object.status,
      headers: {
        'Content-Type': String(record.media_type),
        'Content-Length': String(object.byteLength),
        'Accept-Ranges': object.acceptRanges,
        ...(object.contentRange ? { 'Content-Range': object.contentRange } : {}),
        'Content-Disposition': `inline; filename="${type === 'thumbnail' ? 'thumbnail.jpg' : 'analysis-ready.png'}"`,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const requestId = randomUUID();
    if (error instanceof RangeError) {
      return NextResponse.json({ error: { code: 'validation_failed', message: 'The requested byte range is not satisfiable.', retryable: false, requestId } }, { status: 416, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
    }
    return NextResponse.json({ error: { code: 'unavailable', message: 'Derivative storage is temporarily unavailable.', retryable: true, requestId } }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
  }
}
