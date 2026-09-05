# RankIt Mobile — Screen inventory & design constraints

Brief for a UI/UX mockup pass on the **Android app** (`RankItPrototype.jsx`,
375×812 baseline, dark only). Derived from the shipped source on 2026-09-06, not
from memory.

Companion docs: [../DESIGN.md](../DESIGN.md) (the visual system),
[../PRODUCT.md](../PRODUCT.md) (what the product is for), [mobile.md](mobile.md).

Two parts: **A. every screen and overlay that exists**, and **B. what a redesign
must not change**.

---

# A. Screens

## A0. Persistent chrome

Present on every tab, above/below the scrolling content.

| | |
|---|---|
| **Top header** | RankIt wordmark + "BY PRIMARY ARCH" lockup, notification bell with unread dot. Hides on scroll down (`header-hidden`). |
| **Bottom nav** | Five slots: Home · Discover · **Rank** · Activity · Profile. Rank is the centre gold diamond and is an **action, not a destination** — it opens a sheet. |
| **Floating search** | Collapsed 48px circle above the nav; expands to a pill on tap. Hidden while any sheet is open. |
| **Toast** | Transient pill above the nav. Two tones: success (green) and error (red). Auto-dismisses. |

## A1. Home — "Tonight on RankIt"

| Section | Notes |
|---|---|
| Sport chips | All · Basketball · Football · Olympics (Olympics is disabled/empty today) |
| Hide-scores toggle | Blurs every scoreline on the surface |
| **Hero carousel** | Horizontally snapping collectible cards, dot indicators. The signature screen. |
| Day grouping | Cards grouped under a day title, each with a "See all" |
| Community reviews | "POPULAR ACROSS RANKIT" — avatar, who rated what, stars, review excerpt |
| **Empty** | "No {sport} in this RankIt day" |
| **Loading** | Card skeletons (`MatchCardSkeleton`) |

## A2. Discover

| Section | Notes |
|---|---|
| Page title | "FIND YOUR NEXT MATCH" / Discover |
| **Filter panel** | "QUICK FILTERS" + live match count. Two pill rows: **Sport** (All/Basketball/Football), **Status** (All/Live/Upcoming/Finished). Plus a "Season & competition" row that expands (`is-open`) into two selects. A "Clear N" reset appears once filters are active. |
| Popular this week | "COMMUNITY PICKS" — 2-column card grid |
| Popular lists | "CURATED BY MEMBERS" — list stack |
| **Empty** | Per-filter empty state |

## A3. Rank (centre diamond) — *sheet*

Bottom sheet. Search a **finished** match to rate. Quick-date row, results as
mini-crest rows. This is the only place the diamond leads.

## A4. Activity

Two sub-tabs: **Friends** and **Diary**.

**Friends** — activity feed: avatar, "@user rated X", stars, quoted review, "Open match".
Empty: "No activity yet".

**Diary** — four filters: **Watched · Watchlist · Classics · Lists**, and for the
first three a view toggle: **Timeline** or **Cards**.

| Filter | Shape |
|---|---|
| Watched (Timeline) | 28-day heat strip, then month-grouped rows: date, mini crests, teams, score, stars |
| Watched (Cards) | 2-column collectible grid with club-colour gradient, score, stars, Classic stamp |
| Watchlist | Sort select (Match date / Added / Competition) + card grid |
| Classics | Same as Watched, filtered |
| Lists | List stack, tap opens the list entity sheet |

Empty: "Your diary is empty".

## A5. Profile

Two tabs: **Overview** and **Settings**.

**Overview** — avatar + handle + bio line; taste chips (sports + recent classics);
six stat tiles (matches / classics / diary entries / watchlist / favourites / lists);
"Four favourites" grid; "Your latest rankings" rows.
Empty: "No favourites yet", "Your diary is empty".

**Settings** — *new, needs design attention*

- **PERSONALISATION**: Broadcast country (Auto / United Kingdom / United States / Türkiye),
  Hide scores by default (toggle), Reduce motion (toggle)
- **LEGAL**: Privacy policy · Terms of service · Update RankIt

---

## A6. Overlays — full-screen sheets

All rise from the bottom, have a drag-to-dismiss grab handle, and a circular
close button. **Five open from the root shell:**

### 1. Match detail — *the most important screen in the app*

