# Integration Guide: Advanced Text-Shadow Recipes

> Step-by-step instructions for integrating 20 advanced CSS text-shadow recipes into the subtitle template system

---

## Quick Start

### 1. Copy Recipe Definitions

Add the 20 recipes to `src/constants/subtitleTemplates.ts`:

```typescript
// Import the JSON (or add recipes directly)
import advancedRecipes from '../docs/advanced_text_shadow_recipes.json';

// Create new category array
const ADVANCED_CREATIVE: SubtitleTemplate[] = [
  base({
    id: 'adv-01',
    name: 'Retro Synthwave',
    category: 'advanced_creative',
    fontFamily: 'CookieRun',
    color: '#ff00ff',
    outlineColor: '#000000',
    outlineWidth: 1,
    letterSpacing: 1,
    textShadowCSS: "0 0 10px #ff00ff, 0 0 20px #ff00ffaa, 0 0 30px #ff00ff77, 2px 2px 0 #00ffff66, 4px 4px 0 #00ffff33, -2px -2px 0 #ff00ff44, 0 0 40px #ff00ff22"
  }),
  base({
    id: 'adv-02',
    name: 'Vaporwave',
    category: 'advanced_creative',
    fontFamily: 'Hahmlet',
    color: '#ec4899',
    outlineColor: '#000000',
    outlineWidth: 0,
    textShadowCSS: "0 0 6px rgba(236,72,153,0.4), 0 0 12px rgba(236,72,153,0.25), 0 0 18px rgba(59,130,246,0.3), 0 0 24px rgba(59,130,246,0.15), 0 0 36px rgba(168,85,247,0.15), 1px 1px 2px rgba(0,0,0,0.1)"
  }),
  // ... continue for all 20 recipes
];

// Add to main export
export const SUBTITLE_TEMPLATES: SubtitleTemplate[] = [
  ...BASIC,
  ...COLOR,
  ...STYLE,
  ...VARIETY,
  ...EMOTION,
  ...CINEMATIC,
  ...NOBG,
  ...ADVANCED_CREATIVE,  // Add here
];
```

### 2. Update Category Tabs

Add the new category to `SUBTITLE_CAT_TABS`:

```typescript
export const SUBTITLE_CAT_TABS: { id: SubtitleCategoryId; label: string }[] = [
  { id: 'favorite', label: '즐겨찾기' },
  { id: 'all', label: '전체' },
  { id: 'basic', label: '기본' },
  { id: 'color', label: '컬러' },
  { id: 'style', label: '스타일' },
  { id: 'variety', label: '예능/바라이어티' },
  { id: 'emotion', label: '감성/시네마' },
  { id: 'cinematic', label: '시네마틱' },
  { id: 'nobg', label: '배경없음' },
  { id: 'advanced_creative', label: '고급/창의' },  // Add here
];
```

### 3. Update Type Definition

Update `src/types.ts`:

```typescript
// Update the SubtitleCategoryId type
export type SubtitleCategoryId =
  | 'favorite'
  | 'all'
  | 'basic'
  | 'color'
  | 'style'
  | 'variety'
  | 'emotion'
  | 'cinematic'
  | 'nobg'
  | 'advanced_creative';  // Add here
```

---

## Complete Implementation (Step-by-Step)

### Step 1: Create Recipe Array

**File:** `src/constants/subtitleTemplates.ts`

