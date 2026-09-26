# Games by Primary Arch — RankIt uygulamasına oyun modülü

**Belge tarihi:** 25 Eylül 2026 · **güncelleme:** 26 Eylül 2026 (v3 — son plan)
**Durum:** UYGULANIYOR — Faz 0–4 bitti, Faz 6'da APK ve emülatör turu bekliyor (bkz. §9)
**Kapsam:** YALNIZCA Android uygulaması (RankIt by Primary Arch). Web'de oyuna
zaten `/basketball/game` üzerinden gidiliyor; web'e yeni bir yüzey eklenmiyor.
**Görsel taslak:** https://claude.ai/artifact/PBwC8t3avTM54srcmYjP8y (telefon
ekranları, yol haritası, mimari sınır — Games by Primary Arch tuvali).

## 1. İstek

Sitedeki basketbol oyunu (Lineup Builder) RankIt uygulamasının içinde, **mobil
arayüze uygun şekilde** oynanabilsin. Giriş noktası: **Discover** sayfasında, **The
Hunt** damgasının yanında **Games by Primary Arch** tuşu.

Oyun RankIt'e ait bir şey değil. RankIt günlük (diary) tarafı, oyun Primary Arch'ın
istatistik/oyun tarafı. Bu yüzden oyun uygulamanın içinde **ayrı bir kısım** olarak
duruyor: RankIt'in kabuğu onu yalnızca açıyor, içine karışmıyor.

## 2. Kararlar

| Tarih | Karar | Kimden |
|---|---|---|
| 2026-09-25 | Yalnız mobil uygulama; web'e bir şey eklenmiyor. | Kullanıcı |
| 2026-09-25 | Oyun RankIt özelliği değil, ayrı bir modül. | Kullanıcı |
| 2026-09-26 | Oyun **mobil arayüze göre yeniden tasarlanır** — sitenin masaüstü düzeni (3 sütunlu HUD, dock) telefona sıkıştırılmaz. | Kullanıcı |
| 2026-09-26 | **Same Screen modu uygulamada yok** — tek telefonda iki kişi için ekran çok küçük. | Kullanıcı |
| 2026-09-26 | **Önce basketbol.** Futbol (Squad Builder) sonraya; web tarafında da eksikleri var. | Kullanıcı |
| 2026-09-26 | Futbol gelene kadar spor seçim ekranı yok: Games tuşu doğrudan Lineup Builder'a açılır. Modül yapısı futbolu sonradan RankIt'e dokunmadan eklemeye izin verir. | Öneri, onaylandı |
| 2026-09-26 | **Misafir oynayabilir.** Oyun tam oynanır; yalnız skor tablosuna gönderim girişe bağlı. | Kullanıcı |
| 2026-09-26 | Discover tuşu **`side`** düzeninde: Hunt geniş, Games yanında dar kutu. Hunt yoksa Games satırı tek başına alır. | Kullanıcı |
| 2026-09-26 | **Rotasyon/dakika editörü ve Rewrite History v1'de.** "Oyunun en enteresan kısımları" — kesilmez. | Kullanıcı |

### 2.1 Ürün kaydı (istisna)

`frontend/src/rankit/PRODUCT.md` iki kural koyuyor: RankIt istatistik yüzeyine
kaymamalı, ve her özellik web ile mobile birlikte girer (Kural 1, şu an duraklatılmış).
Games modülü bilinçli bir **istisna**: RankIt özelliği değil, uygulamaya özel konuk
modül, parite kapsamı dışında (`src/audit_rankit_surfaces.py` onu saymaz, çünkü
`rankitApi` kullanmıyor). Faz 0'da `PRODUCT.md` ve `product/mobile.md`'ye yazılacak.

## 3. Tespitler

### 3.1 Giriş noktası

- Discover: `frontend/src/rankit/RankItPrototype.jsx` → `DiscoverView`.
- The Hunt damgası: `.ri-hunt-summary` (stil: `rankit/rankit-v030.css`, "2c").
- Damga yalnızca `huntLine(hunt)` doluysa çiziliyor (`redesign/huntSummary.js`):
  misafirde ve açık koleksiyonu olmayan hesapta yok. Games tuşu damgaya bağlı
  olamaz — damga yoksa tek başına satırı alır.

### 3.2 Uygulama ayrı bir build

