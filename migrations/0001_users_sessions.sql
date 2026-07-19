-- Issue #21 step 1: auth foundation.
-- Everything is private per-user; feature tables (saved_filters, tags,
-- collections, notes) arrive in later migrations per the build order.

CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  gh_id       INTEGER NOT NULL UNIQUE,     -- GitHub numeric user id (stable across renames)
  login       TEXT    NOT NULL,            -- GitHub login (may change; display only)
  name        TEXT,
  avatar_url  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT   NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id          TEXT    PRIMARY KEY,         -- opaque random token (the cookie value)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
