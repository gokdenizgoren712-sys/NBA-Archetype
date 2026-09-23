/* Skin jetonları — BUILD §4.2, görsel kaynak `RankIt Redesign.dc.html#4d`.
 *
 * "Each skin is a set of CSS variables on the same card — base, sheen, wash,
 * ink, footer, notch. So a skin renders once and appears everywhere: small on
 * the shelf, large on the share sheet." (4d)
 *
 * İlk dokuzun değerleri 4d ve 2j tahtalarındaki yüzeylerden birebir alındı.
 * `default` bugünkü MatchCard değerlerini AYNEN döndürür, yani skin verilmeyen
 * ya da `default` olan her kart bu değişiklikten önceki hâliyle çizilir.
 *
 * Sahibin kararı (2026-09-23): yeni üye 10 serbest skinle başlar (Gilt hariç —
 * o maça göre açılır); Chalk, Scarf, Scoreboard, Rain bu yüzden eklendi. Her
 * Hunt liginin kendi skini var: o ligde bir kulüp sezonunu bitiren açar. Lig
 * skinleri logo ya da marka işareti TAŞIMAZ, yalnız çağrışım yapan renk ve
 * doku (sahanın, ışığın, parkenin dili).
 *
 * Kural (§4.2): skin yalnız KOLEKSİYON NESNESİNİ ve onun paylaşım görselini
 * boyar; uygulama kabuğu hiçbir skin'i miras almaz. Kural (§2.2): parıltı her
 * skinde 68°, yalnız değerler değişir (Broadsheet'in gazete çizgisi tahtadaki
 * tek istisna).
 */

const CARD_BASE = "#151618";
const INK = "#eceded";
const GOLD = "#ffb11b";
const DEFAULT_SHEEN = "repeating-linear-gradient(68deg,rgba(255,255,255,.055) 0 2px,transparent 2px 11px)";

/* Sunucudaki SKINS ile aynı sıra ve kimlikler (api/rankit.py). */
export const FREE_SKINS = ["default", "broadsheet", "holofoil", "ember", "ink", "stub",
  "chalk", "scarf", "scoreboard", "rain"];
export const LEAGUE_SKINS = {
  premier: "Premier League", laliga: "La Liga", seriea: "Serie A", bundesliga: "Bundesliga",
  ligue1: "Ligue 1", euroleague: "EuroLeague", nba: "NBA",
};
export const SKIN_ORDER = [...FREE_SKINS, "gilt", "turf", "floodlight", ...Object.keys(LEAGUE_SKINS)];

export const SKIN_NAMES = {
  default: "Default", broadsheet: "Broadsheet", holofoil: "Holofoil", ember: "Ember",
  ink: "Ink", stub: "Stub", chalk: "Chalk", scarf: "Scarf", scoreboard: "Scoreboard", rain: "Rain",
  gilt: "Gilt", turf: "Turf", floodlight: "Floodlight", ...LEAGUE_SKINS,
};

/* 4d'nin açıklama satırları (seçicide tek satır). */
export const SKIN_NOTES = {
  default: "Club colours mixed into the base. The one everyone starts on.",
  broadsheet: "Cream newsprint. A light card, never a light theme.",
  holofoil: "Trading-card foil. Sheen stays 68°, tighter pitch.",
  ember: "The heat ramp becomes the card.",
  ink: "No club colour at all. Your rating is the only thing on it.",
  stub: "Ticket counterfoil — a tear line instead of notches.",
  chalk: "The tactics board. Chalk on slate, a circle half rubbed out.",
  scarf: "Both clubs in knitted bands, the way the terrace wears them.",
  scoreboard: "A dot-matrix board with nothing on it but the result.",
  rain: "A wet night under the lights. The sheen falls as rain.",
  gilt: "Classics only. The one place the whole card may go gold.",
  turf: "Earned by finishing a collection.",
  floodlight: "Earned by a seven-night streak.",
  ...Object.fromEntries(Object.entries(LEAGUE_SKINS).map(([id, league]) =>
    [id, `Earned by rating every match of one club's ${league} season.`])),
};

/* Kilitli karolar KOŞULU gösterir, asla önizleme değil (4d). Satırlar 2j
   karosunda alt alta (7.5px); lig adı tek satırda kalsın diye üç satır. */
export function lockCondition(id) {
  if (id === "turf") return ["FINISH A", "COLLECTION"];
  if (id === "floodlight") return ["7-NIGHT", "STREAK"];
  if (LEAGUE_SKINS[id]) return ["FINISH A", LEAGUE_SKINS[id].toUpperCase(), "SEASON"];
  return null;
}

