# RankIt — design handoff & build order

**One document. Everything needed to build the redesign, and the order to build it in.**

Two boards, both ordered by app structure rather than by the turn that produced them:

| | File | Screens |
|---|---|---|
| Mobile | `RankIt Redesign.dc.html` | 51 |
| Web | `RankIt Web.dc.html` | 29 |

Screen ids (`2a`, `7f`, `15w`) are permanent handles. They appear as gold badges on each screen and are referenced throughout. Group headings list the ids they contain, so finding a screen means scanning headings, not scrolling.

Each board's final section, **Design notes**, collects the reasoning newest-first. Build from the groups; read the notes when you want to know why.

---

# Part I — The language

## 1. Tokens

Nothing outside this list. If you need a value that isn't here, stop and ask.

### 1.1 Surfaces and ink

```
ground        #090a0b   the page
surface       #121315   a panel on the page
surface-2     #151618   a card on a panel
surface-3     #1a1b1e   sheets, dialogs, the web Inspector
line          rgba(255,255,255,.09)   the only border weight
line-strong   rgba(255,255,255,.22)   focus, selection, active
ink           #eceded   primary text
ink-2         #c9cccd   secondary
ink-3         #9aa0a6   tertiary — captions, metadata
ink-4         #7f868b   quaternary — labels, disabled
ink-5         #4d5256   the floor; hints only
```

Five text values. No `#555`, no `#666`, no `#777`.

### 1.2 Gold

```
gold          #ffb11b
gold-light    #ffe9b0   gradient stop only
gold-dark     #e08f00   gradient stop only
gold-print    #8a6a12   gold on a light ground (Broadsheet)
ink-on-gold   #17120a   text and icons sitting on gold
```

**Gold marks at most one thing per region.** On mobile the region is the viewport. On web it is a **panel** — header, rail, wall and Inspector each get their own budget, because a 1440×900 viewport holding one gold element reads as broken.

The nav diamond is chrome and exempt. A screen carrying the RankIt wordmark has spent its gold on the `IT` — it does not also carry a gold CTA.

### 1.3 Heat

The one palette added to the system. Five steps, cold to hot.

```
heat-1  #2f5480   cold
heat-2  #5b4fa8   flat
heat-3  #9a3f96   good
heat-4  #d43a63   hot
heat-5  #f5402e   scorching
```

Deliberately routed through indigo and magenta so no step reads as gold.

**Heat is data visualisation only.** Never nav, never a CTA, never a container border. The numeric value always ships beside the colour — a heat bar with no number is incomplete.

`heat-5` doubles as the error colour (§5.4). Nothing else does.

### 1.4 Support

```
positive   #3fb08c   confirmed, saved, mutual
```

One value. There is no warning colour: a thing is fine, or it failed and uses `heat-5`.

### 1.5 Type

```
Rajdhani 700   the product speaking — labels, scores, names,
               numbers, nav, buttons, all-caps eyebrows
Outfit 300-500 a person speaking — reviews, replies, captions,
               explanatory copy
```

No third family. Nothing in Inter, Roboto or Arial.

```
eyebrow    Rajdhani 700,  9px, letter-spacing .14em, UPPERCASE
label      Rajdhani 700, 11px, letter-spacing .06em
body-s     Outfit 400, 11.5px, line-height 1.45
body       Outfit 400,   12px, line-height 1.55
body-l     Outfit 400,   13px, line-height 1.65   (web reviews)
title      Rajdhani 700, 13px, letter-spacing .02em
heading    Rajdhani 700, 21px
display    Rajdhani 700, 31px
score      Rajdhani 700, 38-72px by card size
```

**Floor is 9px.** One exception: skin-grid thumbnails, where 6.5–8.5px is allowed because a thumbnail is a picture of a card, not a card.

### 1.6 Geometry

```
radius      8px  controls, buttons, rows
           10px  panels inside panels
           14px  cards
           18px  feature blocks
           22px  the match card (and its chamfer depth)
          999px  pills, avatars
target      44px minimum, always. 48px on filter pills.
gap          7 · 9 · 11 · 13 · 16 · 18 · 22 · 26 · 34
```

The gap scale is not decorative. Use it; do not introduce 10, 12, 15, 20.

---

## 2. The match card

The signature object. One component, `MatchCard`, used by both surfaces at seven sizes.

### 2.1 The chamfer and the hairline

Cut corners at **top-right and bottom-left**, via `clip-path` — not a border-radius trick, not a rotated overlay.

```css
clip-path: polygon(
  0 0, calc(100% - 22px) 0, 100% 22px,
  100% 100%, 22px 100%, 0 calc(100% - 22px)
);
```

Across each notch lies a **22px hairline at 45°**. That hairline is what turns gold on an Instant Classic — *not* the card border. This is the most-missed detail in the system.

```
default   rgba(255,255,255,.22)
classic   #ffb11b
```

The chamfer scales with the card: 22px full, 18px at 216px wide, 16px portrait share, 14px at 174px, 12px thumbnails, 11px at 98px.

### 2.2 The sheen

```css
background-image: repeating-linear-gradient(
  68deg, rgba(255,255,255,.055) 0 2px, transparent 2px 11px
);
```

**68 degrees.** Not 112, not 45. Every skin keeps the angle and varies only the values.

