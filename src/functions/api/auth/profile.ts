import type { Env } from './_types';

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

    // 세션 확인
    const session = await context.env.SESSIONS.get(token);
    if (!session) {
      return new Response(
        JSON.stringify({ error: '만료되었거나 유효하지 않은 토큰입니다.' }),
        { status: 401, headers }
      );
    }

    const sessionData = JSON.parse(session) as { email: string; displayName: string };

    // DB에서 사용자 정보 조회
    const user = await context.env.DB.prepare(
      'SELECT email, display_name, created_at, last_login FROM users WHERE email = ?'
    ).bind(sessionData.email).first<{
      email: string; display_name: string | null; created_at: string; last_login: string | null;
    }>();

    if (!user) {
      return new Response(
        JSON.stringify({ error: '사용자를 찾을 수 없습니다.' }),
        { status: 404, headers }
      );
    }

    return new Response(
      JSON.stringify({
        email: user.email,
        displayName: user.display_name || user.email.split('@')[0],
        createdAt: user.created_at,
        lastLogin: user.last_login,
      }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
