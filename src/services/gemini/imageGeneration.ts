
import { Scene, AspectRatio, ImageModel } from '../../types';
import { getMicroTexture, isBlackAndWhiteStyle, getStyleNegativePrompt, getIntegrativeInfographicInstruction } from './promptHelpers';
import { generateKieImage, generateEvolinkImageWrapped } from '../VideoGenService';
import { filterPromptContent } from './contentFilter';
import { logger } from '../LoggerService';

// [NEW] Shot size auto-rotation — prevents monotonous compositions when AI doesn't specify shot size
const SHOT_ROTATION: string[] = ['medium shot', 'close-up', 'wide shot', 'medium close-up', 'establishing shot', 'over-the-shoulder'];

// [NEW] Camera movement → still-image compositional equivalent
// Still images can't move, so we translate camera movements into composition/perspective techniques
const MOVEMENT_TO_COMPOSITION: Record<string, string> = {
    'slow pan left': 'Horizontal composition with left-directed visual flow and environmental context on the right',
    'slow pan right': 'Horizontal composition with right-directed visual flow and environmental context on the left',
    'tilt up': 'Low-to-high vertical composition with dramatic upward perspective and towering vertical lines',
    'tilt down': 'High-to-low vertical composition revealing ground-level detail with descending perspective',
    'dolly in': 'Strong foreground-background separation with shallow depth of field and converging perspective lines',
    'dolly out': 'Wide contextual framing with deep depth of field, subject placed within expansive environment',
    'crane up': 'Elevated ascending perspective transitioning from ground-level to aerial view with dramatic vertical scale',
    'crane down': 'Descending perspective from height to ground-level intimacy, revealing fine detail',
    'tracking shot': 'Dynamic side-angle composition with motion-parallel framing, environment layers visible in depth',
    'zoom in': 'Tight central focus with compressed telephoto perspective, subject filling frame',
    'zoom out': 'Expansive wide-angle composition revealing full scene context and environment',
    'orbit': 'Three-quarter dynamic angle with visible depth layers and wraparound perspective',
    'handheld shake': 'Slightly off-center intimate framing with raw documentary feel and authentic perspective',
};

/**
 * [NANOBANANA 2 OPTIMIZATION] SD-style 프롬프트를 Gemini 네이티브 형식으로 변환
 * Nanobanana 2는 Gemini 기반이므로 자연어 프롬프트가 더 효과적:
 * - (concept: 2.5) → [IMPORTANT: concept]
 * - [NEGATIVE] ... → AVOID in the generated image: ...
 * - 불필요한 공백 정리
 */
const optimizePromptForNanobanana2 = (rawPrompt: string): string => {
    let p = rawPrompt;

    // 1. [NEGATIVE] 섹션을 자연어로 변환
    const negMatch = p.match(/\[NEGATIVE\]\s*([\s\S]*?)$/);
    let avoidSection = '';
    if (negMatch) {
        p = p.replace(/\[NEGATIVE\]\s*[\s\S]*?$/, '').trim();
        // SD-style 태그를 자연어 목록으로 변환: (Korean text: -2.5) → Korean text
        const negItems = negMatch[1]
            .replace(/\(([^)]+?):\s*-?\d+(\.\d+)?\)/g, '$1')
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 1);
        if (negItems.length > 0) {
            avoidSection = `\n\nAVOID in the generated image: ${negItems.join(', ')}.`;
        }
    }

    // 2a. 본문 내 음수 가중치 → AVOID 목록에 추가: (text: -2.0) → 제거 후 avoidSection에 추가
    const inlineNegatives: string[] = [];
    p = p.replace(/\(([^)]+?):\s*-\d+(?:\.\d+)?\)/g, (_m, concept: string) => {
        inlineNegatives.push(concept.trim());
        return '';
    });
    if (inlineNegatives.length > 0) {
        avoidSection = avoidSection
            ? avoidSection.replace(/\.$/, ', ' + inlineNegatives.join(', ') + '.')
            : `\n\nAVOID in the generated image: ${inlineNegatives.join(', ')}.`;
    }

    // 2b. 양수 가중치 변환: (concept: 2.0+) → [IMPORTANT: concept], (concept: 1.0-1.9) → concept
    // [^)]+ 로 괄호 경계 보호, 마지막 ": number)" 패턴 매칭
    p = p.replace(/\(([^)]+?):\s*(\d+(?:\.\d+)?)\)/g, (_m, concept: string, weight: string) => {
        const w = parseFloat(weight);
        if (w >= 2.0) return `[IMPORTANT: ${concept.trim()}]`;
        if (w >= 1.5) return `[${concept.trim()}]`;
        return concept.trim();
    });

    // 3. 빈 괄호, 다중 공백/줄바꿈 정리
    p = p.replace(/\(\s*\)/g, '').replace(/,\s*,/g, ',').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();

    return p + avoidSection;
};

