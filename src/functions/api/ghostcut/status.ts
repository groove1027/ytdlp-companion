/**
 * Cloudflare Pages Function — GhostCut 상태 조회 프록시
 * 브라우저 → /api/ghostcut/status → api.zhaoli.com (CORS 우회)
 */

const GHOSTCUT_STATUS_URL = 'https://api.zhaoli.com/v-w-c/gateway/ve/work/state';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, AppKey, AppSign',
};

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = await context.request.text();
    const appKey = context.request.headers.get('AppKey') || '';
    const appSign = context.request.headers.get('AppSign') || '';

    const response = await fetch(GHOSTCUT_STATUS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AppKey': appKey,
        'AppSign': appSign,
      },
      body,
    });

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders });
};
