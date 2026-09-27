# Handoff: Primary Arch — UI Redesign ("terminal'den koleksiyona")

Repo: `gokdenizgoren712-sys/NBA-Archetype` · branch `main` · scope `frontend/src`

## Overview
Full-site visual redesign of Primary Arch (NBA / G League / NCAA / Euroleague archetype site + Lineup Builder game + Football mode). Goal: remove the "terminal" look — tiny 7–10px mono labels, hairline box-inside-box panels, numbered step panels, heavy uppercase — while keeping (and spreading to data pages) the game's colors and glows so everything feels collectible. **The Panini-inspired player cards are untouchable** and are carried over as-is.

## Start here
Open **Primary Arch Screens v2.dc.html** — every screen ordered by page (groups A–G + archive), web on the left and mobile on the right. This is the latest version (card layer restored). `Primary Arch Redesign.dc.html` is the turn-by-turn history with the design rationale for each turn.

## Card layer (v2)
One level of card per meaningful unit — never a card inside a card. Card: `border-radius:20px; background:linear-gradient(180deg,<accent>14,rgba(255,255,255,.015) 65%); box-shadow:inset 0 1px 0 <accent>55, 0 24px 60px -34px #000; padding:22px 24px`, optional corner glow blob (220×180, blur 50px, opacity .14). Row cards: `border-radius:14–18px; background:rgba(255,255,255,.025–.035); box-shadow:inset 0 1px 0 rgba(255,255,255,.05–.06)`. Admin uses neutral (no accent) cards. Section titles carry an 8px glowing accent dot.

## About the Design Files
The files in this bundle are **design references built in HTML** (a canvas of mock screens), not production code. Recreate them in the existing React codebase (`frontend/src`) using its own components, routing, data hooks and CSS approach. Keep existing data flow and logic; only presentation changes.

Open `Primary Arch Redesign.dc.html` in a browser (it needs `support.js` beside it). It is a pan/zoom canvas; each mock has a badge id (e.g. `5a`). Sections are ordered newest turn on top. Several mocks are interactive (noted below).

## Fidelity
**High-fidelity** for layout, color, type, spacing, glow treatment and interaction states. **All data shown is sample data** (player names, stats, percentiles, coach grades, map positions, standings, admin rows) — wire to real sources. Screens 8a–15b were designed from the brief + screenshots without reading those specific page files; map onto the real component/data structure (see Screen map).

## Global rules (apply everywhere)
1. **No box-in-box.** Sections are separated by whitespace, a single faded divider (`linear-gradient(90deg,transparent,rgba(255,255,255,.08) 20%,rgba(255,255,255,.08) 80%,transparent)`, 1px) or row underlines (`box-shadow: inset 0 -1px 0 rgba(255,255,255,.05)`). No hairline-bordered panels, no numbered step panels.
2. **Minimum text 12px** (meta/captions), body 14–15px. Mono/uppercase micro-labels removed; uppercase only for the Rajdhani game wordmarks/CTAs (`LINEUP BUILDER`, `PLAY AGAIN`) with `letter-spacing:.05em`.
3. **One type scale** (the old game/data dual scale is merged).
4. **Glow is ambient, very light, everywhere**: one or two large blurred blobs per page (`filter: blur(80–90px)`, opacity .05–.16, organic radius `72% 28% 55% 45% / 35% 65% 40% 60%`) tinted with the page's context color (archetype, player side, sport accent). Admin is the only glow-free page.
5. **Colored numbers glow**: key stat values use their color + `text-shadow: 0 0 18px <color>66–77`.
6. **Accent by sport**: basketball gold `#FFB11B`, football teal `#3FB08C`. Primary CTA follows the sport accent. Gold additionally means trophy / #1 / rings.
7. **Cut corners + holo only on the player card**, removed from entry/mode cards.
8. **Data-refresh button removed from the shell** → lives in Admin › Data (15a).
9. **Sidebar**: 220px labeled, collapsible, gold (basketball) or gray/teal (football) active state — `PaSidebar.dc.html`. Mobile keeps the drawer (improved).
10. **League icons replaced** (NBA, G League, NCAA, Euroleague) — see `PaIcon.dc.html`.

## Design Tokens
Colors
- Background `#0b0b0b`; frame border `#1a1a1a`; raised fill `rgba(255,255,255,.04–.06)`; selected fill `rgba(255,255,255,.08)`
- Text: primary `#f2efea`, secondary `#b4afa8`, muted `#8b857e`, disabled `#5a5650`, divider-ink `#3a3a3a`
- Accents: gold `#FFB11B` (light `#ffe9b0`, on-gold ink `#14110a`), teal `#3FB08C`
- Football phases (semantic, fixed): GK `#F2C14E`, DEF `#4C9BE8`, MID `#3FB08C`, ATT `#E8654C`
- League accents: G League `#A8263F`, NCAA `#3D7EC9`, EuroLeague `#FF6900`
- Status: green `#4ade80`, yellow `#facc15`, red `#f87171`, blue `#60a5fa`, purple `#c084fc` / `#c4b5fd`, orange `#fb923c`, sky `#38bdf8`, mint `#34d399`
- Two-player sides: you `#60a5fa`, opponent `#f87171`
- Archetype colors: defined as `ARCH_COLOR` in the logic class of `Primary Arch Redesign.dc.html` (12 core roles: Engine, Ecosystem, Hub, Connector, Creator, Initiator, Anchor, Spacer, Finisher, Force, Stopper, Rim Runner) — same as the existing card colors in `PlayerCard.css`.
- Position colors: `POS_COLOR` in the same file.

