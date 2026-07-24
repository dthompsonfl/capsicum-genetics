export interface LogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  requestId?: string;
  workspaceId?: string;
  actorId?: string;
  fields?: Record<string, unknown>;
}

const secretPattern = /(authorization|cookie|password|secret|token|api[_-]?key|session|credential|private[_-]?key)/i;
const MAX_REDACTION_DEPTH = 12;

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_REDACTION_DEPTH) return '[TRUNCATED]';
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, depth + 1, seen));
    }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
      };
    }
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      secretPattern.test(key) ? '[REDACTED]' : redactValue(nested, depth + 1, seen),
    ]));
  } finally {
    seen.delete(value);
  }
}

export function redactFields(input: Record<string, unknown>): Record<string, unknown> {
  return redactValue(input, 0, new WeakSet()) as Record<string, unknown>;
}

export function serializeLogEvent(event: LogEvent, occurredAt = new Date().toISOString()): string {
  if (!event.event.trim()) throw new TypeError('event is required.');
  return JSON.stringify({
    occurredAt,
    ...event,
    fields: event.fields ? redactFields(event.fields) : undefined,
  });
}
