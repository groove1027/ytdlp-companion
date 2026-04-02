
import { monitoredFetch, getKieKey } from './apiService';
import { logger } from './LoggerService';
import { generateSpeech as generateSupertonicSpeech } from './supertonicService';

import type { TTSEngine, TTSLanguage } from '../types';

const COMPANION_URL = 'http://127.0.0.1:9876';

// === CONFIGURATION ===
const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
const TTS_MAX_CHUNK_CHARS = 4500; // ElevenLabs 5000자 제한 대비 안전 마진

// === SPEAKER TAG STRIPPING (FIX #228) ===

/**
 * TTS 생성 전 화자/모드 태그를 제거하여 순수 대사만 추출
 * AI 생성 스크립트에 포함된 [N], [S-진행자], 나레이션: 등의 태그가
 * TTS 엔진에 전달되면 그대로 읽혀버리는 문제 해결
 */
export const stripSpeakerTags = (text: string): string => {
  if (!text) return '';
  let cleaned = text.trim();
  // [A-더빙], [B-원본], [A], [B], [N], [S-화자명] 등 브라켓 태그
  cleaned = cleaned.replace(/^\[(?:[NABnab](?:[-‐–—][^\]]*)?|[Ss][-‐–][^\]]*)\]\s*/g, '');
  // [화자명] 패턴 (한글 1-10자 브라켓, 줄 시작)
  cleaned = cleaned.replace(/^\[[가-힣]{1,10}\]\s*/g, '');
  // 나레이션:, 내레이션:, 진행자:, MC:, 해설:, 화자N: 등 알려진 역할 접두사
  cleaned = cleaned.replace(/^(?:나레이션|내레이션|나레이터|진행자|MC|mc|해설|화자\s*\d*)\s*[:：]\s*/gi, '');
  // (더빙), (원본), (나레이션) 등 괄호 모드 태그 (어디서든)
  cleaned = cleaned.replace(/\((?:더빙|원본|나레이션|내레이션)\)/g, '');
  return cleaned.trim();
};

// === TEXT SPLITTING ===

/**
 * 한국어 종결어미 + 구두점 기반 문장 분할 (나레이션 TTS용)
 * 장면 분할(이미지용)과 독립적으로 사용됨
 *
 * [FIX #194] 줄바꿈 존중 규칙:
 *   - 사용자가 줄바꿈(\n)으로 구분한 경우 각 줄을 하나의 TTS 라인으로 유지
 *   - 줄바꿈이 2개 이상인 곳(빈 줄)은 확실한 단락 경계 → 항상 분리
 *   - 줄바꿈이 없는 단일 텍스트 블록만 문장 단위로 자동 분할
 */
export const splitBySentenceEndings = (text: string): string[] => {
  if (!text.trim()) return [];

  // 줄바꿈이 있는지 확인 — 사용자가 의도적으로 끊어놓았는지 판단
  const hasUserLineBreaks = /\n/.test(text.trim());

  if (hasUserLineBreaks) {
    // 사용자가 줄바꿈으로 명시적으로 구분 → 각 줄을 그대로 TTS 라인으로 유지
    // 빈 줄(연속 줄바꿈)은 단락 경계로 자동 제거
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);

    // 5자 미만 줄은 이전 줄에 병합 (너무 짧은 단독 줄 방지)
    const merged: string[] = [];
    for (const line of lines) {
      if (line.length < 5 && merged.length > 0) {
        merged[merged.length - 1] += ' ' + line;
      } else {
        merged.push(line);
      }
    }
    return merged.length > 0 ? merged : [text.trim()];
  }

  // 줄바꿈 없는 단일 블록 → 기존 문장 분할 로직 적용
  // 1순위: 구두점 (.!?。！？) 뒤에서 분할
  // 2순위: 한국어 종결어미 + 공백에서 분할
  const KOREAN_ENDINGS = /(?<=(?:습니다|합니다|됩니다|입니다|었습니다|였습니다|하세요|으세요|세요|어요|아요|해요|이에요|예요|잖아요|더라고요|거든요|네요|군요|이죠|거죠|죠|요|다|까))[.!?。！？]?\s+/g;
  const PUNCTUATION = /(?<=[.!?。！？])\s+/g;

  const sentences: string[] = [];

  // 구두점 분할 시도
  let parts = text.split(PUNCTUATION).filter(s => s.trim());
  if (parts.length <= 1) {
    // 구두점 없으면 종결어미 분할 시도
    parts = text.split(KOREAN_ENDINGS).filter(s => s.trim());
  }
  if (parts.length <= 1) {
    // 종결어미도 없으면 그대로 유지
    sentences.push(text.trim());
  } else {
    sentences.push(...parts.map(s => s.trim()).filter(s => s));
  }

  // 5자 미만 문장은 이전 문장에 병합
  const merged: string[] = [];
  for (const s of sentences) {
    if (s.length < 5 && merged.length > 0) {
      merged[merged.length - 1] += ' ' + s;
    } else {
      merged.push(s);
    }
  }

  return merged.length > 0 ? merged : [text.trim()];
};

/**
 * 긴 텍스트를 TTS 생성용으로 문장 경계에서 분할
 * ElevenLabs 5000자 제한, 기타 엔진의 안정성을 위해 사용
 */
export const splitTextForTTS = (text: string, maxChars: number = TTS_MAX_CHUNK_CHARS): string[] => {
    if (text.length <= maxChars) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxChars) {
            chunks.push(remaining);
            break;
        }

        const searchRange = remaining.slice(0, maxChars);
        let splitIdx = -1;

        // 1순위: 문장 종결 부호 (.!?。！？) 뒤
        const sentenceEndRegex = /[.!?。！？]\s/g;
        let match;
        while ((match = sentenceEndRegex.exec(searchRange)) !== null) {
            splitIdx = match.index + match[0].length;
        }

        // 2순위: 쉼표/구분자 뒤
        if (splitIdx === -1) {
            const commaRegex = /[,，、]\s/g;
            while ((match = commaRegex.exec(searchRange)) !== null) {
                splitIdx = match.index + match[0].length;
            }
        }

        // 3순위: 공백
        if (splitIdx === -1) {
            splitIdx = searchRange.lastIndexOf(' ');
            if (splitIdx > 0) splitIdx += 1;
        }

        // 4순위: 줄바꿈
        if (splitIdx <= 0) {
            splitIdx = searchRange.lastIndexOf('\n');
            if (splitIdx > 0) splitIdx += 1;
        }

        // 최후 수단: 강제 분할
        if (splitIdx <= 0) {
            splitIdx = maxChars;
        }

        chunks.push(remaining.slice(0, splitIdx).trim());
        remaining = remaining.slice(splitIdx).trim();
    }

    return chunks.filter(c => c.length > 0);
};

