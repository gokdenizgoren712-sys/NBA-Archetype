// ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME.
// Kaynak: config/football_signatures.py
// Yeniden üret: python src/football/build_glossary.py
//
// Sözlük sayfası motorun okuduğu imzalardan üretiliyor; elle tutulan
// bir kopya imza her değiştiğinde sessizce eskiyordu.
export const FOOTBALL_ARCHETYPES = [
 {
  "name": "Shot Stopper",
  "phase": "gk",
  "phaseLabel": "Goalkeeper",
  "color": "#F2C14E",
  "desc": "Keeps out what he shouldn't — beats the shot quality he faces",
  "positions": [
   "GK"
  ],
  "threshold": 0.8,
  "metrics": [
   {
    "key": "save_pct",
    "label": "Save %",
    "w": 0.32,
    "higher": true,
    "thin": false
   },
   {
    "key": "goals_prevented_90",
    "label": "Goals prevented",
    "w": 0.28,
    "higher": true,
    "thin": false
   },
   {
    "key": "keeper_diving_save_90",
    "label": "Diving saves",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "saves_inside_box_90",
    "label": "Saves inside the box",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "saves_90",
    "label": "Saves",
    "w": 0.08,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Sweeper Keeper",
  "phase": "gk",
  "phaseLabel": "Goalkeeper",
  "color": "#F2C14E",
  "desc": "Defends the space behind a high line, not just the goal line",
  "positions": [
   "GK"
  ],
  "threshold": 0.8,
  "metrics": [
   {
    "key": "keeper_sweeper_90",
    "label": "Sweeper actions",
    "w": 0.44,
    "higher": true,
    "thin": false
   },
   {
    "key": "sweep_rate",
    "label": "Share of actions outside the box",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "defensive_actions_90",
    "label": "Defensive actions",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "recoveries_90",
    "label": "Recoveries",
    "w": 0.14,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Distributor",
  "phase": "gk",
  "phaseLabel": "Goalkeeper",
  "color": "#F2C14E",
  "desc": "Builds the attack from the back — not just short passes, real ones",
  "positions": [
   "GK"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "ft_share",
    "label": "Share of passes that progress",
    "w": 0.34,
    "higher": true,
    "thin": false
   },
   {
    "key": "pass_pct",
    "label": "Pass accuracy",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "long_share",
    "label": "Share of passes played long",
    "w": 0.22,
    "higher": false,
    "thin": false
   },
   {
    "key": "long_pct",
    "label": "Long-ball accuracy",
    "w": 0.2,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Command of Area",
  "phase": "gk",
  "phaseLabel": "Goalkeeper",
  "color": "#F2C14E",
  "desc": "Owns the box — claims crosses instead of parrying them",
  "positions": [
   "GK"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "keeper_high_claim_90",
    "label": "High claims",
    "w": 0.32,
    "higher": true,
    "thin": false
   },
   {
    "key": "punches_90",
    "label": "Punches",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "aerials_won_90",
    "label": "Aerials won",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "clearances_90",
    "label": "Clearances",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "recoveries_90",
    "label": "Recoveries",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "was_fouled_90",
    "label": "Fouled",
    "w": 0.06,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Ball-Playing CB",
  "phase": "def",
  "phaseLabel": "Defence",
  "color": "#4C9BE8",
  "desc": "Breaks lines from the back — the defence's first passer",
  "positions": [
   "CB"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "passes_into_final_third_90",
    "label": "Passes into the final third",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_passes_att_90",
    "label": "Passes attempted",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "pass_pct",
    "label": "Pass accuracy",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "long_balls_accurate_90",
    "label": "Long balls completed",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "long_pct",
    "label": "Long-ball accuracy",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_90",
    "label": "Touches",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbles_succeeded_90",
    "label": "Take-ons completed",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "dispossessed_90",
    "label": "Dispossessed",
    "w": 0.04,
    "higher": false,
    "thin": false
   }
  ]
 },
 {
  "name": "Stopper",
  "phase": "def",
  "phaseLabel": "Defence",
  "color": "#4C9BE8",
  "desc": "Wins the duel — in the air, on the ground, in the box",
  "positions": [
   "CB"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "aerials_won_90",
    "label": "Aerials won",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "aerial_pct",
    "label": "Aerial win %",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "clearances_90",
    "label": "Clearances",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "headed_clearance_90",
    "label": "Headed clearances",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "blocked_shots_90",
    "label": "Blocks",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "ground_duels_won_90",
    "label": "Ground duels won",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "tackles_90",
    "label": "Tackles",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "interceptions_90",
    "label": "Interceptions",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbled_past_90",
    "label": "Dribbled past",
    "w": 0.04,
    "higher": false,
    "thin": false
   }
  ]
 },
 {
  "name": "Overlapping Fullback",
  "phase": "def",
  "phaseLabel": "Defence",
  "color": "#4C9BE8",
  "desc": "Provides the width and the crosses from deep",
  "positions": [
   "FB"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "accurate_crosses_att_90",
    "label": "Crosses attempted",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_crosses_90",
    "label": "Crosses completed",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "expected_assists_90",
    "label": "Expected assists",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "assists_90",
    "label": "Assists",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "chances_created_90",
    "label": "Chances created",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "corners_90",
    "label": "Corners",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "physical_metrics_distance_covered_90",
    "label": "Distance covered",
    "w": 0.04,
    "higher": true,
    "thin": true
   },
   {
    "key": "physical_metrics_number_of_sprints_90",
    "label": "Sprints",
    "w": 0.02,
    "higher": true,
    "thin": true
   }
  ]
 },
 {
  "name": "Inverted Fullback",
  "phase": "def",
  "phaseLabel": "Defence",
  "color": "#4C9BE8",
  "desc": "Steps inside to make an extra midfielder",
  "positions": [
   "FB"
  ],
  "threshold": 0.8,
  "metrics": [
   {
    "key": "accurate_passes_att_90",
    "label": "Passes attempted",
    "w": 0.26,
    "higher": true,
    "thin": false
   },
   {
    "key": "pass_pct",
    "label": "Pass accuracy",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_90",
    "label": "Touches",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "passes_into_final_third_90",
    "label": "Passes into the final third",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_crosses_att_90",
    "label": "Crosses attempted",
    "w": 0.14,
    "higher": false,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.1,
    "higher": false,
    "thin": false
   }
  ]
 },
 {
  "name": "Defensive Fullback",
  "phase": "def",
  "phaseLabel": "Defence",
  "color": "#4C9BE8",
  "desc": "Defends first and rarely joins the attack",
  "positions": [
   "FB"
  ],
  "threshold": 0.76,
  "metrics": [
   {
    "key": "tackles_90",
    "label": "Tackles",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "interceptions_90",
    "label": "Interceptions",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "clearances_90",
    "label": "Clearances",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "blocked_shots_90",
    "label": "Blocks",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "aerials_won_90",
    "label": "Aerials won",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "ground_duels_won_90",
    "label": "Ground duels won",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.1,
    "higher": false,
    "thin": false
   },
   {
    "key": "accurate_crosses_att_90",
    "label": "Crosses attempted",
    "w": 0.06,
    "higher": false,
    "thin": false
   },
   {
    "key": "dribbled_past_90",
    "label": "Dribbled past",
    "w": 0.04,
    "higher": false,
    "thin": false
   }
  ]
 },
 {
  "name": "Anchor",
  "phase": "mid",
  "phaseLabel": "Midfield",
  "color": "#3FB08C",
  "desc": "Screens the back four and keeps it simple",
  "positions": [
   "DM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "interceptions_90",
    "label": "Interceptions",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "tackles_90",
    "label": "Tackles",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "pass_pct",
    "label": "Pass accuracy",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "clearances_90",
    "label": "Clearances",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "blocked_shots_90",
    "label": "Blocks",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_passes_att_90",
    "label": "Passes attempted",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "defensive_actions_90",
    "label": "Defensive actions",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "aerials_won_90",
    "label": "Aerials won",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.04,
    "higher": false,
    "thin": false
   }
  ]
 },
 {
  "name": "Ball-Winner",
  "phase": "mid",
  "phaseLabel": "Midfield",
  "color": "#3FB08C",
  "desc": "Hunts the ball and takes it back",
  "positions": [
   "DM",
   "CM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "tackles_90",
    "label": "Tackles",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "ground_duels_won_90",
    "label": "Ground duels won",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "recoveries_90",
    "label": "Recoveries",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "interceptions_90",
    "label": "Interceptions",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "ground_duel_pct",
    "label": "Ground duel win %",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "duel_won_90",
    "label": "Duels won",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "fouls_90",
    "label": "Fouls committed",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbled_past_90",
    "label": "Dribbled past",
    "w": 0.04,
    "higher": false,
    "thin": false
   }
  ]
 },
 {
  "name": "Regista",
  "phase": "mid",
  "phaseLabel": "Midfield",
  "color": "#3FB08C",
  "desc": "Dictates tempo and range from deep",
  "positions": [
   "DM",
   "CM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "passes_into_final_third_90",
    "label": "Passes into the final third",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "long_balls_accurate_90",
    "label": "Long balls completed",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_passes_att_90",
    "label": "Passes attempted",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "long_pct",
    "label": "Long-ball accuracy",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "pass_pct",
    "label": "Pass accuracy",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_90",
    "label": "Touches",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "big_chances_created_90",
    "label": "Big chances created",
    "w": 0.06,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Metronome",
  "phase": "mid",
  "phaseLabel": "Midfield",
  "color": "#3FB08C",
  "desc": "Highest volume, highest accuracy — the team's pulse",
  "positions": [
   "DM",
   "CM"
  ],
  "threshold": 0.8,
  "metrics": [
   {
    "key": "accurate_passes_att_90",
    "label": "Passes attempted",
    "w": 0.3,
    "higher": true,
    "thin": false
   },
   {
    "key": "pass_pct",
    "label": "Pass accuracy",
    "w": 0.26,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_90",
    "label": "Touches",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "dispossessed_90",
    "label": "Dispossessed",
    "w": 0.1,
    "higher": false,
    "thin": false
   },
   {
    "key": "long_share",
    "label": "Share of passes played long",
    "w": 0.1,
    "higher": false,
    "thin": false
   },
   {
    "key": "passes_into_final_third_90",
    "label": "Passes into the final third",
    "w": 0.08,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Box-to-Box",
  "phase": "mid",
  "phaseLabel": "Midfield",
  "color": "#3FB08C",
  "desc": "Covers the whole pitch — defends one box, arrives in the other",
  "positions": [
   "CM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "tackles_90",
    "label": "Tackles",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "recoveries_90",
    "label": "Recoveries",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "total_shots_90",
    "label": "Shots",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbles_succeeded_90",
    "label": "Take-ons completed",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "interceptions_90",
    "label": "Interceptions",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_passes_att_90",
    "label": "Passes attempted",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "physical_metrics_distance_covered_90",
    "label": "Distance covered",
    "w": 0.06,
    "higher": true,
    "thin": true
   },
   {
    "key": "physical_metrics_number_of_sprints_90",
    "label": "Sprints",
    "w": 0.04,
    "higher": true,
    "thin": true
   }
  ]
 },
 {
  "name": "Mezzala",
  "phase": "mid",
  "phaseLabel": "Midfield",
  "color": "#3FB08C",
  "desc": "Drifts into the half-space and creates from there",
  "positions": [
   "CM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "expected_assists_90",
    "label": "Expected assists",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "chances_created_90",
    "label": "Chances created",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "assists_90",
    "label": "Assists",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "passes_into_final_third_90",
    "label": "Passes into the final third",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "big_chances_created_90",
    "label": "Big chances created",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbles_succeeded_90",
    "label": "Take-ons completed",
    "w": 0.1,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Late Runner",
  "phase": "mid",
  "phaseLabel": "Midfield",
  "color": "#3FB08C",
  "desc": "Arrives in the box from midfield, late and unmarked",
  "positions": [
   "CM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.26,
    "higher": true,
    "thin": false
   },
   {
    "key": "expected_goals_non_penalty_90",
    "label": "Non-penalty xG",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "goals_90",
    "label": "Goals",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "total_shots_90",
    "label": "Shots",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "xgot_90",
    "label": "xG on target",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "physical_metrics_number_of_sprints_90",
    "label": "Sprints",
    "w": 0.06,
    "higher": true,
    "thin": true
   },
   {
    "key": "physical_metrics_distance_covered_90",
    "label": "Distance covered",
    "w": 0.04,
    "higher": true,
    "thin": true
   }
  ]
 },
 {
  "name": "Poacher",
  "phase": "fwd",
  "phaseLabel": "Attack",
  "color": "#E8654C",
  "desc": "Lives in the box — minimum touches, maximum chances",
  "positions": [
   "ST"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "goals_90",
    "label": "Goals",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "npxg_per_shot",
    "label": "xG per shot",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "expected_goals_non_penalty_90",
    "label": "Non-penalty xG",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "sot_pct",
    "label": "Shots on target %",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "Offsides_90",
    "label": "Offsides",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_90",
    "label": "Touches",
    "w": 0.06,
    "higher": false,
    "thin": false
   },
   {
    "key": "accurate_passes_att_90",
    "label": "Passes attempted",
    "w": 0.06,
    "higher": false,
    "thin": false
   }
  ]
 },
 {
  "name": "Target Man",
  "phase": "fwd",
  "phaseLabel": "Attack",
  "color": "#E8654C",
  "desc": "The reference point — wins it in the air and holds it up",
  "positions": [
   "ST"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "aerials_won_90",
    "label": "Aerials won",
    "w": 0.26,
    "higher": true,
    "thin": false
   },
   {
    "key": "aerial_pct",
    "label": "Aerial win %",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "was_fouled_90",
    "label": "Fouled",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "goals_90",
    "label": "Goals",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "duel_won_90",
    "label": "Duels won",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_90",
    "label": "Touches",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbles_succeeded_90",
    "label": "Take-ons completed",
    "w": 0.08,
    "higher": false,
    "thin": false
   },
   {
    "key": "headed_clearance_90",
    "label": "Headed clearances",
    "w": 0.06,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Complete Forward",
  "phase": "fwd",
  "phaseLabel": "Attack",
  "color": "#E8654C",
  "desc": "Scores and creates in equal measure",
  "positions": [
   "ST",
   "W",
   "AM"
  ],
  "threshold": 0.82,
  "metrics": [
   {
    "key": "expected_goals_non_penalty_90",
    "label": "Non-penalty xG",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "expected_assists_90",
    "label": "Expected assists",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "goals_90",
    "label": "Goals",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "assists_90",
    "label": "Assists",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "chances_created_90",
    "label": "Chances created",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbles_succeeded_90",
    "label": "Take-ons completed",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "total_shots_90",
    "label": "Shots",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "big_chances_created_90",
    "label": "Big chances created",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "pass_pct",
    "label": "Pass accuracy",
    "w": 0.04,
    "higher": true,
    "thin": false
   }
  ]
 },
 {
  "name": "Pressing Forward",
  "phase": "fwd",
  "phaseLabel": "Attack",
  "color": "#E8654C",
  "desc": "Defends from the front — the first line of the press",
  "positions": [
   "ST",
   "W",
   "AM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "recoveries_90",
    "label": "Recoveries",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "tackles_90",
    "label": "Tackles",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "interceptions_90",
    "label": "Interceptions",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "defensive_actions_90",
    "label": "Defensive actions",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "ground_duels_won_90",
    "label": "Ground duels won",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "fouls_90",
    "label": "Fouls committed",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "physical_metrics_number_of_sprints_90",
    "label": "Sprints",
    "w": 0.06,
    "higher": true,
    "thin": true
   },
   {
    "key": "physical_metrics_distance_covered_90",
    "label": "Distance covered",
    "w": 0.04,
    "higher": true,
    "thin": true
   }
  ]
 },
 {
  "name": "Inside Forward",
  "phase": "fwd",
  "phaseLabel": "Attack",
  "color": "#E8654C",
  "desc": "Cuts in from wide to shoot, not to cross",
  "positions": [
   "W",
   "AM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "expected_goals_non_penalty_90",
    "label": "Non-penalty xG",
    "w": 0.22,
    "higher": true,
    "thin": false
   },
   {
    "key": "total_shots_90",
    "label": "Shots",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "goals_90",
    "label": "Goals",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbles_succeeded_90",
    "label": "Take-ons completed",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "xgot_90",
    "label": "xG on target",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_crosses_att_90",
    "label": "Crosses attempted",
    "w": 0.1,
    "higher": false,
    "thin": false
   }
  ]
 },
 {
  "name": "Touchline Winger",
  "phase": "fwd",
  "phaseLabel": "Attack",
  "color": "#E8654C",
  "desc": "Stays wide, beats his man, delivers",
  "positions": [
   "W"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "accurate_crosses_att_90",
    "label": "Crosses attempted",
    "w": 0.26,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_crosses_90",
    "label": "Crosses completed",
    "w": 0.18,
    "higher": true,
    "thin": false
   },
   {
    "key": "expected_assists_90",
    "label": "Expected assists",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "assists_90",
    "label": "Assists",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "chances_created_90",
    "label": "Chances created",
    "w": 0.12,
    "higher": true,
    "thin": false
   },
   {
    "key": "corners_90",
    "label": "Corners",
    "w": 0.08,
    "higher": true,
    "thin": false
   },
   {
    "key": "touches_opp_box_90",
    "label": "Touches in opposition box",
    "w": 0.07,
    "higher": false,
    "thin": false
   },
   {
    "key": "physical_metrics_number_of_sprints_90",
    "label": "Sprints",
    "w": 0.02,
    "higher": true,
    "thin": true
   },
   {
    "key": "physical_metrics_topspeed",
    "label": "Top speed",
    "w": 0.01,
    "higher": true,
    "thin": true
   }
  ]
 },
 {
  "name": "Take-On Merchant",
  "phase": "fwd",
  "phaseLabel": "Attack",
  "color": "#E8654C",
  "desc": "Beats his man off the dribble, again and again",
  "positions": [
   "W",
   "ST",
   "AM"
  ],
  "threshold": 0.78,
  "metrics": [
   {
    "key": "dribbles_succeeded_90",
    "label": "Take-ons completed",
    "w": 0.31,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribbles_succeeded_att_90",
    "label": "Take-ons attempted",
    "w": 0.22,
    "higher": true,
    "thin": false
   },
   {
    "key": "dribble_pct",
    "label": "Take-on success %",
    "w": 0.16,
    "higher": true,
    "thin": false
   },
   {
    "key": "was_fouled_90",
    "label": "Fouled",
    "w": 0.13,
    "higher": true,
    "thin": false
   },
   {
    "key": "dispossessed_90",
    "label": "Dispossessed",
    "w": 0.11,
    "higher": true,
    "thin": false
   },
   {
    "key": "physical_metrics_topspeed",
    "label": "Top speed",
    "w": 0.04,
    "higher": true,
    "thin": true
   },
   {
    "key": "physical_metrics_number_of_sprints_90",
    "label": "Sprints",
    "w": 0.03,
    "higher": true,
    "thin": true
   }
  ]
 },
 {
  "name": "Creator",
  "phase": "fwd",
  "phaseLabel": "Attack",
  "color": "#E8654C",
  "desc": "The final ball — everything runs through him",
  "positions": [
   "W",
   "ST",
   "AM"
  ],
  "threshold": 0.8,
  "metrics": [
   {
    "key": "expected_assists_90",
    "label": "Expected assists",
    "w": 0.24,
    "higher": true,
    "thin": false
   },
   {
    "key": "chances_created_90",
    "label": "Chances created",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "assists_90",
    "label": "Assists",
    "w": 0.2,
    "higher": true,
    "thin": false
   },
   {
    "key": "big_chances_created_90",
    "label": "Big chances created",
    "w": 0.14,
    "higher": true,
    "thin": false
   },
   {
    "key": "passes_into_final_third_90",
    "label": "Passes into the final third",
    "w": 0.1,
    "higher": true,
    "thin": false
   },
   {
    "key": "accurate_passes_att_90",
    "label": "Passes attempted",
    "w": 0.06,
    "higher": true,
    "thin": false
   },
   {
    "key": "corners_90",
    "label": "Corners",
    "w": 0.06,
    "higher": true,
    "thin": false
   }
  ]
 }
];
