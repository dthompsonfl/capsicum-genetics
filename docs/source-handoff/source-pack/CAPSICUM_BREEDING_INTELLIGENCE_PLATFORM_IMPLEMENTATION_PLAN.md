# Capsicum Breeding Intelligence Platform
## Implementation-Ready Product, Scientific, Data, Simulation, Vision, and AI Plan

**Plan version:** 1.0  
**Prepared:** 2026-07-22  
**Seed dataset:** `capsicum_genetics_evidence_catalog_v0_1.xlsx`  
**Readiness:** Conditionally ready for foundation and deterministic-engine implementation  

---

## 1. Executive decision

Build a **modular breeding-intelligence platform** with five authoritative systems:

1. **Scientific Evidence Catalog** — versioned loci, alleles, variants, assertions, applicability, citations, and approved prediction rules.
2. **Breeding Ledger** — germplasm, seed lots, plants, crosses, generations, progeny, environments, observations, and selections.
3. **Simulation Laboratory** — exact Mendelian, linked-locus, cytoplasmic, uncertain-genotype, stochastic breeding-program, quantitative, genomic, and genotype-by-environment simulations.
4. **Phenotype Laboratory** — standardized image capture, image quality control, segmentation, deterministic measurements, learned visual models, and human correction.
5. **AI Copilot** — evidence retrieval, paper extraction, data-entry assistance, visual explanation, breeding-plan assistance, and natural-language access to deterministic tools.

The core rule is:

> **AI may retrieve, structure, explain, and orchestrate. It may not invent genetic rules, calculate authoritative probabilities itself, activate scientific claims, or silently convert cultivar names into genotypes.**

Every result must be reproducible from:

```text
input material
+ genotype evidence
+ scientific catalog release
+ simulation/model version
+ parameters
+ software build
+ random seed, where applicable
= result artifact
```

---

## 2. Normalized product context

### 2.1 Problem being solved

Pepper breeders currently combine spreadsheets, handwritten plant labels, photographs, vendor descriptions, isolated publications, manual Punnett squares, and intuition. This makes it difficult to:

- preserve multi-generation pedigree and seed provenance;
- distinguish measured facts from assumptions;
- calculate complex crosses correctly;
- understand uncertainty caused by unknown parent genotypes;
- standardize phenotype observations;
- learn from historical breeding outcomes;
- compare predicted and observed segregation;
- use scientific literature without overgeneralizing it;
- develop defensible quantitative prediction models.

### 2.2 Primary users

- Individual pepper breeders and serious hobbyists.
- Plant geneticists and breeding researchers.
- Germplasm curators.
- Phenotyping technicians.
- Scientific catalog reviewers.
- Breeding-program managers.
- Data scientists developing validated models.

### 2.3 Success definition

The platform succeeds when a user can:

1. register the exact biological material being used;
2. record a controlled cross and all descendants;
3. calculate supported inheritance probabilities;
4. understand every assumption and evidence limitation;
5. determine a defensible grow-out population for a target;
6. capture repeatable phenotype measurements from images;
7. compare predictions against observed offspring;
8. improve future models from clean accumulated data;
9. reproduce any historical result after catalog or model changes;
10. export data through open, documented formats.

---

## 3. Current evidence asset assessment

The v0.1 workbook is a useful **research seed release**. It includes:

- 22 locus/model records;
- 22 atomic evidence claims;
- 30 scholarly or authoritative source records;
- evidence grades A and B;
- prediction eligibility and prohibited-claim fields;
- standards mappings;
- a research backlog;
- a data dictionary and change log.

### 3.1 What can be preserved directly

Preserve these concepts:

- stable catalog identifiers;
- canonical symbols and aliases;
- trait category and scope;
- species/population applicability;
- evidence grade and status;
- genotype-prediction eligibility;
- phenotype-prediction eligibility;
- supported and prohibited claims;
- required context;
- primary sources;
- release status and review priority.

### 3.2 What must change before production

The workbook must not become one wide production table. Normalize it into:

- loci;
- genes;
- alleles;
- sequence variants;
- assemblies and coordinates;
- markers and assays;
- evidence assertions;
- assertion-source relationships;
- applicability constraints;
- inheritance models;
- phenotype rules;
- release approvals;
- reviewer decisions;
- conflicts and supersessions.

### 3.3 Immediate catalog corrections

1. Upgrade the experiment metadata target from **MIAPPE 1.1 to MIAPPE 1.2**, while retaining compatibility mappings.
2. Keep BrAPI interoperability scoped to the endpoints the platform actually needs; BrAPI 2.1 remains the current stable release for new development.
3. Add an explicit reference assembly/version to every genomic coordinate.
4. Add exact allele and variant identifiers instead of relying on locus-level descriptions.
5. Add source-location citations, not just publication-level citations, where licensing permits.
6. Add conflict records when publications disagree.
7. Add independent reviewer approval before any claim becomes executable.
8. Add machine-readable rule schemas separated from prose claims.

---

## 4. Product claim policy

### 4.1 Allowed claims

The application may state:

- exact genotype segregation probabilities when parent states and model assumptions are sufficiently known;
- conditional phenotype probabilities when an approved model explicitly supports the allele combination and biological context;
- stochastic estimates with uncertainty when the simulation model and input distributions are explicit;
- data-driven predictions with validation metrics and applicability boundaries;
- observational comparisons and correlations;
- population sizes needed to reach a requested statistical confidence.

### 4.2 Prohibited claims

The application must not state:

- exact SHU from cultivar names or parental SHU alone;
- guaranteed recovery of a target offspring;
- universal red/yellow or hot/sweet dominance rules;
- disease resistance without pathogen context;
- environmental performance from a hard-coded humidity or temperature multiplier;
- a causal genotype from image appearance alone;
- a verified genotype from an AI-generated paper summary;
- gene-editing outcomes without allele-, background-, and evidence-specific support;
- that a model is accurate outside its validated population or environment.

### 4.3 Result labels

Every result receives one of these labels:

- **Exact — supported model**
- **Conditional — context-dependent**
- **Stochastic — simulation estimate**
- **Empirical — trained model prediction**
- **Exploratory — hypothesis only**
- **Unavailable — insufficient evidence**

---

## 5. Capability map

### 5.1 Scientific Evidence Catalog

Required capabilities:

