-- Cache fetched favicons by domain
CREATE TABLE IF NOT EXISTS favicon_cache (
  domain     TEXT PRIMARY KEY,
  icon_path  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
