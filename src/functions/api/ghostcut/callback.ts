/**
 * Cloudflare Pages Function — GhostCut 콜백 수신기
 * GhostCut 처리 완료 시 이 엔드포인트로 결과를 POST
 * 결과를 KV에 저장하여 클라이언트가 poll 엔드포인트로 조회
 *
 * GhostCut processStatus 값:
 *   1 = 성공 (Successful)
 *   그 외 = 실패 (Failed / Error)
 *
 * GhostCut은 callback-sign 헤더로 서명을 전송함 (검증용)
 */

interface Env {
  GHOSTCUT_TASKS: KVNamespace;
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

    // callback-sign 헤더 존재 여부 확인 (GhostCut이 보내는 서명)
    // 서명이 없는 요청은 위조 가능성 — 로그만 남기고 처리는 진행
    // (appSecret이 서버에 없으므로 서명 검증은 불가, 존재 여부로 기본 필터링)
    const callbackSign = context.request.headers.get('callback-sign');
    if (!callbackSign) {
      console.warn(`[GhostCut Callback] No callback-sign header for project ${projectId}`);
    }

    // processStatus 매핑
    // 1 = 성공, 그 외(0, 2, 3, ...) = 실패 또는 미완료
    const isSuccess = data.processStatus === 1;
    const statusLabel = isSuccess ? 'done' : 'failed';

    const errorDetail = isSuccess
      ? ''
      : data.errorDetail
        || data.processStatusEnum?.descriptionEn
        || data.processStatusEnum?.description
        || `처리 실패 (status: ${data.processStatus})`;

    // KV 바인딩 확인
    if (!context.env.GHOSTCUT_TASKS) {
      console.error('[GhostCut Callback] GHOSTCUT_TASKS KV not bound!');
      return new Response('KV not configured', { status: 503 });
    }

    // KV에 결과 저장 (TTL: 2시간 — 사용자가 다운로드할 충분한 시간)
    await context.env.GHOSTCUT_TASKS.put(
      `project:${projectId}`,
      JSON.stringify({
        status: statusLabel,
        progress: data.processProgress ?? 0,
        videoUrl: data.videoUrl || '',
        errorDetail,
        taskId: data.id,
        duration: data.duration,
        fileSize: data.fileSize,
        timestamp: Date.now(),
      }),
      { expirationTtl: 7200 }
    );

    return new Response('OK', { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GhostCut Callback] Error:', msg);
    return new Response(msg, { status: 500 });
  }
};
