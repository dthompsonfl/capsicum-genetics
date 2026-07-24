BEGIN;

CREATE OR REPLACE FUNCTION app_worker_breeding_ledger_export_context(
  p_job_id uuid,
  p_worker_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  export_record export_jobs%ROWTYPE;
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id;
  IF current_job.id IS NULL OR current_job.job_type <> 'export.breeding-ledger.v1'
     OR current_job.state NOT IN ('running','cancel_requested')
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active breeding-ledger export lease';
  END IF;
  SELECT * INTO export_record FROM export_jobs
  WHERE workspace_id = current_job.workspace_id AND job_id = current_job.id;
  IF export_record.id IS NULL OR export_record.state NOT IN ('queued','running') THEN
    RAISE EXCEPTION 'export record is not eligible for streaming';
  END IF;
  RETURN jsonb_build_object(
    'workspaceId', current_job.workspace_id,
    'exportJobId', export_record.id,
    'format', export_record.requested_format,
    'requestedAt', export_record.requested_at,
    'schemaVersion', '3.0'
  );
END
$$;

CREATE OR REPLACE FUNCTION app_worker_breeding_ledger_page(
  p_job_id uuid,
  p_worker_id text,
  p_section text,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  current_job jobs%ROWTYPE;
  table_name text;
  cursor_column text;
  statement text;
  result jsonb;
  safe_limit integer := LEAST(5000, GREATEST(1, p_limit));
BEGIN
  SELECT * INTO current_job FROM jobs WHERE id = p_job_id;
  IF current_job.id IS NULL OR current_job.job_type <> 'export.breeding-ledger.v1'
     OR current_job.state NOT IN ('running','cancel_requested')
     OR current_job.lease_owner IS DISTINCT FROM p_worker_id OR current_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'worker does not own an active breeding-ledger export lease';
  END IF;
  CASE p_section
    WHEN 'materials' THEN table_name := 'biological_materials'; cursor_column := 'id';
    WHEN 'accessions' THEN table_name := 'germplasm_accessions'; cursor_column := 'material_id';
    WHEN 'seedLots' THEN table_name := 'seed_lots'; cursor_column := 'material_id';
    WHEN 'plants' THEN table_name := 'plants'; cursor_column := 'material_id';
    WHEN 'locations' THEN table_name := 'material_locations'; cursor_column := 'id';
    WHEN 'movements' THEN table_name := 'material_movements'; cursor_column := 'id';
    WHEN 'inventoryEvents' THEN table_name := 'inventory_events'; cursor_column := 'id';
    WHEN 'inventoryReservations' THEN table_name := 'inventory_reservations'; cursor_column := 'id';
    WHEN 'inventoryExceptions' THEN table_name := 'inventory_exception_requests'; cursor_column := 'id';
    WHEN 'crosses' THEN table_name := 'crosses'; cursor_column := 'id';
    WHEN 'crossEvents' THEN table_name := 'cross_events'; cursor_column := 'id';
    WHEN 'crossVerifications' THEN table_name := 'cross_verifications'; cursor_column := 'id';
    WHEN 'fruits' THEN table_name := 'fruits'; cursor_column := 'material_id';
    WHEN 'seedHarvests' THEN table_name := 'seed_harvests'; cursor_column := 'material_id';
    WHEN 'families' THEN table_name := 'progeny_families'; cursor_column := 'material_id';
    WHEN 'genotypeCalls' THEN table_name := 'genotype_calls'; cursor_column := 'id';
    WHEN 'experiments' THEN table_name := 'experiments'; cursor_column := 'id';
    WHEN 'observationSessions' THEN table_name := 'observation_sessions'; cursor_column := 'id';
    WHEN 'observations' THEN table_name := 'observations'; cursor_column := 'id';
    WHEN 'observationRevisions' THEN table_name := 'observation_revisions'; cursor_column := 'id';
    WHEN 'simulationRuns' THEN table_name := 'simulation_runs'; cursor_column := 'id';
    WHEN 'simulationRequests' THEN table_name := 'simulation_requests'; cursor_column := 'id';
    WHEN 'selectionPlans' THEN table_name := 'selection_plans'; cursor_column := 'id';
    WHEN 'selectionAnalyses' THEN table_name := 'selection_plan_reconciliations'; cursor_column := 'id';
    WHEN 'mediaObjects' THEN table_name := 'media_objects'; cursor_column := 'id';
    WHEN 'phenotypeCaptures' THEN table_name := 'phenotype_captures'; cursor_column := 'id';
    WHEN 'phenotypeMeasurements' THEN table_name := 'phenotype_measurements'; cursor_column := 'id';
    ELSE RAISE EXCEPTION 'unsupported breeding-ledger export section';
  END CASE;
  statement := format(
    'WITH rows AS (
       SELECT %1$I AS cursor_id, to_jsonb(source) - ''workspace_id'' AS record
       FROM %2$I source
       WHERE workspace_id = $1 AND ($2::uuid IS NULL OR %1$I > $2::uuid)
       ORDER BY %1$I
       LIMIT $3
     )
     SELECT jsonb_build_object(
       ''rows'', COALESCE((SELECT jsonb_agg(record ORDER BY cursor_id) FROM rows), ''[]''::jsonb),
       ''nextAfter'', (SELECT cursor_id FROM rows ORDER BY cursor_id DESC LIMIT 1),
       ''hasMore'', (SELECT count(*) = $3 FROM rows)
     )',
    cursor_column,
    table_name
  );
  EXECUTE statement INTO result USING current_job.workspace_id, p_after_id, safe_limit;
  RETURN result;
END
$$;

UPDATE job_contracts
SET worker_capability = 'node.export.streaming-breeding-ledger',
    result_schema = '{"type":"object","required":["artifactId","contentSha256","byteLength","schemaVersion","sectionCounts"]}'::jsonb
WHERE job_type = 'export.breeding-ledger.v1' AND contract_version = '1.0.0';

REVOKE ALL ON FUNCTION app_worker_breeding_ledger_export_context(uuid,text) FROM PUBLIC, capsicum_runtime;
REVOKE ALL ON FUNCTION app_worker_breeding_ledger_page(uuid,text,text,uuid,integer) FROM PUBLIC, capsicum_runtime;
GRANT EXECUTE ON FUNCTION app_worker_breeding_ledger_export_context(uuid,text) TO capsicum_worker;
GRANT EXECUTE ON FUNCTION app_worker_breeding_ledger_page(uuid,text,text,uuid,integer) TO capsicum_worker;

COMMIT;
