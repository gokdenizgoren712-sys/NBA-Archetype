---
name: Primary Arch
description: A scout's card binder for basketball and football — validated player archetypes, presented as collectible cards. Handoff v2 ("from terminal to collection").
source: docs/design/handoff-v2 (README + Primary Arch Screens v2) — wins over this file on any conflict
colors:
  draft-card-foil: "#FFB11B"
  foil-highlight: "#ffe9b0"
  foil-ink: "#14110a"
  pitch-teal: "#3FB08C"
  logo-teal: "#00A3AF"
  void-black: "#0b0b0b"
  frame: "#1a1a1a"
  fill-1: "rgba(255,255,255,0.035)"
  fill-2: "rgba(255,255,255,0.05)"
  fill-selected: "rgba(255,255,255,0.08)"
  ink-primary: "#f2efea"
  ink-secondary: "#b4afa8"
  ink-muted: "#8b857e"
  ink-faint: "#5a5650"
  ink-divider: "#3a3a3a"
  you: "#60a5fa"
  opponent: "#f87171"
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
  pos-pg: "#1d428a"
  pos-sg: "#00A3AF"
  pos-sf: "#6da7ec"
  pos-pf: "#FFB11B"
  pos-c: "#c8102e"
  phase-gk: "#F2C14E"
  phase-def: "#4C9BE8"
  phase-mid: "#3FB08C"
  phase-fwd: "#E8654C"
typography:
  meta:
    fontFamily: "Outfit, ui-sans-serif, sans-serif"
    fontWeight: 500
    fontSize: "12px"
  body:
    fontFamily: "Outfit, ui-sans-serif, sans-serif"
    fontWeight: 400
    fontSize: "14px"
  row-title:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "16px"
  section-title:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "20px"
  page-h1:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "40px"
  game-wordmark:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "24-48px"
    letterSpacing: "0.05em"
  loud-moment:
    fontFamily: "Rajdhani, ui-sans-serif, sans-serif"
    fontWeight: 700
    fontSize: "96-112px"
rounded:
  chip: "9-15px"
  button: "11-12px"
  row: "9-12px"
  card: "20px"
  modal: "22px"
  avatar: "50%"
components:
  button-primary-basketball:
    background: "linear-gradient(100deg,#ffe9b0,#FFB11B 55%,#ffe9b0)"
    textColor: "{colors.foil-ink}"
    height: "42-56px"
    rounded: "{rounded.button}"
  button-primary-football:
    backgroundColor: "{colors.pitch-teal}"
    textColor: "#06140f"
    height: "42-56px"
    rounded: "{rounded.button}"
  button-secondary:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.button}"
  card:
    background: "linear-gradient(180deg,<accent>14,rgba(255,255,255,.015) 65%)"
    shadow: "inset 0 1px 0 <accent>55, 0 24px 60px -34px #000"
    rounded: "{rounded.card}"
    padding: "22px 24px"
  row-card:
    backgroundColor: "{colors.fill-1}"
    shadow: "inset 0 1px 0 rgba(255,255,255,.05)"
    rounded: "14-18px"
---

# Design System: Primary Arch

> **Source of truth:** `docs/design/handoff-v2/` (README, `Primary Arch Screens v2`,
> original brief). This file summarises it for the codebase. Where the two disagree,
> the handoff wins. The rollout plan is `docs/ui-redesign-plan.md`.

## Overview

**Creative North Star: "The Scout's Card Binder", from terminal to collection**

Primary Arch is a scout's binder of graded player cards. The 2026-09 redesign removes
the "terminal" layer: tiny mono labels, hairline boxes inside boxes, numbered step
panels, heavy uppercase. The game's colour and glow now spread to the data pages too,
but as page-level ambient light rather than a blob behind every panel. Typography and
spacing carry the brand. The Panini player card is untouchable and stays as it is.

Two sports, one product, two accents: basketball gold `#FFB11B`, football teal
`#3FB08C`. The accent follows the section you are in. Gold separately always means
trophy / #1 / champion, on either sport.

