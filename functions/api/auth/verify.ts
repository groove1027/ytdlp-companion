import type { Env } from './_types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token } = await context.request.json() as { token: string };

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: '토큰이 없습니다.' }),
        { status: 401, headers }
      );
    }

    const session = await context.env.SESSIONS.get(token);
    if (!session) {
      return new Response(
        JSON.stringify({ valid: false, error: '만료되었거나 유효하지 않은 토큰입니다.' }),
        { status: 401, headers }
      );
    }

    const user = JSON.parse(session);
    return new Response(
      JSON.stringify({ valid: true, user }),
      { status: 200, headers }
    );

  } catch {
    return new Response(
      JSON.stringify({ valid: false, error: 'Internal server error' }),
      { status: 500, headers }
    );
  }
};
