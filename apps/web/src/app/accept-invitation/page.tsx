import type { Metadata } from 'next';
import { ErrorNotice } from '../../components/page-primitives';
import { queryError } from '../../lib/presentation';
import { getInvitationExchangeToken } from '../../lib/session';
import { acceptInvitationAction } from '../actions';

export const metadata: Metadata = { title: 'Accept invitation', referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const hasCredential = Boolean(await getInvitationExchangeToken());
  return <section className="auth-card"><span className="eyebrow">Workspace invitation</span><h1>Accept invitation</h1><p className="lede">The one-time invitation credential has been exchanged into short-lived HttpOnly browser state and removed from the address bar.</p>
    <ErrorNotice message={queryError(query.error) ?? (!hasCredential ? 'The invitation credential is missing or expired.' : null)} />
    <form className="stack-form" action={acceptInvitationAction}>
      <div className="field"><label htmlFor="displayName">Display name</label><input id="displayName" name="displayName" autoComplete="name" required /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={12} autoComplete="current-password" required /><small>Existing account: current password. New account: at least 12 characters and three character categories.</small></div>
      <button className="button" type="submit" disabled={!hasCredential}>Accept and sign in</button>
    </form></section>;
}
