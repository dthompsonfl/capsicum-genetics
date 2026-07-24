import { isPrivilegedWorkspaceRole, keyedFingerprint } from '@capsicum/auth';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { readSession } from '@capsicum/application';
import type { Principal } from '@capsicum/contracts';
import { getDatabasePool } from './database';

export const SESSION_COOKIE = 'capsicum_session';

export const getOptionalPrincipal = cache(async (): Promise<Principal | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token) || !process.env.DATABASE_URL) return null;
  return readSession(getDatabasePool(), token);
});

export async function requirePrincipal(options: { allowUnverifiedMfa?: boolean } = {}): Promise<Principal> {
  const principal = await getOptionalPrincipal();
  if (!principal) redirect('/sign-in');
  const privilegedAssuranceRequired = process.env.REQUIRE_PRIVILEGED_MFA === 'true'
    && isPrivilegedWorkspaceRole(principal.role);
  if (privilegedAssuranceRequired && !principal.mfaVerifiedAt && !options.allowUnverifiedMfa) {
    redirect('/settings/security?stepup=required');
  }
  return principal;
}

export async function requestFingerprint(): Promise<{ userAgentHash?: string; ipHash?: string }> {
  const secret = process.env.NETWORK_FINGERPRINT_SECRET;
  if (!secret || secret.length < 32) return {};
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get('user-agent');
  const trustedProxyHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '0', 10);
  const forwardedChain = requestHeaders.get('x-forwarded-for')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const forwardedFor = Number.isInteger(trustedProxyHops) && trustedProxyHops > 0 && forwardedChain.length >= trustedProxyHops
    ? forwardedChain.at(-trustedProxyHops)
    : undefined;
  return {
    ...(userAgent ? { userAgentHash: keyedFingerprint(secret, 'user-agent', userAgent) } : {}),
    ...(forwardedFor ? { ipHash: keyedFingerprint(secret, 'network', forwardedFor) } : {}),
  };
}

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.APP_MODE === 'production',
    path: '/',
    expires: new Date(expiresAt),
    priority: 'high',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.APP_MODE === 'production',
    path: '/',
    expires: new Date(0),
  });
}

export const INVITATION_EXCHANGE_COOKIE = 'capsicum_invitation_exchange';
export const PASSWORD_RESET_EXCHANGE_COOKIE = 'capsicum_password_reset_exchange';

async function setShortLivedExchangeCookie(name: string, token: string, maxAgeSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(name, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.APP_MODE === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
    priority: 'high',
  });
}

async function clearExchangeCookie(name: string): Promise<void> {
  const store = await cookies();
  store.set(name, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.APP_MODE === 'production',
    path: '/',
    expires: new Date(0),
  });
}

export async function setInvitationExchangeCookie(token: string): Promise<void> {
  await setShortLivedExchangeCookie(INVITATION_EXCHANGE_COOKIE, token, 10 * 60);
}

export async function getInvitationExchangeToken(): Promise<string | undefined> {
  return (await cookies()).get(INVITATION_EXCHANGE_COOKIE)?.value;
}

export async function clearInvitationExchangeCookie(): Promise<void> {
  await clearExchangeCookie(INVITATION_EXCHANGE_COOKIE);
}

export async function setPasswordResetExchangeCookie(token: string): Promise<void> {
  await setShortLivedExchangeCookie(PASSWORD_RESET_EXCHANGE_COOKIE, token, 10 * 60);
}

export async function getPasswordResetExchangeToken(): Promise<string | undefined> {
  return (await cookies()).get(PASSWORD_RESET_EXCHANGE_COOKIE)?.value;
}

export async function clearPasswordResetExchangeCookie(): Promise<void> {
  await clearExchangeCookie(PASSWORD_RESET_EXCHANGE_COOKIE);
}