Hero band (competition · stage, status badge, both crests, score/VS, date, season),
then tabs: **Match** and **Community**. (A third, **Watchalong**, appears on the
web; the phone routes it through the Community tab today — worth unifying.)

**Match tab**
- Summary paragraph
- Broadcast panel: "WATCH IN {country}" / channels / confidence line, or
  "Not covered in your region yet"
- Timeline row: kick-off time, "Scheduled" / "Full time", link to Community
- **Confirmed lineup** — per team: **formation badge**, **manager**, starting XI,
  bench. *Falls back to "SEASON SQUADS" when no lineup is announced.*
- Actions: Add to watchlist (upcoming only) · Add to favourites · **Add to list**
  (expands an inline list picker)

**Community tab** (finished matches)
- Three stat tiles: community rating / reviews / classics
- Consensus block: community POTM, tag cloud with the dominant tag highlighted
- "YOUR MATCH DIARY" head — Update vs Log, LOGGED badge
- **Rating panel**: half-star capable star row + **Classic stamp**
- Tag picker: 9 sport-specific tags, max 3, with a More/Less expander
- **POTM picker** — expands, grouped by team
- **Respect picker** — expands, grouped by team, max 2, cannot overlap POTM
- Review textarea (4000 chars)
- Options row: Contains spoilers · Log as rewatch · Visibility select (Public/Followers/Private)
- Save button — four states: idle / saving / saved / error
- Post-save share card
- **Review feed**: per review — author, stars, spoiler gate, like, comments, replies

**Loading**: dedicated skeleton sheet. **Not-played**: "This match has not been played yet."

### 2. Competition sheet

Header (country · season / name / sport), then three tabs:

| Tab | Content |
|---|---|
| **Table** | Standings: #, crest + short name, P, GD (or +/− for basketball), PTS |
| **Players** | Ranked list: position number, photo/initials, name, team, "N POTM · N Respect" |
| **Matches** | **Matchweek strip** (horizontal numbers 1…38, opens on the round being played), then that round's fixtures |

Empties: "No league table for this stage", "No matches in this round", "Popular players will appear here".

### 3. Entity sheet — player / team / member / list

