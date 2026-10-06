ALTER TABLE bins ADD COLUMN forwarding_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bins ADD COLUMN forwarding_url TEXT;

ALTER TABLE requests ADD COLUMN forward_status TEXT;
ALTER TABLE requests ADD COLUMN forward_status_code INTEGER;
ALTER TABLE requests ADD COLUMN forward_error TEXT;
ALTER TABLE requests ADD COLUMN forwarded_at TEXT;
ALTER TABLE requests ADD COLUMN forward_duration_ms INTEGER;
