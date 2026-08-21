ALTER TABLE `help_requests` ADD `helper_lat` real;
--> statement-breakpoint
ALTER TABLE `help_requests` ADD `helper_lng` real;
--> statement-breakpoint
ALTER TABLE `help_requests` ADD `eta_minutes` integer;
--> statement-breakpoint
ALTER TABLE `help_requests` ADD `delivery_started_at` text;
--> statement-breakpoint
ALTER TABLE `help_requests` ADD `delivery_updated_at` text;
--> statement-breakpoint
DELETE FROM `request_updates` WHERE `request_id` IN (SELECT `id` FROM `help_requests` WHERE `requester_id` = 'demo-resident');
--> statement-breakpoint
DELETE FROM `reports` WHERE `request_id` IN (SELECT `id` FROM `help_requests` WHERE `requester_id` = 'demo-resident');
--> statement-breakpoint
DELETE FROM `help_requests` WHERE `requester_id` = 'demo-resident';
--> statement-breakpoint
DELETE FROM `notifications` WHERE `user_id` = 'local-owner';
--> statement-breakpoint
DELETE FROM `volunteers` WHERE `user_id` LIKE 'vol-%';
