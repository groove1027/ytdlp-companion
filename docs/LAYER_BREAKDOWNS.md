# Text-Shadow Layer Breakdowns

Visual and technical breakdown of each recipe's shadow layer composition.

---

## 1. RETRO SYNTHWAVE

**Overall Effect:** 80s neon grid with chromatic aberration

```
┌─ MAGENTA CORE (Layers 1-3)
│  ├─ Layer 1: 0 0 10px #ff00ff           → Sharp magenta glow
│  ├─ Layer 2: 0 0 20px #ff00ffaa (66%)  → Mid-range spread
│  └─ Layer 3: 0 0 30px #ff00ff77 (47%)  → Soft diffusion
│
├─ CYAN OFFSET (Layers 4-5)
│  ├─ Layer 4: 2px 2px 0 #00ffff66 (40%) → X+2 Y+2 chromatic shift
│  └─ Layer 5: 4px 4px 0 #00ffff33 (20%) → Extended chromatic
│
├─ ANTI-OFFSET (Layer 6)
│  └─ Layer 6: -2px -2px 0 #ff00ff44 (27%) → Creates 3D depth
│
└─ FAR BLOOM (Layer 7)
   └─ Layer 7: 0 0 40px #ff00ff22 (13%) → Distant ambient glow
```

**Shadow Count:** 7 layers
**Dominant Color:** Magenta + Cyan (RGB opposite = white shimmer)
**Technique:** Chromatic aberration via color offset

---

## 2. VAPORWAVE

**Overall Effect:** Pastel dream with soft color gradient

```
┌─ PINK CORE (Layers 1-2)
│  ├─ Layer 1: 0 0 6px rgba(236,72,153,0.4)   → Tight pink
│  └─ Layer 2: 0 0 12px rgba(236,72,153,0.25) → Mid pink
│
├─ BLUE TRANSITION (Layers 3-4)
│  ├─ Layer 3: 0 0 18px rgba(59,130,246,0.3)   → Cool blue
│  └─ Layer 4: 0 0 24px rgba(59,130,246,0.15)  → Soft blue
│
├─ PURPLE BRIDGE (Layer 5)
│  └─ Layer 5: 0 0 36px rgba(168,85,247,0.15) → Color temperature shift
│
└─ SHADOW (Layer 6)
   └─ Layer 6: 1px 1px 2px rgba(0,0,0,0.1) → Minimal shadow
```

**Shadow Count:** 6 layers
**Dominant Color:** Magenta → Cyan gradient
**Technique:** Color temperature gradient, soft feather

---

## 3. GRAFFITI SPRAY

**Overall Effect:** Paint dripping with gravity simulation

```
┌─ STEPPED DRIP (Layers 1-5)
│  ├─ Layer 1: 0 2px 0 rgba(0,0,0,0.3)   → First drip
│  ├─ Layer 2: 0 4px 0 rgba(0,0,0,0.25)  → Continued drip
│  ├─ Layer 3: 0 6px 0 rgba(0,0,0,0.2)   → Drip decay
│  ├─ Layer 4: 0 8px 0 rgba(0,0,0,0.15)  → Far drip
│  └─ Layer 5: 0 10px 4px rgba(0,0,0,0.4) → Bottom pool
│
├─ INSET HIGHLIGHT (Layer 6)
│  └─ Layer 6: 0px 3px 5px rgba(255,255,255,0.1) inset → Bevel
│
├─ WHITE EDGE (Layer 7)
│  └─ Layer 7: -1px -1px 2px rgba(255,255,255,0.2) → Carve edge
│
└─ GROUND SHADOW (Layer 8)
   └─ Layer 8: 1px 12px 8px rgba(0,0,0,0.2) → Bottom reflection
```

**Shadow Count:** 8 layers
**Dominant Color:** Black
**Technique:** Stepped downward offset + inset highlight

---

## 4. WOODCUT PRINT

**Overall Effect:** Hand-carved relief texture

