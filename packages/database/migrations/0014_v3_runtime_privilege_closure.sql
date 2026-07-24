BEGIN;

-- V2 used broad ALTER DEFAULT PRIVILEGES for the runtime role. Preserve reads,
-- but make future mutation and function execution opt-in so every authoritative
-- path must declare its database contract explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES FROM capsicum_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO capsicum_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM capsicum_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Global normalized scientific records are read-only to the web runtime until a
-- curator/reviewer security-definer workflow promotes them. Migration/import
-- owners retain controlled maintenance authority.
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'reference_assemblies', 'catalog_alleles', 'allele_aliases',
    'sequence_variants', 'structural_variants', 'catalog_markers', 'catalog_assays',
    'catalog_release_alleles', 'catalog_release_sequence_variants',
    'catalog_release_structural_variants', 'catalog_release_markers',
    'catalog_release_assays', 'controlled_vocabularies', 'controlled_terms'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE %I FROM capsicum_runtime', target);
    EXECUTE format('GRANT SELECT ON TABLE %I TO capsicum_runtime', target);
  END LOOP;
END
$$;

-- Review evidence is append-only and may only be created by its canonical
-- security-definer review function.
REVOKE INSERT, UPDATE, DELETE ON TABLE research_document_reviews FROM capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE research_passage_reviews FROM capsicum_runtime;
GRANT SELECT ON TABLE research_document_reviews, research_passage_reviews TO capsicum_runtime;

-- Worker-owned terminal state and immutable artifact tables.
REVOKE UPDATE, DELETE ON TABLE jobs FROM capsicum_runtime;
GRANT SELECT, INSERT ON TABLE jobs TO capsicum_runtime;
REVOKE UPDATE, DELETE ON TABLE transactional_outbox FROM capsicum_runtime;
GRANT SELECT, INSERT ON TABLE transactional_outbox TO capsicum_runtime;
REVOKE UPDATE, DELETE ON TABLE export_jobs FROM capsicum_runtime;
GRANT SELECT, INSERT ON TABLE export_jobs TO capsicum_runtime;
REVOKE UPDATE, DELETE ON TABLE media_objects FROM capsicum_runtime;
GRANT SELECT, INSERT ON TABLE media_objects TO capsicum_runtime;
GRANT UPDATE (inspection_job_id) ON TABLE media_objects TO capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE media_inspections FROM capsicum_runtime;
GRANT SELECT ON TABLE media_inspections TO capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE immutable_artifacts FROM capsicum_runtime;
GRANT SELECT ON TABLE immutable_artifacts TO capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE worker_heartbeats FROM capsicum_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE job_contracts FROM capsicum_runtime;
GRANT SELECT ON TABLE worker_heartbeats, job_contracts TO capsicum_runtime;

-- Validated model status is scientific authority. Runtime can inspect model
-- gates but cannot manufacture a trained/validated model row.
REVOKE INSERT, UPDATE, DELETE ON TABLE model_versions FROM capsicum_runtime;
GRANT SELECT ON TABLE model_versions TO capsicum_runtime;

-- Observation definitions and executable protocol authority remain read-only
-- until independently reviewed authoring services are present.
REVOKE INSERT, UPDATE, DELETE ON TABLE observation_definitions FROM capsicum_runtime;
GRANT SELECT ON TABLE observation_definitions TO capsicum_runtime;

-- Cross and research review functions already own their mutations; keep their
-- history tables unavailable to arbitrary SQL issued through the web role.
REVOKE INSERT, UPDATE, DELETE ON TABLE cross_verification_reviews FROM capsicum_runtime;
GRANT SELECT ON TABLE cross_verification_reviews TO capsicum_runtime;

COMMIT;
