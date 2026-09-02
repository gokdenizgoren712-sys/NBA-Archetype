---
name: RankIt by Primary Arch
description: A match diary in Primary Arch's dialect — gold on near-black, cards you collect rather than rows you scan.
colors:
  gold: "#ffb11b"
  gold-ink: "#17120a"
  green: "#3fb08c"
  ground-app: "#090a0b"
  ground-web: "#0b0c0e"
  surface-sunken: "#0c0d0f"
  surface: "#121315"
  surface-card: "#151618"
  surface-sheet: "#1a1b1e"
  line: "rgba(255,255,255,.09)"
  text-primary: "#eceded"
  text-secondary: "#c9cccd"
  text-muted: "#9aa0a6"
  text-faint: "#7f868b"
typography:
  display:
    fontFamily: "Rajdhani, var(--font-logo), system-ui, sans-serif"
    fontSize: "31px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Rajdhani, var(--font-logo), system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Rajdhani, var(--font-logo), system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.02em"
  body:
    fontFamily: "Outfit, var(--font-sans), system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Rajdhani, var(--font-logo), system-ui, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    letterSpacing: "0.14em"
rounded:
  pill: "999px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "22px"
  crest: "18px 18px 21px 21px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "13px"
  lg: "18px"
  xl: "26px"
components:
  card-match:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "0"
  pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "0 13px"
    height: "32px"
  pill-active:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.pill}"
    padding: "0 13px"
    height: "32px"
  cta-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    typography: "{typography.title}"
  cta-saved:
    backgroundColor: "#20231f"
    textColor: "{colors.green}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  sheet:
    backgroundColor: "{colors.surface-sheet}"
    textColor: "{colors.text-primary}"
    rounded: "27px 27px 0 0"
    padding: "22px 20px 30px"
---

# Design System: RankIt by Primary Arch

## Overview

**Creative North Star: "The Collector's Shelf"**

RankIt is not a scoreboard. SofaScore and FotMob already own the job of telling you what
happened; RankIt exists to hold what you *thought* of it. So the unit of the product is a
card you keep, not a row you scan — and every visual decision follows from that one
distinction. A fixture list wants density and sameness. A shelf wants each object to look
worth having.

The world is inherited whole from Primary Arch and is not a second brand: yamabuki gold
on near-black, Rajdhani display type, cut-corner card geometry, aura glow. What RankIt adds
is a component family (`ri-*`) and its own tokens (`--ri-*`) — a dialect, not a language.
Anything that reads as a new identity is drift, not invention.

Density is deliberately low for a catalog app. Cards carry club colours pulled from live
data (`--home` / `--away` mixed into the card gradient via `color-mix`), a 45°-rotated
crest diamond whose badge counter-rotates so the club mark reads flat, and a diagonal holo
sheen at 68°. Finished matches replace the "VS" with a ghosted shirt number behind a
silhouette. None of that survives being lifted into another product — which is the test
this system is meant to pass.

**Key characteristics:**
- Gold is an event, not a surface — it marks the one thing that matters on a screen.
- Type is almost entirely bold: weight 700 appears 98× across the stylesheets, 400 once.
- Depth comes from tonal layering plus a single ambient shadow, never from borders alone.
- Club colour is data, not decoration: two teams tint every card they appear on.
- Motion is short (.14–.20s) and confined to transform, opacity and colour.

## Colors

A near-black ground with one warm accent, one confirmation accent, and a five-step neutral
ramp. There is no third accent and none should be added.

### Primary
- **Yamabuki Gold** (`#ffb11b`): the product's only attention colour. Active nav, the Rank
  gem, star fills, section eyebrows, the primary CTA, the CLASSIC stamp when earned. On the
  darkest ground it measures 10.9:1.
- **Gold Ink** (`#17120a`): the near-black used *on* gold — never a background of its own.
  10.25:1 on `#ffb11b`.

### Secondary
- **Signal Green** (`#3fb08c`): confirmation and broadcast only — "Saved to diary",
  the watch-along panel. It never competes with gold for attention and never marks
  navigation. 7.36:1 on the app ground.

### Neutral
- **Ground (app)** (`#090a0b`) and **Ground (web)** (`#0b0c0e`): the two page grounds.
  They differ by two points of luminance and that difference is not meaningful — treat them
  as one colour and prefer `#090a0b` for new work.
