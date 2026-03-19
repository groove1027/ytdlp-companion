
import { monitoredFetch as rawFetch, getYoutubeApiKey, getYoutubeApiKeyPoolSize, getActiveYoutubeKeyIndex, rotateYoutubeApiKey } from './apiService';
import { logger } from './LoggerService';
import { showToast } from '../stores/uiStore';
import { evolinkChat, requestEvolinkNative } from './evolinkService';
import type { EvolinkChatMessage, EvolinkContentPart } from './evolinkService';
import type {
    ChannelInfo,
    ChannelScript,
    ChannelGuideline,
    ContentRegion,
    KeywordAnalysisResult,
    RelatedKeyword,
    TopVideo,
    KeywordTag
} from '../types';

/**
 * [FIX #388] AI 응답 JSON에서 제어 문자 제거 후 파싱
 * Gemini가 문자열 리터럴 안에 제어 문자(\x00-\x1f)를 넣을 경우 JSON.parse가
 * "Bad control character in string literal" 에러를 던짐 — 사전 sanitize로 방지
 */
const sanitizeJsonForParse = (raw: string): unknown => {
    // 문자열 리터럴 내부의 제어 문자만 제거 (JSON 구조 문자는 보존)
    const sanitized = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    return JSON.parse(sanitized);
};

/**
 * YouTube API 전용 monitoredFetch 래퍼 — 쿼터 초과 시 다음 키로 자동 전환 (#271)
 * 일반 API 호출(Evolink 등)은 그대로 통과, YouTube API URL에서만 키 전환 로직 작동
 */
const monitoredFetch = async (url: string, options: RequestInit = {}, timeoutMs: number = 0): Promise<Response> => {
    const response = await rawFetch(url, options, timeoutMs);

    if (response.status === 403 && url.includes('googleapis.com/youtube')) {
        const body = await response.clone().text().catch(() => '');
        const lower = body.toLowerCase();

        if (lower.includes('quotaexceeded') || lower.includes('dailylimitexceeded')) {
            const currentKey = getYoutubeApiKey();
            const urlKeyMatch = url.match(/[?&]key=([^&]+)/);
            const urlKey = urlKeyMatch?.[1] || '';

            if (urlKey && urlKey !== currentKey) {
                // 이미 다른 호출에서 키가 전환됨 — 새 키로 재시도
                const newUrl = url.replace(/([?&])key=[^&]+/, `$1key=${currentKey}`);
                return rawFetch(newUrl, options, timeoutMs);
            }

            if (rotateYoutubeApiKey()) {
                const newKey = getYoutubeApiKey();
                const newUrl = url.replace(/([?&])key=[^&]+/, `$1key=${newKey}`);
                const idx = getActiveYoutubeKeyIndex();
                const total = getYoutubeApiKeyPoolSize();
                showToast(`YouTube API 키 쿼터 초과 → 다음 키(${idx + 1}/${total})로 자동 전환`, 3000);
                return rawFetch(newUrl, options, timeoutMs);
            }
        }
    }

    return response;
};

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
    'commentThreads.list': 1,
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
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:loadQuotaRecord', e);
        // localStorage 파싱 실패 시 리셋
    }
    return { date: getTodayString(), used: 0 };
};

/** 쿼터 레코드 저장 */
const saveQuotaRecord = (record: QuotaRecord): void => {
    try {
        localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(record));
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:saveQuotaRecord', e);
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
        // 다중 키 풀 사용 중이면 로컬 쿼터 제한 무시 — 실제 API 403 응답으로 키 전환
        if (getYoutubeApiKeyPoolSize() > 1) {
            record.used += cost;
            saveQuotaRecord(record);
            return true;
        }
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

// === 조회수 알림용 배치 API ===

/** 채널의 최근 영상 ID 목록 조회 (search API, 100 units) */
export const getRecentVideoIds = async (channelId: string, maxResults: number = 10): Promise<string[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');
    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도를 초과했습니다.');

    const url = `${YOUTUBE_API_BASE}/search?part=id&channelId=${channelId}&type=video&order=date&maxResults=${maxResults}&key=${apiKey}`;
    const response = await monitoredFetch(url);
    if (!response.ok) throw new Error(`YouTube 검색 오류 (${response.status})`);

    const data = await response.json();
    return (data.items || [])
        .map((item: Record<string, Record<string, string>>) => item.id?.videoId)
        .filter(Boolean) as string[];
};

/** 영상 조회수 배치 조회 (videos.list, 1 unit per batch of 50) */
export const getVideoStatsBatch = async (
    videoIds: string[]
): Promise<Array<{ videoId: string; title: string; viewCount: number }>> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');
    if (videoIds.length === 0) return [];

    const results: Array<{ videoId: string; title: string; viewCount: number }> = [];

    for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        if (!trackQuota('videos.list')) throw new Error('YouTube API 일일 쿼터 한도를 초과했습니다.');

        const url = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics&id=${batch.join(',')}&key=${apiKey}`;
        const response = await monitoredFetch(url);
        if (!response.ok) throw new Error(`YouTube 영상 통계 오류 (${response.status})`);

        const data = await response.json();
        for (const item of (data.items || [])) {
            results.push({
                videoId: item.id,
                title: item.snippet?.title || '',
                viewCount: parseInt(item.statistics?.viewCount || '0', 10),
            });
        }
    }

    return results;
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

/**
 * YouTube API 403/401 에러에서 API 키 설정 문제를 감지하여 명확한 에러 메시지 throw
 * - accessNotConfigured: YouTube Data API v3 미활성화
 * - keyInvalid: 잘못된 API 키
 * - quotaExceeded: 쿼터 초과
 */
const throwIfApiKeyError = (status: number, body: string): void => {
    if (status !== 403 && status !== 401 && status !== 400) return;
    const lower = body.toLowerCase();
    if (lower.includes('accessnotconfigured') || lower.includes('service_disabled')) {
        throw new Error(
            'YouTube Data API v3가 활성화되지 않은 API 키입니다. ' +
            'Google Cloud Console에서 YouTube Data API v3를 활성화한 후 다시 시도하세요. ' +
            '(설정 > API 키 관리 > Google Cloud Console 링크 참조)'
        );
    }
    if (lower.includes('keyinvalid') || lower.includes('api key not valid')) {
        throw new Error('YouTube API 키가 유효하지 않습니다. 설정에서 올바른 키를 입력해주세요.');
    }
    if (lower.includes('quotaexceeded') || lower.includes('dailylimitexceeded')) {
        throw new Error('YouTube API 일일 쿼터(10,000 units)가 초과되었습니다. 내일 자정(태평양 시간) 이후 재시도하세요.');
    }
    if (lower.includes('permission_denied') || lower.includes('are blocked') || (lower.includes('forbidden') && status === 403)) {
        throw new Error(
            'YouTube API 키의 접근 권한이 차단되어 있습니다. ' +
            'Google Cloud Console에서 API 키 제한 설정을 확인하고, YouTube Data API v3 접근을 허용해주세요.'
        );
    }
};

/** 채널 URL 또는 영상 URL에서 식별자 추출 */
const extractChannelIdentifier = (url: string): { type: 'id' | 'handle' | 'custom' | 'video' | 'shorts'; value: string } | null => {
    // URL 디코딩 (한글 등 %XX 인코딩 처리)
    let decoded = url.trim();
    try { decoded = decodeURIComponent(decoded); } catch (e) { logger.trackSwallowedError('YoutubeAnalysisService:extractChannelIdentifier/decode', e); }

    // 프로토콜 없으면 자동 보정 (youtube.com/... → https://youtube.com/...)
    if (/^(m\.)?youtube\.com/i.test(decoded)) {
        decoded = 'https://' + decoded;
    }
    // youtu.be 단축 URL 보정
    if (/^youtu\.be\//i.test(decoded)) {
        decoded = 'https://' + decoded;
    }

    // @handle만 단독 입력 (URL 없이)
    const bareHandle = decoded.match(/^@([^\s\/]+)$/);
    if (bareHandle) return { type: 'handle', value: bareHandle[1] };

    // UCxxxx 채널 ID만 단독 입력
    const bareId = decoded.match(/^(UC[\w-]{20,})$/);
    if (bareId) return { type: 'id', value: bareId[1] };

    // /shorts/VIDEO_ID 형식 (쇼츠 영상)
    const shortsMatch = decoded.match(/\/shorts\/([\w-]{11})/);
    if (shortsMatch) return { type: 'shorts', value: shortsMatch[1] };

    // /watch?v=VIDEO_ID 형식 (일반 영상)
    const watchMatch = decoded.match(/[?&]v=([\w-]{11})/);
    if (watchMatch) return { type: 'video', value: watchMatch[1] };

    // youtu.be/VIDEO_ID 단축 URL
    const shortUrlMatch = decoded.match(/youtu\.be\/([\w-]{11})/);
    if (shortUrlMatch) return { type: 'video', value: shortUrlMatch[1] };

    // /live/VIDEO_ID 형식 (라이브 URL)
    const liveMatch = decoded.match(/\/live\/([\w-]{11})/);
    if (liveMatch) return { type: 'video', value: liveMatch[1] };

    // /channel/UCxxxx 형식
    const channelMatch = decoded.match(/\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };

    // /@handle 형식 — 한글/일본어/유니코드 지원
    const handleMatch = decoded.match(/\/@([^\/\s?#]+)/);
    if (handleMatch) return { type: 'handle', value: handleMatch[1] };

    // /c/customname 또는 /user/username 형식
    const customMatch = decoded.match(/\/(c|user)\/([^\/\s?#]+)/);
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
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:suggestApi', e);
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
            tags: v.snippet?.tags || [],
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
        throw new Error('유효하지 않은 YouTube URL입니다. (채널, 영상, 쇼츠 URL 모두 지원)');
    }

    let channelId: string;
    let detectedFormat: 'long' | 'shorts' | undefined;

    if (identifier.type === 'video' || identifier.type === 'shorts') {
        // 영상/쇼츠 URL → Videos API로 채널 ID 추출
        trackQuota('videos.list');
        const videoUrl = `${YOUTUBE_API_BASE}/videos?part=snippet&id=${identifier.value}&key=${apiKey}`;
        const videoResponse = await monitoredFetch(videoUrl);
        if (!videoResponse.ok) {
            throwIfApiKeyError(videoResponse.status, await videoResponse.text().catch(() => ''));
            throw new Error('영상 정보를 조회할 수 없습니다.');
        }
        const videoData = await videoResponse.json();
        const videoItem = videoData.items?.[0];
        if (!videoItem) throw new Error('존재하지 않는 영상입니다.');
        channelId = videoItem.snippet?.channelId;
        if (!channelId) throw new Error('영상에서 채널 정보를 추출할 수 없습니다.');
        // 쇼츠 URL이면 자동으로 shorts 포맷 감지
        if (identifier.type === 'shorts') {
            detectedFormat = 'shorts';
        }
        logger.info('[YouTube] 영상 URL에서 채널 ID 추출 완료', { videoId: identifier.value, channelId, detectedFormat });
    } else if (identifier.type === 'id') {
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
            // 403/401 에러 시 API 키 문제를 먼저 확인
            throwIfApiKeyError(searchResponse.status, await searchResponse.text().catch(() => ''));
            // forHandle 실패 시 search API로 폴백
            trackQuota('search');
            const fallbackUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(identifier.value)}&type=channel&maxResults=1&key=${apiKey}`;
            const fallbackResponse = await monitoredFetch(fallbackUrl);
            if (!fallbackResponse.ok) {
                throwIfApiKeyError(fallbackResponse.status, await fallbackResponse.text().catch(() => ''));
                throw new Error('채널을 찾을 수 없습니다.');
            }

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
                if (!fallbackResponse.ok) {
                    throwIfApiKeyError(fallbackResponse.status, await fallbackResponse.text().catch(() => ''));
                    throw new Error('채널을 찾을 수 없습니다.');
                }

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
        viewCount: parseInt(channel.statistics?.viewCount || '0'),
        ...(detectedFormat && { detectedFormat }),
    };

    logger.success('[YouTube] 채널 정보 조회 완료', { title: result.title, subscribers: result.subscriberCount, detectedFormat });
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
 * 쇼츠 판별: 복합 시그널 기반 (duration + player 비율 + 제목/태그)
 * YouTube Data API에는 공식 쇼츠 필터가 없어서 여러 시그널을 조합하여 판별
 *
 * 핵심 로직 변경 (2026.03.11):
 * - player.embedWidth/embedHeight는 임베드 플레이어 크기이지 영상 원본 비율이 아님
 *   → 대부분의 영상(쇼츠 포함)에서 480x270(가로)으로 반환되어 쇼츠를 놓침
 * - 수정: player 비율은 "세로형이 확실할 때만" 쇼츠로 확정하고,
 *   가로형이어도 duration/meta 시그널을 추가 확인
 */
