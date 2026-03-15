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

-- API 키 설정 저장 (로그인 사용자의 키를 서버에 백업/복원)
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_settings_email ON user_settings(email);
