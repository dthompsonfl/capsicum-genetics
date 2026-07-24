import { MutationForm } from '@/components/mutation-form';
import { ErrorNotice } from '@/components/page-primitives';
import { queryError } from '@/lib/presentation';
import { getPasswordResetExchangeToken } from '@/lib/session';
import { completePasswordResetAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choose new password', referrer: 'no-referrer' } as const;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const hasCredential = Boolean(await getPasswordResetExchangeToken());
  return <section className="auth-card"><span className="eyebrow">Account recovery</span><h1>Choose a new password</h1>
    <p className="lede">The reset credential is held in short-lived HttpOnly browser state and never submitted through the address bar.</p>
    <ErrorNotice message={queryError(query.error) ?? (!hasCredential ? 'The password reset credential is missing or expired.' : null)} />
    <MutationForm intent="password-reset.complete" action={completePasswordResetAction} className="stack-form">
      <div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" minLength={12} autoComplete="new-password" required /></div>
      <div className="field"><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required /></div>
      <button className="button" type="submit" disabled={!hasCredential}>Update password and revoke sessions</button>
    </MutationForm>
  </section>;
}