const isShorts = (v: {
    snippet?: { title?: string; tags?: string[] };
    contentDetails?: { duration?: string };
    player?: { embedWidth?: string; embedHeight?: string };
}): boolean => {
    const w = parseInt(v.player?.embedWidth || '0');
    const h = parseInt(v.player?.embedHeight || '0');
    const title = v.snippet?.title || '';
    const tags = v.snippet?.tags || [];
    const seconds = isoDurationToSeconds(v.contentDetails?.duration || 'PT0S');
    const hasShortsMeta = /\bshorts?\b/i.test(title) || tags.some(t => /\bshorts?\b/i.test(t));

    // 1순위: player가 확실히 세로형이면 쇼츠 확정
    if (w > 0 && h > 0 && h > w) return true;

    // 2순위: 제목 또는 태그에 #Shorts / shorts 포함 + 3분 이하
    if (hasShortsMeta && seconds <= 180) return true;

    // 3순위: 60초 이하면 쇼츠로 추정 (player 비율은 임베드 기본값일 수 있어 신뢰 불가)
    if (seconds > 0 && seconds <= 60) return true;

    return false;
};

/**
 * 쇼츠 완화 판별: duration <= 180초 (3분) 이하이면 쇼츠 후보로 간주
 * strict isShorts가 targetCount 미달일 때 보충용으로 사용
 */
const isShortsLenient = (v: {
    snippet?: { title?: string; tags?: string[] };
    contentDetails?: { duration?: string };
    player?: { embedWidth?: string; embedHeight?: string };
}): boolean => {
    const seconds = isoDurationToSeconds(v.contentDetails?.duration || 'PT0S');
    return seconds > 0 && seconds <= 180;
};

type VideoDetailItem = {
    id: string;
    snippet?: { title?: string; description?: string; publishedAt?: string; tags?: string[]; thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } };
    statistics?: { viewCount?: string };
    contentDetails?: { duration?: string };
    player?: { embedWidth?: string; embedHeight?: string };
};

/**
 * 채널의 최근 영상을 롱폼/쇼츠 필터링하여 가져오기
 * 최대 50개 검색 후 필터 + 쇼츠 모드에서 부족하면 완화 필터 + 2페이지 보충
 * @param format 'long' = 가로형 영상, 'shorts' = 세로형 영상
 */
export const getRecentVideosByFormat = async (
    channelId: string,
    format: 'long' | 'shorts',
    targetCount: number = 10,
    sortBy: 'latest' | 'popular' = 'latest',
): Promise<ChannelScript[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[YouTube] 포맷별 영상 조회', { channelId, format, targetCount });

    // 쿼터 확인 (search=100 + videos.list=1 = 101 units)
    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도(10,000 units)를 초과했습니다. 내일 다시 시도하세요.');

    const orderParam = sortBy === 'popular' ? 'viewCount' : 'date';
    const allDetailItems: VideoDetailItem[] = [];
    let nextPageToken: string | undefined;
    let pagesFetched = 0;
    const maxPages = 2; // 최대 2페이지 (100개) — 쿼터 절약

    // 페이지 단위로 검색 + 상세 조회
    while (pagesFetched < maxPages) {
        const pageParam = nextPageToken ? `&pageToken=${nextPageToken}` : '';
        const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&type=video&order=${orderParam}&maxResults=50${pageParam}&key=${apiKey}`;

        // 2페이지부터는 추가 쿼터
        if (pagesFetched > 0) {
            if (!trackQuota('search')) break;
        }

        const searchResponse = await monitoredFetch(searchUrl);
        if (!searchResponse.ok) {
            if (pagesFetched === 0) throw new Error(`채널 영상 조회 실패 (${searchResponse.status})`);
            break; // 2페이지 실패는 무시
        }

        const searchData = await searchResponse.json();
        const videoIds = (searchData.items || [])
            .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
            .filter(Boolean);

        if (videoIds.length === 0) break;

        // player part 추가하여 영상 비율(가로/세로) 정보 확인
        trackQuota('videos.list');
        const videoUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails,player&id=${videoIds.join(',')}&key=${apiKey}`;
        const videoResponse = await monitoredFetch(videoUrl);
        if (!videoResponse.ok) {
            if (pagesFetched === 0) throw new Error(`영상 상세 조회 실패 (${videoResponse.status})`);
            break;
        }

        const videoData = await videoResponse.json();
        allDetailItems.push(...(videoData.items || []));

        pagesFetched++;
        nextPageToken = searchData.nextPageToken;

        // 1페이지로 충분한지 확인 (strict 필터 적용)
        const strictFiltered = allDetailItems.filter(v =>
            format === 'shorts' ? isShorts(v) : !isShorts(v)
        );
        if (strictFiltered.length >= targetCount || !nextPageToken) break;

        // 쇼츠 모드: strict + lenient 합산으로도 충분한지 확인
        if (format === 'shorts') {
            const lenientFiltered = allDetailItems.filter(v => isShortsLenient(v));
            if (lenientFiltered.length >= targetCount) break;
        }
    }

    if (allDetailItems.length === 0) return [];

    // 포맷별 필터링 (strict → lenient 보충)
    let filtered: VideoDetailItem[];
    if (format === 'shorts') {
        // strict 필터 먼저
        const strictResult = allDetailItems.filter(v => isShorts(v));
        if (strictResult.length >= targetCount) {
            filtered = strictResult;
        } else {
            // strict로 부족하면 lenient(3분 이하)로 보충
            const lenientResult = allDetailItems.filter(v => isShortsLenient(v));
            // strict 결과를 우선 배치하고, lenient에서 중복 제거 후 보충
            const strictIds = new Set(strictResult.map(v => v.id));
            const extras = lenientResult.filter(v => !strictIds.has(v.id));
            filtered = [...strictResult, ...extras];
            if (strictResult.length < targetCount && lenientResult.length > strictResult.length) {
                logger.info('[YouTube] 쇼츠 strict 필터 부족 → lenient(3분 이하) 보충', {
                    strict: strictResult.length,
                    lenient: lenientResult.length,
                    targetCount,
                });
            }
        }
    } else {
        filtered = allDetailItems.filter(v => !isShorts(v));
    }

    const results: ChannelScript[] = filtered.slice(0, targetCount).map((v) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        description: v.snippet?.description || '',
        transcript: '',
        publishedAt: v.snippet?.publishedAt || '',
        viewCount: parseInt(v.statistics?.viewCount || '0'),
        duration: parseIsoDuration(v.contentDetails?.duration || 'PT0S'),
        thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || undefined,
        tags: (v.snippet?.tags || []).slice(0, 30),
    }));

    logger.success('[YouTube] 포맷별 영상 조회 완료', { format, found: results.length });
    return results;
};

// === TRANSCRIPT ===

/** 자막 조회 결과 (출처 정보 포함) */
export interface TranscriptResult {
    text: string;
    source: 'caption' | 'description';
}

// Invidious 공개 인스턴스 (자막 조회용 — OAuth 불필요)
const INVIDIOUS_CAPTION_INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.fdn.fr',
    'https://invidious.nerdvpn.de',
    'https://invidious.protokolla.fi',
    'https://invidious.materialio.us',
    'https://invidious.perennialte.ch',
    'https://invidious.lunar.icu',
    'https://inv.tux.pizza',
    'https://invidious.drgns.space',
];

// Piped 공개 인스턴스 (자막 조회용)
const PIPED_CAPTION_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi-libre.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.leptons.xyz',
    'https://api.piped.yt',
    'https://pipedapi.drgns.space',
    'https://pipedapi.reallyaweso.me',
];

/**
 * Invidious API로 자막 텍스트 가져오기
 * GET /api/v1/captions/{videoId} → 자막 목록
 * 자막 URL로 VTT 텍스트 다운로드
 * OAuth 불필요, 쿼터 소비 없음
 */
const fetchTranscriptViaInvidious = async (videoId: string): Promise<string | null> => {
    let consecutiveCorsFailures = 0;
    for (const instance of INVIDIOUS_CAPTION_INSTANCES) {
        // CORS 연속 실패 2회 → 나머지 인스턴스도 동일하므로 조기 종료
        if (consecutiveCorsFailures >= 2) {
            logger.info('[YouTube] Invidious CORS 연속 차단 — 나머지 인스턴스 건너뜀');
            break;
        }
        try {
            // 1단계: 사용 가능한 자막 목록 조회
            const listUrl = `${instance}/api/v1/captions/${videoId}`;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 6000);
            let listRes: Response;
            try {
                listRes = await fetch(listUrl, { signal: ctrl.signal });
            } finally {
                clearTimeout(timer);
            }
            if (!listRes.ok) continue;
            consecutiveCorsFailures = 0; // 성공 응답이면 CORS 아님

            const listData = await listRes.json();
            const captions: { label: string; language_code: string; url: string }[] = listData.captions || [];
            if (captions.length === 0) continue;

            // 2단계: 자막 트랙 우선순위 선택
            const preferredTrack = pickBestCaptionTrack(captions.map(c => ({
                label: c.label,
                languageCode: c.language_code,
                url: c.url,
            })));
            if (!preferredTrack) continue;

            // 3단계: 자막 텍스트 다운로드 (VTT 형식)
            const captionUrl = preferredTrack.url.startsWith('http')
                ? preferredTrack.url
                : `${instance}${preferredTrack.url}`;
            const ctrl2 = new AbortController();
            const timer2 = setTimeout(() => ctrl2.abort(), 8000);
            let captionRes: Response;
            try {
                captionRes = await fetch(captionUrl, { signal: ctrl2.signal });
            } finally {
                clearTimeout(timer2);
            }
            if (!captionRes.ok) continue;

            const rawText = await captionRes.text();
            const cleaned = parseVttToPlainText(rawText);
            if (cleaned.length > 50) {
                logger.success('[YouTube] Invidious 자막 가져오기 성공', {
                    instance, videoId, lang: preferredTrack.languageCode, length: cleaned.length,
                });
                return cleaned;
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'Failed to fetch') consecutiveCorsFailures++;
            logger.trackSwallowedError('youtubeAnalysisService:invidiousCaption', e);
            continue;
        }
    }
    return null;
};

