import type { Env, InviteCodeData } from './_types';
import { hashPassword, generateToken } from './_crypto';

interface SignupBody {
  email: string;
  password: string;
  inviteCode: string;
  displayName: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const body: SignupBody = await context.request.json();
    const { email, password, inviteCode, displayName } = body;

    // 1. 입력 검증
    if (!email || !password || !inviteCode || !displayName?.trim()) {
      return new Response(
        JSON.stringify({ error: '이름, 이메일, 비밀번호, 초대 코드를 모두 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: '비밀번호는 8자 이상이어야 합니다.' }),
        { status: 400, headers }
      );
    }

    // 2. 초대 코드 검증
    const codeRaw = await context.env.INVITE_CODES.get(inviteCode.toUpperCase());
    if (!codeRaw) {
      return new Response(
        JSON.stringify({ error: '유효하지 않은 초대 코드입니다.' }),
        { status: 403, headers }
      );
    }

    const codeData: InviteCodeData = JSON.parse(codeRaw);
    if (codeData.currentUses >= codeData.maxUses) {
      return new Response(
        JSON.stringify({ error: '이 초대 코드의 사용 한도가 초과되었습니다.' }),
        { status: 403, headers }
      );
    }

    // 3. 이메일 중복 확인
    const existing = await context.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existing) {
      return new Response(
        JSON.stringify({ error: '이미 가입된 이메일입니다.' }),
        { status: 409, headers }
      );
    }

    // 4. 비밀번호 해싱 + 사용자 생성
    const passwordHash = await hashPassword(password);
    await context.env.DB.prepare(
      'INSERT INTO users (email, password_hash, display_name, invite_code) VALUES (?, ?, ?, ?)'
    ).bind(
      email.toLowerCase(),
      passwordHash,
      displayName || null,
      inviteCode.toUpperCase(),
    ).run();

    // 5. 초대 코드 사용 횟수 증가
    codeData.currentUses += 1;
    await context.env.INVITE_CODES.put(inviteCode.toUpperCase(), JSON.stringify(codeData));

    // 6. 세션 토큰 발급 (7일 유효)
    const token = generateToken();
    await context.env.SESSIONS.put(token, JSON.stringify({
      email: email.toLowerCase(),
      displayName: displayName || email.split('@')[0],
      createdAt: new Date().toISOString(),
    }), { expirationTtl: 60 * 60 * 24 * 7 });

    return new Response(
      JSON.stringify({
        success: true,
        token,
        user: { email: email.toLowerCase(), displayName: displayName || email.split('@')[0] },
      }),
      { status: 201, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
