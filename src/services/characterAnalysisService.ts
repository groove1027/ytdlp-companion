
import { evolinkChat, EvolinkChatMessage } from './evolinkService';
import { logger } from './LoggerService';

export interface CharacterAnalysisResult {
    combined: string;
    style: string;
    character: string;
}

/**
 * Evolink Gemini 3.1 Pro를 이용한 캐릭터 이미지 분석
 * - 예술 스타일 + 시각적 특징을 구조화된 JSON으로 반환
 * - 결과는 이미지 생성 프롬프트에 자동 주입되어 캐릭터 일관성 향상
 */
export const analyzeCharacterImage = async (
    imageBase64OrUrl: string
): Promise<CharacterAnalysisResult> => {
    logger.info('[CharacterAnalysis] 캐릭터 이미지 분석 시작');

    const imageUrl = imageBase64OrUrl.startsWith('data:')
        ? imageBase64OrUrl
        : imageBase64OrUrl;

    const messages: EvolinkChatMessage[] = [
        {
            role: 'system',
            content: 'You are an expert character art analyst. You MUST respond with ONLY a valid JSON object — no preamble, no markdown, no explanation. The JSON must have exactly two keys: "style" and "character".'
        },
        {
            role: 'user',
            content: [
                {
                    type: 'image_url',
                    image_url: { url: imageUrl }
                },
                {
                    type: 'text',
                    text: `Analyze this image in extreme detail.

CRITICAL INSTRUCTION: The input image might have a removed/white background.
1. IGNORE the background completely. Do NOT mention 'white background', 'simple background', 'isolated', or 'transparent'.
2. Focus ONLY on the character's design (hair, eyes, clothes, accessories, body type) and the artistic rendering style (lighting, texture, brushwork, 3d render style).

Describe the art style in detail (painting technique, rendering method, line art style, color palette, shading method, lighting, texture, distinctive artistic influences). 80-150 words.
Describe the character in detail (hair color/length/style/texture, eyes color/shape/expression, face shape/skin tone/expression/glasses, body build/posture/proportions, clothing each garment type/color/pattern/fit, accessories with colors and styles, any distinctive marks). 80-150 words.

Be extremely thorough and specific. Do NOT use vague terms like "normal" or "standard". Describe exactly what you see.

Return JSON: { "style": "<art style description>", "character": "<character features description>" }`
                }
            ]
        }
    ];

    const response = await evolinkChat(messages, {
        temperature: 0.3,
        maxTokens: 2500,
        responseFormat: { type: 'json_object' }
    });

    // Cost is now auto-tracked inside evolinkChat()

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) {
        throw new Error('캐릭터 분석 결과가 비어있습니다.');
    }

    // Clean a value string: normalize whitespace, strip wrapping quotes
    const cleanValue = (val: string): string =>
        val.replace(/\\n/g, ' ').replace(/\\r/g, '').replace(/\\t/g, ' ')
           .replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ').trim();

    // Step 1: Strip markdown code fences, extract JSON object
    const stripped = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : stripped;

    let style = '';
    let character = '';

    // Step 2: Try JSON.parse — direct, then with newline fix
    try {
        const parsed = JSON.parse(jsonStr);
        style = cleanValue(String(parsed.style || ''));
        character = cleanValue(String(parsed.character || ''));
    } catch {
        // AI 응답에 literal newline/tab이 JSON 값 내부에 포함된 경우 → 공백으로 치환 후 재시도
        try {
            const fixed = jsonStr.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ');
            const parsed = JSON.parse(fixed);
            style = cleanValue(String(parsed.style || ''));
            character = cleanValue(String(parsed.character || ''));
        } catch {
            logger.warn('[CharacterAnalysis] JSON 파싱 실패, 정규식 폴백 시도');
        }
    }

    // Step 3: Regex fallback for any missing field
    if (!style) {
        const m = raw.match(/"style"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/i);
        if (m) style = cleanValue(m[1].replace(/\\"/g, '"'));
    }
    if (!character) {
        const m = raw.match(/"character"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/i);
        if (m) character = cleanValue(m[1].replace(/\\"/g, '"'));
    }

    // Step 4: Greedy extraction — character is typically the last field
    if (!character) {
        const m = raw.match(/"character"\s*:\s*"?([\s\S]+)/i);
        if (m) character = cleanValue(m[1].replace(/["{}}\s]+$/, '').replace(/\\"/g, '"'));
    }
    if (!style) {
        // Try with character lookahead first, then without (truncated response)
        let m = raw.match(/"style"\s*:\s*"?([\s\S]+?)(?=,?\s*"character")/i);
        if (!m) m = raw.match(/"style"\s*:\s*"?([\s\S]+)/i);
        if (m) style = cleanValue(m[1].replace(/["{}}\s]+$/, '').replace(/\\"/g, '"'));
    }

    // Step 5: Plain text key:value fallback
    if (!style && !character) {
        const sm = raw.match(/style\s*[:=]\s*([\s\S]+?)(?=character\s*[:=]|$)/i);
        const cm = raw.match(/character\s*[:=]\s*([\s\S]+)$/i);
        if (sm) style = cleanValue(sm[1].replace(/[{}"]/g, ''));
        if (cm) character = cleanValue(cm[1].replace(/[{}"]/g, ''));
    }

    // Step 6: Last resort — use full response text
    if (!style && !character) {
        const combined = stripped.replace(/[{}"]/g, '').replace(/\b(?:style|character)\s*:\s*/gi, '').trim();
        return { combined, style: combined, character: '' };
    }

    const combined = [style, character].filter(Boolean).join(' | ');
    logger.success('[CharacterAnalysis] 분석 완료', { style: style.length, character: character.length });
    return { combined, style, character };
};
