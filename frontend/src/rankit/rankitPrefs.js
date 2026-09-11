/* RankIt kullanıcı tercihleri — İKİ yüzeyin de kullandığı tek kaynak.
 *
 * Sunucuda değil cihazda tutuluyor: hepsi "bu ekranda bana nasıl görünsün"
 * sorusunun cevabı, hesabın bir özelliği değil. Aynı hesapla telefonda
 * skorları gizleyip webde göstermek meşru bir istek.
 *
 * localStorage her yerde erişilebilir değil (gizli sekme, site verisi
 * kapalı tarayıcılar, WebView kısıtları) — her okuma ve yazma sarmalanmış,
 * erişilemezse varsayılanlarla çalışmaya devam ediyor.
 */

const KEY = "rankit:prefs";

// Yayın kuralı olan ülkeler. Listede olmayan bir ülkeyi seçtirmek, veri
// yokken varmış gibi göstermek olurdu — kapsam dışıysa arayüz bunu söyler.
export const BROADCAST_COUNTRIES = [
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "TR", label: "Türkiye" },
];

export const DEFAULT_PREFS = {
  // "auto" => tarayıcı diline bak. Geo-IP kullanmıyoruz: dış bağımlılık ve
  // gizlilik yükü getiriyor, tarayıcı zaten bir cevap veriyor.
  broadcastCountry: "auto",
  hideScores: false,
  // 3g "Keep hiding until I rate". hideScores acikken bile PUANLADIGIN mac
  // acilir: spoiler korkusu kendi kaydin icin gecersiz, zaten izledin.
  // Varsayilan acik -- tasarim ikisini de acik cizmis ve kapali olsaydi
  // kendi defterin de bulanik kalirdi.
  hideUntilRated: true,
  // Kart giriş animasyonları. prefers-reduced-motion zaten saygı görüyor;
  // bu, o ayarı açmadan kapatmak isteyen için.
  reduceMotion: false,
};

/** Tarayıcı dilinden ülke kodu: "en-GB" -> "GB". Bulunamazsa null. */
export function localeCountry() {
  const tags = [];
  try {
    if (Array.isArray(navigator.languages)) tags.push(...navigator.languages);
    if (navigator.language) tags.push(navigator.language);
  } catch { /* navigator yoksa sessizce geç */ }
  for (const tag of tags) {
    const region = String(tag).split("-")[1];
    if (region && BROADCAST_COUNTRIES.some((c) => c.code === region.toUpperCase())) {
      return region.toUpperCase();
    }
  }
  return null;
}

/* Son okunan tercihler. readPrefs her çağrıda localStorage okuyup JSON
   ayrıştırıyordu; 60 kartlık bir ızgarada kart başına bir kez çağrılan bir
   yardımcı bunu 60 ayrıştırmaya çeviriyor. Yazma önbelleği geçersiz kılıyor,
   yani tazelik kaybı yok. */
let cache = null;

export function readPrefs() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    cache = { ...DEFAULT_PREFS };
  }
  return cache;
}

export function writePrefs(next) {
  const merged = { ...readPrefs(), ...next };
  cache = merged;
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch { /* yazamazsak tercih bu oturumda yaşar, uygulama çalışmaya devam eder */ }
  return merged;
}

/**
 * Bu maçın skoru gizlensin mi? — 3g'nin iki spoiler anahtarı TEK yerde.
 *
 * "Keep hiding until I rate" açıkken kendi puanladığın maç açılır: spoiler
 * korkusu kendi kaydın için geçersiz, zaten izledin. Kapalıyken gizleme
 * ayrım yapmaz.
 *
 * Kural burada duruyor çünkü üç ayrı yerde uygulanıyordu (eski kart, maç
 * sayfası, yeni kartın adaptörü) ve üçünün ayrışması "bir ekranda açık, bir
 * ekranda kapalı" demek olurdu.
 */
export function hidesScore(hideScores, match, prefs = readPrefs()) {
  if (!hideScores || match?.status !== "finished") return false;
  const rated = !!(match.my_watched_date || match.myWatchedDate
                   || match.my_rating != null || match.myRating != null);
  return !(prefs.hideUntilRated && rated);
}

/**
 * Yayın sorgusu için ülke kodu, ve o ülkede veri olup olmadığı.
 *
 * `supported` false ise arayüz "bu ülke için yayın verimiz yok" demeli —
 * sessizce başka bir ülkenin yayıncısını göstermek yanlış bilgi olur.
 */
export function resolveBroadcastCountry(prefs = readPrefs()) {
  if (prefs.broadcastCountry && prefs.broadcastCountry !== "auto") {
    return { code: prefs.broadcastCountry, supported: true, source: "chosen" };
  }
  const guess = localeCountry();
  if (guess) return { code: guess, supported: true, source: "locale" };
  let region = null;
  try {
    region = String(navigator.language || "").split("-")[1] || null;
  } catch { region = null; }
  // Tarayıcı kapsam dışı bir ülke söylüyor: sormaya devam etmiyoruz.
  return { code: null, supported: false, source: "locale", region };
}