Typography
- Display / numbers / wordmarks: **Rajdhani** 600–700. Page H1 40px/1; hero 48–72px; loud moments 96–112px (score grade, aggregate score, room code).
- Section title 20px Rajdhani 700; stat values 17–40px Rajdhani 700.
- UI/body: existing sans (as in repo), 12 / 13 / 14 / 15px, weights 400/500/600.

Radii: chips/segments 9–15px, buttons 11–12px, list rows 9–12px, big cards 22px, avatars 50%.
Buttons: height 42–54px. Primary basketball: `linear-gradient(100deg,#ffe9b0,#FFB11B 55%,#ffe9b0 100%)`, ink `#14110a`, `box-shadow:0 0 22px rgba(255,177,27,.35)`, animated shine sweep (3.2s ease-in-out infinite). Primary football: `#3FB08C` flat + `0 0 22px rgba(63,176,140,.4)`. Secondary: `rgba(255,255,255,.05)` fill, `#f2efea` text. Disabled: same fill, `#5a5650`.
Tabs: text-only, 15px/500, active `#f2efea` with `inset 0 -2px 0 <accent>` underline, inactive `#8b857e`.
Segmented control: container `rgba(255,255,255,.04)` r12 p4; active segment `rgba(255,255,255,.08)`.
Selected row/card: `linear-gradient(100deg,<color>26,<color>08 70%)` + `inset 0 0 0 1px <color>77, 0 0 22px -8px <color>`.
Frame: desktop mocks at 1440 wide; content padding 20–22px top, 36–40px sides.