- DOI, PMID, PMCID, URL, and accession metadata ingestion;
- publication deduplication;
- source-file hashing;
- versioned claim extraction;
- claim-to-source passage linkage;
- allele and nomenclature normalization;
- applicability modeling;
- conflicting evidence management;
- two-person approval for executable rules;
- catalog release and rollback;
- historical result reproduction.

### 5.2 Germplasm and Seed Bank

Required capabilities:

- taxon and species identity;
- cultivar or accession concept;
- provider/genebank identity;
- seed-lot and packet provenance;
- acquisition and storage details;
- generation and purity status;
- viability and germination records;
- material identifiers and QR labels;
- external identifiers such as GRIN accessions;
- attachments and source documents.

### 5.3 Plant and Pedigree Ledger

Required capabilities:

- individual plants;
- planting, transplanting, flowering, harvest, and death events;
- maternal and paternal parent identity;
- controlled pollination records;
- selfing, sib mating, backcrossing, open pollination, and unknown pollen events;
- seed harvests and progeny families;
- F1/F2/F3 and backcross designations as derived pedigree attributes, not user-only labels;
- contamination and parentage confidence;
- immutable lineage history with corrections recorded as superseding events.

### 5.4 Simulation Laboratory

Required engines are defined in Section 7.

### 5.5 Phenotype Laboratory

Required capabilities:

- capture protocols;
- image/video upload;
- calibration and quality control;
- segmentation and annotation;
- fruit, leaf, flower, and whole-plant measurements;
- symptom and damage observations;
- temporal comparison;
- human correction;
- model versioning and evaluation;
- linkage of every measurement to biological material, stage, environment, and protocol.

### 5.6 Breeding Planner

Required capabilities:

- target trait and genotype definitions;
- cross comparison;
- expected target frequency;
- practical population planning;
- multi-generation route planning;
- backcross and selfing strategies;
- selection constraints;
- predicted inbreeding and heterozygosity;
- resource estimates based on user-supplied germination, survival, and assay rates;
- selection decision logging.

### 5.7 AI Copilot

Required capabilities are defined in Section 8.

---

## 6. Scientific and computational model taxonomy

Every executable model must implement a common contract:

```ts
export type ResultAuthority =
  | 'exact'
  | 'conditional'
  | 'stochastic'
  | 'empirical'
  | 'exploratory'
  | 'unavailable';

export interface ModelApplicability {
  taxa: string[];
  populations?: string[];
  accessions?: string[];
  environments?: string[];
  pathogenContexts?: string[];
  requiredEvidence: EvidenceRequirement[];
  excludedContexts: string[];
}

export interface ScientificModelDescriptor {
  id: string;
  version: string;
  modelClass: string;
  authority: ResultAuthority;
  catalogReleaseId: string;
  sourceAssertionIds: string[];
  applicability: ModelApplicability;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  implementationDigest: string;
  status: 'draft' | 'validated' | 'approved' | 'retired';
}
```

The simulation service must reject requests that fail applicability requirements rather than guessing defaults.

---

## 7. Simulation engine plan

### 7.1 Engine A — Exact nuclear Mendelian inheritance

#### Purpose

Calculate exact allele and genotype distributions for one or more nuclear loci.

#### Required support

- diploid genotypes initially;
- multi-allelic loci;
- homozygous and heterozygous states;
- complete dominance;
- incomplete dominance;
- codominance;
- allele-specific phenotype rules;
- penetrance as a separate conditional layer;
- lethal or nonviable combinations;
- genotype and phenotype aggregation;
- rational probability arithmetic.

#### Core representation

```ts
export interface DiploidGenotype {
  locusId: string;
  alleleAId: string;
  alleleBId: string;
  phaseSetId?: string;
  evidenceState: 'verified' | 'inferred' | 'assumed' | 'unknown';
  confidence?: number;
}

export interface WeightedState<T> {
  value: T;
  numerator: bigint;
  denominator: bigint;
}
```

#### Algorithm

1. Validate both parents against the same locus definitions.
2. Produce unique gamete states and exact weights.
3. Cross weighted gametes.
4. Canonicalize unordered diploid allele pairs.
5. Aggregate identical offspring states.
6. apply viability rules;
7. renormalize only when the output explicitly distinguishes conception probability from surviving-offspring probability;
8. apply approved phenotype rules;
9. return exact fractions and display decimals.

#### Non-negotiable properties

- Probability mass equals exactly 1 before configured viability filtering.
- Allele capitalization has no semantic meaning.
- Unknown values are never replaced by reference or dominant alleles.
- Swapping parent order gives identical nuclear results unless another model adds maternal effects.

---

### 7.2 Engine B — Linked loci and recombination

#### Purpose

Model loci that do not independently assort.

#### Required inputs

- chromosome/reference map;
- ordered loci;
- phased parental haplotypes;
- recombination fraction or genetic distance;
- mapping-function selection if distances require conversion;
- source and population for the map estimate.

#### Supported modes

- explicit recombination fractions;
- Haldane conversion;
- Kosambi conversion;
- coupling and repulsion phase;
- multiple linked loci;
- no crossover interference in the initial exact implementation;
- later support for configurable interference and recombination landscapes.

#### Safety behavior

If phase is unknown, the engine must:

- calculate separate phase scenarios; or
- integrate across an explicit prior distribution;
- never silently assume coupling phase.

---

### 7.3 Engine C — Cytoplasmic and maternal inheritance

#### Purpose

Support CMS cytoplasm, organellar state, reciprocal-cross effects, and maternal transmission.

#### Required model structure

```ts
export interface CytoplasmicState {
  systemId: string;
  stateId: string;
  evidenceState: EvidenceState;
}

export interface ReciprocalCrossContext {
  maternalPlantId: string;
  paternalPlantId: string;
  maternalCytoplasm: CytoplasmicState;
  nuclearRestorerGenotypes: DiploidGenotype[];
  environmentContextId?: string;
}
```

The output must distinguish:

- cytoplasm inheritance;
- nuclear restorer segregation;
- fertility phenotype conditional on the defined CMS/Rf system;
- environmental or modifier uncertainty.

---

### 7.4 Engine D — Epistasis and rule graphs

#### Purpose

Evaluate outcomes that depend on combinations across loci, such as pigment pathways and pathway defects.

#### Rule format

Use a declarative, versioned decision graph rather than embedding biological rules directly in UI code.

