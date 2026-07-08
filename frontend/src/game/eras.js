// ── Era sistemi ───────────────────────────────────────────────────────────────
// LineupGame + seasonSim tarafından paylaşılır.

export const ERAS = [
  { id:"magic_bird", label:"Magic vs Bird Era",    short:"80s",       color:"text-amber-400",    bg:"bg-amber-900/30 border-amber-700/40",    years:[1979,1991] },
  { id:"jordan",     label:"Jordan Era",           short:"Jordan",    color:"text-red-400",      bg:"bg-red-900/30 border-red-700/40",        years:[1991,1999] },
  { id:"dead_ball",  label:"Dead Ball Era",        short:"Dead Ball", color:"text-slate-400",    bg:"bg-slate-700/50 border-slate-500/40",    years:[1999,2008] },
  { id:"proto",      label:"Proto Super Team Era", short:"Proto ST",  color:"text-blue-400",     bg:"bg-blue-900/30 border-blue-700/40",      years:[2008,2014] },
  { id:"small_ball", label:"Small Ball Era",       short:"Small Ball",color:"text-emerald-400",  bg:"bg-emerald-900/30 border-emerald-700/40",years:[2014,2020] },
  { id:"parity",     label:"Parity Era",           short:"Parity",    color:"text-violet-400",   bg:"bg-violet-900/30 border-violet-700/40",  years:[2020,2030] },
];

// Her arketipin o era'da ne kadar "meta" olduğu (1.0 = nötr, >1 meta, <1 meta-dışı)
export const ERA_ARCH_WEIGHTS = {
  magic_bird: { Engine:0.90, Ecosystem:1.30, Hub:1.15, Creator:0.85, Connector:0.95, Anchor:1.15, Force:1.20, Spacer:0.45, Finisher:0.85, Initiator:0.70, Stopper:0.95, "Rim Runner":0.70 },
  jordan:     { Engine:1.25, Ecosystem:0.85, Hub:0.90, Creator:1.20, Connector:0.85, Anchor:0.95, Force:1.00, Spacer:0.60, Finisher:0.90, Initiator:0.85, Stopper:1.15, "Rim Runner":0.80 },
  dead_ball:  { Engine:0.90, Ecosystem:0.85, Hub:0.85, Creator:0.95, Connector:0.85, Anchor:1.25, Force:1.15, Spacer:0.55, Finisher:0.85, Initiator:0.75, Stopper:1.20, "Rim Runner":0.85 },
  proto:      { Engine:1.10, Ecosystem:0.95, Hub:1.00, Creator:1.05, Connector:0.95, Anchor:1.00, Force:1.00, Spacer:0.80, Finisher:1.05, Initiator:0.85, Stopper:1.00, "Rim Runner":1.10 },
  small_ball: { Engine:1.20, Ecosystem:1.05, Hub:1.00, Creator:1.10, Connector:1.00, Anchor:0.70, Force:0.65, Spacer:1.35, Finisher:1.00, Initiator:0.90, Stopper:0.95, "Rim Runner":1.10 },
  parity:     { Engine:1.10, Ecosystem:1.15, Hub:1.05, Creator:1.05, Connector:1.10, Anchor:0.85, Force:0.80, Spacer:1.20, Finisher:1.00, Initiator:0.95, Stopper:1.05, "Rim Runner":1.05 },
};

// Her era'da kadro sütunlarının (pillar) önemi (v3.6-C5: 5 sütun).
// Eski "Defense" tek blok, Rim Protection + Perimeter D olarak ayrıldı — çünkü
// eralar bu ikisinde GERÇEKTEN ayrışır (Dead Ball iç savunma, Small Ball switch
// eden çevre savunması ister; tek "Defense" bunu ifade edemiyordu).
// coverage = Σ(pillar × w) / Σw. Bu ağırlıklar hem coverage'ı hem oyuncunun
// era-uzaklık kaymasını (eraFitShift) besler.
export const PILLARS = ["creation", "spacing", "rim_protection", "perimeter_d", "finishing"];
export const PILLAR_LABELS = {
  creation: "Creation", spacing: "Spacing", rim_protection: "Rim Protection",
  perimeter_d: "Perimeter D", finishing: "Finishing",
};
// v3.11 (P4): gerçek dönem 3PAr'ından (3PA/FGA) TÜREVİ + Dead Ball savunma anlatısı.
// Ölçülen 3PAr: magic_bird 0.055 → jordan 0.155 → dead_ball 0.191 → proto 0.235
// → small_ball 0.328 → parity 0.403. spacing 3PAr'la doğru, rim ters orantılı türetildi
// (corr el-yazımı vs 3PAr: spacing 0.89). Düzeltme: parity artık EN yüksek spacing
// (en çok 3 atan dönem — eski el-yazımı small_ball'u yanlışlıkla üste koymuştu).
// Dead Ball rim/perim, 3PAr'ın kaçırdığı fiziksel-savunma dönemi için elle korundu.
export const ERA_PILLAR_WEIGHTS = {
  magic_bird: { creation: 1.10, spacing: 0.55, rim_protection: 1.35, perimeter_d: 0.95, finishing: 1.15 },
  jordan:     { creation: 1.10, spacing: 0.82, rim_protection: 1.14, perimeter_d: 1.05, finishing: 1.04 },
  dead_ball:  { creation: 1.00, spacing: 0.85, rim_protection: 1.40, perimeter_d: 1.18, finishing: 0.95 },
  proto:      { creation: 1.10, spacing: 1.04, rim_protection: 0.96, perimeter_d: 1.11, finishing: 0.94 },
  small_ball: { creation: 1.10, spacing: 1.30, rim_protection: 0.76, perimeter_d: 1.19, finishing: 0.84 },
  parity:     { creation: 1.10, spacing: 1.50, rim_protection: 0.60, perimeter_d: 1.25, finishing: 0.75 },
};

// Bir arketip hangi sütunun "adamı"dır — era-uzaklık kayması bundan türer.
export const ARCH_PILLAR = {
  Engine: "creation", Ecosystem: "creation", Hub: "creation", Creator: "creation",
  Initiator: "creation", Connector: "creation",
  Spacer: "spacing",
  Anchor: "rim_protection", Force: "rim_protection",
  Stopper: "perimeter_d",
  Finisher: "finishing", "Rim Runner": "finishing",
};

export const ERA_META_BLURB = {
  magic_bird: "Post play & team ball. Ecosystems and powerful bigs reign. Spacers barely exist.",
  jordan:     "Isolation era. Engines and Creators peak. Stoppers at a premium.",
  dead_ball:  "Grind-it-out defense. Anchors and Stoppers dominate. Pace is dead.",
  proto:      "Pick-and-roll transition. Stretch bigs emerging. Relatively balanced.",
  small_ball: "Spacing is king. Spacers peak. Traditional bigs and Forces struggle.",
  parity:     "Two-way versatility rewarded. Ecosystems and connectors shine.",
};

export function getEra(season) {
  if (!season) return ERAS[5];
  const year = parseInt(season.split("-")[0]);
  return ERAS.find(e => year >= e.years[0] && year < e.years[1]) || ERAS[5];
}

export const eraIndex = (era) => Math.max(0, ERAS.findIndex(e => e.id === era.id));
