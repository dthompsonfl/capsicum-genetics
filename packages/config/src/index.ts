import { z } from 'zod';

export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  APP_MODE: 'demo' | 'production';
  APP_ORIGIN?: string;
  APP_RELEASE_SHA?: string;
  DATABASE_URL?: string;
  SESSION_SECRET?: string;
  TOKEN_DERIVATION_SECRET?: string;
  NETWORK_FINGERPRINT_SECRET?: string;
  ABUSE_CONTROL_SECRET?: string;
  BOOTSTRAP_TOKEN_SHA256?: string;
  TRUSTED_PROXY_HOPS: number;
  DELIVERY_ADAPTER: 'disabled' | 'local' | 'resend';
  DELIVERY_FROM_EMAIL?: string;
  RESEND_API_KEY?: string;
  MFA_ENCRYPTION_KEY?: string;
  REQUIRE_PRIVILEGED_MFA: 'true' | 'false';
  S3_ENDPOINT?: string;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  AI_PROVIDER: 'disabled' | 'mock' | 'gateway';
  AI_MODEL_ID: string;
  AI_GATEWAY_API_KEY?: string;
  ENABLE_HOSTED_AI: 'true' | 'false';
  AI_TIMEOUT_MS: number;
  AI_MAX_RETRIES: number;
  AI_MAX_OUTPUT_TOKENS: number;
  AI_INPUT_COST_MICROUNITS_PER_MILLION_TOKENS: number;
  AI_OUTPUT_COST_MICROUNITS_PER_MILLION_TOKENS: number;
  AI_MAX_COST_MICROUNITS_PER_REQUEST: number;
  ENABLE_LEARNED_VISION: 'true' | 'false';
  ENABLE_RESEARCH_MODELS: 'true' | 'false';
}

interface RefinementContext {
  addIssue(issue: { code: 'custom'; path: string[]; message: string }): void;
}

