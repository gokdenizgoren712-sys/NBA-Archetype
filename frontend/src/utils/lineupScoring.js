/**
 * İki aşamalı lineup skor motoru.
 * LineupGame.jsx'ten çıkarıldı — Lineups sayfasıyla paylaşılır.
 *
 * Aşama 1 — Player Quality: overall_score × era faktörü (arketipin o dönemde ne kadar meta)
 * Aşama 2 — Lineup Coverage: 4 pillar (Creation/Spacing/Defense/Finishing) × Role Fit
 */

export const ERAS = [
  { id:"magic_bird", label:"Magic vs Bird Era",    short:"80s",        years:[1979,1991] },
  { id:"jordan",     label:"Jordan Era",           short:"Jordan",     years:[1991,1999] },
  { id:"dead_ball",  label:"Dead Ball Era",        short:"Dead Ball",  years:[1999,2008] },
  { id:"proto",      label:"Super Team Era",       short:"Super Team", years:[2008,2014] },
  { id:"small_ball", label:"Small Ball Era",       short:"Small Ball", years:[2014,2020] },
  { id:"parity",     label:"Parity Era",           short:"Parity",     years:[2020,2030] },
];

export const ERA_ARCH_WEIGHTS = {
  magic_bird: { Engine:0.90, Ecosystem:1.30, Hub:1.15, Creator:0.85, Connector:0.95, Anchor:1.15, Force:1.20, Spacer:0.45, Finisher:0.85, Initiator:0.70, Stopper:0.95, "Rim Runner":0.70 },
  jordan:     { Engine:1.25, Ecosystem:0.85, Hub:0.90, Creator:1.20, Connector:0.85, Anchor:0.95, Force:1.00, Spacer:0.60, Finisher:0.90, Initiator:0.85, Stopper:1.15, "Rim Runner":0.80 },
  dead_ball:  { Engine:0.90, Ecosystem:0.85, Hub:0.85, Creator:0.95, Connector:0.85, Anchor:1.25, Force:1.15, Spacer:0.55, Finisher:0.85, Initiator:0.75, Stopper:1.20, "Rim Runner":0.85 },
  proto:      { Engine:1.10, Ecosystem:0.95, Hub:1.00, Creator:1.05, Connector:0.95, Anchor:1.00, Force:1.00, Spacer:0.80, Finisher:1.05, Initiator:0.85, Stopper:1.00, "Rim Runner":1.10 },
  small_ball: { Engine:1.20, Ecosystem:1.05, Hub:1.00, Creator:1.10, Connector:1.00, Anchor:0.70, Force:0.65, Spacer:1.35, Finisher:1.00, Initiator:0.90, Stopper:0.95, "Rim Runner":1.10 },
  parity:     { Engine:1.10, Ecosystem:1.15, Hub:1.05, Creator:1.05, Connector:1.10, Anchor:0.85, Force:0.80, Spacer:1.20, Finisher:1.00, Initiator:0.95, Stopper:1.05, "Rim Runner":1.05 },
};

export function getEra(season) {
  if (!season) return ERAS[5];
  const year = parseInt(season.split("-")[0]);
  return ERAS.find(e => year >= e.years[0] && year < e.years[1]) || ERAS[5];
}

function _s(p, k) {
  const v = parseFloat(p[`score_${k}`] ?? 0);
  return isNaN(v) ? 0 : Math.max(0, v);
}

const ARCHES = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const RANK_W  = [0.40, 0.25, 0.15, 0.12, 0.08];

export function computePlayerFit(p) {
  const creation  = Math.min(1, Math.max(_s(p,"Ecosystem")*1.10, _s(p,"Engine"), _s(p,"Hub")*0.90, _s(p,"Creator")*0.88, _s(p,"Initiator")*0.80));
  const spacing   = Math.min(1, Math.max(_s(p,"Spacer"), _s(p,"3-and-D")*0.90, _s(p,"Stretch")*0.85, _s(p,"Gravity")*0.95, _s(p,"Three-Level")*0.80));
  const defense   = Math.min(1, Math.max(_s(p,"Anchor")*1.10, _s(p,"Stopper"), _s(p,"Two-Way")*0.90, _s(p,"Force")*0.65));
  const finishing = Math.min(1, Math.max(_s(p,"Finisher"), _s(p,"Rim Runner")*0.95, _s(p,"Force")*0.75, _s(p,"Slashing")*0.82));
  const overall   = Math.min(1, Math.max(0, parseFloat(p.overall_score || 0)));
  const era       = getEra(p._season);
  const top5      = ARCHES
    .map(a => ({ a, s: _s(p, a), w: (ERA_ARCH_WEIGHTS[era.id] || {})[a] ?? 1.0 }))
    .sort((x, y) => y.s - x.s)
    .slice(0, 5);
  const blendedEraW = top5.reduce((acc, x, i) => acc + RANK_W[i] * x.w, 0);
  const eraFactor = Math.min(1.15, Math.max(0.75, blendedEraW));
  const quality   = Math.min(1, overall * eraFactor);
  return { creation, spacing, defense, finishing, overall, quality, eraFactor, era };
}

export function computeLineupFit(players) {
  if (!players || players.length < 2) return null;

  const perPlayer = players.map(p => computePlayerFit(p));

  const avgQuality   = perPlayer.reduce((a, b) => a + b.quality, 0) / perPlayer.length;
  const creationCov  = Math.min(1, Math.max(...perPlayer.map(p => p.creation)));
  const nShooters    = perPlayer.filter(p => p.spacing >= 0.65).length;
  const spacingCov   = [0.10, 0.45, 0.82, 1.00, 0.88, 0.72][Math.min(nShooters, 5)];
  const defenseCov   = Math.min(1, Math.max(...perPlayer.map(p => p.defense)));
  const finishingCov = Math.min(1, Math.max(...perPlayer.map(p => p.finishing)));
  const coverage     = (creationCov + spacingCov + defenseCov + finishingCov) / 4;

  const BALL_PENALTIES = [0, 0, 0.05, 0.18, 0.33, 0.50];
  const ballDomPlayers = players
    .filter(p => Math.max(_s(p,"Engine")*1.05, _s(p,"Ecosystem")) >= 0.80)
    .map(p => p.PLAYER_NAME || p.name || "?");
  const ballDom = ballDomPlayers.length;
  const roleFit = 1 - BALL_PENALTIES[Math.min(ballDom, 5)];

  const lineupScore = Math.min(1, avgQuality * coverage * roleFit);
  const pct         = Math.round(lineupScore * 100);

  let grade = "D";
  if (pct >= 85) grade = "S";
  else if (pct >= 72) grade = "A";
  else if (pct >= 58) grade = "B";
  else if (pct >= 42) grade = "C";

  return {
    creation: creationCov, spacing: spacingCov,
    defense: defenseCov,   finishing: finishingCov,
    roleFit, nShooters, coverage, avgQuality,
    lineupScore, pct, grade, perPlayer,
    ballDomPlayers,
  };
}

export const PILLAR_LABELS = {
  creation:  "Creation",
  spacing:   "Spacing",
  defense:   "Defense",
  finishing: "Finishing",
};

export const GRADE_COLOR = {
  S: "#d97706", A: "#22c55e", B: "#3b82f6", C: "#f97316", D: "#ef4444",
};
