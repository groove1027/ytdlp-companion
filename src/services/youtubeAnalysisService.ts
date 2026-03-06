
import { monitoredFetch, getYoutubeApiKey } from './apiService';
import { logger } from './LoggerService';
import { evolinkChat } from './evolinkService';
import type {
    ChannelInfo,
    ChannelScript,
    ChannelGuideline,
    KeywordAnalysisResult,
    RelatedKeyword,
    TopVideo,
    KeywordTag
} from '../types';

// === CONFIGURATION ===
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_SUGGEST_URL = 'https://suggestqueries.google.com/complete/search';

// === QUOTA TRACKING ===
// YouTube Data API v3: 10,000 units/day
// Approximate costs: search=100, videos.list=1, channels.list=1, captions.list=50

const QUOTA_STORAGE_KEY = 'YOUTUBE_QUOTA_USED';
const DAILY_QUOTA_LIMIT = 10000;
const QUOTA_WARN_THRESHOLD = 9000;

interface QuotaRecord {
    date: string;     // YYYY-MM-DD
    used: number;     // 누적 사용 단위
}

const QUOTA_COSTS: Record<string, number> = {
    'search': 100,
    'videos.list': 1,
    'channels.list': 1,
    'captions.list': 50,
};

/** 오늘 날짜 문자열 (YYYY-MM-DD) */
const getTodayString = (): string => new Date().toISOString().slice(0, 10);

/** 현재 쿼터 레코드 로드 (날짜가 다르면 자동 리셋) */
const loadQuotaRecord = (): QuotaRecord => {
    try {
        const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
        if (raw) {
            const record: QuotaRecord = JSON.parse(raw);
            if (record.date === getTodayString()) {
                return record;
            }
        }
    } catch {
        // localStorage 파싱 실패 시 리셋
    }
    return { date: getTodayString(), used: 0 };
};

/** 쿼터 레코드 저장 */
const saveQuotaRecord = (record: QuotaRecord): void => {
    try {
        localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(record));
    } catch {
        // localStorage 저장 실패 무시
    }
};

/**
 * API 호출 전 쿼터 확인 + 사용량 기록
 * @param operation 작업 유형 (search, videos.list, channels.list, captions.list)
 * @returns 남은 쿼터가 충분하면 true, 한도 초과 시 false
 */
const trackQuota = (operation: string): boolean => {
    const cost = QUOTA_COSTS[operation] || 1;
    const record = loadQuotaRecord();

    if (record.used + cost > DAILY_QUOTA_LIMIT) {
        logger.error('[YouTube Quota] 일일 쿼터 한도 초과', {
            used: record.used,
            cost,
            limit: DAILY_QUOTA_LIMIT,
            operation,
        });
        return false;
    }

    if (record.used >= QUOTA_WARN_THRESHOLD) {
        logger.warn('[YouTube Quota] 일일 쿼터 경고: 90% 이상 사용', {
            used: record.used,
            remaining: DAILY_QUOTA_LIMIT - record.used,
            operation,
        });
    }

    record.used += cost;
    saveQuotaRecord(record);

    logger.info('[YouTube Quota] 사용 기록', {
        operation,
        cost,
        totalUsed: record.used,
        remaining: DAILY_QUOTA_LIMIT - record.used,
    });

    return true;
};

/** 현재 쿼터 사용량 조회 (외부에서 UI 표시용) */
export const getQuotaUsage = (): { used: number; limit: number; remaining: number; date: string } => {
    const record = loadQuotaRecord();
    return {
        used: record.used,
        limit: DAILY_QUOTA_LIMIT,
        remaining: DAILY_QUOTA_LIMIT - record.used,
        date: record.date,
    };
};

// === HELPER FUNCTIONS ===

/** ISO 8601 duration을 사람이 읽을 수 있는 형태로 변환 (PT1H2M30S → "1:02:30") */
const parseIsoDuration = (duration: string): string => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0:00';
    const h = parseInt(match[1] || '0');
    const m = parseInt(match[2] || '0');
    const s = parseInt(match[3] || '0');
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
};

/** ISO 8601 duration을 초 단위로 변환 */
const isoDurationToSeconds = (duration: string): number => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0');
};

