import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { requireMigrationDatabaseUrl, resolveMigrationDatabaseUrl } from './repository-env.mjs';

const keys = [
  'APP_MODE',
  'NODE_ENV',
  'MIGRATION_DATABASE_URL',
  'DATABASE_ADMIN_URL',
  'DATABASE_URL',
];

async function withEnvironment(values, operation) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return await operation();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('loads root .env.local for repo-root migration commands without overriding shell values', async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'capsicum-env-'));
  try {
    await writeFile(
      join(repositoryRoot, '.env.local'),
      'MIGRATION_DATABASE_URL=postgresql://file-user:file-password@localhost:5432/capsicum\n',
    );
    await withEnvironment(
      {
        MIGRATION_DATABASE_URL:
          'postgresql://shell-user:shell-password@localhost:5432/capsicum',
      },
      () => {
        const selected = requireMigrationDatabaseUrl(repositoryRoot);
        assert.equal(selected.source, 'MIGRATION_DATABASE_URL');
        assert.match(selected.connectionString, /shell-user/);
        assert.deepEqual(selected.loadedFiles, [join(repositoryRoot, '.env.local')]);
      },
    );
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test('uses migration then admin then local-development runtime credentials', () => {
  assert.equal(
    resolveMigrationDatabaseUrl({
      MIGRATION_DATABASE_URL: 'postgresql://migration:password@localhost:5432/capsicum',
      DATABASE_ADMIN_URL: 'postgresql://admin:password@localhost:5432/capsicum',
      DATABASE_URL: 'postgresql://runtime:password@localhost:5432/capsicum',
    })?.source,
    'MIGRATION_DATABASE_URL',
  );
  assert.equal(
    resolveMigrationDatabaseUrl({
      DATABASE_ADMIN_URL: 'postgresql://admin:password@localhost:5432/capsicum',
    })?.source,
    'DATABASE_ADMIN_URL',
  );
  assert.equal(
    resolveMigrationDatabaseUrl({
      DATABASE_URL: 'postgresql://runtime:password@localhost:5432/capsicum',
    })?.source,
    'DATABASE_URL',
  );
});

test('rejects runtime-role fallback in production and invalid protocols', () => {
  assert.throws(
    () =>
      resolveMigrationDatabaseUrl({
        APP_MODE: 'production',
        DATABASE_URL: 'postgresql://runtime:password@localhost:5432/capsicum',
      }),
    /Production migrations require/,
  );
  assert.throws(
    () => resolveMigrationDatabaseUrl({ MIGRATION_DATABASE_URL: 'https://localhost/capsicum' }),
    /postgresql:\/\//,
  );
});

test('reports the expected root configuration path when credentials are absent', async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'capsicum-env-'));
  try {
    await withEnvironment({}, () => {
      assert.throws(
        () => requireMigrationDatabaseUrl(repositoryRoot),
        new RegExp(
          join(repositoryRoot, '.env.local').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        ),
      );
    });
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});
