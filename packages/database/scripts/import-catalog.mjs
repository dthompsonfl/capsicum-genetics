import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../..');
const generatedDirectory = resolve(repositoryRoot, 'packages/scientific-catalog/src/generated');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function contentHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

async function load(name) {
  return JSON.parse(await readFile(resolve(generatedDirectory, `${name}.json`), 'utf8'));
}

function uniqueFileProvenance(records) {
  const map = new Map();
  for (const record of records) {
    const provenance = record._provenance;
    if (!provenance?.sourceFile || !/^[a-f0-9]{64}$/.test(provenance.sourceFileSha256 ?? '')) {
      throw new Error('Generated catalog record is missing valid source-file provenance.');
    }
    const current = map.get(provenance.sourceFile);
    if (current && current.sha256 !== provenance.sourceFileSha256) {
      throw new Error(`Source file ${provenance.sourceFile} has conflicting hashes.`);
    }
    map.set(provenance.sourceFile, {
      name: provenance.sourceFile,
      sha256: provenance.sourceFileSha256,
      count: (current?.count ?? 0) + 1,
    });
  }
  return map;
}

async function requireImporter(client) {
  const configuredEmail = process.env.CATALOG_IMPORT_USER_EMAIL?.trim().toLowerCase();
  const result = configuredEmail
    ? await client.query('SELECT id, email FROM users WHERE email = $1', [configuredEmail])
    : await client.query(
      `SELECT user_record.id, user_record.email
       FROM users user_record
       JOIN workspace_memberships membership ON membership.user_id = user_record.id
       WHERE membership.role IN ('owner', 'catalog_curator')
         AND membership.state = 'active'
       ORDER BY CASE membership.role WHEN 'owner' THEN 0 ELSE 1 END, user_record.created_at
       LIMIT 1`,
    );
  const importer = result.rows[0];
  if (!importer) {
    throw new Error('No import user exists. Bootstrap an owner or set CATALOG_IMPORT_USER_EMAIL to an existing active owner/catalog curator.');
  }
  return importer;
}

async function ensureBatch(client, provenance, importerId) {
  const reconciliation = {
    scientificState: 'draft_pending_review',
    activatedExecutableRules: 0,
    recordCount: provenance.count,
  };
  await client.query(
    `INSERT INTO catalog_import_batches(
       source_file_name, source_file_sha256, imported_by, record_count, reconciliation
     ) VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (source_file_sha256, source_file_name) DO NOTHING`,
    [provenance.name, provenance.sha256, importerId, provenance.count, JSON.stringify(reconciliation)],
  );
  const selected = await client.query(
    `SELECT id, record_count, reconciliation
     FROM catalog_import_batches
     WHERE source_file_name = $1 AND source_file_sha256 = $2`,
    [provenance.name, provenance.sha256],
  );
  const batch = selected.rows[0];
  if (!batch || Number(batch.record_count) !== provenance.count) {
    throw new Error(`Import batch reconciliation failed for ${provenance.name}.`);
  }
  return batch.id;
}

async function ensureImmutableRecord(client, table, identityColumn, identity, version, hash, insertSql, values) {
  const existing = await client.query(
    `SELECT id, content_hash, review_state FROM ${table} WHERE ${identityColumn} = $1 AND record_version = $2`,
    [identity, version],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].content_hash !== hash) {
      throw new Error(`${table} ${identity}@${version} already exists with different content.`);
    }
    return existing.rows[0].id;
  }
  const inserted = await client.query(insertSql, values);
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error(`Failed to insert ${table} ${identity}@${version}.`);
  return id;
}

