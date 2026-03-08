export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  INVITE_CODES: KVNamespace;
  FIREBASE_API_KEY: string;
  KAKAO_CLIENT_SECRET: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
}

export interface InviteCodeData {
  maxUses: number;
  currentUses: number;
  label: string;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  invite_code: string;
  created_at: string;
  last_login: string | null;
}
