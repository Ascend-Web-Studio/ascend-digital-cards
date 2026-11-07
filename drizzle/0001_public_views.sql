ALTER TABLE `card_workspaces` ADD `save_token` text;
--> statement-breakpoint
CREATE TABLE `card_public_views` (
 `view_key` text PRIMARY KEY NOT NULL,
 `owner_id` text NOT NULL,
 `payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `card_public_views_owner_idx` ON `card_public_views` (`owner_id`);
