import type { Env } from './_types';
import { verifyPassword } from './_crypto';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token, password } = await context.request.json() as {
      token: string; password: string;
    };

    if (!token) {
      return new Response(
        JSON.stringify({ error: '토큰이 없습니다.' }),
        { status: 401, headers }
      );
    }

    if (!password) {
      return new Response(
        JSON.stringify({ error: '비밀번호를 입력해주세요.' }),
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

    const sessionData = JSON.parse(session) as { email: string };

    // 사용자 조회
    const user = await context.env.DB.prepare(
      'SELECT id, password_hash FROM users WHERE email = ?'
    ).bind(sessionData.email).first<{ id: number; password_hash: string }>();

    if (!user) {
      return new Response(
        JSON.stringify({ error: '사용자를 찾을 수 없습니다.' }),
        { status: 404, headers }
      );
    }

    // 비밀번호 검증
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: '비밀번호가 올바르지 않습니다.' }),
        { status: 401, headers }
      );
    }

    // 계정 삭제 + 세션 삭제
    await context.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    await context.env.SESSIONS.delete(token);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
