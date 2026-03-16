import type { Env } from './_types';

const HEADERS = { 'Content-Type': 'application/json' };

/** user_projects 테이블 자동 생성 (첫 요청 시) */
export const ensureProjectsTable = async (db: D1Database): Promise<void> => {
  await db.prepare(`
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
    )
  `).run();
};

/** 세션 토큰 검증 → email 반환. 실패 시 Response 반환 */
export const validateSession = async (
  env: Env,
  token: string | undefined,
): Promise<{ email: string } | Response> => {
  if (!token) {
    return new Response(
      JSON.stringify({ error: '토큰이 없습니다.' }),
      { status: 401, headers: HEADERS },
    );
  }

  const session = await env.SESSIONS.get(token);
  if (!session) {
    return new Response(
      JSON.stringify({ error: '만료되었거나 유효하지 않은 토큰입니다.' }),
      { status: 401, headers: HEADERS },
    );
  }

  const { email } = JSON.parse(session) as { email: string };
  return { email };
};

export { HEADERS };
