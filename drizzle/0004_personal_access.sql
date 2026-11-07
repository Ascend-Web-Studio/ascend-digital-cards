CREATE TABLE card_personal_access (
 id TEXT PRIMARY KEY NOT NULL,
 studio_owner_id TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 user_id TEXT UNIQUE,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 mutation_token TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX card_personal_access_owner_idx ON card_personal_access(studio_owner_id,email);

