import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMigrationAtomically, stripSingleOuterTransaction } from './migration-utils.mjs';

test('strips exactly one migration transaction wrapper', () => {
  assert.equal(stripSingleOuterTransaction('BEGIN;\nSELECT 1;\nCOMMIT;', 'x.sql'), 'SELECT 1;');
  assert.throws(() => stripSingleOuterTransaction('SELECT 1;', 'x.sql'), /outer BEGIN/);
});

test('rolls back schema and ledger together at every injected boundary', async () => {
  for (const faultPoint of ['pre-execution', 'post-schema-pre-ledger', 'post-ledger-pre-commit']) {
    const statements = [];
    const client = { query: async (sql, values) => { statements.push([sql, values]); } };
    await assert.rejects(
      applyMigrationAtomically(client, { version: '0001_test.sql', checksum: 'a'.repeat(64), sql: 'BEGIN; SELECT 1; COMMIT;', faultPoint }),
      /Injected migration failure/,
    );
    assert.equal(statements.at(-1)[0], 'ROLLBACK');
    assert.equal(statements.some(([sql]) => sql === 'COMMIT'), false);
  }
});


test('rolls back when schema execution itself fails', async () => {
  const statements = [];
  const client = {
    query: async (sql, values) => {
      statements.push([sql, values]);
      if (sql === 'SELECT 1 / 0;') throw new Error('division by zero');
    },
  };
  await assert.rejects(
    applyMigrationAtomically(client, {
      version: '0001_test.sql',
      checksum: 'a'.repeat(64),
      sql: 'BEGIN; SELECT 1 / 0; COMMIT;',
    }),
    /division by zero/,
  );
  assert.equal(statements.at(-1)[0], 'ROLLBACK');
  assert.equal(statements.some(([sql]) => sql.startsWith('INSERT INTO app_schema_migrations')), false);
  assert.equal(statements.some(([sql]) => sql === 'COMMIT'), false);
});