Confirmed rejections (unchanged): no light theme, no gradient-clipped text, no
purple-to-blue hero gradients, no `rounded-lg` sameness, no emoji-as-icon.

## Colors

### Accents
- **Draft Card Foil** `#FFB11B` — basketball accent, and the trophy/champion colour on
  both sports (`var(--yamabuki)` where it must stay gold regardless of sport).
- **Pitch Teal** `#3FB08C` — football accent. `main[data-sport="football"]` sets
  `--accent` to teal, so any `var(--accent)` on a football page is teal.
- **Logo Teal** `#00A3AF` — wordmark ring, the Explore nav icon. Deliberately scarce.

### Neutrals
- Page `#0b0b0b`; frame line `#1a1a1a`.
- Raised fills are translucent white, not solid greys: `--fill-1` `.035` (row card),
  `--fill-2` `.05` (secondary button), `--fill-sel` `.08` (selected segment/row).
- **Ink, five steps, warm:** primary `#f2efea` · secondary `#b4afa8` (body copy) ·
  muted `#8b857e` (meta) · faint `#5a5650` (disabled) · divider `#3a3a3a` (only for
  rules, breadcrumb separators, "VS"). `#3a3a3a` is never text.

### Semantic and categorical
- Status: green `#4ade80`, yellow `#facc15`, red `#f87171`, blue `#60a5fa`,
  purple `#c084fc` / `#c4b5fd`, orange `#fb923c`, sky `#38bdf8`, mint `#34d399`.
- Two-player sides: you `#60a5fa`, opponent `#f87171`.
- League identity: G League `#A8263F`, NCAA `#3D7EC9`, EuroLeague `#FF6900`, NBA
  `#c8102e` / `#1d428a`.
