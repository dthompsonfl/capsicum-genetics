import { describe, expect, it } from 'vitest';
import { validateObservationRevision, type ObservationRevision } from './index';

const original: ObservationRevision = {
  revisionId: 'r1', observationId: 'o1', sessionId: 's1', materialId: 'plant-1',
  definitionId: 'fruit-length', definitionVersion: '1.0', methodRecordId: 'method-1',
  methodId: null, methodVersion: null, deviceSchemaId: null, qualityTermIds: [],
  authority: 'authoritative', value: { type: 'number', value: 72, unitId: 'unit-mm-v1' },
  observedAt: '2026-07-22T00:00:00.000Z', recordedBy: 'user-1',
  supersedesRevisionId: null, reason: null,
};

describe('validateObservationRevision', () => {
  it('accepts a version-bound authoritative observation', () => {
    expect(() => validateObservationRevision(original)).not.toThrow();
  });

  it('requires a direct predecessor and correction reason', () => {
    expect(() => validateObservationRevision({ ...original, revisionId: 'r2', supersedesRevisionId: 'r1' }, original)).toThrow(/reason/);
    expect(() => validateObservationRevision({ ...original, revisionId: 'r2', supersedesRevisionId: 'stale', reason: 'Correct transcription.' }, original)).toThrow(/current revision/);
  });

  it('does not allow corrections to migrate a definition or authority', () => {
    expect(() => validateObservationRevision({ ...original, revisionId: 'r2', supersedesRevisionId: 'r1', reason: 'Correct transcription.', definitionVersion: '2.0' }, original)).toThrow(/cannot change/);
    expect(() => validateObservationRevision({ ...original, revisionId: 'r2', supersedesRevisionId: 'r1', reason: 'Correct transcription.', authority: 'research_draft' }, original)).toThrow(/cannot change/);
  });

  it('requires approved method and unit bindings for authoritative measurements', () => {
    expect(() => validateObservationRevision({ ...original, methodRecordId: null })).toThrow(/method/);
    expect(() => validateObservationRevision({ ...original, value: { type: 'number', value: 72, unitId: null } })).toThrow(/unit/);
  });
});
