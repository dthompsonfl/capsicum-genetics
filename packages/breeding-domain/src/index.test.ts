import { describe, expect, it } from 'vitest';
import { OriginRegistry, PedigreeGraph, validateDirectedCross } from './index';

describe('breeding identity invariants', () => {
  it('preserves directed controlled-cross parent roles', () => {
    expect(() => validateDirectedCross({
      id: 'x',
      workspaceId: 'w',
      pollinationMethod: 'controlled_cross',
      maternalPlantId: 'p1',
      paternalPlantId: 'p2',
    })).not.toThrow();
    expect(() => validateDirectedCross({
      id: 'x',
      workspaceId: 'w',
      pollinationMethod: 'controlled_cross',
      maternalPlantId: 'p1',
      paternalPlantId: 'p1',
    })).toThrow(/distinct/);
  });

  it('represents selfing without erasing parent direction', () => {
    expect(() => validateDirectedCross({
      id: 'self-1',
      workspaceId: 'w',
      pollinationMethod: 'selfing',
      maternalPlantId: 'p1',
      paternalPlantId: 'p1',
    })).not.toThrow();
  });

  it('represents open pollination with an explicitly unknown paternal plant', () => {
    expect(() => validateDirectedCross({
      id: 'op-1',
      workspaceId: 'w',
      pollinationMethod: 'open_pollination',
      maternalPlantId: 'p1',
      paternalPlantId: null,
    })).not.toThrow();
  });

  it('rejects a second biological origin', () => {
    const registry = new OriginRegistry();
    registry.record({ id: 'o1', workspaceId: 'w', materialId: 'child', type: 'germination', parentMaterialIds: ['lot'], occurredAt: '2026-07-22T00:00:00Z' });
    expect(() => registry.record({ id: 'o2', workspaceId: 'w', materialId: 'child', type: 'acquisition', parentMaterialIds: [], occurredAt: '2026-07-22T00:00:01Z' })).toThrow(/already has origin/);
  });

  it('rejects duplicate origin parents and pedigree cycles', () => {
    const registry = new OriginRegistry();
    expect(() => registry.record({
      id: 'o1', workspaceId: 'w', materialId: 'child', type: 'selfing',
      parentMaterialIds: ['plant-1', 'plant-1'], occurredAt: '2026-07-22T00:00:00Z',
    })).toThrow(/unique/);

    const graph = new PedigreeGraph();
    graph.addParentage('A', 'B');
    graph.addParentage('B', 'C');
    expect(() => graph.addParentage('C', 'A')).toThrow(/cycle/);
  });
});
