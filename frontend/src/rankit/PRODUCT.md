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

## Working agreement — how features ship

**Set by the user on 2026-09-05. This is not a guideline; it is the process.**

### 1. Every feature lands on both surfaces, in the same pass

Anything asked for from here on is built for **web and mobile together**. Not
web-then-mobile, not mobile-with-web-to-follow. A feature that exists on one
surface is not finished, and the parity table below is how that is checked —
`onlyPhone` and `onlyWeb` must both stay empty.

This is bidirectional. Shipping to the web first and leaving the phone behind is
the same defect as the reverse, and it has already happened once: `addListItem`
briefly made the web the *ahead* surface.

The check is one command, so there is no excuse for guessing:

```bash
python src/audit_rankit_surfaces.py
```

### 2. The next APK is cut on the user's word, and carries everything

There is **no APK per feature**. Work accumulates on both surfaces, and when the
user says to build the update, the next Android release is cut containing every
feature added since the last one. Do not build or propose an APK before then —
and when the moment comes, the release must include *all* accumulated work, not
the most recent piece.

Release mechanics — version bump, build chain, signing, the release notes and the
upload the user performs at `primaryarch.net/admin/rankit-builds` — are in
[product/mobile.md](product/mobile.md).

## The parity contract

Web and mobile share `rankitApi`, `rankit.css`, and most `.ri-*` classes. They
are two front ends over one backend, not two products.

**Measured 2026-09-04:**

| | |
|---|---|
| `rankitApi` capabilities | 27 |
| On both surfaces | **27** |
| Phone only | 0 |
| Web only | 0 |
| Called by neither | 0 |
| **Web coverage of the phone** | **100%** |

Both surfaces now reach every capability. Reaching parity took two rounds and
one correction worth keeping on the record.

The first measurement matched `rankitApi.x(` and so counted only capabilities
that were *called*. Four are passed as function values instead — `openEntity`
picks its loader that way at `RankItPrototype.jsx:931` — so `list`, `member`,
`player` and `team` were reported as dead code while the phone was using them.
Matching references rather than calls moved the real figures from "12 phone-only,
5 dead, 45% coverage" to "16 phone-only, 1 dead, 38%". The gap was wider than
first reported, and the endpoints were not dead.

The one genuinely uncalled capability was `addListItem` — `POST /lists/{id}/items`,
which adds a match to an *existing* list. Neither surface had that flow; both
could only create a list from a preselected set. It was an endpoint built ahead
of its UI, not dead code, and it now exists on both.

**Parity is bidirectional.** Adding "add to list" to the web first put the web
one capability *ahead*, which is the same defect in the other direction. The
phone got it in the same pass.

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
feed, profile, search, minimisable match drawer, watchlist, favourites, follow,
POTM and respect voting, review likes and comments, lists, entity pages
(competition / player / team / member / list), watchalong, broadcast rows, and
confirmed lineups with formation and manager.

Shipped on mobile only: nothing. Parity is 27 of 27.

Not built: reporting/moderation, per-endpoint rate limiting, notification
delivery outside the app.

**Confirmed lineups are football-only.** FotMob supplies formation, the eleven,
the bench and the coach; the NBA and EuroLeague providers are not wired for it,
so basketball still falls back to the season squad. A match with no announced
lineup returns an empty list rather than a season squad presented as one.

## Known risks before beta

| Risk | Detail |
|---|---|
| Test isolation | `tests/` has no `conftest.py`; `test_football_ws_draft.py` writes real users into the **production** `data/app.db`. Run alone: 14 pass. Run with the suite: 9 error on a DB lock. |
| Contrast | 98 of 175 colour pairs are below AA (see DESIGN.md). |
| Sheets are not dialogs | Phone sheets have no `role="dialog"`, no Escape handler, no focus trap. |
| Broadcast coverage | 24 competition rules loaded, **76 held pending verification**. Turkey has one row. |
| Broadcast country | Hardcoded to `TR` on both surfaces. A UK reader is asked the wrong country and shown nothing. Fix: default from `navigator.language`, an explicit picker that is remembered, and an honest "no coverage data for X" when the country is outside US/GB/TR. |
| Cascade depth | Mobile loads five stylesheets that override each other. Three of the defects fixed in 0.5.2 came from that layering. |
| Name matching | No accent normalisation in the live query layer (a Primary Arch constraint that RankIt inherits). |
