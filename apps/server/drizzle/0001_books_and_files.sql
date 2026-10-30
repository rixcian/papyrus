CREATE TABLE `book_authors` (
	`book_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`book_id`, `position`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `book_authors_name` ON `book_authors` (`name`);--> statement-breakpoint
CREATE TABLE `book_tags` (
	`book_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`book_id`, `tag`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `book_tags_tag` ON `book_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_profile_id` text NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`description` text,
	`language` text,
	`publisher` text,
	`published_date` text,
	`isbn` text,
	`series_name` text,
	`series_index` real,
	`match_key` text NOT NULL,
	`cover_ext` text,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `books_owner_added` ON `books` (`owner_profile_id`,`added_at`);--> statement-breakpoint
CREATE INDEX `books_owner_isbn` ON `books` (`owner_profile_id`,`isbn`);--> statement-breakpoint
CREATE INDEX `books_owner_match` ON `books` (`owner_profile_id`,`match_key`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`sha256` text NOT NULL,
	`format` text NOT NULL,
	`original_name` text NOT NULL,
	`size` integer NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `files_book` ON `files` (`book_id`);--> statement-breakpoint
CREATE INDEX `files_sha256` ON `files` (`sha256`);