/**
 * Piped API로 자막 텍스트 가져오기
 * GET /streams/{videoId} → subtitles 배열 포함
 */
const fetchTranscriptViaPiped = async (videoId: string): Promise<string | null> => {
    let consecutiveCorsFailures = 0;
    for (const instance of PIPED_CAPTION_INSTANCES) {
        // CORS 연속 실패 2회 → 나머지 인스턴스도 동일하므로 조기 종료
        if (consecutiveCorsFailures >= 2) {
            logger.info('[YouTube] Piped CORS 연속 차단 — 나머지 인스턴스 건너뜀');
            break;
        }
        try {
            const streamsUrl = `${instance}/streams/${videoId}`;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);
            let res: Response;
            try {
                res = await fetch(streamsUrl, { signal: ctrl.signal });
            } finally {
                clearTimeout(timer);
            }
            if (!res.ok) continue;
            consecutiveCorsFailures = 0;

            const data = await res.json();
            if (data.error || !data.title) continue;

            const subtitles: { url: string; mimeType: string; code: string; autoGenerated: boolean; name?: string }[] =
                data.subtitles || [];
            if (subtitles.length === 0) continue;

            // 자막 트랙 우선순위 선택
            const preferredTrack = pickBestCaptionTrack(subtitles.map(s => ({
                label: s.name || s.code,
                languageCode: s.code,
                url: s.url,
                isAutoGenerated: s.autoGenerated,
            })));
            if (!preferredTrack) continue;

            // 자막 텍스트 다운로드
            const ctrl2 = new AbortController();
            const timer2 = setTimeout(() => ctrl2.abort(), 8000);
            let captionRes: Response;
            try {
                captionRes = await fetch(preferredTrack.url, { signal: ctrl2.signal });
            } finally {
                clearTimeout(timer2);
            }
            if (!captionRes.ok) continue;

            const rawText = await captionRes.text();
            const cleaned = parseVttToPlainText(rawText);
            if (cleaned.length > 50) {
                logger.success('[YouTube] Piped 자막 가져오기 성공', {
                    instance, videoId, lang: preferredTrack.languageCode, length: cleaned.length,
                });
                return cleaned;
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'Failed to fetch') consecutiveCorsFailures++;
            logger.trackSwallowedError('youtubeAnalysisService:pipedCaption', e);
            continue;
        }
    }
    return null;
};

/** 자막 트랙 선택 우선순위: 수동 한국어 > 수동 영어 > 자동 한국어 > 자동 영어 > 수동 기타 > 자동 기타 */
interface CaptionTrackInfo {
    label: string;
    languageCode: string;
    url: string;
    isAutoGenerated?: boolean;
}

const pickBestCaptionTrack = (tracks: CaptionTrackInfo[]): CaptionTrackInfo | null => {
    if (tracks.length === 0) return null;

    const isAuto = (t: CaptionTrackInfo): boolean =>
        t.isAutoGenerated === true ||
        /auto|자동/i.test(t.label);

    const isKorean = (code: string) => /^ko/i.test(code);
    const isEnglish = (code: string) => /^en/i.test(code);

    const score = (t: CaptionTrackInfo): number => {
        const auto = isAuto(t) ? 10 : 0;
        if (isKorean(t.languageCode)) return auto + 0;
        if (isEnglish(t.languageCode)) return auto + 1;
        return auto + 5;
    };

    const sorted = [...tracks].sort((a, b) => score(a) - score(b));
    return sorted[0];
};

/**
 * YouTube Innertube API로 자막 가져오기 (youtubei/v1/get_transcript)
 * CORS 프록시 없이 직접 호출 — 브라우저 환경에서는 CORS 제한 가능성 있음
 * 성공 시 가장 정확한 자동 생성 자막 확보 가능
 */
const fetchTranscriptViaInnertube = async (videoId: string): Promise<string | null> => {
    try {
        // 1단계: 영상 페이지에서 innertubeApiKey를 CORS 우회 방식으로 가져오기
        // Innertube API는 고정된 클라이언트 키 사용 가능 (YouTube Web 클라이언트)
        const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const url = `https://www.youtube.com/youtubei/v1/get_transcript?key=${INNERTUBE_API_KEY}`;

        const body = {
            context: {
                client: {
                    clientName: 'WEB',
                    clientVersion: '2.20240313.00.00',
                    hl: 'ko',
                    gl: 'KR',
                },
            },
            params: btoa(`\n\x0b${videoId}`),
        };

        const res = await monitoredFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) return null;

        const data = await res.json();

        // Innertube 응답에서 자막 텍스트 추출
        const actions = data?.actions;
        if (!actions || !Array.isArray(actions)) return null;

        const transcriptAction = actions.find(
            (a: Record<string, unknown>) => a.updateEngagementPanelAction
        );
        const transcriptRenderer = transcriptAction
            ?.updateEngagementPanelAction
            ?.content
            ?.transcriptRenderer
            ?.body
            ?.transcriptBodyRenderer
            ?.cueGroups;

        if (!transcriptRenderer || !Array.isArray(transcriptRenderer)) return null;

        const lines: string[] = [];
        let prevLine = '';
        for (const group of transcriptRenderer) {
            const cues = group?.transcriptCueGroupRenderer?.cues;
            if (!cues || !Array.isArray(cues)) continue;
            for (const cue of cues) {
                const text = cue?.transcriptCueRenderer?.cue?.simpleText?.trim();
                if (text && text !== prevLine) {
                    lines.push(text);
                    prevLine = text;
                }
            }
        }

        if (lines.length > 5) {
            const result = lines.join(' ');
            logger.success('[YouTube] Innertube 자막 가져오기 성공', {
                videoId, length: result.length, lineCount: lines.length,
            });
            return result;
        }
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:innertubeTranscript', e);
    }
    return null;
};

/**
 * YouTube timedtext XML 엔드포인트로 자막 가져오기
 * URL: https://www.youtube.com/api/timedtext?v={videoId}&lang={lang}&fmt=srv3
 * 자동 생성 자막(asr)도 지원: &kind=asr 파라미터 추가
 * CORS 프록시 없이 직접 호출
 */