## Screens (canvas ids)
- **0a / 1a–1c** — current-state recreation + early explorations (reference only).
- **3a / 3b** — approved direction: game home & Players grid (glow kept, boxes removed). Grid uses "Load more", left fixed filter column, in-place card expand.
- **4a–4c** — Sport select, Game mode select (desktop + mobile). Entry cards without cut corners/holo.
- **5a / 5b** — Lineup Builder draft (desktop, phone): dock, spin wheel, joker, player pool, court nodes.
- **6a** — Football players (teal sidebar, phase-tinted glow, photo attribution).
- **7a** — Football Spin & Build draft (pitch from `formations.js`).
- **8a** — Explore › Map. *Interactive:* legend chips filter archetypes (others dim to .08, page glow retints).
- **8b** — Explore › Compare. Two cards, VS + similarity, overlaid 12-axis radar, head-to-head rows (winner side glows; percentile vs 582 players).
- **9a / 9b** — Player profile, Glossary.
- **10a–10c** — Lineups, Blog, Login.
- **11a–11f** — Affinity, Football lineups, G League, Profile, Blog post, Legal.
- **12a** — Coach pick. *Interactive:* select coach → purple ring/glow, CTA becomes "SIMULATE 82 WITH <NAME>".
- **12b** — Score reveal + season: 96px letter grade (single loud moment), percentile + pool size, Quality/Coverage/Chemistry weights, standings / playoffs / awards columns, save + share + Play Again.
- **13a** — Same Screen draft (also With a Friend / Online): two side columns, pool center, glow shifts to whoever is on the clock, BAN counter, BANNED tag.
- **13b** — Football head-to-head result: aggregate 96px, legs, penalty dots, 400-replay odds bar, Rematch.
- **14a** — Lobby. *Interactive:* With a Friend (112px room code, copy buttons, opponent slot lights red when joined) / Online (search timer).
- **14b** — Football season. *Interactive:* Quick Sim / Rewrite History (38-match form strip, table with own club highlighted, awards vs original comparison).
- **15a** — Admin › Data. *Interactive:* per-source Refresh / Refresh all → "Running…". Status colors only, no glow.
- **15b** — Admin › Users & reports.
- **16a** — Football › Map. *Interactive:* phase filter (GK/DEF/MID/ATT). Dots and cluster labels use the four semantic phase colors; 24 archetype clusters.
- **16b** — Football › Compare. Two FootballCards, VS + similarity, 12 per-90 head-to-head rows (percentile within position group).
- **16c** — Football › Fundamentals. *Interactive:* 24 archetypes (4 phase columns) / Methodology tab.
- **16d** — Football › Squad fit result: 96px grade, phase scores, squad report, XI with role-fit status (Primary / Alt role / Out of role).
- **17a** — Basketball › Fundamentals › Methodology.
- **17b** — NCAA / EuroLeague prospects. *Interactive:* league switch; same layout as G League, accent swaps (NCAA #3D7EC9, EuroLeague #FF6900, G League #A8263F).
- **17c** — Game mode rules modal (ⓘ): dim + blur backdrop, 560px sheet r22, key/value rule rows, sport-accent CTA.
- **17d** — Register / Forgot / Reset. *Interactive:* step switch. Centered 400px form, filled inputs (no borders), inline hint/error line.
- **17e** — Admin › Content (articles list).
- **17f** — Admin › Article editor (toolbar, body, embedded player card block, right meta column).
- **17g** — Admin › Corrections (current → suggested, source, Reject / Apply).
- **18a** — Football mode select (teal version of 4b).
- **18b** — Football Spin & Build idle: formation picker (5 shapes, pitch preview with phase-colored nodes), wheel-pool league chips, weekly leaderboard.
- **18c** — Contact: info column + form with topic chips.
- **18d** — System states: 404, empty filter result, loading skeleton (paSkel keyframes), error with retry.
- **19a–21g** — Mobile (390×844): drawer, players + filter sheet, profile, explore map/compare, score reveal, coach pick, same-screen draft, lobby, football players/H2H/season/map, sign in, lineups, glossary accordion, blog index/post, admin monitor. Primary action pinned bottom (54px), 16px side margins, hit targets ≥44px.
- **RankIt mark** — use `RankItMark` from `rankit/redesign/BrandMark.jsx` (chamfered card + cut-out star), never a generic star icon.

## Interactions & Behavior
- Hover on cards: `translateY(-4px)`, `transition: transform .25s`.
- Map dots: opacity transition .3s on filter.
- Card expand in grids is in place (existing behavior).
- Two-player: active side glow opacity ~.13, inactive ~.05; inactive roster column at .7 opacity.
- Mobile: existing drawer navigation, improved spacing; hit targets ≥44px.

## Components in bundle
- `PlayerCard.dc.html` — basketball Panini card (unchanged look; radar labels moved from SVG text to positioned HTML spans for rendering).
- `FootballCard.dc.html` — football card.
- `PaSidebar.dc.html` — shell sidebar (`active`, `sport` props).
- `PaIcon.dc.html` — icon set incl. new league marks.
- `archetypes/*.png` — archetype art (from `frontend/public/archetypes`).

## Screen map (canvas → repo)
| Canvas | Repo files |
|---|---|
| 3a | pages/LineupGame.jsx, game/CourtBoard.jsx, game/LeaderboardPanel.jsx, game/HowItWorksPanel.jsx, game/eras.js |
| 3b | pages/Players.jsx |
| 4a–4c | pages/SportSelect.jsx, pages/GameModeSelect.jsx |
| 5a–5b | pages/LineupGame.jsx, game/PlayerRow.jsx, game/JokerBtn.jsx, game/InlineSpin.jsx, game/CourtBoard.jsx |
| 6a | pages/football/FootballPlayers.jsx, game/football/theme.js |
| 7a | pages/football/FootballGame.jsx, game/football/Pitch.jsx, game/football/formations.js |
| 8a–8b | pages/ExploreHub.jsx, pages/Explore.jsx, pages/Compare.jsx |
| 9a–9b | pages/PlayerProfile.jsx, pages/Glossary.jsx, pages/FundamentalsHub.jsx |
| 10a–10c | pages/Lineups.jsx, pages/Blog.jsx, pages/Login.jsx |
| 11a–11f | pages/Affinity.jsx, pages/football/FootballLineups.jsx, pages/GLeague.jsx, pages/Profile.jsx, pages/BlogPost.jsx, pages/legal/LegalPageLayout.jsx |
| 12a–12b | game/CoachPicker.jsx, pages/LineupGame.jsx (ScoreReveal), game/SeasonSimPanel.jsx |
| 13a–13b | pages/SameScreenGame.jsx, pages/WithAFriendGame.jsx, pages/OnlineGame.jsx, pages/football/FootballVersus.jsx |
| 14a–14b | pages/WithAFriendGame.jsx, pages/OnlineGame.jsx, pages/football/FootballSeason.jsx |
| 15a–15b | pages/Admin*.jsx (verify actual filenames) |
| 16a–16d | pages/football/FootballMap.jsx, FootballCompare.jsx, FootballGlossary.jsx, FootballAbout.jsx, FootballGame.jsx (result) — verify filenames |
| 17a–17g | pages/FundamentalsHub.jsx, NCAA / EuroLeague pages, GameModeSelect.jsx (modal), Register / ForgotPassword / ResetPassword, Admin*.jsx — verify filenames |
| Shell | App.jsx (sidebar, remove data-refresh), components/Footer.jsx, aura.css, index.css |

## Suggested implementation order
1. Tokens + type scale in `index.css` / `aura.css`; remove mono micro-labels and box-in-box panel classes.
2. Shell: new sidebar, move data-refresh to admin, new league icons.
3. Shared patterns: tabs, segmented control, selected-row, ambient glow blob, primary/secondary buttons.
4. Pages in canvas order; game screens last.

## Reference
`reference/original-design-brief.md` — the original brief (page list + fixed rules).
