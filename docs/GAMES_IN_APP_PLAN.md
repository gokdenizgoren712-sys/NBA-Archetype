# Games by Primary Arch — RankIt uygulamasına oyun modülü

**Belge tarihi:** 25 Eylül 2026
**Durum:** TASLAK — planlama aşaması, henüz kod yazılmadı
**Kapsam:** YALNIZCA Android uygulaması (RankIt by Primary Arch). Web'de oyuna
zaten `/basketball/game` ve `/football/game` üzerinden gidiliyor; web'e bir şey
eklenmiyor.
**Görsel taslak:** https://claude.ai/artifact/PBwC8t3avTM54srcmYjP8y (ekranlar 1–7,
yol haritası, mimari sınır — Games by Primary Arch tuvali).

## 1. İstek

Sitedeki basketbol ve futbol oyunu (basketbol: Lineup Builder, futbol: Squad Builder) RankIt uygulamasının
içinde oynanabilsin. Giriş noktası: **Discover** sayfasında, **The Hunt** damgasının
yanında **Games by Primary Arch** tuşu.

Oyun RankIt'e ait bir şey değil. RankIt günlük (diary) tarafı, oyun Primary Arch'ın
istatistik/oyun tarafı. Bu yüzden oyun uygulamanın içinde **ayrı bir kısım** olarak
duruyor: RankIt'in kabuğu onu yalnızca açıyor, içine karışmıyor.

## 2. Ürün kararı (kayda geçecek istisna)

`frontend/src/rankit/PRODUCT.md` iki kural koyuyor:

