import type { Env } from './_types';
import { ensureProjectsTable, validateSession, HEADERS } from './_syncHelpers';

/**
 * POST /api/auth/delete-project-cloud
 * 클라우드에서 프로젝트 소프트 삭제 + R2 오브젝트 삭제
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

    // R2 키 조회 후 오브젝트 삭제
    const row = await context.env.DB.prepare(
      'SELECT r2_key FROM user_projects WHERE email = ? AND id = ?'
    ).bind(email, projectId).first() as { r2_key: string } | null;

    if (row?.r2_key) {
      await context.env.PROJECT_STORAGE.delete(row.r2_key).catch(() => {});
    }

    // D1에서 소프트 삭제
    await context.env.DB.prepare(
      `UPDATE user_projects SET is_deleted = 1, synced_at = datetime('now')
       WHERE email = ? AND id = ?`
    ).bind(email, projectId).run();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: HEADERS },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: HEADERS });
  }
};
