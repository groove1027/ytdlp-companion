import type { Env, InviteCodeData } from './_types';
import { hashPassword, generateToken } from './_crypto';

interface SignupBody {
  email: string;
  password: string;
  inviteCode: string;
  displayName: string;
  firebaseIdToken: string;
}

/**
 * Firebase ID 토큰을 검증하고 전화번호를 추출한다.
 * Identity Toolkit REST API 사용 — Cloudflare Workers 호환.
 */
async function verifyFirebasePhone(idToken: string, apiKey: string): Promise<string> {
  if (!apiKey) {
    throw new Error('FIREBASE_API_KEY가 설정되지 않았습니다.');
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!res.ok) {
    throw new Error('Firebase 토큰 검증 실패');
  }

  const data: { users?: { phoneNumber?: string }[] } = await res.json();
  const phoneNumber = data.users?.[0]?.phoneNumber;

  if (!phoneNumber) {
    throw new Error('전화번호 인증이 완료되지 않은 토큰입니다.');
  }

  return phoneNumber;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const body: SignupBody = await context.request.json();
    const { email, password, inviteCode, displayName, firebaseIdToken } = body;

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

    // 2. 전화번호 본인 인증 (필수 — 우회 불가)
    if (!firebaseIdToken) {
      return new Response(
        JSON.stringify({ error: '전화번호 본인 인증이 필요합니다.' }),
        { status: 403, headers }
      );
    }

    let verifiedPhone: string;
    try {
      verifiedPhone = await verifyFirebasePhone(firebaseIdToken, context.env.FIREBASE_API_KEY);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '본인 인증 실패';
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 403, headers }
      );
    }

    // 2-1. 동일 전화번호로 가입된 계정 중복 확인
    const phoneExisting = await context.env.DB.prepare(
      'SELECT id FROM users WHERE phone_number = ?'
    ).bind(verifiedPhone).first();

    if (phoneExisting) {
      return new Response(
        JSON.stringify({ error: '이 전화번호로 이미 가입된 계정이 있습니다.' }),
        { status: 409, headers }
      );
    }

    // 3. 초대 코드 검증
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

    // 4. 이메일 중복 확인
    const existing = await context.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existing) {
      return new Response(
        JSON.stringify({ error: '이미 가입된 이메일입니다.' }),
        { status: 409, headers }
      );
    }

    // 5. 비밀번호 해싱 + 사용자 생성 (전화번호 포함)
    const passwordHash = await hashPassword(password);
    await context.env.DB.prepare(
      'INSERT INTO users (email, password_hash, display_name, invite_code, phone_number, provider, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      email.toLowerCase(),
      passwordHash,
      displayName || null,
      inviteCode.toUpperCase(),
      verifiedPhone,
      'email',
      null,
    ).run();

    // 6. 초대 코드 사용 횟수 증가
    codeData.currentUses += 1;
    await context.env.INVITE_CODES.put(inviteCode.toUpperCase(), JSON.stringify(codeData));

    // 7. 세션 토큰 발급 (7일 유효)
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
