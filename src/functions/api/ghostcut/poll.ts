/**
 * Cloudflare Pages Function — GhostCut 작업 결과 폴링
 * 클라이언트가 projectId로 폴링 → D1에서 결과 조회
 */

interface Env {
  DB: D1Database;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** D1 테이블 자동 생성 (최초 1회) */
const ensureTable = async (db: D1Database) => {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ghostcut_tasks (
      project_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'processing',
      progress INTEGER DEFAULT 0,
      video_url TEXT DEFAULT '',
      error_detail TEXT DEFAULT '',
      task_id INTEGER,
      duration REAL,
      file_size INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `).run();
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { projectId } = await context.request.json() as { projectId: number };
    if (!projectId) {
      return new Response(
        JSON.stringify({ status: 'error', message: 'Missing projectId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await ensureTable(context.env.DB);

    const row = await context.env.DB.prepare(
      'SELECT status, progress, video_url, error_detail, task_id, duration, file_size FROM ghostcut_tasks WHERE project_id = ?'
    ).bind(projectId).first<{
      status: string;
      progress: number;
      video_url: string;
      error_detail: string;
      task_id: number;
      duration: number;
      file_size: number;
    }>();

    if (!row) {
      // 아직 콜백 미수신 — 처리 중
      return new Response(
        JSON.stringify({ status: 'processing' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        status: row.status,
        progress: row.progress,
        videoUrl: row.video_url,
        errorDetail: row.error_detail,
        taskId: row.task_id,
        duration: row.duration,
        fileSize: row.file_size,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ status: 'error', message: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders });
};