const fetchTranscriptViaTimedtext = async (videoId: string): Promise<string | null> => {
    // 언어 + 자동생성 여부 조합 시도
    const attempts = [
        { lang: 'ko', kind: '' },        // 수동 한국어
        { lang: 'ko', kind: 'asr' },     // 자동 생성 한국어
        { lang: 'en', kind: '' },         // 수동 영어
        { lang: 'en', kind: 'asr' },      // 자동 생성 영어
        { lang: 'ja', kind: '' },         // 수동 일본어
        { lang: 'ja', kind: 'asr' },      // 자동 생성 일본어
    ];

    for (const { lang, kind } of attempts) {
        try {
            const kindParam = kind ? `&kind=${kind}` : '';
            const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${kindParam}&fmt=srv3`;

            const res = await monitoredFetch(url, {
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) continue;

            const xmlText = await res.text();
            if (!xmlText || xmlText.length < 50) continue;

            // XML에서 텍스트 추출 (<text> 태그 파싱)
            const cleaned = parseTimedtextXmlToPlainText(xmlText);
            if (cleaned.length > 50) {
                logger.success('[YouTube] timedtext XML 자막 가져오기 성공', {
                    videoId, lang, kind: kind || 'manual', length: cleaned.length,
                });
                return cleaned;
            }
        } catch (e) {
            logger.trackSwallowedError('youtubeAnalysisService:timedtextCaption', e);
            continue;
        }
    }
    return null;
};

/** YouTube timedtext XML (srv3 형식) 파싱 — <text> 태그에서 텍스트만 추출 */
const parseTimedtextXmlToPlainText = (xml: string): string => {
    const textLines: string[] = [];
    let prevLine = '';

    // <text start="..." dur="...">텍스트</text> 패턴 매칭
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/gi;
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(xml)) !== null) {
        const raw = match[1]
            .replace(/<[^>]+>/g, '')    // 내부 HTML 태그 제거
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\n/g, ' ')
            .trim();

        if (raw && raw !== prevLine) {
            textLines.push(raw);
            prevLine = raw;
        }
    }

    return textLines.join(' ');
};

/** YouTube timedtext XML (srv3) 파싱 — 타임코드 보존 버전 (영상 분석 AI 입력용) */
const parseTimedtextXmlWithTimecodes = (xml: string): { start: number; dur: number; text: string }[] => {
    const cues: { start: number; dur: number; text: string }[] = [];

    // <text start="1.28" dur="3.76">텍스트</text> 패턴
    const textRegex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
    let match: RegExpExecArray | null;
    let prevText = '';
    while ((match = textRegex.exec(xml)) !== null) {
        const start = parseFloat(match[1]);
        const dur = parseFloat(match[2]);
        const raw = match[3]
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\n/g, ' ')
            .trim();
        if (raw && raw !== prevText) {
            cues.push({ start, dur, text: raw });
            prevText = raw;
        }
    }
    return cues;
};

/** 타임코드 보존 cue 배열 → Gemini 입력용 포맷 문자열 */
const formatTimedCuesForAI = (cues: { start: number; dur: number; text: string }[]): string => {
    if (cues.length === 0) return '';
    const fmtTime = (sec: number): string => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toFixed(1).padStart(4, '0')}`;
    };
    const lines = cues.map(c => `[${fmtTime(c.start)}~${fmtTime(c.start + c.dur)}] ${c.text}`);
    return `## 영상 자막 전사 (YouTube 자동/수동 자막 — 정확한 타임코드 포함)\n` +
        `아래 각 줄의 [시작~끝] 타임코드는 원본 영상의 실제 시간입니다.\n` +
        `편집 테이블의 타임코드 소스를 작성할 때, 반드시 이 실제 타임코드를 기준으로 하세요.\n\n` +
        lines.join('\n');
};

/**
 * [FIX #perf] YouTube timedtext에서 타임코드 보존 자막을 가져옴
 * VideoAnalysisRoom에서 AI 분석 전 호출하여, Gemini에 실제 타임코드를 제공
 * 기존 getVideoTranscript와 독립적 — 실패해도 분석 진행에 영향 없음
 */
export const fetchTimedTranscriptForAnalysis = async (videoId: string): Promise<string | null> => {
    // timedtext XML만 시도 (타임코드 보존 가능한 유일한 소스)
    const attempts = [
        { lang: 'ko', kind: '' },
        { lang: 'ko', kind: 'asr' },
        { lang: 'en', kind: '' },
        { lang: 'en', kind: 'asr' },
        { lang: 'ja', kind: '' },
        { lang: 'ja', kind: 'asr' },
    ];

    for (const { lang, kind } of attempts) {
        try {
            const kindParam = kind ? `&kind=${kind}` : '';
            const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${kindParam}&fmt=srv3`;
            const res = await monitoredFetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;

            const xmlText = await res.text();
            if (!xmlText || xmlText.length < 50) continue;

            const cues = parseTimedtextXmlWithTimecodes(xmlText);
            if (cues.length > 3) {
                logger.success('[YouTube] 타임코드 보존 자막 가져오기 성공', {
                    videoId, lang, kind: kind || 'manual', cueCount: cues.length,
                });
                return formatTimedCuesForAI(cues);
            }
        } catch (e) {
            logger.trackSwallowedError('youtubeAnalysisService:timedTranscriptForAnalysis', e);
            continue;
        }
    }
    return null;
};

/** VTT/SRT 자막 텍스트를 일반 텍스트로 변환 (타임코드, 태그 제거, 중복 제거) */
const parseVttToPlainText = (raw: string): string => {
    const lines = raw.split('\n');
    const textLines: string[] = [];
    let prevLine = '';

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === 'WEBVTT' || trimmed.startsWith('Kind:') || trimmed.startsWith('Language:')) continue;
        if (trimmed.startsWith('NOTE')) continue;
        if (/^\d+$/.test(trimmed)) continue;
        if (/-->/.test(trimmed)) continue;
        if (/^\d{2}:\d{2}/.test(trimmed) && /\d{2}\.\d{3}/.test(trimmed)) continue;

        const cleaned = trimmed
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .trim();

        if (!cleaned) continue;
        if (cleaned !== prevLine) {
            textLines.push(cleaned);
            prevLine = cleaned;
        }
    }

    return textLines.join(' ');
};

/**
 * 영상 자막/캡션 가져오기 — 다단계 폴백 체인
 *
 * 우선순위:
 * 1. Invidious API (무료, OAuth 불필요, 쿼터 소비 없음)
 * 2. Piped API (무료, OAuth 불필요, 쿼터 소비 없음)
 * 3. YouTube Innertube API (무료, OAuth 불필요, 쿼터 소비 없음)
 * 4. YouTube timedtext XML (무료, OAuth 불필요, 쿼터 소비 없음)
 * 5. YouTube Data API captions.list (50 쿼터, 목록만 확인 가능)
 * 6. 영상 설명 폴백 (최후 수단 — 분석 품질 저하 경고 포함)
 */
export const getVideoTranscript = async (videoId: string): Promise<TranscriptResult> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[YouTube] 자막 조회 시도 (Invidious → Piped → Innertube → timedtext → YouTube API → 설명 폴백)', { videoId });

    // === 1단계: Invidious API (최우선 — 무료, 쿼터 없음) ===
    try {
        const invidiousResult = await fetchTranscriptViaInvidious(videoId);
        if (invidiousResult) {
            return { text: invidiousResult, source: 'caption' };
        }
        logger.info('[YouTube] Invidious 자막 실패 — Piped 시도', { videoId });
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:invidiousTranscript', e);
        logger.info('[YouTube] Invidious 자막 오류 — Piped 시도', { videoId });
    }

    // === 2단계: Piped API (2순위 — 무료, 쿼터 없음) ===
    try {
        const pipedResult = await fetchTranscriptViaPiped(videoId);
        if (pipedResult) {
            return { text: pipedResult, source: 'caption' };
        }
        logger.info('[YouTube] Piped 자막 실패 — Innertube 시도', { videoId });
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:pipedTranscript', e);
        logger.info('[YouTube] Piped 자막 오류 — Innertube 시도', { videoId });
    }

    // === 3단계: YouTube Innertube API (무료, 쿼터 없음, CORS 제한 가능) ===
    try {
        const innertubeResult = await fetchTranscriptViaInnertube(videoId);
        if (innertubeResult) {
            return { text: innertubeResult, source: 'caption' };
        }
        logger.info('[YouTube] Innertube 자막 실패 — timedtext 시도', { videoId });
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:innertubeTranscript', e);
        logger.info('[YouTube] Innertube 자막 오류 — timedtext 시도', { videoId });
    }

    // === 4단계: YouTube timedtext XML (무료, 쿼터 없음, 자동생성 자막 지원) ===
    try {
        const timedtextResult = await fetchTranscriptViaTimedtext(videoId);
        if (timedtextResult) {
            return { text: timedtextResult, source: 'caption' };
        }
        logger.info('[YouTube] timedtext 자막 실패 — YouTube API 시도', { videoId });
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:timedtextTranscript', e);
        logger.info('[YouTube] timedtext 자막 오류 — YouTube API 시도', { videoId });
    }

    // === 5단계: YouTube Data API captions.list (50 쿼터, 목록만 확인 가능) ===
    if (trackQuota('captions.list')) {
        try {
            const captionsUrl = `${YOUTUBE_API_BASE}/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
            const captionsResponse = await monitoredFetch(captionsUrl);

            if (captionsResponse.ok) {
                const captionsData = await captionsResponse.json();
                const captions = captionsData.items || [];

                if (captions.length > 0) {
                    const availableLanguages = captions.map((c: { snippet?: { language?: string; trackKind?: string } }) =>
                        `${c.snippet?.language || 'unknown'} (${c.snippet?.trackKind || 'standard'})`
                    ).join(', ');
                    logger.info('[YouTube] 자막 목록 확인됨 (다운로드는 OAuth 필요)', { availableLanguages });
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn('[YouTube] YouTube API 자막 조회 오류 (비치명적)', msg);
        }
    } else {
        logger.info('[YouTube] 쿼터 부족으로 YouTube API 자막 조회 건너뜀');
    }

    // === 6단계: 영상 설명 폴백 (최후 수단) ===
    logger.warn('[YouTube] 모든 자막 소스 실패 — 영상 설명으로 대체 (분석 품질 저하 가능)', { videoId });
    try {
        trackQuota('videos.list');
        const description = await getVideoDescriptionFallback(videoId, apiKey);
        return {
            text: description
                ? `[⚠ 자막 미확보 — 영상 설명(description)으로 대체됨. 실제 대본이 아니므로 말투·구조 분석 정확도가 낮을 수 있음]\n\n${description}`
                : '',
            source: 'description',
        };
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:descriptionFallback', e);
        return { text: '', source: 'description' };
    }
};

/** 영상 설명을 자막 대체로 사용 — 제목+설명 결합 (#286) */
const getVideoDescriptionFallback = async (videoId: string, apiKey: string): Promise<string> => {
    const url = `${YOUTUBE_API_BASE}/videos?part=snippet&id=${videoId}&key=${apiKey}`;
    const response = await monitoredFetch(url);
    if (!response.ok) return '';
    const data = await response.json();
    const snippet = data.items?.[0]?.snippet;
    if (!snippet) return '';
    const title = snippet.title || '';
    const description = snippet.description || '';
    return [title, description].filter(Boolean).join('\n\n');
};

// === CHANNEL STYLE ANALYSIS (AI) ===

/**
 * 대본 텍스트에서 콘텐츠 언어/지역을 자동 감지
 * 한글 비율이 10% 미만이면 해외 콘텐츠로 판단
 */
export const detectContentRegion = (scripts: ChannelScript[]): ContentRegion => {
    const sample = scripts.map(s => s.transcript || s.description || '').join(' ').slice(0, 5000);
    const totalChars = sample.replace(/\s/g, '').length;
    if (totalChars === 0) return 'domestic';
    const koreanChars = (sample.match(/[\uAC00-\uD7AF]/g) || []).length;
    return (koreanChars / totalChars) < 0.1 ? 'overseas' : 'domestic';
};

/**
 * 해외 콘텐츠의 주요 언어를 추정 (영어/일본어/스페인어 등)
 */
const detectPrimaryLanguage = (scripts: ChannelScript[]): string => {
    const sample = scripts.map(s => s.transcript || '').join(' ').slice(0, 3000);
    const jpChars = (sample.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
    const latinChars = (sample.match(/[a-zA-Z]/g) || []).length;
    const totalNonSpace = sample.replace(/\s/g, '').length;
    if (totalNonSpace === 0) return 'English';
    if (jpChars / totalNonSpace > 0.3) return 'Japanese';
    if (latinChars / totalNonSpace > 0.5) return 'English';
    return 'English'; // 기본값
};

/**
 * 채널 대본들을 분석하여 채널 스타일 가이드라인 생성
 * Evolink Gemini 3.1 Pro를 사용하여 채널의 말투, 구조, 패턴 분석
 */
export const analyzeChannelStyle = async (
    scripts: ChannelScript[],
    channelInfo: ChannelInfo,
    contentRegion: ContentRegion = 'domestic'
): Promise<ChannelGuideline> => {
    logger.info('[YouTube] 채널 스타일 역설계 분석 시작', { channel: channelInfo.title, scriptCount: scripts.length });

    if (scripts.length === 0) {
        throw new Error('분석할 대본이 없습니다. 최소 1개 이상의 영상 대본이 필요합니다.');
    }

    // 각 영상별 수집 현황 로깅 (진단용)
    scripts.forEach((s, i) => {
        const transcriptLen = (s.transcript || '').length;
        const descLen = (s.description || '').length;
        const tagCount = (s.tags || []).length;
        logger.info(`[YouTube] 영상 ${i + 1}/${scripts.length} 수집 현황`, {
            title: s.title.substring(0, 50),
            transcriptChars: transcriptLen,
            descriptionChars: descLen,
            tagCount,
            effectiveSource: transcriptLen > 0 ? 'transcript' : descLen > 0 ? 'description' : 'tags/title only',
        });
    });

    // 영상 목록 요약 (AI가 전체 영상을 인식하도록)
    const videoSummary = scripts.map((s, i) => {
        const tagsStr = (s.tags || []).slice(0, 10).join(', ');
        return `  ${i + 1}. "${s.title}" — 조회수 ${s.viewCount.toLocaleString()}, 길이 ${s.duration || '알 수 없음'}${tagsStr ? `, 태그: [${tagsStr}]` : ''}`;
    }).join('\n');

    // 대본 텍스트 결합 (최대 30000자, 넘으면 균등 잘라서)
    const maxChars = 30000;
    const perScript = Math.floor(maxChars / scripts.length);
    // 자막 출처 통계 (AI 프롬프트에 포함하여 분석 품질 기대치 조정)
    const captionCount = scripts.filter(s => s.transcriptSource === 'caption').length;
    const descriptionCount = scripts.filter(s => s.transcriptSource === 'description').length;
    const combinedScripts = scripts.map((s, i) => {
        const isDescOnly = s.transcriptSource === 'description';
        const tagsStr = (s.tags || []).slice(0, 15).join(', ');
        const sourceLabel = isDescOnly ? ' [⚠ 자막 없음 — 설명란만 참고]' : ' [자막 확보]';
        const header = `=== 영상 ${i + 1}/${scripts.length}: "${s.title}" (조회수 ${s.viewCount.toLocaleString()}, 길이 ${s.duration || '?'})${sourceLabel} ===`;
        const tagLine = tagsStr ? `[태그] ${tagsStr}` : '';

        let bodyText: string;
        if (isDescOnly) {
            // [FIX #186] 자막 미확보 → 설명란은 면책조항/기획의도가 많으므로 축소 + 명시적 라벨링
            const rawDesc = s.transcript || s.description || '';
            // 면책조항/법적고지/기획의도 영역 필터: 해당 키워드 이후 텍스트 제거
            const cutPatterns = /(?:면책\s*조항|법적\s*고지|저작권\s*고지|본\s*영상은\s*투자|수익\s*보장|협찬|광고\s*포함|기획\s*의도|Disclaimer)/i;
            const cutIdx = rawDesc.search(cutPatterns);
            const cleaned = cutIdx > 50 ? rawDesc.substring(0, cutIdx).trim() : rawDesc;
            // 설명란 전용: 500자 제한 + 명시 라벨
            bodyText = cleaned
                ? `[설명란 요약 — 주제/키워드 참고만, 말투·구조 분석 제외]\n${cleaned.substring(0, 500)}`
                : '[본문 없음 — 태그/제목에서 주제 파악 필요]';
        } else {
            const textContent = s.transcript || '';
            bodyText = textContent ? `[본문]\n${textContent.substring(0, perScript - 300)}` : '[본문 없음 — 태그/제목/설명에서 주제 파악 필요]';
        }

        const descLine = !isDescOnly && s.description ? `[설명] ${s.description.substring(0, 200)}` : '';
        return [header, tagLine, descLine, bodyText].filter(Boolean).join('\n');
    }).join('\n\n');
    // 설명 전용 영상이 과반일 경우 AI에게 경고 주입
    const descriptionWarning = descriptionCount > 0
        ? `\n\n[⚠ 데이터 품질 경고] ${scripts.length}개 영상 중 ${captionCount}개는 실제 자막(대본), ${descriptionCount}개는 영상 설명(description)으로 대체됨.\n영상 설명은 실제 말투/구조와 다를 수 있으므로, "영상 설명으로 대체" 표시된 영상은 주제/키워드 참고용으로만 활용하고, 말투·종결어미·호흡 분석은 자막이 확보된 영상 위주로 수행하세요.`
        : '';

    // 해외 콘텐츠 여부에 따라 분석 차원 및 지침서 템플릿 분기
    const isOverseas = contentRegion === 'overseas';
    const primaryLang = isOverseas ? detectPrimaryLanguage(scripts) : 'Korean';

    // 초정밀 스타일 클로닝 역설계 프롬프트
    const languageContext = isOverseas
        ? `\n\n[Language & Cultural Context]
이 채널은 해외(${primaryLang}) 콘텐츠입니다.
⚠ 모든 문법·구조 분석은 반드시 ${primaryLang} 문법 체계를 기준으로 수행하세요.
한국어 종결어미(~다, ~요, ~네요 등), 한국어 접속사, 한국어 문법 패턴은 절대 사용하지 마세요.
대신 ${primaryLang}의 고유한 문법 구조(시제 분포, 능동/수동태 비율, 문장 유형, 접속사/전환어, 관사 사용 등)를 분석하세요.
해당 문화권(북미/유럽/일본 등)의 콘텐츠 소비 패턴, 시청자 특성, 문화적 맥락을 반영하세요.
결과는 한국어로 작성하되, 분석 기준은 원본 콘텐츠의 언어(${primaryLang})로 하세요.`
        : '';

    const systemPrompt = `[Role Definition]
당신은 세계 최고의 '텍스트 포렌식 전문가(Text Forensic Expert)'이자 'AI 페르소나 아키텍트'입니다.
당신의 임무는 아래 제공될 [Raw Data (원본 대본)]를 나노 단위로 해부하여, 해당 화자의 언어 습관, 사고 방식, 무의식적 패턴까지 완벽하게 복제할 수 있는 [궁극의 시스템 프롬프트(System Prompt)]를 설계하는 것입니다.

[Mission Objective]
목표는 단순한 '비슷함'이 아닙니다. "원본 화자가 썼다고 착각할 정도의 100% 싱크로율"입니다.
분석된 결과물(지침서)을 통해 AI가 글을 썼을 때, 원본 화자의 광기, 호흡, 띄어쓰기 습관, 논리적 비약까지 동일하게 구현되어야 합니다.

[Multi-Video Analysis Rule]
제공되는 ${scripts.length}개의 영상을 반드시 모두 개별적으로 분석하세요.
한 영상에만 치우치면 안 됩니다. 각 영상의 제목, 태그, 본문(또는 설명)을 모두 참고하여:
- 공통 패턴: 모든 영상에서 반복되는 스타일/어투/구조
- 주제 다양성: 각 영상이 다루는 서로 다른 주제 범주
- 개별 특성: 특정 영상에서만 나타나는 독특한 요소
이 세 가지를 구분하여 분석하세요. 본문이 짧거나 없는 영상은 제목과 태그에서 주제를 유추하세요.${languageContext}

반드시 JSON 형식으로만 응답하세요. 마크다운 코드 블록 없이 순수 JSON만 출력하세요.`;

    // 해외 콘텐츠용 분석 차원 (영어 문법 체계 기반)
    const analysisDimensions = isOverseas
        ? `1. [Cognitive Model] 사고 회로 및 세계관 분석 - 논리 구조, 대상 인식 필터, 문화적 전제(해당 문화권의 가치관·유머·상식 반영)
2. [Syntactic Fingerprint] ${primaryLang} 문장 구조 분석 - 평균 문장 길이(단어 수), 시제 분포(현재/과거/미래 비율%), 능동태/수동태 비율, 문장 유형(단문/중문/복문 비율%), 수사 의문문 빈도, 접속사·전환어(however/moreover/but 등) 패턴, 관용구·축약형 사용 빈도
3. [Visual Formatting] 줄바꿈 및 시각적 리듬 - 줄바꿈 트리거, 공백의 미학
4. [Lexical Database] 핵심 어휘 및 치환 규칙 - 화자 고유의 ${primaryLang} 표현, 구어체/문어체 레벨(register), 은어/슬랭, 관용구(idioms), 비유적 표현
5. [Narrative Arc] 서사 전개 패턴 - 도입부(Hook), 중반부(Build-up), 결말(Pay-off), 해당 문화권의 스토리텔링 관습 반영
6. [Emotional Dynamics] 감정의 증폭과 급변 - 감정 기복 트리거, 반어적 표현, 해당 문화의 감정 표현 방식
7. [Meta-Fiction] 제4의 벽 및 청자 설정 - 청자 호명 방식 (guys/folks/everyone 등)
8. [Cultural Context] 문화적 맥락 - 해당 문화권의 레퍼런스, 밈, 유머 코드, 시청자 인구통계(연령/지역/관심사), 해당 국가의 콘텐츠 트렌드`
        : `1. [Cognitive Model] 사고 회로 및 세계관 분석 - 논리 구조, 대상 인식 필터
2. [Syntactic Fingerprint] 문장 구조 및 호흡 분석 - 평균 문장 길이, 종결어미 패턴(확률 분포), 수사 의문문, 접속사 빈도
3. [Visual Formatting] 줄바꿈 및 시각적 리듬 - 줄바꿈 트리거, 공백의 미학
4. [Lexical Database] 핵심 어휘 및 치환 규칙 - 나만의 사전, 비속어/은어 레벨, 의성어/의태어
5. [Narrative Arc] 기-승-전-결 전개 패턴 - 도입부(Hook), 중반부(Build-up), 결말(Pay-off)
6. [Emotional Dynamics] 감정의 증폭과 급변 - 감정 기복 트리거, 반어적 표현
7. [Meta-Fiction] 제4의 벽 및 청자 설정 - 청자 호명 방식
8. [Negative Constraints] 절대 금기 사항 - 캐릭터 붕괴 방지 금지 규칙`;

    // 해외 콘텐츠용 fullGuidelineText 템플릿 (영어 문법 분석 구조)
    const guidelineTemplate = isOverseas
        ? `"위 8가지 분석을 종합한 궁극의 시스템 프롬프트. 아래 구조로 4000자 이상 매우 상세히 작성 (한국어로 작성하되, 문법·구조 분석은 ${primaryLang} 기준으로):\\n\\n[페르소나 선언] 이 AI의 정체성 한 줄 정의\\n[사고 회로] 논리 구조, 세계관, 문화적 전제 상세 규칙\\n[${primaryLang} 문장 구조 규칙] 평균 문장 길이(단어 수), 시제 분포표(present 40%, past 30% 등), 능동/수동태 비율, 문장 유형 분포(simple/compound/complex %), 수사 의문문 빈도, 접속사·전환어 패턴(however, but, so 등 빈도), 관용구·축약형 사용 규칙\\n[어휘 사전] 이 화자만의 고유 ${primaryLang} 표현 20개 이상 + 치환 규칙(일반 표현→화자 표현), register 레벨(formal/casual/colloquial)\\n[줄바꿈 규칙] 줄바꿈 트리거 조건, 공백 활용 패턴, 시각적 리듬\\n[서사 구조] 도입부 Hook 공식(3가지 이상 예시), 중반 Build-up 패턴, 결말 Pay-off 시그니처\\n[감정 역학] 감정 증폭 트리거, 급변 패턴, 반어법 사용 규칙\\n[청자 관계] 호명 방식(guys/folks 등), 제4의 벽 활용, 공감대 형성 전략\\n[문화적 맥락] 해당 문화권의 레퍼런스, 밈, 유머 코드, 콘텐츠 트렌드, 시청자 인구통계 반영 규칙\\n[절대 금기] 캐릭터 붕괴 방지 금지 규칙 5개 이상\\n[실전 예시] 이 화자 스타일로 쓴 ${primaryLang} 도입부 3개 + 결말부 2개 예시"`
        : `"위 8가지 분석을 종합한 궁극의 시스템 프롬프트. 아래 구조로 4000자 이상 매우 상세히 작성:\\n\\n[페르소나 선언] 이 AI의 정체성 한 줄 정의\\n[사고 회로] 논리 구조, 세계관, 대상 인식 필터 상세 규칙\\n[문장 구조 규칙] 평균 문장 길이, 종결어미 확률 분포표(~다 30%, ~요 20% 등), 수사 의문문 빈도, 접속사 패턴\\n[어휘 사전] 이 화자만의 고유 표현 20개 이상 + 치환 규칙(일반어→화자 표현)\\n[줄바꿈 규칙] 줄바꿈 트리거 조건, 공백 활용 패턴, 시각적 리듬\\n[서사 구조] 도입부 Hook 공식(3가지 이상 예시), 중반 Build-up 패턴, 결말 Pay-off 시그니처\\n[감정 역학] 감정 증폭 트리거, 급변 패턴, 반어법 사용 규칙\\n[청자 관계] 호명 방식, 제4의 벽 활용, 공감대 형성 전략\\n[절대 금기] 캐릭터 붕괴 방지 금지 규칙 5개 이상\\n[실전 예시] 이 화자 스타일로 쓴 도입부 3개 + 결말부 2개 예시"`;

    // 해외 콘텐츠용 tone/structure 필드 설명
    const toneDesc = isOverseas
        ? `"말투/어조 종합 분석 (${primaryLang} 시제·태·문장유형 분포 포함, 한국어 종결어미 분석 금지)"`
        : `"말투/어조 종합 분석 (종결어미 패턴 확률 분포 포함)"`;
    const structureDesc = isOverseas
        ? `"서사 전개 패턴 상세 분석 (해당 문화권의 스토리텔링 관습 반영)"`
        : `"기-승-전-결 전개 패턴 상세 분석"`;

    const userPrompt = `채널명: ${channelInfo.title}
구독자: ${channelInfo.subscriberCount.toLocaleString()}명
총 영상: ${channelInfo.videoCount}개
분석 대상 영상 수: ${scripts.length}개
${isOverseas ? `콘텐츠 언어: ${primaryLang} (해외 콘텐츠)\n` : ''}
[분석 대상 영상 목록 — 반드시 전부 분석할 것]
${videoSummary}

[중요 지시사항]
위 ${scripts.length}개 영상을 모두 개별적으로 분석하세요.
특정 영상 1~2개에만 치우치지 말고, 모든 영상에서 공통점과 차이점을 추출하세요.
각 영상의 제목, 태그, 본문(또는 설명)을 모두 참고하여 채널 전체의 주제 다양성과 스타일 패턴을 파악하세요.
본문이 짧거나 없는 영상은 제목/태그/설명에서 주제와 스타일을 유추하세요.
${isOverseas ? `\n[⚠ 해외 콘텐츠 분석 주의사항]\n이 콘텐츠는 ${primaryLang}로 제작되었습니다. 문장 구조 분석 시 반드시 ${primaryLang} 문법 체계(시제, 태, 절 구조, 접속사 등)를 기준으로 분석하세요.\n한국어 문법 요소(종결어미, 조사 등)로 분석하면 안 됩니다. 해당 문화권의 콘텐츠 특성과 시청자 배경도 함께 분석하세요.\n` : ''}
[Raw Data (원본 대본) — ${scripts.length}개 영상]${descriptionWarning}
${combinedScripts}

위 ${scripts.length}개 영상 전체를 아래 8가지 항목으로 철저하게 분석하여, 지침서(System Instruction) 안에 구체적인 규칙(Rule)으로 명시하시오.

${analysisDimensions}

다음 JSON 형식으로 결과를 출력하세요 (${scripts.length}개 영상 전체를 종합 반영):
{
  "channelName": "채널명",
  "tone": ${toneDesc},
  "structure": ${structureDesc},
  "topics": ["${scripts.length}개 영상에서 추출한 주요 주제 — 각 영상의 제목/태그/본문에서 파악한 다양한 주제를 모두 포함"],
  "keywords": ["${scripts.length}개 영상 전체에서 추출한 핵심 키워드"],
  "targetAudience": "타겟 시청자 분석 (${scripts.length}개 영상의 주제 다양성 반영${isOverseas ? ', 해당 문화권의 인구통계·관심사 포함' : ''})",
  "avgLength": 평균글자수(숫자),
  "hookPattern": "도입부(Hook) 패턴 - 첫 문장 충격 요법 분석",
  "closingPattern": "결말(Pay-off) 패턴 - 시그니처 엔딩 분석",
  "fullGuidelineText": ${guidelineTemplate}
}`;

    try {
        const chatResponse = await evolinkChat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            { temperature: 0.3, maxTokens: 16000 }
        );

        const content = chatResponse.choices?.[0]?.message?.content || '';

        // JSON 파싱 (마크다운 코드 블록 처리 + 제어 문자 sanitize)
        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = sanitizeJsonForParse(jsonStr) as any;

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

// === CHANNEL STYLE DNA (3-Layer Analysis) ===

/**
 * YouTube 영상 상위 댓글 가져오기 (commentThreads.list = 1 unit)
 */
export const getVideoComments = async (videoId: string, maxResults: number = 30): Promise<string[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) return [];
    if (!trackQuota('commentThreads.list')) return [];
    try {
        const url = `${YOUTUBE_API_BASE}/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&textFormat=plainText&key=${apiKey}`;
        const response = await monitoredFetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return (data.items || [])
            .map((item: { snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } } }) =>
                item.snippet?.topLevelComment?.snippet?.textDisplay || ''
            ).filter(Boolean);
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:fetchComments', e);
        return [];
    }
};

/**
 * L2: 썸네일 시각 스타일 분석 (Gemini Vision — multimodal)
 * 영상당 2장 (커스텀 썸네일 + 중간 캡처) → Gemini에 배치 전송
 * [FIX #282] 400 에러(콘텐츠 정책) 시 점진적 폴백: 이미지 축소 → 썸네일만
 */
const analyzeThumbnailStyle = async (scripts: ChannelScript[], contentRegion: ContentRegion = 'domestic'): Promise<string> => {
    const ytScripts = scripts.filter(s => s.videoId && !s.videoId.startsWith('manual-') && !s.videoId.startsWith('file-'));
    if (ytScripts.length === 0) return '';

    const isOverseas = contentRegion === 'overseas';
    const systemContent = `YouTube 채널 시각 스타일 분석 전문가. 한국어로 응답.${isOverseas ? ' 해외 채널이므로 해당 문화권의 시각적 트렌드와 디자인 관습을 반영하여 분석.' : ''}`;

    const promptText = (count: number, thumbnailOnly: boolean) => `아래 이미지는 같은 YouTube 채널의 ${thumbnailOnly ? '썸네일' : '썸네일(홀수번째)과 영상 중간 캡처(짝수번째)'}입니다. ${count}개 영상의 시각적 스타일 패턴을 분석하세요.

분석 항목:
1. 색상 팔레트: 지배적 색상 3~5개 (HEX 코드 추정), 색온도(K 추정), 채도 레벨(0~100%), 명암 대비 수준, 그라디언트/단색 경향
2. 타이포그래피 (매우 상세):
   - 메인 텍스트: 폰트 계열(고딕/명조/손글씨/장식), 추정 폰트명, 굵기(Bold/ExtraBold 등), 크기(화면 대비 %), 색상(HEX), 테두리/그림자 효과
   - 서브 텍스트: 폰트, 크기, 색상, 배치 위치
   - 강조 방식: 밑줄/박스/색반전/기울기 등
   - 텍스트 배치 규칙: 화면 내 좌표(상단좌측/중앙/하단 등), 여백, 정렬
3. 구도: 프레이밍 패턴(클로즈업/미디엄/와이드 비율), 3분할법 활용, 대칭/비대칭, 시선 유도 방향, 여백 활용
4. 인물: 얼굴 크기(화면 대비 %), 위치(좌/중앙/우), 표정 유형별 빈도(놀람/웃음/진지 등), 포즈 패턴
5. 브랜딩: 반복 로고 위치/크기, 시그니처 색상, 레이아웃 템플릿 공식
6. 영상 내 자막/오버레이:
   - 자막 폰트, 크기, 색상(HEX), 배경색, 테두리, 위치(상/중/하), 애니메이션(팝업/슬라이드/타이핑)
   - 강조 자막: 크기 확대율, 색상 변경, 효과음 동반 여부
   - 정보 그래픽: 차트/그래프/아이콘 스타일, 색상 체계
7. 텍스처/화풍: 필터 효과, 빈티지/모던/미니멀/맥시멀 경향, 노이즈/그레인 유무

이 채널의 시각적 스타일을 완벽히 복제할 수 있도록 매우 구체적으로 작성하세요. 이미지 생성 프롬프트로 바로 사용 가능할 정도의 구체적인 수치와 색상 코드를 포함하세요.`;

    // 이미지 구성: 전체(썸네일+프레임) → 축소(5개) → 썸네일만
    const buildImages = (maxVideos: number, thumbnailOnly: boolean): EvolinkContentPart[] => {
        const parts: EvolinkContentPart[] = [];
        for (const s of ytScripts.slice(0, maxVideos)) {
            parts.push({ type: 'image_url', image_url: { url: `https://img.youtube.com/vi/${s.videoId}/hqdefault.jpg` } });
            if (!thumbnailOnly) {
                parts.push({ type: 'image_url', image_url: { url: `https://img.youtube.com/vi/${s.videoId}/2.jpg` } });
            }
        }
        return parts;
    };

    const buildMessages = (maxVideos: number, thumbnailOnly: boolean): EvolinkChatMessage[] => {
        const images = buildImages(maxVideos, thumbnailOnly);
        const count = Math.min(ytScripts.length, maxVideos);
        return [
            { role: 'system', content: systemContent },
            { role: 'user', content: [{ type: 'text', text: promptText(count, thumbnailOnly) }, ...images] as EvolinkContentPart[] }
        ];
    };

    // [FIX #282] 점진적 폴백: 400 에러 시 이미지 수를 줄여 재시도
    const attempts: { maxVideos: number; thumbnailOnly: boolean; label: string }[] = [
        { maxVideos: 15, thumbnailOnly: false, label: '전체 (15×2)' },
        { maxVideos: 5, thumbnailOnly: false, label: '축소 (5×2)' },
        { maxVideos: 5, thumbnailOnly: true, label: '썸네일만 (5×1)' },
    ];

    for (let i = 0; i < attempts.length; i++) {
        const { maxVideos, thumbnailOnly, label } = attempts[i];
        try {
            const messages = buildMessages(maxVideos, thumbnailOnly);
            const res = await evolinkChat(messages, { temperature: 0.3, maxTokens: 6000 });
            return res.choices?.[0]?.message?.content || '';
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const is400 = msg.includes('400') || msg.includes('콘텐츠 정책');
            if (is400 && i < attempts.length - 1) {
                logger.warn(`[StyleDNA] L2 ${label} → 400 에러, 다음 시도로 폴백`, msg);
                continue;
            }
            logger.warn('[StyleDNA] L2 썸네일 분석 실패', msg);
            return '';
        }
    }
    return '';
};

/**
 * L3: 딥 영상 분석 (Gemini v1beta — YouTube URL 직접 입력)
 * 조회수 상위 2개 영상을 YouTube URL로 Gemini에 전달하여 편집/오디오 스타일 분석
 */
const analyzeDeepVideoStyle = async (scripts: ChannelScript[], contentRegion: ContentRegion = 'domestic'): Promise<{ editGuide: string; audioGuide: string }> => {
    const ytScripts = scripts.filter(s => s.videoId && !s.videoId.startsWith('manual-') && !s.videoId.startsWith('file-'));
    if (ytScripts.length === 0) return { editGuide: '', audioGuide: '' };

    const top2 = [...ytScripts].sort((a, b) => b.viewCount - a.viewCount).slice(0, 2);

    const analyzeOne = async (script: ChannelScript): Promise<string> => {
        const youtubeUrl = `https://www.youtube.com/watch?v=${script.videoId}`;
        const googlePayload = {
            contents: [{
                role: 'user',
                parts: [
                    { fileData: { fileUri: youtubeUrl, mimeType: 'video/mp4' } },
                    { text: `이 YouTube 영상("${script.title}")의 프로덕션 스타일을 종합 분석하세요:

[편집 스타일]
- 컷 빈도: 분당 평균 컷 수, 빠른 구간/느린 구간 패턴
- 전환 유형: 컷(하드컷)/디졸브/와이프/줌 전환 비율(%), 특수 전환 효과
- B-roll: 활용 빈도(분당), 소스 유형(실사/스톡/스크린캡처/애니메이션), 지속 시간
- 장면 구성: 토킹헤드/B-roll/텍스트카드/스크린녹화 비율(%)
- 인서트컷/리액션컷: 유형, 빈도, 연출 의도

[카메라 워크]
- 주요 앵글: 정면/측면/하이앵글/로우앵글 비율
- 움직임: 고정/팬/틸트/핸드헬드 패턴, 줌인·줌아웃 트리거 조건
- 프레이밍: 피사체 위치(중앙/삼등분), 헤드룸, 여백 활용

[색보정]
- 색온도(K 추정), 채도 레벨, 대비 수준, 하이라이트/쉐도우 톤
- LUT/필터 추정, 스킨톤 처리, 전체적 무드

[자막/텍스트 (매우 상세)]
- 일반 자막: 폰트 계열/추정 폰트명, 크기(화면 대비), 색상, 테두리, 배경
- 강조 자막: 크기 확대율, 색상(HEX 추정), 애니메이션(팝업/흔들림/확대), 등장 트리거
- 정보 텍스트: 하단바/상단바 유무, 위치, 디자인
- 이모지/아이콘 오버레이: 빈도, 스타일

[사운드 디자인 (매우 상세)]
- BGM: 장르(lo-fi/cinematic/electronic 등), 무드(밝음/긴장/감성), BPM 추정, 음량 레벨(보이스 대비)
- BGM 전환: 씬 전환 시 BGM 변경 패턴, 페이드인·아웃 방식
- 효과음: 유형별 분류(전환음/강조음/유머/UI사운드), 밀도(분당), 주요 효과음 3~5개 묘사
- 보이스: 톤(밝음/차분/에너제틱), 에너지 레벨(1~10), 말하기 속도(빠름/보통/느림), 감정 표현 범위
- 무음/포즈: 활용 빈도, 연출 의도(긴장감/강조/호흡)

[페이싱]
- 오프닝 훅: 길이(초), 구조(질문/충격/예고), 첫 컷 유형
- 세그먼트 리듬: 평균 세그먼트 길이, 클라이맥스 위치
- 아웃트로: 길이, CTA 유형, 엔드스크린 활용

한국어로 매우 구체적이고 상세하게 분석하세요. 이 영상의 편집과 사운드를 정확히 복제할 수 있는 수준이어야 합니다.` }
                ]
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8000 }
        };

        try {
            const result = await requestEvolinkNative('gemini-3.1-pro-preview', googlePayload);
            const data = result as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (e) {
            logger.warn('[StyleDNA] L3 딥 영상 분석 실패', e instanceof Error ? e.message : String(e));
            return '';
        }
    };

    const results = await Promise.allSettled(top2.map(analyzeOne));
    const combined = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value)
        .map(r => r.value)
        .join('\n\n---\n\n');

    if (!combined) return { editGuide: '', audioGuide: '' };

    // Gemini로 편집 가이드 / 오디오 가이드 분리
    try {
        const splitRes = await evolinkChat([
            { role: 'system', content: '아래 영상 분석을 편집 가이드와 오디오 가이드로 분리. 각각 2000자 이상으로 매우 상세하게 작성. 반드시 JSON으로만 응답.' },
            { role: 'user', content: `${combined}\n\n위 분석을 JSON으로 분리 (각 2000자 이상 상세히):\n{"editGuide": "편집 스타일 종합 가이드 (컷 빈도/전환 유형 비율/B-roll 패턴/카메라 워크/색보정 수치/자막 폰트·색상·크기·애니메이션·배치 규칙/페이싱 — 이 가이드만으로 동일한 편집을 재현할 수 있어야 함)", "audioGuide": "오디오 스타일 종합 가이드 (BGM 장르·BPM·무드·음량/효과음 유형·밀도·주요 효과음 묘사/보이스 톤·에너지·속도/무음 활용 — 이 가이드만으로 동일한 사운드 디자인을 재현할 수 있어야 함)"}` }
        ], { temperature: 0.1, maxTokens: 8000 });

        const raw = splitRes.choices?.[0]?.message?.content || '';
        let jsonStr = raw;
        const cb = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (cb) jsonStr = cb[1].trim();
        const parsed = sanitizeJsonForParse(jsonStr) as Record<string, string>;
        return { editGuide: parsed.editGuide || combined, audioGuide: parsed.audioGuide || '' };
    } catch (e) {
        logger.trackSwallowedError('youtubeAnalysisService:splitGuides', e);
        return { editGuide: combined, audioGuide: '' };
    }
};

/**
 * L4: 댓글 감성 분석 — 상위 5개 영상의 인기 댓글 수집 + AI 분석
 */
const analyzeCommentSentiment = async (scripts: ChannelScript[], contentRegion: ContentRegion = 'domestic'): Promise<string> => {
    const ytScripts = scripts.filter(s => s.videoId && !s.videoId.startsWith('manual-') && !s.videoId.startsWith('file-'));
    if (ytScripts.length === 0) return '';

    const top5 = [...ytScripts].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
    const commentResults = await Promise.allSettled(top5.map(s => getVideoComments(s.videoId, 20)));

    const allComments: string[] = [];
    commentResults.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.length > 0) {
            allComments.push(`\n[${top5[i].title}]`);
            allComments.push(...r.value.slice(0, 15));
        }
    });

    if (allComments.length < 5) return '';

    try {
        const isOverseas = contentRegion === 'overseas';
        const res = await evolinkChat([
            { role: 'system', content: `YouTube 시청자 심리 및 댓글 분석 전문가. 정량적 데이터와 정성적 인사이트를 모두 포함하여 한국어로 매우 상세하게 응답.${isOverseas ? ' 해외 채널이므로 해당 문화권의 시청자 특성, 댓글 문화, 인구통계적 차이를 반영하여 분석.' : ''}` },
            { role: 'user', content: `아래는 YouTube 채널의 인기 영상 시청자 댓글입니다.\n${allComments.join('\n')}\n\n아래 항목을 각각 5줄 이상으로 매우 상세히 분석하세요:\n\n1. 핵심 반응 분석\n   - 시청자가 가장 좋아하는 요소 TOP 5 (편집/유머/정보/비주얼/음악/진정성 등)\n   - 각 요소별 대표 댓글 인용 2개씩\n   - 감정적 반응 강도 (열광/만족/호감/무관심 비율 추정)\n\n2. 시청자 요구사항 & 불만\n   - 원하는 콘텐츠 주제 TOP 5\n   - 개선 요청사항 (편집/음질/길이/빈도 등)\n   - 반복되는 질문 패턴\n\n3. 감정 분포 매트릭스\n   - 정보적 반응 vs 재미 반응 vs 감동 반응 vs 비판적 반응 비율(%)\n   - 댓글 톤 분석: 존댓말/반말/이모지/밈 비율\n   - 평균 댓글 길이 및 참여 깊이\n\n4. 커뮤니티 문화 DNA\n   - 인사이드 조크, 밈, 반복 문구 TOP 10\n   - 팬덤 특성 (네이밍, 인사법, 암묵적 규칙)\n   - 시청자 간 상호작용 패턴\n\n5. 타겟 시청자 프로필\n   - 추정 연령대 분포 (10대/20대/30대/40대+ 비율)\n   - 추정 성별 분포\n   - 관심사 키워드 클라우드 (상위 15개)\n   - 시청 동기 (학습/오락/정보/힐링/습관)\n\n6. 콘텐츠 전략 인사이트\n   - 조회수 높은 영상의 댓글 공통점\n   - 시청자 이탈 위험 신호\n   - 신규 시청자 유입 패턴\n   - 추천 콘텐츠 방향 3가지` }
        ], { temperature: 0.3, maxTokens: 6000 });
        return res.choices?.[0]?.message?.content || '';
    } catch (e) {
        logger.warn('[StyleDNA] L4 댓글 분석 실패', e instanceof Error ? e.message : String(e));
        return '';
    }
};

