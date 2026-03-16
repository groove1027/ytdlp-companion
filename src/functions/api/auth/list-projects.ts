import type { Env } from './_types';
import { ensureProjectsTable, validateSession, HEADERS } from './_syncHelpers';

/**
 * POST /api/auth/list-projects
 * 사용자의 클라우드 프로젝트 목록 조회
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { token } = await context.request.json() as { token: string };

    const result = await validateSession(context.env, token);
    if (result instanceof Response) return result;
    const { email } = result;

    await ensureProjectsTable(context.env.DB);

    const { results } = await context.env.DB.prepare(`
      SELECT id, title, r2_size_bytes, scene_count, completed_images,
             completed_videos, mode, aspect_ratio, thumbnail_url,
             pipeline_steps_json, last_modified, created_at, synced_at
      FROM user_projects
      WHERE email = ? AND is_deleted = 0
      ORDER BY last_modified DESC
    `).bind(email).all();

    const projects = (results || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      r2SizeBytes: row.r2_size_bytes,
      sceneCount: row.scene_count,
      completedImages: row.completed_images,
      completedVideos: row.completed_videos,
      mode: row.mode,
      aspectRatio: row.aspect_ratio,
      thumbnailUrl: row.thumbnail_url,
      pipelineSteps: JSON.parse((row.pipeline_steps_json as string) || '{}'),
      lastModified: row.last_modified,
      createdAt: row.created_at,
      syncedAt: row.synced_at,
    }));

    return new Response(
      JSON.stringify({ projects }),
      { status: 200, headers: HEADERS },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: HEADERS });
  }
};
