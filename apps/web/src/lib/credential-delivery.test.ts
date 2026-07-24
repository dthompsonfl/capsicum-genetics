import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  credentialExchangeUrl,
  deliverOneTimeCredential,
  requireCredentialDeliveryAdapter,
} from './credential-delivery';

const originalEnvironment = { ...process.env };
const temporaryDirectories: string[] = [];

afterEach(async () => {
  process.env = { ...originalEnvironment };
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('one-time credential delivery', () => {
  it('writes one protected local notice across ambiguous retries without exposing the token in its filename', async () => {
    const spool = await mkdtemp(path.join(tmpdir(), 'capsicum-delivery-'));
    temporaryDirectories.push(spool);
    process.env.NODE_ENV = 'test';
    process.env.APP_MODE = 'demo';
    process.env.DELIVERY_ADAPTER = 'local';
    process.env.LOCAL_DELIVERY_SPOOL = spool;
    process.env.APP_ORIGIN = 'http://127.0.0.1:3000';

    const token = 'opaque-one-time-token';
    const exchangeUrl = credentialExchangeUrl('password_reset', token);
    const input = {
      kind: 'password_reset' as const,
      recipient: 'breeder@example.test',
      exchangeUrl,
      expiresAt: '2030-01-01T00:00:00.000Z',
    };

    expect((await deliverOneTimeCredential(input)).state).toBe('delivered');
    expect((await deliverOneTimeCredential(input)).state).toBe('delivered');

    const files = await readdir(spool);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain(token);
    const noticePath = path.join(spool, files[0]!);
    expect((await stat(noticePath)).mode & 0o777).toBe(0o600);
    const notice = JSON.parse(await readFile(noticePath, 'utf8')) as { exchangeUrl: string; recipient: string };
    expect(notice.exchangeUrl).toBe(exchangeUrl);
    expect(notice.recipient).toBe(input.recipient);
  });

  it('fails closed when the local adapter is selected in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_MODE = 'production';
    process.env.DELIVERY_ADAPTER = 'local';
    process.env.APP_ORIGIN = 'https://capsicum.example.test';
    expect(() => requireCredentialDeliveryAdapter()).toThrow(/forbidden in production/i);
  });
});
