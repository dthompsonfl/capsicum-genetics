'use server';

import { redirect } from 'next/navigation';
import {
  acceptWorkspaceInvitation,
  answerResearchQuestion,
  beginMultiFactorEnrollment,
  bootstrapOwner,
  confirmMultiFactorEnrollment,
  createCatalogReleaseDraft,
  createNormalizedCatalogDraft,
  createCross,
  createExperiment,
  createGermplasm,
  createInventoryReservation,
  createPlant,
  createPhenotypeAnnotation,
  createPhenotypeCapture,
  correctPhenotypeMeasurement,
  createSeedLot,
  createSelectionPlan,
  transitionSelectionPlan,
  verifyCurrentSessionMultiFactor,
  recordSelectionPlanReconciliation,
  regenerateMultiFactorRecoveryCodes,
  createWorkspaceInvitation,
  disableMultiFactorAuthentication,
  harvestCross,
  recordCrossEvent,
  recordCrossVerification,
  reviewCrossVerification,
  reviewCatalogRecord,
  reviewCatalogRelease,
  recordGenotypeCall,
  recordInventoryEvent,
  releaseInventoryReservation,
  requestInventoryException,
  reviewInventoryException,
  recordObservation,
  transitionObservationSession,
  transferSeedInventory,
  requestJobCancellation,
  retryJob,
  enqueueStorageCleanup,
  requestPasswordReset,
  completePasswordReset,
  markPasswordResetDelivery,
  mutateWorkspaceInvitation,
  revokeSession,
  revokeUserSession,
  signIn,
  switchWorkspace,
  submitCatalogRecordForReview,
  submitCatalogReleaseForReview,
  publishCatalogRelease,
  updateWorkspaceMembership,
  toPublicError,
} from '@capsicum/application';
import { getDatabasePool } from '../lib/database';
import { credentialExchangeUrl, deliverOneTimeCredential, requireCredentialDeliveryAdapter } from '../lib/credential-delivery';
import { safeInternalDestination } from '../lib/safe-redirect';
import { errorFields, writeLog } from '../lib/logging';
import {
  clearInvitationExchangeCookie,
  clearPasswordResetExchangeCookie,
  clearSessionCookie,
  getInvitationExchangeToken,
  getPasswordResetExchangeToken,
  requestFingerprint,
  requirePrincipal,
  setSessionCookie,
} from '../lib/session';

function tokenDerivationSecret(): string {
  const configured = process.env.TOKEN_DERIVATION_SECRET ?? process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.APP_MODE === 'production') {
    throw new Error('TOKEN_DERIVATION_SECRET is required in production.');
  }
  return 'development-only-token-derivation-secret-not-for-production';
}

function abuseControlSecret(): string {
  const configured = process.env.ABUSE_CONTROL_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.APP_MODE === 'production') {
    throw new Error('ABUSE_CONTROL_SECRET is required in production.');
  }
  return 'development-only-abuse-control-secret-not-for-production';
}

function mfaEncryptionKey(): string {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured && /^[a-f0-9]{64}$/i.test(configured)) return configured.toLowerCase();
  if (process.env.APP_MODE === 'production') throw new Error('MFA_ENCRYPTION_KEY is required in production.');
  return 'd'.repeat(64);
}

function requirePrivilegedMfa(): boolean {
  return process.env.REQUIRE_PRIVILEGED_MFA === 'true';
}

async function abuseContext() {
  return {
    ...(await requestFingerprint()),
    abuseControlSecret: abuseControlSecret(),
    mfaEncryptionKey: mfaEncryptionKey(),
    recoveryCodeSecret: tokenDerivationSecret(),
    requirePrivilegedMfa: requirePrivilegedMfa(),
  };
}

function installationTokenSha256(): string {
  const configured = process.env.BOOTSTRAP_TOKEN_SHA256;
  if (!configured || !/^[a-f0-9]{64}$/i.test(configured)) {
    throw new Error('BOOTSTRAP_TOKEN_SHA256 must be configured before first-owner onboarding.');
  }
  return configured.toLowerCase();
}

function string(form: FormData, key: string, required = true): string {
  const value = form.get(key);
  if (typeof value !== 'string' || (required && value.trim().length === 0)) {
    throw new TypeError(`${key} is required.`);
  }
  return value.trim();
}

function optionalString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]: V });
}

function checkedEnumValue<const T extends readonly string[]>(
  value: string,
  key: string,
  allowed: T,
): T[number] {
  if (!allowed.includes(value)) {
    throw new TypeError(`${key} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T[number];
}

function enumValue<const T extends readonly string[]>(
  form: FormData,
  key: string,
  allowed: T,
): T[number] {
  return checkedEnumValue(string(form, key), key, allowed);
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function iso(form: FormData, key: string): string {
  const value = string(form, key);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${key} must be a valid date and time.`);
  return date.toISOString();
}

function optionalIso(form: FormData, key: string): string | undefined {
  const value = optionalString(form, key);
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${key} must be a valid date and time.`);
  return date.toISOString();
}

function numberValue(form: FormData, key: string, required = true): number | undefined {
  const value = optionalString(form, key);
  if (!value && !required) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${key} must be a number.`);
  return parsed;
}

function jsonValue<T>(form: FormData, key: string, fallback: T): T {
  const value = optionalString(form, key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new TypeError(`${key} must contain valid JSON.`);
  }
}

function optionalJsonValue<T>(form: FormData, key: string): T | undefined {
  const value = optionalString(form, key);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new TypeError(`${key} must contain valid JSON.`);
  }
}

function lineList(form: FormData, key: string): string[] {
  return (optionalString(form, key) ?? '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function clientRequestId(form: FormData): string {
  const value = string(form, 'clientRequestId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError('A valid stable client request identifier is required.');
  }
  return value;
}

function complete(path: string, requestId: string): never {
  const separator = path.includes('?') ? '&' : '?';
  redirect(`${path}${separator}completedRequestId=${encodeURIComponent(requestId)}`);
}

type PublicQueryErrorCode =
  | 'validation_failed'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'stale_version'
  | 'duplicate_in_progress'
  | 'idempotency_conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'scientific_authority_required'
  | 'scientific_authority_unavailable'
  | 'request_failed';

function publicErrorCode(error: unknown): PublicQueryErrorCode {
  if (error instanceof TypeError || error instanceof RangeError || (error instanceof Error && error.name === 'ZodError')) {
    return 'validation_failed';
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code);
    switch (code) {
      case 'validation_failed':
      case 'permission_denied':
      case 'not_found':
      case 'conflict':
      case 'stale_version':
      case 'duplicate_in_progress':
      case 'idempotency_conflict':
      case 'rate_limited':
      case 'unavailable':
      case 'scientific_authority_required':
      case 'scientific_authority_unavailable':
        return code;
      default:
        break;
    }
  }
  return 'request_failed';
}