async function main() {
  const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_ADMIN_URL or DATABASE_URL is required.');
  const [sources, loci, claims] = await Promise.all([load('sources'), load('loci'), load('claims')]);
  if (sources.length !== 30 || loci.length !== 22 || claims.length !== 22) {
    throw new Error(`Catalog count mismatch: ${sources.length} sources, ${loci.length} loci, ${claims.length} claims.`);
  }
  const provenance = uniqueFileProvenance([...sources, ...loci, ...claims]);
  const pool = new Pool({ connectionString, max: 1, application_name: 'capsicum-catalog-import' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('capsicum-catalog-import', 0))");
    const importer = await requireImporter(client);
    const batches = new Map();
    for (const value of provenance.values()) {
      batches.set(value.name, await ensureBatch(client, value, importer.id));
    }

    const sourceIds = new Map();
    for (const record of sources) {
      const payload = { ...record };
      const hash = contentHash(payload);
      const citation = [record.authors, record.year, record.title, record.journal, record.doi ? `doi:${record.doi}` : null]
        .filter(Boolean)
        .join('. ');
      const id = await ensureImmutableRecord(
        client,
        'scientific_sources',
        'source_id',
        record.source_id,
        '1',
        hash,
        `INSERT INTO scientific_sources(
           source_id, record_version, content_hash, import_batch_id, authored_by,
           citation_text, locator, source_type, raw_source_payload, review_state
         ) VALUES ($1, '1', $2, $3, $4, $5, $6, $7, $8::jsonb, 'draft') RETURNING id`,
        [record.source_id, hash, batches.get(record._provenance.sourceFile), importer.id, citation, record.url || null, record.source_type, JSON.stringify(payload)],
      );
      sourceIds.set(record.source_id, id);
    }

    const locusIds = new Map();
    for (const record of loci) {
      const payload = { ...record };
      const hash = contentHash(payload);
      const id = await ensureImmutableRecord(
        client,
        'loci',
        'catalog_id',
        record.catalog_id,
        '1',
        hash,
        `INSERT INTO loci(
           catalog_id, record_version, content_hash, import_batch_id, authored_by,
           canonical_symbol, trait_category, species_scope, model_class,
           raw_source_payload, review_state
         ) VALUES ($1, '1', $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'draft') RETURNING id`,
        [record.catalog_id, hash, batches.get(record._provenance.sourceFile), importer.id, record.canonical_symbol, record.trait_category, record.species_scope, record.model_class, JSON.stringify(payload)],
      );
      locusIds.set(record.catalog_id, id);
    }

    for (const record of claims) {
      const payload = { ...record };
      const hash = contentHash(payload);
      const locusId = locusIds.get(record.catalog_id);
      if (!locusId) throw new Error(`Claim ${record.claim_id} references missing locus ${record.catalog_id}.`);
      const assertionId = await ensureImmutableRecord(
        client,
        'evidence_assertions',
        'claim_id',
        record.claim_id,
        '1',
        hash,
        `INSERT INTO evidence_assertions(
           claim_id, record_version, content_hash, import_batch_id, authored_by, locus_id,
           claim_text, applicability, required_conditions, exclusions,
           raw_source_payload, review_state
         ) VALUES ($1, '1', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'draft') RETURNING id`,
        [record.claim_id, hash, batches.get(record._provenance.sourceFile), importer.id, locusId, record.claim_text, record.applicability, record.required_conditions, record.exclusions, JSON.stringify(payload)],
      );
      for (const sourceId of record.source_ids.split(';').map((value) => value.trim()).filter(Boolean)) {
        const databaseSourceId = sourceIds.get(sourceId);
        if (!databaseSourceId) throw new Error(`Claim ${record.claim_id} references missing source ${sourceId}.`);
        await client.query(
          `INSERT INTO evidence_assertion_sources(assertion_id, source_id, passage_locator)
           VALUES ($1, $2, NULL)
           ON CONFLICT (assertion_id, source_id) DO NOTHING`,
          [assertionId, databaseSourceId],
        );
      }
    }

    const counts = await client.query(
      `SELECT
        (SELECT count(*)::int FROM scientific_sources) AS sources,
        (SELECT count(*)::int FROM loci) AS loci,
        (SELECT count(*)::int FROM evidence_assertions) AS claims,
        (SELECT count(*)::int FROM phenotype_rules) AS rules`,
    );
    await client.query('COMMIT');
    console.log(JSON.stringify({
      status: 'ok',
      importer: importer.email,
      scientificState: 'draft_pending_review',
      activatedExecutableRules: 0,
      counts: counts.rows[0],
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
