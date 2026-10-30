CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `read_status` (
	`profile_id` text NOT NULL,
	`book_id` text NOT NULL,
	`status` text NOT NULL,
	`hlc` text NOT NULL,
	`server_seq` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `book_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `read_status_seq` ON `read_status` (`profile_id`,`server_seq`);--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`profile_id` text NOT NULL,
	`file_id` text NOT NULL,
	`cfi` text NOT NULL,
	`fraction` real NOT NULL,
	`device_id` text NOT NULL,
	`hlc` text NOT NULL,
	`server_seq` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `file_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_progress_seq` ON `reading_progress` (`profile_id`,`server_seq`);