/** 구독자 수 포맷 (1234567 → "123만") */
const formatSubscribers = (count: number): string => {
    if (count >= 10000) return `${Math.round(count / 10000)}만`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}천`;
    return String(count);
};

/** 채널 URL에서 채널 식별자 추출 */
const extractChannelIdentifier = (url: string): { type: 'id' | 'handle' | 'custom'; value: string } | null => {
    // /channel/UCxxxx 형식
    const channelMatch = url.match(/\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };

    // /@handle 형식
    const handleMatch = url.match(/\/@([\w.-]+)/);
    if (handleMatch) return { type: 'handle', value: handleMatch[1] };

    // /c/customname 또는 /user/username 형식
    const customMatch = url.match(/\/(c|user)\/([\w.-]+)/);
    if (customMatch) return { type: 'custom', value: customMatch[2] };

    return null;
};

// === KEYWORD ANALYSIS ===

/**
 * YouTube 키워드 검색 + 통계 분석
 * YouTube Search API를 사용하여 키워드의 검색 결과 및 상위 영상 통계를 종합 분석
 */
export const searchKeyword = async (
    keyword: string,
    language: string = 'ko',
    region: string = 'KR'
): Promise<KeywordAnalysisResult> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');
    if (!keyword.trim()) throw new Error('검색 키워드가 비어있습니다.');

    logger.info('[YouTube] 키워드 분석 시작', { keyword, language, region });

    // 쿼터 확인 (search=100 + videos.list=1 = 101 units)
    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도(10,000 units)를 초과했습니다. 내일 다시 시도하세요.');

    // Step 1: 키워드로 검색 (상위 25개)
    const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=25&relevanceLanguage=${language}&regionCode=${region}&key=${apiKey}`;
    const searchResponse = await monitoredFetch(searchUrl);

    if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        throw new Error(`YouTube 검색 API 오류 (${searchResponse.status}): ${errorText}`);
    }

    const searchData = await searchResponse.json();
    const totalResults = parseInt(searchData.pageInfo?.totalResults || '0');
    const videoIds = searchData.items
        ?.map((item: { id?: { videoId?: string } }) => item.id?.videoId)
        .filter(Boolean)
        .join(',');

    if (!videoIds) {
        return {
            keyword,
            searchVolume: 0,
            competition: 0,
            opportunityScore: 0,
            trend: 'stable',
            totalResults: 0,
            avgViews: 0,
            channelDiversity: 0,
            dataSource: 'realtime'
        };
    }

    // Step 2: 비디오 상세 통계 가져오기
    trackQuota('videos.list');
    const statsUrl = `${YOUTUBE_API_BASE}/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`;
    const statsResponse = await monitoredFetch(statsUrl);

    if (!statsResponse.ok) {
        throw new Error(`YouTube 통계 API 오류 (${statsResponse.status})`);
    }

    const statsData = await statsResponse.json();
    const videos = statsData.items || [];

    // Step 3: 통계 계산
    const viewCounts = videos.map((v: { statistics?: { viewCount?: string } }) =>
        parseInt(v.statistics?.viewCount || '0')
    );
    const avgViews = viewCounts.length > 0
        ? Math.round(viewCounts.reduce((a: number, b: number) => a + b, 0) / viewCounts.length)
        : 0;

    // 채널 다양성 (상위 25개 중 고유 채널 수)
    const uniqueChannels = new Set(
        videos.map((v: { snippet?: { channelId?: string } }) => v.snippet?.channelId)
    );
    const channelDiversity = uniqueChannels.size;

    // 경쟁도 (0~100): 검색 결과 수 + 평균 조회수 기반
    const competition = Math.min(100, Math.round(
        (Math.log10(totalResults + 1) / 7) * 50 +
        (Math.log10(avgViews + 1) / 7) * 50
    ));

    // 검색 볼륨 추정 (0~100): 총 결과 수 기반 로그 스케일
    const searchVolume = Math.min(100, Math.round(Math.log10(totalResults + 1) / 7 * 100));

    // 기회 점수 (높은 볼륨 + 낮은 경쟁 = 높은 기회)
    const opportunityScore = Math.round(searchVolume * (1 - competition / 200));

    // 트렌드 판단 (최근 7일 업로드 비율)
    const now = Date.now();
    const recentCount = videos.filter((v: { snippet?: { publishedAt?: string } }) => {
        const published = new Date(v.snippet?.publishedAt || 0).getTime();
        return now - published < 7 * 24 * 60 * 60 * 1000; // 7일
    }).length;
    const trend: 'rising' | 'stable' | 'declining' =
        recentCount >= 5 ? 'rising' : recentCount >= 2 ? 'stable' : 'declining';

    const result: KeywordAnalysisResult = {
        keyword,
        searchVolume,
        competition,
        opportunityScore,
        trend,
        totalResults,
        avgViews,
        channelDiversity,
        dataSource: 'realtime'
    };

    logger.success('[YouTube] 키워드 분석 완료', result);
    return result;
};