- `frontend/src/main.jsx`: `VITE_RANKIT_MOBILE === 'true'` ise yalnız
  `rankit/RankItMobileApp.jsx` yükleniyor. `BrowserRouter`, `AuthProvider`,
  `LanguageProvider` yok. `vite.config.js`: mobil modda `publicDir: false`.
- `index.css` (Tailwind + `:root` değişkenleri) mobilde de yükleniyor.

### 3.3 Lineup Builder'ın bugünkü yapısı

`pages/LineupGame.jsx` (1519 satır) oyunun **hem mantığını hem arayüzünü** taşıyor:

- **Durum makinesi** (bileşenin içinde): `idle → pick_era → spin_season → spin_team →
  fetching → pick_player → pick_pos → … (9 kez) → pick_coach → complete`.
  Zamanlayıcılar (çark 1.6 sn), `/api/game/seasons|teams|players` istekleri,
  5 joker (Team, Year, Both, Pick 2, Discover), Salary Cap bütçe/garanti kuralı
  (15 denemede wildcard), sahada taşı/takas, koç draft'ı (4 aday), sıfırlama.
- **Saf modüller** (zaten ayrı, arayüzsüz): `game/lineupScore.js`, `seasonSim.js`,
  `playoffBracket.js`, `leagueSim.js`, `salary.js`, `eras.js`, `coaches.js`,
  `awards.js`, `positions.js`.
- **Sonuç + sezon**: `ScoreReveal` (Lineup Fit, kimya, kayıt, paylaşım, skor
  tablosu) ve `game/SeasonSimPanel.jsx` (924 satır: Quick Sim / Rewrite History,
  rotasyon-dakika editörü, maç maç akış, playoff bracket'i, ödüller, dynasty →
  REPEAT → THREEPEAT).
- **Masaüstü düzeni**: `g-dock` başlık barı + `g-hud` 3 sütun (süreç | saha |
  analitik). Telefonda bu düzen işe yaramaz — karar da zaten yeniden tasarım.
- **Skor gönderimi**: `ScoreReveal` açılınca, giriş yapılmışsa `/api/game/score`'a
  bir kez yazar; sezon bitince `/api/game/season-result` aynı satırı günceller.
  Misafirde hiçbir şey yazılmaz.

### 3.4 Uygulamada engeller

1. **Göreli `/api` yolları** (`api.js` `BASE="/api"` + oyun dosyalarında doğrudan
   `fetch("/api/…")`). Uygulamada köken `https://localhost`. Çözüm: tek bir köken
   yardımcısı (`VITE_RANKIT_API_URL`). CORS `https://localhost`'a zaten izin veriyor.
2. **Oturum**: `AuthContext` 401'de `/login`'e yönlendiriyor — uygulamada boş sayfa.
   Mobil arayüz `AuthContext`'e bağlanmaz; token'ı motor dışarıdan alır.
3. **Misafir → giriş sırasında state kaybı**: `RankItMobileApp` girişten sonra
   onboarding kontrolü yaparken yükleme ekranı çiziyor (`checking || firstRun === null`),
   yani `RankItPrototype` ve içindeki oyun **söküp yeniden kuruluyor**. Bitmiş sonuç
   önce "bekleyen skor" olarak cihaza yazılmalı, giriş dönüşünde gönderilmeli.
4. **Paylaşım**: `ShareCard` `window.location.origin` ile link kuruyor, PNG'yi
   `a.download` ile indiriyor — ikisi de WebView'da çalışmaz.
5. **Ağ yükü**: Rewrite History aynı sezon için 29 takımı paralel çekiyor
   (`leagueSim.js buildLeague`) — mobil veride ağır. Rewrite History v1'de olduğu
   için bu hafifletilir (bkz. Faz 4): eşzamanlılık sınırı, ilerleme göstergesi,
   sezon başına bellek önbelleği, eksik takımda mevcut uyarı.
6. **WebSocket** (yalnız With a Friend / Online): `useGameSocket` `window.location.host`
   kullanıyor.

## 4. Mimari

### 4.1 Neden APK'ya gömülü