### 2.3 Club colour

Arrives as CSS custom properties and mixes into the gradient — never a hardcoded hex per club.

```css
background: linear-gradient(155deg,
  color-mix(in oklab, var(--home) 44%, var(--card-base)) 0%,
  var(--card-base) 54%,
  color-mix(in oklab, var(--away) 34%, var(--card-base)) 100%
);
```

### 2.4 Crest shields

A square rotated 45°, with a **derived** radius:

```
size     var(--crest), 62px at full size
radius   calc(crest * .29) x2, calc(crest * .34) x2
```

Derive it. A hardcoded `18px 18px 21px 21px` becomes a circle once `--crest` drops near 38.

**Footprint maths — got wrong twice, so read it twice:**

```
A rotated diamond's bounding box is its BORDER-BOX × 1.414.
Include the borders. A 32px diamond with 1px borders needs
34 × 1.414 = 48.1px, not 45.3.
```

Single crest: container is `crest × 1.414` square. The abbreviation counter-rotates −45° and sizes at `calc(crest * .23)`.

### 2.5 Sizes

Seven presets. Do not interpolate between them by eye.

| Context | `--crest` | art | score | wrapper |
|---|---|---|---|---|
| Mobile hero | 62 | 150 | 52 | 334 |
| Mobile sheet | 56 | 118 | 44 | 291 |
| Web wall | 56 | 132 | 46 | 305 |
| Web Inspector | 52 | 108 | 40 | 281 |
| Collectible overlay | 76 | 196 | 66 | 440 |
| Web shelf (compact) | 34 | 56 | 21 | 174 |
| Mobile shelf (compact) | 30 | 42 | 19 | 167 |

**The art region is sized, never `flex: 1`.** A card that grows to fill its container ends up mostly empty air.

### 2.6 Compact mode

Below ~170px the wide layout's crest · score · crest row fights over ~50px each and collides. `compact` re-orders rather than shrinking:

- Crests become an **overlapping pair**, top-left. Centres sit `1.0 × crestSize` apart — positioned shield-to-shield, but the **container is sized off the rotated border-box footprint** per §2.4. Container width `crestSize * 2.414`; home `left: 0`, away `left: var(--crest)`.
- At 0.73 the front shield's rotated edge crosses the rear club label. That was the reported collision; do not tighten it.
- Score moves below the crests. Club names stack.

### 2.7 Box sizing

```css
* { box-sizing: border-box; }
```

Non-negotiable, set globally on both boards. A hand-built tile sitting in a grid beside a `MatchCard` **must** be border-box: with the browser default, a declared height is a lie by exactly `padding + border` — a 174px tile with 13px padding and a 1px border renders at 202px and stretches its row.

### 2.8 Props coercion

Props arrive as strings from markup, and `"false"` is truthy in JavaScript.

```js
const bool = (v, d) => {
  if (v === undefined || v === null || v === '') return d;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return true;
};
```

Same for numbers. This bug silently inverts every boolean on the card.

### 2.9 The POTM variant

On a finished match with a player-of-the-match image, the silhouette **replaces** the versus block and the score moves into the name band at 21px. Behind it the shirt number renders at `calc(crest * 2.1)` in `rgba(255,255,255,.06)`. The score does not sit on top of the silhouette.

---

## 3. The spoiler shield

The most distinctive setting in the product. Asked during first run, not buried in settings.

When on:
- Scores blur — `blur(9px)`, `blur(11px)` on the hero
- Heat bars become a locked strip reading `TAP TO REVEAL`
- Reviews collapse to `CONTAINS SPOILERS · TAP TO SHOW`
- Status reads `PLAYED` instead of `FULL TIME`
- The Instant Classic stamp is suppressed — it is itself a verdict

The toggle is `positive`-tinted when on, neutral when off. **Reveal is always one tap away.** A default, not a lock.

### 3.1 The same idea, pointed at the crowd

Before you rate a finished match, the community verdict is **covered the same way** — ramp blurred, value withheld, one line: *"Rate it first — then see whether the room agreed with you."* `REVEAL ANYWAY` always present.

Seeing 4.6 before you decide anchors you to it. A product whose thesis is that **your** opinion is the artifact cannot open by telling you the answer.

---

## 4. The collectible

Rating a match produces an object. That object is the product.

### 4.1 Every rating path ends in one place

Sheet rating, quick-rate, the live companion, the first rating in first run — **all four resolve into the same screen**: mobile `6a`, web `7e`. One destination, so the payoff never depends on how the user arrived.

It is a **result, not a celebration**. No confetti, no sound, no modal to dismiss. The finished card, one line of what happened ("That's card 143."), three deltas (streak, points, any collection advanced), then Share / Skin / Edit, then a text link back.

Gold appears once: the Classic hairline if stamped, otherwise the primary action. Never both.

### 4.2 Skins

Seven. A skin paints **the collectible and its share image only** — app chrome never inherits one. Broadsheet is a cream *card*, not a light theme.

```
Default      club-coloured gradient, the base card
Broadsheet   cream newsprint, gold darkens to #8a6a12
Holofoil     purple/teal/pink radials under the 68° sheen
Ember        the heat ramp as a gradient
Ink          flat #0c0d0f, typographic
Stub         ticket-stub perforation
Gilt         gold-on-dark, Classic only
Turf         locked — finish a collection
Floodlight   locked — a 7-night streak
```