```
┌─ DIAGONAL CROSS HATCHING
│  ├─ Layer 1: -1px -1px 0 #ffffff88 → TL white (carve highlight)
│  ├─ Layer 2: 1px 1px 0 #00000099   → BR black (carved depth)
│  ├─ Layer 3: -2px 0 1px #ffffff44  → Left white edge
│  ├─ Layer 4: 2px 0 1px #00000055   → Right black edge
│  ├─ Layer 5: 0 -1px 0 #ffffff66    → Top white
│  └─ Layer 6: 0 1px 0 #00000088     → Bottom black
│
├─ SECONDARY DEPTH
│  ├─ Layer 7: -1px 1px 2px #00000077 → Double shadow
│  └─ Layer 8: 2px 2px 3px #000000cc  → Far shadow
```

**Shadow Count:** 8 layers
**Dominant Colors:** Black + White (high contrast)
**Technique:** Asymmetric multi-directional shadows

---

## 5. WATERCOLOR BLEED

**Overall Effect:** Organic diffusion with color bleed

```
┌─ BLUE CORE (Layers 1-2)
│  ├─ Layer 1: 0 0 4px rgba(100,150,200,0.3)  → Tight blue
│  └─ Layer 2: 0 0 8px rgba(100,150,200,0.2)  → Spread blue
│
├─ PURPLE MIX (Layers 3-4)
│  ├─ Layer 3: 0 0 12px rgba(150,100,200,0.25) → Color mix
│  └─ Layer 4: 0 0 20px rgba(150,100,200,0.1)  → Soft purple
│
├─ ASYMMETRIC OFFSET (Layers 5-6)
│  ├─ Layer 5: 1px 1px 3px rgba(0,0,0,0.1)    → Black shadow
│  ├─ Layer 6: -1px 1px 2px rgba(200,150,100,0.15) → Brown bleed
│  └─ Layer 7: 2px -1px 3px rgba(100,200,150,0.12) → Green bleed
```

**Shadow Count:** 7 layers
**Dominant Colors:** Blue → Purple → Brown/Green (multi-hue bleed)
**Technique:** Asymmetric offset with multi-color diffusion

---

## 6. STAINED GLASS

**Overall Effect:** Jewel-toned luminous glow

```
┌─ MAGENTA CORE (Layers 1-2)
│  ├─ Layer 1: 0 0 8px rgba(255,0,127,0.6)   → Intense magenta
│  └─ Layer 2: 0 0 16px rgba(255,0,127,0.4)  → Magenta halo
│
├─ CYAN SECONDARY (Layers 3-4)
│  ├─ Layer 3: 0 0 12px rgba(0,255,200,0.5)  → Cyan glow
│  └─ Layer 4: 0 0 24px rgba(0,255,200,0.2)  → Cyan spread
│
├─ VIOLET ACCENT (Layer 5)
│  └─ Layer 5: 0 0 20px rgba(100,50,255,0.3) → Deep violet
│
├─ INSET BEVELS (Layers 6-7)
│  ├─ Layer 6: inset -1px -1px 0 rgba(255,255,255,0.3) → Light edge
│  └─ Layer 7: inset 1px 1px 0 rgba(0,0,0,0.5) → Dark edge
│
└─ FAR BLOOM (Layer 8)
   └─ Layer 8: 0 0 32px rgba(255,100,200,0.15) → Distant glow
```

**Shadow Count:** 8 layers
**Dominant Colors:** Magenta + Cyan + Violet (RGB saturated)
**Technique:** Inset bevels create glass illusion

---

## 7. PAPER CUTOUT

**Overall Effect:** Flat shadow puppet

```
┌─ STEPPED SHADOW
│  ├─ Layer 1: 1px 1px 0 #333333   → 1px offset
│  ├─ Layer 2: 2px 2px 0 #333333   → 2px offset
│  ├─ Layer 3: 3px 3px 0 #333333   → 3px offset
│  ├─ Layer 4: 4px 4px 0 #333333   → 4px offset
│  ├─ Layer 5: 5px 5px 0 #333333   → 5px offset
│  └─ Layer 6: 6px 6px 8px rgba(0,0,0,0.6) → Bottom blur
│
└─ LIGHT EDGE
   └─ Layer 7: -1px -1px 1px rgba(255,255,255,0.3) → Top highlight
```

**Shadow Count:** 7 layers
**Dominant Color:** Gray
**Technique:** Stepped pixel-perfect shadows (no blur on steps)

