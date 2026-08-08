# Primary Arch — Online Sistem Eleştirisi + v2.0 Yol Haritası

**Tarih:** 2026-08-04 · **Durum:** §9'daki açık kararlar 2026-08-09'da netleşti (bkz. o bölümdeki güncellemeler) — Faz 1 "yeni sistem" olarak İPTAL edildi (kullanıcı kararı: Kadro Savaşı zaten Board Challenge), onun yerine Board Challenge'ın kendi eksiği (`challenge_results`) dolduruldu + sitemap blog-post eksikliği düzeltildi. Faz 2-5 hâlâ büyük ölçüde içerik-ops/hukuk işi, mühendislik tarafı bekliyor.
**Kapsam:** (1) "Kadro Kaydetme + Kadro Savaşı" PDF önerisinin gerçek repoya karşı doğrulanması, (2) genel online mimarinin (With a Friend / Online Opponent / Board Challenge) kapsamlı eleştirisi, (3) Faz 1'den Faz 5'e uzanan, frontend/backend/içerik olarak ayrıştırılmış bir uygulama yol haritası.

---

## 0. Özet — en önemli 3 bulgu

1. **PDF'teki kod taslakları gerçek repoyla uyumsuz** — yazan oturumun repoya erişimi yoktu, bunu kendisi de belirtmiş. `get_db()` yok, `get_current_user()` bir int değil JWT payload'ı dönüyor, auth cookie değil Bearer token, `headToHead.js`'in tek bir "seriyi baştan sona oynat" fonksiyonu yok. Kod taslaklarının **hiçbiri olduğu gibi kopyalanamaz** — mimari kararlar (asenkron, client-hesaplar/server-relay-eder, best-of-7 ≠ sezon) doğru, ama uygulama detayları yeniden yazılmalı.
2. **Bu, sitede kurulacak ÜÇÜNCÜ paralel "lider tablosu / kaydedilebilir kadro" sistemi olur** — `/api/leaderboard` (lineup_games, isim-bazlı) ve `/api/game/board` (lineup_games.roster_json, tam-oyuncu-satırlı, bu session'da Faz 4 için eklendi) zaten var. PDF'in `saved_rosters`/`roster_battles`'ı üçüncü bir depo+lider-tablosu daha ekliyor. Reddetmiyoruz (aşağıda gerekçesiyle ayrı tutulmasını öneriyoruz) ama bilinçli yapılmalı, yoksa site "hangi lider tablosu asıl?" karmaşasına düşer.
3. **`challenge_results` tablosu zaten ölü kod** — Faz 4'te şema oluşturuldu ama hiçbir yerde INSERT edilmiyor. Bu belge kapsamında ya doldurulmalı ya da bilinçli olarak "yapılmayacak" diye işaretlenmeli — havada asılı kalmamalı.

---

## 1. "Kadro Kaydetme + Kadro Savaşı" PDF'i — Doğrulama Raporu

PDF'in kendi ifadesiyle: *"gerçek api/db.py/main.py içeriği elde yoktu"*, *"gerçek RosterReview.jsx dosyası elde olmadığı için"*. Yani tüm kod, varsayımlar üzerine yazılmış. Aşağıda her varsayım gerçek repoya karşı test edildi (dosya:satır referanslı).

### 1.1 Doğru olan mimari kararlar (değişmeden kalabilir)

| Karar | Değerlendirme |
|---|---|
| Gerçek zamanlı değil, asenkron | Doğru çağrı — With a Friend'in WebSocket/in-memory `ROOM_STATES` mimarisi zaten "Faz3-M6: Dayanıklılık" olarak açık bir görev (bkz. §2.1), üzerine yeni bir canlı sistem eklemek riski büyütürdü. |
| Sonucu istemci hesaplar, sunucu yapısal doğrulayıp kaydeder | Projenin **zaten var olan** deseni (`game_ws.py`'nin dosya başı docstring'i: "ince sunucu, istemci deterministik hesaplar" — With a Friend, Online Opponent, Board Challenge'ın hepsi bunu yapıyor). Yeni bir risk açmıyor, mevcut güven modelini genişletiyor. |
| Best-of-7 seri, 82 maçlık sezon istatistiği değil | Doğru — `seasonSim.js` (tam sezon) ile `headToHead.js` (seri) zaten ayrı motorlar, PDF ikisini karıştırmamış. |
| v1'de status/pending kolonu yok, anlık sonuçlanır | Makul — ama §3'te bunun ne kadar süreceğine dair bir not var. |

### 1.2 Yanlış / eksik varsayımlar (kod yeniden yazılmalı)

| # | PDF'in varsayımı | Gerçek durum | Kaynak |
|---|---|---|---|
| 1 | `get_db()` bir `sqlite3.Connection` döndürüp `Depends()` ile inject ediliyor | Böyle bir fonksiyon **yok**. Gerçek desen: `get_conn()` (`api/db.py:7-11`) her çağrıda YENİ bir bağlantı açıyor, `with get_conn() as conn:` bloğu içinde kullanılıyor — request-scoped dependency değil. | `api/db.py:7-11`, düzinelerce çağrı yeri `api/main.py`/`api/game_ws.py` |
| 2 | `get_current_user()` düz bir `user_id: int` döndürüyor | Decode edilmiş **JWT payload dict**'i dönüyor (`{"sub": ..., "role": ...}`). Her çağıran `int(user["sub"])` yapmak zorunda. | `api/auth.py:44-50` |
| 3 | Auth cookie-tabanlı session (`credentials: "include"`) | **Bearer token**, `localStorage`'da tutuluyor, her fetch'te `Authorization: Bearer ${token}` header'ı ile gönderiliyor. `credentials:"include"` hiçbir yerde kullanılmıyor. | `frontend/src/contexts/AuthContext.jsx`, `WithAFriendGame.jsx:88,119,141` |
| 4 | `runHeadToHead(rosterA, rosterB)` gibi tek bir "seriyi oynat" fonksiyonu var | `headToHead.js`'in sadece iki export'u var: `buildMatchup(lineups, coaches, simEra)` (bir kere çağrılır) ve `simulateOneGame(matchup, gameIndex, rand)` (maç başına, çağıran taraf `series_wins`'i kendi döngüsünde takip eder). "Tek çağrı, tüm seri" contract'ı **gerçek motorla uyuşmuyor**, adaptör yeniden yazılmalı. | `headToHead.js:22,51`; gerçek kullanım `SameScreenGame.jsx:382-393` |
| 5 | `roster_json`, `lineup_games.lineup_json` ile "aynı şekil" (sadece isim listesi) | **Yanlış — ve bu, Board Challenge'da tam olarak yaşadığımız hatanın aynısı.** Gerçek "savaşılabilir kadro" satırı zengin bir obje: `PLAYER_NAME, primary_arch, overall_score, score_* (12 arketip), _season, _cost, _posPenalty`. Sadece isimle `headToHead.js`/`computeLineupFit` çalışmaz. | `game_ws.py:925-946` (`_init_challenge_state`), `main.py:992-999` (`_backfill_roster_json_once`) |
| 6 | `RosterReview.jsx` diye bir dosya var, `SaveRosterButton` oraya eklenecek | Böyle bir dosya **yok**. Bu rolü oynayan gerçek bileşen `frontend/src/game/DraftAnalysis.jsx` — "post-draft pre-simulation report card", `SameScreenGame.jsx:958`'de koç seçiminden hemen sonra render ediliyor, `lineup` prop'u zaten tam oyuncu objeleri taşıyor (bkz. madde 5). | `game/DraftAnalysis.jsx:8-15` |
| 7 | "4-2" formatındaki seri skoru zaten bir yerlerde standart | Hayır — sunucu `series_wins: {p1: N, p2: N}` dict'i tutuyor (`game_ws.py:292` vd.), string formatlama sadece **tek bir yerde**, ad-hoc bir template literal (`WithAFriendGame.jsx:887`). Paylaşılan bir formatter yok — hem `challenge_results.series_score` hem `roster_battles.series_result` için AYNI fonksiyon yazılmalı, ikisi ayrı ayrı reinvent etmemeli. | `game_ws.py:292`, `WithAFriendGame.jsx:887` |

**Sonuç:** Mimari iskelet (asenkron, client-computes, best-of-7) korunmalı; `rosters.py`, `SaveRosterButton.jsx`, `QuickBattle.jsx`, `Leaderboard.jsx` dosyalarının **hepsi** yukarıdaki 7 düzeltmeyle yeniden yazılmalı — "birebir kopyala" değil, "iskeleti referans al, implementasyonu gerçek API'lere göre yaz".

---

## 2. Genel Online Mimari Eleştirisi (kapsamlı)

### 2.1 With a Friend (Faz 3) — bilinen, hâlâ açık
- **Faz3-M6 (Dayanıklılık) hâlâ pending** (bkz. görev listesi #26) — `room_lost`, kilit, hata toast'ları eksik. Bu session'da stale-room DB kilidini düzelttik (bkz. §2.3) ama bu M6'nın TAMAMI değil, sadece matchmaking'i etkileyen bir alt kümesiydi.
- `ROOM_STATES` hâlâ tamamen bellekte; `_save_state`/`_restore_state` sunucu restart'ına karşı koruyor ama **birden fazla worker/instance'a ölçeklenemez** (dosya başı docstring bunu zaten kabul ediyor — Railway tek container, MVP kapsamı dışında bırakılmış, doğru bir sınırlama ama v2.0'da trafik artarsa yeniden gündeme gelir).

### 2.2 Online Opponent — Matchmaking (Faz 4, bu session)
- **`MM_QUEUE` tamamen bellekte, kalıcılık yok.** Sunucu restart olursa kuyrukta bekleyen herkes sessizce düşer (istemci "Idle"a döner, hata göstermez — kabul edilebilir ama not edilmeli).
- **Rating/ELO yok, saf FIFO.** İlk 2 kişi eşleşiyor, seviye farkı gözetilmiyor — PDF'in kendi "İleride" bölümünde önerdiği ELO fikri hem Board hem Quick Battle hem Live matchmaking için ortak bir ihtiyaç olabilir (bkz. §9).
- **Stale room DB kilidi** — bu session'da bulundu ve düzeltildi (`_user_in_active_game` artık `updated_at` eşiği kullanıyor, ayrıca startup'ta otomatik süpürme var). Artık sorun değil ama neden 3 gün önce böyle bir hata bırakıldığının kök nedeni şuydu: yeni bir alt-sistem (matchmaking) eklenirken, DB durumunun ne zaman "bitti" sayılacağına dair TEK bir yer yoktu. **Bu ders Kadro Savaşı'na da uygulanmalı** — `roster_battles` anlık sonuçlandığı için bu spesifik hataya düşmez, ama ileride "pending/bekleme" modeli eklenirse (PDF §7'de öneriliyor) aynı riske dikkat edilmeli.

### 2.3 Board Challenge (Faz 4, bu session) — gerçek eksikler
- **~~`challenge_results` tablosu ölü kod.~~ Dolduruldu (2026-08-09).** `_init_challenge_state`/`challenge_board()` artık `entry_id`'yi state'e taşıyor; `room_socket`'ın mesaj döngüsü seri `phase="complete"` olunca `_record_challenge_result(state)` çağırıyor — `challenger_id`, `entry_id`, `won`, `series_score` (`_format_series_score` ortak yardımcısıyla, "4-2" formatında) yazılıyor. İdempotent (state flag'i + `_advance_series`'in zaten tamamlanmış seriye yeni maç kabul etmemesi). Gerçek FK'lerle (kullanıcı+lineup_games satırı) uçtan uca smoke test edildi, temizlendi.
- **Eski kayıtların `_cost`/`_posPenalty` alanları tahmini** (backfill'de `0`/`1.0` varsayılıyor, `main.py:998`) — sadece görsel, oyun mantığını bozmuyor ama gerçek veriyle karışmasın diye not düşülmeli.
- **İsim eşleştirme aksan/case-duyarsız TAM eşleşme, substring yok** (`_fold` kullanıyor) — CLAUDE.md'nin "Bilinen Kısıtlar" bölümündeki genel isim-normalizasyonu sorununun bir başka örneği. Kadro Savaşı'nın frontend'i **isim eşleştirmeye hiç girmiyor** (kullanıcı zaten kendi tarayıcısında JSON kaydediyor) — bu açıdan Board Challenge'dan daha sağlam bir tasarım, doğru.

### 2.4 Üç paralel "kadro deposu + lider tablosu" riski — **2026-08-09'da karara bağlandı**

**Karar: Kadro Savaşı (PDF'in `saved_rosters`/`roster_battles`'ı) AYRI bir sistem olarak KURULMAYACAK.** Kullanıcı gerekçesi: "kadro savaşı zaten board challenge, aynı şeyler zaten" — üçüncü bir depo+lider-tablosu eklemek, §0'daki 2. bulgunun tam olarak uyardığı karmaşayı yaratırdı. Bunun yerine mevcut Board Challenge'ın kendi eksiği (`challenge_results`, bkz. §2.3) tamamlandı. Aşağıdaki tablo ve §3'teki uygulama planı artık **yapılmayacak** — tarihsel kayıt olarak bırakılıyor.

Şu an (ya da bu belge sonrası) elimizde şunlar olacaktı:

| Sistem | Kaynak veri | Depo | Lider tablosu | Ne zaman tetiklenir |
|---|---|---|---|---|
| Klasik Leaderboard | Herhangi bir `lineup_games` satırı (classic/salarycap) | `lineup_games.lineup_json` (isim) | `/api/leaderboard` | Tam sezon simülasyonu bitince |
| Board Challenge | Sadece salarycap `lineup_games` | `lineup_games.roster_json` (tam obje) | `/api/game/board` | Tam sezon simülasyonu bitince |
| Kadro Savaşı (PDF) | Herhangi bir mod, herhangi bir an (draft biter bitmez) | `saved_rosters.roster_json` (düzeltilmiş: tam obje) | `roster_battles` üzerinden hesaplanan win_pct | Kullanıcı isteyerek kaydedince |

**Öneri: üçünü BİRLEŞTİRMEYİN, ama bilinçli ayrıştırın.** Board Challenge "ciddi/tamamlanmış bir sezon sonucunu" temsil ediyor, Kadro Savaşı "rastgele denemek istediğim bir kadro"yu — bu ikisi gerçekten farklı kullanıcı niyetleri (tıpkı Single Player'ın tam sezon simülasyonu ile Same Screen/With a Friend'in sadece seri oynatmasının farklı, ama HER İKİSİ de meşru modlar olması gibi). Ama:
- **Roster JSON şekli tek bir yerden üretilmeli** (aynı serialize helper — hem Board hem Quick Battle aynı 9 alanlı obje formatını kullanmalı, iki farklı şema yazılmamalı).
- **Seri-skor formatlayıcı tek fonksiyon olmalı** (§1.2 madde 7).
- **UI'da "Battles" gibi ortak bir üst başlık altında iki sekme** (Board / Quick Battle) düşünülmeli — tamamen ayrı, ilişkisiz sayfalar yerine, kullanıcı "hangi lider tablosu?" diye kaybolmasın.
- **`challenge_results`'ı şimdi doldurun** — aynı "battle kaydı" deseni `roster_battles`'la neredeyse birebir aynı, ikisini aynı pass'te tutarlı yapmak, birini unutup diğerini yapmaktan daha ucuz.

---

## 3. FAZ 1: Kadro Kaydetme + Kadro Savaşı — Düzeltilmiş Uygulama Planı (İPTAL — bkz. §2.4)

**2026-08-09: Bu faz UYGULANMAYACAK.** Kullanıcı kararı: Kadro Savaşı, mevcut Board Challenge'ın yaptığı işin aynısı — ayrı bir `saved_rosters`/`roster_battles` sistemi kurmak gereksiz. Aşağıdaki plan yalnızca "neden bu yola gidilmedi" sorusuna referans olsun diye tarihsel kayıt olarak bırakıldı, uygulanmayacak.

**Bağımlılık:** Backend track önce şemayı + endpoint'leri bitirmeli (frontend onlara fetch atıyor), ama iki track paralel başlayabilir — frontend mock/sabit veriyle UI'yi kurabilir, gerçek entegrasyon backend hazır olunca yapılır.

### 3.A Backend Track
1. `api/db.py`: `migration_saved_rosters_battles.sql`'i gerçek şemaya uygula — `saved_rosters.roster_json` alanının içeriği **PDF'teki gibi isim değil, §1.2 madde 5'teki tam obje şekli** olacak şekilde yorum/doc güncellenmeli (kolon tipi zaten `TEXT`, değişmiyor — sadece içerik sözleşmesi).
2. `challenge_results`'ı da bu pass'te canlandırın (bkz. §2.4) — `roster_battles` INSERT'i yazılırken aynı desen `challenge_results`'a da uygulanabilir (Board Challenge serisi bittiğinde).
3. Ortak yardımcı fonksiyonlar: `_format_series_score(wins_a, wins_b) -> str` (örn. `"4-2"`) ve `_serialize_battle_roster(df_row) -> dict` (Board Challenge'ın backfill'inde zaten var olan mantığı tek yere çıkar, `saved_rosters` kaydederken de kullan).
4. `api/rosters.py` — PDF'in taslağını temel alıp:
   - `get_db` → `get_conn()` + `with` bloğu
   - `get_current_user` → `int(user["sub"])`
   - Auth: zaten `Depends(get_current_user)` FastAPI seviyesinde JWT çözüyor, ekstra bir şey gerekmiyor (frontend Bearer header göndersin yeter)
   - `POST /api/battles/quick`'in yapısal doğrulama mantığı (series_result regex, winner iki taraftan biri, roster_a sahiplik kontrolü) **doğru ve olduğu gibi kalabilir** — sadece DB erişim deseni değişiyor.
5. `main.py`'ye `app.include_router(rosters.router)`.

### 3.B Frontend Track
1. `SaveRosterButton.jsx` — `DraftAnalysis.jsx`'in render edildiği yere (`SameScreenGame.jsx:958` civarı) prop olarak takılacak; `rosterJson` prop'u `DraftAnalysis`'in zaten aldığı `lineup` şeklinden türetilecek (tam obje, isim değil).
2. **Tüm `fetch` çağrılarında `credentials:"include"` → `Authorization: Bearer ${token}`** (üç bileşende de, `useAuth()`'tan `token` çekilerek).
3. `QuickBattle.jsx`'teki `runHeadToHead` placeholder'ı gerçek adaptörle değiştirilecek:
   ```js
   import { buildMatchup, simulateOneGame } from "../game/headToHead";
   function runHeadToHead(rosterAJson, rosterBJson, coachA, coachB, simEra) {
     const a = JSON.parse(rosterAJson), b = JSON.parse(rosterBJson);
     const matchup = buildMatchup({1: a, 2: b}, {1: coachA, 2: coachB}, simEra);
     let winsA = 0, winsB = 0, games = [];
     while (winsA < 4 && winsB < 4) {
       const g = simulateOneGame(matchup, games.length);
       (g.winner === 1 ? winsA++ : winsB++);
       games.push(g);
     }
     return { seriesResult: `${Math.max(winsA,winsB)}-${Math.min(winsA,winsB)}`, winnerSide: winsA>winsB?"a":"b", games };
   }
   ```
   (Koç/era verisi `saved_rosters`da yoksa — PDF'in şemasında `sim_era` var ama koç yok — varsayılan/rastgele koç ataması gerekebilir; **açık karar**, bkz. §10.)
4. `Leaderboard.jsx` — auth gerektirmiyor, sadece fetch URL'i ve stil kontrolü.
5. Route'lar + navbar linki (`/battles`, `/rosters` gibi — isimlendirme §10'da açık karar).

---

## 4. FAZ 2: Yasal Altyapı, Uyum ve Analytics

### 2.1 Yasal Footer Sayfaları
**Backend:** yok — statik sayfalar, mevcut React Router'a route olarak eklenir.
**Frontend:**
- Şu an **hiçbir Footer bileşeni yok** (repo taraması: `<footer>`/`Footer` bileşeni bulunamadı) — sıfırdan kurulacak, App.jsx'in layout'una eklenmeli.
- 4 statik sayfa: Privacy Policy, Terms of Service, About Us (mevcut `About.jsx`'ten farklı — o "biz kimiz/felsefe" sayfası, bu yasal "About Us" olabilir, çakışmasın diye isimlendirme netleşmeli), Contact & Disclaimer, Affiliate Disclosure.
**İçerik-ops:** metinlerin yazımı (GDPR/KVKK/affiliate ifadeleri) — hukuki dil, mühendislik değil.

### 2.2 Analytics
**Backend:** yok.
**Frontend:**
- GA4: `index.html`'e `gtag.js` script + `frontend/src/hooks/useSEO.jsx`'e (zaten var, sayfa başına meta yönetiyor) sayfa-değişimi pageview event'i eklenebilir.
- Google Search Console: kod değişikliği gerekmiyor, sadece `sitemap.xml`'in doğruluğu önemli.
- **~~Bulunan gerçek eksik: blog yazıları sitemap'te yok.~~ Düzeltildi (2026-08-09).** `sitemap_xml()` artık `articles` tablosundan `status='published'` olanları da `/blog/{slug}` olarak ekliyor (`api/main.py`, `blog_urls` bloğu) — throwaway bir published makaleyle uçtan uca doğrulandı (sitemap'te göründü, silinince kayboldu), sonra temizlendi.

---

## 5. FAZ 3: SEO ve İçerik Katmanı

**Büyük bulgu: bu neredeyse tamamen içerik-ops işi, mühendislik değil.** Blog/CMS sistemi **zaten var ve çalışıyor** (`Blog.jsx`, `BlogPost.jsx`, `admin/ArticleList.jsx`, `admin/ArticleEditor.jsx`, `/api/articles` endpoint'leri — CLAUDE.md'de v1.0.0'da "canlı" olarak işaretli). Yeni bir CMS kurmaya gerek yok.

**Backend:** sitemap fix (§4.2'deki blog-post eksikliği) — tek teknik iş.
**Frontend:** yok (yayın akışı zaten admin panelden çalışıyor).
**İçerik-ops:** era meta analizleri, taktik rehberleri, oyun kuralları makalelerinin YAZILMASI — mevcut admin editör üzerinden.

---

## 6. FAZ 4: Monetizasyon (Affiliate & AdSense)

### 4.1 Affiliate Başvuruları
**İş süreci, mühendislik değil** — Sorare NBA / Yahoo Fantasy başvuruları site tarafında hiçbir koda bağlı değil, dış platformlarda yapılıyor.

### 4.2 Oyun İçi Affiliate Widget'ları
**Backend:** yok (statik linkler, opsiyonel tıklama-sayacı istenirse basit bir `/api/affiliate-click` POST eklenebilir — açık karar, §10).
**Frontend:**
- Draft Bitiş Ekranı: `DraftAnalysis.jsx` ya da sezon-sonu özet ekranına bir CTA kartı.
- Mod Seçim Alanı (`GameModeSelect.jsx`): Salary Cap kartına tooltip/banner.
- Blog makale sonu: `BlogPost.jsx`'e CTA bileşeni.

### 4.3 AdSense
**Backend:** yok. **Frontend:** reklam slotu component'leri (sidebar 300x250, footer-üstü leaderboard, blog içi). **İş süreci:** başvuru zamanlaması (yasal sayfalar + içerik + 30-50 günlük ziyaretçi eşiği) — mühendislik değil, bir hazır-olma kontrol listesi.

---

## 7. FAZ 5: Trafik Büyütme ve Lansman

Tamamen **içerik-ops/pazarlama** — Reddit/X/Discord paylaşımları, GA4 üzerinden haftalık performans takibi (Faz 2'nin GA4 kurulumuna bağımlı). Mühendislik işi yok, bu belgeye sadece bağımlılık zinciri için dahil edildi (Faz 2 bitmeden Faz 5'in "performans takibi" adımı anlamsız).

---

## 8. Sıralama ve Bağımlılık Haritası

```
Faz 1 (Kadro Savaşı)         ──┐
  Backend track                │  paralel, birbirinden bağımsız
  Frontend track                │
                                ▼
Faz 2 (Yasal + Analytics)   ──► Faz 3 (SEO İçerik) ──► Faz 5 (Trafik — GA4'e bağımlı)
                                                    ╲
Faz 4 (Monetizasyon)  ◄────────────────────────────┴── (yasal sayfalar + içerik hazır olmadan AdSense başvurusu yapılamaz)
```

- Faz 1 diğerlerinden tamamen bağımsız, hemen başlanabilir.
- Faz 2 → Faz 3 → Faz 5 sıralı (SEO içeriği sitemap'e girmeden, GA4 kurulmadan trafik ölçülemez).
- Faz 4 (AdSense kısmı), Faz 2 (yasal sayfalar) + Faz 3'ün (içerik) tamamlanmasını bekliyor — kendi ifadelerinde de bu net.
- Faz 4'ün affiliate kısmı (4.1, 4.2) Faz 2/3'ten bağımsız, hemen başlanabilir.

---

## 9. Açık Kararlar

**2026-08-09'da netleşenler (1-4):**

1. ~~Board Challenge ile Kadro Savaşı UI'da nasıl ayrışacak?~~ **Ayrışmayacak — Kadro Savaşı ayrı bir sistem olarak kurulmuyor, kullanıcı kararı: "zaten board challenge, aynı şeyler zaten."** Bkz. §2.4.
2. ~~`challenge_results` şimdi doldurulsun mu?~~ **Evet, dolduruldu** (bkz. §2.3) — Kadro Savaşı iptal olunca bu, "yeni sistem"e değil mevcut Board Challenge'a ait kalan tek gerçek eksikti.
3. ~~Kadro Savaşı'nda koç seçimi var mı?~~ **Konu kalktı** — Kadro Savaşı hiç kurulmuyor, sorunun kendisi geçersiz.
4. ~~ELO/rating Faz 1'de mi eklensin?~~ **Ertelendi** — Live matchmaking + Board için TEK ortak bir sistem olarak, ayrı bir iş olarak ele alınacak (henüz zamanlanmadı).

**Hâlâ açık:**

5. **AdSense başvuru eşiği** (30-50 ziyaretçi/gün) — GA4 kurulana kadar bu sayı nereden biliniyor? Faz 2 bitmeden bu karar verilemez, sıralamayı etkiler.
6. **Affiliate tıklama sayacı** gerekli mi, yoksa dış platformların kendi analytics'ine mi güvenilecek?

---

*Bu belge 2026-08-04 tarihinde, gerçek repo'ya karşı doğrulanan bulgularla hazırlanmıştır. Kod uygulanmaya başlanmadan önce §9'daki açık kararların netleşmesi gerekiyor.*
