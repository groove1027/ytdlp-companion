import type { Env } from './_types';

/**
 * POST /api/auth/get-settings
 * 사용자의 저장된 API 키 설정을 D1에서 조회합니다.
 *
 * 요청: { token }
 * 응답: { settings: { kie, evolink, cloudName, ... } } 또는 { settings: null }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token } = await context.request.json() as { token: string };

    if (!token) {
      return new Response(
        JSON.stringify({ error: '토큰이 없습니다.' }),
        { status: 401, headers }
      );
    }

    // 세션 검증
    const session = await context.env.SESSIONS.get(token);
    if (!session) {
      return new Response(
        JSON.stringify({ error: '만료되었거나 유효하지 않은 토큰입니다.' }),
        { status: 401, headers }
      );
    }

    const { email } = JSON.parse(session) as { email: string };

    // user_settings 조회
    const row = await context.env.DB.prepare(
      'SELECT settings_json FROM user_settings WHERE email = ?'
    ).bind(email).first<{ settings_json: string }>();

    if (!row) {
      return new Response(
        JSON.stringify({ settings: null }),
        { status: 200, headers }
      );
    }

    const settings = JSON.parse(row.settings_json);

    return new Response(
      JSON.stringify({ settings }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
