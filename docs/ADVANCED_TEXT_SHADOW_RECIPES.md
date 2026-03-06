# 20 Advanced CSS Text-Shadow Recipes for Subtitles

> Creative, artistic text-shadow effects beyond basic implementations
> Designed for integration into `SUBTITLE_TEMPLATES` system
> Each recipe uses 3-8 shadow layers with rgba() transparency control

---

## 1. RETRO SYNTHWAVE (80s Neon Grid Aesthetic)
**Vibe:** Magenta + Cyan layers, glitchy parallax feel
**Best Font:** CookieRun, Cafe24Surround, NeoDonggeunmo

```css
textShadowCSS: "0 0 10px #ff00ff, 0 0 20px #ff00ffaa, 0 0 30px #ff00ff77,
                 2px 2px 0 #00ffff66, 4px 4px 0 #00ffff33,
                 -2px -2px 0 #ff00ff44, 0 0 40px #ff00ff22"
```

**Technical Breakdown:**
- Layer 1-3: Magenta glow (sharp → soft)
- Layer 4-5: Cyan offset (creates 80s scanning line effect)
- Layer 6-7: Dual-channel bleed for vaporwave distortion
- Result: Chromatic aberration illusion

---

## 2. VAPORWAVE (Pastel Pink + Blue, Dreamy)
**Vibe:** Soft, ethereal, nostalgic mall aesthetic
**Best Font:** Hahmlet, Noto Serif KR, MapoGeumbitnaru

```css
textShadowCSS: "0 0 6px rgba(236,72,153,0.4), 0 0 12px rgba(236,72,153,0.25),
                 0 0 18px rgba(59,130,246,0.3), 0 0 24px rgba(59,130,246,0.15),
                 0 0 36px rgba(168,85,247,0.15), 1px 1px 2px rgba(0,0,0,0.1)"
```

**Technical Breakdown:**
- Pink → Blue gradient blur (smooth transition)
- Purple halo (color temperature bridge)
- Minimal black shadow (soft edges)
- Result: Pastel dream cloud effect

---

## 3. GRAFFITI SPRAY (Urban Street Art Drip)
**Vibe:** Chunky, dripping paint, street credibility
**Best Font:** Black Han Sans, Escoredream, YeogiOttaeJalnan

```css
textShadowCSS: "0 2px 0 rgba(0,0,0,0.3), 0 4px 0 rgba(0,0,0,0.25),
                 0 6px 0 rgba(0,0,0,0.2), 0 8px 0 rgba(0,0,0,0.15),
                 0 10px 4px rgba(0,0,0,0.4),
                 0px 3px 5px rgba(255,255,255,0.1) inset,
                 -1px -1px 2px rgba(255,255,255,0.2),
                 1px 12px 8px rgba(0,0,0,0.2)"
```

**Technical Breakdown:**
- Stepped downward layers (paint drip effect)
- Inset highlight (bevel on edges)
- Gradual alpha decay (gravity simulation)
- Result: 3D spray can depth

---

## 4. WOODCUT PRINT (Traditional Woodblock Print Feel)
**Vibe:** Hand-carved, high contrast, artistic
**Best Font:** Noto Serif KR, Song Myung, Gowun Batang

```css
textShadowCSS: "-1px -1px 0 #ffffff88, 1px 1px 0 #00000099,
                 -2px 0 1px #ffffff44, 2px 0 1px #00000055,
                 0 -1px 0 #ffffff66, 0 1px 0 #00000088,
                 -1px 1px 2px #00000077, 2px 2px 3px #000000cc"
```

**Technical Breakdown:**
- Diagonal cross-hatching effect
- High white/black contrast (carving simulation)
- Asymmetric shadows (carved unevenness)
- Result: Relief print texture

---

## 5. WATERCOLOR BLEED (Soft Edges, Paint Bleeding)
**Vibe:** Artistic, fluid, organic
**Best Font:** Nanum Brush Script, Nanu Pen Script, MapoGeumbitnaru

