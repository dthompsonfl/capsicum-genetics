export function stripSingleOuterTransaction(sql, version = 'migration') {
  const normalized = sql.replace(/^\uFEFF/, '').trim();
  const begin = /^BEGIN\s*;/i.exec(normalized);
  const commit = /COMMIT\s*;\s*$/i.exec(normalized);
  if (!begin || !commit) {
    throw new Error(`${version} must contain exactly one outer BEGIN; ... COMMIT; wrapper.`);
  }
  const body = normalized.slice(begin[0].length, commit.index).trim();
  if (!body) throw new Error(`${version} has an empty migration body.`);
  const remainingWithoutDollarQuotes = body.replace(/\$[a-zA-Z0-9_]*\$[\s\S]*?\$[a-zA-Z0-9_]*\$/g, '');
  if (/^\s*BEGIN\s*;/im.test(remainingWithoutDollarQuotes) || /COMMIT\s*;\s*$/im.test(remainingWithoutDollarQuotes)) {
    throw new Error(`${version} contains an unexpected nested transaction statement outside a dollar-quoted body.`);
  }
  return body;
}

export function requestedFaultPoint(version) {
  const target = process.env.MIGRATION_FAULT_VERSION;
  if (target && target !== version) return undefined;
  const point = process.env.MIGRATION_FAULT_POINT;
  if (!point) return undefined;
  const allowed = new Set(['pre-execution', 'post-schema-pre-ledger', 'post-ledger-pre-commit']);
  if (!allowed.has(point)) throw new Error(`Unsupported MIGRATION_FAULT_POINT ${JSON.stringify(point)}.`);
  return point;
}

export async function applyMigrationAtomically(client, { version, checksum, sql, faultPoint }) {
  const body = stripSingleOuterTransaction(sql, version);
  await client.query('BEGIN');
  try {
    if (faultPoint === 'pre-execution') throw new Error(`Injected migration failure at ${faultPoint}.`);
    await client.query(body);
    if (faultPoint === 'post-schema-pre-ledger') throw new Error(`Injected migration failure at ${faultPoint}.`);
    await client.query('INSERT INTO app_schema_migrations(version, checksum) VALUES ($1, $2)', [version, checksum]);
    if (faultPoint === 'post-ledger-pre-commit') throw new Error(`Injected migration failure at ${faultPoint}.`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
