
import { Scene, VideoFormat, CharacterAppearance, DialogueTone, CharacterProfile } from '../../types';
import { DIALOGUE_TONE_PRESETS } from '../../constants';
import { requestGeminiProxy, extractTextFromResponse, SAFETY_SETTINGS_BLOCK_NONE } from './geminiProxy';
import { evolinkChat } from '../evolinkService';
import { logger } from '../LoggerService';

// [NEW] Robust JSON Extraction — handles thinking model markdown output + truncated responses
export const extractJsonFromText = (text: string): string | null => {
    // 1. Already valid JSON
    try { JSON.parse(text); return text; } catch (e) { logger.trackSwallowedError('ScriptAnalysis:extractJsonFromText/direct', e); }
    // 2. Extract from markdown code blocks: ```json ... ``` or ``` ... ```
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try { JSON.parse(codeBlockMatch[1].trim()); return codeBlockMatch[1].trim(); } catch (e) { logger.trackSwallowedError('ScriptAnalysis:extractJsonFromText/codeBlock', e); }
    }
    // 3. Find JSON object in text
    const objMatch = text.match(/(\{[\s\S]*\})/);
    if (objMatch) {
        try { JSON.parse(objMatch[1]); return objMatch[1]; } catch (e) { logger.trackSwallowedError('ScriptAnalysis:extractJsonFromText/objMatch', e); }
    }
    // 4. Find JSON array in text
    const arrMatch = text.match(/(\[[\s\S]*\])/);
    if (arrMatch) {
        try { JSON.parse(arrMatch[1]); return arrMatch[1]; } catch (e) { logger.trackSwallowedError('ScriptAnalysis:extractJsonFromText/arrMatch', e); }
    }
    // 5. [FIX #249] Truncated response recovery — unclosed code block or incomplete JSON
    // When finishReason:"length", the response may be cut off without closing ``` or brackets
    const unclosedBlockMatch = text.match(/```(?:json)?\s*([\s\S]+)/);
    const candidate = unclosedBlockMatch ? unclosedBlockMatch[1].trim() : text.trim();
    if (candidate.startsWith('[') || candidate.startsWith('{')) {
        const repaired = repairTruncatedJson(candidate);
        if (repaired) {
            try { JSON.parse(repaired); logger.warn('[extractJsonFromText] 잘린 JSON 복구 성공 (truncated response recovered)'); return repaired; } catch (e) { logger.trackSwallowedError('ScriptAnalysis:extractJsonFromText/truncatedRepair', e); }
        }
    }
    return null;
};

// [FIX #249] Truncated JSON repair — close unclosed brackets/braces to salvage partial data
const repairTruncatedJson = (text: string): string | null => {
    // Remove trailing incomplete key-value pairs (e.g., "key": "unfinis)
    // Find the last complete value boundary: }, ], true, false, null, number, or closed string
    let cleaned = text;
    // Strip trailing comma
    cleaned = cleaned.replace(/,\s*$/, '');
    // If ends mid-string or mid-key, truncate to last complete element
    const lastGoodIdx = Math.max(
        cleaned.lastIndexOf('}'),
        cleaned.lastIndexOf(']'),
        cleaned.lastIndexOf('"'),
        cleaned.lastIndexOf('true'),
        cleaned.lastIndexOf('false'),
        cleaned.lastIndexOf('null')
    );
    if (lastGoodIdx > 0) {
        // Check if we're inside a string — count unescaped quotes
        const beforeLast = cleaned.substring(0, lastGoodIdx + 1);
        const quoteCount = (beforeLast.match(/(?<!\\)"/g) || []).length;
        if (quoteCount % 2 !== 0) {
            // Odd quotes — truncate to close the string
            cleaned = beforeLast + '"';
        } else {
            cleaned = beforeLast;
        }
    }
    // Remove trailing comma again after truncation
    cleaned = cleaned.replace(/,\s*$/, '');
    // Build closing bracket stack
    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (const ch of cleaned) {
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '[') stack.push(']');
        else if (ch === '{') stack.push('}');
        else if (ch === ']' || ch === '}') stack.pop();
    }
    if (stack.length > 0) {
        cleaned += stack.reverse().join('');
    }
    return cleaned.length > 2 ? cleaned : null;
};

// --- Semantic Scene Break Detection ---
// 장면/위치 마커 패턴: INT., EXT., 장면, Scene, CUT TO, FADE 등 영화 대본 형식
const SCENE_MARKER_RE = /^(?:INT\.|EXT\.|INT\/EXT\.|장면\s*\d*|Scene\s*\d*|씬\s*\d*|CUT\s+TO|FADE\s+(?:IN|OUT|TO)|DISSOLVE\s+TO|SMASH\s+CUT)/i;

// 구분선 패턴: ---, ***, ===, ___ (3개 이상 연속)
const SEPARATOR_RE = /^[-*=_]{3,}\s*$/;

// 화자/대사 변화 패턴: "이름:" 또는 "이름 :" 형태 (한/영 모두)
const SPEAKER_RE = /^[\p{L}\p{N}\s]{1,20}\s*[:：]\s/u;

// 시간/장소 전환 마커: [시간], (장소), 【전환】 등 괄호류 마커
const BRACKET_MARKER_RE = /^[\[(\[【「『<〈]\s*[^\])】」』>〉]{1,30}\s*[\])\]】」』>〉]\s*$/;

/**
 * 대본을 의미 단위(semantic segment)로 먼저 분할한다.
 * 각 세그먼트는 자연적 장면 경계(빈 줄, 장면 마커, 구분선, 화자 변화)로 구분되며,
 * 후속 포맷별 분할(문장/절/글자 수 기반)은 세그먼트 내부에서만 수행된다.
 *
 * 반환: 각 원소가 하나의 의미 블록(1+ 줄)인 문자열 배열.
 * 빈 세그먼트는 반환하지 않는다.
 */
const splitIntoSemanticSegments = (script: string): string[] => {
    const rawLines = script.split('\n');
    const segments: string[] = [];
    let currentSegment: string[] = [];

    const flushSegment = () => {
        const text = currentSegment.map(l => l.trim()).filter(l => l).join(' ');
        if (text) segments.push(text);
        currentSegment = [];
    };

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const trimmed = line.trim();

        // 빈 줄: 단락 경계 — 현재 세그먼트 플러시
        if (!trimmed) {
            if (currentSegment.length > 0) flushSegment();
            continue;
        }

        // 구분선(---, ***, ===): 강제 장면 경계
        if (SEPARATOR_RE.test(trimmed)) {
            if (currentSegment.length > 0) flushSegment();
            continue;
        }

        // 장면/위치 마커(INT., EXT., 장면 N 등): 강제 장면 경계
        if (SCENE_MARKER_RE.test(trimmed)) {
            if (currentSegment.length > 0) flushSegment();
            currentSegment.push(trimmed);
            continue;
        }

        // 괄호형 위치/시간 마커 단독 줄: 강제 경계
        if (BRACKET_MARKER_RE.test(trimmed)) {
            if (currentSegment.length > 0) flushSegment();
            currentSegment.push(trimmed);
            continue;
        }

        // 화자 변화 감지
        if (SPEAKER_RE.test(trimmed)) {
            const prevLine = currentSegment.length > 0
                ? currentSegment[currentSegment.length - 1] : '';
            const prevSpeaker = prevLine.match(SPEAKER_RE);
            const currSpeaker = trimmed.match(SPEAKER_RE);
            if (prevSpeaker && currSpeaker
                && prevSpeaker[0] !== currSpeaker[0]) {
                flushSegment();
            } else if (!prevSpeaker && currSpeaker
                && currentSegment.length > 0) {
                flushSegment();
            }
        }

        currentSegment.push(trimmed);
    }

    if (currentSegment.length > 0) flushSegment();
    return segments.length > 0 ? segments : [script.trim()];
};

/**
 * 의미 세그먼트를 문장 단위로 분할하되 세그먼트 경계를 넘지 않는다.
 * segIdx로 원본 세그먼트를 추적하여, 후속 병합 시 경계 존중에 사용.
 */
const flattenSegmentsToSentences = (
    segments: string[],
    sentenceSplitRe: RegExp
): { segIdx: number; text: string }[] => {
    const result: { segIdx: number; text: string }[] = [];
    for (let si = 0; si < segments.length; si++) {
        // [FIX #265] 연속 마침표("...", "!!", "??") 사전 정규화 — 유령 문장 방지
        // "장난..." 같은 한국어 쇼츠 대본 패턴에서 각 "."가 별도 문장으로 분할되는 버그 수정
        const normalized = segments[si]
            .replace(/\.{2,}/g, '…')   // "..." → "…" (유니코드 말줄임표, 분할 대상 아님)
            .replace(/。{2,}/g, '…')   // "。。。" → "…"
            .replace(/!{2,}/g, '!')    // "!!!" → "!"
            .replace(/！{2,}/g, '！')  // "！！！" → "！"
            .replace(/\?{2,}/g, '?')   // "???" → "?"
            .replace(/？{2,}/g, '？'); // "？？？" → "？"
        const sentences = normalized
            .split(sentenceSplitRe).filter(s => s.trim());
        if (sentences.length === 0) {
            result.push({ segIdx: si, text: segments[si] });
        } else {
            for (const s of sentences) {
                // [FIX #265] 분할 후에도 남은 극소 조각(≤2자)은 이전 문장에 병합
                if (s.trim().length <= 2 && result.length > 0 && result[result.length - 1].segIdx === si) {
                    result[result.length - 1].text += s;
                } else {
                    result.push({ segIdx: si, text: s });
                }
            }
        }
    }
    return result;
};

// [IMPROVED] Deterministic Local Scene Count — 의미 단위 경계를 존중하면서 정확한 장면 수 계산
// 장면 마커/단락 경계/화자 변화를 감지하여 자연스러운 장면 분할
export const countScenesLocally = (script: string, format: VideoFormat, smartSplit: boolean, longFormSplitType?: 'DEFAULT' | 'DETAILED'): number => {
    if (!smartSplit) return script.split('\n').filter(l => l.trim()).length;

    // 1단계: 의미 단위(semantic segment)로 분할 — 장면 마커, 단락, 화자 변화 감지
    const segments = splitIntoSemanticSegments(script);
    if (segments.length === 0) return 0;

    // 2단계: 세그먼트 → 문장 평탄화 (세그먼트 경계 추적)
    const SENTENCE_SPLIT = /(?<=[.!?。！？؟।॥။។።՞՜།])\s*/;
    const tagged = flattenSegmentsToSentences(segments, SENTENCE_SPLIT);
    if (tagged.length === 0) return 0;

    switch (format) {
        case VideoFormat.LONG:
            if (longFormSplitType === 'DETAILED') {
                // 1문장 = 1장면, 100자 초과 시 쉼표/절 단위 추가 분할
                let count = 0;
                for (const t of tagged) {
                    count += splitByClause(t.text, 100).length;
                }
                return Math.max(1, count);
            } else {
                // DEFAULT: 2문장 = 1장면, 세그먼트 경계를 넘어 병합하지 않음
                let count = 0, i = 0;
                while (i < tagged.length) {
                    if (
                        i + 1 < tagged.length &&
                        tagged[i].segIdx === tagged[i + 1].segIdx &&
                        (tagged[i].text.length + tagged[i + 1].text.length) <= 150
                    ) {
                        count++;
                        i += 2;
                    } else {
                        count += splitByClause(tagged[i].text, 150).length;
                        i++;
                    }
                }
                return Math.max(1, count);
            }

        case VideoFormat.SHORT:
            // [FIX #265] 숏폼: 80자 타겟 (기존 45→80) — "1문장=1장면" 원칙 강화
            // 45자는 한국어 문장 대부분을 절 단위로 재분할하여 장면 수 폭증 유발
            // 80자로 완화하면 일반 문장은 그대로, 120자+ 복합문만 분할됨
            {
                let count = 0;
                for (const t of tagged) {
                    count += splitKoreanClauses(t.text, 80, 10).length;
                }
                return Math.max(1, count);
            }

        case VideoFormat.NANO:
            // 나노: 16자 타겟 (도파민 자막 스타일), 5자 미만 병합
            {
                let count = 0;
                for (const t of tagged) {
                    count += splitKoreanClauses(t.text, 16, 5).length;
                }
                return Math.max(1, count);
            }

        case VideoFormat.MANUAL:
            return script.split('\n').filter(l => l.trim()).length;

        default:
            return tagged.length;
    }
};

/** 긴 텍스트를 쉼표/절 단위로 maxChars 이내 청크로 분할 */
const splitByClause = (text: string, maxChars: number): string[] => {
    if (text.length <= maxChars) return [text];
    // 쉼표, 접속사 뒤에서 분할
    const parts = text.split(/(?<=[,，、])\s*/).filter(p => p.trim());
    if (parts.length <= 1) return [text]; // 분할 불가

    const result: string[] = [];
    let current = '';
    for (const part of parts) {
        if (current && (current + part).length > maxChars) {
            result.push(current.trim());
            current = part;
        } else {
            current += part;
        }
    }
    if (current.trim()) result.push(current.trim());
    return result.length > 0 ? result : [text];
};

/** 공백 기준으로 maxChars 이내 청크로 분할 */
const spaceSplit = (text: string, maxChars: number): string[] => {
    if (text.length <= maxChars) return [text];
    const words = text.split(/\s+/);
    const result: string[] = [];
    let buf = '';
    for (const w of words) {
        if (buf && (buf + ' ' + w).length > maxChars) {
            result.push(buf.trim());
            buf = w;
        } else {
            buf = buf ? buf + ' ' + w : w;
        }
    }
    if (buf.trim()) result.push(buf.trim());
    return result.length > 0 ? result : [text];
};

/** 한국어 문법 경계 기반 분할 (조사/어미/관형사형에서 끊기) */
const splitKoreanClauses = (text: string, maxChars: number, minChars: number): string[] => {
    // 1차: 연결어미/쉼표에서 분할 (큰 절 단위)
    const CLAUSE_REGEX = /(?<=[,，、])\s*|(?<=(?:되고|하고|했고|있고|없고|되어|하여|되며|하며|이며|에서|는데|지만|니까|므로|려고|면서|어서|해서|아서))\s+/;
    // 나노(≤20): 연결어미 결과 24자까지 유지 / 숏폼 이상: maxChars까지만
    const clauseKeepMax = maxChars <= 20 ? 24 : maxChars;

    const clauseParts = text.split(CLAUSE_REGEX).filter(p => p.trim());
    if (clauseParts.length <= 1 && text.length <= maxChars) return [text];

    // 2차: 큰 절은 한국어 문법 경계(조사/관형사형 어미)에서 추가 분할
    // 조사: 을,를,에,의,은,는,이,가,도,와,과,로 | 관형사형: 질,선,한,된,할,될,인,운,던
    const GRAMMAR_REGEX = /(?<=(?:[을를에의은는이가도와과로질선한된할될인운던]|에서|으로|까지|부터|적인))\s+/;

    const fineParts: string[] = [];
    const hasMultipleClauses = clauseParts.length > 1;
    for (const clause of (hasMultipleClauses ? clauseParts : [text])) {
        if (hasMultipleClauses && clause.length <= clauseKeepMax) {
            // 연결어미 분할 결과는 clauseKeepMax까지 무조건 유지
            fineParts.push(clause);
        } else if (clause.length <= maxChars) {
            fineParts.push(clause);
        } else {
            // 매우 큰 절: 문법 분할 시도 → 실패 시 공백 분할
            const grammarParts = clause.split(GRAMMAR_REGEX).filter(p => p.trim());
            if (grammarParts.length > 1) {
                fineParts.push(...grammarParts);
            } else {
                fineParts.push(...spaceSplit(clause, maxChars));
            }
        }
    }

    // 3차: 문법 분할된 작은 파트들을 maxChars까지 병합
    const merged: string[] = [];
    let buf = '';
    for (const p of fineParts) {
        const candidate = buf ? buf + ' ' + p : p;
        if (candidate.length > maxChars && buf) {
            merged.push(buf.trim());
            buf = p;
        } else {
            buf = candidate;
        }
    }
    if (buf.trim()) merged.push(buf.trim());

    // 4차: minChars 미만 파트는 인접과 병합
    const result: string[] = [];
    for (let i = 0; i < merged.length; i++) {
        if (merged[i].length < minChars) {
            if (i + 1 < merged.length && (merged[i] + ' ' + merged[i + 1]).length <= maxChars * 1.3) {
                merged[i + 1] = merged[i] + ' ' + merged[i + 1];
            } else if (result.length > 0 && (result[result.length - 1] + ' ' + merged[i]).length <= maxChars * 1.3) {
                result[result.length - 1] += ' ' + merged[i];
            } else {
                result.push(merged[i]);
            }
        } else {
            result.push(merged[i]);
        }
    }
    return result.length > 0 ? result : [text];
};

/** 대본을 장면 단위로 실제 분할하여 텍스트 배열로 반환 — 의미 단위 경계 존중 */
export const splitScenesLocally = (script: string, format: VideoFormat, smartSplit: boolean, longFormSplitType?: 'DEFAULT' | 'DETAILED'): string[] => {
    if (!smartSplit) return script.split('\n').filter(l => l.trim());

    // 1단계: 의미 단위(semantic segment)로 분할
    const segments = splitIntoSemanticSegments(script);
    if (segments.length === 0) return [];

    // 2단계: 세그먼트 → 문장 평탄화 (세그먼트 경계 추적)
    const SENTENCE_SPLIT = /(?<=[.!?。！？؟।॥။។።՞՜།])\s*/;
    const tagged = flattenSegmentsToSentences(segments, SENTENCE_SPLIT);

    const scenes: string[] = [];

    switch (format) {
        case VideoFormat.LONG:
            if (longFormSplitType === 'DETAILED') {
                // 1문장 = 1장면, 100자 초과 시 쉼표/절 단위 추가 분할
                for (const t of tagged) {
                    scenes.push(...splitByClause(t.text, 100));
                }
            } else {
                // DEFAULT: 2문장 묶되 세그먼트 경계를 넘어 병합하지 않음
                let i = 0;
                while (i < tagged.length) {
                    if (
                        i + 1 < tagged.length &&
                        tagged[i].segIdx === tagged[i + 1].segIdx &&
                        (tagged[i].text.length + tagged[i + 1].text.length) <= 150
                    ) {
                        scenes.push(tagged[i].text + ' ' + tagged[i + 1].text);
                        i += 2;
                    } else {
                        scenes.push(...splitByClause(tagged[i].text, 150));
                        i++;
                    }
                }
            }
            break;

        case VideoFormat.SHORT:
            // [FIX #265] 숏폼: 80자 타겟 (기존 45→80) — countScenesLocally와 동일 규칙 적용
            for (const t of tagged) {
                scenes.push(...splitKoreanClauses(t.text, 80, 10));
            }
            break;

        case VideoFormat.NANO:
            // 나노: 16자 타겟 (도파민 자막 스타일), 5자 미만 병합
            for (const t of tagged) {
                scenes.push(...splitKoreanClauses(t.text, 16, 5));
            }
            break;

        case VideoFormat.MANUAL:
            scenes.push(...script.split('\n').filter(l => l.trim()));
            break;

        default:
            return tagged.map(t => t.text);
    }

    return scenes.length > 0 ? scenes : tagged.map(t => t.text);
};

// [NEW] Script Sanitization Function — Universal Unicode Support
const sanitizeScript = (text: string): string => {
    // Step 1: Remove markdown/injection-dangerous characters
    // Step 2: Keep ALL Unicode letters (\p{L}), numbers (\p{N}), punctuation (\p{P}), and whitespace
    // This covers every script's punctuation automatically (CJK, Arabic, Devanagari, Ethiopic, Myanmar, Khmer, etc.)
    return text.replace(/[*#`<>{}|^\\]/g, '').replace(/[^\p{L}\p{N}\p{P}\s]/gu, '');
};

