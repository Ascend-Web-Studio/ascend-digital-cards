CREATE TABLE card_company_records (
 owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(owner_id,id)
);
--> statement-breakpoint
CREATE TABLE card_group_records (
 owner_id TEXT NOT NULL, id TEXT NOT NULL, company_id TEXT NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,company_id) REFERENCES card_company_records(owner_id,id)
);
--> statement-breakpoint
CREATE TABLE card_profile_records (
 owner_id TEXT NOT NULL, id TEXT NOT NULL, company_id TEXT NOT NULL,
 name TEXT NOT NULL, role TEXT NOT NULL, email TEXT NOT NULL, archived INTEGER NOT NULL,
 payload TEXT NOT NULL, PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,company_id) REFERENCES card_company_records(owner_id,id)
);
--> statement-breakpoint
CREATE INDEX card_profile_company_idx ON card_profile_records(owner_id,company_id,archived,id);
--> statement-breakpoint
CREATE TABLE card_projection_versions (owner_id TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE card_personal_profiles (
 owner_id TEXT PRIMARY KEY NOT NULL, id TEXT UNIQUE NOT NULL,
 draft TEXT NOT NULL, live TEXT, version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL, published_at TEXT, save_token TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE card_personal_limits (
 owner_id TEXT PRIMARY KEY NOT NULL, window INTEGER NOT NULL, requests INTEGER NOT NULL
);

