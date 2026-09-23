# RankIt mobile — design handoff

> Status (2026-09-14): implementation in progress. The latest user-supplied `RankIt Redesign.dc.html` is now the canonical visual reference. It has 46 screen-ID blocks, including spec and superseded boards, not 46 completed app screens. The previous reference is preserved in `source-history/RankIt Redesign.before-2026-09-14.dc.html`.
> Live prompt checklist (updated 2026-09-14): `docs/RANKIT_REDESIGN_PROGRESS_2026-09-14.md` contains all 39 original prompt blocks, per-prompt progress, acceptance checkboxes and the current checkpoint (7.01). Use that record to continue; the root `PROMPTS.md` is the older, shorter sequence.
> Source of truth for visuals: the latest `RankIt Redesign.dc.html`; this handoff and the supplied expanded prompts describe behavior and sequencing. Source of truth for the Primary Arch mark: `BrandIcons.jsx` (used verbatim).
> The expanded user prompt attachment, transcribed in the live checklist, is not the older root `PROMPTS.md`. HTML-only additions 9a/9b have separate HTML-9A/HTML-9B acceptance records; they do not renumber the 39 prompts or mean phase 9. Unspecified geometry, unlock conditions and server capabilities must not be invented. One approved change to the Primary Arch mark remains the rule inset in §8.2 (`M 4 24 H 44` → `M 6 24 H 42`).