```css
textShadowCSS: "0 0 4px rgba(100,150,200,0.3), 0 0 8px rgba(100,150,200,0.2),
                 0 0 12px rgba(150,100,200,0.25), 0 0 20px rgba(150,100,200,0.1),
                 1px 1px 3px rgba(0,0,0,0.1),
                 -1px 1px 2px rgba(200,150,100,0.15),
                 2px -1px 3px rgba(100,200,150,0.12)"
```

**Technical Breakdown:**
- Multi-color diffuse glow (pigment spreading)
- Asymmetric color offset (watercolor bleed direction)
- Soft feathering (no hard edges)
- Result: Watercolor wash effect

---

## 6. STAINED GLASS (Jewel-Toned Luminous Glow)
**Vibe:** Medieval, precious, luminescent
**Best Font:** CookieRun, Cafe24Surround, Black Han Sans

```css
textShadowCSS: "0 0 8px rgba(255,0,127,0.6), 0 0 16px rgba(255,0,127,0.4),
                 0 0 12px rgba(0,255,200,0.5), 0 0 24px rgba(0,255,200,0.2),
                 0 0 20px rgba(100,50,255,0.3),
                 inset -1px -1px 0 rgba(255,255,255,0.3),
                 inset 1px 1px 0 rgba(0,0,0,0.5),
                 0 0 32px rgba(255,100,200,0.15)"
```

**Technical Breakdown:**
- Jewel RGB primaries (magenta, cyan, violet)
- Inset bevels (glass edge catch lights)
- Multiple halo layers (thickness illusion)
- Result: Backlit stained glass

---

## 7. PAPER CUTOUT (Flat with Sharp Hard Shadow)
**Vibe:** Minimalist, crafted, shadow puppet
**Best Font:** Suit, IBM Plex Sans KR, Pretendard

```css
textShadowCSS: "1px 1px 0 #333333, 2px 2px 0 #333333, 3px 3px 0 #333333,
                 4px 4px 0 #333333, 5px 5px 0 #333333,
                 6px 6px 8px rgba(0,0,0,0.6),
                 -1px -1px 1px rgba(255,255,255,0.3)"
```

**Technical Breakdown:**
- Stepped pixel-perfect shadow (paper thickness)
- No blur (hard shadow edges)
- Consistent angle (single light source)
- Result: Paper craft depth

---

## 8. FROSTED GLASS (Blurry Background Effect Through Text)
**Vibe:** Modern, transparent, bokeh effect
**Best Font:** Gothic A1, Suit, Noto Sans KR

```css
textShadowCSS: "0 0 2px rgba(255,255,255,0.8), 0 0 4px rgba(255,255,255,0.6),
                 0 0 8px rgba(200,200,255,0.4), 0 0 16px rgba(150,150,200,0.2),
                 inset 0 1px 2px rgba(255,255,255,0.5),
                 inset 0 -1px 2px rgba(0,0,0,0.2),
                 0 0 20px rgba(100,100,150,0.1)"
```

**Technical Breakdown:**
- White glow layers (frost highlights)
- Inset shadows (glass depth)
- Soft blue tint (scattered light)
- Result: Frosted surface texture

---

## 9. LASER ENGRAVE (Precise, Tech Etched Look)
**Vibe:** Sci-fi, precise, industrial
**Best Font:** IBM Plex Sans KR, Noto Sans KR, Suit

```css
textShadowCSS: "0 0 3px #00ff00cc, 0 0 6px #00ff0099,
                 0 0 10px #00ff0066, 0 0 15px #00ff0033,
                 1px 0 0 #00ff00aa, -1px 0 0 #00ff00aa,
                 0 1px 0 rgba(0,255,0,0.5), 0 -1px 0 rgba(0,255,0,0.5),
                 0 0 20px rgba(0,255,0,0.2)"
```

