BEGIN;

ALTER TABLE inventory_reservations
  ADD COLUMN remaining_quantity integer,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN expired_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE inventory_reservations
SET remaining_quantity = CASE WHEN state = 'consumed' THEN 0 ELSE quantity END;
ALTER TABLE inventory_reservations ALTER COLUMN remaining_quantity SET NOT NULL;
ALTER TABLE inventory_reservations DROP CONSTRAINT IF EXISTS inventory_reservations_state_check;
ALTER TABLE inventory_reservations DROP CONSTRAINT IF EXISTS inventory_reservations_check;
ALTER TABLE inventory_reservations DROP CONSTRAINT IF EXISTS inventory_reservations_check1;
ALTER TABLE inventory_reservations
  ADD CONSTRAINT inventory_reservations_remaining_check CHECK (remaining_quantity BETWEEN 0 AND quantity),
  ADD CONSTRAINT inventory_reservations_state_v4_check CHECK (state IN ('active','partially_consumed','released','consumed','expired')),
  ADD CONSTRAINT inventory_reservations_lifecycle_v4_check CHECK (
    (state IN ('active','partially_consumed') AND remaining_quantity > 0 AND released_at IS NULL AND consumed_at IS NULL AND expired_at IS NULL)
    OR (state = 'released' AND remaining_quantity > 0 AND released_at IS NOT NULL AND consumed_at IS NULL AND expired_at IS NULL)
    OR (state = 'consumed' AND remaining_quantity = 0 AND consumed_at IS NOT NULL AND released_at IS NULL AND expired_at IS NULL)
    OR (state = 'expired' AND remaining_quantity > 0 AND expired_at IS NOT NULL AND released_at IS NULL AND consumed_at IS NULL)
  );
CREATE INDEX inventory_reservations_available_idx
  ON inventory_reservations(workspace_id, seed_lot_material_id, state, expires_at)
  WHERE state IN ('active','partially_consumed');

ALTER TABLE inventory_events DROP CONSTRAINT IF EXISTS inventory_events_event_type_check;
ALTER TABLE inventory_events ADD CONSTRAINT inventory_events_event_type_check CHECK (event_type IN (
  'received','adjustment','reservation','reservation_release','reservation_released','reservation_expired',
  'planting','germination','loss','return','reconciliation','sown','transferred','consumed','discarded','counted'
));
ALTER TABLE inventory_events DROP CONSTRAINT IF EXISTS inventory_events_sign_contract;
ALTER TABLE inventory_events ADD CONSTRAINT inventory_events_sign_contract CHECK (
  (event_type IN ('received','return') AND quantity_delta > 0)
  OR (event_type IN ('planting','loss','sown','consumed','discarded') AND quantity_delta < 0)
  OR (event_type IN ('reservation','reservation_release','reservation_released','reservation_expired','germination') AND quantity_delta = 0)
  OR event_type IN ('reconciliation','counted')
  OR (event_type IN ('adjustment','transferred') AND quantity_delta <> 0)
);

CREATE TABLE inventory_exception_requests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  seed_lot_material_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (length(trim(reason)) >= 20),
  requested_by uuid NOT NULL,
  review_state review_state NOT NULL DEFAULT 'in_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_rationale text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, seed_lot_material_id) REFERENCES seed_lots(workspace_id, material_id),
  FOREIGN KEY (workspace_id, requested_by) REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, reviewed_by) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (review_state IN ('in_review','approved','changes_requested','rejected')),
  CHECK (
    (review_state = 'in_review' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_rationale IS NULL)
    OR (review_state <> 'in_review' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(review_rationale)) >= 10 AND reviewed_by <> requested_by)
  )
);
CREATE INDEX inventory_exception_requests_queue_idx
  ON inventory_exception_requests(workspace_id, review_state, created_at, id);

CREATE TABLE inventory_exception_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  request_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  reviewer_user_id uuid NOT NULL,
  decision review_state NOT NULL,
  rationale text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, request_id, reviewer_user_id, decision),
  FOREIGN KEY (workspace_id, request_id) REFERENCES inventory_exception_requests(workspace_id, id),
  FOREIGN KEY (workspace_id, author_user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, reviewer_user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  CHECK (decision IN ('approved','changes_requested','rejected')),
  CHECK (author_user_id <> reviewer_user_id),
  CHECK (length(trim(rationale)) >= 10)
);

ALTER TABLE plant_inventory_allocations
  ADD COLUMN exception_request_id uuid,
  ADD COLUMN exception_authority text NOT NULL DEFAULT 'none';