/* Kilitli karonun arkasındaki soluk renk (2j: opacity .3 zemin). Kulüp
   rengine bağlı olmayan düz zemin — kilitli karo kart ÖNİZLEMESİ değil. */
export function lockSwatch(id) {
  return skinTokens(id).base;
}

function clubBase(home, away) {
  return `linear-gradient(155deg,color-mix(in oklab,${home} 44%,${CARD_BASE}) 0%,${CARD_BASE} 54%,color-mix(in oklab,${away} 34%,${CARD_BASE}) 100%)`;
}

/* Koyu kartın ortak değerleri = bugünkü MatchCard. Her skin yalnız farkını yazar.
   base: zemin · sheen: parıltı · wash: üst ışık/doku katmanı (yoksa null)
   ink: ana metin · eyebrow: ikincil metin · score: skor · soft: kilit ikonu
   faint: VS · notch / classicNotch: kesik köşe çizgisi · gold: damga
   footer / rule: ayak zemini ve çizgisi · pill / pillLine: durum hapı
   rest: boş ısı barı · gap: öndeki kalkanın ayırıcı çizgisi (zemin tonu)
   shieldHome / shieldAway / crestInk: kalkan rengini ezer (Broadsheet)
   light: açık zemin · stub: çentik yerine yırtma çizgisi */
const DARK = {
  sheen: DEFAULT_SHEEN, wash: null, ink: INK, eyebrow: "#9aa0a6", score: "#fff", soft: "#c9cccd",
  faint: "rgba(255,255,255,.42)", notch: "rgba(255,255,255,.22)", classicNotch: GOLD, gold: GOLD,
  footer: "rgba(9,10,11,.5)", rule: "rgba(255,255,255,.09)", pill: "rgba(0,0,0,.42)",
  pillLine: "rgba(255,255,255,.14)", rest: "rgba(255,255,255,.12)", gap: CARD_BASE,
  shieldHome: null, shieldAway: null, crestInk: null, light: false, stub: false,
};

