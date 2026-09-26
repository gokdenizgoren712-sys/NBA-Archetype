// ── Lineup Builder'ın nihai puanı (skor tablosuna giden) ─────────────────────
// Önceden LineupGame.jsx'in ScoreReveal bileşeninin içindeydi. Web ve RankIt
// uygulaması (arcade/) AYNI tabloya yazdığı için tek kaynak burası: iki yüzey
// aynı draft'a asla farklı puan veremez (bkz. docs/GAMES_IN_APP_PLAN.md §4.2).

// Birincil mevkiindeki her starter +0.02 kimya.
export const CHEMISTRY_PER_PRIMARY = 0.02;

// Eşikler ağırlıklı-toplam bandına göre: tipik çekiliş ~66-72 (C+/B), iyi ~78 (A), efsane 85+ (S)
export function gradeOf(pct) {
  return pct >= 85 ? "S" : pct >= 78 ? "A" : pct >= 70 ? "B" : pct >= 62 ? "C" : "D";
}

/** fit = computeLineupFit(...) sonucu; primaryCount = birincil mevkideki starter sayısı. */
export function finalScore(fit, primaryCount) {
  const chemBonus = primaryCount * CHEMISTRY_PER_PRIMARY;
  const rawScore = fit.lineupScore;
  const totalScore = Math.min(1, rawScore + chemBonus);
  const pct = Math.round(totalScore * 100);
  return { chemBonus, rawScore, totalScore, pct, grade: gradeOf(pct) };
}
