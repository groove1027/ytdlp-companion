/**
 * Korean Subtitle Color Palettes
 * 7 categories × 20 combinations = 140 unique color sets
 * Each includes: text color, outline color + width, optional background
 */

export interface SubtitleColorPalette {
  color: string;           // Text color (hex)
  outlineColor: string;    // Outline color (hex)
  outlineWidth: number;    // Outline width (0-5px)
  backgroundColor?: string; // Optional background (hex+alpha)
}

export interface SubtitleColorCategory {
  name: string;
  nameKo: string;
  description: string;
  palettes: SubtitleColorPalette[];
}

// 1. BASIC (기본) — Professional, readable colors
export const BASIC_PALETTES: SubtitleColorPalette[] = [
  { color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 2 },
  { color: '#FFFEF0', outlineColor: '#1a1a1a', outlineWidth: 2 },
  { color: '#F5F5F0', outlineColor: '#2d2d2d', outlineWidth: 2 },
  { color: '#FFF9F0', outlineColor: '#3d2d1f', outlineWidth: 2 },
  { color: '#F0F4F8', outlineColor: '#1a2d3d', outlineWidth: 2 },
  { color: '#FFFFFF', outlineColor: '#333333', outlineWidth: 3, backgroundColor: '#00000044' },
  { color: '#FFFEF0', outlineColor: '#4a4a4a', outlineWidth: 2 },
  { color: '#F8F8F0', outlineColor: '#2d2d2d', outlineWidth: 2, backgroundColor: '#00000033' },
  { color: '#FFFFFF', outlineColor: '#1f1f3d', outlineWidth: 2 },
  { color: '#FFF5E6', outlineColor: '#3d2d1a', outlineWidth: 2 },
  { color: '#FFFFFF', outlineColor: '#2d3d4a', outlineWidth: 3 },
  { color: '#F0F0F0', outlineColor: '#1a1a1a', outlineWidth: 2 },
  { color: '#FFFBF0', outlineColor: '#4a3d2d', outlineWidth: 2 },
  { color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 2, backgroundColor: '#00000055' },
  { color: '#F5F5FF', outlineColor: '#2d2d4a', outlineWidth: 2 },
  { color: '#FFF0F0', outlineColor: '#3d1a2d', outlineWidth: 2 },
  { color: '#FFFFFF', outlineColor: '#4a4a4a', outlineWidth: 2 },
  { color: '#E8E8E8', outlineColor: '#1a1a1a', outlineWidth: 2 },
  { color: '#FFFFEB', outlineColor: '#3d3d1a', outlineWidth: 2 },
  { color: '#FFFFFF', outlineColor: '#1a3d3d', outlineWidth: 2 },
];

