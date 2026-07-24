import { describe, expect, it } from 'vitest';
import { safeInternalDestination } from './safe-redirect';

const origin = 'https://capsicum.example.test';

describe('safeInternalDestination', () => {
  it.each([
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/%5cevil.example', '/'],
    ['/%255cevil.example', '/'],
    ['/safe%0d%0aX-Test:bad', '/'],
    ['https://evil.example/path', '/'],
    ['javascript:alert(1)', '/'],
    ['http://capsicum.example.test/path', '/'],
    ['///evil.example', '/'],
  ])('rejects %s', (value, expected) => {
    expect(safeInternalDestination(value, '/', origin)).toBe(expected);
  });

  it.each([
    ['/', '/'],
    ['/workspace?tab=plants#active', '/workspace?tab=plants#active'],
    ['/plants/%E2%9C%93', '/plants/%E2%9C%93'],
  ])('accepts normalized same-origin path %s', (value, expected) => {
    expect(safeInternalDestination(value, '/fallback', origin)).toBe(expected);
  });
});