export const PRODUCTION_REQUIRED_ENVIRONMENT_KEYS = [
  'DATABASE_URL',
  'APP_ORIGIN',
  'APP_RELEASE_SHA',
  'SESSION_SECRET',
  'TOKEN_DERIVATION_SECRET',
  'NETWORK_FINGERPRINT_SECRET',
  'ABUSE_CONTROL_SECRET',
  'BOOTSTRAP_TOKEN_SHA256',
  'DELIVERY_ADAPTER',
  'DELIVERY_FROM_EMAIL',
  'RESEND_API_KEY',
  'MFA_ENCRYPTION_KEY',
  'REQUIRE_PRIVILEGED_MFA',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

export const HOSTED_AI_COST_ENVIRONMENT_KEYS = [
  'AI_INPUT_COST_MICROUNITS_PER_MILLION_TOKENS',
  'AI_OUTPUT_COST_MICROUNITS_PER_MILLION_TOKENS',
  'AI_MAX_COST_MICROUNITS_PER_REQUEST',
] as const;

const optionalUrl = z.preprocess(
  (value: unknown) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const optionalSecret = z.preprocess(
  (value: unknown) => (value === '' ? undefined : value),
  z.string().min(16).optional(),
);

const optionalProductionSecret = z.preprocess(
  (value: unknown) => (value === '' ? undefined : value),
  z.string().min(32).optional(),
);

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_MODE: z.enum(['demo', 'production']).default('demo'),
    APP_ORIGIN: optionalUrl,
    APP_RELEASE_SHA: z.preprocess(
      (value: unknown) => (value === '' ? undefined : value),
      z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i).optional(),
    ),
    DATABASE_URL: optionalUrl,
    SESSION_SECRET: optionalProductionSecret,
    TOKEN_DERIVATION_SECRET: optionalProductionSecret,
    NETWORK_FINGERPRINT_SECRET: optionalProductionSecret,
    ABUSE_CONTROL_SECRET: optionalProductionSecret,
    BOOTSTRAP_TOKEN_SHA256: z.preprocess(
      (value: unknown) => (value === '' ? undefined : value),
      z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    ),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    DELIVERY_ADAPTER: z.enum(['disabled', 'local', 'resend']).default('disabled'),
    DELIVERY_FROM_EMAIL: z.preprocess(
      (value: unknown) => (value === '' ? undefined : value),
      z.string().email().optional(),
    ),
    RESEND_API_KEY: optionalSecret,
    MFA_ENCRYPTION_KEY: z.preprocess(
      (value: unknown) => (value === '' ? undefined : value),
      z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    ),
    REQUIRE_PRIVILEGED_MFA: z.enum(['true', 'false']).default('false'),
    S3_ENDPOINT: optionalUrl,
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3).max(63).default('capsicum-local'),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: optionalSecret,
    AI_PROVIDER: z.enum(['disabled', 'mock', 'gateway']).default('disabled'),
    AI_MODEL_ID: z.string().min(1).default('openai/gpt-5-mini'),
    AI_GATEWAY_API_KEY: optionalSecret,
    ENABLE_HOSTED_AI: z.enum(['true', 'false']).default('false'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(4_096).default(1_500),
    AI_INPUT_COST_MICROUNITS_PER_MILLION_TOKENS: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    AI_OUTPUT_COST_MICROUNITS_PER_MILLION_TOKENS: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    AI_MAX_COST_MICROUNITS_PER_REQUEST: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    ENABLE_LEARNED_VISION: z.enum(['true', 'false']).default('false'),
    ENABLE_RESEARCH_MODELS: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((value: Environment, context: RefinementContext) => {
    if (value.APP_MODE !== 'production') return;
    for (const key of PRODUCTION_REQUIRED_ENVIRONMENT_KEYS) {
      if (!value[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when APP_MODE=production`,
        });
      }
    }
    if (value.APP_ORIGIN) {
      const origin = new URL(value.APP_ORIGIN);
      if (origin.protocol !== 'https:') {
        context.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'APP_ORIGIN must use HTTPS in production' });
      }
      if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
        context.addIssue({
          code: 'custom',
          path: ['APP_ORIGIN'],
          message: 'APP_ORIGIN must contain only the HTTPS scheme, host, and optional port',
        });
      }
    }
    if (value.DELIVERY_ADAPTER !== 'resend') {
      context.addIssue({ code: 'custom', path: ['DELIVERY_ADAPTER'], message: 'DELIVERY_ADAPTER must be resend in production' });
    }
    if (!value.DELIVERY_FROM_EMAIL) {
      context.addIssue({ code: 'custom', path: ['DELIVERY_FROM_EMAIL'], message: 'DELIVERY_FROM_EMAIL is required in production' });
    }
    if (!value.RESEND_API_KEY) {
      context.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY is required in production' });
    }
    if (!value.MFA_ENCRYPTION_KEY) {
      context.addIssue({ code: 'custom', path: ['MFA_ENCRYPTION_KEY'], message: 'MFA_ENCRYPTION_KEY is required in production' });
    }
    if (value.REQUIRE_PRIVILEGED_MFA !== 'true') {
      context.addIssue({ code: 'custom', path: ['REQUIRE_PRIVILEGED_MFA'], message: 'Privileged MFA must be required in production' });
    }
    if (value.ENABLE_HOSTED_AI === 'true') {
      if (value.AI_PROVIDER !== 'gateway') {
        context.addIssue({
          code: 'custom',
          path: ['AI_PROVIDER'],
          message: 'AI_PROVIDER must be gateway when hosted AI is enabled',
        });
      }
      if (!value.AI_GATEWAY_API_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['AI_GATEWAY_API_KEY'],
          message: 'AI_GATEWAY_API_KEY is required when hosted AI is enabled',
        });
      }
      for (const key of HOSTED_AI_COST_ENVIRONMENT_KEYS) {
        if (value[key] <= 0) {
          context.addIssue({ code: 'custom', path: [key], message: `${key} must be positive when hosted AI is enabled` });
        }
      }
    }
    if (value.ENABLE_HOSTED_AI === 'false' && value.AI_PROVIDER === 'gateway') {
      context.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'AI_PROVIDER=gateway requires ENABLE_HOSTED_AI=true',
      });
    }
  });

export interface ReadinessCheck {
  name: string;
  state: 'ready' | 'degraded' | 'blocked';
  detail: string;
}

export function parseEnvironment(input: Record<string, string | undefined>): Environment {
  return environmentSchema.parse(input) as Environment;
}

export function environmentReadiness(environment: Environment): readonly ReadinessCheck[] {
  const production = environment.APP_MODE === 'production';
  const bootstrapReady = Boolean(environment.BOOTSTRAP_TOKEN_SHA256);
  const softwareProvenanceReady = Boolean(environment.APP_RELEASE_SHA);
  const deliveryReady =
    environment.DELIVERY_ADAPTER === 'resend' && Boolean(environment.DELIVERY_FROM_EMAIL && environment.RESEND_API_KEY);
  const privilegedMfaReady = Boolean(environment.MFA_ENCRYPTION_KEY) && environment.REQUIRE_PRIVILEGED_MFA === 'true';
  return [
    {
      name: 'exact-genetics',
      state: 'ready',
      detail: 'Pure deterministic TypeScript engine requires no external service.',
    },
    {
      name: 'software-provenance',
      state: softwareProvenanceReady ? 'ready' : production ? 'blocked' : 'degraded',
      detail: softwareProvenanceReady
        ? 'Scientific exports are bound to an immutable source revision.'
        : 'APP_RELEASE_SHA is not configured; exported scientific records cannot identify their exact software revision.',
    },
    {
      name: 'authentication',
      state: environment.DATABASE_URL && (!production || privilegedMfaReady) ? 'ready' : production ? 'blocked' : 'degraded',
      detail: !environment.DATABASE_URL
        ? 'Authentication requires PostgreSQL and applied migrations.'
        : production && !privilegedMfaReady
          ? 'PostgreSQL is configured, but production authentication is blocked until MFA encryption and privileged-role enforcement are enabled.'
          : 'Opaque server sessions, scrypt credentials, workspace permissions, and privileged multi-factor policy are configured.',
    },
    {
      name: 'secure-bootstrap',
      state: bootstrapReady ? 'ready' : production ? 'blocked' : 'degraded',
      detail: bootstrapReady
        ? 'First-owner setup requires a deployment-issued single-use installation token.'
        : 'Owner creation is closed until BOOTSTRAP_TOKEN_SHA256 is configured.',
    },
    {
      name: 'account-delivery',
      state: deliveryReady ? 'ready' : production ? 'blocked' : 'degraded',
      detail: deliveryReady
        ? 'Invitation and recovery messages use the configured production delivery adapter.'
        : 'Invitation and recovery delivery is unavailable until a verified sender and delivery provider are configured.',
    },
    {
      name: 'privileged-mfa',
      state: privilegedMfaReady ? 'ready' : production ? 'blocked' : 'degraded',
      detail: privilegedMfaReady
        ? 'Privileged roles must complete multi-factor verification at sign-in.'
        : 'Privileged multi-factor enforcement is not enabled.',
    },
    {
      name: 'database',
      state: environment.DATABASE_URL ? 'ready' : production ? 'blocked' : 'degraded',
      detail: environment.DATABASE_URL
        ? 'PostgreSQL connection is configured.'
        : 'No database is configured; durable records are unavailable.',
    },
    {
      name: 'object-storage',
      state: environment.S3_ENDPOINT ? 'ready' : production ? 'blocked' : 'degraded',
      detail: environment.S3_ENDPOINT
        ? 'S3-compatible object storage is configured.'
        : 'Image and document uploads are unavailable.',
    },
    {
      name: 'hosted-ai',
      state:
        environment.ENABLE_HOSTED_AI === 'true' &&
        environment.AI_PROVIDER === 'gateway' &&
        environment.AI_GATEWAY_API_KEY
          ? 'ready'
          : 'degraded',
      detail:
        environment.ENABLE_HOSTED_AI === 'true' &&
        environment.AI_PROVIDER === 'gateway' &&
        environment.AI_GATEWAY_API_KEY
          ? 'Hosted AI is explicitly enabled through the configured gateway.'
          : environment.AI_PROVIDER === 'mock'
            ? 'Deterministic local test adapter is active; no hosted provider receives data.'
            : 'Hosted AI is disabled; approved-evidence deterministic answers and abstention remain available.',
    },
    {
      name: 'learned-vision',
      state: 'degraded',
      detail:
        environment.ENABLE_LEARNED_VISION === 'true'
          ? 'Feature flag is enabled, but model promotion still requires a validated model version.'
          : 'Learned vision is disabled; deterministic quality checks remain available.',
    },
  ];
}
