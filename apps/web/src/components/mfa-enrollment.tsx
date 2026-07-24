'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  beginMultiFactorEnrollmentAction,
  confirmMultiFactorEnrollmentAction,
  regenerateMultiFactorRecoveryCodesAction,
  verifyCurrentSessionMultiFactorAction,
  type MultiFactorActionState,
} from '../app/actions';

const initialState: MultiFactorActionState = {};

function ConfirmationForm({ enrollment }: { enrollment: MultiFactorActionState }) {
  const [state, action, pending] = useActionState(confirmMultiFactorEnrollmentAction, enrollment);
  if (state.recoveryCodes) {
    return (
      <section className="notice section-gap" role="status">
        <h3>Save these recovery codes now</h3>
        <p>Each code works once. Store them in a password manager or another secure offline location. They will not be displayed again.</p>
        <pre className="code-block">{state.recoveryCodes.join('\n')}</pre>
        <p><strong>Multi-factor authentication is enabled and this browser session is verified.</strong> Sign-in now requires an authenticator code or one unused recovery code.</p>
        <p><Link className="button" href="/">Continue to the workspace</Link></p>
      </section>
    );
  }
  return (
    <section className="card inset-card section-gap">
      <h3>Confirm the authenticator</h3>
      <ol className="ordered-list">
        <li>Open any standards-compatible authenticator app.</li>
        <li>Add an account manually using the secret below, or paste the setup URI when your app supports it.</li>
        <li>Enter the current six-digit code to prove setup succeeded.</li>
      </ol>
      <dl className="definition-grid">
        <div><dt>Manual secret</dt><dd className="mono break-all">{state.secret}</dd></div>
        <div><dt>Setup URI</dt><dd className="mono break-all">{state.otpauthUri}</dd></div>
      </dl>
      <form action={action} className="form-grid section-gap">
        <div className="field full"><label htmlFor="confirm-totp">Current six-digit code</label><input id="confirm-totp" name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></div>
        <div className="full"><button className="button" type="submit" disabled={pending}>{pending ? 'Checking…' : 'Enable multi-factor authentication'}</button></div>
      </form>
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
    </section>
  );
}

export function MultiFactorEnrollment() {
  const [state, action, pending] = useActionState(beginMultiFactorEnrollmentAction, initialState);
  return (
    <>
      {!state.secret ? (
        <form action={action}>
          <button className="button" type="submit" disabled={pending}>{pending ? 'Preparing…' : 'Set up an authenticator'}</button>
        </form>
      ) : <ConfirmationForm key={state.secret} enrollment={state} />}
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
    </>
  );
}


export function MultiFactorSessionVerification() {
  const [state, action, pending] = useActionState(verifyCurrentSessionMultiFactorAction, initialState);
  if (state.sessionVerified) {
    return (
      <div className="notice" role="status">
        <strong>This browser session is verified.</strong>
        <p>You may now open privileged workspaces and protected administration screens.</p>
        <p><Link className="button" href="/">Continue to the workspace</Link></p>
      </div>
    );
  }
  return (
    <form action={action} className="form-grid">
      <div className="field">
        <label htmlFor="stepup-totp">Six-digit authenticator code</label>
        <input id="stepup-totp" name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} />
      </div>
      <div className="field">
        <label htmlFor="stepup-recovery">Or one recovery code</label>
        <input id="stepup-recovery" name="recoveryCode" autoComplete="one-time-code" />
      </div>
      <p className="muted full">Enter one method only. A recovery code is consumed immediately after successful verification.</p>
      <div className="full"><button className="button" type="submit" disabled={pending}>{pending ? 'Verifying…' : 'Verify this browser session'}</button></div>
      {state.error ? <p className="error full" role="alert">{state.error}</p> : null}
    </form>
  );
}


export function RecoveryCodeRotation() {
  const [state, action, pending] = useActionState(regenerateMultiFactorRecoveryCodesAction, initialState);
  if (state.recoveryCodes) {
    return (
      <div className="notice section-gap" role="status">
        <h3>New recovery codes</h3>
        <p>All previous recovery codes are now invalid. Store this replacement set securely; it will not be displayed again.</p>
        <pre className="code-block">{state.recoveryCodes.join('\n')}</pre>
      </div>
    );
  }
  return (
    <details className="help section-gap">
      <summary><strong>Replace recovery codes</strong></summary>
      <p>Use this after a code was exposed, lost, or nearly exhausted. Replacing codes invalidates every previous recovery code.</p>
      <form action={action} className="form-grid">
        <div className="field full"><label htmlFor="rotate-recovery-totp">Current six-digit authenticator code</label><input id="rotate-recovery-totp" name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></div>
        <div className="full"><button className="button secondary" type="submit" disabled={pending}>{pending ? 'Replacing…' : 'Replace recovery codes'}</button></div>
        {state.error ? <p className="error full" role="alert">{state.error}</p> : null}
      </form>
    </details>
  );
}