---

## 8. FROSTED GLASS

**Overall Effect:** Bokeh with frost highlights

```
┌─ WHITE FROST (Layers 1-2)
│  ├─ Layer 1: 0 0 2px rgba(255,255,255,0.8)  → Tight frost
│  └─ Layer 2: 0 0 4px rgba(255,255,255,0.6)  → Frost glow
│
├─ BLUE TINT (Layers 3-4)
│  ├─ Layer 3: 0 0 8px rgba(200,200,255,0.4)  → Light blue
│  └─ Layer 4: 0 0 16px rgba(150,150,200,0.2) → Soft blue
│
├─ INSET DEPTH (Layers 5-6)
│  ├─ Layer 5: inset 0 1px 2px rgba(255,255,255,0.5)  → Top light
│  └─ Layer 6: inset 0 -1px 2px rgba(0,0,0,0.2)       → Bottom dark
│
└─ AMBIENT (Layer 7)
   └─ Layer 7: 0 0 20px rgba(100,100,150,0.1) → Soft ambient
```

**Shadow Count:** 7 layers
**Dominant Colors:** White + Blue (glass perception)
**Technique:** Inset shadows create depth perception

---

## 9. LASER ENGRAVE

**Overall Effect:** Precise sci-fi etching

```
┌─ NEON GREEN GLOW (Layers 1-4)
│  ├─ Layer 1: 0 0 3px #00ff00cc   → Tight laser
│  ├─ Layer 2: 0 0 6px #00ff0099   → Mid glow
│  ├─ Layer 3: 0 0 10px #00ff0066  → Spread
│  └─ Layer 4: 0 0 15px #00ff0033  → Far glow
│
├─ ALIGNMENT MARKS (Layers 5-8)
│  ├─ Layer 5: 1px 0 0 #00ff00aa   → Right mark
│  ├─ Layer 6: -1px 0 0 #00ff00aa  → Left mark
│  ├─ Layer 7: 0 1px 0 rgba(0,255,0,0.5) → Bottom mark
│  ├─ Layer 8: 0 -1px 0 rgba(0,255,0,0.5) → Top mark
│
└─ FAR BLOOM (Layer 9)
   └─ Layer 9: 0 0 20px rgba(0,255,0,0.2) → Ambient bloom
```

**Shadow Count:** 9 layers (exceeds normal, justified by technical need)
**Dominant Color:** Pure neon green
**Technique:** Cross-axis alignment marks + concentric halos

---

## 10. HORROR BLOOD

**Overall Effect:** Visceral gore with gravity

```
┌─ STEPPED DRIP (Layers 1-3)
│  ├─ Layer 1: 0 2px 0 rgba(139,0,0,0.8)   → Dark blood drip
│  ├─ Layer 2: 0 4px 0 rgba(100,0,0,0.7)   → Continued flow
│  └─ Layer 3: 0 6px 2px rgba(80,0,0,0.6)  → Drip blur
│
├─ CRIMSON GLOW (Layers 4-5)
│  ├─ Layer 4: 0 0 6px rgba(220,20,60,0.4)   → Crimson glow
│  └─ Layer 5: 0 0 12px rgba(139,0,0,0.25)   → Dark red halo
│
├─ ASYMMETRIC POOL (Layers 6-7)
│  ├─ Layer 6: -1px 3px 3px rgba(0,0,0,0.7) → Left pool
│  └─ Layer 7: 1px 8px 4px rgba(0,0,0,0.5) → Right pool
```

**Shadow Count:** 7 layers
**Dominant Color:** Dark Red + Crimson (blood spectrum)
**Technique:** Gravity simulation + pooling effect

---

## 11. FAIRY TALE

**Overall Effect:** Magical sparkle with golden glow

