import Link from 'next/link';
import { listSelectionPlans, listSimulationRuns } from '@capsicum/application';
import { MutationForm } from '@/components/mutation-form';
import { EmptyState, ErrorNotice, PageHeader } from '../../components/page-primitives';
import { formatDate, humanize, queryError, text } from '../../lib/presentation';
import { getDatabasePool } from '../../lib/database';
import { requirePrincipal } from '../../lib/session';
import { createSelectionPlanAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SelectionPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; simulationRunId?: string }>;
}) {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const query = await searchParams;
  const [plans, runs] = await Promise.all([
    listSelectionPlans(pool, principal),
    listSimulationRuns(pool, principal),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Operational planning"
        title="Selection plans"
        description="Turn an immutable probability result into a versioned grow-out plan. Confidence is a statistical planning threshold, never a guarantee."
      />
      <ErrorNotice message={queryError(query.error)} />
      <section className="card">
        <h2>Create plan from simulation</h2>
        {runs.length ? (
          <MutationForm
            intent="selection-plan.create"
            className="form-grid"
            action={createSelectionPlanAction}
          >
            <div className="field full">
              <label htmlFor="simulationRunId">Source simulation</label>
              <select
                id="simulationRunId"
                name="simulationRunId"
                defaultValue={query.simulationRunId ?? ''}
                required
              >
                <option value="">Select an immutable run</option>
                {runs.map((run: Record<string, unknown>) => (
                  <option key={String(run.id)} value={String(run.id)}>
                    {humanize(run.calculation_authority)} calculation · {humanize(run.premise_authority)} premises ·{' '}
                    {String(run.content_hash).slice(0, 18)}… · {formatDate(run.completed_at)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="name">Plan name</label>
              <input id="name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="scenarioType">Generation scenario</label>
              <select id="scenarioType" name="scenarioType" defaultValue="f1" required>
                <option value="f1">F1</option>
                <option value="f2_self">F2 by selfing the F1</option>
                <option value="backcross_maternal">Backcross to the seed parent</option>
                <option value="backcross_paternal">Backcross to the pollen parent</option>
                <option value="reciprocal">Reciprocal cross</option>
                <option value="multi_generation">Explicit multi-generation plan</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="plannedPopulation">Planned population</label>
              <input id="plannedPopulation" name="plannedPopulation" type="number" min="1" required />
            </div>
            <div className="field">
              <label htmlFor="confidence">Planning confidence</label>
              <input id="confidence" name="confidence" type="number" min="0.01" max="0.999999" step="0.01" defaultValue="0.95" required />
              <p className="help">The chance of observing at least one target individual under the stated premises—not certainty.</p>
            </div>
            <div className="field full">
              <label htmlFor="targetDescription">Selection target</label>
              <textarea id="targetDescription" name="targetDescription" rows={3} required />
            </div>
            <div className="field full">
              <label htmlFor="targetExpression">Structured target expression</label>
              <textarea
                id="targetExpression"
                name="targetExpression"
                rows={5}
                defaultValue={'{"all":[{"locusId":"example-locus","genotype":["A","A"]}]}' }
                aria-describedby="target-expression-help"
              />
              <p className="help" id="target-expression-help">
                JSON is preserved exactly in the immutable plan. Use only locus and allele identifiers supported by the source simulation or leave an empty object for a description-only target.
              </p>
            </div>
            <div className="field full">
              <label htmlFor="generationPlan">Multi-generation steps</label>
              <textarea
                id="generationPlan"
                name="generationPlan"
                rows={5}
                defaultValue="[]"
                aria-describedby="generation-plan-help"
              />
              <p className="help" id="generation-plan-help">
                Required only for the multi-generation scenario. JSON array fields: generation, crossType, targetDescription, and optional plannedPopulation.
              </p>
            </div>
            <div className="field full">
              <label htmlFor="assumptions">Additional assumptions</label>
              <textarea id="assumptions" name="assumptions" rows={3} placeholder="One explicit assumption per line" />
            </div>
            <input type="hidden" name="targetModelVersion" value="1.0.0" />
            <div className="field full">
              <label htmlFor="notes">Operational notes</label>
              <textarea id="notes" name="notes" rows={3} />
            </div>
            <div className="full">
              <button className="button" type="submit">Create immutable selection plan</button>
            </div>
          </MutationForm>
        ) : (
          <p className="muted">Run and persist a governed simulation first.</p>
        )}
      </section>
      <div className="section-gap">
        {plans.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Scenario</th>
                  <th>Population</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Simulation</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan: Record<string, unknown>) => (
                  <tr key={String(plan.id)}>
                    <td>
                      <Link className="inline-link" href={`/selection-plans/${String(plan.id)}`}>
                        {text(plan.name)}
                      </Link>
                    </td>
                    <td>{humanize(plan.scenario_type)}</td>
                    <td>{text(plan.planned_population)}</td>
                    <td>{`${(Number(plan.confidence) * 100).toFixed(0)}%`}</td>
                    <td>{humanize(plan.status)}</td>
                    <td className="mono">{String(plan.simulation_hash).slice(0, 14)}…</td>
                    <td>{formatDate(plan.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No selection plans">
            Selection plans preserve the difference between expected recovery and observed outcomes.
          </EmptyState>
        )}
      </div>
    </>
  );
}
