ALTER TABLE `resources` ADD `verification_status` text NOT NULL DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE `resources` ADD `verified_by` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD `verified_at` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD `expires_at` text;
--> statement-breakpoint
CREATE INDEX `idx_resources_verification_expiry` ON `resources` (`verification_status`,`expires_at`);
--> statement-breakpoint
UPDATE `resources` SET `expires_at`=datetime('now','+7 days') WHERE `expires_at` IS NULL;
--> statement-breakpoint
PRAGMA optimize;