// === TYPES ===

export interface VoiceOption {
    id: string;
    name: string;
    language: TTSLanguage;
    gender: 'male' | 'female' | 'neutral';
    engine: TTSEngine;
    preview?: string;      // 미리듣기 URL
    description?: string;  // 음성 설명 (예: "Warm, Captivating Storyteller")
    accent?: string;       // 악센트/국적 (예: "american", "british")
}

export interface TTSResult {
    audioUrl: string;
    duration?: number; // 초
    format: 'mp3' | 'wav' | 'opus';
}

// === VOICE CATALOGS ===

/* [Microsoft Edge TTS 비활성화] — ElevenLabs Dialogue V3로 대체됨
const MICROSOFT_VOICES_FALLBACK: VoiceOption[] = [
    { id: 'ko-KR-SunHiNeural', name: '선희 (여성, 표준)', language: 'ko', gender: 'female', engine: 'microsoft' },
    { id: 'ko-KR-InJoonNeural', name: '인준 (남성, 표준)', language: 'ko', gender: 'male', engine: 'microsoft' },
    { id: 'en-US-JennyNeural', name: 'Jenny (Female)', language: 'en', gender: 'female', engine: 'microsoft' },
    { id: 'en-US-GuyNeural', name: 'Guy (Male)', language: 'en', gender: 'male', engine: 'microsoft' },
    { id: 'ja-JP-NanamiNeural', name: '七海 (여성)', language: 'ja', gender: 'female', engine: 'microsoft' },
];

export const getSystemMicrosoftVoices = (): VoiceOption[] => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return MICROSOFT_VOICES_FALLBACK;
    const sysVoices = window.speechSynthesis.getVoices();
    if (sysVoices.length === 0) return MICROSOFT_VOICES_FALLBACK;
    const result: VoiceOption[] = [];
    const seen = new Set<string>();
    for (const v of sysVoices) {
        let lang: TTSLanguage | null = null;
        const loc = v.lang.replace('_', '-');
        if (loc === 'ko-KR' || loc === 'ko') lang = 'ko';
        else if (loc === 'en-US' || loc === 'en') lang = 'en';
        else if (loc === 'ja-JP' || loc === 'ja') lang = 'ja';
        if (!lang) continue;
        const key = v.voiceURI || v.name;
        if (seen.has(key)) continue;
        seen.add(key);
        const gender: 'male' | 'female' | 'neutral' =
            /yuna|sunhi|jimin|seo|yujin|jenny|aria|samantha|nanami|kyoko|karen|fiona|moira|victoria|zoe|susan|tessa|allison|ava|joana|female|여/i.test(v.name) ? 'female' :
            /injoon|bong|gook|guy|davis|tony|keita|daniel|tom|fred|ralph|alex|lee|otoya|male|남/i.test(v.name) ? 'male' : 'neutral';
        result.push({ id: key, name: v.name, language: lang, gender, engine: 'microsoft' as any });
    }
    return result.length > 0 ? result : MICROSOFT_VOICES_FALLBACK;
};
*/

/**
 * ElevenLabs Multilingual v2 음성 목록 (Kie API 경유)
 * 모든 음성은 29개 언어를 자동 감지하여 지원 (한/영/일 포함)
 * voice 파라미터에 음성 이름 문자열을 전달
 */
/* [ElevenLabs 비활성화] ELEVENLABS_VOICES 배열 — 복원 시 주석 해제
const ELEVENLABS_VOICES: VoiceOption[] = [
    // 공식 프리메이드 음성 (다국어)
    { id: 'Rachel', name: 'Rachel (여성, 차분)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Rachel_ko.mp3' },
    { id: 'Sarah', name: 'Sarah (여성, 부드러움)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Sarah_ko.mp3' },
    { id: 'Aria', name: 'Aria (여성, 표준)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Aria_ko.mp3' },
    { id: 'Charlotte', name: 'Charlotte (여성, 뉴스)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Charlotte_ko.mp3' },
    { id: 'Laura', name: 'Laura (여성, 밝음)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Laura_ko.mp3' },
    { id: 'Lily', name: 'Lily (여성, 내레이션)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Lily_ko.mp3' },
    { id: 'Alice', name: 'Alice (여성, 또렷)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Alice_ko.mp3' },
    { id: 'Matilda', name: 'Matilda (여성, 따뜻)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Matilda_ko.mp3' },
    { id: 'Jessica', name: 'Jessica (여성, 밝음/유쾌)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Jessica_ko.mp3' },
    { id: 'Roger', name: 'Roger (남성, 안정)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Roger_ko.mp3' },
    { id: 'George', name: 'George (남성, 따뜻)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/George_ko.mp3' },
    { id: 'Charlie', name: 'Charlie (남성, 캐주얼)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Charlie_ko.mp3' },
    { id: 'Callum', name: 'Callum (남성, 허스키)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Callum_ko.mp3' },
    { id: 'Liam', name: 'Liam (남성, 에너지)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Liam_ko.mp3' },
    { id: 'Will', name: 'Will (남성, 젊음)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Will_ko.mp3' },
    { id: 'Eric', name: 'Eric (남성, 친근)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Eric_ko.mp3' },
    { id: 'Chris', name: 'Chris (남성, 매력적)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Chris_ko.mp3' },
    { id: 'Brian', name: 'Brian (남성, 깊음/편안)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Brian_ko.mp3' },
    { id: 'Daniel', name: 'Daniel (남성, 영국식)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Daniel_ko.mp3' },
    { id: 'River', name: 'River (중성, 내추럴)', language: 'ko', gender: 'neutral', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/River_ko.mp3' },
    { id: 'Bill', name: 'Bill (남성, 성숙)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/Bill_ko.mp3' },
    // 커뮤니티 인기 음성 (ID로 접근)
    { id: 'BIvP0GN1cAtSRTxNHnWS', name: 'Ellen (여성, 진지/자신감)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/BIvP0GN1cAtSRTxNHnWS_ko.mp3' },
    { id: 'aMSt68OGf4xUZAnLpTU8', name: 'Juniper (여성, 전문적)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/aMSt68OGf4xUZAnLpTU8_ko.mp3' },
    { id: 'RILOU7YmBhvwJGDGjNmP', name: 'Jane (여성, 오디오북)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/RILOU7YmBhvwJGDGjNmP_ko.mp3' },
    { id: 'tnSpp4vdxKPjI9w0GnoV', name: 'Hope (여성, 밝음/명확)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/tnSpp4vdxKPjI9w0GnoV_ko.mp3' },
    { id: 'NNl6r8mD7vthiJatiJt1', name: 'Bradford (남성, 표현력)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/NNl6r8mD7vthiJatiJt1_ko.mp3' },
    { id: 'KoQQbl9zjAdLgKZjm8Ol', name: 'Pro Narrator (남성, 스토리텔링)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/KoQQbl9zjAdLgKZjm8Ol_ko.mp3' },
    { id: 'DGTOOUoGpoP6UZ9uSWfA', name: 'Celian (남성, 다큐 내레이터)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/DGTOOUoGpoP6UZ9uSWfA_ko.mp3' },
    { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella (여성, 프로/따뜻)', language: 'ko', gender: 'female', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/hpp4J3VqNfWAUOO0d1Us_ko.mp3' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (남성, 강인/단호)', language: 'ko', gender: 'male', engine: 'elevenlabs', preview: '/audio/samples/elevenlabs/pNInz6obpgDQGcFmaJgB_ko.mp3' },
];
*/