```ts
export interface RulePredicate {
  locusId: string;
  operator: 'contains' | 'equals' | 'not_contains' | 'unknown';
  alleleIds?: string[];
  genotypeIds?: string[];
}

export interface PhenotypeRule {
  id: string;
  version: string;
  all?: RulePredicate[];
  any?: RulePredicate[];
  outcomePhenotypeId: string;
  penetrance?: number;
  authority: ResultAuthority;
  applicabilityId: string;
  sourceAssertionIds: string[];
}
```

Rules are executable only after scientific approval and test-fixture approval.

---

### 7.5 Engine E — Host–pathogen interaction simulation

#### Purpose

Represent resistance as an interaction, not a generic plant trait.

#### Inputs

- host genotype;
- resistance gene/allele;
- pathogen taxon;
- strain, isolate, race, or pathotype;
- effector profile where relevant;
- inoculation/assay context;
- environment constraints;
- evidence applicability.

#### Outputs

- supported resistant/susceptible/unknown outcome;
- confidence and evidence level;
- resistance-breaking warnings;
- missing-context list;
- source assertions.

This engine must return **unavailable** when pathogen context is absent.

---

### 7.6 Engine F — Uncertain and partially observed genotypes

#### Purpose

Integrate over multiple possible parent genotypes instead of pretending an inferred genotype is known.

#### Representation

```ts
export interface GenotypeHypothesis {
  genotype: DiploidGenotype[];
  probability: number;
  basis: 'marker' | 'pedigree' | 'phenotype' | 'user_prior' | 'model';
  evidenceIds: string[];
}
```

#### Algorithm

For parent hypothesis sets \(A\) and \(B\):

1. run each compatible genotype-pair cross;
2. weight the result by \(P(A_i)P(B_j)\);
3. aggregate outputs;
4. report uncertainty decomposition;
5. display how the answer changes under each major parent hypothesis.

The UI must separate **segregation uncertainty** from **parent-genotype uncertainty**.

---

### 7.7 Engine G — Population recovery and operational planning

For independent target recovery probability \(p\) and desired confidence \(c\):

\[
N = \left\lceil \frac{\ln(1-c)}{\ln(1-p)} \right\rceil
\]

Operational adjustments must remain separate:

```text
genetic target probability
× expected germination
× expected survival
× observation success
× assay success
= practical observed-target probability
```

The product must display both genetic and operational assumptions.

---

### 7.8 Engine H — Monte Carlo simulation

Use Monte Carlo only when exact enumeration exceeds configured complexity limits or when model inputs are continuous distributions.

Required controls:

- deterministic random seed;
- pseudo-random generator identity;
- iteration count;
- convergence diagnostics;
- confidence intervals;
- exact-versus-simulated reason;
- reproducible run artifact;
- adaptive stopping only under a documented criterion.

The engine must be compared against exact results for tractable cases.

---

### 7.9 Engine I — Forward breeding-program simulation

Use an isolated **AlphaSimR worker** for research-grade stochastic breeding-program simulation rather than rebuilding sequence-level population simulation in TypeScript.

Supported future use cases:

- founder haplotype generation;
- crossing programs;
- selfing and doubled haploid strategies where applicable;
- selection cycles;
- genomic selection;
- QTL effect simulation;
- dominance and epistasis;
- backcross programs;
- resource-constrained breeding-program comparisons.

Architecture rule:

- the web platform owns authorization, requests, provenance, and result storage;
- the R worker owns an explicitly versioned simulation implementation;
- job inputs and outputs use versioned JSON schemas;
- the exact engine remains independent of AlphaSimR.

AlphaSimR is appropriate for stochastic breeding-program research, not as a substitute for the evidence-gated exact calculator.

---

### 7.10 Engine J — Quantitative trait models

Do not implement arbitrary additive uppercase-allele scores.

Supported model families after data prerequisites are met:

- linear mixed models;
- family and pedigree BLUP;
- GBLUP;
- Bayesian marker regression;
- multi-trait models;
- multi-environment models;
- ordinal or threshold models;
- survival/time-to-event models;
- calibrated machine-learning regressors when justified.

Every model requires:

- a frozen training dataset version;
- feature definitions;
- missing-data policy;
- population description;
- environment description;
- validation splits that prevent family leakage;
- error and calibration metrics;
- uncertainty intervals;
- model card;
- retirement policy.

No model should be promoted from exploratory to advisory until it passes family-held-out and environment-held-out evaluation where applicable.

---

### 7.11 Engine K — Genotype-by-environment models

Do not use universal environmental multipliers.

Model environmental effects through:

- explicit environment observations;
- fixed and random effects;
- reaction norms;
- multi-environment trial structure;
- genotype-by-environment interaction terms;
- environmental covariates such as temperature, vapor-pressure deficit, irrigation, light, substrate, fertility, and disease pressure.

Predictions outside the training envelope must be flagged as extrapolation.

---

### 7.12 Engine L — Selection optimization

Support multi-trait selection through:

- hard constraints;
- weighted selection indices;
- economic or breeder-defined weights;
- Pareto frontiers;
- diversity/inbreeding constraints;
- target genotype constraints;
- resource limitations.

The system should show tradeoffs rather than collapse every goal into one unexplained score.

---

### 7.13 Engine M — In-silico genotype manipulation

The application may allow users to create a **virtual genotype scenario** by:

- replacing an allele;
- knocking out a modeled locus;
- adding a documented allele;
- changing haplotype phase;
- changing cytoplasmic state;
- introducing a hypothetical marker state.

This is a simulation workspace only. It must:

- preserve the original genotype;
- label the scenario as virtual;
- show whether the biological outcome is supported or hypothetical;
- prohibit conversion of virtual scenarios into verified plant records;
- record all assumptions and rule versions.

Actual gene-editing protocol design is outside the MVP and requires separate biosafety, regulatory, and laboratory governance.

---

## 8. AI architecture

### 8.1 AI role boundaries

AI may:

- retrieve relevant catalog records and papers;
- extract structured candidate claims;
- summarize evidence and conflicts;
- translate user goals into simulation inputs;
- call deterministic simulation tools;
- explain results in accessible language;
- identify missing evidence;
- assist with image annotation;
- describe visible features;
- propose observation records for human approval;
- generate experimental checklists;
- help compare breeding strategies.

AI may not:

