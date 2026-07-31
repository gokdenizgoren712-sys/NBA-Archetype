/**
 * Lineups sayfası için ince sarmalayıcı — asıl skorlama mantığı artık
 * game/lineupScore.js'te (Same Screen/With a Friend/Single Player ile
 * PAYLAŞILAN tek kaynak).
 *
 * 2026-07: bu dosya önceden game/lineupScore.js'in TAMAMEN AYRI, kendi
 * era-ağırlıklandırma sistemine (ERA_ARCH_WEIGHTS) ve final formülüne
 * (avgQuality × coverage × roleFit — game/'in kendi yorumunda "eski,
 * skoru 40-55 bandına ezen formül" dediği, bilinçli olarak terk edilmiş
 * yaklaşım) sahipti. Sonuç: AYNI 5 kişilik kadro Same Screen'de 79-83 puan
 * alırken Lineups sayfasında 39-48 puan/C-D notu alıyordu — kullanıcı
 * deneyiminde ciddi bir tutarsızlıktı, gerçek verilerle ölçülüp doğrulandı.
 * Artık TEK formül: era-mesafe modeli (eraDistFactor/eraMetaFactor) +
 * ağırlıklı toplam + 5 ayrı pillar (Creation/Spacing/Rim Protection/
 * Perimeter D/Finishing, game/eras.js ERA_PILLAR_WEIGHTS).
 */
import { computeLineupFit as _computeLineupFit } from "../game/lineupScore";
import { eraMetaFactor } from "../game/seasonSim";
import { ERAS, getEra, PILLAR_LABELS } from "../game/eras";

export { ERAS, getEra, PILLAR_LABELS };

export function computeLineupFit(players, simEra) {
  const era = simEra || ERAS[ERAS.length - 1];
  const fit = _computeLineupFit(players, era);
  if (!fit) return null;

  const pct = Math.round(fit.lineupScore * 100);
  let grade = "D";
  if (pct >= 85) grade = "S";
  else if (pct >= 72) grade = "A";
  else if (pct >= 58) grade = "B";
  else if (pct >= 42) grade = "C";

  // Geriye dönük uyumluluk: eski eraFactor alanı (Lineups.jsx per-player
  // gösteriminde kullanıyor) artık game/seasonSim.js'in eraMetaFactor()'üne
  // eşleniyor — aynı kavram (oyuncunun arketibi bu era'da ne kadar meta),
  // game/'in güncel/kalibre edilmiş hesabıyla.
  const perPlayer = fit.perPlayer.map((pf, i) => ({
    ...pf,
    eraFactor: eraMetaFactor(players[i], era),
  }));

  return { ...fit, pct, grade, perPlayer };
}

export const GRADE_COLOR = {
  S: "#d97706", A: "#22c55e", B: "#3b82f6", C: "#f97316", D: "#ef4444",
};
