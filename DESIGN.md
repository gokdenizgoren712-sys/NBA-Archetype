---
name: Primary Arch
description: A scout's card binder for basketball and football — validated player archetypes, presented as gradeable, collectible cards.
colors:
  draft-card-foil: "#FFB11B"
  foil-dim: "rgba(255,177,27,0.12)"
  foil-border: "rgba(255,177,27,0.32)"
  foil-highlight: "#ffe9b0"
  pitch-teal: "#3FB08C"
  logo-teal: "#00A3AF"
  void-black: "#0b0b0b"
  card-stock: "#131313"
  raised-panel: "#1a1a1a"
  hairline: "#262626"
  ink-primary: "#e5e5e5"
  ink-muted: "#8a8a8a"
  ink-faint: "#3a3a3a"
  nba-red: "#c8102e"
  nba-blue: "#1d428a"
  danger: "#f87171"
  gleague-red: "#A8263F"
  ncaa-blue: "#3D7EC9"
  euroleague-orange: "#FF6900"
  arch-engine: "#fb923c"
  arch-ecosystem: "#4ade80"
  arch-hub: "#2dd4bf"
  arch-connector: "#c084fc"
  arch-creator: "#fb7185"
  arch-anchor: "#60a5fa"
  arch-spacer: "#22d3ee"
  arch-finisher: "#a3e635"
  arch-force: "#f87171"
  arch-initiator: "#FFB11B"
  arch-stopper: "#d1d5db"
  arch-rim-runner: "#34d399"
  phase-gk: "#F2C14E"
  phase-def: "#4C9BE8"
  phase-mid: "#3FB08C"
  phase-fwd: "#E8654C"
typography:
  display:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 800
    fontSize: "23px"
    letterSpacing: "0.06em"
  headline:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "28px"
  title:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "15px"
  label:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "9.5px"
    letterSpacing: "0.14em"
  body:
    fontFamily: "Outfit, ui-sans-serif, sans-serif"
    fontWeight: 400
    fontSize: "13px"
  micro:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "10.5px"
  loud-moment:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 800
    fontSize: "96px"
    letterSpacing: "-0.03em"
rounded:
  pill: "999px"
  card: "17px"
  panel: "18px"
  loud-moment: "22px"
  tile: "15px"
  slot: "12px"
  chip: "8px"
  chip-sm: "6px"
  micro: "3px"
  micro-sm: "2px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.draft-card-foil}"
    textColor: "#14110a"
    typography: "{typography.display}"
    rounded: "{rounded.chip}"
    padding: "9px 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  button-ghost-active:
    textColor: "{colors.draft-card-foil}"
  card-surface:
    backgroundColor: "{colors.card-stock}"
    rounded: "{rounded.card}"
  select-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.chip}"
    padding: "6px 8px"
---

# Design System: Primary Arch

## Overview

**Creative North Star: "The Scout's Card Binder"**

Primary Arch is a scout's binder of graded player cards, not a stats terminal and not
an arcade. A binder has two states, and both are correct: most of the time you're
flipping fast through quiet reference pages — dense rows, muted ink, no ceremony,
built for a scout who reads a hundred lines a minute. Then you pull one card out to
look at it properly, and it's a real object — foil, holo stripe, a bevel of light
tracing the cut corner, a rating badge that catches the light. The binder metaphor is
what makes both states belong to the same object instead of reading as two different
apps: **the card is always the same card, only the light changes.**

Confirmed visual rejections: no light theme (the binder is read in a dim room, on
purpose — see Elevation & Depth); no gradient-clipped text anywhere, including the
game module's own headings (a generic AI-generated-UI tell, and the card foil/holo
system already carries the "shine" job — a second gradient on the type on top of it
was redundant, not additive); no purple-to-blue hero gradients, no `rounded-lg`
default-Tailwind sameness, no emoji-as-icon.

**Key Characteristics:**
- One accent color, two energy levels — see "The One Root Rule" below.
- The trading card (holo, foil, cut corner, rating badge) is the signature object;
  every other surface (panel, tile, dock, row) is the same card face flattened out.
- Dark-committed, not dark-mode-as-default: `color-scheme: dark` is declared globally,
  there is no light variant to fall back to.
