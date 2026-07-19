-- Issue #21 step 3: per-user tags on outputs and labs.
-- target = 'output:<labSlug>/<slug>' (canonical _labSlug for multi-lab outputs)
-- or 'lab:<slug>'. tag = normalized 'prefix:value' or bare (prefix parsed on read).

CREATE TABLE tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target      TEXT    NOT NULL,
  tag         TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, target, tag)
);
CREATE INDEX idx_tags_user ON tags(user_id);
CREATE INDEX idx_tags_user_target ON tags(user_id, target);
