import { MutationForm } from '@/components/mutation-form';
import { listWorkspaceInvitations, workspaceMembers } from '@capsicum/application';
import { InvitationForm } from '../../../components/invitation-form';
import { ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { formatDate, humanize, queryError, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';
import { mutateInvitationAction, updateWorkspaceMembershipAction } from '../../actions';

export const dynamic = 'force-dynamic';

const editableRoles = ['breeder', 'technician', 'scientific_reviewer', 'catalog_curator', 'administrator', 'viewer'] as const;
const membershipStates = ['active', 'suspended', 'revoked'] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; saved?: string; delivery?: string }> }) {
  const principal = await requirePrincipal();
  const [records, invitations, params] = await Promise.all([
    workspaceMembers(getDatabasePool(), principal),
    listWorkspaceInvitations(getDatabasePool(), principal),
    searchParams,
  ]);
  return <>
    <PageHeader eyebrow="Administration" title="Users and roles" description="Invite people, assign only the access their work requires, and keep scientific review independent from authorship." />
    <ErrorNotice message={queryError(params.error)} />
    {params.saved ? <div className="notice" role="status">The workspace access operation completed.</div> : null}
    {params.delivery === 'unavailable' || params.delivery === 'failed' ? <div className="warning" role="alert">The replacement invitation exists, but secure delivery is unavailable. Revoke it or resend after configuring a delivery adapter.</div> : null}
    <section className="card"><h2>Create invitation</h2><InvitationForm /></section>
    <section className="card section-gap"><h2>Active and historical memberships</h2><div className="table-wrap"><table><thead><tr><th>User</th><th>Current</th><th>Owner-safe controls</th><th>Joined</th></tr></thead><tbody>{records.map((record: Record<string, unknown>) => {
      const owner = record.role === 'owner';
      return <tr key={String(record.id)}><td><strong>{text(record.display_name)}</strong><br /><span className="muted">{text(record.email)}</span></td><td>{humanize(record.role)} · {humanize(record.state)}</td><td>{owner ? <span className="muted">Owner role is protected from demotion or revocation.</span> : <MutationForm intent="membership.update" action={updateWorkspaceMembershipAction} className="inline-form">
        <input type="hidden" name="userId" value={text(record.id)} />
        <input type="hidden" name="expectedUpdatedAt" value={text(record.updated_at)} />
        <label><span className="sr-only">Role</span><select name="role" defaultValue={text(record.role)}>{editableRoles.map((role) => <option key={role} value={role}>{humanize(role)}</option>)}</select></label>
        <label><span className="sr-only">State</span><select name="state" defaultValue={text(record.state)}>{membershipStates.map((state) => <option key={state} value={state}>{humanize(state)}</option>)}</select></label>
        <button className="button secondary" type="submit">Update</button>
      </MutationForm>}</td><td>{formatDate(record.created_at)}</td></tr>;
    })}</tbody></table></div></section>
    <section className="card section-gap"><h2>Invitations</h2><div className="table-wrap"><table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th>Controls</th></tr></thead><tbody>{invitations.map((invitation) => {
      const active = !invitation.acceptedAt && !invitation.revokedAt && Date.parse(invitation.expiresAt) > Date.now();
      const status = invitation.acceptedAt ? 'Accepted' : invitation.revokedAt ? 'Revoked' : Date.parse(invitation.expiresAt) <= Date.now() ? 'Expired' : 'Pending';
      return <tr key={invitation.id}><td>{invitation.email}</td><td>{humanize(invitation.role)}</td><td>{status}</td><td>{formatDate(invitation.expiresAt)}</td><td>{active ? <div className="inline-form"><MutationForm intent={`invitation.revoke.${invitation.id}`} action={mutateInvitationAction}><input type="hidden" name="invitationId" value={invitation.id} /><input type="hidden" name="action" value="revoke" /><input type="hidden" name="expiresInHours" value="168" /><button className="button secondary" type="submit">Revoke</button></MutationForm><MutationForm intent={`invitation.resend.${invitation.id}`} action={mutateInvitationAction}><input type="hidden" name="invitationId" value={invitation.id} /><input type="hidden" name="action" value="resend" /><input type="hidden" name="expiresInHours" value="168" /><button className="button secondary" type="submit">Resend</button></MutationForm></div> : <span className="muted">No action</span>}</td></tr>;
    })}</tbody></table></div></section>
    <section className="card section-gap"><h2>Control behavior</h2><ul className="list"><li>Suspended and revoked memberships cannot validate an existing session.</li><li>Changing a member to suspended or revoked revokes sessions currently bound to this workspace.</li><li>The owner cannot be demoted, suspended, or revoked through this interface.</li><li>Only owners and administrators have workspace-management permission; scientific approvals still require an independent reviewer identity.</li></ul></section>
  </>;
}
