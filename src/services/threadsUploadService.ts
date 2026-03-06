/**
 * Threads Upload Service — Threads API (Graph API 기반)
 *
 * Flow:
 * 1. 사용자가 Meta Developer Portal에서 Threads API 권한 추가
 * 2. Threads OAuth 팝업 → 권한 승인 → redirect로 code → postMessage
 * 3. code → access_token 교환 → 장기 토큰 교환
 * 4. Threads API: Container 생성 → 상태 폴링 → Publish
 *
 * 비디오는 공개 URL이 필요 → Cloudinary에 먼저 업로드
 */

import { logger } from './LoggerService';
import { monitoredFetch } from './apiService';

const THREADS_AUTH_URL = 'https://threads.net/oauth/authorize';
const THREADS_TOKEN_URL = 'https://graph.threads.net/oauth/access_token';
const THREADS_GRAPH_BASE = 'https://graph.threads.net/v1.0';

const SCOPES = 'threads_basic,threads_content_publish';

export const getRedirectUri = (): string => window.location.origin;

/** OAuth 동의 URL 생성 */
export const buildThreadsOAuthUrl = (appId: string): string => {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state: Math.random().toString(36).substring(2),
  });
  return `${THREADS_AUTH_URL}?${params.toString()}`;
};

/** 팝업 콜백: ?code= 파라미터 감지 → postMessage */
export const handleThreadsOAuthCallback = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (code && window.opener) {
    window.opener.postMessage({ type: 'THREADS_OAUTH_CODE', code }, window.location.origin);
    window.close();
    return true;
  }
  if (error && window.opener) {
    window.opener.postMessage({ type: 'THREADS_OAUTH_ERROR', error }, window.location.origin);
    window.close();
    return true;
  }
  return false;
};

/** authorization code → short-lived access_token 교환 */
export const exchangeThreadsCodeForTokens = async (
  code: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; userId: string; expiresIn: number }> => {
  logger.info('[Threads] 인증 코드 → 토큰 교환 시작');

  const response = await monitoredFetch(THREADS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: getRedirectUri(),
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error('[Threads] 토큰 교환 실패', err);
    throw new Error(`Threads 인증 실패: ${err}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Threads access_token을 받지 못했습니다.');
  }

  // 장기 토큰으로 교환
  const longLived = await exchangeForLongLivedToken(data.access_token);

  logger.success('[Threads] 토큰 교환 성공');
  return {
    accessToken: longLived.accessToken,
    userId: data.user_id || '',
    expiresIn: longLived.expiresIn,
  };
};

/** 단기 토큰 → 장기 토큰 교환 (60일) */
const exchangeForLongLivedToken = async (
  shortToken: string
): Promise<{ accessToken: string; expiresIn: number }> => {
  const response = await monitoredFetch(
    `${THREADS_GRAPH_BASE}/access_token?${new URLSearchParams({
      grant_type: 'th_exchange_token',
      access_token: shortToken,
    })}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    return { accessToken: shortToken, expiresIn: 3600 };
  }

  const data = await response.json();
  return {
    accessToken: data.access_token || shortToken,
    expiresIn: data.expires_in || 5184000,
  };
};

/** 장기 토큰 갱신 (만료 전 호출) */
export const refreshThreadsAccessToken = async (
  accessToken: string
): Promise<{ accessToken: string; expiresIn: number }> => {
  const response = await monitoredFetch(
    `${THREADS_GRAPH_BASE}/access_token?${new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: accessToken,
    })}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    throw new Error('Threads 토큰 갱신 실패. 다시 연동해주세요.');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 5184000,
  };
};

/** Threads 사용자 프로필 조회 */
export const fetchThreadsUserInfo = async (
  accessToken: string,
  userId: string
): Promise<{ username: string }> => {
  const response = await monitoredFetch(
    `${THREADS_GRAPH_BASE}/${userId}?fields=username,threads_profile_picture_url&access_token=${accessToken}`
  );

  if (!response.ok) {
    throw new Error('Threads 사용자 정보를 가져올 수 없습니다.');
  }

  const data = await response.json();
  return {
    username: data.username || 'Threads User',
  };
};

/** Threads 영상 게시 (Container → Poll → Publish) */
export const uploadVideoToThreads = async (opts: {
  accessToken: string;
  userId: string;
  videoUrl: string;  // 공개 URL (Cloudinary 등)
  text: string;
  onProgress?: (pct: number) => void;
}): Promise<{ mediaId: string; permalink: string }> => {
  const { accessToken, userId, videoUrl, text, onProgress } = opts;

  logger.info('[Threads] 영상 게시 시작', { userId, videoUrl: videoUrl.slice(0, 50) });

  // Step 1: 미디어 컨테이너 생성
  onProgress?.(10);
  const containerRes = await monitoredFetch(
    `${THREADS_GRAPH_BASE}/${userId}/threads`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'VIDEO',
        video_url: videoUrl,
        text: text.slice(0, 500),
        access_token: accessToken,
      }),
    }
  );

  if (!containerRes.ok) {
    const err = await containerRes.text();
    logger.error('[Threads] 컨테이너 생성 실패', err);
    throw new Error(`Threads 컨테이너 생성 실패: ${err}`);
  }

  const containerData = await containerRes.json();
  const containerId = containerData.id;
  if (!containerId) {
    throw new Error('Threads 컨테이너 ID를 받지 못했습니다.');
  }

  // Step 2: 상태 폴링 (FINISHED가 될 때까지)
  onProgress?.(30);
  await pollContainerStatus(accessToken, containerId, onProgress);

  // Step 3: 게시
  onProgress?.(90);
  const publishRes = await monitoredFetch(
    `${THREADS_GRAPH_BASE}/${userId}/threads_publish`,
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
    logger.error('[Threads] 게시 실패', err);
    throw new Error(`Threads 게시 실패: ${err}`);
  }

  const publishData = await publishRes.json();
  const mediaId = publishData.id;

  // 게시 URL 조회
  let permalink = '';
  try {
    const mediaRes = await monitoredFetch(
      `${THREADS_GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${accessToken}`
    );
    if (mediaRes.ok) {
      const mediaData = await mediaRes.json();
      permalink = mediaData.permalink || '';
    }
  } catch { /* permalink 조회 실패는 무시 */ }

  onProgress?.(100);
  logger.success('[Threads] 영상 게시 완료', { mediaId, permalink });
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
      `${THREADS_GRAPH_BASE}/${containerId}?fields=status&access_token=${accessToken}`
    );

    if (!res.ok) continue;

    const data = await res.json();
    const status = data.status;

    if (status === 'FINISHED') {
      return;
    }
    if (status === 'ERROR') {
      throw new Error(`Threads 미디어 처리 실패: ${data.error_message || '알 수 없는 오류'}`);
    }

    // IN_PROGRESS
    onProgress?.(30 + Math.min(i * 2, 55));
  }

  throw new Error('Threads 미디어 처리 시간 초과 (5분)');
};
