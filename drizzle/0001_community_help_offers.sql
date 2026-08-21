CREATE TABLE IF NOT EXISTS `help_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`helper_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `help_offers_request_helper_unique` UNIQUE(`request_id`,`helper_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_offers_request` ON `help_offers` (`request_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_offers_helper` ON `help_offers` (`helper_id`,`status`,`created_at`);
