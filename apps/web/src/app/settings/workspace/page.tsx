import { MutationForm } from '@/components/mutation-form';
import { listAvailableWorkspaces, workspaceDetail } from '@capsicum/application';
import { DefinitionList, ErrorNotice, PageHeader } from '@/components/page-primitives';
import { formatDate, humanize, queryError, text } from '@/lib/presentation';
import { getDatabasePool } from '@/lib/database';
import { requirePrincipal } from '@/lib/session';
import { switchWorkspaceAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const principal = await requirePrincipal();
  const [record, workspaces, query] = await Promise.all([
    workspaceDetail(getDatabasePool(), principal) as Promise<Record<string, unknown> | null>,
    listAvailableWorkspaces(getDatabasePool(), principal),
    searchParams,
  ]);
  return <><PageHeader eyebrow="Administration" title="Workspace settings" description="Choose the breeding workspace you are working in. Every record, permission, audit event, and scientific review stays isolated inside that workspace." />
    <ErrorNotice message={queryError(query.error)} />
    {record ? <section className="card"><DefinitionList entries={[["Name", text(record.name)], ["Slug", text(record.slug)], ["Active members", text(record.member_count)], ["Created", formatDate(record.created_at)]]} /></section> : <div className="notice">Workspace unavailable.</div>}
    <section className="card section-gap"><h2>Switch active workspace</h2><p className="muted">Only workspaces where you have active access are listed. Switching changes where new records are created and which existing records you can see.</p>
      <div className="stack-list">{workspaces.map((workspace) => <div className="split-row" key={workspace.id}><div><strong>{workspace.name}</strong><br /><span className="muted">{humanize(workspace.role)} · {workspace.slug}</span></div>{workspace.current ? <span className="badge">Current</span> : <MutationForm intent={`workspace.switch.${workspace.id}`} action={switchWorkspaceAction}><input type="hidden" name="workspaceId" value={workspace.id} /><button className="button secondary" type="submit">Switch</button></MutationForm>}</div>)}</div>
    </section></>;
}