```typescript
// Add after the NOBG array definition

// ═══════════════════════════════════════════════════
// 8. 고급/창의 (advanced_creative) — 20개
// ═══════════════════════════════════════════════════
const ADVANCED_CREATIVE: SubtitleTemplate[] = [
  // 1. Retro Synthwave
  base({
    id: 'adv-01',
    name: '레트로 신스웨이브',
    category: 'advanced_creative',
    fontFamily: 'CookieRun',
    fontSize: 54,
    fontWeight: 700,
    color: '#ff00ff',
    outlineColor: '#000000',
    outlineWidth: 1,
    letterSpacing: 1,
    textShadowCSS: "0 0 10px #ff00ff, 0 0 20px #ff00ffaa, 0 0 30px #ff00ff77, 2px 2px 0 #00ffff66, 4px 4px 0 #00ffff33, -2px -2px 0 #ff00ff44, 0 0 40px #ff00ff22"
  }),

  // 2. Vaporwave
  base({
    id: 'adv-02',
    name: '베이퍼웨이브',
    category: 'advanced_creative',
    fontFamily: 'Hahmlet',
    fontSize: 54,
    fontWeight: 700,
    color: '#ec4899',
    outlineColor: '#000000',
    outlineWidth: 0,
    textShadowCSS: "0 0 6px rgba(236,72,153,0.4), 0 0 12px rgba(236,72,153,0.25), 0 0 18px rgba(59,130,246,0.3), 0 0 24px rgba(59,130,246,0.15), 0 0 36px rgba(168,85,247,0.15), 1px 1px 2px rgba(0,0,0,0.1)"
  }),

  // 3. Graffiti Spray
  base({
    id: 'adv-03',
    name: '그래피티 스프레이',
    category: 'advanced_creative',
    fontFamily: 'Black Han Sans',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 3,
    textShadowCSS: "0 2px 0 rgba(0,0,0,0.3), 0 4px 0 rgba(0,0,0,0.25), 0 6px 0 rgba(0,0,0,0.2), 0 8px 0 rgba(0,0,0,0.15), 0 10px 4px rgba(0,0,0,0.4), 0px 3px 5px rgba(255,255,255,0.1) inset, -1px -1px 2px rgba(255,255,255,0.2), 1px 12px 8px rgba(0,0,0,0.2)"
  }),

  // 4. Woodcut Print
  base({
    id: 'adv-04',
    name: '목판화 인쇄',
    category: 'advanced_creative',
    fontFamily: 'Noto Serif KR',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 2,
    textShadowCSS: "-1px -1px 0 #ffffff88, 1px 1px 0 #00000099, -2px 0 1px #ffffff44, 2px 0 1px #00000055, 0 -1px 0 #ffffff66, 0 1px 0 #00000088, -1px 1px 2px #00000077, 2px 2px 3px #000000cc"
  }),

  // 5. Watercolor Bleed
  base({
    id: 'adv-05',
    name: '수채 번짐',
    category: 'advanced_creative',
    fontFamily: 'Nanum Brush Script',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 0,
    textShadowCSS: "0 0 4px rgba(100,150,200,0.3), 0 0 8px rgba(100,150,200,0.2), 0 0 12px rgba(150,100,200,0.25), 0 0 20px rgba(150,100,200,0.1), 1px 1px 3px rgba(0,0,0,0.1), -1px 1px 2px rgba(200,150,100,0.15), 2px -1px 3px rgba(100,200,150,0.12)"
  }),

  // 6. Stained Glass
  base({
    id: 'adv-06',
    name: '스테인드 글래스',
    category: 'advanced_creative',
    fontFamily: 'CookieRun',
    fontSize: 54,
    fontWeight: 700,
    color: '#ff007f',
    outlineColor: '#000000',
    outlineWidth: 1,
    textShadowCSS: "0 0 8px rgba(255,0,127,0.6), 0 0 16px rgba(255,0,127,0.4), 0 0 12px rgba(0,255,200,0.5), 0 0 24px rgba(0,255,200,0.2), 0 0 20px rgba(100,50,255,0.3), inset -1px -1px 0 rgba(255,255,255,0.3), inset 1px 1px 0 rgba(0,0,0,0.5), 0 0 32px rgba(255,100,200,0.15)"
  }),

  // 7. Paper Cutout
  base({
    id: 'adv-07',
    name: '종이 오려내기',
    category: 'advanced_creative',
    fontFamily: 'Suit',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 1,
    textShadowCSS: "1px 1px 0 #333333, 2px 2px 0 #333333, 3px 3px 0 #333333, 4px 4px 0 #333333, 5px 5px 0 #333333, 6px 6px 8px rgba(0,0,0,0.6), -1px -1px 1px rgba(255,255,255,0.3)"
  }),

  // 8. Frosted Glass
  base({
    id: 'adv-08',
    name: '서리 낀 유리',
    category: 'advanced_creative',
    fontFamily: 'Gothic A1',
    fontSize: 54,
    fontWeight: 700,
    color: '#e0f2fe',
    outlineColor: '#000000',
    outlineWidth: 0,
    textShadowCSS: "0 0 2px rgba(255,255,255,0.8), 0 0 4px rgba(255,255,255,0.6), 0 0 8px rgba(200,200,255,0.4), 0 0 16px rgba(150,150,200,0.2), inset 0 1px 2px rgba(255,255,255,0.5), inset 0 -1px 2px rgba(0,0,0,0.2), 0 0 20px rgba(100,100,150,0.1)"
  }),

  // 9. Laser Engrave
  base({
    id: 'adv-09',
    name: '레이저 조각',
    category: 'advanced_creative',
    fontFamily: 'IBM Plex Sans KR',
    fontSize: 54,
    fontWeight: 700,
    color: '#00ff00',
    outlineColor: '#000000',
    outlineWidth: 1,
    letterSpacing: 1,
    textShadowCSS: "0 0 3px #00ff00cc, 0 0 6px #00ff0099, 0 0 10px #00ff0066, 0 0 15px #00ff0033, 1px 0 0 #00ff00aa, -1px 0 0 #00ff00aa, 0 1px 0 rgba(0,255,0,0.5), 0 -1px 0 rgba(0,255,0,0.5), 0 0 20px rgba(0,255,0,0.2)"
  }),

  // 10. Horror Blood
  base({
    id: 'adv-10',
    name: '공포 혈액',
    category: 'advanced_creative',
    fontFamily: 'Black Han Sans',
    fontSize: 54,
    fontWeight: 700,
    color: '#ef4444',
    outlineColor: '#000000',
    outlineWidth: 2,
    textShadowCSS: "0 2px 0 rgba(139,0,0,0.8), 0 4px 0 rgba(100,0,0,0.7), 0 6px 2px rgba(80,0,0,0.6), 0 0 6px rgba(220,20,60,0.4), 0 0 12px rgba(139,0,0,0.25), -1px 3px 3px rgba(0,0,0,0.7), 1px 8px 4px rgba(0,0,0,0.5)"
  }),

  // 11. Fairy Tale
  base({
    id: 'adv-11',
    name: '동화 마법',
    category: 'advanced_creative',
    fontFamily: 'CookieRun',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffd700',
    outlineColor: '#000000',
    outlineWidth: 1,
    textShadowCSS: "0 0 6px #ffd700cc, 0 0 12px #ffd700aa, 0 0 20px #ffed4e77, -2px -2px 3px rgba(255,200,100,0.5), 2px -2px 3px rgba(255,220,120,0.5), -2px 2px 3px rgba(255,180,60,0.4), 2px 2px 3px rgba(255,200,100,0.4), 0 0 30px rgba(255,215,0,0.2)"
  }),

  // 12. Military Stencil
  base({
    id: 'adv-12',
    name: '군용 스텐실',
    category: 'advanced_creative',
    fontFamily: 'IBM Plex Sans KR',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#3c7c3c',
    outlineWidth: 1,
    textShadowCSS: "1px 1px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.7), 3px 3px 0 rgba(0,0,0,0.5), 0 0 2px rgba(0,0,0,0.8), -1px 0 0 rgba(60,120,60,0.3), 0 -1px 0 rgba(60,120,60,0.3)"
  }),

  // 13. Luxury Brand
  base({
    id: 'adv-13',
    name: '럭셔리 브랜드',
    category: 'advanced_creative',
    fontFamily: 'Hahmlet',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 0,
    letterSpacing: 2,
    textShadowCSS: "0 1px 1px rgba(0,0,0,0.15), 0 2px 3px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.1), 0 0.5px 0 rgba(255,255,255,0.2)"
  }),

  // 14. K-Pop Stage
  base({
    id: 'adv-14',
    name: 'K-팝 무대',
    category: 'advanced_creative',
    fontFamily: 'Black Han Sans',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 1,
    textShadowCSS: "0 0 8px #ff1493ff, 0 0 16px #ff1493dd, 0 0 8px #00d9ffff, 0 0 16px #00d9ffdd, 0 0 12px #ffff00cc, 0 0 20px #ffff00aa, 0 0 30px rgba(255,20,147,0.3), 0 0 30px rgba(0,217,255,0.2)"
  }),

  // 15. Anime Title
  base({
    id: 'adv-15',
    name: '애니메 제목',
    category: 'advanced_creative',
    fontFamily: 'Black Han Sans',
    fontSize: 56,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#0066ff',
    outlineWidth: 2,
    textShadowCSS: "0 3px 0 #0066ff, 0 6px 0 #0033ff, 0 9px 0 #001188, 0 12px 4px rgba(0,50,200,0.5), -2px 3px 0 rgba(255,255,255,0.4), -4px 6px 0 rgba(255,255,255,0.2), 0 0 8px rgba(0,100,255,0.3)"
  }),

  // 16. Webtoon Speech
  base({
    id: 'adv-16',
    name: '웹툰 대사',
    category: 'advanced_creative',
    fontFamily: 'Do Hyeon',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 2,
    textShadowCSS: "1px 1px 0 #000000ee, 2px 2px 0 #000000cc, 3px 3px 1px #000000aa, 0 0 4px rgba(255,255,255,0.5), -1px -1px 0 rgba(255,255,200,0.2), 0 0 8px rgba(0,0,0,0.2)"
  }),

  // 17. Dream Sequence
  base({
    id: 'adv-17',
    name: '꿈 시퀀스',
    category: 'advanced_creative',
    fontFamily: 'Nanum Pen Script',
    fontSize: 54,
    fontWeight: 700,
    color: '#e0e7ff',
    outlineColor: '#000000',
    outlineWidth: 0,
    textShadowCSS: "0 0 6px rgba(200,180,255,0.5), 0 0 12px rgba(180,160,255,0.4), 0 0 20px rgba(160,140,255,0.3), 0 0 32px rgba(140,120,255,0.2), 0 0 48px rgba(200,180,220,0.1), 0 2px 8px rgba(0,0,0,0.05), inset 0 1px 2px rgba(255,255,255,0.3)"
  }),

  // 18. Underground Punk
  base({
    id: 'adv-18',
    name: '언더그라운드 펑크',
    category: 'advanced_creative',
    fontFamily: 'Escoredream',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 2,
    textShadowCSS: "-1px -1px 0 #000000, 1px 1px 0 #000000, -2px 0 0 #000000, 2px 0 0 #000000, 0 -2px 0 #000000, 0 2px 0 #000000, -1px 1px 3px #000000, 1px -1px 3px #000000, 0 0 6px rgba(100,0,0,0.4)"
  }),

  // 19. Zen Minimal
  base({
    id: 'adv-19',
    name: '선 미니멀',
    category: 'advanced_creative',
    fontFamily: 'Song Myung',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 0,
    letterSpacing: 2,
    textShadowCSS: "0 0.5px 1px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04), 0 0 0.5px rgba(0,0,0,0.03)"
  }),

  // 20. Festival Lights
  base({
    id: 'adv-20',
    name: '축제 불빛',
    category: 'advanced_creative',
    fontFamily: 'CookieRun',
    fontSize: 54,
    fontWeight: 700,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 1,
    textShadowCSS: "0 0 6px rgba(255,100,50,0.7), 0 0 12px rgba(255,100,50,0.5), 0 0 8px rgba(255,200,50,0.6), 0 0 16px rgba(255,200,50,0.3), 0 0 10px rgba(100,200,255,0.5), 0 0 20px rgba(100,200,255,0.2), 0 0 14px rgba(255,100,200,0.4), 0 0 28px rgba(255,100,200,0.15), 0 0 40px rgba(255,150,100,0.15)"
  }),
];
```