// [NEW] Data-driven script system negatives for universal language support
// Grouped by writing system family to maximize coverage while keeping prompt size manageable
const SCRIPT_SYSTEM_NEGATIVES: { keywords: string[]; negatives: string }[] = [
    // === East Asian ===
    { keywords: ['korean'], negatives: '(Korean text: -2.5), (Hangul: -2.5), (Korean characters: -2.5)' },
    { keywords: ['japanese'], negatives: '(Japanese text: -2.0), (Kanji: -2.0), (Hiragana: -2.0), (Katakana: -2.0)' },
    { keywords: ['chinese', 'cantonese', 'mandarin'], negatives: '(Chinese text: -2.0), (Hanzi: -2.0), (Chinese characters: -2.0)' },
    // === European — Latin script ===
    { keywords: ['english'], negatives: '(English text: -1.5), (Latin alphabet: -1.5)' },
    { keywords: ['french', 'german', 'spanish', 'portuguese', 'italian', 'dutch', 'swedish', 'norwegian', 'danish', 'finnish', 'polish', 'czech', 'romanian', 'hungarian', 'croatian', 'slovak', 'slovenian', 'catalan', 'basque', 'galician', 'indonesian', 'malay', 'tagalog', 'filipino', 'swahili'], negatives: '(European text: -1.5)' },
    // === European — Cyrillic script ===
    { keywords: ['russian', 'cyrillic', 'ukrainian', 'belarusian', 'bulgarian', 'serbian', 'macedonian', 'kazakh', 'kyrgyz', 'mongolian'], negatives: '(Cyrillic text: -2.0), (Cyrillic script: -2.0)' },
    // === European — Greek script ===
    { keywords: ['greek'], negatives: '(Greek text: -2.0), (Greek script: -2.0), (Greek alphabet: -2.0)' },
    // === Caucasian ===
    { keywords: ['georgian'], negatives: '(Georgian text: -2.0), (Mkhedruli: -2.0), (Georgian script: -2.0)' },
    { keywords: ['armenian'], negatives: '(Armenian text: -2.0), (Armenian script: -2.0)' },
    // === Middle Eastern — Arabic script family (Arabic, Persian, Urdu, Pashto, Kurdish) ===
    { keywords: ['arabic', 'persian', 'farsi', 'urdu', 'pashto', 'kurdish'], negatives: '(Arabic text: -2.0), (Arabic script: -2.0), (Arabic calligraphy: -2.0)' },
    // === Middle Eastern — Hebrew script ===
    { keywords: ['hebrew', 'yiddish'], negatives: '(Hebrew text: -2.0), (Hebrew script: -2.0)' },
    // === Turkic — Latin-based with special chars ===
    { keywords: ['turkish', 'azerbaijani', 'turkmen'], negatives: '(Turkish text: -1.5), (Turkish script: -1.5)' },
    // === South Asian — Devanagari script family (Hindi, Marathi, Nepali, Sanskrit) ===
    { keywords: ['hindi', 'devanagari', 'marathi', 'nepali', 'sanskrit'], negatives: '(Devanagari text: -2.0), (Hindi script: -2.0), (Devanagari script: -2.0)' },
    // === South Asian — Other Indic scripts ===
    { keywords: ['bengali', 'bangla'], negatives: '(Bengali text: -2.0), (Bengali script: -2.0)' },
    { keywords: ['tamil'], negatives: '(Tamil text: -2.0), (Tamil script: -2.0)' },
    { keywords: ['telugu'], negatives: '(Telugu text: -2.0), (Telugu script: -2.0)' },
    { keywords: ['kannada'], negatives: '(Kannada text: -2.0), (Kannada script: -2.0)' },
    { keywords: ['malayalam'], negatives: '(Malayalam text: -2.0), (Malayalam script: -2.0)' },
    { keywords: ['gujarati'], negatives: '(Gujarati text: -2.0), (Gujarati script: -2.0)' },
    { keywords: ['punjabi', 'gurmukhi'], negatives: '(Punjabi text: -2.0), (Gurmukhi script: -2.0)' },
    { keywords: ['sinhala', 'sinhalese'], negatives: '(Sinhala text: -2.0), (Sinhala script: -2.0)' },
    // === Southeast Asian ===
    { keywords: ['thai'], negatives: '(Thai text: -2.0), (Thai script: -2.0)' },
    { keywords: ['vietnamese'], negatives: '(Vietnamese text: -2.0), (Vietnamese diacritics: -2.0)' },
    { keywords: ['burmese', 'myanmar'], negatives: '(Burmese text: -2.0), (Myanmar script: -2.0)' },
    { keywords: ['khmer', 'cambodian'], negatives: '(Khmer text: -2.0), (Khmer script: -2.0)' },
    { keywords: ['lao', 'laotian'], negatives: '(Lao text: -2.0), (Lao script: -2.0)' },
    // === African ===
    { keywords: ['amharic', 'ethiopic', 'tigrinya'], negatives: '(Ethiopic text: -2.0), (Amharic script: -2.0), (Ge\'ez script: -2.0)' },
    // === Tibetan ===
    { keywords: ['tibetan', 'dzongkha'], negatives: '(Tibetan text: -2.0), (Tibetan script: -2.0)' },
];

