# Execution memo

## Completed sweep

The next-sweep bundle was unpacked and its review/prompt preserved under `docs/`. The baseline repository was then refactored in place rather than replaced with a disconnected prototype.

Primary execution decisions:

- preserve the modular-monolith package boundaries and keep exact genetics pure;
- add a persistence-backed application-service layer rather than issue SQL from pages;
- use forward PostgreSQL migrations and separate migration/runtime/worker roles;
- derive principals from opaque sessions and active memberships;
- represent controlled crosses, selfing, and open pollination explicitly;
- make uncertainty, evidence basis, parent direction, and release provenance first-class simulation inputs;
- keep AI, phenotype, quantitative, genomic, and learned-vision outputs non-authoritative unless independently approved;
- make jobs/outbox durable at the database boundary;
- expose degraded/unavailable states instead of fabricating completeness.

## Validation boundary

The validation host provided Node 22, TypeScript, Python, and shell tooling but no registry access, PostgreSQL, Docker, R, or browser runtime. Source validation was completed; external runtime proof remains blocked and is documented without being waived.
