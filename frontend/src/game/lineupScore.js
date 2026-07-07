// ── Lineup skorlama (saf çekirdek) ───────────────────────────────────────────
// v3.9 (G3): computePlayerFit + computeLineupFit + computeAffinity buraya
// LineupGame.jsx'ten ÇIKARILDI. Amaç: hem UI hem headless backtest
// (scripts/backtest.mjs) AYNI skorlama mantığını kullansın — tek kaynak.
// React'sız, saf fonksiyonlar; Node'dan da import edilebilir.
import { eraDistFactor, topArchWeights } from "./seasonSim";
import { ERAS, ERA_PILLAR_WEIGHTS } from "./eras";

// ── Per-oyuncu: boyutsal katkı + era kalitesi ────────────────────────────────
// v3.6-B: era etkisi = SEÇİLEN sim era'ya uzaklık (eraball modeli).
// Arketipler artık yalnızca coverage/lineup fit üzerinden konuşur.
export function computePlayerFit(p, simEra) {
  const _s = k => { const v = parseFloat(p[`score_${k}`] ?? 0); return isNaN(v) ? 0 : Math.max(0, v); };
  // Boyutsal katkılar — lineup coverage için max alınır, specialist cezalandırılmaz.
  // v3.6-C5: Defense → Rim Protection (iç) + Perimeter D (çevre) olarak ayrıldı.
  const creation   = Math.min(1, Math.max(_s("Ecosystem")*1.10, _s("Engine"), _s("Hub")*0.90, _s("Creator")*0.88, _s("Initiator")*0.80));
  const spacing    = Math.min(1, Math.max(_s("Spacer"), _s("3-and-D")*0.90, _s("Stretch")*0.85, _s("Gravity")*0.95, _s("Three-Level")*0.80));
  const rimProt    = Math.min(1, Math.max(_s("Anchor")*1.10, _s("Force")*0.80, _s("Rim Runner")*0.45));
  const perimD     = Math.min(1, Math.max(_s("Stopper"), _s("Two-Way")*0.92, _s("Point-of-Attack")*0.90, _s("Defensive")*0.90));
  const finishing  = Math.min(1, Math.max(_s("Finisher"), _s("Rim Runner")*0.95, _s("Force")*0.75, _s("Slashing")*0.82));
  const overall    = Math.min(1, Math.max(0, parseFloat(p.overall_score || 0)));
  const { homeEra, dist, fitShift, distP, timeless } = eraDistFactor(p, simEra || ERAS[5]);
  const posPenalty = p._posPenalty ?? 1.0;
  const quality = Math.min(1, overall * distP * posPenalty);
  return { creation, spacing, rimProt, perimD, finishing, overall, quality,
           era: homeEra, dist, fitShift, distP, timeless, posPenalty };
}

