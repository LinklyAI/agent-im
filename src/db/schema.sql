CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  role TEXT DEFAULT 'agent',
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  participants TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  read_by TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES threads(id),
  FOREIGN KEY (sender) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