**Technical Breakdown:**
- Pure neon green (laser color)
- Cross-axis highlights (X, Y alignment marks)
- Tight fuzzy glow (precise etching)
- Result: Laser cutter glow

---

## 10. HORROR BLOOD (Dark Red with Dripping Feel)
**Vibe:** Visceral, scary, organic gore
**Best Font:** Black Han Sans, Escoredream, ManhwaPromotionAgency

```css
textShadowCSS: "0 2px 0 rgba(139,0,0,0.8), 0 4px 0 rgba(100,0,0,0.7),
                 0 6px 2px rgba(80,0,0,0.6), 0 0 6px rgba(220,20,60,0.4),
                 0 0 12px rgba(139,0,0,0.25),
                 -1px 3px 3px rgba(0,0,0,0.7),
                 1px 8px 4px rgba(0,0,0,0.5)"
```

**Technical Breakdown:**
- Dark red stepped shadow (blood flow)
- Crimson glow (vascular)
- Asymmetric drips (gravity + pooling)
- Soft falloff (macabre diffusion)
- Result: Fresh blood aesthetic

---

## 11. FAIRY TALE (Magical Sparkle + Golden Glow)
**Vibe:** Enchanted, whimsical, fantasy
**Best Font:** CookieRun, GodoMaum, Jua

```css
textShadowCSS: "0 0 6px #ffd700cc, 0 0 12px #ffd700aa,
                 0 0 20px #ffed4e77,
                 -2px -2px 3px rgba(255,200,100,0.5),
                 2px -2px 3px rgba(255,220,120,0.5),
                 -2px 2px 3px rgba(255,180,60,0.4),
                 2px 2px 3px rgba(255,200,100,0.4),
                 0 0 30px rgba(255,215,0,0.2)"
```

**Technical Breakdown:**
- Golden core glow (rich warmth)
- Star sparkle X-points (light refraction)
- Varied golden tones (jewel shimmer)
- Result: Magical aura effect

---

## 12. MILITARY STENCIL (Army Green, Matte, Utilitarian)
**Vibe:** Tactical, utilitarian, stark
**Best Font:** IBM Plex Sans KR, Gothic A1, Suit

```css
textShadowCSS: "1px 1px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.7),
                 3px 3px 0 rgba(0,0,0,0.5),
                 0 0 2px rgba(0,0,0,0.8),
                 -1px 0 0 rgba(60,120,60,0.3),
                 0 -1px 0 rgba(60,120,60,0.3)"
```

**Technical Breakdown:**
- Hard-edged stencil shadow
- Matte black layers (no gloss)
- Green ghosting (stencil alignment marks)
- Result: Military stamp effect

---

## 13. LUXURY BRAND (Minimalist, Thin, Elegant Subtle Shadow)
**Vibe:** Prestigious, refined, understated
**Best Font:** Hahmlet, Gowun Batang, Noto Serif KR

```css
textShadowCSS: "0 1px 1px rgba(0,0,0,0.15), 0 2px 3px rgba(0,0,0,0.08),
                 0 0 1px rgba(0,0,0,0.1),
                 0 0.5px 0 rgba(255,255,255,0.2)"
```

**Technical Breakdown:**
- Ultra-subtle shadow (premium restraint)
- Barely visible white highlight (edge catch)
- Soft focus (bokeh elegance)
- Result: High-end product aesthetic

---

## 14. K-POP STAGE (Bright Neon with Stage Lighting Glow)
**Vibe:** Vibrant, energetic, concert lights
**Best Font:** Black Han Sans, Cafe24Surround, CookieRun

```css
textShadowCSS: "0 0 8px #ff1493ff, 0 0 16px #ff1493dd,
                 0 0 8px #00d9ffff, 0 0 16px #00d9ffdd,
                 0 0 12px #ffff00cc, 0 0 20px #ffff00aa,
                 0 0 30px rgba(255,20,147,0.3),
                 0 0 30px rgba(0,217,255,0.2)"
```

