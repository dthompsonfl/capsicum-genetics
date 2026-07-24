import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabasePool } from '@capsicum/database';
import type { Principal } from '@capsicum/contracts';
import { createGermplasm, createPlant, createSeedLot, getMaterialDetail } from './breeding-service';

const enabled = process.env.ALLOW_APPLICATION_INTEGRATION_TEST === 'YES'
  && Boolean(process.env.APPLICATION_INTEGRATION_DATABASE_URL)
  && Boolean(process.env.DATABASE_ADMIN_URL);
const describeIntegration = enabled ? describe : describe.skip;
const { Client } = pg;

describeIntegration('application PostgreSQL authority integration', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const userA = randomUUID();
  const userB = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const principalA: Principal = {
    userId: userA,
    workspaceId: workspaceA,
    role: 'owner',
    sessionId: randomUUID(),
    email: `application-a-${suffix}@test.invalid`,
    displayName: 'Application A',
    mfaVerifiedAt: null,
  };
  const principalB: Principal = {
    userId: userB,
    workspaceId: workspaceB,
    role: 'owner',
    sessionId: randomUUID(),
    email: `application-b-${suffix}@test.invalid`,
    displayName: 'Application B',
    mfaVerifiedAt: null,
  };
  const pool = createDatabasePool(process.env.APPLICATION_INTEGRATION_DATABASE_URL!, {
    max: 24,
    applicationName: 'capsicum-application-integration',
  });
  const admin = new Client({
    connectionString: process.env.DATABASE_ADMIN_URL!,
    application_name: 'capsicum-application-integration-admin',
  });

  beforeAll(async () => {
    await admin.connect();
    await admin.query('BEGIN');
    try {
      await admin.query(
        'INSERT INTO users(id,email,display_name) VALUES ($1,$2,$3),($4,$5,$6)',
        [userA, principalA.email, principalA.displayName, userB, principalB.email, principalB.displayName],
      );
      await admin.query(
        'INSERT INTO workspaces(id,slug,name,created_by) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
        [workspaceA, `app-a-${suffix}`, 'Application A', userA, workspaceB, `app-b-${suffix}`, 'Application B', userB],
      );
      await admin.query(
        "INSERT INTO workspace_memberships(workspace_id,user_id,role,state) VALUES ($1,$2,'owner','active'),($3,$4,'owner','active')",
        [workspaceA, userA, workspaceB, userB],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
  });

  afterAll(async () => {
    await pool.end();
    await admin.end();
  });

  it('collapses twenty concurrent identical intents into one germplasm aggregate', async () => {
    const input = {
      materialCode: `ACC-${suffix}`,
      taxon: 'Capsicum annuum',
      displayName: `Integration accession ${suffix}`,
      sourceType: 'breeder' as const,
      sourceName: 'Disposable integration fixture',
      acquiredAt: new Date().toISOString(),
      idempotencyKey: randomUUID(),
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => createGermplasm(pool, principalA, input)));
    expect(new Set(results.map((result) => result.materialId)).size).toBe(1);
    const aggregateCount = await admin.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM biological_materials WHERE workspace_id=$1 AND material_code=$2',
      [workspaceA, input.materialCode],
    );
    expect(aggregateCount.rows[0]?.count).toBe(1);
  }, 30_000);

  it('reconciles accession, seed inventory, and plant creation atomically', async () => {
    const accession = await createGermplasm(pool, principalA, {
      materialCode: `ACC2-${suffix}`,
      taxon: 'Capsicum annuum',
      displayName: `Inventory accession ${suffix}`,
      sourceType: 'breeder',
      acquiredAt: new Date().toISOString(),
      idempotencyKey: randomUUID(),
    });
    const seedLot = await createSeedLot(pool, principalA, {
      materialCode: `LOT-${suffix}`,
      accessionMaterialId: accession.materialId,
      quantityEstimate: 10,
      acquiredAt: new Date().toISOString(),
      idempotencyKey: randomUUID(),
    });
    const intent = randomUUID();
    const plantInput = {
      materialCode: `PLANT-${suffix}`,
      sourceSeedLotMaterialId: seedLot.materialId,
      germinatedAt: new Date().toISOString(),
      inventoryMode: 'consume' as const,
      seedQuantity: 1,
      idempotencyKey: intent,
    };
    const first = await createPlant(pool, principalA, plantInput);
    const replay = await createPlant(pool, principalA, plantInput);
    expect(replay).toEqual(first);
    expect(first.runningQuantity).toBe(9);
    const detail = await getMaterialDetail(pool, principalA, seedLot.materialId);
    expect(detail?.quantity_estimate).toBe(9);
    const allocations = await admin.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM plant_inventory_allocations WHERE workspace_id=$1 AND plant_material_id=$2',
      [workspaceA, first.materialId],
    );
    expect(allocations.rows[0]?.count).toBe(1);
  });


  it('rejects conflicting idempotency reuse and permits retry after rollback', async () => {
    const completedKey = randomUUID();
    await createGermplasm(pool, principalA, {
      materialCode: `IDEMP-${suffix}`,
      taxon: 'Capsicum annuum',
      displayName: 'Stable idempotent accession',
      sourceType: 'breeder',
      acquiredAt: new Date().toISOString(),
      idempotencyKey: completedKey,
    });
    await expect(createGermplasm(pool, principalA, {
      materialCode: `IDEMP-OTHER-${suffix}`,
      taxon: 'Capsicum annuum',
      displayName: 'Conflicting payload',
      sourceType: 'breeder',
      acquiredAt: new Date().toISOString(),
      idempotencyKey: completedKey,
    })).rejects.toMatchObject({ code: 'idempotency_conflict' });

    const occupiedCode = `ROLLBACK-${suffix}`;
    await createGermplasm(pool, principalA, {
      materialCode: occupiedCode,
      taxon: 'Capsicum annuum',
      displayName: 'Occupied code',
      sourceType: 'breeder',
      acquiredAt: new Date().toISOString(),
      idempotencyKey: randomUUID(),
    });
    const retryKey = randomUUID();
    await expect(createGermplasm(pool, principalA, {
      materialCode: occupiedCode,
      taxon: 'Capsicum annuum',
      displayName: 'Expected rollback',
      sourceType: 'breeder',
      acquiredAt: new Date().toISOString(),
      idempotencyKey: retryKey,
    })).rejects.toBeTruthy();
    const recovered = await createGermplasm(pool, principalA, {
      materialCode: `RECOVERED-${suffix}`,
      taxon: 'Capsicum annuum',
      displayName: 'Retry after rollback',
      sourceType: 'breeder',
      acquiredAt: new Date().toISOString(),
      idempotencyKey: retryKey,
    });
    expect(recovered.materialCode).toBe(`RECOVERED-${suffix}`);
  });

  it('rejects a forged cross-workspace principal before domain access', async () => {
    await expect(getMaterialDetail(pool, { ...principalA, workspaceId: workspaceB }, randomUUID()))
      .rejects.toThrow(/not an active member/i);
    await expect(getMaterialDetail(pool, principalB, randomUUID())).resolves.toBeNull();
  });
});