/**
 * L5: 메타데이터 패턴 분석 — 제목 공식, 태그 전략, 챕터 구조
 */
const analyzeMetadataPatterns = async (scripts: ChannelScript[], channelInfo: ChannelInfo, contentRegion: ContentRegion = 'domestic'): Promise<string> => {
    if (scripts.length === 0) return '';

    const titles = scripts.map((s, i) => `${i + 1}. ${s.title} (조회수 ${s.viewCount.toLocaleString()})`).join('\n');

    const tagCount = new Map<string, number>();
    scripts.forEach(s => (s.tags || []).forEach(t => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, c]) => `${t}(${c})`).join(', ');

    const chapterPattern = /(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]?\s*(.+)/gm;
    const chapterExamples: string[] = [];
    scripts.slice(0, 5).forEach(s => {
        const matches = [...(s.description || '').matchAll(chapterPattern)];
        if (matches.length > 2) {
            chapterExamples.push(`[${s.title}]: ${matches.map(m => `${m[1]} ${m[2]}`).join(' > ')}`);
        }
    });

    try {
        const res = await evolinkChat([
            { role: 'system', content: `유튜브 SEO 전문가이자 콘텐츠 전략 분석가. 제목 공식과 메타데이터 전략을 실전에서 바로 적용 가능할 정도로 매우 상세하게 분석. 한국어로 응답.${contentRegion === 'overseas' ? ' 해외 채널이므로 해당 언어권의 SEO 전략, 제목 작성법, 태그 전략, 시청자 검색 패턴을 반영하여 분석.' : ''}` },
            { role: 'user', content: `채널: ${channelInfo.title} (구독자 ${channelInfo.subscriberCount.toLocaleString()}명)\n\n[제목 목록 + 조회수]\n${titles}\n\n[태그 클라우드]\n${topTags || '(태그 없음)'}\n\n[챕터 구조]\n${chapterExamples.join('\n') || '(챕터 없음)'}\n\n아래 항목을 각각 매우 상세히 분석하세요:\n\n1. 제목 공식 (가장 중요 — 바로 제목 지침서로 쓸 수 있을 수준)\n   a. 반복 패턴 분석: 문장 구조, 숫자 사용법, 이모지 패턴, 클릭베이트 요소\n   b. 공식화 가능한 제목 템플릿 10개 (변수 포함, 예: "[숫자] + [자극적 키워드] + [대상]")\n   c. 각 템플릿별 실전 예시 제목 3개씩\n   d. 조회수 높은 제목 vs 낮은 제목의 구조적 차이점\n   e. 제목 작성 규칙 체크리스트 (글자수, 키워드 위치, 감정 트리거, 금지 패턴)\n   f. 이 채널 스타일로 새 제목 5개 생성 예시\n\n2. 태그 전략\n   a. 핵심 SEO 키워드 패턴 (1차/2차/롱테일 분류)\n   b. 주제 분포 맵 (카테고리별 비율)\n   c. 경쟁 키워드 vs 틈새 키워드 비율\n   d. 추천 태그 세트 (새 영상용 20개)\n\n3. 챕터 구조 분석\n   a. 표준 영상 구조 (시간대별 구성)\n   b. 평균 세그먼트 수 및 길이\n   c. 챕터 네이밍 패턴\n\n4. 설명란 패턴\n   a. 설명란 구조 공식\n   b. CTA(Call to Action) 패턴\n   c. 링크/해시태그 활용법\n\n5. 업로드 패턴\n   a. 업로드 주기 분석\n   b. 조회수 높은 영상의 공통점 5가지\n   c. 시즈널/트렌드 대응 패턴` }
        ], { temperature: 0.3, maxTokens: 6000 });
        return res.choices?.[0]?.message?.content || '';
    } catch (e) {
        logger.warn('[StyleDNA] L5 메타데이터 분석 실패', e instanceof Error ? e.message : String(e));
        return '';
    }
};