### Step 2: Add to Main Export

```typescript
// At the end of constants/subtitleTemplates.ts

export const SUBTITLE_TEMPLATES: SubtitleTemplate[] = [
  ...BASIC,
  ...COLOR,
  ...STYLE,
  ...VARIETY,
  ...EMOTION,
  ...CINEMATIC,
  ...NOBG,
  ...ADVANCED_CREATIVE,  // Add this line
];
```

### Step 3: Update Category Type

**File:** `src/types.ts`

```typescript
export type SubtitleCategoryId =
  | 'favorite'
  | 'all'
  | 'basic'
  | 'color'
  | 'style'
  | 'variety'
  | 'emotion'
  | 'cinematic'
  | 'nobg'
  | 'advanced_creative';
```

### Step 4: Update Category Tabs

```typescript
// In constants/subtitleTemplates.ts

export const SUBTITLE_CAT_TABS: { id: SubtitleCategoryId; label: string }[] = [
  { id: 'favorite', label: '즐겨찾기' },
  { id: 'all', label: '전체' },
  { id: 'basic', label: '기본' },
  { id: 'color', label: '컬러' },
  { id: 'style', label: '스타일' },
  { id: 'variety', label: '예능/바라이어티' },
  { id: 'emotion', label: '감성/시네마' },
  { id: 'cinematic', label: '시네마틱' },
  { id: 'nobg', label: '배경없음' },
  { id: 'advanced_creative', label: '고급/창의' },  // Add this
];
```

