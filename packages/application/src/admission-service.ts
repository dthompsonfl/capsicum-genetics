import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { Principal } from '@capsicum/contracts';
import { withSystemTransaction, withWorkspaceTransaction } from '@capsicum/database';
import { ApplicationError } from './internal';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}

export interface OperationAdmissionPolicy {
  scope: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
  activeJobTypes?: readonly string[];
  maxActiveJobs?: number;
}

function admissionKey(principal: Principal, scope: string, networkKey?: string): string {
  return createHash('sha256')
    .update(`${scope}\0${principal.workspaceId}\0${principal.userId}\0${networkKey ?? 'network-unavailable'}`)
    .digest('hex');
}

export async function enforceOperationAdmission(
  pool: pg.Pool,
  principal: Principal,
  policy: OperationAdmissionPolicy,
  networkKey?: string,
): Promise<void> {
  const outcome = await withSystemTransaction(pool, async (client) => {
    const result = await client.query<RateLimitResult>(
      `SELECT allowed, remaining, retry_after_seconds
       FROM app_consume_rate_limit($1,$2,$3,$4,$5)`,
      [admissionKey(principal, policy.scope, networkKey), policy.scope, policy.limit, policy.windowSeconds, policy.blockSeconds ?? policy.windowSeconds],
    );
    return result.rows[0] ?? { allowed: false, remaining: 0, retry_after_seconds: policy.windowSeconds };
  });
  if (!outcome.allowed) {
    throw new ApplicationError('rate_limited', 'This operation has exceeded its shared workspace and user budget.', {
      retryable: true,
      retryAfterSeconds: Math.max(1, outcome.retry_after_seconds || policy.windowSeconds),
    });
  }
  if (policy.activeJobTypes?.length && policy.maxActiveJobs !== undefined) {
    const activeCount = await withWorkspaceTransaction(pool, {
      workspaceId: principal.workspaceId,
      actorUserId: principal.userId,
    }, async (client) => Number((await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM jobs
       WHERE workspace_id=app_current_workspace_id()
         AND job_type = ANY($1::text[])
         AND state IN ('queued','running','cancel_requested','failed')`,
      [policy.activeJobTypes],
    )).rows[0]?.count ?? 0));
    if (activeCount >= policy.maxActiveJobs) {
      throw new ApplicationError('rate_limited', 'The workspace already has the maximum number of active jobs for this operation.', {
        retryable: true,
        retryAfterSeconds: 30,
      });
    }
  }
}
