import type { Env } from './_types';
import { hashPassword } from './_crypto';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { email, code, newPassword } = await context.request.json() as {
      email: string; code: string; newPassword: string;
    };

    if (!email || !code || !newPassword) {
      return new Response(
        JSON.stringify({ error: '모든 항목을 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: '비밀번호는 8자 이상이어야 합니다.' }),
        { status: 400, headers }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const kvKey = `pwd_reset:${normalizedEmail}`;

    // KV에서 인증코드 조회
    const stored = await context.env.SESSIONS.get(kvKey);
    if (!stored) {
      return new Response(
        JSON.stringify({ error: '인증코드가 만료되었거나 존재하지 않습니다. 다시 요청해주세요.' }),
        { status: 400, headers }
      );
    }

    const data = JSON.parse(stored) as { code: string; attempts: number };

    // 시도 횟수 제한 (5회)
    if (data.attempts >= 5) {
      await context.env.SESSIONS.delete(kvKey);
      return new Response(
        JSON.stringify({ error: '인증 시도 횟수를 초과했습니다. 다시 요청해주세요.' }),
        { status: 400, headers }
      );
    }

    // 코드 불일치 시 시도 횟수 증가
    if (data.code !== code.trim()) {
      data.attempts += 1;
      await context.env.SESSIONS.put(kvKey, JSON.stringify(data), { expirationTtl: 1800 });
      return new Response(
        JSON.stringify({ error: `인증코드가 올바르지 않습니다. (${data.attempts}/5회 시도)` }),
        { status: 400, headers }
      );
    }

    // 사용자 확인
    const user = await context.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(normalizedEmail).first<{ id: number }>();

    if (!user) {
      await context.env.SESSIONS.delete(kvKey);
      return new Response(
        JSON.stringify({ error: '사용자를 찾을 수 없습니다.' }),
        { status: 404, headers }
      );
    }

    // 비밀번호 업데이트
    const newHash = await hashPassword(newPassword);
    await context.env.DB.prepare(
      'UPDATE users SET password_hash = ? WHERE id = ?'
    ).bind(newHash, user.id).run();

    // 사용된 인증코드 삭제
    await context.env.SESSIONS.delete(kvKey);

    return new Response(
      JSON.stringify({ success: true, message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[reset-password] Error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
