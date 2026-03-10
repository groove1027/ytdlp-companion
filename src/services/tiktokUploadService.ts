/**
 * TikTok Upload Service — OAuth 2.0 + Content Posting API
 *
 * Flow:
 * 1. 사용자가 TikTok Developer Portal에서 앱 생성 → Client Key/Secret 발급
 * 2. OAuth 동의 팝업 → 권한 승인 → redirect로 code 전달 → postMessage로 부모에 전달
 * 3. code → access_token + refresh_token 교환
 * 4. Content Posting API: Init (FILE_UPLOAD) → Chunked file upload → Status polling
 */

import { logger } from './LoggerService';
import { monitoredFetch } from './apiService';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_PUBLISH_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

const SCOPES = 'user.info.basic,video.publish,video.upload';

export const getRedirectUri = (): string => window.location.origin;

/** OAuth 동의 URL 생성 */
export const buildTikTokOAuthUrl = (clientKey: string): string => {
  const csrfState = Math.random().toString(36).substring(2);
  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state: csrfState,
  });
  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
};

/** 팝업 콜백: ?code= 파라미터 감지 → postMessage */
export const handleTikTokOAuthCallback = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (code && window.opener) {
    window.opener.postMessage({ type: 'TIKTOK_OAUTH_CODE', code }, window.location.origin);
    window.close();
    return true;
  }
  if (error && window.opener) {
    window.opener.postMessage({ type: 'TIKTOK_OAUTH_ERROR', error }, window.location.origin);
    window.close();
    return true;
  }
  return false;
};

/** authorization code → access_token + refresh_token 교환 */
export const exchangeTikTokCodeForTokens = async (
  code: string,
  clientKey: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken: string; openId: string; expiresIn: number }> => {
  logger.info('[TikTok] 인증 코드 → 토큰 교환 시작');

  const response = await monitoredFetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error('[TikTok] 토큰 교환 실패', err);
    throw new Error(`TikTok 인증 실패: ${err}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('TikTok access_token을 받지 못했습니다.');
  }

  logger.success('[TikTok] 토큰 교환 성공');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    openId: data.open_id || '',
    expiresIn: data.expires_in || 86400,
  };
};

/** refresh_token → 새 access_token 갱신 */
export const refreshTikTokAccessToken = async (
  refreshToken: string,
  clientKey: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> => {
  const response = await monitoredFetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error('TikTok 토큰 갱신 실패. 다시 연동해주세요.');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 86400,
  };
};

/** 사용자 프로필 정보 조회 */
export const fetchTikTokUserInfo = async (
  accessToken: string
): Promise<{ openId: string; username: string }> => {
  const response = await monitoredFetch(
    `${TIKTOK_USER_INFO_URL}?fields=open_id,display_name,username`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error('TikTok 사용자 정보를 가져올 수 없습니다.');
  }

  const data = await response.json();
  const user = data.data?.user;
  return {
    openId: user?.open_id || '',
    username: user?.display_name || user?.username || 'TikTok User',
  };
};

/** TikTok 영상 업로드 (FILE_UPLOAD + chunked upload) */
export const uploadVideoToTikTok = async (opts: {
  accessToken: string;
  file: File;
  title: string;
  privacy: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  hashtags?: string[];         // 해시태그 배열 (제목에 자동 삽입)
  onProgress?: (pct: number) => void;
}): Promise<{ publishId: string }> => {
  const { accessToken, file, title, privacy, disableComment, disableDuet, disableStitch, hashtags, onProgress } = opts;

  logger.info('[TikTok] 영상 업로드 시작', { title, size: file.size });

  // TikTok은 description이 없으므로 제목에 해시태그 포함
  let titleWithHashtags = title;
  if (hashtags && hashtags.length > 0) {
    const hashtagStr = hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ');
    const combined = `${title} ${hashtagStr}`;
    titleWithHashtags = combined.length <= 150 ? combined : title;
  }

  // Step 1: Init — FILE_UPLOAD 방식
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  const initBody = {
    post_info: {
      title: titleWithHashtags.slice(0, 150),
      privacy_level: privacy,
      disable_comment: disableComment ?? false,
      disable_duet: disableDuet ?? false,
      disable_stitch: disableStitch ?? false,
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: file.size,
      chunk_size: totalChunks === 1 ? file.size : CHUNK_SIZE,
      total_chunk_count: totalChunks,
    },
  };

  const initResponse = await monitoredFetch(TIKTOK_PUBLISH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(initBody),
  });

  if (!initResponse.ok) {
    const err = await initResponse.text();
    logger.error('[TikTok] 업로드 초기화 실패', err);
    throw new Error(`TikTok 업로드 초기화 실패 (${initResponse.status}): ${err}`);
  }

  const initData = await initResponse.json();
  if (initData.error?.code !== 'ok') {
    throw new Error(`TikTok 업로드 초기화 에러: ${initData.error?.message || JSON.stringify(initData.error)}`);
  }

  const uploadUrl = initData.data?.upload_url;
  const publishId = initData.data?.publish_id;
  if (!uploadUrl || !publishId) {
    throw new Error('TikTok 업로드 URL 또는 publish_id를 받지 못했습니다.');
  }

  // Step 2: 파일 업로드 (청크 단위)
  if (totalChunks === 1) {
    // 단일 청크 — 기존 방식
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
      xhr.setRequestHeader('Content-Range', `bytes 0-${file.size - 1}/${file.size}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress?.(Math.round((e.loaded / e.total) * 80));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`TikTok 파일 업로드 실패 (${xhr.status})`));
      };

      xhr.onerror = () => reject(new Error('TikTok 네트워크 오류'));
      xhr.onabort = () => reject(new Error('TikTok 업로드 취소'));
      xhr.send(file);
    });
  } else {
    // 멀티 청크 업로드
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`);

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`TikTok 청크 ${i + 1}/${totalChunks} 업로드 실패 (${xhr.status})`));
        };

        xhr.onerror = () => reject(new Error('TikTok 네트워크 오류'));
        xhr.send(chunk);
      });

      onProgress?.(Math.round(((i + 1) / totalChunks) * 80));
    }
  }

  // Step 3: 상태 폴링
  onProgress?.(85);
  const finalStatus = await pollTikTokPublishStatus(accessToken, publishId, onProgress);
  if (finalStatus !== 'PUBLISH_COMPLETE') {
    throw new Error(`TikTok 게시 실패: ${finalStatus}`);
  }

  logger.success('[TikTok] 영상 업로드 완료', { publishId });
  return { publishId };
};

/** TikTok 게시 상태 폴링 */
const pollTikTokPublishStatus = async (
  accessToken: string,
  publishId: string,
  onProgress?: (pct: number) => void,
  maxAttempts = 30,
  intervalMs = 5000
): Promise<string> => {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));

    const response = await monitoredFetch(TIKTOK_STATUS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    if (!response.ok) {
      logger.trackRetry('TikTok 게시 상태 폴링', i + 1, maxAttempts, `HTTP ${response.status}`);
      continue;
    }

    const data = await response.json();
    const status = data.data?.status;

    if (status === 'PUBLISH_COMPLETE') {
      onProgress?.(100);
      return status;
    }
    if (status === 'FAILED') {
      throw new Error(`TikTok 게시 실패: ${data.data?.fail_reason || '알 수 없는 오류'}`);
    }

    // PROCESSING_UPLOAD, PROCESSING_DOWNLOAD 등
    onProgress?.(85 + Math.min(i, 14));
  }

  throw new Error('TikTok 게시 상태 확인 시간 초과');
};
