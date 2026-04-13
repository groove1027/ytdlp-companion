import type { Env } from './_types';
import { ensureProjectsTable, validateSession, HEADERS } from './_syncHelpers';

interface SyncProjectRequest {
  token: string;
  project: Record<string, unknown>;
  summary: {
    sceneCount: number;
    completedImages: number;
    completedVideos: number;
    mode: string;
    aspectRatio: string;
    thumbnailUrl: string;
    pipelineSteps: Record<string, boolean>;
  };
}

/**
 * POST /api/auth/sync-project
 * 단일 프로젝트를 클라우드에 업로드 (D1 메타데이터 + R2 프로젝트 JSON)
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { token, project, summary } = await context.request.json() as SyncProjectRequest;

    const result = await validateSession(context.env, token);
    if (result instanceof Response) return result;
    const { email } = result;

    if (!project || !project.id) {
      return new Response(
        JSON.stringify({ error: '프로젝트 데이터가 필요합니다.' }),
        { status: 400, headers: HEADERS },
      );
    }

    await ensureProjectsTable(context.env.DB);

    const projectId = project.id as string;
    const lastModified = (project.lastModified as number) || Date.now();
    const createdAt = (project.createdAt as number) || lastModified;
    const title = (project.title as string) || '';
    const r2Key = `${email}/${projectId}.json`;

    // 삭제된 프로젝트는 싱크 거부 — 좀비 부활 방지 (#1164)
    const existingProject = await context.env.DB.prepare(
      'SELECT is_deleted FROM user_projects WHERE email = ? AND id = ?'
    ).bind(email, projectId).first() as { is_deleted: number } | null;

    if (existingProject?.is_deleted) {
      return new Response(
        JSON.stringify({ error: '삭제된 프로젝트는 다시 업로드할 수 없습니다.' }),
        { status: 409, headers: HEADERS },
      );
    }

    // R2에 프로젝트 JSON 업로드
    const projectJson = JSON.stringify(project);
    await context.env.PROJECT_STORAGE.put(r2Key, projectJson, {
      httpMetadata: { contentType: 'application/json' },
    });

    // D1에 메타데이터 UPSERT
    await context.env.DB.prepare(`
      INSERT INTO user_projects (
        id, email, title, r2_key, r2_size_bytes,
        scene_count, completed_images, completed_videos,
        mode, aspect_ratio, thumbnail_url, pipeline_steps_json,
        last_modified, created_at, synced_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)
      ON CONFLICT(email, id) DO UPDATE SET
        title = excluded.title,
        r2_key = excluded.r2_key,
        r2_size_bytes = excluded.r2_size_bytes,
        scene_count = excluded.scene_count,
        completed_images = excluded.completed_images,
        completed_videos = excluded.completed_videos,
        mode = excluded.mode,
        aspect_ratio = excluded.aspect_ratio,
        thumbnail_url = excluded.thumbnail_url,
        pipeline_steps_json = excluded.pipeline_steps_json,
        last_modified = excluded.last_modified,
        synced_at = datetime('now')
    `).bind(
      projectId, email, title, r2Key, projectJson.length,
      summary?.sceneCount ?? 0,
      summary?.completedImages ?? 0,
      summary?.completedVideos ?? 0,
      summary?.mode ?? 'SCRIPT',
      summary?.aspectRatio ?? '9:16',
      summary?.thumbnailUrl ?? '',
      JSON.stringify(summary?.pipelineSteps ?? {}),
      lastModified, createdAt,
    ).run();

    return new Response(
      JSON.stringify({ status: 'ok', syncedAt: new Date().toISOString() }),
      { status: 200, headers: HEADERS },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: HEADERS });
  }
};
