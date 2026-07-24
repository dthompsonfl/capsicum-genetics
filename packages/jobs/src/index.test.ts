import { describe, expect, it } from 'vitest';
import { retryDelaySeconds, transitionJob, type JobSnapshot } from './index';

const queued = (): JobSnapshot => ({
  id: 'job-1', state: 'queued', attempt: 0, maxAttempts: 3,
  availableAt: '2026-07-22T12:00:00.000Z', leaseOwner: null,
  leaseExpiresAt: null, lastErrorCode: null,
});

describe('durable job state machine', () => {
  it('claims, retries, and eventually dead-letters deterministically', () => {
    let job = transitionJob(queued(), { type: 'claim', workerId: 'worker-a', now: '2026-07-22T12:00:00.000Z', leaseSeconds: 30 });
    job = transitionJob(job, { type: 'fail', workerId: 'worker-a', now: '2026-07-22T12:00:05.000Z', errorCode: 'timeout', baseDelaySeconds: 10 });
    expect(job.state).toBe('failed');
    expect(job.availableAt).toBe('2026-07-22T12:00:15.000Z');
    job = transitionJob(job, { type: 'claim', workerId: 'worker-b', now: job.availableAt, leaseSeconds: 30 });
    job = transitionJob(job, { type: 'fail', workerId: 'worker-b', now: '2026-07-22T12:00:20.000Z', errorCode: 'timeout', baseDelaySeconds: 10 });
    job = transitionJob(job, { type: 'claim', workerId: 'worker-c', now: job.availableAt, leaseSeconds: 30 });
    job = transitionJob(job, { type: 'fail', workerId: 'worker-c', now: '2026-07-22T12:00:45.000Z', errorCode: 'timeout', baseDelaySeconds: 10 });
    expect(job.state).toBe('dead_letter');
  });

  it('supports cooperative cancellation and idempotent cancellation requests', () => {
    const running = transitionJob(queued(), { type: 'claim', workerId: 'worker-a', now: '2026-07-22T12:00:00.000Z', leaseSeconds: 30 });
    const requested = transitionJob(running, { type: 'request-cancellation' });
    expect(transitionJob(requested, { type: 'request-cancellation' })).toEqual(requested);
    expect(transitionJob(requested, {
      type: 'acknowledge-cancellation',
      workerId: 'worker-a',
      now: '2026-07-22T12:00:10.000Z',
    }).state).toBe('cancelled');
  });

  it('rejects completion by a stale lease owner', () => {
    const running = transitionJob(queued(), { type: 'claim', workerId: 'worker-a', now: '2026-07-22T12:00:00.000Z', leaseSeconds: 30 });
    expect(() => transitionJob(running, {
      type: 'complete',
      workerId: 'worker-a',
      now: '2026-07-22T12:00:30.000Z',
    })).toThrow(/expired/);
  });

  it('recovers an abandoned job after its lease expires', () => {
    const running = transitionJob(queued(), { type: 'claim', workerId: 'worker-a', now: '2026-07-22T12:00:00.000Z', leaseSeconds: 30 });
    const failed = transitionJob(running, {
      type: 'expire-lease',
      now: '2026-07-22T12:00:30.000Z',
      baseDelaySeconds: 10,
    });
    expect(failed.state).toBe('failed');
    expect(failed.lastErrorCode).toBe('lease_expired');
    expect(failed.availableAt).toBe('2026-07-22T12:00:40.000Z');
  });

  it('caps exponential retry delay', () => {
    expect(retryDelaySeconds(40, 10, 3600)).toBe(3600);
  });
});
