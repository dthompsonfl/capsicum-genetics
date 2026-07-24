import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canBootstrapOwner } from '@capsicum/application';
import { ErrorNotice } from '../../components/page-primitives';
import { getDatabasePool } from '../../lib/database';
import { getOptionalPrincipal } from '../../lib/session';
import { queryError } from '../../lib/presentation';
import { signInAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (await getOptionalPrincipal()) redirect('/');
  const query = await searchParams;
  let bootstrapOpen = false;
  let databaseError: string | null = null;
  try {
    bootstrapOpen = await canBootstrapOwner(getDatabasePool()) && /^[a-f0-9]{64}$/i.test(process.env.BOOTSTRAP_TOKEN_SHA256 ?? '');
  } catch {
    databaseError = 'PostgreSQL is not configured or migrations have not been applied.';
  }
  return (
    <section className="auth-card">
      <span className="eyebrow">Capsicum Breeding Intelligence</span>
      <h1>Sign in</h1>
      <p className="lede">Access a provenance-preserving breeding workspace. Sessions are opaque, server-validated, and workspace-scoped.</p>
      <ErrorNotice message={queryError(query.error) ?? databaseError} />
      <form action={signInAction} className="stack-form">
        <input type="hidden" name="next" value={query.next ?? '/'} />
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
        <details className="help">
          <summary><strong>Authenticator or recovery code</strong></summary>
          <p className="muted">Complete one of these fields only when multi-factor authentication is enabled for your account.</p>
          <div className="field"><label htmlFor="totpCode">Six-digit authenticator code</label><input id="totpCode" name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} /></div>
          <div className="field section-gap-sm"><label htmlFor="recoveryCode">Recovery code</label><input id="recoveryCode" name="recoveryCode" autoComplete="one-time-code" /></div>
        </details>
        <button className="button" type="submit" disabled={Boolean(databaseError)}>Sign in</button>
      </form>
      <p className="muted"><Link className="inline-link" href="/forgot-password">Forgot password?</Link></p>
      {bootstrapOpen ? <p className="muted">No owner exists. <Link className="inline-link" href="/onboarding">Create the first governed workspace.</Link></p> : null}
    </section>
  );
}
