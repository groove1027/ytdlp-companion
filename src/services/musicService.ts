
import { monitoredFetch, getKieKey } from './apiService';
import { logger } from './LoggerService';
import { evolinkChat } from './evolinkService';
import { showToast } from '../stores/uiStore';
import type { MusicGenerationConfig, GeneratedMusic, MusicLibraryItem, SunoModel, LyricsResult, VocalSeparationResult, TimestampedWord } from '../types';

// === CONFIGURATION ===
const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

// === TYPES ===

export interface GenreCategory {
    id: string;
    label: string;
    subGenres: { id: string; label: string }[];
}

/** 즉시 생성 가능한 완전한 뮤직 컨셉 */
export interface MusicConcept {
    conceptName: string;
    direction: string;
    genre: string;
    subGenre: string;
    mood: string;
    bpm: number;
    keySignature: string;
    tempo: string;
    energyLevel: string;
    instrumentTags: string[];
    productionTags: string[];
    musicType: 'vocal' | 'instrumental';
    vocalStyle: string;
    sunoPrompt: string;
    sunoStyle: string;
    negativeTags: string;
    title: string;
    referenceArtists: string;
    reason: string;
}

export interface GenreSuggestion {
    genre: string;
    subGenre: string;
    mood: string;
    reason: string;
    prompt: string;
    title: string;
}

export interface MusicAnalysisResult {
    // 대본 심층 분석
    scriptGenre: string;
    scriptEra: string;
    scriptCulture: string;
    emotionPrimary: string;
    emotionSecondary: string;
    emotionArc: string;
    narrativeTone: string;
    pacingDescription: string;
    // 1순위 추천 (기존 호환)
    genre: string;
    subGenre: string;
    mood: string;
    bpm: number;
    tempo: string;
    vocalStyle: string;
    instrumentTags: string[];
    musicType: 'vocal' | 'instrumental';
    prompt: string;
    promptSuggestion: string;
    title: string;
    reasoning: string;
    keySignature: string;
    productionTags: string[];
    energyLevel: string;
    negativeTags: string;
    styleTagsFull: string;
    // 3개의 완전한 뮤직 컨셉
    concepts: MusicConcept[];
    // 레거시 호환
    genreSuggestions: GenreSuggestion[];
}

// === GENRE CATALOG ===

const GENRE_LIST: GenreCategory[] = [
    {
        id: 'pop',
        label: '팝 (Pop)',
        subGenres: [
            { id: 'synth-pop', label: '신스팝' },
            { id: 'indie-pop', label: '인디팝' },
            { id: 'k-pop', label: 'K-Pop' },
            { id: 'j-pop', label: 'J-Pop' },
            { id: 'dance-pop', label: '댄스팝' },
            { id: 'dream-pop', label: '드림팝' },
            { id: 'electro-pop', label: '일렉트로팝' },
        ]
    },
    {
        id: 'rock',
        label: '록 (Rock)',
        subGenres: [
            { id: 'alt-rock', label: '얼터너티브' },
            { id: 'indie-rock', label: '인디록' },
            { id: 'classic-rock', label: '클래식 록' },
            { id: 'post-rock', label: '포스트록' },
            { id: 'punk-rock', label: '펑크록' },
            { id: 'progressive', label: '프로그레시브' },
        ]
    },
    {
        id: 'electronic',
        label: '일렉트로닉 (Electronic)',
        subGenres: [
            { id: 'house', label: '하우스' },
            { id: 'techno', label: '테크노' },
            { id: 'ambient', label: '앰비언트' },
            { id: 'lo-fi', label: '로파이' },
            { id: 'edm', label: 'EDM' },
            { id: 'chillwave', label: '칠웨이브' },
            { id: 'drum-and-bass', label: '드럼앤베이스' },
            { id: 'dubstep', label: '덥스텝' },
        ]
    },
    {
        id: 'hiphop',
        label: '힙합 (Hip-Hop)',
        subGenres: [
            { id: 'boom-bap', label: '붐뱁' },
            { id: 'trap', label: '트랩' },
            { id: 'lo-fi-hiphop', label: '로파이 힙합' },
            { id: 'k-hiphop', label: '한국 힙합' },
            { id: 'old-school', label: '올드스쿨' },
        ]
    },
    {
        id: 'rnb',
        label: 'R&B / 소울',
        subGenres: [
            { id: 'neo-soul', label: '네오소울' },
            { id: 'contemporary-rnb', label: '컨템포러리 R&B' },
            { id: 'funk', label: '펑크' },
            { id: 'gospel', label: '가스펠' },
        ]
    },
    {
        id: 'classical',
        label: '클래식 (Classical)',
        subGenres: [
            { id: 'orchestral', label: '오케스트라' },
            { id: 'piano-solo', label: '피아노 독주' },
            { id: 'chamber', label: '실내악' },
            { id: 'cinematic', label: '시네마틱' },
            { id: 'minimalist', label: '미니멀리즘' },
        ]
    },
    {
        id: 'jazz',
        label: '재즈 (Jazz)',
        subGenres: [
            { id: 'smooth-jazz', label: '스무스 재즈' },
            { id: 'bebop', label: '비밥' },
            { id: 'fusion', label: '퓨전' },
            { id: 'bossa-nova', label: '보사노바' },
            { id: 'swing', label: '스윙' },
        ]
    },
    {
        id: 'folk',
        label: '포크/어쿠스틱 (Folk)',
        subGenres: [
            { id: 'acoustic', label: '어쿠스틱' },
            { id: 'indie-folk', label: '인디포크' },
            { id: 'country', label: '컨트리' },
            { id: 'celtic', label: '켈틱' },
        ]
    },
    {
        id: 'world',
        label: '월드 (World)',
        subGenres: [
            { id: 'latin', label: '라틴' },
            { id: 'african', label: '아프리카' },
            { id: 'middle-eastern', label: '중동' },
            { id: 'asian-traditional', label: '동양 전통' },
            { id: 'reggae', label: '레게' },
        ]
    },
    {
        id: 'bgm',
        label: 'BGM / 배경음악',
        subGenres: [
            { id: 'corporate', label: '기업/프레젠테이션' },
            { id: 'vlog-bgm', label: '브이로그' },
            { id: 'news-bgm', label: '뉴스/정보' },
            { id: 'game-bgm', label: '게임' },
            { id: 'horror-bgm', label: '공포/서스펜스' },
            { id: 'romantic-bgm', label: '로맨틱' },
            { id: 'epic-bgm', label: '에픽/트레일러' },
        ]
    },
];

