/** Misafirin bitmiş sonucu — girişe kadar cihazda bekler.
 *
 *  Uygulamada misafir oyunu sonuna kadar oynar, ama skor tablosu bir hesaba
 *  yazıyor. Giriş sitede tamamlanıyor ve rankit:// ile geri dönülüyor; o sırada
 *  RankItMobileApp onboarding'i sorarken yükleme ekranı çiziyor, yani kabuk ve
 *  içindeki oyun SÖKÜLÜP yeniden kuruluyor — bellekteki sonuç gider. Bu yüzden
 *  sonuç önce buraya yazılır, giriş dönüşünde gönderilir.
 *
 *  Tek kayıt: en son koşu. 24 saatten eski kayıt gönderilmez (unutulmuş bir
 *  sonucun günler sonra habersiz tabloya düşmesin).
 *  Doğrulama sunucununkiyle aynı (api/main.py save_game_score /
 *  save_season_result) — sunucunun 400 vereceği bir kaydı hiç saklamayız.
 */
import { apiUrl } from "../lib/apiOrigin.js";

export const PENDING_KEY = "arcade:pending-score";
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const GRADES = new Set(["S", "A", "B", "C", "D"]);
const MODES = new Set(["classic", "salarycap"]);
const SEASON_RESULTS = new Set(["CHAMPION", "REPEAT", "THREEPEAT", "FINALS", "CF", "SEMI", "R1", "MISSED"]);

// localStorage özel modda/kapalıyken erişimde fırlatabiliyor; bekleyen skor
// bir kolaylık, yokluğu oyunu bozmamalı.
function store(storage) {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}

export function isValidScore(score) {
  return !!score
    && typeof score.pct === "number" && score.pct >= 0 && score.pct <= 100
    && GRADES.has(score.grade)
    && MODES.has(score.mode)
    && Array.isArray(score.lineup) && score.lineup.length > 0;
}

export function isValidSeason(season) {
  return !!season
    && SEASON_RESULTS.has(season.season_result)
    && Number.isInteger(season.wins) && season.wins >= 0 && season.wins <= 82;
}

export function readPendingScore({ now = Date.now(), storage } = {}) {
  const s = store(storage);
  if (!s) return null;
  let entry;
  try { entry = JSON.parse(s.getItem(PENDING_KEY) || "null"); } catch { entry = null; }
  if (!entry || !isValidScore(entry.score)) return null;
  if (!(now - (entry.savedAt || 0) <= PENDING_MAX_AGE_MS)) {
    clearPendingScore({ storage: s });
    return null;
  }
  return entry;
}

/** Sonuç ekranı açıldığında (misafirken): skoru yaz, varsa önceki sezonu sil. */
export function savePendingScore(score, { now = Date.now(), storage } = {}) {
  const s = store(storage);
  if (!s || !isValidScore(score)) return false;
  try {
    s.setItem(PENDING_KEY, JSON.stringify({ score, season: null, savedAt: now }));
    return true;
  } catch { return false; }
}

/** Sezon bittiğinde (misafirken): aynı kayda sezon sonucunu ekle. Dynasty'de son yıl kazanır. */
export function savePendingSeason(season, { now = Date.now(), storage } = {}) {
  const s = store(storage);
  const entry = readPendingScore({ now, storage: s });
  if (!s || !entry || !isValidSeason(season)) return false;
  try {
    s.setItem(PENDING_KEY, JSON.stringify({ ...entry, season }));
    return true;
  } catch { return false; }
}

export function clearPendingScore({ storage } = {}) {
  const s = store(storage);
  try { s?.removeItem(PENDING_KEY); } catch { /* depolama kapalı — yapacak bir şey yok */ }
}

/** Giriş dönüşünde: skoru, sonra (varsa) sezonu gönder.
 *  { posted: true, id } | { posted: false, reason: "none" | "auth" | "rejected" | "network" }
 *  auth / network → kayıt kalır (sonra tekrar denenir); rejected → silinir. */
// Tek uçuş: RankItMobileApp'in kullanıcı effect'i art arda koşabiliyor (önce
// cihazdaki kullanıcı, sonra /me cevabı; dev'de StrictMode). Kayıt ancak POST
// cevabından sonra silindiği için eşzamanlı çağrıların hepsi aynı kaydı okuyup
// skoru üç kez yazıyordu (2026-09-26, giriş yapmış uçtan uca turda yakalandı).
// Uçuştaki çağrı varken gelen çağrı aynı sözü alır.
let inFlight = null;

export function flushPendingScore(opts = {}) {
  if (!inFlight) inFlight = flushOnce(opts).finally(() => { inFlight = null; });
  return inFlight;
}

async function flushOnce({ token, fetchImpl = globalThis.fetch, now = Date.now(), storage } = {}) {
  const s = store(storage);
  const entry = readPendingScore({ now, storage: s });
  if (!entry) return { posted: false, reason: "none" };
  if (!token) return { posted: false, reason: "auth" };
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  let id;
  try {
    const res = await fetchImpl(apiUrl("/api/game/score"), {
      method: "POST", headers, body: JSON.stringify(entry.score),
    });
    if (res.status === 401) return { posted: false, reason: "auth" };
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) clearPendingScore({ storage: s });
      return { posted: false, reason: res.status >= 500 ? "network" : "rejected" };
    }
    id = (await res.json())?.id ?? null;
  } catch {
    return { posted: false, reason: "network" };
  }
  // Skor tabloda. Sezon güncellemesi başarısız olsa bile kaydı SİLİYORUZ:
  // tekrar denemek skoru ikinci kez yazardı.
  clearPendingScore({ storage: s });
  if (entry.season && id != null) {
    try {
      await fetchImpl(apiUrl("/api/game/season-result"), {
        method: "POST", headers, body: JSON.stringify({ ...entry.season, game_id: id }),
      });
    } catch { /* skor yazıldı; sezon satırı boş kalır — web'de de aynı sessiz davranış */ }
  }
  return { posted: true, id };
}
