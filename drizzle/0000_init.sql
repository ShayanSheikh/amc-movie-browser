CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`delivered_at` text,
	`delivery_error` text
);
--> statement-breakpoint
CREATE TABLE `deadlines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`theatre_id` integer,
	`deadline_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theatre_id`) REFERENCES `theatres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `movies` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`release_date` text,
	`poster_url` text,
	`run_time` integer,
	`rating` text
);
--> statement-breakpoint
CREATE TABLE `poll_coverage` (
	`movie_id` integer NOT NULL,
	`theatre_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`movie_id`, `theatre_id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`webhook_url` text,
	`poll_interval_minutes` integer DEFAULT 30 NOT NULL,
	`days_ahead` integer DEFAULT 14 NOT NULL,
	`mock_step` integer DEFAULT 0 NOT NULL,
	`last_poll_at` text,
	`last_poll_error` text,
	`last_poll_summary` text
);
--> statement-breakpoint
CREATE TABLE `showtimes_seen` (
	`id` integer PRIMARY KEY NOT NULL,
	`movie_id` integer NOT NULL,
	`theatre_id` integer NOT NULL,
	`starts_at` text NOT NULL,
	`format` text,
	`is_sold_out` integer DEFAULT false NOT NULL,
	`purchase_url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `showtimes_movie_theatre_idx` ON `showtimes_seen` (`movie_id`,`theatre_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `theatres` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`address` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`is_favorite` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`movie_id` integer PRIMARY KEY NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade
);
