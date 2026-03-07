import type { Env } from './_types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token } = await context.request.json() as { token: string };
    if (token) {
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
