import Link from 'next/link';
import { MutationForm } from '@/components/mutation-form';
import { ErrorNotice } from '@/components/page-primitives';
import { queryError } from '@/lib/presentation';
import { requestPasswordResetAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reset password', referrer: 'no-referrer' } as const;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const query = await searchParams;
  return <section className="auth-card"><span className="eyebrow">Account recovery</span><h1>Reset password</h1>
    <p className="lede">Enter the account email. The response is identical whether or not an account exists.</p>
    <ErrorNotice message={queryError(query.error)} />
    {query.sent ? <div className="notice" role="status">When an eligible account exists, a short-lived reset credential has been issued.</div> : null}
    <MutationForm intent="password-reset.request" action={requestPasswordResetAction} className="stack-form">
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <button className="button" type="submit">Request reset</button>
    </MutationForm>
    <p className="muted"><Link className="inline-link" href="/sign-in">Return to sign in</Link></p>
  </section>;
}
