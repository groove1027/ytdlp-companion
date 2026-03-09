/**
 * Cloudflare Pages Function — GhostCut 콜백 수신기
 * GhostCut 처리 완료 시 이 엔드포인트로 결과를 POST
 * 결과를 D1에 저장하여 클라이언트가 poll 엔드포인트로 조회
 *
 * GhostCut processStatus 값:
 *   1 = 성공 (Successful)
 *   그 외 = 실패 (Failed / Error)
 */

interface Env {
  DB: D1Database;
}

interface GhostCutCallback {
  idProject: number;
  id: number;
  processStatus: number;
  processProgress: number;
  processStatusEnum?: {
    code: number;
    description: string;
    descriptionEn: string;
  };
  videoUrl?: string;
  errorDetail?: string;
  coverUrl?: string;
  duration?: number;
  fileSize?: number;
}

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
    const rawBody = await context.request.text();
    let data: GhostCutCallback;

    try {
      data = JSON.parse(rawBody);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const projectId = data.idProject;
    if (!projectId) {
      return new Response('Missing idProject', { status: 400 });
    }

    // callback-sign 헤더 존재 여부 확인
    const callbackSign = context.request.headers.get('callback-sign');
    if (!callbackSign) {
      console.warn(`[GhostCut Callback] No callback-sign header for project ${projectId}`);
    }

    // processStatus 매핑: 1 = 성공, 그 외 = 실패
    const isSuccess = data.processStatus === 1;
    const statusLabel = isSuccess ? 'done' : 'failed';

    const errorDetail = isSuccess
      ? ''
      : data.errorDetail
        || data.processStatusEnum?.descriptionEn
        || data.processStatusEnum?.description
        || `처리 실패 (status: ${data.processStatus})`;

    // D1에 결과 저장
    await ensureTable(context.env.DB);
    await context.env.DB.prepare(`
      INSERT OR REPLACE INTO ghostcut_tasks
        (project_id, status, progress, video_url, error_detail, task_id, duration, file_size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      projectId,
      statusLabel,
      data.processProgress ?? 0,
      data.videoUrl || '',
      errorDetail,
      data.id,
      data.duration ?? null,
      data.fileSize ?? null,
      Math.floor(Date.now() / 1000),
    ).run();

    console.log(`[GhostCut Callback] project ${projectId} → ${statusLabel}`);
    return new Response('OK', { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GhostCut Callback] Error:', msg);
    return new Response(msg, { status: 500 });
  }
};
