import { MutationForm } from '@/components/mutation-form';
import { listJobs } from '@capsicum/application';
import { retryDelaySeconds } from '@capsicum/jobs';
import { enqueueStorageCleanupAction, requestJobCancellationAction, retryJobAction } from '../../actions';
import { EmptyState, PageHeader } from '../../../components/page-primitives';
import { formatDate, humanize, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';

export const dynamic = 'force-dynamic';
export default async function JobsPage() {
  const principal = await requirePrincipal();
  const records = await listJobs(getDatabasePool(), principal, 200);
  return <><PageHeader eyebrow="Operations" title="Durable jobs" description="Lease-based work with idempotency, bounded retries, attempt logs, cooperative cancellation, and dead-letter terminal state." />
    {records.length ? <div className="table-wrap"><table><thead><tr><th>Type</th><th>State</th><th>Attempt</th><th>Available</th><th>Evidence</th><th>Error</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{records.map((record: Record<string, unknown>) => {
      const state = String(record.state);
      const cancellable = ['queued', 'failed', 'running'].includes(state);
      const retryable = ['failed', 'dead_letter', 'cancelled'].includes(state) && Number(record.attempt) < Number(record.max_attempts);
      const result = record.result && typeof record.result === 'object' && !Array.isArray(record.result) ? record.result as Record<string, unknown> : null;
      const evidence = record.job_type === 'storage.cleanup.v1' && result
        ? `${text(result.mode)} · ${text(result.candidates)} candidates · ${text(result.deleted)} deleted · ${text(result.failed)} failed`
        : `${text(record.attempt_count)} attempts · ${text(record.log_count)} logs`;
      return <tr key={String(record.id)}><td className="mono">{text(record.job_type)}</td><td>{humanize(state)}</td><td>{text(record.attempt)} / {text(record.max_attempts)}</td><td>{formatDate(record.available_at)}</td><td>{evidence}</td><td>{text(record.last_error_code)}</td><td><div className="button-row">{cancellable ? <MutationForm intent="job.cancel" action={requestJobCancellationAction}><input type="hidden" name="jobId" value={String(record.id)} /><button className="button secondary compact" type="submit">Cancel</button></MutationForm> : null}{retryable ? <MutationForm intent="job.retry" action={retryJobAction}><input type="hidden" name="jobId" value={String(record.id)} /><button className="button secondary compact" type="submit">Retry</button></MutationForm> : null}</div></td></tr>;
    })}</tbody></table></div> : <EmptyState title="No durable jobs">Interactive breeding records do not require a worker. Large simulation fallbacks, media analysis, exports, and model evaluation can enqueue durable jobs.</EmptyState>}
    <section className="card section-gap" aria-labelledby="storage-cleanup-heading">
      <h2 id="storage-cleanup-heading">Orphaned-object reconciliation</h2>
      <p>Preview first. Candidates must be workspace-bound, older than the retention window, represented by a pending-upload record, and unreferenced by any authoritative or historical record. A destructive run rechecks references while claiming each object.</p>
      <div className="grid two">
        <MutationForm intent="storage.cleanup.preview" action={enqueueStorageCleanupAction} className="card">
          <input type="hidden" name="dryRun" value="true" />
          <label>Retention hours<input name="retentionHours" type="number" min="24" max="8760" defaultValue="24" required /></label>
          <label>Candidate limit<input name="deletionLimit" type="number" min="1" max="500" defaultValue="100" required /></label>
          <label>Object scan limit<input name="scanLimit" type="number" min="1" max="1000" defaultValue="500" required /></label>
          <button className="button secondary" type="submit">Preview cleanup</button>
        </MutationForm>
        <MutationForm intent="storage.cleanup.delete" action={enqueueStorageCleanupAction} className="card">
          <input type="hidden" name="dryRun" value="false" />
          <label>Retention hours<input name="retentionHours" type="number" min="24" max="8760" defaultValue="24" required /></label>
          <label>Deletion limit<input name="deletionLimit" type="number" min="1" max="500" defaultValue="100" required /></label>
          <label>Object scan limit<input name="scanLimit" type="number" min="1" max="1000" defaultValue="500" required /></label>
          <button className="button danger" type="submit">Delete verified orphans</button>
        </MutationForm>
      </div>
      <p className="muted">Dry runs never claim or delete objects. Production destructive runs enforce a minimum 24-hour retention window and are bounded to 500 candidates.</p>
    </section>
    <section className="card section-gap"><h2>Retry schedule</h2><div className="grid metrics">{[1,2,3,4].map((attempt) => <div className="card metric" key={attempt}><strong>{retryDelaySeconds(attempt,10)}s</strong><span>after attempt {attempt}</span></div>)}</div></section>
    <div className="notice section-gap"><strong>Worker authority:</strong> the application runtime cannot call cross-workspace worker functions. A separately provisioned worker database role claims jobs and outbox events through security-definer functions with leases and <span className="mono">SKIP LOCKED</span>.</div>
  </>;
}
