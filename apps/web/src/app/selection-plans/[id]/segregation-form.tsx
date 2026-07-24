'use client';

import { useMemo, useState } from 'react';
import { MutationForm } from '../../../components/mutation-form';
import { recordSelectionPlanReconciliationAction } from '../../actions';

interface CategoryRow {
  id: string;
  categoryId: string;
  observedCount: string;
  expectedNumerator: string;
  expectedDenominator: string;
}

function newRow(categoryId: string, numerator: string, denominator: string, id: string = crypto.randomUUID()): CategoryRow {
  return { id, categoryId, observedCount: '0', expectedNumerator: numerator, expectedDenominator: denominator };
}

export function SegregationReconciliationForm({ selectionPlanId }: { selectionPlanId: string }) {
  const [rows, setRows] = useState<CategoryRow[]>([
    newRow('target', '1', '4', 'initial-target'),
    newRow('other', '3', '4', 'initial-other'),
  ]);
  const categories = useMemo(() => JSON.stringify(rows.map(({ id: _id, ...row }) => ({
    ...row,
    observedCount: Number(row.observedCount),
  }))), [rows]);

  return (
    <MutationForm intent={`selection-plan.reconcile:${selectionPlanId}`} className="form-grid" action={recordSelectionPlanReconciliationAction}>
      <input type="hidden" name="selectionPlanId" value={selectionPlanId} />
      <input type="hidden" name="categories" value={categories} />
      <div className="field full">
        <span className="field-label">Observed categories and exact expected probabilities</span>
        <p className="help">Probabilities are exact fractions and must sum to 1. Missing progeny are disclosed separately and excluded from the scored denominator.</p>
      </div>
      {rows.map((row, index) => (
        <fieldset className="card full" key={row.id}>
          <legend>Category {index + 1}</legend>
          <div className="form-grid four">
            <label className="field"><span>Category label</span><input value={row.categoryId} maxLength={200} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, categoryId: event.target.value } : item))} required /></label>
            <label className="field"><span>Observed count</span><input type="number" min="0" max="10000000" value={row.observedCount} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, observedCount: event.target.value } : item))} required /></label>
            <label className="field"><span>Expected numerator</span><input inputMode="numeric" pattern="[0-9]+" value={row.expectedNumerator} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, expectedNumerator: event.target.value } : item))} required /></label>
            <label className="field"><span>Expected denominator</span><input inputMode="numeric" pattern="[1-9][0-9]*" value={row.expectedDenominator} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, expectedDenominator: event.target.value } : item))} required /></label>
          </div>
          {rows.length > 2 ? <button className="button secondary" type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>Remove category</button> : null}
        </fieldset>
      ))}
      <div className="field">
        <label htmlFor="missingCount">Missing or unscored progeny</label>
        <input id="missingCount" name="missingCount" type="number" min="0" max="10000000" defaultValue="0" required />
      </div>
      <div className="field actions-end">
        <button className="button secondary" type="button" onClick={() => setRows((current) => [...current, newRow(`category-${current.length + 1}`, '0', '1')])} disabled={rows.length >= 100}>Add category</button>
        <button className="button" type="submit">Record immutable reconciliation</button>
      </div>
    </MutationForm>
  );
}