---

## Verification Checklist

After integration:

```typescript
// ✓ Check 1: Templates exist
const advTemplates = SUBTITLE_TEMPLATES.filter(t => t.category === 'advanced_creative');
console.assert(advTemplates.length === 20, '20 recipes should exist');

// ✓ Check 2: Category tabs updated
console.assert(
  SUBTITLE_CAT_TABS.some(t => t.id === 'advanced_creative'),
  'Tab should exist'
);

// ✓ Check 3: Type includes category
type TestType = SubtitleCategoryId;
const test: TestType = 'advanced_creative';  // Should not error

// ✓ Check 4: textShadowCSS is defined
advTemplates.forEach(t => {
  console.assert(
    t.textShadowCSS?.length > 0,
    `${t.id} should have textShadowCSS`
  );
});

// ✓ Check 5: FontFamily exists
advTemplates.forEach(t => {
  console.assert(
    FONT_LIBRARY.some(f => f.family === t.fontFamily),
    `${t.id} font should exist in FONT_LIBRARY`
  );
});
```

---

## Testing Scenarios

### Scenario 1: Render Test
```html
<!-- Verify each recipe renders without jank -->
<span
  style={{
    textShadow: template.textShadowCSS,
    color: template.color,
    fontFamily: template.fontFamily,
    fontSize: `${template.fontSize}px`,
    fontWeight: template.fontWeight,
    WebkitTextStroke: `${template.outlineWidth}px ${template.outlineColor}`
  }}
>
  {template.name} - Sample Text
</span>
```