| Seçenek | Değerlendirme |
|---|---|
| Siteyi uygulama içi tarayıcıda açmak | Chrome sekmesi, sitenin üst barı, ayrı oturum; mobil tasarım da olmaz. |
| iframe | Token kökenler arası geçmez, sitenin kabuğu görünür. |
| **Gömülü modül, yeni mobil arayüz** | Gerçek uygulama içi deneyim, ortak oturum, geri tuşu kontrolü. Bedel: oyun güncellemesi yeni APK ile gelir. |

### 4.2 Tek motor, iki arayüz

Skor tablosu web ve uygulama için **ortak**. Aynı draft'ın iki yüzeyde farklı skor
üretmemesi için oyun kuralları tek yerde durmalı. Plan:

- `LineupGame.jsx` içindeki durum makinesi arayüzsüz bir kancaya çıkarılır:
  **`game/useLineupDraft.js`** (fazlar, çark zamanlayıcıları, istekler, jokerler,
  Salary Cap kuralları, seçim, pozisyon, koç, sıfırlama, skor gönderimi).
- `SeasonSimPanel.jsx`'in mantığı aynı şekilde **`game/useSeasonSim.js`**'e.
- Web'deki `LineupGame` / `SeasonSimPanel` bu kancaları kullanacak şekilde
  güncellenir — **davranış değişmez** (parite testleri, bkz. Faz 2).
- Mobil arayüz sıfırdan, `arcade/basketball/` altında, aynı kancaları kullanır.

Alternatif (önerilmez): web'e hiç dokunmadan mantığı mobile kopyalamak. Daha hızlı
başlar ama iki kopya zamanla ayrışır ve skor tablosu adaletsizleşir.

### 4.3 Modül yapısı

```
frontend/src/arcade/                 ← RankIt DIŞINDA, ayrı modül
  GamesSurface.jsx                   tam ekran yüzey, kendi başlığı, kendi ekran yığını
  apiOrigin.js                       apiUrl() / socketUrl() (lib/'e de konabilir)
  pendingScore.js                    misafir sonucu → giriş sonrası gönderim
  basketball/
    Home.jsx                         Lineup Builder girişi (mod, başla, skorlar)
    EraPicker.jsx                    dönem seçimi
    Spin.jsx                         sezon + takım çarkı
    Draft.jsx                        oyuncu listesi, jokerler, bütçe
    PositionSheet.jsx                9 slot, birincil/ceza gösterimi
    RosterSheet.jsx                  saha görünümü, taşı/takas
    CoachPicker.jsx                  4 koç
    Result.jsx                       Lineup Fit, kimya, kaydet, paylaş
    Season.jsx                       sezon akışı, playoff'lar, dynasty
    Leaderboard.jsx
  arcade.css                         .arc-* kapsamlı stiller
frontend/src/game/useLineupDraft.js  ortak motor (web + uygulama)
frontend/src/game/useSeasonSim.js    ortak sezon motoru
```

Router gerekmez: modül kendi ekran yığınını tutar, geri tuşu `useBackClose`
üzerinden yığında bir adım geri gider, en altta yüzeyi kapatır.

### 4.4 RankIt ile tek temas noktası

- `DiscoverView`: The Hunt + Games ortak `.ri-discover-gates` satırında; `onOpenGames`.
- Kabuk: `gamesOpen` state'i, `lazy(() => import("../arcade/GamesSurface"))`.
- Tuş yalnızca `VITE_RANKIT_MOBILE === "true"` iken.

### 4.5 Görsel kurallar

- Discover'daki Games kutusu **nötr** (One Gold Rule: "THE HUNT" zaten altın).
- Modülün içi Primary Arch'ın oyun dili: basketbol aksanı `#FFB11B`, Rajdhani +
  Outfit, koyu zemin. Tek elle kullanım: birincil eylemler ekranın alt yarısında,
  44px dokunma hedefi, 9px yazı tabanı.

## 5. Mobil akış (v1)

```
Discover ─► [Games] ─► Lineup Builder girişi (Classic | Salary Cap)
                          │
                          ▼
                     Dönem seç ─► Çark (sezon + takım)
                                     │
                                     ▼
                     Oyuncu seç ──► Pozisyon (alt panel) ──┐
                        ▲  jokerler, bütçe, kadro paneli    │ 9 kez
                        └──────────── yeni çark ◄──────────┘
                                     │
                                     ▼
                     Koç seç ─► Sonuç (Lineup Fit)
                                     │
                                     ▼
                     Sezon kurulumu: Quick Sim | Rewrite History (sezon → takım)
                                     + rotasyon (dakika editörü)
                                     │
                                     ▼
                     Sezon akışı ─► Playoff ─► Dynasty ─► Skor tablosu
```

