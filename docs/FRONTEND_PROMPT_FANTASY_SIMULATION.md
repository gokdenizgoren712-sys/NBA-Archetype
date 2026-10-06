# Frontend prompt: fantasy simulation (Faz 6)

You are working in the Primary Arch repo, frontend in `frontend/src/pages/fantasy/` (React + Vite, branch `ui-v3`, shared skin `fantasy.css`). The fantasy backend gained a team simulation, a second projection and an in-season refresh. A first, plain version of the UI exists. Your job is to make it clear, honest and finished, and to check it in a real browser (the previous pass could only be linted and built, never looked at).

Rules:

- All user-facing text is English. Comments may be Turkish.
- Additive. Do not rename API fields; if you need a new field, write it into `docs/BACKEND_TICKETS_UI_V3.md` instead of guessing.
- Do not add libraries. Reuse `ui.jsx` (`InfoTip`, `ValidationNotice`, `PlayerMeta`, `RangeBar`, `FLAGS`) and the `.fz-*` classes.
- Tone: the simulation is a **second opinion**, not a better model. In our tests it **ties** the model on stat error (blend is slightly better than either alone). Never write "more accurate", "smarter" or "AI". Say what it does: it plays every team through 100 seasons of 82 games with injuries, rotation minutes and shared usage, and averages each player.
- Never expose internal words: "world", "scenarios", "K", "engine", "SI_*". Say "team simulation".
- Out of scope: the idea of importing a Yahoo mock-draft roster as a fourth roster source (noted, not building), Yahoo API login, football, RankIt.

## 1. What the backend gives you

Three views of the same projection, chosen with one value everywhere: `model | sim | blend`.

| View | Meaning | Use |
|---|---|---|
| `model` | Our projection from the last three seasons, adjusted for the new team. | The only view that draft advice was **tested** on. |
| `sim` | Average of 100 simulated seasons per team. Site default when available. | Second opinion; shows roster effects history cannot see. |
| `blend` | 25% simulation + 75% model (`meta.blend_weight`). | Lowest stat error in our test. |

**Endpoints** (all under `/api/fantasy`):

- `GET|POST /rankings`: `source=model|sim|blend`, `disagree=true` (only players whose simulated and modelled fantasy points per game differ by 2 or more, `meta.disagree_fp`), `sort=sim_gap` (biggest gap first) or `sort=sim_delta` (signed). Every row has `fp_model`, `fp_sim`, `sim_delta` (sim minus model, fantasy points per game, Yahoo points weights). They are `null` when the simulation is off.
- `GET|POST /players/{id}?source=`: `player` holds the values of the chosen view. Also `simulation` `{per_game:{pts,reb,ast,stl,blk,tov,fg3m:{mean,p10,p90}}, fp:{mean,p10,p90}, mpg, gp}` and `model` `{per_game, fp, mpg, gp}` (always the raw model, whatever the view) plus `source`. Both are `null` when the simulation is off.
- Draft tools take `projection=model|sim|blend`: `GET|POST /draft/plans`, `POST /draft/recommend`, `/mock/advance`, `/draft/grade`. Their `validation` is `{status:"validated"}` for `model` and `{status:"unvalidated", title, body}` for the other two (`ValidationNotice` already renders it). Plans for `sim`/`blend` are computed on request: the first call takes about 3 seconds, later ones are cached. Precomputed plans exist for `model` only.
- `POST /season/simulate`, `/trade/analyze`, `/week/analyze`: always run on the team simulation (they do not take a view). Response `engine` is `"world"` (normal) or `"legacy"` (fallback: simulation unavailable, plain per-player engine). `scope` is `full` or `rest` (see 3).
- `GET /meta`: `simulation` (bool, the one switch for showing any simulation UI), `blend_weight`, `disagree_fp`, `inseason_as_of` (date or null), `rest_of_season_from_week`, `current_week`.

