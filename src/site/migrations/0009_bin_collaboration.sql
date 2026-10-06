CREATE TABLE IF NOT EXISTS bin_collaborators (
  id TEXT PRIMARY KEY,
  bin_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  invited_by_user_id TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (bin_id) REFERENCES bins(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (bin_id, user_id)
);

CREATE INDEX IF NOT EXISTS bin_collaborators_user_idx
  ON bin_collaborators(user_id, bin_id);
