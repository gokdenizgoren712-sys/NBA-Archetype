# Primary Arch — UI redesign brief

You are redesigning **Primary Arch** (primaryarch.net), a sports scouting platform
that scores players by **role identity** rather than raw statistics. Two
independent sports live under one shell: basketball and football. The current
interface works and is fully built — this is a redesign of an existing product,
not a greenfield one.

Stack: React + Vite, plain CSS + Tailwind utilities, no component library.

---

## The shell (every page sits inside it)

- **Left icon rail**, fixed, ~64px. Icon + short label per item. The rail's
  contents swap with the sport you are in.
- **Top bar**, 48px: logo (PRIMARY ARCH) + a sport chip, then a right cluster
  with a data-refresh button and the account button.
- **Footer**: copyright + Privacy / Terms / Contact / Affiliate Disclosure.

Rail — basketball: Game · NBA · G-Lg · NCAA · EUR · Lineups · Explore · Blog · About
Rail — football: Game · Players · Chemistry · Explore · Blog · About

---

## FIXED — do not change these

These are product or legal constraints, not aesthetic preferences.

1. **Dark only.** There is no light theme and none is wanted. Base `#0b0b0b`,
   surface `#131313`, elevated `#1a1a1a`, border `#262626`.
2. **Two accents, one per sport.** Basketball `#FFB11B` ("yamabuki"), football
   `#3FB08C`. The accent follows the section you are in. Separately, `#FFB11B`
   *always* means trophy/champion/first place even on football pages — it is
   the medal colour, not the basketball colour, in that context.
3. **Football phase colours are semantic**, reused across pitch, cards, lists
   and charts. Keeper `#F2C14E`, defence `#4C9BE8`, midfield `#3FB08C`, attack
   `#E8654C`. A reader learns them once; they cannot be re-assigned per page.
4. **Type**: Rajdhani for display/logo/numbers, Outfit for body. Both already
   loaded.
5. **All user-facing copy is English.** (Code comments are Turkish — ignore
   them.)
6. **Photo attribution stays on the card.** Every player photo is Creative
   Commons and carries photographer + licence, plus "edited" where the
   background was removed. This is a licence obligation. It may be restyled or
   made smaller, never removed or hidden behind an interaction that a reader
   can miss.
7. **Ratings are hidden while drafting.** In the game you see role, position
   and a per-90 line — never the overall number, unless a joker reveals it.
   That is a game rule.
8. **Scores are shown as percentiles against a stated reference**, e.g.
   "ranked against 28,388 real elevens". The reference count is part of the
   claim; a bare 0–100 number is not an acceptable substitute.
9. **A shared class vocabulary already spans both sports** — `g-*` (panels,
   docks, tiles, rows, steps, score heroes), `aura-*` (buttons, inputs, glows),
   `pcard-*` (player cards). Re-skin these primitives; do not fork a new visual
   language per page, or the two sports drift apart again.

---

## FLEXIBLE — open to redesign

- Card density and layout, both the grid card and its expanded state.
- The three-zone header bar (`g-dock`: left identity, centre action, right
  status). It is used on every game screen and could be rethought wholesale.
- Where the leaderboard lives, and how a "you vs everyone" comparison reads.
- Navigation on small screens. The rail is currently the same on phone and
  desktop, which is the weakest part of the shell.
- Spacing scale, radii, borders, elevation.
- **The decorative layer is heavy and is the thing most worth questioning**:
  `aura-blob` radial glows, holo/foil sheens, dot grids and smoke gradients
  appear on nearly every panel. Some of it carries the brand; a lot of it is
  noise. Cutting it back is welcome if the result still feels like a product
  rather than a spreadsheet.
- Charts and data display generally. Most are hand-rolled bars.

### Known problems worth solving

- The players page renders **600 cards at once**, no pagination or
  virtualisation. It is slow and, on a phone, endless.
- Filter rows are long pill strips that wrap unpredictably.
- Empty and loading states are mostly a line of muted text.

---

## Page inventory

Numbered for reference. Pages marked **[core]** are where most of the traffic
and most of the value is — prioritise them.

### A. Entry

1. **Sport select** `/` — full-screen choice between basketball and football.
   The first thing anyone sees; currently two large cards.

### B. Basketball

2. **Game — mode select** `/basketball/game` — four mode cards (Spin & Build,
   Same Screen, With a Friend, Online), each with an ⓘ that opens a rules
   modal.
