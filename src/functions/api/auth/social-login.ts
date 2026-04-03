/**
 * 소셜 로그인/회원가입 — Google, Kakao, Naver
 * - 기존 사용자: provider + provider_id 매칭 → 로그인
 * - 신규 사용자: 초대 코드 필수 → 회원가입
 */
import type { Env, InviteCodeData, UserTier } from './_types';
import { generateToken } from './_crypto';
import { enforceSessionLimit } from './_sessionLimiter';

type Provider = 'google' | 'kakao' | 'naver';

interface SocialLoginBody {
  provider: Provider;
  token: string;          // Google: Firebase ID token, Kakao/Naver: authorization code
  inviteCode?: string;    // 신규 사용자만 필수
  redirectUri?: string;   // Kakao/Naver: code 교환 시 필요
}

interface SocialUserInfo {
  providerId: string;
  email: string;
  name: string;
  profileImage?: string;
}

/** Google: Firebase ID 토큰 검증 */
async function verifyGoogle(idToken: string, apiKey: string): Promise<SocialUserInfo> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) },
  );
  if (!res.ok) throw new Error('Google 인증 실패');
  const data: { users?: { localId?: string; email?: string; displayName?: string; photoUrl?: string }[] } = await res.json();
  const user = data.users?.[0];
  if (!user?.localId) throw new Error('Google 사용자 정보를 가져올 수 없습니다.');
  return { providerId: user.localId, email: user.email || '', name: user.displayName || '', profileImage: user.photoUrl };
}

/** Kakao: authorization code → access token → 사용자 정보 */
async function verifyKakao(code: string, clientSecret: string, redirectUri: string): Promise<SocialUserInfo> {
  // 1. code → access_token
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientSecret.split(':')[0] || '',  // REST_API_KEY:SECRET 형식
      client_secret: clientSecret.split(':')[1] || '',
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!tokenRes.ok) throw new Error('카카오 인증 실패');
  const tokenData: { access_token?: string } = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('카카오 토큰 발급 실패');

  // 2. 사용자 정보
  const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) throw new Error('카카오 사용자 정보 조회 실패');
  const userData: {
    id?: number;
    kakao_account?: { email?: string; profile?: { nickname?: string; thumbnail_image_url?: string } };
  } = await userRes.json();

  return {
    providerId: String(userData.id || ''),
    email: userData.kakao_account?.email || '',
    name: userData.kakao_account?.profile?.nickname || '',
    profileImage: userData.kakao_account?.profile?.thumbnail_image_url,
  };
}