- **Sunken** (`#0c0d0f`): inputs and search fields, one step *below* the ground.
- **Surface** (`#121315`): inactive pills and chips.
- **Card** (`#151618`): the match card body and its relatives.
- **Sheet** (`#1a1b1e`): overlays that rise above the page.
- **Line** (`rgba(255,255,255,.09)`): every divider and card edge. One line colour only.
- **Text Primary** (`#eceded`) · **Secondary** (`#c9cccd`) · **Muted** (`#9aa0a6`) ·
  **Faint** (`#7f868b`): the full text ramp. Measured against the darkest ground these are
  16.4:1, 12.3:1, 7.5:1 and 5.4:1; against the lightest surface (`#1a1b1e`) the floor is
  still 4.66:1. Every step clears WCAG AA on every surface in this system.

### Named Rules

**The One Gold Rule.** Gold marks at most one thing per viewport region. A screen with a
gold nav item, a gold CTA, a gold badge and a gold eyebrow has no accent at all — it has a
colour scheme. When two things compete, the one the user came to do wins.

**The 4.5 Floor.** `#555`, `#666` and `#777` are **deprecated** and must not be used for
text. They are the three most common greys in the current stylesheets (16×, 22×, 28×) and
they measure 2.66:1, 3.45:1 and 4.42:1 on the app ground — all below AA, and they carry
exactly the copy a new member most needs to read: empty-state explanations, filter labels,
timestamps. `#888` (5.59:1) is the darkest grey that passes; the ramp above starts one step
lighter for margin. New code uses the four named text tokens and nothing else.

**Club colour belongs to the club.** `--home` / `--away` come from the API. Never hardcode
a team's colour, and never use a club colour for UI meaning.

## Typography

**Display font:** Rajdhani (`var(--font-logo)`) — squarish, condensed, technical.
**Body font:** Outfit (`var(--font-sans)`) — neutral geometric sans.

**Character:** Rajdhani does almost all the visible work: headings, scores, team names,
numbers, and every uppercase label. Outfit carries running prose — reviews, descriptions,
help text. The split is *voice vs. content*: if the product is saying it, it's Rajdhani; if
a person wrote it, it's Outfit.

### Scale

The shipped stylesheets contain **33 distinct font sizes between 5px and 31px**. That is an
inventory, not a scale. The five roles in the frontmatter are **prescriptive**: they are the
dominant real values consolidated, and new work should snap to them.

| Role | Size | Font | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Display | 31px | Rajdhani | 700 | .02em | Page titles (`h1`) |
| Headline | 21px | Rajdhani | 700 | — | Section headings (`h2`) |
| Title | 13px | Rajdhani | 700 | .02em | Card team names, row titles |
| Body | 12px | Outfit | 400 | — | Reviews, descriptions, help |
| Label | 9px | Rajdhani | 700 | .14em | Uppercase eyebrows and meta |

**Nothing below 9px.** The current code goes to 5px (`.ri-classic small`) and 6px
(`.ri-v03-community-stats span`). At those sizes the text is decoration pretending to be
information — either it matters and earns 9px, or it goes.

Uppercase labels always carry `.14em` tracking; without it Rajdhani's condensed caps close
up and stop being legible at label size.

## Layout

The phone shell is fixed and full-bleed: a 64px header, a scrolling main, and a 73px bottom
nav (`height: calc(100% - 137px)`). Above 700px the same shell centres its content in a
520px column rather than stretching — RankIt stays a column even on a desktop, because the
card is the unit.

The web surface is a two-part frame: a left rail and the wall. The wall is
`repeat(auto-fill, minmax(268px, 1fr))` — the one genuinely responsive grid in the system,
and the pattern to copy. Below 820px the rail becomes a bottom bar so the thumb reaches
navigation in the same place it does in the app.

Filters are a left slide-over drawer (288px, `max-width: 85vw`), not a standing rail: the
wall keeps full width and filters cost space only while in use.

**Spacing** is a 4 / 8 / 13 / 18 / 26 progression — prescriptive again, consolidated from
the real gaps (8px, 7px, 5px and 9px are the four most common). Card interiors use 13px,
page gutters 26px.

## Elevation & Depth

Depth is **tonal first, shadow second**. The five surface steps (`ground → sunken → surface
→ card → sheet`) do most of the lifting; a surface is "higher" because it is lighter, not
because it floats.

Only three shadow roles exist and no fourth should be added:

- **Ambient** — `0 14px 34px rgba(0,0,0,.28)` on cards. Grounds the object; never sharp.
- **Overlay** — `0 -22px 80px #000` under sheets, and `18px 0 44px -16px rgba(0,0,0,.75)`
  beside the filter drawer. Separates a layer from the page beneath it.
- **Glow** — `0 0 8px var(--ri-gold)` / `0 0 22px rgba(255,177,27,.35)`. This is not
  elevation; it is *emphasis*, and it is reserved for gold. A glow on a neutral element
  reads as a bug.

