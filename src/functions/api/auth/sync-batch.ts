import type { Env } from './_types';
import { ensureProjectsTable, validateSession, HEADERS } from './_syncHelpers';

interface LocalProject {
  id: string;
  lastModified: number;
}

/**
 * POST /api/auth/sync-batch
 * 로컬 프로젝트 목록과 클라우드 비교 → 업로드/다운로드 필요 목록 반환
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { token, projects } = await context.request.json() as {
      token: string;
      projects: LocalProject[];
    };

    const result = await validateSession(context.env, token);
    if (result instanceof Response) return result;
    const { email } = result;

    await ensureProjectsTable(context.env.DB);

    // 클라우드의 전체 프로젝트 조회
    const { results } = await context.env.DB.prepare(
      'SELECT id, last_modified, is_deleted FROM user_projects WHERE email = ?'
    ).bind(email).all();

    const cloudMap = new Map<string, { lastModified: number; isDeleted: boolean }>();
    for (const row of (results || [])) {
      cloudMap.set(
        row.id as string,
        { lastModified: row.last_modified as number, isDeleted: !!(row.is_deleted as number) },
      );
    }

    const localMap = new Map<string, number>();
    for (const p of (projects || [])) {
      localMap.set(p.id, p.lastModified);
    }

    const needsUpload: string[] = [];
    const needsDownload: string[] = [];
    const deleted: string[] = [];

    // 로컬 프로젝트 검사
    for (const [id, localMod] of localMap) {
      const cloud = cloudMap.get(id);
      if (!cloud) {
        // 클라우드에 없음 → 업로드 필요
        needsUpload.push(id);
      } else if (cloud.isDeleted) {
        // 클라우드에서 삭제됨
        deleted.push(id);
      } else if (localMod > cloud.lastModified) {
        // 로컬이 더 최신 → 업로드
        needsUpload.push(id);
      } else if (cloud.lastModified > localMod) {
        // 클라우드가 더 최신 → 다운로드
        needsDownload.push(id);
      }
      // 같으면 동기화 완료 → 아무 것도 안 함
    }

    // 클라우드에만 있는 프로젝트 검사
    for (const [id, cloud] of cloudMap) {
      if (!localMap.has(id) && !cloud.isDeleted) {
        needsDownload.push(id);
      }
    }

    return new Response(
      JSON.stringify({ needsUpload, needsDownload, deleted }),
      { status: 200, headers: HEADERS },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: HEADERS });
  }
};