// === MUSIC GENERATION ===

/**
 * Suno AI를 통한 음악 생성 (Kie 프록시 경유)
 * V5 모델 기본, Custom Mode 사용
 * 엔드포인트: POST /api/v1/generate (Kie.ai SUNO API)
 */
export const generateMusic = async (config: MusicGenerationConfig): Promise<string> => {
    const apiKey = getKieKey();
    if (!apiKey) {
        throw new Error('Kie API 키가 설정되지 않았습니다. API 설정에서 Kie API 키를 입력해주세요.');
    }

    const model = config.sunoModel || 'V5';
    const isInstrumental = config.musicType === 'instrumental';

    logger.info('[Music] 음악 생성 요청', {
        model,
        genre: config.genre,
        musicType: config.musicType,
        bpm: config.bpm
    });

    // 스타일 태그 구성 (genre + subGenre + BPM + custom)
    const styleParts: string[] = [];
    if (config.style) {
        styleParts.push(config.style);
    } else {
        if (config.genre) styleParts.push(config.genre);
        if (config.subGenre) styleParts.push(config.subGenre);
        styleParts.push(`bpm ${config.bpm}`);
        if (config.customTags.length > 0) styleParts.push(config.customTags.join(', '));
    }
    const style = styleParts.join(', ').slice(0, model === 'V4' ? 200 : 1000);

    // 요청 바디 (Kie.ai SUNO Generate Music API)
    const body: Record<string, unknown> = {
        model,
        customMode: true,
        instrumental: isInstrumental,
        style,
        title: (config.title || 'Untitled').slice(0, 80),
        callBackUrl: 'https://noop',
    };

    // 음악 길이 (초) — 참고: Suno API는 duration 파라미터를 공식 지원하지 않음
    // 실제 생성 길이는 API가 결정하며, 목표 길이 미달 시 자동 연장(extend)으로 보완
    if (config.duration && config.duration > 0) {
        body.duration = config.duration;
    }

    // vocal 모드에서만 prompt(가사) 필요
    if (!isInstrumental && config.prompt) {
        const maxPrompt = model === 'V4' ? 3000 : 5000;
        body.prompt = config.prompt.slice(0, maxPrompt);
    } else if (isInstrumental) {
        // instrumental 모드에서도 prompt를 음악 설명으로 활용
        body.prompt = (config.prompt || '').slice(0, model === 'V4' ? 3000 : 5000);
    }

    // 보컬 성별 (m/f)
    if (config.vocalGender) {
        const genderMap: Record<string, string> = { '남성': 'm', '여성': 'f', 'm': 'm', 'f': 'f' };
        const mapped = genderMap[config.vocalGender];
        if (mapped) body.vocalGender = mapped;
    }

    // 고급 파라미터 (V5 전용 기능)
    if (config.negativeTags) body.negativeTags = config.negativeTags;
    if (typeof config.styleWeight === 'number') body.styleWeight = config.styleWeight;
    if (typeof config.weirdnessConstraint === 'number') body.weirdnessConstraint = config.weirdnessConstraint;
    if (typeof config.audioWeight === 'number') body.audioWeight = config.audioWeight;

    const response = await monitoredFetch(`${KIE_BASE_URL}/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 402) throw new Error('Kie 잔액 부족: 크레딧을 충전해주세요.');
        if (response.status === 429) throw new Error('Kie 요청 제한 초과: 잠시 후 다시 시도해주세요.');
        if (response.status === 422) throw new Error(`파라미터 오류: ${errorText}`);
        throw new Error(`음악 생성 요청 오류 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (data.code && data.code !== 200) {
        throw new Error(`SUNO API 오류 (${data.code}): ${data.msg || '알 수 없는 오류'}`);
    }

    const taskId = data.data?.taskId;
    if (!taskId) throw new Error('음악 생성 태스크 ID를 받지 못했습니다.');

    logger.success('[Music] 태스크 생성 완료', { taskId, model });
    return taskId;
};

/**
 * 음악 생성 상태 폴링
 * @returns 완성된 음악 정보 (GeneratedMusic)
 */
export const pollMusicStatus = async (
    taskId: string,
    signal?: AbortSignal,
    onProgress?: (progress: number) => void
): Promise<GeneratedMusic> => {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');

    logger.info('[Music] 폴링 시작', { taskId });

    const maxAttempts = 120; // 최대 ~6분 (3초 간격)
    let simulatedProgress = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // 중단 체크
        if (signal?.aborted) throw new Error('음악 생성이 취소되었습니다.');

        // 대기: 초기 3초, 이후 5초
        const delay = attempt < 10 ? 3000 : 5000;
        await new Promise(resolve => setTimeout(resolve, delay));

        // 시뮬레이션 프로그레스
        simulatedProgress = Math.min(90, simulatedProgress + (90 - simulatedProgress) * 0.05);
        onProgress?.(Math.round(simulatedProgress));

        const response = await monitoredFetch(
            `${KIE_BASE_URL}/generate/record-info?taskId=${taskId}`,
            {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            }
        );

        if (!response.ok) {
            if (response.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            throw new Error(`음악 폴링 오류 (${response.status})`);
        }

        const data = await response.json();
        // Kie Suno API: body code 422 = record not ready yet → continue polling
        if (data.code === 422) continue;

        const status = data.data?.status;

        // 서버 진행률이 있으면 사용 (일부 상태에서 제공)
        if (status === 'FIRST_SUCCESS' || status === 'TEXT_SUCCESS') {
            simulatedProgress = Math.max(simulatedProgress, 70);
            onProgress?.(Math.round(simulatedProgress));
        }

        if (status === 'SUCCESS' || status === 'FIRST_SUCCESS') {
            onProgress?.(100);

            // 결과 파싱: data.data.response.sunoData[] (Kie Suno 공식 스펙)
            const sunoData = data.data?.response?.sunoData;
            const track = Array.isArray(sunoData) && sunoData.length > 0 ? sunoData[0] : null;

            if (!track?.audioUrl) throw new Error('음악 결과에서 오디오 URL을 찾을 수 없습니다.');

            const result: GeneratedMusic = {
                id: taskId,
                audioId: track.id,
                title: track.title || `Generated Music ${new Date().toLocaleTimeString()}`,
                audioUrl: track.audioUrl,
                streamUrl: track.streamAudioUrl,
                imageUrl: track.imageUrl,
                duration: track.duration || 0,
                createdAt: new Date().toISOString(),
                isFavorite: false,
                tags: track.tags,
                lyrics: track.prompt,
            };

            logger.success('[Music] 음악 생성 완료', { taskId, title: result.title, duration: result.duration });
            return result;
        }

        // 실패 상태 처리
        if (status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED' ||
            status === 'CALLBACK_EXCEPTION' || status === 'SENSITIVE_WORD_ERROR') {
            const failMsg = data.data?.errorMessage || status;
            throw new Error(`음악 생성 실패: ${failMsg}`);
        }

        // PENDING, TEXT_SUCCESS → 계속 폴링
    }

    throw new Error(`음악 생성 시간 초과 (${maxAttempts}회 폴링 실패)`);
};

// === GENRE LIST ===

/**
 * 사용 가능한 장르 및 서브장르 목록 반환
 */
export const getGenreList = (): GenreCategory[] => {
    return GENRE_LIST;
};

// === SCRIPT ANALYSIS ===

/**
 * 긴 대본을 AI 분석에 적합한 길이로 축약
 * 도입부 + 중간 핵심 장면 샘플링 + 후반부 구조로 전체 맥락 보존
 */
const prepareScriptForAnalysis = (text: string): string => {
    if (text.length <= 8000) return text;

    // 문단 단위로 분할
    const paragraphs = text.split(/\n+/).filter(p => p.trim());

    // 도입부/설정: 첫 2000자
    const head = text.substring(0, 2000);
    // 클라이맥스/결론: 마지막 1500자
    const tail = text.substring(text.length - 1500);
    // 중간 핵심 장면: 30%~70% 구간에서 균등 샘플링 (최대 5개 문단)
    const midStart = Math.floor(paragraphs.length * 0.3);
    const midEnd = Math.floor(paragraphs.length * 0.7);
    const midParagraphs = paragraphs.slice(midStart, midEnd);
    const step = Math.max(1, Math.floor(midParagraphs.length / 5));
    const middleSample = midParagraphs
        .filter((_, i) => i % step === 0)
        .join('\n')
        .substring(0, 1500);

    logger.info('[Music] 대본 축약 적용', {
        original: text.length,
        head: head.length,
        middle: middleSample.length,
        tail: tail.length,
    });

    return `${head}\n\n[... 중간 핵심 장면 ...]\n\n${middleSample}\n\n[... 후반부 ...]\n\n${tail}`;
};

/** JSON 응답 파싱 헬퍼 (마크다운 코드블록 + 잘린 JSON 자동 복구) */
const parseAiJson = (raw: string): Record<string, unknown> => {
    let s = raw.trim();
    const cb = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (cb) s = cb[1].trim();
    const i = s.indexOf('{');
    if (i >= 0) s = s.substring(i);

    // 1차: 정상 파싱 시도
    try {
        const j = s.lastIndexOf('}');
        if (j > 0) return JSON.parse(s.substring(0, j + 1));
    } catch { /* 잘린 JSON → 복구 시도 */ }

    // 2차: 잘린 JSON 자동 복구 — 미닫힌 괄호/따옴표 닫기
    let fixed = s;
    // 미완성 문자열 값 닫기 (잘린 "value 형태)
    const lastQuote = fixed.lastIndexOf('"');
    const afterLastQuote = fixed.substring(lastQuote + 1).trim();
    if (lastQuote > 0 && !afterLastQuote.startsWith(':') && !afterLastQuote.startsWith(',') &&
        !afterLastQuote.startsWith('}') && !afterLastQuote.startsWith(']') && afterLastQuote.length < 3) {
        fixed = fixed.substring(0, lastQuote + 1);
    }
    // 마지막 불완전 key-value 쌍 제거 (쉼표 뒤 잘린 것)
    fixed = fixed.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
    fixed = fixed.replace(/,\s*$/, '');
    // 미닫힌 괄호 계산 후 닫기
    let braces = 0, brackets = 0;
    let inStr = false;
    for (let k = 0; k < fixed.length; k++) {
        const ch = fixed[k];
        if (ch === '"' && (k === 0 || fixed[k - 1] !== '\\')) { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') braces++;
        else if (ch === '}') braces--;
        else if (ch === '[') brackets++;
        else if (ch === ']') brackets--;
    }
    for (let k = 0; k < brackets; k++) fixed += ']';
    for (let k = 0; k < braces; k++) fixed += '}';

    logger.info('[Music] 잘린 JSON 복구 시도', { originalLen: s.length, fixedLen: fixed.length });
    return JSON.parse(fixed);
};

/** MusicConcept 파싱 */
const parseConcept = (c: Record<string, unknown>, idx: number): MusicConcept => ({
    conceptName: String(c.conceptName || `컨셉 ${idx + 1}`),
    direction: String(c.direction || ''),
    genre: String(c.genre || 'bgm'),
    subGenre: String(c.subGenre || ''),
    mood: String(c.mood || 'neutral'),
    bpm: typeof c.bpm === 'number' ? Math.max(40, Math.min(220, c.bpm)) : 120,
    keySignature: String(c.keySignature || ''),
    tempo: String(c.tempo || ''),
    energyLevel: String(c.energyLevel || 'Medium Energy'),
    instrumentTags: Array.isArray(c.instrumentTags) ? (c.instrumentTags as string[]).slice(0, 6) : [],
    productionTags: Array.isArray(c.productionTags) ? (c.productionTags as string[]).slice(0, 4) : [],
    musicType: c.musicType === 'vocal' ? 'vocal' : 'instrumental',
    vocalStyle: String(c.vocalStyle || 'none'),
    sunoPrompt: String(c.sunoPrompt || ''),
    sunoStyle: String(c.sunoStyle || '').slice(0, 1000),
    negativeTags: String(c.negativeTags || ''),
    title: String(c.title || '').slice(0, 80),
    referenceArtists: String(c.referenceArtists || ''),
    reason: String(c.reason || ''),
});

/**
 * 대본 음악 분석 — 2단계 심층 분석 시스템
 *
 * 1단계: 대본의 서사 구조, 감정, 시대/문화적 맥락을 심층 분석
 * 2단계: 분석 결과를 기반으로 3개의 완전한 뮤직 컨셉 생성 (각각 즉시 생성 가능)
 */
export const analyzeMusicForScript = async (scriptText: string): Promise<MusicAnalysisResult> => {
    if (!scriptText.trim()) throw new Error('분석할 대본이 비어있습니다.');

    logger.info('[Music] 2단계 심층 음악 분석 시작', { textLength: scriptText.length });

    const truncatedScript = prepareScriptForAnalysis(scriptText);
    const genreCatalog = GENRE_LIST.map(g => `${g.id}(${g.subGenres.map(s => s.id).join('/')})`).join(', ');

    // ═══ 1단계 + 2단계 통합 (단일 고밀도 프롬프트) ═══
    const systemPrompt = `You are a world-class Music Supervisor who has scored 500+ films, documentaries, and viral YouTube videos.
You analyze scripts with the depth of a film studies professor and the ear of a Grammy-winning producer.
You MUST respond in pure JSON only. No markdown, no code blocks, no explanation outside JSON.

## YOUR ANALYSIS METHODOLOGY

### STEP 1: DEEP SCRIPT DECONSTRUCTION
Before choosing any music, you MUST identify:
- **Content Genre**: Is this a documentary, drama, comedy, horror, thriller, romance, educational explainer, vlog, news, essay film, historical piece, sci-fi, fantasy, true crime, sports, nature, cooking, travel, or something else?
- **Era & Setting**: When and where does this take place? 17th century England needs period instruments. 1980s Seoul needs synth-pop and city pop vibes. Ancient Rome needs epic brass and choir.
- **Cultural Layer**: Korean script → consider K-Drama OST, Korean indie, gugak fusion. Japanese → J-Pop, city pop, enka. Middle Eastern → oud, darbuka, maqam scales. European medieval → lute, hurdy-gurdy, Gregorian chant.
- **Narrative Arc & Pacing**: Map the emotional journey. Where are the turning points? What's the climax? Is it a slow burn or rapid fire?
- **Subtext & Irony**: Sometimes a cheerful script has dark undertones (needs minor key under major melody). Sometimes horror needs beauty (contrast scoring).
- **Target Audience & Platform**: YouTube essay → clean, non-distracting BGM. Cinematic short → full orchestral. Instagram reel → trendy, hook-heavy.

### STEP 2: EMOTION MAPPING (multi-layer)
- **Primary Emotion** (dominant): What emotion drives 60%+ of the script?
- **Secondary Emotion** (undertone): The hidden emotional layer beneath the surface
- **Emotion Transitions**: Exactly where and how emotions shift
- **Tension Curve**: Graph the tension level throughout (setup → rising → peak → resolution)

### STEP 3: MUSIC ARCHITECTURE
For each concept, design the complete musical blueprint:
- **BPM**: Not arbitrary. Match the script's breathing rhythm, sentence pace, and emotional weight.
  - Funeral/tragedy: 48-65 | Melancholy/reflection: 65-82 | Calm narration: 82-100
  - Upbeat info: 100-125 | Energetic/action: 125-155 | Frantic/chase: 155-200+
- **Key/Mode**: C major = innocent/bright. D minor = tragic/serious. E Phrygian = Spanish/exotic. A Mixolydian = folk/warm. B♭ minor = noir/mysterious.
- **Instruments**: Be HYPER-SPECIFIC. Not "piano" but "felt-dampened upright piano with subtle tape saturation". Not "strings" but "solo cello with wide vibrato, double-tracked and panned".
- **Production**: Describe the sonic space. "Large cathedral reverb" vs "tight, dry studio" vs "lo-fi with vinyl crackle and tape hiss".
- **Reference Artists/Works**: Name specific composers, artists, or soundtracks that match the vibe (Hans Zimmer's Interstellar, Yann Tiersen's Amélie, Ryuichi Sakamoto's Merry Christmas Mr. Lawrence, etc.)

### STEP 4: SUNO PROMPT ENGINEERING (CRITICAL)
You are an expert at writing Suno AI prompts. Rules:
1. First 20 words = most influential. Pack genre + mood + key instruments here.
2. Use specific adjectives: "warm reverb-drenched grand piano" not "gentle piano"
3. Include production details: mixing style, spatial characteristics, frequency emphasis
4. Mention reference styles: "in the style of Hans Zimmer" or "reminiscent of Studio Ghibli soundtracks"
5. Describe the emotional journey: "starts sparse and intimate, builds to a sweeping orchestral climax"
6. Include technical details: time signature (3/4 waltz, 6/8 compound), swing/straight feel, dynamics
7. Suno style field: comma-separated tags, most important first, max 200 chars

## GENRE IDS (use these exact IDs)
${genreCatalog}`;

    const userPrompt = `Analyze this script and create 3 completely different, production-ready music concepts.
Each concept must be a RADICALLY different musical approach — not just genre variations, but entirely different emotional interpretations.

SCRIPT:
---
${truncatedScript}
---

Respond with this EXACT JSON structure:
{
  "scriptAnalysis": {
    "contentGenre": "script genre (documentary/drama/comedy/horror/etc.)",
    "era": "time period/setting of the content",
    "culture": "cultural context",
    "emotionPrimary": "dominant emotion (Korean)",
    "emotionSecondary": "hidden undertone emotion (Korean)",
    "emotionArc": "full emotional journey in Korean (예: 경이로운 도입 → 불안한 전개 → 비극적 반전 → 씁쓸한 여운)",
    "narrativeTone": "overall tone (Korean, 예: 진지하면서도 경외감이 서린 다큐멘터리 톤)",
    "pacing": "pacing description (Korean, 예: 느린 호흡의 서사적 전개, 중반부 긴장 가속)",
    "reasoning": "why you chose these 3 concepts — connect each one to specific elements in the script (Korean, 5-7 sentences, deeply specific to THIS script's content, characters, themes)"
  },
  "concepts": [
    {
      "conceptName": "컨셉 이름 (한국어, 예: 어둠 속의 서광)",
      "direction": "이 컨셉의 음악적 방향 한 줄 요약 (한국어)",
      "genre": "genre id from catalog",
      "subGenre": "sub-genre id from catalog",
      "mood": "3-5 mood keywords comma separated (English)",
      "bpm": number,
      "keySignature": "key (e.g. D minor, A♭ major, E Phrygian)",
      "tempo": "specific tempo description (English, e.g. slow brooding waltz in 3/4)",
      "energyLevel": "Low Energy/Relaxed/Chill/Steady/Medium Energy/Building/Driving/High Energy/Explosive",
      "instrumentTags": ["6 hyper-specific instruments (e.g. felt-dampened upright piano, bowed double bass with rosin texture)"],
      "productionTags": ["3-4 production tags (e.g. cathedral reverb, lo-fi tape saturation, wide stereo)"],
      "musicType": "instrumental or vocal",
      "vocalStyle": "specific vocal style or none",
      "sunoPrompt": "5-7 sentence Suno prompt in English. MUST be vivid, specific, and production-detailed. First sentence = most important keywords. Include BPM, key, instruments, production style, emotional arc, and reference.",
      "sunoStyle": "complete Suno style tags string, most important first, max 200 chars (e.g. cinematic orchestral, dark, D minor, bpm 72, cello, timpani, atmospheric reverb, film noir)",
      "negativeTags": "styles/instruments to EXCLUDE for this concept (comma separated)",
      "title": "creative track title reflecting the script's theme (English or Korean, max 80 chars)",
      "referenceArtists": "2-3 reference artists/soundtracks (e.g. Hans Zimmer (Interstellar), Yann Tiersen (Amélie))",
      "reason": "왜 이 컨셉이 이 대본에 맞는지 구체적 설명 (한국어, 3-4문장, 대본의 특정 장면/감정/맥락 언급 필수)"
    },
    { "conceptName": "...", "direction": "...", ... },
    { "conceptName": "...", "direction": "...", ... }
  ]
}

CRITICAL RULES:
- Concept 1 = BEST FIT (가장 대본에 맞는 정석적 선택)
- Concept 2 = CREATIVE ALTERNATIVE (예상치 못한 참신한 접근)
- Concept 3 = CONTRAST (정반대 감정 또는 장르로 의외의 효과를 노린 선택)
- Each sunoPrompt MUST be unique and production-quality
- Each sunoStyle MUST be a complete, ready-to-use Suno style string
- Track titles MUST be creative and specific to this script's content
- Reasons MUST reference specific parts of the script, not generic descriptions`;

    try {
        const chatResponse = await evolinkChat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            { temperature: 0.65, maxTokens: 10000 }
        );

        const content = chatResponse.choices?.[0]?.message?.content || '';
        const parsed = parseAiJson(content);

        // scriptAnalysis 파싱
        const sa = (parsed.scriptAnalysis || {}) as Record<string, string>;

        // concepts 파싱
        const rawConcepts = Array.isArray(parsed.concepts) ? parsed.concepts : [];
        const concepts: MusicConcept[] = rawConcepts.slice(0, 3).map(
            (c: Record<string, unknown>, i: number) => parseConcept(c, i)
        );

        // 1순위 컨셉에서 기존 호환 필드 추출
        const best = concepts[0] || parseConcept({}, 0);

        // genreSuggestions 레거시 호환 매핑
        const genreSuggestions: GenreSuggestion[] = concepts.map((c) => ({
            genre: c.genre,
            subGenre: c.subGenre,
            mood: c.mood,
            reason: c.reason,
            prompt: c.sunoPrompt,
            title: c.title,
        }));

        const result: MusicAnalysisResult = {
            // 대본 분석
            scriptGenre: sa.contentGenre || '',
            scriptEra: sa.era || '',
            scriptCulture: sa.culture || '',
            emotionPrimary: sa.emotionPrimary || '',
            emotionSecondary: sa.emotionSecondary || '',
            emotionArc: sa.emotionArc || '',
            narrativeTone: sa.narrativeTone || '',
            pacingDescription: sa.pacing || '',
            // 1순위 추천 (기존 호환)
            genre: best.genre,
            subGenre: best.subGenre,
            mood: best.mood,
            bpm: best.bpm,
            tempo: best.tempo,
            vocalStyle: best.vocalStyle,
            instrumentTags: best.instrumentTags,
            musicType: best.musicType,
            prompt: best.sunoPrompt,
            promptSuggestion: concepts[1]?.sunoPrompt || '',
            title: best.title,
            reasoning: sa.reasoning || best.reason,
            keySignature: best.keySignature,
            productionTags: best.productionTags,
            energyLevel: best.energyLevel,
            negativeTags: best.negativeTags,
            styleTagsFull: best.sunoStyle,
            // 컨셉
            concepts,
            genreSuggestions,
        };

        logger.success('[Music] 2단계 심층 분석 완료', {
            scriptGenre: result.scriptGenre,
            concepts: concepts.length,
            bestGenre: best.genre,
            bestBpm: best.bpm,
        });
        return result;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('[Music] 대본 음악 분석 실패', msg);
        showToast(`음악 분석 실패: ${msg.substring(0, 80)}`, 5000);

        return {
            scriptGenre: '', scriptEra: '', scriptCulture: '',
            emotionPrimary: '', emotionSecondary: '', emotionArc: '',
            narrativeTone: '', pacingDescription: '',
            genre: 'bgm', subGenre: 'vlog-bgm', mood: 'calm, neutral', bpm: 120,
            tempo: 'mid-tempo', vocalStyle: 'none', instrumentTags: ['piano', 'strings', 'soft pad'],
            musicType: 'instrumental',
            prompt: 'Calm instrumental background music, gentle piano with soft strings and ambient pads, 120 BPM, warm and pleasant',
            promptSuggestion: '', title: 'Untitled BGM',
            reasoning: '분석 실패로 기본 BGM을 추천합니다.', keySignature: '', productionTags: [],
            energyLevel: 'Steady', negativeTags: '', styleTagsFull: '',
            concepts: [], genreSuggestions: [],
        };
    }
};

// === MUSIC LIBRARY HELPERS ===

/**
 * GeneratedMusic 배열을 날짜별 그룹으로 정리
 */
// === 공통 Kie 에러 핸들러 ===
const handleKieError = async (response: Response, action: string) => {
    const errorText = await response.text();
    if (response.status === 402) throw new Error('Kie 잔액 부족: 크레딧을 충전해주세요.');
    if (response.status === 429) throw new Error('Kie 요청 제한 초과: 잠시 후 다시 시도해주세요.');
    if (response.status === 422) throw new Error(`파라미터 오류: ${errorText}`);
    throw new Error(`${action} 오류 (${response.status}): ${errorText}`);
};

const kiePost = async (path: string, body: Record<string, unknown>, action: string): Promise<string> => {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');
    const response = await monitoredFetch(`${KIE_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });
    if (!response.ok) await handleKieError(response, action);
    const data = await response.json();
    if (data.code && data.code !== 200) throw new Error(`${action} 오류 (${data.code}): ${data.msg || '알 수 없는 오류'}`);
    const taskId = data.data?.taskId;
    if (!taskId) throw new Error(`${action}: 태스크 ID를 받지 못했습니다.`);
    return taskId;
};

// === EXTEND MUSIC ===

export const extendMusic = async (opts: {
    audioId: string;
    continueAt: number;
    model: SunoModel;
    prompt?: string;
    style?: string;
    title?: string;
    defaultParamFlag?: boolean;
}): Promise<string> => {
    const useCustom = opts.defaultParamFlag ?? true;
    const body: Record<string, unknown> = {
        audioId: opts.audioId,
        model: opts.model,
        defaultParamFlag: useCustom,
        callBackUrl: 'https://noop',
    };
    if (useCustom) {
        if (opts.continueAt != null) body.continueAt = opts.continueAt;
        if (opts.style) body.style = opts.style;
        if (opts.title) body.title = opts.title;
        if (opts.prompt) body.prompt = opts.prompt;
    }
    logger.info('[Music] 곡 연장 요청', { audioId: opts.audioId, continueAt: opts.continueAt });
    return kiePost('/generate/extend', body, '곡 연장');
};

// === LYRICS GENERATION ===

export const generateLyrics = async (prompt: string): Promise<string> => {
    if (!prompt.trim()) throw new Error('가사 생성 프롬프트가 비어있습니다.');
    logger.info('[Music] AI 가사 생성 요청', { prompt: prompt.slice(0, 50) });
    return kiePost('/lyrics', { prompt: prompt.slice(0, 200), callBackUrl: 'https://noop' }, '가사 생성');
};

export const pollLyricsResult = async (taskId: string, signal?: AbortSignal): Promise<LyricsResult[]> => {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted) throw new Error('가사 생성이 취소되었습니다.');
        await new Promise(r => setTimeout(r, 3000));
        const response = await monitoredFetch(`${KIE_BASE_URL}/lyrics/record-info?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!response.ok) { if (response.status === 429) { await new Promise(r => setTimeout(r, 5000)); continue; } throw new Error(`가사 폴링 오류 (${response.status})`); }
        const data = await response.json();
        if (data.code === 422) continue;
        const status = data.data?.status;
        if (status === 'SUCCESS') {
            // Kie Suno 공식 스펙: data.data.response.data[] → [{title, text}]
            const lyricsData = data.data?.response?.lyricsData;
            const items = Array.isArray(lyricsData) ? lyricsData : [];
            return items.filter((i: { text?: string }) => i?.text).map((i: { title?: string; text: string }) => ({ title: i.title || '', text: i.text }));
        }
        if (status === 'CREATE_TASK_FAILED' || status === 'GENERATE_LYRICS_FAILED' ||
            status === 'CALLBACK_EXCEPTION' || status === 'SENSITIVE_WORD_ERROR') {
            throw new Error(`가사 생성 실패: ${data.data?.errorMessage || status}`);
        }
    }
    throw new Error('가사 생성 시간 초과');
};

