import { hasPermission } from '@capsicum/auth';
import { NextResponse } from 'next/server';
import { getSafeSystemReadiness } from '../../../../lib/environment';
import { getOptionalPrincipal } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const principal = await getOptionalPrincipal();
  if (!principal || !hasPermission(principal.role, 'system.read')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const status = await getSafeSystemReadiness(true);
  const liveReady = !status.live || (status.live.database.ok && status.live.objectStorage.ok);
  return NextResponse.json(status, {
    status: status.valid && status.runtime.node24OrNewer && liveReady ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
