# NBA Archetype System

A platform that maps NBA players to quantitative archetypes — covering every active and historical player from 1989-90 onward.

Players are more than stat lines. This system identifies *who they are* on the floor: an **Ecosystem Engine**, a **Pressure Scoring Spacer**, a **Switchable Anchor**. Archetypes are derived from a hand-crafted jargon dictionary and validated against percentile-ranked NBA metrics.

---

## Features

- **12 Core Archetypes** — Ecosystem, Engine, Hub, Creator, Connector, Anchor, Spacer, Finisher, Force, Initiator, Stopper, Rim Runner
- **22 Modifier Tags** — Two-Way, Pressure, Gravity, Shotmaker, Switchable, and more
- **Historical Coverage** — 1989-90 to 2025-26, era-normalized via within-season percentile ranks
- **Lineup Compatibility Engine** — 5-pillar fit score (Creation · Spacing · Defense · Finishing · Role Fit) for any 5-man group
- **Archetype Affinity Matrix** — which archetype pairs win together in real lineups
- **Player Compare** — side-by-side radar profiles and component scores across any two players or eras
- **Lineup Builder Game** — slot players from random seasons/teams into a lineup and score the fit

---

## Tech Stack

| Layer | Tools |
|---|---|
| Data | `nba_api` · Basketball-Reference (BBref) · `pandas` · `pyarrow` |
| Scoring | Percentile engine · `scikit-learn` · `scipy` |
| Backend | FastAPI · Uvicorn |
| Frontend | React 18 · Vite · Tailwind CSS |
| Deploy | Render (Python web service + persistent disk) |

---

## How It Works

### 1. Percentile Scoring
Every metric (PTS, AST, TS%, OBPM, hustle stats…) is converted to a **within-season percentile rank**. This makes Michael Jordan's 1990 numbers directly comparable to SGA's 2025-26 numbers.

### 2. Component Signatures
Each archetype has a weighted signature of 6–8 metrics. A player's **component score** is how well they match that signature. Example — *Spacer*: heavy weight on 3PA rate, corner 3%, pull-up frequency.

### 3. Labeling
Players whose top component score exceeds a learned threshold receive that archetype label as their **primary arch**. Additional modifiers are stacked on top.

### 4. Lineup Fit
Five players are scored across five pillars:
```
Fit = 0.28 × Creation + 0.27 × Spacing + 0.22 × Defense + 0.12 × Finishing + 0.11 × Role Fit + Synergy Bonus
```
Spacing has a sweet-spot curve (2–3 shooters optimal). Role Fit penalizes ball-dominant redundancy.

---

## Project Structure

```
api/          FastAPI backend (endpoints, caching, lineup scoring)
config/       Archetype signatures, position mappings, thresholds
data/         Parquet files — player stats, scores, historical, lineups
frontend/     React + Vite web app
src/          Pipeline scripts — fetch, score, enrich, validate
```

---

## Local Setup

```bash
# Backend
pip install -r requirements.txt
uvicorn api.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

Data files (`data/*.parquet`) are required to run the API. They are not included in the repository due to size — generate them by running the pipeline scripts in `src/`.

---

## Created By

**Gökdeniz Gören**
