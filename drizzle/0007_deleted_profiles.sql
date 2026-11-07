-- Retain only opaque IDs to prevent stale saves/backups restoring deleted profiles.
CREATE TABLE IF NOT EXISTS card_deleted_profiles (
  owner_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, profile_id)
);