/**
 * 채널 스타일 DNA 종합 분석 (5-Layer 병렬)
 * L1: 텍스트 포렌식 (기존 analyzeChannelStyle)
 * L2: 썸네일 시각 분석 (Gemini Vision multimodal)
 * L3: 딥 영상 분석 (Gemini v1beta YouTube URL)
 * L4: 댓글 감성 분석
 * L5: 메타데이터 패턴 분석
 */
export const analyzeChannelStyleDNA = async (
    scripts: ChannelScript[],
    channelInfo: ChannelInfo,
    contentRegion: ContentRegion = 'domestic'
): Promise<ChannelGuideline> => {
    logger.info('[StyleDNA] 5-Layer 채널 스타일 DNA 분석 시작', {
        channel: channelInfo.title,
        scriptCount: scripts.length,
        contentRegion
    });

    // [FIX #209] 2파로 나눠 실행하여 rate limit 완화
    // Wave 1: L1 (텍스트, 필수) + L5 (메타데이터, 텍스트만) — 가벼운 호출 먼저
    const [textResult, metadataResult] = await Promise.allSettled([
        analyzeChannelStyle(scripts, channelInfo, contentRegion),   // L1: 텍스트 포렌식
        analyzeMetadataPatterns(scripts, channelInfo, contentRegion) // L5: 메타데이터
    ]);

    // Wave 2: L2 (멀티모달) + L3 (영상 URL) + L4 (댓글) — 2초 후 실행
    await new Promise(r => setTimeout(r, 2000));
    const [thumbnailResult, deepVideoResult, commentResult] = await Promise.allSettled([
        analyzeThumbnailStyle(scripts, contentRegion),              // L2: 썸네일 시각
        analyzeDeepVideoStyle(scripts, contentRegion),              // L3: 딥 영상
        analyzeCommentSentiment(scripts, contentRegion),            // L4: 댓글 감성
    ]);

    // L1 base guideline
    const textError = textResult.status === 'rejected' ? (textResult.reason?.message || String(textResult.reason)) : '';
    if (textError) {
        logger.warn('[StyleDNA] L1 텍스트 분석 실패', textError);
    }

    // [FIX #209] 에러 메시지를 원인에 맞게 구체적으로 표시
    const getErrorHint = (err: string): string => {
        if (err.includes('요청 제한') || err.includes('429')) return '💡 원인: AI 서버가 일시적으로 바쁜 상태입니다. 잠시 후 "실패 항목 재분석" 버튼을 눌러보세요.';
        if (err.includes('키가 설정되지') || err.includes('인증 실패')) return '💡 원인: Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.';
        if (err.includes('잔액 부족')) return '💡 원인: Evolink 크레딧이 소진되었습니다. 충전 후 다시 시도해주세요.';
        if (err.includes('Failed to fetch') || err.includes('network')) return '💡 원인: 네트워크 연결이 불안정합니다. 인터넷 연결 확인 후 다시 시도해주세요.';
        return '💡 잠시 후 "실패 항목 재분석" 버튼을 눌러 다시 시도해보세요.';
    };

    const base: ChannelGuideline = textResult.status === 'fulfilled'
        ? textResult.value
        : {
            channelName: channelInfo.title,
            tone: '', structure: '', topics: [], keywords: [],
            targetAudience: '', avgLength: 0, hookPattern: '', closingPattern: '',
            fullGuidelineText: `(텍스트 분석 실패: ${textError || '알 수 없는 오류'})\n\n${getErrorHint(textError)}`
        };

    // DNA 레이어 결과 수집
    const visualGuide = thumbnailResult.status === 'fulfilled' ? thumbnailResult.value : '';
    const { editGuide = '', audioGuide = '' } = deepVideoResult.status === 'fulfilled' ? deepVideoResult.value : {};
    const audienceInsight = commentResult.status === 'fulfilled' ? commentResult.value : '';
    const titleFormula = metadataResult.status === 'fulfilled' ? metadataResult.value : '';

    // fullGuidelineText에 DNA 레이어 추가
    const dnaAppendix = [
        visualGuide && `\n\n=== 시각 스타일 DNA ===\n${visualGuide}`,
        editGuide && `\n\n=== 편집 스타일 DNA ===\n${editGuide}`,
        audioGuide && `\n\n=== 오디오 스타일 DNA ===\n${audioGuide}`,
        titleFormula && `\n\n=== 제목/메타데이터 공식 ===\n${titleFormula}`,
        audienceInsight && `\n\n=== 시청자 인사이트 ===\n${audienceInsight}`,
    ].filter(Boolean).join('');

    // [FIX #209] 실패한 레이어 추적
    const failedLayers: string[] = [];
    if (textResult.status === 'rejected') failedLayers.push('L1');
    if (!visualGuide) failedLayers.push('L2');
    if (!editGuide && !audioGuide) failedLayers.push('L3');
    if (!audienceInsight) failedLayers.push('L4');
    if (!titleFormula) failedLayers.push('L5');

    const enhanced: ChannelGuideline = {
        ...base,
        fullGuidelineText: base.fullGuidelineText + dnaAppendix,
        visualGuide,
        editGuide,
        audioGuide,
        titleFormula,
        audienceInsight,
        failedLayers: failedLayers.length > 0 ? failedLayers : undefined,
    };

    const layerStatus = {
        L1: textResult.status, L2: thumbnailResult.status,
        L3: deepVideoResult.status, L4: commentResult.status, L5: metadataResult.status,
        failedLayers
    };
    logger.success('[StyleDNA] 채널 스타일 DNA 분석 완료', layerStatus);

    return enhanced;
};

