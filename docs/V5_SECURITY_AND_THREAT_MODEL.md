# V5 Security and Threat Model

## Protected assets

- Authentication credentials, sessions, invitations, and recovery tokens.
- Workspace-scoped breeding identity and provenance.
- Genotype/assay evidence and observation histories.
- Scientific sources, passages, reviews, releases, and executable rules.
- Immutable simulation inputs/results and selection analyses.
- Quarantined media, accepted derivatives, measurements, and corrections.
- Durable jobs, audit events, exports, backups, and object-storage artifacts.

## Trust boundaries

1. Browser to Next.js server actions and APIs.
2. Web runtime to PostgreSQL under the restricted runtime role.
3. Worker to PostgreSQL through worker-only functions.
4. Web/worker to private object storage.
5. Worker to ClamAV and sandboxed Python verifier.
6. Optional research service to hosted AI gateway.
7. Migration/operations role to database and backup infrastructure.

## Principal threats and controls

| Threat | V5 control |
|---|---|
| Forged workspace context | Active-membership-bound RLS plus canonical transaction context. |
| Privilege escalation or terminal-state bypass | Restricted roles, canonical security-definer transitions, trigger guards, and authority verifier. |
| Duplicate submission | Stable browser intent IDs and database idempotency records. |
| Mutable scientific history | Immutable snapshots, append-only reviews/revisions, version checks, and content hashes. |
| Invalid stochastic premises | Contract rejection of duplicate/inconsistent loci and non-unit probability mass before enqueue. |
| Malicious upload | Pre-authority size/MIME/signature checks, quarantine, ClamAV, isolated decoders, pixel/frame bounds, and fail-closed state. |
| EXIF/privacy leakage | Orientation-aware decoding; derivative metadata stripping; private object access. |
| Decoder disagreement | Independent Sharp/Pillow parity with bounded tolerance; disagreement fails the job. |
| Cross-workspace artifact download | Authenticated workspace lookup, RLS, private cache headers, no-sniff, and bounded ranges. |
| Prompt injection/fabricated citation | Approved bounded evidence only, untrusted-data instructions, structured output, citation revalidation, and deterministic fallback. |
| AI authority escalation | No AI mutation tools; AI cannot approve, publish, promote, verify genotype, or override simulation results. |
| Secret leakage | Sanitized readiness, recursive log redaction, opaque hashed credentials, no raw tokens in URLs or browser state. |
| Worker lease loss | Heartbeats, lease ownership checks, cancellation, stale recovery, retries, and dead-lettering. |
| Export memory exhaustion | Keyset paging and file streaming under repeatable read. |

## Residual risks

- PostgreSQL grants, RLS, and triggers are source-reviewed but not runtime-proven.
- Sharp/Pillow/ClamAV behavior is not container-integration tested.
- PDF ingestion is disabled rather than weakly implemented.
- Hosted-provider data handling requires an approved operational privacy agreement before activation.
- Browser CSRF/CSP/accessibility behavior lacks production browser evidence.
- Dependency, SAST, secret, license, and container scans could not run without a frozen install/container runtime.

## Incident response priorities

1. Disable hosted AI and media acceptance independently if provider/scanner integrity is uncertain.
2. Revoke affected sessions and rotate scoped credentials.
3. Pause workers if lease or completion authority is suspect.
4. Preserve audit, job, and immutable-object evidence.
5. Restore into isolation and reconcile migrations, row counts, authoritative hashes, object manifests, and representative downloads.
