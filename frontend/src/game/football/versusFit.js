// Same Screen / odalar için futbol yardımcıları: kadro rakamları, sunucu rol kapsamı, maç istatistiği.
// Oyun kuralı değil, sunum verisi: eleme motoru (headToHead.js) bunlardan bağımsız çalışır.

import { api } from "../../api";
import { managerBonus } from "./managers";
import { buildSide } from "./headToHead";

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Eleme motorunun gördüğü kalite (0-1) ve parçaları; ekranda gösterilen sayı BU, ikisi birebir aynı. */
export function sideNumbers(squad, manager) {
  const { bonus, matched } = managerBonus(manager, squad.shape);
  const side = buildSide(squad.name, squad.players, null, squad.positionPenalty, bonus);
  const mean = squad.players.length ? squad.players.reduce((a, p) => a + (p.overall_score || 0), 0) / squad.players.length : 0.5;
  return { side, quality: side.quality, mean, positionFit: 1 - squad.positionPenalty, bonus, matched };
}

/** Sunucudan rol kapsamı (slot_scores, strongest, weakest). Hata olursa null: ekran bu bölümü gizler. */
export async function roleCoverage(squad) {
  const ids = squad.players.map((p) => p.PLAYER_ID);
  const entries = squad.players.map((p) => ({ player_id: p.PLAYER_ID, season: p.SEASON }));
  try {
    const f = await api.footballLineupFit(ids, squad.players[0]?.SEASON, entries);
    return !f || f.error ? null : f;
  } catch { return null; }
}

/** İki XI arasında en çok ayrışan beş rol. */
export function pillarsOf(fa, fb, n = 5) {
  if (!fa?.slot_scores || !fb?.slot_scores) return [];
  return Object.keys(fa.slot_scores).filter((k) => k in fb.slot_scores)
    .map((k) => ({ key: k, a: clamp01(fa.slot_scores[k]), b: clamp01(fb.slot_scores[k]) }))
    .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).slice(0, n);
}

const WEIGHT = { fwd: 1, mid: 0.45, def: 0.12, gk: 0 };
const pick = (items, w, rand) => {
  const tot = w.reduce((a, b) => a + b, 0);
  if (tot <= 0) return null;
  let r = rand() * tot;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
};
const num = (v) => { const x = parseFloat(v); return Number.isNaN(x) ? 0 : x; };

/** Bir ayağın oyuncu bazlı gol/asist dağılımı: skor motordan, kim attığı sezon verisinden (gol ve asist /90). */
export function legStats(players, goals, rand = Math.random) {
  const rows = players.map((p) => ({ id: p.PLAYER_ID, name: p.PLAYER_NAME, min: 90, g: 0, a: 0, phase: p.PHASE }));
  const gw = rows.map((r, i) => (WEIGHT[r.phase] ?? 0.3) * (0.04 + num(players[i].goals_90)));
  const aw = rows.map((r, i) => (r.phase === "gk" ? 0 : 0.04 + num(players[i].assists_90)));
  for (let k = 0; k < goals; k++) {
    const sc = pick(rows, gw, rand);
    if (!sc) break;
    sc.g++;
    if (rand() < 0.7) {
      const idx = rows.indexOf(sc);
      const w = aw.map((v, i) => (i === idx ? 0 : v));
      const as = pick(rows, w, rand);
      if (as) as.a++;
    }
  }
  return rows;
}