- Ghost-until-interaction inputs: selects, search, and text fields carry no visible
  box at rest. A box appearing is itself a state signal (focus, hover, has-value).

## Colors

Warm, low-saturation dark neutrals with a single hot accent that never competes with
itself — gold is the only color allowed to glow.

### Primary
- **Draft Card Foil** (`#FFB11B`): the site's one true accent — buttons, active
  states, ratings, trophy/champion iconography, the card's own foil bevel. Read via
  `var(--accent)` in most component contexts and `var(--yamabuki)` specifically where
  a color must stay gold regardless of active sport (trophies, champion UI). Two
  supporting tones ride with it: **Foil Dim** (`rgba(255,177,27,0.12)`, tinted
  backgrounds), **Foil Border** (`rgba(255,177,27,0.32)`, accent-colored hairlines), and
  **Foil Highlight** (`#ffe9b0`, the light end of the gold gradient used on the primary
  button and progress fills — always paired with the accent, never standalone).

### Secondary
- **Pitch Teal** (`#3FB08C`): the football side's sport-conditional accent. Swaps in
  for gold wherever the UI is sport-aware (nav, mode cards, phase colors) — never
  mixed with gold on the same surface. See "The One Root Rule" below.

### Tertiary
- **Logo Teal** (`#00A3AF`, "asagi"): rare, deliberately scarce — the wordmark's
  secondary ring color and a handful of sparse accents (About, auth screens). Not a
  general-purpose UI color; if a new surface reaches for it, that's a signal to
  reconsider, not a green light to spread it further.

### Neutral
- **Void Black** (`#0b0b0b`): base page background.
- **Card Stock** (`#131313`): the next surface up — panel and card backgrounds.
- **Raised Panel** (`#1a1a1a`): the topmost neutral surface (elevated chrome, modals).
- **Hairline** (`#262626`): borders and dividers at rest.
- **Ink Primary / Ink Muted / Ink Faint** (`#e5e5e5` / `#8a8a8a` / `#3a3a3a`): the
  data-register text scale — see "The One Root Rule" for why the game module
  re-declares brighter values on top of this.

### Utility
- **NBA Red** (`#c8102e`) / **NBA Blue** (`#1d428a`): league-identity colors, used only
  where the content is literally referencing the NBA brand (not a general UI accent).
- **G-League Red** (`#A8263F`), **NCAA Blue** (`#3D7EC9`), **EuroLeague Orange**
  (`#FF6900`): one consistent brand hex per non-NBA league, used only in that league's
  own nav badge/page identity — same rule as NBA Red/Blue, not general UI accents.
- **Danger** (`#f87171`): the site's one error/destructive-state color — form errors,
  delete actions, admin moderation flags. Previously an unformalized `text-red-400`
  used consistently but never named; now a real token.

### Categorical — Archetype & Phase palettes
Two small, deliberately-not-neutral palettes used for data-visualization categories
(not UI chrome) — each label always resolves to the same color everywhere it appears.
- **Archetype colors** (12 core archetypes — Engine `#fb923c`, Ecosystem `#4ade80`, Hub
  `#2dd4bf`, Connector `#c084fc`, Creator `#fb7185`, Anchor `#60a5fa`, Spacer `#22d3ee`,
  Finisher `#a3e635`, Force `#f87171`, Initiator `#FFB11B`, Stopper `#d1d5db`, Rim
  Runner `#34d399`): single source of truth at
  `frontend/src/constants/archetypeColors.js`. Previously redefined independently in 5
  files with 3 different value sets — the same archetype rendered a different color
  depending which page you were on (fixed 2026-09).
- **Phase / Role colors** (football's 4 on-pitch roles — Goalkeeper `#F2C14E`, Defence
  `#4C9BE8`, Midfield `#3FB08C`, Attack `#E8654C`): single source of truth at
  `frontend/src/game/football/theme.js`.

### Named Rules

