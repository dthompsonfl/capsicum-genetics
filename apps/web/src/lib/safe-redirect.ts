const controlCharacter = /[\u0000-\u001f\u007f]/;
const encodedBackslash = /%5c/i;

function containsUnsafeDecodedCharacters(value: string): boolean {
  let current = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (current.includes('\\') || controlCharacter.test(current) || encodedBackslash.test(current)) return true;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) return false;
      current = decoded;
    } catch {
      return true;
    }
  }
  return current.includes('\\') || controlCharacter.test(current);
}

export function safeInternalDestination(
  value: string | undefined,
  fallback: string,
  applicationOrigin: string,
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || containsUnsafeDecodedCharacters(value)) return fallback;
  let origin: URL;
  let destination: URL;
  try {
    origin = new URL(applicationOrigin);
    destination = new URL(value, origin);
  } catch {
    return fallback;
  }
  if (!['http:', 'https:'].includes(origin.protocol) || destination.origin !== origin.origin) return fallback;
  if (destination.username || destination.password) return fallback;
  const normalized = `${destination.pathname}${destination.search}${destination.hash}`;
  if (!normalized.startsWith('/') || normalized.startsWith('//') || containsUnsafeDecodedCharacters(normalized)) return fallback;
  return normalized;
}