// [REMOVED] enrichEntityDetail — Entity Enrichment Phase 2 제거
// NanoBanana 2 이미지 생성기가 google_search/web_search로 실제 웹 검색을 수행하므로
// Gemini Pro에서 mock 검색으로 텍스트 설명을 뽑는 이 단계는 불필요 (400 에러 + 비용 낭비 원인)

export const analyzeScriptContext = async (
    script: string,
    onCost?: (c: number) => void,
    format?: VideoFormat,
    smartSplit?: boolean,
    longFormSplitType?: 'DEFAULT' | 'DETAILED'
) => {
    // Cost is now auto-tracked inside evolinkChat/requestEvolinkNative

    // [NEW] 분할 규칙 설명 생성 (estimateSceneCount와 동일 규칙)
    let splitRule = "1 sentence = 1 scene.";
    if (smartSplit === false) {
        splitRule = "Each line break = 1 scene. Count non-empty lines.";
    } else if (format) {
        switch (format) {
            case VideoFormat.LONG:
                splitRule = longFormSplitType === 'DETAILED'
                    ? "1 sentence = 1 scene. EXCEPTION: If sentence ends with '?', merge with next answer sentence (2→1 scene)."
                    : "2 sentences = 1 scene. EXCEPTION: If '?' present, merge up to 3 sentences. Only split to 1 sentence on drastic visual transition.";
                break;
            case VideoFormat.SHORT:
                splitRule = "1 sentence = 1 scene. If a sentence has comma or conjunction, split further.";
                break;
            case VideoFormat.NANO:
                splitRule = "Split at every comma, conjunction, and pause. Maximize cuts.";
                break;
        }
    }

    // [FIX] 긴 대본 보호 — 15,000자 초과 시 head 7500 + tail 7500 전략으로 축약
    const MAX_SCRIPT_LENGTH = 15000;
    const HALF_LIMIT = 7500;
    let truncatedScript = script;
    if (script.length > MAX_SCRIPT_LENGTH) {
        const head = script.substring(0, HALF_LIMIT);
        const tail = script.substring(script.length - HALF_LIMIT);
        truncatedScript = `${head}\n\n[... truncated middle section (${script.length - HALF_LIMIT * 2} chars omitted) ...]\n\n${tail}`;
        console.log(`[analyzeScriptContext] 대본 축약: ${script.length}자 → ${truncatedScript.length}자 (head ${HALF_LIMIT} + tail ${HALF_LIMIT})`);
    }

    const promptText = `Analyze the following script. You must do TWO tasks:

TASK 1: Extract detailed global context.
TASK 2: Count the exact number of scenes based on splitting rules.

=== TASK 1: CONTEXT EXTRACTION ===
CRITICAL RULE: The fields below describe the SUBJECT MATTER of the script, NOT the language it's written in.
A Korean-language script about Chinese history → specificLocation: "China", culturalBackground: "Chinese", detectedLanguageName: "Korean".
Do NOT conflate the writing language with the depicted setting/culture.

1. specificLocation: The specific physical location (e.g., "Forbidden City, Beijing", "Gangnam Station, Seoul", "Medieval Castle, Europe").
2. timePeriod: The specific era or time period (e.g., "1960s Cultural Revolution", "Joseon Dynasty", "Modern Day 2024").
3. culturalBackground: The cultural context (e.g., "Chinese Communist", "Korean Traditional", "Western Cyberpunk").
4. visualTone: The overall visual mood.
5. detectedLanguage: The BCP-47 language code. Be SPECIFIC about regional/script variants:
   - "zh-CN", "zh-TW", "zh-HK", "yue", "pt-BR", "pt-PT", "es-MX", "es-ES", "es-AR", "es-CO"
   - "ko-KR", "ja-JP", "ar-SA", "ar-EG", "ar-MA", "hi-IN", "th-TH", "ru-RU", "fr-FR", "fr-CA", "fr-BE", "de-DE", "de-CH", "de-AT", "vi-VN"
   - "bn-BD", "bn-IN", "ta-IN", "ta-LK", "te-IN", "kn-IN", "ml-IN", "gu-IN", "pa-IN", "si-LK"
   - "my-MM", "km-KH", "lo-LA", "ka-GE", "hy-AM", "he-IL", "fa-IR", "ur-PK", "uz-UZ"
   - "el-GR", "el-CY", "tr-TR", "uk-UA", "bg-BG", "am-ET", "sw-KE", "sw-TZ", "bo-CN"
   - "nl-NL", "nl-BE", "sv-SE", "nb-NO", "nn-NO", "da-DK", "fi-FI", "pl-PL", "cs-CZ", "sk-SK", "ro-RO", "hu-HU", "hr-HR", "sr-RS", "id-ID", "ms-MY", "tl-PH"
   - "en-US", "en-GB", "en-AU", "en-IN", "en-SG", "en-ZA", "en-CA", "en-NZ", "it-IT", "it-CH", "ca-ES", "eu-ES", "gl-ES"
   Detect the EXACT regional variant — e.g., Swiss German (de-CH) vs Standard German (de-DE), Taiwanese Mandarin (zh-TW) vs Mainland Chinese (zh-CN), Canadian French (fr-CA) vs European French (fr-FR).
6. detectedLanguageName: The SPECIFIC variant name in English (e.g., "Korean", "Simplified Chinese", "Traditional Chinese (Taiwan)", "Brazilian Portuguese", "Swiss German", "Canadian French", "British English").
7. keyEntities: Extract specific proper nouns: Celebrities, Brand Names, Logos, Specific Landmarks. Return as a comma-separated string.

=== TASK 2: SCENE COUNT ===
SPLITTING RULE: ${splitRule}
Count the script carefully sentence by sentence, applying the rule above, and return the exact integer.

Return JSON: { specificLocation: string, timePeriod: string, culturalBackground: string, visualTone: string, detectedLanguage: string, detectedLanguageName: string, keyEntities: string, estimatedSceneCount: number }
Script: ${truncatedScript}`;

    // [UPGRADED] Gemini 3.1 Pro — v1 OpenAI 프록시 경유
    // API 문서: v1beta는 이미지생성/비디오분석 전용, 텍스트는 v1/chat/completions만
    const payload = {
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
            maxOutputTokens: 4096
        },
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE
    };

    // [CRITICAL] 로컬 결정론적 장면 카운트 — AI 추정 대신 사용
    const localCount = countScenesLocally(script, format || VideoFormat.SHORT, smartSplit ?? true, longFormSplitType);
    console.log(`[analyzeScriptContext] 📐 로컬 결정론적 카운트: ${localCount}컷`);

    const parseNativeResponse = (data: any, label: string): any => {
        const text = extractTextFromResponse(data);
        console.log(`[analyzeScriptContext] ${label} raw:`, text?.substring(0, 500));
        const json = extractJsonFromText(text);
        const result = JSON.parse(json || '{}');
        const aiCount = result.estimatedSceneCount;
        // [FIX] AI 카운트 무시 → 로컬 결정론적 카운트로 오버라이드
        // parseScriptToScenes 후처리와 동일한 규칙이므로 실제 결과와 일치 보장
        result.estimatedSceneCount = localCount;
        console.log(`[analyzeScriptContext] ${label} → AI추정: ${aiCount}컷, 로컬확정: ${localCount}컷 (로컬 사용)`);
        return result;
    };

    try {
        // 1차: Gemini 3.1 Pro (최고 품질)
        console.log('[analyzeScriptContext] 🧠 Gemini 3.1 Pro 호출');
        const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
        return parseNativeResponse(data, 'Gemini3.1-Pro');
    } catch (e) {
        console.warn('[analyzeScriptContext] Pro failed:', e);
        // 2차: Gemini 3.1 Pro 재시도 (최종 폴백)
        console.log('[analyzeScriptContext] 🔄 Gemini 3.1 Pro 최종 폴백');
        const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
        return parseNativeResponse(data, 'Gemini3.1-Pro-Retry');
    }
};

