// ── Kafa kafaya draft — saf durum makinesi ───────────────────────────────────
//
// Basketbol tarafında draft mantığı SameScreenGame.jsx'in (1048 satır) içine
// gömülü ve WithAFriendGame/OnlineGame kendi kopyalarını taşıyor. Üç yerde üç
// kopya demek, bir kural değişince üçünü de düzeltmek demek.
//
// Futbolda mantık burada, arayüzden ayrı: Same Screen bunu doğrudan çalıştırıyor,
// oda modları aynı fonksiyonları sunucudan gelen durumla besliyor. Saf olduğu
// için de başsız test edilebiliyor (sıra doğru mu, havuz tükendiğinde ne olur).
//
// BASKETBOLDAN FARKLAR
//   • 11 seçim (ilk 11), 9 değil. Yedek kulübesi drafta girmiyor: eleme skoru
//     yalnızca ilk 11'den hesaplanıyor, yedek seçtirmek 14 tur daha uzatıp
//     sonuca hiç dokunmazdı.
//   • Seçilen oyuncu bir SLOT'a yerleşiyor. Futbolda "kaleci aldım ama kalede
//     kimse yok" mümkün, o yüzden yerleşim seçimin parçası.
//   • Kaleci slotu sert kural: yalnız kaleci girer, kaleci de başka yere giremez
//     (positions.canPlace). Diğer her yer cezalı ama serbest.

import { FORMATIONS } from "./formations.js";
import { canPlace, posPenaltyFor } from "./positions.js";

export const XI_PICKS = 11;

/** Karşı koltuk. İki kişilik oyun — üçüncü bir oyuncu yok. */
export const other = (seat) => (seat === 1 ? 2 : 1);

/**
 * Yeni draft durumu.
 * @param shapes {1: "4-3-3", 2: "4-2-3-1"} — taraflar farklı diziliş oynayabilir
 * @param wheelMode "round" (tek havuz, ikisi çekişir) | "pick" (herkes kendi spin'i)
 */
export function createDraft({ shapes, wheelMode = "round", first = 1 } = {}) {
  const sh = { 1: shapes?.[1] || "4-3-3", 2: shapes?.[2] || "4-3-3" };
  return {
    wheelMode,
    shapes: sh,
    round: 1,
    queue: [first, other(first)],
    turnPos: 0,
    // slotId -> oyuncu
    squads: { 1: {}, 2: {} },
    // Aynı oyuncu iki tarafa birden gidemez
    takenIds: new Set(),
    // O anki çarkın kadrosu (round modunda ikisi de bundan seçer)
    pool: null,          // {team, season, league, players}
    usedPairs: [],       // "team|season" — aynı kulüp-sezon tekrar çıkmasın
    phase: "spinning",   // spinning | drafting | done
  };
}

export const activeSeat = (d) => d.queue[d.turnPos] ?? d.queue[0];
export const waitingSeat = (d) => other(activeSeat(d));

/** Bir tarafın slot listesi — yalnız saha, yedek yok. */
export function slotsOf(d, seat) {
  return FORMATIONS[d.shapes[seat]]?.slots || [];
}

export const filled = (d, seat) => Object.keys(d.squads[seat]).length;
export const isComplete = (d, seat) => filled(d, seat) >= slotsOf(d, seat).length;

/** Bu oyuncu bu tarafta hangi slotlara girebilir? */
export function openSlotsFor(d, seat, player) {
  return slotsOf(d, seat).filter((s) => !d.squads[seat][s.id] && canPlace(player, s));
}

/**
 * Havuzdaki bir oyuncu şu an seçilebilir mi?
 * Alınmışsa hayır; yerleştirilecek boş slot yoksa hayır (kaleci dolu ve elde
 * yalnız kaleci kaldıysa bu gerçekten olabiliyor).
 */
export function canPick(d, seat, player) {
  if (d.takenIds.has(player.PLAYER_ID)) return false;
  return openSlotsFor(d, seat, player).length > 0;
}