### 5.0 Ekranlar (tuvaldeki numaralarla)

| # | Ekran | Not |
|---|---|---|
| 1 | Discover — Hunt + Games (`side`) | RankIt'teki tek değişiklik |
| 2 | Discover — Hunt yokken | Games satırı tek başına |
| 3 | Lineup Builder girişi | Classic / Salary Cap, nasıl oynanır, skorlar |
| 4 | Dönem seçimi | 6 dönem, rastgele |
| 5 | Çark | Sezon + takım |
| 6 | Oyuncu seçimi | 5 joker, G/F/C filtre, sıralama, gizli OVR |
| 7 | Pozisyon paneli | ★ birincil, 9 slot |
| 8 | Kadro | Saha görünümü, takas |
| 9 | Koç | 4 aday |
| 10 | Sonuç | Lineup Fit, kimya, misafir girişi |
| 11 | Sezon kurulumu | Quick Sim / Rewrite History + rotasyon editörü |
| 12 | Rewrite History seçimi | Gerçek sezon → yerine geçilen takım |
| 13 | Sezon akışı | Kayıt, maçlar, playoff'lar, dynasty |
| 14 | Misafir skor gönderir | Giriş paneli, bekleyen skor |

Geri tuşu: her ekran bir adım geri; draft ortasında geri → "Draft'tan çık?" onayı
(kadro kaybolmasın); girişte → Discover.

### 5.1 Modlar

| Mod | Uygulamada |
|---|---|
| Single Player — Classic | v1 |
| Single Player — Salary Cap | v1 |
| With a Friend (2 cihaz, oda kodu) | Faz 5 (sonra) |
| Online Opponent | Faz 5 (sonra) |
| Same Screen | **Yok** (karar 2026-09-26) |

## 6. Fazlar

### Faz 0 — Kararı kayda geçir
- `rankit/PRODUCT.md` + `rankit/product/mobile.md`: konuk modül, parite dışı,
  Same Screen yok, futbol sonra.

### Faz 1 — Altyapı (site davranışı DEĞİŞMEZ)
- `apiUrl()` / `socketUrl()`; `api.js` ve oyun dosyalarındaki doğrudan `/api` çağrıları.
- `pendingScore.js`: misafir sonucunu saklama ve giriş sonrası gönderme.

### Faz 2 — Ortak motor
- `useLineupDraft` ve `useSeasonSim` çıkarılır; web sayfaları bunları kullanır.
- Testler: motorun faz geçişleri, joker kuralları, Salary Cap garanti/wildcard,
  pozisyon cezaları — sahte fetch ve sahte zamanlayıcıyla (`frontend/tests/`).
- Web'de elle kontrol: aynı draft aynı Lineup Fit'i veriyor.

### Faz 3 — Mobil draft akışı
- Discover satırı (Hunt + Games), `GamesSurface`, giriş, dönem, çark, oyuncu
  listesi, pozisyon paneli, kadro paneli, koç, sonuç.

### Faz 4 — Mobil sonuç, sezon, skor tablosu
- Sonuç ekranı (Lineup Fit, kimya, dönemin istediği sütunlar).
- **Sezon kurulumu**: Quick Sim / Rewrite History anahtarı + **rotasyon editörü**
  (9 oyuncu, taban dakikalar `BASE_MINUTES` ±`MINUTE_FLEX`, 240 dakikalık banka;
  37+ "tiring", 39+ "fatigue", ilk beşte ≤31 "fresh +PO" — web ile aynı kurallar,
  telefonda satır başına 44px −/+ düğmeleri).
- **Rewrite History**: dönemin gerçek sezonları → o sezonun takımları (gerçek W-L) →
  "Standing in for …" → takımın gerçek programı. Mobil hafifletme: `buildLeague`
  isteklerine eşzamanlılık sınırı (ör. 4), "Building the league 12/29" ilerlemesi,
  sezon başına bellek önbelleği; eksik takım uyarısı olduğu gibi kalır.