/**
 * YouTube 연관 키워드 추출
 * 방법 1: Google Suggest API (JSONP, client=firefox → CORS 우회)
 * 방법 2: 폴백 — YouTube Search API로 상위 영상 제목에서 키워드 추출
 */
export const getRelatedKeywords = async (
    keyword: string,
    language: string = 'ko'
): Promise<RelatedKeyword[]> => {
    if (!keyword.trim()) return [];

    logger.info('[YouTube] 연관 키워드 조회', { keyword, language });

    // --- 방법 1: Google Suggest API (client=firefox → JSON 응답, CORS 허용) ---
    try {
        const suggestUrl = `${YOUTUBE_SUGGEST_URL}?client=firefox&q=${encodeURIComponent(keyword)}&hl=${language}&ds=yt`;
        const response = await monitoredFetch(suggestUrl);

        if (response.ok) {
            const data = await response.json();
            // Firefox client 응답: ["query", ["suggest1", "suggest2", ...]]
            if (Array.isArray(data) && Array.isArray(data[1]) && data[1].length > 0) {
                const suggestions: string[] = data[1]
                    .filter((s: unknown): s is string => typeof s === 'string' && s !== keyword)
                    .slice(0, 15);

                if (suggestions.length > 0) {
                    const results: RelatedKeyword[] = suggestions.map((s, i) => ({
                        keyword: s,
                        score: Math.round(100 - (i * (100 / Math.max(suggestions.length, 1))))
                    }));
                    logger.success('[YouTube] 연관 키워드 조회 완료 (Suggest)', { count: results.length });
                    return results;
                }
            }
        }
    } catch {
        logger.warn('[YouTube] Suggest API 실패, YouTube Search 폴백 시도');
    }

    // --- 방법 2: YouTube Search API 폴백 — 상위 영상 제목에서 키워드 추출 ---
    try {
        const apiKey = getYoutubeApiKey();
        if (!apiKey) return [];

        if (!trackQuota('search')) {
            logger.warn('[YouTube] 연관 키워드 폴백 건너뜀 — 쿼터 한도 초과');
            return [];
        }
        const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=15&relevanceLanguage=${language}&key=${apiKey}`;
        const response = await monitoredFetch(searchUrl);
        if (!response.ok) return [];

        const data = await response.json();
        const titles: string[] = (data.items || []).map((item: { snippet?: { title?: string } }) => item.snippet?.title || '');

        // 제목들에서 공통 단어/구 추출 (원래 키워드 제외)
        const wordCount = new Map<string, number>();
        const kwLower = keyword.toLowerCase();
        for (const title of titles) {
            // 2~4단어 조합 추출
            const words = title.replace(/[^\w\s가-힣]/g, ' ').split(/\s+/).filter(w => w.length > 1);
            const seen = new Set<string>();
            for (let len = 1; len <= Math.min(3, words.length); len++) {
                for (let i = 0; i <= words.length - len; i++) {
                    const phrase = words.slice(i, i + len).join(' ');
                    if (phrase.toLowerCase() === kwLower || phrase.length < 2) continue;
                    if (seen.has(phrase)) continue;
                    seen.add(phrase);
                    wordCount.set(phrase, (wordCount.get(phrase) || 0) + 1);
                }
            }
        }

        // 빈도 2 이상인 구 정렬
        const sorted = [...wordCount.entries()]
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15);

        const maxCount = sorted[0]?.[1] || 1;
        const results: RelatedKeyword[] = sorted.map(([phrase, count]) => ({
            keyword: phrase,
            score: Math.round((count / maxCount) * 100)
        }));

        logger.success('[YouTube] 연관 키워드 조회 완료 (Search 폴백)', { count: results.length });
        return results;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('[YouTube] 연관 키워드 오류', msg);
        return [];
    }
};

// === TOP VIDEOS ===

/**
 * 키워드 상위 영상 + 상세 통계 가져오기
 */
export const getTopVideos = async (
    keyword: string,
    maxResults: number = 10
): Promise<TopVideo[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[YouTube] 상위 영상 조회', { keyword, maxResults });

    // 쿼터 확인 (search=100 + videos.list=1 + channels.list=1 = 102 units)
    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도(10,000 units)를 초과했습니다. 내일 다시 시도하세요.');

    // Step 1: 검색
    const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=relevance&maxResults=${maxResults}&key=${apiKey}`;
    const searchResponse = await monitoredFetch(searchUrl);
    if (!searchResponse.ok) throw new Error(`YouTube 검색 오류 (${searchResponse.status})`);

    const searchData = await searchResponse.json();
    const videoIds = (searchData.items || [])
        .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
        .filter(Boolean);

    if (videoIds.length === 0) return [];

    // Step 2: 영상 상세 정보
    trackQuota('videos.list');
    const videoUrl = `${YOUTUBE_API_BASE}/videos?part=statistics,contentDetails,snippet&id=${videoIds.join(',')}&key=${apiKey}`;
    const videoResponse = await monitoredFetch(videoUrl);
    if (!videoResponse.ok) throw new Error(`YouTube 영상 통계 오류 (${videoResponse.status})`);

    const videoData = await videoResponse.json();

    // Step 3: 채널 구독자 수 일괄 조회
    const channelIds = [...new Set(
        (videoData.items || []).map((v: { snippet?: { channelId?: string } }) => v.snippet?.channelId).filter(Boolean)
    )];
    const channelMap = new Map<string, number>();

    if (channelIds.length > 0) {
        trackQuota('channels.list');
        const channelUrl = `${YOUTUBE_API_BASE}/channels?part=statistics&id=${channelIds.join(',')}&key=${apiKey}`;
        const channelResponse = await monitoredFetch(channelUrl);
        if (channelResponse.ok) {
            const channelData = await channelResponse.json();
            (channelData.items || []).forEach((ch: { id: string; statistics?: { subscriberCount?: string } }) => {
                channelMap.set(ch.id, parseInt(ch.statistics?.subscriberCount || '0'));
            });
        }
    }

    // Step 4: TopVideo 배열 구성
    const results: TopVideo[] = (videoData.items || []).map((v: {
        id: string;
        snippet?: {
            title?: string;
            channelTitle?: string;
            channelId?: string;
            description?: string;
            thumbnails?: { high?: { url?: string } };
            publishedAt?: string;
            tags?: string[];
        };
        statistics?: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
        };
        contentDetails?: {
            duration?: string;
        };
    }) => {
        const viewCount = parseInt(v.statistics?.viewCount || '0');
        const likeCount = parseInt(v.statistics?.likeCount || '0');
        const commentCount = parseInt(v.statistics?.commentCount || '0');
        const subscriberCount = channelMap.get(v.snippet?.channelId || '') || 0;

        // 참여율: (좋아요 + 댓글) / 조회수 * 100
        const engagement = viewCount > 0
            ? parseFloat(((likeCount + commentCount) / viewCount * 100).toFixed(2))
            : 0;

        // 조회/구독 비율
        const viewToSubRatio = subscriberCount > 0
            ? parseFloat((viewCount / subscriberCount * 100).toFixed(1))
            : 0;

        return {
            videoId: v.id,
            title: v.snippet?.title || '',
            channelTitle: v.snippet?.channelTitle || '',
            channelSubscribers: formatSubscribers(subscriberCount),
            thumbnail: v.snippet?.thumbnails?.high?.url || '',
            duration: parseIsoDuration(v.contentDetails?.duration || 'PT0S'),
            viewCount,
            likeCount,
            commentCount,
            publishedAt: v.snippet?.publishedAt || '',
            engagement,
            viewToSubRatio,
            tags: (v.snippet?.tags || []).slice(0, 20),
            subscriberCount,
            description: v.snippet?.description || '',
        };
    });

    logger.success('[YouTube] 상위 영상 조회 완료', { count: results.length });
    return results;
};