- directly write approved scientific rules;
- mark genotypes as verified;
- decide pathogen resistance from an unlabeled photo;
- calculate authoritative genetic probabilities in prose;
- invent citations;
- activate a model;
- overwrite raw observations;
- hide uncertainty;
- infer cultivar genotype without evidence.

### 8.2 AI orchestration

Use a provider-agnostic AI layer with schema-validated tools. AI SDK 6 supports provider abstraction, tool calling, structured output, and reusable tool-loop agents. The application should use bounded workflows rather than an unconstrained autonomous agent.

Recommended agents:

1. **Research Intake Agent**
2. **Evidence Extraction Agent**
3. **Catalog Review Assistant**
4. **Breeding Planner Assistant**
5. **Phenotype Review Assistant**
6. **Data Quality Assistant**

Each agent receives only the tools and data required for its role.

### 8.3 Tool contracts

```ts
export const aiTools = {
  searchCatalog,
  retrieveSourcePassages,
  compareEvidenceAssertions,
  validateSimulationRequest,
  runExactSimulation,
  submitStochasticSimulation,
  inspectPedigree,
  queryObservations,
  analyzeImageAsset,
  proposeObservationDraft,
  createReviewTask,
};
```

Write tools must create drafts or review tasks, never silently commit authoritative scientific state.

### 8.4 Research ingestion workflow

```text
identifier or uploaded paper
→ metadata resolution
→ source hashing and deduplication
→ text/figure extraction
→ section-aware chunking
→ candidate claim extraction using structured output
→ citation-passage verification
→ nomenclature normalization
→ applicability extraction
→ conflict search
→ human review
→ independent approval
→ catalog release
```

Candidate claim schema:

```ts
export interface CandidateEvidenceAssertion {
  subjectType: 'gene' | 'locus' | 'allele' | 'variant' | 'marker' | 'trait';
  subjectIdentifier: string;
  predicate: string;
  object: string;
  species: string[];
  accessions: string[];
  populationDescription?: string;
  experimentalMethod: string[];
  inheritanceModel?: string;
  conditions: string[];
  exclusions: string[];
  sourcePassages: SourcePassageReference[];
  extractionConfidence: number;
  unresolvedTerms: string[];
}
```

### 8.5 Retrieval architecture

Use hybrid retrieval:

- relational filters for loci, taxa, years, evidence grades, and statuses;
- full-text search for exact scientific terminology;
- embeddings for semantic discovery;
- citation passage retrieval;
- reranking;
- result-level source attribution.

Embeddings are a discovery index, not the source of truth. The authoritative facts remain normalized database records and source passages.

### 8.6 AI answer contract

Every scientific AI response must include:

- direct answer;
- result authority label;
- catalog release;
- model or tool used;
- assumptions;
- missing evidence;
- source citations;
- abstention when unsupported.

### 8.7 AI evaluation

Maintain versioned eval suites for:

- citation correctness;
- unsupported-claim rate;
- allele-nomenclature accuracy;
- source-passage entailment;
- correct abstention;
- tool-selection accuracy;
- structured-output validity;
- prompt-injection resistance;
- cross-request data isolation;
- image-description grounding;
- user correction acceptance.

Model changes must not deploy without evaluation against frozen cases.

---

## 9. Phenotype vision system

### 9.1 Principle

Use a three-layer pipeline:

1. **Deterministic image processing** for calibration and measurements.
2. **Task-specific computer vision** for segmentation, detection, classification, and regression.
3. **Multimodal LLM** for explanation, workflow assistance, and structured observation drafts.

The multimodal LLM must not be the primary measurement instrument.

### 9.2 Capture protocol

Every quantitative capture session should record:

- camera/device;
- lens and focal settings where available;
- image resolution;
- distance and angle;
- lighting setup;
- background;
- color calibration card;
- physical scale marker;
- plant/fruit QR identity;
- developmental stage;
- date and time;
- operator;
- environment;
- protocol version.

For fruit phenotyping, support:

- top, side, and longitudinal views;
- whole fruit and cut fruit;
- standardized orientation;
- optional rotating-platform video;
- optional depth or multi-view capture.

### 9.3 Image quality gate

Before analysis, calculate:

- blur/focus score;
- exposure clipping;
- white-balance/calibration availability;
- scale-marker detection;
- object occlusion;
- framing completeness;
- duplicate/near-duplicate detection;
- image integrity and metadata consistency.

Failed images should be rejected or marked nonquantitative.

### 9.4 Segmentation strategy

Use:

- PlantCV for reproducible, plant-focused image-analysis pipelines;
- conventional thresholding and color-space methods where reliable;
- SAM 2 as an annotation and interactive segmentation accelerator;
- task-specific fine-tuned instance segmentation for production datasets;
- manual correction tools;
- versioned masks and annotations.

Do not deploy zero-shot segmentation as an unquestioned production measurement source. Every task-specific model needs benchmark data.

### 9.5 Deterministic measurements

Initial fruit measurements:

- bounding width and height;
- projected area;
- perimeter;
- aspect ratio;
- circularity;
- solidity;
- convex hull;
- curvature descriptors;
- shoulder and apex shape landmarks;
- centroid;
- color distribution in calibrated spaces;
- stripe/pattern area when segmentation is validated;
- wall thickness from standardized cut-fruit imagery;
- seed count only after dedicated validation.

Initial plant measurements:

- projected canopy area;
- plant height with scale;
- width;
- growth rate across time;
- color/stress indices;
- branching landmarks where visible;
- fruit count with confidence and occlusion warnings.

### 9.6 Visual phenotype classifiers

Candidate tasks:

- fruit maturity stage;
- color class;
- anthocyanin pattern;
- fruit-shape category;
- visible disease/symptom category;
- nutrient/stress symptom candidates;
- leaf damage severity;
- flower/pod state;
- phenotype quality-control flags.

Each task needs its own label ontology, training dataset, and evaluation. Do not train one general “pepper phenotype model” and treat every output equally.

### 9.7 Human-in-the-loop and active learning

Workflow:

```text
model prediction
→ confidence/uncertainty
→ human accept, correct, or reject
→ correction stored separately from prediction
→ curated training-candidate queue
→ dataset review and snapshot
→ retraining
→ independent validation
→ model promotion
```

Low-confidence or out-of-distribution images must be routed for review.

### 9.8 Vision evaluation

