# Source Pack Readiness

## Classification

- Project: Capsicum Breeding Intelligence Platform
- Execution mode: Greenfield product and scientific data platform
- Repository shape: Multi-app, multi-language monorepo
- Multi-agent execution: Supported and recommended
- Readiness state: **Conditionally ready**

## Evidence assessment

| Area | Present | Status |
|---|---:|---|
| Product outcome and users | Yes | Sufficient |
| Scientific evidence seed | Yes | 22 locus records, 22 claims, 30 sources; requires deeper allele-level curation |
| Scope and explicit non-goals | Yes | Binding |
| Architecture and package boundaries | Yes | Binding baseline |
| Web interface requirements | Yes | Binding |
| Data and provenance requirements | Yes | Binding |
| Simulation engine taxonomy | Yes | Exact engines ready; data-trained engines gated |
| AI role and prohibition boundaries | Yes | Binding |
| Vision workflow | Yes | Infrastructure ready; model performance gated by dataset |
| Security, permissions, and audit | Yes | Binding |
| Validation and release gates | Yes | Binding |
| Deployment and rollback | Yes | Local-first baseline defined |

## Conditions that do not block repository creation

The following must be implemented as configurable, feature-gated, or abstaining capabilities rather than treated as reasons to abandon the build:

- absent production AI provider credentials;
- absent S3 credentials in local development;
- absent learned phenotype models;
- absent genomic datasets;
- insufficient data for quantitative trait prediction;
- scientific claims awaiting review.

Use local emulators, mock providers, deterministic fixtures, feature flags, and explicit `not_validated` states.

## Conditions that block a production scientific claim

- no supporting evidence assertion;
- no approved rule version;
- parent genotype unknown but treated as verified;
- unsupported species or population applicability;
- missing pathogen isolate context for resistance claims;
- missing capture protocol or failed image-quality gate;
- no independent validation for learned or statistical models;
- generated results cannot be reproduced from stored inputs and versions.

## Required agent behavior

The coding agent may make implementation-level decisions that are consistent with this pack, but it may not weaken the scientific claim policy or silently fill data gaps. Any material conflict must be surfaced in the final report.