/**
 * [FIX #209] 실패한 레이어만 재분석
 * 기존 guideline에 실패한 레이어 결과를 병합
 */
export const retryFailedStyleDNA = async (
    scripts: ChannelScript[],
    channelInfo: ChannelInfo,
    existingGuideline: ChannelGuideline,
    contentRegion: ContentRegion = 'domestic'
): Promise<ChannelGuideline> => {
    const failed = existingGuideline.failedLayers || [];
    if (failed.length === 0) return existingGuideline;

    logger.info('[StyleDNA] 실패 레이어 재분석 시작', { failedLayers: failed });

    const tasks: Promise<{ layer: string; result: unknown }>[] = [];

    if (failed.includes('L1')) {
        tasks.push(analyzeChannelStyle(scripts, channelInfo, contentRegion).then(r => ({ layer: 'L1', result: r })).catch(() => ({ layer: 'L1', result: null })));
    }
    if (failed.includes('L2')) {
        tasks.push(analyzeThumbnailStyle(scripts, contentRegion).then(r => ({ layer: 'L2', result: r })).catch(() => ({ layer: 'L2', result: null })));
    }
    if (failed.includes('L3')) {
        tasks.push(analyzeDeepVideoStyle(scripts, contentRegion).then(r => ({ layer: 'L3', result: r })).catch(() => ({ layer: 'L3', result: null })));
    }
    if (failed.includes('L4')) {
        tasks.push(analyzeCommentSentiment(scripts, contentRegion).then(r => ({ layer: 'L4', result: r })).catch(() => ({ layer: 'L4', result: null })));
    }
    if (failed.includes('L5')) {
        tasks.push(analyzeMetadataPatterns(scripts, channelInfo, contentRegion).then(r => ({ layer: 'L5', result: r })).catch(() => ({ layer: 'L5', result: null })));
    }

    const results = await Promise.all(tasks);
    let updated = { ...existingGuideline };
    const stillFailed: string[] = [];

    for (const { layer, result } of results) {
        if (!result) { stillFailed.push(layer); continue; }
        switch (layer) {
            case 'L1': {
                const g = result as ChannelGuideline;
                updated = { ...updated, ...g, visualGuide: updated.visualGuide, editGuide: updated.editGuide, audioGuide: updated.audioGuide, titleFormula: updated.titleFormula, audienceInsight: updated.audienceInsight };
                break;
            }
            case 'L2': updated.visualGuide = result as string; break;
            case 'L3': { const r = result as { editGuide: string; audioGuide: string }; updated.editGuide = r.editGuide; updated.audioGuide = r.audioGuide; break; }
            case 'L4': updated.audienceInsight = result as string; break;
            case 'L5': updated.titleFormula = result as string; break;
        }
    }

    // fullGuidelineText 재조립
    const baseText = updated.tone ? updated.fullGuidelineText.split('\n\n=== ')[0] : updated.fullGuidelineText;
    const dnaAppendix = [
        updated.visualGuide && `\n\n=== 시각 스타일 DNA ===\n${updated.visualGuide}`,
        updated.editGuide && `\n\n=== 편집 스타일 DNA ===\n${updated.editGuide}`,
        updated.audioGuide && `\n\n=== 오디오 스타일 DNA ===\n${updated.audioGuide}`,
        updated.titleFormula && `\n\n=== 제목/메타데이터 공식 ===\n${updated.titleFormula}`,
        updated.audienceInsight && `\n\n=== 시청자 인사이트 ===\n${updated.audienceInsight}`,
    ].filter(Boolean).join('');
    updated.fullGuidelineText = baseText + dnaAppendix;
    updated.failedLayers = stillFailed.length > 0 ? stillFailed : undefined;

    logger.success('[StyleDNA] 실패 레이어 재분석 완료', { retried: failed, stillFailed });
    return updated;
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
        const response = await rawFetch(url);

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
