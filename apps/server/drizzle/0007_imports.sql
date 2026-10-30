CREATE TABLE `import_records` (
	`profile_id` text NOT NULL,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`mtime_ms` integer NOT NULL,
	`status` text NOT NULL,
	`book_id` text,
	`title` text,
	`message` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `path`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_records_at` ON `import_records` (`profile_id`,`at`);