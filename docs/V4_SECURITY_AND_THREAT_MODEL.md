# V4 Security and Threat Model

## Protected assets

- User credentials, sessions, invitation/reset tokens, and workspace membership.
- Biological identity, inventory, pedigree, genotype, observations, and immutable simulation snapshots.
- Scientific source objects, passages, reviews, releases, and evidence graphs.
- Quarantined media, accepted captures, derivatives, and immutable export artifacts.
- Worker leases, job payloads, audit events, and operational secrets.

## Trust boundaries

1. Browser to Next.js mutation/API boundary.
2. Web runtime to restricted PostgreSQL runtime role.
3. Worker to worker-only security-definer functions and object storage.
4. Quarantine to isolated scanner/decoder boundary.
5. Optional hosted AI provider boundary.
6. Migration/role-provisioning authority separate from runtime authority.

## Primary threats and controls

| Threat | Control |
|---|---|
| Credential enumeration/timing | Constant-cost dummy scrypt path, bounded public errors. |
| Rolled-back failed-attempt counters | Independent committed abuse-control transactions. |
| Brute force | Durable keyed rate limits/lockout; explicit trusted proxy policy. |
| Session/token theft | Opaque hash-stored tokens, HttpOnly exchange state, revocation, no browser-visible one-time credentials. |
| CSRF/cross-origin mutation | Same-origin enforcement and secure cookie boundaries. |
| Forged workspace context | Active-membership-bound forced RLS and restricted roles. |
| Privilege escalation | Canonical permissions, owner immutability, DB transition functions, least-privilege grants. |
| Duplicate mutation | Stable client intent IDs and durable idempotency conflict detection. |
| Scientific self-approval | Independent reviewer constraints in service and PostgreSQL. |
| Terminal-state bypass | Database guards and canonical transition functions. |
| Malicious upload | Pre-buffer limits, signature/type/dimension checks, quarantine, ClamAV streaming, fail-closed acceptance. |
| Secret/payload leakage | Recursive log redaction, structured public errors, no raw job/outbox payload logs. |
| AI fabrication/exfiltration | Approved-evidence retrieval, citation revalidation, abstention, no scientific mutations, hosted AI disabled by default. |

## Residual risks

- PostgreSQL RLS and concurrency controls are source-reviewed but not runtime-proven here.
- Hostile image/PDF decoder fixtures and sandbox limits require integration proof.
- MFA and recovery codes are not implemented.
- Hosted AI privacy/cost/provider controls are not production-activated.
- Security scans and SBOM are not executed without a frozen install/container runtime.

## Incident response minimum

1. Revoke affected sessions and rotate secrets.
2. Suspend compromised memberships.
3. Preserve audit/job/object evidence.
4. Stop affected workers and quarantine relevant artifacts.
5. Restore into an isolated environment and reconcile hashes before reopening.
6. Record remediation and independent scientific review where evidence integrity may be affected.
