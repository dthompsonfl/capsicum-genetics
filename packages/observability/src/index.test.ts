import { describe, expect, it } from 'vitest';
import { redactFields, serializeLogEvent } from './index';

describe('recursive log redaction', () => {
  it('redacts nested secrets without mutating safe values', () => {
    const result = redactFields({
      request: {
        headers: { authorization: 'Bearer secret', accept: 'application/json' },
        body: { password: 'unsafe', nested: [{ apiKey: 'unsafe' }, { count: 2 }] },
      },
    });
    expect(result).toEqual({
      request: {
        headers: { authorization: '[REDACTED]', accept: 'application/json' },
        body: { password: '[REDACTED]', nested: [{ apiKey: '[REDACTED]' }, { count: 2 }] },
      },
    });
  });

  it('serializes circular input safely', () => {
    const fields: Record<string, unknown> = {};
    fields.self = fields;
    expect(serializeLogEvent({ level: 'info', event: 'test', fields })).toContain('[CIRCULAR]');
  });
});
