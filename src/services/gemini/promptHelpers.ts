
// [FIX #458/#480] Helper: 이미지 생성용 스타일 정제 — 텍스트 유도 키워드 제거
// "Chinese calligraphy" 등이 이미지에 한자를 삽입하는 원인
export const sanitizeStyleForImageGen = (style: string): string => {
    return style
        .replace(/Chinese\s+calligraphy/gi, 'ink brush strokes, ink wash art')
        .replace(/Japanese\s+calligraphy/gi, 'ink brush strokes, sumi-e art')
        .replace(/Arabic\s+calligraphy/gi, 'ornamental brush strokes')
        .replace(/\bcalligraphy\b/gi, 'ink brush painting');
};

// [FIX #458/#480] Helper: 텍스트 유도 스타일에 대한 강화 네거티브 프롬프트
export const getAntiTextNegative = (style: string): string => {
    const s = style.toLowerCase();
    if (s.includes('calligraphy') || s.includes('wuxia') || s.includes('무협') ||
        s.includes('chinese') || s.includes('japanese') || s.includes('oriental')) {
        return '(Chinese characters: -2.0), (Japanese characters: -2.0), (kanji: -2.0), (hanzi: -2.0), (written text: -2.0), (calligraphic text: -2.0), (text overlay: -2.0), (inscriptions: -2.0)';
    }
    return '';
};

// [NEW] Helper: Map visual style to subtle typography texture (Restored for internal fill texture)
export const getMicroTexture = (style: string): string => {
    const s = style.toLowerCase();
    if (s.includes('noir') || s.includes('cinematic') || s.includes('film') || s.includes('movie')) return "Subtle Film Grain Finish";
    if (s.includes('vintage') || s.includes('retro') || s.includes('paper') || s.includes('analog')) return "Faint Paper Texture Finish";
    if (s.includes('cyberpunk') || s.includes('neon') || s.includes('sf') || s.includes('future') || s.includes('tech')) return "Smooth Glossy Finish";
    if (s.includes('watercolor') || s.includes('oil') || s.includes('paint') || s.includes('art')) return "Light Canvas Texture Finish";
    if (s.includes('plastic') || s.includes('toy') || s.includes('3d') || s.includes('clay')) return "Soft Plastic Sheen";
    if (s.includes('metal') || s.includes('robot') || s.includes('armor')) return "Brushed Metal Finish";
    return "Matte Finish on Text"; // Default modified to Matte
};

// [NEW] Helper: Black & White Style Detector
// Returns true if the style explicitly demands B&W (e.g. Junji Ito, Manga, Noir)
export const isBlackAndWhiteStyle = (style: string): string => {
    const s = style.toLowerCase();
    const bwKeywords = [
        'junji ito', 'ito junji', // Specific Artist
        'manga', 'manhwa', // Comics often B&W
        'noir', 'film noir', // Genre
        'sketch', 'pencil', 'charcoal', 'graphite', // Medium
        'monochrome', 'grayscale', 'black and white', 'b&w', // Direct terms
        'ink wash', 'sumi-e', 'calligraphy', // Traditional
        'stencil', 'silhouette', 'line art' // Technique
    ];

    // Check if any keyword exists
    if (bwKeywords.some(k => s.includes(k))) return "TRUE";
    return "FALSE";
};

// [NEW] Helper: Detect if style is photorealistic/cinematic (live-action)
// Used to conditionally apply cinematic quality descriptors only for realistic styles
export const isRealisticStyle = (style: string): boolean => {
    const s = style.toLowerCase();
    // 1차: 명시적 비실사 키워드가 있으면 → 비실사
    if (s.match(/anime|manga|webtoon|2d|cartoon|illustration|drawing|sketch|flat|vector|pixel|paint|watercolor|oil\s*paint|crayon|pastel|chalk|stencil|graffiti|pop\s*art|ukiyo|woodcut|linocut|collage|paper\s*cut|clay|plastic|toy|lego|voxel|chibi|retro\s*game|8.?bit|16.?bit|meme|crude|simplistic|psychedelic|mural|hieroglyph/)) {
        return false;
    }
    // 2차: 명시적 실사 키워드가 있으면 → 실사
    if (s.match(/realistic|photo|movie|film|cinema|live.?action|8k|photography|hyper.?real|documentary|cinematic|blockbuster|thriller|noir|drama|horror|war|western|spy|k.?drama|sf\s|sci.?fi|futurist|fantasy|medieval|historical|vintage\s*film/)) {
        return true;
    }
    // 3차: 3D 렌더 스타일은 실사도 비실사도 아닌 중간 — 시네마틱 디스크립터는 적용하지 않음
    if (s.match(/3d|pixar|disney|render/)) {
        return false;
    }
    // 기본값: 판별 불가 시 비실사로 간주 (실사 편향 방지)
    return false;
};

