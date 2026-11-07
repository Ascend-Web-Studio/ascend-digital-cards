CREATE TABLE card_studio_owner (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  owner_id TEXT NOT NULL UNIQUE
);
INSERT INTO card_studio_owner (singleton,owner_id)
SELECT 1,owner_id FROM card_workspaces ORDER BY updated_at DESC LIMIT 1;
CREATE TABLE card_manager_access (
  id TEXT PRIMARY KEY CHECK (id = 'manager'),
  owner_id TEXT NOT NULL,
  email TEXT NOT NULL,
  user_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  company_ids TEXT NOT NULL,
  permissions TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
