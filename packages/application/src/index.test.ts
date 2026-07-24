import { describe, expect, it } from 'vitest';
import { USER_DECLARED_CATALOG_RELEASE } from './simulation-service';

describe('application contracts', () => {
  it('uses an explicit sentinel for user-declared exact loci', () => {
    expect(USER_DECLARED_CATALOG_RELEASE).toBe('user-declared-v1');
  });
});
