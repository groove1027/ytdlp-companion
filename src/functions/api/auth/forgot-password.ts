import type { Env } from './_types';

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

    const normalizedEmail = email.toLowerCase().trim();

    // 사용자 존재 확인 (존재 여부를 응답에 노출하지 않음)
    const user = await context.env.DB.prepare(
      'SELECT id, email, display_name FROM users WHERE email = ?'
    ).bind(normalizedEmail).first<{ id: number; email: string; display_name: string | null }>();

    if (!user) {
      // 사용자가 없어도 성공 응답 (이메일 존재 여부 노출 방지)
      return new Response(
        JSON.stringify({ success: true, message: '등록된 이메일이면 인증코드가 발송됩니다.' }),
        { status: 200, headers }
      );
    }

    // 6자리 인증코드 생성
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // KV에 저장 (30분 TTL, 시도 횟수 추적)
    await context.env.SESSIONS.put(
      `pwd_reset:${normalizedEmail}`,
      JSON.stringify({ code, attempts: 0, createdAt: new Date().toISOString() }),
      { expirationTtl: 1800 } // 30분
    );

    // Resend API로 이메일 발송
    const resendKey = context.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('[forgot-password] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: '이메일 발송 서비스가 설정되지 않았습니다.' }),
        { status: 500, headers }
      );
    }

    const displayName = user.display_name || normalizedEmail.split('@')[0];

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'All-in-One Production <noreply@send.groovelab.uk>',
        to: normalizedEmail,
        subject: '[올인원] 비밀번호 재설정 인증코드',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 12px; background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; font-size: 20px; font-weight: bold;">AI</div>
              <h2 style="margin: 16px 0 4px; color: #1a1a1a; font-size: 20px;">비밀번호 재설정</h2>
              <p style="color: #666; font-size: 14px; margin: 0;">All-in-One Production</p>
            </div>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              안녕하세요, <strong>${displayName}</strong>님.<br/>
              비밀번호 재설정을 위한 인증코드입니다.
            </p>
            <div style="text-align: center; margin: 28px 0; padding: 24px; background: #f5f5f5; border-radius: 12px;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb; font-family: monospace;">${code}</span>
            </div>
            <p style="color: #666; font-size: 13px; line-height: 1.5;">
              이 인증코드는 <strong>30분간</strong> 유효합니다.<br/>
              본인이 요청하지 않았다면 이 이메일을 무시해주세요.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 11px; text-align: center;">
              이 이메일은 All-in-One Production에서 자동 발송되었습니다.
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error('[forgot-password] Resend error:', errBody);
      return new Response(
        JSON.stringify({ error: '이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' }),
        { status: 500, headers }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: '등록된 이메일이면 인증코드가 발송됩니다.' }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[forgot-password] Error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
