import type { ObjectStorageConfig } from '@capsicum/storage';

export function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) throw new Error('S3_ENDPOINT is required for media storage.');
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  return {
    endpoint,
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'capsicum-local',
    ...(accessKeyId ? { accessKeyId } : {}),
    ...(secretAccessKey ? { secretAccessKey } : {}),
  };
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const configured = process.env.APP_ORIGIN;
  if (!configured && process.env.APP_MODE === 'production') {
    throw new Error('APP_ORIGIN is required for production mutation validation.');
  }
  const expected = new URL(configured ?? new URL(request.url).origin).origin;
  if (!origin || new URL(origin).origin !== expected) {
    throw new RangeError('The mutation request did not originate from the configured application origin.');
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') {
    throw new RangeError('Cross-site mutation requests are not accepted.');
  }
}