// === VIDEO TAGS ===

/**
 * 특정 영상의 태그 가져오기
 */
export const getVideoTags = async (videoId: string): Promise<KeywordTag[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[YouTube] 영상 태그 조회', { videoId });

    if (!trackQuota('videos.list')) throw new Error('YouTube API 일일 쿼터 한도(10,000 units)를 초과했습니다. 내일 다시 시도하세요.');

    const url = `${YOUTUBE_API_BASE}/videos?part=snippet&id=${videoId}&key=${apiKey}`;
    const response = await monitoredFetch(url);

    if (!response.ok) throw new Error(`YouTube 영상 태그 오류 (${response.status})`);

    const data = await response.json();
    const tags: string[] = data.items?.[0]?.snippet?.tags || [];

    // 빈도 기반 정렬 (단일 영상이므로 모두 frequency=1)
    const result: KeywordTag[] = tags.map(tag => ({
        tag,
        frequency: 1
    }));

    logger.success('[YouTube] 영상 태그 조회 완료', { tagCount: result.length });
    return result;
};

// === CHANNEL ANALYSIS ===

/**
 * 채널 URL에서 채널 상세 정보 가져오기
 * @param channelUrl 채널 URL (https://youtube.com/@handle, /channel/UCxxx 등)
 */
export const getChannelInfo = async (channelUrl: string): Promise<ChannelInfo> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[YouTube] 채널 정보 조회', { channelUrl });

    // 쿼터 확인 (channels.list=1, 폴백 시 search=100 추가)
    if (!trackQuota('channels.list')) throw new Error('YouTube API 일일 쿼터 한도(10,000 units)를 초과했습니다. 내일 다시 시도하세요.');

    const identifier = extractChannelIdentifier(channelUrl);
    if (!identifier) {
        throw new Error('유효하지 않은 YouTube 채널 URL입니다. (@handle, /channel/UCxxx 형식 지원)');
    }

    let channelId: string;

    if (identifier.type === 'id') {
        channelId = identifier.value;
    } else {
        // handle 또는 custom name → 검색으로 채널 ID 확인
        const searchParam = identifier.type === 'handle'
            ? `&forHandle=@${identifier.value}`
            : `&forUsername=${identifier.value}`;

        // forHandle은 channels API에서 직접 지원
        const searchUrl = `${YOUTUBE_API_BASE}/channels?part=id${searchParam}&key=${apiKey}`;
        const searchResponse = await monitoredFetch(searchUrl);

        if (!searchResponse.ok) {
            // forHandle 실패 시 search API로 폴백
            trackQuota('search');
            const fallbackUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(identifier.value)}&type=channel&maxResults=1&key=${apiKey}`;
            const fallbackResponse = await monitoredFetch(fallbackUrl);
            if (!fallbackResponse.ok) throw new Error('채널을 찾을 수 없습니다.');

            const fallbackData = await fallbackResponse.json();
            channelId = fallbackData.items?.[0]?.id?.channelId;
            if (!channelId) throw new Error('채널을 찾을 수 없습니다.');
        } else {
            const searchData = await searchResponse.json();
            channelId = searchData.items?.[0]?.id;
            if (!channelId) {
                // 검색 API 폴백
                trackQuota('search');
                const fallbackUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(identifier.value)}&type=channel&maxResults=1&key=${apiKey}`;
                const fallbackResponse = await monitoredFetch(fallbackUrl);
                if (!fallbackResponse.ok) throw new Error('채널을 찾을 수 없습니다.');

                const fallbackData = await fallbackResponse.json();
                channelId = fallbackData.items?.[0]?.id?.channelId;
                if (!channelId) throw new Error('채널을 찾을 수 없습니다.');
            }
        }
    }

    // 채널 상세 정보 조회
    trackQuota('channels.list');
    const channelUrl2 = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`;
    const channelResponse = await monitoredFetch(channelUrl2);
    if (!channelResponse.ok) throw new Error(`채널 정보 조회 실패 (${channelResponse.status})`);

    const channelData = await channelResponse.json();
    const channel = channelData.items?.[0];
    if (!channel) throw new Error('채널 정보를 찾을 수 없습니다.');

    const result: ChannelInfo = {
        channelId: channel.id,
        title: channel.snippet?.title || '',
        description: channel.snippet?.description || '',
        thumbnailUrl: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url || '',
        subscriberCount: parseInt(channel.statistics?.subscriberCount || '0'),
        videoCount: parseInt(channel.statistics?.videoCount || '0'),
        viewCount: parseInt(channel.statistics?.viewCount || '0')
    };

    logger.success('[YouTube] 채널 정보 조회 완료', { title: result.title, subscribers: result.subscriberCount });
    return result;
};

/**
 * 채널의 최근 영상 목록 가져오기
 */
export const getRecentVideos = async (
    channelId: string,
    maxResults: number = 10
): Promise<ChannelScript[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[YouTube] 최근 영상 조회', { channelId, maxResults });

    // 쿼터 확인 (search=100 + videos.list=1 = 101 units)
    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도(10,000 units)를 초과했습니다. 내일 다시 시도하세요.');

    // 채널 영상 검색 (최신순)
    const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=${maxResults}&key=${apiKey}`;
    const searchResponse = await monitoredFetch(searchUrl);
    if (!searchResponse.ok) throw new Error(`채널 영상 조회 실패 (${searchResponse.status})`);

    const searchData = await searchResponse.json();
    const videoIds = (searchData.items || [])
        .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
        .filter(Boolean);

    if (videoIds.length === 0) return [];

    // 영상 상세 정보
    trackQuota('videos.list');
    const videoUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
    const videoResponse = await monitoredFetch(videoUrl);
    if (!videoResponse.ok) throw new Error(`영상 상세 조회 실패 (${videoResponse.status})`);

    const videoData = await videoResponse.json();

    const results: ChannelScript[] = (videoData.items || []).map((v: {
        id: string;
        snippet?: {
            title?: string;
            description?: string;
            publishedAt?: string;
        };
        statistics?: { viewCount?: string };
        contentDetails?: { duration?: string };
    }) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        description: v.snippet?.description || '',
        transcript: '', // 자막은 별도 호출 필요
        publishedAt: v.snippet?.publishedAt || '',
        viewCount: parseInt(v.statistics?.viewCount || '0'),
        duration: parseIsoDuration(v.contentDetails?.duration || 'PT0S')
    }));

    logger.success('[YouTube] 최근 영상 조회 완료', { count: results.length });
    return results;
};

