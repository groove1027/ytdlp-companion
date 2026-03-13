
import { AspectRatio } from '../../types';
import { requestGeminiProxy, extractTextFromResponse, SAFETY_SETTINGS_BLOCK_NONE } from './geminiProxy';
import { getAdaptiveFont, isBlackAndWhiteStyle, getStyleNegativePrompt, getTextPresetPrompt, getFontHintPrompt, getTextScalePrompt, getTextPositionPrompt } from './promptHelpers';
import { THUMBNAIL_TEXT_PRESETS, THUMBNAIL_FONT_HINTS } from '../../constants';
import { generateKieImage, generateEvolinkImageWrapped } from '../VideoGenService';
import { logger } from '../LoggerService';
export const generateCharacterDialogue = async (script: string, visual: string) => {
    const payload = {
        contents: [{
            role: 'user' as const,
            parts: [{
                text: `Generate dialogue and SFX. Script: ${script}. Visual: ${visual}. Return JSON: { dialogue: string, sfx: string }`
            }]
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.5, maxOutputTokens: 300 },
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE, // [UPDATED] Apply Safety Settings
        _reasoningEffort: "low" // [PERF] Simple dialogue JSON
    };
    const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
    const text = extractTextFromResponse(data);
    try {
        return JSON.parse(text || '{}');
    } catch (e) {
        logger.trackSwallowedError('thumbnailService:generateCharacterDialogue', e);
        console.warn('[generateCharacterDialogue] JSON parse failed, returning empty object');
        return {};
    }
};

export const sanitizePromptWithGemini = async (prompt: string) => {
    const payload = {
        contents: [{
            role: 'user' as const,
            parts: [{
                text: `Sanitize this prompt. Remove NSFW. Return prompt. Prompt: ${prompt}`
            }]
        }],
        generationConfig: { maxOutputTokens: 2000 },
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE, // [UPDATED] Apply Safety Settings
        _reasoningEffort: "low" // [PERF] Simple text transform
    };
    const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
    const text = extractTextFromResponse(data);
    return text || prompt;
};

export const editThumbnailText = async (imgUrl: string, text: string, ratio: AspectRatio, style: string) => {
    return generateKieImage(`Add text "${text}"`, ratio, imgUrl);
};

// [NEW] Styled Text Edit — 풍부한 프리셋/폰트/색상/위치/스케일 지원
export const editThumbnailTextStyled = async (
    imgUrl: string, text: string, ratio: AspectRatio, style: string,
    presetId?: string, fontHintId?: string, primaryColor?: string,
    position?: string, scale?: number
) => {
    const presetPrompt = presetId ? getTextPresetPrompt(presetId, THUMBNAIL_TEXT_PRESETS) : '';
    const fontPrompt = fontHintId ? getFontHintPrompt(fontHintId, THUMBNAIL_FONT_HINTS) : '';
    const scalePrompt = scale ? getTextScalePrompt(scale) : '';
    const positionPrompt = position ? getTextPositionPrompt(position) : '';

    const colorInstruction = primaryColor
        ? `[TEXT COLOR]: Fill text with exactly ${primaryColor}. (Exact Hex Color Match), (No color bleeding).`
        : '';

    const prompt = `
    [TASK: REPLACE/ADD TEXT ON IMAGE]
    Render the following text on the image with artistic styling:
    Content: "${text}"

    ${presetPrompt}
    ${fontPrompt}
    ${scalePrompt}
    ${positionPrompt}
    ${colorInstruction}

    [STYLE CONTEXT] ${style}
    [TECHNICAL] (8k resolution), (masterpiece), (vivid colors), (sharp text edges)
    [CONSTRAINTS] (Single text block only), (No duplicate text), (Maintain background quality)
    [NEGATIVE] (Blurry text: -2.0), (Unreadable: -2.0), (Low quality: -2.0), (Text cut off: -2.0)
    `.trim();

    return generateKieImage(prompt, ratio, imgUrl);
};

export const generateCharacterVariations = async (concept: string, type: 'RANDOM' | 'CUSTOM', customStyle?: string) => {
    const payload = {
        contents: [{
            role: 'user' as const,
            parts: [{
                text: `Generate 4 distinct character variation prompts based on: ${concept}. Type: ${type}. Custom Style: ${customStyle}.
                Return JSON array of strings.`
            }]
        }],
        generationConfig: { responseMimeType: 'application/json' },
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE // [UPDATED] Apply Safety Settings
    };

    const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
    const text = extractTextFromResponse(data);
    try {
        const jsonText = text.replace(/```json\n|\n```/g, "").trim();
        return JSON.parse(jsonText || '[]');
    } catch (e) {
        logger.trackSwallowedError('thumbnailService:generateThumbnailVariations', e);
        return [concept, concept, concept, concept];
    }
};

export const generateStylePreviewPrompts = async (script: string, style: string, atmosphere?: string) => {
    const payload = {
        contents: [{
            role: 'user' as const,
            parts: [{
                text: `Generate 2 image prompts (Intro, Highlight) for script: ${script.substring(0, 500)}. Style: ${style} ${atmosphere}.
                Return JSON: { intro: string, highlight: string }`
            }]
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 500 },
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE, // [UPDATED] Apply Safety Settings
        _reasoningEffort: "low" // [PERF] Simple prompt JSON
    };

    const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
    const text = extractTextFromResponse(data);
    try {
        return JSON.parse(text || '{ "intro": "", "highlight": "" }');
    } catch (e) {
        logger.trackSwallowedError('thumbnailService:generateStylePreviewPrompts', e);
        console.warn('[generateStylePreviewPrompts] JSON parse failed, returning empty prompts');
        return { intro: '', highlight: '' };
    }
};

// [UPDATED] generateThumbnailConcepts: CLICKBAIT & VIRAL OPTIMIZATION
export const generateThumbnailConcepts = async (script: string, isShort: boolean, styleRef?: string, onCost?: (c: number) => void, langName?: string) => {
    // [CRITICAL] Viral Instruction: No rambling, only impact.
    // [UPDATED] Relaxed constraints: No strict ban on sentences, longer char limit
    const languageInstruction = `
    CRITICAL RULE: The field 'textOverlay' MUST be in ${langName || 'the SAME LANGUAGE as the script'}.
    NEGATIVE_CONSTRAINT: Do not translate to English. Output strictly in ${langName || 'original language'}.

    [VIRAL FORMATTING RULES]
    1. **Short impact phrase.** (Avoid long explanations, but do not strictly forbid sentences if they are punchy).
    2. **Target length: 8~10 characters.**
    3. **STRUCTURE**:
       - Prefer **'Subject + Predicate'** or **'Modifier + Keyword'**.
       - Example: "마이크 속 진짜 순금?" (Real gold inside mic?), "소리 잡는 90개 구멍" (90 holes catching sound).
       - Avoid simple 2-4 letter words like "충격!", "실체!". Be specific.
    4. **VIRAL TRIGGER**: Use specific questions or descriptive situations rather than generic exclamations.
    5. **HIGHLIGHT**: Extract the SINGLE most shocking word for neon coloring.
    `;

    const payload = {
        contents: [{
            role: 'user' as const,
            parts: [{
                text: `You are a Viral YouTube Thumbnail Expert.
                Analyze script context deeply. Generate 4 high-CTR concepts.
                Format: ${isShort ? '9:16 (Shorts)' : '16:9 (Video)'}.
                Style Ref: ${styleRef || 'None'}.

                ${languageInstruction}

                **CRITICAL: DYNAMIC POSING & DIRECTION**
                - 'poseDescription' MUST be a specific PHYSICAL ACTION (Verb) based on the script's emotional peak.
                - Do NOT use generic terms like "Concept 1".
                - Example: "Screaming while holding head", "Running towards camera", "Pointing finger angrily", "Crying with face in hands".
                - VARY the 'shotSize': Extreme Close Up (Emotion), Waist Shot (Action), Full Body (Context), Low Angle (Power).

                Return JSON array of 4 objects:
                { textOverlay, fullTitle, visualDescription, secondaryColorHex, colorMode, sentiment, highlight, shotSize, poseDescription, cameraAngle }

                Script: ${script.substring(0, 1000)}`
            }]
        }],
        generationConfig: { responseMimeType: 'application/json' },
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE // [UPDATED] Apply Safety Settings
    };

    const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload);
    const text = extractTextFromResponse(data);
    if (!text || !text.trim()) {
        throw new Error('AI 응답이 비어 있습니다. API 키를 확인하거나 다시 시도해주세요.');
    }
    try {
        const jsonText = text.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/, '').trim() || text.trim();
        const result = JSON.parse(jsonText);
        if (!Array.isArray(result) || result.length === 0) {
            throw new Error('AI가 유효한 컨셉을 생성하지 못했습니다. 다시 시도해주세요.');
        }
        return result;
    } catch (e: any) {
        if (e.message?.includes('AI가') || e.message?.includes('AI 응답')) throw e;
        console.warn('[generateThumbnailConcepts] JSON parse failed:', text.substring(0, 200));
        throw new Error('AI 응답 파싱 실패. 다시 시도해주세요.');
    }
};