- RankIt istatistik yüzeyine kaymamalı ("RankIt drifting into another stats surface
  is the main way this product dies").
- Kural 1: her özellik web ve mobile birlikte girer (şu an duraklatılmış, borç tablosu
  tutuluyor).

Games modülü bilinçli bir **istisna**: RankIt özelliği değil, uygulamaya özel konuk
modül. Parite kapsamı dışında — `src/audit_rankit_surfaces.py` onu saymaz, çünkü
`rankitApi` kullanmıyor. Faz 0'da `PRODUCT.md` ve `product/mobile.md`'ye bu not
düşülecek; sonraki oturumlar bunu "web'e borç" sanıp taşımaya kalkmasın.

## 3. Tespitler (analiz)

### 3.1 Giriş noktası

- Discover: `frontend/src/rankit/RankItPrototype.jsx` → `DiscoverView`.
- The Hunt damgası: aynı dosya, `.ri-hunt-summary` bloğu (stil:
  `rankit/rankit-v030.css`, "2c — Discover üstündeki The Hunt özeti").
- Damga **yalnızca** `huntLine(hunt)` doluysa çiziliyor (`redesign/huntSummary.js`):
  misafirde ve açık koleksiyonu olmayan hesapta yok. Games tuşu damgaya bağlı
  olamaz — damga yoksa tek başına satırı alır.

### 3.2 Uygulama ayrı bir build

- `frontend/src/main.jsx`: `VITE_RANKIT_MOBILE === 'true'` ise yalnız
  `rankit/RankItMobileApp.jsx` yükleniyor (`.env.rankit-mobile`).
- Bu build'de `BrowserRouter`, `AuthProvider`, `LanguageProvider` **yok**.
- `vite.config.js`: mobil modda `publicDir: false` — sitenin `public/` klasörü
  APK'ya girmiyor.
- `index.css` (Tailwind + `:root` değişkenleri `--bg-base`, `--text-muted`…) mobilde
  de yükleniyor — oyunların Tailwind sınıfları çalışır.

### 3.3 Oyun kodu

| Spor | Sayfa | Mantık |
|---|---|---|
| Basketbol | `pages/LineupGame.jsx` (Single), `SameScreenGame.jsx`, `WithAFriendGame.jsx`, `OnlineGame.jsx` | `src/game/` |
| Futbol | `pages/football/FootballGame.jsx` (Single), `FootballVersus.jsx` (same/friend/online) | `src/game/football/` |

Simülasyonlar istemcide; sunucudan yalnız veri geliyor. 2026-08'den beri bu
dosyalara 3 commit — kod oturmuş, APK'ya gömmek siteden fazla geri kalmaz.

### 3.4 Uygulamada çalışmayı engelleyenler

1. **Göreli `/api` yolları.** `src/api.js` → `BASE = "/api"`, ayrıca v1 kapsamında
   19 doğrudan `fetch("/api/…")`: `LineupGame.jsx` (7), `SameScreenGame.jsx` (5),
   `game/SeasonSimPanel.jsx` (5), `game/LeaderboardPanel.jsx` (1),
   `football/FootballGame.jsx` (1). Uygulamada köken `https://localhost` — hepsi
   boşa gider. RankIt bunu `API_ROOT` ile çözmüş (`rankit/rankitApi.js`,
   `VITE_RANKIT_API_URL=https://primaryarch.net`). CORS `https://localhost`'a zaten
   izin veriyor (`api/main.py`, `MOBILE_ORIGINS`).
2. **WebSocket.** `hooks/useGameSocket.js` `window.location.host` kullanıyor;
   `rankitSocketUrl()` ile aynı mantığa geçmeli (Faz 3).
3. **Oturum.** `contexts/AuthContext.jsx` `window.fetch`'i sarıyor ve 401'de
   `window.location.href = "/login?expired=1"` yapıyor — uygulamada boş sayfa.
   Uygulamaya özel, yönlendirmesiz bir auth adaptörü gerekiyor (aynı
   `nba_arch_token` anahtarı, aynı context şekli).
4. **Router.** `game/football/ModeAbout.jsx` `<Link>` kullanıyor (FootballGame
   `ModeInfoButton` üzerinden içeri alıyor); online modlar `useNavigate` /
   `useSearchParams` kullanıyor → `MemoryRouter`. ModeAbout'taki
   `/football/about` ve `/football/glossary` linkleri uygulamada siteye dışarı
   açılmalı.
5. **Paylaşım.** `LineupGame.jsx` `ShareCard`: `SITE_URL = window.location.origin`
   (uygulamada `https://localhost/game` kopyalanır; yedek değer de eski
   `nba-archetype.onrender.com`). "Save PNG" `a.download` kullanıyor — Android
   WebView'da çalışmaz. Tweet `window.open`.
6. **Görseller.** Basketbol cdn.nba.com, futbol Cloudinary → sorun yok. Futbolun
   `/football-photos` / `/football-cutouts` yedek yolu uygulamada kırılır
   (yalnız Cloudinary kimliği olmayan oyuncularda).
7. **CSS.** `game/game.css` ve `components/PlayerCard.css` global sınıf adları
   kullanıyor ama `.ri-*` ile çakışmıyor; RankIt stilleri `.rankit-app` altında.
   Oyun CSS'i yalnız modül açılınca yüklenecek (lazy chunk).

## 4. Mimari karar

**Seçilen: oyun kodunu APK'ya ayrı, tembel yüklenen bir modül olarak gömmek.**

| Seçenek | Neden değil / neden evet |
|---|---|
| Siteyi uygulama içi tarayıcıda açmak (`Browser.open`) | En ucuzu ama "uygulama içi" değil: Chrome sekmesi, sitenin üst barı, ayrı oturum. |
| Siteyi iframe'de göstermek | Token kökenler arası geçmez, sitenin kabuğu görünür, `?embed` modu ve postMessage köprüsü gerekir. |
| **APK'ya gömmek** | Gerçek uygulama içi deneyim, ortak oturum, geri tuşu kontrolü. Bedeli: oyun güncellemesi yeni APK ile gelir — kod oturmuş olduğu için kabul edilebilir. |

### 4.1 Modül yapısı

```
frontend/src/arcade/          ← RankIt DIŞINDA, ayrı modül
  GamesSurface.jsx            tam ekran yüzey: GAMES / BY PRIMARY ARCH başlığı + kapat
  GamesHost.jsx               MemoryRouter + LanguageProvider + AppAuthProvider
  GamesHub.jsx                spor seç → mod seç (telefon kartları)
  appAuth.jsx                 AuthContext ile aynı şekil; /login yönlendirmesi yok
  arcade.css                  .arc-* kapsamlı stiller
frontend/src/lib/apiOrigin.js apiUrl() + socketUrl() — site build'de köken boş
```

### 4.2 RankIt ile tek temas noktası

- `DiscoverView`: The Hunt damgası + Games kutusu ortak bir `.ri-discover-gates`
  satırında; yeni prop `onOpenGames`.
- Kabuk (`RankItPrototype`): `gamesOpen` state'i, `lazy(() => import("../arcade/GamesSurface"))`.
- Bayrak: tuş yalnızca `import.meta.env.VITE_RANKIT_MOBILE === "true"` iken.
  `/rankit/app` web önizlemesinde görünmez.
- Geri tuşu: yüzey `useBackClose` yığınına kaydolur. Oyun içindeyken geri →
  `MemoryRouter` geçmişinde bir adım; hub kökündeyken → yüzeyi kapatır, Discover'a
  döner.

### 4.3 Görsel kurallar (`rankit/DESIGN.md`)

- **One Gold Rule:** o bölgede "THE HUNT" başlığı zaten altın. Games kutusu
  **nötr**: `#121315` zemin, `rgba(255,255,255,.09)` çizgi, beyaz "GAMES" başlığı,
  gri (`#7f868b`) "BY PRIMARY ARCH" alt satırı — başlıktaki marka alt satırıyla aynı
  ton.
- 44px dokunma hedefi, 9px yazı tabanı.
- Hub içinde oyunun kendi aksanları: basketbol `#FFB11B`, futbol `#3FB08C` — bunlar
  RankIt bölgesinde değil, modülün kendi yüzeyinde.

## 5. Kullanıcı akışı

```
Discover
  └─ [THE HUNT 38%]  [GAMES · BY PRIMARY ARCH]
                              │
                              ▼
                  Games hub (tam ekran, kendi başlığı)
                  ├─ Basketball ─► Single Player | Same Screen | (Friend) | (Online)
                  └─ Football   ─► Single Player | Same Screen | (Friend) | (Online)
                              │
                              ▼
                  Oyun (draft → koç/menajer → sezon simülasyonu → sonuç)
                              │
     geri tuşu: oyun → mod seçimi → hub → Discover
```

Parantezdeki modlar Faz 3'e kadar "SOON" rozetli, dokunulamaz.

## 6. Fazlar

### Faz 0 — Kararı kayda geçir
- `rankit/PRODUCT.md` + `rankit/product/mobile.md`: "Games by Primary Arch —
  uygulamaya özel konuk modül, RankIt özelliği değil, parite dışı."

### Faz 1 — Paylaşılan altyapı (site davranışı DEĞİŞMEZ)
- `src/lib/apiOrigin.js`: `API_ORIGIN = VITE_RANKIT_API_URL || ""` → `apiUrl()`,
  `socketUrl()`.
- `src/api.js` → `BASE = \`${API_ORIGIN}/api\``.
- v1 kapsamındaki 19 doğrudan çağrı `apiUrl(…)` ile sarılır.
- `ShareCard`: `SITE_URL` sabit site adresine; uygulamada "Save PNG" ve tweet
  gizlenir, "Copy link" kalır.
- `appAuth.jsx` + `GamesHost.jsx`.

### Faz 2 — Giriş tuşu, hub, v1 modları
- `.ri-discover-gates` satırı (Hunt + Games; Hunt yoksa Games tek başına).
- `GamesSurface` + `GamesHub`.
- v1 modları (WebSocket gerektirmeyen): Basketbol Single + Same Screen, Futbol
  Single + Same Screen.
- Misafir oynayabilir; yalnız skor tablosuna gönderim girişe yönlendirir.

### Faz 3 — Online modlar
- With a Friend + Online Opponent: `socketUrl()`, girişi zorunlu kılan kapı,
  oda koduyla katılma. İsteğe bağlı: `rankit://game?code=` derin bağlantısı.
- İsteğe bağlı: `@capacitor/share` ile native PNG paylaşımı.

### Faz 4 — Doğrulama ve sürüm
- `frontend/tests/games-app.test.mjs`: kapsamdaki dosyalarda göreli `/api` yok;
  `arcade/` yalnız `lazy()` ile içeri alınıyor; tuş bayrağa bağlı.
- `npm run build:rankit-mobile`: oyun kodu ayrı chunk'ta, ana paket büyümüyor.
- Emülatörde uçtan uca: bir draft, sezon simülasyonu, geri tuşu zinciri, misafir.
- APK **Kural 2**'ye göre yalnız kullanıcının sözüyle kesilir ve birikmiş tüm işi
  taşır.

## 7. Açık sorular (kullanıcı kararı)

1. v1 = Single + Same Screen, online modlar Faz 3 — uygun mu?
2. Misafir oynayabilsin mi? (Öneri: evet, skor gönderimi girişe bağlı.)
3. Tuş metni: "GAMES / BY PRIMARY ARCH" iki satır mı, tek satır "Games by Primary
   Arch" mı?

## 8. Yan bulgu

`frontend/src/rankit/rankit-mobile.css`: `80b6fa0` (2026-09-24) commit'inden beri
tüm "g" harfleri "r" olmuş (`heirht`, `backrround`, `rrba(`, `--font-loro`).
Tarayıcı bunları geçersiz sayıp atlıyor — telefonda kabuk yüksekliği/zemini ve
hesap düğmesinin düzeni uygulanmıyor. Bu işin kapsamı dışında, ayrı görev olarak
önerildi.
