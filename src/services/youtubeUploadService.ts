/**
 * YouTube Upload Service — OAuth 2.0 + Video Upload via YouTube Data API v3
 *
 * Flow:
 * 1. 사용자가 Google Cloud Console에서 OAuth 클라이언트 ID/Secret 발급 (웹 애플리케이션 타입)
 * 2. "YouTube 연동하기" → Google OAuth 동의 팝업 열기
 * 3. 팝업에서 권한 승인 → redirect로 code가 돌아옴 → postMessage로 부모 창에 전달
 * 4. 부모 창에서 code → access_token + refresh_token 교환
 * 5. access_token으로 YouTube Data API v3 영상 업로드
 */

import { logger } from './LoggerService';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
const YOUTUBE_THUMBNAIL_URL = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';
const YOUTUBE_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

/** 현재 앱의 origin을 redirect URI로 사용 */
export const getRedirectUri = (): string => {
  return window.location.origin;
};

/** OAuth 동의 URL 생성 */
export const buildOAuthConsentUrl = (clientId: string): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

/**
 * 팝업 콜백 감지: URL에 ?code= 파라미터가 있으면
 * 부모 창에 postMessage로 전달하고 팝업을 닫음.
 * App 초기화 시 한 번 호출해야 함.
 */
export const handleOAuthCallback = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (code && window.opener) {
    window.opener.postMessage({ type: 'YOUTUBE_OAUTH_CODE', code }, window.location.origin);
    window.close();
    return true;
  }
  if (error && window.opener) {
    window.opener.postMessage({ type: 'YOUTUBE_OAUTH_ERROR', error }, window.location.origin);
    window.close();
    return true;
  }
  return false;
};

/** authorization code → access_token + refresh_token 교환 */
export const exchangeCodeForTokens = async (
  code: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> => {
  logger.info('[YouTube] 인증 코드 → 토큰 교환 시작');

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error('[YouTube] 토큰 교환 실패', err);
    throw new Error(`Google 인증 실패: ${err}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('access_token을 받지 못했습니다.');
  }

  logger.success('[YouTube] 토큰 교환 성공');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresIn: data.expires_in || 3600,
  };
};

/** refresh_token → 새 access_token 갱신 */
export const refreshAccessToken = async (
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresIn: number }> => {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('토큰 갱신 실패. YouTube를 다시 연동해주세요.');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
};

/** 연결된 채널 정보 조회 */
export const fetchChannelInfo = async (
  accessToken: string
): Promise<{ channelId: string; channelName: string }> => {
  const response = await fetch(
    `${YOUTUBE_CHANNELS_URL}?part=snippet&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error('채널 정보를 가져올 수 없습니다.');
  }

  const data = await response.json();
  const channel = data.items?.[0];
  if (!channel) {
    throw new Error('연결된 YouTube 채널이 없습니다.');
  }

  return {
    channelId: channel.id,
    channelName: channel.snippet?.title || 'Unknown Channel',
  };
};

/** data URL → Blob 변환 헬퍼 */
const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

/** YouTube 썸네일 업로드 */
export const uploadThumbnailToYouTube = async (
  accessToken: string,
  videoId: string,
  thumbnailDataUrl: string,
): Promise<void> => {
  const blob = dataUrlToBlob(thumbnailDataUrl);
  const response = await fetch(
    `${YOUTUBE_THUMBNAIL_URL}?videoId=${videoId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': blob.type,
      },
      body: blob,
    }
  );
  if (!response.ok) {
    const err = await response.text();
    logger.warn('[YouTube] 썸네일 업로드 실패 (영상은 업로드됨)', err);
  } else {
    logger.success('[YouTube] 썸네일 업로드 완료');
  }
};

/** YouTube 영상 업로드 (resumable upload) */
export const uploadVideoToYouTube = async (opts: {
  accessToken: string;
  file: File;
  title: string;
  description: string;
  tags: string[];
  privacy: 'public' | 'unlisted' | 'private';
  madeForKids: boolean;
  categoryId?: string;
  thumbnailDataUrl?: string | null;
  onProgress?: (pct: number) => void;
}): Promise<{ videoId: string; videoUrl: string }> => {
  const { accessToken, file, title, description, tags, privacy, madeForKids, categoryId, thumbnailDataUrl, onProgress } = opts;

  logger.info('[YouTube] 영상 업로드 시작', { title, size: file.size, privacy });

  // Step 1: Resumable upload 세션 초기화
  const metadata = {
    snippet: {
      title: title.slice(0, 100),
      description: description.slice(0, 5000),
      tags: tags.slice(0, 500),
      categoryId: categoryId || '22', // "People & Blogs"
    },
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: madeForKids,
    },
  };

  const initResponse = await fetch(
    `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(file.size),
        'X-Upload-Content-Type': file.type || 'video/mp4',
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initResponse.ok) {
    const err = await initResponse.text();
    logger.error('[YouTube] 업로드 세션 초기화 실패', err);
    if (initResponse.status === 401) throw new Error('YouTube 인증이 만료되었습니다. 다시 연동해주세요.');
    if (initResponse.status === 403) throw new Error('YouTube 업로드 권한이 없습니다. API 할당량을 확인해주세요.');
    throw new Error(`업로드 초기화 실패 (${initResponse.status}): ${err}`);
  }

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('업로드 URL을 받지 못했습니다.');
  }

  // Step 2: 실제 파일 업로드 (XMLHttpRequest for progress)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          const videoId = result.id;
          logger.success('[YouTube] 영상 업로드 완료', { videoId });
          // 썸네일이 있으면 업로드 (실패해도 영상 업로드 결과는 유지)
          if (thumbnailDataUrl) {
            try {
              await uploadThumbnailToYouTube(accessToken, videoId, thumbnailDataUrl);
            } catch (e) {
              logger.warn('[YouTube] 썸네일 업로드 실패', e);
            }
          }
          resolve({
            videoId,
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          });
        } catch {
          reject(new Error('업로드 응답을 파싱할 수 없습니다.'));
        }
      } else {
        logger.error('[YouTube] 영상 업로드 실패', xhr.responseText);
        reject(new Error(`업로드 실패 (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('네트워크 오류로 업로드에 실패했습니다.'));
    xhr.onabort = () => reject(new Error('업로드가 취소되었습니다.'));

    xhr.send(file);
  });
};
