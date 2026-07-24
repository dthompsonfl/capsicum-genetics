import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationManifest = JSON.parse(await readFile(resolve(scriptRoot, 'src/generated/migration-manifest.json'), 'utf8'));
const routineManifest = JSON.parse(await readFile(resolve(scriptRoot, 'src/generated/routine-grants.json'), 'utf8'));
const expectedMigrations = migrationManifest.migrations;

if (process.env.ALLOW_AUTHORITY_TEST !== 'YES') {
  throw new Error('Refusing to run. Set ALLOW_AUTHORITY_TEST=YES against a disposable test database.');
}
const databaseUrl = process.env.AUTHORITY_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('AUTHORITY_TEST_DATABASE_URL is required.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function expectDatabaseRejection(operation, expectedFragment) {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expectedFragment), `Expected rejection containing ${JSON.stringify(expectedFragment)}, received ${JSON.stringify(message)}.`);
    return;
  }
  throw new Error(`Expected database rejection containing ${JSON.stringify(expectedFragment)}.`);
}

const client = new Client({ connectionString: databaseUrl, application_name: 'capsicum-v6-authority-verifier' });
await client.connect();
const checks = [];
try {
  const databaseName = String((await client.query('SELECT current_database() AS name')).rows[0]?.name ?? '');
  assert(/(?:test|authority|ci)/i.test(databaseName), `Refusing destructive authority verification against ${JSON.stringify(databaseName)}.`);

  const appliedMigrations = (await client.query('SELECT version, checksum FROM app_schema_migrations ORDER BY applied_at, version')).rows;
  assert(appliedMigrations.length === expectedMigrations.length, `Expected ${expectedMigrations.length} applied migrations, found ${appliedMigrations.length}.`);
  for (const [index, expected] of expectedMigrations.entries()) {
    const applied = appliedMigrations[index];
    assert(applied?.version === expected.version, `Migration identity/order mismatch at ${index}: expected ${expected.version}, found ${applied?.version ?? 'missing'}.`);
    assert(applied?.checksum === expected.checksum, `Migration checksum mismatch for ${expected.version}.`);
  }
  checks.push(`${expectedMigrations.length} ordered migration identities and checksums match the repository manifest`);

  for (const role of ['capsicum_runtime', 'capsicum_worker']) {
    const expectedRoutines = routineManifest.roles[role];
    const preflight = await client.query(
      `SELECT signature, to_regprocedure(signature) IS NOT NULL AS exists
       FROM unnest($1::text[]) AS signature`,
      [expectedRoutines],
    );
    const missing = preflight.rows.filter((row) => row.exists !== true).map((row) => row.signature);
    assert(missing.length === 0, `${role} routine manifest references missing signatures: ${missing.join(', ')}.`);
    const executable = await client.query(
      `SELECT p.oid::regprocedure::text AS signature
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND starts_with(p.proname, 'app_')
         AND has_function_privilege($1, p.oid, 'EXECUTE')
       ORDER BY 1`,
      [role],
    );
    const actual = new Set(executable.rows.map((row) => row.signature));
    const expected = new Set(expectedRoutines);
    const absentPrivileges = [...expected].filter((signature) => !actual.has(signature));
    const unexpectedPrivileges = [...actual].filter((signature) => !expected.has(signature));
    assert(absentPrivileges.length === 0, `${role} lacks expected EXECUTE privileges: ${absentPrivileges.join(', ')}.`);
    assert(unexpectedPrivileges.length === 0, `${role} has unexpected app_* EXECUTE privileges: ${unexpectedPrivileges.join(', ')}.`);
  }
  checks.push('runtime and worker app-function privileges exactly match the generated migration grant manifest');

  const roles = await client.query(`
    SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
    FROM pg_roles
    WHERE rolname IN ('capsicum_runtime','capsicum_runtime_login','capsicum_worker','capsicum_worker_login')
    ORDER BY rolname
  `);
  assert(roles.rowCount === 4, 'Expected runtime and worker group/login roles.');
  for (const role of roles.rows) {
    assert(!role.rolsuper && !role.rolbypassrls && !role.rolcreaterole && !role.rolcreatedb, `${role.rolname} has excessive authority.`);
    if (role.rolname.endsWith('_login')) assert(role.rolcanlogin, `${role.rolname} must be a login role.`);
  }
  checks.push('runtime and worker roles are non-superuser and cannot bypass RLS');

  const uncovered = await client.query(`
    WITH scoped AS (
      SELECT table_schema, table_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'workspace_id'
      GROUP BY table_schema, table_name
    )
    SELECT scoped.table_name, class.relrowsecurity, class.relforcerowsecurity,
           count(policy.policyname)::int AS policy_count
    FROM scoped
    JOIN pg_class class ON class.relname = scoped.table_name
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace AND namespace.nspname = scoped.table_schema
    LEFT JOIN pg_policies policy ON policy.schemaname = scoped.table_schema AND policy.tablename = scoped.table_name
    GROUP BY scoped.table_name, class.relrowsecurity, class.relforcerowsecurity
    HAVING NOT class.relrowsecurity OR NOT class.relforcerowsecurity OR count(policy.policyname) = 0
    ORDER BY scoped.table_name
  `);
  assert(uncovered.rowCount === 0, `Workspace tables without forced RLS and policies: ${JSON.stringify(uncovered.rows)}.`);
  checks.push('all workspace-scoped tables have forced RLS and at least one policy');

  checks.push('runtime role cannot execute worker-only functions');
  const privilegeMatrix = await client.query(`
    SELECT table_name, privilege, expected_allowed, has_table_privilege('capsicum_runtime', table_name, privilege) AS allowed
    FROM (VALUES
      ('job_contracts','SELECT',true),
      ('worker_heartbeats','SELECT',true),
      ('media_objects','UPDATE',false),
      ('media_inspections','INSERT',false),
      ('immutable_artifacts','INSERT',false),
      ('model_versions','INSERT',false),
      ('research_document_reviews','INSERT',false),
      ('reference_assemblies','INSERT',true),
      ('selection_plans','UPDATE',false),
      ('selection_plan_transitions','INSERT',false),
      ('selection_plan_reconciliations','UPDATE',false),
      ('selection_plan_reconciliations','DELETE',false),
      ('simulation_requests','UPDATE',false),
      ('research_extraction_artifacts','INSERT',false),
      ('media_derivatives','INSERT',false),
      ('phenotype_measurements','INSERT',false),
      ('phenotype_measurements','UPDATE',false),
      ('phenotype_measurement_revisions','INSERT',false)
    ) AS expected(table_name, privilege, expected_allowed)
  `);
  for (const row of privilegeMatrix.rows) {
    assert(row.allowed === row.expected_allowed, `Unexpected ${row.privilege} privilege on ${row.table_name}: ${row.allowed}.`);
  }
  checks.push('runtime table privileges match the least-privilege matrix');
  const mediaColumnPrivileges = await client.query(`
    SELECT
      has_column_privilege('capsicum_runtime', 'media_objects', 'inspection_job_id', 'UPDATE') AS can_bind_inspection_job,
      has_column_privilege('capsicum_runtime', 'media_objects', 'upload_state', 'UPDATE') AS can_mutate_upload_state
  `);
  assert(mediaColumnPrivileges.rows[0]?.can_bind_inspection_job === true, 'Runtime cannot bind the canonical inspection job to a quarantined upload.');
  assert(mediaColumnPrivileges.rows[0]?.can_mutate_upload_state === false, 'Runtime can directly mutate media authority state.');
  checks.push('runtime media update authority is limited to inspection-job binding');

  const normalizedCatalogPrivileges = await client.query(`
    SELECT
      has_table_privilege('capsicum_runtime', 'catalog_alleles', 'INSERT') AS can_create_allele_draft,
      has_table_privilege('capsicum_runtime', 'catalog_alleles', 'DELETE') AS can_delete_allele,
      has_column_privilege('capsicum_runtime', 'catalog_alleles', 'review_state', 'UPDATE') AS can_transition_review,
      has_column_privilege('capsicum_runtime', 'catalog_alleles', 'canonical_symbol', 'UPDATE') AS can_rewrite_symbol
  `);
  assert(normalizedCatalogPrivileges.rows[0]?.can_create_allele_draft === true, 'Runtime cannot create normalized allele drafts through the canonical curator path.');
  assert(normalizedCatalogPrivileges.rows[0]?.can_delete_allele === false, 'Runtime can delete normalized scientific history.');
  assert(normalizedCatalogPrivileges.rows[0]?.can_transition_review === true, 'Runtime cannot execute canonical review transitions.');
  assert(normalizedCatalogPrivileges.rows[0]?.can_rewrite_symbol === false, 'Runtime can rewrite immutable normalized scientific payload fields.');
  checks.push('normalized catalog privileges are append-only and review-field scoped');

  const selectionPlanFunctionPrivileges = await client.query(`
    SELECT
      has_function_privilege('capsicum_runtime', 'app_transition_selection_plan(uuid,integer,text,text)', 'EXECUTE') AS can_transition,
      has_table_privilege('capsicum_runtime', 'selection_plan_transitions', 'UPDATE') AS can_rewrite_history,
      has_table_privilege('capsicum_runtime', 'selection_plan_reconciliations', 'INSERT') AS can_record_reconciliation
  `);
  assert(selectionPlanFunctionPrivileges.rows[0]?.can_transition === true, 'Runtime cannot invoke the canonical selection-plan transition authority.');
  assert(selectionPlanFunctionPrivileges.rows[0]?.can_rewrite_history === false, 'Runtime can rewrite selection-plan transition history.');
  assert(selectionPlanFunctionPrivileges.rows[0]?.can_record_reconciliation === true, 'Runtime cannot record immutable observed-segregation analyses.');
  checks.push('selection-plan lifecycle and observed analyses use constrained authority paths');

  const v5Authority = await client.query(`
    SELECT
      has_function_privilege('capsicum_runtime', 'app_correct_phenotype_measurement(uuid,uuid,jsonb,text)', 'EXECUTE') AS can_correct_measurement,
      has_function_privilege('capsicum_worker', 'app_correct_phenotype_measurement(uuid,uuid,jsonb,text)', 'EXECUTE') AS worker_can_correct_measurement,
      has_table_privilege('capsicum_runtime', 'phenotype_measurement_revisions', 'UPDATE') AS can_rewrite_measurement_history,
      has_table_privilege('capsicum_runtime', 'media_derivatives', 'DELETE') AS can_delete_derivatives,
      has_table_privilege('capsicum_runtime', 'research_extraction_artifacts', 'UPDATE') AS can_rewrite_research_artifacts
  `);
  assert(v5Authority.rows[0]?.can_correct_measurement === true, 'Runtime cannot invoke the canonical phenotype measurement correction authority.');
  assert(v5Authority.rows[0]?.worker_can_correct_measurement === false, 'Worker can impersonate a human phenotype measurement correction.');
  assert(v5Authority.rows[0]?.can_rewrite_measurement_history === false, 'Runtime can rewrite phenotype measurement history.');
  assert(v5Authority.rows[0]?.can_delete_derivatives === false, 'Runtime can delete immutable media derivatives.');
  assert(v5Authority.rows[0]?.can_rewrite_research_artifacts === false, 'Runtime can rewrite immutable research extraction artifacts.');
  checks.push('V5 advanced, research, media, export, and measurement authority uses constrained functions');

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const memberB = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const materialB = randomUUID();

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO users(id,email,display_name) VALUES
       ($1,$2,'Authority Owner A'),($3,$4,'Authority Owner B'),($5,$6,'Authority Member B')`,
      [ownerA, `owner-a-${suffix}@example.invalid`, ownerB, `owner-b-${suffix}@example.invalid`, memberB, `member-b-${suffix}@example.invalid`],
    );
    await client.query(
      `INSERT INTO workspaces(id,slug,name,created_by) VALUES
       ($1,$2,'Authority A',$3),($4,$5,'Authority B',$6)`,
      [workspaceA, `authority-a-${suffix}`, ownerA, workspaceB, `authority-b-${suffix}`, ownerB],
    );
    await client.query(
      `INSERT INTO workspace_memberships(workspace_id,user_id,role,state) VALUES
       ($1,$2,'owner','active'),($3,$4,'owner','active'),($3,$5,'breeder','active')`,
      [workspaceA, ownerA, workspaceB, ownerB, memberB],
    );
    await client.query(
      `INSERT INTO biological_materials(id,workspace_id,kind,material_code,created_by)
       VALUES ($1,$2,'germplasm_accession',$3,$4)`,
      [materialB, workspaceB, `AUTH-${suffix}`, ownerB],
    );

    await client.query('SET LOCAL ROLE capsicum_runtime');
    await client.query("SELECT set_config('app.workspace_id',$1,true)", [workspaceB]);
    await client.query("SELECT set_config('app.actor_user_id',$1,true)", [ownerA]);
    assert((await client.query('SELECT id FROM biological_materials WHERE workspace_id=$1', [workspaceB])).rowCount === 0, 'Forged workspace context exposed another workspace.');
    checks.push('forged workspace context is denied');

    await client.query("SELECT set_config('app.actor_user_id',$1,true)", [memberB]);
    assert((await client.query('SELECT id FROM biological_materials WHERE workspace_id=$1', [workspaceB])).rowCount === 1, 'Active member cannot read authorized workspace data.');
    checks.push('active member access is allowed');

    await client.query("SELECT set_config('app.actor_user_id',$1,true)", [ownerB]);
    await expectDatabaseRejection(
      () => client.query(`UPDATE workspace_memberships SET user_id=$1 WHERE workspace_id=$2 AND user_id=$3`, [ownerA, workspaceB, ownerB]),
      'workspace membership identity is immutable',
    );
    await expectDatabaseRejection(
      () => client.query(`UPDATE workspace_memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2`, [workspaceB, ownerB]),
      'workspace owner membership cannot be demoted or deactivated',
    );
    checks.push('membership identity and owner authority are immutable');

    const approvedLocus = await client.query<{ id: string }>(`SELECT id::text FROM loci WHERE review_state = 'approved' ORDER BY created_at LIMIT 1`);
    const approvedLocusId = approvedLocus.rows[0]?.id;
    if (approvedLocusId) {
      await client.query("SELECT set_config('app.actor_user_id',$1,true)", [memberB]);
      await expectDatabaseRejection(
        () => client.query(
          `INSERT INTO catalog_alleles(allele_key,record_version,content_hash,locus_id,canonical_symbol,applicability,authored_by)
           VALUES ($1,'authority-test','${'a'.repeat(64)}',$2,'AUTH','Authority verifier synthetic draft only.',$3)`,
          [`AUTH-ALLELE-${suffix}`, approvedLocusId, memberB],
        ),
        'catalog authoring requires owner or catalog_curator',
      );
      await client.query("SELECT set_config('app.actor_user_id',$1,true)", [ownerB]);
      await expectDatabaseRejection(
        () => client.query(
          `INSERT INTO catalog_alleles(allele_key,record_version,content_hash,locus_id,canonical_symbol,applicability,authored_by)
           VALUES ($1,'authority-test','${'b'.repeat(64)}',$2,'AUTH','Authority verifier synthetic draft only.',$3)`,
          [`AUTH-ALLELE-MISMATCH-${suffix}`, approvedLocusId, ownerA],
        ),
        'catalog record author must match authenticated actor',
      );
      checks.push('normalized catalog draft authoring enforces curator role and actor identity');
    }

    await client.query('RESET ROLE');
    await client.query(`UPDATE workspace_memberships SET state='suspended' WHERE workspace_id=$1 AND user_id=$2`, [workspaceB, memberB]);
    await client.query('SET LOCAL ROLE capsicum_runtime');
    await client.query("SELECT set_config('app.workspace_id',$1,true)", [workspaceB]);
    await client.query("SELECT set_config('app.actor_user_id',$1,true)", [memberB]);
    assert((await client.query('SELECT id FROM biological_materials WHERE workspace_id=$1', [workspaceB])).rowCount === 0, 'Suspended membership retained workspace access.');
    checks.push('suspended membership is denied');

    await client.query('RESET ROLE');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('RESET ROLE').catch(() => undefined);
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }

  process.stdout.write(`${JSON.stringify({ ok: true, database: databaseName, checks }, null, 2)}\n`);
} finally {
  await client.end();
}
