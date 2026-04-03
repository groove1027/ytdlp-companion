/**
 * 이메일만으로 로그인 (비밀번호 불필요)
 * DB에 등록된 이메일이면 즉시 세션 발급
 */
import type { Env, UserTier } from './_types';
import { generateToken } from './_crypto';
import { enforceSessionLimit } from './_sessionLimiter';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { email } = await context.request.json() as { email: string };

    if (!email) {
      return new Response(
        JSON.stringify({ error: '이메일을 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    // 사용자 조회
    const user = await context.env.DB.prepare(
      'SELECT id, email, display_name, tier, tier_expires_at FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first<{
      id: number; email: string; display_name: string | null;
      tier: UserTier | null; tier_expires_at: string | null;
    }>();

    if (!user) {
      return new Response(
        JSON.stringify({ error: '등록되지 않은 이메일입니다. 관리자에게 문의해주세요.' }),
        { status: 401, headers }
      );
    }

    // 마지막 로그인 시간 갱신
    await context.env.DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?"
    ).bind(user.id).run();

    // 세션 토큰 발급 (30일)
    const tier: UserTier = user.tier || 'basic';
    const tierExpiresAt = user.tier_expires_at || null;
    const token = generateToken();
    await context.env.SESSIONS.put(token, JSON.stringify({
      email: user.email,
      displayName: user.display_name || user.email.split('@')[0],
      tier,
      tierExpiresAt,
      createdAt: new Date().toISOString(),
    }), { expirationTtl: 60 * 60 * 24 * 30 });

    // 동시 세션 2개 제한
    await enforceSessionLimit(context.env.SESSIONS, user.email, token);

    return new Response(
      JSON.stringify({
        success: true,
        token,
        user: {
          email: user.email,
          displayName: user.display_name || user.email.split('@')[0],
          tier,
          tierExpiresAt,
        },
      }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