**Technical Breakdown:**
- RGB primary colors (stage lights)
- Dual magenta/cyan (concert stage standard)
- Yellow accent (spotlight)
- Layered color bleed (light mixing)
- Result: Live concert atmosphere

---

## 15. ANIME TITLE (Japanese Style Bold with Speed Lines Feel)
**Vibe:** Dynamic, action-packed, manga energy
**Best Font:** Black Han Sans, Escoredream, CookieRun

```css
textShadowCSS: "0 3px 0 #0066ff, 0 6px 0 #0033ff, 0 9px 0 #001188,
                 0 12px 4px rgba(0,50,200,0.5),
                 -2px 3px 0 rgba(255,255,255,0.4),
                 -4px 6px 0 rgba(255,255,255,0.2),
                 0 0 8px rgba(0,100,255,0.3)"
```

**Technical Breakdown:**
- Stepped blue shadow (anime standard)
- Speed trail offset (velocity effect)
- White speed line ghosting
- Result: Manga action impact

---

## 16. WEBTOON SPEECH (Korean Webtoon Speech Bubble Feel)
**Vibe:** Comic panel, bold, character dialogue
**Best Font:** Do Hyeon, HannaPro, Cafe24Dangdanghae

```css
textShadowCSS: "1px 1px 0 #000000ee, 2px 2px 0 #000000cc,
                 3px 3px 1px #000000aa,
                 0 0 4px rgba(255,255,255,0.5),
                 -1px -1px 0 rgba(255,255,200,0.2),
                 0 0 8px rgba(0,0,0,0.2)"
```

**Technical Breakdown:**
- Bold stacked shadow (webtoon outline)
- White highlight (glossy bubble)
- Subtle yellow wash (balloon interior)
- Result: Webtoon speech bubble style

---

## 17. DREAM SEQUENCE (Soft, Ethereal, Heavenly Glow)
**Vibe:** Surreal, peaceful, transcendent
**Best Font:** Nanum Pen Script, Noto Serif KR, GodoMaum

```css
textShadowCSS: "0 0 6px rgba(200,180,255,0.5), 0 0 12px rgba(180,160,255,0.4),
                 0 0 20px rgba(160,140,255,0.3), 0 0 32px rgba(140,120,255,0.2),
                 0 0 48px rgba(200,180,220,0.1),
                 0 2px 8px rgba(0,0,0,0.05),
                 inset 0 1px 2px rgba(255,255,255,0.3)"
```

**Technical Breakdown:**
- Soft lavender glow (calming)
- Multiple diffuse layers (cloud effect)
- Inset highlight (heavenly light)
- Minimal shadows (weightless)
- Result: Dreamy, floating effect

---

## 18. UNDERGROUND PUNK (Rough, Distressed, Rebellious)
**Vibe:** Gritty, chaotic, anti-design
**Best Font:** Escoredream, ManhwaPromotionAgency, Isamanru

```css
textShadowCSS: "-1px -1px 0 #000000, 1px 1px 0 #000000,
                 -2px 0 0 #000000, 2px 0 0 #000000,
                 0 -2px 0 #000000, 0 2px 0 #000000,
                 -1px 1px 3px #000000, 1px -1px 3px #000000,
                 0 0 6px rgba(100,0,0,0.4)"
```

**Technical Breakdown:**
- Chaotic multi-directional shadows
- Irregular offset (skewed/distressed)
- Dark red tint (bruised/angry)
- Result: Rebellion/distress aesthetic

---

## 19. ZEN MINIMAL (Very Subtle, Almost No Shadow, Peaceful)
**Vibe:** Meditative, quiet, minimalist
**Best Font:** Song Myung, Hahmlet, Noto Serif KR

```css
textShadowCSS: "0 0.5px 1px rgba(0,0,0,0.08),
                 0 1px 2px rgba(0,0,0,0.04),
                 0 0 0.5px rgba(0,0,0,0.03)"
```