Measure:

- segmentation IoU and boundary error;
- object detection precision/recall;
- measurement MAE and relative error against manual measurements;
- classification precision, recall, F1, and calibration;
- device-held-out performance;
- accession-held-out performance;
- environment/season-held-out performance;
- error by fruit color, size, occlusion, and background;
- inter-observer disagreement for labels.

The production UI must display model uncertainty and allow direct correction.

---

## 10. Data architecture

### 10.1 Core storage

Use:

- **PostgreSQL** for authoritative relational data;
- PostgreSQL full-text search and vector extension for hybrid retrieval;
- S3-compatible object storage for images, PDFs, model artifacts, and exports;
- immutable checksums for imported and generated artifacts;
- optional time-series partitions for high-volume sensor observations;
- append-only audit events for authoritative changes.

### 10.2 Standards

- MIAPPE 1.2 for phenotyping experiment metadata.
- MCPD for germplasm passport concepts.
- Crop Ontology trait-method-scale pattern for observation variables.
- BrAPI 2.1-compatible identifiers and selected exchange endpoints.
- GA4GH VRS-inspired variation representation where it fits plant sequence variants, with explicit assembly/version handling.
- VCF import/export for genotype variants where appropriate.

### 10.3 Major schema domains

#### Identity and workspaces

```text
user
workspace
workspace_member
role
permission
api_key
audit_event
```

#### Scientific catalog

```text
catalog_release
publication
source_artifact
source_passage
gene
locus
locus_alias
allele
sequence_variant
reference_assembly
sequence_reference
marker
marker_assay
evidence_assertion
assertion_source
applicability_constraint
inheritance_model
phenotype_rule
rule_review
conflict_record
supersession
```

#### Germplasm and breeding

```text
taxon
germplasm_accession
cultivar_concept
source_organization
seed_lot
seed_packet
planting_batch
plant
cross
cross_parent
pollination_event
seed_harvest
progeny_family
pedigree_edge
selection_goal
selection_decision
material_label
```

#### Genotyping

```text
biological_sample
sample_collection
genotyping_run
genotype_call
haplotype_call
call_evidence
quality_metric
variant_import
```

#### Experiments and observations

```text
investigation
study
location
environment
experimental_design
block
plot
observation_unit
observation_variable
measurement_protocol
observation
observation_revision
treatment
environment_event
```

#### Media and vision

```text
media_asset
capture_session
capture_protocol
calibration_target
image_quality_result
annotation_set
annotation
segmentation_mask
vision_model
vision_model_version
vision_inference
phenotype_measurement
human_review
training_dataset_snapshot
```

#### Simulation and models

```text
simulation_model
simulation_model_version
simulation_request
simulation_run
simulation_input_snapshot
simulation_result
simulation_artifact
model_card
training_dataset
model_evaluation
model_promotion
```

#### AI and research

```text
ai_provider_config
ai_model_config
ai_agent_definition
ai_tool_run
ai_response
research_ingestion_job
candidate_assertion
citation_verification
eval_suite
eval_case
eval_run
```

### 10.4 Authoritative state and immutability

- Raw observations and imported documents are immutable.
- Corrections create superseding records.
- Catalog releases are immutable.
- Simulation input snapshots are immutable.
- Model versions are immutable.
- Results retain the exact model and catalog versions.
- Deletion of scientific records should generally be logical retirement, not physical deletion.

---

## 11. Application architecture

### 11.1 Recommended topology

Use a modular monorepo:

```text
apps/
  web/                   # Next.js user and admin application
  api/                   # optional public/API deployment boundary later

workers/
  scientific-python/     # image analysis, statistics, ML inference/training jobs
  breeding-r/            # AlphaSimR and R statistical workflows

packages/
  genetics-core/         # exact TypeScript engine
  genetics-rules/        # rule schemas and evaluator
  scientific-catalog/    # catalog domain
  breeding-domain/       # plants, crosses, pedigree, seed lots
  phenotype-domain/      # studies, observations, protocols
  simulation-contracts/  # versioned worker request/response schemas
  ai-orchestration/      # agents, tools, policies, eval integration
  database/              # schema, migrations, repositories
  auth/                  # identity, permission checks, workspace scope
  observability/         # logs, traces, metrics
  ui/                    # design system
  test-fixtures/         # golden crosses and scientific fixtures

docs/
  scientific-governance/
  architecture/
  model-cards/
  protocols/
  validation/
```

### 11.2 Runtime boundaries

- Next.js handles UI, server-rendered workflows, authorization, orchestration, and synchronous exact simulations.
- Exact genetics stays in TypeScript and runs synchronously for normal problem sizes.
- Long-running image, statistical, stochastic, and training jobs run in workers.
- A PostgreSQL-backed job system is sufficient initially; do not add Kafka or Kubernetes without demonstrated need.
- Object storage holds large artifacts.
- Workers use signed artifact access and scoped job credentials.

### 11.3 Why not a pure Next.js application

A pure JavaScript application would make scientific Python and R interoperability unnecessarily difficult. The proposed topology preserves one product and one authoritative database while allowing the best scientific tooling for each workload.

### 11.4 Why not microservices everywhere

Independent business microservices would create unnecessary distributed-system failure modes. Workers are computational boundaries, not separate products. Domain logic remains in shared, explicit packages and contracts.

---

## 12. API and contract strategy

### 12.1 Internal API rules

- Validate every request with versioned schemas.
- Require workspace and permission context.
- Use idempotency keys for mutations and job submissions.
- Return typed error codes.
- Preserve immutable input snapshots.
- Never allow UI code to directly write scientific approval states.

### 12.2 Core endpoints/actions

```text
/catalog/releases
/catalog/loci
/catalog/alleles
/catalog/assertions
/catalog/reviews
/germplasm
/seed-lots
/plants
/crosses
/progeny-families
/genotypes
/studies
/observations
/media
/vision/inferences
/simulations/exact
/simulations/jobs
/models
/ai/research
/ai/copilot
```

### 12.3 Public interoperability

Implement BrAPI selectively after the internal model stabilizes. Begin with use cases such as:

- germplasm lookup;
- studies and observation units;
- observation variables;
- observations;
- samples and selected genotyping records.

Do not claim blanket BrAPI compliance until tested with official validation tools.

---

## 13. User experience and information architecture

### 13.1 Main navigation

