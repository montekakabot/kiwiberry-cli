-- Recreate reviews table: remove review_url, add user_id, add composite unique index
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `reviews_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`reviewer_name` text NOT NULL,
	`reviewer_location` text,
	`rating` real NOT NULL,
	`posted_at_raw` text NOT NULL,
	`posted_at_iso` text NOT NULL,
	`review_text` text NOT NULL,
	`fetched_at_iso` text NOT NULL,
	`location_name` text,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `reviews_new` (`id`, `business_id`, `user_id`, `reviewer_name`, `reviewer_location`, `rating`, `posted_at_raw`, `posted_at_iso`, `review_text`, `fetched_at_iso`, `location_name`)
	SELECT `id`, `business_id`, '', `reviewer_name`, `reviewer_location`, `rating`, `posted_at_raw`, COALESCE(`posted_at_iso`, ''), `review_text`, `fetched_at_iso`, `location_name` FROM `reviews`;--> statement-breakpoint
DROP TABLE `reviews`;--> statement-breakpoint
ALTER TABLE `reviews_new` RENAME TO `reviews`;--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_biz_user_date` ON `reviews` (`business_id`, `user_id`, `posted_at_iso`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
