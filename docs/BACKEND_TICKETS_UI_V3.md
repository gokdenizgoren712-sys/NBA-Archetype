# Backend tickets from the UI v3 rebuild

Open items the new UI depends on. The UI is built behind a feature flag or hides the element until the API exists. Field names below are proposals, not existing API.

| # | Need | Used by | UI state until done |
|---|---|---|---|
| B5 | Maintenance signal: API `503` with `Retry-After` (and `Date`), or a flag in `/api/meta` | Maintenance page (`components/shell/Maintenance.jsx`) | Gate is off unless `VITE_MAINTENANCE_GATE=1`; when on, any `/api/*` 503 opens the page; times come only from response headers |
| B6 | Request id header on error responses (e.g. `X-Request-Id`) | 500 page "Ref ..." line | Line is omitted when the error carries no id |
| B11 | Saved roster count for the signed-in user (e.g. in the `/api/auth/me` payload) | Mobile drawer profile card ("N saved rosters") | Card shows the username and "Profile" only |
| B1 | `PATCH /api/account` (username, email + confirmation mail) | Settings › Account | Username field and Save are disabled unless `VITE_ACCOUNT_API=1`; email Edit always disabled |
| B2 | `POST /api/account/change-password` (body proposed: `current_password`, `new_password`) | Settings › Security | Form disabled unless `VITE_ACCOUNT_API=1`; "Send a reset link" works today via `/api/auth/forgot-password` |
| B3 | Google unlink (blocked when it is the only sign-in method) | Settings › Connections | Disconnect disabled; no endpoint path assumed |
| B4 | Data export request (emails a copy) | Settings › Data & privacy | Request export disabled; no endpoint path assumed |
| B9 | Signed-in user's leaderboard rank and run count | Profile tiles ("Rank on the board", "Runs") | Tiles omitted; Best rating is the max saved roster Lineup Fit |
| B7 | Basketball player description inputs (role text, strengths) and "Last three seasons" per-game table (PTS/REB/AST/STL/BLK/3PM per season) | NBA profile (S2) | Description is one sentence built from rating/rank only; Career trajectory chart shown instead of the table |
| B8 | Single-player endpoint for football (`/api/football/players/{id}`) incl. name, plus description inputs | Football profile (S5) | Page finds the row via `?name=` search + `PLAYER_ID` match; description is one generated sentence |
| B13 | Rank within the season pool on the player payload (NBA and football), plus age (NBA) | NBA profile S2 and football profile S5 header trio ("Rank", "Age 22") | NBA shows Rating / Top % / Games; football shows Rating / Pos / Apps; age omitted |
| B14 | "Found in N lineups" count for a player (current season) | NBA profile S2 caption under the card | Caption omitted |
| B15 | Football per-season stat rows (G, A, xG+xA, DRIB, CROSS, MIN per 90) on `/api/football/players/{id}/career`, and a "Last three seasons" per-game row set for NBA (see B7) | Football S5 and NBA S2 "Last three seasons" tables | Football table shows season, team, archetype, rating, G/90, A/90 only; NBA shows the career trajectory chart |
| B16 | Football role profile: named metric percentiles vs league wingers/position (Dribbling, Chance creation, Crossing, Aerial duels, Pressing) | Football S5 "Role profile" panel and the percentile caption under the card | Panel shows archetype fit scores instead |
| B17 | Football description: headline, one-line role summary, evidence chips with percentile (DRIB 3.4 · 91st), minutes-based confidence note, "Updated" date | Football S5 description card | One generated sentence from archetype and rating |
| B18 | Football "Plays like": similarity endpoint (like `/api/players/similar` for basketball) returning name, archetype, match % | Football S5 "Plays like" panel | Panel omitted on football profiles |
| B19 | Closest real eleven: best-matching real team-season XI with match % and a one-line reason | Football Chemistry X4 "Closest real eleven" card | Card omitted; Squad fit percentile shown |
| B20 | Chemistry shape output with unit bars (Goalkeeper / Defence / Midfield / Attack) | Football Chemistry X4 side panel | Shows Role slots / Pairs / Shape / Role diversity from the existing fit |
| B12 | Terms accepted date (only `terms_version` is stored today) | Settings › Data & privacy | Shows "Current version accepted" instead of a date |

Later phases will append B1-B4, B7-B9 from the handoff when their screens are built.
