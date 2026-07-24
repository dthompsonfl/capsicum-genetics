export function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function humanize(value: unknown): string {
  return typeof value === 'string'
    ? value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
    : '—';
}

export function text(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const QUERY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  validation_failed: 'Review the highlighted information and submit again.',
  permission_denied: 'You do not have permission to perform this action.',
  not_found: 'The requested record is unavailable or no longer accessible.',
  conflict: 'The record changed or conflicts with an existing operation. Refresh and try again.',
  stale_version: 'This record changed after you opened it. Refresh before making another correction.',
  duplicate_in_progress: 'This request is already being processed. Wait for the current attempt to finish.',
  idempotency_conflict: 'This submission identifier was already used for different information. Reset the form and try again.',
  rate_limited: 'Too many attempts were received. Wait briefly and try again.',
  unavailable: 'A required service is temporarily unavailable. No authoritative change was recorded.',
  scientific_authority_required: 'Approved scientific authority is required for this operation.',
  scientific_authority_unavailable: 'The required scientific model or reviewed evidence is not available.',
  invalid_credential: 'The one-time credential is invalid or expired.',
  sign_in_failed: 'The email, password, or authentication code was not accepted.',
  upload_rejected: 'The upload was rejected safely. Review the file type and size, then try again.',
  export_queue_failed: 'The export could not be queued safely. Review your access and try again.',
  request_failed: 'The request could not be completed. No unsupported scientific conclusion was recorded.',
};

export function queryError(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const code = Array.isArray(value) ? value[0] : value;
  if (!code) return null;
  return QUERY_ERROR_MESSAGES[code] ?? QUERY_ERROR_MESSAGES.request_failed ?? null;
}