/**
 * Supertonic 2 음성 목록 (브라우저 로컬 실행)
 * Supertone 사의 오픈소스 TTS 모델 — ONNX 런타임 기반
 * 모든 음성이 한/영/프/스/포 5개 언어를 지원 (언어 필터 불필요)
 */
const SUPERTONIC_VOICES: VoiceOption[] = [
    // Female (F1~F5)
    { id: 'F1', name: '수아', language: 'ko', gender: 'female', engine: 'supertonic', description: '차분하고 안정적인 낮은 톤' },
    { id: 'F2', name: '하늘', language: 'ko', gender: 'female', engine: 'supertonic', description: '밝고 쾌활한 발랄한 목소리' },
    { id: 'F3', name: '서연', language: 'ko', gender: 'female', engine: 'supertonic', description: '프로 아나운서, 또렷한 발음' },
    { id: 'F4', name: '지현', language: 'ko', gender: 'female', engine: 'supertonic', description: '또렷하고 자신감 있는 표현력' },
    { id: 'F5', name: '은서', language: 'ko', gender: 'female', engine: 'supertonic', description: '다정하고 부드러운 치유 목소리' },
    // Male (M1~M5)
    { id: 'M1', name: '준서', language: 'ko', gender: 'male', engine: 'supertonic', description: '활기차고 자신감 넘치는 에너지' },
    { id: 'M2', name: '민호', language: 'ko', gender: 'male', engine: 'supertonic', description: '깊고 묵직한 진지하고 차분한' },
    { id: 'M3', name: '현우', language: 'ko', gender: 'male', engine: 'supertonic', description: '세련된 권위감, 신뢰를 주는' },
    { id: 'M4', name: '지훈', language: 'ko', gender: 'male', engine: 'supertonic', description: '부드럽고 중립적, 친근한 톤' },
    { id: 'M5', name: '도윤', language: 'ko', gender: 'male', engine: 'supertonic', description: '따뜻하고 차분한 내레이션' },
];

// === TTS GENERATION FUNCTIONS ===

/**
 * ElevenLabs Multilingual v2 TTS 생성 (Kie API 경유)
 * 세계 최고 수준의 AI 음성 합성 — 29개 언어 자동 감지
 * Kie API의 elevenlabs/text-to-speech-multilingual-v2 모델 사용
 *
 * @param text 텍스트 (최대 5000자)
 * @param voiceId 음성 이름 또는 ID (예: "Sarah", "BIvP0GN1cAtSRTxNHnWS")
 * @param speed 속도 0.7~1.2 (기본 1.0)
 * @param stability 안정성 0~1 (기본 0.5, 낮을수록 감정적)
 * @param similarityBoost 유사도 0~1 (기본 0.75)
 * @param style 스타일 강조 0~1 (기본 0, 높을수록 표현력 증가. 0 권장)
 * @param useSpeakerBoost 스피커 부스트 (기본 true, 음성 선명도 향상)
 */
/* [ElevenLabs 비활성화] generateElevenLabsTTS 함수 — 복원 시 주석 해제
export const generateElevenLabsTTS = async (
    text: string,
    voiceId: string,
    speed: number = 1.0,
    stability: number = 0.5,
    similarityBoost: number = 0.75,
    style: number = 0,
    useSpeakerBoost: boolean = true
): Promise<TTSResult> => {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');
    if (!text.trim()) throw new Error('TTS 텍스트가 비어있습니다.');

    // 5000자 초과 시 자동 청킹 → 개별 생성 → 오디오 병합
    if (text.length > TTS_MAX_CHUNK_CHARS) {
        const chunks = splitTextForTTS(text, TTS_MAX_CHUNK_CHARS);
        logger.info('[TTS] ElevenLabs 자동 청킹', { totalLength: text.length, chunkCount: chunks.length });

        const audioUrls: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            logger.info(`[TTS] 청크 ${i + 1}/${chunks.length} 생성 중 (${chunks[i].length}자)`);
            const chunkResult = await generateElevenLabsSingleChunk(
                chunks[i], voiceId, speed, stability, similarityBoost, style, useSpeakerBoost, apiKey
            );
            audioUrls.push(chunkResult.audioUrl);
        }

        if (audioUrls.length === 1) return { audioUrl: audioUrls[0], format: 'mp3' };
        const mergedUrl = await mergeAudioFiles(audioUrls);
        logger.success('[TTS] ElevenLabs 청크 병합 완료', { chunks: chunks.length });
        return { audioUrl: mergedUrl, format: 'wav' };
    }

    return generateElevenLabsSingleChunk(text, voiceId, speed, stability, similarityBoost, style, useSpeakerBoost, apiKey);
};
*/

