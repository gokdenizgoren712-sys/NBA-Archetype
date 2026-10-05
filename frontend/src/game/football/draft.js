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
//   • 18 seçim (11 ilk + 7 yedek), 9 değil. Yedekler eleme skoruna girmiyor
//     (skor yalnız ilk 11'den) ama kadronun parçası: tek oyunculu modla aynı
//     18'lik kadro, kırılgan bir kadroyu yedekler dengeliyor.
//   • Seçilen oyuncu bir SLOT'a yerleşiyor. Futbolda "kaleci aldım ama kalede
//     kimse yok" mümkün, o yüzden yerleşim seçimin parçası.
//   • Kaleci slotu sert kural: yalnız kaleci girer, kaleci de başka yere giremez
//     (positions.canPlace). Diğer her yer cezalı ama serbest.

import { FORMATIONS, benchSlots } from "./formations.js";
import { canPlace, posPenaltyFor } from "./positions.js";

export const XI_PICKS = 11;
export const SQUAD_PICKS = 18;   // 11 ilk + 7 yedek

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

/** Bir tarafın slot listesi: 11 saha + 7 yedek (tek oyunculu moddaki 18'lik kadro). */
export function slotsOf(d, seat) {
  const f = FORMATIONS[d.shapes[seat]];
  return f ? [...f.slots, ...benchSlots()] : [];
}
export const pitchOf = (d, seat) => FORMATIONS[d.shapes[seat]]?.slots || [];

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
export function pick(d, seat, player, slotId, opts = {}) {
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
  const next = { ...d, squads, takenIds: taken };
  // Pick 2 jokeri: aynı havuzdan bir seçim daha, sıra değişmez (taraf dolduysa normal ilerle)
  if (opts.again && !isComplete(next, seat)) return { ok: true, state: { ...next, phase: "drafting" } };
  return { ok: true, state: advance(next) };
}

/** Aynı taraf içinde iki slotu takas et (kilitli kadro ekranındaki son düzenleme). */
export function swap(d, seat, a, b) {
  const slots = slotsOf(d, seat);
  const sa = slots.find((s) => s.id === a), sb = slots.find((s) => s.id === b);
  if (!sa || !sb || a === b) return { ok: false, reason: "bad slots" };
  const pa = d.squads[seat][a], pb = d.squads[seat][b];
  if (pa && !canPlace(pa, sb)) return { ok: false, reason: "A goalkeeper can only stand in goal." };
  if (pb && !canPlace(pb, sa)) return { ok: false, reason: "A goalkeeper can only stand in goal." };
  const sq = { ...d.squads[seat] };
  delete sq[a]; delete sq[b];
  if (pa) sq[b] = { ...pa, _slot: b };
  if (pb) sq[a] = { ...pb, _slot: a };
  return { ok: true, state: { ...d, squads: { ...d.squads, [seat]: sq } } };
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

/** Bir tarafın kadro özeti — eleme motoruna verilecek hâli. Ceza ve skor yalnız ilk 11'den. */
export function squadOf(d, seat) {
  const pitch = pitchOf(d, seat);
  const players = pitch.map((s) => d.squads[seat][s.id]).filter(Boolean);
  const bench = benchSlots().map((s) => d.squads[seat][s.id]).filter(Boolean);
  const penalty = pitch.reduce(
    (a, s) => a + (d.squads[seat][s.id] ? posPenaltyFor(d.squads[seat][s.id], s) : 0),
    0) / Math.max(1, pitch.length);
  return { players, bench, positionPenalty: penalty, shape: d.shapes[seat] };
}
