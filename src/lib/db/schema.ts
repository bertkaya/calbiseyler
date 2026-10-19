export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  display_name TEXT,
  learning_paused INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS taste_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  principles TEXT NOT NULL DEFAULT '[]',
  discovery INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL,
  interpretation TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  dna TEXT NOT NULL,
  stats TEXT NOT NULL,
  flow_target TEXT NOT NULL DEFAULT '[]',
  suggestions TEXT NOT NULL DEFAULT '[]',
  warnings TEXT NOT NULL DEFAULT '[]',
  saved INTEGER NOT NULL DEFAULT 0,
  share_id TEXT UNIQUE,
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  track_id TEXT NOT NULL,
  role TEXT NOT NULL,
  transition_in REAL,
  locked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playlist_id, position)
);

CREATE TABLE IF NOT EXISTS music_tracks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS music_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS provider_connections (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  expires_at INTEGER NOT NULL,
  account_id TEXT,
  account_name TEXT,
  scope TEXT,
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE IF NOT EXISTS provider_matches (
  track_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  data TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (track_id, provider)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playlist_id TEXT,
  track_id TEXT,
  artist TEXT,
  kind TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS playlist_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  snapshot TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_playlist ON playlist_sessions(playlist_id, id DESC);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playlist_id TEXT,
  text TEXT NOT NULL,
  signals TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

INSERT OR IGNORE INTO music_providers (id, name, kind) VALUES
  ('catalog', 'Sommelier Catalog', 'metadata'),
  ('deezer', 'Deezer', 'public'),
  ('spotify', 'Spotify', 'streaming'),
  ('apple', 'Apple Music', 'streaming'),
  ('youtube', 'YouTube Music', 'streaming');
`;
