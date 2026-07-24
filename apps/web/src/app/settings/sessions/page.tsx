import { MutationForm } from '@/components/mutation-form';
import { ErrorNotice, PageHeader } from '@/components/page-primitives';
import { listUserSessions } from '@capsicum/application';
import { formatDate, queryError } from '@/lib/presentation';
import { getDatabasePool } from '@/lib/database';
import { requirePrincipal } from '@/lib/session';
import { revokeUserSessionAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; saved?: string }> }) {
  const principal = await requirePrincipal();
  const sessions = await listUserSessions(getDatabasePool(), principal);
  const query = await searchParams;
  return <>
    <PageHeader
      eyebrow="Account security"
      title="Browser sessions"
      description="Review every signed-in browser and revoke anything you do not recognize. Network and browser values are protected fingerprints, not raw addresses or device details."
    />
    <ErrorNotice message={queryError(query.error)} />
    {query.saved ? <div className="notice" role="status">The selected session was revoked.</div> : null}
    <section className="card">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Session</th><th>Last active</th><th>Expires</th><th>Sign-in assurance</th><th>Status</th><th>Control</th></tr></thead>
          <tbody>
            {sessions.map((session) => <tr key={session.id}>
              <td>{session.current ? <strong>Current browser</strong> : 'Other browser'}<br /><span className="muted">Created {formatDate(session.createdAt)}</span></td>
              <td>{formatDate(session.lastSeenAt)}</td>
              <td>{formatDate(session.expiresAt)}</td>
              <td>{session.mfaVerifiedAt
                ? <><span className="badge">MFA verified</span><br /><span className="muted">{formatDate(session.mfaVerifiedAt)}</span></>
                : <span className="badge warning">Password only</span>}</td>
              <td>{session.revokedAt ? `Revoked ${formatDate(session.revokedAt)}` : 'Active'}</td>
              <td>{session.revokedAt
                ? <span className="muted">No action</span>
                : <MutationForm intent={`session.revoke.${session.id}`} action={revokeUserSessionAction}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button className="button secondary" type="submit">Revoke</button>
                  </MutationForm>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}