```
┌─ GOLDEN CORE (Layers 1-3)
│  ├─ Layer 1: 0 0 6px #ffd700cc   → Tight gold
│  ├─ Layer 2: 0 0 12px #ffd700aa  → Mid gold
│  └─ Layer 3: 0 0 20px #ffed4e77  → Soft gold
│
├─ STAR SPARKLE (Layers 4-7) - X shape
│  ├─ Layer 4: -2px -2px 3px rgba(255,200,100,0.5) → Top-left sparkle
│  ├─ Layer 5: 2px -2px 3px rgba(255,220,120,0.5) → Top-right sparkle
│  ├─ Layer 6: -2px 2px 3px rgba(255,180,60,0.4)  → Bottom-left sparkle
│  └─ Layer 7: 2px 2px 3px rgba(255,200,100,0.4)  → Bottom-right sparkle
│
└─ FAR AMBIENT (Layer 8)
   └─ Layer 8: 0 0 30px rgba(255,215,0,0.2) → Distant glow
```

**Shadow Count:** 8 layers
**Dominant Color:** Gold variations (RGB warm)
**Technique:** 4-point star sparkle pattern

---

## 12. MILITARY STENCIL

**Overall Effect:** Tactical utilitarian style

```
┌─ HARD SHADOW STACK (Layers 1-3)
│  ├─ Layer 1: 1px 1px 0 rgba(0,0,0,0.9)  → 1px black
│  ├─ Layer 2: 2px 2px 0 rgba(0,0,0,0.7)  → 2px black (decay)
│  └─ Layer 3: 3px 3px 0 rgba(0,0,0,0.5)  → 3px black (decay)
│
├─ TIGHT SHADOW (Layer 4)
│  └─ Layer 4: 0 0 2px rgba(0,0,0,0.8) → Minimal blur
│
└─ GREEN GHOSTING (Layers 5-6)
   ├─ Layer 5: -1px 0 0 rgba(60,120,60,0.3) → Left green offset
   └─ Layer 6: 0 -1px 0 rgba(60,120,60,0.3) → Top green offset
```

**Shadow Count:** 6 layers
**Dominant Colors:** Black + Army Green
**Technique:** Hard stencil edges + registration marks

---

## 13. LUXURY BRAND

**Overall Effect:** Minimalist elegant restraint

```
┌─ PRIMARY SHADOW (Layer 1)
│  └─ Layer 1: 0 1px 1px rgba(0,0,0,0.15) → Subtle shadow
│
├─ SECONDARY SHADOW (Layer 2)
│  └─ Layer 2: 0 2px 3px rgba(0,0,0,0.08) → Softer shadow
│
├─ MINIMAL ACCENT (Layer 3)
│  └─ Layer 3: 0 0 1px rgba(0,0,0,0.1) → Barely visible
│
└─ EDGE HIGHLIGHT (Layer 4)
   └─ Layer 4: 0 0.5px 0 rgba(255,255,255,0.2) → Premium edge catch
```

**Shadow Count:** 4 layers
**Dominant Color:** Black (ultra-subtle)
**Technique:** Sub-pixel precision, minimal distraction

---

## 14. K-POP STAGE

**Overall Effect:** Concert stage RGB lighting

```
┌─ MAGENTA LIGHTS (Layers 1-2)
│  ├─ Layer 1: 0 0 8px #ff1493ff   → Intense hot pink
│  └─ Layer 2: 0 0 16px #ff1493dd  → Spread pink
│
├─ CYAN LIGHTS (Layers 3-4)
│  ├─ Layer 3: 0 0 8px #00d9ffff   → Intense cyan
│  └─ Layer 4: 0 0 16px #00d9ffdd  → Spread cyan
│
├─ YELLOW SPOTLIGHT (Layers 5-6)
│  ├─ Layer 5: 0 0 12px #ffff00cc  → Spotlight glow
│  └─ Layer 6: 0 0 20px #ffff00aa  → Spotlight spread
│
└─ COLOR MIX BLOOMS (Layers 7-8)
   ├─ Layer 7: 0 0 30px rgba(255,20,147,0.3) → Magenta bloom
   └─ Layer 8: 0 0 30px rgba(0,217,255,0.2) → Cyan bloom
```

**Shadow Count:** 8 layers
**Dominant Colors:** Magenta + Cyan + Yellow (concert RGB)
**Technique:** Color light mixing, concert atmosphere

---

## 15. ANIME TITLE

**Overall Effect:** Manga action impact with speed lines