Hero with entity-colour mark, kind eyebrow, title, subtitle. Follow / Add favourite
actions. Body varies by kind (stats, squad, member's entries, list contents), then
related matches.

### 4. Global search

"SEARCH ALL OF RANKIT". Search field, kind chips (All · Matches · Players · Teams ·
Members · Lists). Empty state carries "TRENDING NOW" shelves and "PEOPLE TO FOLLOW".

### 5. List creator

Title field, "Ranked list" checkbox, selectable match rows, Create button.

### 6. Notification centre

Opened from the bell. Filters: All · Matches · Social. Rows with a kind dot.
Empty: "Nothing new here".

### 7. Watchalong

"LIVE WATCHALONG" status card, message log, compose row.
Empty: "Nobody has said anything yet".

## A7. Layers *inside* the match sheet

These expand in place rather than opening a new sheet — worth designing explicitly:

- POTM picker (team-grouped grid)
- Respect picker (team-grouped grid)
- Tag More/Less expansion
- Add-to-list picker
- Action toast

## A8. States that need designing, not decorating

Every list has an empty state, and a new account sees **all of them at once**:
empty diary, empty watchlist, empty lists, empty watchalong, zero community
ratings. This is the first-run experience and it is currently the weakest part
of the app. Named empties in the code: *No activity yet · No favourites yet ·
No fixtures · No league table for this stage · No matches in this round ·
Nothing new here · Popular players will appear here · Your diary is empty ·
No {sport} in this RankIt day · Nobody has said anything yet.*

Also: loading skeletons, the four save states, and offline/error notes.

---

# B. What must not change

## B1. Tokens — use these, add none

**Colour** (14, and only these)

| Role | Value |
|---|---|
| gold | `#ffb11b` |
| gold-ink (text on gold) | `#17120a` |
| green | `#3fb08c` |
| ground-app | `#090a0b` |
| surface-sunken | `#0c0d0f` |
| surface | `#121315` |
| surface-card | `#151618` |
| surface-sheet | `#1a1b1e` |
| line | `rgba(255,255,255,.09)` |
| text-primary | `#eceded` |
| text-secondary | `#c9cccd` |
| text-muted | `#9aa0a6` |
| text-faint | `#7f868b` |

**Type** — Rajdhani for display/headline/title/label, Outfit for body.
Five roles: display 31 · headline 21 · title 13 · body 12 · label 9/700/`.14em`.

**Radii** — pill 999 · sm 10 · md 14 · lg 18 · xl 22 · **crest `18px 18px 21px 21px`**.
**Spacing** — 4 · 8 · 13 · 18 · 26.

## B2. The rules that outrank taste

1. **The One Gold Rule.** Gold marks at most one thing per viewport region. A
   screen with a gold nav item, a gold CTA, a gold badge and a gold eyebrow has
   no accent — it has a colour scheme.
2. **The 4.5 Floor.** `#555`, `#666`, `#777` are **banned for text** (2.66:1,
   3.45:1, 4.42:1 — all below AA). Use the four named text tokens and nothing else.
3. **Club colour belongs to the club.** `--home` / `--away` come from the API.
   Never hardcode a team's colour, and never use a club colour to mean something
   in the UI.
4. **One border weight, one border colour.** 1px, `line`. There is no second.
5. **Gold hairlines are reserved for Instant Classic.** The card's notched corner
   hairlines turn gold *only* for that promotion. Using gold hairlines anywhere
   else destroys the single best detail in the system.

## B3. Shapes that are the brand

- **The crest shield** — a 45°-rotated square with asymmetric radii
  (`18px 18px 21px 21px`) whose badge counter-rotates so the club mark reads flat.
  A true square would read as a diamond; the asymmetry makes it a *shield*.
  **Keep it.** But know the constraint: rotating costs **√2 ≈ 1.41× the width**,
  so a 62px shield occupies 87.7px. Getting this wrong clipped every card until
  it was fixed — size shields from their **rotated** footprint, not their CSS size.
- **The card is a collectible, not a row.** 22px radius, clipped top-right and
  bottom-left corners with hairlines across the notches, club-colour gradient,
  diagonal holographic overlay. Discover and Diary may use denser grids; they may
  not become a list of table rows.
- **The Rank diamond** is the centre of the bottom nav, floats above the bar, and
  is the only gold shape there.

## B4. Product truths the design must keep telling

These are not stylistic — changing them makes the product lie.

- **"CONFIRMED LINEUP" and "SEASON SQUADS" are different things** and must stay
  visually distinct. The season squad is 40 names; the lineup is the real eleven.
  Never label a season squad "Starting XI".
- **"Can change until kick-off"** stays next to any announced lineup.
- **Broadcast confidence is shown**, not hidden: a competition-level default says
  "typical coverage", and an uncovered region says so rather than showing another
  country's channels.
- **Empty means empty.** No invented ratings, no placeholder broadcasters, no
  fake lineups. A dash or an honest sentence, never filler.
- **Spoilers are first-class**: hide-scores, spoiler-gated reviews, blurred
  scorelines. A diary is read *before* watching too.

## B5. Interaction floors

- Tap targets: nothing interactive below **44×44** (WCAG 2.5.5). The league label
  on a card was 36×13 and was unhittable — that class of mistake must not return.
- Text: nothing below **10px** except the wordmark lockup and section eyebrows.
- Sheets: drag-to-dismiss handle + a visible close control. *Currently missing
  `role="dialog"`, Escape and a focus trap — the redesign should assume these exist.*
- `prefers-reduced-motion` is respected, and Settings can disable motion independently.

## B6. Scope boundaries

- **All user-facing copy is English.** (Code comments are Turkish; that is
  deliberate and unrelated.)
- **Dark only.** There is no light theme and none is planned.
- **Both surfaces move together.** Anything designed here has a web counterpart
  that must be built in the same pass — see the working agreement in PRODUCT.md.
- Confirmed lineups are **football only**; basketball falls back to the season squad.

---

## What is genuinely open

Where a redesign has the most room, in order:

1. **First-run.** A new account meets ten empty states simultaneously. Nothing
   currently carries the product's promise into that moment.
2. **The Community tab's density.** Rating, Classic, tags, POTM, Respect, review,
   options, save, feed — one column, top to bottom, ~9 blocks.
3. **The match card's quiet state.** Upcoming cards have less to say than finished
   ones and currently look like finished cards with the information removed.
4. **Discover's filter panel.** Functional, visually the least considered surface.
5. **Settings.** Brand new, currently plain rows.
