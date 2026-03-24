-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  invite_code TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'basic',
  tier_expires_at TEXT,
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

-- [마이그레이션] 기존 users 테이블에 tier 컬럼 추가 (D1은 IF NOT EXISTS 미지원이므로 에러 무시)
-- Cloudflare D1 콘솔에서 직접 실행 필요:
-- ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'basic';
-- ALTER TABLE users ADD COLUMN tier_expires_at TEXT;

-- 프로젝트 클라우드 동기화 (R2 메타데이터 인덱스)
-- 실제 생성은 _syncHelpers.ts의 ensureProjectsTable()에서 자동 수행
CREATE TABLE IF NOT EXISTS user_projects (
  id TEXT NOT NULL,
  email TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL,
  r2_size_bytes INTEGER DEFAULT 0,
  scene_count INTEGER DEFAULT 0,
  completed_images INTEGER DEFAULT 0,
  completed_videos INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'SCRIPT',
  aspect_ratio TEXT DEFAULT '9:16',
  thumbnail_url TEXT DEFAULT '',
  pipeline_steps_json TEXT DEFAULT '{}',
  last_modified INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  synced_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0,
  PRIMARY KEY (email, id)
);
