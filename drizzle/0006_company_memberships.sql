CREATE TABLE card_company_access (
 id TEXT PRIMARY KEY NOT NULL,
 studio_owner_id TEXT NOT NULL,
 company_id TEXT NOT NULL,
 email TEXT NOT NULL,
 user_id TEXT,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','employee')),
 profile_id TEXT,
 group_ids TEXT NOT NULL,
 editable_fields TEXT NOT NULL,
 permissions TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 mutation_token TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(studio_owner_id,company_id,email),
 UNIQUE(studio_owner_id,company_id,user_id)
);
--> statement-breakpoint
CREATE INDEX card_company_access_email_idx ON card_company_access(email,enabled);
--> statement-breakpoint
CREATE UNIQUE INDEX card_company_employee_profile_idx ON card_company_access(studio_owner_id,company_id,profile_id) WHERE role='employee' AND enabled=1;

