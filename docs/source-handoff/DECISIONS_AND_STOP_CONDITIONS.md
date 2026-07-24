# Decisions and Stop Conditions

## Immutable decisions

- The user interface is web-based and responsive.
- PostgreSQL is the authoritative relational store.
- The architecture is a modular monorepo with isolated Python/R workers, not a broad microservice estate.
- Exact genetics is implemented in a pure deterministic TypeScript package using rational probabilities.
- The supplied workbook is imported into normalized draft records; it is not the runtime schema or executable model.
- AI is an assistant and tool orchestrator, not a genetics authority.
- Vision outputs require protocol, quality, model, and human-review provenance.
- Quantitative/genomic capabilities are implemented as governed frameworks and remain unavailable until data/model gates pass.

## Stop and report instead of improvising when

- repository evidence or dependency compatibility prevents the approved architecture;
- a requested feature would require fabricating scientific accuracy;
- secure workspace isolation cannot be proven;
- an authoritative mutation cannot be audited;
- a schema migration risks irreversible data loss without a tested path;
- a worker contract cannot be validated across runtimes;
- required tests cannot meaningfully prove correctness;
- implementation would require weakening explicit nonclaims or approval gates.

## Do not stop merely because

- external AI credentials are absent;
- learned models or genomic datasets are absent;
- a scientific claim is still under review;
- object storage or email must use a local emulator;
- quantitative model accuracy cannot yet be validated.

In those cases, implement the platform, contracts, UI states, mocks, feature flags, and abstention behavior.