/** Çark sonucu havuzu yerleştir. */
export function setPool(d, pool) {
  const next = { ...d, pool, phase: "drafting" };
  if (pool) next.usedPairs = [...d.usedPairs, `${pool.team}|${pool.season}`];
  return next;
}

/**
 * Seçim yap ve slota yerleştir.
 * Durumu MUTASYONA UĞRATMADAN yeni bir durum döndürür — React state'i ve
 * sunucu durumu aynı fonksiyonu paylaşabilsin diye.
 */
export function pick(d, seat, player, slotId) {
  if (seat !== activeSeat(d)) return { ok: false, reason: "not your turn" };
  if (d.takenIds.has(player.PLAYER_ID)) return { ok: false, reason: "already taken" };
  const slot = slotsOf(d, seat).find((s) => s.id === slotId);
  if (!slot) return { ok: false, reason: "unknown slot" };
  if (d.squads[seat][slotId]) return { ok: false, reason: "slot filled" };
  if (!canPlace(player, slot)) return { ok: false, reason: "cannot play there" };

  const taken = new Set(d.takenIds);
  taken.add(player.PLAYER_ID);
  const squads = {
    ...d.squads,
    [seat]: { ...d.squads[seat], [slotId]: { ...player, _slot: slotId } },
  };
  return { ok: true, state: advance({ ...d, squads, takenIds: taken }) };
}

/**
 * Sırayı ilerlet. Round içinde bekleyen varsa ona geçer; yoksa yeni round
 * açar ve BAŞLAYAN TARAFI DEĞİŞTİRİR (yılan sırası).
 *
 * Bir taraf tamamlandıysa sıradan düşer — diğeri tek başına devam eder,
 * yoksa 4-2-3-1 ile 3-5-2 gibi eşit slotlu ama farklı dizilişlerde biri
 * beklemede kalırdı.
 */
function advance(d) {
  const remaining = [1, 2].filter((s) => !isComplete(d, s));
  if (remaining.length === 0) return { ...d, phase: "done", pool: null };

  const nextPos = d.turnPos + 1;
  const stillThisRound = d.queue.slice(nextPos).filter((s) => remaining.includes(s));
  if (stillThisRound.length) {
    const pos = d.queue.indexOf(stillThisRound[0]);
    // pick modunda her seçim kendi çarkını ister
    return { ...d, turnPos: pos,
             phase: d.wheelMode === "pick" ? "spinning" : "drafting",
             pool: d.wheelMode === "pick" ? null : d.pool };
  }

  // Round bitti — yılan: bu turu ikinci başlayan, sonrakine ilk başlar
  const firstNext = remaining.length === 2 ? other(d.queue[0]) : remaining[0];
  const queue = [firstNext, other(firstNext)].filter((s) => remaining.includes(s));
  return { ...d, round: d.round + 1, queue, turnPos: 0,
           phase: "spinning", pool: null };
}

/**
 * Havuzda aktif taraf için seçilebilir kimse yoksa tur boşa düşer — çağıran
 * yeniden spin etmeli. (Kaleci dolu + havuzda yalnız kaleci kalması gerçek
 * bir durum, sessizce kilitlenmemeli.)
 */
export function poolIsDead(d) {
  if (!d.pool?.players?.length) return true;
  const seat = activeSeat(d);
  return !d.pool.players.some((p) => canPick(d, seat, p));
}

/** Bir tarafın kadro özeti — eleme motoruna verilecek hâli. */
export function squadOf(d, seat) {
  const slots = slotsOf(d, seat);
  const players = slots.map((s) => d.squads[seat][s.id]).filter(Boolean);
  const penalty = slots.reduce(
    (a, s) => a + (d.squads[seat][s.id] ? posPenaltyFor(d.squads[seat][s.id], s) : 0),
    0) / Math.max(1, slots.length);
  return { players, positionPenalty: penalty, shape: d.shapes[seat] };
}