// [NEW] Helper: Style Negative Prompt
// [UPDATED] Extended negative prompts to avoid style bleeding into language/text
export const getStyleNegativePrompt = (style: string): string => {
    const s = style.toLowerCase();
    if (s.match(/anime|manga|webtoon|2d|cartoon|illustration|drawing|sketch|flat|vector|pixel|paint|watercolor|crayon|pastel|chalk|stencil|graffiti|pop\s*art|ukiyo|woodcut|linocut|collage|paper\s*cut|meme|crude|simplistic|psychedelic|mural|hieroglyph/)) {
        return "(photorealistic: -2.0), (3d render: -2.0), (realistic texture: -2.0), (photo: -2.0), (unreal engine: -2.0), (photograph), (realistic), (8K resolution: -2.0), (volumetric lighting: -2.0), (cinematic: -2.0), (professional photography: -2.0)";
    }
    if (s.match(/realistic|photo|movie|film|cinema|live action|8k|photography/)) {
        return "(anime: -2.0), (cartoon: -2.0), (2d: -2.0), (drawing: -2.0), (sketch: -2.0), (illustration: -2.0), (flattened)";
    }
    if (s.match(/3d|pixar|disney|clay|render|plastic/)) {
        return "(2d: -2.0), (sketch: -2.0), (photorealistic: -2.0), (anime: -2.0), (drawing: -2.0)";
    }
    return "";
};

// [UPDATED] Helper: Adaptive Font Selection - Massive & Thick
export const getAdaptiveFont = (s: string) => {
    const lowerStyle = s.toLowerCase();

    // 1. Hand-written / Horror / Rough -> Thick Marker or Brush (NO THIN PEN)
    if (lowerStyle.includes('horror') || lowerStyle.includes('thriller') || lowerStyle.includes('scary') || lowerStyle.includes('zombie') || lowerStyle.includes('sketch') || lowerStyle.includes('drawing'))
        return "Massive Brush Stroke Font, Thick Blood Marker Font, Splatter Font (Ultra Bold)";

    // 2. Cartoon/Webtoon -> Thick Comic Font
    if (lowerStyle.includes('cartoon') || lowerStyle.includes('comic') || lowerStyle.includes('pop art') || lowerStyle.includes('anime') || lowerStyle.includes('webtoon'))
        return "Massive Comic Book Font, Ultra-Bold Bubble Font, Heavy Impact Font";

    // 3. Historical / Serious / Emotional -> Heavy Serif (Mincho)
    if (lowerStyle.includes('history') || lowerStyle.includes('drama') || lowerStyle.includes('vintage') || lowerStyle.includes('classic') || lowerStyle.includes('oriental'))
        return "Massive Slab Serif, Ultra-Black Mincho, Heavy Block Serif, Impactful Editorial Font (No thin lines)";

    // 4. Default -> Thickest Sans-serif
    return "Impact, Helvetica Black, Massive Sans-serif, Extra Bold Gothic, Poster Font";
};

// ============================================================
// Thumbnail Text Style Helpers
// ============================================================
import { ThumbnailTextPreset, ThumbnailFontHint } from '../../types';

/** 프리셋 ID → AI 프롬프트 블록 반환 */
export const getTextPresetPrompt = (presetId: string, presets: ThumbnailTextPreset[]): string => {
    const preset = presets.find(p => p.id === presetId);
    return preset ? preset.promptFragment : '';
};

/** 폰트 힌트 ID → AI 프롬프트 구문 반환 */
export const getFontHintPrompt = (hintId: string, hints: ThumbnailFontHint[]): string => {
    const hint = hints.find(h => h.id === hintId);
    return hint ? hint.promptFragment : '';
};

/** textScale 값 → 프롬프트 스케일 구문 */
export const getTextScalePrompt = (scale: number): string => {
    if (scale <= 0.9) return '(Text Scale: Small), (Compact text size: 1.5), (Subtle text)';
    if (scale <= 1.1) return '(Text Scale: Normal), (Standard text size)';
    if (scale <= 1.5) return '(Text Scale: Large), (Big bold text: 1.5), (Occupying 30% of frame)';
    return '(Text Scale: Massive), (Huge dominating text: 2.0), (Occupying 40%+ of frame), (Maximum impact)';
};

/** textPosition → 레이아웃 오버라이드 프롬프트 */
export const getTextPositionPrompt = (position: string): string => {
    switch (position) {
        case 'top':
            return '[POSITION OVERRIDE] (Text at TOP area: 2.0), (Upper 15-25% of frame), (Headline position).';
        case 'center':
            return '[POSITION OVERRIDE] (Text at CENTER: 2.0), (Middle of frame), (Centered vertically and horizontally).';
        case 'bottom-center':
            return '[POSITION OVERRIDE] (Text at BOTTOM-CENTER: 2.0), (Lower 10-20% of frame), (Bottom headline).';
        case 'right':
            return '[POSITION OVERRIDE] (Text at RIGHT SIDE: 2.0), (Right 30% of frame), (Vertical middle), (Side text layout).';
        default:
            return '';
    }
};

// [UPDATED] Helper: Style-First Infographic Integration
export const getIntegrativeInfographicInstruction = (style: string): string => {
    // [NEW CODE - BACKGROUND & CONTEXT AWARE]
    return `
    [STYLE & ENVIRONMENT INTEGRATION RULE]
    - **CRITICAL**: The chart/graph must be PHYSICALLY INTEGRATED into the scene's environment (e.g., drawn on a wall, projected as a hologram, floating in the air, carved in stone).
    - **FORBIDDEN**: Do NOT use a plain white background or a flat document background.
    - The chart must utilize the **EXACT SAME MEDIUM/TECHNIQUE** as the Art Style: "${style}".
    - The background must remain visible and detailed behind or around the data visualization.
    `;
};
