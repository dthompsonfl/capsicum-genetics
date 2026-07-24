import { NextResponse } from 'next/server';
import { getSafeSystemReadiness } from '../../../../lib/environment';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const status = await getSafeSystemReadiness(true);
  const dependenciesReady = Boolean(status.live?.database.ok && status.live?.objectStorage.ok);
  const ready = status.valid && status.runtime.node24OrNewer && dependenciesReady;
  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready' },
    {
      status: ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
        ...(ready ? {} : { 'Retry-After': '30' }),
      },
    },
  );
}