/* [ElevenLabs 비활성화] generateElevenLabsSingleChunk 함수 — 복원 시 주석 해제
const generateElevenLabsSingleChunk = async (
    text: string,
    voiceId: string,
    speed: number,
    stability: number,
    similarityBoost: number,
    style: number,
    useSpeakerBoost: boolean,
    apiKey: string
): Promise<TTSResult> => {
    const clampedSpeed = Math.max(0.7, Math.min(1.2, speed));

    logger.info('[TTS] ElevenLabs 생성 요청 (Kie 경유)', { voiceId, textLength: text.length, speed: clampedSpeed });

    const response = await monitoredFetch(`${KIE_BASE_URL}/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'elevenlabs/text-to-speech-multilingual-v2',
            input: {
                text,
                voice: voiceId,
                stability,
                similarity_boost: similarityBoost,
                style: Math.max(0, Math.min(1, style)),
                use_speaker_boost: useSpeakerBoost,
                speed: clampedSpeed,
                timestamps: false,
                previous_text: '',
                next_text: '',
                language_code: ''
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 402) throw new Error('Kie 잔액 부족: 크레딧을 충전해주세요.');
        if (response.status === 429) throw new Error('Kie 요청 제한 초과: 잠시 후 다시 시도해주세요.');
        throw new Error(`ElevenLabs TTS 생성 오류 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const taskId = data.data?.taskId;
    if (!taskId) throw new Error('ElevenLabs TTS 태스크 ID를 받지 못했습니다.');

    const audioUrl = await pollKieTtsTask(taskId, apiKey);

    logger.success('[TTS] ElevenLabs 생성 완료 (Kie 경유)', { voiceId });
    return { audioUrl, format: 'mp3' };
};
*/

/** 컴패니언 음성 목록 캐시 */
let _companionVoicesCache: CompanionVoiceInfo[] | null = null;
let _companionVoicesCacheTime = 0;

export interface CompanionVoiceInfo {
    id: string;
    name: string;
    language: string;
    gender: string;
    engine: 'edge' | 'cosyvoice';
}

/**
 * 컴패니언 TTS 음성 목록 가져오기
 */
export async function getCompanionTTSVoices(): Promise<{ edge: CompanionVoiceInfo[]; cosyvoice_available: boolean }> {
    // [FIX #914] isCompanionDetected() 게이트 제거 — health check 느리면 false인데 컴패니언은 살아있을 수 있음
    // try/catch가 실패 시 빈 배열 반환하므로 안전

    // 5분 캐시
    if (_companionVoicesCache && (Date.now() - _companionVoicesCacheTime) < 300_000) {
        const edge = _companionVoicesCache.filter(v => v.engine === 'edge');
        return { edge, cosyvoice_available: false };
    }

    try {
        const res = await fetch(`${COMPANION_URL}/api/tts/voices`, {
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return { edge: [], cosyvoice_available: false };
        const data = await res.json();
        const edge = (data.edge || []) as CompanionVoiceInfo[];
        _companionVoicesCache = [...edge];
        _companionVoicesCacheTime = Date.now();
        return { edge, cosyvoice_available: data.cosyvoice_available || false };
    } catch {
        return { edge: [], cosyvoice_available: false };
    }
}

/**
 * 컴패니언 TTS로 로컬 음성 합성 시도 (Qwen3/Kokoro 자동 선택)
 * @param engine "qwen3" | "kokoro" | "auto" — auto면 한국어→Qwen3, 나머지→Kokoro
 * @param voice 음성 ID (Sohee, af_heart 등)
 * @returns null이면 Supertonic 폴백 필요
 */
async function tryCompanionTTS(
    text: string,
    language: TTSLanguage = 'ko',
    engine: string = 'auto',
    voice?: string,
): Promise<TTSResult | null> {
    // [FIX #914] isCompanionDetected() 게이트 제거
    // health check가 느려서 false여도 컴패니언 TTS 엔드포인트는 정상 작동할 수 있음
    // connection refused면 catch에서 즉시 null 반환 (< 100ms)

    try {
        const engineLabel = engine === 'qwen3' ? 'Qwen3' : engine === 'kokoro' ? 'Kokoro' : '자동';
        logger.info(`[TTS] 컴패니언 ${engineLabel} TTS 시도`, { language, textLength: text.length, voice });

        const res = await fetch(`${COMPANION_URL}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, language, engine, voice }),
            signal: AbortSignal.timeout(120_000), // Qwen3는 모델 로딩에 시간 필요
        });

        if (!res.ok) return null;

        const wavBlob = await res.blob();
        if (wavBlob.size < 100) return null;

        const audioUrl = URL.createObjectURL(wavBlob);
        // WAV 헤더에서 duration 추출 (44바이트 이후 PCM 데이터)
        const buffer = await wavBlob.arrayBuffer();
        const view = new DataView(buffer);
        const sampleRate = view.getUint32(24, true);
        const bitsPerSample = view.getUint16(34, true);
        const channels = view.getUint16(22, true);
        const dataSize = buffer.byteLength - 44;
        const duration = dataSize / (sampleRate * (bitsPerSample / 8) * channels);

        logger.success(`[TTS] 컴패니언 ${engineLabel} TTS 성공`, { duration: duration.toFixed(1) + 's', voice });
        return { audioUrl, duration, format: 'wav' };
    } catch (e) {
        logger.warn('[TTS] 컴패니언 TTS 실패 — 폴백:', e instanceof Error ? e.message : '');
        return null;
    }
}

/**
 * Edge TTS 생성 (컴패니언 경유 — Microsoft Neural TTS, 무료)
 * 한/영/일/중 등 다국어 고품질 음성
 */
export const generateEdgeTTS = async (
    text: string,
    voiceId: string,
    language: TTSLanguage = 'ko',
): Promise<TTSResult> => {
    const cleanText = stripSpeakerTags(text);
    if (!cleanText.trim()) throw new Error('TTS 텍스트가 비어있습니다.');

    const result = await tryCompanionTTS(cleanText, language, 'edge', voiceId);
    if (result) return result;

    throw new Error('Edge TTS 생성 실패 — 컴패니언 앱이 실행 중인지 확인하세요.');
};

// 하위 호환: generateQwen3TTS → generateEdgeTTS 리다이렉트
export const generateQwen3TTS = generateEdgeTTS;
export const generateKokoroTTS = generateEdgeTTS;

// ──────────────────────────────────────────────
// Voice Cloning API (CosyVoice zero-shot)
// ──────────────────────────────────────────────

export interface CustomVoice {
    id: string;
    name: string;
    engine: 'qwen3-clone';
    language: string;
    gender: string;
    filePath?: string;
    fileSize?: number;
}

/** 저장된 커스텀 음성 목록 가져오기 */
export async function getCustomVoices(): Promise<CustomVoice[]> {
    try {
        const res = await fetch(`${COMPANION_URL}/api/tts/voices/custom`, {
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.voices || []) as CustomVoice[];
    } catch {
        return [];
    }
}

/** 참조 음성 저장 (녹음/업로드된 WAV → 컴패니언에 저장) */
export async function saveCustomVoice(name: string, audioBlob: Blob): Promise<{ voiceId: string; name: string }> {
    const buffer = await audioBlob.arrayBuffer();
    // 대용량 안전: spread 대신 청크 방식 base64 인코딩
    const bytes = new Uint8Array(buffer);
    const chunks: string[] = [];
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(chunks.join(''));

    const res = await fetch(`${COMPANION_URL}/api/tts/voices/custom/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, audio: base64 }),
        signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'unknown' }));
        throw new Error(err.error || '음성 저장 실패');
    }
    return res.json();
}

