CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`file_id` text NOT NULL,
	`cfi` text NOT NULL,
	`snippet` text NOT NULL,
	`deleted` integer NOT NULL,
	`hlc` text NOT NULL,
	`server_seq` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarks_file` ON `bookmarks` (`profile_id`,`file_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_seq` ON `bookmarks` (`profile_id`,`server_seq`);--> statement-breakpoint
CREATE TABLE `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`file_id` text NOT NULL,
	`cfi_range` text NOT NULL,
	`colour` text NOT NULL,
	`text` text NOT NULL,
	`note` text,
	`deleted` integer NOT NULL,
	`hlc` text NOT NULL,
	`server_seq` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `highlights_file` ON `highlights` (`profile_id`,`file_id`);--> statement-breakpoint
CREATE INDEX `highlights_seq` ON `highlights` (`profile_id`,`server_seq`);