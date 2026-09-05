# DESIGN.md: Ada (ada.cx)

## Source
- URL: https://www.ada.cx/
- Capture date: 2026-09-05
- Evidence: Playwright MCP — live `getComputedStyle` reads on the rendered
  page (typography, colours, radii, borders, button boxes, container widths)
  plus three viewport screenshots at 1440×900 (hero, stat band, case-study
  grid). Firecrawl was not available in this environment; the same signals
  were taken directly from the live DOM instead, which gives measured rather
  than inferred values for everything below marked *observed*.

## Reference Screenshots
- `.playwright-mcp/ada-hero.png` — hero, floating pill nav, announcement bar
- `.playwright-mcp/ada-2.png` — headline + ambient-glow stat band
- `.playwright-mcp/ada-3.png` — live counter panel, case-study card grid

> **Rights note:** these are captures of a third party's site held as design
> evidence only. Ada's logo, wordmark, photography, product screenshots and
> copy are theirs. Nothing in this file grants any right to reuse those
> assets — what is portable here is the *design language* (layout, rhythm,
> type treatment, component shapes), not Ada's brand or content.

## Design Summary

One continuous near-black canvas — **not** a page of alternating light and
dark bands. Depth comes from three devices layered on that single ground:

1. **Ambient colour bleed.** Large, very soft radial glows (olive/green,
   occasionally warm) sit behind content and bleed through card edges. They
   are the only saturated colour on most screens.
2. **Cards as the unit of structure.** Sections are not separated by rules
   or background changes; they are separated by space, and content is
   gathered into rounded dark cards with hairline borders.
3. **Very large, very tight display type at weight 400.** Line-height is
   locked to exactly 1.0 at display sizes with roughly -0.03em tracking —
   this is the single most characteristic thing about the page.

A floating pill-shaped nav, inset from the top edge on all sides, hovers
over the canvas rather than sitting on a bar.

## Design Tokens

### Colors

*All observed.*

| Role | Value | Notes |
|---|---|---|
| Canvas | `#050506` | `body` background; the entire page |
| Card | `#0D0E11` | standard content card |
| Glass card | `rgba(26,28,32,0.55)` | over imagery, with backdrop blur |
| Hairline | `rgba(255,255,255,0.07)` | default card border |
| Hairline (glass) | `rgba(255,255,255,0.12)` | on translucent cards |
| Text primary | `rgba(255,255,255,0.94)` | never pure white |
| Text secondary | `rgba(255,255,255,0.60)` | body copy, captions |
| Text muted | `rgba(255,255,255,0.40)` | sub-labels |
| Accent primary | `#8FBE8E` | sage; fills the primary CTA pill |
| On accent | `#0A0B0C` | text on the sage pill — near-black, not pure |
| Accent secondary | `#C96A42` | terracotta; category chips only |
| Ghost fill | `rgba(255,255,255,0.10)` | secondary pill button |

Two accents, used sparingly and for different jobs: sage is *always* the
primary action, terracotta is *never* an action — it only tags categories.

### Typography

Ada ships **Roobert**, a licensed commercial face — do not attempt to ship
it. What carries over is the treatment, not the family: any neutral
geometric/grotesque sans at weight 400 reproduces the effect.

| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Display (h1) | 72px / 72px (**1.0**) | 400 | -0.03em |
| Section (h2) | 60px / 60px (**1.0**) | 400 | -0.03em |
| Stat number | 36px / 36px (**1.0**) | 400 | -0.02em |
| Body lead | 18px / ~1.5 | 400 | -0.01em |
| Body | 16px / ~1.55 | 400 | -0.01em |
| Label / eyebrow | 12–13px, uppercase | 400–500 | +0.08em |

The locked 1.0 line-height at 60–72px is the signature. Weight never goes
above 400 for display type; hierarchy is carried by *size and colour*, not
by weight.

### Spacing And Layout

- Content column ≈ **1038px**; outer container ≈ 1180–1200px (observed).
- Nav pill inset roughly 96px from each side at 1440px, ~24px from the top.
- Section rhythm is generous vertical space — 120–160px between blocks —
  with **no** dividing rules or background changes.
- Radii: **pill (9999px)** for every button; **16px** content cards;
  **22px** glass cards; **24px** large panels.
- Borders are always 1px hairlines at low white alpha, never solid strokes.
- No drop shadows on the dark canvas — elevation reads through border alpha
  and the ambient glow behind an element.

## Components

**Nav** — floating pill, inset from all edges, translucent over the canvas
with a hairline border. Logo left, text links with dropdown carets centre,
a ghost pill (`Sign in`) and a sage pill (`Speak to an expert`) right. An
optional announcement strip docks *inside* the same rounded container below
the nav row.

**Buttons** — fully rounded pills, 14px/400 text, `12px 24px` padding,
~38px tall. Primary: sage fill, near-black text, no border. Secondary:
10% white fill, white text. Neither uses uppercase.

**Stat band** — one wide rounded panel with an ambient glow bleeding
through it, holding 3–4 stats split by thin vertical hairlines. Huge number
(with the unit set smaller and offset), small uppercase label beneath in a
tinted muted colour.

**Case-study card** — 16px radius, `#0D0E11`, hairline border, ~381×148.
Brand mark top-left, small ghost pill top-right (`Case study ↗`), oversized
number, one-line caption in muted text. A faint colour wash sits in one
corner of some cards.

**Glass card** — 22px radius, translucent dark fill + backdrop blur,
brighter hairline. Used only when floating over photography.

## Page Patterns

Hero (split: left copy / right arched image with glass cards floating over
it) → stat band → live counter panel → case-study card grid → industry
sections keyed by terracotta chips → platform section → trust/compliance →
footer. Every one of those sits on the same unbroken `#050506`.

Responsive: the split hero stacks with the image below; card grids collapse
3→2→1; the nav pill becomes a compact bar with a sheet menu.

## Content Style

Sentence case throughout, including buttons. Headlines are plain claims,
not slogans, and run long enough to wrap to 2–3 lines at 60px. Numbers do
the persuading — stats are given far more visual weight than the prose
around them. Labels are terse and uppercase.

## Agent Build Instructions

1. Set one canvas colour on the page root and **never change it** between
   sections. Resist the urge to alternate bands.
2. Place 2–4 large, very soft radial gradients behind content as the only
   saturated colour. Keep them under ~25% alpha and heavily blurred.
3. Set display type at weight 400, `line-height: 1`, `letter-spacing:
   -0.03em`. This alone gets most of the way to the look.
4. Gather content into rounded cards with 1px low-alpha white borders on a
   slightly lighter fill than the canvas. No shadows.
5. Make every button a pill. One accent fills the primary action; a 10%
   white fill carries the secondary. Sentence case.
6. Float the nav: inset it from the top and sides, round it fully, give it
   a translucent fill and a hairline border.
7. Separate sections with space alone — no rules, no background changes.

## Rerun Inputs
```
workflow: firecrawl-website-design-clone
source_url: https://www.ada.cx/
target_stack: Next.js 16 (App Router) + Tailwind
output: viewer/DESIGN.md
note: firecrawl CLI unavailable; evidence gathered via Playwright MCP
```
