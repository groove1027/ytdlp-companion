
import { evolinkChat, EvolinkChatMessage } from '../evolinkService';
import { analyzeCharacterImage } from '../characterAnalysisService';
import { logger } from '../LoggerService';
import { analyzeVideoWithGemini } from './videoAnalysis';

// [MIGRATED] analyzeImageUnified now delegates to characterAnalysisService.ts (evolinkChat)
// Previously used legacy requestGeminiProxy — now uses the standard evolinkChat pathway
export const analyzeImageUnified = async (base64: string): Promise<{ style: string; character: string }> => {
    // Ensure the image is a full data URL for evolinkChat's image_url format
    const imageUrl = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;

    // Delegate to the canonical character analysis service (evolinkChat-based)
    const result = await analyzeCharacterImage(imageUrl);

    // Sanitization: remove background-related descriptions from results
    const forbidden = /white background|simple background|isolated on white|transparent background|flat background|isolated|cutout/gi;

    const cleanStyle = (result.style || '').replace(forbidden, '').replace(/,\s*,/g, ',').trim();
    const cleanChar = (result.character || '').replace(forbidden, '').replace(/,\s*,/g, ',').trim();

    return { style: cleanStyle, character: cleanChar };
};

// [ENHANCED v4] generatePromptFromScript: Copy art style from adjacent scenes exactly
export const generatePromptFromScript = async (
    script: string,
    style: string,
    textLock?: boolean,
    context?: {
        prevSceneText?: string;
        nextSceneText?: string;
        prevScenePrompt?: string;
        nextScenePrompt?: string;
        globalContext?: string;
        characterDesc?: string;
    }
): Promise<string> => {
    // Use the closest adjacent prompt as the style template
    const templatePrompt = context?.prevScenePrompt || context?.nextScenePrompt;

    const refParts: string[] = [];
    if (context?.globalContext) {
        refParts.push(`[Global Context]: ${context.globalContext}`);
    }
    if (context?.characterDesc) {
        refParts.push(`[Character Appearance]: ${context.characterDesc}`);
    }

    // If we have a template, give explicit instructions to copy its style
    if (templatePrompt) {
        refParts.push(`[STYLE TEMPLATE — You MUST copy the art medium and rendering style from this prompt]:\n${templatePrompt}`);
        if (context?.prevScenePrompt && context?.nextScenePrompt && context.prevScenePrompt !== context.nextScenePrompt) {
            refParts.push(`[Next Scene Prompt (additional reference)]:\n${context.nextScenePrompt}`);
        }
    }
    const refBlock = refParts.length > 0 ? '\n' + refParts.join('\n\n') : '';

    const systemContent = templatePrompt
        ? `You generate image prompts for a storyboard. A STYLE TEMPLATE prompt from an adjacent scene is provided.

CRITICAL RULES:
1. Your output MUST use the SAME art medium and rendering style as the STYLE TEMPLATE. If the template uses "cartoon illustration, bold outlines, flat colors", you MUST also use "cartoon illustration, bold outlines, flat colors". If it uses "photorealistic, 8k", you MUST also use "photorealistic, 8k". COPY the style keywords exactly.
2. Change ONLY the subject/content to match the current scene script. The art style, color palette, lighting approach, and visual medium must stay identical to the template.
3. Do NOT bleed in subjects or objects from the template — only copy its STYLE.
4. ${textLock ? 'Include key text/numbers if relevant.' : 'Do NOT include any text in the image.'}

Output ONLY the English image prompt (40-80 words). No explanations.`
        : `You generate image prompts for a storyboard.

Rules:
1. Apply the given visual style exactly.
2. Depict ONLY what the current script says.
3. ${textLock ? 'Include key text/numbers if relevant.' : 'Do NOT include any text in the image.'}

Output ONLY the English image prompt (40-80 words). No explanations.`;

    const messages: EvolinkChatMessage[] = [
        { role: 'system', content: systemContent },
        {
            role: 'user',
            content: `Style: ${style}
${refBlock}

[Current Scene Script]:
${script}`
        }
    ];

    // [OPT] Flash Lite로 전환 — 40~80단어 영어 프롬프트 변환은 Pro 불필요, 비용↓ 속도↑
    const response = await evolinkChat(messages, { temperature: 0.5, maxTokens: 1024, model: 'gemini-3.1-flash-lite-preview' });
    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) {
        throw new Error('[generatePromptFromScript] Empty response from evolinkChat');
    }
    return text;
};

export const analyzeVideoContent = async (file: File, extractKeyframes: boolean, atmosphere?: string, userInstructions?: string) => {
    return analyzeVideoWithGemini({ videoFile: file }, atmosphere || 'Cinematic', 'VISUAL', userInstructions);
};

export const analyzeVideoHybrid = async (file: File, atmosphere: string, userInstructions?: string) => {
    return analyzeVideoWithGemini({ videoFile: file }, atmosphere, 'NARRATIVE', userInstructions);
};

// [MIGRATED] analyzeStyleReference: evolinkChat multimodal (image + text)
export const analyzeStyleReference = async (base64: string): Promise<string> => {
    // Ensure full data URL — detect mime type from base64 header if present
    const imageUrl = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;

    const promptText = `Analyze the image **DESIGN DNA** in extreme technical detail for replication.

**CRITICAL TASK**: Extract style parameters so a designer can recreate this exact look. Focus on **STRUCTURE** and **DECORATION**, ignore specific content (faces, text meaning).

1. **[STRUCTURAL ELEMENTS]**: Look for ribbons, banners, text boxes, shapes behind text, or badges (e.g., "Top-left red ribbon", "Black box behind text", "Circle badge"). Describe their shape, color, and position accurately.
2. **[TYPOGRAPHY]**: Font Family (Serif/Sans/Script/Handwritten), Weight (Bold/Thin), Width (Condensed/Wide), Kerning (Tight/Loose). Describe the font's personality (e.g., 'Aggressive Grunge', 'Clean Corporate', 'Playful Rounded').
3. **[TEXT EFFECTS]**: Stroke (color/thickness), Drop Shadow (offset/blur/color), Glow (neon/soft), 3D Depth, Gradient Fill on text.
4. **[COLOR PALETTE]**: Extract exact Hex codes for text, background, and accents. Describe gradient directions (e.g., 'Yellow to Orange Vertical Gradient').
5. **[LAYOUT & COMPOSITION]**: Where is text usually placed? How does it interact with the subject?
6. **[BACKGROUND TREATMENT]**: Is there a vignette? A solid color bar? A gradient overlay behind text for readability?
7. **[IGNORED ELEMENTS]**: Do NOT describe the specific person, the specific text meaning, or any channel logos/watermarks in the corner.

Return a structured description string.`;

    const messages: EvolinkChatMessage[] = [
        {
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: imageUrl } },
                { type: 'text', text: promptText }
            ]
        }
    ];

    const response = await evolinkChat(messages, { temperature: 0.3, maxTokens: 2048 });
    const text = response.choices?.[0]?.message?.content?.trim();

    if (!text) {
        logger.warn('[analyzeStyleReference] Empty response from evolinkChat');
        return '';
    }

    return text;
};
