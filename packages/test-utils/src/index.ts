export function fixedClock(iso: string): () => Date {
  const milliseconds = Date.parse(iso);
  if (!Number.isFinite(milliseconds)) throw new TypeError('fixedClock requires an ISO-8601 timestamp.');
  return () => new Date(milliseconds);
}

export function sequenceId(prefix: string): (index?: number) => string {
  if (!prefix.trim()) throw new TypeError('prefix is required.');
  let current = 0;
  return (index?: number) => `${prefix}-${index ?? ++current}`;
}