**The One Root Rule.** There is one color system, not two. The game module and the
data pages share every token; what changes between them is *energy*, not *palette*.
Game surfaces (`.g-panel`, `.g-dock`, `.g-tile`, `.g-score-hero`) re-declare
`--text-primary/muted/faint` to a brighter scale (`#f2efea` / `#b4afa8` / `#8b857e`)
because on a large glass card face the data register's near-invisible
`--text-faint: #3a3a3a` reads as broken, not quiet. Data pages keep the quieter
original scale on purpose — a dense stat table is read in bulk, not admired. Never
brighten the data register globally to match the game, and never dim the game module
to match the data register: each value is correct for its own surface.

**The One Voice Rule.** Gold is the only color that glows, animates, or gets a shine
sweep. A second accent earning the same treatment (Pitch Teal getting a shine sweep,
say) dilutes the signal that gold = "this is the important thing." Pitch Teal gets
full parity in every other respect (its own dock accent, its own tile palette) — it
just doesn't shimmer.

## Typography

**Display Font:** Rajdhani (with `ui-sans-serif, sans-serif` fallback)
**Body Font:** Outfit (with `ui-sans-serif, sans-serif` fallback)

**Character:** Rajdhani is the binder's stencil — condensed, geometric, built for
short uppercase labels and card nameplates, never for a paragraph. Outfit is the
quiet workhorse underneath it: humanist, unremarkable on purpose, so the eye has
somewhere to rest between Rajdhani's louder moments.

### Hierarchy
- **Display** (800, ~23px, uppercase, 0.06em tracking): reserved for the game
  module's dock/hero titles (`.g-dock-title`) — the loudest text in the system, one
  per screen at most.
- **Headline** (700, ~28–30px, sentence case, `font-logo`): page-level headers on
  data pages (`Blog`, `Squad Chemistry`). Bold but not shouting — sentence case is
  the tell that this is the calm register, not the game's.
- **Title** (700, 14–17px, `font-logo`): card names, tile titles, section headers
  inside a panel.
- **Label** (700, 8.5–9.5px, uppercase, 0.10–0.14em tracking, `font-logo`): the
  eyebrow/meta layer — `.g-label`, table column headers, badges. Always paired with
  a short leading rule (`.g-label::before`) in game contexts, bare in data contexts.
- **Body** (400, 13px, Outfit): everything a scout actually reads at volume — stat
  values, descriptions, list rows.
- **Micro** (700, a tight cluster of sub-steps between Label and Body —
  7.5/8/8.5/10.5/11/11.5/12.5px, `font-logo`): the game module's chip/stat/sub-label
  scale — column headers, slot positions, joker labels, roster row stats. Not
  arbitrary: each step is reused consistently across `game.css`, just never enumerated
  here before. Data pages don't need this scale; they stay on Label/Body.

### Named Rules

**The Loud-Moment Exception.** The score-reveal grade letter (`.g-score-grade`, 96px/
800/-0.03em) and its container (`.g-score-hero`, 22px radius) break the normal type/
shape scale on purpose — this is the game's single biggest payoff moment (draft
result), and it's meant to read as an event, not a heading. One such moment per flow;
don't reuse the 96px step anywhere else or it stops meaning "this is the reveal."

**The Uppercase-Means-Game Rule.** Uppercase, tracked-out Rajdhani at loud weight
(800) signals "you are in the game module." A data-page heading stays sentence case
even at bold weight — this is the fastest visual tell a reader has for which energy
level they're in, so don't borrow one register's casing for the other's headline.

## Layout

