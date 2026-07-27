-- Issue #52: opt-in public sharing of collections. Private by default —
-- is_public starts 0 for every existing and new row; public_id (the
-- unguessable share token, 32 hex chars) is minted server-side on first
-- publish and stays stable across private/public toggles, so re-sharing
-- restores previously circulated links.
-- Deploy ordering: apply this remotely BEFORE deploying worker code — the
-- collections API SELECTs these columns and would 500 against the old schema.
ALTER TABLE collections ADD COLUMN public_id TEXT;
ALTER TABLE collections ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_collections_public ON collections(public_id) WHERE public_id IS NOT NULL;
