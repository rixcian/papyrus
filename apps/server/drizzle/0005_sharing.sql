CREATE TABLE `book_shares` (
	`book_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`shared_at` integer NOT NULL,
	PRIMARY KEY(`book_id`, `profile_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `book_shares_profile` ON `book_shares` (`profile_id`);--> statement-breakpoint
CREATE TABLE `hidden_books` (
	`profile_id` text NOT NULL,
	`book_id` text NOT NULL,
	`hidden_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `book_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `books` ADD `share_mode` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD `shared_at` integer;