/**
 * 채널의 최근 영상을 롱폼/쇼츠 필터링하여 가져오기 (최대 50개 검색 후 필터)
 * @param format 'long' = 60초 이상, 'shorts' = 60초 미만
 */
export const getRecentVideosByFormat = async (
    channelId: string,
    format: 'long' | 'shorts',
    targetCount: number = 10
): Promise<ChannelScript[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[YouTube] 포맷별 영상 조회', { channelId, format, targetCount });

    // 쿼터 확인 (search=100 + videos.list=1 = 101 units)
    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도(10,000 units)를 초과했습니다. 내일 다시 시도하세요.');

    // 충분히 많이 가져와서 필터링 (최대 50개)
    const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=50&key=${apiKey}`;
    const searchResponse = await monitoredFetch(searchUrl);
    if (!searchResponse.ok) throw new Error(`채널 영상 조회 실패 (${searchResponse.status})`);

    const searchData = await searchResponse.json();
    const videoIds = (searchData.items || [])
        .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
        .filter(Boolean);

    if (videoIds.length === 0) return [];

    trackQuota('videos.list');
    const videoUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
    const videoResponse = await monitoredFetch(videoUrl);
    if (!videoResponse.ok) throw new Error(`영상 상세 조회 실패 (${videoResponse.status})`);

    const videoData = await videoResponse.json();

    // 포맷별 필터링 (쇼츠: 60초 미만, 롱폼: 60초 이상)
    const filtered = (videoData.items || []).filter((v: { contentDetails?: { duration?: string } }) => {
        const seconds = isoDurationToSeconds(v.contentDetails?.duration || 'PT0S');
        return format === 'shorts' ? seconds < 60 : seconds >= 60;
    });

    const results: ChannelScript[] = filtered.slice(0, targetCount).map((v: {
        id: string;
        snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } };
        statistics?: { viewCount?: string };
        contentDetails?: { duration?: string };
    }) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        description: v.snippet?.description || '',
        transcript: '',
        publishedAt: v.snippet?.publishedAt || '',
        viewCount: parseInt(v.statistics?.viewCount || '0'),
        duration: parseIsoDuration(v.contentDetails?.duration || 'PT0S'),
        thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || undefined,
    }));

    logger.success('[YouTube] 포맷별 영상 조회 완료', { format, found: results.length });
    return results;
};

// === TRANSCRIPT ===

/**
 * 영상 자막/캡션 가져오기 시도
 * YouTube Data API v3의 captions 엔드포인트를 사용
 *
 * 참고: captions.list는 API 키만으로는 본인 소유 영상만 조회 가능.
 * 타인의 영상에서는 거의 항상 403 Forbidden이 반환됨.
 * OAuth 2.0 없이는 자막 다운로드도 불가.
 * 따라서 captions.list 실패는 치명적 에러가 아니며, 영상 설명으로 대체.
 * (captions.list = 50 quota units — 실패해도 쿼터는 소비됨)
 */
export const getVideoTranscript = async (videoId: string): Promise<string> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[YouTube] 자막 조회 시도', { videoId });

    // captions.list는 타인 영상에서 대부분 실패 (403) — 쿼터 50 units 낭비 가능성 있음
    // 쿼터가 부족하면 바로 description 폴백으로 전환
    if (!trackQuota('captions.list')) {
        logger.warn('[YouTube] 쿼터 부족으로 자막 조회 건너뜀 — 영상 설명으로 대체');
        trackQuota('videos.list');
        return await getVideoDescriptionFallback(videoId, apiKey);
    }

    try {
        // 자막 목록 조회 (API 키만으로 가능하나, 타인 영상은 403 반환이 일반적)
        const captionsUrl = `${YOUTUBE_API_BASE}/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
        const captionsResponse = await monitoredFetch(captionsUrl);

        if (!captionsResponse.ok) {
            // 403은 타인 영상에서 정상적인 동작 — 경고만 남기고 폴백
            const status = captionsResponse.status;
            if (status === 403) {
                logger.info('[YouTube] 자막 접근 권한 없음 (403, 타인 영상) — 영상 설명으로 대체');
            } else {
                logger.warn('[YouTube] 자막 목록 조회 실패', { status, videoId });
            }
            trackQuota('videos.list');
            return await getVideoDescriptionFallback(videoId, apiKey);
        }

        const captionsData = await captionsResponse.json();
        const captions = captionsData.items || [];

        if (captions.length === 0) {
            logger.warn('[YouTube] 자막 없음 — 영상 설명으로 대체');
            trackQuota('videos.list');
            return await getVideoDescriptionFallback(videoId, apiKey);
        }

        // 자막 다운로드에는 OAuth가 필요하므로, 자막이 존재한다는 정보와 함께 설명 반환
        const availableLanguages = captions.map((c: { snippet?: { language?: string; trackKind?: string } }) =>
            `${c.snippet?.language || 'unknown'} (${c.snippet?.trackKind || 'standard'})`
        ).join(', ');

        logger.info('[YouTube] 자막 목록 확인됨', { availableLanguages });

        // 자막 다운로드는 OAuth 필요 → description 폴백
        trackQuota('videos.list');
        const description = await getVideoDescriptionFallback(videoId, apiKey);
        return `[자막 사용 가능: ${availableLanguages}]\n\n${description}`;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // 자막 조회 실패는 치명적 에러가 아님 — 영상 설명으로 대체
        logger.warn('[YouTube] 자막 조회 오류 (비치명적)', msg);
        trackQuota('videos.list');
        return await getVideoDescriptionFallback(videoId, apiKey);
    }
};

