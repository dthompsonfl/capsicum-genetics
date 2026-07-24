'use client';

import { useActionState } from 'react';
import { createInvitationAction } from '../app/actions';
import { MutationForm } from '@/components/mutation-form';

const initialState: {
  completedRequestId?: string;
  deliveryState?: 'delivered' | 'unavailable' | 'failed';
  error?: string;
} = {};

export function InvitationForm() {
  const [state, action, pending] = useActionState(createInvitationAction, initialState);
  return (
    <div>
      <MutationForm
        intent="workspace.invitation"
        {...(state.completedRequestId ? { completedRequestId: state.completedRequestId } : {})}
        className="form-grid"
        action={action}
      >
        <div className="field"><label htmlFor="invite-email">Email</label><input id="invite-email" name="email" type="email" required /></div>
        <div className="field"><label htmlFor="invite-role">Responsibility level</label><select id="invite-role" name="role" aria-describedby="role-help"><option value="breeder">Breeder — plans crosses and selections</option><option value="technician">Technician — records plants and observations</option><option value="scientific_reviewer">Scientific reviewer — independently reviews evidence</option><option value="catalog_curator">Catalog curator — prepares scientific catalog records</option><option value="administrator">Administrator — manages workspace operations</option><option value="viewer">Viewer — read-only access</option></select><small id="role-help">Choose the least powerful role that covers the person’s actual work. Reviewer and curator should usually be different people.</small></div>
        <div className="field"><label htmlFor="expiresInHours">Invitation expires after</label><input id="expiresInHours" name="expiresInHours" type="number" min="1" max="720" defaultValue="168" required /><small>Hours. The default is 168 hours, or 7 days.</small></div>
        <div className="full"><button className="button" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create invitation'}</button></div>
      </MutationForm>
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      {state.deliveryState === 'delivered' ? <p className="notice section-gap" role="status">The invitation was created and handed to the configured delivery adapter.</p> : null}
      {state.deliveryState === 'unavailable' || state.deliveryState === 'failed' ? <p className="warning section-gap" role="alert">The invitation was created, but secure delivery is unavailable. Revoke it or resend after configuring a delivery adapter.</p> : null}
    </div>
  );
}
