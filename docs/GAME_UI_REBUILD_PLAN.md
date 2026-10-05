# Spin & Build — oyun arayüzü yeniden inşa planı

Kaynaklar (sırasıyla): `UI mockups for branding.zip` içindeki `Basketball.dc.html`,
`Football.dc.html`, `Draft Flow.dc.html` (+ bunların içe aldığı `In Site`,
`Football Single Player`, `Same Screen Flow(+Football)`, `Room Flows`,
`Mobile Flow`) ve `CLAUDE_CODE_PROMPT.md`. Mockup ile bu plan çelişirse
**mockup kazanır**; görsel bir şeyi değiştirmeden önce kullanıcıya sorulur.
`uploads/` klasöründeki PNG'ler sitenin **güncel** hâli — referans DEĞİL, bakılmaz.

Bu belge brief'in §8 "Deliverables and order of work" sırasının bu repoya
uyarlanmış hâlidir; sıfırdan plan değildir.

---

## 1. Brief'ten bu repoya uyarlamalar

| Brief diyor | Bu repoda |
|---|---|
| React + Vite, repo dili | React + Vite, **JS/JSX** (TS yok). Reducer kullan, XState ekleme. |
| `AppShell/Sidebar/TopBar/MobileDrawer` kur | **Kurulmayacak.** `components/shell/` zaten var (Sidebar, PageBar, MobileDrawer). Mockup kabuğu "ekran görüntülerinizi izliyor" diyor = mevcut kabuk. Yalnız **oyun alanı** yeniden yapılır. |
| Tiplenmiş fixture ile stub'la, `DraftService/SeasonSim/RoomService` arkasına koy | **Uygulanmaz.** Gerçek mantık ve servisler var: `useLineupDraft`, `useSeasonSim`, `lineupScore`, `draftScore`, `seasonSim`, `SameScreenGame`, `WithAFriendGame`, `OnlineGame` (+ `api/game_ws.py`, `api/football_ws.py`). Yeni bileşenler **mevcut hook/servisleri tüketir**; mantığa dokunulmaz, sadece sunum değişir. Fixture yalnız story/test için. |
| Tek sport teması CSS değişkenleri | `.sport-basketball` / `.sport-football` sarmalayıcısı: `--sport-accent`, `--sport-glow`, `--sport-line`; etiketler (Team/Club, Year/Season) tema nesnesinden. Mevcut global `--accent` ile köprülenir. Hiçbir stil tek spora sabit renk yazmaz. |
| Düz CSS / CSS modules | Düz CSS. Oyun stilleri bugün `game/game.css` (1887 satır) içinde; yeni stiller **yeni dosyalara** (`game/ui/*.css`) yazılır, eski kurallar ilgili ekran taşındıkça **silinir** (çift dil bırakılmaz). |
| `support.js` / `.dc.html` gönderme | Gönderilmez; repo'ya kopyalanmaz. Yalnız referans (scratchpad dışında tutulacaksa `docs/design/` altına PNG olarak). |
| Mockup metni final | Metin değişmez. Frontend metni İngilizce kalır (CLAUDE.md), yorumlar Türkçe. |

Korunan kısıtlar: yeni renk/font/gölge/radius yok; arka plan gradyanı, emoji,
mockup'ta olmayan ikon yok; sort chip'leri **gerçekten sıralar**; `support.js`
gönderilmez; `prefers-reduced-motion` süreleri ~%5'e indirir.

---

## 2. Tasarım dili (mockup'tan, birebir)

