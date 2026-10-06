CREATE TABLE response_rules (
  id TEXT PRIMARY KEY,
  bin_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  conditions TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL DEFAULT '',
  response_content_type TEXT NOT NULL DEFAULT 'text/plain; charset=utf-8',
  response_headers TEXT NOT NULL DEFAULT '{}',
  response_delay_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (bin_id) REFERENCES bins(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX response_rules_bin_priority_idx ON response_rules(bin_id, priority);

ALTER TABLE requests ADD COLUMN matched_rule_id TEXT;
ALTER TABLE requests ADD COLUMN matched_rule_revision INTEGER;
