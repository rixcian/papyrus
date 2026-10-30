CREATE TABLE `file_chapters` (
	`file_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`start` real NOT NULL,
	PRIMARY KEY(`file_id`, `position`),
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `file_tracks` (
	`file_id` text NOT NULL,
	`position` integer NOT NULL,
	`sha256` text NOT NULL,
	`container` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`duration` real NOT NULL,
	`title` text,
	`original_name` text NOT NULL,
	PRIMARY KEY(`file_id`, `position`),
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_tracks_sha256` ON `file_tracks` (`sha256`);--> statement-breakpoint
ALTER TABLE `files` ADD `duration` real;