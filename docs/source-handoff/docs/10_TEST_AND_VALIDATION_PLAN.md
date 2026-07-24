# Test and Validation Plan

## Test layers

### Static quality

- formatting;
- linting;
- strict TypeScript;
- Python type checking and lint;
- R package/script checks;
- schema validation;
- dependency and secret scanning.

### Exact genetics

- golden crosses;
- property-based testing;
- probability sum and nonnegativity;
- genotype normalization invariance;
- parent-swap invariance for nuclear models;
- parent-direction differences for maternal models;
- linkage boundary tests;
- lethal/conception/survival separation;
- exact-versus-Monte-Carlo convergence;
- independent reference implementation parity.

### Database/domain

- constraints and transaction tests;
- migration tests;
- pedigree cycle prevention;
- authorization and workspace isolation;
- idempotency and concurrency;
- immutable release/run behavior;
- import reconciliation.

### Web application

- component tests;
- server action/API integration tests;
- Playwright end-to-end workflows;
- keyboard and screen-reader checks;
- automated accessibility scanning;
- responsive visual regression;
- slow/error/degraded-state tests;
- repeated-click and retry behavior.

### AI

- tool schema tests;
- mock-provider deterministic tests;
- citation-grounding evals;
- prompt-injection tests;
- cross-workspace leakage tests;
- abstention and unsupported-claim tests;
- provider-failure degradation.

### Vision

- image-quality fixtures;
- calibration tests;
- measurement comparison with physical ground truth;
- segmentation and classifier benchmarks;
- leakage audits;
- device/accession/environment holdouts;
- human correction workflows.

### Operations

- Docker Compose smoke test;
- clean installation;
- backup and restore drill;
- worker restart/retry behavior;
- migration failure behavior;
- observability and alert test;
- export/import round trip.

## Completion rule

No workstream may report completion only from unit tests. User-visible capabilities require integrated and end-to-end proof. Scientific prediction capabilities require model-specific validation and applicability evidence.
