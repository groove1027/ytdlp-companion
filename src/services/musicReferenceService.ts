/**
 * musicReferenceService.ts — 뮤직 레퍼런스 분석 서비스 (#154)
 *
 * YouTube 채널/플레이리스트/영상 URL → 음악 DNA + 비주얼 DNA 분석 + 퓨전 썸네일 컨셉
 */

import { monitoredFetch, getYoutubeApiKey } from './apiService';
import { evolinkChat, evolinkChatStream } from './evolinkService';
import type { EvolinkChatMessage, EvolinkContentPart } from './evolinkService';
import { logger } from './LoggerService';
import type {
    YouTubeUrlParseResult,
    MusicReferenceVideo,
    PerVideoMusicDNA,
    ChannelMusicDNA,
    ChannelVisualDNA,
    MusicReferenceFusionConcept,
} from '../types';

// === CONFIGURATION ===
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// === QUOTA (재사용 — youtubeAnalysisService와 동일 키) ===
const QUOTA_STORAGE_KEY = 'YOUTUBE_QUOTA_USED';
const DAILY_QUOTA_LIMIT = 10000;

interface QuotaRecord { date: string; used: number }

const getTodayString = (): string => new Date().toISOString().slice(0, 10);

const loadQuotaRecord = (): QuotaRecord => {
    try {
        const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
        if (raw) {
            const record: QuotaRecord = JSON.parse(raw);
            if (record.date === getTodayString()) return record;
        }
    } catch (e) {
        logger.trackSwallowedError('musicReferenceService:loadQuota', e);
    }
    return { date: getTodayString(), used: 0 };
};

const trackQuota = (operation: string): boolean => {
    const costs: Record<string, number> = {
        'search': 100, 'videos.list': 1, 'channels.list': 1,
        'playlistItems.list': 1, 'playlists.list': 1,
    };
    const cost = costs[operation] || 1;
    const record = loadQuotaRecord();
    if (record.used + cost > DAILY_QUOTA_LIMIT) return false;
    record.used += cost;
    localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(record));
    return true;
};

// === URL PARSER — 모든 YouTube URL 형식 지원 ===

/**
 * 어떤 형식의 YouTube URL이든 파싱하여 타입을 반환
 * - 채널: /channel/UCxxx, /@handle, /c/name, /user/name
 * - 플레이리스트: /playlist?list=PLxxx, ?list=PLxxx (영상 URL에 포함)
 * - 영상: /watch?v=xxx, youtu.be/xxx, /shorts/xxx, /live/xxx, /embed/xxx
 * - 믹스/라디오: ?list=RDxxx (→ playlist로 처리)
 * - 모바일: m.youtube.com
 * - 프로토콜 없는 URL, 베어 ID, 베어 핸들 모두 지원
 */
