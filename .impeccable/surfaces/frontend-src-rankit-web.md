---
version: 1
slug: "frontend-src-rankit-web"
primary_target: "frontend/src/rankit/web"
related_targets: []
---

## Scope

The RankIt web surface on primaryarch.net: a left rail (Home · Discover · Activity ·
Lists · Profile · Download RankIt) over the match catalog, the member's diary, lists and
the APK download. Visitor mode: **Operate** — people come to find a match, say what they
thought of it, or take the build.

## Audience and job

Primary Arch members meeting RankIt for the first time; people handed the APK link who
may not have an account; existing app users on a desktop. One job across all three: find
the match, log it, keep the record. Owner decision: the web is the mobile app's equal,
not a preview of it.

## Direction contract

THESIS: The card is already this product's unit, so the desktop is the shelf the phone
never had — a wall of match cards at full card language, refusing the dashboard's
summary-tiles-and-charts arrangement that a catalog this size invites.

OWN-WORLD: Primary Arch inherited whole — cut-corner cards, aura glow, yamabuki gold on
near-black, `font-logo` display, the `ri-*` component family. No new identity; the rail
and the wall are drawn in the language the phone already speaks.

STORY: A visitor sees real matches at real card scale in the first viewport, recognises
the app they know or the product they were sent to install, opens one, and rates it
without the page navigating away.

FIRST VIEWPORT: Left rail at 2/12, standing filter rail beside it, then a 3–4 across wall
of match cards filling the remaining width. The newest matchday leads. Primary action is
the card itself; Download RankIt sits at the rail's foot, apart from the five.

FORM: The Wall — index 3 of seven ranked structures, dealt by seed key b5e9e901.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

Whether the wall paginates or loads on scroll at 6,000 fixtures. Diary and Lists reuse
the wall or need their own arrangement.