```
┌─ STEPPED BLUE SHADOW (Layers 1-4)
│  ├─ Layer 1: 0 3px 0 #0066ff    → Primary blue shadow
│  ├─ Layer 2: 0 6px 0 #0033ff    → Darker blue
│  ├─ Layer 3: 0 9px 0 #001188    → Darkest blue (weight)
│  └─ Layer 4: 0 12px 4px rgba(0,50,200,0.5) → Bottom blur
│
├─ SPEED LINE TRAILS (Layers 5-6)
│  ├─ Layer 5: -2px 3px 0 rgba(255,255,255,0.4) → Left trail
│  └─ Layer 6: -4px 6px 0 rgba(255,255,255,0.2) → Extended trail
│
└─ GLOW (Layer 7)
   └─ Layer 7: 0 0 8px rgba(0,100,255,0.3) → Blue glow
```

**Shadow Count:** 7 layers
**Dominant Color:** Blue (anime standard)
**Technique:** Stepped shadow for impact, speed line trails

---

## 16. WEBTOON SPEECH

**Overall Effect:** Korean comic panel dialogue

```
┌─ BOLD STACKED OUTLINE (Layers 1-3)
│  ├─ Layer 1: 1px 1px 0 #000000ee   → 1px outline
│  ├─ Layer 2: 2px 2px 0 #000000cc   → 2px outline
│  └─ Layer 3: 3px 3px 1px #000000aa → 3px outline
│
├─ INTERIOR HIGHLIGHT (Layer 4)
│  └─ Layer 4: 0 0 4px rgba(255,255,255,0.5) → Glossy bubble
│
├─ YELLOW WASH (Layer 5)
│  └─ Layer 5: -1px -1px 0 rgba(255,255,200,0.2) → Balloon interior tint
│
└─ FALLOFF (Layer 6)
   └─ Layer 6: 0 0 8px rgba(0,0,0,0.2) → Soft shadow
```

**Shadow Count:** 6 layers
**Dominant Color:** Black + Yellow tint
**Technique:** Stacked outline creates speech bubble feel

---

## 17. DREAM SEQUENCE

**Overall Effect:** Ethereal heavenly glow

```
┌─ LAVENDER CORE (Layers 1-2)
│  ├─ Layer 1: 0 0 6px rgba(200,180,255,0.5)  → Tight lavender
│  └─ Layer 2: 0 0 12px rgba(180,160,255,0.4) → Mid lavender
│
├─ COLOR DIFFUSION (Layers 3-5)
│  ├─ Layer 3: 0 0 20px rgba(160,140,255,0.3) → Light diffusion
│  ├─ Layer 4: 0 0 32px rgba(140,120,255,0.2) → Soft diffusion
│  └─ Layer 5: 0 0 48px rgba(200,180,220,0.1) → Far ambient
│
├─ MINIMAL SHADOW (Layer 6)
│  └─ Layer 6: 0 2px 8px rgba(0,0,0,0.05) → Barely visible
│
└─ INSET LIGHT (Layer 7)
   └─ Layer 7: inset 0 1px 2px rgba(255,255,255,0.3) → Heavenly light
```

**Shadow Count:** 7 layers
**Dominant Color:** Lavender (soft purple)
**Technique:** Multiple diffuse layers for cloud effect

---

## 18. UNDERGROUND PUNK

**Overall Effect:** Gritty chaotic distressed

```
┌─ CHAOTIC MULTI-DIRECTIONAL (Layers 1-6)
│  ├─ Layer 1: -1px -1px 0 #000000 → Top-left
│  ├─ Layer 2: 1px 1px 0 #000000   → Bottom-right
│  ├─ Layer 3: -2px 0 0 #000000    → Far left
│  ├─ Layer 4: 2px 0 0 #000000     → Far right
│  ├─ Layer 5: 0 -2px 0 #000000    → Up
│  └─ Layer 6: 0 2px 0 #000000     → Down
│
├─ DIAGONAL SHADOWS (Layers 7-8)
│  ├─ Layer 7: -1px 1px 3px #000000 → Distressed
│  └─ Layer 8: 1px -1px 3px #000000 → Chaotic blur
│
└─ RED TINT (Layer 9)
   └─ Layer 9: 0 0 6px rgba(100,0,0,0.4) → Bruised anger
```

**Shadow Count:** 9 layers
**Dominant Colors:** Black + Dark Red
**Technique:** Irregular multi-directional offsets