/** 영상 설명을 자막 대체로 사용 */
const getVideoDescriptionFallback = async (videoId: string, apiKey: string): Promise<string> => {
    const url = `${YOUTUBE_API_BASE}/videos?part=snippet&id=${videoId}&key=${apiKey}`;
    const response = await monitoredFetch(url);
    if (!response.ok) return '';
    const data = await response.json();
    return data.items?.[0]?.snippet?.description || '';
};

// === CHANNEL STYLE ANALYSIS (AI) ===

/**
 * 채널 대본들을 분석하여 채널 스타일 가이드라인 생성
 * Evolink Gemini 3.1 Pro를 사용하여 채널의 말투, 구조, 패턴 분석
 */
export const analyzeChannelStyle = async (
    scripts: ChannelScript[],
    channelInfo: ChannelInfo
): Promise<ChannelGuideline> => {
    logger.info('[YouTube] 채널 스타일 역설계 분석 시작', { channel: channelInfo.title, scriptCount: scripts.length });

    if (scripts.length === 0) {
        throw new Error('분석할 대본이 없습니다. 최소 1개 이상의 영상 대본이 필요합니다.');
    }

    // 대본 텍스트 결합 (최대 30000자, 넘으면 균등 잘라서)
    const maxChars = 30000;
    const perScript = Math.floor(maxChars / scripts.length);
    const combinedScripts = scripts.map((s, i) =>
        `=== 영상 ${i + 1}: "${s.title}" (조회수 ${s.viewCount.toLocaleString()}) ===\n${(s.transcript || s.description).substring(0, perScript)}`
    ).join('\n\n');

    // 초정밀 스타일 클로닝 역설계 프롬프트
    const systemPrompt = `[Role Definition]
당신은 세계 최고의 '텍스트 포렌식 전문가(Text Forensic Expert)'이자 'AI 페르소나 아키텍트'입니다.
당신의 임무는 아래 제공될 [Raw Data (원본 대본)]를 나노 단위로 해부하여, 해당 화자의 언어 습관, 사고 방식, 무의식적 패턴까지 완벽하게 복제할 수 있는 [궁극의 시스템 프롬프트(System Prompt)]를 설계하는 것입니다.

[Mission Objective]
목표는 단순한 '비슷함'이 아닙니다. "원본 화자가 썼다고 착각할 정도의 100% 싱크로율"입니다.
분석된 결과물(지침서)을 통해 AI가 글을 썼을 때, 원본 화자의 광기, 호흡, 띄어쓰기 습관, 논리적 비약까지 동일하게 구현되어야 합니다.

반드시 JSON 형식으로만 응답하세요. 마크다운 코드 블록 없이 순수 JSON만 출력하세요.`;

    const userPrompt = `채널명: ${channelInfo.title}
구독자: ${channelInfo.subscriberCount.toLocaleString()}명
총 영상: ${channelInfo.videoCount}개

[Raw Data (원본 대본)]
${combinedScripts}

위 대본들을 아래 8가지 항목으로 철저하게 분석하여, 지침서(System Instruction) 안에 구체적인 규칙(Rule)으로 명시하시오.

1. [Cognitive Model] 사고 회로 및 세계관 분석 - 논리 구조, 대상 인식 필터
2. [Syntactic Fingerprint] 문장 구조 및 호흡 분석 - 평균 문장 길이, 종결어미 패턴(확률 분포), 수사 의문문, 접속사 빈도
3. [Visual Formatting] 줄바꿈 및 시각적 리듬 - 줄바꿈 트리거, 공백의 미학
4. [Lexical Database] 핵심 어휘 및 치환 규칙 - 나만의 사전, 비속어/은어 레벨, 의성어/의태어
5. [Narrative Arc] 기-승-전-결 전개 패턴 - 도입부(Hook), 중반부(Build-up), 결말(Pay-off)
6. [Emotional Dynamics] 감정의 증폭과 급변 - 감정 기복 트리거, 반어적 표현
7. [Meta-Fiction] 제4의 벽 및 청자 설정 - 청자 호명 방식
8. [Negative Constraints] 절대 금기 사항 - 캐릭터 붕괴 방지 금지 규칙

다음 JSON 형식으로 결과를 출력하세요:
{
  "channelName": "채널명",
  "tone": "말투/어조 종합 분석 (종결어미 패턴 확률 분포 포함)",
  "structure": "기-승-전-결 전개 패턴 상세 분석",
  "topics": ["주요 주제1", "주요 주제2"],
  "keywords": ["핵심 키워드1", "핵심 키워드2"],
  "targetAudience": "타겟 시청자 분석",
  "avgLength": 평균글자수(숫자),
  "hookPattern": "도입부(Hook) 패턴 - 첫 문장 충격 요법 분석",
  "closingPattern": "결말(Pay-off) 패턴 - 시그니처 엔딩 분석",
  "fullGuidelineText": "위 8가지 분석을 종합한 궁극의 시스템 프롬프트 (이 지침서대로 AI가 글을 쓰면 원본 화자와 100% 동일한 스타일이 나와야 함. 2000자 이상 상세히 작성)"
}`;

    try {
        const chatResponse = await evolinkChat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            { temperature: 0.3, maxTokens: 8000 }
        );

        const content = chatResponse.choices?.[0]?.message?.content || '';

        // JSON 파싱 (마크다운 코드 블록 처리)
        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
        }

        const parsed = JSON.parse(jsonStr);

        const result: ChannelGuideline = {
            channelName: parsed.channelName || channelInfo.title,
            tone: parsed.tone || '',
            structure: parsed.structure || '',
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
            targetAudience: parsed.targetAudience || '',
            avgLength: typeof parsed.avgLength === 'number' ? parsed.avgLength : 0,
            hookPattern: parsed.hookPattern || '',
            closingPattern: parsed.closingPattern || '',
            fullGuidelineText: parsed.fullGuidelineText || ''
        };

        logger.success('[YouTube] 채널 스타일 분석 완료', { channel: result.channelName });
        return result;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('[YouTube] 채널 스타일 분석 실패', msg);
        throw new Error(`채널 스타일 분석 실패: ${msg}`);
    }
};