export const parseAnyYoutubeUrl = (input: string): YouTubeUrlParseResult => {
    let url = input.trim();

    // URL 디코딩
    try { url = decodeURIComponent(url); } catch { /* ignore */ }

    // 프로토콜 없으면 보정
    if (/^(m\.|www\.)?youtube\.com/i.test(url)) url = 'https://' + url;
    if (/^youtu\.be\//i.test(url)) url = 'https://' + url;

    // 베어 입력 감지 (URL 형식이 아닌 경우)
    const barePlaylist = url.match(/^(PL[\w-]{10,}|UU[\w-]{20,}|FL[\w-]{10,}|OL[\w-]{10,}|LL[\w-]{10,}|WL)$/);
    if (barePlaylist) return { type: 'playlist', playlistId: barePlaylist[1] };

    const bareHandle = url.match(/^@([^\s\/]+)$/);
    if (bareHandle) return { type: 'handle', handle: bareHandle[1] };

    const bareChannelId = url.match(/^(UC[\w-]{20,})$/);
    if (bareChannelId) return { type: 'channel', channelId: bareChannelId[1] };

    const bareVideoId = url.match(/^([\w-]{11})$/);
    if (bareVideoId) return { type: 'video', videoId: bareVideoId[1] };

    // 플레이리스트 URL (/playlist?list=PLxxx)
    const playlistPageMatch = url.match(/\/playlist\?.*list=([\w-]+)/);
    if (playlistPageMatch) return { type: 'playlist', playlistId: playlistPageMatch[1] };

    // 영상 URL에 list= 파라미터 포함
    const videoWithList = url.match(/[?&]v=([\w-]{11}).*[?&]list=([\w-]+)/);
    if (videoWithList) return { type: 'video', videoId: videoWithList[1], playlistId: videoWithList[2] };

    // list= 먼저, v= 나중
    const listThenVideo = url.match(/[?&]list=([\w-]+).*[?&]v=([\w-]{11})/);
    if (listThenVideo) return { type: 'video', videoId: listThenVideo[2], playlistId: listThenVideo[1] };

    // 플레이리스트만 있는 URL (v= 없이 list=만)
    const listOnlyMatch = url.match(/[?&]list=([\w-]+)/);
    if (listOnlyMatch && !url.match(/[?&]v=/)) return { type: 'playlist', playlistId: listOnlyMatch[1] };

    // /shorts/VIDEO_ID
    const shortsMatch = url.match(/\/shorts\/([\w-]{11})/);
    if (shortsMatch) return { type: 'shorts', videoId: shortsMatch[1] };

    // /watch?v=VIDEO_ID (list 없음)
    const watchMatch = url.match(/[?&]v=([\w-]{11})/);
    if (watchMatch) return { type: 'video', videoId: watchMatch[1] };

    // youtu.be/VIDEO_ID
    const shortUrlMatch = url.match(/youtu\.be\/([\w-]{11})/);
    if (shortUrlMatch) return { type: 'video', videoId: shortUrlMatch[1] };

    // /live/VIDEO_ID
    const liveMatch = url.match(/\/live\/([\w-]{11})/);
    if (liveMatch) return { type: 'video', videoId: liveMatch[1] };

    // /embed/VIDEO_ID
    const embedMatch = url.match(/\/embed\/([\w-]{11})/);
    if (embedMatch) return { type: 'video', videoId: embedMatch[1] };

    // /channel/UCxxxx
    const channelMatch = url.match(/\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { type: 'channel', channelId: channelMatch[1] };

    // /@handle
    const handleMatch = url.match(/\/@([^\/\s?#]+)/);
    if (handleMatch) return { type: 'handle', handle: handleMatch[1] };

    // /c/customname or /user/username
    const customMatch = url.match(/\/(c|user)\/([^\/\s?#]+)/);
    if (customMatch) return { type: 'custom', name: customMatch[2] };

    return { type: 'unknown' };
};

// === YouTube API 호출 ===

/** ISO 8601 duration → "mm:ss" */
const parseIsoDuration = (iso: string): string => {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '0:00';
    const h = parseInt(m[1] || '0');
    const min = parseInt(m[2] || '0');
    const sec = parseInt(m[3] || '0');
    const totalMin = h * 60 + min;
    return `${totalMin}:${sec.toString().padStart(2, '0')}`;
};

/** handle → channelId 변환 */
const resolveHandleToChannelId = async (handle: string, apiKey: string): Promise<string> => {
    // forHandle API 시도
    if (!trackQuota('channels.list')) throw new Error('YouTube API 일일 쿼터 한도 초과');
    const url = `${YOUTUBE_API_BASE}/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`;
    const res = await monitoredFetch(url);
    if (res.ok) {
        const data = await res.json();
        if (data.items?.[0]?.id) return data.items[0].id;
    }
    // 폴백: search API
    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도 초과');
    const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=1&key=${apiKey}`;
    const searchRes = await monitoredFetch(searchUrl);
    if (!searchRes.ok) throw new Error(`채널 검색 실패 (${searchRes.status})`);
    const searchData = await searchRes.json();
    const channelId = searchData.items?.[0]?.snippet?.channelId || searchData.items?.[0]?.id?.channelId;
    if (!channelId) throw new Error(`"${handle}" 채널을 찾을 수 없습니다`);
    return channelId;
};

/** custom name → channelId 변환 */
const resolveCustomNameToChannelId = async (name: string, apiKey: string): Promise<string> => {
    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도 초과');
    const url = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(name)}&maxResults=1&key=${apiKey}`;
    const res = await monitoredFetch(url);
    if (!res.ok) throw new Error(`채널 검색 실패 (${res.status})`);
    const data = await res.json();
    const channelId = data.items?.[0]?.snippet?.channelId || data.items?.[0]?.id?.channelId;
    if (!channelId) throw new Error(`"${name}" 채널을 찾을 수 없습니다`);
    return channelId;
};

/** videoId → channelId 변환 */
const resolveVideoToChannelId = async (videoId: string, apiKey: string): Promise<string> => {
    if (!trackQuota('videos.list')) throw new Error('YouTube API 일일 쿼터 한도 초과');
    const url = `${YOUTUBE_API_BASE}/videos?part=snippet&id=${videoId}&key=${apiKey}`;
    const res = await monitoredFetch(url);
    if (!res.ok) throw new Error(`영상 정보 조회 실패 (${res.status})`);
    const data = await res.json();
    const channelId = data.items?.[0]?.snippet?.channelId;
    if (!channelId) throw new Error('영상에서 채널 정보를 찾을 수 없습니다');
    return channelId;
};

/** 플레이리스트에서 영상 목록 가져오기 */
export const getPlaylistVideos = async (
    playlistId: string,
    maxResults: number = 20
): Promise<MusicReferenceVideo[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[MusicRef] 플레이리스트 영상 조회', { playlistId, maxResults });

    if (!trackQuota('playlistItems.list')) throw new Error('YouTube API 일일 쿼터 한도 초과');

    const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${Math.min(maxResults, 50)}&key=${apiKey}`;
    const res = await monitoredFetch(url);
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`플레이리스트 조회 실패 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const videoIds = (data.items || [])
        .map((item: { contentDetails?: { videoId?: string } }) => item.contentDetails?.videoId)
        .filter(Boolean) as string[];

    if (videoIds.length === 0) return [];

    // 영상 상세정보 배치
    if (!trackQuota('videos.list')) throw new Error('YouTube API 일일 쿼터 한도 초과');
    const detailUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
    const detailRes = await monitoredFetch(detailUrl);
    if (!detailRes.ok) throw new Error(`영상 상세 조회 실패 (${detailRes.status})`);

    const detailData = await detailRes.json();
    return (detailData.items || []).map((v: {
        id: string;
        snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } };
        statistics?: { viewCount?: string };
        contentDetails?: { duration?: string };
    }) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || '',
        duration: parseIsoDuration(v.contentDetails?.duration || 'PT0S'),
        viewCount: parseInt(v.statistics?.viewCount || '0'),
        publishedAt: v.snippet?.publishedAt || '',
        channelTitle: v.snippet?.channelTitle || '',
    }));
};

/** 채널 ID에서 최근 영상 가져오기 */
export const getChannelVideos = async (
    channelId: string,
    maxResults: number = 20
): Promise<MusicReferenceVideo[]> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    logger.info('[MusicRef] 채널 영상 조회', { channelId, maxResults });

    if (!trackQuota('search')) throw new Error('YouTube API 일일 쿼터 한도 초과');

    const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&type=video&order=viewCount&maxResults=${Math.min(maxResults, 50)}&key=${apiKey}`;
    const searchRes = await monitoredFetch(searchUrl);
    if (!searchRes.ok) throw new Error(`채널 영상 검색 실패 (${searchRes.status})`);

    const searchData = await searchRes.json();
    const videoIds = (searchData.items || [])
        .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
        .filter(Boolean) as string[];

    if (videoIds.length === 0) return [];

    if (!trackQuota('videos.list')) throw new Error('YouTube API 일일 쿼터 한도 초과');
    const detailUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
    const detailRes = await monitoredFetch(detailUrl);
    if (!detailRes.ok) throw new Error(`영상 상세 조회 실패 (${detailRes.status})`);

    const detailData = await detailRes.json();
    return (detailData.items || []).map((v: {
        id: string;
        snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } };
        statistics?: { viewCount?: string };
        contentDetails?: { duration?: string };
    }) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || '',
        duration: parseIsoDuration(v.contentDetails?.duration || 'PT0S'),
        viewCount: parseInt(v.statistics?.viewCount || '0'),
        publishedAt: v.snippet?.publishedAt || '',
        channelTitle: v.snippet?.channelTitle || '',
    }));
};

/**
 * 어떤 URL이든 → 영상 목록으로 변환
 * 채널 → 인기 영상 / 플레이리스트 → 플리 영상 / 영상 → 해당 채널의 인기 영상
 */
export const resolveUrlToVideos = async (
    parseResult: YouTubeUrlParseResult,
    maxResults: number = 15
): Promise<{ videos: MusicReferenceVideo[]; resolvedChannelId?: string; sourceName: string }> => {
    const apiKey = getYoutubeApiKey();
    if (!apiKey) throw new Error('YouTube API 키가 설정되지 않았습니다.');

    switch (parseResult.type) {
        case 'playlist': {
            const videos = await getPlaylistVideos(parseResult.playlistId, maxResults);
            const channelTitle = videos[0]?.channelTitle || '플레이리스트';
            return { videos, sourceName: channelTitle };
        }

        case 'channel': {
            const videos = await getChannelVideos(parseResult.channelId, maxResults);
            const channelTitle = videos[0]?.channelTitle || parseResult.channelId;
            return { videos, resolvedChannelId: parseResult.channelId, sourceName: channelTitle };
        }

        case 'handle': {
            const channelId = await resolveHandleToChannelId(parseResult.handle, apiKey);
            const videos = await getChannelVideos(channelId, maxResults);
            const channelTitle = videos[0]?.channelTitle || `@${parseResult.handle}`;
            return { videos, resolvedChannelId: channelId, sourceName: channelTitle };
        }

        case 'custom': {
            const channelId = await resolveCustomNameToChannelId(parseResult.name, apiKey);
            const videos = await getChannelVideos(channelId, maxResults);
            const channelTitle = videos[0]?.channelTitle || parseResult.name;
            return { videos, resolvedChannelId: channelId, sourceName: channelTitle };
        }

        case 'video': {
            // 플레이리스트 포함 시 플레이리스트 우선
            if (parseResult.playlistId) {
                const videos = await getPlaylistVideos(parseResult.playlistId, maxResults);
                const channelTitle = videos[0]?.channelTitle || '플레이리스트';
                return { videos, sourceName: channelTitle };
            }
            // 단일 영상 → 해당 채널의 인기 영상
            const channelId = await resolveVideoToChannelId(parseResult.videoId, apiKey);
            const videos = await getChannelVideos(channelId, maxResults);
            const channelTitle = videos[0]?.channelTitle || '채널';
            return { videos, resolvedChannelId: channelId, sourceName: channelTitle };
        }

        case 'shorts': {
            const channelId = await resolveVideoToChannelId(parseResult.videoId, apiKey);
            const videos = await getChannelVideos(channelId, maxResults);
            const channelTitle = videos[0]?.channelTitle || '채널';
            return { videos, resolvedChannelId: channelId, sourceName: channelTitle };
        }

        default:
            throw new Error('인식할 수 없는 YouTube URL 형식입니다. 채널, 플레이리스트, 영상 URL을 입력해주세요.');
    }
};

// === AI 분석: 음악 DNA ===

/** 영상별 음악 DNA 분석 (썸네일+제목+설명 기반 Gemini 멀티모달) */
export const analyzeMusicDNABatch = async (
    videos: MusicReferenceVideo[],
    onProgress?: (current: number, total: number) => void,
    signal?: AbortSignal
): Promise<PerVideoMusicDNA[]> => {
    logger.info('[MusicRef] 음악 DNA 분석 시작', { videoCount: videos.length });

    // 썸네일 URL을 멀티모달 입력으로 사용
    const thumbnailParts: EvolinkContentPart[] = [];
    for (const v of videos) {
        thumbnailParts.push({ type: 'text', text: `[${v.title}] (${v.duration}, 조회수 ${v.viewCount.toLocaleString()})` });
        if (v.thumbnailUrl) {
            thumbnailParts.push({ type: 'image_url', image_url: { url: v.thumbnailUrl } });
        }
    }

    const systemPrompt = `당신은 세계적인 음악 프로듀서이자 사운드 엔지니어입니다.
유튜브 뮤직 채널의 영상 정보(제목, 썸네일, 조회수)를 보고 각 영상의 음악적 특성을 전문적으로 분석합니다.
썸네일의 비주얼 무드, 제목의 키워드, 채널 전체 맥락을 종합하여 정확한 음악 DNA를 추출하세요.

반드시 JSON 배열로 응답하세요. 각 요소:
{
  "videoId": "영상ID",
  "title": "제목",
  "genre": "메인 장르 (Lo-fi Hip Hop, K-Pop, Ambient 등)",
  "subGenre": "서브 장르 (Chillhop, City Pop, Dream Pop 등)",
  "bpm": 85,
  "key": "C minor",
  "tempo": "Slow / Medium / Fast / Variable",
  "instruments": ["Rhodes piano", "808 bass", "vinyl crackle"],
  "vocalType": "No vocal / Female vocal / Male rap / Choir 등",
  "mood": "Nostalgic, dreamy, melancholic",
  "energyLevel": 3,
  "energyCurve": "Flat low → slight build → fade",
  "structure": ["Intro(8bar)", "Verse(16bar)", "Hook(8bar)"],
  "productionStyle": "Warm analog, tape saturation",
  "mixingCharacter": "Wide stereo, heavy reverb on keys",
  "viewCount": 12345
}`;

    const messages: EvolinkChatMessage[] = [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: [
                { type: 'text', text: `아래 ${videos.length}개 뮤직 영상의 음악 DNA를 개별 분석해주세요. JSON 배열로 응답:` },
                ...thumbnailParts
            ]
        }
    ];

    const response = await evolinkChat(messages, {
        temperature: 0.4,
        maxTokens: 8192,
        responseFormat: { type: 'json_object' },
        signal,
        timeoutMs: 120_000,
    });

    const text = response.choices?.[0]?.message?.content || '[]';
    let parsed: PerVideoMusicDNA[];
    try {
        const json = JSON.parse(text);
        parsed = Array.isArray(json) ? json : (json.results || json.videos || json.analysis || [json]);
    } catch {
        // JSON 복구 시도
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try { parsed = JSON.parse(arrayMatch[0]); } catch { parsed = []; }
        } else {
            parsed = [];
        }
    }

    // viewCount 매핑
    return parsed.map((dna, i) => ({
        ...dna,
        videoId: dna.videoId || videos[i]?.videoId || '',
        title: dna.title || videos[i]?.title || '',
        viewCount: videos[i]?.viewCount || 0,
        bpm: typeof dna.bpm === 'number' ? dna.bpm : parseInt(String(dna.bpm)) || 0,
        energyLevel: typeof dna.energyLevel === 'number' ? dna.energyLevel : parseInt(String(dna.energyLevel)) || 5,
        instruments: Array.isArray(dna.instruments) ? dna.instruments : [],
        structure: Array.isArray(dna.structure) ? dna.structure : [],
    }));
};

/** 종합 채널 음악 DNA 생성 */
export const synthesizeChannelMusicDNA = async (
    perVideoDNA: PerVideoMusicDNA[],
    sourceName: string,
    signal?: AbortSignal
): Promise<ChannelMusicDNA> => {
    logger.info('[MusicRef] 채널 음악 DNA 종합 분석', { videoCount: perVideoDNA.length });

    const systemPrompt = `당신은 세계적인 음악 프로듀서이자 A&R 디렉터입니다.
개별 영상의 음악 분석 데이터를 종합하여 채널 전체의 음악 DNA 리포트를 작성합니다.

반드시 아래 JSON 형식으로 응답:
{
  "primaryGenre": "대표 장르",
  "genreDistribution": {"Lo-fi": 60, "Ambient": 25, "Jazz": 15},
  "signatureSounds": ["이 채널만의 시그니처 사운드 요소들"],
  "bpmRange": {"min": 70, "max": 120, "avg": 85},
  "keyPreference": ["C minor", "A minor"],
  "moodProfile": "전반적인 무드 프로필 설명",
  "instrumentProfile": ["가장 자주 사용되는 악기/사운드"],
  "productionFingerprint": "프로덕션 스타일 지문 (믹싱, 마스터링 특징)",
  "genreEvolution": "시간에 따른 장르 변화 트렌드",
  "viewCountCorrelation": "조회수와 음악 요소의 상관관계 인사이트",
  "similarArtists": ["유사 아티스트 5명"],
  "influenceMap": "영향 관계도 (Nujabes 40% + Tomppabeats 30%)",
  "sunoStylePrompt": "이 채널 스타일로 Suno에서 음악 생성할 때 쓸 스타일 태그 (200자 이내)",
  "fullReport": "2000자 이내의 상세 음악 DNA 리포트 (한국어)"
}`;

    const messages: EvolinkChatMessage[] = [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: `채널명: "${sourceName}"

개별 영상 음악 분석 데이터:
${JSON.stringify(perVideoDNA, null, 2)}

위 데이터를 종합하여 채널의 음악 DNA를 분석해주세요.`
        }
    ];

    const response = await evolinkChat(messages, {
        temperature: 0.5,
        maxTokens: 4096,
        responseFormat: { type: 'json_object' },
        signal,
        timeoutMs: 60_000,
    });

    const text = response.choices?.[0]?.message?.content || '{}';
    try {
        const json = JSON.parse(text);
        return {
            primaryGenre: json.primaryGenre || '',
            genreDistribution: json.genreDistribution || {},
            signatureSounds: json.signatureSounds || [],
            bpmRange: json.bpmRange || { min: 0, max: 0, avg: 0 },
            keyPreference: json.keyPreference || [],
            moodProfile: json.moodProfile || '',
            instrumentProfile: json.instrumentProfile || [],
            productionFingerprint: json.productionFingerprint || '',
            genreEvolution: json.genreEvolution || '',
            viewCountCorrelation: json.viewCountCorrelation || '',
            similarArtists: json.similarArtists || [],
            influenceMap: json.influenceMap || '',
            sunoStylePrompt: json.sunoStylePrompt || '',
            fullReport: json.fullReport || '',
        };
    } catch {
        throw new Error('음악 DNA 종합 분석 결과 파싱 실패');
    }
};

// === AI 분석: 비주얼 DNA ===

/** 채널 비주얼 DNA 분석 (썸네일 일괄 멀티모달) */
export const analyzeVisualDNA = async (
    videos: MusicReferenceVideo[],
    signal?: AbortSignal
): Promise<ChannelVisualDNA> => {
    logger.info('[MusicRef] 비주얼 DNA 분석 시작', { videoCount: videos.length });

    // 최대 12개 썸네일만 분석 (토큰 절약)
    const subset = videos.slice(0, 12);

    const thumbnailParts: EvolinkContentPart[] = [];
    for (const v of subset) {
        thumbnailParts.push({ type: 'text', text: `[${v.title}] 조회수: ${v.viewCount.toLocaleString()}` });
        if (v.thumbnailUrl) {
            thumbnailParts.push({ type: 'image_url', image_url: { url: v.thumbnailUrl } });
        }
    }

    const systemPrompt = `당신은 세계적인 그래픽 디자이너이자 브랜드 전략가입니다.
뮤직 채널의 썸네일들을 분석하여 비주얼 브랜드 DNA를 추출합니다.

반드시 아래 JSON 형식으로 응답:
{
  "dominantStyle": "지배적 아트 스타일 (Flat illustration, Photography, 3D render 등)",
  "styleConsistency": 8,
  "styleKeywords": ["gradient", "neon", "minimal"],
  "primaryColors": ["#1a1a2e", "#e94560", "#0f3460"],
  "colorHarmony": "색상 조화 유형 (Analogous cool with warm accent 등)",
  "backgroundStyle": "배경 스타일 (Dark gradient, Abstract pattern 등)",
  "fontStyle": "폰트 스타일 (Bold sans-serif, Handwritten 등)",
  "textPlacement": "텍스트 배치 패턴 (Center-dominant, Bottom-left 등)",
  "textEffects": "텍스트 효과 (Glow, Outline, Shadow, 3D 등)",
  "layoutPattern": "레이아웃 패턴 (Character left + text right 등)",
  "compositionRule": "구도 규칙 (Rule of thirds, Central focus 등)",
  "subjectType": "주 피사체 유형 (Illustrated character, Real person, Abstract 등)",
  "characterStyle": "캐릭터/인물 스타일 (없으면 N/A)",
  "topPerformingStyle": "조회수 상위 영상의 공통 비주얼 요소",
  "stylePromptForGeneration": "이 채널 스타일로 이미지 생성 시 사용할 프롬프트 (영어, 300자)",
  "negativePrompt": "피해야 할 비주얼 요소 (영어, 100자)",
  "fullReport": "상세 비주얼 DNA 리포트 (한국어, 1500자 이내)"
}`;

    const messages: EvolinkChatMessage[] = [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: [
                { type: 'text', text: `아래 ${subset.length}개 뮤직 영상 썸네일의 비주얼 DNA를 종합 분석해주세요:` },
                ...thumbnailParts
            ]
        }
    ];

    const response = await evolinkChat(messages, {
        temperature: 0.4,
        maxTokens: 4096,
        responseFormat: { type: 'json_object' },
        signal,
        timeoutMs: 120_000,
    });

    const text = response.choices?.[0]?.message?.content || '{}';
    try {
        const json = JSON.parse(text);
        return {
            dominantStyle: json.dominantStyle || '',
            styleConsistency: json.styleConsistency || 0,
            styleKeywords: json.styleKeywords || [],
            primaryColors: json.primaryColors || [],
            colorHarmony: json.colorHarmony || '',
            backgroundStyle: json.backgroundStyle || '',
            fontStyle: json.fontStyle || '',
            textPlacement: json.textPlacement || '',
            textEffects: json.textEffects || '',
            layoutPattern: json.layoutPattern || '',
            compositionRule: json.compositionRule || '',
            subjectType: json.subjectType || '',
            characterStyle: json.characterStyle || '',
            topPerformingStyle: json.topPerformingStyle || '',
            stylePromptForGeneration: json.stylePromptForGeneration || '',
            negativePrompt: json.negativePrompt || '',
            fullReport: json.fullReport || '',
        };
    } catch {
        throw new Error('비주얼 DNA 분석 결과 파싱 실패');
    }
};

// === 퓨전 썸네일 컨셉 생성 ===

/** Music DNA + Visual DNA → 4개 퓨전 썸네일 컨셉 */
export const generateFusionConcepts = async (
    musicDNA: ChannelMusicDNA,
    visualDNA: ChannelVisualDNA,
    sourceName: string,
    signal?: AbortSignal
): Promise<MusicReferenceFusionConcept[]> => {
    logger.info('[MusicRef] 퓨전 썸네일 컨셉 생성');

    const systemPrompt = `당신은 유튜브 뮤직 채널의 바이럴 썸네일 전문가입니다.
채널의 음악 DNA와 비주얼 DNA를 결합하여 독창적인 썸네일 컨셉 4개를 만듭니다.

핵심 원칙:
1. 레퍼런스 스타일의 DNA만 추출, 컨텐츠는 완전히 새로 창작
2. 음악 무드가 비주얼 톤으로 자연스럽게 매핑 (dreamy → soft glow, energetic → high contrast)
3. 조회수 높은 영상의 공통 요소를 우선 반영
4. 텍스트는 한국어로, 8-12자 이내의 강렬한 문구

반드시 JSON 배열 (4개)로 응답:
[{
  "id": "concept-1",
  "textOverlay": "한국어 텍스트 (8-12자)",
  "fullTitle": "전체 제목",
  "visualDescription": "이미지 생성 프롬프트 (영어, 200자, 음악 무드 반영)",
  "musicMoodMapping": "이 컨셉에 반영된 음악적 요소 설명",
  "colorPalette": ["#hex1", "#hex2", "#hex3"]
}]`;

    const messages: EvolinkChatMessage[] = [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: `채널: "${sourceName}"

[음악 DNA]
- 장르: ${musicDNA.primaryGenre}
- BPM: ${musicDNA.bpmRange.avg} (${musicDNA.bpmRange.min}-${musicDNA.bpmRange.max})
- 무드: ${musicDNA.moodProfile}
- 악기: ${musicDNA.instrumentProfile.join(', ')}
- 프로덕션: ${musicDNA.productionFingerprint}
- Suno 스타일: ${musicDNA.sunoStylePrompt}

[비주얼 DNA]
- 스타일: ${visualDNA.dominantStyle}
- 색상: ${visualDNA.primaryColors.join(', ')}
- 폰트: ${visualDNA.fontStyle}
- 레이아웃: ${visualDNA.layoutPattern}
- 조회수 상위 스타일: ${visualDNA.topPerformingStyle}
- 생성 프롬프트: ${visualDNA.stylePromptForGeneration}

위 DNA를 결합한 독창적 썸네일 4개를 제안해주세요.`
        }
    ];

    const response = await evolinkChat(messages, {
        temperature: 0.8,
        maxTokens: 4096,
        responseFormat: { type: 'json_object' },
        signal,
        timeoutMs: 60_000,
    });

    const text = response.choices?.[0]?.message?.content || '[]';
    try {
        const json = JSON.parse(text);
        const concepts = Array.isArray(json) ? json : (json.concepts || json.results || [json]);
        return concepts.slice(0, 4).map((c: Record<string, unknown>, i: number) => ({
            id: `concept-${i + 1}`,
            textOverlay: String(c.textOverlay || ''),
            fullTitle: String(c.fullTitle || ''),
            visualDescription: String(c.visualDescription || ''),
            musicMoodMapping: String(c.musicMoodMapping || ''),
            colorPalette: Array.isArray(c.colorPalette) ? c.colorPalette.map(String) : [],
            imageUrl: undefined,
            isGenerating: false,
        }));
    } catch {
        throw new Error('퓨전 컨셉 생성 결과 파싱 실패');
    }
};
