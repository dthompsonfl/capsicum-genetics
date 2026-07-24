import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type CredentialKind = 'workspace_invitation' | 'password_reset';

type DeliveryAdapter = 'disabled' | 'local' | 'resend';

export interface CredentialDeliveryInput {
  kind: CredentialKind;
  recipient: string;
  exchangeUrl: string;
  expiresAt: string;
}

export interface CredentialDeliveryOutcome {
  state: 'delivered' | 'unavailable' | 'failed';
  errorCode?:
    | 'adapter_disabled'
    | 'local_adapter_forbidden'
    | 'local_spool_write_failed'
    | 'delivery_configuration_invalid'
    | 'provider_rejected'
    | 'provider_unavailable';
}

function productionMode(): boolean {
  return process.env.APP_MODE === 'production';
}

function deliveryAdapter(): DeliveryAdapter {
  const candidate = process.env.DELIVERY_ADAPTER ?? 'disabled';
  return candidate === 'local' || candidate === 'resend' ? candidate : 'disabled';
}

export function applicationOrigin(): string {
  const configured = process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) throw new Error('APP_ORIGIN is required for one-time credential delivery.');
  const origin = new URL(configured);
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('APP_ORIGIN must use HTTP or HTTPS.');
  if (origin.username || origin.password) throw new Error('APP_ORIGIN must not contain embedded credentials.');
  if (origin.pathname !== '/' || origin.search || origin.hash) throw new Error('APP_ORIGIN must contain only scheme, host, and optional port.');
  if (productionMode() && origin.protocol !== 'https:') throw new Error('APP_ORIGIN must use HTTPS in production.');
  return origin.origin;
}

function resendConfiguration(): { apiKey: string; from: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DELIVERY_FROM_EMAIL;
  if (!apiKey || apiKey.length < 16 || !from || !from.includes('@')) {
    throw new Error('RESEND_API_KEY and DELIVERY_FROM_EMAIL are required for Resend delivery.');
  }
  return { apiKey, from };
}

export function requireCredentialDeliveryAdapter(): void {
  const adapter = deliveryAdapter();
  applicationOrigin();
  if (adapter === 'local') {
    if (productionMode()) throw new RangeError('The local delivery adapter is forbidden in production.');
    return;
  }
  if (adapter === 'resend') {
    resendConfiguration();
    return;
  }
  throw new RangeError('Secure one-time credential delivery is unavailable.');
}

export function credentialExchangeUrl(kind: CredentialKind, token: string): string {
  const route = kind === 'workspace_invitation'
    ? '/api/auth/invitation/exchange'
    : '/api/auth/password-reset/exchange';
  const url = new URL(route, `${applicationOrigin()}/`);
  url.searchParams.set('token', token);
  return url.toString();
}

function deliveryCopy(input: CredentialDeliveryInput): { subject: string; text: string; html: string } {
  const invitation = input.kind === 'workspace_invitation';
  const subject = invitation
    ? 'You were invited to a Capsicum breeding workspace'
    : 'Reset your Capsicum breeding workspace password';
  const action = invitation ? 'Accept invitation' : 'Reset password';
  const description = invitation
    ? 'An administrator invited you to collaborate in a Capsicum breeding workspace.'
    : 'A password reset was requested for your Capsicum breeding workspace account.';
  const expiry = new Date(input.expiresAt).toISOString();
  const text = `${description}\n\n${action}: ${input.exchangeUrl}\n\nThis one-time link expires at ${expiry}. If you did not expect this message, ignore it.`;
  const escapedUrl = input.exchangeUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const html = `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#172015"><h1 style="font-size:22px">${subject}</h1><p>${description}</p><p><a href="${escapedUrl}" style="display:inline-block;padding:12px 18px;background:#315d35;color:white;text-decoration:none;border-radius:8px;font-weight:700">${action}</a></p><p style="font-size:14px;color:#5d6858">This one-time link expires at ${expiry}. If you did not expect this message, ignore it.</p></body></html>`;
  return { subject, text, html };
}

async function deliverWithResend(input: CredentialDeliveryInput): Promise<CredentialDeliveryOutcome> {
  let configuration: { apiKey: string; from: string };
  try {
    configuration = resendConfiguration();
  } catch {
    return { state: 'failed', errorCode: 'delivery_configuration_invalid' };
  }
  const copy = deliveryCopy(input);
  const idempotencyKey = createHash('sha256')
    .update(`${input.kind}\0${input.recipient.toLowerCase()}\0${input.exchangeUrl}`, 'utf8')
    .digest('hex');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          from: configuration.from,
          to: [input.recipient],
          subject: copy.subject,
          text: copy.text,
          html: copy.html,
          headers: { 'X-Entity-Ref-ID': idempotencyKey },
        }),
        signal: controller.signal,
      });
      if (response.ok) return { state: 'delivered' };
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { state: 'failed', errorCode: 'provider_rejected' };
      }
    } catch {
      // Bounded retry below. Credentials are never included in application logs.
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  return { state: 'failed', errorCode: 'provider_unavailable' };
}

async function deliverLocally(input: CredentialDeliveryInput): Promise<CredentialDeliveryOutcome> {
  if (productionMode()) return { state: 'unavailable', errorCode: 'local_adapter_forbidden' };
  try {
    const spoolRoot = path.resolve(process.cwd(), process.env.LOCAL_DELIVERY_SPOOL ?? '.runtime/delivery');
    await mkdir(spoolRoot, { recursive: true, mode: 0o700 });
    await chmod(spoolRoot, 0o700);
    const digest = createHash('sha256').update(`${input.kind}\0${input.exchangeUrl}`).digest('hex');
    const target = path.join(spoolRoot, `${input.kind}-${digest}.json`);
    const payload = {
      schemaVersion: '1.0',
      deliveryId: randomUUID(),
      kind: input.kind,
      recipient: input.recipient,
      exchangeUrl: input.exchangeUrl,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
    try {
      await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return { state: 'delivered' };
  } catch {
    return { state: 'failed', errorCode: 'local_spool_write_failed' };
  }
}

export async function deliverOneTimeCredential(
  input: CredentialDeliveryInput,
): Promise<CredentialDeliveryOutcome> {
  const adapter = deliveryAdapter();
  if (adapter === 'local') return deliverLocally(input);
  if (adapter === 'resend') return deliverWithResend(input);
  return { state: 'unavailable', errorCode: 'adapter_disabled' };
}
