-- Users store streamer accounts and overlay settings
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  overlay_token TEXT UNIQUE NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Submissions are GIF uploads awaiting moderation
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  streamer_id TEXT NOT NULL,
  uploader_name TEXT NOT NULL,
  message TEXT,
  file_key TEXT NOT NULL UNIQUE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  denied_at TEXT,
  layout TEXT,
  FOREIGN KEY(streamer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_streamer_status
  ON submissions(streamer_id, status);

CREATE INDEX IF NOT EXISTS idx_submissions_expires_at
  ON submissions(expires_at);