export function skinTokens(id, { homeColor = "#3a3f47", awayColor = "#2a2e34" } = {}) {
  switch (id) {
    case "broadsheet":
      // 4d: --card-base #e8e4d9, --card-ink #17120a, --card-eyebrow #5c554a,
      // --card-notch rgba(0,0,0,.3), kalkanlar kâğıt tonunda. §4.2: "gold
      // darkens to #8a6a12" — açık zeminde altın okunmaz.
      return { ...DARK, base: "#e8e4d9", sheen: "repeating-linear-gradient(0deg,rgba(0,0,0,.045) 0 1px,transparent 1px 5px)",
        ink: "#17120a", eyebrow: "#5c554a", score: "#17120a", soft: "#5c554a", faint: "rgba(23,18,10,.45)",
        notch: "rgba(0,0,0,.3)", classicNotch: "#8a6a12", gold: "#8a6a12",
        footer: "rgba(23,18,10,.06)", rule: "rgba(0,0,0,.22)", pill: "rgba(23,18,10,.06)", pillLine: "rgba(0,0,0,.22)",
        rest: "rgba(23,18,10,.14)", gap: "#e8e4d9", shieldHome: "#d8d3c6", shieldAway: "#cfc9ba", crestInk: "#17120a",
        light: true };
    case "holofoil":
      return { ...DARK, base: "linear-gradient(150deg,#1b2440,#0b0f1c)",
        wash: "radial-gradient(circle at 26% 18%,rgba(155,120,255,.5),transparent 46%),radial-gradient(circle at 76% 64%,rgba(60,220,200,.42),transparent 46%),radial-gradient(circle at 52% 98%,rgba(255,110,180,.42),transparent 46%)",
        sheen: "repeating-linear-gradient(68deg,rgba(255,255,255,.12) 0 1px,transparent 1px 7px)",
        ink: "#fff", eyebrow: "rgba(255,255,255,.85)", notch: "rgba(255,255,255,.3)", gap: "#141b31" };
    case "ember":
      return { ...DARK, base: "linear-gradient(120deg,#2f5480,#5b4fa8 30%,#9a3f96 56%,#d43a63 78%,#f5402e)",
        wash: "radial-gradient(ellipse at 50% 130%,rgba(255,255,255,.28),transparent 54%)",
        ink: "#fff", eyebrow: "rgba(255,255,255,.9)", notch: "rgba(255,255,255,.35)", gap: "#9a3f96" };
    case "ink":
      // Kulüp rengi YOK; tipografik.
      return { ...DARK, base: "#0c0d0f", sheen: "none", eyebrow: "#7f868b", notch: "rgba(255,255,255,.16)", gap: "#0c0d0f" };
    case "stub":
      // Tek fark çentik yerine yırtma çizgisi — MatchCard `stub` bayrağıyla çizer.
      return { ...DARK, base: CARD_BASE, stub: true };
    case "chalk":
      // Taktik tahtası: arduvaz, tebeşir tozu, yarısı silinmiş bir daire.
      return { ...DARK, base: "linear-gradient(150deg,#2c3833,#141a17)",
        wash: "radial-gradient(ellipse at 22% 20%,rgba(236,240,232,.11),transparent 52%),radial-gradient(circle at 86% 112%,transparent 36%,rgba(236,240,232,.17) 36.5%,rgba(236,240,232,.17) 37.3%,transparent 37.8%)",
        sheen: "repeating-linear-gradient(68deg,rgba(236,240,232,.04) 0 1px,transparent 1px 8px)",
        ink: "#eef0ea", eyebrow: "rgba(238,240,234,.66)", soft: "rgba(238,240,234,.8)",
        notch: "rgba(238,240,234,.3)", gap: "#1f2824" };
    case "scarf": {
      // Tribün atkısı: iki kulübün rengi örme bantlar hâlinde. Bantlar yüzde
      // cinsinden, yani kart her boyda aynı beş bandı taşır.
      const h = `color-mix(in oklab,${homeColor} 40%,${CARD_BASE})`;
      const a = `color-mix(in oklab,${awayColor} 30%,${CARD_BASE})`;
      return { ...DARK, base: `linear-gradient(180deg,${h} 0 20%,${a} 20% 40%,${h} 40% 60%,${a} 60% 80%,${h} 80% 100%)`,
        wash: "repeating-linear-gradient(90deg,rgba(0,0,0,.16) 0 1px,transparent 1px 4px),linear-gradient(180deg,transparent 40%,rgba(0,0,0,.28))",
        eyebrow: "rgba(236,237,237,.72)", gap: a };
    }
    case "scoreboard":
      // Nokta vuruşlu skor tabelası: siyah zemin, ışık noktaları.
      return { ...DARK, base: "#08090a", sheen: "none",
        wash: "radial-gradient(circle,rgba(255,255,255,.08) 0 .9px,transparent 1.3px) 0 0/5px 5px",
        ink: "#f2f4f5", eyebrow: "#8b9398", notch: "rgba(255,255,255,.18)", gap: "#08090a" };
    case "rain":
      // Yağmurlu bir gece maçı: projektör pusu, 68°'de düşen yağmur.
      return { ...DARK, base: "linear-gradient(165deg,#1d2a36,#0a0f15)",
        wash: "radial-gradient(ellipse at 72% -8%,rgba(170,205,235,.24),transparent 56%)",
        sheen: "repeating-linear-gradient(68deg,rgba(190,220,245,.09) 0 1px,transparent 1px 13px)",
        eyebrow: "rgba(214,228,240,.7)", notch: "rgba(214,228,240,.26)", gap: "#141d26" };
    case "gilt":
      return { ...DARK, base: "linear-gradient(150deg,#3b2d0c,#17120a)",
        sheen: "repeating-linear-gradient(68deg,rgba(255,177,27,.14) 0 2px,transparent 2px 9px)",
        ink: GOLD, eyebrow: "rgba(255,177,27,.75)", score: GOLD, notch: GOLD, gap: "#2a200b" };
    case "turf":
      return { ...DARK, base: "linear-gradient(150deg,#1f6a3f,#0c2a19)", eyebrow: "#c9cccd", gap: "#15492c" };
    case "floodlight":
      return { ...DARK, base: "linear-gradient(150deg,#3b1f5e,#120b1e)",
        wash: "radial-gradient(ellipse at 50% -10%,rgba(255,255,255,.22),transparent 55%)", eyebrow: "#c9cccd", gap: "#29163f" };
    // ── Lig skinleri: renk ve doku, logo yok ──
    case "premier":
      return { ...DARK, base: "linear-gradient(150deg,#46104f,#170520)",
        wash: "radial-gradient(circle at 92% 6%,rgba(0,229,255,.3),transparent 40%),radial-gradient(circle at 6% 98%,rgba(255,40,130,.26),transparent 44%)",
        eyebrow: "rgba(236,237,237,.72)", notch: "rgba(255,255,255,.26)", gap: "#2d0a36" };
    case "laliga":
      // Kiremit ve geç saat güneşi.
      return { ...DARK, base: "linear-gradient(150deg,#a3202c,#3a0a10 70%)",
        wash: "radial-gradient(circle at 84% 10%,rgba(255,140,60,.34),transparent 46%)",
        eyebrow: "rgba(255,226,214,.72)", notch: "rgba(255,255,255,.26)", gap: "#6a141d" };
    case "seriea":
      // Azzurro.
      return { ...DARK, base: "linear-gradient(150deg,#1a4f9c,#081733)",
        wash: "radial-gradient(ellipse at 18% 0%,rgba(160,200,255,.28),transparent 50%)",
        eyebrow: "rgba(214,228,255,.72)", notch: "rgba(255,255,255,.26)", gap: "#113366" };
    case "bundesliga":
      // Siyah kart, köşeden kırmızı bir kesik.
      return { ...DARK, base: "linear-gradient(155deg,#c8141e 0%,#7c0b12 20%,#151618 48%,#0e0f10 100%)", gap: "#151618" };
    case "ligue1":
      // Gece mavisi, alt kenarda ince üç renk.
      return { ...DARK, base: "linear-gradient(150deg,#16203a,#080b14)",
        wash: "linear-gradient(90deg,#0055a4 0 33.3%,#eceded 33.3% 66.6%,#ef4135 66.6%) 0 100%/100% 3px no-repeat",
        eyebrow: "rgba(214,222,240,.7)", gap: "#0f1628" };
    case "euroleague":
      // Turuncu ve bir üç sayı yayı.
      return { ...DARK, base: "linear-gradient(150deg,#d4561a,#3c1405 72%)",
        wash: "radial-gradient(circle at 50% 118%,transparent 47%,rgba(255,255,255,.2) 47.4%,rgba(255,255,255,.2) 48.2%,transparent 48.6%)",
        eyebrow: "rgba(255,232,214,.75)", notch: "rgba(255,255,255,.28)", gap: "#88350f" };
    case "nba":
      // Parke ve iki boya alanı çizgisi.
      return { ...DARK, base: "linear-gradient(180deg,rgba(10,6,3,.1),rgba(10,6,3,.55)),repeating-linear-gradient(90deg,#5a3519 0 11%,#4e2d14 11% 22%,#633b1c 22% 33%)",
        wash: "linear-gradient(90deg,transparent 30%,rgba(255,255,255,.14) 30% 30.8%,transparent 30.8% 69.2%,rgba(255,255,255,.14) 69.2% 70%,transparent 70%)",
        eyebrow: "rgba(245,228,210,.72)", notch: "rgba(255,255,255,.26)", gap: "#4a2b14" };
    default:
      // Bugünkü kart. Değiştirme: skin'siz her kart bununla çiziliyor.
      return { ...DARK, base: clubBase(homeColor, awayColor) };
  }
}

