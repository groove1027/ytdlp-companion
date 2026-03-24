-- 마이그레이션: 초대코드 티어 시스템
-- Cloudflare D1 콘솔에서 실행:
-- wrangler d1 execute auth-db --remote --file=migrations/001_add_tier_columns.sql

ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE users ADD COLUMN tier_expires_at TEXT;