```text
Home
Breeding Programs
Germplasm
Seed Bank
Plants
Crosses
Families
Simulation Lab
Phenotype Lab
Experiments
Genotypes
Scientific Catalog
AI Research
Models
Reports
Administration
```

### 13.2 Core cross-planning workflow

1. Select exact parent plants or seed-lot assumptions.
2. Review parent identity and genotype evidence.
3. Choose a simulation type.
4. Choose loci/traits and target outcomes.
5. Review applicability and blocked models.
6. Run exact or submit stochastic simulation.
7. View genotype and phenotype distributions.
8. View uncertainty decomposition.
9. Calculate practical grow-out population.
10. Save as a breeding project.
11. Generate labels and observation protocol.
12. Compare actual offspring against the prediction.

### 13.3 Result presentation

Every result page must show:

- authority label;
- parent identity;
- exact genotype evidence status;
- model and catalog version;
- assumptions;
- excluded factors;
- probability distribution;
- target population planning;
- sources;
- reproducibility metadata;
- “what would change this result” explanation.

### 13.4 Nontechnical operator design

- Plain-language labels with expandable scientific detail.
- Guided workflows rather than blank forms.
- QR scanning for plant and seed identity.
- Image capture instructions in the camera flow.
- Automatic validation before submission.
- No raw allele-string entry unless expert mode is enabled.
- Clear separation of observed, assumed, predicted, and verified states.

---

## 14. Security, privacy, and scientific integrity

### 14.1 Roles

Minimum roles:

- Workspace Owner.
- Breeder.
- Observer/Technician.
- Data Analyst.
- Scientific Curator.
- Scientific Reviewer.
- Model Reviewer.
- Read-only Collaborator.

### 14.2 Separation of duties

- The person extracting a claim cannot be the sole approver.
- The person training a model cannot solely promote it.
- AI cannot approve claims or models.
- Catalog release requires explicit approval records.
- Production model promotion requires evaluation evidence.

### 14.3 Data controls

- Workspace scoping on every record.
- Row-level security or equivalent enforcement.
- Signed object access.
- Encryption in transit and at rest.
- Secrets outside general application configuration tables.
- Audit log for authoritative changes.
- Backup and restore testing.
- Data-export and deletion workflows that preserve required scientific provenance.

### 14.4 AI-specific controls

- Provider configuration per workspace.
- Explicit data-retention policy.
- Sensitive-data redaction where needed.
- Prompt-injection-resistant retrieval.
- Tool allowlists.
- Maximum loop and cost budgets.
- Human approval for writes.
- Trace retention and evaluation.

---

## 15. Observability and operability

Track:

- request and job IDs;
- simulation model/version;
- catalog release;
- execution duration;
- state-space size;
- exact versus Monte Carlo path;
- random seed;
- worker and dependency versions;
- AI provider/model;
- AI token and cost usage;
- citation retrieval coverage;
- vision model/version;
- image-quality rejection reasons;
- model confidence and corrections;
- job retries and failure causes.

Operational dashboards should cover:

- failed scientific imports;
- pending reviews;
- simulation failures;
- worker queues;
- image-analysis failures;
- AI evaluation regression;
- model drift;
- backup health;
- storage growth;
- catalog/model release status.

---

## 16. Testing and validation strategy

### 16.1 Exact engine tests

Golden cases:

- `AA × AA`;
- `AA × aa`;
- `Aa × Aa`;
- multi-allelic crosses;
- incomplete dominance;
- codominance;
- penetrance;
- lethal combinations;
- linked loci at `r = 0`, intermediate `r`, and `r = 0.5`;
- coupling and repulsion;
- unknown phase;
- cytoplasmic inheritance;
- CMS plus restorer segregation;
- uncertain parent genotype distributions;
- host–pathogen conditional rules.

Property-based invariants:

- nonnegative probabilities;
- exact probability mass;
- order-invariant genotype normalization;
- parent-swap invariance for nuclear-only models;
- expected parent-direction difference for maternal models;
- exact/Monte Carlo convergence;
- no duplicate homozygous gamete states;
- deterministic reproducibility.

### 16.2 Cross-implementation verification

Implement an independent reference calculator in Python or R for test purposes. Compare randomly generated tractable cases against the TypeScript engine. This reduces the risk of testing one implementation with assumptions copied from itself.

### 16.3 Scientific catalog tests

- no executable rule without approved assertions;
- no active assertion without source linkage;
- no genomic coordinate without assembly/version;
- no disease rule without pathogen context schema;
- no model without applicability constraints;
- historical runs remain reproducible after retirement;
- conflict records prevent unsupported promotion;
- AI-created candidates cannot become approved automatically.

### 16.4 Breeding ledger tests

- no pedigree cycles;
- a plant has at most one biological origin event;
- maternal and paternal roles are explicit;
- selfing is represented correctly;
- seed harvests link to maternal material and pollination context;
- corrections preserve prior data;
- QR identifiers resolve uniquely;
- cross contamination can downgrade confidence without rewriting history.

### 16.5 Vision tests

- fixed benchmark images;
- capture-quality edge cases;
- color-card calibration;
- scale conversion;
- segmentation and boundary metrics;
- measurement comparison to physical instruments;
- device and environment holdouts;
- out-of-distribution detection;
- human correction workflow;
- model-version reproducibility.

### 16.6 AI evaluation

- answer-source entailment;
- citation precision;
- unsupported-claim rate;
- correct use of simulation tools;
- failure to fabricate genotype assumptions;
- abstention quality;
- prompt injection;
- cross-workspace isolation;
- structured schema validity;
- scientific terminology normalization;
- cost and latency budgets.

### 16.7 Statistical-model validation

- family-held-out validation;
- parent-held-out validation;
- environment-held-out validation;
- temporal holdout;
- external validation when possible;
- prediction-interval coverage;
- calibration;
- bias by accession, species, color, size, environment, and device;
- leakage audit.

---

## 17. Delivery program

### Phase 0 — Scientific governance and catalog hardening

Deliverables:

- product claim policy;
- evidence grade definitions;
- review and approval workflow;
- MIAPPE 1.2 mapping;
- normalized catalog schema;
- allele/variant representation;
- import tool for v0.1 workbook;
- catalog validation rules;
- first independent scientific review queue.

Exit gate:

