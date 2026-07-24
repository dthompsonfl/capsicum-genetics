import { serializeLogEvent, type LogEvent } from '@capsicum/observability';

export function writeLog(event: LogEvent): void {
  const serialized = serializeLogEvent(event);
  if (event.level === 'error') console.error(serialized);
  else if (event.level === 'warn') console.warn(serialized);
  else if (event.level === 'debug') console.debug(serialized);
  else console.info(serialized);
}

export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { errorName: error.name, errorMessage: error.message };
  return { errorName: 'UnknownError' };
}
