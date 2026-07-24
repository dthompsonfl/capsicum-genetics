export const BREEDING_LEDGER_SCHEMA_VERSION = '3.1' as const;
export const BREEDING_LEDGER_EXPORT_TYPE = 'capsicum_breeding_ledger' as const;
export const DEVELOPMENT_RELEASE_IDENTIFIER = 'development-unversioned' as const;

export const BREEDING_LEDGER_SCIENTIFIC_PROFILE = {
  profileId: 'capsicum-breeding-ledger',
  profileVersion: '1.0',
  biologicalIdentity: 'workspace-scoped-material-identities',
  parentDirection: 'maternal-and-paternal-identities-preserved',
  probabilityAuthority: 'exact-rational-with-seeded-bounded-monte-carlo-fallback',
  evidenceAuthority: 'unknown-assumed-inferred-verified-conflicting-preserved',
  correctionAuthority: 'append-only-versioned-revisions',
  standardsMappings: {
    miappe: 'not_implemented',
    brapi: 'not_implemented',
    mcpd: 'not_implemented',
  },
} as const;

export interface BreedingLedgerManifestInput {
  exportJobId: string;
  workspaceId: string;
  requestedAt: string;
  snapshotAt: string;
  generatedAt: string;
  softwareReleaseIdentifier: string;
}

export interface BreedingLedgerManifest {
  schemaVersion: typeof BREEDING_LEDGER_SCHEMA_VERSION;
  exportType: typeof BREEDING_LEDGER_EXPORT_TYPE;
  exportJobId: string;
  workspaceId: string;
  requestedAt: string;
  snapshotAt: string;
  generatedAt: string;
  softwareReleaseIdentifier: string;
  scientificProfile: typeof BREEDING_LEDGER_SCIENTIFIC_PROFILE;
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}

function requireTimestamp(value: string, label: string): string {
  const normalized = requireText(value, label);
  const timestamp = new Date(normalized);
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError(`${label} must be an ISO-compatible timestamp.`);
  }
  return timestamp.toISOString();
}

function requireReleaseIdentifier(value: string): string {
  const normalized = requireText(value, 'softwareReleaseIdentifier');
  if (
    normalized !== DEVELOPMENT_RELEASE_IDENTIFIER
    && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(normalized)
  ) {
    throw new TypeError(
      'softwareReleaseIdentifier must be an immutable 40- or 64-character hexadecimal source revision.',
    );
  }
  return normalized;
}

export function createBreedingLedgerManifest(
  input: BreedingLedgerManifestInput,
): BreedingLedgerManifest {
  const requestedAt = requireTimestamp(input.requestedAt, 'requestedAt');
  const snapshotAt = requireTimestamp(input.snapshotAt, 'snapshotAt');
  const generatedAt = requireTimestamp(input.generatedAt, 'generatedAt');
  if (Date.parse(requestedAt) > Date.parse(snapshotAt)) {
    throw new TypeError('requestedAt cannot be later than snapshotAt.');
  }
  if (Date.parse(snapshotAt) > Date.parse(generatedAt)) {
    throw new TypeError('snapshotAt cannot be later than generatedAt.');
  }

  return {
    schemaVersion: BREEDING_LEDGER_SCHEMA_VERSION,
    exportType: BREEDING_LEDGER_EXPORT_TYPE,
    exportJobId: requireText(input.exportJobId, 'exportJobId'),
    workspaceId: requireText(input.workspaceId, 'workspaceId'),
    requestedAt,
    snapshotAt,
    generatedAt,
    softwareReleaseIdentifier: requireReleaseIdentifier(input.softwareReleaseIdentifier),
    scientificProfile: BREEDING_LEDGER_SCIENTIFIC_PROFILE,
  };
}