### 4.3 Share geometry

Two ratios, both real.

- **Portrait 4:5** — what gets posted. 16px chamfer, gold hairline if Classic.
- **Wide 16:9** — the shelf geometry: emblem panel left behind a gold hairline, copy centre, heat and stamp at the bottom edge. 18px chamfer. What a link preview needs.

On web both render live beside the skin picker (`11b`), so the consequence of a skin is visible before committing.

---

## 5. States

### 5.1 Loading

**Skeletons only. No spinners.** The card skeleton keeps its notches, both crest columns, the score block and the five heat bars — so nothing shifts when data lands, and the shape is recognisable before the content exists. A spinner says "wait" and tells you nothing.

### 5.2 Empty

Names one action and stops. No sample fixtures, no suggested friends, no filler cards.

### 5.3 Offline

Cached cards dim to **62%** rather than disappearing. One line promises the local rating will upload on reconnect.

### 5.4 Errors

The principle across all four: **never discard work the user already did.** The local copy is the truth until the server confirms. Failures are marked on the thing that failed, never as a page-level banner. `heat-5` is the error colour.

| Failure | Behaviour |
|---|---|
| Rating fails to save | Entry stays, marked unsynced, retries silently |
| Upload rejected after offline | The card carries the flag; the diary entry survives |
| Match 404 | The card is gone, the diary entry is not |
| Session expires mid-rating | Re-auth in place; the draft is still there |

### 5.5 Data honesty at small numbers

**20 ratings.** Below that, heat bars render empty and the label reads `TOO FEW RATINGS`. Applies to every heat value everywhere — card, season map, table average, club average. Player share below 20 votes reads `TOO FEW VOTES`.

A user's own stars are **not** heat and are never withheld.

---

## 6. Accessibility

- Every target ≥ 44×44. Filter pills 48.
- Type floor 9px (§1.5 exception aside).
- Text contrast ≥ 4.5:1; headline-scale ≥ 3:1.
- **Heat never as colour alone** — the number ships with it, always.
- Every animation behind `@media (prefers-reduced-motion: reduce)`.
- Sheets and dialogs are real dialogs: `role="dialog"`, `aria-modal="true"`, Escape closes, focus trapped inside, focus restored to the opener.
- Focus ring: **2px `ink` at 2px offset. Never gold** — a gold ring would spend the region's budget on wherever the keyboard happens to be.
- Hover lifts a card's border from `line` to `line-strong`, no transform.

---

## 7. The marks

### 7.1 What ships today, and a live bug

`android/app/src/main/res/drawable/rankit_launcher.xml` holds a gold dodecagon medallion around an **R** with a teal `#00a3af` rule. Ground and gold are correct; the teal exists nowhere else in the system.

**It is not wired up.** `mipmap-anydpi-v26/ic_launcher.xml` points its foreground at `@mipmap/ic_launcher_foreground` — the stock Android bugdroid — over `#FFFFFF`. **The app installs with the default Android icon.** Three files change: adaptive icon foreground, background colour, round variant. Draw at 108; do not scale from 48.

### 7.2 RankIt

**Mark** — the collectible card's own silhouette with the app's own star knocked out of it. A rated match, in one shape.

```
square    M0 0H16.5L24 7.5V24H7.5L0 16.5Z        (24 grid)
chamfer   7.5 = 31.25% of the side — deeper than the card's
          own 22-on-323, so the shape holds at 16px
star      the UI rating glyph, scale .6,
          optical centre 12 / 12.6 — never geometric centre;
          a five-point star reads low if you centre its box
knockout  SVG mask, so the mark sits on any ground
```

Pass a **unique mask id per instance**. Duplicate ids collide and the mark vanishes.

**Wordmark** — `RANK` in `ink`, **`IT`** in gold. Split where the meaning splits: the noun you own, then the thing you do. Rajdhani 700, `letter-spacing: .03em`. On light grounds gold → `#8a6a12`, mark → `#17120a`.

**Lockup** — mark 24, gap 10, wordmark 21, `BY PRIMARY ARCH` eyebrow beneath.

**App icon** — gold ground `linear-gradient(150deg,#ffe9b0,#ffb11b 52%,#e08f00)`, mark knocked out in `#17120a`, radius 21.

### 7.3 Primary Arch

Used **verbatim from `BrandIcons.jsx`**. This is the parent brand mark; it is not ours to redesign. One approved change, already applied: the rule is `M 6 24 H 42`, inset one unit from `M 4 24 H 44`.

**It has a floor.** The full mark holds down to **32px**. Below that the twelve facets, two seams and the rule crowd into ~13 of 24 grid units and turn to mud:

```
>= 32px   full mark — 12-gon ring, both seams, rule x 3.6–20.4
<  32px   dodecagon becomes a circle (r 6.6), rule shortens
          to x 5.4–18.6 so it stops crossing the arch legs
```

Do not shrink the full mark and hope.

**Mono** — arch `ink`, ball `ink-3`. Both must clear the ground: the ball is **stroked into the arch's transparent opening**, not knocked out of a filled shape, so a dark ball value renders straight onto the page and the dodecagon disappears.

### 7.4 Co-branding