Companion to `frontend/src/rankit/DESIGN.md`. That file is still the law; this file is the **build order and the contracts** for the redesign in `RankIt Redesign.dc.html` (turn 2 = redesigned core surfaces, turn 3 = the surfaces that didn't exist).

Read this top to bottom before opening the repo. It is written to be handed to Claude Code as-is.

---

## 0. How to use this with Claude Code

Do **not** ask for "the redesign" in one prompt. The work has one true dependency (`MatchCard`) and everything else is leaves hanging off it. One prompt per phase, in the order below, each ending in a running app.

### Current phase numbering (PROMPTS.md)

Use this sequence when a user names a phase. Section numbers in this document are not phase numbers: §8 describes marks, while **phase 8 means states**.

| Phase | Deliverable |
|---|---|
| 0–5 | Orientation; card; flagged Home; Diary/Discover; match sheet; shell |
| 6 | Collectible result `6a`, the shared destination of rating flows |
| 7 | New surfaces, separately: Profile `6b` / pushed Standing `2p`, reviews/thread, competitions, search, alerts, settings, lists/member, first run, expanded and full-time Companion |
| 8 | Loading, empty, error, offline and honest pending-save states |
| 9 | Sheet accessibility, nested dismissal, focus and Android Back |
| 10 | Skin picker, shared skin variables, portrait/wide share composer |
| 11–12 | Marks; Android launcher icon |
| 12.5 | Discover filter drawer `6c`, separate from Discover at rest |
| 13 | Motion, haptics, notification channels and spoiler-safe deep links |
| 14 | End-to-end acceptance, including all six navigation contracts |

The prompt says “seven skins” but enumerates **eight**: Default, Broadsheet, Holofoil, Ember, Ink, Gilt, Turf and Floodlight. Preserve all eight named options; the last two are locked. Their unlock conditions require actual product rules, not fabricated thresholds. The size matrix is therefore **16 skin/size combinations**.

The paths in PROMPTS.md are historical: the actual board and handoff are in `Primary Arch UI Redesign/`, not the repository root or `docs/`.

### Historical phase list — retained for earlier work, not current numbering

Original phase prompts:

1. **`MatchCard` only.** "Build `MatchCard` per HANDOFF.md §2. Do not touch any screen yet. Render it in isolation at all six size presets from §2.5 and show me."
2. **Home behind a flag.** "Replace the home hero card with `MatchCard` behind `RANKIT_NEW_CARD`. Old path must still work with the flag off."
3. **Diary + Discover.** "Move the diary shelf and discover grid onto `MatchCard`. Apply the grid rule in §4.1 — this is the regression DESIGN.md already closed once."
4. **Match sheet.** "Rebuild the sheet's three tabs per §3.2 including the Community collapse from nine blocks to three."
5. **Shell.** "Header 64 / nav 73, gold active state, `RANK` diamond opens quick-rate (§3.4)."
6. **New surfaces.** One prompt each: companion tab (before/live states), competition matches, competition players, search, notifications, settings, lists, public profile, all-reviews list.
7. **States.** "Skeletons, empty, offline per §5. No spinners."
8. **Sheet a11y.** "`role="dialog"`, `aria-modal`, Escape, focus trap, restore focus on close." (This is an open item in `github.md`; it is not cosmetic.)

Rules for every phase: no new colours, no new fonts, no new stylesheet. If a value you need isn't in §1, stop and ask rather than inventing it.

---

## 1. Tokens — the whole set

Nothing outside this table appears in any screen. If you find yourself typing a hex that isn't here, it's a bug.

### Ground and surface
| Token | Value | Use |
|---|---|---|
| ground | `#090a0b` | phone background |
| ground-web | `#0b0c0e` | web only (`--ri-bg` is undefined in `rankit-web.css` — use this) |
| surface | `#121315` | panels, inactive chips, dashed placeholders |
| raised | `#151618` | cards, list rows, tiles |
| sheet | `#1a1b1e` | bottom sheets, side drawer |
| skeleton | `#1c1d21` | loading blocks on `surface` |
| line | `rgba(255,255,255,.09)` | the only border weight — 1px |
| line-strong | `rgba(255,255,255,.14)` | crest edges, active chip, drawer edge |

### Text — four names, no others
| Token | Value | Use |
|---|---|---|
| ink | `#eceded` | titles, scores, primary values |
| ink-2 | `#c9cccd` | body copy, secondary labels |
| ink-3 | `#9aa0a6` | supporting text, inactive labels |
| ink-4 | `#7f868b` | eyebrows, meta, disabled |

`#555` / `#666` / `#777` were removed in 0.5.2. Do not reintroduce them.

### Gold — one per viewport region
`#ffb11b` base · `#ffe9b0` highlight · `#e08f00` shadow · `#17120a` ink-on-gold

Budget: **the nav diamond is chrome and does not count.** Besides it, one gold thing per region. Where the Classic stamp is present, the primary CTA in that region goes neutral.

### Heat — 5 steps, categorical, free to use
`#2f5480` COLD · `#5b4fa8` FLAT · `#9a3f96` GOOD · `#d43a63` GREAT · `#f5402e` HOT

Poles are one syllable each — **COLD** and **HOT**. "Incandescent" was cut: too long for a 9px label and it broke the cold↔hot pairing.

Unfilled step: `rgba(255,255,255,.12)`. Heat is a third palette added with the owner's written permission. It carries: heat rows, streak rings/bars, diary strip, live pulse, notification severity, taste overlap. **Never** on nav, CTAs or as the only carrier of meaning — the numeric value ships beside it (Settings has a toggle that enforces this).

### Semantic
`#3fb08c` confirmed / saved / shield-on. Nothing else is green.

### Club colour
Arrives per card as `--home` / `--away`, from the API. Never hardcoded in a component. Crest ink is a prop (`homeCrestInk` / `awayCrestInk`) because light kits like Tottenham's need `#101318`.

### Type
- **Rajdhani** 500/600/700 — the product speaking: labels, eyebrows, scores, club names, nav, buttons, table cells, stamps. Uppercase eyebrows at `letter-spacing:.14em`.
- **Outfit** 300/400/500 — a human speaking: reviews, descriptions, helper text, timestamps in prose.
- Floor **9px**, one exception: thumbnails in the skin grid (owner-approved).
- Scale in use: 31 page title · 21 section/score-lg · 17 row-score · 15 score-sm · 13 title/label · 12 body/meta · 9 eyebrow.

### Geometry
- Radii: card `22px` · panel `18px` · tile `14px` · control `10px` · chip `999px`.
- Spacing rhythm: `26` page gutter · `18` block · `13` inner · `9` tight.
- Shell: status `44` · header `64` · nav `73` · FAB 46px rotated 45° at `bottom:26px`.
- Targets: `44×44` minimum, filter pills `48`. Half-star hit slices alternate `24/19px`.
- One shadow: `0 14px 34px rgba(0,0,0,.28)`. Sheets add `0 -22px 80px #000`.

---

## 2. `MatchCard` — the one component that matters

Everything else in the redesign is layout around this. Ship it alone first.

### 2.1 Notches — the signature
```css
clip-path: polygon(
  0 0, calc(100% - 22px) 0, 100% 22px,
  100% 100%, 22px 100%, 0 calc(100% - 22px)
);
```
Then a **hairline across each cut** — this is the element that turns gold on an Instant Classic, *not* the card border:
```css
/* top-right */ position:absolute; top:11px; right:-4.5px; width:31.1px; height:1px;
                transform:rotate(45deg);
/* bottom-left */ bottom:11px; left:-4.5px; /* same width/height/rotate */
```
Default `rgba(255,255,255,.22)`; `#ffb11b` when `classic`. At smaller cut sizes scale proportionally (12px cut → 15.6px hairline at 5.5/-2.3px).

### 2.2 Ground
```css
background: linear-gradient(155deg,
  color-mix(in oklab, var(--home) 44%, var(--card-base)) 0%,
  var(--card-base) 54%,
  color-mix(in oklab, var(--away) 34%, var(--card-base)) 100%);
```
Sheen overlay, **68°** — not 112°:
```css
repeating-linear-gradient(68deg, rgba(255,255,255,.055) 0 2px, transparent 2px 11px)
```

### 2.3 Crest shield — the 0.5.2 fix
The shield is a square rotated 45°, so its **bounding box is `side × 1.414`**. Size the column off that or the badges clip.
```
column:  calc(var(--crest) * 1.414)     /* 88px at the 62px default */
shield:  var(--crest)                    /* 62px default */
radius:  calc(crest * .29) x2, calc(crest * .34) x2
         — derive it; a hardcoded 18/21 becomes a circle
           once crestSize drops near 38
badge:   transform: rotate(-45deg); font-size: calc(var(--crest) * .23)
fill:    linear-gradient(135deg,
           color-mix(in oklab, var(--home) 82%, #0b0b0b),
           color-mix(in oklab, var(--home) 30%, #0b0b0b))
```

### 2.4 Layout order, top to bottom
1. Header row — competition eyebrow + status pill. `min-height:37px`.
2. **Art region** — `height: artHeight` px. **Never `flex:1`.** A card is not allowed to be mostly empty air; if content is short, the card is short.
3. Score band — home short name · (score, when POTM occupies the art) · away short name.
4. Heat row — label + value + 5 bars. Hidden when `spoiler`.
5. Reveal strip — only when `spoiler`.
6. Footer — `margin-top:auto`, `44px`, or `52px` when the stamp is present.

### 2.5 Props
| Prop | Type | Note |
|---|---|---|
| `comp` | string | competition eyebrow |
| `statusLabel` | string | defaults `FULL TIME` / `UPCOMING`; forced to `PLAYED` under spoiler |
| `finished` | bool | false → shows `kickoff` + `VS` |
| `homeAbbr` `awayAbbr` | string | 3-letter badge |
| `homeCrestInk` `awayCrestInk` | colour | `#fff` or `#101318` for light kits |
| `homeShort` `awayShort` | string | score band |
| `homeName` `awayName` | string | optional second line; omit when equal to short |
| `homeScore` `awayScore` | string | strings, not numbers — `112–108` must not be formatted |
| `kickoff` | string | upcoming only |
| `heat` | 0–5 float | `Math.round` picks the filled step count |
| `heatLabel` | string | overrides the ramp name (`EXPECTED`, `PULSE RISING`) |
| `compact` | bool | vertical layout for ≤170px contexts — see §2.7 |
| `cut` | int px | notch size; hairline scales from it automatically |
| `crestSize` | int px | shield side; column is this × 1.414 |
| `homeCrestSlot` `awayCrestSlot` | string | image-slot id for a real crest; falls back to the abbr |
| `classic` | bool | gold hairlines + footer stamp |
| `spoiler` | bool | blurs score, hides heat, shows reveal strip |
| `ratings` | string | footer right |
| `footNote` | string | footer left when not classic |
| `artHeight` | int px | **required per context** — see presets |
| `scoreSize` | int px | football and basketball scores cannot share one size |
| `potm` | bool | silhouette replaces the versus block, score drops to the band |
| `shirtNo` `potmSlot` | string | ghost numeral + image slot id |

Size presets actually in use — verify all six render:

| Context | width | `artHeight` | `--crest` | `scoreSize` |
|---|---|---|---|---|
| Home hero | 323 | 150 | 62 | 52 |
| Web wall | 268+ | 140 | 62 | 46 (30 for 6-digit) |
| Discover grid | ~155 | 104 | 44 | 30 / 24 |
| Diary shelf | ~155 | 94 | 40 | 28 |
| Profile shelf | ~155 | 88 | 40 | 26 |
| Feed inline | 295 | 58 | 38 | 26 |

### 2.6 Compact mode — the shelf fix

The wide card lays out crest · score · crest in one row. Below about 170px those three fight over ~50px each and collide. `compact` re-orders instead of shrinking:

- Crests become an **overlapping pair**, top-left. The two shield *centres* sit `0.73 × crestSize` apart — measure shield-to-shield, never on the rotated bounding box (which is 1.414× wider; sizing the container off the shield and positioning `left:0 / right:0` collapses the pair to ~75% overlap and hides the home crest entirely). Container width is `crestSize * 2.414`; home at `left:0`, away at `left:crestSize`.
  *(Corrected 2026-09-08. This paragraph read `2.144` / `0.73`, which `MatchCard.dc.html`
  never implemented — it ships `1.0` / `2.414`. The doc's figure overlapped the pair by 48%,
  the component by 29%. Owner's call: less overlap is better, and where the prose and the
  Claude Design file disagree the file wins.)*
- **Home paints in front** — later in the DOM or `z-index:1` — carrying `box-shadow: 3px 0 0 var(--card-base)` so the away crest reads as behind rather than merged. Never stack more than two.
- Score gets **its own line** beneath the pair, then the two club names stack under it.
- Heat becomes a single row: bars + numeric value, no label.
- No footer band, no POTM. Classic shows as a small gold diamond in the eyebrow row rather than the full stamp.
- `cut` drops to 14px (12px in feed cards), and the notch hairline scales with it.

Use it for: diary shelf, discover grid, profile shelf, feed inline. Never for the home hero or share art.

### 2.7 Crest inside the diamond

The diamond is a **frame**, never the logo. Inside it, a counter-rotated square at **62% of the diamond's side** holds the crest asset with `object-fit: contain`, upright. 62% is the largest square that clears the rotated corners once the radius is applied. Three-letter Rajdhani is the fallback in the same box at the same optical centre, so a list mixing clubs with and without assets doesn't look broken.

### 2.8 Prop coercion
Attributes arrive as strings in the mock layer. `"false"`, `"0"`, `""` must all read as false; numbers must go through `Number()` with a fallback. Both bugs already bit once — keep the `bool()` / `num()` helpers.

---

## 3. The Classic stamp

Not a chip. It is the `ClassicStamp` lockup that already exists in `RankItPrototype.jsx`: **`CLASSIC`** over **`RANKIT SELECT`**, double gold rule, rotated so it reads as pressed ink.

```
outer: 1px rgba(255,177,27,.85), radius 6, padding 2
inner: 1px rgba(255,177,27,.42), radius 4, padding 4px 9px 5px
CLASSIC:       13px Rajdhani 700, letter-spacing .2em, text-indent .2em
RANKIT SELECT:  9px Rajdhani 700, letter-spacing .2em, rgba(255,177,27,.75)
rotation: -7deg in the card footer, -9deg on share art and in the sheet control
```
`text-indent` matching `letter-spacing` is required — otherwise tracking pushes the word off-centre inside the rules.

Placements: card footer (takes the label's slot, no height gain) · share art lower-right, clear of the score · the Community tab's stamp button **is** the stamp, grey-ruled when unstamped, gold when earned. `RankItWeb.jsx:375` notes it was absent on web — it's in the web wall now.

---

## 4. Traps

### 4.1 The grid rule
This exact defect is recorded as *closed* in DESIGN.md and it came back. Grid children default to `min-width:auto`, so `1fr` resolves to min-content and long club names blow the track out.

```css
grid-template-columns: repeat(2, minmax(0, 1fr));   /* not 1fr 1fr */
```
plus `min-width:0` on **every** card wrapper, and on every `white-space:nowrap` row inside the card. Without both, ellipsis never engages.

### 4.2 Sheets are dialogs
Currently they are `div`s. They need `role="dialog"`, `aria-modal="true"`, Escape to close, focus trapped inside, focus restored to the opener. Drag handle stays.

### 4.3 The stylesheet cascade
Five files deep: `rankit.css` → `-motion` → `-filter` → `-next` → `-v030`. Collapsing the last two removes a class of bug. Not required for this redesign, but do not add a sixth.

### 4.4 Reduced motion
Every animation in the mockups sits behind `@media (prefers-reduced-motion: reduce)`. The ember pulse and the live dot are the only motion; both must stop.

---

### 4.9 Navigation contracts added by PROMPTS.md

These are behavior contracts from the supplied prompts, now supplemented by actual `6a`–`6d` artwork in the September 14 source. The previous missing-artwork blocker is resolved, not the implementation or visual acceptance gates.

#### 4.9.1 Collectible result (`6a`)

Match sheet, quick-rate, Companion and the first onboarding rating converge on one result surface. It is not another dismissible celebration modal. Use the shared card at crest 52px, one statement, three **server-derived** deltas, then Share / Skin / Edit. Never invent a streak increment, reward or rank delta. Pending offline upload is not confirmed success: clearly identify a locally saved entry and defer unconfirmed deltas. Editing returns to the same entry, not a new rewatch. No confetti or sound; one gold item.

The latest artwork puts the card first under a 64px "Saved to your diary" header: crest 52px, art height 128px, card height 306px in the 375px reference. Then comes the entry-count statement and personal rating/Classic sentence. The three tiles show current streak + delta, cumulative points + delta, and collection progress + delta, not diary/streak deltas alone. Share / Skin / Edit have 52px targets, followed by Back to tonight. Adapt responsively and keep basketball scores safe. Collection eligibility and progress require real data; the example London Derby 8/12 is not a fallback.

#### 4.9.2 Profile and Standing (`6b` → `2p`)

Profile is the tab root: identity, rank summary with chevron, three counters, shelf preview and rows for Lists / The Hunt / Your reviews. Standing is pushed from the rank chevron and returns to Profile; it must not replace the root. Counts come from actual account data.

In `6b`: You header with 44px Find people and Settings controls; 64px avatar, name/handle/join date, Following and Followers links to `9a`. Find people opens `9b`. The compact purple rank block links to `2p`; counters are watched, classics, streak. Your shelf has three compact cards (crest 30px, art 42px, height 167px in the reference), with All linking to the diary shelf. Lists / The Hunt / Your reviews are 52px rows. The Your reviews→5c annotation reuses the visual family, not a match scope: show the account's own reviews across matches, never an arbitrary match's review list.

#### 4.9.3 First run

`4g` connect Primary Arch → `4h` select competitions/clubs → `2r` one-promise screen. The next confirmed rating resolves to `6a`. Do not silently create a separate RankIt identity.

#### 4.9.4 Companion expansion and full time

The sheet expands into `4e` / `4f`. Old `2o` is superseded. At full time, `6d` is a distinct read-only record: chart with recorded peak minute, three read-only statistics, closed room with readable thread, and Rate it pre-seeded from the user's live read. A live read never creates a diary entry without confirmation. Do not manufacture chart samples, attendance, or peak values when the API lacks them.

`6d` now supplies the geometry: The night, in full; loudest minute, pulse rise from HT, messages kept; Room closed at full time; Read the thread; Rate it. These labels describe football examples. Basketball requires period-aware labels and real measurements, not synthetic football minutes. Drop the live badge and keep the thread readable.

#### 4.9.5 Hunt and Discover drawer

The Hunt is reachable from both Discover and Profile. Discover at rest (`2c`) keeps its Hunt tile above the grid. The filter drawer (`6c`) is separate, opens from the left, width 288px capped at 85%, with 48px pills and minimum-heat control. Filtering must apply to the full server result set, not only the current loaded page. A failed request keeps existing results visibly marked as previous results.

#### 4.9.6 State-driven Companion badge

Before kickoff, show the upcoming state; while live, a red live indicator with text; after full time, remove the live badge. Basketball timelines use basketball periods, never football KO/HT labels. Late fixture status changes must update an already-open screen.

#### 4.9.7 People surfaces — HTML-only additions (`9a` / `9b`)

The latest board adds these outside the original prompt list. Track as HTML-9A/HTML-9B after the Profile root, not as accessibility phase 9.

- `9a`: Following/Followers tabs with actual counts, search within the selected relationship list, Closest taste ordering, member rows opening `3i`, Find people opening `9b`.
- `9b`: name/@handle search, actual known Primary Arch relationships, taste-based suggestions and shared-match counts. A shared identity database is not proof that users know each other; do not import contacts or invent known people.
- Shared relationship states: FOLLOW / FOLLOWING / FOLLOW BACK / MUTUAL. Reconcile follow changes across lists/profile; loading, failure and rollback must be explicit.
- Show overlap percentages only for **at least 10 shared visible matches**. Below that, explain insufficient shared history. Never compute over private entries or display fabricated percentages. The similarity formula and existing API coverage still require verification.
- Rows show logged/classics/taste, not follower counts or a popularity ladder. Respect the source styling while retaining at least 44px interactive targets.
- The `9b` Primary Arch tile still contains an old arch-shaped proposal. Do not copy it over the approved parent mark: §8.2 remains the explicit brand contract.

Implementation note (2026-09-15): `9a` now uses authenticated `GET /people` and
idempotent `PUT /people/{id}/follow`. The existing 3i agreement metric (within
half a star, latest visible rated entry per match) is retained with a ten-match
minimum. `PeopleList` and `MemberProfile` share `RelationshipButton`. Private
people/member responses are not persisted for offline fallback. Functional
checks are recorded in the live progress file; acceptance remains open for the
source TabBar integration and `9b` destination (Find people currently opens the
existing search), plus native-device checks. Do not treat this as completed `9b`.

### 4.10 Correctness gates before additional visual phases

- Compare normalized form data with the last acknowledged snapshot. Rating, Classic, review, tags, visibility, spoiler flag, POTM and respect edits can all make it dirty.
- Drafts and queued writes are account-scoped. Confirm durable storage before promising “saved on this phone”. Track diary/POTM/respect completion separately; a partial save is not overall success. Never automatically replay an uncertain rewatch without server idempotency/reconciliation.
- Spoilers are omitted from rendered text, not merely blurred. Apply the shared live/finished policy to cards, search, details and competition fixtures. Reveal is an explicit keyboard-accessible action; it does not disable the global preference. Spoiler-marked review bodies and replies have their own reveal gate.
- Diary heat represents **your rating**, with personal labelling; it is not community heat or an Instant Classic vote threshold.
- HTTP failure is not an empty collection. Retain successful cached content where available; show a retry action. Only show “That's all” when pagination confirms the end.
- Nested dialogs dismiss topmost first, isolate background interaction, trap focus and restore it to the correct opener. Escape and native Back share the same stack; real-device validation remains a release gate.
- Offline dimming applies to artwork, not reading text, controls or focus rings. The board's 62% opacity must not make cached reviews unreadable.

## 5. States

**Loading — skeletons, never spinners.** The skeleton keeps the notches, both crest columns, the score block and the five heat bars in `#1c1d21`. Layout must not shift when data lands. See `3k`.

**Empty — stays empty.** Name what's missing, name the one action, stop. No sample fixtures, no suggested friends. Diary, Hunt (`Olympic Finals 2028`) and search all follow this. See `3l`.

**Offline.** A `#f5402e`-ruled banner, cached cards dimmed to 62% opacity rather than hidden, and an explicit promise that the local rating will upload. Retry is a 44px control, not a text link.

**End of list.** A ruled `THAT'S ALL 142` — finite collections say so.

---

## 6. Screen index

Turn 2 (`2a`–`2r`) redesigns what shipped. Turn 3 (`3a`–`3l`) adds what was missing.

| id | Screen | Repo target |
|---|---|---|
| 2a / 2b | Home — night flow / spoiler shield | `RankItPrototype.jsx`, `rankit-v030.css` |
| 2c | Discover at rest, Hunt tile above grid | drawer is separate 6c |
| 2d / 2e | Diary — timeline / shelf | `RankItPrototype.jsx`, `mockData.js` |
| 2f / 2g / 2h | Match sheet — Match / Community / upcoming | sheet + score band in `rankit.css` |
| 2i | Competition — Table | `rankitApi.js` |
| 2j / 2k / 2l | Skins / share 4:5 / share 16:9 | new |
| 2m / 2n | The Hunt — index / collection | new |
| 2o | Superseded — do not build | use 4e / 4f |
| 2p | Standing, pushed from Profile 6b | not the Profile tab root |
| 2q | Friends shelf | activity feed |
| 2r | First run | `product/mobile.md` |
| 3c / 3d | Competition — Matches / Players | tabs beside the table |
| 3e | Search | reachable, undrawn |
| 3f | Notifications | reachable, undrawn |
| 3g | Settings | reachable, undrawn |
| 3h | Lists | `product/mobile.md` |
| 3i | Someone else's profile | new |
| 3j | Quick-rate sheet | what `RANK` opens |
| 3k / 3l | Loading / empty · offline · end | new |
| 4a | Review thread — addressed replies + respect | new; replaces broadcast-reply model |
| 4b | Friends feed, actions unclipped | activity feed |
| 4c | Crest system + compact anatomy | spec board |
| 4d | Skin system × shelf × share | eight named skins in current prompts |
| 4e / 4f | Companion with watchalong folded in | watchalong surface merged |
| 4g / 4h | First run: Primary Arch, then follows | new |
| 4i | Both marks, sizes and lockups | spec board |
| 5a / 5b | Sheet · Companion — before / live | replaces the retired watchalong tab |
| 5c | All reviews — sorted, friends pinned | new; the Community tab's "318 reviews ›" links here |
| 6a / 6b | Collectible result / Profile root | latest artwork available, §4.9 |
| 6c / 6d | Discover drawer / full-time Companion | latest artwork available, §4.9 |
| 9a / 9b | Following & Followers / Find people | HTML-only extension, §4.9.7; not phase 9 |

`RankIt Prototype.dc.html` is the interaction reference — rating, save, streak, spoiler and skin switching all behave there. Read its logic class for the state machines rather than guessing:

- **rating** `0 → 0.5…5` in 0.5 steps.
- **save** `idle → saving (800ms) → saved`; editing a saved entry → `dirty → saving → saved`.
- **streak** increments **only** on the first save of a match, never on an update.
- **spoiler** prop default, overridable locally; omit actual score/heat text before explicit reveal (§4.10). Blur may style the placeholder, not conceal readable result text.

## 6.1 Social model — respect and replies

Not Twitter. Closer to Letterboxd and Ekşi Sözlük: the **review** is the object, replies hang off it and are **addressed to a person**.

- A reply opens with the handle it answers — `@deniz` — rendered in `#9a3f96` at weight 500. That prefix is generated by the reply action, not typed.
- Nesting is **one level deep**. A reply to a reply still addresses a handle; it does not indent further. The author's own replies carry an `AUTHOR` marker.
- Replies sort by **most respected**, not newest.
- **Respect replaces likes.** The verb for an opinion you rate highly is respect, not affection. The control is the RankIt diamond: 1.5px outline in `ink-3` when unspent, solid `ink` when given, count beside it. It never uses gold — a feed holds many respects and only one Classic — and it never animates.
- Respect is capped at 50 points per review toward Rank (§7.1).
- A match's review list and a review's reply thread are different surfaces. The match sheet's Community tab shows *your* entry plus aggregate; tapping a review opens the thread (`4a`).

---

## 7. Rank & streak — the mechanic

Two separate systems that are easy to confuse. **Rank is cumulative and never goes down. Streak is fragile and resets.** That contrast is the whole design.

### 7.1 Rank — earned standing

A lifetime points total, one of seven named tiers. It answers "how much of this person's opinion has been earned?" and it is the thing shown on their profile and beside their reviews.

| # | Tier | Points |
|---|---|---|
| 1 | New Voice | 0 |
| 2 | Regular | 250 |
| 3 | Home End | 750 |
| 4 | Terrace Regular | 1,750 |
| 5 | Season Ticket | 3,500 |
| 6 | Club Historian | 7,000 |
| 7 | Archivist | 15,000 |

Points, and why each is worth what it is:

| Action | Points | Reasoning |
|---|---|---|
| Rate a match **on the night it's played** | 15 | The behaviour the product exists to encourage |
| Rate a match later | 5 | Still a real log, worth less |
| A review of yours earns a **respect** | 2 | Peer signal, capped at 50/review so one viral take can't buy a tier |
| Sit a match in the **companion** | 20 | Highest single award — presence during the match is the hardest thing to fake |
| Close a **collection** | 100 | Weeks of consistency |
| Follow a competition **end to end for a season** | 300 | The long game; only payable once per competition per season |

Rules that keep it honest: points are **awarded once per match**, so editing a rating never re-pays. Deleting a log removes its points. Rank **never decreases** through inactivity — only through deletion. Rank is not a leaderboard position; there is no global ladder, by design (see PRODUCT.md on comparison culture).

### 7.2 Streak — consecutive nights

Counts **nights**, not matches. A night counts when you rate at least one match **on the day it was played**, in your own timezone.

- Rating three matches in one night is one night, not three.
- Rating yesterday's match today gives points but does **not** save yesterday's streak.
- A night with no matches you could watch is a **rest night**: it neither extends nor breaks the streak. Nobody loses a streak to an international break.
- Streak breaks only when a match you follow was played and you didn't rate it by local midnight.
- One reminder at 22:00, and only if you followed something played that day. Never a second.

Streaks unlock skins (7 nights → Floodlight) and drive the ring in the header. Best-ever streak is kept and displayed after a break, so losing one doesn't erase it.

### 7.3 Where each appears

| Surface | Rank | Streak |
|---|---|---|
| Home header | — | ring + night count |
| Profile hero | tier + progress to next | best & current |
| Beside a review | tier name only | — |
| Diary strip | — | colour per night |
| Notifications | tier-up moment | 22:00 reminder, at-risk warning |

Never show both in the same component: they answer different questions and side by side they read as one score.

## 8. Marks

Board `4i` has every size and lockup.

### 8.0 What ships today, and a live bug

The repo already contains `android/app/src/main/res/drawable/rankit_launcher.xml`: a gold dodecagon medallion around an **R**, plus a teal `#00a3af` rule. Ground and gold are correct. That teal is the Primary Arch **rule** colour (`#00A3AF`, §8.2) which had leaked into a RankIt-only mark — it does not belong in a RankIt asset.

**It is not wired up.** `mipmap-anydpi-v26/ic_launcher.xml` sets its foreground to `@mipmap/ic_launcher_foreground` — the stock Android bugdroid — over `ic_launcher_background` = `#FFFFFF`. The app installs with the default Android icon. Whatever mark wins, three files change: the adaptive icon foreground, the background colour, and the round variant.

The Primary Arch mark lives outside this repo, in `BrandIcons.jsx`. It is used **verbatim** — see §8.2, which also carries four unresolved questions about it. My earlier arch proposal is withdrawn.

### 8.1 RankIt

**Mark** — the collectible card's silhouette with the app's own star knocked out. A rated match, in one shape.

```
square:   M0 0H16.5L24 7.5V24H7.5L0 16.5Z      (24 grid)
chamfer:  7.5 = 31.25% of the side — deeper than the card's own
          22-on-323, so the shape holds at 16px
star:     the UI rating glyph, scale .6, optical centre 12 / 12.6
          (never geometric centre — a five-point star reads low)
knockout: SVG mask, so the mark sits on any ground
```

**Wordmark** — RANK in `ink`, **IT** in gold. Split where the meaning splits: the noun you own, then the thing you do. Rajdhani 700, `letter-spacing:.03em`. On light grounds gold darkens to `#8a6a12` and the mark goes `#17120a`.

**Lockup** — mark 24, gap 10, wordmark 21, `BY PRIMARY ARCH` eyebrow beneath. The gold in IT **is** that region's one gold (nav diamond exempt), so a header carrying the lockup does not also carry a gold CTA.

**App icon** — gold ground `linear-gradient(150deg,#ffe9b0,#ffb11b 52%,#e08f00)`, mark knocked out in `#17120a`, radius 21.

### 8.2 Primary Arch

**Do not redesign this.** It is taken verbatim from `BrandIcons.jsx` — twelve sides for twelve archetypes, two ball seams, one rule. Coordinates below are the 48-grid original halved, so it drops into a 24 viewBox unchanged; use the 48 grid wherever you have the room.

```
ring:   polygon 12,2 17,3.35 20.65,7 22,12 20.65,17 17,20.65
                12,22 7,20.65 3.35,17 2,12 3.35,7 7,3.35
        stroke #FFB11B, round joins
seams:  M7 3.35C11 9 11 15 7 20.65     stroke #1d428a
        M17 3.35C13 9 13 15 17 20.65   stroke #c8102e
        NOTE: the seams run vertex-to-vertex down the left and right
        and bow INWARD. They do not meet at top and bottom centre —
        that mistake turns the ball into a lens.
rule:   M3 12H21                       stroke #00A3AF
        inset one unit — caps sit just inside the left/right
        vertices so the ring stays closed on busy grounds
        (48 grid: M 6 24 H 42, changed from M 4 24 H 44)
stroke: 2 on the 24 grid (4 on 48) — the ratio is 1/12 of the width
dashed: the rule takes strokeDasharray "4 4" in the dashed variant
```

**Mono (approved)** — do not flatten the strokes; **invert the construction.** Fill the dodecagon solid and knock the two seams and the rule out of it as transparent gaps (SVG mask). One colour, every element still present, works on any ground because the gaps are holes rather than painted lines. Gap stroke 2.6 on the 24 grid, widening to 3 at 16px — a hole needs more room than a line to stay open.

**Size floor** — 24px for the stroke form (at 16 the 1/12 ratio renders 1.33px and the seams sit ~2px off the ring). Below 24 the solid construction takes over: gold ball, seams knocked out, teal rule stroked back on top. Gold and teal survive, blue and red become negative space. Draw the app icon at 108; never scale from 48.

**Rule inset (approved)** — `M3 12H21`, one unit inside the ring vertices. At full width the teal caps landed exactly on the left/right vertices, so on a busy ground the outline read as cut and the mark lost its closure. One unit in keeps the twelve-gon closed while the rule still overhangs the seams enough to read as passing through the ball. **This is the one intentional change to the shipped mark** — update `BrandIcons.jsx`: `<path d="M 4 24 H 44" />` becomes `<path d="M 6 24 H 42" />` on the 48 grid. At full width the teal caps land exactly on the ring's left/right vertices, so on a busy ground the outline reads as cut and the mark loses closure; one unit puts the caps just inside while the rule still overhangs the seams enough to read as passing through the ball. Inset 2 closes the ring but the rule stops feeling like it crosses anything. If the shipped mark is not to be touched, keep full width and never place it on photography.

**Shared gold is intentional** — `#FFB11B` in both marks is the family resemblance, not a collision. See §8.3.

**Drop-in for `BrandIcons.jsx`** — same conventions as the existing `Logo`, 48 grid, no new deps:

```jsx
/* Mono logo — one colour, seams and rule knocked out.
   Use below 24px and for one-colour print, embroidery, dark-on-light. */
export function LogoMono({ size = 32, color = "currentColor", id = "pa-mono" }) {
  const pts = "24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7";
  const gap = size < 24 ? 6 : 5.2;            // holes need more room than lines
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <mask id={id}>
        <rect width="48" height="48" fill="#fff" />
        <path d="M 14 6.7 C 22 18 22 30 14 41.3" stroke="#000" strokeWidth={gap} strokeLinecap="round" />
        <path d="M 34 6.7 C 26 18 26 30 34 41.3" stroke="#000" strokeWidth={gap} strokeLinecap="round" />
        <path d="M 6 24 H 42" stroke="#000" strokeWidth={gap} strokeLinecap="round" />
      </mask>
      <polygon points={pts} fill={color} mask={`url(#${id})`} />
    </svg>
  );
}
```

Pass a unique `id` per instance if several render on one page — duplicate mask ids collide.

### 8.3 Co-branding

Both marks stay **in gold** — the shared accent is the point. Separation is by **scale and clear space**, not colour:

- Primary Arch at 1.0×, RankIt at **0.72×** its height.
- Clear space between them equal to **one ring width** of the parent mark.
- **No divider rule.** A rule between two gold marks reads as a fraction bar.
- A co-brand lockup counts as **one** gold item against the per-region budget.

## 9. Definition of done

Per phase: app runs, flag path clean, no new hex outside §1, no new font, no `1fr` without `minmax(0,1fr)`, targets ≥44, type ≥9px, animations behind reduced-motion, and the six `MatchCard` presets all render without clipping or overflow.

Ship gate: sheets are dialogs, skeletons in place, offline path honest, and gold auditable at one per region with the nav exempt.

## 10. Motion, haptics and notifications — phase 13 contract

This section transcribes the newer prompt requirements; it does not mark them implemented.

### 10.1 Motion

State changes 120ms, sheets/nav 200ms, collectible arrival 280ms, ambient Ember 2600ms. Entrance curve `cubic-bezier(.22,.9,.3,1)`; ambient motion linear. The prompt separately preserves **livedot at 1400ms**, an explicit named exception to its “four durations” wording, not permission for more arbitrary durations.

On `6a`, card scale 0.96 → 1 over 280ms; notch hairlines follow after a 120ms pause. No bounce, confetti or sound. Do not animate scores, heat-bar filling, the respect diamond or gold. Under reduced motion, stop ambient loops and replace transform transitions with opacity-only changes; do not simply speed them up.

### 10.2 Haptics

Commitment only: star/half-star selection; respect light impact; Classic medium impact; confirmed save success notification; failed or locally queued save warning notification. Never scroll, tab changes, sheet open or Back. Honor OS haptics settings independently of reduced motion.

### 10.3 Notifications

Channels: Heat alerts, Streak, Social, Collections. Heat on by default; Streak/Collections off; Social replies on and respects off. This specific Social rule qualifies the prompt's general “only Heat on” sentence. Channel creation does not bypass Android permission or OS overrides. Keep preferences truthful if delivery is unavailable.

For an unrated match, no score, heat value or star count in any notification payload shown to the user. With the spoiler shield on, also omit club names on the lock screen. Heat alerts require a still-watchable match crossing 4.0; Streak at 22:00 only after actual watching that day; Collections only when one match from completion. Deduplicate delivery. Deep-link to the exact match Community tab, addressed reply or collection, including cold-start and signed-out recovery. Audit all notification strings before release.
