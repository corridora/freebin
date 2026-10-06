CREATE TABLE IF NOT EXISTS forward_attempts (
  id TEXT PRIMARY KEY,
  bin_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  target_url TEXT,
  status TEXT NOT NULL,
  response_status INTEGER,
  error TEXT,
  duration_ms INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (bin_id) REFERENCES bins(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  UNIQUE (request_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS forward_attempts_request_number_idx
  ON forward_attempts(request_id, attempt_number DESC);

-- Preserve the latest result recorded before attempt history existed. The exact
-- historical destination was not retained, so target_url is intentionally null.
INSERT OR IGNORE INTO forward_attempts
  (id, bin_id, request_id, attempt_number, target_url, status, response_status,
   error, duration_ms, started_at, completed_at)
SELECT lower(hex(randomblob(16))), bin_id, id, 1, NULL, forward_status,
  forward_status_code, forward_error, forward_duration_ms,
  COALESCE(forwarded_at, created_at), forwarded_at
FROM requests
WHERE forward_status IS NOT NULL;
