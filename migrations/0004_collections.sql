-- Issue #21 step 4: per-user collections (named manual sets of items).
CREATE TABLE collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_collections_user ON collections(user_id);

CREATE TABLE collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  target        TEXT    NOT NULL,   -- 'output:<labSlug>/<slug>' | 'lab:<slug>'
  position      INTEGER NOT NULL DEFAULT 0,
  added_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (collection_id, target)   -- one membership per item per collection
);
