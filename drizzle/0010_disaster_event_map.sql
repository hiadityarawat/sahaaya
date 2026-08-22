ALTER TABLE disaster_events ADD COLUMN approx_lat real;
--> statement-breakpoint
ALTER TABLE disaster_events ADD COLUMN approx_lng real;
--> statement-breakpoint
ALTER TABLE disaster_events ADD COLUMN safety_info text;
--> statement-breakpoint
ALTER TABLE disaster_events ADD COLUMN emergency_guidance text;
--> statement-breakpoint
CREATE INDEX idx_disaster_events_active_map ON disaster_events(status, starts_at, approx_lat, approx_lng);
