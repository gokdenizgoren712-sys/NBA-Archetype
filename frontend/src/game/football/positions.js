// ── Futbol pozisyon uygunluğu ve ceza mantığı ────────────────────────────────
// Basketbol tarafındaki game/positions.js'in karşılığı, ama eşleme futbola özgü.
// Veri POSITION alanını GK/CB/FB/DM/CM/W/ST kısa koduyla tutuyor
// (src/football/fetch_fotmob.slots_for üretiyor).
//
// FELSEFE: bir oyuncuyu yabancı slotta oynatmak BEDAVA OLMAMALI ama yasak da
// olmamalı — gerçek futbolda bir stoper sağ bekte oynatılır, sadece daha kötü
// oynar. Ceza skordan düşülür, seçim engellenmez.

// Her pozisyonun oynayabileceği slotlar; ilk eleman asıl mevkisi.
// İkinci ve sonrası "idare eder", listede hiç yoksa "yabancı".
export const POS_ELIGIBLE = {
  GK: ["GK"],
  CB: ["CB", "FB", "DM"],        // stoper bekte ya da önünde oynayabilir
  FB: ["FB", "W", "CB"],         // bek kanada çıkabilir, içeri kayabilir
  DM: ["DM", "CM", "CB"],        // altıncı sekize ya da stopere düşebilir
  CM: ["CM", "DM", "AM", "W"],
  W:  ["W", "AM", "ST", "FB"],   // kanat içeri kayabilir, forvete çıkabilir
  AM: ["AM", "W", "CM", "ST"],   // on numara: içeride, kanatta ya da sekizde
  ST: ["ST", "AM", "W"],
};

// Ceza: sıraya göre. 0 = asıl mevki, sonrası kademeli.
const PENALTY_BY_RANK = [0.0, 0.05, 0.11];
const PENALTY_FOREIGN = 0.20;    // listede hiç yok
const PENALTY_GK_MISMATCH = 0.45; // kaleci başka yerde / başkası kalede

/** Oyuncunun bu slotta oynamasının cezası [0..0.45]. */
export function posPenaltyFor(player, slot) {
  if (!player || !slot) return 0;
  if (slot.bench) return 0;                  // yedek kulübesinde ceza yok
  const p = String(player.POSITION || "").toUpperCase();
  const want = slot.pos;
  if (!p || !want) return 0;
  // Kaleci meselesi ayrı: kaleci olmayan biri kalede (ya da tersi) ağır ceza
  if ((want === "GK") !== (p === "GK")) return PENALTY_GK_MISMATCH;
  const list = POS_ELIGIBLE[p] || [];
  const rank = list.indexOf(want);
  if (rank < 0) return PENALTY_FOREIGN;
  return PENALTY_BY_RANK[Math.min(rank, PENALTY_BY_RANK.length - 1)];
}

/** Oyuncu bu slotta asıl mevkisinde mi? (kimya bonusu bunu sayar) */
export function isPrimarySlot(player, slot) {
  if (!player || !slot || slot.bench) return false;
  const p = String(player.POSITION || "").toUpperCase();
  return !!p && slot.pos === (POS_ELIGIBLE[p] || [])[0];
}

/** Slot bu oyuncuyu alabilir mi? Kaleci slotu sadece kaleci alır — o kadarı
 *  sert kural, gerisi cezalı ama serbest. */
export function canPlace(player, slot) {
  if (!player || !slot) return false;
  if (slot.bench) return true;
  const isGK = String(player.POSITION || "").toUpperCase() === "GK";
  if (slot.pos === "GK") return isGK;
  return !isGK;                               // kaleci saha slotunda oynamaz
}

export const PENALTY_LABEL = pen =>
  pen === 0 ? "natural"
    : pen <= 0.05 ? "comfortable"
      : pen <= 0.11 ? "out of position"
        : pen < 0.4 ? "badly out of position"
          : "wrong role entirely";