**Availability.** Before the season, `meta.simulation` is true. In season it is true only while the simulation was refreshed in the same hourly update as the numbers; otherwise it is false and the UI must fall back to `model` silently (the context already does this: `projection` is `model` whenever `simAvailable` is false).

**Timing.** After a server restart the team simulation takes about 13 seconds to build. The first `/season/simulate`, `/trade/analyze` or `/week/analyze` can wait up to 25 seconds before answering; later calls take 2 to 3 seconds. This needs a loading state that explains the wait (see 4).

## 2. What exists in the frontend today (plain, unreviewed)

- `useFantasy.jsx`: `projection`, `simAvailable`, `setProjection`; stored in `fz_prefs_v1.pr`, default `sim`.
- `ui.jsx`: `PROJECTION_INFO`, a "Projection" pill with a menu in `FantasyBar` (shown only on Rankings, player, draft plan, mock, assistant, via `PROJECTION_PAGES`), the same choice in the phone sheet, a `Sim ±x FP` badge in `PlayerMeta`.
- `FantasyRankings.jsx`: reads `f.projection`; a "Model ≠ simulation" chip with an info tip.
- `FantasyPlayer.jsx`: side-by-side "Model vs simulation" table.
- Draft pages pass `projection`; Simulator, Trade and Week print a one-line engine note (`ENGINE_NOTE`).
- `FantasyMethodology.jsx`: "Model vs simulation" section.

Treat all of it as a draft to redesign, not a spec.

## 3. What it should be

**A. Projection control.**
- One place, always visible on the pages it affects, never on the pages it does not. Three options with one-line meaning each (reuse the table above). Mark the current one and say that Simulation is the default.
- The page itself must say which view it shows, near the title ("Simulation" tag), because the control in the bar is easy to miss. Same on the player page and the draft pages.
- Put the choice in the URL (`?p=sim|blend|model`, like `f`, `t`, `s`) so a shared link shows the same numbers; URL beats storage, storage beats the default.
- When the simulation is unavailable: hide the control and show nothing about it. Do not show a disabled control with an apology.
- Switching must not flash an empty page: keep the old rows visible (dimmed) until the new ones arrive.

**B. Draft pages are the careful part.**
- Under `sim` or `blend` the picks are **not tested**. The existing `ValidationNotice` says so; make sure it is visible without scrolling, calm in colour, and has a "Switch to Model" action that calls `setProjection("model")`.
- Do not change the default for draft pages to `model` silently; the user's choice stands. Do not hide the notice after the first dismissal in a session: it is per view.
- Plans: while `sim`/`blend` plans load (about 3 seconds the first time) show the plan list skeleton, not an error.

**C. Where they differ (Rankings).**
- A first-class list, not just a chip: "Where the model and the simulation disagree", biggest gap first, each row showing both numbers (`Model 36.1 · Simulation 32.8`), the gap with a sign, and the usual player meta. Explain in one sentence why this matters: a new star taking shots, a vacated role, a thin rotation.
- Works with the other filters (position, team, search) and with every format; in category formats the numbers are still fantasy points per game, so label them "fantasy points per game" to avoid confusion with G/Z-scores.
- Empty state when nothing differs by 2 or more. Phone layout: stack the two numbers under the name.
- The list uses `disagree=true&sort=sim_gap`; the user may re-sort by any column as before.

**D. Player page.**
- Keep the side-by-side but design it: the paired values with the difference coloured good/bad (turnovers inverted), the simulation range (10th to 90th percentile = "the middle 80% of simulated seasons"), and a single sentence on what the gap means. Show fantasy points, minutes and games next to the stats.
- Make clear the main "Projection per game" block follows the chosen view while the comparison table always shows both.
- If `simulation` is null, the section is simply absent.

**E. Simulator, Trade, This week.**
- Replace the raw engine sentence with something a user understands: a small "Team simulation" label with an info tip (what it does, that injuries are drawn at random, that nobody is added or dropped in season). When `engine === "legacy"`, say once, plainly, that a simpler model was used this time because the team simulation was not ready, and offer "Try again".
- Loading: if a request has been waiting more than 3 seconds, change the loading copy to "Warming up the league simulation, this can take up to half a minute after an update." Never show a bare spinner for 25 seconds. Do not time out the request before 40 seconds.
- Keep per-request results reproducible-looking: the same inputs give the same numbers (the API seeds them), so do not add jitter or re-run on focus.

