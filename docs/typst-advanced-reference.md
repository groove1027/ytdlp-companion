# Typst Advanced Technical Reference
## Publication-Quality Ebooks & Documents

> Comprehensive reference covering typography, layout, images, shapes, tables, lists, colors, advanced layout, book features, and Korean/CJK support.

---

## Table of Contents

1. [Typography & Text Styling](#1-typography--text-styling)
2. [Page Layout & Composition](#2-page-layout--composition)
3. [Image Handling](#3-image-handling)
4. [Boxes, Blocks & Decorative Elements](#4-boxes-blocks--decorative-elements)
5. [Tables](#5-tables)
6. [Lists & Enumerations](#6-lists--enumerations)
7. [Color & Theming](#7-color--theming)
8. [Advanced Layout Techniques](#8-advanced-layout-techniques)
9. [Book-Specific Features](#9-book-specific-features)
10. [Korean/CJK-Specific](#10-koreancjk-specific)

---

## 1. Typography & Text Styling

### 1.1 Font, Weight, Size, Tracking, Leading

The `text()` function controls all text rendering. Key parameters:

```typst
// Font family (string, array for fallback, or dict)
#set text(font: "Noto Serif KR")
#set text(font: ("Noto Serif KR", "Noto Serif"))  // fallback list

// Font weight: 100-900 integers or names
// Names: thin, extralight, light, regular, medium, semibold, bold, extrabold, black
#set text(weight: "bold")
#set text(weight: 700)

// Font size (default: 11pt) — also defines `em` unit
#set text(size: 12pt)

// Font style: "normal", "italic", "oblique"
#set text(style: "italic")

// Tracking: space between characters (default: 0pt)
#set text(tracking: 0.5pt)   // looser
#set text(tracking: -0.3pt)  // tighter

// Spacing: space between words (default: 100% + 0pt)
#set text(spacing: 150%)

// Font stretch: glyph width (50%-200%, default: 100%)
#set text(stretch: 75%)

// Baseline shift (default: 0pt)
#set text(baseline: -2pt)  // shift up
```

**Leading** is controlled via `par()`:

```typst
// Leading: spacing between lines (default: 0.65em)
#set par(leading: 0.8em)

// Paragraph spacing (default: 1.2em)
#set par(spacing: 1.0em)
```

### 1.2 Text Decoration

#### Underline

```typst
This is #underline[underlined text].

// Customized underline
#underline(
  stroke: 1.5pt + red,  // thickness + color
  offset: 2pt,          // distance from baseline
  extent: 1pt,          // extension beyond text
  evade: true,          // skip descenders (default: true)
  background: false,    // behind text? (default: false)
)[Important text]
```

Parameters: `stroke`, `offset`, `extent`, `evade`, `background`, `body`.

#### Overline

```typst
#overline[overlined text]

#overline(
  stroke: 2pt + blue,
  offset: auto,    // from font metrics
  extent: 0pt,
  evade: true,
  background: false,
)[decorated text]
```

Same parameters as underline.

#### Strikethrough

```typst
#strike[deleted text]

#strike(
  stroke: 1pt + red,
  offset: auto,       // from font metrics
  extent: 0pt,
  background: false,
)[removed content]
```

Parameters: `stroke`, `offset`, `extent`, `background`, `body`.

#### Highlight

```typst
#highlight[highlighted text]

#highlight(
  fill: yellow,                // default: rgb("#fffd11a1")
  stroke: 1pt + orange,       // border around highlight
  top-edge: "ascender",       // "ascender", "cap-height", "x-height", "baseline", "bounds"
  bottom-edge: "descender",   // "baseline", "descender", "bounds"
  extent: 2pt,                // horizontal extension
  radius: 3pt,                // rounded corners
)[important]
```

### 1.3 Small Caps, All Caps, Font Features

```typst
// Small caps — requires font support (OpenType `smcp` feature)
#smallcaps[This text uses small capitals]

// Small caps for uppercase letters too (OpenType `c2sc` feature)
#smallcaps(all: true)[NASA and UNESCO]

// All caps
#upper[make this uppercase]

// All lowercase
#lower[MAKE THIS LOWERCASE]

// OpenType font features (raw)
#set text(features: ("smcp",))     // enable small caps
#set text(features: ("onum",))     // old-style numerals
#set text(features: (("liga", 0),)) // disable ligatures

// Number types
#set text(number-type: "old-style")      // old-style (lowercase) numerals
#set text(number-type: "lining")         // lining (uppercase) numerals

// Number widths
#set text(number-width: "tabular")       // fixed-width digits (for tables)
#set text(number-width: "proportional")  // proportional digits

// Slashed zero
#set text(slashed-zero: true)

// Automatic fractions
#set text(fractions: true)  // 1/2 becomes a proper fraction

// Stylistic alternates
#set text(alternates: true)

// Stylistic sets (1-20, font-dependent)
#set text(stylistic-set: 1)
#set text(stylistic-set: (1, 5, 7))  // multiple sets

// Ligatures
#set text(ligatures: true)                    // standard (default: true)
#set text(discretionary-ligatures: true)      // decorative ligatures
#set text(historical-ligatures: true)         // historical forms

// Kerning
#set text(kerning: true)  // default: true

// Overhang — allow glyphs to extend into margins
#set text(overhang: true)  // default: true
```

### 1.4 Drop Caps (via `droplet` Package)

```typst
#import "@preview/droplet:0.3.1": dropcap

// Basic drop cap — 2 lines tall
#dropcap[Once upon a time, in a land far away...]

// Customized drop cap
#dropcap(
  height: 3,               // lines to span (integer) or length
  gap: 4pt,                // space between capital and body text
  hanging-indent: 1em,     // indent for subsequent body lines
  overhang: 8pt,           // how far into the margin
  depth: 0pt,              // space below the capital
  font: "Playfair Display", // custom font for the capital
  transform: letter => text(fill: navy)[#letter],  // styling function
  justify: auto,           // text justification
)[In the beginning there was nothing but darkness and silence...]
```

**Gotcha**: The `dropcap` function extracts the first letter automatically from a single positional argument. If you need a specific character, pass it as a separate first argument followed by the body text.

### 1.5 Paragraph Control

```typst
// First-line indent (default: 0pt)
#set par(first-line-indent: 1em)

// Indent ALL paragraphs (including first after heading)
#set par(first-line-indent: (amount: 1em, all: true))

// Hanging indent (all lines except first)
#set par(hanging-indent: 2em)

// Justified text
#set par(justify: true)

// Justification limits — control word/letter spacing ranges
#set par(justification-limits: (
  spacing: (min: 66.67%, max: 150%),  // word spacing range
  tracking: (min: -0.5pt, max: 0.5pt), // letter spacing range
))

// Line breaking algorithm
#set par(linebreaks: "optimized")  // considers full paragraph (default for justified)
#set par(linebreaks: "simple")     // first-fit, faster

// Orphan/widow control via text costs
#set text(costs: (
  orphan: 100%,      // penalize orphaned lines (default: 100%)
  widow: 100%,       // penalize widowed lines (default: 100%)
  runt: 100%,        // penalize short last lines
  hyphenation: 100%, // penalize hyphenation
))
```

**Gotcha**: `first-line-indent` with `all: false` (default) does NOT indent the very first paragraph or paragraphs immediately after headings. Use `all: true` if you want every paragraph indented.

### 1.6 Hyphenation

```typst
// Enable/disable hyphenation
#set text(hyphenate: true)

// Language-specific hyphenation (auto-selects patterns)
#set text(lang: "ko")   // Korean
#set text(lang: "en")   // English
#set text(lang: "de")   // German

// Hyphenation is auto-enabled when justify is true
#set par(justify: true)
// With justify: true, hyphenate defaults to true for known languages
```

**Gotcha for Korean**: Korean text typically does not use hyphenation in the Western sense. Setting `lang: "ko"` ensures Typst uses appropriate Korean line-breaking rules (breaking between syllable blocks) rather than Latin hyphenation patterns.

### 1.7 Text Fill (Color) & Gradient Text

```typst
// Solid color fill
#set text(fill: blue)
#set text(fill: rgb("#2563eb"))

// Text stroke (outline)
#set text(stroke: 0.5pt + black)

// Gradient text — MUST be wrapped in box()
#let rainbow(content) = {
  set text(fill: gradient.linear(..color.map.rainbow))
  box(content)
}
This is #rainbow[rainbow gradient text]!

// Simple two-color gradient on text
#let gradient-text(content) = {
  set text(fill: gradient.linear(blue, purple))
  box(content)
}
```

**Gotcha**: Gradient text requires wrapping in `box()` because gradients need a bounding box to calculate their extent. Without `box()`, the gradient spans the entire parent container.

### 1.8 Superscript & Subscript

```typst
// Superscript
#super[2]         // E = mc#super[2]

// Subscript
#sub[i]           // x#sub[i]

// Customized superscript
#super(
  typographic: true,    // use font's built-in glyphs (default: true)
  baseline: auto,       // shift amount (default: auto = -0.5em)
  size: auto,           // glyph size (default: auto = 0.6em)
)[n+1]
```

### 1.9 Emphasis & Strong

```typst
// Italic (emphasis) — toggles italic state
_emphasized text_
#emph[also emphasized]

// Bold (strong)
*bold text*
#strong[also bold]
#strong(delta: 300)[extra heavy]  // add 300 to current weight
```

---

## 2. Page Layout & Composition

### 2.1 Page-Level Layout Control

```typst
// Paper size (default: "a4")
#set page("a4")
#set page("us-letter")
#set page("a5")       // common for ebooks

// Custom dimensions
#set page(width: 148mm, height: 210mm)  // A5 manually

// Landscape
#set page(flipped: true)

// Margins
#set page(margin: 2cm)                  // uniform
#set page(margin: (x: 2cm, y: 3cm))     // horizontal/vertical
#set page(margin: (
  top: 3cm,
  bottom: 2.5cm,
  left: 2cm,
  right: 2cm,
))

// Book binding margins (alternating inside/outside)
#set page(margin: (
  inside: 2.5cm,    // binding side (wider)
  outside: 2cm,     // outer edge
  top: 3cm,
  bottom: 2.5cm,
))
#set page(binding: left)  // or right, auto

// Page columns
#set page(columns: 2)

// Page background fill
#set page(fill: rgb("#f5f0eb"))  // cream paper color
```

### 2.2 Absolute Positioning with `place()`

```typst
// Place content at absolute position on page
#place(top + right, dx: -10pt, dy: 10pt)[
  #text(8pt, fill: gray)[Draft]
]

// Overlay content without affecting layout (default behavior)
#place(center + horizon)[
  #text(60pt, fill: luma(90%))[DRAFT]
]

// Float mode — displaces surrounding content
#place(top, float: true, clearance: 1.5em)[
  #block(width: 100%, fill: luma(240), inset: 10pt)[
    Important notice at the top of the page.
  ]
]

// Full-page placement scope (across columns)
#place(
  top + center,
  float: true,
  scope: "parent",   // "column" (default) or "parent"
)[Full-width banner]

// Flush pending floats
#place.flush()
```

Parameters: `alignment` (positional), `scope`, `float`, `clearance`, `dx`, `dy`, `body`.

**Gotcha**: Without `float: true`, placed content overlays existing material without displacing it. Parent-scoped placement requires `float: true`.

### 2.3 Flexible Spacing with `v()` and `h()`

```typst
// Fixed vertical spacing
#v(20pt)

// Relative spacing
#v(2em)

// Fractional spacing — distributes remaining space
#v(1fr)   // push content to bottom of page

// Multiple fractions distribute proportionally
Top content
#v(1fr)
Middle content
#v(2fr)  // gets twice the space
Bottom content

// Weak spacing — collapses at boundaries
#v(4pt, weak: true)

// Horizontal spacing
Left #h(1fr) Right    // push apart
A #h(2cm) B           // fixed gap
```

### 2.4 Keep Content Together with `block(breakable: false)`

```typst
// Prevent page break within content
#block(breakable: false)[
  = Chapter Title
  This introductory paragraph will not be separated from its heading.
]

// Sticky blocks — prevent break between this and next element
#block(sticky: true)[
  = Important Heading
]
// Next paragraph stays with heading

// Keep figure with its caption
#block(breakable: false)[
  #figure(
    image("photo.jpg", width: 80%),
    caption: [This stays together with the image.],
  )
]
```

### 2.5 Multi-Column Layouts

```typst
// Page-level columns
#set page(columns: 2)
#set columns(gutter: 12pt)

// Inline columns section
#columns(2, gutter: 8pt)[
  Left column content here.
  #colbreak()
  Right column content here.
]

// Three columns with custom gutter
#columns(3, gutter: 1cm)[
  Column 1. #colbreak()
  Column 2. #colbreak()
  Column 3.
]

// Full-width content spanning columns
#place(
  top + center,
  float: true,
  scope: "parent",
  text(1.4em, weight: "bold")[Full-Width Title],
)
```

### 2.6 Running Headers and Footers with Page Numbers

```typst
// Simple page numbering
#set page(numbering: "1")
#set page(numbering: "— 1 —")
#set page(numbering: "1 / 1")  // "3 / 42" format
#set page(numbering: "i")      // roman numerals

// Number alignment
#set page(number-align: center + bottom)
#set page(number-align: right + bottom)

// Custom header
#set page(header: [
  _Book Title_
  #h(1fr)
  #text(9pt)[Author Name]
])

// Custom footer with page number
#set page(footer: context [
  #h(1fr)
  #counter(page).display("1")
  #h(1fr)
])

// Alternating left/right headers (odd/even pages)
#set page(header: context {
  let page-num = counter(page).get().first()
  if calc.odd(page-num) {
    align(right)[_Chapter Title_ — #page-num]
  } else {
    align(left)[#page-num — _Book Title_]
  }
})

// Header with current chapter title (from headings)
#set page(header: context {
  let headings = query(selector(heading.where(level: 1)).before(here()))
  let current-chapter = if headings.len() > 0 {
    headings.last().body
  } else {
    []
  }
  text(9pt)[#current-chapter #h(1fr) #counter(page).display()]
})

// Header/footer offset control
#set page(header-ascent: 30%)     // raise header into margin
#set page(footer-descent: 30%)    // lower footer into margin
```

### 2.7 Different Page Styles

```typst
// Skip header on first page
#set page(header: context {
  if counter(page).get().first() > 1 [
    _Running Header_
    #h(1fr)
    Page #counter(page).display()
  ]
})

// One-off different page (returns to previous settings after)
#page(flipped: true, columns: 1, margin: 1cm)[
  = Wide Landscape Table
  #table(columns: 8 * (1fr,), ..range(32).map(str))
]

// Reset page counter for new section
#counter(page).update(1)

// Force odd/even page start
#pagebreak(to: "odd")   // next content starts on odd page
#pagebreak(to: "even")  // next content starts on even page
#pagebreak(weak: true)  // skip if page already empty
```

### 2.8 Background Elements

```typst
// Solid background color
#set page(fill: rgb("#f5f0eb"))

// Background content (behind body)
#set page(background: [
  #place(center + horizon)[
    #text(60pt, fill: luma(95%))[CONFIDENTIAL]
  ]
])

// Background image
#set page(background: [
  #place(top + left)[
    #image("watermark.png", width: 100%, height: 100%, fit: "cover")
  ]
])

// Foreground overlay (in front of body)
#set page(foreground: [
  #place(bottom + right, dx: -1cm, dy: -1cm)[
    #text(6pt, fill: gray)[v1.0]
  ]
])

// Decorative page border
#set page(background: {
  rect(
    width: 100%, height: 100%,
    stroke: (
      paint: luma(80%),
      thickness: 0.5pt,
      dash: "dashed",
    ),
    radius: 0pt,
  )
})
```

### 2.9 Context for Querying Position/Page

```typst
// Get current page number
#context counter(page).get().first()

// Display formatted page number
#context counter(page).display("1")
#context counter(page).display("i")  // roman

// Get total pages
#context counter(page).final().first()

// "Page X of Y"
#context [Page #counter(page).display() of #counter(page).final().first()]

// Get physical position on page
#context {
  let pos = here().position()
  [x: #pos.x, y: #pos.y]
}

// Query headings before current position
#context {
  let prev = query(selector(heading).before(here()))
  if prev.len() > 0 [Last heading: #prev.last().body]
}

// Query all level-1 headings
#context {
  let chapters = query(heading.where(level: 1))
  [Total chapters: #chapters.len()]
}
```

---

## 3. Image Handling

### 3.1 The `image()` Function

```typst
// Basic image
#image("photo.jpg")

// With dimensions
#image("photo.jpg", width: 80%)
#image("photo.jpg", width: 10cm, height: 6cm)

// Fit modes
#image("photo.jpg", width: 100%, height: 5cm, fit: "cover")    // crop to fill
#image("photo.jpg", width: 100%, height: 5cm, fit: "contain")  // letterbox
#image("photo.jpg", width: 100%, height: 5cm, fit: "stretch")  // distort

// Alt text for accessibility
#image("photo.jpg", alt: "A sunset over the ocean")

// Supported formats: png, jpg, gif, svg, pdf, webp

// Scaling mode for pixel art
#image("pixel-art.png", scaling: "pixelated")   // nearest neighbor
#image("photo.jpg", scaling: "smooth")          // bilinear (default)

// Specific page from PDF
#image("document.pdf", page: 3)
```

Parameters: `source` (path or bytes), `format`, `width`, `height`, `alt`, `fit`, `page`, `scaling`, `icc`.

### 3.2 Positioning Images on a Page

```typst
// Absolute position on page
#place(top + right, dx: -1cm, dy: 1cm)[
  #image("logo.png", width: 3cm)
]

// Full-page background image
#set page(background: place(
  center + horizon,
  image("bg.jpg", width: 100%, height: 100%, fit: "cover"),
))

// Floating image at top of page
#place(top + right, float: true, clearance: 1em)[
  #image("sidebar.png", width: 40%)
]

// Centered image with specific offset
#place(center, dy: 5cm)[
  #image("diagram.svg", width: 60%)
]
```

### 3.3 Text Wrapping Around Images

Typst does NOT natively support text wrapping (runaround) as of the current version. Workaround using `place()` with `float: true`:

```typst
// Simulated text wrap using float
#place(right, float: true, clearance: 1em)[
  #pad(left: 1em)[
    #image("photo.jpg", width: 40%)
  ]
]
Text flows here and the image floats to the right.
More text continues below...

// Alternative: use grid for side-by-side layout
#grid(
  columns: (60%, 40%),
  gutter: 1em,
  [Text content on the left side that takes up 60% of the width...],
  image("photo.jpg", width: 100%),
)
```

**Gotcha**: True text wrapping (text flowing around an image contour) is not supported. Use `place(float: true)` or `grid()` as alternatives.

### 3.4 Image Borders, Shadows, Rounded Corners

```typst
// Image with rounded corners (clip via block)
#block(
  clip: true,
  radius: 8pt,
)[#image("photo.jpg", width: 100%)]

// Image with border
#block(
  stroke: 2pt + gray,
  radius: 4pt,
  inset: 0pt,
  clip: true,
)[#image("photo.jpg", width: 10cm)]

// Shadow effect (simulated with offset rect)
#let shadow-image(path, width: 100%) = {
  let shadow-offset = 3pt
  block[
    #place(dx: shadow-offset, dy: shadow-offset)[
      #rect(width: width, height: auto, fill: luma(80%), radius: 4pt)
    ]
    #block(
      stroke: 0.5pt + luma(70%),
      radius: 4pt,
      clip: true,
    )[#image(path, width: width)]
  ]
}

// Image with colored border and padding
#block(
  stroke: 3pt + blue,
  radius: 8pt,
  inset: 4pt,
  clip: true,
)[#image("photo.jpg", width: 8cm)]
```

**Gotcha**: Typst has no native `box-shadow`. Use layered `place()` with offset rectangles as a workaround.

### 3.5 Text Overlay on Images

```typst
// Text overlaid on an image
#block(width: 100%)[
  #image("hero.jpg", width: 100%, fit: "cover")
  #place(bottom + left, dx: 1em, dy: -1em)[
    #block(
      fill: rgba(0, 0, 0, 70%),
      inset: 10pt,
      radius: 4pt,
    )[
      #text(fill: white, weight: "bold", size: 18pt)[Chapter One]
    ]
  ]
]

// Centered text on background image
#block(width: 100%, height: 200pt, clip: true)[
  #image("banner.jpg", width: 100%, height: 100%, fit: "cover")
  #place(center + horizon)[
    #text(fill: white, size: 24pt, weight: "bold")[
      Welcome to the Story
    ]
  ]
]
```

### 3.6 Grid Layouts for Multiple Images

```typst
// 2x2 image grid
#grid(
  columns: (1fr, 1fr),
  gutter: 8pt,
  image("img1.jpg"),
  image("img2.jpg"),
  image("img3.jpg"),
  image("img4.jpg"),
)

// 3-column gallery with captions
#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 12pt,
  figure(image("a.jpg"), caption: [Scene 1]),
  figure(image("b.jpg"), caption: [Scene 2]),
  figure(image("c.jpg"), caption: [Scene 3]),
)

// Mixed-size image layout
#grid(
  columns: (2fr, 1fr),
  rows: (auto, auto),
  gutter: 8pt,
  grid.cell(rowspan: 2)[#image("hero.jpg", width: 100%, height: 100%, fit: "cover")],
  image("thumb1.jpg"),
  image("thumb2.jpg"),
)
```

---

## 4. Boxes, Blocks & Decorative Elements

### 4.1 `box()` vs `block()` — Key Differences

| Feature | `box()` | `block()` |
|---------|---------|-----------|
| **Level** | Inline | Block |
| **In paragraphs** | Yes — integrates into text flow | No — always a separate block |
| **Page breaks** | Cannot break across pages | Can break with `breakable: true` |
| **Fractional width** | Supports `1fr` in paragraphs | Does not support `1fr` |
| **Use case** | Inline containers, gradient text | Containers, cards, sections |

```typst
// Box — inline, sits within text
This has a #box(fill: yellow, inset: 3pt)[highlighted box] inline.

// Block — block-level, separate paragraph
#block(
  fill: luma(240),
  inset: 12pt,
  radius: 4pt,
  width: 100%,
)[This is a block-level container.]
```

### 4.2 Custom Backgrounds, Borders, Rounded Corners

```typst
// Block with all styling options
#block(
  fill: rgb("#f0f4ff"),          // background color
  stroke: (
    paint: rgb("#3b82f6"),       // border color
    thickness: 1.5pt,
    dash: "solid",               // or "dashed", "dotted", etc.
    cap: "round",
    join: "round",
  ),
  radius: 8pt,                   // all corners
  inset: 16pt,                   // inner padding
  outset: 0pt,                   // expand without affecting layout
  width: 100%,
)[Content inside the styled block.]

// Per-side borders
#block(
  stroke: (
    left: 3pt + blue,
    rest: 0.5pt + luma(80%),
  ),
  inset: (left: 12pt, rest: 8pt),
  radius: (right: 4pt),
)[Left-bordered callout block]

// Per-corner radius
#block(
  radius: (
    top-left: 12pt,
    top-right: 12pt,
    bottom-left: 0pt,
    bottom-right: 0pt,
  ),
  fill: navy,
  inset: 10pt,
)[#text(fill: white)[Top-rounded card header]]
```

### 4.3 Shadow Effects (Workarounds)

```typst
// Simple drop shadow simulation
#let shadow-block(body, shadow-color: luma(85%), offset: 3pt) = {
  block[
    #place(dx: offset, dy: offset)[
      #block(
        width: 100%,
        fill: shadow-color,
        radius: 8pt,
        inset: 12pt,
      )[#hide(body)]
    ]
    #block(
      width: 100%,
      fill: white,
      stroke: 0.5pt + luma(90%),
      radius: 8pt,
      inset: 12pt,
    )[#body]
  ]
}

#shadow-block[This block has a shadow effect.]
```

### 4.4 Shapes: `rect()`, `circle()`, `ellipse()`, `polygon()`

```typst
// Rectangle
#rect(width: 100pt, height: 50pt, fill: blue.lighten(80%), stroke: blue)
#rect(
  width: 100%,
  fill: gradient.linear(blue, purple),
  radius: 8pt,
  inset: 12pt,
)[Content inside rectangle]

// Circle
#circle(radius: 30pt, fill: red.lighten(80%), stroke: red)
#circle(width: 60pt, fill: teal)[#align(center + horizon)[A]]  // with content

// Ellipse
#ellipse(width: 100pt, height: 60pt, fill: green.lighten(80%))
#ellipse(width: 80pt, fill: orange)[#align(center + horizon)[Text]]

// Regular polygon
#polygon.regular(
  size: 40pt,
  vertices: 6,     // hexagon
  fill: purple.lighten(80%),
  stroke: purple,
)

// Custom polygon
#polygon(
  fill: blue.lighten(80%),
  stroke: blue,
  (0pt, 50pt),
  (25pt, 0pt),
  (50pt, 50pt),
)
```

### 4.5 Lines and Paths

```typst
// Simple line
#line(length: 100%)
#line(length: 100%, stroke: 2pt + red)
#line(length: 100%, stroke: (dash: "dashed", paint: gray))

// Angled line
#line(length: 4cm, angle: 45deg, stroke: 2pt + blue)

// Line from point to point
#line(start: (0%, 0%), end: (100%, 50%))

// Decorative separator
#align(center)[
  #line(length: 40%, stroke: (
    paint: gradient.linear(white, gray, white),
    thickness: 1pt,
  ))
]

// Bezier path (deprecated — use curve() instead)
#path(
  fill: blue.lighten(80%),
  stroke: blue,
  closed: true,
  (0pt, 50pt),
  (100pt, 50pt),
  ((50pt, 0pt), (40pt, 0pt)),
)

// Modern curve() — replacement for path()
#curve(
  fill: blue.lighten(80%),
  stroke: blue,
  curve.move((0pt, 50pt)),
  curve.line((100pt, 50pt)),
  curve.cubic(none, (90pt, 0pt), (50pt, 0pt)),
  curve.close(),
)
```

**Stroke type reference**:

```typst
// Full stroke specification
#let my-stroke = stroke(
  paint: blue,              // color, gradient, or tiling
  thickness: 2pt,
  cap: "round",             // "butt" (default), "round", "square"
  join: "round",            // "miter" (default), "round", "bevel"
  dash: "dashed",           // see dash patterns below
  miter-limit: 4.0,         // when miter becomes bevel
)

// Dash patterns:
// "solid", "dotted", "densely-dotted", "loosely-dotted"
// "dashed", "densely-dashed", "loosely-dashed"
// "dash-dotted", "densely-dash-dotted", "loosely-dash-dotted"

// Custom dash array
#line(length: 100%, stroke: (
  dash: (5pt, 3pt, 1pt, 3pt),  // dash, gap, dot, gap
  paint: red,
))

// Custom dash with phase offset
#line(length: 100%, stroke: (
  dash: (array: (5pt, 3pt), phase: 2pt),
  paint: blue,
))
```

### 4.6 Gradient Fills

```typst
// Linear gradient on shapes
#rect(
  width: 100%,
  height: 40pt,
  fill: gradient.linear(blue, purple),
)

// Gradient with angle (clockwise: 0°=left→right, 90°=top→bottom)
#rect(
  width: 100%,
  height: 40pt,
  fill: gradient.linear(red, yellow, angle: 90deg),
)

// Radial gradient
#circle(
  radius: 40pt,
  fill: gradient.radial(white, blue, focal-center: (30%, 30%)),
)

// Conic gradient
#circle(
  radius: 40pt,
  fill: gradient.conic(..color.map.rainbow),
)

// Gradient with specific stops
#rect(
  width: 100%,
  height: 30pt,
  fill: gradient.linear(
    (blue, 0%),
    (white, 50%),
    (red, 100%),
  ),
)

// Sharp (stepped) gradient
#rect(
  width: 100%,
  height: 30pt,
  fill: gradient.linear(blue, red).sharp(5),  // 5 discrete steps
)

// Repeating gradient
#rect(
  width: 100%,
  height: 30pt,
  fill: gradient.linear(blue, red).repeat(3, mirror: true),
)
```

---

## 5. Tables

### 5.1 Basic Table

```typst
#table(
  columns: 3,
  [Name], [Age], [City],
  [Alice], [30], [Seoul],
  [Bob], [25], [Busan],
)

// With explicit column widths
#table(
  columns: (2fr, 1fr, 1fr),
  [Name], [Age], [City],
  [Alice], [30], [Seoul],
)

// Fixed-width columns
#table(
  columns: (100pt, 50pt, auto),
  [Name], [Age], [City],
  [Alice], [30], [Seoul],
)
```

### 5.2 Styled Tables: Alternating Rows, Header Styles

```typst
// Alternating row colors
#table(
  columns: 3,
  fill: (_, y) => if calc.odd(y) { luma(240) } else { white },
  [Name], [Age], [City],
  [Alice], [30], [Seoul],
  [Bob], [25], [Busan],
  [Charlie], [35], [Incheon],
)

// Alternating column colors
#table(
  columns: 3,
  fill: (x, _) => if calc.odd(x) { luma(240) } else { white },
  [A], [B], [C],
  [1], [2], [3],
)

// Header with different style
#table(
  columns: 3,
  fill: (_, y) => if y == 0 { rgb("#2563eb") } else if calc.odd(y) { luma(245) },
  table.header(
    table.cell(fill: rgb("#2563eb"))[#text(fill: white, weight: "bold")[Name]],
    table.cell(fill: rgb("#2563eb"))[#text(fill: white, weight: "bold")[Age]],
    table.cell(fill: rgb("#2563eb"))[#text(fill: white, weight: "bold")[City]],
  ),
  [Alice], [30], [Seoul],
  [Bob], [25], [Busan],
)

// Repeating header across pages
#table(
  columns: 3,
  table.header(repeat: true,
    [*Name*], [*Age*], [*City*],
  ),
  ..range(50).map(i => ([Person #i], [#(20 + i)], [City #i])).flatten(),
)
```

### 5.3 Cell Spanning

```typst
// Column span
#table(
  columns: 3,
  table.cell(colspan: 3)[#align(center)[*Full-Width Header*]],
  [A], [B], [C],
  [1], [2], [3],
)

// Row span
#table(
  columns: 3,
  table.cell(rowspan: 2)[*Merged*], [B1], [C1],
  [B2], [C2],
  [A3], [B3], [C3],
)

// Combined spanning with position
#table(
  columns: 4,
  table.cell(x: 0, y: 0, colspan: 2, rowspan: 2, fill: blue.lighten(80%))[
    #align(center + horizon)[Big Cell]
  ],
  [C], [D],
  [C2], [D2],
  [A3], [B3], [C3], [D3],
)
```

### 5.4 Table Borders and Separators

```typst
// No borders
#table(
  columns: 3,
  stroke: none,
  [A], [B], [C],
)

// Custom stroke
#table(
  columns: 3,
  stroke: 0.5pt + gray,
  [A], [B], [C],
)

// Horizontal lines only
#table(
  columns: 3,
  stroke: (x, y) => (
    bottom: 0.5pt + gray,
    rest: none,
  ),
  [A], [B], [C],
  [1], [2], [3],
)

// Horizontal separators with hline
#table(
  columns: 3,
  stroke: none,
  table.hline(stroke: 2pt + black),
  [*Name*], [*Age*], [*City*],
  table.hline(stroke: 1pt + black),
  [Alice], [30], [Seoul],
  [Bob], [25], [Busan],
  table.hline(stroke: 2pt + black),
)

// Vertical separators
#table(
  columns: 3,
  stroke: none,
  table.vline(x: 1, stroke: 0.5pt + gray),
  table.vline(x: 2, stroke: 0.5pt + gray),
  [A], [B], [C],
  [1], [2], [3],
)

// Per-cell stroke override
#table(
  columns: 2,
  table.cell(stroke: 2pt + red)[Important], [Normal],
)
```

### 5.5 Custom Table Alignment & Inset

```typst
// Column-specific alignment
#table(
  columns: 3,
  align: (left, center, right),
  [Left], [Center], [Right],
  [Text], [123], [#sym.checkmark],
)

// Function-based alignment
#table(
  columns: 3,
  align: (x, _) => if x == 0 { left } else { center },
  [Name], [Score], [Grade],
  [Alice], [95], [A],
)

// Custom inset (padding)
#table(
  columns: 2,
  inset: 10pt,                         // uniform
  inset: (x: 12pt, y: 8pt),           // horizontal/vertical
  [A], [B],
)
```

---

## 6. Lists & Enumerations

### 6.1 Bullet Lists (Unordered)

```typst
// Basic bullet list (markup syntax)
- Item one
- Item two
  - Nested item
    - Deeper nested

// Custom bullet marker
#set list(marker: [--])
- Dashed item

// Array of markers for different nesting levels
#set list(marker: ([•], [◦], [▪], [▹]))
- Level 1
  - Level 2
    - Level 3

// Function-based marker (receives nesting depth)
#set list(marker: n => text(fill: blue)[#("●", "○", "■").at(n)])

// List spacing
#set list(
  indent: 1em,         // indentation per level
  body-indent: 0.5em,  // gap between marker and text
  spacing: auto,       // space between items
  tight: true,         // compact spacing
)
```

Default markers: `([•], [‣], [–])` for levels 0, 1, 2.

### 6.2 Numbered Lists (Enumerations)

```typst
// Basic numbered list (markup syntax)
+ First item
+ Second item
  + Nested item

// Custom numbering patterns
#set enum(numbering: "1.")     // 1. 2. 3. (default)
#set enum(numbering: "a)")     // a) b) c)
#set enum(numbering: "A.")     // A. B. C.
#set enum(numbering: "i.")     // i. ii. iii.
#set enum(numbering: "I.")     // I. II. III.
#set enum(numbering: "(1)")    // (1) (2) (3)
#set enum(numbering: "1.a)")   // multi-level: 1.a) 1.b) 2.a)

// Korean numbering (가, 나, 다...)
#set enum(numbering: "가.")

// CJK numbering
#set enum(numbering: "一.")    // 一. 二. 三.

// Circled numbers
#set enum(numbering: "①")     // ① ② ③

// Custom function
#set enum(numbering: n => [Step #n:])

// Start at specific number
#enum(start: 5)[Fifth][Sixth][Seventh]

// Reversed numbering
#set enum(reversed: true)

// Full numbering (show parent levels)
#set enum(full: true, numbering: "1.1)")

// Number alignment
#set enum(number-align: end + top)  // right-align numbers

// Spacing control
#set enum(
  indent: 1em,
  body-indent: 0.5em,
  spacing: 0.8em,
  tight: true,
)
```

### 6.3 Definition/Term Lists

```typst
// Basic term list (markup syntax)
/ Term: Description of the term.
/ Another: Its description.

// Customized separator
#set terms(separator: [: ])

// Spacing and indentation
#set terms(
  indent: 0pt,
  hanging-indent: 2em,
  spacing: auto,
  tight: true,
)
```

### 6.4 Custom List Markers (Icons, Colored Bullets)

```typst
// Colored bullet markers
#set list(marker: text(fill: red)[●])

// Emoji markers
#set list(marker: [✦])

// Different colors per level
#set list(marker: n => {
  let colors = (red, blue, green)
  let symbols = ("●", "◆", "▸")
  text(fill: colors.at(n))[#symbols.at(n)]
})

// Checkbox-style list
#let check = text(fill: green)[☑]
#let uncheck = text(fill: gray)[☐]
#list(marker: check)[Done task]
#list(marker: uncheck)[Pending task]
```

---

## 7. Color & Theming

### 7.1 Color Definitions

```typst
// RGB (0-255 integers, ratios, or hex)
#let primary = rgb("#2563eb")
#let primary = rgb(37, 99, 235)
#let primary = rgb(14.5%, 38.8%, 92.2%)
#let with-alpha = rgb("#2563eb80")  // 50% opacity via hex
#let with-alpha = rgb(37, 99, 235, 128)  // alpha 0-255

// HSL
#let warm = color.hsl(30deg, 80%, 50%)

// HSV
#let warm2 = color.hsv(30deg, 80%, 90%)

// Grayscale (luma)
#let light-gray = luma(240)        // 0=black, 255=white
#let mid-gray = luma(50%)

// CMYK (for print)
#let print-blue = cmyk(100%, 50%, 0%, 0%)

// Perceptual color spaces
#let perceptual = oklab(70%, -0.1, 0.08)
#let polar = oklch(70%, 0.15, 200deg)

// Linear RGB (no gamma)
#let linear = color.linear-rgb(50%, 20%, 80%)

// 16 named colors
// black, gray, silver, white, navy, blue, aqua, teal,
// eastern, purple, fuchsia, maroon, red, orange, yellow,
// olive, green, lime
```

### 7.2 Gradient Support

```typst
// Linear gradient
#let g1 = gradient.linear(blue, purple)
#let g2 = gradient.linear(blue, purple, angle: 90deg)
#let g3 = gradient.linear(
  (blue, 0%),
  (white, 50%),
  (red, 100%),
  space: oklab,          // interpolation color space
)

// Radial gradient
#let g4 = gradient.radial(
  white, blue,
  center: (50%, 50%),    // gradient center
  radius: 50%,           // end circle radius
  focal-center: (30%, 30%),  // focal point
  focal-radius: 5%,      // focal circle radius
)

// Conic gradient
#let g5 = gradient.conic(
  red, yellow, green, blue, red,
  center: (50%, 50%),
  angle: 0deg,
)

// Preset color maps
#let g6 = gradient.linear(..color.map.viridis)
// Available maps: turbo, cividis, rainbow, spectral, viridis,
// inferno, magma, plasma, rocket, mako, vlag, icefire, flare, crest

// Gradient methods
#let stepped = gradient.linear(blue, red).sharp(5)        // 5 discrete bands
#let repeated = gradient.linear(blue, red).repeat(3)      // repeat 3x
#let mirrored = gradient.linear(blue, red).repeat(3, mirror: true)
#let sampled = gradient.linear(blue, red).sample(50%)     // get color at 50%
```

### 7.3 Opacity & Transparency

```typst
// Via hex alpha
#let transparent-blue = rgb("#2563eb80")  // ~50% opacity

// Via method
#let semi = blue.transparentize(50%)  // reduce opacity by 50%
#let opaque = semi.opacify(30%)       // increase opacity by 30%

// In fill usage
#rect(fill: blue.transparentize(70%))  // very transparent blue
```

### 7.4 Color Manipulation

```typst
#let base = blue

#base.lighten(30%)        // lighter
#base.darken(20%)         // darker
#base.saturate(50%)       // more vivid
#base.desaturate(50%)     // more muted
#base.negate()            // complementary color
#base.rotate(120deg)      // shift hue by 120°

// Mix colors
#color.mix(red, blue)                    // 50/50 mix
#color.mix((red, 70%), (blue, 30%))      // weighted mix
#color.mix(red, blue, space: oklch)      // mix in specific color space

// Get components
#base.components()        // array of RGBA values
#base.to-hex()            // hex string
#base.space()             // color space constructor
```

### 7.5 Consistent Color Theme

```typst
// Define a theme
#let theme = (
  primary: rgb("#2563eb"),
  secondary: rgb("#7c3aed"),
  accent: rgb("#f59e0b"),
  success: rgb("#10b981"),
  danger: rgb("#ef4444"),
  warning: rgb("#f59e0b"),
  bg: rgb("#f8fafc"),
  surface: rgb("#ffffff"),
  text-primary: rgb("#0f172a"),
  text-secondary: rgb("#475569"),
  border: rgb("#e2e8f0"),
)

// Usage throughout document
#set text(fill: theme.text-primary)
#set page(fill: theme.bg)

#let card(body) = block(
  fill: theme.surface,
  stroke: 1pt + theme.border,
  radius: 8pt,
  inset: 16pt,
  width: 100%,
)[#body]

#let badge(label, color: theme.primary) = box(
  fill: color.lighten(80%),
  stroke: 0.5pt + color,
  radius: 4pt,
  inset: (x: 6pt, y: 2pt),
)[#text(fill: color, size: 9pt, weight: "medium")[#label]]
```

### 7.6 Tiling Patterns

```typst
// Repeating pattern fill
#let dots-pattern = tiling(
  size: (10pt, 10pt),
  spacing: (0pt, 0pt),
)[#circle(radius: 1.5pt, fill: gray)]

#rect(width: 100%, height: 40pt, fill: dots-pattern)

// Diagonal lines pattern
#let diagonal = tiling(size: (8pt, 8pt))[
  #line(start: (0pt, 0pt), end: (8pt, 8pt), stroke: 0.5pt + gray)
]

#rect(width: 100%, height: 40pt, fill: diagonal)
```

---

## 8. Advanced Layout Techniques

### 8.1 `grid()` for Complex Layouts

```typst
// Basic grid
#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [Left content],
  [Right content],
)

// Complex multi-column layout
#grid(
  columns: (200pt, 1fr),
  rows: (auto, auto),
  gutter: 16pt,
  // Sidebar
  grid.cell(rowspan: 2)[
    #block(fill: luma(245), inset: 12pt, radius: 4pt)[
      = Sidebar
      Navigation here
    ]
  ],
  // Main content
  [= Main Title
   Content paragraph...],
  // Below main
  [= Another Section
   More content...],
)

// Grid with fill and stroke
#grid(
  columns: 3,
  fill: (x, y) => if y == 0 { blue.lighten(80%) },
  stroke: 0.5pt + gray,
  inset: 8pt,
  [*A*], [*B*], [*C*],
  [1], [2], [3],
)

// Repeating headers in grid
#grid(
  columns: 3,
  grid.header(repeat: true,
    [*Col 1*], [*Col 2*], [*Col 3*],
  ),
  ..range(30).map(i => [Item #i]).chunks(3).flatten(),
)
```

### 8.2 `stack()` for Stacking

```typst
// Vertical stack (default: top to bottom)
#stack(
  dir: ttb,
  spacing: 8pt,
  rect(width: 100%, fill: red.lighten(80%))[First],
  rect(width: 100%, fill: blue.lighten(80%))[Second],
  rect(width: 100%, fill: green.lighten(80%))[Third],
)

// Horizontal stack (left to right)
#stack(
  dir: ltr,
  spacing: 8pt,
  rect(width: 50pt, height: 30pt, fill: red),
  rect(width: 50pt, height: 30pt, fill: blue),
  rect(width: 50pt, height: 30pt, fill: green),
)

// With flexible spacing
#stack(
  dir: ttb,
  [Top],
  1fr,       // flexible space
  [Middle],
  2fr,       // twice the flexible space
  [Bottom],
)
```

Direction values: `ttb` (top-to-bottom), `btt`, `ltr` (left-to-right), `rtl`.

### 8.3 `columns()` for Multi-Column Text

```typst
// Two-column text
#columns(2)[
  #lorem(50)
  #colbreak()
  #lorem(50)
]

// Three columns with custom gutter
#columns(3, gutter: 16pt)[
  #lorem(100)
]

// Columns inside a container
#block(width: 100%, fill: luma(245), inset: 12pt, radius: 4pt)[
  #columns(2, gutter: 12pt)[
    Column content with automatic flow...
    #lorem(40)
  ]
]
```

### 8.4 `measure()` for Content Size

```typst
// Measure content dimensions (requires context)
#context {
  let size = measure([Hello World])
  [Width: #size.width, Height: #size.height]
}

// Measure with constrained width
#context {
  let size = measure(width: 200pt, lorem(20))
  [Height at 200pt width: #size.height]
}

// Practical: create a box matching content width
#let auto-width-box(body) = context {
  let size = measure(body)
  block(width: size.width + 16pt, fill: luma(240), inset: 8pt, radius: 4pt)[#body]
}
```

**Gotcha**: `measure()` must be called within a `context` block. Without context, it will error.

### 8.5 `layout()` for Responsive Sizing

```typst
// Get available container width
#layout(size => [
  Available width: #size.width \
  Available height: #size.height
])

// Responsive design: different layout based on width
#layout(size => {
  if size.width > 400pt {
    grid(columns: (1fr, 1fr), gutter: 12pt,
      [Wide: Left], [Wide: Right])
  } else {
    stack(dir: ttb, spacing: 12pt,
      [Narrow: Top], [Narrow: Bottom])
  }
})

// Calculate remaining page height
#block(height: 1fr, layout(size => [
  Remaining height on page: #size.height
]))

// Resolve percentage to absolute length
#layout(size => {
  let half = 50% * size.width
  [Half the page width is #half]
})
```

### 8.6 `pad()` for Padding

```typst
// Uniform padding
#pad(12pt)[Padded content]

// Per-side padding
#pad(left: 2em, right: 1em, top: 0.5em, bottom: 0.5em)[Content]

// Shorthand: horizontal/vertical
#pad(x: 16pt, y: 8pt)[Content]

// Percentage-based padding
#pad(x: 10%)[Content with 10% horizontal padding]
```

### 8.7 Transforms: `rotate()`, `scale()`, `move()`

```typst
// Rotate content
#rotate(45deg)[Tilted text]
#rotate(-90deg)[Sideways]
#rotate(180deg)[Upside down]

// Rotate with reflow (affects layout)
#rotate(90deg, reflow: true)[This takes rotated space]

// Rotate from specific origin
#rotate(15deg, origin: bottom + left)[Pivoted from bottom-left]

// Scale content
#scale(150%)[Larger text]
#scale(x: 200%, y: 100%)[Stretched horizontally]
#scale(x: -100%)[Mirrored horizontally]

// Scale with reflow
#scale(50%, reflow: true)[Half-size with layout adjustment]

// Move content (visual only, no layout change)
#move(dx: 10pt, dy: -5pt)[Shifted content]

// Hide content (keep space)
#hide[Invisible but takes up space]
```

### 8.8 Clipping

```typst
// Clip overflow content in a block
#block(
  width: 100pt,
  height: 50pt,
  clip: true,        // hide overflow
  fill: luma(240),
)[This very long text will be clipped at the block boundaries.]

// Clip for circular image
#block(
  width: 80pt,
  height: 80pt,
  clip: true,
  radius: 40pt,      // perfect circle clip
)[#image("avatar.jpg", width: 80pt, height: 80pt, fit: "cover")]

// Clip in box (inline)
#box(
  width: 50pt,
  height: 50pt,
  clip: true,
  radius: 50%,
)[#image("photo.jpg", width: 50pt, height: 50pt, fit: "cover")]
```

### 8.9 Alignment

```typst
// Horizontal alignment
#align(left)[Left-aligned]
#align(center)[Centered]
#align(right)[Right-aligned]

// Vertical alignment
#align(top)[Top]
#align(horizon)[Vertically centered]
#align(bottom)[Bottom]

// Combined 2D alignment
#align(center + horizon)[Perfectly centered]
#align(right + bottom)[Bottom-right corner]
#align(start + top)[Start of line, top]

// Horizontal spacing (push content apart)
Left #h(1fr) Right
A #h(1fr) B #h(1fr) C  // evenly spaced
```

---

## 9. Book-Specific Features

### 9.1 Table of Contents

```typst
// Basic table of contents
#outline()

// Customized TOC
#outline(
  title: [Table of Contents],  // or auto for language-appropriate
  depth: 3,                     // max heading level to include
  indent: auto,                 // auto-indent by level
  fill: repeat(body: [.], gap: 0.15em),  // dot leaders
)

// Custom indent per level
#outline(indent: n => n * 1.5em)

// Without dot leaders
#outline(fill: none)

// Custom fill character
#outline(fill: line(length: 100%, stroke: 0.5pt + gray))

// List of Figures
#outline(
  title: [List of Figures],
  target: figure.where(kind: image),
)

// List of Tables
#outline(
  title: [List of Tables],
  target: figure.where(kind: table),
)
```

### 9.2 Chapter Numbering

```typst
// Basic heading numbering
#set heading(numbering: "1.")

// Multi-level numbering: 1.1, 1.1.1
#set heading(numbering: "1.1.1")

// Roman numerals for chapters
#set heading(numbering: "I.")

// Mixed numbering: Chapter I, Section 1.1
#set heading(numbering: (..nums) => {
  let level = nums.pos().len()
  if level == 1 {
    [Chapter #numbering("I", ..nums.pos())]
  } else {
    numbering("1.1", ..nums.pos())
  }
})

// Supplement for references ("Chapter 1" instead of "Section 1")
#set heading(supplement: [Chapter])

// Custom chapter title page
#let chapter(title) = {
  pagebreak(to: "odd")
  v(3cm)
  align(center)[
    #text(14pt, fill: gray)[Chapter #context counter(heading).display("I")]
    #v(1em)
    #text(28pt, weight: "bold")[#title]
    #v(0.5em)
    #line(length: 30%, stroke: 1pt + gray)
  ]
  v(2cm)
}
```

### 9.3 Cross-References

```typst
// Create a label on any element
= Introduction <intro>

// Reference it
See @intro for details.

// Custom supplement text
See @intro[the introduction].

// Reference a figure
#figure(
  image("chart.png", width: 80%),
  caption: [Sales data for 2024],
) <sales-chart>

As shown in @sales-chart, ...

// Page reference
See #ref(<intro>, form: "page") for the introduction.

// Reference with custom supplement
#set heading(supplement: [Chapter])
See @intro  // renders as "Chapter 1"
```

### 9.4 Footnotes and Endnotes

```typst
// Basic footnote
This is important.#footnote[Source: Author, 2024.]

// Custom numbering
#set footnote(numbering: "*")    // *, †, ‡, §, ¶, ‖
#set footnote(numbering: "1")    // 1, 2, 3 (default)
#set footnote(numbering: "i")    // i, ii, iii

// Customize footnote display
#show footnote.entry: set text(size: 8pt)

// Customize separator line
#set footnote.entry(
  separator: line(length: 30%, stroke: 0.5pt + gray),
  clearance: 1em,      // space between body and separator
  gap: 0.5em,          // space between footnotes
  indent: 1em,         // footnote text indent
)

// Re-reference same footnote
First reference.#footnote[Shared note.] <shared>
Second reference.#footnote(<shared>)
```

**Endnotes**: Typst does not have built-in endnote support. Workaround: collect notes in state and display at chapter/document end.

### 9.5 Bibliography

```typst
// Bibliography with BibLaTeX file
#bibliography("refs.bib")

// With Hayagriva YAML file
#bibliography("refs.yaml")

// Multiple source files
#bibliography(("refs.bib", "more-refs.yaml"))

// Customized bibliography
#bibliography(
  "refs.bib",
  title: [References],
  full: false,           // only cited works (true = all works)
  style: "ieee",         // built-in styles: ieee, apa, chicago-author-date,
                         // chicago-notes, mla, harvard, vancouver
)

// Custom CSL style
#bibliography("refs.bib", style: "custom-style.csl")

// Citation in text
@author2024           // standard citation
@author2024[p. 42]   // with page number
#cite(<author2024>)   // function form
```

**Hayagriva YAML example** (`refs.yaml`):

```yaml
author2024:
  type: article
  title: "Article Title"
  author: ["First Author", "Second Author"]
  date: 2024
  parent:
    type: periodical
    title: "Journal Name"
  page-range: 1-15
```

### 9.6 Figures

```typst
// Image figure
#figure(
  image("photo.jpg", width: 80%),
  caption: [A beautiful landscape.],
) <fig-landscape>

// Table figure
#figure(
  table(columns: 3, [A], [B], [C], [1], [2], [3]),
  caption: [Sample data.],
)

// Floating figure
#figure(
  placement: auto,    // auto, top, or bottom
  scope: "column",    // "column" or "parent" (full width)
  image("chart.png", width: 90%),
  caption: [Results overview.],
)

// Custom figure kind
#figure(
  rect[Algorithm pseudocode...],
  kind: "algorithm",
  supplement: [Algorithm],
  caption: [Sorting algorithm.],
)

// Custom caption position (above figure)
#show figure.where(kind: table): set figure.caption(position: top)

// Figure numbering
#set figure(numbering: "1")         // 1, 2, 3
#set figure(numbering: "I")         // I, II, III
#set figure(numbering: "1.1")       // per-chapter: 1.1, 1.2, 2.1

// Gap between body and caption
#set figure(gap: 1em)

// Include in outline
#set figure(outlined: true)         // appears in list of figures
```

### 9.7 Book Template Structure

```typst
// Complete book template
#let book(
  title: [],
  author: [],
  date: none,
  body,
) = {
  // ---- Cover Page ----
  set page(margin: 0pt)
  page[
    #place(center + horizon)[
      #text(36pt, weight: "bold")[#title]
      #v(1em)
      #text(18pt)[#author]
      #v(0.5em)
      #if date != none { text(14pt, fill: gray)[#date] }
    ]
  ]

  // ---- Front Matter (roman numerals) ----
  set page(
    margin: (inside: 2.5cm, outside: 2cm, y: 2.5cm),
    numbering: "i",
    number-align: center + bottom,
  )
  counter(page).update(1)

  // Table of Contents
  outline(title: [Contents], depth: 3, indent: auto)
  pagebreak(to: "odd")

  // ---- Body (arabic numerals) ----
  set page(
    numbering: "1",
    header: context {
      let page-num = counter(page).get().first()
      let chapters = query(selector(heading.where(level: 1)).before(here()))
      let chapter-title = if chapters.len() > 0 { chapters.last().body } else { [] }
      if page-num > 1 {
        if calc.odd(page-num) {
          text(9pt)[#h(1fr) #emph(chapter-title)]
        } else {
          text(9pt)[#title #h(1fr)]
        }
        v(-4pt)
        line(length: 100%, stroke: 0.3pt + gray)
      }
    },
  )
  counter(page).update(1)

  // Typography
  set text(font: ("Noto Serif KR", "Noto Serif"), size: 11pt, lang: "ko")
  set par(justify: true, first-line-indent: 1em, leading: 0.8em)

  // Heading styles
  set heading(numbering: "1.1.1")
  show heading.where(level: 1): it => {
    pagebreak(to: "odd")
    v(3cm)
    text(12pt, fill: gray)[Chapter #counter(heading).display("1")]
    v(0.5em)
    text(24pt, weight: "bold")[#it.body]
    v(0.3em)
    line(length: 30%, stroke: 1pt + gray)
    v(2cm)
  }

  body
}

// Usage
#show: book.with(
  title: [My Book Title],
  author: [Author Name],
  date: [2024],
)

= First Chapter
#lorem(100)

== Section One
#lorem(50)
```

### 9.8 Counters for Chapter/Page Management

```typst
// Page counter
#context counter(page).display()          // current page
#context counter(page).display("1")       // arabic
#context counter(page).display("i")       // roman
#context counter(page).final().first()    // total pages

// Reset page counter
#counter(page).update(1)

// Heading counter
#context counter(heading).display()       // current heading number
#context counter(heading).display("1.1")  // formatted

// Custom counter
#let example-counter = counter("example")
#example-counter.step()
#context [Example #example-counter.display("1"):]

// Figure counter
#context counter(figure).display()
```

---

## 10. Korean/CJK-Specific

### 10.1 Font Fallback for Mixed Korean/English

```typst
// Primary approach: font array with fallback
#set text(
  font: ("Noto Serif KR", "Noto Serif"),
  lang: "ko",
)

// Typst tries fonts in order — first font with matching glyph wins
// Korean glyphs: found in "Noto Serif KR"
// Latin glyphs: found in either font
// Symbols: fallback continues through the list

// Multiple fallbacks
#set text(font: (
  "Pretendard",       // Korean UI font
  "Inter",            // Latin sans-serif
  "Noto Sans KR",     // Korean fallback
  "Noto Sans",        // final Latin fallback
))

// Disable last-resort fallback (strict mode)
#set text(fallback: false)  // will show tofu if glyph not found

// Different fonts for headings vs body
#set text(font: "Noto Serif KR")
#show heading: set text(font: "Pretendard")
```

**Gotcha**: Font names are case-insensitive and matched against installed system fonts. Make sure Korean fonts are installed on the system or use `typst fonts --font-path` to specify a directory.

### 10.2 CJK-Latin Spacing

```typst
// Automatic spacing between CJK and Latin characters (default: auto)
#set text(cjk-latin-spacing: auto)

// Example: "한글과 English" gets automatic inter-script spacing
// The auto setting inserts appropriate gaps at CJK/Latin boundaries

// Disable automatic spacing
#set text(cjk-latin-spacing: none)
```

### 10.3 Line Breaking Rules

```typst
// Set Korean language for correct line breaking
#set text(lang: "ko")

// Korean line breaking works at syllable boundaries
// Typst automatically applies CJK line-breaking rules:
// - Breaks between syllable blocks (음절 단위)
// - Prevents certain punctuation at line start (kinsoku shori)
// - Keeps opening brackets with following character
// - Keeps closing brackets/punctuation with preceding character

// Justification with Korean text
#set par(justify: true)
#set text(lang: "ko")
// Justified Korean text distributes space evenly between characters
```

**Gotcha**: Korean hyphenation is fundamentally different from Western hyphenation. Korean breaks between syllable blocks, not within them. Setting `lang: "ko"` ensures this behavior.

### 10.4 Character Spacing Adjustments

```typst
// Tracking (inter-character spacing)
#set text(tracking: 0pt)       // normal (default)
#set text(tracking: 1pt)       // loose — useful for headings
#set text(tracking: -0.3pt)    // tight

// For Korean body text, tracking: 0pt or slightly negative works well
// For Korean headings, 0.5pt-1pt tracking can improve readability

// Word spacing (mainly affects spaces between Korean words)
#set text(spacing: 100%)       // default
#set text(spacing: 120%)       // more spacious

// CJK-Latin auto spacing (inserts thin space at boundaries)
#set text(cjk-latin-spacing: auto)
```

### 10.5 Vertical Text

Typst does NOT natively support vertical text layout (tate-gumi / 세로쓰기) as of the current version. Workaround for decorative vertical text:

```typst
// Simulated vertical text using rotation
#rotate(-90deg, reflow: true)[세로 텍스트]

// Manual vertical layout using stack
#let vertical-text(content) = {
  let chars = str(content).clusters()
  stack(dir: ttb, spacing: 0.2em, ..chars.map(c => [#c]))
}

#vertical-text("세로쓰기")
```

**Gotcha**: True vertical typesetting with proper CJK vertical metrics, rotated Latin characters, and vertical punctuation is not yet supported. The workarounds above are for decorative use only.

### 10.6 Korean Smart Quotes

```typst
// Korean quotation marks auto-selected with lang: "ko"
#set text(lang: "ko")
"큰따옴표"  // renders as "큰따옴표" (U+201C / U+201D)
'작은따옴표' // renders as '작은따옴표' (U+2018 / U+2019)

// Korean-style angle quotes (manual)
#set smartquote(quotes: ("「", "」"))
"각괄호"     // renders as 「각괄호」

// Double angle quotes
#set smartquote(quotes: ("『", "』"))
```

### 10.7 Korean Numbering in Lists

```typst
// Korean counter (가, 나, 다, 라, ...)
#set enum(numbering: "가.")

// Korean consonant counter (ㄱ, ㄴ, ㄷ, ㄹ, ...)
#set enum(numbering: "ㄱ.")

// CJK numeral counters
#set enum(numbering: "一.")    // 一, 二, 三, 四, ...
#set enum(numbering: "壹.")    // 壹, 貳, 參, 肆, ... (formal)

// Japanese counters (also available)
#set enum(numbering: "あ.")    // hiragana
#set enum(numbering: "ア.")    // katakana
```

---

## Appendix A: Quick Reference — Common Patterns

### Decorative Chapter Opener

```typst
#let chapter-page(number, title, epigraph: none) = {
  pagebreak(to: "odd")
  v(1fr)
  align(center)[
    #text(72pt, fill: luma(90%), weight: "thin")[#number]
    #v(0.5em)
    #line(length: 20%, stroke: 0.5pt + gray)
    #v(0.5em)
    #text(24pt, weight: "bold")[#title]
    #if epigraph != none {
      v(1em)
      block(width: 60%)[
        #text(10pt, style: "italic", fill: gray)[#epigraph]
      ]
    }
  ]
  v(1fr)
  pagebreak()
}
```

### Callout Box

```typst
#let callout(body, title: none, accent: blue) = {
  block(
    width: 100%,
    stroke: (left: 3pt + accent),
    fill: accent.lighten(95%),
    inset: (left: 16pt, rest: 12pt),
    radius: (right: 4pt),
  )[
    #if title != none {
      text(weight: "bold", fill: accent)[#title]
      parbreak()
    }
    #body
  ]
}

#callout(title: [Note])[This is important information.]
#callout(title: [Warning], accent: orange)[Be careful here.]
```

### Pull Quote

```typst
#let pull-quote(body, attribution: none) = {
  pad(x: 2em, y: 1em)[
    #block(
      inset: (left: 1em),
      stroke: (left: 2pt + gray),
    )[
      #text(size: 14pt, style: "italic", fill: luma(40%))[#body]
      #if attribution != none {
        v(0.5em)
        align(right)[#text(10pt, fill: gray)[--- #attribution]]
      }
    ]
  ]
}
```

### Page Divider / Ornamental Break

```typst
#let divider() = {
  v(1em)
  align(center)[
    #text(12pt, fill: gray)[#sym.diamond.filled #h(1em) #sym.diamond.filled #h(1em) #sym.diamond.filled]
  ]
  v(1em)
}

// Alternative: line-based divider
#let line-divider() = {
  v(1em)
  align(center)[
    #line(length: 30%, stroke: (
      paint: gradient.linear(white, gray, white),
      thickness: 0.5pt,
    ))
  ]
  v(1em)
}
```

### Sidebar Note

```typst
#let sidenote(body) = {
  place(right, dx: 3cm, dy: -1em)[
    #block(width: 4cm)[
      #text(8pt, fill: gray)[#body]
    ]
  ]
}
```

---

## Appendix B: Show Rules Reference

Show rules transform how elements appear throughout a document.

```typst
// Transform all headings
#show heading: it => {
  set text(fill: navy)
  block(below: 1em)[
    #if it.level == 1 {
      text(20pt)[#it.body]
    } else {
      text(14pt)[#it.body]
    }
  ]
}

// Style specific heading levels
#show heading.where(level: 1): set text(size: 24pt, fill: navy)
#show heading.where(level: 2): set text(size: 18pt, fill: blue)
#show heading.where(level: 3): set text(size: 14pt, fill: eastern)

// Style links
#show link: set text(fill: blue)
#show link: underline

// Style raw/code blocks
#show raw.where(block: true): block.with(
  fill: luma(245),
  inset: 10pt,
  radius: 4pt,
  width: 100%,
)

// Style block quotes
#show quote.where(block: true): it => {
  pad(x: 2em)[
    #block(stroke: (left: 2pt + gray), inset: (left: 1em))[
      #text(style: "italic")[#it.body]
      #if it.attribution != none {
        v(0.5em)
        align(right)[--- #it.attribution]
      }
    ]
  ]
}

// Text replacement
#show "Typst": name => text(fill: eastern, weight: "bold")[#name]

// Regex replacement
#show regex("Chapter \d+"): it => text(fill: navy, weight: "bold")[#it]

// Style labeled elements
#show <important>: set text(fill: red, weight: "bold")
This is #[important text] <important>

// Style figures
#show figure: it => {
  block(
    width: 100%,
    stroke: 0.5pt + gray,
    radius: 4pt,
    inset: 8pt,
  )[#it]
}
```

---

## Appendix C: Set Rules Reference

Set rules configure defaults for functions throughout their scope.

```typst
// Text defaults
#set text(font: "Noto Serif KR", size: 11pt, lang: "ko")

// Paragraph defaults
#set par(justify: true, first-line-indent: 1em, leading: 0.8em)

// Page defaults
#set page("a5", margin: (inside: 2cm, outside: 1.5cm, y: 2cm))

// Heading defaults
#set heading(numbering: "1.1.1")

// List/enum defaults
#set list(marker: [•], indent: 1em)
#set enum(numbering: "1.", indent: 1em)

// Figure defaults
#set figure(numbering: "1", gap: 0.8em)

// Table defaults
#set table(stroke: 0.5pt + gray, inset: 8pt)
```

---

## Appendix D: Important Gotchas & Limitations

1. **No text wrapping around images**: Typst lacks native runaround/text-wrap. Use `place(float: true)` or `grid()` workarounds.

2. **No vertical text (tate-gumi)**: CJK vertical typesetting is not natively supported. Use `rotate()` or manual `stack()` as decorative workarounds only.

3. **No native box-shadow**: Simulate with layered `place()` and offset rectangles.

4. **No native endnotes**: Must be manually implemented via `state()`.

5. **Gradient text requires `box()`**: Without an inline container, gradient fills span the parent container.

6. **`measure()` and `counter()` require `context`**: These introspection features must be called within a `context` block.

7. **`first-line-indent` default skips first paragraph**: Use `(amount: 1em, all: true)` to indent every paragraph including the first.

8. **Font fallback is sequential**: Typst tries fonts in array order. Put CJK fonts first if your primary content is Korean.

9. **`place()` without `float: true` overlays content**: It does not push other content aside.

10. **Page settings change = automatic page break**: Changing page configuration mid-document triggers a new page.

11. **Orphan/widow control is cost-based**: Set `costs: (orphan: 200%, widow: 200%)` for stronger prevention, but it is not absolute.

12. **Korean hyphenation**: Setting `lang: "ko"` enables syllable-boundary breaking, not traditional hyphenation. Do not expect hyphen insertion in Korean text.

13. **`path()` is deprecated**: Use `curve()` with `curve.move()`, `curve.line()`, `curve.quad()`, `curve.cubic()`, `curve.close()` instead.

14. **`block(sticky: true)` prevents break between elements**: Use this on headings to keep them with following content instead of relying only on `breakable: false`.

15. **Bibliography formats**: Typst supports Hayagriva (`.yaml`) and BibLaTeX (`.bib`). CSL styles can be loaded from files.