Chrome that overlaps content (header, bottom nav, floating search, filter drawer) uses
`backdrop-filter: blur(18px)` over a translucent surface. Keep this to fixed chrome only —
it is the most expensive paint in the system and it is already used 11 times.

## Shapes

The corner language is the identity. Three shapes carry it:

- **The card** — `border-radius: 22px`, with a `clip-path` cutting the top-right and
  bottom-left corners and two 22px hairlines laid across the notches. Those hairlines turn
  **gold** when a match is an Instant Classic; that promotion is the single best detail in
  the system and should not be diluted by using gold hairlines anywhere else.
- **The crest diamond** — a 45°-rotated square with `18px 18px 21px 21px` radii, whose
  badge counter-rotates −45° so the club mark reads flat inside a rotated frame. Asymmetric
  radii are deliberate: a true square reads as a diamond, this reads as a *shield*.
- **The pill** — `999px`, every filter chip, tag and toggle.

The shipped code uses **12 distinct radii** (9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20,
22px). The five in the frontmatter are prescriptive; snap to them.

Everything is bordered with the single `--ri-line` colour at 1px. There is no second border
weight and no second border colour.

## Components

**Match card.** The product's unit. Composition, top to bottom: competition strip · art
region (crests + score, or the POTM silhouette on a finished match) · score band with team
short names · footer with ratings/reviews. Club colours tint the card gradient. The art
region uses `flex: 1`, so in a fixed-height carousel it absorbs all leftover height — on the
phone hero that currently means 287px of region for 88px of content. **New card layouts
should size the art region, not let it grow**; a card that is mostly empty reads as loading.

**Score band.** `short` above `name`. When a club's short name equals its full name — which
is the norm in this catalog — print one line, not two. Rendering "Sassuolo / Sassuolo" is
the default state of the current card and it is wrong.

**Versus block.** Score when the match is finished, otherwise kick-off time above "VS".
Never a label that restates the glyph below it.

**Pill.** 32px tall, `999px`, `#121315` / muted text; active flips to gold ground with
`#17120a` ink and weight 700. Minimum touch target is 44×44 on the phone (48dp on Android)
— the current 31–34px chips do not meet this and new ones must.

**Primary CTA.** Full width, gold, `#17120a` ink, 10px radius. On success it becomes the
green "saved" variant. The CTA must return to its actionable state the moment the form is
dirty again — a green "Saved" button above an unsaved change is a lie.

**Sheet.** Rises from the bottom, `27px 27px 0 0`, drag handle, velocity-aware dismissal.
Every sheet needs `role="dialog"`, `aria-modal`, an Escape handler and a focus trap; the
eight phone sheets currently have none of these and that is a defect to fix, not a pattern
to copy.

**Stars.** Half-star precision by tap position, `scale(1.22)` on press. The half-star hit
areas are ~10.5×21px, below the 24×24 minimum — widen them rather than reproducing them.

## Do's and Don'ts

**Do**
- Use the four named text colours. Every one clears AA on every surface here.
- Let club colour come from data.
- Reach for tonal layering before reaching for a shadow.
- Keep uppercase labels at 9px with `.14em` tracking.
- Give every new interactive element a 44×44 target and a visible `:focus-visible` ring.
- Animate `transform`, `opacity`, `color` — and cover new animation in the
  `prefers-reduced-motion` block, which currently misses three infinite animations.

**Don't**
- Don't use `#555`, `#666` or `#777` for text. They fail AA and they are the reason 98 of
  175 measured colour pairs in this surface currently fail.
- Don't add a third accent. Gold acts, green confirms; that is the whole vocabulary.
- Don't put gold glow on a neutral element — glow means gold.
- Don't invent a radius. Twelve is already too many.
- Don't go below 9px.
- Don't animate `width`, `height`, `padding` or `margin`. Three `transition: width` rules
  exist today and none should be joined.
- Don't redefine an `ri-*` selector in a second stylesheet. Eleven selectors currently
  conflict across files, and because the web surface imports only two of the six sheets,
  the same markup resolves to different geometry on phone and web.

## Known drift

Recorded so the next reader knows what is *described* here versus what is *shipped*:

| Area | Shipped | This document |
|---|---|---|
| Declared tokens | 4 (`--ri-gold`, `--ri-green`, `--ri-card`, `--ri-line`) | 14 colours; the rest are literals today |
| Type sizes | 33 distinct, 5px–31px | 5 prescriptive roles, floor 9px |
| Radii | 12 distinct | 5 prescriptive + the crest |
| Text contrast | 98 of 175 pairs below AA | ramp measured, all pass |
| `--ri-bg` | referenced in `rankit-web.css`, **never defined** anywhere | use `ground-web` |

This file is prescriptive where the code has drifted. Where the two disagree, the file is
the target and the code is the backlog.
