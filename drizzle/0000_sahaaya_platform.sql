CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL,`email` text NOT NULL,`name` text NOT NULL,`role` text DEFAULT 'ADMIN' NOT NULL,`email_verified` integer DEFAULT true NOT NULL,`blocked_at` text,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `disaster_events` (`id` text PRIMARY KEY NOT NULL,`name` text NOT NULL,`status` text NOT NULL,`affected_areas` text NOT NULL,`starts_at` text NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `help_requests` (`id` text PRIMARY KEY NOT NULL,`requester_id` text NOT NULL,`event_id` text,`category` text NOT NULL,`public_area` text NOT NULL,`people_count` integer NOT NULL CHECK(`people_count` > 0),`description` text NOT NULL,`urgency` text NOT NULL,`contact_method` text NOT NULL,`status` text DEFAULT 'OPEN' NOT NULL,`accepted_by` text,`assigned_volunteer_id` text,`image_key` text,`approx_lat` real,`approx_lng` real,`created_at` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_requests_filters` ON `help_requests` (`status`,`urgency`,`category`,`public_area`,`created_at`);
--> statement-breakpoint
CREATE TABLE `request_updates` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`request_id` text NOT NULL,`author_id` text NOT NULL,`status` text,`body` text NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_updates_request` ON `request_updates` (`request_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `volunteers` (`user_id` text PRIMARY KEY NOT NULL,`name` text NOT NULL,`skills` text NOT NULL,`areas` text NOT NULL,`available` integer DEFAULT true NOT NULL,`completed_tasks` integer DEFAULT 0 NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `organizations` (`id` text PRIMARY KEY NOT NULL,`name` text NOT NULL,`public_area` text NOT NULL,`verified` integer DEFAULT false NOT NULL,`contact_email` text NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `resources` (`id` text PRIMARY KEY NOT NULL,`organization_id` text NOT NULL,`event_id` text,`category` text NOT NULL,`name` text NOT NULL,`quantity` integer NOT NULL CHECK(`quantity` >= 0),`unit` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `resource_transactions` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`resource_id` text NOT NULL,`delta` integer NOT NULL,`note` text NOT NULL,`actor_id` text NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `notifications` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`title` text NOT NULL,`body` text NOT NULL,`type` text NOT NULL,`read_at` text,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user` ON `notifications` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `reports` (`id` text PRIMARY KEY NOT NULL,`request_id` text NOT NULL,`reporter_id` text NOT NULL,`reason` text NOT NULL,`status` text NOT NULL,`created_at` text NOT NULL,`reviewed_at` text);
--> statement-breakpoint
CREATE TABLE `audit_logs` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`actor_id` text NOT NULL,`action` text NOT NULL,`entity_type` text NOT NULL,`entity_id` text NOT NULL,`metadata` text NOT NULL,`created_at` text NOT NULL);
