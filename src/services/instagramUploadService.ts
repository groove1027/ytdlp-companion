/**
 * Instagram Upload Service — Meta OAuth 2.0 + Graph API Reels Upload
 *
 * Flow:
 * 1. 사용자가 Meta Developer Portal에서 앱 생성 → App ID/Secret 발급
 * 2. Facebook OAuth 팝업 → 권한 승인 → redirect로 code → postMessage
 * 3. code → access_token 교환 → 장기 토큰 교환
 * 4. Instagram Graph API: Container 생성 → 상태 폴링 → Publish
 *
 * 요구사항: Instagram Professional 계정 (Business 또는 Creator)
 * 비디오는 공개 URL이 필요 → Cloudinary에 먼저 업로드
 */

import { logger } from './LoggerService';
import { monitoredFetch } from './apiService';

const FB_AUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const FB_TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';
const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

const SCOPES = 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement';

export const getRedirectUri = (): string => window.location.origin;

/** OAuth 동의 URL 생성 (Facebook Login) */
export const buildInstagramOAuthUrl = (appId: string): string => {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state: Math.random().toString(36).substring(2),
  });
  return `${FB_AUTH_URL}?${params.toString()}`;
};

/** 팝업 콜백: ?code= 파라미터 감지 → postMessage */
export const handleInstagramOAuthCallback = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (code && window.opener) {
    window.opener.postMessage({ type: 'INSTAGRAM_OAUTH_CODE', code }, window.location.origin);
    window.close();
    return true;
  }
  if (error && window.opener) {
    window.opener.postMessage({ type: 'INSTAGRAM_OAUTH_ERROR', error }, window.location.origin);
    window.close();
    return true;
  }
  return false;
};

/** authorization code → short-lived access_token 교환 */
export const exchangeInstagramCodeForTokens = async (
  code: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; expiresIn: number }> => {
  logger.info('[Instagram] 인증 코드 → 토큰 교환 시작');

  const response = await monitoredFetch(
    `${FB_TOKEN_URL}?${new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: getRedirectUri(),
      code,
    })}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    const err = await response.text();
    logger.error('[Instagram] 토큰 교환 실패', err);
    throw new Error(`Instagram 인증 실패: ${err}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Instagram access_token을 받지 못했습니다.');
  }

  // 장기 토큰으로 교환
  const longLived = await exchangeForLongLivedToken(data.access_token, appSecret);

  logger.success('[Instagram] 토큰 교환 성공 (장기 토큰)');
  return longLived;
};

