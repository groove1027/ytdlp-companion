/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 25 Genre-Specific Subtitle Effect CSS Recipes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file contains precise CSS text-shadow recipes for 5 major genres:
 * - Horror/Thriller (5 recipes)
 * - Comedy/Fun (5 recipes)
 * - Romance/Drama (5 recipes)
 * - Action/Sports (5 recipes)
 * - Nature/ASMR (5 recipes)
 *
 * Each recipe includes:
 *   - textShadowCSS: Exact CSS text-shadow string
 *   - fontWeight: Recommended weight (300-900)
 *   - outlineWidth: Recommended stroke width (0-5px)
 *   - outlineColor: Recommended stroke color
 *   - color: Main text color
 *   - description: Visual effect description
 */

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR SHADOW COMPOSITION
// ═══════════════════════════════════════════════════════════════════════════

// Triple-layer glow (far, medium, near)
const GLOW_INTENSE = (c: string) =>
  `0 0 12px ${c}, 0 0 24px ${c}, 0 0 48px ${c}`;

// Soft atmospheric glow with transparency fade
const GLOW_ATMOSPHERE = (c: string, intensity: 'soft' | 'medium' | 'hard' = 'soft') => {
  const map = {
    soft: `0 0 4px ${c}60, 0 0 8px ${c}40, 0 0 16px ${c}20, 0 0 32px ${c}10`,
    medium: `0 0 6px ${c}80, 0 0 12px ${c}60, 0 0 24px ${c}30, 0 0 40px ${c}15`,
    hard: `0 0 8px ${c}cc, 0 0 16px ${c}99, 0 0 32px ${c}55, 0 0 50px ${c}20`
  };
  return map[intensity];
};

// Layered drop shadow (3D effect)
const SHADOW_LAYERED = (c1: string, c2: string, c3: string, c4: string) =>
  `1px 1px 0 ${c1}, 2px 2px 0 ${c2}, 3px 3px 0 ${c3}, 4px 4px 4px ${c4}`;

// Spread shadow (horizontal/vertical spreading)
const SHADOW_SPREAD = (c: string, offsetX: number, offsetY: number, blur: number, spread: number) =>
  `${offsetX}px ${offsetY}px ${blur}px ${spread}px ${c}`;

// Motion blur shadow (trailing effect)
const SHADOW_MOTION = (c: string, direction: 'left' | 'right' | 'up' | 'down') => {
  const map = {
    right: `2px 0 3px ${c}, 4px 0 6px ${c}, 6px 0 9px ${c}`,
    left: `-2px 0 3px ${c}, -4px 0 6px ${c}, -6px 0 9px ${c}`,
    down: `0 2px 3px ${c}, 0 4px 6px ${c}, 0 6px 9px ${c}`,
    up: `0 -2px 3px ${c}, 0 -4px 6px ${c}, 0 -6px 9px ${c}`
  };
  return map[direction];
};

// Flickering/pulsing effect (multiple shadow depths for animation)
const SHADOW_FLICKER = (c: string) =>
  `0 0 2px ${c}, 0 0 4px ${c}, 0 0 8px ${c}, 0 0 16px ${c}`;

// ═══════════════════════════════════════════════════════════════════════════
// 1. HORROR / THRILLER (공포/스릴러) — 5 recipes
// ═══════════════════════════════════════════════════════════════════════════