/** 커스텀 음성 삭제 */
export async function deleteCustomVoice(voiceId: string): Promise<void> {
    await fetch(`${COMPANION_URL}/api/tts/voices/custom/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId }),
        signal: AbortSignal.timeout(5_000),
    });
}

/** Voice Cloning TTS — 커스텀 음성으로 음성 합성 */
export const generateCloneTTS = async (
    text: string,
    voiceId: string,
    language: TTSLanguage = 'ko',
): Promise<TTSResult> => {
    const cleanText = stripSpeakerTags(text);
    if (!cleanText.trim()) throw new Error('TTS 텍스트가 비어있습니다.');

    try {
        logger.info('[TTS] Voice Clone 시도', { voiceId, language, textLength: cleanText.length });

        const res = await fetch(`${COMPANION_URL}/api/tts/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText, language, voiceId }),
            signal: AbortSignal.timeout(180_000), // CustomVoice 모델 로딩 시간 고려
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'unknown' }));
            throw new Error(err.error || 'Voice Clone 생성 실패');
        }

        const wavBlob = await res.blob();
        if (wavBlob.size < 100) throw new Error('Voice Clone 출력이 비어있습니다.');

        const audioUrl = URL.createObjectURL(wavBlob);
        const buffer = await wavBlob.arrayBuffer();
        const view = new DataView(buffer);
        const sampleRate = view.getUint32(24, true);
        const bitsPerSample = view.getUint16(34, true);
        const channels = view.getUint16(22, true);
        const dataSize = buffer.byteLength - 44;
        const duration = dataSize / (sampleRate * (bitsPerSample / 8) * channels);

        logger.success('[TTS] Voice Clone 성공', { duration: duration.toFixed(1) + 's', voiceId });
        return { audioUrl, duration, format: 'wav' };
    } catch (e) {
        throw new Error(`Voice Clone 실패: ${e instanceof Error ? e.message : 'unknown'}`);
    }
};

/**
 * Supertonic 2 TTS 생성 (브라우저 로컬)
 * ONNX 런타임 기반 — API 키 불필요, 네트워크 비용 없음
 * [v4.8] 컴패니언 Kokoro TTS 우선 → Supertonic 폴백
 */
export const generateSupertonicTTS = async (
    text: string,
    voiceId: string,
    language: TTSLanguage = 'ko',
    speed: number = 1.0
): Promise<TTSResult> => {
    // [FIX #228] 화자/모드 태그 제거 후 TTS 생성
    const cleanText = stripSpeakerTags(text);
    if (!cleanText.trim()) throw new Error('TTS 텍스트가 비어있습니다.');

    // 1순위: 컴패니언 TTS — 한국어→Qwen3 우선, 나머지→Kokoro 우선 (자동 선택)
    const companionResult = await tryCompanionTTS(cleanText, language, 'auto');
    if (companionResult) return companionResult;

    // 2순위: Supertonic 2 (브라우저 ONNX)
    logger.info('[TTS] Supertonic 2 생성 요청 (로컬)', { voiceId, language, textLength: cleanText.length, speed });

    // Supertonic 2는 한/영/프/스/포 5개 언어 지원. 일본어 미지원 → 한국어로 폴백 (영어보다 발음 체계가 유사)
    const langMap: Record<TTSLanguage, string> = {
        'ko': 'ko',
        'en': 'en',
        'ja': 'ko',
        'zh': 'en',
        'es': 'en',
        'fr': 'en',
        'de': 'en',
        'hi': 'en',
        'it': 'en',
        'pt': 'en',
        'ru': 'en',
    };

    const result = await generateSupertonicSpeech(cleanText, langMap[language] || 'ko', voiceId, speed);

    logger.success('[TTS] Supertonic 2 생성 완료 (로컬)', { voiceId });
    return { audioUrl: result.audioUrl, format: result.format as 'wav' };
};

// === POLLING ===

/**
 * Kie TTS 태스크 폴링
 * 표준 Kie 폴링 패턴 사용 (recordInfo 엔드포인트)
 */
