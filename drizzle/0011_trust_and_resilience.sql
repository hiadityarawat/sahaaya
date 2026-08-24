ALTER TABLE disaster_events ADD COLUMN severity text NOT NULL DEFAULT 'ADVISORY';
--> statement-breakpoint
ALTER TABLE disaster_events ADD COLUMN source_name text;
--> statement-breakpoint
ALTER TABLE disaster_events ADD COLUMN source_url text;
--> statement-breakpoint
ALTER TABLE disaster_events ADD COLUMN verified_at text;
--> statement-breakpoint
ALTER TABLE disaster_events ADD COLUMN expires_at text;
--> statement-breakpoint
ALTER TABLE disaster_events ADD COLUMN updated_at text;
--> statement-breakpoint
UPDATE disaster_events SET updated_at=created_at WHERE updated_at IS NULL;
--> statement-breakpoint
CREATE INDEX idx_disaster_events_status_expiry ON disaster_events(status,expires_at);
--> statement-breakpoint
CREATE INDEX idx_password_reset_expiry ON password_reset_tokens(expires_at,consumed_at);
--> statement-breakpoint
CREATE INDEX idx_email_verification_expiry ON email_verification_tokens(expires_at,consumed_at);
--> statement-breakpoint
ALTER TABLE help_requests ADD COLUMN eta_source text;
--> statement-breakpoint
PRAGMA optimize;