// === VOCAL SEPARATION ===

export const separateVocals = async (opts: {
    taskId: string;
    audioId: string;
    type?: 'separate_vocal' | 'split_stem';
}): Promise<string> => {
    logger.info('[Music] 보컬 분리 요청', { taskId: opts.taskId, audioId: opts.audioId });
    return kiePost('/vocal-removal/generate', {
        taskId: opts.taskId,
        audioId: opts.audioId,
        type: opts.type || 'separate_vocal',
        callBackUrl: 'https://noop',
    }, '보컬 분리');
};

export const pollVocalSeparation = async (taskId: string, signal?: AbortSignal): Promise<VocalSeparationResult> => {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted) throw new Error('보컬 분리가 취소되었습니다.');
        await new Promise(r => setTimeout(r, 3000));
        const response = await monitoredFetch(`${KIE_BASE_URL}/vocal-removal/record-info?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!response.ok) { if (response.status === 429) { await new Promise(r => setTimeout(r, 5000)); continue; } throw new Error(`보컬 분리 폴링 오류 (${response.status})`); }
        const data = await response.json();
        if (data.code === 422) continue;
        const successFlag = data.data?.successFlag;
        if (successFlag === 'SUCCESS') {
            // Kie Suno 공식 스펙: data.data.response.vocalUrl / instrumentalUrl (camelCase)
            const resp = data.data?.response;
            return {
                vocalUrl: resp?.vocalUrl || '',
                instrumentalUrl: resp?.instrumentalUrl || '',
            };
        }
        if (successFlag === 'CREATE_TASK_FAILED' || successFlag === 'GENERATE_AUDIO_FAILED' ||
            successFlag === 'CALLBACK_EXCEPTION') {
            throw new Error(`보컬 분리 실패: ${data.data?.errorMessage || successFlag}`);
        }
    }
    throw new Error('보컬 분리 시간 초과');
};

// === TIMESTAMPED LYRICS ===

export const getTimestampedLyrics = async (taskId: string, audioId: string): Promise<TimestampedWord[]> => {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');
    const response = await monitoredFetch(`${KIE_BASE_URL}/generate/get-timestamped-lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ taskId, audioId }),
    });
    if (!response.ok) await handleKieError(response, '싱크 가사 조회');
    const data = await response.json();
    const words = data.data?.alignedWords;
    if (!Array.isArray(words)) return [];
    return words.map((w: { word?: string; startS?: number; endS?: number }) => ({
        word: w.word || '',
        startS: w.startS || 0,
        endS: w.endS || 0,
    }));
};