// ── Lineup fit hesaplama ──────────────────────────────────────────────────────
// Mantık: Player Quality (oyuncular ne kadar iyi?) × Lineup Coverage (4 rol örtülüyor mu?)
export function computeLineupFit(players, simEra) {
  if (!players || players.length < 2) return null;
  const _s = (p, k) => { const v = parseFloat(p[`score_${k}`] ?? 0); return isNaN(v) ? 0 : Math.max(0, v); };

  const perPlayer = players.map(p => computePlayerFit(p, simEra));

  // 1. Oyuncu kalitesi ortalaması (era-adjusted overall)
  const avgQuality = perPlayer.reduce((a, b) => a + b.quality, 0) / perPlayer.length;

  // 2. Lineup coverage — her pillar için en iyi oyuncunun katkısı yeterli mi?
  // v3.6-C5: 5 sütun, SEÇİLEN era'nın metasına göre ağırlıklı (Dead Ball rim
  // protection ×1.45, Small Ball spacing ×1.45 & rim ×0.60). Aynı kadro farklı
  // era'da farklı coverage alır — arketipler era ile takım seviyesinde konuşur.
  const creationCov  = Math.min(1, Math.max(...perPlayer.map(p => p.creation)));
  // v3.8 spacing: sert 0.65 eşiği + sayı-tablosu yerine YUMUŞAK, büyüklük-duyarlı.
  // Her oyuncu spacing 0.45→0.70 arası kısmi "şutör" sayılır (0.66→~0.84, 0.95→1).
  // Etkin şutör sayısı interpolasyonlu tabloya girer — 2-3 hâlâ optimal, ama iki
  // elit şutör iki sınırda şutörden daha iyi spacing verir.
  const effShooters  = perPlayer.reduce((a,p)=>a+Math.max(0,Math.min(1,(p.spacing-0.45)/0.25)),0);
  const nShooters    = perPlayer.filter(p => p.spacing >= 0.65).length;   // gösterim (tam sayı)
  const _stbl = [0.12, 0.48, 0.84, 1.00, 0.90, 0.74];
  const _si = Math.min(5, effShooters), _lo = Math.floor(_si);
  const spacingCov   = Math.min(1, _stbl[_lo] + (_stbl[Math.min(5,_lo+1)]-_stbl[_lo])*(_si-_lo));
  const rimCov       = Math.min(1, Math.max(...perPlayer.map(p => p.rimProt)));
  const perimCov     = Math.min(1, Math.max(...perPlayer.map(p => p.perimD)));
  const finishingCov = Math.min(1, Math.max(...perPlayer.map(p => p.finishing)));
  const W = ERA_PILLAR_WEIGHTS[(simEra || ERAS[5]).id];
  const covVals = { creation: creationCov, spacing: spacingCov, rim_protection: rimCov,
                    perimeter_d: perimCov, finishing: finishingCov };
  let wSum = 0, wDot = 0;
  for (const k of Object.keys(W)) { wSum += W[k]; wDot += covVals[k] * W[k]; }
  const coverage = wDot / wSum;

  // 3. Role Fit — top-dominansı cezası. v3.8: 2 ball-dominant oyuncu ARTIK çok
  // minimal (−%5) — birçok elit ikili (Jordan+Pippen, LeBron+Wade, SGA+Williams)
  // iki topu domine eden yıldızla çalışır. Asıl darboğaz 3+: [0,0,-5,-22,-42,-58].
  const ballDom = players.filter(p => Math.max(_s(p,"Engine")*1.05, _s(p,"Ecosystem")) >= 0.80).length;
  const BALLDOM_PEN = [0, 0, 0.05, 0.22, 0.42, 0.58];
  const roleFit = Math.max(0, 1 - (BALLDOM_PEN[Math.min(ballDom, 5)] ?? 0.58));

  // 4. Final: ağırlıklı toplam (v3.5.1). Eski çarpım formülü skoru 40-55
  // bandına eziyordu — iki 0.6'lık faktörün çarpımı 0.36 eder. Toplamla
  // her faktörün katkısı görünür kalır ve S notu ulaşılabilir olur.
  const lineupScore = Math.min(1, 0.45 * avgQuality + 0.40 * coverage + 0.15 * roleFit);

  return {
    creation: creationCov, spacing: spacingCov, rim_protection: rimCov,
    perimeter_d: perimCov, finishing: finishingCov,
    roleFit, nShooters, coverage, avgQuality,
    lineupScore, perPlayer,
  };
}

// ── Arketip affinity (top-3 ağırlıklı pairwise) ──────────────────────────────
// v3.8: her oyuncunun TOP-3 arketibinin ağırlıklı profili üzerinden. Çift
// affinity'si iki oyuncunun tüm arketip-çifti kombinasyonlarının ağırlıklı
// ortalaması. players: dolu oyuncu dizisi. Dönüş: 0-1 float veya null.
// (UI 0-100'e yuvarlar; sim 0-1'i doğrudan computeTeamRating'e verir.)
export function computeAffinity(players, affinityMatrix) {
  const filledP = (players || []).filter(Boolean);
  if (filledP.length < 2 || !affinityMatrix) return null;
  const profiles = filledP.map(p => topArchWeights(p, 3));
  const pairAff = (wa, wb) => {
    let total = 0, wsum = 0;
    for (const [aA, wA] of wa) for (const [aB, wB] of wb) {
      const v = affinityMatrix[aA]?.[aB] ?? affinityMatrix[aB]?.[aA] ?? 0.65;
      const w = wA * wB;
      total += v * w; wsum += w;
    }
    return wsum > 0 ? total / wsum : 0.65;
  };
  let total = 0, count = 0;
  for (let i = 0; i < profiles.length; i++)
    for (let j = i + 1; j < profiles.length; j++) {
      if (!profiles[i].length || !profiles[j].length) continue;
      total += pairAff(profiles[i], profiles[j]); count++;
    }
  return count > 0 ? total / count : null;
}
