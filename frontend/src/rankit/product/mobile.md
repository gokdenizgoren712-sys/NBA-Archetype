# RankIt — Mobile surface

Parent: [../PRODUCT.md](../PRODUCT.md) · Sibling: [web.md](web.md) · Visual system: [../DESIGN.md](../DESIGN.md)

## What this surface is for

The app is where the diary is **kept**. It is opened during and just after a
match, with one hand, often in a dark room. Everything expensive — logging,
POTM, respect, lists, watchalong — lives here first and is ported to web second.

Signed-out is not a normal state here. The app assumes an account.

## Shape

| | |
|---|---|
| Root class | `.rankit-app` |
| Entry (browser route) | `/rankit/app` → `RankItPrototype.jsx` |
| Entry (packaged app) | `RankItMobileApp.jsx`, chosen in `main.jsx` |
| Shell | Capacitor 8, `net.primaryarch.rankit`, minSdk 24 / targetSdk 36 |
| Stylesheets | `rankit.css` → `rankit-motion.css` → `rankit-filter.css` → `rankit-next.css` → `rankit-v030.css` |
| Nav | Bottom bar, five tabs, centre Rank diamond |

**Load order is load-bearing.** Five stylesheets override one another and later
files win ties. Three of the defects fixed in 0.5.2 came from exactly that.
`rankit-next.css` in particular re-sizes things `rankit.css` already sized.

## Measured state — 2026-09-04, 375×812

Measure at a phone viewport. Measuring `/rankit/app` at desktop width reports
false clipping, because it is a phone-only layout being asked to fill a width it
never ships at.

| | Before 0.5.2 | Now |
|---|---|---|
| Crest shields clipped by the card | 11.7px/side (hero), 9.8px (grid) | **0 of 60 cards** |
| Cards with horizontal overflow | 3 | **0** |
| League label size | **7px** | 10px / 700 |
| League tap target | **36×13px** — under WCAG 2.5.8's 24px floor | 36×36 |
| Bottom-nav labels | 7.2px (`<small>` shrinks to 0.8em) | 9.5px |
| Filter pills | 8.5px / 31px tall | 10px / 38px |
| Hero card | 431px tall, **76% empty** | 317px, 59% |
| Share button over stage label | 23px overlap | none |
| Classes styled by unloaded stylesheets | 0 | **0** |
| `.ri-*` classes used | — | 155 |
| `rankitApi` capabilities called | — | 22 of 27 |

Type still under 10px, and deliberately so: `BY PRIMARY ARCH` (8px wordmark) and
the section eyebrows (9px). Those are labels, not reading text.

### The audit

Two halves. Static, for stylesheet reachability:

```bash
python src/audit_rankit_surfaces.py
```

And in-browser at a phone viewport, for things only layout knows — sub-10px
text, tap targets under 44px, horizontal overflow, unnamed controls, crest
clipping. The browser half is what caught the 7px league label and the 36×13
tap target; neither is visible in source.

## Fixed in 0.5.2 (versionCode 10)

Reported from the shipped 0.5.1 build:

- **Gold box on the search field.** `.rankit-app input:focus-visible` (0,2,1)
  outranked `.ri-floating-search>input{outline:0}` (0,1,1). A focused text input
  always matches `:focus-visible` regardless of input modality, so it fired on
  touch. The ring moved to the pill via `:focus-within` rather than being deleted.
- **Crest diamond touching the card border.** A 62px shield rotated 45° occupies
  87.7px; its column was 61px, and the card clips. The shield stayed — it is the
  card language — and the column maths was rebuilt around the rotated footprint.
- **Sheet close button half-hidden and 53% unclickable.** `.ri-v03-hero` is
  `position:relative` and later in the DOM, so at `z-index:auto` it painted over
  the button. `elementFromPoint` at the button's centre returned the hero.

Also: kick-off time printed twice per card and the date twice in the sheet; a
404'd crest left the shield blank and now falls back to the club monogram.

A ghosted giant "VS" was built to fill the empty art region — mirroring the
`.ri-player-no` motif — and **removed**: with no silhouette to anchor it, it
collided with the crests. The emptiness was a proportion problem.

## Releases are cut on request, not per feature

The user calls the release. Work accumulates on both surfaces, and when they say
to build the update, the APK carries **everything** added since the last one —
not the most recent piece. Do not build or propose one before then. See the
working agreement in [../PRODUCT.md](../PRODUCT.md).

Mechanics: bump `versionCode` and `versionName` in
`frontend/android/app/build.gradle`, then

```bash
npm --prefix frontend run build:rankit-mobile && npx --prefix frontend cap sync android
```

then `gradlew.bat assembleDebug` from `frontend/android` (PowerShell — it is not
reachable from Git Bash). Verify the built APK with `aapt dump badging` and
`apksigner verify --print-certs` before handing it over. Builds are signed with
the debug keystore (`CN=Android Debug`, v2 scheme); the key must stay the same
across alphas or the update will not install over the previous one.

The user uploads it at `primaryarch.net/admin/rankit-builds` — that step needs an
admin session and is theirs, not ours. Give them the version name, version code,
channel, release notes and the SHA-256 to check against.

## Backlog, in order

1. **Sheets are not dialogs.** No `role="dialog"`, no Escape, no focus trap.
   This is the largest accessibility gap in the app.
2. **Filter pills are 38px tall**, still under Android's 48dp guidance. The
   filter panel's vertical budget is the constraint.
3. **Cascade depth.** Five stylesheets is the root cause behind several defects.
   Collapsing `rankit-next.css` and `rankit-v030.css` into `rankit.css` would
   remove a whole class of bug, and is a mechanical change.
4. **Release signing.** Builds are debug-keystore (`CN=Android Debug`), v2
   scheme. Fine for alpha; a real upload key is needed before any store channel.
