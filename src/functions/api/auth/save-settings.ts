import type { Env } from './_types';

/**
 * POST /api/auth/save-settings
 * 사용자의 API 키 설정을 D1에 저장합니다.
 *
 * 요청: { token, settings: { kie, evolink, cloudName, ... } }
 * 응답: { success: true }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token, settings } = await context.request.json() as {
      token: string;
      settings: Record<string, string>;
    };

    if (!token) {
      return new Response(
        JSON.stringify({ error: '토큰이 없습니다.' }),
        { status: 401, headers }
      );
    }

    if (!settings || typeof settings !== 'object') {
      return new Response(
        JSON.stringify({ error: '설정 데이터가 필요합니다.' }),
        { status: 400, headers }
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

    // user_settings 테이블에 UPSERT (없으면 INSERT, 있으면 UPDATE)
    const settingsJson = JSON.stringify(settings);

    await context.env.DB.prepare(
      `INSERT INTO user_settings (email, settings_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         settings_json = excluded.settings_json,
         updated_at = excluded.updated_at`
    ).bind(email, settingsJson).run();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