- Sezon akışı, playoff'lar (dikey tur listesi — ağaç değil), ödüller, dynasty.
- Skor tablosu; kadro kaydetme; paylaşım (`@capacitor/share`).
- Misafir: oyun tam oynanır, skor gönderimi girişe bağlı (bekleyen skor).

### Faz 5 — Sonra
- With a Friend + Online Opponent (WebSocket, oda kodu).
- Futbol (Squad Builder) — web eksikleri kapandıktan sonra.

### Faz 6 — Doğrulama ve sürüm
- Test: göreli `/api` yok; `arcade/` yalnız `lazy()` ile; tuş bayrağa bağlı.
- `npm run build:rankit-mobile`: oyun ayrı chunk.
- Emülatörde uçtan uca tur (giriş yapmış + misafir), geri tuşu zinciri.
- APK **Kural 2**: yalnız kullanıcının sözüyle, birikmiş tüm işle.

## 7. Açık sorular

Yok — hepsi 2026-09-26'da karara bağlandı (bkz. §2): misafir oynar, tuş `side`,
rotasyon editörü ve Rewrite History v1'de.

## 8. Yan bulgu

`frontend/src/rankit/rankit-mobile.css`: `80b6fa0` (2026-09-24) commit'inden beri
tüm "g" harfleri "r" olmuş (`heirht`, `backrround`, `rrba(`, `--font-loro`).
Tarayıcı bunları geçersiz sayıp atlıyor. Bu işin kapsamı dışında, ayrı görev olarak
önerildi.

## 9. İlerleme (26 Eylül 2026)

| Faz | Durum | Not |
|---|---|---|
| 0 | bitti | PRODUCT.md + product/mobile.md |
| 1 | bitti | `lib/apiOrigin.js`, `arcade/pendingScore.js` |
| 2 | bitti | `game/lineupDraft.js` + `seasonRun.js`; web `/basketball/game` bu motorlarla çalışıyor |
| 3–4 | bitti | `arcade/` (14 ekran), Discover satırı, geri tuşu zinciri, rotasyon, Rewrite History, playoff listesi, skor tablosu |
| 5 | sonra | With a Friend / Online Opponent, futbol |
| 6 | kısmen | testler + iki build + Chromium'da misafir uçtan uca tur bitti; emülatörde giriş yapmış tur ve APK (Kural 2) bekliyor |

**Doğrulama:** `frontend/tests/games-*.test.mjs` (motorlar, altyapı, arcade
sözleşmesi), `tests/test_games_cors.py`; mobil build'de oyun ayrı chunk
(`GamesSurface` ~97 kB, gzip ~32 kB), site build'inde arcade kodu yok.
Chromium 390×844, yerel backend + gerçek veri: 9 seçim → koç → sonuç →
rotasyon → Rewrite History (29 takım, uyarısız) → playoff → misafir skoru
cihazda bekliyor → geri tuşu zinciri → Discover.

**Uygulama sırasında bulunan hatalar (düzeltildi):**
- **CORS / 429:** rate limiter'ın 429'u CORS başlığı taşımıyordu; uygulama
  (https://localhost) bunu ağ hatası sanıyor, Rewrite History'nin lig kurulumu
  Retry-After'ı bekleyemeden düşüyordu. CORS middleware'i en dışa alındı
  (`api/main.py`); preflight artık sayaca girmiyor.
- **Aynı oyuncu iki kez:** pozisyon seçiminden sonraki 400 ms'de eski liste hâlâ
  tıklanabiliyordu. Motor artık yalnız `pick_player` fazında ve kadroda olmayan
  oyuncuyu kabul ediyor (web sayfası da bu korumayı alıyor).

**Plandan sapma (açık iş):** paylaşım şimdilik `navigator.share`, yoksa panoya
kopyalama. Android WebView `navigator.share` sunmadığı için uygulamada düğme
bugün yalnız metni kopyalıyor ("Copied to clipboard"). Gerçek paylaşım sayfası
için `@capacitor/share` eklenmeli; yeni native eklenti `cap sync` + APK
gerektirdiği için bir sonraki APK'yla birlikte yapılacak.

**Dikkat:** rate limit dakikada 120 istek. Rewrite History tek seferde 29 takım
çekiyor (6'lı gruplar); art arda birkaç sezon denemek sınıra dayanabilir.
429 artık okunuyor ve bekleniyor, yani akış bozulmuyor, yalnız yavaşlıyor.
