# Backend prompt: UI v3, basketball and shared work

You are working in the Primary Arch repo (FastAPI in `api/main.py`, SQLite via `api/db.py`, data in `data/*.parquet`). The new frontend (branch `ui-v3`) is built and ships behind feature flags or hides elements until these endpoints exist. Implement the items below. Rules:

- Additive only. Do not rename or remove existing fields or routes; the current frontend and the Android RankIt app use them.
- Field names below are proposals. If you pick different names, update `docs/BACKEND_TICKETS_UI_V3.md` and tell the frontend owner.
- Never return NaN in JSON (parquet gaps must become `null`); cache heavy reads with the existing `lru_cache` pattern.
- Add pytest coverage next to the existing API tests. Do not write into the developer's real database in tests (see the recent test-isolation commit).
- All user-facing strings you return must be English.

Items marked **(shared)** are used by both the basketball and football sides of the site, so they live in this file. The football prompt (`docs/BACKEND_PROMPT_UI_V3_FOOTBALL.md`) does not repeat them.

## A. Account (shared) — Settings page

**B1 `PATCH /api/account`** (auth required). Body: `{ "username"?: str, "email"?: str }`. Username: 3 to 24 chars, letters, numbers, underscore, unique (case-insensitive). An email change must send a confirmation mail and only switch after confirmation; until then return `{ "pending_email": "..." }`. Return the updated user payload (same shape as `/api/auth/me`). Frontend flag: `VITE_ACCOUNT_API=1`.

**B2 `POST /api/account/change-password`** (auth). Body `{ "current_password", "new_password" }`. New password 6 to 18 chars. Return 400 with a clear `detail` if the current password is wrong; Google-only accounts (no password) get 400 "no password set". Keep the existing reset-link flow (`/api/auth/forgot-password`) unchanged.

**B3 Google unlink.** Endpoint of your choice (document it). Refuse with 400 when Google is the account's only sign-in method (no password set).

**B4 Data export request.** Endpoint of your choice. Emails the user a copy of their profile, saved rosters, saved lineups and RankIt diary. Rate limit it (one per 24 h). Return 202.

**B12 Terms accepted date.** Store the accept time next to `terms_version` and return `terms_accepted_at` in `/api/auth/me`.

**B11 Saved roster count.** Add `saved_roster_count` (basketball and football together) to the `/api/auth/me` payload.

**B9 Leaderboard rank and run count.** Add to `/api/auth/me` (or a new `GET /api/leaderboard/me?mode=`): `rank`, `total` (the "rank of N"), `runs` (count of the user's saved runs), `best_pct`. Basketball first (`lineup_games`, by mode classic or salarycap). Do the same for the football board (`saved_rosters` where sport = 'football') so the football leaderboard tab can show it too.

## B. System (shared)

**B5 Maintenance signal.** When the API is in maintenance, return `503` with `Retry-After` and `Date` headers on every `/api/*` route, or expose a flag in `/api/meta`. The frontend gate is `VITE_MAINTENANCE_GATE=1`.

**B6 Request id.** Add an `X-Request-Id` header (generated per request, also logged) on all responses, especially errors. The 500 page prints it as "Ref ...".

## C. Basketball player pages (NBA profile)

**B7 Description inputs and per-season stats.**
- Add to the NBA player scores payload (`/api/players/{name}/scores` or equivalent): `role_text` (one sentence on how the archetype shows up for this player), `strengths` (top 2 to 3 metrics with value and percentile), `weaknesses` (1 to 2), `confidence` ("solid" or "early read", from games played).
- Add the last three seasons of per-game stats: `[{season, pts, reb, ast, stl, blk, fg3m}]`. A new field on the existing career endpoint (`/api/player/career`) is fine.

**B13 Rank and age.** On the player payload add `rank` (position in the overall-score ordering for the season, 1-based), `pool` (pool size) and `age`.

**B14 "Found in N lineups".** For the current season, the number of real lineups (above the existing minimum minutes) that contain the player. Add as `lineup_count` on the player payload or as its own endpoint.

## Acceptance
- Existing tests pass.
- New tests for every endpoint, including auth failures and the Google-only edge cases.
- Update `docs/BACKEND_TICKETS_UI_V3.md` (remove or mark done) and tell the frontend owner which env flags to switch on.