// === STYLE BOOST ===

export const boostStyle = async (style: string): Promise<string> => {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');
    const response = await monitoredFetch(`${KIE_BASE_URL}/style/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ content: style }),
    });
    if (!response.ok) await handleKieError(response, '스타일 부스트');
    const data = await response.json();
    return data.data?.style || data.data?.result || style;
};

// === UPLOAD & EXTEND ===

export const uploadAndExtend = async (opts: {
    uploadUrl: string;
    continueAt: number;
    model: SunoModel;
    instrumental: boolean;
    prompt?: string;
    style?: string;
    title?: string;
}): Promise<string> => {
    const body: Record<string, unknown> = {
        uploadUrl: opts.uploadUrl,
        continueAt: opts.continueAt,
        model: opts.model,
        instrumental: opts.instrumental,
        defaultParamFlag: true,
        callBackUrl: 'https://noop',
    };
    if (opts.style) body.style = opts.style;
    if (opts.title) body.title = opts.title;
    if (opts.prompt) body.prompt = opts.prompt;
    logger.info('[Music] 업로드+연장 요청', { uploadUrl: opts.uploadUrl });
    return kiePost('/generate/upload-extend', body, '업로드+연장');
};

// === ADD INSTRUMENTAL / VOCALS ===

export const addInstrumental = async (opts: {
    uploadUrl: string;
    title: string;
    tags: string;
    negativeTags?: string;
    model?: SunoModel;
}): Promise<string> => {
    logger.info('[Music] 반주 추가 요청', { title: opts.title });
    return kiePost('/generate/add-instrumental', {
        uploadUrl: opts.uploadUrl,
        title: opts.title,
        tags: opts.tags,
        negativeTags: opts.negativeTags || '',
        model: opts.model || 'V4_5PLUS',
        callBackUrl: 'https://noop',
    }, '반주 추가');
};

export const addVocals = async (opts: {
    uploadUrl: string;
    prompt: string;
    title: string;
    style: string;
    negativeTags?: string;
    model?: SunoModel;
}): Promise<string> => {
    logger.info('[Music] 보컬 추가 요청', { title: opts.title });
    return kiePost('/generate/add-vocals', {
        uploadUrl: opts.uploadUrl,
        prompt: opts.prompt,
        title: opts.title,
        style: opts.style,
        negativeTags: opts.negativeTags || '',
        model: opts.model || 'V4_5PLUS',
        callBackUrl: 'https://noop',
    }, '보컬 추가');
};

// === MUSIC LIBRARY HELPERS ===

export const groupMusicByDate = (tracks: GeneratedMusic[]): MusicLibraryItem[] => {
    const groups = new Map<string, GeneratedMusic[]>();

    for (const track of tracks) {
        const date = new Date(track.createdAt).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date)!.push(track);
    }

    // 최신순 정렬
    return Array.from(groups.entries())
        .sort((a, b) => {
            const dateA = new Date(a[1][0].createdAt).getTime();
            const dateB = new Date(b[1][0].createdAt).getTime();
            return dateB - dateA;
        })
        .map(([groupTitle, groupTracks]) => ({
            groupTitle,
            tracks: groupTracks.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
        }));
};
