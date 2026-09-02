# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three confirmed primary audiences, in order the user gave them no particular ranking:

- **Everyday NBA fans** — browse the site to see what a player's "real role" is (beyond the
  five traditional positions), play the Lineup Builder game for fun (draft, head-to-head,
  Rewrite History dynasty mode).
- **Fantasy basketball / fantasy football players** — want the archetype and scoring data
  to inform their own fantasy-league decisions (a dedicated fantasy-points scoring engine
  is planned, see `docs/fantasy-scoring-backend-report.md`; not built yet).
- **Scouting / front-office-adjacent enthusiasts** — use the prospect grading (floor/
  ceiling/grade/tier) and comparables engine ("projects like a young X") as a real
  evaluation tool, not just entertainment.

Explicitly not the primary audience (per this session's interview): pure stat-nerd/
analytics-first users who'd want to interrogate the methodology itself. The methodology
is rigorous, but that rigor is in service of the three audiences above, not an audience
in its own right.

## Product Purpose

Primary Arch assigns every basketball player a quantitative "archetype" identity (12 core
roles + 22 modifier tags — e.g. "Pressure Scoring Engine") derived from a hand-crafted
jargon dictionary and validated against real statistics, then applies it across NBA
(current + historical back to 1983), G-League, NCAA, and EuroLeague. On top of that
foundation it offers: archetype/lineup compatibility scoring, prospect grading, a
comparables engine, and a full "Lineup Builder" game (draft, head-to-head multiplayer,
and a deep "Rewrite History" mode that replays real historical seasons with a
user-drafted roster against real simulated opponents).

A parallel football (soccer) adaptation for the big-5 European leagues is being built by
the user independently — see "Scope boundary" below.

## Positioning

Confirmed by the user: the thing a competing site could not truthfully copy without doing
the same underlying work is the **validated, percentile-based archetype methodology
itself** — not just the game or the UI. Concretely:

- Archetypes are grounded in a hand-written jargon dictionary (ground truth), not an
  algorithm's own invented taxonomy.
- Every metric is percentile-ranked within its season/league before scoring, not raw
  stats — this is what makes a 1990 player's archetype comparable to a 2025-26 player's,
  and what makes the same engine transportable across four different leagues.
- Two-tier validation (component F1 + composite Jaccard) against a real, hand-labeled
  40-player ground-truth set, with thresholds optimized (not guessed) against it.
- Historical depth (1983+) and multi-league breadth (NBA/G-League/NCAA/EuroLeague) that
  most single-league or single-season stat sites don't attempt.

The game (Lineup Builder) and the analytics site are two expressions of the same
underlying engine, not two separate products — the game's rating math and the site's
`overall_score` deliberately share the same percentile-based, dispersion-preserving
philosophy (see `CLAUDE.md`'s "ONAYLANMIŞ TASARIM KARARLARI").

## Operating Context

- Backend: FastAPI (Python), reading pre-fetched/cached Parquet data (`data/*.parquet`),
  not live-querying stats.nba.com/Torvik/euroleague-api per request.
- Frontend: React + Vite, Tailwind-based dark theme ("Primary Arch" brand identity).
- Data refresh is a manual/scheduled fetch step (`src/fetch_*.py`), not real-time.
- Accounts, an admin panel, a blog/CMS, and community tag-correction workflows already
  exist and are live.
- Development happens primarily through Claude Code sessions with an extensive, actively
  maintained `CLAUDE.md` brief — architectural decisions are meant to be checked against
  it before being changed.

## Capabilities and Constraints

**Confirmed functionality (live):**
- Multi-league archetype scoring (NBA current + historical, G-League, NCAA, EuroLeague).
- Prospect grading, comparables engine (NBA-only, 1983+ rookie-season pool).
- Lineup/duo affinity scoring; archetype affinity matrix (partly empirically-grounded for
  current-season NBA).
- Lineup Builder game: Single Player (Quick Sim + Rewrite History dynasty mode), Same
  Screen, With a Friend (live multiplayer), Online Opponent (matchmaking + Board
  Challenge vs. top leaderboard rosters).
- Accounts, blog/CMS, admin panel, community tag corrections.

**Known constraints (from `CLAUDE.md`):**
- Player name matching isn't standardized across all code paths (NBA has accent-folding
  in some paths, live API name lookup doesn't; G-League/NCAA have no normalization at
  all).
- G-League/EuroLeague lack strength-of-schedule signal for prospect grading.
- G-League/NCAA/EuroLeague have no modifier tags (only the 12 core nouns).
- Several core archetypes lean heavily on NBA-only optical tracking metrics that will
  never exist for G-League/NCAA/EuroLeague — partially mitigated (excluded per-league
  where the gap is severe) but not fully resolved for EuroLeague yet.
- Online multiplayer resilience (dropped-connection handling) was a known gap; partially
  fixed this session (fatal-vs-transient connection distinction), broader hardening still
  open.

**Explicitly undecided (recorded, not invented):**
- Fantasy-points scoring engine: designed (see the report above), not implemented.
  Open questions there: which scoring presets first, custom user profiles or fixed
  presets, season-average vs. real per-game data.
- Monetization: legal pages (Privacy/Terms/Contact/Affiliate Disclosure) exist as
  reviewed-pending drafts; affiliate program applications and AdSense have not been
  submitted yet.
- GA4/analytics: not yet wired in (waiting on a Measurement ID).

## Scope boundary

The user is building a **football (soccer) adaptation** (top-5 European leagues) as a
parallel, independent effort — evidence of this is already visible in the working tree
(`config/football_signatures.py`, `src/football/`, `frontend/src/pages/football/`, a
dual-sport nav split in `App.jsx`). This PRODUCT.md describes the basketball product;
the football side is being built by the user directly, not through this assistant, and
should be treated as its own product with its own eventual PRODUCT.md rather than an
extension of this one.

## Brand Commitments

- Name: **Primary Arch**. Social presence: X (`@primary_arch`), Instagram
  (`@primary_arch`). Contact: `info@primaryarch.net`.
- Visual identity is fixed and any new UI work must match it, not redefine it: dark
  theme, yamabuki/asagi color palette, Rajdhani (display) / Outfit (body) typography.
- All user-facing frontend text is English (code comments are Turkish — the team works in
  Turkish, the product is English-facing).

## Evidence on Hand

- A hand-labeled ground-truth set (`nba_scouting_tags.xlsx`, 40 players + a jargon
  dictionary) used to validate the archetype engine.
- An extensive `CLAUDE.md` project brief documenting every major architectural decision
  and its rationale — treat it as a primary source, not a summary to re-derive.
- No customer testimonials, case studies, press coverage, or usage-scale numbers are on
  hand — do not invent or imply any.

## Product Principles

1. Percentile-based, not raw-stat-based — comparability across eras and leagues is a
   non-negotiable design constraint, not a style preference.
2. The methodology (validated archetype system) is the actual product; the game is a
   vehicle for it, not a separate thing bolted on.
3. Don't silently degrade across leagues — where data genuinely doesn't support an
   archetype (e.g. optical-tracking-dependent ones in non-NBA leagues), say so explicitly
   rather than shipping a diluted score.
4. Design decisions that are already "ONAYLANMIŞ" (approved) in `CLAUDE.md` are load-
   bearing, not defaults to casually revisit.
5. Brand identity (dark theme, yamabuki/asagi, Rajdhani/Outfit) is fixed — new surfaces
   adapt to it, it doesn't adapt to them.

## Accessibility & Inclusion

No product-specific accessibility standard has been established yet (open, not decided
by this assistant).