const pollKieTtsTask = async (taskId: string, apiKey: string, maxAttempts: number = 60): Promise<string> => {
    logger.info('[TTS] 폴링 시작', { taskId });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // 대기: 초기 2초, 이후 3초
        const delay = attempt < 5 ? 2000 : 3000;
        await new Promise(resolve => setTimeout(resolve, delay));

        const response = await monitoredFetch(
            `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
            {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            }
        );

        if (!response.ok) {
            if (response.status === 429) {
                // [FIX #245] Retry-After 헤더 우선, 없으면 지수 백오프
                const retryAfter = response.headers.get('Retry-After');
                const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000 || 5000, 60000) : Math.min(2000 * Math.pow(2, Math.min(attempt, 5)), 30000);
                logger.trackRetry('TTS 폴링 (429)', attempt + 1, maxAttempts, `Rate limited, ${Math.round(waitMs)}ms 대기`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }
            throw new Error(`TTS 폴링 오류 (${response.status})`);
        }

        const data = await response.json();
        const state = data.data?.state;

        if (state === 'success') {
            // 결과 URL 추출 (다양한 응답 형식 지원)
            const resultJson = data.data?.resultJson;
            let audioUrl: string | undefined;

            if (typeof resultJson === 'string') {
                try {
                    const parsed = JSON.parse(resultJson);
                    audioUrl = parsed.resultUrls?.[0] || parsed.audio_url || parsed.url;
                } catch (e) {
                    logger.trackSwallowedError('ttsService:parseResultJson', e);
                    audioUrl = resultJson;
                }
            } else if (resultJson) {
                audioUrl = resultJson.resultUrls?.[0] || resultJson.audio_url || resultJson.url;
            }

            if (!audioUrl) throw new Error('TTS 결과에서 오디오 URL을 찾을 수 없습니다.');

            logger.success('[TTS] 폴링 완료', { taskId, attempt });
            return audioUrl;
        }

        if (state === 'fail') {
            const failMsg = data.data?.failMsg || '알 수 없는 오류';
            throw new Error(`TTS 생성 실패: ${failMsg}`);
        }

        // waiting, queuing, generating → 계속 폴링
    }

    throw new Error(`TTS 생성 시간 초과 (${maxAttempts}회 폴링 실패)`);
};

// === VOICE LIST ===

/**
 * 엔진+언어별 사용 가능한 음성 목록 반환
 */
export const getAvailableVoices = (
    engine: TTSEngine,
    language?: TTSLanguage
): VoiceOption[] => {
    let voices: VoiceOption[];

    switch (engine) {
        /* [Microsoft Edge TTS 비활성화] — ElevenLabs Dialogue V3로 대체됨
        case 'microsoft':
            voices = getSystemMicrosoftVoices();
            break;
        */
        case 'elevenlabs':
            // ElevenLabs 음성 목록은 elevenlabsService.ts에서 관리
            // VoiceStudio에서 직접 ELEVENLABS_VOICES를 사용
            voices = [];
            break;
        case 'supertonic':
            voices = SUPERTONIC_VOICES;
            break;
        // Edge TTS 음성 — companion tts.rs EDGE_VOICES와 동기화
        case 'edge' as TTSEngine:
            voices = [
                // 한국어 (3)
                { id: 'ko-KR-SunHiNeural', name: '선희 (한국어 여성)', language: 'ko' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'ko-KR-InJoonNeural', name: '인준 (한국어 남성)', language: 'ko' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                { id: 'ko-KR-HyunsuMultilingualNeural', name: '현수 (한국어 다국어)', language: 'ko' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                // 영어 (6)
                { id: 'en-US-JennyNeural', name: 'Jenny (US)', language: 'en' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'en-US-AriaNeural', name: 'Aria (US)', language: 'en' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'en-US-GuyNeural', name: 'Guy (US)', language: 'en' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                { id: 'en-US-AndrewMultilingualNeural', name: 'Andrew (US 다국어)', language: 'en' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                { id: 'en-GB-SoniaNeural', name: 'Sonia (UK)', language: 'en' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'en-GB-RyanNeural', name: 'Ryan (UK)', language: 'en' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                // 일본어 (3)
                { id: 'ja-JP-NanamiNeural', name: '七海 (日本語 女性)', language: 'ja' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'ja-JP-KeitaNeural', name: '圭太 (日本語 男性)', language: 'ja' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                { id: 'ja-JP-MasaruMultilingualNeural', name: '勝 (日本語 다국어)', language: 'ja' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                // 중국어 (4)
                { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (中文 女性)', language: 'zh' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'zh-CN-YunxiNeural', name: '云希 (中文 男性)', language: 'zh' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                { id: 'zh-CN-XiaoyiNeural', name: '晓依 (中文 女性)', language: 'zh' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'zh-CN-YunjianNeural', name: '云健 (中文 男性)', language: 'zh' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                // 스페인어 (2)
                { id: 'es-ES-ElviraNeural', name: 'Elvira (ES)', language: 'es' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'es-MX-DaliaNeural', name: 'Dalia (MX)', language: 'es' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                // 프랑스어 (2)
                { id: 'fr-FR-DeniseNeural', name: 'Denise (FR)', language: 'fr' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'fr-FR-HenriNeural', name: 'Henri (FR)', language: 'fr' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
                // 독일어 (2)
                { id: 'de-DE-KatjaNeural', name: 'Katja (DE)', language: 'de' as TTSLanguage, gender: 'female' as const, engine: 'edge' as TTSEngine },
                { id: 'de-DE-ConradNeural', name: 'Conrad (DE)', language: 'de' as TTSLanguage, gender: 'male' as const, engine: 'edge' as TTSEngine },
            ];
            break;
        default:
            voices = [];
    }

    // Supertonic/Edge는 다국어 지원이므로 언어 필터 미적용
    if (language && engine !== 'supertonic' && engine !== ('edge' as TTSEngine)) {
        voices = voices.filter(v => v.language === language);
    }

    return voices;
};

// === AUDIO MERGE ===

/**
 * 개별 AudioBuffer의 RMS를 측정하여 타겟 RMS로 정규화 (게인 적용)
 * [FIX #194] 클립 간 음량 편차 제거 — 병합 전 각 클립을 동일 라우드니스로 맞춤
 * @param buffer 정규화할 AudioBuffer (in-place 수정)
 * @param targetRmsDb 타겟 RMS (dB), 기본 -16dB (나레이션 — [FIX #314] -20→-16 볼륨 업)
 * @param peakLimitDb 피크 리미터 (dBFS), 기본 -1dB (클리핑 방지)
 */
export const normalizeBufferRms = (buffer: AudioBuffer, targetRmsDb: number = -16, peakLimitDb: number = -1): void => {
    // Pass 1: RMS 측정
    let sumSquares = 0;
    let sampleCount = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
            sumSquares += data[i] * data[i];
            sampleCount++;
        }
    }
    const rms = Math.sqrt(sumSquares / sampleCount);
    // 무음 클립은 정규화 생략
    if (rms < 1e-6) return;

    const currentRmsDb = 20 * Math.log10(rms);
    const gainDb = targetRmsDb - currentRmsDb;
    let gainLinear = Math.pow(10, gainDb / 20);

    // Pass 2: 피크 리미터 — 게인 적용 후 피크가 리미트를 초과하면 게인 축소
    let maxPeak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
            const abs = Math.abs(data[i]) * gainLinear;
            if (abs > maxPeak) maxPeak = abs;
        }
    }
    const peakLimit = Math.pow(10, peakLimitDb / 20);
    if (maxPeak > peakLimit) {
        gainLinear *= peakLimit / maxPeak;
    }

    // Pass 3: 게인 적용
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
            data[i] *= gainLinear;
        }
    }

    logger.info('[TTS] 클립 정규화', {
        currentRmsDb: currentRmsDb.toFixed(1),
        targetRmsDb,
        gainDb: gainDb.toFixed(1),
        peakAfter: (maxPeak > peakLimit ? peakLimit : maxPeak).toFixed(3),
    });
};

/**
 * [FIX #918] 개별 오디오 클립의 음량을 RMS 정규화하여 일정한 볼륨으로 반환
 * 멀티 캐릭터 사용 시 캐릭터별 음량 편차를 제거합니다.
 * @param audioUrl 정규화할 오디오 Blob URL
 * @returns 정규화된 오디오 Blob URL (WAV)
 */
export const normalizeAudioUrl = async (audioUrl: string): Promise<string> => {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
        // [FIX #920] 20초 타임아웃 추가 — tempfile CDN 장애 시 교착 방지
        const resp = await monitoredFetch(audioUrl, { signal: AbortSignal.timeout(20_000) });
        const buf = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);

        // RMS 정규화 전후 차이가 미미하면 정규화 스킵 (1dB 이내)
        let sumSq = 0; let cnt = 0;
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
            const d = decoded.getChannelData(ch);
            for (let i = 0; i < d.length; i++) { sumSq += d[i] * d[i]; cnt++; }
        }
        const rms = Math.sqrt(sumSq / cnt);
        const needsNormalize = rms >= 1e-6 && Math.abs(20 * Math.log10(rms) - (-16)) >= 1.0;

        // [FIX #965] 48kHz가 아닌 경우 정규화 불필요해도 리샘플링은 수행 (Premiere 호환)
        const needsResample = decoded.sampleRate !== 48000;

        if (!needsNormalize && !needsResample) return audioUrl; // 이미 완벽

        if (needsNormalize) normalizeBufferRms(decoded);
        // [FIX #965] 48kHz로 리샘플링하여 Premiere 호환 보장
        const wavBlob = audioBufferToWav(decoded, 48000);
        const normalizedUrl = URL.createObjectURL(wavBlob);
        logger.registerBlobUrl(normalizedUrl, 'audio', 'ttsService:normalizeAudioUrl');
        // 원본 blob URL 해제
        if (audioUrl.startsWith('blob:')) {
            logger.unregisterBlobUrl(audioUrl);
            URL.revokeObjectURL(audioUrl);
        }
        return normalizedUrl;
    } finally {
        ctx.close();
    }
};

/**
 * Web Audio API를 사용하여 여러 오디오 파일을 하나로 병합
 * [FIX #194] 병합 전 각 클립의 음량을 RMS 정규화하여 들쑥날쑥한 음량 해소
 * @param audioUrls 병합할 오디오 URL 배열 (순서대로 이어붙임)
 * @returns 병합된 오디오 Blob URL
 */
export const mergeAudioFiles = async (audioUrls: string[]): Promise<string> => {
    if (audioUrls.length === 0) throw new Error('병합할 오디오 파일이 없습니다.');
    if (audioUrls.length === 1) return audioUrls[0];

    logger.info('[TTS] 오디오 병합 시작', { fileCount: audioUrls.length });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioCtx();

    try {
        // 모든 오디오 파일 다운로드 및 디코딩
        const buffers: AudioBuffer[] = [];

        for (const url of audioUrls) {
            try {
                // [FIX #920] 20초 타임아웃 — CDN 장애 시 병합 교착 방지
                const response = await monitoredFetch(url, { signal: AbortSignal.timeout(20_000) });
                if (!response.ok) {
                    logger.trackErrorChain(`HTTP ${response.status} fetching audio file`, 'ttsService:mergeAudioFiles:file_fetch_failed');
                    logger.warn('[TTS] 오디오 파일 다운로드 실패, 건너뜀', { url });
                    continue;
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                buffers.push(audioBuffer);
            } catch (fetchErr) {
                logger.warn('[TTS] 오디오 파일 페치 실패, 건너뜀', { url, error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) });
            }
        }

        if (buffers.length === 0) throw new Error('디코딩된 오디오 버퍼가 없습니다.');

        // [FIX #194] 병합 전 각 클립 음량 정규화 — 클립 간 음량 편차 제거
        for (const buffer of buffers) {
            normalizeBufferRms(buffer);
        }

        // [FIX #965] 48kHz로 통일하여 Premiere Pro 호환 보장
        const targetRate = 48000;
        // 리샘플링이 필요한 버퍼는 길이를 보정
        const resampledLengths = buffers.map(buf =>
            buf.sampleRate === targetRate ? buf.length : Math.round(buf.length * targetRate / buf.sampleRate)
        );
        const totalLength = resampledLengths.reduce((sum, len) => sum + len, 0);
        const sampleRate = targetRate;
        const numberOfChannels = Math.max(...buffers.map(b => b.numberOfChannels));

        // 병합 버퍼 생성
        const mergedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

        let offset = 0;
        for (let bi = 0; bi < buffers.length; bi++) {
            const buffer = buffers[bi];
            const srcRate = buffer.sampleRate;
            const outLen = resampledLengths[bi];
            const needsResample = srcRate !== targetRate;

            for (let channel = 0; channel < numberOfChannels; channel++) {
                const channelData = mergedBuffer.getChannelData(channel);
                const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1);
                const srcData = buffer.getChannelData(sourceChannel);

                if (needsResample) {
                    // [FIX #965] 선형 보간 리샘플링
                    const ratio = srcRate / targetRate;
                    for (let i = 0; i < outLen; i++) {
                        const srcIdx = i * ratio;
                        const idx0 = Math.floor(srcIdx);
                        const idx1 = Math.min(idx0 + 1, buffer.length - 1);
                        const frac = srcIdx - idx0;
                        channelData[offset + i] = srcData[idx0] + (srcData[idx1] - srcData[idx0]) * frac;
                    }
                } else {
                    channelData.set(srcData, offset);
                }
            }
            offset += outLen;
        }

        // WAV 인코딩
        const wavBlob = audioBufferToWav(mergedBuffer);
        const mergedUrl = URL.createObjectURL(wavBlob);
        logger.registerBlobUrl(mergedUrl, 'audio', 'ttsService:mergeAudioFiles');

        logger.success('[TTS] 오디오 병합 완료 (클립 정규화 적용)', {
            fileCount: buffers.length,
            totalDuration: `${(totalLength / sampleRate).toFixed(1)}초`
        });

        return mergedUrl;
    } finally {
        await audioContext.close();
    }
};

/**
 * AudioBuffer → WAV Blob 변환
 * [FIX #965] Premiere Pro 호환: 48kHz PCM 16-bit WAV 생성
 * Premiere는 비표준 sample rate WAV를 인식 못 하는 경우가 있으므로
 * 48000Hz가 아닌 경우 자동으로 리샘플링
 */
export const audioBufferToWav = (buffer: AudioBuffer, targetSampleRate?: number): Blob => {
    const numChannels = buffer.numberOfChannels;
    const srcRate = buffer.sampleRate;
    const outRate = targetSampleRate || srcRate;
    const format = 1; // PCM
    const bitDepth = 16;

    // 리샘플링이 필요한 경우 선형 보간으로 변환
    const needsResample = outRate !== srcRate;
    const outLength = needsResample
        ? Math.round(buffer.length * outRate / srcRate)
        : buffer.length;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = outLength * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // WAV 헤더 작성
    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, outRate, true);
    view.setUint32(28, outRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // 인터리빙된 PCM 데이터
    let offset = headerLength;
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(buffer.getChannelData(ch));
    }

    if (needsResample) {
        // 선형 보간 리샘플링
        const ratio = srcRate / outRate;
        for (let i = 0; i < outLength; i++) {
            const srcIdx = i * ratio;
            const idx0 = Math.floor(srcIdx);
            const idx1 = Math.min(idx0 + 1, buffer.length - 1);
            const frac = srcIdx - idx0;
            for (let ch = 0; ch < numChannels; ch++) {
                const s0 = channels[ch][idx0];
                const s1 = channels[ch][idx1];
                const sample = Math.max(-1, Math.min(1, s0 + (s1 - s0) * frac));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }
    } else {
        for (let i = 0; i < buffer.length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channels[ch][i]));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
};

/**
 * [FIX #965] 오디오 Blob URL → Premiere Pro 호환 WAV Blob URL 변환
 *
 * Premiere Pro는 엄격한 WAV 포맷을 요구:
 *  - RIFF 헤더 + PCM 16-bit
 *  - 48000Hz sample rate (업계 표준)
 *  - 정확한 data chunk 크기
 *
 * 이 함수는 어떤 형식의 오디오든 (MP3, WebM, OGG, 비표준 WAV 등)
 * 48kHz/16-bit PCM WAV로 정규 변환하여 Premiere 호환성을 보장함
 */
export const ensurePremiereCompatibleWav = async (audioUrl: string): Promise<Blob> => {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 48000 });
    try {
        const resp = await fetch(audioUrl);
        const buf = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        // 48kHz로 강제 리샘플링하여 WAV 생성
        return audioBufferToWav(decoded, 48000);
    } finally {
        ctx.close();
    }
};

/**
 * 오디오를 지정 시간(초) 기준으로 두 개의 WAV blob URL로 분할
 * 자막 분리 시 나레이션 오디오 싱크를 위해 사용
 */
export const splitAudioAtTime = async (
  audioUrl: string,
  splitTimeSeconds: number,
): Promise<[string, string] | null> => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const splitSample = Math.min(
      Math.max(0, Math.round(splitTimeSeconds * sampleRate)),
      audioBuffer.length,
    );

    if (splitSample <= 0 || splitSample >= audioBuffer.length) {
      ctx.close();
      return null;
    }

    // 앞쪽 오디오
    const buf1 = ctx.createBuffer(numChannels, splitSample, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      buf1.getChannelData(ch).set(audioBuffer.getChannelData(ch).subarray(0, splitSample));
    }

    // 뒤쪽 오디오
    const remainingSamples = audioBuffer.length - splitSample;
    const buf2 = ctx.createBuffer(numChannels, remainingSamples, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      buf2.getChannelData(ch).set(audioBuffer.getChannelData(ch).subarray(splitSample));
    }

    // [FIX #965] 48kHz로 리샘플링하여 일관된 포맷 유지
    const blob1 = audioBufferToWav(buf1, 48000);
    const blob2 = audioBufferToWav(buf2, 48000);
    ctx.close();

    const url1 = URL.createObjectURL(blob1);
    logger.registerBlobUrl(url1, 'audio', 'ttsService:splitAudioAtTime');
    const url2 = URL.createObjectURL(blob2);
    logger.registerBlobUrl(url2, 'audio', 'ttsService:splitAudioAtTime');
    return [url1, url2];
  } catch (e) {
    logger.trackSwallowedError('ttsService:splitAudioAtTime', e);
    console.warn('[splitAudioAtTime] Failed to split audio:', e);
    return null;
  }
};