- the v0.1 workbook imports without information loss;
- no wide spreadsheet row is treated as an executable rule;
- all P0 records have explicit next-review states;
- approved and draft scientific states are enforced separately.

### Phase 1 — Platform foundation

Deliverables:

- monorepo;
- identity/workspaces/roles;
- PostgreSQL schema and migrations;
- object storage;
- audit trail;
- job framework;
- observability;
- backup/restore;
- CI validation ladder.

Exit gate:

- authoritative records are scoped, auditable, backed up, and restorable.

### Phase 2 — Exact genetics MVP

Deliverables:

- exact rational arithmetic;
- nuclear Mendelian engine;
- multi-allelic support;
- phenotype rule evaluator;
- unknown genotype support;
- target population calculation;
- model and run provenance;
- golden and property-based tests.

Exit gate:

- independent reference-engine parity passes;
- exact runs are reproducible;
- unsupported models abstain.

### Phase 3 — Breeding ledger MVP

Deliverables:

- germplasm and seed lots;
- plants and labels;
- crosses and pollination events;
- seed harvests and progeny;
- pedigree;
- selection goals and decisions;
- basic observations;
- CSV and structured export.

Exit gate:

- a complete real breeding cycle can be recorded without a separate spreadsheet.

### Phase 4 — Advanced inheritance

Deliverables:

- linkage and phase;
- cytoplasmic inheritance;
- epistasis rule graphs;
- host–pathogen contexts;
- uncertain-genotype marginalization;
- Monte Carlo fallback.

Exit gate:

- advanced engines pass the defined invariant and fixture suite.

### Phase 5 — AI research and breeding copilot

Deliverables:

- paper ingestion;
- structured candidate claim extraction;
- source-passage citations;
- nomenclature normalization;
- evidence comparison;
- bounded breeding agent with simulation tools;
- eval suite;
- human approval controls.

Exit gate:

- AI cannot activate rules or verified genotypes;
- citation and unsupported-claim thresholds pass;
- every answer exposes model/tool provenance.

### Phase 6 — Phenotype capture and deterministic vision

Deliverables:

- capture protocol system;
- camera workflow;
- image quality gate;
- color and scale calibration;
- PlantCV worker integration;
- fruit segmentation and measurements;
- human correction;
- benchmark dataset.

Exit gate:

- measurements meet predefined accuracy thresholds against physical measurements for the validated capture protocol.

### Phase 7 — Learned visual models

Deliverables:

- annotation management;
- SAM 2-assisted labeling;
- task-specific models;
- active learning;
- uncertainty and OOD handling;
- model registry and promotion gates;
- multimodal explanation.

Exit gate:

- each promoted task passes accession-, device-, and environment-aware validation.

### Phase 8 — Breeding-program simulation

Deliverables:

- R worker;
- AlphaSimR job schemas;
- founder and breeding-program templates;
- selection-cycle comparison;
- stochastic run artifacts;
- reproducibility and cost limits.

Exit gate:

- benchmark simulations reproduce documented reference outputs and are isolated from exact calculator authority.

### Phase 9 — Quantitative and genomic prediction

Prerequisites:

- sufficient standardized phenotype observations;
- reliable genotype data;
- frozen training datasets;
- data-quality thresholds;
- independent statistical review.

Deliverables:

- mixed models;
- G×E models;
- genomic prediction;
- selection indices;
- model cards;
- family/environment validation;
- drift monitoring.

Exit gate:

- no model is promoted without applicability, calibration, and external or strong holdout evidence.

### Phase 10 — Interoperability and collaboration

Deliverables:

- selected BrAPI 2.1 endpoints;
- MIAPPE 1.2 exports;
- MCPD-compatible germplasm export;
- VCF/variant exports;
- collaboration and controlled sharing;
- public catalog browsing if desired.

Exit gate:

- export/import round trips preserve identifiers, provenance, units, and model versions.

---

## 18. Parallel workstreams and dependency order

### Workstream A — Scientific catalog

Owns:

- evidence model;
- allele curation;
- applicability;
- rule approval;
- catalog releases.

Cannot activate rules without review.

### Workstream B — Genetics engine

Owns:

- exact algorithms;
- probability types;
- simulation contracts;
- property tests.

Depends on stable rule and allele schemas, not on completed catalog content.

### Workstream C — Breeding and phenotype data

Owns:

- germplasm;
- crosses;
- pedigree;
- experiments;
- observations.

Depends on core identity and database foundations.

### Workstream D — Vision

Owns:

- capture protocols;
- image workers;
- annotations;
- measurements;
- vision models.

Depends on material identity and observation schemas.

### Workstream E — AI

Owns:

- ingestion;
- RAG;
- agent tools;
- evals;
- AI governance.

Depends on catalog search and simulation APIs. It must not define core science contracts.

### Workstream F — Platform and operations

Owns:

- auth;
- permissions;
- job execution;
- storage;
- observability;
- deployment;
- backups.

Starts first and supports all other workstreams.

### Merge/dependency order

```text
platform contracts
→ scientific and breeding schemas
→ exact engine contracts
→ core workflows
→ advanced simulations
→ AI tool integration
→ deterministic vision
→ learned models
→ quantitative/genomic models
```

---

## 19. Deployment and local-first operation

Initial deployment profile:

```text
web application
PostgreSQL
S3-compatible object storage
job worker: Python
job worker: R
database backup job
object-storage backup job
reverse proxy/TLS
```

Use Docker Compose for local and single-server operation. Maintain cloud-portable contracts, but do not require Kubernetes.

Required operational procedures:

- database backup and restore drill;
- object artifact restore drill;
- catalog rollback;
- model rollback;
- worker-version pinning;
- migration rollback or forward-repair plan;
- disaster-recovery documentation;
- export of all user scientific data.

---

## 20. Acceptance criteria for the first real release

The first public-quality release must:

1. Import the v0.1 catalog into normalized records.
2. Preserve source and prohibited-claim provenance.
3. Register germplasm, seed lots, plants, crosses, seed harvests, and progeny.
4. Calculate exact single- and multi-locus inheritance for approved models.
5. Represent unknown and assumed genotype states.
6. Preserve parent direction.
7. Calculate practical target-recovery population sizes.
8. Store immutable simulation snapshots.
9. Display evidence, assumptions, authority, and catalog/model versions.
10. Reject unsupported phenotype predictions.
11. Provide full audit history.
12. Export the breeding ledger.
13. Pass property-based and independent parity tests.
14. Complete backup restoration testing.
15. Validate at least one supported model against real observed progeny.

