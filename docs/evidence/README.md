# Release evidence policy

Files committed under `docs/` are design records, local validation summaries, and planning evidence. They are **not** durable production-release proof by themselves.

Authoritative release evidence is generated in CI by `scripts/ci/generate-release-evidence.mjs` after the frozen dependency install, builds, integration suites, browser tests, security scans, and restore drill. Each evidence bundle records:

- the exact Git commit SHA;
- GitHub repository, workflow run, and attempt identifiers;
- the Node and pnpm versions;
- a deterministic SHA-256 digest of the checked-out source tree;
- a sorted per-file checksum manifest;
- the evidence-generation timestamp and schema version.

CI uploads the resulting bundle as an immutable workflow artifact with bounded retention. A release process must retain that artifact with the release and compare its source-tree hash with the delivered repository. Local `docs/v*-evidence/` directories remain historical diagnostics and must never be cited as proof that an unexecuted production gate passed.