Both marks **mono, never both gold**, separated by a 1px `line-strong` rule. Two gold marks in one region breaks the budget and neither wins.

---

# Part II — Mobile

## 8. The shell

```
status bar   44
header       64
content      flex, scrolls
nav          73, translucent, blur(18px)
```

Four nav items plus the centred gold `RANK` diamond, which opens quick-rate (`3j`). Active item is gold; the diamond is exempt from the gold budget.

## 9. The match sheet has five lives

One object at five points in a match's life. **The tabs never change** — Match, Community, Companion — only their contents and what the user may do.

| Phase | Match | Community | Companion | Primary action |
|---|---|---|---|---|
| Scheduled, no XI | squads, expected heat (`2h`) | appetite only | countdown, who's coming (`5a`) | Add to watchlist |
| XI announced | lineup replaces the squad note | unchanged | unchanged | Watch with your Companion |
| Live | live score, XI, subs (`15d`) | nothing to rate | moments, pulse, live read (`5b`) | Watch with your Companion |
| Full time, unrated | result + events | **the invitation** (`15a`) | pulse becomes the record (`6d`) | Rate this match |
| Full time, rated | result + events (`2f`) | entry + crowd (`2g`) | thread stays, chat closed | — |

### 9.1 One rule governs all of it

**Stars, POTM, respect and the review open at full time. Never before.** The live read (`5b`) is the only thing movable during a match, and it is deliberately not a rating — no stars, no diary entry.

The XI-announced phase is `2h` with `2f`'s confirmed-lineup block swapped in and a different primary action. Nothing else differs, so it is not drawn separately.

### 9.2 Match tab and Companion must not converge

During a match the Match tab answers *who is on the pitch* — live score, starting eleven, substitutions with minutes. **Moments and the crowd pulse belong to the Companion alone.** An event feed on both makes them the same screen with different chrome.

The live CTA reads **Watch with your Companion**, not "join the room" — the room is a tab on this same object, not a place you leave for.

### 9.3 The unrated state is the one most users see first

`15a`. Every finished match starts here, so it is not an empty state — it is an **invitation**, and it is airy on purpose.

- `YOUR ENTRY` / `NOT LOGGED`, one question — **"How was it?"** — five outline stars at 40px.
- Tags, players and the review are **not shown disabled**. One dashed line says they open once there is a rating. Four dead controls would look broken rather than waiting.
- Primary action in a fixed footer, inert until there are stars.

### 9.4 Community, once rated

`2g`. Two blocks, in this order:

1. **`YOUR ENTRY`** — stars, the Classic stamp, and **the review text**, all in one block. A review is a field on your entry, not a sibling of it.
2. **`TAGS & PLAYERS`** — up to 3 tags on one line, then one POTM and up to 2 respect on one row.

Then the crowd verdict as a single line: ratings count, Classic percentage, who took POTM.

## 10. Players

RankIt does not rate performances. It records **what the people who watched thought of the players** — different data from a stats feed.

### 10.1 Two things a rater can do

| | Budget | Meaning |
|---|---|---|
| **Player of the Match** | exactly 1 | Who the night belonged to |
| **Respect** | up to 2 | Players the scoreline was unfair to |

Respect on a player is the **same currency and glyph** as respect on a review — the RankIt diamond, outline when unspent, solid `ink` when given. One form of approval across the product. Never a heart, never a star, never gold.

Neither is required. A rating with no POTM and no respect is a complete entry.

### 10.2 One picker, two controls per row

`15b` mobile, `15y` web. Lists the players who actually played — `STARTED` then `CAME ON` with minutes — and gives every row **both** controls at 48px each.

```
POTM      empty  = 30px diamond outline
          picked = gold diamond, POTM lettered inside
          single-select: picking another moves it
respect   empty  = diamond outline in ink-5
          given  = solid ink diamond
          max 2; a third tap is refused, not queued
```

Two separate pickers would make the user open the same eleven players twice to say two things about them. Budget sits in the header (`POTM 1 / 1`, `RESPECT 1 / 2`) so it is legible before any tap. Gold appears once — on the chosen player.

The picker stays closed until a lineup exists.

### 10.3 The competition Players tab

`3d` leads with **Player of the Match**, not goals. Goals and assists come from the feed and every app has them; POTM exists only because people who watched voted.

```
WON     times this player was the match's POTM
SHARE   average share of that match's voters who picked them
```

Share bars are **`ink`, never the heat ramp** — this is agreement, not heat.

## 11. Reviews and respect

### 11.1 Getting into one

A review is never a separate object you create — it is a **field on your entry**. The composer (`15c` mobile, `15z` web) is reached from the entry and saves back into it. The button reads **Save to your entry**, never Post.

The composer states up front that the review will be spoiler-shielded for anyone with the shield on. Writers should know who can see their words before choosing them.

### 11.2 Replies are addressed, not threaded

Each reply opens with the handle it answers — `@deniz` — **generated by the reply action, not typed**. Nesting is **one level only**. Letterboxd and Ekşi Sözlük, not Twitter.

### 11.3 Respect, not likes

The RankIt diamond. Outline when unspent, solid `ink` when given. Never gold, never animated, never a heart. Counts are plain numbers.

Default sort is **most respected**. People you follow pin above strangers.

## 12. Rank and streak