// [UPDATED] generateHighQualityThumbnail: Deep Style Copy & Layout Override
export const generateHighQualityThumbnail = async (
    text: string, visual: string, style: string, ratio: AspectRatio,
    charImg?: string, charDesc?: string, charUrl?: string, feedback?: string,
    primaryColor?: string, secondaryColor?: string, colorMode?: string, index?: number,
    isNativeHQ?: boolean, sentiment?: string, highlight?: string, refImg?: string,
    textForceLock?: boolean, updateStatus?: (s: string) => void, isMixedMedia?: boolean,
    origStyle?: string, languageContext?: { lang?: string; locale?: string; nuance?: string; langName?: string },
    shotSize?: string,
    poseDescription?: string,
    cameraAngle?: string,
    globalContext?: string,
    // [NEW] Text Style Editor params
    textPreset?: string,
    fontHint?: string,
    textPosition?: string,
    textScale?: number,
    textMode?: 'auto' | 'custom' | 'none'
) => {
    const idx = index || 0;
    const isTextless = textMode === 'none';

    // [LOGIC CHANGE START] Check if Style Copy Mode is active (Detailed Style + Reference Image exists)
    const isStyleCopy = !!(origStyle && origStyle.length > 20 && refImg);

    let targetFont = "";

    // [NEW] Logic: Force Color in Style Copy mode unless it is explicitly B&W style
    const isBw = isBlackAndWhiteStyle(style || origStyle || "") === "TRUE";

    let colorPrompt = "";
    let styleInstruction = "";
    let stickerInstruction = "";

    // [UPDATED] Language Context Logic
    const targetLanguage = languageContext?.langName || "Primary Language of Script";

    // [UPDATED] Style Copy Branching
    if (isStyleCopy) {
        // [BRANCH A] Style Copy Mode

        // 1. Inherit Typography & Color from Analysis
        targetFont = "[TYPOGRAPHY]: **STRICTLY INHERIT** the font style (Serif/Sans/Handwritten/Texture), Weight, and Effects from the [Art Style] description.";

        colorPrompt = `[COLOR PALETTE]: **STRICTLY INHERIT** the color scheme, gradients, and text colors from the [Art Style] description.`;
        if (!isBw) {
             colorPrompt += " Ensure the output is **FULL COLOR** (Vivid RGB). Do not output Black & White unless specified in the style description.";
        }

        // 2. Inject Analysis as Mandatory Rules (Content Decoupling)
        const contentDecoupling = `
        [CRITICAL: IGNORE SOURCE CONTENT]
        - The Reference Image is **ONLY for layout, color, and font style**.
        - **DO NOT** transcribe text from the reference image. Use the provided "Content" text.
        - **DO NOT** copy the specific person or subject from the reference. Replace with the [Visuals] description.
        - **IGNORE** any logos, watermarks, or channel icons in the reference.
        `;

        styleInstruction = `
        ${contentDecoupling}

        [MANDATORY STYLE INHERITANCE]
        You must REPLICATE the design DNA & STRUCTURE of the reference image described below:
        ${origStyle}

        [READABILITY & EFFECTS]
        - **Text Visibility**: Add a **subtle dark gradient vignette** or soft shadow behind the text area to ensure readability against complex backgrounds.
        - **No Hard Sticker Outline**: Do NOT use white sticker borders unless the reference style has them. Use the reference's effect (e.g. Neon, Drop Shadow, Clean).
        `;

        // 3. Disable Default Sticker Logic (Use Inherited)
        stickerInstruction = "";

    } else {
        // [BRANCH B] Default Mode (Sticker/Neon/Oreo)

        // [UPDATED] Dynamic Font: Use fontHint if provided, else adaptive logic
        if (fontHint) {
            targetFont = getFontHintPrompt(fontHint, THUMBNAIL_FONT_HINTS);
        } else if (typeof idx === 'number' && (idx % 4 === 0 || idx % 4 === 1)) {
            targetFont = "Ultra-Black, Heavy Weight, Massive Font, Extra-Bold Sans-serif (Impact/Gothic Style)";
        } else {
            targetFont = `(Font Style: ${style || "Modern"} but make it Ultra-Bold and maintain Sticker Outline), (Heavy Weight)`;
        }

        // Random Neon Logic & White Text Handling
        const mainColor = primaryColor || "#FFFFFF";
        const accentColor = highlight || secondaryColor || "#68ff34";
        const hlKeyword = highlight || "KEYWORD";

        // [FIXED] Color Logic & Black Text Prevention
        if (mainColor.toUpperCase() === "#FFFFFF") {
            const highlightLogic = `Find the **Syntactic Chunk** (e.g. Adjective + Noun, or Noun Phrase) that contains "${hlKeyword}". Color the **WHOLE CHUNK** in ${accentColor}. (e.g. if keyword is 'Holes', highlight '90 Holes' together. If keyword is 'Sound', highlight 'Blocking Sound' together).`;

            if (ratio === AspectRatio.PORTRAIT) {
                colorPrompt = `[TYPOGRAPHY COLOR] Base Text Color: Pure White (#FFFFFF).
                **CRITICAL HIGHLIGHT RULE**: ${highlightLogic}
                If the text is short (1-2 lines), make the whole text ${accentColor} for impact.
                [TEXT COLOR ONLY] Do NOT add background boxes behind the text. (No background box: 2.0).
                [FORCE OVERRIDE: IGNORE BACKGROUND BRIGHTNESS] (Force Light Color Text), (White Fill or Neon Fill ONLY), (Self-Luminous Text), (Light Emitting Fill).`;
            } else {
                colorPrompt = `[TYPOGRAPHY COLOR] Base Text Color: Pure White (#FFFFFF).
                **CRITICAL HIGHLIGHT RULE**: ${highlightLogic}
                (Huge Scale for the highlighted phrase), (Separate Sticker Layer), (Pop-out effect).
                Keep the rest of the sentence Pure White. Use high contrast.
                [FORCE OVERRIDE: IGNORE BACKGROUND BRIGHTNESS] (Force Light Color Text), (White Fill or Neon Fill ONLY), (Self-Luminous Text), (Light Emitting Fill).`;
            }
        } else {
            colorPrompt = `[STRICT CONSTRAINT]: Fill text with exactly ${mainColor}. Ignore environmental lighting for text color. (No color grading on text layer), (Keep hex color pure).`;
        }

        // [UPDATED] Dynamic Preset: Use textPreset if provided, else default sticker
        if (textPreset) {
            const presetPromptBlock = getTextPresetPrompt(textPreset, THUMBNAIL_TEXT_PRESETS);
            if (presetPromptBlock) {
                stickerInstruction = `
                ${presetPromptBlock}
                - **Font**: ${targetFont}, (Extra Bold Weight: 2.0), (Massive Scale).
                - **Color Enforcement**: (Flat Color), (No Gradient on Text), (Keep Text Color Pure).
                `;
            }
        }

        // Fallback to default sticker if no preset matched
        if (!stickerInstruction) {
            const textureFill = "(Text Surface Material: Grainy Paper Texture), (Grunge Overlay on Text), (Detailed Surface Noise), (Rough Finish)";
            stickerInstruction = `
            [MANDATORY TEXT STYLE: DIE-CUT STICKER]
            - **Effect**: (Massive White Sticker Border: 1.8), (Double Outline: Thick Black Inner + Huge White Outer Halo), (Die-cut sticker style).
            - **Texture**: ${textureFill}, (Flat 2D Text), (No 3D Bevel).
            - **Depth**: (Text floating above background), (Text implies separate layer).
            - **Font**: ${targetFont}, (Extra Bold Weight: 2.0), (Massive Scale).
            - **Color Enforcement**: (Flat Color), (No Gradient on Text), (Keep Text Color Pure).
            `;
        }

        // [NEW] textScale injection
        if (textScale) {
            stickerInstruction += `\n${getTextScalePrompt(textScale)}`;
        }
    }

    // [UPDATED] Smart Layout Logic (9:16 Safety Zone & Text Size & Split)
    let layoutInstruction = "";
    if (ratio === AspectRatio.PORTRAIT) {
        layoutInstruction = `
        [MANDATORY LAYOUT: 9:16 VERTICAL SHORTS]
        - **ASPECT RATIO**: 9:16 Vertical.
        - **POSITION**: **(Text Position: Center-Upper 30~40%)**, **(Avoid bottom UI area)**, **(Floating text in upper middle)**.
        - **SAFE ZONE**: Do NOT place text at the very bottom (TikTok/Reels UI covers it).
        - **FLOATING**: Place the text floating in the upper-middle empty space.
        - **FACE PROTECTION**: If a character is present, **(Place text BELOW face)** or **(Text floating at chest level)**. NEVER cover the face.
        - **TEXT SIZE**: **(Large Text: 1.2), (Occupying 30% of vertical space), (Balanced Margin)**.
        - **REPETITION GUARD**: (Single Text Block ONLY), (Do not repeat text vertically).
        `;

        // [NEW] JS Logic for Split
        if (text.length > 5) {
             layoutInstruction += ` [LAYOUT RULE: Split text into 2 lines vertically], (Double Deck Text Layout)`;
        }

    } else if (ratio === AspectRatio.LANDSCAPE) {
        // [UPDATED] Landscape specific logic + Vignette
        const layoutMode = typeof index === 'number' ? index % 4 : 0;

        let specificLayout = "";
        switch(layoutMode) {
            case 0: specificLayout = "[MANDATORY LAYOUT]: BOTTOM-CENTER (Massive Text, Lifted 10%). (Force Single Line: 3.0), (Do not split text: 3.0), (Fit text width to screen). (Text Scale: 1.5), (Fill bottom width), (No margin)."; break;
            case 1: specificLayout = "[MANDATORY LAYOUT]: BOTTOM-CENTER (Massive Text, Lifted 10%). (Force Single Line: 3.0), (Do not split text: 3.0), (Fit text width to screen)."; break;
            case 2: specificLayout = "[MANDATORY LAYOUT]: RIGHT SIDE CENTER (Vertical Middle, Huge Text)."; break;
            case 3: specificLayout = "[MANDATORY LAYOUT]: TOP AREA (Huge Headline). (Force Single Line: 3.0), (Do not split text: 3.0)."; break;
        }

        layoutInstruction = `
        ${specificLayout}
        [READABILITY LAYER] (Bottom linear gradient shadow), (Dark vignette at bottom 30%), (Text visibility enhancer layer at bottom), (Shadow overlay behind text area).
        `;

        const cleanText = text.replace(/\s/g, '');
        if (cleanText.length > 10 && (layoutMode === 2)) {
             layoutInstruction += ` [TYPOGRAPHY RULE]: Split into exactly 2 lines. Balance the length.`;
        }
    } else {
        layoutInstruction = "[LAYOUT]: BIG BOLD TEXT CENTERED.";
    }

    // [NEW] textPosition override — merge into layoutInstruction
    if (textPosition) {
        layoutInstruction += `\n${getTextPositionPrompt(textPosition)}`;
    }

    // [UPDATED] Dynamic Language Logic
    const langOverride = `
    [CRITICAL OVERRIDE: TEXT LANGUAGE]
    Even if the art style implies a different country, the text MUST be written in **${targetLanguage}**.
    (Write text strictly in ${targetLanguage} alphabet/characters only).
    Ignore the style's original language context for text rendering.
    `;

    let localeRule = `(Text Language: ${targetLanguage}), (Characters: ${targetLanguage}), (Writing System: ${targetLanguage}). ${langOverride}`;

    // [NEW] Context Grounding (from globalContext)
    let locationContext = "";
    let eraContext = "";
    let cultureContext = "";
    let keyEntitiesContext = "";
    let cultureNegatives = "";

    try {
        if (globalContext && globalContext.trim().startsWith('{')) {
            const ctx = JSON.parse(globalContext);
            if (ctx.specificLocation) locationContext = `(MANDATORY Background: ${ctx.specificLocation}: 2.0), `;
            if (ctx.timePeriod) eraContext = `(Time Period: ${ctx.timePeriod}: 1.5), `;
            if (ctx.culturalBackground) cultureContext = `(Cultural Context: ${ctx.culturalBackground}: 1.5), `;
            if (ctx.keyEntities) keyEntitiesContext = `(Key Visual Elements: ${ctx.keyEntities}: 1.5), `;

            // Symmetric Culture Blocking (simplified from imageGeneration.ts)
            const ctxStr = `${ctx.specificLocation || ''} ${ctx.timePeriod || ''} ${ctx.culturalBackground || ''}`.toLowerCase();
            const isKorea = /korea|korean|seoul|joseon|busan|hanok|gyeongbok/.test(ctxStr);
            const isChina = /china|chinese|beijing|shanghai|forbidden city|qing|ming|tang dynasty|taiwan|hong kong/.test(ctxStr);
            const isJapan = /japan|japanese|tokyo|osaka|kyoto|samurai|edo/.test(ctxStr);
            const isWestern = /america|europe|western|london|new york|paris|rome|british|french|german/.test(ctxStr);
            const isArab = /arab|middle east|dubai|islam|mecca|ottoman/.test(ctxStr);
            const isIndia = /india|indian|delhi|mumbai|mughal|taj mahal/.test(ctxStr);
            const anyCulture = isKorea || isChina || isJapan || isWestern || isArab || isIndia;

            if (anyCulture) {
                if (!isKorea) cultureNegatives += "(Korean architecture: -2.0), (Hanok: -2.0), ";
                if (!isChina) cultureNegatives += "(Chinese architecture: -1.5), (Chinese pagoda: -1.5), ";
                if (!isJapan) cultureNegatives += "(Japanese architecture: -1.5), (Torii gate: -1.5), ";
                if (!isWestern) cultureNegatives += "(Western architecture: -1.0), ";
                if (!isIndia) cultureNegatives += "(Indian architecture: -1.5), (Taj Mahal: -1.5), ";
            }
        }
    } catch (e) { /* fallback: no context */ }

    // [UPDATED] Composition & Action Logic (Priority Boost)
    // We construct a powerful "Action" prompt derived from concepts or defaults.
    let posePrompt = "";
    if (poseDescription) posePrompt += `(ACTION: ${poseDescription} : 1.5), `;
    if (cameraAngle) posePrompt += `(ANGLE: ${cameraAngle}), `;
    if (shotSize) posePrompt += `(SHOT: ${shotSize}), `;

    const compositionDirectives = `
    [DYNAMIC ACTION & COMPOSITION]
    - **ACTION**: ${posePrompt || "Dynamic movement, expressive gesture"}
    - **AVOID STATIC**: (static pose: -2.0), (standing still: -2.0), (passport photo: -2.0).
    - **ENERGY**: The subject must be doing something active or emotional matching the text.
    `;

    // [UPDATED] Background Logic: STRICT SCRIPT ADHERENCE
    let backgroundPrompt = "";
    if (!isMixedMedia) {
         backgroundPrompt = `(Background: ${visual} -- STRICTLY FOLLOW SCRIPT CONTEXT), (No random background), (Background matching subject context)`;
    } else {
         backgroundPrompt = `(Background: Script context - ${visual})`;
    }

    // [NEW] Contextual Background Enforcement
    backgroundPrompt += `, (Background: Highly Detailed Environment matching script context), (Cinematic Depth), (Full Scenery)`;

    // [FIX] Ensure visual content is respected
    const visualContent = `(Subject: ${visual}), ${backgroundPrompt}`;
    // [UPDATED] Texture/Grain injection (approx 10%)
    const cleanTexture = `(Film Grain: 0.2), (Subtle Screen Tone: 0.15), (Texture: 1.2), (Retro Filter: 0.1), (High Definition)`;

    // [UPDATED] Add negative prompts & Color Fidelity Constraints
    let styleNegative = getStyleNegativePrompt(style);
    if (!isBw) {
        styleNegative += ", (monochrome: 2.0), (greyscale: 2.0), (black and white: 2.0), (desaturated)";
    }

    // [FIXED] Aggressive Negative Prompts for Text Color & Repetition
    styleNegative += ", (yellow border: -2.0), (colored outline: -2.0), (White Background: 3.0), (Solid Color Background: 3.0), (Studio Backdrop: 2.0), (Simple Background: 2.0), (Blank Space)";
    // [CRITICAL FIX: BLACK TEXT BAN]
    styleNegative += ", (Black Text: 3.0), (Dark Font: 3.0), (Grey Text: 3.0), (Black Color on Text: 3.0), (Shadow inside text), (Dark Text: 3.0), (Dark Color Fill: 3.0), (Shadow inside text body)";
    styleNegative += ", (Repeated text: 3.0), (Duplicate sentence: 3.0), (Double text: 3.0), (Echo text), (Multiple text blocks)";
    styleNegative += ", (Text in other languages: 2.0), (Translation: 2.0)";

    if (ratio === AspectRatio.PORTRAIT) {
        styleNegative += ", (Text touching top edge: 2.0), (Cropped text at top: 2.0), (Background box behind text: 1.5)";
    }

    // [UPDATED] Stronger Negative Prompts against Logos and Source Content
    const contentBleedNegative = `
    (Copying source content), (Reference image subjects), (English Text: 2.0), (Alphabet: 2.0), (Latin Characters: 2.0), (duplicate text: 2.0), (repeated words: 2.0), (double text: 2.0),
    (watermark: 2.0), (logo: 2.0), (channel icon: 2.0), (broadcasting logo), (corner text), (date stamp), (original text),
    (heavy noise: 1.5), (heavy grain: 1.5)
    `;

    const colorFidelityConstraints = `[CRITICAL: IGNORE LIGHTING], (Exact Hex Color Match), (No color bleeding), (Keep text color pure and distinct from background lighting), (No tint change)`;

    // [NEW] textMode='none' 분기: 텍스트 관련 프롬프트 전부 제거
    const textBlock = isTextless
        ? `[NO TEXT OVERLAY] This image must contain NO title text, NO headline, NO text overlay.
           (Pure visual thumbnail background), (No text: 3.0), (No title: 3.0), (No headline: 3.0), (No large words: 3.0).
           Small ambient text within the scene (SFX like "!!", "?!", onomatopoeia, speech bubbles) is OK if contextually appropriate.
           Use the full canvas for visual composition without reserving space for text.`
        : `[THUMBNAIL TEXT] Content: "${text}". ${localeRule}.`;

    const depthBlock = isTextless
        ? `[DEPTH] (Cinematic depth of field), (Background blur: subtle)`
        : `[DEPTH] (Text implies separate layer), (Foreground text, Background image), (Depth of field: Background blur)`;

    // textless 모드에서는 텍스트 관련 네거티브 강화
    if (isTextless) {
        styleNegative += ", (Title text: 3.0), (Headline: 3.0), (Large text overlay: 3.0), (Text banner: 3.0), (Typography: 2.0)";
    }

    // [FINAL PROMPT CONSTRUCTION]
    const prompt = `
    ${isTextless ? '' : stickerInstruction}
    ${isTextless ? '[LAYOUT]: Full-frame visual composition. Use the entire canvas for the visual scene.' : layoutInstruction}
    ${styleInstruction}
    ${isTextless ? '' : colorPrompt}

    ${textBlock}

    ${compositionDirectives}

    ${(locationContext || eraContext || cultureContext || keyEntitiesContext) ? `[CONTEXT] ${locationContext}${eraContext}${cultureContext}${keyEntitiesContext}` : ''}

    [VISUALS]
    ${visualContent}
    ${charDesc ? `(Character Feature: ${charDesc})` : ''}

    [STYLE] ${style}. ${feedback || ''}
    [TECHNICAL] (8k resolution), (masterpiece), ${!isBw ? '(vivid colors), (full color), ' : ''} ${cleanTexture}

    ${depthBlock}

    ${isTextless ? '' : `[CONSTRAINTS] ${colorFidelityConstraints}`}

    [NEGATIVE] ${styleNegative}, ${contentBleedNegative}, ${cultureNegatives} (Low Quality), (Blurry)${isTextless ? '' : ', (Text covered), (Text cut off)'}, (High Contrast)

    ${isTextless ? '' : `[CRITICAL OVERRIDE: LANGUAGE MUST BE ${targetLanguage}]`}
    `;

    // [UPDATED] 2단계 폴백: Evolink Nanobanana 2 → Kie Nanobanana 2
    try {
        const url = await generateEvolinkImageWrapped(prompt, ratio, charImg, refImg, "2K");
        return { url, isFallback: false };
    } catch (e) {
        console.warn("Evolink thumbnail failed, trying Kie", e);
        const url = await generateKieImage(prompt, ratio, charImg, refImg);
        return { url, isFallback: true };
    }
};
