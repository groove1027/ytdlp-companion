import type { Env } from './_types';
import { ensureProjectsTable, validateSession, HEADERS } from './_syncHelpers';

/**
 * POST /api/auth/get-project
 * R2에서 프로젝트 전체 데이터 다운로드
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { token, projectId } = await context.request.json() as {
      token: string;
      projectId: string;
    };

    const result = await validateSession(context.env, token);
    if (result instanceof Response) return result;
    const { email } = result;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: '프로젝트 ID가 필요합니다.' }),
        { status: 400, headers: HEADERS },
      );
    }

    await ensureProjectsTable(context.env.DB);

    // D1에서 r2_key 조회 (email 검증 포함)
    const row = await context.env.DB.prepare(
      'SELECT r2_key FROM user_projects WHERE email = ? AND id = ? AND is_deleted = 0'
    ).bind(email, projectId).first() as { r2_key: string } | null;

    if (!row) {
      return new Response(
        JSON.stringify({ error: '프로젝트를 찾을 수 없습니다.' }),
        { status: 404, headers: HEADERS },
      );
    }

    // R2에서 프로젝트 JSON 읽기
    const r2Object = await context.env.PROJECT_STORAGE.get(row.r2_key);
    if (!r2Object) {
      return new Response(
        JSON.stringify({ error: 'R2에서 프로젝트 데이터를 찾을 수 없습니다.' }),
        { status: 404, headers: HEADERS },
      );
    }

    const projectJson = await r2Object.text();

    return new Response(projectJson, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: HEADERS });
  }
};