- **Archetype colours** — single source `frontend/src/constants/archetypeColors.js`
  (identical to the handoff's `ARCH_COLOR`).
- **Position colours** — single source `frontend/src/constants/positionColors.js`
  (identical to the handoff's `POS_COLOR`).
- **Football phases** — keeper `#F2C14E`, defence `#4C9BE8`, midfield `#3FB08C`,
  attack `#E8654C`; single source `frontend/src/game/football/theme.js`. Semantic,
  never reassigned per page.

## Typography

Rajdhani for display, numbers and game wordmarks; Outfit for everything read.
**One type scale** — the old separate game/data scales are merged.

| Role | Size | Face |
|---|---|---|
| Meta, caption | 12 | Outfit 400–500 |
| Body | 13 / 14 / 15 | Outfit 400–600 |
| Row title, stat | 16–18 | Rajdhani 600–700 |
| Section title | 20 | Rajdhani 700 + 8px glowing accent dot (`.g-section-title`) |
| Stat value | 17–44 | Rajdhani 700, glowing in its own colour (`0 0 18px <c>66`) |
| Page H1 | 40 | Rajdhani 700, line-height 1 |
| Hero | 48–72 | Rajdhani 700 |
| Loud moment | 96–112 | Rajdhani 700 — grade letter, aggregate score, room code |

### Named rules
**The 12px Floor.** Nothing renders below 12px, except inside the player card, which
keeps its own internal scale.

**The Wordmark Exception.** Uppercase exists only in Rajdhani game wordmarks and
their CTAs (`LINEUP BUILDER`, `PLAY AGAIN`), tracked `.05em`. Labels, tabs, segments
and nav are sentence case.

**The Loud Moment.** 96–112px is for the one payoff per flow (grade reveal, aggregate
score, room code). Reusing it elsewhere stops it meaning "this is the reveal".

## Layout

- **Shell:** 220px labelled sidebar (collapses to a 72px rail; on play screens it
  starts collapsed below 1440px), then the content column: breadcrumb + account row,
  page, footer. Phone: 52px bar (menu, page title, account) and a 320px drawer.
- **No box-in-box.** Sections separate by whitespace, a single fading divider
  (`--divider-fade`) or row underlines (`--row-line`). One card per meaningful unit.
  A panel nested in a panel renders as a row card, not a second card.
- **No page scroll on entry** for app screens. Long content scrolls inside its own
  region; the page itself does not move.
- Phone: 16px side margins, touch targets ≥ 44px, primary action pinned to the bottom
  at 54px (`<PinnedAction>`).

## Elevation & depth

- **Card** (`.g-panel`): `linear-gradient(180deg,<accent>14,rgba(255,255,255,.015) 65%)`,
  `inset 0 1px 0 <accent>55`, `0 24px 60px -34px #000`, r20. No border.
- **Row card** (`.g-tile`, `.g-panel.subtle`, nested panels): `rgba(255,255,255,.03)`,
  `inset 0 1px 0 rgba(255,255,255,.05)`.
- **Selected row/card:** `linear-gradient(100deg,<c>26,<c>08 70%)` +
  `inset 0 0 0 1px <c>77, 0 0 22px -8px <c>`.
- **Modal:** r22, dim + blur backdrop, `0 30px 70px -20px rgba(0,0,0,.85)`.
- **Ambient light:** one or two large organic blobs per page (`.g-smoke` /
  `<PageGlow tint>`), blur 60–90px, opacity .05–.16, tinted by the page's context
  (archetype, player on the clock, sport); colour changes cross-fade in .5s. No blob
  behind individual panels. Admin has none.
- **Coloured numbers glow** in their own colour.
- **Cut corner + holo belong to the player card only.**

## Components

- **Primary button** `.aura-rating-btn` — 42–56px, r12, Rajdhani. Basketball: gold
  gradient with a 3.2s shine sweep. Football: flat teal with a teal glow, no sweep.
- **Secondary button** — `--fill-2` fill, primary ink.
- **Tabs** — text only, 15px/500, active `inset 0 -2px 0 <accent>`.
- **Segmented control** `.g-seg` — track `.04` r12 p4, active segment `.08`, 14px/500.
- **Selects and inputs** — underlined (`inset 0 -1px 0 rgba(255,255,255,.12)`), no box.
  They still carry no visible frame at rest.
- **Header row** `.g-dock` — a `1fr auto 1fr` grid with a fading divider beneath; no box.
- **Process steps** `.g-step` — unboxed: a glowing numbered badge in the step's colour
  over a small colour cloud.
- **System states** (`components/states/States.jsx`) — skeleton shimmer, empty state
  with a useful explanation, error with retry, 404.
- **Navigation** — `components/shell/`: grouped Play / Scout / Learn, sport switch at
  the top, active item = accent at 10% + accent icon, league items carry a colour dot.
- **The trading card** — unchanged: cut-corner notch, holo stripe, foil sweep on hover,
  rating badge. Photo attribution stays visible on the card (licence obligation).

## Product rules (fixed, from the brief)

- Dark only.
- All user-facing copy in English; code comments may be Turkish.
- Ratings are hidden while drafting unless a joker reveals them.
- Scores are shown as percentiles against a stated reference ("ranked against 28,388
  real elevens"); a bare 0–100 is not acceptable.
- Re-skin the shared `g-*` / `aura-*` / `pcard-*` vocabulary; never fork a visual
  language per page or per sport.

## Superseded (pre-2026-09 rules, kept for history)

These were confirmed earlier and are now overridden by the handoff:

- *Label tier 8.5–9.5px uppercase with a leading rule, and the 7.5–12.5px micro scale*
  → the 12px floor and one scale.
- *"Uppercase means game" / two energy registers* → one register; uppercase only in
  game wordmarks.
- *The One Root Rule (data pages keep `--text-faint: #3a3a3a`, game surfaces
  re-declare brighter)* → one warm five-step scale site-wide.
- *Solid `#131313` / `#1a1a1a` surfaces with `#262626` hairline borders and an accent
  edge bevel* → translucent fills, borderless cards.
- *Icon rail with 13px uppercase labels* → labelled sidebar.
- *"Primary CTA is gold everywhere, football included; no teal CTA variant"* → the
  handoff specifies a flat teal primary on football.
- *"Gold is the only colour that glows"* → teal CTAs, coloured stat values and the
  two-player sides also glow.
- *Holo/foil as the ancestor of every surface* → card only.
