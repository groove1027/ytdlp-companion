import type { Env } from './_types';
import { verifyPassword, generateToken } from './_crypto';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { email, password, rememberMe } = await context.request.json() as {
      email: string; password: string; rememberMe?: boolean;
    };

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: '이메일과 비밀번호를 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    // 사용자 조회
    const user = await context.env.DB.prepare(
      'SELECT id, email, password_hash, display_name FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first<{
      id: number; email: string; password_hash: string; display_name: string | null;
    }>();

    if (!user) {
      return new Response(
        JSON.stringify({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }),
        { status: 401, headers }
      );
    }

    // 비밀번호 검증
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }),
        { status: 401, headers }
      );
    }

    // 마지막 로그인 시간 갱신
    await context.env.DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?"
    ).bind(user.id).run();

    // 세션 토큰 발급 (rememberMe: 30일, 미체크: 1일, 기본: 7일)
    const ttlDays = rememberMe === true ? 30 : rememberMe === false ? 1 : 7;
    const token = generateToken();
    await context.env.SESSIONS.put(token, JSON.stringify({
      email: user.email,
      displayName: user.display_name || user.email.split('@')[0],
      createdAt: new Date().toISOString(),
    }), { expirationTtl: 60 * 60 * 24 * ttlDays });

    return new Response(
      JSON.stringify({
        success: true,
        token,
        user: { email: user.email, displayName: user.display_name || user.email.split('@')[0] },
      }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
