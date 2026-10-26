CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`inspection_id` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `action_owner` ON `actions` (`owner`);--> statement-breakpoint
CREATE INDEX `action_inspection` ON `actions` (`inspection_id`);--> statement-breakpoint
CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_owner` ON `activities` (`owner`);--> statement-breakpoint
CREATE INDEX `activity_project` ON `activities` (`project_id`);--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inspection_owner` ON `inspections` (`owner`);--> statement-breakpoint
CREATE INDEX `inspection_activity` ON `inspections` (`activity_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_owner` ON `projects` (`owner`);