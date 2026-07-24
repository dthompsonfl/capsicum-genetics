import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('proxy security headers', () => {
  it('applies CSP and no-referrer to unauthenticated redirects', () => {
    const response = proxy(new NextRequest('https://capsicum.example.test/plants'));
    expect(response.status).toBe(307);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