UPDATE plant_inventory_allocations
SET exception_authority = CASE allocation_mode
  WHEN 'documented_exception' THEN 'legacy_unreviewed'
  WHEN 'uncertain_quantity' THEN 'explicit_uncertainty'
  ELSE 'none'
END;
CREATE UNIQUE INDEX plant_inventory_allocations_exception_once_idx
  ON plant_inventory_allocations(workspace_id, exception_request_id)
  WHERE exception_request_id IS NOT NULL;
ALTER TABLE plant_inventory_allocations
  ADD CONSTRAINT plant_inventory_allocations_exception_request_fk
    FOREIGN KEY (workspace_id, exception_request_id) REFERENCES inventory_exception_requests(workspace_id, id),
  ADD CONSTRAINT plant_inventory_allocations_exception_authority_check CHECK (
    (allocation_mode IN ('consumed','reserved') AND exception_request_id IS NULL AND exception_authority = 'none')
    OR (allocation_mode = 'uncertain_quantity' AND exception_request_id IS NULL AND exception_authority = 'explicit_uncertainty')
    OR (allocation_mode = 'documented_exception' AND (
      (exception_request_id IS NOT NULL AND exception_authority = 'independently_approved')
      OR (exception_request_id IS NULL AND exception_authority = 'legacy_unreviewed')
    ))
  );

CREATE OR REPLACE FUNCTION guard_inventory_exception_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE actor_role membership_role;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'inventory exception requests are immutable'; END IF;
  IF NOT app_is_runtime_session() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_by <> app_current_actor_user_id() THEN RAISE EXCEPTION 'inventory exception requester must match authenticated actor'; END IF;
    IF NEW.review_state <> 'in_review' THEN RAISE EXCEPTION 'inventory exception requests begin in review'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['review_state','reviewed_by','reviewed_at','review_rationale'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['review_state','reviewed_by','reviewed_at','review_rationale']) THEN
    RAISE EXCEPTION 'inventory exception request identity is immutable';
  END IF;
  IF OLD.review_state <> 'in_review' THEN RAISE EXCEPTION 'inventory exception review is final'; END IF;
  actor_role := app_current_membership_role();
  IF actor_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'inventory exception review requires owner or administrator'; END IF;
  IF NEW.reviewed_by <> app_current_actor_user_id() OR NEW.reviewed_by = OLD.requested_by THEN
    RAISE EXCEPTION 'inventory exceptions require an independent authenticated reviewer';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER inventory_exception_requests_authority
BEFORE INSERT OR UPDATE OR DELETE ON inventory_exception_requests
FOR EACH ROW EXECUTE FUNCTION guard_inventory_exception_request();
CREATE TRIGGER inventory_exception_reviews_append_only
BEFORE UPDATE OR DELETE ON inventory_exception_reviews
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE OR REPLACE FUNCTION validate_plant_inventory_exception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.allocation_mode = 'documented_exception' AND NEW.exception_authority = 'independently_approved' THEN
    IF NOT EXISTS (
      SELECT 1 FROM inventory_exception_requests request
      WHERE request.workspace_id = NEW.workspace_id
        AND request.id = NEW.exception_request_id
        AND request.seed_lot_material_id = NEW.seed_lot_material_id
        AND request.quantity = NEW.quantity
        AND request.review_state = 'approved'
    ) THEN
      RAISE EXCEPTION 'plant inventory exception requires an approved matching request';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER plant_inventory_allocations_validate_exception
BEFORE INSERT ON plant_inventory_allocations
FOR EACH ROW EXECUTE FUNCTION validate_plant_inventory_exception();

ALTER TABLE inventory_exception_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_exception_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY active_membership_workspace_isolation ON inventory_exception_requests
  USING (app_workspace_access_allowed(workspace_id)) WITH CHECK (app_workspace_access_allowed(workspace_id));
ALTER TABLE inventory_exception_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_exception_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY active_membership_workspace_isolation ON inventory_exception_reviews
  USING (app_workspace_access_allowed(workspace_id)) WITH CHECK (app_workspace_access_allowed(workspace_id));

GRANT SELECT, INSERT ON inventory_exception_requests TO capsicum_runtime;
GRANT UPDATE (review_state, reviewed_by, reviewed_at, review_rationale) ON inventory_exception_requests TO capsicum_runtime;
GRANT SELECT, INSERT ON inventory_exception_reviews TO capsicum_runtime;
REVOKE UPDATE, DELETE ON inventory_exception_reviews FROM capsicum_runtime;
GRANT UPDATE (remaining_quantity, state, released_at, consumed_at, expired_at, updated_at) ON inventory_reservations TO capsicum_runtime;

COMMIT;
