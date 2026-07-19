-- Issue #21 step 2: per-user saved filter views.
-- `query` is the raw URLSearchParams string (the page's own serialized filter
-- state) — re-applied by navigating to page+?query so the page's native URL
-- restore runs (recovers timeline view/sort, not just filter dimensions).

CREATE TABLE saved_filters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  page        TEXT    NOT NULL,     -- 'home' | 'timeline' | 'lab:<slug>'
  query       TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_saved_filters_user ON saved_filters(user_id, page);