// [REWRITTEN] 로컬 결정론적 카운트 — AI 추정 완전 제거, API 비용 $0
// parseScriptToScenes 후처리와 동일한 규칙이므로 예상 = 실제 보장
export const estimateSceneCount = async (script: string, format: VideoFormat, smartSplit: boolean, _onCost?: (c: number) => void, longFormSplitType?: 'DEFAULT' | 'DETAILED') => {
    if (!script.trim()) return 0;
    const count = countScenesLocally(script, format, smartSplit, longFormSplitType);
    console.log(`[estimateSceneCount] 📐 로컬 결정론적 카운트: ${count}컷 (API 호출 없음, $0)`);
    return count;
};

// [CRITICAL UPDATE] Split Process: 1. Structure (No Tools) -> 2. Enrichment (With Tools)
export const parseScriptToScenes = async (
    script: string,
    format: VideoFormat,
    atmosphere: string,
    characterDesc: string,
    appearance: CharacterAppearance,
    allowInfo: boolean,
    smartSplit: boolean,
    baseAge?: string,
    textForceLock?: boolean,
    baseSetting?: string,
    detectedLocale?: string,
    onCost?: (c: number) => void,
    suppressText?: boolean, // [NEW] No Text Mode Argument
    longFormSplitType?: 'DEFAULT' | 'DETAILED', // [NEW] Long Form Split Type
    targetSceneCount?: number, // [NEW] 예상 컷수 — 이 수치에 맞춰 장면 분할 강제
    dialogueTone?: DialogueTone, // [v4.7] 대사 톤 프리셋
    characterProfiles?: CharacterProfile[], // [v4.7] 캐릭터 프로필 배열
    referenceDialogue?: string, // [v4.7] 참조 대사 텍스트
    onChunkProgress?: (completed: number, total: number) => void // [FIX #193] 청크 진행 콜백
): Promise<Scene[]> => {
    // Cost is now auto-tracked inside evolinkChat/requestEvolinkNative
    console.log(`[parseScriptToScenes] Received targetSceneCount: ${targetSceneCount}, type: ${typeof targetSceneCount}`);

    const cleanedScript = sanitizeScript(script);

    // --- PHASE 1: STRUCTURE ANALYSIS (NO TOOLS) ---
    // This ensures robust JSON parsing without "Empty Response" errors caused by tool confusion.

    let splitInstruction = "";
    if (!smartSplit) {
        splitInstruction = `MANUAL MODE: Treat every single line break in the script as a strict scene separator. Do not merge lines. One line = One scene.`;
    } else {
        switch (format) {
            case VideoFormat.LONG:
                // [UPDATED] Strict Long-Form Splitting Logic
                if (longFormSplitType === 'DETAILED') {
                    splitInstruction = `
                    [CRITICAL: LONG-FORM DETAILED SPLIT RULE]
                    1. **DEFAULT = 1 SENTENCE**: Treat every single sentence as ONE scene to maximize visual detail.
                    2. **QUESTION EXCEPTION**: If a sentence ends with '?', you MUST merge it with the IMMEDIATE next sentence (Answer) into ONE scene.
                    3. **NO MERGING**: Do not merge other sentences unless they are extremely short fragments (less than 3 words).
                    `;
                } else {
                    splitInstruction = `
                    [CRITICAL: LONG-FORM PACING RULE]
                    1. **DEFAULT = 2 Sentences**: You MUST merge 2 consecutive sentences into ONE scene.
                    2. **QUESTION EXTENSION**: If a sentence has '?', include the next sentence (answer) in the SAME scene (Max 3 sentences).
                    3. **SINGLE SENTENCE EXCEPTION**: Only allowed if the visual scene changes drastically (Location/Time jump).
                    4. Do not fragment the script. Longer, stable scenes are required.
                    `;
                }
                break;
            case VideoFormat.SHORT: splitInstruction = `SHORT-FORM: Strictly 1 sentence per scene.`; break;
            case VideoFormat.NANO:
                splitInstruction = `
                [CRITICAL: NANO-FORM DOPAMINE RULE]
                1. **SPLIT EVERYTHING**: Split at EVERY comma, conjunction (and, but), and visual beat.
                2. **IGNORE GRAMMAR**: Focus on fast cuts. 1 second per scene.
                3. **MAXIMIZE SCENES**: If a sentence is "I went to the store, and bought milk.", split into "I went to the store" AND "and bought milk".
                `;
                break;
        }
    }

    // [MODIFIED] POWERFUL DIRECTOR SYSTEM PROMPT
    const systemPrompt = `
    You are an ELITE AI FILM DIRECTOR and VISUAL DESIGNER.

    **YOUR MISSION**: Convert a text script into a sequence of stunning visual scenes.
    **THE ENEMY**: Boring text overlays. YOU MUST NEVER PUT THE SCRIPT TEXT INSIDE THE IMAGE.

    [CORE DIRECTIVES]
    1. **VISUAL TRANSLATION (THE "TEXT NUKE")**:
       - READ the script line. UNDERSTAND the concept.
       - DO NOT just ask for "an image about [script]".
       - VISUALIZE it. If the script says "The microphone has 90 holes", your visual prompt MUST be: "Extreme macro photography of a golden brass plate with 90 precision-drilled holes arranged in a fibonacci pattern, dramatic side lighting".
       - **ABSOLUTE RULE**: 'textToRender' MUST BE EMPTY or contain ONLY a single key number/word (e.g. "90", "E=mc^2", "Inflation"). NEVER a sentence.
       - **KEY ENTITIES**: If a key entity (e.g. 'Nike Logo', 'Elon Musk', 'Eiffel Tower') is mentioned, describe its visual appearance explicitly in the prompt (e.g., "Elon Musk wearing a black suit", "Nike Swoosh logo on the shoe").

    2. **DYNAMIC INFOGRAPHICS (THE "VISUAL TRANSLATOR")**:
       - **CRITICAL CONDITION**: ONLY set 'isInfographic' to true IF AND ONLY IF the user explicitly allowed it AND the content is purely data-heavy (charts, numbers, complex diagrams).
       - **NEGATIVE CONSTRAINT**: If 'allowInfo' is false, YOU MUST NEVER set 'isInfographic' to true.
       - If the content is technical/informational, DO NOT just make a "chart".
       - INVENT the best visual format:
         - "3D Cutaway Cross-section" for engineering.
         - "Holographic Data Stream" for tech.
         - "Vintage Map Overlay" for history.
         - "Electron Microscope View" for biology.
       - The 'visualPrompt' must describe this visual style explicitly.

    [SMART CASTING RULES: User Preference "${appearance}"]

    1. **CASE: AUTO (The Pro Director)**
       - **Limit**: Character ('MAIN') MUST appear only once every 3-5 scenes. After a MAIN scene, the next 2-4 scenes MUST be 'NOBODY', 'EXTRA', or 'KEY_ENTITY'.
       - **Rule**: After 1 character scene → at least 2 non-character scenes (data visuals, scenery, objects, establishing shots, infographics, b-roll) → then character may appear again.
       - **Pacing**: Create a natural documentary rhythm — the character introduces/reacts, then the visuals carry the story, then the character returns.
       - **Variety**: MAIN scenes should show the character in different shotSize/cameraAngle. Non-character scenes provide visual variety.
       - **Infographics**:
         - If explaining complex data -> 'MAIN' (Presenter Mode).
         - If showing raw data/impact -> 'NOBODY' (Full Screen Chart).

    [CRITICAL: KEY_ENTITY MANDATORY APPEARANCE RULE — ALL MODES]
    When the script mentions ANY of the following, you MUST set castType to 'KEY_ENTITY':
    - Famous people (celebrities, politicians, historical figures, artists, scientists)
    - Specific brands or logos (Nike, Apple, Samsung, etc.)
    - Specific landmarks or buildings (Eiffel Tower, Taj Mahal, Sforza Castle, etc.)
    - Specific signs, storefronts, or named places
    - Historical figures or characters (Leonardo da Vinci, Napoleon, etc.)

    The entity MUST be visually depicted in the scene — NEVER abstract or symbolic.
    Set 'entityName' to the exact name of the entity detected.

    [CONTEXTUAL ENTITY INFERENCE — CRITICAL]
    Even if the script does NOT explicitly name a person, you MUST INFER the real identity from context:
    - "70년대 미국 대통령" → entityName: "Richard Nixon" (or "Gerald Ford" depending on exact year context)
    - "첫 번째 한국 대통령" → entityName: "Syngman Rhee (이승만)"
    - "1970년 한국은행 총재" → entityName: the actual governor at that time
    - "르네상스 시대 최고의 화가" → entityName: "Leonardo da Vinci"
    - "제264대 교황" → entityName: "Pope Francis"
    - "세계에서 가장 부유한 사람" → entityName: the person most commonly recognized in that context
    Use your world knowledge to resolve descriptions, titles, roles, and historical references to SPECIFIC real individuals.
    If multiple candidates exist, choose the MOST COMMONLY ASSOCIATED person for that description.

    [KEY_ENTITY COMPOSITION — entityComposition field]
    When castType is 'KEY_ENTITY', you MUST also set 'entityComposition' to control HOW the entity appears.
    You MUST cycle through ALL 5 composition types — NEVER repeat the same entityComposition in adjacent KEY_ENTITY scenes.

    Available compositions:
    - "ENTITY_SOLO": Entity fills the frame alone. Full cinematic portrait of the entity. No main character visible.
      Example: "Leonardo da Vinci at his workshop desk, painting the Last Supper, warm candlelight"
    - "ENTITY_WITH_MAIN": Entity and main character together in the same frame, interacting naturally.
      Example: "Main character standing beside Leonardo da Vinci, both examining a blueprint"
    - "MAIN_OBSERVING": Over-the-shoulder shot FROM the main character's perspective, looking AT the entity.
      Example: "Over-the-shoulder of the main character watching Leonardo da Vinci sculpt, shallow depth of field"
    - "ENTITY_FG_MAIN_BG": Entity prominent in foreground, main character visible but smaller in background.
      Example: "Close-up of Leonardo da Vinci's face in left foreground, main character blurred in background doorway"
    - "MAIN_FG_ENTITY_BG": Main character in foreground, entity visible in background context.
      Example: "Main character in foreground reacting with awe, Leonardo da Vinci's workshop visible behind"

    Rotation Rule: Cycle through the 5 compositions in order for each KEY_ENTITY scene.
    If there are fewer than 5 KEY_ENTITY scenes, still vary — NEVER use the same composition twice.

    2. **CASE: ALWAYS (The Streamer/Presenter)**
       - **Rule**: Character ('MAIN') appears in **100%** of scenes.
       - **KEY_ENTITY Override**: When KEY_ENTITY is detected, main character STILL appears but interacts WITH the entity. Use 'ENTITY_WITH_MAIN', 'MAIN_OBSERVING', or 'MAIN_FG_ENTITY_BG' compositions ONLY (never ENTITY_SOLO in ALWAYS mode).
       - **Infographics Integration**: If 'isInfographic' is true, the character **MUST BE VISIBLE** interacting with the data (e.g., "Pointing at chart", "Holding hologram", "Standing next to graph"). Do NOT hide the character.
       - **Anti-Boredom**: You MUST vary 'cameraAngle' and 'shotSize' in every single scene.

    3. **CASE: MINIMAL (Documentary Style)**
       - **Rule**: Hide character ('NOBODY') for 90% of scenes. Use B-Roll, Stock Footage, or Full Screen Graphics.
       - Only show character ('MAIN') for specific Self-Introduction or Extreme Emotional Reactions.
       - **KEY_ENTITY Override**: When KEY_ENTITY is detected, entity MUST appear. Prefer 'ENTITY_SOLO' or 'ENTITY_FG_MAIN_BG' compositions.

    [PHASE: SPLITTING]
    ${splitInstruction}
    ${targetSceneCount && targetSceneCount > 0 ? `
    [CRITICAL: TARGET SCENE COUNT = ${targetSceneCount}]
    You MUST produce EXACTLY ${targetSceneCount} scenes. Not more, not less.
    This number was pre-calculated based on the splitting rules above.
    If your natural split produces fewer scenes, split longer sentences further.
    If your natural split produces more scenes, merge the shortest adjacent scenes.
    The final JSON array MUST have exactly ${targetSceneCount} elements.
    ` : ''}

    [PHASE: CONTEXTUAL GROUNDING — HIGHEST PRIORITY]
    THIS IS THE MOST IMPORTANT PHASE. Every scene MUST reflect accurate real-world context.

    ABSOLUTE RULES:
    1. Script LANGUAGE ≠ Visual Culture. Korean script about China → Chinese buildings, Chinese streets, Chinese people.
    2. The MANDATORY GLOBAL CONTEXT provided in the user message is your PRIMARY reference.
       - sceneLocation MUST default to the global context's specificLocation.
       - sceneEra MUST default to the global context's timePeriod.
       - sceneCulture MUST default to the global context's culturalBackground.
    3. ONLY override per-scene if the script EXPLICITLY mentions a DIFFERENT location/era/culture in that specific sentence.
    4. Real-world entities (brands, logos, landmarks, people) MUST be described with accurate visual details.
       - "중국의 무역 흑자" → Chinese government buildings, RMB currency, Chinese port with cargo ships.
       - "1300조 원" → Korean Won currency visualization, Korean financial context.
       - "동남아시아와 아프리카" → Southeast Asian and African marketplace/port imagery.
    5. NEVER use generic/abstract visuals when the script mentions specific real-world concepts.

    [PHASE: CINEMATIC VARIETY — CRITICAL]
    You MUST maximize visual diversity across all scenes. A monotonous storyboard is FAILURE.

    MANDATORY RULES:
    1. **NO CONSECUTIVE REPEATS**: Adjacent scenes MUST differ in at least 2 of: shotSize, cameraAngle, cameraMovement.
    2. **SHOT SIZE DISTRIBUTION**: Use the FULL range. If 9 scenes, you need at least 4 different shot sizes.
    3. **ANGLE DISTRIBUTION**: Never use "Eye Level" for more than 30% of total scenes.
    4. **CAMERA MOVEMENT**: Each scene MUST have a camera movement. Static shots should be rare (max 20%).
    5. **VISUAL METAPHOR**: For abstract concepts (economy, emotions, crisis), use creative visual metaphors:
       - "경제 성장" → Time-lapse of skyscrapers rising from ground, golden light
       - "위기" → Cracking ice over dark water, dramatic red lighting
       - "모순" → Split-screen contrast, one side bright/one side dark
       - "구조적 결함" → X-ray view of crumbling building foundation
       - "기회" → A hand reaching through clouds toward brilliant sunlight, lens flare
       - "혁신" → Exploded view of a machine reassembling into a new form, floating parts with energy arcs
       - "갈등" → Two opposing forces visualized as colliding waves or tectonic plates cracking
       - "시간의 흐름" → A corridor of doors from past to future, each era's architecture morphing
    6. **PERSPECTIVE VARIETY**: Alternate between objective (observer) and subjective (participant) viewpoints.

    [PHASE: VISUAL QUALITY STANDARDS — MANDATORY]
    Your 'visualPrompt' MUST be CINEMATIC QUALITY. Vague prompts produce vague images. Follow these rules:

    1. **LIGHTING IS KING**: Every scene MUST have specific lighting. BANNED words: "dramatic lighting", "nice lighting", "good lighting".
       INSTEAD write: "warm golden hour sidelight from upper-left casting long shadows across cobblestones" or "cold blue moonlight filtering through venetian blinds creating stripe patterns on the wall" or "harsh overhead fluorescent with green tint in sterile hospital corridor".
    2. **LENS LANGUAGE**: Think like a cinematographer. Include depth of field feel:
       - Portraits/emotions: "shallow depth of field with creamy bokeh, 85mm lens feel"
       - Establishing shots: "deep focus everything razor-sharp, 24mm wide-angle perspective"
       - Compression/tension: "telephoto compression flattening layers, 200mm feel"
    3. **COMPOSITION**: Apply real film composition and specify subject placement:
       - "Subject at left-third intersection, leading lines from railway tracks converging to vanishing point"
       - "Symmetrical framing through a doorway, subject centered in deep background"
       - "Foreground framing through rain-streaked window, subject soft-focused beyond"
    4. **TEXTURE & MATERIAL**: Describe surface qualities: "weathered oak grain", "polished chrome reflecting city lights", "rough concrete with moss in cracks", "silk fabric catching light".
    5. **ATMOSPHERE**: Include environmental particles: dust motes in light beams, rain droplets on glass, morning fog, steam rising from street grates, falling autumn leaves, snow flurries. These add cinematic depth.
    6. **COLOR PALETTE**: Specify mood colors: "desaturated teal and orange color grade", "warm amber palette with deep burgundy accents", "cool blue-grey overcast with single warm light source".

    ${dialogueTone && dialogueTone !== 'none' ? `
    [PHASE: DIALOGUE GENERATION]
    You MUST generate character dialogue for EACH scene. This is a SCREEN DIALOGUE — text that viewers READ on screen.

    [DIALOGUE TONE RULES]
    ${DIALOGUE_TONE_PRESETS[dialogueTone]?.promptRules || ''}

    [EMOTIONAL ARC]
    Follow this beat structure across all scenes: ${DIALOGUE_TONE_PRESETS[dialogueTone]?.arcTemplate || ''}
    Assign one emotionalBeat per scene. The beats must flow naturally across the entire script.

    ${characterProfiles && characterProfiles.length > 0 ? `[CHARACTER PROFILES]
    These characters appear in the script. Each has a distinct voice:
    ${characterProfiles.map(c => `- ${c.name} (${c.role}${c.age ? ', ' + c.age : ''}): ${c.speechStyle || 'natural speech'}`).join('\n    ')}
    Match dialogue speaker to the most appropriate character for each scene.` : ''}

    ${referenceDialogue ? `[REFERENCE STYLE]
    The user provided reference dialogue. Match the TONE, RHYTHM, and VOCABULARY of this sample:
    "${referenceDialogue.slice(0, 500)}"` : ''}

    For EACH scene, generate:
    - "dialogue": The actual screen dialogue text (in the script's language). Must match the tone rules above.
    - "dialogueSpeaker": Name of the speaking character (from CHARACTER PROFILES if available, otherwise infer).
    - "dialogueEmotion": One of: "neutral" | "happy" | "sad" | "angry" | "surprised" | "fearful" | "nostalgic" | "sarcastic" | "excited"
    - "dialogueSfx": Optional sound effect suggestion (e.g. "door_slam", "rain", "crowd_murmur"). Empty string if none.
    - "emotionalBeat": One of the beats from the arc template above.
    ` : ''}

    [PHASE: OUTPUT FORMAT]
    Return a VALID JSON array of Scene objects. No markdown.
    {
        "scriptText": "Original text line (DO NOT MODIFY)",
        "visualPrompt": "A flowing cinematic description (English, 40-80 words). MUST include: specific lighting (direction, color temperature, shadow quality), depth of field / lens feel, composition technique (rule of thirds, leading lines, framing), atmosphere (weather, particles, mood), material textures, and a dominant color palette. Write as a cinematographer's shot description, NOT a tag list. NEVER use vague terms like 'dramatic lighting' or 'beautiful scene' — be PRECISE.",
        "visualDescriptionKO": "Summary in Korean",
        "castType": "MAIN" | "KEY_ENTITY" | "EXTRA" | "NOBODY",
        "entityName": "Detected entity name (e.g. 'Leonardo da Vinci', 'Nike', 'Eiffel Tower'). MUST be set when castType is KEY_ENTITY. Include ANY famous person, brand, landmark, historical figure, specific place, or notable object mentioned in the script.",
        "entityComposition": "ENTITY_SOLO" | "ENTITY_WITH_MAIN" | "MAIN_OBSERVING" | "ENTITY_FG_MAIN_BG" | "MAIN_FG_ENTITY_BG" (REQUIRED when castType is KEY_ENTITY. Cycle through all 5 types for variety. Empty string if not KEY_ENTITY.),
        "shotSize": "Extreme Close Up" | "Close Up" | "Medium Close Up" | "Medium Shot" | "Medium Wide" | "Wide Shot" | "Extreme Wide" | "Drone View" | "Macro",
        "cameraAngle": "Eye Level" | "Low Angle" | "High Angle" | "Dutch Angle" | "Bird's Eye" | "Worm's Eye" | "Over the Shoulder" | "POV (First Person)" | "Top Down",
        "cameraMovement": "Static" | "Slow Pan Left" | "Slow Pan Right" | "Tilt Up" | "Tilt Down" | "Dolly In" | "Dolly Out" | "Crane Up" | "Crane Down" | "Tracking Shot" | "Zoom In" | "Zoom Out" | "Orbit" | "Handheld Shake",
        "characterPresent": boolean,
        "characterAction": "Specific pose, gesture, expression, and body language for the character in THIS scene. Must be context-appropriate and UNIQUE per scene. Examples: 'leaning forward over a table with intense focus, furrowed brows, one hand gripping a pen', 'walking briskly through a crowded street, looking over shoulder nervously, coat collar pulled up', 'standing at a podium gesturing dramatically with right hand raised, confident smirk', 'sitting cross-legged on the floor reading a scroll with serene expression, soft smile', 'crouching behind cover, peering around the edge with wide eyes, hand on ground for balance', 'mid-stride reaching for a door handle, weight on front foot, determined expression', 'arms folded across chest, leaning against a wall with one foot up, skeptical raised eyebrow', 'hands cupped around a steaming mug, shoulders hunched, gazing out a frosted window wistfully', 'pointing emphatically at a holographic display, jaw set, other hand on hip', 'kneeling on one knee examining something on the ground, head tilted, brow furrowed in curiosity'. MUST vary pose, gesture, AND expression across every scene. NEVER repeat the same action. Include at least body position + hand gesture + facial expression. Empty string if characterPresent is false.",
        "requiresTextRendering": boolean,
        "textToRender": "Keyword or Number ONLY (Max 3 words). Empty if not needed.",
        "isInfographic": boolean,
        "sceneLocation": "Specific location for THIS scene (e.g. 'Forbidden City, Beijing'). Based on CONTENT, not script language.",
        "sceneEra": "Time period for THIS scene (e.g. 'Qing Dynasty', 'Modern Day')",
        "sceneCulture": "Cultural background for THIS scene (e.g. 'Chinese Imperial', 'Korean Traditional')"${dialogueTone && dialogueTone !== 'none' ? `,
        "dialogue": "Screen dialogue text in script language. REQUIRED when dialogue mode is ON.",
        "dialogueSpeaker": "Character name speaking this line",
        "dialogueEmotion": "neutral" | "happy" | "sad" | "angry" | "surprised" | "fearful" | "nostalgic" | "sarcastic" | "excited",
        "dialogueSfx": "Optional SFX suggestion (empty string if none)",
        "emotionalBeat": "hook" | "daily" | "conflict" | "escalation" | "twist" | "resolution" | "reflection" | "build" | "surprise" | "payoff" | "cta"` : ''}
    }
    `;

    const payload = {
        contents: [{ role: 'user', parts: [{ text: `Script:\n${cleanedScript}\n\n[MANDATORY GLOBAL CONTEXT — Apply to EVERY scene as default. Override per-scene ONLY if scene content clearly depicts a different setting.]\n${baseSetting || 'No context provided.'}` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        // [CRITICAL] NO TOOLS HERE! This fixes the Empty Response error.
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 65536 }
    };

    let scenes: Scene[] = [];

    // [NEW] Helper function to parse JSON response and apply post-processing
    const processResponse = (text: string, skipLineRemap = false): Scene[] => {
        const jsonText = extractJsonFromText(text);
        let parsed: any[];
        try {
            parsed = JSON.parse(jsonText || '[]');
        } catch (e) {
            console.error('[processResponse] JSON 파싱 실패:', e, '\nraw:', jsonText?.slice(0, 200));
            throw new Error('AI 응답 형식 오류 — 다시 시도해주세요. (JSON parse error)');
        }

        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("AI returned empty scene list.");

        let result = parsed.map((item: any, index: number) => ({
            id: `scene-${Date.now()}-${index}`,
            ...item,
            isGeneratingImage: false,
            isGeneratingVideo: false,
            isInfographic: allowInfo === true && item.isInfographic === true, // [CRITICAL FIX] Strict boolean check — only true when BOTH are explicitly true
            castType: item.castType || (item.characterPresent ? 'MAIN' : 'NOBODY'),
            shotSize: item.shotSize || 'Medium Shot',
            // [NEW] entityComposition — KEY_ENTITY 연출 구도
            entityComposition: item.entityComposition || '',
            // [v4.7] 대사 필드 매핑
            generatedDialogue: item.dialogue || '',
            dialogueSpeaker: item.dialogueSpeaker || '',
            dialogueEmotion: item.dialogueEmotion || '',
            dialogueSfx: item.dialogueSfx || '',
            emotionalBeat: item.emotionalBeat || undefined,
        }));

        // [CRITICAL FIX] Force-map original script text onto scenes
        // AI sometimes summarizes/abbreviates scriptText — this guarantees 100% original text preservation
        // [BUG #5 FIX] Skip line remapping for combined chunk results — each chunk's scenes
        // already have correct scriptText from their respective chunk, and remapping against
        // the FULL script would incorrectly redistribute lines across all combined scenes.
        if (!skipLineRemap) {
            const originalLines = script.split('\n').filter(l => l.trim());
            if (originalLines.length > 0 && result.length > 0) {
                if (!smartSplit) {
                    // Manual mode: strict 1 line = 1 scene direct mapping
                    result = result.map((scene: any, idx: number) => ({
                        ...scene,
                        scriptText: idx < originalLines.length ? originalLines[idx] : scene.scriptText
                    }));
                } else {
                    // Smart split mode: AI가 scriptText와 visualPrompt를 쌍으로 생성하므로
                    // scriptText를 강제 재분배하면 visualPrompt과의 매핑이 깨짐 (off-by-one 버그 원인)
                    // AI의 원본 scriptText를 보존하여 이미지-텍스트 정합성 유지
                    console.log(`[PostProcess] Smart split: preserving AI scriptText-visualPrompt alignment (${result.length} scenes)`);
                }
            }
        }

        // [CRITICAL FIX] 텍스트 렌더링 기본 OFF — textForceLock이 명시적으로 ON일 때만 허용
        // suppressText ON → 완전 차단 (기존)
        // textForceLock OFF → AI의 자동 활성화 차단 (신규)
        if (suppressText || !textForceLock) {
            result = result.map((s: any) => ({
                ...s,
                requiresTextRendering: false,
                textToRender: ""
            }));
        }

        // [CRITICAL FIX] AUTO 캐릭터 빈도 강제 적용 — MAIN 사이 최소 2씬 갭
        // AUTO 모드: MAIN이 나온 후 최소 2개의 non-MAIN 씬(NOBODY/EXTRA)이 지나야 다음 MAIN 허용
        // KEY_ENTITY는 갭 카운트에서 제외 (투명하게 건너뜀)
        if (appearance === CharacterAppearance.AUTO) {
            const MIN_GAP = 2; // MAIN 사이 최소 2씬 간격 (KEY_ENTITY 제외)
            let gapSinceLastMain = MIN_GAP + 1; // 첫 MAIN은 허용
            let fixCount = 0;
            for (let i = 0; i < result.length; i++) {
                if (result[i].castType === 'KEY_ENTITY') continue; // KEY_ENTITY는 갭 카운트에서 제외
                if (result[i].castType === 'MAIN') {
                    if (gapSinceLastMain < MIN_GAP) {
                        result[i] = {
                            ...result[i],
                            castType: 'NOBODY',
                            characterPresent: false,
                            characterAction: '',
                        };
                        fixCount++;
                        gapSinceLastMain++; // NOBODY로 전환되었으므로 갭 증가
                        console.log(`[PostProcess] AUTO castType fix: scene ${i} forced MAIN→NOBODY (gap ${gapSinceLastMain - 1} < ${MIN_GAP})`);
                    } else {
                        gapSinceLastMain = 0; // MAIN 등장 → 갭 리셋
                    }
                } else {
                    gapSinceLastMain++; // non-MAIN 씬 → 갭 증가
                }
            }
            console.log(`[PostProcess] AUTO mode: ${fixCount} scene(s) fixed to NOBODY (min gap: ${MIN_GAP})`);
        }

        // [CRITICAL FIX] MINIMAL 캐릭터 빈도 강제 적용 — 최대 2회만 MAIN 허용
        // MINIMAL 모드: 전체 장면의 ~10% (20장면 기준 2장면)만 MAIN, 나머지는 NOBODY로 강제 전환
        // KEY_ENTITY는 예외 — 유명인/브랜드/장소는 반드시 표시되어야 함
        if (appearance === CharacterAppearance.MINIMAL) {
            const maxMain = Math.max(2, Math.round(result.length * 0.1));
            let mainCount = 0;
            for (let i = 0; i < result.length; i++) {
                if (result[i].castType === 'KEY_ENTITY') continue;
                if (result[i].castType === 'MAIN') {
                    if (mainCount >= maxMain) {
                        result[i] = {
                            ...result[i],
                            castType: 'NOBODY',
                            characterPresent: false,
                            characterAction: '',
                        };
                        console.log(`[PostProcess] MINIMAL castType fix: scene ${i} forced MAIN→NOBODY (max ${maxMain} MAIN exceeded, count=${mainCount})`);
                    } else {
                        mainCount++;
                    }
                }
            }
            console.log(`[PostProcess] MINIMAL mode: ${mainCount} MAIN scene(s) kept (max ${maxMain}), rest forced to NOBODY`);
        }

        // [CRITICAL FIX] NONE 캐릭터 모드 — 모든 장면에서 캐릭터 완전 제거
        if (appearance === CharacterAppearance.NONE) {
            for (let i = 0; i < result.length; i++) {
                if (result[i].castType === 'KEY_ENTITY') continue;
                result[i] = {
                    ...result[i],
                    castType: 'NOBODY',
                    characterPresent: false,
                    characterAction: '',
                };
            }
            console.log(`[PostProcess] NONE mode: all non-KEY_ENTITY scenes forced to NOBODY`);
        }

        // [NEW] KEY_ENTITY 연출 구도 강제 다양화 — 같은 구도 연속 사용 금지
        const ENTITY_COMPOSITIONS = ['ENTITY_SOLO', 'ENTITY_WITH_MAIN', 'MAIN_OBSERVING', 'ENTITY_FG_MAIN_BG', 'MAIN_FG_ENTITY_BG'] as const;
        let entityCompIndex = 0;
        let lastEntityComp = '';
        for (let i = 0; i < result.length; i++) {
            if (result[i].castType === 'KEY_ENTITY') {
                // AI가 entityComposition을 지정하지 않았거나 이전과 동일한 경우 → 자동 로테이션
                if (!result[i].entityComposition || result[i].entityComposition === lastEntityComp) {
                    result[i] = { ...result[i], entityComposition: ENTITY_COMPOSITIONS[entityCompIndex % ENTITY_COMPOSITIONS.length] };
                    console.log(`[PostProcess] Entity composition auto-assigned: scene ${i} → ${result[i].entityComposition}`);
                }
                lastEntityComp = result[i].entityComposition;
                entityCompIndex++;

                // KEY_ENTITY인데 entityName이 비어있으면 경고
                if (!result[i].entityName) {
                    console.warn(`[PostProcess] KEY_ENTITY scene ${i} has no entityName — castType may be incorrect`);
                }

                // ALWAYS 모드에서는 ENTITY_SOLO 금지 (항상 메인 캐릭터 출연)
                if (appearance === CharacterAppearance.ALWAYS && result[i].entityComposition === 'ENTITY_SOLO') {
                    result[i] = { ...result[i], entityComposition: 'ENTITY_WITH_MAIN' };
                    console.log(`[PostProcess] ALWAYS mode: scene ${i} ENTITY_SOLO→ENTITY_WITH_MAIN`);
                }
            }
        }

        // [FIX] NANO/DETAILED 강제 분할 후처리: AI가 분할을 충분히 하지 않았을 때 코드 레벨에서 강제 분할
        if (format === VideoFormat.NANO || (format === VideoFormat.LONG && longFormSplitType === 'DETAILED')) {
            const splitScenes: any[] = [];
            for (const scene of result) {
                const text = scene.scriptText || "";
                // 문장 단위로 분할 (마침표, 느낌표, 물음표+답변)
                // Universal sentence-ending punctuation: Latin(.!?) CJK(。！？) Arabic(؟) Devanagari(।॥) Myanmar(။) Khmer(។) Ethiopic(።) Armenian(՞՜) Tibetan(།)
                const sentences = text.split(/(?<=[.!?。！？؟।॥။។።՞՜།])\s+/).filter((s: string) => s.trim());

                if (sentences.length <= 1) {
                    splitScenes.push(scene);
                } else {
                    // 물음표(?) 예외: ?로 끝나는 문장은 다음 문장과 병합
                    let i = 0;
                    while (i < sentences.length) {
                        const current = sentences[i].trim();
                        if (/[?？؟՞;⁇⁈‽]$/.test(current.trim()) && i + 1 < sentences.length) {
                            // ? 문장 + 답변 문장을 병합
                            splitScenes.push({
                                ...scene,
                                id: `scene-${Date.now()}-${splitScenes.length}`,
                                scriptText: `${current} ${sentences[i + 1].trim()}`
                            });
                            i += 2;
                        } else {
                            splitScenes.push({
                                ...scene,
                                id: `scene-${Date.now()}-${splitScenes.length}`,
                                scriptText: current
                            });
                            i++;
                        }
                    }
                }
            }
            if (splitScenes.length > result.length) {
                console.log(`[PostProcess] Force-split: ${result.length} → ${splitScenes.length} scenes (${format}/${longFormSplitType})`);
                result = splitScenes;
            }
        }

        // [FIX #265] 안전 캡: targetSceneCount가 설정된 경우, 결과가 target의 120%를 초과하면 초과분 제거
        // AI 과잉 생성 + 강제 분할로 장면 수가 폭증하는 것을 방지
        if (targetSceneCount && targetSceneCount > 0 && result.length > Math.ceil(targetSceneCount * 1.2)) {
            const cap = Math.ceil(targetSceneCount * 1.2);
            console.warn(`[PostProcess] ⚠️ Scene cap: ${result.length} → ${cap} (target: ${targetSceneCount}, 120% cap)`);
            // 가장 짧은 인접 장면들을 병합하여 캡 이내로 축소
            while (result.length > cap && result.length > 1) {
                // 가장 짧은 scriptText를 가진 장면 찾기
                let minLen = Infinity, minIdx = -1;
                for (let i = 0; i < result.length; i++) {
                    const len = (result[i].scriptText || '').length;
                    if (len < minLen) { minLen = len; minIdx = i; }
                }
                if (minIdx < 0) break;
                // 인접 장면과 병합 (다음 장면 우선, 없으면 이전 장면)
                if (minIdx + 1 < result.length) {
                    result[minIdx + 1] = {
                        ...result[minIdx + 1],
                        scriptText: ((result[minIdx].scriptText || '') + ' ' + (result[minIdx + 1].scriptText || '')).trim()
                    };
                    result.splice(minIdx, 1);
                } else if (minIdx > 0) {
                    result[minIdx - 1] = {
                        ...result[minIdx - 1],
                        scriptText: ((result[minIdx - 1].scriptText || '') + ' ' + (result[minIdx].scriptText || '')).trim()
                    };
                    result.splice(minIdx, 1);
                } else {
                    break; // 병합 불가
                }
            }
            // ID 재할당
            result = result.map((s, i) => ({ ...s, id: `scene-${Date.now()}-${i}` }));
        }

        return result;
    };

    // [UPGRADED] Gemini 3.1 Pro — v1 프록시 경유
    const extractAndProcess = (data: any, label: string, skipLineRemap = false): Scene[] => {
        const text = extractTextFromResponse(data);
        if (!text) {
            const reason = data?.candidates?.[0]?.finishReason;
            if (reason === 'SAFETY') throw new Error("⚠️ AI 안전 필터가 응답을 차단했습니다.");
            throw new Error(`${label} 응답 실패 (Empty Response). Reason: ${reason || 'Unknown'}`);
        }
        const result = processResponse(text, skipLineRemap);
        console.log(`[parseScriptToScenes] ${label} → ${result.length} scenes generated (target: ${targetSceneCount})`);
        return result;
    };

    // [FIX #251] 청크 분할 재도입 — 대형 대본(30장면+)에서 브라우저 네트워크 타임아웃 방지
    // 65장면 대본이 단일 요청 시 125초에서 브라우저/프록시 타임아웃으로 실패한 사례 대응
    const CHUNK_SCENE_THRESHOLD = 30;
    const CHUNK_SIZE = 10; // [FIX #258] 25→10: Pro가 10장면을 30~40초에 안정 응답 (125초 프록시 제한 내)
    const CHUNK_COOLDOWN_MS = 2000;
    const CHUNK_CONCURRENCY = 3; // [FIX #258] 최대 3개 청크 병렬 처리
    const shouldChunk = (targetSceneCount || 0) >= CHUNK_SCENE_THRESHOLD;

    if (shouldChunk) {
        // 대본을 로컬 결정론적 분할기로 장면 텍스트 단위로 분할
        const sceneTexts = splitScenesLocally(cleanedScript, format, smartSplit, longFormSplitType);
        const totalChunks = Math.ceil(sceneTexts.length / CHUNK_SIZE);
        console.log(`[parseScriptToScenes] 📦 청크 분할: ${sceneTexts.length}장면 → ${totalChunks}청크 (CHUNK_SIZE=${CHUNK_SIZE})`);
        onChunkProgress?.(0, totalChunks);

        const allScenes: Scene[] = [];
        const CHUNK_TIMEOUT_MS = 60_000; // [FIX #258] 1분 (10장면 기준 Pro 30~40초 응답, 125초 프록시 제한 방지)

        // [FIX #258] Phase 1: 디렉션 시트 생성 — 전체 맥락/캐릭터/타임라인 추출
        // Flash Lite가 대본 전체를 1회 읽고, 각 청크에 전달할 비주얼 기준을 확정
        // → 청크 간 인물 외모/시대/장소/분위기 일관성 보장
        let directionSheet = '';
        try {
            console.log(`[parseScriptToScenes] 🎬 Phase 1: 디렉션 시트 생성 (전체 맥락 파악)...`);
            const dirPrompt = `You are a VISUAL DIRECTOR planning a ${totalChunks}-part storyboard production.
Analyze the ENTIRE script and create a compact Visual Direction Sheet for cross-chunk consistency.
Artists will process ${CHUNK_SIZE} scenes at a time and will NOT see the full script — only their chunk + this sheet.

EXTRACT ALL:
1. TIMELINE: Every time period, location, and weather/environment change with scene number ranges
2. CHARACTERS: ALL recurring people with SPECIFIC visual descriptions (ethnicity, age, build, hair, clothing, distinguishing features)
3. VISUAL_SHIFTS: Where the visual tone/mood/color palette should change
4. ENTITIES: ALL proper nouns — celebrities, brands, landmarks, historical figures, specific places — with scene numbers
5. CONTINUITY: Any detail that MUST stay consistent across scenes (e.g. "rain starts at scene 15 and doesn't stop until scene 30")

Return COMPACT JSON:
{"timeline":[{"s":"1-15","era":"...","loc":"...","weather":"..."}],"characters":{"name":{"look":"ethnicity age clothing features","firstScene":1}},"shifts":[{"s":16,"note":"..."}],"entities":[{"name":"...","type":"person|brand|landmark","s":"3,15"}],"continuity":["..."]}

Script:
${cleanedScript}

${baseSetting ? `[GLOBAL CONTEXT]\n${baseSetting}` : ''}`;

            const dirPayload = {
                contents: [{ role: 'user', parts: [{ text: dirPrompt }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 },
                safetySettings: SAFETY_SETTINGS_BLOCK_NONE
            };
            const dirData = await requestGeminiProxy('gemini-3.1-flash-lite-preview', dirPayload, 0, 30_000);
            directionSheet = extractTextFromResponse(dirData) || '';
            if (directionSheet) {
                console.log(`[parseScriptToScenes] ✅ 디렉션 시트 완료 (${directionSheet.length}자)`);
            }
        } catch (e: any) {
            console.warn(`[parseScriptToScenes] ⚠️ 디렉션 시트 생성 실패 (기존 방식으로 진행): ${e.message?.slice(0, 100)}`);
        }

        // [FIX #258] Phase 2: 청크 병렬 처리 — processChunk 함수 정의
        const processChunk = async (ci: number): Promise<Scene[]> => {
            const chunkSceneTexts = sceneTexts.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE);
            const chunkScript = chunkSceneTexts.join('\n');
            const chunkTarget = chunkSceneTexts.length;

            const dirContext = directionSheet
                ? `\n\n[VISUAL DIRECTION SHEET — CRITICAL: Use this to maintain visual consistency across all chunks]\n${directionSheet}`
                : '';

            const chunkPayload = {
                contents: [{ role: 'user', parts: [{ text: `Script:\n${chunkScript}\n\n[MANDATORY GLOBAL CONTEXT — Apply to EVERY scene as default. Override per-scene ONLY if scene content clearly depicts a different setting.]\n${baseSetting || 'No context provided.'}${dirContext}\n\n[CHUNK OVERRIDE] This is chunk ${ci + 1} of ${totalChunks}. You MUST generate EXACTLY ${chunkTarget} scenes for this chunk. Ignore any other target scene count in the system instructions.` }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
                generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 65536 }
            };

            const MAX_RETRIES = 3;
            let lastError: Error | null = null;
            let chunkResult: Scene[] | null = null;

            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                if (attempt > 0) {
                    const backoffMs = 2000 * Math.pow(3, attempt - 1);
                    const errMsg = lastError?.message || '';
                    const isRetryable = errMsg.includes('Failed to fetch') || errMsg.includes('Network Error') || errMsg.includes('fetch') || errMsg.includes('ERR_NETWORK') || errMsg.includes('524') || errMsg.includes('timeout') || errMsg.includes('타임아웃') || errMsg.includes('Empty Response') || errMsg.includes('네트워크');
                    if (!isRetryable) break;
                    logger.trackRetry(`청크 ${ci + 1}/${totalChunks}`, attempt + 1, MAX_RETRIES, `${backoffMs / 1000}초 대기`);
                    await new Promise(r => setTimeout(r, backoffMs));
                }
                try {
                    console.log(`[parseScriptToScenes] 청크 ${ci + 1}/${totalChunks}: Pro 호출 (시도 ${attempt + 1}/${MAX_RETRIES}, ${chunkTarget}장면)`);
                    const data = await requestGeminiProxy('gemini-3.1-pro-preview', chunkPayload, 0, CHUNK_TIMEOUT_MS);
                    chunkResult = extractAndProcess(data, `Chunk${ci + 1}-Pro`, true);
                    lastError = null;
                    break;
                } catch (e: any) {
                    console.warn(`청크 ${ci + 1} Pro 실패 (attempt ${attempt + 1}):`, e.message?.slice(0, 100));
                    lastError = e;
                }
            }

            // Flash 폴백
            if (lastError) {
                try {
                    console.log(`[parseScriptToScenes] 청크 ${ci + 1}/${totalChunks}: Flash 폴백`);
                    const data = await requestGeminiProxy('gemini-3-flash', chunkPayload, 0, CHUNK_TIMEOUT_MS, { skipNative: true });
                    chunkResult = extractAndProcess(data, `Chunk${ci + 1}-Flash`, true);
                    lastError = null;
                } catch (flashErr: any) {
                    console.warn(`청크 ${ci + 1} Flash 폴백도 실패: ${flashErr.message?.slice(0, 100)}`);
                    lastError = flashErr;
                }
            }

            if (lastError || !chunkResult) {
                const msg = lastError?.message || 'Unknown error';
                const isBalanceError = msg.includes('잔액 부족') || msg.includes('insufficient') || msg.includes('QUOTA_EXHAUSTED');
                if (isBalanceError) {
                    throw new Error(`AI 크레딧이 부족합니다. Evolink 크레딧을 충전한 후 다시 시도해주세요.`);
                }
                throw new Error(`대본 분석 실패 (청크 ${ci + 1}/${totalChunks}): ${msg}`);
            }

            // [FIX #269] 청크별 장면 수 검증 — AI가 chunkTarget보다 많이 생성 시 초과분 병합
            if (chunkResult.length > chunkTarget) {
                console.warn(`[processChunk] ⚠️ 청크 ${ci + 1}: AI가 ${chunkResult.length}장면 생성 (목표: ${chunkTarget}). 초과분 병합 중...`);
                while (chunkResult.length > chunkTarget && chunkResult.length > 1) {
                    let minLen = Infinity, minIdx = -1;
                    for (let i = 0; i < chunkResult.length; i++) {
                        const len = (chunkResult[i].scriptText || '').length;
                        if (len < minLen) { minLen = len; minIdx = i; }
                    }
                    if (minIdx < 0) break;
                    if (minIdx + 1 < chunkResult.length) {
                        chunkResult[minIdx + 1] = {
                            ...chunkResult[minIdx + 1],
                            scriptText: ((chunkResult[minIdx].scriptText || '') + ' ' + (chunkResult[minIdx + 1].scriptText || '')).trim()
                        };
                        chunkResult.splice(minIdx, 1);
                    } else if (minIdx > 0) {
                        chunkResult[minIdx - 1] = {
                            ...chunkResult[minIdx - 1],
                            scriptText: ((chunkResult[minIdx - 1].scriptText || '') + ' ' + (chunkResult[minIdx].scriptText || '')).trim()
                        };
                        chunkResult.splice(minIdx, 1);
                    } else {
                        break;
                    }
                }
                console.log(`[processChunk] ✅ 청크 ${ci + 1}: ${chunkResult.length}장면으로 트리밍 완료`);
            }

            return chunkResult;
        };

        // [FIX #258] 병렬 배치 처리 — CHUNK_CONCURRENCY개씩 동시 실행
        let completedChunks = 0;
        for (let batchStart = 0; batchStart < totalChunks; batchStart += CHUNK_CONCURRENCY) {
            const batchEnd = Math.min(batchStart + CHUNK_CONCURRENCY, totalChunks);
            const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);
            console.log(`[parseScriptToScenes] 🚀 배치 ${Math.floor(batchStart / CHUNK_CONCURRENCY) + 1}: 청크 ${batchIndices.map(i => i + 1).join(',')} 병렬 처리`);

            const batchResults = await Promise.all(batchIndices.map(ci => processChunk(ci)));

            for (const result of batchResults) {
                allScenes.push(...result);
            }
            completedChunks += batchIndices.length;
            onChunkProgress?.(completedChunks, totalChunks);

            // 배치 간 쿨다운 (429 Rate Limit 방지, 마지막 배치 후 스킵)
            if (batchEnd < totalChunks) {
                console.log(`[parseScriptToScenes] 배치 쿨다운: ${CHUNK_COOLDOWN_MS / 1000}초`);
                await new Promise(r => setTimeout(r, CHUNK_COOLDOWN_MS));
            }
        }

        // [FIX #269] 청크 병합 후 최종 장면 수 검증 — 로컬 분할 수와 일치하도록 보정
        const expectedTotal = sceneTexts.length;
        if (allScenes.length > expectedTotal) {
            console.warn(`[PostProcess-Chunked] ⚠️ 병합 후 장면 수 초과: ${allScenes.length} → ${expectedTotal} (초과분 ${allScenes.length - expectedTotal}개 병합)`);
            while (allScenes.length > expectedTotal && allScenes.length > 1) {
                let minLen = Infinity, minIdx = -1;
                for (let i = 0; i < allScenes.length; i++) {
                    const len = (allScenes[i].scriptText || '').length;
                    if (len < minLen) { minLen = len; minIdx = i; }
                }
                if (minIdx < 0) break;
                if (minIdx + 1 < allScenes.length) {
                    allScenes[minIdx + 1] = {
                        ...allScenes[minIdx + 1],
                        scriptText: ((allScenes[minIdx].scriptText || '') + ' ' + (allScenes[minIdx + 1].scriptText || '')).trim()
                    };
                    allScenes.splice(minIdx, 1);
                } else if (minIdx > 0) {
                    allScenes[minIdx - 1] = {
                        ...allScenes[minIdx - 1],
                        scriptText: ((allScenes[minIdx - 1].scriptText || '') + ' ' + (allScenes[minIdx].scriptText || '')).trim()
                    };
                    allScenes.splice(minIdx, 1);
                } else {
                    break;
                }
            }
            // ID 재할당
            for (let i = 0; i < allScenes.length; i++) {
                allScenes[i] = { ...allScenes[i], id: `scene-${Date.now()}-${i}` };
            }
            console.log(`[PostProcess-Chunked] ✅ 최종 장면 수: ${allScenes.length} (목표: ${expectedTotal})`);
        }

        // [CRITICAL] 청크 병합 후 캐릭터 빈도 재적용 — MAIN 사이 최소 2씬 갭 (청크 경계에서 갭 위반 가능)
        if (appearance === CharacterAppearance.AUTO) {
            const MIN_GAP = 2;
            let gapSinceLastMain = MIN_GAP + 1;
            let fixCount = 0;
            for (let i = 0; i < allScenes.length; i++) {
                if (allScenes[i].castType === 'KEY_ENTITY') continue;
                if (allScenes[i].castType === 'MAIN') {
                    if (gapSinceLastMain < MIN_GAP) {
                        allScenes[i] = { ...allScenes[i], castType: 'NOBODY', characterPresent: false, characterAction: '' };
                        fixCount++;
                        gapSinceLastMain++;
                    } else { gapSinceLastMain = 0; }
                } else { gapSinceLastMain++; }
            }
            console.log(`[PostProcess-Chunked] AUTO mode re-enforced: ${fixCount} scene(s) fixed (min gap: ${MIN_GAP}) across ${allScenes.length} scenes`);
        } else if (appearance === CharacterAppearance.MINIMAL) {
            const maxMain = Math.max(2, Math.round(allScenes.length * 0.1));
            let mainCount = 0;
            for (let i = 0; i < allScenes.length; i++) {
                if (allScenes[i].castType === 'KEY_ENTITY') continue;
                if (allScenes[i].castType === 'MAIN') {
                    if (mainCount >= maxMain) {
                        allScenes[i] = { ...allScenes[i], castType: 'NOBODY', characterPresent: false, characterAction: '' };
                    } else { mainCount++; }
                }
            }
            console.log(`[PostProcess-Chunked] MINIMAL mode re-enforced: ${mainCount}/${maxMain} MAIN kept`);
        }

        // Entity composition 전체 로테이션 재적용
        const ENTITY_COMPS = ['ENTITY_SOLO', 'ENTITY_WITH_MAIN', 'MAIN_OBSERVING', 'ENTITY_FG_MAIN_BG', 'MAIN_FG_ENTITY_BG'] as const;
        let ecIdx = 0, lastEc = '';
        for (let i = 0; i < allScenes.length; i++) {
            if (allScenes[i].castType === 'KEY_ENTITY') {
                if (!allScenes[i].entityComposition || allScenes[i].entityComposition === lastEc) {
                    allScenes[i] = { ...allScenes[i], entityComposition: ENTITY_COMPS[ecIdx % ENTITY_COMPS.length] };
                }
                lastEc = allScenes[i].entityComposition || '';
                ecIdx++;
                if (appearance === CharacterAppearance.ALWAYS && allScenes[i].entityComposition === 'ENTITY_SOLO') {
                    allScenes[i] = { ...allScenes[i], entityComposition: 'ENTITY_WITH_MAIN' };
                }
            }
        }

        scenes = allScenes;
        console.log(`[parseScriptToScenes] ✅ 청크 처리 완료: ${scenes.length}장면 (${totalChunks}청크)`);
    } else {
        // [기존 로직] 단일 요청 (30장면 미만)
        console.log(`[parseScriptToScenes] 📝 대본 전체 전송 (${cleanedScript.length}자) — 단일 요청`);
        const SCRIPT_TIMEOUT_MS = 90_000; // [FIX #258] 1.5분 (30장면 미만은 Pro가 충분히 처리 가능, 기존 300초는 프록시 125초 제한에 무의미)
        const MAX_SHORT_RETRIES = 3;
        let lastShortError: Error | null = null;
        for (let attempt = 0; attempt < MAX_SHORT_RETRIES; attempt++) {
            if (attempt > 0) {
                const backoffMs = 2000 * Math.pow(3, attempt - 1);
                const errMsg = lastShortError?.message || '';
                const isNetworkError = errMsg.includes('Failed to fetch') || errMsg.includes('Network Error') || errMsg.includes('fetch') || errMsg.includes('ERR_NETWORK');
                const isTimeoutError = errMsg.includes('524') || errMsg.includes('timeout') || errMsg.includes('타임아웃');
                const isEmptyResponse = errMsg.includes('Empty Response');
                if (!isNetworkError && !isTimeoutError && !isEmptyResponse && !errMsg.includes('네트워크')) {
                    break;
                }
                logger.trackRetry('스크립트 파싱', attempt + 1, MAX_SHORT_RETRIES, `네트워크/타임아웃 오류 — ${backoffMs / 1000}초 대기`);
                console.log(`[parseScriptToScenes] 재시도 대기: ${backoffMs / 1000}초 (시도 ${attempt + 1}/${MAX_SHORT_RETRIES})`);
                await new Promise(r => setTimeout(r, backoffMs));
            }
            try {
                console.log(`[parseScriptToScenes] Gemini 3.1 Pro 호출 (시도 ${attempt + 1}/${MAX_SHORT_RETRIES})`);
                const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload, 0, SCRIPT_TIMEOUT_MS);
                scenes = extractAndProcess(data, 'Gemini3.1-Pro');
                lastShortError = null;
                break;
            } catch (e: any) {
                console.warn(`Phase 1 (Pro) Failed (attempt ${attempt + 1}):`, e.message?.slice(0, 100));
                lastShortError = e;
            }
        }
        if (lastShortError) {
            try {
                console.log(`[parseScriptToScenes] Flash 폴백 시도`);
                logger.info(`[parseScriptToScenes] Flash 폴백 시도`, { lastError: lastShortError.message?.slice(0, 100) });
                const data = await requestGeminiProxy('gemini-3-flash', payload, 0, SCRIPT_TIMEOUT_MS, { skipNative: true });
                scenes = extractAndProcess(data, 'Gemini-Flash');
                lastShortError = null;
            } catch (flashErr: any) {
                console.warn(`[parseScriptToScenes] Flash 폴백도 실패: ${flashErr.message?.slice(0, 100)}`);
            }
        }
        if (lastShortError) {
            const msg = lastShortError.message || '';
            const isBalanceError = msg.includes('잔액 부족') || msg.includes('insufficient') || msg.includes('QUOTA_EXHAUSTED');
            const isNetworkError = msg.includes('Failed to fetch') || msg.includes('Network Error') || msg.includes('fetch');
            const isTimeoutError = msg.includes('524') || msg.includes('timeout') || msg.includes('타임아웃');
            if (isBalanceError) {
                throw new Error(`AI 크레딧이 부족합니다. Evolink 크레딧을 충전한 후 다시 시도해주세요.`);
            } else if (isNetworkError) {
                throw new Error(`대본 분석 실패 (네트워크 오류): 인터넷 연결을 확인해주세요. ${MAX_SHORT_RETRIES}회 재시도했으나 서버에 접속할 수 없습니다.`);
            } else if (isTimeoutError) {
                throw new Error(`대본 분석 실패 (시간 초과): 서버가 응답하지 않습니다. 잠시 후 다시 시도해주세요.`);
            } else {
                throw new Error(`대본 분석 실패 (모든 엔진): ${msg}`);
            }
        }
    }

    // [REMOVED] Phase 2: Entity Enrichment — NanoBanana 2가 직접 웹 검색하므로 불필요

    return scenes;
};