- Font: Rajdhani 600/700 (başlık, sayı, buton, etiket; büyük harf + .06–.14em), Outfit 400/500/600 (gövde), `ui-monospace` (11–13px küçük etiket, sayaç, id). Fontlar zaten self-host (`@fontsource`).
- Zemin `#0a0a0c`, kenar çubuğu `#0b0b0d`, tuval `#0c0e10` + 24px ızgara (`rgba(255,255,255,.035)`). Panel `rgba(12,14,16,.92)` + `1px solid rgba(255,255,255,.14)`.
- Metin `#f2f2f4`; ikincil `#a8a8b2/#b5b5be`; soluk `#8a8a94/#6c6c76`.
- Accent: basketbol `#FFB11B`, futbol `#3FB08C`; ilerleme, aktif kenar, birincil buton, parıltı (`0 0 24–30px`, %40). Çok oyunculuda sen = accent, rakip = `#5b9dff`.
- Durum: iyi `#4cd98c`, uyarı `#ffcc33/#ff9f5a`, kötü `#ff7a7a/#ff6b6b`, özel `#c58bff`. Basketbol mevki renkleri PG `#5b9dff`, SG `#4fd6c8`, SF `#9be564`, PF `#FFB11B`, C `#ff6b6b`.
- Masaüstü radius 3–6px; mobilde kart 10–14px, alt sayfa üst köşe 14px. Masaüstü çerçeve 1440×900 (220px kenar çubuğu, 50px üst çubuk); mobil 390×844 (52px üst çubuk, tek kolon, oyuncu havuzu alt sayfada). Mobil dokunma hedefi ≥44px, metin ≥11px.
- İsimler sabit yükseklikli ellipsis kutularında; metin değişince hiçbir şey kaymaz (bu repoda 2026-09'da futbol başlığında düzeltilen hatanın kalıcı kuralı).

---

## 3. Kare envanteri → mevcut kod → durum

Durum: **S** = var, yalnız yeniden stillenir · **Y** = yeni bileşen/akış · **B** = backend/davranış boşluğu doğrulanmalı.

### Tek oyunculu (basketbol 3x · futbol 4x/11x · mobil 12x/13x)
| Kare | Ekran | Mevcut kod | Durum |
|---|---|---|---|
| 3a | Basketbol hub'ı: kural seti, 4 adım izleyici, kadro önizleme, liderlik (futbolda hub yok, 11a'dan başlar) | `LineupGame` idle → `SetupHub` | **Faz 1 bitti** |
| 3b | Adım 1: dönem seç | `LineupGame` → `EraStep` | **Faz 1 bitti** |
| 11a | Futbol girişi: diziliş + lig + liderlik **tek ekranda** (4b'deki ayrı adım kullanılmaz; brief ve `Football.dc.html` 11x'i içe alır) | `FootballGame` setup → `ShapeStep` | **Faz 1 bitti** |
| 3c / 4c | Draft: sezon+takım, jokerler, cap, oyuncu tablosu, saha | `LineupGame`, `FootballGame`, `CourtBoard`, `Pitch`, `PlayerRow`, `JokerBtn`, `InlineSpin` | S + **Y** (sıralama chip'leri futbolda, animasyon) |
| 11b | Slot seç: her slot/yedekte pozisyon maliyeti | `Pitch`, `FootballGame` placing | S |
| 3d / 4d | Koç / menajer | `CoachPicker`, FootballGame manager | S |
| 3e / 4e / 11c | Sonuç: Lineup Fit, Five Pillars, rotasyon, simüle et / squad fit | `ScoreReveal`(LineupGame), `SquadResult`, `DraftAnalysis`, `SquadAnalysis` | S |
| 3f / 4f / 11d | Sezon sonucu + playoff / maç akışı, rol kapsamı | `SeasonSimPanel`, `PlayoffBracketView`, `football/SeasonPanel` | S |
| 3g / 4g | Mod seçimi | `GameModeSelect`, `FootballModeSelect` → `ModeSelect` | **Faz 1 bitti** |
| 3h / 4h | Spin anı, kilitli | `InlineSpin` | **Y** (Draft Flow zaman çizelgesi) |
| 3i / 4i | Çok oyunculu lobi | `RoomLobby` | S |
| 3j / 4j | Versus sonucu | WithAFriend/SameScreen sonuç, `FootballVersus` TieResult | S |
| 3k / 4k | Şampiyon modalı | `ChampionModal` | S |

### Same Screen / With a Friend (7x basketbol · 8x futbol)
7a/8a giriş (era/diziliş+lig) · 7b/8b ve 7c/8c draft (paylaşılan spin, tablo, counter şeridi, iki kadro) · 7d/8d kilitli kadrolar + son düzenleme · 7i/8i koç/menajer (draft sırasıyla) · 7e/8e eşleşme (analiz, pillars, silah/boşluk) · 7f/8f 1. maç/ayak sonrası · 7g/8g seri bitti (0–4 / 3–3 + penaltılar) · 7h/8h sonuç.
Mevcut: `SameScreenGame` (1071 satır), `WithAFriendGame` (1075), `football/SameScreenDraft`, `RoomDraft`, `SeatPanel`, `CounterJokerPrompt`. Durum **S**; futbolda **B** (aşağıya bak).

### Odalar (5x futbol · 6x basketbol)
| Kareler | Ekran | Durum |
|---|---|---|
| 5a/6a, 5v/6u, 5k/6j | Giriş yapılmamış (bulanık lobi + giriş kartı), Online giriş yapılmamış | S |
| 5o/6n, 5p/6o, 5q/6p | Oda kur/katıl, oda kuruldu (kod, boş koltuk), misafir kodu girer | S |
| 5b/6b, 5r/6q, 5s/6r | Rakip katıldı, misafir bekliyor, host kurulumu seçer | S (basketbol) · **B** (futbol, bölüm 4.1 hata) |
| 5c, 5d | Futbol: ikisi de draft'ta + ilerleme noktaları, benim XI kilitli | **B** |
| 5t/6s | Counter: BAN, Force Club/Team, Force Season/Year (15 sn otomatik pas) | S/**B** (15 sn sayaç doğrulanmalı) |
| 5u/6t | Diğer oyuncu işe alıyor, bekle | S/**B** |
| 5e, 5h | Futbol iki ayak zaman çizelgesi + uzatma + penaltı takipçisi | **Y** |
| 5f/6e, 5i/6h | Rövanş: ikisi de dokunmalı | S/**Y** |
| 5j/6i | Oda durumları: bulunamadı, dolu, rakip ayrıldı, bağlantı koptu, yükleniyor, kod kopyalandı | **Y** |
| 5w/6v, 5x/6w | Online giriş / The Board (ilk 25, skorla arama, seçili önizleme) | S (`OnlineGame` BoardPanel) |
| 5l/6k, 5m/6l, 5n/6m | Online Live: aranıyor, maç bulundu (kabul penceresi), geri sayım | S (`QueuePanel`) |
| 5y/6x | Kurallar modalı (masaüstü) / alt sayfa (mobil) | S (`RulesSheet`, `ModeAboutModal`) |

### Mobil (12x basketbol · 13x futbol · 14x/15x çok oyunculu)
Kurulum, dönem, draft (saha önce, havuz alt sayfa, puanlar gizli), pozisyon seç, slot seç, koç, sezon+rotasyon, sezon sonucu, çekmece, kurallar sayfası, boş liderlik, hata. Çok oyunculu mobil: 14a–14w / 15r–15l.

### Hareket
`Draft Flow.dc.html`: 11 adımlı tek zaman çizelgesi (Idle→Spin→Lock→Dock→Pick→Fly→Placed→Joker→Re-lock→Re-dock→Discover→Revealed). Masaüstü ve mobil aynı durum makinesi. **Y**.

---

## 4. Doğrulanması gereken boşluklar (kod yazmadan önce)

1. **Futbol With a Friend / Online odası — mevcut bir hata var.** `pages/football/FootballVersus.jsx` `RoomPanel`, ikinci oyuncu gelince `RoomDraft`'a geçiyor, ama koşul `bothIn = Boolean(room.p2_name || room.p2_ready)`. `api/main.py` `join_h2h_room` yalnız `p2_user_id` yazıyor, **`p2_name` yazmıyor**, `p2_ready` de ancak kadro gönderilince doğru oluyor. Sonuç: iki hesapla oda kurulup katılınca iki taraf da "Open seat / Waiting to join" lobisinde takılıyor (2026-10-02'de iki gerçek oturumla yeniden üretildi). `RoomDraft` ve `api/football_ws.py` var, yani akış büyük ölçüde yazılmış; bağlayan koşul/alan eksik. 5b–5f, 5s, 5t, 5u kareleri bu akışın doğru çalışmasını ister. **Karar: bu işte düzeltilmez.**

   Ek bulgular (futbol çok oyunculu, 2026-10-04 kod incelemesi):
   - `p2_name` veritabanında tanımlı ama hiçbir yerde yazılmıyor (`api/main.py` create yalnız `p1_name`'i, `body.name`'den yazar; join ve `football_ws._make_room` yazmaz). `bothIn` bu yüzden yalnız `p2_ready` ile açılabilir, o da ancak kadro gönderilince — ki kadro gönderme `RoomDraft` içinde olur. Yani `RoomDraft`'a **arayüzden hiç ulaşılamıyor**.
   - Futbol **Online** modunun arayüzünde eşleştirme (matchmaking) yok: `api/football_ws.py` içinde `/ws/football/matchmaking` ve kuyruk kodu hazır, ama `api.js`'te bunu çağıran bir şey ve ona bağlı bir ekran yok. `/football/game/online` aslında With a Friend ile aynı REST `RoomPanel`'i gösteriyor, yalnız `mode: "online"` etiketiyle; "açık oda bul" yok, rakibin kodunu bilmen gerekiyor. Mockup'taki Online Live (5k–5n: arama, maç bulundu, geri sayım) ve Board (5w–5x) futbolda **hiç yok**.
   - Host, oda kodunu paylaşıp beklerken lobi ekranında 4 sn'lik REST yoklaması yapıyor; yoklama yanıtında da `p2_name` boş döndüğü için host ikinci oyuncuyu hiç görmüyor.
   - Misafir "Leave room" der ve `room` state'ini sıfırlarsa sunucu satırı `building` kalır; tekrar katılması (`join`: "zaten içeride" dalı) çalışır ama host için oda ölü kalır. Süpürme (`sweep_stale_football_rooms`) yalnız bayat satırları `abandoned` yapar.
   - WS tarafı sağlam görünüyor (sunucu otoriter, durum DB'ye yazılıyor, `_reject` ile temiz hata kodları: `room_not_found`, `waiting`, `invalid_token`, `banned`); sorun bağlantıyı kuran istemci koşulunda.
2. **Counter 15 sn otomatik pas** (5t/6s): `CounterJokerPrompt` ve `api/game_ws.py` içinde sayaç/otomatik pas var mı bakılacak.
3. **`src/arcade/`** (uygulama içi oyun yüzeyi, `arc-*` sınıfları, `DraftScreens/SeasonScreens` — THREEPEAT, Rewrite History, rotasyon): mockup ile büyük örtüşme olabilir; bileşenleri yeniden yazmadan önce **yeniden kullanım** değerlendirilecek (`docs/GAMES_IN_APP_PLAN.md`).
4. **Sıralama chip'leri**: basketbolda `sortKey` var (varsayılan PTS); mockup "Default, Minutes, PTS/REB/AST/3P% (futbol: Goals/Assists/Prog.)" ister. Futbolda yok → yeni.
5. **Mockup'taki yeni metinler** (ör. "Sign in to play …", "Missed the playoffs", oda durumu metinleri) mevcut metinlerden farklı olabilir; mockup kazanır, ama "metni sormadan değiştirme" kuralı için kullanıcıya liste çıkarılır.
6. **Mevcut testler**: `frontend/tests/games-*.test.mjs` (draft/season engine/infra/arcade-contract), `stage*-*.test.mjs`. Mantık değişmediği için geçmeli; sunum testleri (sınıf adı/metin eşleştirenler) güncellenir.

---

## 5. Fazlar (brief §8 → bu repo)

Her faz: (a) ilgili karelerin yalnız o faza ait olanları 1440×900 ve 390×844'te render edilip yan yana karşılaştırılır, (b) kaçırılan sapmalar listelenir, (c) frontend testleri + `npm run build` + `scripts/check-build.mjs`, (d) faz başına commit, **push yok**.

**Faz 0 — Temel.** Sport teması (CSS değişken seti + tema nesnesi), yeni ortak parçaların iskeleti (`PlayerRow`, `SortChips`, `JokerBar`, `DrawStrip`, `ReelOverlay`, `Board`, `BenchRow`, `PillarBars`, `SeatCard`, `CodeBoxes`, `CounterCard`, `StateCard`), `game/ui/` klasörü, test ve görsel karşılaştırma yöntemi. Mevcut `game.css` kurallarının envanteri (hangi ekran neyi kullanıyor).

**Faz 1 — Giriş ekranları.** Mod seçimi (3g/4g), hub'lar (3a/4a), tek oyunculu kurulum (3b, 4b/11a). Football'da diziliş ve ligler giriş ekranında buton.

**Faz 2 — Draft ekranı (en kritik).** 3c/4c/11b + Draft Flow animasyonu: durum makinesi `idle→spinning→locked→docked→picking→placed` (+ joker olayları `spinning`'e döner), `ReelOverlay` (~38 öğelik şerit, son öğe gerçek sonuç), kilit damgası, dock, satır stagger, uçan token, joker durumları (READY/PLAYED/USED), Discover `??`→sayı, çalışan sıralama chip'leri, `aria-live`, Space = Spin, `prefers-reduced-motion`. Önce basketbol, sonra aynı bileşenlerle futbol.

**Faz 3 — Koç/menajer, sonuç, sezon.** 3d/4d, 3e/4e/11c, 3f/4f/11d, şampiyon modalı 3k/4k, Lineup Fit/pillars, rotasyon (240 dk), Quick Sim / Rewrite History, "Take the place of", sezon sonucu durumları ve **Run it back**.

**Faz 4 — Same Screen / With a Friend ortak kareleri.** 7x ve 8x: giriş, draft (paylaşılan spin, counter şeridi), kilitli kadrolar, koç/menajer sırası, eşleşme, seri/ayak, sonuç; futbol iki ayak zaman çizelgesi + penaltı takipçisi (5e/5h).

**Faz 5 — Odalar.** Giriş yapılmamış, oluştur/katıl, kod kutuları, lobi durumları, counter (BAN/Force), bekleme, rövanş, oda durumları (5j/6i). Futbol canlı oda boşluğu (bölüm 4.1) bu fazdan **önce** karara bağlanır.

**Faz 6 — Online.** The Board ve Live (aranıyor, maç bulundu + kabul penceresi, geri sayım).

**Faz 7 — Kaplamalar ve cila.** Kurallar modalı/alt sayfa, çekmece, boş/hata durumları, reduced-motion ve erişilebilirlik geçişi (odak halkası accent renginde, 4.5:1 kontrast, 44px hedefler), mobil 390 ve ara kırılımlar (≈1100'de kenar çubuğu daralır, <900'de saha ve havuz alt alta, <700'de alt sayfa havuzu).

Duyarlı çapalar: 1440 ve 390; aradaki kırılımlar brief'teki gibi.

---

## 6. Çalışma yöntemi ve araçlar

- Mockup'lar `.dc.html` (özel `x-dc` şablon dili, `support.js` çalışma zamanı) olduğu için doğrudan tarayıcıda render edilir; kare başına kimlik rozeti (3c, 7e, 14i…) bileşen/story/test adlarında kullanılır.
- Tüm kareleri tek seferde PNG'ye çıkarmak çok yavaş (sayfa ~53 000px). Bunun yerine **her faz başında yalnız o fazın kareleri** yakalanır (`id` ile kırpma).
- Yakalama araçları ve geçici dosyalar scratchpad'de kalır; repoya girmez. Başsız Edge profil klasörleri iş bitince silinir (diski dolduran sorun 2026-10'da yaşandı).
- Faz başı karar noktaları: bölüm 4'teki boşluklar ve metin farkları kullanıcıya sorulur.

## 7. Kararlar (2026-10-04, kullanıcı)

1. Futbol oda hatası (bölüm 4.1) **bu işte düzeltilmez**; yalnız belgelenir. Tasarım, hatanın düzelmiş olduğu varsayımıyla yapılır; ilgili kareler (5b–5f, 5s–5u) kod tarafında çalışır hâle gelene kadar yalnız görsel olarak doğrulanır.
2. `src/arcade/` yüzeyi **kapsama dahil** (yeni tasarımın hedefi).
3. Eski `game.css` kuralları ekran taşındıkça **silinir** (çift dil yok).
4. Faz sırası brief'tekiyle aynı: tek oyunculu → Same Screen/Friend → odalar → Online → cila.

---

## 8. Faz 1 sonrası: bilinen sapmalar ve kararlar (2026-10-04)

Uygulandı: mod seçimi (3g/4g), basketbol hub (3a), dönem adımı (3b), futbol girişi (11a); mobil 12a/12b/13a. Eski `ModeGrid`, `ProcessSteps` ve ölü `game.css` kuralları silindi.

**Mockup'tan bilinçli sapmalar (kullanıcı kararı bekliyor):**
1. **Futbolda "Budget 100% cap" kural seti yok.** `4a` hub'ındaki Classic/Budget anahtarı 11a'da ve futbol kodunda yok (futbolun kural seti tek). Uygulanmadı.
2. **Futbolda hub ekranı yok.** 4a/4b yerine brief'in dediği gibi 11a (tek giriş ekranı) kullanıldı.
3. **Dönem bilgi pop-up'ı kaldırıldı.** Eski dönem kartındaki ⓘ düğmesi (arketip ağırlık tablosu) mockup'ta yok. Aynı bilgi Glossary'de duruyor.
4. **Adım açıklamaları (eski `ProcessSteps` pop-up'ı) kaldırıldı.** Uzun adım metinleri mod kartındaki Rules pop-up'ında zaten var.
5. **Futbol liderlik tablosunda diziliş filtresi korundu** (mockup'ta tablo üstünde çiplerle gösteriliyor; 11a'da da var) — eksik değil, not.
6. **Futbol Online'da kural pop-up'ı / eşleştirme** hâlâ yok (bölüm 4.1), Faz 6'da ele alınır.

**Teknik not:** `GET /api/football/game/teams` yerelde ~12 sn sürüyor (974 çift hesaplanıyor); havuz sayısı ve lig filtresi bu süreden sonra güncelleniyor. Bu değişiklikten bağımsız, mevcut davranış.

## 9. Faz 2 (basketbol) durumu (2026-10-05)

Bitti: basketbol draft ekranı (`game/ui/BasketballDraft.jsx`, `DraftScreen`, `PoolPanel`, `BoardPanel`, `useDrawFlow`, `useFly`), motorda `autoSpin:false`/`await_spin`/`spinSeq`. Mobil 12c/12e düzeni (tahta üstte, havuz alt sayfada).

**Kullanıcı kararları (mockup'ta olmayan ama korunan özellikler):**
1. Ödül rozetleri (MVP, yüzük, 6M, V, DD…) **havuz satırında yeni bir sütun** olarak eklendi (mockup diline göre 11px mono rozet, tooltip'te açıklama).
2. G/F/C mevki filtresi **yeni bir "POS" chip satırı** olarak eklendi (SORT satırının altında).
3. Arketip renkleri sitenin kanonik paletinden (`constants/archetypeColors.js`).
4. Mobilde yedek slotu için havuz sayfasında "Or send to the bench" B1–B4 butonları.

Kalan: futbol draft (11b, Draft Flow futbol, mobil 13b/13c), Same Screen/Friend draft'ı Faz 4'te.

**Faz 2 (futbol) — bitti (2026-10-05):** `game/ui/FootballDraft.jsx`; masaüstünde yatay saha, mobilde (≤700px) dikey saha. Havuz satırlarında per-90 / clean-sheet satırı, seçilen oyuncu kartı (11b) ve slot maliyetleri (natural / −5 / −11 / −20).
Sapmalar: sıralama chip'lerinde **"Prog." yok** (oyun roster uç noktası ilerleme verisi döndürmüyor; yalnız Default/Minutes/Goals/Assists). Futbolda ödül rozeti ve mevki filtresi yok (veri/özellik yok). Arketip rozet rengi eski faz renginden (GK/DEF/MID/FWD) geliyor.
Kalan (Faz 3): menajer seçimi, sonuç, sezon; eski `FootballGame` draft JSX'inin silinmesi.

## 10. Faz 3 durumu (2026-10-05)

**Bitti:** koç/menajer seçimi (`CoachPicker`, 3d/4d, basketbol + futbol aynı bileşen), basketbol sonuç sayfası (`ResultStage` + `PillarBars`, 3e: Lineup Fit, Five Pillars, rotasyon editörü, Quick Sim / Rewrite History sekmeleri, kaydet · paylaş · simüle et), futbol sonucu (`SquadResult` 11c + Role Coverage / Season Simulation / Leaderboard 11d), şampiyon penceresi (`ChampionModal` yeni kart dili), `SeasonSimPanel` → `SeasonSimView` + kendi motorunu kuran sarmalayıcı (eski kullanım aynı). Eski `FootballGame` render'ı ve ölü koç/sonuç CSS'i silindi. Futbolda seçilebilecek kimse kalmayınca **Spin yeniden açılıyor** (önceden joker kalmadıysa oyun kilitleniyordu).

**Bilinen sapmalar / kalanlar (kullanıcı kararı bekliyor):**
1. Sezon sonucu (3f: puan durumu + playoff ağacı yan yana, "Play the playoffs") ve futbol sezon sonucu için **düzen mockup'a çevrilmedi**; içerik `.sb-skin` kapsamıyla yeni renk/tipografiye bağlandı, yerleşim eski.
2. Mobil kareler 12f/12g/12h ve 13e–13g **ekran görüntüsüyle doğrulanmadı** (masaüstü doğrulandı).
3. Şampiyon penceresi mockup'taki "4–2 · You are the champions" (kendi serin) değil, Rewrite History'deki gerçek takım şampiyonluğunu gösteriyor; kullanıcının kendi şampiyonluğu için ayrı pencere yok.
4. Menajer kartında mockup'taki "Titles: N" yerine tercih edilen diziliş ve eşleşme ✓ gösteriliyor (menajer verisinde şampiyonluk sayısı yok).
5. Basketbol sonuç sayfasında "Draft analysis" (oyuncu başına era kaybı rozetleri) sezon başladıktan sonra altta duruyor; mockup'ta yok.

**Geliştirme ortamı notu:** Yerel API bir ara 30–140 sn yanıt verdi; sebep, önceki test betiklerimden kalan ~270 başsız Edge süreciydi (temizlendi, araç artık süreç ağacını kapatıyor). API'nin kendisinde bir hata yok.

**Sezon sonucu (3f) — tamamlandı (2026-10-05):** `ui/SeasonResult.jsx` + `ui/season.css`; Rewrite History için rekor kahramanı, doğrulanmış sıralama (konferans sekmeli), playoff ağacı yan yana turlar (`PlayoffBracketView.jsx`), şampiyon penceresi. Masaüstü 1440×900'de doğrulandı. Açık kalanlar: Quick Sim'de sıralama/ağaç yok (veri yok); mobil (12h) doğrulanmadı; futbol sezon sonrası görünümü yalnızca skin'li.

---

## 11. Faz 4 durumu — Same Screen (2026-10-05)

**Yapıldı (basketbol 7a–7i ve futbol 8a–8d, 8g/8h karşılığı):** `game/ui/VersusUi.jsx` (saf sunum: başlık/sıra kartı, taraf kolonları, havuz tablosu, karşı-joker şeridi, slot seçimi, kilitli sahne, koç sırası, eşleşme, seri, final) + `versus.css` + iki bağdaştırıcı: `VersusBasketball.jsx`, `VersusFootball.jsx`. `SameScreenGame.jsx` ~1070 → ~430 satır (yalnız mantık + `shell()`), `SameScreenDraft.jsx` ve `FootballVersus.jsx` `SameScreen` yeni bileşenlere bağlandı. Oyun kuralları değişmedi (snake, karşı-joker, ban, best-of-7, çift maçlı eleme).

**Mockup'tan bilinçli sapmalar (mantığa dokunmama kararı):**
1. **Karşı-joker şeridi** 7b/8b'de "Re-spin Team / Year / Both" yazıyor; oyundaki gerçek karşı-jokerler BAN / Force Team / Force Year (Room Flows 6s ile uyumlu). Şerit gerçek jokerleri gösteriyor, mockup'taki cümle ("…before you pick.") aynen duruyor.
2. **Futbol Same Screen artık tam set (2026-10-05, kullanıcı isteği):** 18'lik kadro (11 + 7 yedek, skor yalnız ilk 11'den), kendi 5 jokeri + karşı-jokerler (BAN / Force Club / Force Year), menajer sırası (8i), eşleşme (8e: kalite, pozisyon uyumu, menajer bonusu, sunucudan rol kapsamı), ayak ayak oynama (8f/8g, penaltı takipçisi ve tekrar oynansa olasılığı altta) ve final. Mantık `draft.js` (18 slot, Pick 2, `swap`), `SameScreenDraft.jsx` (jokerler) ve `versusFit.js` içinde. Dürüst etiketler: kadro puanı eleme motorunun kullandığı kalitedir; oyuncu bazlı gol/asist, skor motordan çıkan golün sezon /90 verisine göre dağıtılmasıdır (basketboldaki box score gibi simüle), şut/kilit pas/müdahale yok. İlk uygulama yalnızca 11 seçimdi ve bu bir eksikti; kullanıcı düzeltti.
3. **Futbol draft joker şeridi:** var (mockup 8b ile aynı beş joker).
4. **Basketbol sıralama:** mockup'taki PTS/REB/AST/3P%/STL/BLK çipleri var, eski "TAGGED" sıralaması ve ödül rozeti sütunu yok; G/F/C filtresi korundu.
5. **Futbol havuz sütunları** MIN, G/90, A/90, CS, APP (veride KP/PASS%/TKL/INT alanları yok).
6. 7d/8d mockup'ında saha boş çiziliyor; gerçek oyuncular sahada görünüyor ve dokunarak yer değiştirilebiliyor (son düzenleme).
7. Futbolda "SHARE" ve final ekranı yeni; basketbolda da aynı SHARE düğmesi (Web Share API, yoksa panoya kopyala).

**Henüz yok / sonraki fazlara kalan:** `WithAFriendGame.jsx` (aynı bileşenlere bağlanacak, Faz 5), mobil 14x/15x doğrulaması, kullanılmayan eski stiller (`g-vs-*`, `g-seat-*`, `g-fb-ss-*`, FullCourtBoard/SeatPanel/RosterReview kullanımı bitince silinecek; With a Friend hâlâ kullanıyor).

---

## 12. Faz 5 durumu — odalar (2026-10-05)

**Yapıldı:** `game/ui/RoomUi.jsx` + `room.css` (giriş kapısı 6a/5a, kur/katıl 6n/5o, kodu paylaş 6o/5p, kurulum 6q/6r, durum kartları 6i/5j, bağlantı bannerları). `WithAFriendGame.jsx` ~1075 → ~500 satır: oda akışı RoomUi'den, oyun ekranları Same Screen ile paylaşılan `Basketball Versus*` bileşenlerinden; sunucu mesajları (`pick_era`, `use_counter_joker`, `advance_series`, …) aynen duruyor. İki gerçek hesapla baştan sona oynandı (oda → dönem → draft → kilitli kadro → koç → eşleşme → seri → final). Futbol odasında giriş + kod paylaşımı RoomUi'ye taşındı.

**Yapılmadı / karar bekleyen:**
1. **Rövanş (6e/5f, 5i/6h)** "ikisi de dokunmalı": sunucuda rövanş mesajı yok (`api/game_ws.py`); final ekranı "Back to modes" veriyor. Eklemek backend işi.
2. **Futbol oda draftı (`RoomDraft`, 5b–5d, 5t, 5u)** ve oda eşleşmesi: bölüm 4.1'deki hata yüzünden (`p2_name` yazılmıyor) arayüzden hiç ulaşılamıyor; doğrulayamayacağım bir ekranı kör restyle etmedim. Hata düzeltilirse yapılır.
3. Odada kullanıcı adları büyük harfle çıkıyor (taraf başlığı stili); adın kendisi değişmiyor.
4. `RoomLobby.jsx` hâlâ `OnlineGame` tarafından kullanılıyor (Faz 6'da kalkacak); eski `g-lobby-*` stilleri o zamana kadar duruyor.

---

## 13. Faz 6 durumu — Online (2026-10-05)

**Yapıldı (basketbol):** `game/ui/OnlineUi.jsx` + `online.css`. The Board (6w): ilk 25 tablo, skorla tam eşleşme araması (`/api/game/board/at-score`), seçili kadro önizlemesi ve "Challenge this roster". Live (6j–6l): başlangıç, arama halkası (geçen süre + gerçek kuyruk sayısı), eşleşme bulundu. `OnlineGame.jsx` 573 → ~230 satır; ağ ve WebSocket mantığı değişmedi. Giriş yapılmamışken Board gezilebiliyor, Live giriş kapısı gösteriyor.

**Mockup'tan sapmalar:**
1. **"Their lineup is frozen. You see it after the draft locks" cümlesi yok:** sunucu challenge modunda rakip kadroyu baştan açık veriyor, oyuncu zaten görüyor. Yanlış bir söz vermemek için mockup'taki metin yerine gerçeği anlatan cümle ("beat the number, not the person") ve kadro listesi var.
2. **Kabul penceresi, DECLINE, gecikme (ms), "their record 24W–11L", ortalama bekleme ve skill band yok:** sunucu bu verileri üretmiyor, eşleşince oda hemen açılıyor. Gösterilenler: kuyruk sayısı, süre, rakip adı, oynadığı maç sayısı, en iyi skoru. Geri sayım ekranı (6m) çizilmedi (iki tarafın hazır senkronu sunucuda yok). Hepsi `docs/BACKEND_PROMPT_GAME_UI.md` madde 4'te.
3. **Futbol Online** (5k–5x): arayüz yok; Board ve eşleştirme uçları futbol tarafında hazır değil/bağlı değil. Futbol Online şimdilik With a Friend odasıyla aynı giriş ekranını gösteriyor.

**Temizlik:** artık kullanılmayan `FullCourtBoard`, `RoomLobby`, `CounterJokerPrompt`, `JokerBtn`, `BenchCoverage`, `GameBox`, `LineupSlot` silindi; `game.css`'ten kullanılmayan `g-lobby*`, `g-vs*`, `g-seat*`, `g-fc-*`, `g-fb-ss*`, `g-modebtn*`, `g-idle-*`, `g-wordmark` ve taslak başlık kuralları temizlendi (85 KB → 70 KB).
