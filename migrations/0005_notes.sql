-- Issue #21 step 5: private per-user notes on outputs, labs, or collections.
-- Flat (no threading — private). target may also be 'collection:<id>'.
CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target      TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notes_user_target ON notes(user_id, target);
