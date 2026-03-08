import type { Env } from './_types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token, displayName } = await context.request.json() as {
      token: string; displayName: string;
    };

    if (!token) {
      return new Response(
        JSON.stringify({ error: '토큰이 없습니다.' }),
        { status: 401, headers }
      );
    }

    if (!displayName || displayName.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: '이름을 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    if (displayName.trim().length > 30) {
      return new Response(
        JSON.stringify({ error: '이름은 30자 이하로 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    // 세션 확인
    const session = await context.env.SESSIONS.get(token);
    if (!session) {
      return new Response(
        JSON.stringify({ error: '만료되었거나 유효하지 않은 토큰입니다.' }),
        { status: 401, headers }
      );
    }

    const sessionData = JSON.parse(session) as { email: string; displayName: string; createdAt: string };

    // DB 업데이트
    await context.env.DB.prepare(
      'UPDATE users SET display_name = ? WHERE email = ?'
    ).bind(displayName.trim(), sessionData.email).run();

    // 세션 데이터도 갱신 (기존 TTL 유지 불가 — KV는 남은 TTL 조회 불가이므로 7일로 재설정)
    sessionData.displayName = displayName.trim();
    await context.env.SESSIONS.put(token, JSON.stringify(sessionData), {
      expirationTtl: 60 * 60 * 24 * 7,
    });

    return new Response(
      JSON.stringify({ success: true, displayName: displayName.trim() }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
