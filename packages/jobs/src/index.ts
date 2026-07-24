export type JobState =
  | 'queued'
  | 'running'
  | 'cancel_requested'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'dead_letter';

export interface JobSnapshot {
  id: string;
  state: JobState;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastErrorCode: string | null;
}

export type JobCommand =
  | { type: 'claim'; workerId: string; now: string; leaseSeconds: number }
  | { type: 'heartbeat'; workerId: string; now: string; leaseSeconds: number }
  | { type: 'request-cancellation' }
  | { type: 'complete'; workerId: string; now: string }
  | { type: 'acknowledge-cancellation'; workerId: string; now: string }
  | { type: 'fail'; workerId: string; now: string; errorCode: string; baseDelaySeconds: number }
  | { type: 'expire-lease'; now: string; baseDelaySeconds: number };

const terminalStates = new Set<JobState>(['succeeded', 'cancelled', 'dead_letter']);

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be an ISO-8601 timestamp.`);
  return parsed;
}

function requiredIdentifier(value: string, label: string): void {
  if (!value.trim()) throw new TypeError(`${label} is required.`);
}

function assertWorker(snapshot: JobSnapshot, workerId: string): void {
  requiredIdentifier(workerId, 'workerId');
  if (snapshot.leaseOwner !== workerId) {
    throw new RangeError(`Worker ${workerId} does not own job ${snapshot.id}.`);
  }
}

function assertActiveLease(snapshot: JobSnapshot, workerId: string, now: string): void {
  assertWorker(snapshot, workerId);
  if (!snapshot.leaseExpiresAt) throw new RangeError(`Job ${snapshot.id} has no active lease.`);
  if (timestamp(now, 'now') >= timestamp(snapshot.leaseExpiresAt, 'leaseExpiresAt')) {
    throw new RangeError(`Worker ${workerId} lease for job ${snapshot.id} has expired.`);
  }
}

function leaseExpiry(now: string, leaseSeconds: number): string {
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 86_400) {
    throw new RangeError('leaseSeconds must be an integer between 1 and 86400.');
  }
  return new Date(timestamp(now, 'now') + leaseSeconds * 1_000).toISOString();
}

export function retryDelaySeconds(attempt: number, baseDelaySeconds: number, capSeconds = 3600): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new RangeError('attempt must be a positive integer.');
  if (!Number.isSafeInteger(baseDelaySeconds) || baseDelaySeconds < 1) {
    throw new RangeError('baseDelaySeconds must be a positive integer.');
  }
  if (!Number.isSafeInteger(capSeconds) || capSeconds < baseDelaySeconds) {
    throw new RangeError('capSeconds must be an integer at least as large as baseDelaySeconds.');
  }
  return Math.min(capSeconds, baseDelaySeconds * 2 ** Math.min(attempt - 1, 30));
}

function failedOrDeadLetter(
  snapshot: Readonly<JobSnapshot>,
  now: string,
  errorCode: string,
  baseDelaySeconds: number,
): JobSnapshot {
  requiredIdentifier(errorCode, 'errorCode');
  const deadLetter = snapshot.attempt >= snapshot.maxAttempts;
  const delay = retryDelaySeconds(snapshot.attempt, baseDelaySeconds);
  return {
    ...snapshot,
    state: deadLetter ? 'dead_letter' : 'failed',
    availableAt: deadLetter
      ? snapshot.availableAt
      : new Date(timestamp(now, 'now') + delay * 1_000).toISOString(),
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: errorCode,
  };
}

export function transitionJob(snapshot: Readonly<JobSnapshot>, command: JobCommand): JobSnapshot {
  requiredIdentifier(snapshot.id, 'job id');
  if (!Number.isSafeInteger(snapshot.attempt) || snapshot.attempt < 0) {
    throw new RangeError('Job attempt must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(snapshot.maxAttempts) || snapshot.maxAttempts < 1) {
    throw new RangeError('Job maxAttempts must be a positive safe integer.');
  }
  if (terminalStates.has(snapshot.state)) {
    throw new RangeError(`Terminal job ${snapshot.id} cannot transition from ${snapshot.state}.`);
  }

  switch (command.type) {
    case 'claim': {
      requiredIdentifier(command.workerId, 'workerId');
      if (!['queued', 'failed'].includes(snapshot.state)) {
        throw new RangeError(`Only queued or failed jobs may be claimed; received ${snapshot.state}.`);
      }
      const now = timestamp(command.now, 'now');
      if (now < timestamp(snapshot.availableAt, 'availableAt')) {
        throw new RangeError(`Job ${snapshot.id} is not available yet.`);
      }
      if (snapshot.attempt >= snapshot.maxAttempts) {
        throw new RangeError(`Job ${snapshot.id} exhausted its retry budget.`);
      }
      return {
        ...snapshot,
        state: 'running',
        attempt: snapshot.attempt + 1,
        leaseOwner: command.workerId,
        leaseExpiresAt: leaseExpiry(command.now, command.leaseSeconds),
        lastErrorCode: null,
      };
    }
    case 'heartbeat':
      if (!['running', 'cancel_requested'].includes(snapshot.state)) {
        throw new RangeError('Only running or cancellation-requested jobs may renew a lease.');
      }
      assertActiveLease(snapshot, command.workerId, command.now);
      return { ...snapshot, leaseExpiresAt: leaseExpiry(command.now, command.leaseSeconds) };
    case 'request-cancellation':
      if (snapshot.state === 'queued' || snapshot.state === 'failed') {
        return { ...snapshot, state: 'cancelled', leaseOwner: null, leaseExpiresAt: null };
      }
      if (snapshot.state === 'cancel_requested') return { ...snapshot };
      if (snapshot.state !== 'running') throw new RangeError(`Cannot cancel job in ${snapshot.state}.`);
      return { ...snapshot, state: 'cancel_requested' };
    case 'acknowledge-cancellation':
      if (snapshot.state !== 'cancel_requested') throw new RangeError('Cancellation was not requested.');
      assertActiveLease(snapshot, command.workerId, command.now);
      return { ...snapshot, state: 'cancelled', leaseOwner: null, leaseExpiresAt: null };
    case 'complete':
      if (snapshot.state !== 'running') throw new RangeError('Only a running job may complete.');
      assertActiveLease(snapshot, command.workerId, command.now);
      return { ...snapshot, state: 'succeeded', leaseOwner: null, leaseExpiresAt: null };
    case 'fail':
      if (snapshot.state !== 'running') throw new RangeError('Only a running job may fail.');
      assertActiveLease(snapshot, command.workerId, command.now);
      return failedOrDeadLetter(
        snapshot,
        command.now,
        command.errorCode,
        command.baseDelaySeconds,
      );
    case 'expire-lease': {
      if (!['running', 'cancel_requested'].includes(snapshot.state)) {
        throw new RangeError('Only leased jobs may expire.');
      }
      if (!snapshot.leaseExpiresAt) throw new RangeError(`Job ${snapshot.id} has no lease expiry.`);
      if (timestamp(command.now, 'now') < timestamp(snapshot.leaseExpiresAt, 'leaseExpiresAt')) {
        throw new RangeError(`Job ${snapshot.id} lease has not expired.`);
      }
      if (snapshot.state === 'cancel_requested') {
        return { ...snapshot, state: 'cancelled', leaseOwner: null, leaseExpiresAt: null };
      }
      return failedOrDeadLetter(
        snapshot,
        command.now,
        'lease_expired',
        command.baseDelaySeconds,
      );
    }
  }
}
