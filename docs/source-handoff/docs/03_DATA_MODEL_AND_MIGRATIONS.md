# Data Model and Migration Specification

## Design rules

- Use UUIDv7 or another sortable globally unique identifier consistently.
- Every workspace-owned authoritative table carries `workspace_id`.
- Every mutable authoritative table carries creation/update actor and timestamps.
- Scientific releases and simulation snapshots are immutable after publication/completion.
- Soft deletion is allowed only where legal/audit requirements permit it; biological lineage records should generally be retired, not erased.
- References to biological material must identify the exact accession, seed lot, individual plant, sample, or harvest—not only a cultivar string.
- Units use controlled terms and canonical conversions.

## Major schema domains

### Identity and authorization

`users`, `workspaces`, `workspace_memberships`, `roles`, `permissions`, `api_keys`, `sessions`, `audit_events`.

### Scientific catalog

`catalog_releases`, `loci`, `locus_aliases`, `alleles`, `allele_aliases`, `sequence_variants`, `reference_assemblies`, `markers`, `marker_assays`, `inheritance_models`, `model_rules`, `locus_interactions`, `phenotype_terms`, `evidence_assertions`, `evidence_applicability`, `publications`, `source_passages`, `scientific_reviews`, `catalog_change_requests`.

### Germplasm and material identity

`taxa`, `germplasm_accessions`, `germplasm_names`, `source_organizations`, `acquisitions`, `seed_lots`, `seed_packets`, `plants`, `plant_locations`, `material_labels`, `material_events`, `fruits`, `tissue_samples`, `seed_harvests`.

### Breeding and pedigree

`crosses`, `cross_parents`, `pollination_events`, `cross_verifications`, `progeny_families`, `generation_records`, `pedigree_edges`, `selection_goals`, `selection_criteria`, `selection_decisions`.

### Genotyping

`genotype_assays`, `genotype_calls`, `genotype_call_evidence`, `haplotypes`, `haplotype_calls`, `variant_sets`, `call_sets`, `quality_metrics`.

### Experiments and observations

`investigations`, `studies`, `environments`, `locations`, `experimental_designs`, `blocks`, `plots`, `observation_units`, `observation_variables`, `traits`, `methods`, `scales`, `units`, `observation_sessions`, `observations`, `environment_observations`, `treatments`, `devices`, `calibrations`, `quality_control_events`.

### Media and vision

`media_assets`, `image_captures`, `capture_protocols`, `image_quality_results`, `annotations`, `annotation_revisions`, `segmentation_masks`, `derived_measurements`, `vision_models`, `vision_model_versions`, `vision_evaluations`.

### Simulation and statistics

`simulation_models`, `simulation_model_versions`, `simulation_runs`, `simulation_inputs`, `simulation_results`, `simulation_artifacts`, `selection_plans`, `model_training_datasets`, `statistical_models`, `statistical_model_versions`, `model_cards`, `model_evaluations`, `model_promotions`.

### Research and AI

`research_documents`, `document_versions`, `document_chunks`, `embedding_records`, `candidate_claims`, `ai_runs`, `ai_messages`, `ai_tool_calls`, `ai_evaluations`, `human_feedback`.

### Jobs and operations

`jobs`, `job_attempts`, `job_logs`, `outbox_events`, `idempotency_records`, `backup_records`, `restore_tests`.

## Critical constraints

- Exactly one maternal and one paternal role for an ordinary biparental cross; support alternative reproduction types explicitly.
- A plant cannot be its own ancestor and pedigree cycles must be rejected.
- An offspring biological material has no more than one origin event.
- A verified genotype call requires an approved assay/evidence method and cannot be created by AI.
- An assumed or inferred call cannot masquerade as verified.
- Published catalog releases cannot be mutated.
- Completed simulation input and result payloads cannot be mutated.
- Observation values must match the declared scale and unit.
- Image-derived authoritative measurements require a passing capture-quality state and approved human or model pathway.
- Model promotion requires an evaluation record and approval.

## Catalog import

The supplied workbook is an import source, not the schema. Implement a staged importer:

1. Load workbook/CSV into a staging schema.
2. Validate identifiers, source references, evidence grades, and required fields.
3. Generate normalized draft records.
4. Produce a reconciliation report showing information preserved, transformed, rejected, or unresolved.
5. Require curator approval before a catalog release is published.
6. Preserve original row payloads and file hash for provenance.

## Migration policy

- Forward-only production migrations with tested backups and explicit forward-repair procedures.
- Every destructive change requires a data migration, verification query, and rollback/restore decision.
- Seed data is versioned and idempotent.
- Migration tests run against an empty database and a representative prior schema snapshot.
- No application boot-time schema mutation.
