# RankIt — Web surface

Parent: [../PRODUCT.md](../PRODUCT.md) · Sibling: [mobile.md](mobile.md) · Visual system: [../DESIGN.md](../DESIGN.md)

## What this surface is for

The web is where RankIt is **found** and where a match link **opens**. Someone
follows a shared match, reads the community's reviews, and decides whether to
install the app. It must therefore work fully signed out, which the phone never
has to.

It is not a cut-down app. It is the same product with a different entry story.

## Shape

| | |
|---|---|
| Root class | `.riw` |
| Entry | `frontend/src/rankit/web/RankItWeb.jsx` |
| Cards | `frontend/src/rankit/web/cards.jsx` |
| Routes | `/rankit`, `/rankit/discover`, `/rankit/activity`, `/rankit/lists`, `/rankit/profile` |
| Stylesheets | `rankit.css` (shared), `web/rankit-web.css` |
| Chrome | Left rail nav, sits above the Primary Arch navbar |

**It does not load** `rankit-motion.css`, `rankit-filter.css`, `rankit-next.css`,
or `rankit-v030.css`. Anything styled only in those four is unstyled here. That
is the single most common way this surface breaks.

## Measured state — 2026-09-04

| | |
|---|---|
| `.ri-*` classes used | 37 |
| Shared with the phone | **35 of 37** |
| Styled only by stylesheets this surface does not load | **0** (was 1: `.ri-live-tag`) |
| `rankitApi` capabilities called | 10 of 27 |
| Coverage of the phone | **45%** |

### The audit

Run this after adding a surface, moving a rule between stylesheets, or before a
release:

```bash
python src/audit_rankit_surfaces.py
```

It cross-references every `.ri-*` class each surface *uses* against the
stylesheets that surface *loads*, and reports classes that are styled somewhere
the surface will never see. `styledByFilesNotLoaded` must be empty.

It does not catch undefined custom properties — those need the browser. To check
those, mount a probe inside `.riw` and read the computed value:

```js
getComputedStyle(document.querySelector('.riw')).getPropertyValue('--ri-gold')
```

Empty means every borrowed rule using that token is silently broken.

## Fixed in this pass

- **Diary save button invisible.** `--ri-gold` undefined under `.riw`, so
  `background: var(--ri-gold)` fell back to transparent under `color:#15100a`.
  Contrast **1.03:1 → 10.41:1**. Same cause pushed the squad panel border to
  near-white. Tokens now declared on both shells in `rankit.css`.
- **LIVE badge unstyled.** `.ri-live-tag` lived only in `rankit-v030.css`. Moved
  to `rankit.css`.
- **Watchalong absent.** Backend had served it since it was written; the web
  referenced neither the REST history nor the socket. Added as a third drawer
  tab. Signed-out visitors read the room; the socket is not opened at all when
  signed out, because it closes anonymous connections with 4401.

## Backlog, in order

1. **The twelve missing capabilities** (see the parent's parity contract).
   Watchlist and favourite first — they are one button each and they are the two
   a signed-out visitor is most likely to want after reading a review.
2. **Squads are on the Match tab only.** Reported as missing by a user who was
   on the Community tab. Consider surfacing a count on the tab itself.
3. **Signed-out story is thin.** Sign-in prompts are plain text where the value
   of an account is never stated.
4. **`ri-diary` has no rule anywhere** — a bare wrapper. Harmless, but delete it
   or style it.
