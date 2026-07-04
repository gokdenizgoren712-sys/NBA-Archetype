// ── Salary Cap modu: tier sistemi (v3.5 Faz 3b) ──────────────────────────────
// Oyuncular overall skoruna göre S/A/B/C/D tier'lara ayrılır.
// Kota: 2 S + 2 A + 2 B + 2 C + 1 D = tam 9 slot.

export const TIER_ORDER = ["S", "A", "B", "C", "D"];
export const TIER_QUOTA = { S: 2, A: 2, B: 2, C: 2, D: 1 };

export const TIER_COLORS = {
  S: "#a78bfa",   // mor — superstars
  A: "#facc15",   // altın — stars
  B: "#34d399",   // yeşil — solid starters
  C: "#38bdf8",   // mavi — rotation
  D: "#fb923c",   // turuncu — role / specialist
};

export const TIER_DESC = {
  S: "Superstars", A: "Stars", B: "Solid starters", C: "Rotation", D: "Role / spec",
};

export function tierOf(player) {
  const o = parseFloat(player?.overall_score || 0) || 0;
  if (o >= 0.87) return "S";
  if (o >= 0.78) return "A";
  if (o >= 0.70) return "B";
  if (o >= 0.58) return "C";
  return "D";
}

// Kota sayımında kullanılacak tier — wildcard fallback'te override edilebilir
export function tierForQuota(player) {
  return player?._tierOverride || tierOf(player);
}

// Dizilimdeki tier sayımları
export function countTiers(lineupPlayers) {
  const c = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const p of lineupPlayers) if (p) c[tierForQuota(p)]++;
  return c;
}

// İlk boş kotalı tier (wildcard pick'lerin sayılacağı yer)
export function firstOpenTier(counts) {
  return TIER_ORDER.find(t => counts[t] < TIER_QUOTA[t]) || "D";
}