function fail(path: string, error: unknown): never {
  const separator = path.includes('?') ? '&' : '?';
  redirect(`${path}${separator}error=${encodeURIComponent(publicErrorCode(error))}`);
}

function publicMessage(error: unknown): string {
  return toPublicError(error).error.message;
}

export async function bootstrapOwnerAction(form: FormData): Promise<void> {
  let issued;
  try {
    issued = await bootstrapOwner(getDatabasePool(), {
      installationToken: string(form, 'installationToken'),
      email: string(form, 'email'),
      displayName: string(form, 'displayName'),
      password: string(form, 'password'),
      workspaceName: string(form, 'workspaceName'),
      workspaceSlug: string(form, 'workspaceSlug'),
    }, await abuseContext(), installationTokenSha256());
  } catch (error) {
    writeLog({ level: 'warn', event: 'auth.owner_bootstrap_failed', fields: errorFields(error) });
    fail('/onboarding', error);
  }
  writeLog({
    level: 'info',
    event: 'auth.owner_bootstrap_completed',
    actorId: issued.principal.userId,
    workspaceId: issued.principal.workspaceId,
  });
  await setSessionCookie(issued.token, issued.expiresAt);
  redirect('/');
}

export async function signInAction(form: FormData): Promise<void> {
  let issued;
  const next = safeInternalDestination(optionalString(form, 'next'), '/', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
  try {
    issued = await signIn(getDatabasePool(), {
      email: string(form, 'email'),
      password: string(form, 'password'),
      ...optionalProperty('totpCode', optionalString(form, 'totpCode')),
      ...optionalProperty('recoveryCode', optionalString(form, 'recoveryCode')),
    }, await abuseContext());
  } catch (error) {
    writeLog({ level: 'warn', event: 'auth.sign_in_failed', fields: errorFields(error) });
    const code = publicErrorCode(error);
    const visibleCode = code === 'rate_limited' || code === 'unavailable' ? code : 'sign_in_failed';
    redirect(`/sign-in?next=${encodeURIComponent(next)}&error=${visibleCode}`);
  }
  writeLog({ level: 'info', event: 'auth.sign_in_completed', actorId: issued.principal.userId, workspaceId: issued.principal.workspaceId });
  await setSessionCookie(issued.token, issued.expiresAt);
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const principal = await requirePrincipal({ allowUnverifiedMfa: true });
  try {
    await revokeSession(getDatabasePool(), principal.sessionId, principal.userId);
  } finally {
    await clearSessionCookie();
  }
  redirect('/sign-in');
}

export interface MultiFactorActionState {
  secret?: string;
  otpauthUri?: string;
  recoveryCodes?: string[];
  enabled?: boolean;
  sessionVerified?: boolean;
  error?: string;
}

export async function beginMultiFactorEnrollmentAction(
  _previous: MultiFactorActionState,
  _form: FormData,
): Promise<MultiFactorActionState> {
  const principal = await requirePrincipal({ allowUnverifiedMfa: true });
  try {
    const enrollment = await beginMultiFactorEnrollment(getDatabasePool(), principal, mfaEncryptionKey());
    writeLog({ level: 'info', event: 'auth.mfa_enrollment_started', actorId: principal.userId, workspaceId: principal.workspaceId });
    return enrollment;
  } catch (error) {
    return { error: publicMessage(error) };
  }
}

export async function confirmMultiFactorEnrollmentAction(
  previous: MultiFactorActionState,
  form: FormData,
): Promise<MultiFactorActionState> {
  const principal = await requirePrincipal({ allowUnverifiedMfa: true });
  try {
    const result = await confirmMultiFactorEnrollment(
      getDatabasePool(),
      principal,
      string(form, 'totpCode'),
      mfaEncryptionKey(),
      tokenDerivationSecret(),
    );
    writeLog({ level: 'info', event: 'auth.mfa_enabled', actorId: principal.userId, workspaceId: principal.workspaceId });
    const { error: _previousError, ...safePrevious } = previous;
    return { ...safePrevious, recoveryCodes: result.recoveryCodes, enabled: true };
  } catch (error) {
    return { ...previous, error: publicMessage(error) };
  }
}

export async function verifyCurrentSessionMultiFactorAction(
  previous: MultiFactorActionState,
  form: FormData,
): Promise<MultiFactorActionState> {
  const principal = await requirePrincipal({ allowUnverifiedMfa: true });
  try {
    const totpCode = optionalString(form, 'totpCode');
    const recoveryCode = optionalString(form, 'recoveryCode');
    await verifyCurrentSessionMultiFactor(
      getDatabasePool(),
      principal,
      {
        ...(totpCode ? { totpCode } : {}),
        ...(recoveryCode ? { recoveryCode } : {}),
      },
      mfaEncryptionKey(),
      tokenDerivationSecret(),
    );
    writeLog({ level: 'info', event: 'auth.session_mfa_verified', actorId: principal.userId, workspaceId: principal.workspaceId });
    const { error: _previousError, ...safePrevious } = previous;
    return { ...safePrevious, sessionVerified: true };
  } catch (error) {
    return { ...previous, error: publicMessage(error) };
  }
}

export async function regenerateMultiFactorRecoveryCodesAction(
  previous: MultiFactorActionState,
  form: FormData,
): Promise<MultiFactorActionState> {
  const principal = await requirePrincipal({ allowUnverifiedMfa: true });
  try {
    const result = await regenerateMultiFactorRecoveryCodes(
      getDatabasePool(),
      principal,
      string(form, 'totpCode'),
      mfaEncryptionKey(),
      tokenDerivationSecret(),
    );
    writeLog({ level: 'warn', event: 'auth.mfa_recovery_codes_rotated', actorId: principal.userId, workspaceId: principal.workspaceId });
    const { error: _previousError, ...safePrevious } = previous;
    return { ...safePrevious, recoveryCodes: result.recoveryCodes, sessionVerified: true };
  } catch (error) {
    return { ...previous, error: publicMessage(error) };
  }
}

export async function disableMultiFactorAuthenticationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal({ allowUnverifiedMfa: true });
  try {
    await disableMultiFactorAuthentication(
      getDatabasePool(),
      principal,
      string(form, 'totpCode'),
      mfaEncryptionKey(),
      requirePrivilegedMfa(),
    );
    writeLog({ level: 'warn', event: 'auth.mfa_disabled', actorId: principal.userId, workspaceId: principal.workspaceId });
  } catch (error) {
    fail('/settings/security', error);
  }
  redirect('/settings/security?saved=disabled');
}

