ALTER TABLE `help_requests` ADD `client_request_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_help_requests_requester_client` ON `help_requests` (`requester_id`,`client_request_id`);
--> statement-breakpoint
CREATE INDEX `idx_help_requests_status_created` ON `help_requests` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_help_requests_requester_created` ON `help_requests` (`requester_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_help_requests_helper_updated` ON `help_requests` (`accepted_by`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_help_requests_category_status` ON `help_requests` (`category`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_request_updates_created` ON `request_updates` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_offers_helper_created` ON `help_offers` (`helper_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_resources_category_quantity` ON `resources` (`category`,`quantity`);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user_id`,`read_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_entity` ON `audit_logs` (`entity_type`,`entity_id`);
--> statement-breakpoint
UPDATE `help_requests` SET `status`='OPEN', `updated_at`=datetime('now') WHERE `status`='ACCEPTED' AND `accepted_by` IS NULL;
--> statement-breakpoint
CREATE TRIGGER `trg_help_requests_participant_state_insert` BEFORE INSERT ON `help_requests` WHEN (NEW.`status` IN ('ACCEPTED','IN_PROGRESS','VOLUNTEER_ASSIGNED') AND NEW.`accepted_by` IS NULL) OR (NEW.`status`='OPEN' AND NEW.`accepted_by` IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'invalid help request participant state'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_help_requests_participant_state_update` BEFORE UPDATE OF `status`,`accepted_by` ON `help_requests` WHEN (NEW.`status` IN ('ACCEPTED','IN_PROGRESS','VOLUNTEER_ASSIGNED') AND NEW.`accepted_by` IS NULL) OR (NEW.`status`='OPEN' AND NEW.`accepted_by` IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'invalid help request participant state'); END;
--> statement-breakpoint
PRAGMA optimize;
