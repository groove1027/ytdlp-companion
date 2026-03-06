
import { Scene, VideoFormat, CharacterAppearance } from '../../types';
import { requestGeminiProxy, extractTextFromResponse, extractFunctionCall, performMockSearch, SAFETY_SETTINGS_BLOCK_NONE } from './geminiProxy';
import { evolinkChat } from '../evolinkService';

// [NEW] Robust JSON Extraction — handles thinking model markdown output
export const extractJsonFromText = (text: string): string | null => {
    // 1. Already valid JSON
    try { JSON.parse(text); return text; } catch {}
    // 2. Extract from markdown code blocks: ```json ... ``` or ``` ... ```
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try { JSON.parse(codeBlockMatch[1].trim()); return codeBlockMatch[1].trim(); } catch {}
    }
    // 3. Find JSON object in text
    const objMatch = text.match(/(\{[\s\S]*\})/);
    if (objMatch) {
        try { JSON.parse(objMatch[1]); return objMatch[1]; } catch {}
    }
    // 4. Find JSON array in text
    const arrMatch = text.match(/(\[[\s\S]*\])/);
    if (arrMatch) {
        try { JSON.parse(arrMatch[1]); return arrMatch[1]; } catch {}
    }
    return null;
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
        const sentences = segments[si]
            .split(sentenceSplitRe).filter(s => s.trim());
        if (sentences.length === 0) {
            result.push({ segIdx: si, text: segments[si] });
        } else {
            for (const s of sentences) {
                result.push({ segIdx: si, text: s });
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
            // 숏폼: 45자 타겟, 연결어미 분할, 10자 미만 병합
            {
                let count = 0;
                for (const t of tagged) {
                    count += splitKoreanClauses(t.text, 45, 10).length;
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
            // 숏폼: 45자 타겟, 연결어미 분할, 10자 미만 병합
            for (const t of tagged) {
                scenes.push(...splitKoreanClauses(t.text, 45, 10));
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

// [NEW] Specialized Function for Entity Grounding (Single Step)
// This calls Gemini Pro WITH tools to get visual details for a specific entity
const enrichEntityDetail = async (entityName: string, baseContext: string): Promise<string> => {
    const systemPrompt = `
    You are a visual design expert.
    Your task: Find the specific, current visual appearance of "${entityName}".
    Context: ${baseContext}

    1. If the entity is a famous person/brand/object, use the 'googleSearch' tool to find their most recognizable or current look.
    2. If the entity is generic, describe a high-quality standard version.
    3. Output: A concise, comma-separated visual description string (English) suitable for an image generation prompt.
    `;

    // Maintain conversation for the tool loop
    let conversationHistory: any[] = [
        { role: 'user', parts: [{ text: `Describe the visual appearance of: ${entityName}` }] }
    ];

    let maxTurns = 3;
    let finalDescription = "";

    while (maxTurns > 0) {
        const payload = {
            contents: conversationHistory,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [{ googleSearch: {} }], // Enable Search Tool HERE
            safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
        };

        try {
            const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);

            // Check for Function Call
            const functionCall = extractFunctionCall(data);
            if (functionCall) {
                const searchResult = await performMockSearch(functionCall.args.query || entityName);

                conversationHistory.push({
                    role: 'model',
                    parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }]
                });
                conversationHistory.push({
                    role: 'function',
                    parts: [{ functionResponse: { name: functionCall.name, response: { name: functionCall.name, content: searchResult } } }]
                });
                maxTurns--;
                continue;
            }

            // Check for Text
            const text = extractTextFromResponse(data);
            if (text) {
                finalDescription = text;
                break;
            }
            break; // No text, no function => Exit
        } catch (e) {
            console.warn(`[EntityEnrichment] Failed for ${entityName}`, e);
            break; // Fail gracefully
        }
    }

    return finalDescription || entityName; // Fallback to name if failed
};

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
    // API 문서: Laozhang v1beta는 이미지생성/비디오분석 전용, 텍스트는 v1/chat/completions만
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
    targetSceneCount?: number // [NEW] 예상 컷수 — 이 수치에 맞춰 장면 분할 강제
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
       - **Limit**: Character ('MAIN') is STRICTLY FORBIDDEN from appearing in 2 consecutive scenes.
       - **Rule**: You MUST alternate. After 1 character scene, the NEXT scene MUST be 'NOBODY', 'EXTRA', or 'KEY_ENTITY' (B-Roll/Insert).
       - **Pacing**: Create a breathing rhythm (Character -> Visual/Entity -> Character -> Visual/Entity).
       - **Variety**: If character appears twice in a row (ONLY if absolutely unavoidable), the second shot MUST have a drastically different 'shotSize' and 'cameraAngle'.
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
        "sceneCulture": "Cultural background for THIS scene (e.g. 'Chinese Imperial', 'Korean Traditional')"
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
        const parsed = JSON.parse(jsonText || '[]');

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
            // Placeholder for enrichment
            entityVisualContext: ""
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

        // [CRITICAL FIX] AUTO 캐릭터 빈도 강제 적용 — 최대 1회만 MAIN 허용
        // AUTO 모드: MAIN 1회 초과 절대 금지 → 첫 번째 MAIN만 유지, 나머지는 NOBODY로 강제 전환
        // KEY_ENTITY는 예외 — 유명인/브랜드/장소는 반드시 표시되어야 함
        if (appearance === CharacterAppearance.AUTO) {
            let mainCount = 0;
            for (let i = 0; i < result.length; i++) {
                // KEY_ENTITY는 건너뜀 — 유명인/브랜드/장소는 항상 표시
                if (result[i].castType === 'KEY_ENTITY') continue;
                if (result[i].castType === 'MAIN') {
                    if (mainCount >= 1) {
                        result[i] = {
                            ...result[i],
                            castType: 'NOBODY',
                            characterPresent: false,
                            characterAction: '',
                        };
                        console.log(`[PostProcess] AUTO castType fix: scene ${i} forced MAIN→NOBODY (max 1 MAIN exceeded, count=${mainCount})`);
                    } else {
                        mainCount++;
                    }
                }
            }
            console.log(`[PostProcess] AUTO mode: ${mainCount} MAIN scene(s) kept, rest forced to NOBODY`);
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

        return result;
    };

    // [UPGRADED] Gemini 3.1 Pro — v1 프록시 경유
    const extractAndProcess = (data: any, label: string): Scene[] => {
        const text = extractTextFromResponse(data);
        if (!text) {
            const reason = data?.candidates?.[0]?.finishReason;
            if (reason === 'SAFETY') throw new Error("⚠️ AI 안전 필터가 응답을 차단했습니다.");
            throw new Error(`${label} 응답 실패 (Empty Response). Reason: ${reason || 'Unknown'}`);
        }
        const result = processResponse(text);
        console.log(`[parseScriptToScenes] ${label} → ${result.length} scenes generated (target: ${targetSceneCount})`);
        return result;
    };

    // === 대형 대본 청크 분할 (Cloudflare 524 타임아웃 방지) ===
    const CHUNK_MAX_CHARS = 5000;

    if (cleanedScript.length > CHUNK_MAX_CHARS) {
        console.log(`[parseScriptToScenes] 📐 대형 대본 감지 (${cleanedScript.length}자) — 청크 분할 처리`);

        // 단락 경계에서 분할
        const paragraphs = cleanedScript.split(/\n\n+/);
        const chunks: string[] = [];
        let currentChunk = '';
        for (const para of paragraphs) {
            if ((currentChunk + '\n\n' + para).length > CHUNK_MAX_CHARS && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = para;
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + para;
            }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        console.log(`[parseScriptToScenes] ${chunks.length}개 청크로 분할 (${chunks.map(c => c.length + '자').join(', ')})`);

        const allRawScenes: any[] = [];
        for (let ci = 0; ci < chunks.length; ci++) {
            // evolinkChat 사용 (OpenAI-compatible, 524 타임아웃 내성 높음)
            const chunkSysPrompt = (payload.systemInstruction as any)?.parts?.[0]?.text || '';
            const chunkUserContent = `Script (Part ${ci + 1}/${chunks.length}):\n${chunks[ci]}\n\n[MANDATORY GLOBAL CONTEXT]\n${baseSetting || 'No context provided.'}`;

            let chunkScenes: any[] = [];
            // 최대 3회 재시도 (524 타임아웃 대응)
            for (let retry = 0; retry < 3; retry++) {
                try {
                    console.log(`[parseScriptToScenes] 청크 ${ci + 1}/${chunks.length} (${chunks[ci].length}자) → evolinkChat (시도 ${retry + 1})`);
                    const res = await evolinkChat(
                        [
                            { role: 'system', content: chunkSysPrompt },
                            { role: 'user', content: chunkUserContent }
                        ],
                        { temperature: 0.3, maxTokens: 16000, responseFormat: { type: 'json_object' } }
                    );
                    const content = res.choices?.[0]?.message?.content || '';
                    if (!content) throw new Error('Empty Response');

                    // JSON 파싱 (다양한 포맷 지원)
                    let parsed: any;
                    try {
                        parsed = JSON.parse(content);
                    } catch {
                        const jsonText = extractJsonFromText(content);
                        parsed = JSON.parse(jsonText || '[]');
                    }
                    // { scenes: [...] } 또는 [...] 둘 다 지원
                    const scenes = Array.isArray(parsed) ? parsed : (parsed.scenes || [parsed]);
                    if (scenes.length > 0) {
                        chunkScenes = scenes;
                        break;
                    }
                } catch (ce: any) {
                    const msg = ce.message || '';
                    console.warn(`[parseScriptToScenes] 청크 ${ci + 1} 실패 (시도 ${retry + 1}): ${msg.slice(0, 100)}`);
                    if (msg.includes('524') || msg.includes('timeout') || msg.includes('네트워크')) {
                        if (retry < 2) { await new Promise(r => setTimeout(r, 5000)); continue; }
                    }
                    if (retry === 2) throw new Error(`청크 ${ci + 1} 파싱 실패: ${msg}`);
                }
            }

            allRawScenes.push(...chunkScenes);
            console.log(`[parseScriptToScenes] 청크 ${ci + 1}: ${chunkScenes.length}개 장면 (누적 ${allRawScenes.length}개)`);
        }

        // 합쳐진 장면 배열을 기존 후처리에 전달 (skipLineRemap=true: 청크별 scriptText 보존)
        scenes = processResponse(JSON.stringify(allRawScenes), true);
        console.log(`[parseScriptToScenes] 청크 합산 → ${scenes.length} scenes`);
    } else {
        // === 기존 로직 (짧은 대본) ===
        try {
            // 1차: Gemini 3.1 Pro (최고 품질)
            console.log('[parseScriptToScenes] 🧠 Gemini 3.1 Pro 호출');
            const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
            scenes = extractAndProcess(data, 'Gemini3.1-Pro');
        } catch (e: any) {
            console.warn("Phase 1 (Pro) Failed:", e);
            try {
                // 2차: Gemini 3.1 Pro 재시도 (최종 폴백)
                console.log('[parseScriptToScenes] 🔄 Gemini 3.1 Pro 최종 폴백');
                const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
                scenes = extractAndProcess(data, 'Gemini3.1-Pro-Retry');
            } catch (proxyError: any) {
                console.error("All models failed:", proxyError);
                throw new Error(`대본 분석 실패 (모든 엔진): ${e.message}`);
            }
        }
    }

    // --- PHASE 2: ENTITY ENRICHMENT (SEQUENTIAL GROUNDING) ---
    // Iterate through scenes and enrich ONLY Key Entities using tools.
    // We run this sequentially or in small batches to be safe.

    console.log("[ScriptMode] Starting Phase 2: Entity Enrichment...");

    // Filter indices that need enrichment to save API calls
    const scenesToEnrich = scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.castType === 'KEY_ENTITY' && s.entityName);

    // [PERF] Process enrichment in parallel (was sequential for-loop)
    if (scenesToEnrich.length > 0) {
        const enrichResults = await Promise.allSettled(
            scenesToEnrich.map(({ s }) => {
                console.log(`[Enrichment] Searching for: ${s.entityName}`);
                return enrichEntityDetail(s.entityName!, baseSetting || "");
            })
        );

        enrichResults.forEach((result, idx) => {
            const sceneIndex = scenesToEnrich[idx].i;
            if (result.status === 'fulfilled') {
                scenes[sceneIndex].entityVisualContext = result.value;
            } else {
                console.warn(`[Enrichment] Failed for ${scenesToEnrich[idx].s.entityName}, skipping...`);
            }
        });
    }

    return scenes;
};
