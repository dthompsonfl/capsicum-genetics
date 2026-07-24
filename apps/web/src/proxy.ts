import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = new Set([
  '/sign-in',
  '/onboarding',
  '/accept-invitation',
  '/forgot-password',
  '/reset-password',
  '/api/auth/invitation/exchange',
  '/api/auth/password-reset/exchange',
  '/api/health',
  '/api/health/liveness',
  '/api/health/readiness',
]);

function securityPolicy(nonce: string, production: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

function applySecurityHeaders(response: NextResponse, nonce: string, production: boolean): NextResponse {
  response.headers.set('Content-Security-Policy', securityPolicy(nonce, production));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (production) response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  return response;
}

export function proxy(request: NextRequest) {
  const production = process.env.APP_MODE === 'production';
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', securityPolicy(nonce, production));

  const configuredOrigin = process.env.APP_ORIGIN;
  if (production && configuredOrigin) {
    const expected = new URL(configuredOrigin);
    if (request.nextUrl.host !== expected.host || request.nextUrl.protocol !== expected.protocol) {
      return applySecurityHeaders(
        new NextResponse('Misdirected request.', { status: 421 }),
        nonce,
        production,
      );
    }
  }

  const authenticatedPath = !PUBLIC_PATHS.has(request.nextUrl.pathname);
  if (authenticatedPath && !request.cookies.has('capsicum_session')) {
    const url = new URL('/sign-in', request.url);
    url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return applySecurityHeaders(NextResponse.redirect(url), nonce, production);
  }

  return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce, production);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
