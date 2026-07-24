BEGIN;

CREATE TABLE observation_methods (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  method_key text NOT NULL,
  method_version text NOT NULL,
  display_name text NOT NULL,
  protocol_id uuid REFERENCES capture_protocols(id),
  contract jsonb NOT NULL,
  applicability jsonb NOT NULL DEFAULT '{}'::jsonb,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (method_key, method_version),
  CHECK (length(trim(method_key)) > 0),
  CHECK (length(trim(method_version)) > 0),
  CHECK (length(trim(display_name)) > 0),
  CHECK (jsonb_typeof(contract) = 'object'),
  CHECK (jsonb_typeof(applicability) = 'object'),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK (
    (review_state IN ('approved','superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (review_state NOT IN ('approved','superseded') AND approved_by IS NULL AND approved_at IS NULL)
  )
);

CREATE TABLE observation_quality_terms (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  quality_key text NOT NULL,
  quality_version text NOT NULL,
  display_name text NOT NULL,
  severity text NOT NULL,
  definition text NOT NULL,
  applicability jsonb NOT NULL DEFAULT '{}'::jsonb,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quality_key, quality_version),
  CHECK (severity IN ('information','warning','invalidating')),
  CHECK (length(trim(display_name)) > 0),
  CHECK (length(trim(definition)) >= 10),
  CHECK (jsonb_typeof(applicability) = 'object'),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK (
    (review_state IN ('approved','superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (review_state NOT IN ('approved','superseded') AND approved_by IS NULL AND approved_at IS NULL)
  )
);

CREATE TABLE observation_device_schemas (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  schema_key text NOT NULL,
  schema_version text NOT NULL,
  display_name text NOT NULL,
  json_schema jsonb NOT NULL,
  applicability jsonb NOT NULL DEFAULT '{}'::jsonb,
  authored_by uuid NOT NULL REFERENCES users(id),
  review_state review_state NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schema_key, schema_version),
  CHECK (length(trim(display_name)) > 0),
  CHECK (jsonb_typeof(json_schema) = 'object'),
  CHECK (jsonb_typeof(applicability) = 'object'),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CHECK (
    (review_state IN ('approved','superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (review_state NOT IN ('approved','superseded') AND approved_by IS NULL AND approved_at IS NULL)
  )
);

ALTER TABLE experiments
  ADD COLUMN protocol_id uuid REFERENCES capture_protocols(id),
  ADD COLUMN protocol_snapshot jsonb;

ALTER TABLE observation_definitions
  ADD COLUMN protocol_id uuid REFERENCES capture_protocols(id),
  ADD COLUMN method_id uuid REFERENCES observation_methods(id),
  ADD COLUMN missing_policy jsonb NOT NULL DEFAULT '{"allowed":false,"allowedReasons":[]}'::jsonb,
  ADD CONSTRAINT observation_definitions_missing_policy_check CHECK (
    jsonb_typeof(missing_policy) = 'object'
    AND jsonb_typeof(COALESCE(missing_policy->'allowed', 'false'::jsonb)) = 'boolean'
    AND jsonb_typeof(COALESCE(missing_policy->'allowedReasons', '[]'::jsonb)) = 'array'
    AND NOT jsonb_path_exists(
      COALESCE(missing_policy->'allowedReasons', '[]'::jsonb),
      '$[*] ? (@.type() != "string")'::jsonpath
    )
  );

CREATE TABLE observation_definition_quality_terms (
  definition_id uuid NOT NULL REFERENCES observation_definitions(id),
  quality_term_id uuid NOT NULL REFERENCES observation_quality_terms(id),
  PRIMARY KEY (definition_id, quality_term_id)
);

ALTER TABLE observation_revisions
  ADD COLUMN method_record_id uuid REFERENCES observation_methods(id),
  ADD COLUMN device_schema_id uuid REFERENCES observation_device_schemas(id),
  ADD COLUMN quality_term_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX observation_revisions_method_idx
  ON observation_revisions(workspace_id, method_record_id, observed_at DESC);

CREATE OR REPLACE FUNCTION validate_observation_definition_dependencies_v4()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.review_state NOT IN ('approved','superseded') THEN RETURN NEW; END IF;
  IF NEW.protocol_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM capture_protocols protocol
    WHERE protocol.id = NEW.protocol_id AND protocol.review_state = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved observation definitions require an approved protocol version';
  END IF;
  IF NEW.method_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM observation_methods method
    WHERE method.id = NEW.method_id AND method.review_state = 'approved'
      AND (method.protocol_id IS NULL OR method.protocol_id = NEW.protocol_id)
  ) THEN
    RAISE EXCEPTION 'approved observation definitions require an applicable approved method version';
  END IF;
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM measurement_units unit_record
    WHERE unit_record.id = NEW.unit_id AND unit_record.review_state = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved observation definition unit must be approved';
  END IF;
  IF NEW.vocabulary_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM controlled_vocabularies vocabulary
    WHERE vocabulary.id = NEW.vocabulary_version_id AND vocabulary.review_state = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved observation definition vocabulary must be approved';
  END IF;
  IF COALESCE((NEW.missing_policy->>'allowed')::boolean, false)
     AND jsonb_array_length(COALESCE(NEW.missing_policy->'allowedReasons', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'an enabled missing-value policy requires explicit allowed reasons';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS observation_definitions_validate_dependencies_v4 ON observation_definitions;
CREATE CONSTRAINT TRIGGER observation_definitions_validate_dependencies_v4
AFTER INSERT OR UPDATE ON observation_definitions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_observation_definition_dependencies_v4();

CREATE OR REPLACE FUNCTION guard_observation_session_protocol_v4()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.protocol_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM capture_protocols protocol
    WHERE protocol.id = NEW.protocol_id AND protocol.review_state = 'approved'
  ) THEN
    RAISE EXCEPTION 'observation session protocol must be an approved exact version';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.protocol_id IS DISTINCT FROM OLD.protocol_id THEN
    RAISE EXCEPTION 'observation session protocol is immutable';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS observation_sessions_protocol_authority_v4 ON observation_sessions;
CREATE TRIGGER observation_sessions_protocol_authority_v4
BEFORE INSERT OR UPDATE OF protocol_id ON observation_sessions
FOR EACH ROW EXECUTE FUNCTION guard_observation_session_protocol_v4();

CREATE OR REPLACE FUNCTION validate_authoritative_observation_revision_v4()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  observation_authority_value observation_authority;
  definition_id_value uuid;
  definition_record observation_definitions%ROWTYPE;
  session_protocol uuid;
  method_record observation_methods%ROWTYPE;
  missing_allowed boolean;
  missing_reason_value text;
  invalid_quality_count integer;
BEGIN
  SELECT observation.authority, observation.definition_id, session.protocol_id
  INTO observation_authority_value, definition_id_value, session_protocol
  FROM observations observation
  LEFT JOIN observation_sessions session
    ON session.workspace_id = observation.workspace_id AND session.id = observation.session_id
  WHERE observation.workspace_id = NEW.workspace_id AND observation.id = NEW.observation_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'observation aggregate does not exist'; END IF;
  SELECT * INTO definition_record FROM observation_definitions WHERE id = definition_id_value;
  IF NOT FOUND THEN RAISE EXCEPTION 'observation definition does not exist'; END IF;
  IF observation_authority_value <> 'authoritative' THEN RETURN NEW; END IF;
  IF definition_record.review_state <> 'approved' THEN
    RAISE EXCEPTION 'authoritative observations require an approved observation definition';
  END IF;
  IF session_protocol IS NULL OR session_protocol <> definition_record.protocol_id THEN
    RAISE EXCEPTION 'authoritative observation session protocol does not match the approved definition';
  END IF;
  IF NEW.method_record_id IS NULL THEN
    RAISE EXCEPTION 'authoritative observations require an approved method version';
  END IF;
  SELECT * INTO method_record FROM observation_methods WHERE id = NEW.method_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'authoritative observation method does not exist';
  END IF;
  IF method_record.review_state <> 'approved' OR method_record.id <> definition_record.method_id THEN
    RAISE EXCEPTION 'authoritative observation method does not match the approved definition';
  END IF;
  IF NEW.method_id <> method_record.method_key OR NEW.method_version <> method_record.method_version THEN
    RAISE EXCEPTION 'observation method snapshot does not match its approved record';
  END IF;
  IF NEW.unit_id IS DISTINCT FROM definition_record.unit_id THEN
    RAISE EXCEPTION 'authoritative observation unit must match the approved definition version';
  END IF;
  IF NEW.term_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM controlled_terms term
    WHERE term.id = NEW.term_id AND term.active
      AND term.vocabulary_id = definition_record.vocabulary_version_id
  ) THEN
    RAISE EXCEPTION 'authoritative controlled term is not in the approved vocabulary version';
  END IF;
  IF COALESCE(array_length(NEW.quality_term_ids, 1), 0) > 0 THEN
    SELECT count(*) INTO invalid_quality_count
    FROM unnest(NEW.quality_term_ids) quality_id
    LEFT JOIN observation_quality_terms quality ON quality.id = quality_id
    LEFT JOIN observation_definition_quality_terms allowed
      ON allowed.definition_id = definition_record.id AND allowed.quality_term_id = quality_id
    WHERE quality.id IS NULL OR quality.review_state <> 'approved' OR allowed.quality_term_id IS NULL;
    IF invalid_quality_count > 0 THEN
      RAISE EXCEPTION 'authoritative quality terms must be approved and allowed by the definition';
    END IF;
  END IF;
  IF NEW.device_provenance IS NOT NULL THEN
    IF NEW.device_schema_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM observation_device_schemas schema_record
      WHERE schema_record.id = NEW.device_schema_id AND schema_record.review_state = 'approved'
    ) THEN
      RAISE EXCEPTION 'authoritative device provenance requires an approved device schema version';
    END IF;
  END IF;
  IF NEW.value_payload->>'type' = 'missing' THEN
    missing_allowed := COALESCE((definition_record.missing_policy->>'allowed')::boolean, false);
    missing_reason_value := NEW.value_payload->>'reason';
    IF NOT missing_allowed OR missing_reason_value IS NULL OR NOT (COALESCE(definition_record.missing_policy->'allowedReasons', '[]'::jsonb) ? missing_reason_value) THEN
      RAISE EXCEPTION 'missing value reason is not allowed by the approved definition';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS observation_revisions_authority_v4 ON observation_revisions;
CREATE TRIGGER observation_revisions_authority_v4
BEFORE INSERT ON observation_revisions
FOR EACH ROW EXECUTE FUNCTION validate_authoritative_observation_revision_v4();

CREATE TRIGGER observation_methods_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON observation_methods
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();
CREATE TRIGGER observation_quality_terms_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON observation_quality_terms
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();
CREATE TRIGGER observation_device_schemas_runtime_authority
BEFORE INSERT OR UPDATE OR DELETE ON observation_device_schemas
FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_record_write();

CREATE TABLE catalog_release_observation_methods (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  method_id uuid NOT NULL REFERENCES observation_methods(id),
  record_hash text NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (release_id, method_id)
);
CREATE TABLE catalog_release_observation_quality_terms (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  quality_term_id uuid NOT NULL REFERENCES observation_quality_terms(id),
  record_hash text NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (release_id, quality_term_id)
);
CREATE TABLE catalog_release_observation_device_schemas (
  release_id uuid NOT NULL REFERENCES catalog_releases(id),
  device_schema_id uuid NOT NULL REFERENCES observation_device_schemas(id),
  record_hash text NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (release_id, device_schema_id)
);

CREATE OR REPLACE FUNCTION validate_catalog_release_observation_authority_v4()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state <> 'approved' OR OLD.state = 'approved' THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_observation_methods member
    JOIN observation_methods record ON record.id = member.method_id
    WHERE member.release_id = NEW.id
      AND (record.review_state <> 'approved' OR record.content_hash <> member.record_hash)
  ) THEN RAISE EXCEPTION 'release contains stale or unapproved observation methods'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_observation_quality_terms member
    JOIN observation_quality_terms record ON record.id = member.quality_term_id
    WHERE member.release_id = NEW.id
      AND (record.review_state <> 'approved' OR record.content_hash <> member.record_hash)
  ) THEN RAISE EXCEPTION 'release contains stale or unapproved quality terms'; END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_release_observation_device_schemas member
    JOIN observation_device_schemas record ON record.id = member.device_schema_id
    WHERE member.release_id = NEW.id
      AND (record.review_state <> 'approved' OR record.content_hash <> member.record_hash)
  ) THEN RAISE EXCEPTION 'release contains stale or unapproved device schemas'; END IF;
  IF EXISTS (
    SELECT 1
    FROM catalog_release_observation_definitions member
    JOIN observation_definitions definition ON definition.id = member.definition_id
    WHERE member.release_id = NEW.id
      AND (
        NOT EXISTS (SELECT 1 FROM catalog_release_capture_protocols protocol_member WHERE protocol_member.release_id = NEW.id AND protocol_member.protocol_id = definition.protocol_id)
        OR NOT EXISTS (SELECT 1 FROM catalog_release_observation_methods method_member WHERE method_member.release_id = NEW.id AND method_member.method_id = definition.method_id)
        OR EXISTS (
          SELECT 1 FROM observation_definition_quality_terms dependency
          WHERE dependency.definition_id = definition.id
            AND NOT EXISTS (
              SELECT 1 FROM catalog_release_observation_quality_terms quality_member
              WHERE quality_member.release_id = NEW.id AND quality_member.quality_term_id = dependency.quality_term_id
            )
        )
      )
  ) THEN RAISE EXCEPTION 'release observation definitions are missing exact protocol or method dependencies'; END IF;
  RETURN NEW;
END
$$;
CREATE CONSTRAINT TRIGGER catalog_releases_observation_authority_v4
AFTER UPDATE OF state ON catalog_releases
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_catalog_release_observation_authority_v4();

GRANT SELECT, INSERT ON observation_methods, observation_quality_terms, observation_device_schemas TO capsicum_runtime;
REVOKE UPDATE, DELETE ON observation_methods, observation_quality_terms, observation_device_schemas FROM capsicum_runtime;
GRANT UPDATE (review_state, approved_by, approved_at) ON observation_methods, observation_quality_terms, observation_device_schemas TO capsicum_runtime;
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'catalog_release_observation_methods',
    'catalog_release_observation_quality_terms',
    'catalog_release_observation_device_schemas'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_catalog_release_membership_mutation()', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_runtime_authority BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_runtime_catalog_publication_write()', table_name, table_name);
  END LOOP;
END
$$;

GRANT SELECT, INSERT ON catalog_release_observation_methods, catalog_release_observation_quality_terms, catalog_release_observation_device_schemas TO capsicum_runtime;
REVOKE UPDATE, DELETE ON catalog_release_observation_methods, catalog_release_observation_quality_terms, catalog_release_observation_device_schemas FROM capsicum_runtime;

COMMIT;