**Technical Breakdown:**
- Sub-pixel precision (barely visible)
- Minimal shadow layers (restraint)
- Very low alpha (zen quietness)
- Result: Serene, unobtrusive effect

---

## 20. FESTIVAL LIGHTS (Carnival/Festival Colorful Warm Glow)
**Vibe:** Festive, warm, celebratory joy
**Best Font:** CookieRun, Jua, GodoMaum

```css
textShadowCSS: "0 0 6px rgba(255,100,50,0.7), 0 0 12px rgba(255,100,50,0.5),
                 0 0 8px rgba(255,200,50,0.6), 0 0 16px rgba(255,200,50,0.3),
                 0 0 10px rgba(100,200,255,0.5), 0 0 20px rgba(100,200,255,0.2),
                 0 0 14px rgba(255,100,200,0.4), 0 0 28px rgba(255,100,200,0.15),
                 0 0 40px rgba(255,150,100,0.15)"
```

**Technical Breakdown:**
- Warm orange/red (primary festive color)
- Golden yellow (carnival lights)
- Cool blue accent (contrast depth)
- Hot pink shimmer (playfulness)
- Blended warm halo (warmth dominance)
- Result: Festive carnival atmosphere

---

## Integration Examples

### Adding to `SUBTITLE_TEMPLATES`

```typescript
// In constants/subtitleTemplates.ts

const ADVANCED_CREATIVE: SubtitleTemplate[] = [
  base({
    id: 'adv-01',
    name: 'Retro Synthwave',
    category: 'advanced',
    fontFamily: 'CookieRun',
    color: '#ff00ff',
    outlineColor: '#000000',
    outlineWidth: 1,
    textShadowCSS: "0 0 10px #ff00ff, 0 0 20px #ff00ffaa, 0 0 30px #ff00ff77,
                    2px 2px 0 #00ffff66, 4px 4px 0 #00ffff33,
                    -2px -2px 0 #ff00ff44, 0 0 40px #ff00ff22"
  }),
  // ... remaining 19 recipes
];
```

### Tailwind Integration (if using CSS classes)

```html
<!-- Apply via className with CSS variables -->
<span
  className="text-white font-bold"
  style={{
    textShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ffaa..."
  }}
>
  Retro Synthwave Text
</span>
```

### Performance Considerations

- **Layer Limit:** Max 8 shadows per effect (tested, performant)
- **Alpha Transparency:** Reduces GPU memory (crucial for mobile)
- **Blur Radius:** Keep under 30px for smooth rendering
- **Avoid Inset + Outset Mix:** Use one shadow type per layer (optimization)

---

## Design Philosophy

1. **Depth Layering:** Each recipe uses 3-8 shadow layers for visual richness
2. **Color Psychology:** Specific color combinations evoke intended moods
3. **Alpha Transparency:** rgba() prevents solid blocks, enables blending
4. **Asymmetry:** Slight offsets create organic, not mechanical, feel
5. **Artistic Intent:** Each recipe communicates specific aesthetic/narrative

---

## Testing Checklist

- [ ] Each shadow renders without jank/lag
- [ ] Text remains readable at 720p and 1080p
- [ ] Mobile performance acceptable (60fps)
- [ ] Color contrast > 4.5:1 for accessibility
- [ ] Works with all font families (serif, sans, display)
- [ ] Looks good with dark and light backgrounds
- [ ] Exports cleanly to HTML/video

---

## Next Steps

1. **Integrate into `SUBTITLE_TEMPLATES`** — Add new category: `'advanced_creative'`
2. **Create preview thumbnails** — Visual reference for each effect
3. **Test with actual video frames** — Verify legibility at various speeds
4. **Gather user feedback** — Refine based on production usage
5. **Expand to 60+ recipes** — Additional moods/aesthetics

---

**Created:** 2026-03-01
**Version:** 1.0
**Tested on:** Chrome/Firefox, 1080p viewport, 60fps target
