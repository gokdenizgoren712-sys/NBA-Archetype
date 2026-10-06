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
| B12 | Terms accepted date (only `terms_version` is stored today) | Settings › Data & privacy | Shows "Current version accepted" instead of a date |

Later phases will append B1-B4, B7-B9 from the handoff when their screens are built.