export const HORROR_RECIPES = [
  // 1. Blood Drip — Dark red with downward spreading
  {
    id: 'horror-01-blood-drip',
    name: 'Blood Drip (피 흐름)',
    genre: 'horror',
    description: 'Dark crimson with downward dripping shadows',
    color: '#cc0000',
    outlineColor: '#330000',
    outlineWidth: 2,
    fontWeight: 700,
    textShadowCSS: '0 2px 0 #990000, 0 4px 0 #660000, 0 6px 0 #330000, 0 8px 6px rgba(0,0,0,0.8), 0 -2px 4px rgba(204,0,0,0.3)',
    notes: 'Strong outline emphasizes depth. Downward offset creates dripping effect.'
  },

  // 2. Ghost Whisper — Pale gray, barely visible, ethereal
  {
    id: 'horror-02-ghost-whisper',
    name: 'Ghost Whisper (유령 속삭임)',
    genre: 'horror',
    description: 'Pale translucent with barely visible ethereal glow',
    color: '#b0b0b0',
    outlineColor: '#4a4a4a',
    outlineWidth: 0,
    fontWeight: 300,
    textShadowCSS: '0 0 8px rgba(176,176,176,0.4), 0 0 16px rgba(176,176,176,0.2), 0 0 32px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)',
    notes: 'Ultra-light font weight. Minimal outline. Soft diffuse glow emphasizes ghostly presence.'
  },

  // 3. Psycho Flash — White with harsh red flash shadows
  {
    id: 'horror-03-psycho-flash',
    name: 'Psycho Flash (정신분열 섬광)',
    genre: 'horror',
    description: 'Bright white with harsh red distortion shadows',
    color: '#ffffff',
    outlineColor: '#ff0000',
    outlineWidth: 3,
    fontWeight: 900,
    textShadowCSS: '2px 2px 0 rgba(255,0,0,0.8), -2px -2px 0 rgba(255,0,0,0.6), 3px 0 8px rgba(255,0,0,0.5), -3px 0 8px rgba(255,0,0,0.4), 0 0 12px rgba(255,0,0,0.3)',
    notes: 'Bold heavy weight. Thick red outline. Offset shadows create psychological discomfort.'
  },

  // 4. Dark Basement — Dim yellow-green, flickering feel
  {
    id: 'horror-04-dark-basement',
    name: 'Dark Basement (어두운 지하실)',
    genre: 'horror',
    description: 'Sickly yellow-green with flickering depth',
    color: '#9b8c00',
    outlineColor: '#2d2d00',
    outlineWidth: 1,
    fontWeight: 600,
    textShadowCSS: '0 0 4px #6b7300, 0 0 8px #4a5900, 0 0 16px rgba(107,115,0,0.4), 1px 1px 2px rgba(0,0,0,0.7), 2px 2px 4px rgba(0,0,0,0.5)',
    notes: 'Murky yellowish-green palette. Layered shadows create flickering/unstable lighting.'
  },

  // 5. Jump Scare — Bright white, massive glow burst
  {
    id: 'horror-05-jump-scare',
    name: 'Jump Scare (깜짝 놀람)',
    genre: 'horror',
    description: 'Blinding white with explosive burst glow',
    color: '#ffffff',
    outlineColor: '#ffff00',
    outlineWidth: 4,
    fontWeight: 900,
    textShadowCSS: '0 0 8px #ffff00, 0 0 16px #ffff00, 0 0 32px #ffff00cc, 0 0 64px #ffff0066, 0 0 96px #ffffff33, 0 2px 8px rgba(0,0,0,0.6)',
    notes: 'Maximum contrast. Thick bright outline. Extreme glow radius creates explosive impact.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 2. COMEDY / FUN (코미디) — 5 recipes
// ═══════════════════════════════════════════════════════════════════════════

export const COMEDY_RECIPES = [
  // 6. Slapstick Pop — Bright, comic book style, bold 3D
  {
    id: 'comedy-01-slapstick',
    name: 'Slapstick Pop (뽝!)',
    genre: 'comedy',
    description: 'Bright primary colors with bold comic book 3D shadow',
    color: '#ffff00',
    outlineColor: '#000000',
    outlineWidth: 5,
    fontWeight: 900,
    textShadowCSS: '3px 3px 0 #ff6600, 6px 6px 0 #ff3300, 9px 9px 0 #cc0000, 12px 12px 8px rgba(0,0,0,0.6), 0 0 20px rgba(255,102,0,0.4)',
    notes: 'Maximum outlineWidth. Heavy typography. Stacked color shadows mimic comic book printing.'
  },

  // 7. Giggle Bounce — Pastel pink/yellow, bubbly
  {
    id: 'comedy-02-giggle-bounce',
    name: 'Giggle Bounce (깔깔깔)',
    genre: 'comedy',
    description: 'Soft pastel colors with bubbly bouncy shadows',
    color: '#ffb6d9',
    outlineColor: '#ffeb99',
    outlineWidth: 3,
    fontWeight: 600,
    textShadowCSS: '0 -2px 0 rgba(255,235,153,0.8), 0 -4px 0 rgba(255,200,180,0.6), 0 2px 0 rgba(255,182,217,0.4), 0 0 8px rgba(255,182,217,0.3), 0 0 16px rgba(255,235,153,0.2)',
    notes: 'Pastel palette. Upward offset shadows create bouncy feeling. Lighter font weight.'
  },

  // 8. Sarcasm Italic — Muted with subtle raised emboss
  {
    id: 'comedy-03-sarcasm',
    name: 'Sarcasm Italic (실소)',
    genre: 'comedy',
    description: 'Muted tone with subtle embossed raised effect',
    color: '#a0a0a0',
    outlineColor: '#505050',
    outlineWidth: 1,
    fontWeight: 400,
    textShadowCSS: '0 -1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.4), 0 0 4px rgba(160,160,160,0.2)',
    notes: 'Muted grayscale. Emboss effect with white highlight above text. Minimal visual impact.'
  },

  // 9. Over-the-top — Massive gold 3D with sparkle
  {
    id: 'comedy-04-over-the-top',
    name: 'Over-the-Top (악의적 과장)',
    genre: 'comedy',
    description: 'Rich gold with massive 3D layered shadow and sparkle',
    color: '#ffd700',
    outlineColor: '#cc8800',
    outlineWidth: 4,
    fontWeight: 900,
    textShadowCSS: '2px 2px 0 #daa520, 4px 4px 0 #b8860b, 6px 6px 0 #996600, 8px 8px 0 #775500, 10px 10px 8px rgba(0,0,0,0.7), 0 0 8px rgba(255,215,0,0.5), 0 0 16px rgba(218,165,32,0.3)',
    notes: 'Extreme depth with 5 shadow layers. Gold metallicic colors. Extra glow for sparkle.'
  },

  // 10. Deadpan — Ultra minimal, flat, no effects
  {
    id: 'comedy-05-deadpan',
    name: 'Deadpan (무표정)',
    genre: 'comedy',
    description: 'Flat, minimal, intentionally boring and anticlimactic',
    color: '#808080',
    outlineColor: '#404040',
    outlineWidth: 0,
    fontWeight: 500,
    textShadowCSS: '0 1px 1px rgba(0,0,0,0.3)',
    notes: 'Minimal styling. Grayscale. Barely visible shadow. Anticlimactic simplicity conveys humor.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 3. ROMANCE / DRAMA (로맨스) — 5 recipes
// ═══════════════════════════════════════════════════════════════════════════

export const ROMANCE_RECIPES = [
  // 11. First Love — Soft pink glow, dreamy
  {
    id: 'romance-01-first-love',
    name: 'First Love (첫사랑)',
    genre: 'romance',
    description: 'Soft pink with dreamy diffuse glow',
    color: '#ffb3d9',
    outlineColor: '#995577',
    outlineWidth: 1,
    fontWeight: 500,
    textShadowCSS: '0 0 6px rgba(255,179,217,0.6), 0 0 12px rgba(255,179,217,0.4), 0 0 24px rgba(255,179,217,0.2), 0 0 40px rgba(255,179,217,0.1), 0 1px 2px rgba(0,0,0,0.1)',
    notes: 'Romantic soft pink. Diffuse glow increases outward. Light weight. Tender feeling.'
  },

  // 12. Heartbreak — Deep purple, melancholic shadow
  {
    id: 'romance-02-heartbreak',
    name: 'Heartbreak (심장 아픔)',
    genre: 'romance',
    description: 'Deep purple with melancholic shadowed depth',
    color: '#b294c9',
    outlineColor: '#4a2c5e',
    outlineWidth: 2,
    fontWeight: 600,
    textShadowCSS: '0 0 8px rgba(73,48,94,0.7), 0 0 16px rgba(73,48,94,0.5), 0 2px 8px rgba(0,0,0,0.5), 0 0 24px rgba(73,48,94,0.2)',
    notes: 'Deep rich purple. Dark outline. Heavy shadows convey sadness. Inward glow.'
  },

  // 13. Wedding Bells — Gold + white shimmer
  {
    id: 'romance-03-wedding-bells',
    name: 'Wedding Bells (결혼식)',
    genre: 'romance',
    description: 'Gold and white with elegant shimmer',
    color: '#fff8dc',
    outlineColor: '#997700',
    outlineWidth: 2,
    fontWeight: 700,
    textShadowCSS: '0 0 4px rgba(255,255,255,0.8), 0 0 8px rgba(218,165,32,0.6), 0 0 16px rgba(218,165,32,0.4), 0 0 24px rgba(218,165,32,0.2), 0 2px 4px rgba(0,0,0,0.2)',
    notes: 'Cream/gold palette. Layered white and gold glows create elegant shimmer.'
  },

  // 14. Secret Crush — Soft peach with warm glow
  {
    id: 'romance-04-secret-crush',
    name: 'Secret Crush (짝사랑)',
    genre: 'romance',
    description: 'Soft peach with warm intimate glow',
    color: '#ffccb3',
    outlineColor: '#cc6633',
    outlineWidth: 1,
    fontWeight: 500,
    textShadowCSS: '0 0 6px rgba(255,153,102,0.5), 0 0 12px rgba(255,153,102,0.35), 0 0 20px rgba(255,153,102,0.2), 0 0 32px rgba(255,153,102,0.1), 0 1px 2px rgba(0,0,0,0.1)',
    notes: 'Warm peach tone. Soft glow. Gentle and intimate. Creates feeling of hidden emotion.'
  },

  // 15. Long-Distance — Blue-gray, misty, distant feel
  {
    id: 'romance-05-long-distance',
    name: 'Long-Distance (먼 거리)',
    genre: 'romance',
    description: 'Cool blue-gray with misty distant atmosphere',
    color: '#a9c5d1',
    outlineColor: '#4a6d7f',
    outlineWidth: 1,
    fontWeight: 400,
    textShadowCSS: '0 0 6px rgba(138,166,178,0.4), 0 0 12px rgba(138,166,178,0.3), 0 0 24px rgba(138,166,178,0.2), 0 0 40px rgba(138,166,178,0.1), 0 0 60px rgba(78,109,127,0.05)',
    notes: 'Cool desaturated blue-gray. Very soft diffuse glow. Creates misty distant feeling.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 4. ACTION / SPORTS (액션/스포츠) — 5 recipes
// ═══════════════════════════════════════════════════════════════════════════

export const ACTION_RECIPES = [
  // 16. Victory — Bold gold metallic, triumphant
  {
    id: 'action-01-victory',
    name: 'Victory (승리)',
    genre: 'action',
    description: 'Bold metallic gold with triumphant layered shadow',
    color: '#ffd700',
    outlineColor: '#b8860b',
    outlineWidth: 3,
    fontWeight: 900,
    textShadowCSS: '0 2px 0 #cc9900, 0 4px 0 #996600, 0 6px 0 #664400, 0 8px 8px rgba(0,0,0,0.6), 0 0 12px rgba(255,215,0,0.5)',
    notes: 'Strong metallic palette. Thick outline. Layered drop shadows. Bold triumphant mood.'
  },

  // 17. Countdown — Red with urgent pulsing glow
  {
    id: 'action-02-countdown',
    name: 'Countdown (카운트다운)',
    genre: 'action',
    description: 'Bold red with urgent pulsing glow',
    color: '#ff3333',
    outlineColor: '#990000',
    outlineWidth: 3,
    fontWeight: 900,
    textShadowCSS: '0 0 6px #ff3333, 0 0 12px #ff3333, 0 0 24px #ff3333cc, 0 0 40px #ff333366, 0 2px 6px rgba(0,0,0,0.5), 0 0 50px #ff000033',
    notes: 'Bright red. Thick outline. Multiple glow layers. Pulsing effect (use CSS animation).'
  },

  // 18. Speed Run — Motion blur shadow trailing right
  {
    id: 'action-03-speed-run',
    name: 'Speed Run (스피드)',
    genre: 'action',
    description: 'Dynamic motion blur trailing right',
    color: '#00ffff',
    outlineColor: '#0099ff',
    outlineWidth: 2,
    fontWeight: 700,
    textShadowCSS: '2px 0 3px rgba(0,255,255,0.7), 4px 0 6px rgba(0,255,255,0.5), 6px 0 9px rgba(0,255,255,0.3), 8px 0 12px rgba(0,153,255,0.2), 0 2px 4px rgba(0,0,0,0.3)',
    notes: 'Cyan color. Right motion blur. Progressive fade. Creates sense of speed/movement.'
  },

  // 19. Impact Hit — White with explosive burst shadow
  {
    id: 'action-04-impact-hit',
    name: 'Impact Hit (임팩트)',
    genre: 'action',
    description: 'White with explosive burst radial shadow',
    color: '#ffffff',
    outlineColor: '#ffff00',
    outlineWidth: 4,
    fontWeight: 900,
    textShadowCSS: '0 0 4px #ffff00, 0 0 8px #ffff00, 0 0 16px #ffff00cc, 0 0 32px #ffff0099, 0 0 48px #ff666644, 2px 2px 8px rgba(0,0,0,0.6), -2px -2px 8px rgba(0,0,0,0.4)',
    notes: 'High contrast white/yellow. Explosive glow. Offset shadows create impact sensation.'
  },

  // 20. Game Over — Dark red, cracking/breaking feel
  {
    id: 'action-05-game-over',
    name: 'Game Over (게임 오버)',
    genre: 'action',
    description: 'Dark red with fractured cracking shadow effect',
    color: '#cc0000',
    outlineColor: '#330000',
    outlineWidth: 3,
    fontWeight: 900,
    textShadowCSS: '1px 1px 0 #990000, 2px 1px 0 #660000, 1px 2px 0 #660000, 3px 3px 0 #330000, 4px 4px 0 #220000, 0 0 8px rgba(204,0,0,0.4), 0 4px 8px rgba(0,0,0,0.7)',
    notes: 'Dark blood red. Irregular offset shadows mimic cracking/shattering effect.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 5. NATURE / ASMR (자연/힐링) — 5 recipes
// ═══════════════════════════════════════════════════════════════════════════

export const NATURE_RECIPES = [
  // 21. Forest Morning — Soft green with morning dew glow
  {
    id: 'nature-01-forest-morning',
    name: 'Forest Morning (숲 아침)',
    genre: 'nature',
    description: 'Soft green with fresh morning dew sparkle',
    color: '#7cb342',
    outlineColor: '#2d5016',
    outlineWidth: 1,
    fontWeight: 400,
    textShadowCSS: '0 0 4px rgba(124,179,66,0.6), 0 0 8px rgba(124,179,66,0.4), 0 0 16px rgba(124,179,66,0.25), 0 0 32px rgba(76,110,50,0.1), 0 0 8px rgba(200,255,200,0.3), 0 1px 2px rgba(0,0,0,0.1)',
    notes: 'Natural green palette. Soft dew-like glow. Light weight. Peaceful morning feeling.'
  },

  // 22. Ocean Wave — Deep blue with gentle shimmer
  {
    id: 'nature-02-ocean-wave',
    name: 'Ocean Wave (바다 파도)',
    genre: 'nature',
    description: 'Deep blue with gentle undulating shimmer',
    color: '#1e88e5',
    outlineColor: '#0d47a1',
    outlineWidth: 1,
    fontWeight: 500,
    textShadowCSS: '0 0 6px rgba(30,136,229,0.5), 0 0 12px rgba(30,136,229,0.35), 0 0 20px rgba(30,136,229,0.2), 0 0 40px rgba(13,71,161,0.1), 0 2px 4px rgba(0,0,0,0.15)',
    notes: 'Ocean blue palette. Layered glow creates shimmering water effect. Gentle motion.'
  },

  // 23. Rainy Day — Gray with soft droplet shadows
  {
    id: 'nature-03-rainy-day',
    name: 'Rainy Day (빗오는 날)',
    genre: 'nature',
    description: 'Gray with soft droplet-patterned shadows',
    color: '#9e9e9e',
    outlineColor: '#424242',
    outlineWidth: 0,
    fontWeight: 400,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.3), 0 0 4px rgba(158,158,158,0.2), 1px 0 1px rgba(200,200,200,0.3), -1px 1px 1px rgba(100,100,100,0.2), 0 0 12px rgba(0,0,0,0.1)',
    notes: 'Gray rainy palette. Minimal outline. Subtle scattered droplet effect shadows.'
  },

  // 24. Campfire — Warm orange with flickering glow
  {
    id: 'nature-04-campfire',
    name: 'Campfire (모닥불)',
    genre: 'nature',
    description: 'Warm orange with flickering fire glow',
    color: '#ff8a50',
    outlineColor: '#e65100',
    outlineWidth: 1,
    fontWeight: 600,
    textShadowCSS: '0 0 6px rgba(255,138,80,0.7), 0 0 12px rgba(255,138,80,0.5), 0 0 20px rgba(255,138,80,0.3), 0 0 32px rgba(230,81,0,0.2), 0 0 48px rgba(255,152,0,0.1), 0 2px 4px rgba(0,0,0,0.2)',
    notes: 'Warm campfire orange. Multiple glow layers. Perfect for flickering CSS animation.'
  },

  // 25. Stargazing — Deep purple/blue with sparkle points
  {
    id: 'nature-05-stargazing',
    name: 'Stargazing (별 관찰)',
    genre: 'nature',
    description: 'Deep purple-blue with starry sparkle points',
    color: '#7c3aed',
    outlineColor: '#4c1d95',
    outlineWidth: 1,
    fontWeight: 500,
    textShadowCSS: '0 0 8px rgba(124,58,237,0.6), 0 0 16px rgba(124,58,237,0.4), 0 0 32px rgba(124,58,237,0.2), 0 0 48px rgba(76,29,149,0.1), 1px 1px 1px rgba(255,255,255,0.6), -1px 1px 1px rgba(255,255,255,0.4), 1px -1px 1px rgba(255,255,255,0.3)',
    notes: 'Deep space purple. Main glow + white sparkle points. Creates starry night atmosphere.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE RECIPE INDEX
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_GENRE_RECIPES = [
  ...HORROR_RECIPES,
  ...COMEDY_RECIPES,
  ...ROMANCE_RECIPES,
  ...ACTION_RECIPES,
  ...NATURE_RECIPES,
];

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface GenreSubtitleRecipe {
  id: string;
  name: string;
  genre: 'horror' | 'comedy' | 'romance' | 'action' | 'nature';
  description: string;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  fontWeight: number;
  textShadowCSS: string;
  notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION: Apply recipe to subtitle element
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Applies a genre recipe to a subtitle element (for runtime usage)
 * @param element - Target subtitle element
 * @param recipe - GenreSubtitleRecipe object
 */
export function applyGenreRecipe(element: HTMLElement, recipe: GenreSubtitleRecipe): void {
  const style = element.style;

  // Text color
  style.color = recipe.color;

  // Font weight
  style.fontWeight = recipe.fontWeight.toString();

  // WebKit text stroke (outline)
  if (recipe.outlineWidth > 0) {
    style.webkitTextStroke = `${recipe.outlineWidth}px ${recipe.outlineColor}`;
    (style as any)['-webkit-text-stroke'] = `${recipe.outlineWidth}px ${recipe.outlineColor}`;
  } else {
    style.webkitTextStroke = 'none';
  }

  // Text shadow
  style.textShadow = recipe.textShadowCSS;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTATION TABLE (for reference)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * QUICK REFERENCE: All 25 Recipes
 *
 * HORROR / THRILLER:
 *   01. Blood Drip         - cc0000 + downward bleed
 *   02. Ghost Whisper      - b0b0b0 + ethereal barely-visible
 *   03. Psycho Flash       - ffffff + harsh ff0000 distortion
 *   04. Dark Basement      - 9b8c00 + flickering murk
 *   05. Jump Scare         - ffffff + ffff00 explosive burst
 *
 * COMEDY / FUN:
 *   06. Slapstick Pop      - ffff00 + comic book 3D stack
 *   07. Giggle Bounce      - ffb6d9 + bubbly upward
 *   08. Sarcasm Italic     - a0a0a0 + subtle emboss
 *   09. Over-the-Top       - ffd700 + 5-layer gold stack
 *   10. Deadpan            - 808080 + ultra minimal flat
 *
 * ROMANCE / DRAMA:
 *   11. First Love         - ffb3d9 + dreamy diffuse glow
 *   12. Heartbreak         - b294c9 + melancholic inward
 *   13. Wedding Bells      - fff8dc + gold shimmer elegance
 *   14. Secret Crush       - ffccb3 + warm peach intimate
 *   15. Long-Distance      - a9c5d1 + misty blue-gray distant
 *
 * ACTION / SPORTS:
 *   16. Victory            - ffd700 + bold metallic 4-layer
 *   17. Countdown          - ff3333 + urgent pulsing red
 *   18. Speed Run          - 00ffff + right motion blur trail
 *   19. Impact Hit         - ffffff + explosive yellow burst
 *   20. Game Over          - cc0000 + fractured cracking
 *
 * NATURE / ASMR:
 *   21. Forest Morning     - 7cb342 + fresh dew sparkle
 *   22. Ocean Wave         - 1e88e5 + gentle blue shimmer
 *   23. Rainy Day          - 9e9e9e + soft droplet pattern
 *   24. Campfire           - ff8a50 + warm flickering glow
 *   25. Stargazing         - 7c3aed + sparkle star points
 */
