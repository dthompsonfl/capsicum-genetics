import { createDatabasePool, type DatabasePool } from '@capsicum/database';

declare global {
  // eslint-disable-next-line no-var
  var __capsicumDatabasePool: DatabasePool | undefined;
}

export function getDatabasePool(): DatabasePool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for authenticated and persistent workflows.');
  }
  if (!globalThis.__capsicumDatabasePool) {
    const requireTls = process.env.DATABASE_SSL === 'require';
    globalThis.__capsicumDatabasePool = createDatabasePool(connectionString, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      applicationName: 'capsicum-web',
      ...(requireTls ? { ssl: { rejectUnauthorized: true } } : {}),
    });
  }
  return globalThis.__capsicumDatabasePool;
}