// 2. COLOR (컬러) — Bold, vivid, attention-grabbing
export const COLOR_PALETTES: SubtitleColorPalette[] = [
  { color: '#FF6B6B', outlineColor: '#000000', outlineWidth: 2 }, // Bright Red
  { color: '#FF0099', outlineColor: '#000000', outlineWidth: 2 }, // Magenta
  { color: '#00CED1', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Turquoise
  { color: '#00FF41', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Lime Green
  { color: '#FFD700', outlineColor: '#2d2d2d', outlineWidth: 2 }, // Gold
  { color: '#FF7F00', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Copper/Orange
  { color: '#00BFFF', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Deep Sky Blue
  { color: '#FF1493', outlineColor: '#000000', outlineWidth: 2 }, // Deep Pink
  { color: '#32CD32', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Lime
  { color: '#FF4500', outlineColor: '#000000', outlineWidth: 2 }, // Coral/OrangeRed
  { color: '#9D00FF', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Electric Purple
  { color: '#FF00FF', outlineColor: '#000000', outlineWidth: 2 }, // Magenta (vivid)
  { color: '#00FF7F', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Spring Green
  { color: '#FFB6C1', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Light Pink
  { color: '#4169E1', outlineColor: '#000000', outlineWidth: 2 }, // Royal Blue
  { color: '#FF6347', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Tomato Red
  { color: '#1E90FF', outlineColor: '#000000', outlineWidth: 2 }, // Dodger Blue
  { color: '#FF69B4', outlineColor: '#000000', outlineWidth: 2 }, // Hot Pink
  { color: '#00FA9A', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Medium Spring Green
  { color: '#FFD700', outlineColor: '#1a1a1a', outlineWidth: 3 }, // Gold (thick outline)
];

// 3. STYLE (스타일) — Creative, artistic
export const STYLE_PALETTES: SubtitleColorPalette[] = [
  { color: '#00FF00', outlineColor: '#000000', outlineWidth: 3 }, // Electric Green Neon
  { color: '#FF10F0', outlineColor: '#000000', outlineWidth: 3 }, // Hot Pink Neon
  { color: '#00FFFF', outlineColor: '#1a001a', outlineWidth: 2 }, // Electric Cyan
  { color: '#FF00FF', outlineColor: '#1a1a00', outlineWidth: 3 }, // Magenta Neon
  { color: '#FFE63D', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Neon Yellow
  { color: '#FFB3D9', outlineColor: '#4a1a4a', outlineWidth: 2 }, // Pastel Pink
  { color: '#D9E5FF', outlineColor: '#1a2d4a', outlineWidth: 2 }, // Pastel Blue
  { color: '#FFD9B3', outlineColor: '#3d2d1a', outlineWidth: 2 }, // Pastel Peach
  { color: '#E5D9FF', outlineColor: '#2d1a4a', outlineWidth: 2 }, // Pastel Purple
  { color: '#D9FFE5', outlineColor: '#1a3d2d', outlineWidth: 2 }, // Pastel Green
  { color: '#FFFFFF', outlineColor: '#FF00FF', outlineWidth: 2 }, // Cyberpunk: White text, Magenta outline
  { color: '#00FFFF', outlineColor: '#FF00FF', outlineWidth: 2 }, // Cyberpunk: Cyan text, Magenta outline
  { color: '#FF00FF', outlineColor: '#00FFFF', outlineWidth: 2 }, // Synthwave: Magenta text, Cyan outline
  { color: '#FF69B4', outlineColor: '#00BFFF', outlineWidth: 2 }, // Synthwave: Pink text, Sky blue outline
  { color: '#1a0033', outlineColor: '#FF00FF', outlineWidth: 3 }, // Dark Purple with Magenta glow
  { color: '#331a00', outlineColor: '#FFB300', outlineWidth: 3 }, // Dark Brown with Gold glow
  { color: '#00331a', outlineColor: '#00FF41', outlineWidth: 3 }, // Dark Green with Lime glow
  { color: '#1a0033', outlineColor: '#9D00FF', outlineWidth: 3 }, // Dark with Electric Purple glow
  { color: '#FF1493', outlineColor: '#FFFFFF', outlineWidth: 2 }, // Deep Pink with white outline
  { color: '#00CED1', outlineColor: '#FFD700', outlineWidth: 2 }, // Turquoise with gold outline
];

// 4. VARIETY (예능) — Fun, energetic, Korean variety show
export const VARIETY_PALETTES: SubtitleColorPalette[] = [
  { color: '#FFFF00', outlineColor: '#000000', outlineWidth: 3 }, // Bright Yellow
  { color: '#FF0000', outlineColor: '#FFFFFF', outlineWidth: 2 }, // Bright Red
  { color: '#00CC00', outlineColor: '#000000', outlineWidth: 3 }, // Bright Green
  { color: '#FF0000', outlineColor: '#000000', outlineWidth: 3 }, // Bold Red
  { color: '#0066FF', outlineColor: '#FFFFFF', outlineWidth: 2 }, // Bold Blue
  { color: '#FFFF00', outlineColor: '#FF0000', outlineWidth: 3 }, // Yellow text, Red outline
  { color: '#FF0000', outlineColor: '#FFFF00', outlineWidth: 2 }, // Red text, Yellow outline
  { color: '#00FFFF', outlineColor: '#FF0000', outlineWidth: 3 }, // Cyan text, Red outline
  { color: '#FFFF00', outlineColor: '#000000', outlineWidth: 2, backgroundColor: '#FF000088' }, // Yellow on red bg
  { color: '#FFFFFF', outlineColor: '#FF0000', outlineWidth: 3, backgroundColor: '#0000FF88' }, // White on blue bg
  { color: '#00FF00', outlineColor: '#FF0000', outlineWidth: 3 }, // Green text, Red outline
  { color: '#FF0099', outlineColor: '#000000', outlineWidth: 3 }, // Hot pink
  { color: '#FFFF00', outlineColor: '#0066FF', outlineWidth: 3 }, // Yellow text, Blue outline
  { color: '#FF6600', outlineColor: '#000000', outlineWidth: 3 }, // Orange
  { color: '#FFFFFF', outlineColor: '#FF0000', outlineWidth: 3, backgroundColor: '#00CC0077' }, // White on green bg
  { color: '#00FFFF', outlineColor: '#000000', outlineWidth: 3, backgroundColor: '#FF990077' }, // Cyan on orange bg
  { color: '#FF0000', outlineColor: '#FFFF00', outlineWidth: 3 }, // Red text, Yellow outline (thick)
  { color: '#0066FF', outlineColor: '#FFFF00', outlineWidth: 3 }, // Blue text, Yellow outline
  { color: '#00FF00', outlineColor: '#FFFFFF', outlineWidth: 2, backgroundColor: '#FF000077' }, // Green on red bg
  { color: '#FFFF00', outlineColor: '#00CC00', outlineWidth: 3 }, // Yellow text, Green outline
];

// 5. EMOTION (감성) — Warm, soft, atmospheric
export const EMOTION_PALETTES: SubtitleColorPalette[] = [
  { color: '#F4D03F', outlineColor: '#8B7500', outlineWidth: 1 }, // Warm Gold
  { color: '#E8B4A8', outlineColor: '#8B6F47', outlineWidth: 1 }, // Soft Warm Beige
  { color: '#F4A6A6', outlineColor: '#A86464', outlineWidth: 1 }, // Soft Rose
  { color: '#D4A5A5', outlineColor: '#8B6F6F', outlineWidth: 1 }, // Muted Mauve
  { color: '#B8A8D8', outlineColor: '#7B5FA8', outlineWidth: 1 }, // Soft Purple
  { color: '#A8C8D8', outlineColor: '#5B7F8B', outlineWidth: 1 }, // Soft Blue-gray
  { color: '#D8B8B8', outlineColor: '#8B6F6F', outlineWidth: 1 }, // Dusty Rose
  { color: '#E8D4B8', outlineColor: '#A88B64', outlineWidth: 1 }, // Soft Tan
  { color: '#D4E8D8', outlineColor: '#7FA886', outlineWidth: 1 }, // Soft Sage Green
  { color: '#E8D4D8', outlineColor: '#A88B8B', outlineWidth: 1 }, // Soft Pink-beige
  { color: '#C8A8D4', outlineColor: '#8B6FA8', outlineWidth: 1 }, // Lavender
  { color: '#D8C8A8', outlineColor: '#8B7B5B', outlineWidth: 1 }, // Warm Khaki
  { color: '#B8D4D8', outlineColor: '#6F8B8B', outlineWidth: 1 }, // Soft Teal
  { color: '#D4B8C8', outlineColor: '#8B6F7F', outlineWidth: 1 }, // Soft Plum
  { color: '#E8C8B8', outlineColor: '#A88B6F', outlineWidth: 1 }, // Soft Apricot
  { color: '#C8D8B8', outlineColor: '#7FA876', outlineWidth: 1 }, // Soft Pistachio
  { color: '#D8B8D4', outlineColor: '#8B6F8B', outlineWidth: 1 }, // Soft Orchid
  { color: '#B8C8D8', outlineColor: '#6F7F8B', outlineWidth: 1 }, // Soft Slate
  { color: '#E8B8D4', outlineColor: '#A86F8B', outlineWidth: 1 }, // Soft Mauve
  { color: '#D4D8B8', outlineColor: '#8B8B5B', outlineWidth: 1 }, // Soft Olive
];

// 6. CINEMATIC (시네마틱) — Film-grade, professional
export const CINEMATIC_PALETTES: SubtitleColorPalette[] = [
  { color: '#FFFFFF', outlineColor: '#1a1a1a', outlineWidth: 2, backgroundColor: '#00000066' }, // Classic lower third
  { color: '#F5E6D3', outlineColor: '#2d2d2d', outlineWidth: 2 }, // Antique White
  { color: '#D4AF37', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Gold leaf
  { color: '#FFFFFF', outlineColor: '#1a3d4a', outlineWidth: 2, backgroundColor: '#1a3d4a99' }, // White on teal bg
  { color: '#E8D5C4', outlineColor: '#3d2d1a', outlineWidth: 2 }, // Cream
  { color: '#C0B8A0', outlineColor: '#3d3d2d', outlineWidth: 2 }, // Warm Gray
  { color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 3 }, // High contrast film
  { color: '#F0E68C', outlineColor: '#2d2d1a', outlineWidth: 2 }, // Pale Gold
  { color: '#FFFFFF', outlineColor: '#2d1a3d', outlineWidth: 2, backgroundColor: '#2d1a3d99' }, // White on plum bg
  { color: '#A68064', outlineColor: '#3d3d3d', outlineWidth: 2 }, // Warm Brown
  { color: '#FFFFFF', outlineColor: '#0a0a0a', outlineWidth: 2, backgroundColor: '#00000088' }, // Letterpress look
  { color: '#FFD700', outlineColor: '#2d2d2d', outlineWidth: 2 }, // Gold cinema
  { color: '#F5F0E8', outlineColor: '#1a1a1a', outlineWidth: 2 }, // Off-white
  { color: '#FFFFFF', outlineColor: '#3d1a1a', outlineWidth: 2, backgroundColor: '#3d1a1a99' }, // White on burgundy bg
  { color: '#E5D4C1', outlineColor: '#4a3d2d', outlineWidth: 2 }, // Aged paper
  { color: '#FAEBD7', outlineColor: '#2d1a1a', outlineWidth: 2 }, // Antique wash
  { color: '#FFFFFF', outlineColor: '#1a3d1a', outlineWidth: 2, backgroundColor: '#1a3d1a99' }, // White on forest green bg
  { color: '#DEB887', outlineColor: '#3d2d2d', outlineWidth: 2 }, // Burlywood
  { color: '#F5DEB3', outlineColor: '#4a3d2d', outlineWidth: 2 }, // Wheat
  { color: '#FFFFFF', outlineColor: '#1a1a3d', outlineWidth: 2, backgroundColor: '#1a1a3d99' }, // White on midnight blue bg
];

// 7. NOBG (배경없음) — Must be readable without background
export const NOBG_PALETTES: SubtitleColorPalette[] = [
  { color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 4 }, // Maximum contrast
  { color: '#FFFF00', outlineColor: '#000000', outlineWidth: 5 }, // Bright yellow (high vis)
  { color: '#FFFFFF', outlineColor: '#1a1a1a', outlineWidth: 5 }, // Thick white outline
  { color: '#FF0000', outlineColor: '#FFFFFF', outlineWidth: 3 }, // Red with white outline
  { color: '#00FFFF', outlineColor: '#000000', outlineWidth: 4 }, // Cyan high contrast
  { color: '#00FF00', outlineColor: '#000000', outlineWidth: 4 }, // Green (neon)
  { color: '#FFFFFF', outlineColor: '#FF0000', outlineWidth: 3 }, // White with red outline
  { color: '#FFFF00', outlineColor: '#1a1a1a', outlineWidth: 4 }, // Yellow with dark outline
  { color: '#FF1493', outlineColor: '#FFFFFF', outlineWidth: 3 }, // Deep Pink with white outline
  { color: '#00FF00', outlineColor: '#1a1a1a', outlineWidth: 5 }, // Lime with dark thick outline
  { color: '#FFFFFF', outlineColor: '#0066FF', outlineWidth: 3 }, // White with blue outline
  { color: '#00FFFF', outlineColor: '#1a1a1a', outlineWidth: 4 }, // Cyan with dark outline
  { color: '#FF00FF', outlineColor: '#FFFFFF', outlineWidth: 3 }, // Magenta with white outline
  { color: '#FFFF00', outlineColor: '#FF0000', outlineWidth: 4 }, // Yellow with red outline (double contrast)
  { color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 5 }, // Ultra thick white outline
  { color: '#00FF41', outlineColor: '#000000', outlineWidth: 4 }, // Neon Green glow effect
  { color: '#FF69B4', outlineColor: '#000000', outlineWidth: 4 }, // Hot Pink glow
  { color: '#00BFFF', outlineColor: '#1a1a1a', outlineWidth: 4 }, // Sky Blue with dark outline
  { color: '#FFFFFF', outlineColor: '#FF0000', outlineWidth: 4 }, // White with thick red outline
  { color: '#FFD700', outlineColor: '#1a1a1a', outlineWidth: 5 }, // Gold with thick dark outline
];

// Master collection
export const SUBTITLE_COLOR_PALETTES: SubtitleColorCategory[] = [
  {
    name: 'BASIC',
    nameKo: '기본',
    description: 'Professional, readable colors with classic outlines',
    palettes: BASIC_PALETTES,
  },
  {
    name: 'COLOR',
    nameKo: '컬러',
    description: 'Bold, vivid, attention-grabbing colors',
    palettes: COLOR_PALETTES,
  },
  {
    name: 'STYLE',
    nameKo: '스타일',
    description: 'Creative, artistic, neon and cyberpunk styles',
    palettes: STYLE_PALETTES,
  },
  {
    name: 'VARIETY',
    nameKo: '예능',
    description: 'Fun, energetic colors for variety shows',
    palettes: VARIETY_PALETTES,
  },
  {
    name: 'EMOTION',
    nameKo: '감성',
    description: 'Warm, soft, atmospheric colors',
    palettes: EMOTION_PALETTES,
  },
  {
    name: 'CINEMATIC',
    nameKo: '시네마틱',
    description: 'Film-grade, professional colors',
    palettes: CINEMATIC_PALETTES,
  },
  {
    name: 'NOBG',
    nameKo: '배경없음',
    description: 'High-contrast colors readable without background',
    palettes: NOBG_PALETTES,
  },
];

/**
 * Helper function to get all palettes flattened
 */
export function getAllSubtitlePalettes(): Array<SubtitleColorPalette & { category: string; categoryKo: string }> {
  const result: Array<SubtitleColorPalette & { category: string; categoryKo: string }> = [];

  for (const category of SUBTITLE_COLOR_PALETTES) {
    for (const palette of category.palettes) {
      result.push({
        ...palette,
        category: category.name,
        categoryKo: category.nameKo,
      });
    }
  }

  return result;
}

/**
 * Helper function to get random palette from category
 */
export function getRandomPaletteByCategory(categoryName: string): SubtitleColorPalette | null {
  const category = SUBTITLE_COLOR_PALETTES.find(c => c.name === categoryName);
  if (!category) return null;

  const randomIndex = Math.floor(Math.random() * category.palettes.length);
  return category.palettes[randomIndex];
}

/**
 * Helper function to get palette by index within category
 */
export function getPaletteByIndex(categoryName: string, index: number): SubtitleColorPalette | null {
  const category = SUBTITLE_COLOR_PALETTES.find(c => c.name === categoryName);
  if (!category || index < 0 || index >= category.palettes.length) return null;

  return category.palettes[index];
}
