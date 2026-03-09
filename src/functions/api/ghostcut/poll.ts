/**
 * Cloudflare Pages Function — GhostCut 작업 결과 폴링
 * 클라이언트가 projectId로 폴링 → KV에서 결과 조회
 */

interface Env {
  GHOSTCUT_TASKS: KVNamespace;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

    const result = await context.env.GHOSTCUT_TASKS.get(`project:${projectId}`);

    if (!result) {
      // 아직 콜백 미수신 — 처리 중
      return new Response(
        JSON.stringify({ status: 'processing' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = JSON.parse(result);
    return new Response(
      JSON.stringify(data),
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
