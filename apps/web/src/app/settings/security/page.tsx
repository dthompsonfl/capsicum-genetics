import Link from 'next/link';
import { getMultiFactorStatus } from '@capsicum/application';
import { isPrivilegedWorkspaceRole } from '@capsicum/auth';
import { ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { MultiFactorEnrollment, MultiFactorSessionVerification, RecoveryCodeRotation } from '../../../components/mfa-enrollment';
import { getDatabasePool } from '../../../lib/database';
import { queryError } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';
import { disableMultiFactorAuthenticationAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; stepup?: string }> }) {
  const principal = await requirePrincipal({ allowUnverifiedMfa: true });
  const status = await getMultiFactorStatus(getDatabasePool(), principal);
  const query = await searchParams;
  const requiredForRole = process.env.REQUIRE_PRIVILEGED_MFA === 'true'
    && isPrivilegedWorkspaceRole(principal.role);
  const sessionAssured = Boolean(principal.mfaVerifiedAt);

  return (
    <>
      <PageHeader eyebrow="Account protection" title="Account security" description="Protect scientific publication, user administration, and breeding records with a second factor that remains separate from your password." />
      <ErrorNotice message={queryError(query.error)} />
      {query.saved === 'disabled' ? <div className="notice" role="status">Multi-factor authentication was disabled.</div> : null}
      {query.stepup === 'required' ? <div className="critical-banner section-gap" role="alert"><div><strong>Verify this browser before continuing.</strong><p>Your active role can change scientific authority or workspace access. The system will not open protected screens until this session completes MFA.</p></div></div> : null}

      <div className="grid two section-gap">
        <section className="card">
          <div className="section-heading"><div><h2>Authenticator app</h2><p className="muted compact">Time-based one-time passwords work offline with most password managers and authenticator apps.</p></div><span className={status.enabled ? 'badge exact' : 'badge warning'}>{status.enabled ? 'Enabled' : status.enrollmentPending ? 'Setup incomplete' : 'Not enabled'}</span></div>
          {status.enabled ? (
            <>
              <p>Enabled {status.enabledAt ? new Date(status.enabledAt).toLocaleString() : ''}. You have <strong>{status.recoveryCodesRemaining}</strong> unused recovery codes.</p>
              {status.recoveryCodesRemaining <= 2 ? <div className="warning" role="alert">Your recovery-code supply is low. Create a replacement set before you need it.</div> : null}
              <RecoveryCodeRotation />
              {requiredForRole ? <div className="help section-gap"><strong>Required for your role</strong><p>Your deployment requires MFA for privileged roles, so it cannot be disabled while you hold this role.</p></div> : (
                <details className="warning section-gap">
                  <summary><strong>Disable multi-factor authentication</strong></summary>
                  <p>This reduces account security. Enter a current authenticator code to continue.</p>
                  <form action={disableMultiFactorAuthenticationAction} className="form-grid">
                    <div className="field full"><label htmlFor="disable-totp">Current six-digit code</label><input id="disable-totp" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></div>
                    <div className="full"><button className="button danger" type="submit">Disable MFA</button></div>
                  </form>
                </details>
              )}
            </>
          ) : <MultiFactorEnrollment />}
        </section>

        <section className="card">
          <div className="section-heading"><div><h2>Current browser session</h2><p className="muted compact">MFA enrollment protects the account. Session verification proves this specific browser completed the second factor.</p></div><span className={sessionAssured ? 'badge exact' : 'badge warning'}>{sessionAssured ? 'Verified' : 'Verification required'}</span></div>
          {sessionAssured ? <p>This session completed MFA {principal.mfaVerifiedAt ? new Date(principal.mfaVerifiedAt).toLocaleString() : ''}.</p> : status.enabled ? <MultiFactorSessionVerification /> : <div className="help"><strong>Enable MFA first</strong><p>Complete authenticator setup in the first panel. Confirming setup also verifies this browser session.</p></div>}
        </section>

        <section className="card">
          <h2>Security checklist</h2>
          <ul className="compact-list">
            <li>Use a unique password stored in a password manager.</li>
            <li>Enable the authenticator before ending your first owner or administrator session.</li>
            <li>Store recovery codes separately from the device that generates authenticator codes.</li>
            <li>Review sessions after using a shared or unfamiliar computer.</li>
            <li>Never send passwords, setup secrets, or recovery codes through ordinary chat or email.</li>
          </ul>
          <p><Link className="button secondary section-gap" href="/settings/sessions">Review active sessions</Link></p>
        </section>
      </div>
    </>
  );
}
