CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  storage_limit_bytes INTEGER NOT NULL DEFAULT 5242880,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS bins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  response_status INTEGER NOT NULL DEFAULT 200,
  response_body TEXT NOT NULL DEFAULT '{"ok":true,"captured":true}',
  response_content_type TEXT NOT NULL DEFAULT 'application/json; charset=utf-8',
  response_headers TEXT NOT NULL DEFAULT '{}',
  user_id TEXT,
  is_public_demo INTEGER NOT NULL DEFAULT 0,
  public_share_token TEXT UNIQUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS bins_owner_idx ON bins(owner_token_hash);
CREATE INDEX IF NOT EXISTS bins_public_demo_idx ON bins(is_public_demo, created_at);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  bin_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query TEXT NOT NULL,
  headers TEXT NOT NULL,
  body TEXT,
  content_type TEXT,
  remote_address TEXT,
  created_at TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  public_share_token TEXT UNIQUE,
  FOREIGN KEY (bin_id) REFERENCES bins(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS requests_bin_created_idx ON requests(bin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_bin_size_idx ON requests(bin_id, created_at, size_bytes);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_start);