---

## 19. ZEN MINIMAL

**Overall Effect:** Meditative sub-pixel shadow

```
┌─ PRIMARY MICRO-SHADOW (Layer 1)
│  └─ Layer 1: 0 0.5px 1px rgba(0,0,0,0.08) → Sub-pixel precision
│
├─ SECONDARY MICRO-SHADOW (Layer 2)
│  └─ Layer 2: 0 1px 2px rgba(0,0,0,0.04) → Even softer
│
└─ MINIMAL ACCENT (Layer 3)
   └─ Layer 3: 0 0 0.5px rgba(0,0,0,0.03) → Barely perceptible
```

**Shadow Count:** 3 layers
**Dominant Color:** Black (ultra-light)
**Technique:** Sub-pixel precision, almost invisible

---

## 20. FESTIVAL LIGHTS

**Overall Effect:** Carnival warm multicolor bokeh

```
┌─ WARM ORANGE/RED (Layers 1-2)
│  ├─ Layer 1: 0 0 6px rgba(255,100,50,0.7)   → Tight warm
│  └─ Layer 2: 0 0 12px rgba(255,100,50,0.5)  → Spread warm
│
├─ GOLDEN YELLOW (Layers 3-4)
│  ├─ Layer 3: 0 0 8px rgba(255,200,50,0.6)  → Carnival gold
│  └─ Layer 4: 0 0 16px rgba(255,200,50,0.3) → Spread gold
│
├─ COOL BLUE ACCENT (Layers 5-6)
│  ├─ Layer 5: 0 0 10px rgba(100,200,255,0.5)  → Cool contrast
│  └─ Layer 6: 0 0 20px rgba(100,200,255,0.2)  → Spread blue
│
├─ HOT PINK SHIMMER (Layers 7-8)
│  ├─ Layer 7: 0 0 14px rgba(255,100,200,0.4) → Pink sparkle
│  └─ Layer 8: 0 0 28px rgba(255,100,200,0.15) → Spread pink
│
└─ WARM AMBIENT BLOOM (Layer 9)
   └─ Layer 9: 0 0 40px rgba(255,150,100,0.15) → Overall warmth
```

**Shadow Count:** 9 layers
**Dominant Colors:** Orange + Gold + Pink (warm), with Blue contrast
**Technique:** Multiple color bokeh halos

---

## Summary Statistics

| Recipe | Layers | Max Blur | Color Count | Complexity |
|--------|--------|----------|-------------|------------|
| 1. Synthwave | 7 | 40px | 2 | HIGH |
| 2. Vaporwave | 6 | 36px | 3 | MEDIUM |
| 3. Graffiti | 8 | 12px | 1 | MEDIUM |
| 4. Woodcut | 8 | 3px | 2 | MEDIUM |
| 5. Watercolor | 7 | 20px | 4 | MEDIUM |
| 6. Stained Glass | 8 | 32px | 3 | HIGH |
| 7. Paper Cutout | 7 | 8px | 1 | LOW |
| 8. Frosted Glass | 7 | 20px | 2 | MEDIUM |
| 9. Laser Engrave | 9 | 20px | 1 | MEDIUM |
| 10. Horror Blood | 7 | 12px | 2 | HIGH |
| 11. Fairy Tale | 8 | 30px | 3 | MEDIUM |
| 12. Military | 6 | 2px | 2 | LOW |
| 13. Luxury | 4 | 3px | 1 | VERY LOW |
| 14. K-Pop Stage | 8 | 30px | 4 | VERY HIGH |
| 15. Anime | 7 | 12px | 3 | HIGH |
| 16. Webtoon | 6 | 8px | 2 | MEDIUM |
| 17. Dream | 7 | 48px | 2 | MEDIUM |
| 18. Punk | 9 | 3px | 2 | MEDIUM |
| 19. Zen | 3 | 2px | 1 | VERY LOW |
| 20. Festival | 9 | 40px | 5 | HIGH |

**Average:** 6.9 layers, 16.8px blur, 2.3 colors

---

**Created:** 2026-03-01
**Purpose:** Visual reference and layer-by-layer breakdown
**Audience:** Developers implementing these recipes
