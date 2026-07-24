import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json(
    { status: 'alive', service: 'capsicum-web', generatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
