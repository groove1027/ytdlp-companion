
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

// [NEW] Helper: Style Negative Prompt
// [UPDATED] Extended negative prompts to avoid style bleeding into language/text
export const getStyleNegativePrompt = (style: string): string => {
    const s = style.toLowerCase();
    if (s.match(/anime|manga|webtoon|2d|cartoon|illustration|drawing|sketch|flat|vector/)) {
        return "(photorealistic: -2.0), (3d render: -2.0), (realistic texture: -2.0), (photo: -2.0), (unreal engine: -2.0), (photograph), (realistic)";
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