/** 단기 토큰 → 장기 토큰 교환 (60일) */
const exchangeForLongLivedToken = async (
  shortToken: string,
  appSecret: string
): Promise<{ accessToken: string; expiresIn: number }> => {
  const response = await monitoredFetch(
    `${FB_TOKEN_URL}?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    })}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    // 장기 토큰 교환 실패 시 단기 토큰 사용
    return { accessToken: shortToken, expiresIn: 3600 };
  }

  const data = await response.json();
  return {
    accessToken: data.access_token || shortToken,
    expiresIn: data.expires_in || 5184000, // 60일
  };
};

/** Instagram Professional 계정 정보 조회 */
export const fetchInstagramUserInfo = async (
  accessToken: string
): Promise<{ userId: string; username: string; accountType: string }> => {
  // Step 1: Facebook Pages 목록에서 Instagram 비즈니스 계정 ID 가져오기
  const pagesRes = await monitoredFetch(
    `${GRAPH_BASE}/me/accounts?fields=instagram_business_account,name&access_token=${accessToken}`
  );

  if (!pagesRes.ok) {
    throw new Error('Facebook Pages 정보를 가져올 수 없습니다.');
  }

  const pagesData = await pagesRes.json();
  const page = pagesData.data?.find((p: Record<string, unknown>) => p.instagram_business_account);

  if (!page?.instagram_business_account?.id) {
    throw new Error('연결된 Instagram Professional 계정이 없습니다. Instagram 계정을 Facebook Page에 연결하고 Professional 계정으로 전환해주세요.');
  }

  const igUserId = page.instagram_business_account.id;

  // Step 2: Instagram 사용자 정보 조회
  const userRes = await monitoredFetch(
    `${GRAPH_BASE}/${igUserId}?fields=username,account_type&access_token=${accessToken}`
  );

  if (!userRes.ok) {
    throw new Error('Instagram 사용자 정보를 가져올 수 없습니다.');
  }

  const userData = await userRes.json();
  return {
    userId: igUserId,
    username: userData.username || 'Unknown',
    accountType: userData.account_type || 'BUSINESS',
  };
};

/** Instagram Reels 업로드 (Container → Poll → Publish) */
export const uploadVideoToInstagram = async (opts: {
  accessToken: string;
  userId: string;
  videoUrl: string;  // 공개 URL (Cloudinary 등)
  caption: string;
  coverUrl?: string;           // 커버 이미지 공개 URL (Cloudinary 등)
  onProgress?: (pct: number) => void;
}): Promise<{ mediaId: string; permalink: string }> => {
  const { accessToken, userId, videoUrl, caption, coverUrl, onProgress } = opts;

  logger.info('[Instagram] Reels 업로드 시작', { userId, videoUrl: videoUrl.slice(0, 50) });

  // Step 1: 미디어 컨테이너 생성
  onProgress?.(10);
  const containerRes = await monitoredFetch(
    `${GRAPH_BASE}/${userId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: videoUrl,
        caption: caption.slice(0, 2200),
        access_token: accessToken,
        ...(coverUrl ? { cover_url: coverUrl } : {}),
      }),
    }
  );

  if (!containerRes.ok) {
    const err = await containerRes.text();
    logger.error('[Instagram] 컨테이너 생성 실패', err);
    throw new Error(`Instagram 컨테이너 생성 실패: ${err}`);
  }

  const containerData = await containerRes.json();
  const containerId = containerData.id;
  if (!containerId) {
    throw new Error('Instagram 컨테이너 ID를 받지 못했습니다.');
  }

  // Step 2: 상태 폴링 (FINISHED가 될 때까지)
  onProgress?.(30);
  await pollContainerStatus(accessToken, containerId, onProgress);

  // Step 3: 게시
  onProgress?.(90);
  const publishRes = await monitoredFetch(
    `${GRAPH_BASE}/${userId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );

  if (!publishRes.ok) {
    const err = await publishRes.text();
    logger.error('[Instagram] 게시 실패', err);
    throw new Error(`Instagram 게시 실패: ${err}`);
  }

  const publishData = await publishRes.json();
  const mediaId = publishData.id;

  // 게시 URL 조회
  let permalink = '';
  try {
    const mediaRes = await monitoredFetch(
      `${GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${accessToken}`
    );
    if (mediaRes.ok) {
      const mediaData = await mediaRes.json();
      permalink = mediaData.permalink || '';
    }
  } catch { /* permalink 조회 실패는 무시 */ }

  onProgress?.(100);
  logger.success('[Instagram] Reels 게시 완료', { mediaId, permalink });
  return { mediaId, permalink };
};

/** 컨테이너 상태 폴링 */
const pollContainerStatus = async (
  accessToken: string,
  containerId: string,
  onProgress?: (pct: number) => void,
  maxAttempts = 60,
  intervalMs = 5000
): Promise<void> => {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));

    const res = await monitoredFetch(
      `${GRAPH_BASE}/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );

    if (!res.ok) continue;

    const data = await res.json();
    const status = data.status_code;

    if (status === 'FINISHED') {
      return;
    }
    if (status === 'ERROR') {
      throw new Error(`Instagram 미디어 처리 실패: ${data.status || '알 수 없는 오류'}`);
    }

    // IN_PROGRESS
    onProgress?.(30 + Math.min(i * 2, 55));
  }

  throw new Error('Instagram 미디어 처리 시간 초과 (5분)');
};
