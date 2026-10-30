CREATE TABLE `shelf_books` (
	`shelf_id` text NOT NULL,
	`book_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`shelf_id`, `book_id`),
	FOREIGN KEY (`shelf_id`) REFERENCES `shelves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shelf_books_book` ON `shelf_books` (`book_id`);--> statement-breakpoint
CREATE TABLE `shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shelves_profile_name` ON `shelves` (`profile_id`,`name_key`);