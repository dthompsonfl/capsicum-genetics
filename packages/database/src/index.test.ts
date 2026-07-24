import { describe, expect, it } from 'vitest';
import { compareMigrationState, createDatabasePool, withWorkspaceTransaction } from './index';

describe('database configuration', () => {
  it('rejects non-PostgreSQL connection strings', () => {
    expect(() => createDatabasePool('sqlite://local')).toThrow(/PostgreSQL/);
  });

  it('rejects workspace context when the actor is not a member', async () => {
    const calls: string[] = [];
    const client = {
      query: async (query: string) => {
        calls.push(query);
        if (query.includes('SELECT EXISTS')) return { rows: [{ allowed: false }] };
        return { rows: [] };
      },
      release: () => { calls.push('RELEASE'); },
    };
    const pool = { connect: async () => client };
    await expect(withWorkspaceTransaction(
      pool as never,
      { workspaceId: 'workspace-1', actorUserId: 'user-1' },
      async () => 'should-not-run',
    )).rejects.toThrow(/not a member/);
    expect(calls).toContain('ROLLBACK');
    expect(calls).toContain('RELEASE');
  });

  it('reports unexpected, missing, checksum, and ordering drift without narrowing migration identifiers', () => {
    const expected = [
      { version: '0001_initial.sql', checksum: 'a'.repeat(64) },
      { version: '0002_authority.sql', checksum: 'b'.repeat(64) },
    ] as const;
    const applied = [
      { version: '0002_authority.sql', checksum: 'c'.repeat(64) },
      { version: '9999_unexpected.sql', checksum: 'd'.repeat(64) },
    ];

    expect(compareMigrationState(applied, expected)).toEqual({
      ok: false,
      expectedCount: 2,
      appliedCount: 2,
      missing: ['0001_initial.sql'],
      unexpected: ['9999_unexpected.sql'],
      checksumMismatches: [{
        version: '0002_authority.sql',
        expected: 'b'.repeat(64),
        applied: 'c'.repeat(64),
      }],
      orderMismatch: false,
    });

    expect(
      compareMigrationState(
        [
          { version: '0002_authority.sql', checksum: 'b'.repeat(64) },
          { version: '0001_initial.sql', checksum: 'a'.repeat(64) },
        ],
        expected,
      ).orderMismatch,
    ).toBe(true);
  });
});