### 12.1 What earns progress

| Action | Points |
|---|---|
| Rated on the night it was played | 15 |
| A like on your review | 2 |
| A night in the companion | 20 |
| A season followed end to end | 300 |

**Rating on the night is the only streak currency.** Rating late still counts as a log — just not to the streak. The streak rewards being there.

### 12.2 Seven ranks

Diamond badge, `heat`-tinted by tier, rank number inside. Rank 4 is *Terrace Regular*; rank 5 is *Season Ticket* at 3,500 points. The badge is the only place a rank number appears at display size.

## 13. People

### 13.1 Sorted by agreement, never alphabetically

The list you follow is ordered by how often you and they land on the same verdict. That is the only ordering that answers "whose opinion do I actually want."

### 13.2 No follower counts. Anywhere.

Popularity is not a reason to follow an opinion.

### 13.3 No percentage below ten shared matches

Under ten, the row reads `Too few to compare`. A percentage from four matches is noise wearing a number's clothes.

### 13.4 Four relationship states, one control

`FOLLOW` (gold) · `FOLLOW BACK` (gold) · `FOLLOWING` (neutral) · `MUTUAL` (`positive` border). Gold only on the two that are still actions.

## 14. Profile

`6b` is the tab root: identity, rank block with a chevron, three counters, shelf preview, then rows to Lists / The Hunt / Your reviews.

`2p` (Standing) is a **pushed detail screen** behind that chevron — the full points breakdown. It is not the tab root; that was the bug.

## 15. Notifications

Four channels, and **no notification ever spoils a match you haven't rated.** Three spoiler degrees are visible in `13a`: full text, score withheld, fully shielded.

---

# Part III — Web

## 16. Web is a translation, not a port

The web surface already has its own shell — sticky header, left rail, an `auto-fill` wall, and a minimisable Inspector where the phone has bottom sheets. The language carries over unchanged; the **container** changes.

Two failure modes:

1. **Rebuilding the phone wide.** A 1440px column of stacked cards is not a desktop design.
2. **Inventing a second product.** New navigation metaphors, a different card, a light theme — all wrong.

The test: anything only *bigger* on web should look like the phone. Anything genuinely *different* should be different because desktop can do what a phone physically cannot.

## 17. The shell

```
header      78   sticky, z-index 5 — lockup, nav, search, shield, streak, avatar
rail       232   standing, active collections, who you follow
wall       1fr   auto-fill minmax(320px, 1fr)
Inspector  468   docked right, when open
```

- Nav is four items — Home, Discover, Activity, Lists. Active is gold on `rgba(255,255,255,.06)`, 8px radius, 38px tall.
- **Search is a real field in the header** with a `/` hint, not an icon that opens a modal.
- The rail holds the three things the phone buries one tap deep.
- `.riw-filters` stays sticky at `top: 78px`.

## 18. The wall is 320, everywhere

```
was   repeat(auto-fill, minmax(268px, 1fr))
now   repeat(auto-fill, minmax(320px, 1fr))
```

**Every grid, not just the shelf.** A skin unrecognisable in the discover grid is a skin nobody buys into.

At 320 the card runs `--crest: 56`, `artHeight: 132`, `scoreSize: 46`.

### 18.1 The grid bug that keeps coming back

`minmax(0, 1fr)` — **never bare `1fr`** — and `min-width: 0` on every card wrapper *and* every `nowrap` row inside the card. Without both halves, ellipsis never engages and long club names blow the track out. Recorded as fixed in `DESIGN.md`; has returned twice.

## 19. Sheets become the Inspector

Do not build a web bottom sheet.

| Phone | Web |
|---|---|
| Match sheet, all five phases | Inspector — `16c` `15w` `7b` `15x` `7c` `16a` `7d` `16b` |
| Quick-rate (`3j`) | Dialog over the wall — `11a` |
| Players picker (`15b`) | Dialog — `15y` |
| Review composer (`15c`) | **In the panel** — `15z` |
| Skin picker (`2j`) | With live previews — `11b` |
| Collectible moment (`6a`) | **Full-screen overlay** — `7e` |
| Filter drawer (`6c`) | The rail, always visible — `8a` |

The Inspector keeps its **minimise** control — a web affordance with no phone equivalent, and genuinely useful: minimise, keep browsing, restore. Header 56px: label left, minimise, close.

### 19.1 Dialog or panel?

- **Dialog** when you are choosing from a fixed list and then leaving: quick-rate, the players picker.
- **Panel** when you are working on the entry itself: the composer. A review is a field on your entry and the entry lives in the panel; pulling it into an overlay would imply it is a separate object you publish.

The composer adds one desktop-only promise: **saves as you type.** A phone cannot say that honestly mid-tunnel.

### 19.2 The collectible moment is an overlay

A rating resolved inside a 468px panel would make the payoff physically smaller than the act that earned it.

```
scrim   rgba(9,10,11,.88) over the dimmed wall
glow    radial, heat-5 at 15%, centred 50% 44%
card    452 wide, --crest 76, art 196, score 66
copy    400 wide, right of the card, 60px gap
close   top right 44×44, and Escape
```

## 20. Quick-rate had to be reinvented

Mobile's hangs off the gold nav diamond. **Web has no nav diamond** — the nav is a horizontal bar, and putting a diamond in it would be a phone affordance pasted onto desktop chrome.