### Scenario 2: Animation Test
```typescript
// Verify performance during animation
import { useFrame } from '@react-three/fiber';

useFrame(() => {
  // Apply transition to textShadow
  element.style.textShadow = getAnimatedShadow(time);
});

// Monitor FPS
```

### Scenario 3: Video Export Test
```typescript
// Verify effects are preserved in video export
const videoFrame = canvas.toDataURL();
// Verify text-shadow is visible in exported frame
```

---

## Troubleshooting Integration Issues

### Issue: "advanced_creative is not assignable to type SubtitleCategoryId"

**Solution:** Ensure `types.ts` is updated with the new category

### Issue: Recipes don't appear in UI

**Solution:**
1. Clear browser cache
2. Rebuild TypeScript: `tsc --noEmit`
3. Restart dev server

### Issue: Text color invisible with shadow

**Solution:** Adjust `outlineColor` or add `backgroundColor`

---

## Performance Optimization Tips

1. **Lazy Load Fonts:**
```typescript
const recommendedFont = template.recommendedFont[0];
loadFont(recommendedFont).then(() => {
  // Render template
});
```

2. **Memoize Template Rendering:**
```typescript
const MemoizedTemplate = React.memo(({ template }) => {
  return <TemplatePreview {...template} />;
});
```

3. **Virtual List Large Sets:**
```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={SUBTITLE_TEMPLATES.length}
  itemSize={120}
>
  {({ index, style }) => (
    <div style={style}>
      <TemplateCard template={SUBTITLE_TEMPLATES[index]} />
    </div>
  )}
</FixedSizeList>
```

---

## Next Steps

1. **Merge into production build**
2. **Test on real video exports**
3. **Gather user feedback**
4. **Create visual demo video**
5. **Update user documentation**

---

**Date:** 2026-03-01
**Integration Status:** Ready for deployment
**Total Lines Added:** ~1,200
**New Files:** 3 (markdown + JSON + guide)