/** Naver: authorization code → access token → 사용자 정보 */
async function verifyNaver(code: string, clientId: string, clientSecret: string): Promise<SocialUserInfo> {
  // 1. code → access_token
  const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${code}&state=naver_login`;
  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) throw new Error('네이버 인증 실패');
  const tokenData: { access_token?: string } = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('네이버 토큰 발급 실패');

  // 2. 사용자 정보
  const userRes = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) throw new Error('네이버 사용자 정보 조회 실패');
  const userData: {
    response?: { id?: string; email?: string; name?: string; nickname?: string; profile_image?: string };
  } = await userRes.json();
  const r = userData.response;

  return {
    providerId: r?.id || '',
    email: r?.email || '',
    name: r?.name || r?.nickname || '',
    profileImage: r?.profile_image,
  };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const body: SocialLoginBody = await context.request.json();
    const { provider, token, inviteCode, redirectUri } = body;

    if (!provider || !token) {
      return new Response(JSON.stringify({ error: 'provider와 token은 필수입니다.' }), { status: 400, headers });
    }

    // 1. 소셜 인증 검증 → 사용자 정보 추출
    let userInfo: SocialUserInfo;

    // 대기 중인 소셜 가입 재시도 (초대코드 입력 후 재요청)
    if (token.startsWith('pending_social:')) {
      const cachedRaw = await context.env.SESSIONS.get(token);
      if (!cachedRaw) {
        return new Response(JSON.stringify({ error: '세션이 만료되었습니다. 다시 시도해주세요.' }), { status: 400, headers });
      }
      userInfo = JSON.parse(cachedRaw);
      await context.env.SESSIONS.delete(token);
    } else switch (provider) {
      case 'google':
        if (!context.env.FIREBASE_API_KEY) {
          return new Response(JSON.stringify({ error: 'Google 로그인이 설정되지 않았습니다.' }), { status: 500, headers });
        }
        userInfo = await verifyGoogle(token, context.env.FIREBASE_API_KEY);
        break;
      case 'kakao':
        if (!context.env.KAKAO_CLIENT_SECRET) {
          return new Response(JSON.stringify({ error: '카카오 로그인이 설정되지 않았습니다.' }), { status: 500, headers });
        }
        userInfo = await verifyKakao(token, context.env.KAKAO_CLIENT_SECRET, redirectUri || '');
        break;
      case 'naver':
        if (!context.env.NAVER_CLIENT_ID || !context.env.NAVER_CLIENT_SECRET) {
          return new Response(JSON.stringify({ error: '네이버 로그인이 설정되지 않았습니다.' }), { status: 500, headers });
        }
        userInfo = await verifyNaver(token, context.env.NAVER_CLIENT_ID, context.env.NAVER_CLIENT_SECRET);
        break;
      default:
        return new Response(JSON.stringify({ error: '지원하지 않는 소셜 로그인입니다.' }), { status: 400, headers });
    }

    if (!userInfo.providerId) {
      return new Response(JSON.stringify({ error: '소셜 인증에서 사용자 정보를 가져올 수 없습니다.' }), { status: 403, headers });
    }

    // 2. 기존 사용자 확인 (provider + provider_id)
    const existing = await context.env.DB.prepare(
      'SELECT id, email, display_name, tier, tier_expires_at FROM users WHERE provider = ? AND provider_id = ?'
    ).bind(provider, userInfo.providerId).first<{ id: number; email: string; display_name: string | null; tier: UserTier | null; tier_expires_at: string | null }>();

    if (existing) {
      // 기존 사용자 → 로그인
      const sessionToken = generateToken();
      const displayName = existing.display_name || userInfo.name || existing.email.split('@')[0];
      const tier: UserTier = existing.tier || 'basic';
      const tierExpiresAt = existing.tier_expires_at || null;
      await context.env.SESSIONS.put(sessionToken, JSON.stringify({
        email: existing.email,
        displayName,
        tier,
        tierExpiresAt,
        createdAt: new Date().toISOString(),
      }), { expirationTtl: 60 * 60 * 24 * 30 }); // 30일

      // 동시 세션 2개 제한
      await enforceSessionLimit(context.env.SESSIONS, existing.email, sessionToken);

      return new Response(JSON.stringify({
        success: true,
        token: sessionToken,
        user: { email: existing.email, displayName, tier, tierExpiresAt },
        isNewUser: false,
      }), { status: 200, headers });
    }

    // 3. 신규 사용자 — 동일 이메일로 다른 방법으로 가입된 계정 확인
    if (userInfo.email) {
      const emailExisting = await context.env.DB.prepare(
        'SELECT provider FROM users WHERE email = ?'
      ).bind(userInfo.email.toLowerCase()).first<{ provider: string | null }>();

      if (emailExisting) {
        const providerLabel = emailExisting.provider === 'email' ? '이메일/비밀번호'
          : emailExisting.provider === 'google' ? 'Google'
          : emailExisting.provider === 'kakao' ? '카카오'
          : emailExisting.provider === 'naver' ? '네이버' : emailExisting.provider;
        return new Response(JSON.stringify({
          error: `이 이메일은 ${providerLabel} 계정으로 이미 가입되어 있습니다.`,
        }), { status: 409, headers });
      }
    }

    // 4. 초대 코드 필수 — 없으면 사용자 정보를 임시 캐싱 (auth code 재사용 불가 대비)
    if (!inviteCode) {
      const pendingId = `pending_social:${crypto.randomUUID()}`;
      await context.env.SESSIONS.put(pendingId, JSON.stringify(userInfo), { expirationTtl: 300 });
      return new Response(JSON.stringify({
        error: '신규 가입에는 초대 코드가 필요합니다.',
        needsInviteCode: true,
        pendingToken: pendingId,
      }), { status: 403, headers });
    }

    const codeRaw = await context.env.INVITE_CODES.get(inviteCode.toUpperCase());
    if (!codeRaw) {
      return new Response(JSON.stringify({ error: '유효하지 않은 초대 코드입니다.' }), { status: 403, headers });
    }
    const codeData: InviteCodeData = JSON.parse(codeRaw);
    if (codeData.currentUses >= codeData.maxUses) {
      return new Response(JSON.stringify({ error: '이 초대 코드의 사용 한도가 초과되었습니다.' }), { status: 403, headers });
    }

    // 5. 티어 + 만료일 계산
    const tier: UserTier = codeData.tier || 'basic';
    const tierExpiresAt = codeData.durationDays > 0
      ? new Date(Date.now() + codeData.durationDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // 6. 사용자 생성
    const email = (userInfo.email || `${provider}_${userInfo.providerId}@social.local`).toLowerCase();
    const displayName = userInfo.name || email.split('@')[0];

    await context.env.DB.prepare(
      'INSERT INTO users (email, password_hash, display_name, invite_code, tier, tier_expires_at, provider, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(email, null, displayName, inviteCode.toUpperCase(), tier, tierExpiresAt, provider, userInfo.providerId).run();

    // 7. 초대 코드 사용 횟수 증가
    codeData.currentUses += 1;
    await context.env.INVITE_CODES.put(inviteCode.toUpperCase(), JSON.stringify(codeData));

    // 8. 세션 토큰 발급 (30일)
    const sessionToken = generateToken();
    await context.env.SESSIONS.put(sessionToken, JSON.stringify({
      email,
      displayName,
      tier,
      tierExpiresAt,
      createdAt: new Date().toISOString(),
    }), { expirationTtl: 60 * 60 * 24 * 30 });

    // 동시 세션 2개 제한
    await enforceSessionLimit(context.env.SESSIONS, email, sessionToken);

    return new Response(JSON.stringify({
      success: true,
      token: sessionToken,
      user: { email, displayName, tier, tierExpiresAt },
      isNewUser: true,
    }), { status: 201, headers });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
