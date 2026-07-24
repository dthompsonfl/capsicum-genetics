import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getExportJob } from '@capsicum/application';
import { openObject } from '@capsicum/storage';
import { getDatabasePool } from '../../../../lib/database';
import { getOptionalPrincipal } from '../../../../lib/session';
import { getObjectStorageConfig } from '../../../../lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeFileName(requestedFormat: unknown): string {
  const format = requestedFormat === 'csv' ? 'csv' : 'json';
  return `capsicum-breeding-ledger.${format}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await getOptionalPrincipal();
  if (!principal) return NextResponse.json({ error: { code: 'permission_denied', message: 'Authentication is required.', retryable: false } }, { status: 401 });
  const { id } = await params;
  const record = await getExportJob(getDatabasePool(), principal, id) as Record<string, unknown> | null;
  if (!record || record.state !== 'succeeded' || typeof record.object_key !== 'string') {
    return NextResponse.json({ error: { code: 'not_found', message: 'The export is unavailable or no longer accessible.', retryable: false } }, { status: 404 });
  }
  try {
    const object = await openObject(getObjectStorageConfig(), record.object_key, request.headers.get('range') ?? undefined);
    const fileName = safeFileName(record.requested_format);
    return new Response(object.body, {
      status: object.status,
      headers: {
        'Content-Type': fileName.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Length': String(object.byteLength),
        'Accept-Ranges': object.acceptRanges,
        ...(object.contentRange ? { 'Content-Range': object.contentRange } : {}),
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const requestId = randomUUID();
    if (error instanceof RangeError) {
      return NextResponse.json(
        { error: { code: 'validation_failed', message: 'The requested byte range is not satisfiable.', retryable: false, requestId } },
        { status: 416, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
      );
    }
    return NextResponse.json(
      { error: { code: 'unavailable', message: 'Export storage is temporarily unavailable.', retryable: true, requestId } },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
    );
  }
}
