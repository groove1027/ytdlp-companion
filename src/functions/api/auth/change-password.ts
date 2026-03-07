import type { Env } from './_types';
import { verifyPassword, hashPassword } from './_crypto';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token, currentPassword, newPassword } = await context.request.json() as {
      token: string; currentPassword: string; newPassword: string;
    };

    if (!token) {
      return new Response(
        JSON.stringify({ error: '토큰이 없습니다.' }),
        { status: 401, headers }
      );
    }

    if (!currentPassword || !newPassword) {
      return new Response(
        JSON.stringify({ error: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: '새 비밀번호는 8자 이상이어야 합니다.' }),
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

    // 현재 비밀번호 검증
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: '현재 비밀번호가 올바르지 않습니다.' }),
        { status: 401, headers }
      );
    }

    // 새 비밀번호 해싱 + 업데이트
    const newHash = await hashPassword(newPassword);
    await context.env.DB.prepare(
      'UPDATE users SET password_hash = ? WHERE id = ?'
    ).bind(newHash, user.id).run();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