interface InvitationActionState {
  completedRequestId?: string;
  deliveryState?: 'delivered' | 'unavailable' | 'failed';
  error?: string;
}

export async function createInvitationAction(
  _previous: InvitationActionState,
  form: FormData,
): Promise<InvitationActionState> {
  const principal = await requirePrincipal();
  const requestId = clientRequestId(form);
  try {
    requireCredentialDeliveryAdapter();
    const email = string(form, 'email');
    const invitation = await createWorkspaceInvitation(getDatabasePool(), principal, {
      email,
      role: enumValue(
        form,
        'role',
        [
          'breeder',
          'technician',
          'scientific_reviewer',
          'catalog_curator',
          'administrator',
          'viewer',
        ] as const,
      ),
      expiresInHours: numberValue(form, 'expiresInHours')!,
      idempotencyKey: requestId,
    }, tokenDerivationSecret(), abuseControlSecret());
    const delivery = await deliverOneTimeCredential({
      kind: 'workspace_invitation',
      recipient: email,
      exchangeUrl: credentialExchangeUrl('workspace_invitation', invitation.token),
      expiresAt: invitation.expiresAt,
    });
    writeLog({
      level: delivery.state === 'delivered' ? 'info' : 'warn',
      event: 'auth.invitation_delivery',
      actorId: principal.userId,
      workspaceId: principal.workspaceId,
      fields: { deliveryState: delivery.state, errorCode: delivery.errorCode },
    });
    return { completedRequestId: requestId, deliveryState: delivery.state };
  } catch (error) {
    return { error: publicMessage(error) };
  }
}

export async function acceptInvitationAction(form: FormData): Promise<void> {
  let issued;
  try {
    const token = await getInvitationExchangeToken();
    if (!token) throw new RangeError('The invitation credential is missing or expired.');
    issued = await acceptWorkspaceInvitation(getDatabasePool(), {
      token,
      displayName: string(form, 'displayName'),
      password: string(form, 'password'),
    }, await abuseContext());
  } catch (error) {
    fail('/accept-invitation', error);
  }
  await clearInvitationExchangeCookie();
  await setSessionCookie(issued.token, issued.expiresAt);
  redirect('/');
}

