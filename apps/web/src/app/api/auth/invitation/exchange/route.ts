import { NextResponse } from 'next/server';
import { hashOpaqueToken } from '@capsicum/auth';
import { INVITATION_EXCHANGE_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  try {
    hashOpaqueToken(token);
  } catch {
    return NextResponse.redirect(new URL('/accept-invitation?error=invalid_credential', url.origin), 303);
  }
  const response = NextResponse.redirect(new URL('/accept-invitation', url.origin), 303);
  response.cookies.set(INVITATION_EXCHANGE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.APP_MODE === 'production',
    path: '/',
    maxAge: 10 * 60,
    priority: 'high',
  });
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
