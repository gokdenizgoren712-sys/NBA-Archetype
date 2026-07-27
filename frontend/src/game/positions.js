// ── Pozisyon uygunluğu / ceza mantığı — LineupGame.jsx ve SameScreenGame.jsx
// ortak kullanır (v1.4.0'da LineupGame.jsx'ten çıkarıldı).
import { isVersatile } from "./awards";

export const POSITIONS   = ["PG", "SG", "SF", "PF", "C"];
export const BENCH_SLOTS = ["B1", "B2", "B3", "B4"];
export const ALL_SLOTS   = [...POSITIONS, ...BENCH_SLOTS];

// Arketipe göre oynayabileceği mevkiler (ilk = birincil)
export const ARCH_POSITIONS = {
  Ecosystem:    ["PG","SG"],
  Engine:       ["PG","SG"],
  Hub:          ["PG","SG","SF"],
  Creator:      ["PG","SG"],
  Initiator:    ["PG"],
  Connector:    ["SG","SF"],
  Spacer:       ["SG","SF","PF"],
  Stopper:      ["SF","PF"],
  Finisher:     ["SF","PF"],
  Force:        ["PF","C"],
  Anchor:       ["C","PF"],
  "Rim Runner": ["C","PF"],
};

// POSITION string → eligible positions (game slot eligibility + chemistry bonus)
export const POS_STRING_MAP = {
  "PG":["PG"],       "POINT GUARD":["PG"],
  "SG":["SG","SF"],  "SHOOTING GUARD":["SG","SF"],
  "SF":["SF","PF"],  "SMALL FORWARD":["SF","PF"],
  "PF":["PF","C"],   "POWER FORWARD":["PF","C"],
  "C": ["C","PF"],   "CENTER":["C","PF"],
  "G":["PG","SG"],   "GUARD":["PG","SG"],
  "F":["SF","PF"],   "FORWARD":["SF","PF"],
  "G-F":["SG","SF"], "GUARD-FORWARD":["SG","SF"], "FORWARD-GUARD":["SG","SF"],
  "F-C":["PF","C"],  "FORWARD-CENTER":["PF","C"], "CENTER-FORWARD":["PF","C"],
  "PG-SG":["PG","SG"], "SG-PG":["SG","PG"],
  "SG-SF":["SG","SF"], "SF-SG":["SF","SG"],
  "SF-PF":["SF","PF"], "PF-SF":["PF","SF"],
  "PF-C": ["PF","C"],  "C-PF": ["C","PF"],
};

const _POS5 = ["PG","SG","SF","PF","C"];

// Birincil mevki: backend POS5 → POSITION eşleme → arketip fallback
export function getPrimaryPos(player) {
  const p = String(player.POS5 || "").toUpperCase().trim();
  if (_POS5.includes(p)) return p;
  const raw = String(player.POSITION || "").toUpperCase().trim();
  if (raw && POS_STRING_MAP[raw]) return POS_STRING_MAP[raw][0];
  return (ARCH_POSITIONS[player.primary_arch] || POSITIONS)[0];
}
// İkincil mevki: backend POS5_SECONDARY + stat heuristik. Yoksa POSITION
// eşlemesinin 2. mevkisi; o da yoksa null.
export function getSecondaryPos(player) {
  const s = String(player.POS5_SECONDARY || "").toUpperCase().trim();
  if (_POS5.includes(s) && s !== getPrimaryPos(player)) return s;
  const raw = String(player.POSITION || "").toUpperCase().trim();
  const mapped = POS_STRING_MAP[raw];
  if (mapped && mapped[1] && mapped[1] !== getPrimaryPos(player)) return mapped[1];
  return null;
}
// Uygun mevkiler = [birincil, (varsa) ikincil]
export function getEligiblePos(player) {
  const prim = getPrimaryPos(player);
  const sec  = getSecondaryPos(player);
  return sec ? [prim, sec] : [prim];
}

export function isFlex(player) { return isVersatile(player); }

// Birincil = ceza yok; ikincil = versatile ? yok : −10%.
export function posPenaltyFor(player, pos) {
  if (!POSITIONS.includes(pos)) return 1.0;   // bench
  const prim = getPrimaryPos(player);
  if (pos === prim) return 1.0;
  const sec = getSecondaryPos(player);
  if (sec && pos === sec) return isVersatile(player) ? 1.0 : 0.90;
  const idx = POSITIONS.indexOf(pos);
  const spanDist = Math.min(
    Math.abs(idx - POSITIONS.indexOf(prim)),
    sec ? Math.abs(idx - POSITIONS.indexOf(sec)) : 99,
  );
  if (isVersatile(player) && spanDist === 1) return 0.90;
  return 0.75;
}

export const POS_COLORS = {
  PG:"bg-blue-900/60 text-blue-300 border-blue-700/50",
  SG:"bg-sky-900/60 text-sky-300 border-sky-700/50",
  SF:"bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  PF:"bg-yamabuki/60 text-yamabuki border-yamabuki/50",
  C: "bg-red-900/60 text-red-300 border-red-700/50",
};

export function posGroupOf(p) {
  const raw = String(p?.POS5 || p?.POSITION || "").toUpperCase().trim();
  if (raw === "C" || raw.startsWith("CENTER")) return "C";
  if (raw === "PG" || raw === "SG" || raw.startsWith("G") || raw.includes("GUARD")) return "G";
  return "F";
}