/* ── 2j seçici: saf yardımcılar ─────────────────────────────────────────── */

/* Sekmeler (2j "All / Earned / Locked"). "Earned" = bu kartta şimdi
   seçilebilenler (serbestler dahil); Gilt Classic olmayan kartta kilit değil
   ama seçilemez, o yüzden "Locked" altında durur. */
export function skinTabs(list = []) {
  return {
    all: list,
    earned: list.filter((s) => !s.locked && s.available),
    locked: list.filter((s) => s.locked || !s.available),
  };
}

/* Karoda önizleme yerine yazılan koşul; seçilebilir karoda null. */
export function tileCondition(skin) {
  if (!skin) return null;
  if (skin.locked) return lockCondition(skin.id);
  if (!skin.available && skin.rule === "classic") return ["CLASSIC", "CARDS ONLY"];
  return null;
}

export function applyLabel(id) {
  return `Apply ${SKIN_NAMES[id] || SKIN_NAMES.default}`;
}

/* 6a dördüncü satır (4i: "the unlock is a row, not a modal"): koşulu
   söyleyen tek cümle. Kutlama yok — rapor. */
export function unlockSentence(skin) {
  if (!skin) return "";
  if (skin.id === "turf") return "You closed a collection. It's in your skins.";
  if (skin.id === "floodlight") return "Seven nights in a row. It's in your skins.";
  if (LEAGUE_SKINS[skin.id]) return `You finished a ${LEAGUE_SKINS[skin.id]} season. It's in your skins.`;
  return "It's in your skins.";
}

/* Bilinmeyen/boş kimlik varsayılana düşer — eski kayıtlar `null` taşıyor. */
export function normalizeSkin(id) {
  return SKIN_ORDER.includes(id) ? id : "default";
}