Content lives inside a single-column, max-width-capped column on data pages (`max-w-3xl`
for reading content like Blog/About, wider for tables and grids) and a fixed-height
dock + flexible dual-panel split on game screens (`.g-dock` above, `.g-panel` columns
below, matching the court/pitch's own aspect ratio). Density is the real variable:
game rows (`.g-row`) run at ~40px with 6px internal gaps for drag/tap targets; data
rows run tighter, optimized for scanning many at once. Mobile collapses the game dock
from a 3-column grid to a stacked, centered column (`grid-template-columns: 1fr` under
768px) rather than shrinking it in place — components resize as blocks, not by
scaling down their internals.

## Elevation & Depth

Primarily flat-and-tinted, not shadow-driven. Surfaces separate from each other
through **background value** (void black → card stock → raised panel, each one step
lighter) and a **1px accent-tinted edge bevel** (a gradient border traced at the
card/panel's own corner radius, masked to a hairline) rather than a drop shadow.
Ambient light comes from the `.aura-blob`/`.aura-glow` system — soft, blurred,
color-tinted radial shapes positioned behind content — which reads as light falling
on the card rather than the card floating above the page. True `box-shadow` is
reserved for two cases: the trading card itself when it's actually meant to feel like
a physical object lifted off the table (`0 24px 48px -18px rgba(0,0,0,.8)`), and a
tight accent-colored glow directly under something currently glowing (buttons,
selected tiles, active slots — `0 0 16-22px` at the accent color).

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 24px 48px -18px rgba(0,0,0,0.8)`): under the
  trading-card stage only — the one element allowed to feel physically raised.
- **Accent glow** (`box-shadow: 0 0 16-22px [accent]`, often paired with an inset
  highlight `0 1px 0 rgba(255,255,255,.5) inset`): active/selected/CTA state, never
  resting state.
- **Modal lift** (`box-shadow: 0 30px 70px -20px rgba(0,0,0,.85)`): the third and
  final legitimate exception — a modal genuinely floats over a backdrop, same
  physical logic as the trading card's own lift. Reserved for true modal/overlay
  surfaces, not a general excuse to add resting shadows elsewhere.

White and black alpha overlays (`rgba(255,255,255,.04-.28)`, `rgba(0,0,0,.35-.85)`) are
the system's general-purpose glass/hover/vignette wash tool — texture and depth cues
layered on top of the real palette, not brand colors themselves. They're a continuous
opacity space by nature (each surface tunes its own wash to what reads right against
its own background), not a discrete set to enumerate as named tokens — a scanner
flagging an individual `rgba(0,0,0,.55)` here is expected and not itself a drift signal;
what would be real drift is a wash using a *hue* other than pure white/black, or a wash
strong enough to read as a real background color rather than a texture.

### Named Rules

**The Flat-By-Default Rule.** Nothing gets a shadow just for existing. A panel, tile,
or row is flat until it's the trading card itself, or until it's actively glowing
because the user is looking at it or it wants attention.

## Shapes

Radius scales with how "held" an element is meant to feel: the trading card itself
is the roundest, largest-radius object (17px) *and* has one cut corner
(`clip-path` notch, bottom-right) — the single most distinctive silhouette in the
system, reserved for the card alone. Panels and docks (18px) and tiles (15px) stay
soft-rounded without the notch. Small interactive chips — slots, jokers, badges —
drop to 12px, and anything pill-shaped (search, ghost buttons, tag badges) goes to
999px. Borders are 1px hairlines at rest almost everywhere; a thicker or
colored-solid border is reserved for genuine state (selected, active), never
decoration.

### Named Rules

**The One Notch Rule.** The cut-corner silhouette (`clip-path` bottom-right notch)
belongs to the trading card and nothing else. It's the shape's signature the way the
holo stripe is the surface's signature — reusing it on an unrelated card or panel
would blur the one shape a user should always recognize as "that's a player."

## Components

### Buttons
- **Shape:** primary CTAs are 8-10px radius, never pill unless the button is
  genuinely a toggle/filter (`.aura-pill-btn`, 999px).
- **Primary** (`.aura-rating-btn`): gold foil gradient fill (`linear-gradient(100deg,
  #ffe9b0, var(--accent) 55%, #ffe9b0 100%)`), dark ink text, a continuous shine
  sweep (3-4.5s loop) — the one button allowed to have ambient motion at rest,
  because it's directly borrowed from the card's own rating badge.
- **Ghost** (`.aura-pill-btn`): fully transparent at rest, a soft white wash on
  hover, gold text + gold-tinted hover when `.active`. Never a resting border.
- **Hover / Focus:** buttons lift (`translateY(-1px)`) and their glow deepens; no
  color shift beyond the active/gold state.

### Cards
- **Corner Style:** 17px + cut-corner notch (trading card only); 15-18px plain round
  everywhere else.
- **Background:** a subtle diagonal gradient (`linear-gradient(160deg, #17151b 0%,
  #0c0b0e 55%, #14100a 100%)`), never a flat fill — this is what gives the "card
  stock" its material read.
- **Shadow Strategy:** see Elevation & Depth — lift shadow on the trading card only,
  everything else flat + edge bevel.
- **Border:** 1px hairline (`var(--border)`), swapping to an accent-tinted gradient
  bevel via `::before` mask.
- **Internal Padding:** 14-15px is the panel default; the trading card's own internal
  rhythm is tighter (8-14px) because it's carrying more distinct zones.

### Inputs / Selects / Search
- **Style:** no visible box at rest — background transparent, border absent (select)
  or reduced to a single underline (`.aura-ghost-input`). A native `<select>`'s arrow
  is suppressed and redrawn as a two-line chevron.
- **Focus / Value state:** the box appears. Search expands from a 32px icon-only
  circle to a 200px pill with a soft glow beneath it; ghost inputs grow a gold
  underline; selects gain a gold text color when they hold a non-default value
  (`.aura-select.accent`).
- **Named Rule — The Ghost-Until-Earned Rule:** if an input has nothing to say (empty,
  unfocused, default value), it should be nearly invisible. Visibility is a signal
  the user has done something, not a permanent frame.

### Navigation
- Icon rail (desktop) / bottom-sheet drawer (mobile), Rajdhani uppercase labels,
  13px, 0.09em tracking. Active state: a soft accent-tinted gradient wash plus a 3px
  accent rail on the leading edge (`::before`), never a full-color fill.

### The Trading Card (signature component)
Vertical Panini-style card: cut-corner notch, edge-light bevel, always-on holo stripe
texture (`mix-blend-mode: color-dodge`, low opacity), foil sweep that only animates
on hover (perf: one card animating at a time, not sixty), fixed twinkle sparkles at
three points, a skewed gold rating badge top-right with its own shine loop. This is
the one component that gets the full ceremony — every other surface in the system is
a quieter descendant of it.

## Do's and Don'ts

### Do:
- **Do** keep the trading card's cut-corner + holo + foil vocabulary exclusive to the
  card itself; other surfaces borrow the edge-bevel and blob-glow, not the notch or
  the holo stripe.
- **Do** let game surfaces run brighter/louder (text scale, ornament, motion) than
  data surfaces — that's the deliberate "two energy levels" the whole system is built
  on, not drift to fix.
- **Do** keep inputs invisible until they have something to say (focus, hover, value).
- **Do** use `var(--accent)` for anything sport-conditional (basketball gold /
  football teal) and `var(--yamabuki)` only for things that must always read gold
  regardless of active sport (trophies, champion UI, brand wordmark).
- **Do** respect `prefers-reduced-motion` on every ambient/looping animation (blob
  drift, shine sweep, sparkle) — already the pattern everywhere; keep it that way.
- **Do** keep the primary CTA (`.aura-rating-btn`) gold everywhere, football included
  — confirmed 2026-09: CTA color is not sport-conditional, only secondary/decorative
  accents (nav, dock, tiles) swap to Pitch Teal. No teal CTA variant exists or should
  be added.
- **Do** keep football's comparison/reference surfaces (`FootballCompare.jsx`,
  `FootballMap.jsx`) in the quiet data register, matching basketball's
  `Compare.jsx`/`Glossary.jsx` — confirmed 2026-09, converted from the loud game-module
  chrome (`g-dock`/`g-panel`/`g-tile`) they'd drifted onto.

### Don't:
- **Don't** use gradient-clipped text anywhere, including for "signature" headings.
  Removed 2026-09 from the game module's own dock title — the card's foil/holo system
  already does the "shine" job; a gradient on top of type read as decorative rather
  than earned, the classic AI-slop tell.
- **Don't** put a resting `box-shadow` on anything that isn't the trading card itself
  or an actively-glowing accent state.
- **Don't** give a second color the gold accent's shine-sweep/glow treatment — one
  color glows, everyone else stays flat-and-tinted.
- **Don't** brighten the data register's `--text-faint` to match the game module's,
  or dim the game module's to match data — they're deliberately different values for
  the same semantic slot, not an inconsistency to reconcile.
- **Don't** reach for `rounded-lg`/generic Tailwind defaults, raw palette classes
  (`bg-blue-700`, `text-gray-400`), or a thick single-side accent border as a
  substitute for the system's own tokens and edge-bevel language.
