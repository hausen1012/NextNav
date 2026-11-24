-- NextNav initial schema.
-- Authoritative field documentation lives in docs/DATA_MODEL.md.

CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE admin (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE api_token (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  token_hash   TEXT    NOT NULL,
  prefix       TEXT    NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE category (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  icon_path  TEXT,
  parent_id  INTEGER REFERENCES category(id) ON DELETE CASCADE,
  sort       INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
  is_sample  INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_category_parent_sort ON category(parent_id, sort);

CREATE TABLE link (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id     INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  url             TEXT    NOT NULL,
  backup_url      TEXT,
  description     TEXT,
  icon_path       TEXT,
  icon_source     TEXT CHECK (icon_source IN ('upload', 'fetched', 'placeholder')),
  sort            INTEGER NOT NULL DEFAULT 0,
  is_private      INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
  is_sample       INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  click_count     INTEGER NOT NULL DEFAULT 0,
  last_clicked_at INTEGER,
  last_status     TEXT    NOT NULL DEFAULT 'unknown'
                          CHECK (last_status IN ('ok', 'warn', 'dead', 'unknown')),
  last_checked_at INTEGER,
  title_norm      TEXT    NOT NULL,
  host            TEXT    NOT NULL,
  pinyin_full     TEXT    NOT NULL DEFAULT '',
  pinyin_short    TEXT    NOT NULL DEFAULT '',
  search_text     TEXT    NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_link_category_sort ON link(category_id, sort);
CREATE INDEX idx_link_search        ON link(search_text);
CREATE INDEX idx_link_status        ON link(last_status);

CREATE TABLE link_check (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id     INTEGER NOT NULL REFERENCES link(id) ON DELETE CASCADE,
  ok          INTEGER NOT NULL CHECK (ok IN (0, 1)),
  http_status INTEGER,
  latency_ms  INTEGER,
  error_type  TEXT CHECK (error_type IN
                ('dns', 'timeout', 'tls', 'http', 'refused', 'redirect', 'other')),
  checked_at  INTEGER NOT NULL
);

CREATE INDEX idx_check_link_time ON link_check(link_id, checked_at DESC);