export async function createGermplasmAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let created;
  try {
    created = await createGermplasm(getDatabasePool(), principal, {
      materialCode: string(form, 'materialCode'),
      taxon: string(form, 'taxon'),
      displayName: string(form, 'displayName'),
      sourceType: enumValue(
        form,
        'sourceType',
        ['breeder', 'genebank', 'vendor', 'wild_collection', 'exchange', 'unknown'] as const,
      ),
      ...optionalProperty('sourceName', optionalString(form, 'sourceName')),
      ...optionalProperty('sourceIdentifier', optionalString(form, 'sourceIdentifier')),
      acquiredAt: iso(form, 'acquiredAt'),
      ...optionalProperty('notes', optionalString(form, 'notes')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/germplasm/new', error);
  }
  complete(`/germplasm/${created.materialId}`, clientRequestId(form));
}

export async function createSeedLotAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let created;
  try {
    created = await createSeedLot(getDatabasePool(), principal, {
      materialCode: string(form, 'materialCode'),
      ...optionalProperty('accessionMaterialId', optionalString(form, 'accessionMaterialId')),
      ...optionalProperty('derivedMaterialId', optionalString(form, 'derivedMaterialId')),
      ...optionalProperty('sourceLotMaterialId', optionalString(form, 'sourceLotMaterialId')),
      ...optionalProperty('quantityEstimate', numberValue(form, 'quantityEstimate', false)),
      ...optionalProperty('storageLocation', optionalString(form, 'storageLocation')),
      acquiredAt: iso(form, 'acquiredAt'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/seed-lots', error);
  }
  complete(`/seed-lots/${created.materialId}`, clientRequestId(form));
}

export async function recordInventoryAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const materialId = string(form, 'seedLotMaterialId');
  try {
    await recordInventoryEvent(getDatabasePool(), principal, {
      seedLotMaterialId: materialId,
      eventType: enumValue(
        form,
        'eventType',
        [
          'received',
          'adjustment',
          'reservation',
          'reservation_release',
          'planting',
          'germination',
          'loss',
          'return',
          'reconciliation',
          'sown',
          'transferred',
          'consumed',
          'discarded',
          'counted',
        ] as const,
      ),
      quantityDelta: numberValue(form, 'quantityDelta', false) ?? 0,
      ...optionalProperty('resultingQuantity', numberValue(form, 'resultingQuantity', false)),
      reason: string(form, 'reason'),
      occurredAt: iso(form, 'occurredAt'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/seed-lots/${materialId}`, error);
  }
  complete(`/seed-lots/${materialId}?saved=inventory`, clientRequestId(form));
}

export async function transferSeedInventoryAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const sourceId = string(form, 'sourceSeedLotMaterialId');
  try {
    await transferSeedInventory(getDatabasePool(), principal, {
      sourceSeedLotMaterialId: sourceId,
      destinationSeedLotMaterialId: string(form, 'destinationSeedLotMaterialId'),
      quantity: numberValue(form, 'quantity')!,
      reason: string(form, 'reason'),
      occurredAt: iso(form, 'occurredAt'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/seed-lots/${sourceId}`, error);
  }
  complete(`/seed-lots/${sourceId}?saved=inventory-transfer`, clientRequestId(form));
}

export async function createInventoryReservationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const materialId = string(form, 'seedLotMaterialId');
  try {
    await createInventoryReservation(getDatabasePool(), principal, {
      seedLotMaterialId: materialId,
      quantity: numberValue(form, 'quantity')!,
      purpose: string(form, 'purpose'),
      ...optionalProperty('expiresAt', optionalIso(form, 'expiresAt')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/seed-lots/${materialId}`, error);
  }
  complete(`/seed-lots/${materialId}?saved=reservation`, clientRequestId(form));
}

export async function releaseInventoryReservationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const materialId = string(form, 'seedLotMaterialId');
  try {
    await releaseInventoryReservation(getDatabasePool(), principal, {
      reservationId: string(form, 'reservationId'),
      reason: string(form, 'reason'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/seed-lots/${materialId}`, error);
  }
  complete(`/seed-lots/${materialId}?saved=reservation-released`, clientRequestId(form));
}

export async function requestInventoryExceptionAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const materialId = string(form, 'seedLotMaterialId');
  try {
    await requestInventoryException(getDatabasePool(), principal, {
      seedLotMaterialId: materialId,
      quantity: numberValue(form, 'quantity')!,
      reason: string(form, 'reason'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/seed-lots/${materialId}`, error);
  }
  complete(`/seed-lots/${materialId}?saved=exception-requested`, clientRequestId(form));
}

export async function reviewInventoryExceptionAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const materialId = string(form, 'seedLotMaterialId');
  try {
    await reviewInventoryException(getDatabasePool(), principal, {
      requestId: string(form, 'requestId'),
      decision: enumValue(form, 'decision', ['approved', 'changes_requested', 'rejected'] as const),
      rationale: string(form, 'rationale'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/seed-lots/${materialId}`, error);
  }
  complete(`/seed-lots/${materialId}?saved=exception-reviewed`, clientRequestId(form));
}

export async function createPlantAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let created;
  try {
    created = await createPlant(getDatabasePool(), principal, {
      materialCode: string(form, 'materialCode'),
      sourceSeedLotMaterialId: string(form, 'sourceSeedLotMaterialId'),
      germinatedAt: iso(form, 'germinatedAt'),
      inventoryMode: checkedEnumValue(
        optionalString(form, 'inventoryMode') ?? 'consume',
        'inventoryMode',
        ['consume', 'approved_exception', 'uncertain_quantity'] as const,
      ),
      seedQuantity: numberValue(form, 'seedQuantity', false) ?? 1,
      ...optionalProperty('inventoryExceptionReason', optionalString(form, 'inventoryExceptionReason')),
      ...optionalProperty('reservationId', optionalString(form, 'reservationId')),
      ...optionalProperty('inventoryExceptionRequestId', optionalString(form, 'inventoryExceptionRequestId')),
      ...optionalProperty('locationName', optionalString(form, 'locationName')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/plants', error);
  }
  complete(`/plants/${created.materialId}`, clientRequestId(form));
}

export async function recordGenotypeCallAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const materialId = string(form, 'materialId');
  try {
    await recordGenotypeCall(getDatabasePool(), principal, {
      materialId,
      ...optionalProperty('catalogReleaseId', optionalString(form, 'catalogReleaseId')),
      locusCatalogId: string(form, 'locusCatalogId'),
      ...optionalProperty('alleleOneId', optionalString(form, 'alleleOneId')),
      ...optionalProperty('alleleTwoId', optionalString(form, 'alleleTwoId')),
      ...optionalProperty(
        'unresolvedHistoricalNotation',
        optionalString(form, 'catalogReleaseId')
          && optionalString(form, 'alleleOneId')
          && optionalString(form, 'alleleTwoId')
            ? undefined
            : optionalString(form, 'unresolvedHistoricalNotation')
              ?? `${string(form, 'locusCatalogId')}: ${string(form, 'alleleOne')}/${string(form, 'alleleTwo')}`,
      ),
      evidenceState: enumValue(
        form,
        'evidenceState',
        ['verified', 'inferred', 'assumed', 'unknown', 'conflicting'] as const,
      ),
      evidenceBasis: enumValue(
        form,
        'evidenceBasis',
        [
          'verified_genotype',
          'marker_supported',
          'pedigree_inference',
          'phenotype_inference',
          'user_assumption',
          'imported_claim',
          'unknown',
          'conflicting',
        ] as const,
      ),
      ...optionalProperty('assayId', optionalString(form, 'assayId')),
      ...optionalProperty('markerId', optionalString(form, 'markerId')),
      ...optionalProperty('assayMethod', optionalString(form, 'assayMethod')),
      ...optionalProperty('assayIdentifier', optionalString(form, 'assayIdentifier')),
      ploidy: numberValue(form, 'ploidy', false) ?? 2,
      phaseState: enumValue(
        form,
        'phaseState',
        ['known_phased', 'known_unphased', 'unknown', 'conflicting'] as const,
      ),
      ...optionalProperty('expectedCurrentCallId', optionalString(form, 'expectedCurrentCallId')),
      ...optionalProperty('notes', optionalString(form, 'notes')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/plants/${materialId}`, error);
  }
  complete(`/plants/${materialId}?saved=genotype`, clientRequestId(form));
}

export async function createCrossAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const method = enumValue(form, 'pollinationMethod', ['controlled_cross', 'selfing', 'open_pollination'] as const);
  const maternal = string(form, 'maternalPlantId');
  let created;
  try {
    created = await createCross(getDatabasePool(), principal, {
      crossCode: string(form, 'crossCode'),
      maternalPlantId: maternal,
      ...optionalProperty('paternalPlantId', method === 'selfing' ? maternal : optionalString(form, 'paternalPlantId')),
      pollinationMethod: method,
      plannedAt: iso(form, 'plannedAt'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/crosses/new', error);
  }
  complete(`/crosses/${created.crossId}`, clientRequestId(form));
}

export async function recordCrossEventAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const crossId = string(form, 'crossId');
  try {
    await recordCrossEvent(getDatabasePool(), principal, {
      crossId,
      eventType: enumValue(
        form,
        'eventType',
        [
          'prepared',
          'pollinated',
          'bagged',
          'unbagged',
          'fruit_set',
          'harvest_ready',
          'failed',
          'closed',
        ] as const,
      ),
      occurredAt: iso(form, 'occurredAt'),
      ...optionalProperty('notes', optionalString(form, 'notes')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/crosses/${crossId}`, error);
  }
  complete(`/crosses/${crossId}?saved=event`, clientRequestId(form));
}

export async function recordCrossVerificationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const crossId = string(form, 'crossId');
  try {
    await recordCrossVerification(getDatabasePool(), principal, {
      crossId,
      verificationState: enumValue(
        form,
        'verificationState',
        [
          'unknown',
          'process_documented',
          'isolation_evidence_recorded',
          'morphology_consistent_unconfirmed',
          'marker_confirmed',
          'genotype_confirmed',
          'conflicting',
          'failed',
        ] as const,
      ),
      method: enumValue(
        form,
        'method',
        [
          'unknown',
          'process_documentation',
          'isolation_record',
          'morphology',
          'marker_assay',
          'genotype_assay',
          'conflict_review',
          'failure_review',
        ] as const,
      ),
      sourceType: checkedEnumValue(
        optionalString(form, 'sourceType') ?? 'operator_record',
        'sourceType',
        [
          'operator_record',
          'media',
          'research_document',
          'marker_result',
          'laboratory_result',
          'review',
        ] as const,
      ),
      evidenceReferences: optionalString(form, 'evidenceEntityId')
        ? [
            {
              entityType: optionalString(form, 'evidenceEntityType') ?? 'workspace_record',
              entityId: string(form, 'evidenceEntityId'),
              ...optionalProperty('contentHash', optionalString(form, 'evidenceContentHash')),
            },
          ]
        : [],
      ...optionalProperty('confidence', numberValue(form, 'confidence', false)),
      ...optionalProperty('notes', optionalString(form, 'notes')),
      recordedAt: iso(form, 'recordedAt'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/crosses/${crossId}`, error);
  }
  complete(`/crosses/${crossId}?saved=verification`, clientRequestId(form));
}

export async function reviewCrossVerificationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const crossId = string(form, 'crossId');
  try {
    await reviewCrossVerification(getDatabasePool(), principal, {
      verificationId: string(form, 'verificationId'),
      decision: enumValue(form, 'decision', ['approved', 'rejected', 'changes_requested'] as const),
      rationale: string(form, 'rationale'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/crosses/${crossId}`, error);
  }
  complete(`/crosses/${crossId}?saved=verification-review`, clientRequestId(form));
}

export async function harvestCrossAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const crossId = string(form, 'crossId');
  let created;
  try {
    created = await harvestCross(getDatabasePool(), principal, {
      crossId,
      fruitCode: string(form, 'fruitCode'),
      harvestCode: string(form, 'harvestCode'),
      derivedMaterialCode: string(form, 'derivedMaterialCode'),
      derivedMaterialName: string(form, 'derivedMaterialName'),
      derivedMaterialClass: enumValue(form, 'derivedMaterialClass', ['controlled_cross_progeny', 'selfed_progeny', 'open_pollinated_progeny', 'derived_line', 'population', 'selection'] as const),
      seedLotCode: string(form, 'seedLotCode'),
      familyCode: string(form, 'familyCode'),
      harvestedAt: iso(form, 'harvestedAt'),
      ...optionalProperty('seedQuantityEstimate', numberValue(form, 'seedQuantityEstimate', false)),
      generationLabel: string(form, 'generationLabel'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/crosses/${crossId}`, error);
  }
  complete(`/families/${created.familyId}`, clientRequestId(form));
}

export async function createSelectionPlanAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let created;
  try {
    created = await createSelectionPlan(getDatabasePool(), principal, {
      simulationRunId: string(form, 'simulationRunId'),
      name: string(form, 'name'),
      targetDescription: string(form, 'targetDescription'),
      targetExpression: jsonValue<Record<string, unknown>>(form, 'targetExpression', {}),
      targetModelVersion: optionalString(form, 'targetModelVersion') ?? '1.0.0',
      plannedPopulation: numberValue(form, 'plannedPopulation')!,
      scenarioType: checkedEnumValue(
        optionalString(form, 'scenarioType') ?? 'f1',
        'scenarioType',
        ['f1', 'f2_self', 'backcross_maternal', 'backcross_paternal', 'reciprocal', 'multi_generation'] as const,
      ),
      confidence: numberValue(form, 'confidence', false) ?? 0.95,
      assumptions: lineList(form, 'assumptions'),
      generationPlan: jsonValue(form, 'generationPlan', []),
      ...optionalProperty('notes', optionalString(form, 'notes')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/selection-plans', error);
  }
  complete(`/selection-plans/${created.selectionPlanId}`, clientRequestId(form));
}

export async function transitionSelectionPlanAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const selectionPlanId = string(form, 'selectionPlanId');
  try {
    await transitionSelectionPlan(getDatabasePool(), principal, {
      selectionPlanId,
      expectedVersion: numberValue(form, 'expectedVersion')!,
      toStatus: enumValue(form, 'toStatus', ['approved', 'active', 'completed', 'cancelled'] as const),
      ...optionalProperty('reason', optionalString(form, 'reason')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/selection-plans/${selectionPlanId}`, error);
  }
  complete(`/selection-plans/${selectionPlanId}`, clientRequestId(form));
}

export async function recordSelectionPlanReconciliationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const selectionPlanId = string(form, 'selectionPlanId');
  try {
    await recordSelectionPlanReconciliation(getDatabasePool(), principal, {
      selectionPlanId,
      categories: jsonValue(form, 'categories', []),
      missingCount: numberValue(form, 'missingCount', false) ?? 0,
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/selection-plans/${selectionPlanId}`, error);
  }
  complete(`/selection-plans/${selectionPlanId}`, clientRequestId(form));
}

export async function createExperimentAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let created;
  try {
    created = await createExperiment(getDatabasePool(), principal, {
      code: string(form, 'code'),
      name: string(form, 'name'),
      objective: string(form, 'objective'),
      environment: {
        location: optionalString(form, 'location') ?? 'not recorded',
        season: optionalString(form, 'season') ?? 'not recorded',
      },
      protocolId: string(form, 'protocolId'),
      startedAt: iso(form, 'startedAt'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/experiments', error);
  }
  complete(`/observations/session/${created.sessionId}`, clientRequestId(form));
}

export async function transitionObservationSessionAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const sessionId = string(form, 'sessionId');
  try {
    await transitionObservationSession(getDatabasePool(), principal, {
      sessionId,
      transition: enumValue(form, 'transition', ['open', 'pause', 'resume', 'close', 'reopen', 'cancel'] as const),
      expectedStateVersion: numberValue(form, 'expectedStateVersion')!,
      ...optionalProperty('reason', optionalString(form, 'reason')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/observations/session/${sessionId}`, error);
  }
  complete(`/observations/session/${sessionId}?saved=session-transition`, clientRequestId(form));
}

export async function recordObservationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const sessionId = string(form, 'sessionId');
  const valueType = enumValue(form, 'valueType', ['number', 'text', 'boolean', 'category', 'missing'] as const);
  const rawValue = string(form, 'value');
  const value = valueType === 'number'
    ? {
        type: 'number' as const,
        value: Number(rawValue),
        ...optionalProperty('unitId', optionalString(form, 'unitId')),
        ...optionalProperty('unit', optionalString(form, 'unit')),
      }
    : valueType === 'boolean'
      ? { type: 'boolean' as const, value: rawValue === 'true' }
      : valueType === 'category'
        ? {
            type: 'category' as const,
            value: rawValue,
            ...optionalProperty('termId', optionalString(form, 'termId')),
            ...optionalProperty('vocabularyVersionId', optionalString(form, 'vocabularyVersionId')),
            ...optionalProperty('vocabularyId', optionalString(form, 'vocabularyId')),
          }
        : valueType === 'missing'
          ? { type: 'missing' as const, reason: rawValue }
          : { type: 'text' as const, value: rawValue };
  try {
    await recordObservation(getDatabasePool(), principal, {
      sessionId,
      materialId: string(form, 'materialId'),
      definitionId: string(form, 'definitionId'),
      authority: checkedEnumValue(
        optionalString(form, 'authority') ?? 'research_draft',
        'authority',
        ['research_draft', 'authoritative'] as const,
      ),
      ...optionalProperty('methodRecordId', optionalString(form, 'methodRecordId')),
      ...optionalProperty('methodId', optionalString(form, 'methodId')),
      ...optionalProperty('methodVersion', optionalString(form, 'methodVersion')),
      value,
      observedAt: iso(form, 'observedAt'),
      qualityTermIds: form.getAll('qualityTermIds').map((value) => String(value)).filter(Boolean),
      ...optionalProperty('deviceSchemaId', optionalString(form, 'deviceSchemaId')),
      ...optionalProperty('deviceProvenance', optionalJsonValue<Record<string, unknown>>(form, 'deviceProvenance')),
      ...optionalProperty('correctionOfRevisionId', optionalString(form, 'correctionOfRevisionId')),
      ...optionalProperty('expectedCurrentRevisionId', optionalString(form, 'expectedCurrentRevisionId')),
      ...optionalProperty('correctionReason', optionalString(form, 'correctionReason')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/observations/session/${sessionId}`, error);
  }
  complete(`/observations/session/${sessionId}?saved=observation`, clientRequestId(form));
}


export interface ResearchQuestionActionState {
  interactionId?: string;
  provider?: 'deterministic_local' | 'gateway';
  modelId?: string;
  hostedFallbackCode?: 'provider_failure' | 'timeout' | 'citation_revalidation_failed';
  answer?: {
    authority: 'evidence_summary' | 'hypothesis_only' | 'unsupported';
    answer: string;
    citations: Array<{
      evidenceId: string;
      claim: string;
      supportingQuote: string;
      navigationPath: string;
      sourceLocator: string;
      applicability?: string | null;
      conflictNote?: string | null;
    }>;
    abstentions: string[];
  };
  error?: string;
}

export async function askResearchQuestionAction(
  _previous: ResearchQuestionActionState,
  form: FormData,
): Promise<ResearchQuestionActionState> {
  const principal = await requirePrincipal();
  try {
    const result = await answerResearchQuestion(
      getDatabasePool(),
      principal,
      string(form, 'question'),
    );
    return {
      interactionId: result.interactionId,
      provider: result.provider,
      modelId: result.modelId,
      ...(result.hostedFallbackCode ? { hostedFallbackCode: result.hostedFallbackCode } : {}),
      answer: {
        authority: result.answer.authority,
        answer: result.answer.answer,
        citations: result.answer.citations.map((citation) => {
          const evidence = result.evidence.find((item) => item.evidenceId === citation.evidenceId);
          return {
            ...citation,
            navigationPath: evidence?.navigationPath ?? '/research',
            sourceLocator: evidence?.sourceLocator ?? 'Locator unavailable',
            applicability: evidence?.applicability ?? null,
            conflictNote: evidence?.conflictNote ?? null,
          };
        }),
        abstentions: [...result.answer.abstentions],
      },
    };
  } catch (error) {
    return { error: publicMessage(error) };
  }
}

export async function createNormalizedCatalogDraftAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const entityType = string(form, 'entityType');
  let payload: Record<string, unknown>;
  try {
    if (entityType === 'reference_assembly') {
      payload = {
        entityType,
        assemblyKey: string(form, 'assemblyKey'),
        recordVersion: string(form, 'recordVersion'),
        speciesScope: string(form, 'speciesScope'),
        assemblyName: string(form, 'assemblyName'),
        ...optionalProperty('accession', optionalString(form, 'accession')),
        sourceLocator: string(form, 'sourceLocator'),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'allele') {
      payload = {
        entityType,
        alleleKey: string(form, 'alleleKey'),
        recordVersion: string(form, 'recordVersion'),
        locusId: string(form, 'locusId'),
        canonicalSymbol: string(form, 'canonicalSymbol'),
        ...optionalProperty(
          'molecularDefinition',
          optionalJsonValue<Record<string, unknown>>(form, 'molecularDefinition'),
        ),
        ...optionalProperty('functionalClass', optionalString(form, 'functionalClass')),
        ...optionalProperty('unresolvedSourceNotation', optionalString(form, 'unresolvedSourceNotation')),
        applicability: string(form, 'applicability'),
        aliases: jsonValue(form, 'aliases', []),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'sequence_variant') {
      payload = {
        entityType,
        variantKey: string(form, 'variantKey'),
        recordVersion: string(form, 'recordVersion'),
        assemblyId: string(form, 'assemblyId'),
        chromosome: string(form, 'chromosome'),
        positionStart: numberValue(form, 'positionStart'),
        positionEnd: numberValue(form, 'positionEnd'),
        referenceAllele: string(form, 'referenceAllele'),
        alternateAllele: string(form, 'alternateAllele'),
        ...optionalProperty('locusId', optionalString(form, 'locusId')),
        ...optionalProperty('alleleId', optionalString(form, 'alleleId')),
        applicability: string(form, 'applicability'),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'structural_variant') {
      payload = {
        entityType,
        variantKey: string(form, 'variantKey'),
        recordVersion: string(form, 'recordVersion'),
        assemblyId: string(form, 'assemblyId'),
        chromosome: string(form, 'chromosome'),
        positionStart: numberValue(form, 'positionStart'),
        positionEnd: numberValue(form, 'positionEnd'),
        variantType: string(form, 'variantType'),
        ...optionalProperty('locusId', optionalString(form, 'locusId')),
        ...optionalProperty('alleleId', optionalString(form, 'alleleId')),
        applicability: string(form, 'applicability'),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'marker') {
      payload = {
        entityType,
        markerKey: string(form, 'markerKey'),
        recordVersion: string(form, 'recordVersion'),
        ...optionalProperty('locusId', optionalString(form, 'locusId')),
        ...optionalProperty('assemblyId', optionalString(form, 'assemblyId')),
        markerType: string(form, 'markerType'),
        targetDefinition: jsonValue(form, 'targetDefinition', {}),
        applicability: string(form, 'applicability'),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'assay') {
      payload = {
        entityType,
        assayKey: string(form, 'assayKey'),
        recordVersion: string(form, 'recordVersion'),
        ...optionalProperty('markerId', optionalString(form, 'markerId')),
        ...optionalProperty('locusId', optionalString(form, 'locusId')),
        assayType: string(form, 'assayType'),
        protocolLocator: string(form, 'protocolLocator'),
        resultContract: jsonValue(form, 'resultContract', {}),
        applicability: string(form, 'applicability'),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'capture_protocol') {
      payload = {
        entityType,
        protocolKey: string(form, 'protocolKey'),
        recordVersion: string(form, 'recordVersion'),
        contract: jsonValue(form, 'contract', {}),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'observation_method') {
      payload = {
        entityType,
        methodKey: string(form, 'methodKey'),
        recordVersion: string(form, 'recordVersion'),
        displayName: string(form, 'displayName'),
        ...optionalProperty('protocolId', optionalString(form, 'protocolId')),
        contract: jsonValue(form, 'contract', {}),
        applicability: jsonValue(form, 'applicability', {}),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'observation_quality_term') {
      payload = {
        entityType,
        qualityKey: string(form, 'qualityKey'),
        recordVersion: string(form, 'recordVersion'),
        displayName: string(form, 'displayName'),
        severity: string(form, 'severity'),
        definition: string(form, 'definition'),
        applicability: jsonValue(form, 'applicability', {}),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'observation_device_schema') {
      payload = {
        entityType,
        schemaKey: string(form, 'schemaKey'),
        recordVersion: string(form, 'recordVersion'),
        displayName: string(form, 'displayName'),
        jsonSchema: jsonValue(form, 'jsonSchema', {}),
        applicability: jsonValue(form, 'applicability', {}),
        idempotencyKey: clientRequestId(form),
      };
    } else if (entityType === 'observation_definition') {
      payload = {
        entityType,
        traitId: string(form, 'traitId'),
        recordVersion: string(form, 'recordVersion'),
        displayName: string(form, 'displayName'),
        valueContract: jsonValue(form, 'valueContract', {}),
        ...optionalProperty('unitId', optionalString(form, 'unitId')),
        ...optionalProperty(
          'vocabularyVersionId',
          optionalString(form, 'vocabularyVersionId'),
        ),
        protocolId: string(form, 'protocolId'),
        methodId: string(form, 'methodId'),
        allowedQualityTermIds: form
          .getAll('allowedQualityTermIds')
          .map((value) => String(value))
          .filter(Boolean),
        missingPolicy: jsonValue(form, 'missingPolicy', { allowed: false, allowedReasons: [] }),
        applicability: jsonValue(form, 'applicability', {}),
        idempotencyKey: clientRequestId(form),
      };
    } else {
      throw new TypeError('Unsupported normalized catalog record type.');
    }
    const result = await createNormalizedCatalogDraft(getDatabasePool(), principal, payload);
    complete(`/catalog/normalized?saved=${encodeURIComponent(result.entityType)}`, clientRequestId(form));
  } catch (error) {
    fail('/catalog/normalized', error);
  }
}

export async function submitCatalogRecordAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const entityType = enumValue(
    form,
    'entityType',
    [
      'scientific_source',
      'reference_assembly',
      'research_document',
      'research_passage',
      'locus',
      'allele',
      'variant',
      'marker',
      'assay',
      'evidence_assertion',
      'phenotype_rule',
      'capture_protocol',
      'observation_method',
      'observation_quality_term',
      'observation_device_schema',
      'observation_definition',
    ] as const,
  );
  const entityId = string(form, 'entityId');
  try {
    await submitCatalogRecordForReview(getDatabasePool(), principal, entityType, entityId);
  } catch (error) {
    fail('/research/review', error);
  }
  redirect('/research/review?saved=submitted');
}

export async function reviewCatalogRecordAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  try {
    await reviewCatalogRecord(getDatabasePool(), principal, {
      entityType: enumValue(
        form,
        'entityType',
        [
          'scientific_source',
          'reference_assembly',
          'research_document',
          'research_passage',
          'locus',
          'allele',
          'variant',
          'marker',
          'assay',
          'evidence_assertion',
          'phenotype_rule',
          'capture_protocol',
          'observation_method',
          'observation_quality_term',
          'observation_device_schema',
          'observation_definition',
        ] as const,
      ),
      entityId: string(form, 'entityId'),
      authorUserId: string(form, 'authorUserId'),
      decision: enumValue(
        form,
        'decision',
        ['approved', 'changes_requested', 'rejected'] as const,
      ),
      rationale: string(form, 'rationale'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/research/review', error);
  }
  complete('/research/review?saved=review', clientRequestId(form));
}

export async function createCatalogReleaseDraftAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let result;
  try {
    result = await createCatalogReleaseDraft(getDatabasePool(), principal, string(form, 'version'));
  } catch (error) {
    fail('/catalog', error);
  }
  redirect(`/catalog/releases/${result.releaseId}?saved=draft`);
}

export async function submitCatalogReleaseAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const releaseId = string(form, 'releaseId');
  try {
    await submitCatalogReleaseForReview(getDatabasePool(), principal, releaseId);
  } catch (error) {
    fail(`/catalog/releases/${releaseId}`, error);
  }
  redirect(`/catalog/releases/${releaseId}?saved=submitted`);
}

export async function reviewCatalogReleaseAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const releaseId = string(form, 'releaseId');
  try {
    await reviewCatalogRelease(getDatabasePool(), principal, {
      releaseId,
      authorUserId: string(form, 'authorUserId'),
      decision: enumValue(form, 'decision', ['approved', 'changes_requested', 'rejected'] as const),
      rationale: string(form, 'rationale'),
    });
  } catch (error) {
    fail(`/catalog/releases/${releaseId}`, error);
  }
  redirect(`/catalog/releases/${releaseId}?saved=reviewed`);
}

export async function publishCatalogReleaseAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const releaseId = string(form, 'releaseId');
  try {
    await publishCatalogRelease(getDatabasePool(), principal, releaseId);
  } catch (error) {
    fail(`/catalog/releases/${releaseId}`, error);
  }
  redirect(`/catalog/releases/${releaseId}?saved=published`);
}


export async function createPhenotypeCaptureAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let created;
  try {
    created = await createPhenotypeCapture(getDatabasePool(), principal, {
      materialId: string(form, 'materialId'),
      mediaObjectId: string(form, 'mediaObjectId'),
      protocolId: string(form, 'protocolId'),
      viewName: string(form, 'viewName'),
      capturedAt: iso(form, 'capturedAt'),
      operatorScaleConfirmed: form.get('operatorScaleConfirmed') === 'on',
      operatorColorReferenceConfirmed: form.get('operatorColorReferenceConfirmed') === 'on',
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/phenotype-capture', error);
  }
  complete(`/phenotype-capture/${created.captureId}`, clientRequestId(form));
}

export async function createPhenotypeAnnotationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const captureId = string(form, 'captureId');
  let geometry: unknown;
  try {
    geometry = JSON.parse(string(form, 'geometry'));
    if (!isJsonRecord(geometry)) {
      throw new TypeError('Geometry must be a JSON object.');
    }
    const supersedesAnnotationId = optionalString(form, 'supersedesAnnotationId');
    await createPhenotypeAnnotation(getDatabasePool(), principal, {
      captureId,
      annotationType: enumValue(
        form,
        'annotationType',
        ['point', 'line', 'polygon', 'bounding_box', 'measurement'] as const,
      ),
      geometry,
      label: string(form, 'label'),
      ...optionalProperty('supersedesAnnotationId', supersedesAnnotationId),
      ...optionalProperty('expectedCurrentAnnotationId', supersedesAnnotationId),
      ...optionalProperty('correctionReason', optionalString(form, 'correctionReason')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/phenotype-capture/${captureId}`, error);
  }
  complete(`/phenotype-capture/${captureId}?saved=annotation`, clientRequestId(form));
}


export async function correctPhenotypeMeasurementAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const captureId = string(form, 'captureId');
  try {
    const valuePayload = jsonValue<Record<string, unknown>>(form, 'valuePayload', {});
    if (!valuePayload || typeof valuePayload !== 'object' || Array.isArray(valuePayload)) {
      throw new TypeError('Corrected measurement value must be a JSON object.');
    }
    await correctPhenotypeMeasurement(getDatabasePool(), principal, {
      measurementId: string(form, 'measurementId'),
      expectedCurrentRevisionId: string(form, 'expectedCurrentRevisionId'),
      valuePayload,
      reason: string(form, 'reason'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail(`/phenotype-capture/${captureId}`, error);
  }
  complete(`/phenotype-capture/${captureId}?saved=measurement`, clientRequestId(form));
}


export async function updateWorkspaceMembershipAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  try {
    await updateWorkspaceMembership(getDatabasePool(), principal, {
      userId: string(form, 'userId'),
      role: enumValue(
        form,
        'role',
        [
          'breeder',
          'technician',
          'scientific_reviewer',
          'catalog_curator',
          'administrator',
          'viewer',
        ] as const,
      ),
      state: enumValue(form, 'state', ['active', 'suspended', 'revoked'] as const),
      ...optionalProperty('expectedUpdatedAt', optionalString(form, 'expectedUpdatedAt')),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/settings/users', error);
  }
  complete('/settings/users?saved=membership', clientRequestId(form));
}


export async function switchWorkspaceAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  try {
    await switchWorkspace(getDatabasePool(), principal, {
      workspaceId: string(form, 'workspaceId'),
      idempotencyKey: clientRequestId(form),
    }, requirePrivilegedMfa());
  } catch (error) {
    fail('/settings/workspace', error);
  }
  complete('/', clientRequestId(form));
}

export async function revokeUserSessionAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let result;
  try {
    result = await revokeUserSession(getDatabasePool(), principal, {
      sessionId: string(form, 'sessionId'),
      idempotencyKey: clientRequestId(form),
    });
  } catch (error) {
    fail('/settings/sessions', error);
  }
  if (result.currentSessionRevoked) {
    await clearSessionCookie();
    redirect('/sign-in');
  }
  complete('/settings/sessions?saved=revoked', clientRequestId(form));
}

export async function mutateInvitationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  let result;
  try {
    const action = enumValue(form, 'action', ['revoke', 'resend'] as const);
    if (action === 'resend') requireCredentialDeliveryAdapter();
    result = await mutateWorkspaceInvitation(getDatabasePool(), principal, {
      invitationId: string(form, 'invitationId'),
      action,
      expiresInHours: numberValue(form, 'expiresInHours') ?? 168,
      idempotencyKey: clientRequestId(form),
    }, tokenDerivationSecret(), abuseControlSecret());
  } catch (error) {
    fail('/settings/users', error);
  }
  let deliveryState: 'not_required' | 'delivered' | 'unavailable' | 'failed' = 'not_required';
  if (result.token && result.expiresAt && result.recipientEmail) {
    const delivery = await deliverOneTimeCredential({
      kind: 'workspace_invitation',
      recipient: result.recipientEmail,
      exchangeUrl: credentialExchangeUrl('workspace_invitation', result.token),
      expiresAt: result.expiresAt,
    });
    deliveryState = delivery.state;
  }
  complete(`/settings/users?saved=${encodeURIComponent(result.action)}&delivery=${encodeURIComponent(deliveryState)}`, clientRequestId(form));
}

export async function requestPasswordResetAction(form: FormData): Promise<void> {
  try {
    const result = await requestPasswordReset(getDatabasePool(), {
      email: string(form, 'email'),
      idempotencyKey: clientRequestId(form),
    }, tokenDerivationSecret(), await abuseContext());
    if (result.tokenHash && result.token && result.expiresAt) {
      const delivery = await deliverOneTimeCredential({
        kind: 'password_reset',
        recipient: string(form, 'email'),
        exchangeUrl: credentialExchangeUrl('password_reset', result.token),
        expiresAt: result.expiresAt,
      });
      await markPasswordResetDelivery(
        getDatabasePool(),
        result.tokenHash,
        delivery.state === 'delivered' ? 'delivered' : delivery.state === 'failed' ? 'failed' : 'unavailable',
        delivery.errorCode,
      );
    }
  } catch (error) {
    // Do not disclose account existence; rate-limit errors remain generic on this public surface.
    if (!(error instanceof Error)) fail('/forgot-password', error);
  }
  complete('/forgot-password?sent=1', clientRequestId(form));
}

export async function completePasswordResetAction(form: FormData): Promise<void> {
  try {
    const token = await getPasswordResetExchangeToken();
    if (!token) throw new RangeError('The password reset credential is missing or expired.');
    const password = string(form, 'password');
    if (password !== string(form, 'confirmPassword')) throw new RangeError('Passwords do not match.');
    await completePasswordReset(getDatabasePool(), {
      token,
      password,
      idempotencyKey: clientRequestId(form),
    }, await abuseContext());
  } catch (error) {
    fail('/reset-password', error);
  }
  await clearPasswordResetExchangeCookie();
  complete('/sign-in?reset=1', clientRequestId(form));
}

export async function requestJobCancellationAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  try {
    await requestJobCancellation(getDatabasePool(), principal, string(form, 'jobId'));
  } catch (error) {
    fail('/admin/jobs', error);
  }
  redirect('/admin/jobs?saved=cancel-requested');
}


export async function retryJobAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const requestId = clientRequestId(form);
  try {
    await retryJob(getDatabasePool(), principal, string(form, 'jobId'), requestId);
  } catch (error) {
    fail('/admin/jobs', error);
  }
  complete('/admin/jobs?saved=retried', requestId);
}


export async function enqueueStorageCleanupAction(form: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const requestId = clientRequestId(form);
  try {
    await enqueueStorageCleanup(getDatabasePool(), principal, {
      dryRun: string(form, 'dryRun') === 'true',
      retentionHours: numberValue(form, 'retentionHours') ?? 24,
      deletionLimit: numberValue(form, 'deletionLimit') ?? 100,
      scanLimit: numberValue(form, 'scanLimit') ?? 500,
      clientRequestId: requestId,
    });
  } catch (error) {
    fail('/admin/jobs', error);
  }
  complete('/admin/jobs?saved=cleanup-enqueued', requestId);
}
