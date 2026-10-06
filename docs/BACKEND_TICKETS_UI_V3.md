# Backend tickets from the UI v3 rebuild

Open items the new UI depends on. The UI is built behind a feature flag or hides the element until the API exists. Field names below are proposals, not existing API.

| # | Need | Used by | UI state until done |
|---|---|---|---|
| B8 | Single-player endpoint for football (`/api/football/players/{id}`) incl. name, plus description inputs | Football profile (S5) | Page finds the row via `?name=` search + `PLAYER_ID` match; description is one generated sentence |
| B15 | Football per-season stat rows (G, A, xG+xA, DRIB, CROSS, MIN per 90) on `/api/football/players/{id}/career` (the NBA "Last three seasons" half is done, see below) | Football S5 and NBA S2 "Last three seasons" tables | Football table shows season, team, archetype, rating, G/90, A/90 only; NBA shows the career trajectory chart |
| B16 | Football role profile: named metric percentiles vs league wingers/position (Dribbling, Chance creation, Crossing, Aerial duels, Pressing) | Football S5 "Role profile" panel and the percentile caption under the card | Panel shows archetype fit scores instead |
| B17 | Football description: headline, one-line role summary, evidence chips with percentile (DRIB 3.4 · 91st), minutes-based confidence note, "Updated" date | Football S5 description card | One generated sentence from archetype and rating |
| B18 | Football "Plays like": similarity endpoint (like `/api/players/similar` for basketball) returning name, archetype, match % | Football S5 "Plays like" panel | Panel omitted on football profiles |
| B19 | Closest real eleven: best-matching real team-season XI with match % and a one-line reason | Football Chemistry X4 "Closest real eleven" card | Card omitted; Squad fit percentile shown |
| B20 | Chemistry shape output with unit bars (Goalkeeper / Defence / Midfield / Attack) | Football Chemistry X4 side panel | Shows Role slots / Pairs / Shape / Role diversity from the existing fit |

Football rank in the season pool (the football half of B13) is still open; the NBA half is done.

## Done (basketball and shared prompt, `BACKEND_PROMPT_UI_V3_BASKETBALL.md`)

All additive; nothing renamed. Tests: `tests/test_ui_v3_backend.py`.

| # | Endpoint / field | Notes for the frontend |
|---|---|---|
| B1 | `PATCH /api/account` body `{username?, email?}` | Username: 3-24 chars `[A-Za-z0-9_]`, unique case-insensitively, profanity filter; applied immediately. Email: **not** applied; returns `pending_email` and mails a link to the new address (and a notice to the old one). Returns the `/api/auth/me` payload. Errors: 400 invalid, 409 taken, 429 too many. Flag `VITE_ACCOUNT_API=1` can go on. **Needs a page** at `/confirm-email?token=...` that calls `POST /api/account/confirm-email` `{token}` (no sign-in needed, one use, 24 h) and then refreshes `/api/auth/me`. |
| B2 | `POST /api/account/change-password` `{current_password, new_password}` | 6-18 chars. Wrong current password: 400 "Your current password is incorrect"; Google-only account: 400 "No password set — use the reset link to create one". **Every other session is signed out; the response `{ok, token}` carries a fresh token, store it** or the user is logged out. Wrong attempts share the sign-in lockout (429). |
| B3 | `POST /api/account/google/unlink` and `POST /api/account/google/link` `{credential}` | `/api/auth/me` now has `google_linked`. Unlink turns Google sign-in off for the account (sign-in with Google then returns 403 "turned off") and is refused with 400 when there is no password. Link takes a Google credential for the same email and turns it back on. |
| B4 | `POST /api/account/export` | 202 `{ok, email}`; mails a JSON attachment (profile, saved players / lineups / rosters, game results, RankIt diary). One request per 24 h, stored in the database: 429 with `Retry-After` seconds. Needs `BREVO_API_KEY` like the other mails. |
| B5 | `MAINTENANCE_MODE=1` (env, read per request) | Every `/api/*` route returns 503 + `Retry-After` (`MAINTENANCE_RETRY_AFTER` seconds, default 600) + `Date`, except `/api/health`, `/api/meta`, `/api/csp-report`. `/api/meta` also carries `maintenance` and `retry_after`. Flag `VITE_MAINTENANCE_GATE=1` can go on. |
| B6 | `X-Request-Id` on every response | A valid client-sent id (8-64 chars `[A-Za-z0-9._-]`) is kept, otherwise 16 hex chars. Also on 429/503/500; 500 bodies add `request_id`. Logged on every request line. CORS now exposes `X-Request-Id`, `Retry-After`, `Date` and allows `PATCH`. |
| B7 | `GET /api/players/{name}/scores`: `role_text`, `strengths`, `weaknesses`, `confidence`, `recent_seasons`; `GET /api/player/career`: `recent_seasons` | `strengths` (2-3, percentile 70+) and `weaknesses` (0-2, percentile 40 or lower) are `{key, label, value, unit, percentile}`, ranked against players of the same position with 20+ games, so a center is not marked down for few assists. `weaknesses` can be empty. `confidence`: `"solid"` from 40 games, else `"early read"`. `recent_seasons`: newest first, up to 3, `{season, pts, reb, ast, stl, blk, fg3m}`; earlier seasons' `fg3m` is attempts x percentage. |
| B9 | `GET /api/leaderboard/me?sport=basketball\|football&mode=&shape=` | `{sport, mode, rank, total, runs, best_pct}`; football adds `percentile`. Rank = place of the user's best run on the board (the board lists runs), `total` = the board's own total. No runs: `rank` and `best_pct` null. |
| B11 | `saved_roster_count` in `/api/auth/me` | Basketball and football rosters together. |
| B12 | `terms_accepted_at` in `/api/auth/me` | Null for accounts that accepted before this was stored (not back-filled). Set on sign-up, Google sign-up and the "Updated terms" accept. |
| B13 (NBA) | `rank`, `pool`, `age` on `/api/players/{name}/scores` | `rank` is the 1-based place by `overall_score` among ranked players; `pool` is how many are ranked (not the full table). |
| B14 | `lineup_count` on `/api/players/{name}/scores` | Real 2025-26 five-man lineups with 100+ minutes that include the player. |

Switch on: `VITE_ACCOUNT_API=1`, `VITE_MAINTENANCE_GATE=1`. Server env: `MAINTENANCE_MODE`, `MAINTENANCE_RETRY_AFTER`.