On web the trigger is **the wall itself**: hover a card, press `R`, a 560px dialog opens over it. You never leave the grid — the thing desktop is good at.

The dialog **shows its own shortcuts** in the footer. A shortcut nobody discovers is a shortcut that doesn't exist.

## 21. Keyboard

```
R        quick-rate the hovered card
1-5      rate          .   half star
C        stamp Classic ⏎   log
/        focus search  Esc clear / close overlay / close dialog
```

Open, neither blocking: `J`/`K` wall navigation, `?` for a shortcut sheet.

## 22. What desktop earns

Three screens that exist **because** a phone cannot do them. Everything else is the phone's logic in a wider frame, which is correct.

### 22.1 The shelf as a real wall — `7f`

Seven across at 1440, `--crest: 34`, compact, 174px tall. A hundred cards at once. On a phone the shelf is a promise; here it is the artifact, and the strongest argument the product has.

Sort options are **visible, not in a dropdown**.

### 22.2 Season heat map — `7g`

Club rows × 38 matchweek columns. `132px` label column, then `repeat(38, minmax(0, 1fr))`, 20px cells, 3px gaps.

- Cell colour is community heat for that club's match that week.
- **A gold diamond marks a night you logged** — so the map doubles as a record of what you were watching while the season happened. This is what makes it yours rather than a statistics page.
- Unplayed weeks `rgba(255,255,255,.04)`. Too-few-ratings is a dashed cell, never an invented colour.
- Legend mandatory: the ramp, the gold diamond, the dashed state.

### 22.3 Two-column review reading — `7h`

Left column 392px keeps the match, top tags and rating spread **in view while you read**. Right column is `column-count: 2` with `break-inside: avoid`. Reviews get room to be long: 13px Outfit at 1.65, multiple paragraphs. The phone truncates; desktop doesn't have to.

## 23. Web divergences from the phone

Three places where web should *not* mirror mobile:

1. **No filter drawer.** The rail is always visible, so filters live there permanently with counts beside each option (`8a`).
2. **Competition shows the table and the matchweek side by side** (`8c`), not behind tabs. The table carries an **avg heat** column — the reason a league table belongs in this product at all.
3. **First run is one screen** (`14a`), not three. The promise is the permanent left half, the choices the live right half — you read why you're here *while* you pick. The step counter stays, because collapsing three decisions shouldn't hide that Primary Arch is a real account link.

Plus two vocabulary calls: **notifications are a header dropdown** (`14b`), not the Inspector — that panel is for things you study. And **a club is a lookup, not a destination** (`12a`): it opens in the Inspector, because you look a club up mid-read and a full page would throw away what you were doing.

## 24. Lists vs collections

**A list is yours; a collection is the product's.** Lists get an author, a share control and arbitrary membership. Collections get a progress ring and a completion reward. They look alike and behave differently — do not merge the components.

## 25. Responsive

```
> 1080   rail 232, wall 320 auto-fill, Inspector 468 docked
1080     rail collapses to a 64px icon column
820      rail behind a menu; Inspector becomes a full-width
         bottom sheet — the phone's own pattern, reached by
         narrowing rather than by a separate build
< 820    single column, 320 cards go full width
```

At 820 and below, web should be indistinguishable in behaviour from the app. That is the point of responsive over desktop-only: one codebase, and a phone browser gets something that works.

---

# Part IV — Build order

Paste these one at a time. Wait for each, run the app, move on.

The whole plan has exactly one real dependency — `MatchCard` — and everything hangs off it. **Do not merge phases**; merging is what produces a half-migrated app. And do not start web until mobile is done: they share `cards.jsx` and the CSS, so two half-migrations are two half-products.

## Phase 0 — Orientation

> Read `BUILD.md` top to bottom. Then read `frontend/src/rankit/DESIGN.md` and tell me, in a short list, where the two disagree. Do not change any files yet.

Four documented rules are deliberately bent here — the heat palette, seven skins, the nav-diamond gold exemption, the thumbnail type floor. If you haven't registered those you will "fix" them back mid-build.

## Phase 1 — The card, alone

> Build `MatchCard` per Part I §2. Do not touch any screen. Render it in isolation at all seven size presets from §2.5 plus compact mode, and show me each one.

Pay attention to §2.1 (the notch hairline turns gold, not the border), §2.4 (footprint is border-box × 1.414), §2.7 (box-sizing), §2.8 (prop coercion).

**Gate:** seven presets render with no clipping, no overflow, both crest labels legible in compact mode.

## Phase 2 — Home, behind a flag

> Replace the home hero card with `MatchCard` behind a `RANKIT_NEW_CARD` flag. The old path must still work with the flag off. Match `2a` — header 64, nav 73, streak ring in the header, spoiler shield beside it.

## Phase 3 — Diary and Discover

> Move the diary shelf (`2e`) and the discover grid (`2c`) onto `MatchCard` in compact mode. Apply §18.1 exactly: `minmax(0, 1fr)` never bare `1fr`, and `min-width: 0` on every card wrapper *and* every `nowrap` row inside the card. Discover also gets the Hunt tile at the top of the scroll, above the community grid.

Say this out loud to it: that grid bug is recorded as *closed* in `DESIGN.md` and it came back anyway.