AI and learned vision do not need to block the first release. They should be added only through the defined evaluation gates.

---

## 21. Rejected alternatives

### Spreadsheet as the production database

Rejected because it cannot reliably enforce relations, versions, approvals, applicability, audit history, or concurrency.

### LLM-first genetics calculator

Rejected because language models are nondeterministic and may invent biological rules. AI must call authoritative tools.

### One universal neural model for phenotype prediction

Rejected because different tasks have different labels, capture requirements, error modes, and validation needs.

### Exact SHU prediction in the MVP

Rejected because current input data cannot support it.

### JavaScript-only scientific stack

Rejected because it would discard established Python and R scientific ecosystems.

### Full microservice architecture

Rejected because it creates unnecessary operational complexity. Isolated scientific workers are sufficient.

### Immediate implementation of all BrAPI endpoints

Rejected because BrAPI is modular and should be implemented around concrete interoperability use cases.

---

## 22. Risks and controls

| Risk | Severity | Control |
|---|---:|---|
| Scientific overclaiming | Critical | Applicability gates, prohibited claims, approval workflow, result authority labels |
| Incorrect allele nomenclature | High | Assembly/version normalization, aliases, curator review, conflict records |
| AI hallucinated claims | Critical | Passage citations, structured extraction, human approval, eval suite, no direct activation |
| Pedigree contamination | High | Cross-verification state, parentage confidence, immutable corrections |
| Image measurement drift | High | Calibration targets, capture protocols, device holdouts, model versioning |
| Data leakage in ML evaluation | Critical | Family, parent, environment, and temporal holdouts |
| Simulation combinatorial explosion | Medium | Sparse exact aggregation, complexity estimation, Monte Carlo fallback |
| Worker reproducibility | High | Pinned images, schema versions, seeds, implementation digests |
| Vendor AI dependency | Medium | Provider abstraction, local model option, exported source/eval data |
| Loss of research artifacts | Critical | Checksums, object backups, restore drills |
| Users misreading probability as guarantee | High | Confidence-language policy, practical attrition separation, UX warnings |
| Disease diagnosis misuse | High | Research/advisory labeling, pathogen context, no treatment decisions from images alone |

---

## 23. Preconditions before coding begins

Coding may begin on the foundation and exact engine when these decisions are recorded:

1. Product name and repository location.
2. Local-only versus optional hosted multi-workspace deployment.
3. Initial supported species scope.
4. Initial P0 allele/model list.
5. Scientific reviewer role and approval process.
6. Preferred authentication provider.
7. Storage target for local and hosted deployments.
8. Whether the first release includes vision capture or only prepares the schema.
9. Whether AlphaSimR is included in the first implementation program or deferred.
10. Licensing policy for imported papers, images, and model training data.

These are not blockers to architecture planning, but unresolved items must be recorded as implementation assumptions.

---

## 24. Recommended immediate next implementation package

The safest first implementation package is:

### Package 1 — Scientific foundation and exact crossing

- normalized database schema;
- v0.1 workbook importer;
- catalog review states;
- germplasm, seed lot, plant, and cross foundation;
- exact rational-probability library;
- single-locus and independent multi-locus simulation;
- unknown genotype distributions;
- target population planning;
- run provenance;
- golden/property tests;
- minimal UI for parent selection and result review.

This package creates a useful application and proves the scientific governance model before AI or quantitative complexity is introduced.

---

## 25. Release-readiness judgment

**Conditionally ready.**

The product architecture, module boundaries, simulation taxonomy, AI controls, vision strategy, data model, and delivery sequence are sufficiently defined to begin the scientific-foundation and exact-engine implementation.

The project is **not ready** to release quantitative phenotype prediction, exact SHU prediction, disease diagnosis, universal cultivar presets, or gene-editing outcome prediction. Those remain gated by curated allele data, real breeding observations, standardized capture data, and independent validation.

---

## 26. Primary technical and scientific references

1. MIAPPE official site and releases: https://www.miappe.org/ and https://www.miappe.org/releases/
2. BrAPI specification: https://brapi.org/specification
3. Crop Ontology: https://cropontology.org/about
4. GA4GH Variation Representation Specification: https://vrs.ga4gh.org/
5. PlantCV stable documentation: https://docs.plantcv.org/
6. PlantCV analysis guidance: https://docs.plantcv.org/en/latest/analysis_approach/
7. PlantCV v4 publication information: https://plantcv.org/getting-started-1
8. AlphaSimR documentation: https://gaynorr.github.io/AlphaSimR/
9. AlphaSimR paper: https://doi.org/10.1093/g3journal/jkaa017
10. simuPOP paper: https://doi.org/10.1093/bioinformatics/bti584
11. Segment Anything: https://arxiv.org/abs/2304.02643
12. SAM 2: https://arxiv.org/abs/2408.00714
13. Vercel AI SDK documentation: https://ai-sdk.dev/docs
14. OpenAI API quickstart and multimodal inputs: https://platform.openai.com/docs/quickstart
15. Next.js App Router documentation: https://nextjs.org/docs/app

The source registry in `capsicum_genetics_evidence_catalog_v0_1.xlsx` remains the seed bibliography for locus-specific claims.

---

## 27. Least-confidence items

1. The v0.1 locus catalog is not yet allele-complete, and several records are population-specific.
2. Historical Capsicum symbols and aliases require independent nomenclature review.
3. GA4GH VRS is human-genomics-oriented; its concepts are useful, but adoption should be selective and tested against plant breeding workflows.
4. The best initial image segmentation approach cannot be selected before a representative pepper image benchmark is assembled.
5. Quantitative and genomic model feasibility depends on future sample size, trait repeatability, genotyping quality, and population structure.
6. Disease and resistance models will require a carefully curated isolate/pathotype knowledge layer.

## 28. The biggest hidden issue

The hardest part is not implementing Punnett squares, AI chat, or image recognition. It is maintaining **identity and provenance across physical biological material**.

If a seed lot, parent plant, controlled pollination, fruit, harvested seed, progeny family, image, tissue sample, genotype call, and phenotype observation are not linked correctly, the resulting dataset cannot train a trustworthy model. A sophisticated algorithm cannot repair mislabeled biology.