**F. In season.** After opening night the data refreshes hourly.
- Show "Updated through <date>" where the data is shown (the bar already has a status; make sure Rankings and the player page agree with it).
- Season simulator scope: `rest` (default in season) plays the remaining weeks and uses the team simulation. `full` in season uses the simpler engine; when the user picks it, say so in one line. Weeks already played are not simulated.
- This week: weeks that are already under way (before `rest_of_season_from_week`) use the simpler engine; no special UI beyond not claiming otherwise.
- Limit to state honestly: we do not know who is injured right now. A player who is out only shows up as missed games. Put one line about it in the methodology and under the "Updated through" text on the player page when `meta.inseason_as_of` is set.

**G. Methodology page.**
- Rewrite the "Model vs simulation" section in plain steps with one small figure if it helps: model versus simulation versus blend, what each is for, and the honest result (tie on error, blend best, the simulation moves who is above whom only for a minority of players, 73 of 449 rotation players differ by 2 or more fantasy points a game). Link to it from every info tip.

**H. Quality bar.**
- Real browser pass at 1280, 768 and 375 widths, light and dark if the skin supports both; fix overflow, tap targets (44px), focus rings, `tabular-nums` on numbers.
- No layout shift when numbers change; no console errors; no request storms when toggling (one request per change, stale responses ignored).
- Every new string reviewed for jargon and for any claim we cannot back.

## 4. Copy bank (adjust, keep the meaning)

- Control tooltip: "Which numbers to rank by. Simulation plays every team through 100 seasons with injuries and who shares the ball. Model uses each player's own last three seasons. Blend is 25% simulation, 75% model."
- Draft notice (already served by the API): "Picks use the simulation projection. Our draft test was run on the model only." Action: "Switch to Model".
- Disagreement tip: "Players whose simulated fantasy points per game differ from the model's by 2 or more. Usually a roster effect the player's own history cannot show."
- Slow request: "Warming up the league simulation, this can take up to half a minute after an update."
- Fallback: "We used a simpler model this time because the team simulation was not ready."

## 5. Acceptance

1. `?p=` in the URL, storage and default behave as in A, on every affected page, including a shared link opened in a fresh browser.
2. Each of the five affected pages shows which view is active; none of the three pages that always use the simulation shows the control.
3. The disagreement list works on all five formats, with filters, with an empty state, on phone.
4. Draft pages under `sim`/`blend` show the untested notice with a working "Switch to Model".
5. A cold request to `/season/simulate` (restart the API, call immediately) shows the warm-up copy and then the result; a forced `legacy` response (set `FANTASY_WORLD=0` on the API) shows the fallback line.
6. With `meta.simulation` false (use a pre-season file without `SIM_*`, or stub `/meta`) no simulation UI appears anywhere and nothing errors.
7. Screenshots at three widths attached to the PR for Rankings (with the list), player page, mock draft, simulator.
8. `npm run lint` and `npm run build` pass; no new lint errors in `pages/fantasy`.

## 6. Where things are

`useFantasy.jsx` (context, URL and storage sync), `fantasyApi.js` (client; `source` and `projection` are already passed), `ui.jsx` (shared pieces, `FantasyBar`), `FantasyRankings.jsx`, `FantasyPlayer.jsx`, `FantasyDraftPlan.jsx`, `FantasyMock.jsx`, `FantasyAssistant.jsx`, `FantasySimulator.jsx`, `FantasyTrade.jsx`, `FantasyWeek.jsx`, `FantasyMethodology.jsx`. Background and numbers: `docs/FANTASY_PLAN.md` (Faz 6 section, phase results 0 to 5) and `docs/FANTASY_MODEL_IMPROVEMENTS.md`.