// === UTILITY ===

/**
 * YouTube API 연결 테스트
 */
export const validateYoutubeConnection = async (apiKey: string): Promise<{ success: boolean; message: string }> => {
    if (!apiKey) return { success: false, message: 'API 키가 입력되지 않았습니다.' };

    try {
        // 연결 테스트도 search API 사용 (100 units) — 쿼터 기록
        trackQuota('search');
        const url = `${YOUTUBE_API_BASE}/search?part=snippet&q=test&maxResults=1&key=${apiKey}`;
        const response = await monitoredFetch(url);

        if (response.status === 400 || response.status === 403) {
            const data = await response.json();
            const reason = data.error?.errors?.[0]?.reason || '';
            if (reason === 'keyInvalid') return { success: false, message: '유효하지 않은 API 키입니다.' };
            if (reason === 'accessNotConfigured') return { success: false, message: 'YouTube Data API v3가 활성화되지 않았습니다.' };
            if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
                return { success: false, message: 'YouTube API 일일 쿼터(10,000 units)가 초과되었습니다. 내일 자정(태평양 시간) 이후 재시도하세요.' };
            }
            return { success: false, message: `인증 오류: ${reason || response.status}` };
        }
        if (response.ok) return { success: true, message: '연결 성공!' };
        return { success: false, message: `서버 응답 오류 (${response.status})` };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, message: `연결 오류: ${msg}` };
    }
};
