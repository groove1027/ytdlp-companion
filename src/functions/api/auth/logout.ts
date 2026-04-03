import type { Env } from './_types';
import { removeFromSessionList } from './_sessionLimiter';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token } = await context.request.json() as { token: string };
    if (token) {
      // 세션 목록에서 제거 (이메일 조회)
      const sessionRaw = await context.env.SESSIONS.get(token);
      if (sessionRaw) {
        try {
          const session = JSON.parse(sessionRaw);
          if (session.email) {
            await removeFromSessionList(context.env.SESSIONS, session.email, token);
          }
        } catch { /* ignore */ }
      }
      await context.env.SESSIONS.delete(token);
    }
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  }
};
