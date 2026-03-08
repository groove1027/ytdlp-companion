/**
 * OAuth 설정 반환 — 프론트엔드에 공개 가능한 OAuth URL만 전달
 */
import type { Env } from './_types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const origin = new URL(context.request.url).origin;
  const kakaoClientId = context.env.KAKAO_CLIENT_SECRET?.split(':')[0] || '';
  const naverClientId = context.env.NAVER_CLIENT_ID || '';

  return new Response(JSON.stringify({
    google: !!context.env.FIREBASE_API_KEY,
    kakao: kakaoClientId ? {
      authUrl: `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoClientId}&redirect_uri=${encodeURIComponent(origin)}&response_type=code&state=kakao`,
    } : null,
    naver: naverClientId ? {
      authUrl: `https://nid.naver.com/oauth2.0/authorize?client_id=${naverClientId}&redirect_uri=${encodeURIComponent(origin)}&response_type=code&state=naver`,
    } : null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
