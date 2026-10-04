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
| 3a / 4a | Başlangıç hub'ı: mod, 4 adım izleyici, kadro önizleme, liderlik | `LineupGame` idle, `FootballGame` idle, `LeaderboardPanel` | S |
| 3b | Adım 1: dönem seç | `LineupGame` era adımı | S |
| 4b / 11a | Adım 1: diziliş + lig butonları (giriş ekranında, ayrı adım değil) | `FootballGame` setup | S |
| 3c / 4c | Draft: sezon+takım, jokerler, cap, oyuncu tablosu, saha | `LineupGame`, `FootballGame`, `CourtBoard`, `Pitch`, `PlayerRow`, `JokerBtn`, `InlineSpin` | S + **Y** (sıralama chip'leri futbolda, animasyon) |
| 11b | Slot seç: her slot/yedekte pozisyon maliyeti | `Pitch`, `FootballGame` placing | S |
| 3d / 4d | Koç / menajer | `CoachPicker`, FootballGame manager | S |
| 3e / 4e / 11c | Sonuç: Lineup Fit, Five Pillars, rotasyon, simüle et / squad fit | `ScoreReveal`(LineupGame), `SquadResult`, `DraftAnalysis`, `SquadAnalysis` | S |
| 3f / 4f / 11d | Sezon sonucu + playoff / maç akışı, rol kapsamı | `SeasonSimPanel`, `PlayoffBracketView`, `football/SeasonPanel` | S |
| 3g / 4g | Mod seçimi | `GameModeSelect`, `FootballModeSelect` | S |
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

1. **Futbol With a Friend / Online odası — mevcut bir hata var.** `pages/football/FootballVersus.jsx` `RoomPanel`, ikinci oyuncu gelince `RoomDraft`'a geçiyor, ama koşul `bothIn = Boolean(room.p2_name || room.p2_ready)`. `api/main.py` `join_h2h_room` yalnız `p2_user_id` yazıyor, **`p2_name` yazmıyor**, `p2_ready` de ancak kadro gönderilince doğru oluyor. Sonuç: iki hesapla oda kurulup katılınca iki taraf da "Open seat / Waiting to join" lobisinde takılıyor (2026-10-02'de iki gerçek oturumla yeniden üretildi). `RoomDraft` ve `api/football_ws.py` var, yani akış büyük ölçüde yazılmış; bağlayan koşul/alan eksik. 5b–5f, 5s, 5t, 5u kareleri bu akışın doğru çalışmasını ister. Tasarım fazından önce ayrı küçük düzeltme olarak ele alınır (ör. `join`'de `p2_name` yazmak veya `bothIn`'i `status === "building"` ile türetmek) — kullanıcı onayıyla.
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

## 7. İlk sorular (Faz 0'a başlamadan)

1. Futbol With a Friend/Online'daki "ikinci oyuncu katılınca lobide takılma" hatası (bölüm 4.1) tasarım işinden **önce ayrı küçük düzeltme** olarak yapılsın mı?
2. `src/arcade/` yüzeyi yeni tasarımın hedefi mi, yoksa yalnız `/basketball/game` ve `/football/game` sayfaları mı?
3. Mevcut `game.css` kuralları ekran taşındıkça silinsin mi (önerilen), yoksa geçiş boyunca iki stil bir arada mı tutulsun?
4. Faz sırası brief'teki gibi (tek oyunculu → çok oyunculu → online) uygun mu?
