# RankIt — Product

> Letterboxd, for the matches you watch.
>
> Companion doc to [DESIGN.md](DESIGN.md) (how it looks) and the two surface
> files: [product/web.md](product/web.md), [product/mobile.md](product/mobile.md).

## What it is

RankIt is a **diary**, not a scores app. The unit of value is what *you* thought
of a match you watched — a rating, a review, a Classic stamp, a player you gave
Player of the Match to — and what everyone else thought of the same match.

Live scores are table stakes and every competitor has them. Nobody keeps a
record of *having watched*. That record is the product.

It ships inside Primary Arch, which is a basketball/football analytics site.
Primary Arch is the **stats** side; RankIt is the **diary** side. They share an
account, a brand, and nothing else. Keep it that way — RankIt drifting into
another stats surface is the main way this product dies.

## Who it is for

Someone who watches four or five matches a week across two or three
competitions and cannot remember, six months later, which ones were good. They
already post about matches somewhere that discards the post in a day.

They are not a fantasy player and not a bettor. Nothing in RankIt should ask
them to predict anything.

## Principles

1. **The diary outranks the feed.** If a change makes the social feed better and
   the diary worse, it is the wrong change.
2. **Never invent facts.** Broadcast rows, squads, and ratings say "pending" or
   stay empty rather than guessing. `rankit_broadcasters` carries this in its own
   schema comment; `SEASON SQUAD` is labelled that way and not "Starting XI"
   because the data is a season squad and calling it a lineup would be a lie.
3. **Spoilers are a first-class concern.** Hide-scores, spoiler flags on reviews,
   and blurred scorelines exist because a diary is read *before* watching too.
4. **Two surfaces, one product.** See the parity contract below.
5. **Every list has an empty state.** A new account sees an empty diary, empty
   watchlist, empty lists, and an empty watchalong room on their first session.

## The parity contract

Web and mobile share `rankitApi`, `rankit.css`, and most `.ri-*` classes. They
are two front ends over one backend, not two products.

**Measured 2026-09-04:**

| | |
|---|---|
| `rankitApi` capabilities | 27 |
| On both surfaces | 10 |
| Phone only | 16 |
| Web only | 0 |
| Called by neither | 1 |
| **Web coverage of the phone** | **38%** |

Web is the lagging surface, and it lags in one direction only. The sixteen it is
missing: `addComment`, `broadcasts`, `comments`, `competition`, `createList`,
`favorite`, `follow`, `likeReview`, `list`, `member`, `player`, `potm`,
`respect`, `team`, `toggleWatchlist`, `watchlist`.

**An earlier version of this table was wrong** — it said twelve phone-only, five
dead, and 45% coverage. The audit matched `rankitApi.x(` and so missed every
capability passed as a *function value* rather than called, which is how
`openEntity` picks its loader (`RankItPrototype.jsx:931`). Four endpoints were
reported dead while the phone was using them. The audit now matches references,
not calls.

Only **`addListItem`** is genuinely called by nothing, and it is not dead code:
`POST /lists/{id}/items` adds a match to an *existing* list, and neither surface
has that flow — both can only create a list from a preselected set. The endpoint
was built ahead of its UI. "Add this match to a list" is a real gap on both
surfaces, not an endpoint to delete.

**Rule going forward: a feature is not done until it exists on both surfaces, or
until the surface gap is written down here with a reason.** Two reasons are
legitimate — the capability is meaningless on that surface (haptics), or the
surfaces genuinely differ (a signed-out web visitor can read a watchalong room;
signed-out is not a normal app state).

### Why parity breaks silently

Both surfaces borrow classes from `rankit.css`, but they mount under different
roots — `.rankit-app` on the phone, `.riw` on the web. Twice now that has broken
something invisibly rather than loudly:

- `--ri-gold`, `--ri-green`, `--ri-card`, `--ri-line` were declared only on
  `.rankit-app`. The web's "Save to diary" button rendered at **1.03:1**
  contrast — present, functional, invisible. Reported as a missing feature.
- `.ri-live-tag` was styled only in `rankit-v030.css`, which the web does not
  load, so the LIVE badge rendered as unstyled text.

Both are fixed, and both were found by measuring rather than looking. The audit
that finds them is in `product/web.md`. **Run it when adding a surface or moving
a rule between stylesheets.**

## State of the product

Shipped and working on both: match discovery, rating, review, diary, activity
feed, profile, search, minimisable match drawer.

Shipped on mobile only: the twelve above.

Backend built, no client on web until 2026-09: watchalong (live match chat).
Now on both.

Not built: reporting/moderation, per-endpoint rate limiting, notification
delivery outside the app, real verified lineups.

## Known risks before beta

| Risk | Detail |
|---|---|
| Test isolation | `tests/` has no `conftest.py`; `test_football_ws_draft.py` writes real users into the **production** `data/app.db`. Run alone: 14 pass. Run with the suite: 9 error on a DB lock. |
| Contrast | 98 of 175 colour pairs are below AA (see DESIGN.md). |
| Sheets are not dialogs | Phone sheets have no `role="dialog"`, no Escape handler, no focus trap. |
| Broadcast coverage | 24 competition rules loaded, **76 held pending verification**. Turkey has one row. |
| Cascade depth | Mobile loads five stylesheets that override each other. Three of the defects fixed in 0.5.2 came from that layering. |
| Name matching | No accent normalisation in the live query layer (a Primary Arch constraint that RankIt inherits). |