## Phase 4 — The collectible moment

> Build `6a` per §4.1. Every path that produces a rating resolves here. It is a result screen, not a celebration — no confetti, no sound, no modal to dismiss. Card at `--crest: 52`, one-line statement, three deltas, then Share / Skin / Edit. Gold appears once.

**Build it before the surfaces that navigate to it.** Four of them need somewhere to land.

## Phase 5 — The match sheet, all five phases

One prompt each. These are the most-used screens in the product.

> Build the sheet's three tabs for the **rated, finished** state: Match (`2f`) and Community (`2g`). Community is two blocks — `YOUR ENTRY` with the review inside it, then `TAGS & PLAYERS` — per §9.4.

> Build the **full time, unrated** state (`15a`) per §9.3. It is an invitation, not an empty state. Tags, players and review are not shown disabled — one dashed line says they open once there is a rating. And per §3.1 the crowd verdict is blurred until the user rates, with `REVEAL ANYWAY` always available.

> Build the **live** Match tab (`15d`) per §9.2. Live score, the XI, substitutions with minutes. **No moments, no pulse** — those belong to the Companion alone. The CTA reads *Watch with your Companion*.

> Build the **scheduled** state (`2h`): expected heat, the squad note, no lineup. Then the XI-announced variant, which is `2h` with `2f`'s lineup block swapped in and a different CTA.

> Build the players picker (`15b`) per §10.2. One list, both controls per row at 48px, budget in the header. Single-select POTM, max two respect, a third tap refused not queued.

## Phase 6 — Companion

> Build the three phases as the sheet's third tab: before kick-off (`5a`), live (`5b`), after full time (`6d`). The tab never appears or disappears; only the badge changes — join count, then `LIVE` in `heat-5`, then nothing.

> The live read is the only thing movable during a match, and it is **not** a rating: no stars, no diary entry. After full time, chat closes and the pulse becomes the record of the night.

## Phase 7 — Reviews

> Build the review composer (`15c`) per §11.1. Reached from the entry, saves back into it, button reads **Save to your entry**. It states up front that the review will be spoiler-shielded for anyone with the shield on.

> Build the all-reviews list (`5c`): sorted most-respected, people you follow pinned above everyone else.

> Build the thread (`4a`) per §11.2–11.3. Replies are addressed — generated by the reply action, not typed. **One level of nesting only.** Respect is the RankIt diamond, outline when unspent, solid ink when given; never gold, never animated.

## Phase 8 — The shell

> Header 64 / nav 73, gold active state, and the `RANK` diamond opens quick-rate (`3j`). The diamond is chrome and exempt from the gold budget.

## Phase 9 — The remaining mobile surfaces

One prompt each. Small; batching them produces shallow work.

> Profile root (`6b`) per §14, then make `2p` a pushed detail behind the rank chevron.

> People: the following list (`9a`) and finding someone (`9b`) per §13. Sorted by agreement, no follower counts anywhere, no percentage below ten shared matches.

> Competition: table (`2i`), matches (`3c`), Players (`3d`) per §10.3 — POTM leads, not goals; share bars in `ink`.

> The Hunt: index (`2m`) and a collection (`2n`), honest about unscheduled fixtures.

> Search (`3e`), notifications (`13a`) per §15, settings (`3g`), lists (`3h`), another user's profile (`3i`).

> Skins (`2j`), the share composer (`2k` portrait, `2l` wide) per §4.3.

> First run, three steps: connect Primary Arch (`4g`) → pick what you follow (`4h`) → the one-promise screen (`2r`). Ask the spoiler shield here, per §3.

## Phase 10 — States

> Implement loading, empty and offline per §5 and screens `3k`/`3l`. Skeletons only. Empty names one action and stops. Offline dims cached cards to 62%.

> Then the four error cases in §5.4, and the 20-rating threshold in §5.5.

## Phase 11 — Accessibility

> Every sheet gets `role="dialog"`, `aria-modal="true"`, Escape, focus trapped inside, focus restored to the opener. Keep the drag handle. Per §6 — the sheets are currently plain `div`s.

## Phase 12 — The marks

> Add the RankIt mark and wordmark per §7.2 — chamfered card silhouette, star knocked out via SVG mask, `RANK` in ink and `IT` in gold. Unique mask id per instance.

> Use the Primary Arch mark verbatim from `BrandIcons.jsx` per §7.3, with the one approved rule inset, and add the `< 32px` small variant. Do not redesign it.

> Fix the launcher icon per §7.1. The app currently installs with the stock Android bugdroid.

## Phase 13 — Web foundation

Mobile must be done first.

> Apply §17 and §18: header lockup, four-item nav with gold active, the real search field with its `/` hint, the rail's three sections, and the wall from `minmax(268px,1fr)` to `minmax(320px,1fr)` **in every grid**. Match `7a`.

> Bring `web/cards.jsx` onto the new geometry. **Two bugs in that file are already fixed and must not regress:** `crest_url` is the API field (not `crest`), and the `has-logo` class carries the crest counter-rotation — without it the `<img>` renders 0×0 and rotated. Keep `formatWhen` as the single date formatter shared with the phone.

## Phase 14 — The Inspector, all five phases

