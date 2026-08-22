-- Remove placeholder inventory and events. From this migration onward, every
-- public resource is created and maintained by a signed-in community member.
DELETE FROM resource_transactions;
--> statement-breakpoint
DELETE FROM resources;
--> statement-breakpoint
DELETE FROM organizations;
--> statement-breakpoint
DELETE FROM disaster_events;
--> statement-breakpoint
UPDATE help_requests SET event_id=NULL,delivery_code=NULL;
--> statement-breakpoint

ALTER TABLE help_requests ADD delivery_code_hash text;
--> statement-breakpoint
ALTER TABLE help_requests ADD delivery_code_expires_at text;
--> statement-breakpoint
ALTER TABLE help_requests ADD delivery_code_attempts integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE resources ADD owner_id text;
--> statement-breakpoint
ALTER TABLE resources ADD public_area text;
--> statement-breakpoint
ALTER TABLE resources ADD created_at text;
--> statement-breakpoint

CREATE TABLE rate_limits (
  key text PRIMARY KEY NOT NULL,
  window_started_at integer NOT NULL,
  count integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE uploaded_files (
  key text PRIMARY KEY NOT NULL,
  request_id text NOT NULL,
  owner_id text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at text NOT NULL
);
--> statement-breakpoint

CREATE INDEX idx_requests_active_created
ON help_requests(status,created_at);
--> statement-breakpoint
CREATE INDEX idx_requests_requester_status
ON help_requests(requester_id,status,updated_at);
--> statement-breakpoint
CREATE INDEX idx_requests_helper_status
ON help_requests(accepted_by,status,updated_at);
--> statement-breakpoint
CREATE INDEX idx_resources_owner_updated
ON resources(owner_id,updated_at);
--> statement-breakpoint
CREATE INDEX idx_resources_category_area
ON resources(category,public_area,updated_at);
--> statement-breakpoint
CREATE INDEX idx_uploaded_files_request
ON uploaded_files(request_id);
--> statement-breakpoint
CREATE INDEX idx_reports_status_created
ON reports(status,created_at);
--> statement-breakpoint
CREATE INDEX idx_rate_limits_window
ON rate_limits(window_started_at);
--> statement-breakpoint
CREATE TRIGGER trg_help_requests_delete_dependents
AFTER DELETE ON help_requests
BEGIN
  DELETE FROM help_offers WHERE request_id=OLD.id;
  DELETE FROM request_updates WHERE request_id=OLD.id;
  DELETE FROM reports WHERE request_id=OLD.id;
  DELETE FROM uploaded_files WHERE request_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER trg_help_offers_validate
BEFORE INSERT ON help_offers
WHEN NOT EXISTS(SELECT 1 FROM help_requests WHERE id=NEW.request_id)
  OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.helper_id)
BEGIN
  SELECT RAISE(ABORT,'invalid help offer reference');
END;
--> statement-breakpoint
CREATE TRIGGER trg_resources_validate_owner
BEFORE INSERT ON resources
WHEN NEW.owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT,'invalid resource owner');
END;
--> statement-breakpoint
CREATE TRIGGER trg_resources_delete_ledger
AFTER DELETE ON resources
BEGIN
  DELETE FROM resource_transactions WHERE resource_id=OLD.id;
END;
--> statement-breakpoint
PRAGMA optimize;
