# Backend prompt: UI v3, football

You are working in the Primary Arch repo (FastAPI in `api/main.py`, football scores in per-season parquet files loaded by `_load_football_scores`, chemistry reference in `_chem_reference()`). The new football pages (branch `ui-v3`) are built and hide elements until the data below exists. Rules:

- Additive only. Do not rename or remove existing fields or routes; the current frontend uses them.
- Field names are proposals. If you pick different names, update `docs/BACKEND_TICKETS_UI_V3.md` and tell the frontend owner.
- Never return NaN in JSON (missing parquet cells must become `null`); keep the `_f` and `_s` guards used in `/api/football/players/{id}/career`.
- Add tests next to the existing football API tests; do not write into the real database in tests.
- User-facing strings in English.

Account, system, saved-roster-count and leaderboard-rank items that also touch football (B1 to B6, B9, B11, B12) are in `docs/BACKEND_PROMPT_UI_V3_BASKETBALL.md` because they are shared. Do not duplicate them here. The football leaderboard rank for B9 is described there.

## Football player profile (`/football/players/:id`)

**B8 Single-player endpoint.** `GET /api/football/players/{player_id}?season=` returning the same row shape as one entry of `/api/football/players` (including `PLAYER_NAME`, `TEAM`, `LEAGUE`, `PHASE`, `POSITION`, `score_*`, `primary_arch`, `overall_score`, `MINUTES_TOTAL`, `APPS`). Today the frontend has to search by `?name=` and match `PLAYER_ID`. Default season is the latest; if the player has several rows in a season (phase or league), return the one with the most minutes.

**B13 (football part) Rank.** Add `rank` (1-based in the season overall-score ordering within the same phase) and `pool` to that payload.

**B15 Per-season stat rows.** Extend the `/api/football/players/{id}/career` rows with per-90 stats: `xg_xa_90`, `dribbles_90`, `crosses_90`, and keep `MINUTES_TOTAL`. Keep `goals_90` and `assists_90`. Say which columns are per 90 so the table can label them.

**B16 Role profile.** On the player payload add `role_profile`: 5 named percentiles versus the player's position group in the same league and season, e.g. `[{key:"dribbling", label:"Dribbling", pct:91}, ...]` (Dribbling, Chance creation, Crossing, Aerial duels, Pressing; for goalkeepers and defenders pick the five metrics that fit the phase and say which in `label`). Also return `peer_group` text such as "vs wingers · Bundesliga · 2025-26" for the caption under the card.

**B17 Description.** `description`: `{ headline, summary, evidence:[{label, value, pct}], confidence_note, updated_at }`. Example evidence chip: DRIB 3.4 at the 91st percentile. `confidence_note` is driven by minutes ("Played 2,450 minutes, so the read is solid."). Generate it on the server from the percentiles, deterministic, no free-text model calls.

**B18 Plays like.** `GET /api/football/players/{id}/similar?season=&limit=3` returning `[{player_id, name, primary_arch, match_pct}]`. Same method as the basketball `/api/players/similar` (centered cosine over the archetype score vector), restricted to the same phase and the same season, excluding the player.

## Football chemistry (`/football/lineups`)

**B19 Closest real eleven.** In the best-XI response add `closest_real`: `{ team, season, match_pct, reason }`. The real XI comes from the existing reference set (`_chem_reference()`), `match_pct` is the role-slot overlap with the generated XI, and `reason` is one plain sentence such as "Same shape of roles in 9 of 11 slots."

**B20 Unit bars.** Add `units` to the best-XI fit: `{goalkeeper, defence, midfield, attack}`, each 0 to 1, computed from the same slot scores that feed `slot_scores`. Do not change the existing `fit` fields.

## Acceptance
- Existing football tests pass.
- New tests per endpoint, including a goalkeeper, a player with one season only, and a player id that does not exist (404).
- Update `docs/BACKEND_TICKETS_UI_V3.md` and tell the frontend owner what to switch on.
