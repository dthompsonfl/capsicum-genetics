export type MaterialKind =
  | 'germplasm_accession'
  | 'seed_lot'
  | 'plant'
  | 'fruit'
  | 'seed_harvest'
  | 'progeny_family'
  | 'derived_line'
  | 'population'
  | 'selection'
  | 'tissue_sample';

export type OriginEventType =
  | 'acquisition'
  | 'germination'
  | 'controlled_cross'
  | 'selfing'
  | 'open_pollination'
  | 'vegetative_propagation'
  | 'seed_harvest';

export type PollinationMethod = 'controlled_cross' | 'selfing' | 'open_pollination';

export interface MaterialIdentity {
  id: string;
  workspaceId: string;
  kind: MaterialKind;
  code: string;
}

export interface OriginEvent {
  id: string;
  workspaceId: string;
  materialId: string;
  type: OriginEventType;
  parentMaterialIds: readonly string[];
  occurredAt: string;
}

export interface DirectedCross {
  id: string;
  workspaceId: string;
  pollinationMethod: PollinationMethod;
  maternalPlantId: string;
  paternalPlantId: string | null;
}

export function validateDirectedCross(cross: DirectedCross): void {
  if (!cross.id.trim()) throw new TypeError('cross id is required.');
  if (!cross.workspaceId.trim()) throw new TypeError('workspaceId is required.');
  if (!cross.maternalPlantId.trim()) throw new TypeError('maternalPlantId is required.');

  switch (cross.pollinationMethod) {
    case 'controlled_cross':
      if (!cross.paternalPlantId?.trim()) {
        throw new TypeError('A controlled cross requires a paternal plant identifier.');
      }
      if (cross.maternalPlantId === cross.paternalPlantId) {
        throw new RangeError('A controlled outcross must use distinct maternal and paternal plants.');
      }
      return;
    case 'selfing':
      if (cross.paternalPlantId !== cross.maternalPlantId) {
        throw new RangeError(
          'A selfing record must preserve the same plant in maternal and paternal roles.',
        );
      }
      return;
    case 'open_pollination':
      if (cross.paternalPlantId !== null) {
        throw new RangeError('An open-pollination record must leave the paternal plant unknown.');
      }
      return;
  }
}

export class OriginRegistry {
  readonly #origins = new Map<string, OriginEvent>();

  record(event: OriginEvent): void {
    if (!event.id.trim() || !event.workspaceId.trim() || !event.materialId.trim()) {
      throw new TypeError('Origin event id, workspaceId, and materialId are required.');
    }
    if (!Number.isFinite(Date.parse(event.occurredAt))) {
      throw new TypeError('Origin occurredAt must be a valid timestamp.');
    }
    if (event.parentMaterialIds.includes(event.materialId)) {
      throw new RangeError('A material cannot be its own origin parent.');
    }
    if (new Set(event.parentMaterialIds).size !== event.parentMaterialIds.length) {
      throw new TypeError('Origin parent identifiers must be unique.');
    }
    const existing = this.#origins.get(event.materialId);
    if (existing) {
      throw new RangeError(
        `Material ${event.materialId} already has origin event ${existing.id}; biological origin is singular.`,
      );
    }
    this.#origins.set(event.materialId, event);
  }

  get(materialId: string): OriginEvent | undefined {
    return this.#origins.get(materialId);
  }
}

export class PedigreeGraph {
  readonly #childrenByParent = new Map<string, Set<string>>();

  addParentage(parentId: string, childId: string): void {
    if (!parentId.trim() || !childId.trim()) throw new TypeError('Material identifiers are required.');
    if (parentId === childId) throw new RangeError('A material cannot be its own parent.');
    if (this.isAncestor(childId, parentId)) {
      throw new RangeError(`Adding ${parentId} -> ${childId} would create a pedigree cycle.`);
    }
    const children = this.#childrenByParent.get(parentId) ?? new Set<string>();
    children.add(childId);
    this.#childrenByParent.set(parentId, children);
  }

  isAncestor(candidateAncestorId: string, materialId: string): boolean {
    const visited = new Set<string>();
    const stack = [candidateAncestorId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      for (const child of this.#childrenByParent.get(current) ?? []) {
        if (child === materialId) return true;
        stack.push(child);
      }
    }
    return false;
  }
}

export type CrossOperationalState =
  | 'planned'
  | 'prepared'
  | 'pollinated'
  | 'fruit_set'
  | 'harvest_ready'
  | 'harvested'
  | 'failed'
  | 'closed';

export type CrossOperationalEvent = 'prepared' | 'pollinated' | 'bagged' | 'unbagged' | 'fruit_set' | 'harvest_ready' | 'failed' | 'closed';

const crossTransitions: Readonly<Record<CrossOperationalState, ReadonlySet<CrossOperationalState>>> = {
  planned: new Set(['prepared', 'pollinated', 'failed', 'closed']),
  prepared: new Set(['pollinated', 'failed', 'closed']),
  pollinated: new Set(['fruit_set', 'failed', 'closed']),
  fruit_set: new Set(['harvest_ready', 'harvested', 'failed', 'closed']),
  harvest_ready: new Set(['harvested', 'failed', 'closed']),
  harvested: new Set(['closed']),
  failed: new Set(['closed']),
  closed: new Set(),
};

export function nextCrossOperationalState(
  current: CrossOperationalState,
  event: CrossOperationalEvent,
): CrossOperationalState {
  const candidate: CrossOperationalState =
    event === 'bagged' || event === 'unbagged' ? current : event;
  if (candidate === current) return current;
  if (!crossTransitions[current].has(candidate)) {
    throw new RangeError(`Illegal cross operational transition ${current} -> ${candidate}.`);
  }
  return candidate;
}

export function assertHarvestableCross(state: CrossOperationalState): void {
  if (state !== 'fruit_set') {
    throw new RangeError('A cross may be harvested only after fruit set has been recorded.');
  }
}

export type BreedingMaterialClass =
  | 'controlled_cross_progeny'
  | 'selfed_progeny'
  | 'open_pollinated_progeny'
  | 'derived_line'
  | 'population'
  | 'selection';

export function derivedMaterialClassForPollination(method: PollinationMethod): BreedingMaterialClass {
  switch (method) {
    case 'controlled_cross': return 'controlled_cross_progeny';
    case 'selfing': return 'selfed_progeny';
    case 'open_pollination': return 'open_pollinated_progeny';
  }
}
