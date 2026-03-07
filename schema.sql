-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  invite_code TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

-- 이메일 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
