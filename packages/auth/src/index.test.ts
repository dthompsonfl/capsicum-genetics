import { describe, expect, it } from 'vitest';
import {
  isIndependentCatalogReviewer,
  decryptTotpSecret,
  encryptTotpSecret,
  hashRecoveryCode,
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  keyedSubjectHash,
  verifyPasswordOrDummy,
  hasPermission,
  verifyPassword,
  verifyTotpCode,
} from './index';

describe('authorization and credentials', () => {
  it('enforces role permissions', () => {
    expect(hasPermission('viewer', 'material.read')).toBe(true);
    expect(hasPermission('viewer', 'material.write')).toBe(false);
  });

  it('enforces independent review', () => {
    expect(isIndependentCatalogReviewer({ actorId: 'reviewer', authorId: 'author' })).toBe(true);
    expect(isIndependentCatalogReviewer({ actorId: 'same', authorId: 'same' })).toBe(false);
  });

  it('hashes and verifies passwords without storing plaintext', async () => {
    const encoded = await hashPassword('Correct-Horse-47-Battery');
    expect(encoded).not.toContain('Correct-Horse');
    expect(await verifyPassword('Correct-Horse-47-Battery', encoded)).toBe(true);
    expect(await verifyPassword('incorrect-password', encoded)).toBe(false);
  });


  it('uses a stable keyed digest without retaining the raw abuse-control subject', () => {
    const digest = keyedSubjectHash('a'.repeat(32), 'sign-in', 'Breeder@Example.test');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain('breeder');
    expect(digest).toBe(keyedSubjectHash('a'.repeat(32), 'sign-in', ' breeder@example.test '));
    expect(digest).not.toBe(keyedSubjectHash('b'.repeat(32), 'sign-in', 'breeder@example.test'));
  });

  it('runs a real scrypt verification path for an unknown account', async () => {
    expect(await verifyPasswordOrDummy('not-the-dummy-password', null)).toBe(false);
  });

  it('creates high-entropy hashed session tokens', () => {
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThan(32);
    expect(hashOpaqueToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies the RFC 6238 SHA-1 six-digit TOTP vector', () => {
    const result = verifyTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', {
      now: new Date(59_000),
      window: 0,
    });
    expect(result.valid).toBe(true);
    expect(result.step).toBe(1);
  });

  it('encrypts TOTP seeds with authenticated encryption', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const encrypted = encryptTotpSecret(secret, 'a'.repeat(64));
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, 'a'.repeat(64))).toBe(secret);
    expect(() => decryptTotpSecret(`${encrypted}corrupt`, 'a'.repeat(64))).toThrow();
  });

  it('normalizes recovery codes before keyed hashing', () => {
    const secret = 'r'.repeat(32);
    expect(hashRecoveryCode('ABCDE-FGHIJ-KLMNO-PQRST', secret)).toBe(
      hashRecoveryCode('abcde fghij klmno pqrst', secret),
    );
  });
});
