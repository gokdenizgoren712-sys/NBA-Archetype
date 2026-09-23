repo: gokdenizgoren712-sys/NBA-Archetype
branch: main
path: frontend/src/rankit

## Last sync

date: 2026-09-07T09:12:00Z

### Updated in this project

- Turn 5 retired the watchalong tab: the match sheet's third tab is now **Companion** (`5a` before kick-off, `5b` live), and `3a`/`3b` were deleted. Added `5c` **All reviews** — the surface the Community tab links to, which had no design at all.
- Turn 4 answered nine review notes: compact `MatchCard` mode (fixes crest/score collision at shelf width), respect replacing likes, addressed replies, crest-in-diamond system, seven skins × shelf × share, first-run flow.
- Both marks specified in `4i`. RankIt redesigned from scratch (card chamfer + star knockout). **Primary Arch taken verbatim from `BrandIcons.jsx`** — my arch proposal was withdrawn at the owner's direction; a mono construction was added and approved.
- Found and reported: `mipmap-anydpi-v26/ic_launcher.xml` points at the stock Android bugdroid, so the app installs with the default icon. `rankit_launcher.xml` exists but was never wired.
- `HANDOFF.md` carries the build order, token table, component contracts, rank/streak mechanics and the social model.

- Rebuilt all 18 mockup screens on the real card language from `frontend/src/rankit/DESIGN.md`: `clip-path` notches with the 22px hairlines that turn gold on an Instant Classic, 68° holo sheen, crest shield sized off its rotated footprint, sized (not grown) art region, Rajdhani for product voice.
- Extracted `MatchCard.dc.html` as the shared card — club colour arrives as `--home`/`--away` CSS vars and mixes into the gradient, exactly as the shipped component reads it from the API.
- Four documented rules deliberately bent with the user's written permission: a third (heat) palette, all seven collectible skins, the nav diamond exempted from the one-gold budget, and free type sizes inside skin thumbnails.
- Carried the 0.5.2 audit fixes into every screen: 44×44 targets, 48px filter pills, 9px type floor, four named text tokens only, reduced-motion coverage.
- Fixed a grid regression that reproduced the exact defect DESIGN.md records as closed: card wrappers were grid items without `min-width:0`, so `1fr` resolved to min-content and the right-hand cards overflowed the phone. Now `minmax(0,1fr)` tracks plus `min-width:0` on the wrappers and on MatchCard's nowrap rows, so the ellipsis engages as documented.
- Built the web surface (`RankIt Web.dc.html`) on the real frame: sticky left rail + the wall at `repeat(auto-fill, minmax(268px, 1fr))`, the 288px/85vw filter slide-over, and the 820px breakpoint where the rail becomes a bottom bar. Ground is `#0b0c0e`; `--ri-bg` is never defined in `rankit-web.css`, so ground-web is used as DESIGN.md instructs. The Classic stamp now appears on web — `RankItWeb.jsx:375` records that it was missing there.
- Completed the mobile surface with twelve screens that had no design at all (`3a`–`3l`): watchalong tab, companion pre-kick-off, competition Matches and Players, search, notifications, settings, lists, another user's profile, the quick-rate sheet behind the gold diamond, and the loading / empty / offline states. No new palette entries.
- Wrote `HANDOFF.md` — the full token table, `MatchCard` geometry and prop contract with six verified size presets, the Classic stamp spec, the state machines, and a phase-by-phase prompt order for Claude Code. Mobile is now complete enough to implement from.
- Instant Classic is now the real stamp lockup from `RankItPrototype.jsx`'s `ClassicStamp` — `CLASSIC` over `RANKIT SELECT`, rotated with a double gold rule so it reads as pressed ink rather than a chip. It takes the footer slot the old label held, so the card gains no height and gold still lands once per region. The gold notch hairlines stay as the card-level promotion.
- Read `frontend/public/icons.svg`: it holds only social/brand glyphs (bluesky, discord, github, x, docs) stroked in `#aa3bff`, which is outside RankIt's palette and has no nav or UI icons — nothing there for these screens, so the inline icon set stays.
- Local `android/` folder is the Capacitor shell only (no UI source) — not used as design input.

## Screen map

| Project screen | Built from |
|---|---|
| Redesign 2a–2b (Home, night flow + shield) | `RankItPrototype.jsx`, `rankit-v030.css`, `DESIGN.md` |
| Redesign 2c (Discover + filter drawer) | `rankit-filter.css`, `rankit-next.css` |
| Redesign 2d–2e (Diary timeline + shelf) | `RankItPrototype.jsx`, `mockData.js` |
| Redesign 2f–2h (Match sheet: Match, Community, upcoming) | `RankItPrototype.jsx`, `rankit.css` sheet + score band |
| Redesign 2i (Competition table) | `RankItPrototype.jsx`, `rankitApi.js` |
| Redesign 2j–2l (Skins, share portrait + wide) | `DESIGN.md` horizontal collectible card; new concept |
| Redesign 2m–2n (The Hunt, collection) | New concept |
| Redesign 2o (Live companion) | Existing watchalong surface, `product/mobile.md`; extended |
| Redesign 2p (Rank & streak) | New concept |
| Redesign 2q (Friends shelf) | `RankItPrototype.jsx` activity feed |
| Redesign 2r (First run) | `product/mobile.md` — signed-out is not a normal state |
| MatchCard.dc.html | `DESIGN.md` match card + crest/notch geometry, 0.5.2 fixes |
| RankIt Prototype.dc.html | All of the above; tokens from `DESIGN.md` frontmatter |
| RankIt Web.dc.html | `web/rankit-web.css` (wall grid L135, drawer L387, breakpoint L494/609), `web/RankItWeb.jsx`, `web/cards.jsx` |
| Redesign 3a (Watchalong tab) | Third tab in `RankItPrototype.jsx` sheet — badge existed, screen did not |
| Redesign 3b (Companion pre-kick-off) | Watchalong surface, `product/mobile.md` |
| Redesign 3c–3d (Competition Matches, Players) | `rankitApi.js`, competition sheet tabs |
| Redesign 3e–3g (Search, Notifications, Settings) | Reachable in shell, never designed |
| Redesign 3h–3i (Lists, public profile) | `product/mobile.md`, activity feed |
| Redesign 3j (Quick-rate sheet) | The `RANK` diamond's destination |
| Redesign 3k–3l (Loading, empty / offline / end) | New — skeletons mirror MatchCard geometry |
| HANDOFF.md | Build order + contracts for Claude Code |
| RankIt Redesign v1.dc.html | Superseded first pass, kept for reference |

## Open in the repo, not fixable in mockup

- Five-stylesheet cascade (`rankit.css` → `rankit-motion` → `rankit-filter` → `rankit-next` → `rankit-v030`); collapsing the last two would remove a class of bug.
- Phone sheets still lack `role="dialog"`, Escape and a focus trap — the mockups show the intended behaviour on 2f.
- Release signing is still the debug keystore.