// [CRITICAL UPDATE] Smart Bypass Logic in Generation
export const generateSceneImage = async (
    scene: Scene,
    style: string,
    ratio: AspectRatio,
    model: ImageModel,
    characterImages?: string | string[],
    prodImg?: string,
    feedback?: string,
    baseAge?: string,
    useNativeHQ?: boolean,
    updateStatus?: (s: string) => void,
    isMixedMedia?: boolean,
    styleDesc?: string,
    textForceLock?: boolean,
    globalContext?: string,
    langContext?: { lang?: string, locale?: string, nuance?: string, langName?: string },
    shotSize?: string,
    poseDescription?: string,
    suppressText?: boolean, // [NEW] Suppress Text Mode
    characterAnalysisResult?: string, // [NEW] Character analysis result for visual consistency
    sceneIndex?: number, // [NEW] Scene index for shot size auto-rotation
    enableWebSearch?: boolean // [NEW] Kie google_search / Evolink web_search
) => {
    // [CRITICAL FIX] Prioritize explicit style argument over detected style description
    const effectiveStyle = (style && style.trim() !== "") ? style : (styleDesc || "High Quality");

    // [FIX] feedback이 있으면 scene.visualPrompt 대신 사용 (사용자 수정 프롬프트 우선)
    // [FIX] visualPrompt가 비어있으면 scriptText를 최종 폴백으로 사용
    const effectiveVisualPrompt = (feedback && feedback.trim())
        ? feedback
        : (scene.visualPrompt && scene.visualPrompt.trim())
            ? scene.visualPrompt
            : (scene.scriptText || '');

    // [FIX] Detect user-edited prompt: either explicit flag or feedback parameter provided
    const isUserEdited = scene.isUserEditedPrompt || (feedback && feedback.trim() !== "");

    // === SMART BYPASS LOGIC ===
    // Normalize characterImages to array
    const charImagesArray: string[] = !characterImages
        ? []
        : typeof characterImages === 'string'
            ? [characterImages]
            : characterImages;

    let finalCharImages: string[] = charImagesArray;
    let negativePrompt = "";
    let subjectPrompt = "";

    // [AUTO WEB SEARCH] KEY_ENTITY 장면은 실존 인물/브랜드/장소 정확도를 위해 웹서치 자동 활성화
    const effectiveWebSearch = enableWebSearch || scene.castType === 'KEY_ENTITY';

    // 1. Determine Subject & Reference Usage based on 'castType' + 'entityComposition'
    if (scene.castType === 'KEY_ENTITY') {
        const entityDesc = scene.entityVisualContext || scene.entityName || 'Notable entity';
        const entityComp = scene.entityComposition || 'ENTITY_SOLO';

        // [NEW] 5가지 연출 구도에 따른 프롬프트 + 캐릭터 레퍼런스 제어
        switch (entityComp) {
            case 'ENTITY_SOLO':
                // 엔티티 단독 — 메인 캐릭터 완전 제외
                finalCharImages = [];
                subjectPrompt = `[IMPORTANT: The SOLE SUBJECT is ${scene.entityName}]\n`;
                subjectPrompt += `(Subject: ${scene.entityName}), (Appearance: ${entityDesc}), `;
                subjectPrompt += `(Full cinematic portrait of ${scene.entityName}, no other characters visible), `;
                negativePrompt += "(main character face), (custom character), ";
                break;

            case 'ENTITY_WITH_MAIN':
                // 엔티티 + 메인 캐릭터 동반 출연 — 자연스러운 상호작용
                // 캐릭터 레퍼런스 유지
                subjectPrompt = `[IMPORTANT: TWO SUBJECTS in the same frame]\n`;
                subjectPrompt += `(Primary Subject: ${scene.entityName}, ${entityDesc}), `;
                subjectPrompt += `(Secondary Subject: Main Character, standing/interacting beside ${scene.entityName}), `;
                subjectPrompt += `(Both characters naturally interacting in the scene, proper perspective and depth), `;
                break;

            case 'MAIN_OBSERVING':
                // 메인 캐릭터 어깨너머 시점으로 엔티티를 바라보는 구도
                // 캐릭터 레퍼런스 유지 (어깨/뒷모습 참조용)
                subjectPrompt = `[IMPORTANT: OVER-THE-SHOULDER composition]\n`;
                subjectPrompt += `(Over-the-shoulder shot: Main Character's back/shoulder visible in left foreground, out of focus), `;
                subjectPrompt += `(Focus Subject: ${scene.entityName} visible in the middle/background, ${entityDesc}), `;
                subjectPrompt += `(Shallow depth of field, main character blurred foreground framing), `;
                break;

            case 'ENTITY_FG_MAIN_BG':
                // 엔티티 전경(클로즈업), 메인 캐릭터 후경(작게)
                // 캐릭터 레퍼런스 유지
                subjectPrompt = `[IMPORTANT: FOREGROUND-BACKGROUND split composition]\n`;
                subjectPrompt += `(Foreground: Close-up of ${scene.entityName}, ${entityDesc}, sharp focus, prominent), `;
                subjectPrompt += `(Background: Main Character visible but smaller, slightly blurred, reacting or observing), `;
                subjectPrompt += `(Strong depth separation, cinematic rack focus feel), `;
                break;

            case 'MAIN_FG_ENTITY_BG':
                // 메인 캐릭터 전경, 엔티티 후경(컨텍스트)
                // 캐릭터 레퍼런스 유지
                subjectPrompt = `[IMPORTANT: Main character foreground, entity in background context]\n`;
                subjectPrompt += `(Foreground: Main Character prominent, expressive reaction visible), `;
                subjectPrompt += `(Background: ${scene.entityName} visible in the scene context, ${entityDesc}), `;
                subjectPrompt += `(Main character is the visual anchor, entity provides narrative context), `;
                break;

            default:
                // 폴백 — 단독
                finalCharImages = [];
                subjectPrompt = `(Subject: ${scene.entityName}), (Appearance: ${entityDesc}), `;
                negativePrompt += "(main character face), (custom character), ";
        }
    } else if (scene.castType === 'EXTRA') {
        // [BYPASS] Generic Extra: Block Main Character Reference
        finalCharImages = [];
        subjectPrompt = `(Subject: Generic character, ${scene.visualPrompt}), `;
        negativePrompt += "(main character face), (custom character), ";
    } else if (scene.castType === 'NOBODY') {
        // [BYPASS] Scenery: Block Reference
        finalCharImages = [];
        subjectPrompt = `(Subject: No humans, Scenery focus), `;
        negativePrompt += "(humans), (people), (face), ";
    } else {
        // [DEFAULT] 'MAIN': Keep Reference
        subjectPrompt = `(Subject: Main Character), `;
    }

    // 2. Inject Shot Size (Cinematography) — with auto-rotation fallback
    if (scene.shotSize) {
        subjectPrompt += `(${scene.shotSize}: 1.5), `;
    } else if (typeof sceneIndex === 'number') {
        const autoShot = SHOT_ROTATION[sceneIndex % SHOT_ROTATION.length];
        subjectPrompt += `(${autoShot}: 1.3), `;
    }

    // 2b. Inject Camera Angle — cinematic depth and storytelling
    if (scene.cameraAngle && scene.cameraAngle.trim() && scene.cameraAngle !== 'Eye Level') {
        subjectPrompt += `(Camera Angle: ${scene.cameraAngle}: 1.5), `;
    }

    // 2c. Inject Camera Movement — translated to still-frame compositional techniques
    if (scene.cameraMovement && scene.cameraMovement.trim() && scene.cameraMovement.toLowerCase() !== 'static') {
        const movementComposition = MOVEMENT_TO_COMPOSITION[scene.cameraMovement.toLowerCase()] || `Dynamic composition suggesting ${scene.cameraMovement}`;
        subjectPrompt += `(${movementComposition}: 1.3), `;
    }

    // 3. Inject Character Action/Pose for per-scene variety
    if (scene.castType === 'MAIN' || scene.castType === 'KEY_ENTITY') {
        if (scene.characterAction && scene.characterAction.trim()) {
            subjectPrompt += `(Character Action: ${scene.characterAction}: 1.8), `;
        }
        if (poseDescription && poseDescription.trim()) {
            subjectPrompt += `(Character Pose: ${poseDescription}: 1.5), `;
        }
    }

    // 4. Inject Character Analysis Result for visual consistency
    // [NANOBANANA 2] Gemini-native 자연어 지시로 캐릭터 일관성 강화
    if (characterAnalysisResult && characterAnalysisResult.trim()) {
        subjectPrompt += `\n[IMPORTANT: CHARACTER IDENTITY — MUST MATCH EXACTLY]\n`;
        subjectPrompt += `${characterAnalysisResult}\n`;
        subjectPrompt += `[CRITICAL CONSISTENCY RULES]\n`;
        subjectPrompt += `1. The character's face, hair, body proportions, and clothing MUST be IDENTICAL to the reference image in every detail.\n`;
        subjectPrompt += `2. The character MUST be naturally integrated into the scene — correct perspective, proper scale relative to environment.\n`;
        if (isMixedMedia) {
            // [MIXED MEDIA] 캐릭터 원본 아트 스타일 보존 — 2D는 2D, 3D는 3D, 실사는 실사
            subjectPrompt += `3. [ART STYLE PRESERVATION] The character MUST retain its EXACT original art style as described in the detected art style analysis above. If the reference is 2D cartoon with flat colors and bold outlines, render it as 2D cartoon with flat colors and bold outlines. If anime, render as anime. If realistic, render as realistic. Do NOT convert the character's art style to match the background — the style contrast is INTENTIONAL.\n`;
            subjectPrompt += `4. The character's rendering method (line quality, shading technique, color palette, level of detail) must match the reference image exactly. The deliberate visual contrast between character style and background style is the core creative intent.\n`;
        } else {
            // [NORMAL MODE] 비주얼 스타일이 선택되면 캐릭터의 원본 아트 스타일은 무시하고,
            // 캐릭터의 신체적 특징(얼굴, 머리, 체형, 옷)만 유지한 채 선택된 비주얼 스타일로 강제 렌더링
            subjectPrompt += `3. [MANDATORY STYLE OVERRIDE] The character MUST be re-rendered in the scene's selected visual style ('${style}'). The character's ORIGINAL art style (cartoon, anime, 2D, etc.) MUST be completely IGNORED and OVERRIDDEN. Only preserve the character's IDENTITY FEATURES (face shape, hair style/color, body proportions, clothing design). The character MUST look like it was originally created in the '${style}' art style.\n`;
            subjectPrompt += `4. NEVER preserve the character's original rendering method. Adapt EVERYTHING — line quality, shading technique, color palette, level of detail — to match '${style}'. The character must have proper 3D depth, perspective, and volume consistent with the selected style.\n`;
            subjectPrompt += `5. Adapt the character's lighting and color temperature to match the scene's ambient light.\n`;
        }
    }

    // 5. Per-scene reference image hint
    if (scene.referenceImage && scene.referenceImage.trim()) {
        subjectPrompt += `(Use the attached reference image as visual guide for this scene's composition, colors, and mood), `;
    }

    // [UPDATED] Language and Style Bias Logic
    // [FIX] 기본값 "Korean" 제거 — 감지된 언어가 없으면 텍스트 지시 비활성화
    const langName = langContext?.langName || "";
    let langInstruction = langName ? `(Text Language: ${langName}), (Signage: ${langName})` : "";

    // [CRITICAL OVERRIDE: SUPPRESS TEXT]
    if (suppressText) {
        negativePrompt += "(text: -2.0), (writing: -2.0), (letters: -2.0), (signature: -2.0), (watermark: -2.0), (alphabet: -2.0), (words: -2.0), (font: -2.0), (title: -2.0), (subtitle: -2.0), ";
        langInstruction = ""; // Clear instruction
    } else if (textForceLock) {
        // [textForceLock ON] 감지된 언어로 강제 변환 — 다른 언어 모두 억제
        const lowerLang = langName.toLowerCase();
        if (lowerLang) {
            for (const system of SCRIPT_SYSTEM_NEGATIVES) {
                const isDetectedLang = system.keywords.some(k => lowerLang.includes(k));
                if (!isDetectedLang) {
                    negativePrompt += `${system.negatives}, `;
                }
            }
        }
        if (!lowerLang) {
            negativePrompt += "(Korean text: -1.5), (Hangul: -1.5), ";
        }
        if (langName) {
            langInstruction += ` [CRITICAL OVERRIDE: All text, signage, and background writing MUST be in ${langName}. NEVER use Korean/Hangul unless the detected language IS Korean].`;
        }
    } else {
        // [textForceLock OFF] 원문 유지 — 이미지 내 텍스트를 장면 맥락에 맞게 자연스럽게 생성
        // 스타일 블리딩만 가볍게 방지 (예: 애니메 스타일이 일본어 텍스트 강제하는 것 방지)
        langInstruction = langName
            ? `(Text in scene should match the cultural/geographic context of the scene — use contextually appropriate languages for signs, storefronts, and text)`
            : "";
    }

    // [NEW] Logic: Force Color unless it's explicitly a B&W genre
    const isBw = isBlackAndWhiteStyle(effectiveStyle) === "TRUE";
    let colorEnforcement = "";
    if (!isBw) {
        colorEnforcement = "(Vivid Full Color: 1.5), (Multi-colored), (RGB format)";
        negativePrompt += ", (monochrome: 2.0), (greyscale: 2.0), (black and white: 2.0), (desaturated)";
    }

    // [NEW] Aspect Ratio Composition Guidance — prevents misframed compositions in portrait/square
    let aspectComposition = "";
    if (ratio === AspectRatio.PORTRAIT) {
        // Portrait 9:16: vertical framing guidance
        aspectComposition = "(Vertical portrait composition, 9:16 aspect ratio: 1.8), (Frame subject vertically with generous headroom and vertical space: 1.5), (Tall vertical framing), (Subject centered vertically in frame)";
        negativePrompt += ", (wide panoramic composition: -2.0), (horizontal landscape framing: -2.0), (wide-angle horizontal shot: -1.5), (landscape orientation: -1.5)";
    } else if (ratio === AspectRatio.SQUARE) {
        // Square 1:1: centered composition guidance
        aspectComposition = "(Square frame composition, 1:1 aspect ratio: 1.5), (Center the subject in a balanced square frame), (Symmetrical framing)";
    }
    // 16:9 landscape and 4:3 classic: no additional guidance needed (default behavior)

    // [MODIFICATION] If textForceLock is true AND NOT SUPPRESSED, enforce language constraints strongly
    // [FIX] Dynamically exclude detected language from negative prompts to avoid suppressing target language
    if (textForceLock && !suppressText) {
        langInstruction += `, (Storefronts: ${langName}), (Background text: ${langName}), (Street signs: ${langName})`;
        const lowerLangForLock = langName.toLowerCase();
        const textForceLockNegatives = [
            { check: 'english', neg: '(English text: -2.0)' },
            { check: 'chinese', neg: '(Chinese text: -2.0)' },
            { check: 'japanese', neg: '(Japanese text: -2.0)' },
            { check: 'korean', neg: '(Korean text: -2.0)' },
            { check: 'arabic', neg: '(Arabic text: -2.0)' },
            { check: 'hindi', neg: '(Hindi text: -2.0)' },
            { check: 'thai', neg: '(Thai text: -2.0)' },
            { check: 'russian', neg: '(Russian text: -2.0)' },
        ];
        const lockNegs = textForceLockNegatives
            .filter(item => !lowerLangForLock.includes(item.check))
            .map(item => item.neg);
        negativePrompt += `, ${lockNegs.join(', ')}, (Foreign text: -2.0)`;
    }

    // [CRITICAL FIX] Per-scene context takes priority over global context
    let locationContext = "";
    let eraContext = "";
    let cultureContext = "";

    let effectiveLocation = scene.sceneLocation || "";
    let effectiveEra = scene.sceneEra || "";
    let effectiveCulture = scene.sceneCulture || "";

    // Fallback to global context if per-scene is empty
    // [CRITICAL FIX] keyEntities는 더 이상 프롬프트에 주입하지 않음
    // 이유: keyEntities가 한글(예: "밀라노, 루도비코 스포르차")로 저장되어 있어
    // Gemini 모델이 이를 이미지 내 텍스트로 렌더링하는 심각한 버그 유발
    // location/era/culture 컨텍스트가 이미 동일 정보를 영어로 전달하므로 중복 불필요
    try {
        if (globalContext && globalContext.trim().startsWith('{')) {
            const ctx = JSON.parse(globalContext);
            if (!effectiveLocation && ctx.specificLocation) effectiveLocation = ctx.specificLocation;
            if (!effectiveEra && ctx.timePeriod) effectiveEra = ctx.timePeriod;
            if (!effectiveCulture && ctx.culturalBackground) effectiveCulture = ctx.culturalBackground;
        }
    } catch (e) {
        console.warn('[imageGeneration] globalContext JSON parse failed:', e, 'raw:', globalContext?.substring(0, 200));
    }

    // Build prompt parts from effective values
    if (effectiveLocation) {
        locationContext = `(MANDATORY Background Location: ${effectiveLocation}: 2.5), (Setting MUST be ${effectiveLocation}), `;
    } else if (langContext?.locale) {
        // [FIX] globalContext 존재 여부와 무관하게, effectiveLocation이 비어있으면 locale 폴백 적용
        locationContext = `(Background Region: ${langContext.locale}), `;
    }
    if (effectiveEra) {
        eraContext = `(MANDATORY Time Period: ${effectiveEra}: 2.0), (Era: ${effectiveEra}), `;
    }
    if (effectiveCulture) {
        cultureContext = `(MANDATORY Cultural Context: ${effectiveCulture}: 2.0), (Architecture and environment MUST reflect ${effectiveCulture}), `;
    }
    if (effectiveCulture && effectiveLocation) {
        cultureContext += `(CRITICAL: ALL architecture, clothing, vegetation, props MUST match ${effectiveCulture} in ${effectiveLocation}. Do NOT mix other cultural elements), `;
    }

    // [CRITICAL FIX] Use effective per-scene context for culture detection
    // Language ≠ Culture. langName is ONLY for text rendering, NEVER for cultural detection.
    const contextString = `${effectiveLocation} ${effectiveEra} ${effectiveCulture}`.toLowerCase();

    const isKoreaMentioned = contextString.includes('korea') || contextString.includes('korean') || contextString.includes('seoul') || contextString.includes('joseon') || contextString.includes('busan') || contextString.includes('hanok') || contextString.includes('gyeongbok');
    const isChinaMentioned = contextString.includes('china') || contextString.includes('chinese') || contextString.includes('beijing') || contextString.includes('shanghai') || contextString.includes('forbidden city') || contextString.includes('guangzhou') || contextString.includes('hong kong') || contextString.includes('qing') || contextString.includes('ming') || contextString.includes('tang dynasty') || contextString.includes('taiwan') || contextString.includes('taipei') || contextString.includes('cantonese') || contextString.includes('macau');
    const isJapanMentioned = contextString.includes('japan') || contextString.includes('japanese') || contextString.includes('tokyo') || contextString.includes('osaka') || contextString.includes('kyoto') || contextString.includes('samurai') || contextString.includes('edo');
    const isWesternMentioned = contextString.includes('america') || contextString.includes('europe') || contextString.includes('western') || contextString.includes('london') || contextString.includes('new york') || contextString.includes('paris') || contextString.includes('rome') || contextString.includes('berlin') || contextString.includes('british') || contextString.includes('french') || contextString.includes('german') || contextString.includes('italy') || contextString.includes('italian') || contextString.includes('milan') || contextString.includes('milano') || contextString.includes('florence') || contextString.includes('venice') || contextString.includes('vatican') || contextString.includes('renaissance') || contextString.includes('medieval') || contextString.includes('baroque') || contextString.includes('spain') || contextString.includes('spanish') || contextString.includes('madrid') || contextString.includes('portugal') || contextString.includes('lisbon') || contextString.includes('dutch') || contextString.includes('amsterdam') || contextString.includes('greek') || contextString.includes('athens') || contextString.includes('vienna') || contextString.includes('swiss') || contextString.includes('zurich') || contextString.includes('gothic') || contextString.includes('victorian') || contextString.includes('sforza') || contextString.includes('medici') || contextString.includes('davinci') || contextString.includes('da vinci') || contextString.includes('michelangelo');
    const isArabMentioned = contextString.includes('arab') || contextString.includes('middle east') || contextString.includes('dubai') || contextString.includes('islam') || contextString.includes('mecca') || contextString.includes('ottoman');
    const isIndiaMentioned = contextString.includes('india') || contextString.includes('indian') || contextString.includes('delhi') || contextString.includes('mumbai') || contextString.includes('mughal') || contextString.includes('taj mahal') || contextString.includes('rajasthan');
    const isSoutheastAsiaMentioned = contextString.includes('southeast asia') || contextString.includes('thai') || contextString.includes('bangkok') || contextString.includes('vietnam') || contextString.includes('hanoi') || contextString.includes('cambodia') || contextString.includes('angkor') || contextString.includes('indonesia') || contextString.includes('bali') || contextString.includes('singapore');
    const isAfricaMentioned = contextString.includes('africa') || contextString.includes('african') || contextString.includes('egypt') || contextString.includes('cairo') || contextString.includes('lagos') || contextString.includes('nairobi') || contextString.includes('sahara');
    const isLatinAmericaMentioned = contextString.includes('latin america') || contextString.includes('mexico') || contextString.includes('brazil') || contextString.includes('aztec') || contextString.includes('mayan') || contextString.includes('inca') || contextString.includes('buenos aires');
    const isRussiaMentioned = contextString.includes('russia') || contextString.includes('russian') || contextString.includes('moscow') || contextString.includes('kremlin') || contextString.includes('soviet') || contextString.includes('siberia');
    const isTurkeyMentioned = contextString.includes('turkey') || contextString.includes('turkish') || contextString.includes('istanbul') || contextString.includes('ankara') || contextString.includes('anatolia') || contextString.includes('byzantine');
    const isNordicMentioned = contextString.includes('nordic') || contextString.includes('scandinavian') || contextString.includes('viking') || contextString.includes('norse') || contextString.includes('stockholm') || contextString.includes('copenhagen') || contextString.includes('oslo') || contextString.includes('helsinki') || contextString.includes('fjord');
    const isCentralAsiaMentioned = contextString.includes('central asia') || contextString.includes('silk road') || contextString.includes('steppe') || contextString.includes('kazakh') || contextString.includes('uzbek') || contextString.includes('samarkand') || contextString.includes('mongol') || contextString.includes('yurt');
    const isOceaniaMentioned = contextString.includes('oceania') || contextString.includes('polynesian') || contextString.includes('maori') || contextString.includes('aboriginal') || contextString.includes('pacific island') || contextString.includes('hawaii') || contextString.includes('fiji') || contextString.includes('samoa');
    const isCaribbeanMentioned = contextString.includes('caribbean') || contextString.includes('jamaica') || contextString.includes('cuba') || contextString.includes('haiti') || contextString.includes('trinidad') || contextString.includes('puerto rico') || contextString.includes('bahamas');

    // [CRITICAL FIX] Symmetric culture blocking — only block when another specific culture IS detected
    const anyCultureDetected = isKoreaMentioned || isChinaMentioned || isJapanMentioned || isWesternMentioned || isArabMentioned || isIndiaMentioned || isSoutheastAsiaMentioned || isAfricaMentioned || isLatinAmericaMentioned || isRussiaMentioned || isTurkeyMentioned || isNordicMentioned || isCentralAsiaMentioned || isOceaniaMentioned || isCaribbeanMentioned;

    if (!isKoreaMentioned && anyCultureDetected) {
        negativePrompt += ", (Korean architecture: -2.0), (Korean streets: -2.0), (Korean signage: -2.0), (Hanok: -2.0)";
    }
    if (!isChinaMentioned && anyCultureDetected) {
        negativePrompt += ", (Chinese architecture: -1.5), (Chinese pagoda: -1.5)";
    }
    if (!isJapanMentioned && anyCultureDetected) {
        negativePrompt += ", (Japanese architecture: -1.5), (Torii gate: -1.5)";
    }
    if (!isWesternMentioned && anyCultureDetected) {
        negativePrompt += ", (Western architecture: -1.0)";
    }
    if (!isIndiaMentioned && anyCultureDetected) {
        negativePrompt += ", (Indian architecture: -1.5), (Hindu temple: -1.5), (Taj Mahal: -1.5)";
    }
    if (!isRussiaMentioned && anyCultureDetected) {
        negativePrompt += ", (Russian architecture: -1.0), (Onion dome: -1.0)";
    }
    if (!isTurkeyMentioned && anyCultureDetected) {
        negativePrompt += ", (Turkish architecture: -1.0), (Blue Mosque: -1.0), (Ottoman architecture: -1.0)";
    }
    if (!isNordicMentioned && anyCultureDetected) {
        negativePrompt += ", (Nordic architecture: -1.0), (Stave church: -1.0), (Viking longship: -1.0)";
    }
    if (!isCentralAsiaMentioned && anyCultureDetected) {
        negativePrompt += ", (Central Asian architecture: -1.0), (Yurt: -1.0), (Silk Road: -1.0)";
    }
    if (!isOceaniaMentioned && anyCultureDetected) {
        negativePrompt += ", (Polynesian architecture: -1.0), (Tiki: -1.0)";
    }

    let prompt = "";

    // [INFOGRAPHIC MODE]
    if (scene.isInfographic) {
        const styleIntegration = getIntegrativeInfographicInstruction(effectiveStyle);
        const styleNegative = getStyleNegativePrompt(effectiveStyle);

        // [FIX] Stronger negative prompt against text blocks
        let infographicNegative = `${styleNegative}, ${negativePrompt}, (white background: 2.0), (simple background: 2.0), (document), (paper), (text body), (paragraphs), (long sentences), (script overlay), (description text), (annotations), (writing), (article)`;
        if (suppressText) infographicNegative += ", (text), (words), (numbers), (labels)";

        // [WIRING UPDATE: Interaction & Data Context]
        // 1. If character is present, define interaction (e.g., presenting, analyzing).
        let interactionContext = "";
        if (scene.characterPresent && scene.castType !== 'NOBODY') {
            interactionContext = "(Action: Character is analyzing or presenting the data), (Interaction: Pointing at or standing next to the visualization), ";
        }

        // [NEW] Mixed Media Logic for Infographics
        let globalStyleInstruction = "";
        let mixedMediaInstruction = "";
        let materialPrompt = "";

        if (isMixedMedia) {
             // [MIXED MEDIA MODE] — 캐릭터: 원본 아트 스타일 / 배경: 선택된 스타일
             // 1. Subject keeps its ORIGINAL art style from reference image
             subjectPrompt += ` (Render Character in its ORIGINAL art style from the reference image), (Data Elements in Art Style: ${effectiveStyle}), `;

             // 2. Background gets the SELECTED visual style
             mixedMediaInstruction = `[MIXED MEDIA INFOGRAPHIC RULE: The Character retains its ORIGINAL art style from the reference image. Charts/Data use '${effectiveStyle}'. The Environment/Background uses '${effectiveStyle}' rendering. The character's original art style must NOT be converted.]`;

             // 3. Material instruction adjusted for separation
             materialPrompt = `(Render the diagram/chart using the artistic medium of: ${effectiveStyle}). (Background rendered in '${effectiveStyle}' style).`;

             // 4. Disable global style
             globalStyleInstruction = "";
        } else {
             // [NORMAL MODE]
             globalStyleInstruction = `(MANDATORY Art Style: ${effectiveStyle}: 2.5), (Style Override: ${effectiveStyle})`;

             // Standard material instruction
             materialPrompt = `(Render the diagram/chart using the artistic medium of: ${effectiveStyle}). (Do not use generic digital chart style). (Integrate data visual elements into the scene naturally).`;

             mixedMediaInstruction = "";
        }

        // [FIX] User-edited prompt boost: place user's description at highest priority position
        const userEditPrefix = isUserEdited
            ? `[USER PRIORITY DIRECTIVE: The following is the user's explicitly edited visual description. This MUST be the primary visual guide for the image. Follow it faithfully.]\n(PRIMARY VISUAL: ${effectiveVisualPrompt}: 2.5),\n`
            : '';

        prompt = `
        ${userEditPrefix}
        ${locationContext} ${eraContext} ${cultureContext}
        ${subjectPrompt} ${interactionContext}
        ${globalStyleInstruction}
        ${mixedMediaInstruction}
        ${colorEnforcement}
        ${aspectComposition}
        ${styleIntegration}
        ${materialPrompt}
        (Visual Context: ${effectiveVisualPrompt})
        ${langInstruction}

        [IMPORTANT: Do NOT render any visible text, words, letters, labels, captions, or watermarks in the image unless explicitly instructed below with a [Text: ...] directive.]

        [NEGATIVE] ${infographicNegative}
        `;

        // Only allow text if explicitly requested by AI analysis AND short AND not suppressed
        // [FIXED] Removed textForceLock from the trigger condition.
        if (!suppressText && scene.requiresTextRendering && (!scene.textToRender || scene.textToRender.length < 20)) {
             prompt += ` [Text: ${scene.textToRender}]`;
        }

    } else {
        // [NORMAL MODE]
        const styleNegative = getStyleNegativePrompt(effectiveStyle);

        // [UPDATED] Background & Style Logic for Mixed Media
        let backgroundPrompt = "";
        let globalStyleInstruction = "";
        let mixedMediaInstruction = "";

        if (isMixedMedia) {
            // [MIXED MEDIA MODE] — 캐릭터: 원본 아트 스타일 보존 / 배경: 선택된 비주얼 스타일 적용
            // 1. Subject keeps its ORIGINAL art style from reference image (2D→2D, anime→anime, realistic→realistic)
            subjectPrompt += ` (Render the Character in its ORIGINAL art style exactly as shown in the reference image — preserve the exact rendering method, line quality, shading technique, color palette, and visual medium from the reference), `;

            // 2. Background gets the SELECTED visual style
            backgroundPrompt = `(Background: ${effectiveVisualPrompt}), (Background Style: ${effectiveStyle}, Cinematic, Detailed, 3D Depth), (Background environment rendered in '${effectiveStyle}' style)`;

            // 3. Separation Rule — character's original art style stays distinct from background style
            mixedMediaInstruction = `[MIXED MEDIA VISUAL RULE: The Character MUST be rendered in its ORIGINAL art style exactly as it appears in the reference image. If the character reference is 2D cartoon with flat colors and bold outlines, the character MUST remain 2D cartoon with flat colors and bold outlines. If anime, keep anime. If realistic, keep realistic. Do NOT convert or adapt the character's art style. The Background environment is rendered in '${effectiveStyle}' style. This deliberate style contrast between character and background is the CORE creative intent. The character must still be composited with correct perspective and scale within the scene.]`;

            // 4. Disable Global Style (prevents overriding character's original style)
            globalStyleInstruction = "";
        } else {
            // [NORMAL MODE]
            // 1. Background strictly follows detected context (location/era/culture takes priority over visualPrompt)
            backgroundPrompt = `(Background MUST match detected location and culture), (Background: ${effectiveVisualPrompt} -- STRICTLY FOLLOW SCRIPT CONTEXT), (No random background), (Environment with authentic architectural details, vegetation, and props matching the cultural context)`;

            // 2. Global Style applies to everything — 강화된 가중치
            globalStyleInstruction = `(MANDATORY Art Style: ${effectiveStyle}: 2.5), (The ENTIRE image MUST be rendered in this exact style), (Style Override: ${effectiveStyle})`;
        }

        // [NEW] Contextual Background Enforcement (Common) + Cinematic Quality Boost
        backgroundPrompt += `, (Background: Highly Detailed Environment matching script context), (Cinematic Depth), (Full Scenery), (Professional cinematography, 8K resolution detail, volumetric lighting with atmospheric depth)`;

        // [FIX] User-edited prompt boost: place user's description at highest priority position
        const userEditPrefixNormal = isUserEdited
            ? `[USER PRIORITY DIRECTIVE: The following is the user's explicitly edited visual description. This MUST be the primary visual guide for the image. Follow it faithfully.]\n(PRIMARY VISUAL: ${effectiveVisualPrompt}: 2.5),\n`
            : '';

        // [CRITICAL REORDERING] Subject -> Action/Context -> Style -> Tech Specs
        prompt = `
        ${userEditPrefixNormal}
        ${subjectPrompt}
        ${locationContext} ${eraContext} ${cultureContext}
        ${backgroundPrompt}
        (Action/Context: ${effectiveVisualPrompt})

        ${globalStyleInstruction}
        ${mixedMediaInstruction}

        ${colorEnforcement}
        ${aspectComposition}
        ${langInstruction}

        ${scene.characterPresent && baseAge && scene.castType === 'MAIN' ? `[Age: ${baseAge}]` : ''}

        [IMPORTANT: Do NOT render any visible text, words, letters, labels, captions, or watermarks in the image unless explicitly instructed below with a [Text: ...] directive.]

        [NEGATIVE] ${negativePrompt}, ${styleNegative}, (Bad quality), (Distorted)
        `;

        // [FIXED] Removed textForceLock from the trigger condition.
        if (!suppressText && scene.requiresTextRendering) {
            prompt += ` [Text: ${scene.textToRender}]`;
        }
    }

    if (updateStatus) {
        if (scene.castType === 'KEY_ENTITY') {
            const compLabel = scene.entityComposition === 'ENTITY_WITH_MAIN' ? '+캐릭터 동반' : scene.entityComposition === 'MAIN_OBSERVING' ? '어깨너머' : scene.entityComposition === 'ENTITY_FG_MAIN_BG' ? '전경/후경' : scene.entityComposition === 'MAIN_FG_ENTITY_BG' ? '캐릭터 전경' : '단독';
            updateStatus(`🔍 ${scene.entityName} (${compLabel}) 생성 중...`);
        } else {
            updateStatus("이미지 생성 중...");
        }
    }

    // [UPDATED] Multi-character reference: pass first image as primary, rest via array
    const primaryCharImg = finalCharImages.length > 0 ? finalCharImages[0] : undefined;

    // [NEW] Per-scene reference image: append to finalCharImages so APIs receive it as additional reference
    if (scene.referenceImage && scene.referenceImage.trim()) {
        finalCharImages = [...finalCharImages, scene.referenceImage];
    }

    // [NANOBANANA 2 OPTIMIZATION] SD-style → Gemini native prompt 변환
    const optimizedPrompt = optimizePromptForNanobanana2(prompt);

    // [CONTENT FILTER] 금칙어 필터링 — API 전송 전 안전하지 않은 용어 제거
    const filterResult = filterPromptContent(optimizedPrompt);
    const finalPrompt = filterResult.cleanedPrompt;
    if (filterResult.wasFiltered) {
        console.warn("[ContentFilter] 금칙어 제거됨:", filterResult.removedTerms.join(', '));
    }

    // [DIAGNOSTIC] 이미지 생성 파라미터 기록
    logger.trackImageGeneration({
        sceneId: scene.id || '?',
        sceneIndex: sceneIndex ?? -1,
        style: effectiveStyle,
        aspectRatio: ratio,
        imageModel: String(model),
        castType: scene.castType,
        hasCharacterRef: finalCharImages.length > 0,
        hasFeedback: !!(feedback && feedback.trim()),
        enableWebSearch: effectiveWebSearch || false,
        promptLength: finalPrompt.length,
        provider: 'kie-primary',
    });

    // [OFFICIAL DOC] 2단계 폴백: Kie Nanobanana 2 (1차) → Evolink Nanobanana 2 (2차)
    // Kie: nano-banana-2, POST /api/v1/jobs/createTask (google_search)
    // Evolink: gemini-3.1-flash-image-preview, POST /v1/images/generations (web_search)
    const genStartTime = performance.now();
    try {
        if (updateStatus) updateStatus(effectiveWebSearch ? "⚡ Kie Nanobanana 2 + 웹검색 생성 중..." : "⚡ Kie Nanobanana 2 생성 중...");
        const url = await generateKieImage(finalPrompt, ratio, finalCharImages, prodImg, "nano-banana-2", undefined, effectiveWebSearch);
        logger.trackGenerationResult({ type: 'image', sceneId: scene.id || '?', success: true, provider: 'Kie', duration: Math.round(performance.now() - genStartTime) });
        return { url, isFallback: false, isFiltered: filterResult.wasFiltered };
    } catch (e) {
        logger.trackGenerationResult({ type: 'image', sceneId: scene.id || '?', success: false, provider: 'Kie', duration: Math.round(performance.now() - genStartTime), error: (e as Error).message });
        console.warn("[ImageGen] Kie Nanobanana 2 실패, Evolink 폴백 시도", e);
    }

    const fbStartTime = performance.now();
    try {
        if (updateStatus) updateStatus(effectiveWebSearch ? "Evolink + 웹검색 폴백 시도 중..." : "Evolink Nanobanana 2 폴백 시도 중...");
        const url = await generateEvolinkImageWrapped(finalPrompt, ratio, finalCharImages, prodImg, "2K", effectiveWebSearch);
        logger.trackGenerationResult({ type: 'image', sceneId: scene.id || '?', success: true, provider: 'Evolink', duration: Math.round(performance.now() - fbStartTime), isFallback: true });
        return { url, isFallback: true, isFiltered: filterResult.wasFiltered };
    } catch (e) {
        logger.trackGenerationResult({ type: 'image', sceneId: scene.id || '?', success: false, provider: 'Evolink', duration: Math.round(performance.now() - fbStartTime), error: (e as Error).message });
        console.warn("[ImageGen] Evolink Nanobanana 2도 실패", e);
        throw new Error(`이미지 생성 실패: Kie, Evolink 모두 실패. ${(e as Error).message}`);
    }
};