> Build the Inspector shell with three tabs and the minimise control, then all five phases: scheduled (`16c`), live Match (`15w`), rated Match (`7b`), unrated Community (`15x`), rated Community (`7c`), Companion before (`16a`) / live (`7d`) / after (`16b`).

Same rules as mobile §9: the tabs never change, stars open at full time, Match and Companion must not converge.

> Build the collectible overlay (`7e`) per §19.2 — not inside the Inspector. Escape closes it.

> Build quick-rate (`11a`) per §20. Hover a card, press `R`, a 560px dialog opens over it. The dialog shows its own shortcuts.

> Build the players picker as a dialog (`15y`) and the review composer **in the panel** (`15z`), per §19.1.

## Phase 15 — The three desktop-earned screens

One prompt each. Give them the time — this is what makes web worth having.

> The shelf (`7f`) per §22.1. Seven across at 1440, compact cards, sort options visible not in a dropdown.

> The season heat map (`7g`) per §22.2. Club rows × 38 weeks. **A gold diamond marks a night the user logged** — that is what makes it theirs and not a statistics page. Legend mandatory.

> Two-column review reading (`7h`) per §22.3. Left column keeps the match in view while reading; right column is `column-count: 2` with `break-inside: avoid`.

## Phase 16 — The remaining web surfaces

> Discover (`8a`) per §23.1 — **no filter drawer**, filters live in the rail with counts.

> Profile (`8b`), then people (`10a`) — mobile's two screens become one, because the list *is* the "am I already following them" check. Desktop adds the agreement bar per row; the number still ships beside it.

> Competition (`8c`) per §23.2 — table and matchweek side by side, avg heat column.

> Activity (`11d`) — feed left, your own diary strip and tonight's live match in a 340px right column.

> Search results (`11c`), entity drawer (`12a`), lists (`12b`) per §24, The Hunt (`12c`), first run (`14a`) per §23.3, notifications (`14b`), skins and share (`11b`) per §4.3.

> States (`8d`) per §5.

## Phase 17 — Responsive

> Implement §25. At 1080 the rail collapses to icons; at 820 the Inspector becomes a full-width bottom sheet and the surface behaves like the app rather than a squeezed desktop.

## Phase 18 — Close out

> Run the §26 checklist against every screen and report failures only.

> Then walk the lifecycle contracts: rate from all four entry points and confirm each lands in the collectible moment; open Profile and confirm the root is `6b` with Standing pushed; walk first run end to end; reach The Hunt from both Discover and Profile; open a live match, a finished-unrated one, and a scheduled one on both surfaces.

---

## 26. Definition of done

Per screen. Report failures only.

- [ ] No hex outside §1 (plus the heat ramp)
- [ ] No third font family
- [ ] Every grid `minmax(0, 1fr)`; every card wrapper `min-width: 0`
- [ ] `box-sizing: border-box` globally
- [ ] Wall is 320 in **every** web grid
- [ ] Heat never without its number; legend present where bars appear
- [ ] Gold once per region — per panel on web, nav diamond exempt
- [ ] Every target ≥ 44px; filter pills 48
- [ ] Type ≥ 9px except skin thumbnails
- [ ] Every animation behind `prefers-reduced-motion`
- [ ] Sheets and dialogs are real dialogs with Escape and focus restore
- [ ] Focus ring 2px `ink` at 2px offset, never gold
- [ ] The notch hairline turns gold on a Classic; the border does not
- [ ] Crest containers sized off border-box × 1.414
- [ ] All seven `MatchCard` presets clean
- [ ] Spoiler shield hides score, heat, reviews and the Classic stamp
- [ ] 20-rating threshold respected everywhere heat appears
- [ ] At 820px web behaves like the app

---

## 27. Standing rules — repeat these if it drifts

- **No new colours.** If you need a hex that isn't in §1, stop and ask.
- **No new fonts.** Rajdhani when the product speaks, Outfit when a person does.
- **No sixth stylesheet.** The cascade is already five deep.
- **Heat is data visualisation only** — never nav, never a CTA, and the number always ships with the colour.
- **Gold marks at most one thing per region**; the nav diamond doesn't count.
- **Never discard work the user already did.** The local copy is the truth until the server confirms.
- **No notification spoils an unrated match.**
- **Web is a translation, not a port.** Anything only *bigger* on web should look like the phone.
- **Screens marked superseded are not to be built:** `2o` (replaced by `5b`/`4f`), and `3a`/`3b`, which no longer exist.

---

## 28. Engineering debt — not design gaps

Recorded so nobody waits on a mockup for them.

- **Five-stylesheet cascade.** `rankit.css` → `-motion` → `-filter` → `-next` → `-v030`, plus `rankit-web.css`. Collapsing the last two would remove a class of bug.
- **Launcher icon** still points at the stock bugdroid over white (§7.1).
- **Release signing** is still the debug keystore.
- **`WatchalongPanel`** is retired by decision but still in the web source.
- **Two date formatters.** `cards.jsx` fixed this once; `formatWhen` must stay the only one.

---

## 29. What is deliberately not designed

Cut from scope, recorded so nobody hunts for a screen that doesn't exist: Season Wrapped, clips and reels, group leaderboards, and the moment a locked skin unlocks. Mobile `2r` also doesn't yet ask the spoiler-shield question that web `14a` does — the one place the two surfaces still disagree.
