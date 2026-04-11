import {
  getYoutubeApiKey,
  getYoutubeApiKeyPoolSize,
  monitoredFetch,
  rotateYoutubeApiKey,
} from './apiService';
import { logger } from './LoggerService';

export interface YouTubeVideoMeta {
  title: string;
  description: string;
  tags: string[];
  duration: string;
  viewCount: number;
  likeCount: number;
  channelTitle: string;
}

export type YouTubeVideoMetaErrorCode =
  | 'missing_api_key'
  | 'invalid_video_id'
  | 'quota_exceeded'
  | 'private_or_unavailable'
  | 'forbidden'
  | 'request_failed'
  | 'unknown';

export interface YouTubeVideoMetaFetchResult {
  meta: YouTubeVideoMeta | null;
  errorCode?: YouTubeVideoMetaErrorCode;
  errorMessage?: string;
  status?: number;
}

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3/videos';

const summarizeErrorBody = (body: string): string =>
  body.replace(/\s+/g, ' ').trim().slice(0, 200);

export const getYouTubeVideoMetaErrorMessage = (code: YouTubeVideoMetaErrorCode): string => {
  switch (code) {
    case 'missing_api_key':
      return 'YouTube API 키가 설정되지 않아 메타데이터를 확인할 수 없어요.';
    case 'invalid_video_id':
      return 'YouTube URL 형식 오류로 영상 ID를 읽지 못했어요.';
    case 'quota_exceeded':
      return 'YouTube API quota 초과로 메타데이터를 불러오지 못했어요.';
    case 'private_or_unavailable':
      return '비공개이거나 삭제된 영상이라 메타데이터를 확인할 수 없어요.';
    case 'forbidden':
      return 'YouTube API 접근이 거부되어 메타데이터를 확인할 수 없어요.';
    case 'request_failed':
      return '네트워크 오류로 YouTube 메타데이터 요청에 실패했어요.';
    default:
      return 'YouTube 메타데이터를 확인할 수 없어요.';
  }
};

export const classifyYouTubeVideoMetaError = (
  status: number,
  responseBody: string,
): YouTubeVideoMetaErrorCode => {
  const normalized = responseBody.toLowerCase();
  if (normalized.includes('quotaexceeded') || normalized.includes('dailylimitexceeded')) {
    return 'quota_exceeded';
  }
  if (normalized.includes('video not found') || normalized.includes('videoid') || status === 404) {
    return 'private_or_unavailable';
  }
  if (status === 403) return 'forbidden';
  return 'unknown';
};

export async function fetchYouTubeVideoMeta(
  videoId: string,
): Promise<YouTubeVideoMetaFetchResult> {
  const normalizedVideoId = videoId.trim();
  if (!YOUTUBE_VIDEO_ID_RE.test(normalizedVideoId)) {
    return {
      meta: null,
      errorCode: 'invalid_video_id',
      errorMessage: getYouTubeVideoMetaErrorMessage('invalid_video_id'),
    };
  }

  const initialApiKey = getYoutubeApiKey();
  if (!initialApiKey) {
    return {
      meta: null,
      errorCode: 'missing_api_key',
      errorMessage: getYouTubeVideoMetaErrorMessage('missing_api_key'),
    };
  }

  const maxAttempts = Math.max(1, getYoutubeApiKeyPoolSize());
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const apiKey = getYoutubeApiKey();
    const url = `${YOUTUBE_API_BASE}?part=snippet,statistics,contentDetails&id=${normalizedVideoId}&key=${apiKey}`;

    try {
      const response = await monitoredFetch(url);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const errorCode = classifyYouTubeVideoMetaError(response.status, body);
        logger.warn('[YouTubeMeta] 메타데이터 요청 실패', {
          videoId: normalizedVideoId,
          status: response.status,
          errorCode,
          body: summarizeErrorBody(body),
        });

        if (errorCode === 'quota_exceeded' && rotateYoutubeApiKey()) {
          continue;
        }

        return {
          meta: null,
          status: response.status,
          errorCode,
          errorMessage: getYouTubeVideoMetaErrorMessage(errorCode),
        };
      }

      const data = await response.json();
      const item = data.items?.[0];
      if (!item) {
        logger.warn('[YouTubeMeta] items[0] 없음', { videoId: normalizedVideoId });
        return {
          meta: null,
          errorCode: 'private_or_unavailable',
          errorMessage: getYouTubeVideoMetaErrorMessage('private_or_unavailable'),
        };
      }

      return {
        meta: {
          title: item.snippet?.title || '',
          description: item.snippet?.description || '',
          tags: item.snippet?.tags || [],
          duration: item.contentDetails?.duration || '',
          viewCount: parseInt(item.statistics?.viewCount || '0', 10),
          likeCount: parseInt(item.statistics?.likeCount || '0', 10),
          channelTitle: item.snippet?.channelTitle || '',
        },
      };
    } catch (error) {
      logger.warn('[YouTubeMeta] 네트워크 오류', {
        videoId: normalizedVideoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        meta: null,
        errorCode: 'request_failed',
        errorMessage: getYouTubeVideoMetaErrorMessage('request_failed'),
      };
    }
  }

  return {
    meta: null,
    errorCode: 'quota_exceeded',
    errorMessage: getYouTubeVideoMetaErrorMessage('quota_exceeded'),
  };
}
