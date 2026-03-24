export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  INVITE_CODES: KVNamespace;
  PROJECT_STORAGE: R2Bucket;
  FIREBASE_API_KEY: string;
  KAKAO_CLIENT_SECRET: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
}

export type UserTier = 'basic' | 'premium' | 'trial';

export interface InviteCodeData {
  maxUses: number;
  currentUses: number;
  label: string;
  tier: UserTier;
  durationDays: number; // 0 = 무제한
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  invite_code: string;
  tier: UserTier;
  tier_expires_at: string | null; // ISO 8601 또는 null(무제한)
  created_at: string;
  last_login: string | null;
}

export interface SessionUser {
  email: string;
  displayName: string;
  tier: UserTier;
  tierExpiresAt: string | null;
  createdAt: string;
}
