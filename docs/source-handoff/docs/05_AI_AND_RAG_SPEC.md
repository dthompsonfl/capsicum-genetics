# AI and Research Retrieval Specification

## Principle

AI assists scientific work; it does not define biological truth. Deterministic and validated statistical engines produce calculations. Humans approve scientific claims and verified genotypes.

## AI use cases

- ingest public papers and user-provided research;
- extract candidate loci, alleles, variants, populations, methods, outcomes, and limitations into draft schemas;
- identify nomenclature aliases and conflicts;
- compare supporting and conflicting studies;
- explain simulations and uncertainty in plain language;
- help users plan observations and breeding workflows;
- convert dictated or typed notes into draft observations;
- explain image-analysis results and request human corrections;
- query the user's breeding records through authorized tools.

## Prohibited AI actions

- activating catalog rules;
- marking genotype calls verified;
- inventing citations, alleles, effect sizes, or inheritance models;
- calculating authoritative probabilities in prose instead of calling simulation tools;
- diagnosing disease conclusively from an image;
- bypassing permissions or revealing records from another workspace;
- training on private user data without an explicit governed workflow.

## Retrieval architecture

Use hybrid retrieval over:

- normalized publications and evidence assertions;
- exact source passages with page/section metadata;
- catalog aliases and nomenclature;
- user-authorized breeding records;
- model cards and system documentation.

Embeddings are a discovery index. The source of truth is the stored source passage and normalized record. Every cited answer must be resolvable to source text.

## Research ingestion pipeline

```text
file/identifier intake
-> malware/type validation
-> content hashing and versioning
-> parser/extractor
-> page and section segmentation
-> metadata resolution
-> candidate structured extraction
-> source-passage linking
-> nomenclature matching
-> conflict and duplicate detection
-> curator review
-> independent review
-> approved release
```

OCR is a fallback. Preserve the original file and extraction quality.

## Tool contracts

The bounded agent may call tools such as:

- `search_evidence`
- `read_source_passage`
- `get_catalog_entity`
- `compare_evidence`
- `run_exact_simulation`
- `run_advanced_simulation`
- `calculate_population_target`
- `get_material_record`
- `create_draft_observation`
- `create_draft_candidate_claim`
- `explain_vision_result`

Write tools require explicit permissions and human confirmation. All tool calls are recorded.

## AI answer schema

Every answer contains:

- answer text;
- answer class;
- citations;
- internal record references;
- tool calls and run IDs;
- confidence/uncertainty statement;
- missing-data list;
- prohibited inference warnings;
- actions requiring approval.

## Provider strategy

Use AI SDK 6 with provider abstraction. Support at least one hosted provider and a deterministic/mock provider for tests. Provider failures must degrade gracefully without breaking core breeding or simulation features.

## Evaluation

Maintain versioned eval suites for:

- citation correctness;
- unsupported claim rate;
- tool selection;
- schema adherence;
- nomenclature accuracy;
- answer completeness;
- cross-workspace data isolation;
- prompt-injection resistance;
- abstention behavior;
- regression across model/provider upgrades.

No AI feature is promoted solely because sample answers look persuasive.
