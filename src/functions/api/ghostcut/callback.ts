/**
 * Cloudflare Pages Function — GhostCut 콜백 수신기
 * GhostCut 처리 완료 시 이 엔드포인트로 결과를 POST
 * 결과를 KV에 저장하여 클라이언트가 poll 엔드포인트로 조회
 */

interface Env {
  GHOSTCUT_TASKS: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const data = await context.request.json() as {
      idProject: number;
      id: number;
      processStatus: number;
      processProgress: number;
      videoUrl?: string;
      errorDetail?: string;
    };

    const projectId = data.idProject;
    if (!projectId) {
      return new Response('Missing idProject', { status: 400 });
    }

    // KV에 결과 저장 (TTL: 1시간)
    await context.env.GHOSTCUT_TASKS.put(
      `project:${projectId}`,
      JSON.stringify({
        status: data.processStatus === 1 ? 'done' : 'failed',
        progress: data.processProgress,
        videoUrl: data.videoUrl || '',
        errorDetail: data.errorDetail || '',
        taskId: data.id,
        timestamp: Date.now(),
      }),
      { expirationTtl: 3600 }
    );

    return new Response('OK', { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(msg, { status: 500 });
  }
};
