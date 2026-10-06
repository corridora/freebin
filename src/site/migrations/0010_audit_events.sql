CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  bin_id TEXT NOT NULL,
  owner_user_id TEXT,
  actor_user_id TEXT,
  actor_email TEXT,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_bin_created_idx
  ON audit_events(bin_id, created_at DESC);
