# Security, Privacy, and Operations

## Roles

Minimum roles:

- workspace owner;
- breeder;
- technician/observer;
- scientific curator;
- independent scientific reviewer;
- data analyst;
- read-only collaborator;
- system administrator.

## Separation of duties

- Claim extractor cannot self-approve a claim.
- Curator approval and independent review are separately attributable.
- AI cannot approve anything.
- Model trainer cannot promote a model without required evaluation and approval.
- Destructive administrative actions require elevated permission and audit.

## Security controls

- secure session cookies and CSRF protection;
- rate limiting and abuse controls;
- strict file validation and malware scanning path;
- signed object-store access;
- encrypted transport and encrypted backups;
- secret manager or environment-injected secrets, never database-stored plaintext;
- least-privilege database and object-store credentials;
- dependency and container scanning;
- security headers and CSP;
- complete audit trail for authoritative changes;
- cross-workspace isolation tests;
- AI prompt-injection and data-exfiltration defenses.

## Reliability controls

- idempotent mutations and jobs;
- transactional outbox for side effects;
- bounded retries with dead-letter/manual recovery;
- health/readiness checks;
- structured logs with correlation IDs;
- metrics for web, database, queue, workers, AI, vision, and simulations;
- trace context across job boundaries;
- backup schedules and restore drills;
- object integrity hashes;
- graceful degradation when AI or workers are unavailable.

## Data ownership

Users can export their breeding, phenotype, genotype, media metadata, and model-run records in documented nonproprietary formats. Account deletion must respect scientific audit and collaboration requirements and clearly distinguish deletion, anonymization, and retained shared records.
