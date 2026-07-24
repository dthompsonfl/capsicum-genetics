import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requestBreedingLedgerExport, type BreedingLedgerExportFormat } from '@capsicum/application';
import { getDatabasePool } from '../../../../lib/database';
import { getOptionalPrincipal } from '../../../../lib/session';
import { assertSameOrigin } from '../../../../lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const principal = await getOptionalPrincipal();
  if (!principal) return NextResponse.redirect(new URL('/sign-in', request.url), 303);
  try {
    assertSameOrigin(request);
    const form = await request.formData();
    const rawFormat = form.get('format');
    const clientRequestId = form.get('clientRequestId');
    if (typeof clientRequestId !== 'string' || clientRequestId.length < 16) throw new TypeError('A stable request identifier is required.');
    if (rawFormat !== 'json' && rawFormat !== 'csv') {
      throw new TypeError('Export format must be json or csv.');
    }
    const format: BreedingLedgerExportFormat = rawFormat;
    const queued = await requestBreedingLedgerExport(
      getDatabasePool(),
      principal,
      format,
      clientRequestId,
      request.headers.get('x-request-id')?.slice(0, 200) || randomUUID(),
    );
    return NextResponse.redirect(new URL(`/reports?queued=${queued.exportJobId}`, request.url), 303);
  } catch (error) {
    const url = new URL('/reports', request.url);
    url.searchParams.set('error', 'export_queue_failed');
    return NextResponse.redirect(url, 303);
  }
}
