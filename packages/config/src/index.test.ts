import { describe, expect, it } from 'vitest';
import { environmentReadiness, environmentSchema } from './index';

describe('environment governance', () => {
  const productionBase = {
    APP_MODE: 'production' as const,
    APP_ORIGIN: 'https://capsicum.example.test',
    APP_RELEASE_SHA: 'd'.repeat(40),
    DATABASE_URL: 'postgresql://runtime:password@localhost:5432/capsicum',
    SESSION_SECRET: 's'.repeat(32),
    TOKEN_DERIVATION_SECRET: 't'.repeat(32),
    NETWORK_FINGERPRINT_SECRET: 'n'.repeat(32),
    ABUSE_CONTROL_SECRET: 'a'.repeat(32),
    BOOTSTRAP_TOKEN_SHA256: 'b'.repeat(64),
    DELIVERY_ADAPTER: 'resend' as const,
    DELIVERY_FROM_EMAIL: 'notifications@example.test',
    RESEND_API_KEY: 'resend-secret-at-least-16-characters',
    MFA_ENCRYPTION_KEY: 'c'.repeat(64),
    REQUIRE_PRIVILEGED_MFA: 'true' as const,
    S3_ENDPOINT: 'https://storage.example.test',
    S3_ACCESS_KEY_ID: 'capsicum',
    S3_SECRET_ACCESS_KEY: 'storage-secret-1234',
  };

  it('boots in dependency-light demo mode', () => {
    const parsed = environmentSchema.parse({});
    expect(parsed.APP_MODE).toBe('demo');
    expect(environmentReadiness(parsed).find((item) => item.name === 'exact-genetics')?.state).toBe('ready');
  });

  it('blocks incomplete production configuration', () => {
    expect(environmentSchema.safeParse({ APP_MODE: 'production' }).success).toBe(false);
  });

  it('fails closed when hosted AI lacks explicit cost policy', () => {
    const result = environmentSchema.safeParse({
      ...productionBase,
      ENABLE_HOSTED_AI: 'true',
      AI_PROVIDER: 'gateway',
      AI_GATEWAY_API_KEY: 'gateway-secret-1234',
    });
    expect(result.success).toBe(false);
  });

  it('accepts hosted AI only with explicit bounded cost policy', () => {
    const result = environmentSchema.safeParse({
      ...productionBase,
      ENABLE_HOSTED_AI: 'true',
      AI_PROVIDER: 'gateway',
      AI_GATEWAY_API_KEY: 'gateway-secret-1234',
      AI_INPUT_COST_MICROUNITS_PER_MILLION_TOKENS: '100000',
      AI_OUTPUT_COST_MICROUNITS_PER_MILLION_TOKENS: '300000',
      AI_MAX_COST_MICROUNITS_PER_REQUEST: '5000',
    });
    expect(result.success).toBe(true);
  });



  it('rejects mutable software release labels in production configuration', () => {
    expect(environmentSchema.safeParse({
      ...productionBase,
      APP_RELEASE_SHA: 'latest',
    }).success).toBe(false);
  });

  it('reports missing software provenance as degraded outside production', () => {
    const parsed = environmentSchema.parse({ APP_MODE: 'demo' });
    expect(
      environmentReadiness(parsed).find((item) => item.name === 'software-provenance')?.state,
    ).toBe('degraded');
  });

  it('rejects production origins containing paths or embedded credentials', () => {
    expect(environmentSchema.safeParse({ ...productionBase, APP_ORIGIN: 'https://capsicum.example.test/app' }).success).toBe(false);
    expect(environmentSchema.safeParse({ ...productionBase, APP_ORIGIN: 'https://user:pass@capsicum.example.test' }).success).toBe(false);
  });

  it('rejects insecure production origins and incomplete account delivery', () => {
    const result = environmentSchema.safeParse({
      ...productionBase,
      APP_ORIGIN: 'http://capsicum.example.test',
      DELIVERY_ADAPTER: 'disabled',
    });
    expect(result.success).toBe(false);
  });

});