3. **Lineup Builder (solo)** `/basketball/game/single` **[core]** — the main
   game. Idle screen: era picker + a numbered "Draft Process" walkthrough +
   live leaderboard. Draft screen: three columns — process panel, court matrix,
   leaderboard. Then coach pick, then a season simulation (82 games, standings,
   awards, playoffs, champion) and a final score hero.
4. **Same Screen** `/basketball/game/same-screen` — two players, one device,
   snake draft, best-of-7 series.
5. **With a Friend** `/basketball/game/friend` — room code, two devices, live
   draft over a websocket.
6. **Online** `/basketball/game/online` — matchmaking queue into the same room.
7. **NBA players** `/basketball/players` **[core]** — filterable card grid,
   expandable cards, archetype profiles.
8. **Player profile** `/basketball/players/:name` — one player in depth.
9. **Lineups** `/basketball/lineups` — five-man lineup builder + compatibility.
10. **Explore hub** `/basketball/explore` (+ `/compare`, `/affinity`) — three
    tabs: explore, head-to-head compare, archetype affinity matrix.
11. **Fundamentals hub** `/basketball/glossary` (+ `/about`) — two tabs:
    glossary of the 12 archetypes, and the methodology/limits page.
12. **G-League** `/basketball/gleague`, **13. NCAA** `/basketball/ncaa`,
    **14. EuroLeague** `/basketball/euroleague` — same card grid as (7) with
    prospect grades, floor/ceiling projections and NBA comparables. Each league
    has its own accent colour in the rail.

### C. Football

15. **Game — mode select** `/football/game` — four mode cards, mirrors (2).
16. **Spin & Build (solo)** `/football/game/single` **[core]** — the main
    football game. Idle: formation picker, wheel-pool league filter, a numbered
    "Draft Process" walkthrough and a live leaderboard. Draft: pitch (a real
    pitch with positioned slots) + spun squad list + a bench strip of seven,
    and on wide screens a third leaderboard column. Then a manager pick, a
    squad-fit score hero, a squad report, and a season simulation with two
    modes (Quick Sim, Rewrite History).
17. **Head to head** `/football/game/same-screen` · `/friend` · `/online` —
    one page, three modes. Same Screen runs a local draft; the room modes run
    a server-driven draft over a websocket. Result is a two-legged tie with
    aggregate, extra time and penalties, plus a 400-replay probability.
18. **Football players** `/football/players` **[core]** — card grid, cut-out
    photos, 24 archetypes, five leagues, ten seasons.
19. **Chemistry** `/football/lineups` — build an XI, see how it fits, compare
    against real elevens.
20. **Explore / map** `/football/map` — archetype map, a 2-D scatter of the
    role space.
21. **Compare** `/football/compare` — two players side by side.
22. **About** `/football/about` and **23. Glossary** `/football/glossary` —
    methodology and the 24-archetype dictionary, both generated from the
    scoring config so they cannot drift.

### D. Account and content

24. **Login** `/login`, **25. Register** `/register`, **26. Forgot password**
    `/forgot-password`, **27. Reset password** `/reset-password`.
28. **Profile** `/profile` — saved squads and rosters.
29. **Blog index** `/blog` and **30. Blog post** `/blog/:slug`.

### E. Legal

31. Privacy policy, **32.** Terms of service, **33.** Contact, **34.**
    Affiliate disclosure. Plain long-form text pages, shared layout.

### F. Admin (internal, lowest priority)

35. Articles list, **36.** Article editor, **37.** Users, **38.** Corrections,
    **39.** Lineup moderation, **40.** Photo layout (adjust how a cut-out sits
    in a card).

### G. RankIt — out of scope for this pass

`/rankit/*` (about twenty screens) is a **separate product** sharing the same
codebase: a social match diary. It already has its own design system and its
own set of design boards. Do not restyle it here; it would only create a second
inconsistency. Brief it separately if you want it touched.

---

## What a good answer looks like

The two sports must feel like one product with two accents — that is the whole
point of the shared primitives. Today they mostly do, because the football side
was deliberately built on the basketball side's vocabulary.

The sharpest open question is the decorative layer: how much of the glow, holo
and grain earns its place, and what the interface looks like if most of it goes
and the typography and spacing carry the brand instead.

Second sharpest: the phone. The shell, the card grid and the game screens were
all designed at desktop width, and it shows.
