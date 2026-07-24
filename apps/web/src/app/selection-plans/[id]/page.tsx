import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSelectionPlan } from '@capsicum/application';
import { DefinitionList, ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { MutationForm } from '../../../components/mutation-form';
import { formatDate, humanize, queryError, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';
import { transitionSelectionPlanAction } from '../../actions';
import { SegregationReconciliationForm } from './segregation-form';

export const dynamic = 'force-dynamic';

function pretty(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

export default async function SelectionPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; completedRequestId?: string }> }) {
  const principal = await requirePrincipal();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const plan = (await getSelectionPlan(getDatabasePool(), principal, id)) as Record<string, unknown> | null;
  if (!plan) notFound();
  const status = String(plan.status);
  const version = Number(plan.status_version);
  const canReview = ['owner', 'scientific_reviewer'].includes(principal.role) && String(plan.created_by) !== principal.userId;
  const canOperate = ['owner', 'administrator', 'breeder'].includes(principal.role);
  const transitions = Array.isArray(plan.transition_history) ? plan.transition_history as Record<string, unknown>[] : [];
  const reconciliations = Array.isArray(plan.reconciliations) ? plan.reconciliations as Record<string, unknown>[] : [];

  return (
    <>
      <PageHeader
        eyebrow="Selection plan"
        title={text(plan.name)}
        description="An immutable scientific planning snapshot linked to one immutable simulation result. Population and confidence values are probabilistic, not guarantees."
      />
      <ErrorNotice message={queryError(query.error)} />
      <section className="card">
        <DefinitionList
          entries={[
            ['Status', humanize(plan.status)],
            ['Scenario', humanize(plan.scenario_type)],
            ['Planned population', text(plan.planned_population)],
            ['Planning confidence', `${(Number(plan.confidence) * 100).toFixed(1)}%`],
            ['Target model', `${text(plan.target_model)} ${text(plan.target_model_version)}`],
            ['Target', text(plan.target_description)],
            ['Source simulation model', text(plan.originating_simulation_model_version)],
            [
              'Simulation hash',
              <span className="mono wrap" key="hash">
                {text(plan.originating_simulation_content_hash)}
              </span>,
            ],
            ['Created', formatDate(plan.created_at)],
            ['Notes', text(plan.notes)],
          ]}
        />
      </section>
      {(status === 'draft' && canReview) || (canOperate && ['draft', 'approved', 'active'].includes(status)) ? (
        <section className="card section-gap">
          <h2>Controlled lifecycle</h2>
          <p className="muted">Approval requires an independent reviewer. Activation, completion, and cancellation are version-checked and recorded in append-only transition history.</p>
          <div className="form-grid">
            {status === 'draft' && canReview ? (
              <MutationForm intent={`selection-plan.approve:${String(plan.id)}:${version}`} action={transitionSelectionPlanAction}>
                <input type="hidden" name="selectionPlanId" value={String(plan.id)} />
                <input type="hidden" name="expectedVersion" value={version} />
                <input type="hidden" name="toStatus" value="approved" />
                <button className="button" type="submit">Approve independently</button>
              </MutationForm>
            ) : null}
            {status === 'approved' && canOperate ? (
              <MutationForm intent={`selection-plan.activate:${String(plan.id)}:${version}`} action={transitionSelectionPlanAction}>
                <input type="hidden" name="selectionPlanId" value={String(plan.id)} />
                <input type="hidden" name="expectedVersion" value={version} />
                <input type="hidden" name="toStatus" value="active" />
                <button className="button" type="submit">Activate grow-out plan</button>
              </MutationForm>
            ) : null}
            {status === 'active' && canOperate ? (
              <MutationForm intent={`selection-plan.complete:${String(plan.id)}:${version}`} className="field" action={transitionSelectionPlanAction}>
                <input type="hidden" name="selectionPlanId" value={String(plan.id)} />
                <input type="hidden" name="expectedVersion" value={version} />
                <input type="hidden" name="toStatus" value="completed" />
                <label htmlFor="complete-reason">Outcome summary</label>
                <textarea id="complete-reason" name="reason" minLength={3} required />
                <button className="button" type="submit">Complete plan</button>
              </MutationForm>
            ) : null}
            {canOperate && ['draft', 'approved', 'active'].includes(status) ? (
              <MutationForm intent={`selection-plan.cancel:${String(plan.id)}:${version}`} className="field" action={transitionSelectionPlanAction}>
                <input type="hidden" name="selectionPlanId" value={String(plan.id)} />
                <input type="hidden" name="expectedVersion" value={version} />
                <input type="hidden" name="toStatus" value="cancelled" />
                <label htmlFor="cancel-reason">Cancellation reason</label>
                <textarea id="cancel-reason" name="reason" minLength={3} required />
                <button className="button secondary" type="submit">Cancel plan</button>
              </MutationForm>
            ) : null}
          </div>
        </section>
      ) : null}
      <section className="card section-gap">
        <h2>Immutable planning basis</h2>
        <h3>Target expression</h3>
        <pre className="code-block wrap">{pretty(plan.target_expression)}</pre>
        <h3>Probability basis</h3>
        <pre className="code-block wrap">{pretty(plan.probability_basis)}</pre>
        <h3>Population calculation</h3>
        <pre className="code-block wrap">{pretty(plan.population_calculation)}</pre>
        <h3>Generation plan</h3>
        <pre className="code-block wrap">{pretty(plan.generation_plan)}</pre>
        <h3>Assumptions</h3>
        <pre className="code-block wrap">{pretty(plan.assumptions)}</pre>
      </section>
      {canOperate && ['active', 'completed'].includes(status) ? (
        <section className="card section-gap">
          <h2>Observed progeny reconciliation</h2>
          <p className="muted">Compare scored progeny with the immutable expectation. The test measures compatibility with the stated model; it does not prove a causal mechanism or guarantee future outcomes.</p>
          <SegregationReconciliationForm selectionPlanId={String(plan.id)} />
        </section>
      ) : null}
      <section className="card section-gap">
        <h2>Recorded reconciliation results</h2>
        {reconciliations.length ? reconciliations.map((item) => (
          <article className="notice section-gap" key={String(item.id)}>
            <h3>{humanize(item.method)}</h3>
            <DefinitionList entries={[
              ['Scored progeny', text(item.sampleSize)],
              ['Missing or unscored', text(item.missingCount)],
              ['Assumptions met', item.assumptionsMet === true ? 'Yes' : 'No'],
              ['P-value', typeof item.pValue === 'number' ? item.pValue.toPrecision(6) : 'Not produced'],
              ['Statistic', text(item.statistic)],
              ['Engine', text(item.engineVersion)],
              ['Recorded by', text(item.createdBy)],
              ['Recorded', formatDate(item.createdAt)],
            ]} />
            <p>{text(item.interpretation)}</p>
            {Array.isArray(item.warnings) && item.warnings.length ? <ul>{item.warnings.map((warning, index) => <li key={`${String(item.id)}-warning-${index}`}>{text(warning)}</li>)}</ul> : null}
            <details><summary>Expected counts and reproducibility hashes</summary><pre className="code-block wrap">{pretty({ expectedCounts: item.expectedCounts, inputHash: item.inputHash, resultHash: item.resultHash })}</pre></details>
          </article>
        )) : <p className="muted">No observed segregation analysis has been recorded.</p>}
      </section>
      <section className="card section-gap">
        <h2>Lifecycle history</h2>
        {transitions.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Transition</th><th>Version</th><th>Actor</th><th>Reason</th><th>Time</th></tr></thead>
              <tbody>{transitions.map((transition) => (
                <tr key={String(transition.id)}>
                  <td>{humanize(transition.fromStatus)} → {humanize(transition.toStatus)}</td>
                  <td>{text(transition.toVersion)}</td>
                  <td>{text(transition.actorDisplayName, 'Recorded member')}</td>
                  <td>{text(transition.reason)}</td>
                  <td>{formatDate(transition.occurredAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">No lifecycle transitions have been recorded.</p>}
      </section>
      <p className="section-gap">
        <Link className="button secondary" href={`/simulations/${String(plan.simulation_run_id)}`}>
          Open source simulation
        </Link>
      </p>
    </>
  );
}
