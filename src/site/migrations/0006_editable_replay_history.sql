CREATE TABLE replay_attempts (
  id TEXT PRIMARY KEY,
  bin_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  target_url TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query TEXT NOT NULL,
  headers TEXT NOT NULL,
  body TEXT,
  response_status INTEGER,
  response_status_text TEXT,
  error TEXT,
  duration_ms INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (bin_id) REFERENCES bins(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE INDEX replay_attempts_request_created_idx ON replay_attempts(request_id, created_at DESC);
