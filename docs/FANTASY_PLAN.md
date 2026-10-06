# Basketbol Fantezi — Plan ve Durum

**Başlangıç:** 2026-09-28 · **Sezon açılışı:** 2026-10-20 · **Draftların yoğunlaştığı dönem:** ~10-19 Ekim
**Amaç:** Yahoo formatlarında oynayanlara Yahoo'nun kendisinden daha derin analiz: formata göre doğru
değerlenmiş sıralamalar, draft sırasına göre optimize kadro planları, sezon simülasyonu.

## Onaylanmış kararlar (2026-09-28, kullanıcı)

1. **Format önceliği:** H2H 9-Cat → H2H Points → High Score. Motor ortak, sıra yalnızca teslim sırası.
2. **ADP:** Önce kendi ADP modelimiz (kendi sıralamamız + belirsizlik). Yahoo API ayrı iş kolu,
   aşağıdaki kontrol listesiyle paralel yürür.
3. **Kayıt:** Mock draftlar ve kadrolar giriş yapmış kullanıcının hesabına kaydedilir.
4. **İş bölümü:** Bu iş kolunda Claude yalnızca **backend + API** yazar. Frontend'i kullanıcı
   Claude Design ile tasarlatır; frontend dosyalarına bu iş kolundan dokunulmaz. Backend,
   Claude Design'a verilen sayfa listesindeki veri alanlarını birebir karşılayan endpoint'ler üretir.

## Formatlar (config/fantasy_formats.py — tek kural kaynağı)

| Format | Kural | Değeri ne belirliyor |
|---|---|---|
| H2H 9-Cat | FG%, FT%, 3PM, PTS, REB, AST, STL, BLK, TO | Kategori dengesi, punt |
| H2H Points | PTS 1 · REB 1.2 · AST 1.5 · STL 3 · BLK 3 · TO −1 | Maç başı puan × maç |
| High Score | PTS 1 · REB 1 · AST 2 · STL 3 · BLK 3, TO yok; 6 starter, kadro haftalık; starter'ın haftadaki en iyi tek maçı sayılır | Tavan |

Ortak varsayılanlar: kadro PG, SG, G, SF, PF, F, C, C, Util, Util + 3 yedek + 3 IL · 12 takım (public 10)
· snake · playoff 20-22. hafta, 6 takım · günlük kadro.

**Teyit bekleyen varsayımlar** (ilk canlı Yahoo liginde ekrandan kontrol edilecek):
- High Score slot isimleri (Guard ×2, Frontcourt ×3, Util) — ikincil kaynaktan (NBA.com).
- All-Star haftasının sonraki haftayla birleşmesi (`calendar.py merge_all_star`).
- 1. haftanın açılış gününden ilk Pazar'a kadar kısa hafta olması.

## Fazlar

### Faz 0 — Veri temeli ✅ (2026-09-28)
Giriş noktası: `python -m src.fantasy.build` (`--refresh-rosters` kadroları yeniler).

| Çıktı | İçerik |
|---|---|
| `data/{2022-23…2025-26}__player_gamelogs.parquet` | Oyuncu × maç, ~26k satır/sezon, DD2/TD3 bayrakları |
| `data/2026-27__rosters.parquet` | 625 aktif oyuncu, güncel takım (takaslar dahil), 2026 çaylakları |
| `data/2026-27__fantasy_weeks.parquet` | 24 hafta (All-Star birleşik), playoff haftaları işaretli |
| `data/2026-27__fantasy_team_weeks.parquet` | Takım × hafta: maç, back-to-back, hafif gün maçı, tarihsiz Cup maçı beklentisi |
| `data/2026-27__fantasy_positions.parquet` | PG/SG/SF/PF/C uygunluğu (405 profil, 208 yalnız NBA kodu, 12 bilinmiyor) |

Notlar:
- Fikstür RankIt sync'in ürettiği `data/2026-27__rankit_schedule.parquet`'ten okunur (salt okuma).
  NBA Cup gruplarından sonra (Aralık başı) güncellenince takvim yeniden üretilmeli.
- İlk içgörü: fantezi playoff haftalarında (20-22) CLE 9 maç, DAL/MEM/PHX 12 maç oynuyor.
- Bu dosyalar `.gitignore`'daki `data/*` kuralı yüzünden deploy'a girmiyor. Faz 1'de API'nin okuyacağı
  türetilmiş dosyalar allowlist'e eklenecek (ham maç logları değil).

### Faz 1 — Projeksiyon ve sıralamalar ✅ backend (2026-09-29)

**Durum:** Backend ve API bitti. Arayüz Claude Design'dan gelecek. Açık kalanlar aşağıdaki "Faz 1 — kalanlar" listesinde.

Backtest (`data/fantasy_backtest.json`, `python -m src.fantasy.backtest`):

| Hedef sezon | Rol | Maç başı Yahoo puanı MAE | Geçen sezon ortalaması tabanı | Fark |
|---|---|---|---|---|
| 2024-25 | ayar | 3.86 | 4.21 | −8% |
| 2025-26 | **test (hiç dokunulmadı)** | **4.57** | 5.02 | **−9%** |

Model 2025-26'da tabanı PTS, REB, AST, STL, BLK, TOV, FG%, FT% ve dakikada yeniyor, 3PM'de berabere.
Oynanacak maç özünde tahmin edilemiyor (korelasyon 0.40). O yüzden maç, geçmişe göre ayrılmış
p10-p90 aralığıyla gösteriliyor: maçlarının %80'inden fazlasında oynayanlarda ×0.54-1.14,
%60'ın altında kalanlarda ×0.23-2.0.

Seçilen ayar: sezon ağırlıkları 7/2/1, çekme ölçeği 0.5. Yaş eğrisi 2013-14'ten beri delta yöntemiyle.
Gençlerin dakika artışı, 36 dakikaya kalan boşlukla sınırlandı.

Uç noktalar (`api/fantasy.py`): `GET /formats`, `GET /meta`, `GET /rankings` (format, teams, punt,
basis, position, team, search, flag, archetype, limit, offset), `POST /rankings` (özel lig),
`GET /players/{id}`, `GET /schedule`, `GET /backtest`. Hepsi `/api/fantasy` altında.

Kendi ADP modelimiz (`valuation.market_adp`): formata duyarlı "piyasa" sırası. Geçen sezonun maç
başı üretimi o formatın ölçüsüyle; oynanacak maç riskini görmez, bizim sıralamamız değildir.
`adp_diff` bu yüzden anlamlı.

**Faz 1 — kalanlar:**
- Çaylak projeksiyonu şimdilik draft sırası kovası. Comparables motoruyla zenginleştirme açık.
- Takas edilen oyuncular için elle dakika/rol düzeltme tablosu henüz yok (`config/`'e dosya ya da admin tablosu).
- Arketip → fantezi kategori açıklama metinleri frontend'le birlikte yazılacak.

Orijinal Faz 1 kapsamı:
- Projeksiyon: son 3 sezonun dakika başı üretimi 5/3/2 ağırlıklı, örneklem küçükse ortalamaya çekme,
  yaş eğrisi; dakika ve oynanacak maç projeksiyonu (sakatlık geçmişi).
- Çaylaklar: `src/prospect.py` + `src/comparables.py` üzerinden benzer oyuncuların çaylak sezonları.
- Admin'den düzenlenebilir dakika/rol düzeltme tablosu (takas edilen oyuncular için şart).
- Backtest: 2025-26'yı 2022-23…2024-25'ten tahmin et, hatayı yayınla.
- Sıralamalar: 9-cat z-score ve G-score (Rosenof) yan yana + punt seçimleri · Points: puan × maç,
  yedek seviyesi üstü değer · High Score: gerçek haftalık maç sayılarıyla haftanın en iyi maçının
  beklenen değeri.
- Arketip katmanı: kategori profilini arketiple açıkla; takım/rol değiştirenleri işaretle.
- API: `/api/fantasy/...` (arayüz Claude Design'dan gelecek, `/basketball/fantasy` altında).

### Faz 2 — Draft Lab ✅ backend (2026-09-29)

**Durum:** Backend ve API bitti; arayüz Claude Design'dan gelecek. Motor: `src/fantasy/draft.py`.
Uç noktalar: `api/fantasy_draft.py`, `/api/fantasy` router'ına dahil.

| Uç nokta | Ne yapar |
|---|---|
| `GET/POST /draft/plans` | Draft sırasına göre 3 plan: tur tur hedefler ve payları, beklenen sıra, p10-p90, ilk yarı olasılığı, standart hata, "en iyiyle berabere" işareti |
| `POST /draft/recommend` | Canlı asistan: alınanlar ve seninkiler verilir; öneri, bir sonraki pickine kalma olasılığı, kategori profili, punt önerisi, slot dolumu döner |
| `POST /mock/advance` | Durumsuz mock draft: botlar sıra sana gelene kadar seçer, aynı tohum aynı draftı verir |
| `POST /draft/grade` | Biten draftın notu, lig tablosu, çalıntı ve erken seçimler |
| `/drafts` (CRUD) | Kayıtlı draftlar: giriş gerekli, yalnız sahibine görünür, kullanıcı başı 100, durum en fazla 64 KB, hesap silinince gider |

Nasıl çalışıyor:
- **9-cat önerisi dinamik.** Takımın ortalama rakibe karşı her kategoride kazanma olasılığındaki artışa bakıyor
  (Φ, G-score biriminde). Umutsuz kategorinin getirisi düştüğü için punt'u kendiliğinden öğreniyor.
- **Rakipler karışık.** Yarısı piyasa (ADP + gürültü), yarısı bizim değerimizle (keskin) draft ediyor.
  Hepsi ADP'yle oynasaydı kullanıcı her planda 1. çıkıyordu.
- **Sezon belirsizlikle oynatılıyor.** Her simülasyonda oyuncuların üretimi ve maç sayısı, backtest'te ölçülen
  hata dağılımından yeniden çekiliyor (lognormal).
- **Planlar önceden hesaplı.** Yahoo'nun 3 varsayılan formatı × 10/12 takım × her draft sırası, plan başına 60 simülasyon
  (`data/2026-27__fantasy_plans.json`, build ~2.5 dk). Özel ligler istek anında 15 simülasyonla hesaplanıp önbelleğe alınıyor.

Bulgu: 12 takım, 7. sırada ilk üç plan istatistiksel olarak berabere. Arayüz planları
"yakın, tercihe göre seç" diye sunmalı, tek bir "doğru plan" gibi değil.

Orijinal Faz 2 kapsamı:
- Draft sırasına göre plan: snake pick numaraları, rakipler ADP + gürültüyle, pick başına
  "oyuncu sende kalır mı" olasılığı, beam search ile 3 alternatif kadro planı.
- Botlara karşı mock draft; canlı draft asistanı (seçilenleri işaretle, H-score mantığıyla yeniden hesap).
- Mock draft ve kadrolar kullanıcı hesabına kaydedilir (yeni tablo, `api/db.py`).

### Frontend entegrasyonu ✅ (2026-09-29)

Kaynak: Claude Design "Primary Arch Fantasy (standalone)" mockup'ı. `frontend/src/pages/fantasy/`, `/basketball/fantasy/*`.

- **Entegre edilen sayfalar:** 1 Home · 2 League settings · 3 Rankings · 4 Player · 5 Draft plan · 6-7 Mock draft + sonuç ·
  8 Assistant · 10 Schedule · 13 Saved · 14 Methodology.
- **Bekleyen sayfalar:** 11 This week ve 12 Trade (Faz 4), 15 Yahoo (Faz 5). (9 Simulator Faz 3'te eklendi.) Arkalarındaki backend
  gelince eklenecek; mockup'ın kendi notu da sezon içi sayfaların açılış gecesinden sonra menüye girmesi.
- **Tasarımdan bilinçli sapmalar:**
  - Metodoloji metni gerçek yönteme göre yeniden yazıldı. Mockup'taki örnek metin 5:3:2 ağırlık, derinlik şeması ve
    public mock'lardan ADP diyordu; hiçbiri doğru değildi.
  - Backtest kutuları canlı rakam gösteriyor: korelasyon 0.85, bant kapsaması %77 (örneklem içi, hedef %80),
    ilk 50'nin 45'i ilk 75'te.
  - Çaylak profilinde comparables yok (motor bağlı değil). Yerine draft sırası tabanı açıkça yazılıyor.
  - "Game-by-game" histogramı gerçek maç logu değil: projeksiyonun maç dağılımı (son iki sezonun şekli) olarak etiketlendi.
  - Mock'ta kuyruk (queue), paylaşım linki ve "Simulate season" yok; silme 6 sn geri alınabilir, "30 gün" iddiası yok.
- **Tasarım kararı 06:** fantezi kendi token'larında (`--fz-*`, `fantasy.css`), kabuk site token'larında. Birleştirmek
  için yalnız `--fz-*` değerlerini değiştirmek yeter.
- **Backend eklemeleri:** 9-cat/points değer aralıkları, `metric=g|z` ile bütün havuzda yeniden sıralama, özel lig için
  `POST /players/{id}`, plan hedeflerinde `available`, notta `rank_dist`/`playoff_prob`/`category_rank`.

### Faz 2.5 — Model iyileştirmeleri (draft sezonundan önce, Faz 3'ten ÖNCE)

Ayrıntı: `docs/FANTASY_MODEL_IMPROVEMENTS.md`. Karar (2026-09-29): draft kararlarını etkileyen iyileştirmeler
(strateji backtest'i, takım dakika bütçesi, aralık kalibrasyonu, ortak rastgele çekilişler) Faz 3'ten önce;
sezon simülasyonuna ait olanlar Faz 3'ün içinde; geri kalanlar sezon içinde ve Faz 5 ile.

### Faz 3 — Sezon simülatörü ✅ (2026-09-29/30)
Draft edilen ligi gerçek fikstürle haftalık Monte Carlo ile oynatma: sakatlık riski → playoff olasılığı,
beklenen sıralama, hafta × kategori kazanma olasılıkları, en zayıf haftalar, hafta başına maç.
Backend `src/fantasy/season_sim.py` + `POST /api/fantasy/season/simulate`, arayüz tasarım 9 (`FantasySimulator.jsx`).
Ayrıntı ve doğrulama: `docs/FANTASY_MODEL_IMPROVEMENTS.md` ("Faz 3").
- **Plandan sapmalar (bilerek):**
  - Web Worker yerine **sunucuda numpy**: doğrulanmış modelin tek kopyası korunur, JS'e port modeli ikiye böler.
    100 simülasyon ≈ 0.6 sn; istek başına en çok 500, eşzamanlı en çok 2.
  - Günlük kadro optimizasyonu yok; haftalık çözünürlük (günlük sınır backtest'te nadiren devreye giriyor, günlük fikstür yayında yok).
  - Arayüzde sezon sayıları 500 / 1,000 / 2,000 (mockup 1,000 / 10,000 / 50,000): 10,000 sezon sunucuda ~1 dk sürerdi.
    İstemci 250'lik partiler gönderip sims-ağırlıklı birleştirir: ilerleme çubuğu canlı, İptal kısmi sonucu korur.
  - Metin "Runs on your device" yerine "Runs on our servers".

### Faz 3 sonrası kullanıcı geri bildirimi — mock ve plan iyileştirmeleri (2026-09-30)
Kullanıcı isteklerinden (hepsi bitti):
- **Tüm planlar:** draft planı artık denenen HER planı en iyiden en kötüye sıralı gösterir (kategori formatında 6, puan / High Score'da 3);
  istediğin plan seçilip "Mock this plan" ile mock'a taşınır. Önceden yalnız en iyi 3 dönüyordu ve düğme planı mock'a HİÇ taşımıyordu
  (mock her zaman dengeli öneri veriyordu): `plan` anahtarı artık `/mock/advance` ve `/draft/recommend`'de öneriyi gerçekten belirler
  (kategori: punt; puan: değer / düşük risk / tavan skoru). Mock başlığındaki açılır menüden plan sürerken değiştirilebilir.
- **Botların pickleri tek tek açılır:** kimin ne seçtiği görülür (Slow / Normal / Fast / Instant, Skip; hız tarayıcıda hatırlanır).
  Bu yalnız istemci animasyonu; sunucu isteği aynı.
- **Best available 19 oyuncu** (önceden 7): sütun başlıkları "Value" ve "Left at N"; yüzde = oyuncunun SIRADAKİ pickinde hâlâ duruyor olma
  olasılığı (rakipler ortalama drafter gibi seçerse). Açıklama listenin altında.
- **Aynı ekranda 2–4 kişilik mock ("Play with friends"):** kurulumda isim, sıra ve plan seçilir; draft her insanın pickinde durur ve o kişinin
  planına göre öneri verir, kadro sekmeleri, sonuç ekranında herkesin notu ve kadrosu. Sunucu: `/mock/advance` `humans` + `plans`;
  `/draft/grade` lig satırlarında harf notu.
- Not: hız sınırlayıcı IP başına dakikada 120 istek; bu akışlar pick başına 1 istek yapar.

### Faz 4 — Sezon içi araçlar (sürekli) — kısmen bitti (2026-09-30)
Bitenler (ikisi de sezondan önce de kullanılabilir; kadro kaynağı mock / asistan / kayıtlı draft, Yahoo bağlanınca gerçek lig):
- **Takas analizi (tasarım 12)** — `src/fantasy/trade.py`, `POST /league/rosters`, `POST /trade/analyze`, `FantasyTrade.jsx`.
  Takas öncesi / sonrası kadrolar AYNI sezonlardan geçer (oyuncu bazlı ortak rastgele sayılar); karar haftalık maç kazanma
  oranı farkına bağlı (300 simülasyonda tohumdan tohuma sapma 0.002–0.005; playoff olasılığında 0.02 — bu yüzden karar ona bağlanmadı).
  Eşitsiz takaslarda kadro otomatik tamamlanır / kırpılır ve ekranda yazılır. Aratılan herhangi bir oyuncu "almak" tarafına eklenebilir.
- **Bu hafta (tasarım 11)** — `src/fantasy/week.py`, `POST /week/analyze`, `FantasyWeek.jsx`. Rakibe karşı kategori başına kazanma olasılığı
  (sallantıdaki en çekişmeli 3 kategori), puan formatı için beklenen puan; High Score için haftalık tavana göre pozisyon kısıtlı en iyi kadro
  (açgözlü + eşleştirme = optimal) ve Start / Bench; serbest oyuncular (ligde hiçbir kadroda olmayan) o hafta maç sayısı ve sallantıdaki
  kategorilere göre sıralı ("4+ games only"). Ekleme yok: Yahoo yalnız okuma izni veriyor.
- Bilinen kısıt: High Score'da haftalık eşleşme doğru puanlanıyor (her starter'ın en iyi tek maçı) ama sezon simülatörü ve takas analizi
  hâlâ her maçı sayıyor; format zaten "test edilmedi" uyarısı taşıyor ve uyarı metni bunu söylüyor.
- **Sezon içi projeksiyon güncelleme** — `src/fantasy/inseason.py`: sezon öncesi projeksiyon "ön bilgi", oynanan maçlar kanıt (Bayes).
  Üç bileşen ayrı hızla öğrenir: dakika başı üretim (400 dk ön bilgi), maç başı dakika (4 maç ön bilgi + son 10 maç), oynama oranı (20 maç).
  Parametreler backtest ile seçildi (2024-25 + 2025-26, takım başına 15 / 30 / 45 / 60 maçta kesme, 8 vaka): kalan sezonda oyuncu başına Yahoo
  puanı hatası 4.97 → 3.61, dakika 4.61 → 3.25, kalan maç 9.5 → 8.2; her vakada iyileşme, eğriler iç noktada minimum. Sakatlık haberi yok.
  Takas edilen oyuncunun `TEAM` alanı güncellenir (haftalık maç sayısı buradan).
- **Sunucuda otomatik güncelleme** — `api/fantasy_live.py`, RankIt canlı skor mekanizmasıyla aynı düzen (uygulama açılırken arka plan iş parçacığı,
  `rankit_sync_state` tablosunda `fantasy_inseason` claim satırı; saatte bir). Açılış gecesinden bir gün öncesine kadar hiçbir şey çağırmaz. Her tur
  `src/fantasy/update.py::run_update`: maç loglarını çeker (nba_api, tek çağrı), HER ZAMAN sezon öncesi anlık görüntüden (`..._projections_pre.parquet`)
  başlayıp projeksiyonu yeniler (idempotent), dosyayı atomik yazar; API mtime'a bakıp kendiliğinden yeniden yükler, `INSEASON_AS_OF` "data through"
  olarak görünür. Railway diski geçici: her deploy'da image'daki sezon öncesi dosyadan başlanır, ilk turda yeniden hesaplanır. stats.nba.com sunucuyu
  engellerse yayındaki dosyaya dokunulmaz (sezon öncesi projeksiyon kalır), sonraki saatte yeniden denenir. Kapatma: `FANTASY_LIVE_UPDATES=0`
  (ya da `RANKIT_BACKGROUND_JOBS=0`). Karar (2026-09-30): yerel zamanlanmış görev yerine sunucu worker'ı — bilgisayara bağımlılık yok.
- **Elle / yedek** — `python -m src.fantasy.update [--no-fetch] [--push]`. `--push`, çalışma dizinine dokunmadan `origin/main` üzerinde geçici bir
  git worktree'de yalnız güncellenen dosyayı commit'leyip gönderir (sunucu engellenirse yerelden yayınlamak için); yerel commit'ler yayına gitmez.
- **Kalan sezon görünümü** — simülatör, takas analizi ve hafta analizi sezon içinde (`/meta.rest_of_season_from_week` dolu) varsayılan olarak
  yalnız oynanmamış haftaları oynatır (`scope=rest`; "Full season" ile eski davranış). `season_sim.SeasonSim.view(from_week)`: geçmiş haftalar atlanır,
  oyuncunun kalan maçı `PROJ_GP − INSEASON_GP`, sakatlık blokları yalnız kalan takım maçlarına yayılır. İki ayar (sezon içi backtest'e dayalı sezgisel):
  üretim şansı çarpanı √(kalan pay) kadar daralır (gözlenen maçlar belirsizliği azaltır: hata 4.97→3.61 ≈ 0.73 ≈ √0.5) ve piyasaya büzme (`draft.SHRINK`)
  kalan payla gevşer (sezon sonunda 1.0). Kısmen oynanmış hafta simülatörden çıkar (o hafta "This week" ekranında); hafta analizi seçilen haftadan
  başlayan görünümü kullanır. Mevcut H2H galibiyetleri isteğe bağlı girilir (`records`, ya tüm takımlar ya hiçbiri), sıralamaya eklenir; girilmezse
  herkes eşit başlar ve playoff / şampiyonluk olasılıkları "buradan sonrası" görünümüdür, bugünkü tablo değil. Sezon öncesinde tam sezon
  (`from_week=None`) yolu değişmedi. Doğrulama: birim testleri + sezon içi taklidiyle tarayıcı; gerçek sezon verisiyle kalibrasyon sezon başlayınca yapılabilir.
- **High Score simülatörü / takas** — `SeasonSim._hs_scores`: haftalık takım skoru = her starter'ın o hafta oynadığı maçların en iyisi (k maç → Q_HIGH_SCORE'un
  k-maç maksimum kantili × üretim çarpanı). Kadro her hafta beklenen tavana göre kurulur (`_hs_priority`: pozisyon eşleştirmeli açgözlü, `week.best_lineup`
  ile aynı); hiç oynamayan starter'ın yerine öncelik sırasındaki ilk uygun yedek girer (yedek girişinde pozisyon kısıtı gevşek). Tutarlılık: simüle haftalık skor,
  analitik tavan toplamıyla (`week.hs_ceiling`) %2 içinde. Takas analizi aynı simülatörü kullandığı için otomatik High Score'a uygun. Draft önerilerinin
  kendisi hâlâ gerçek sezonlarda test edilmedi (uyarı sürüyor).
- Kısıt: sakatlık haberi yok.

### Faz 6 — Takım simülasyonu: sezon simülatörünün motoru + "Simülasyon" projeksiyonu (plan, 2026-10-05; aşama 0 ✅, 1 ✅, 2 ✅ — istatistiksel eşitlik)

**Amaç.** (1) Sezon simülatörünün oyuncu üretim motorunu `team_sim.py`'deki oyun düzeyindeki NBA takım simülasyonuyla değiştirmek; (2) istatistik projeksiyonunda eski model ağırlığının YANINDA simülasyon projeksiyonunu (ve harmanı) göstermek.
**Neden.** Şu anki `SeasonSim` her oyuncuya "maç başı ortalama × oynadığı maç + haftalık gürültü" verir ve aynı NBA takımındaki oyuncuları birbirinden bağımsız sayar. Yeni motor önce NBA'yi oynatır (sakatlık, oyun içi dakika dağıtımı, sahadaki takım arkadaşlarına göre kullanım): bir yıldız oynamayınca yedeğin payı yükselir; aynı takımdan iki oyuncusu olan fantezi takımı birlikte inip çıkar.
**Ölçümler (plana yön veren):** model ↔ simülasyon FP korelasyonu 0.99; rotasyondaki 449 oyuncunun 73'ünde fark ≥2 puan, 29'unda ≥3 (yani "farklı perspektif" çoğu oyuncuda ince, bazılarında net — arayüz farkı öne çıkarmalı). 30 takım × 100 senaryo birkaç saniye; pahalı olan takım bağlamı parametrelerini öğrenmek (~30 sn, build'de bir kez).
**Altyapı.** Railway Hobby: servis başına 48 GB RAM'e kadar (kullanıma göre faturalanır, $5 aylık kredi), kopya başına 8 GB, 5 GB disk → 100 MB'lık sonuç dizisi sorun değil; diske değil sunucu açılışında bellekte üretilir.

**Mimari.**
1. *Dünya (NBA simülasyonu), `src/fantasy/world.py`:* 30 takım × K=128 senaryo × 82 oyun. Oyun düzeyi gürültü eklenir (şimdi yok; High Score'un "haftanın en iyi maçı" ve haftalık dalgalanma için şart). Saklanan: oyuncu × hafta × senaryo için istatistik toplamları (FGM, FGA, FTM, FTA, 3PM, PTS, REB, AST, STL, BLK, TOV), oynanan maç ve haftanın en iyi tek maç puanı (High Score ve Yahoo puan ağırlıklarıyla). ≈100 MB (float32).
2. *Kendi kendine yeten girdi:* simülasyon girdileri (hız, dakika, kullanım eğilimi a_p, eski bağlam yükü L_eski, taşınma bayrağı) projeksiyon dosyasına `SI_*` sütunları olarak yazılır; sunucu maç logları olmadan dünyayı kurabilir.
3. *Fantezi simülatörü:* hafta / playoff / H2H mantığı kalır; `_season_draws` + `_weekly_games` + haftalık gürültü yerine dünyadan okuma. Eski motor yedek ve `engine=legacy` ile seçilebilir.
4. *Takas / Bu hafta / High Score:* aynı dünya (takas fantezi kadrosunu değiştirir, NBA sonuçlarını değil → ortak rastgele sayılar kendiliğinden korunur).
5. *Arayüz:* üstte genel "Projeksiyon: Model | Simülasyon | Harman" (harman = 0.25 simülasyon + 0.75 model: önceki testte tek yolun en iyisinden daha düşük hata); Rankings, oyuncu sayfası, mock tahtası, taslak planı, takas buna uyar. Oyuncu sayfasında yan yana; Rankings'te "model ile simülasyonun ayrıştığı oyuncular" (|ΔFP| ≥ 2).

**Aşamalar ve kapılar.**
| | İş | Kapı |
|---|---|---|
| 0 | Kendi kendine yeten girdi (`SI_*`), oyun düzeyi gürültü, haftalık toplamlar + en iyi maç, bellek / süre testi | `World` kurulur; tutarlılık testleri (haftalık toplamların mevcut `SIM_*` ortalamasıyla uyumu, takım arkadaşı korelasyonu), süre ve bellek bütçesi |
| 1 | Dünya ↔ `SeasonSim` adaptörü; bağlam kapalıyken (θ = 0, yeniden dağıtım yok) eski motorla aynı dağılım | sıra / playoff dağılımı eski motorla gürültü içinde aynı |
| 2 ✅ | **Karar kapısı:** geçmiş sezon backtest'i, eski motorla yan yana (`strategy_backtest --sim-calibration`): playoff Brier (eski 0.2125), sıra korelasyonu, kalibrasyon eğimi (eski 1.15), High Score haftalık dağılımı | eşit ya da daha iyi; değilse yeni motor varsayılan OLMAZ |
| 3 | Takas, Bu hafta, High Score yeni motora | ortak rastgele sayılarla öncesi/sonrası farkı kararlı (mevcut testler) |
| 4 | Genel projeksiyon seçici + yan yana görünüm + ayrışanlar listesi + Harman | tarayıcıda uçtan uca |
| 5 | Sezon içi: güncelleme sonrası kalan haftalar için dünyayı yeniden koş; Yahoo sakatlık verisi girdi olunca onu da | Yahoo API onayına bağlı |
**Aşama 0 sonucu (2026-10-05):** `team_sim.team_game_lambdas` (simülasyonun çekirdeği, sonuçları değiştirmeden ayrıldı: tüm eski `SIM_*` sayıları birebir aynı), `team_sim.sim_inputs` / `run_from_inputs` (girdiler projeksiyon dosyasına 27 adet `SI_*` sütunu olarak yazılır; maç logu olmadan aynı `SIM_FP` çıkar — test), `src/fantasy/world.py`.
Oyun gürültüsü: negatif binom + binom isabetler, PTS = 2FGM + 3PM + FTM kimliği (projeksiyonda da birebir). Ölçümler (K=128, tüm NBA): **12 sn, 94 MB** (dosyaya yazılmaz, sunucu açılışında bellekte); sezon ortalamaları `SIM_*` ile oran 1.000 ± 0.002, korelasyon 0.999; aynı takımdaki oyuncular haftalık sayıda hafif NEGATİF ilişkili (Maxey–Brown −0.13: dakika ve şut payı paylaşılıyor), farklı takımlar ≈ 0 — eski motorun bağımsızlık varsayımının yapamadığı. Testler: `tests/test_fantasy_world.py`.
Açık (aşama 2'de kalibre edilecek): oyun gürültüsünün aşırı yayılım katsayıları maç loglarından; oyun içi dakika dağılımı gürültüsü ile çift sayım olasılığı; haftalık varyansın gerçek sezonlarla karşılaştırılması.
**Aşama 1 sonucu (2026-10-06):** `SeasonSim(world=...)`: oyuncu üretimi dünyadan okunur (`_world_values`); hafta / playoff / H2H kuyruğu aynı kod. Her fantezi simülasyonu `seed`'den bir NBA senaryosuna bağlanır (takımlardan bağımsız) → takas öncesi/sonrası ortak rastgele sayılar, aynı NBA takımındaki oyuncular birlikte hareket eder.
High Score: starter'ın haftanın en iyi tek maçı (dünyadan), kadro tavana göre kurulur, oynamayanın yerine yedek. API: `get_world()` arka planda (sunucu açılışında) K=128 kurar, hazır olana kadar / `FANTASY_WORLD=0` / sezon içinde / SI_* yoksa / özel High Score ağırlığında eski motor; yanıtta `engine: world|legacy`. Hafta analizi (`week_values`) ve sezon içi "kalan sezon" görünümü hâlâ eski motor (aşama 3 ve 5).
**Parite (aynı kadro, aynı girdi; eski motorda piyasa çekmesi KAPALI — world'de çekme yok):** takım gücü (all-play) korelasyonu 9-cat 0.956, puan 0.951, High Score 0.920; ortalama |Δ all-play| 0.033–0.043; ortalama |Δ playoff olasılığı| 0.077–0.083. Hız aynı (400 sezon < 1 sn).
**Aşama 2 için bulgu:** eski motor piyasaya çekmeyle (`draft.SHRINK`: 9-cat 0.5, puan / High Score 0.25) çalışıyor; çekme AÇIKKEN takım güçlerinin yayılımı dünyanın yarısı kadar (all-play sd 0.060 vs 0.106; puan 0.046 vs 0.104) ve yüksek skor formatında korelasyon 0.28'e düşüyor. Hangi yayılımın doğru olduğunu strateji backtest'inin kalibrasyonu (aşama 2) söyleyecek; dünyaya da aynı çekme eklemek gerekebilir.
**Aşama 2 sonucu — karar kapısı (2026-10-06, `python -m src.fantasy.world_backtest`, `tests/test_fantasy_world_backtest.py`):** aynı draftlar (12 slot × 4 tohum × 2 sezon: 2024-25, 2025-26; ours / static / market stratejileri dönüşümlü), aynı gerçek puanlama; her ligdeki 12 takım için n = 1152 / format. Hız kalibrasyonu leave-one-season-out; dünya hedef sezonun gerçek kadrosuyla.
| 9-cat (pooled) | Brier | playoff eğimi | yayılım eğimi | sıra korelasyonu | haftalık MSE |
|---|---|---|---|---|---|
| eski motor (çekme açık) | 0.2240 | 1.06 | 1.00 | 0.357 | 0.0820 |
| eski, çekme kapalı | 0.2288 | 0.66 | 0.71 | 0.356 | 0.0823 |
| dünya, çekme kapalı | 0.2293 | 0.72 | 0.74 | 0.344 | 0.0824 |
| **dünya + çekme (varsayılan)** | 0.2291 | 1.00 | 1.00 | 0.341 | 0.0823 |
| puan (pooled) | Brier | playoff eğimi | yayılım eğimi | sıra korelasyonu | haftalık MSE |
| eski motor | 0.2471 | 0.60 | 0.71 | 0.166 | 0.0917 |
| dünya, çekme kapalı | 0.2424 | 0.64 | 0.52 | 0.182 | 0.0925 |
| **dünya + çekme (varsayılan)** | 0.2421 | 0.77 | 0.61 | 0.160 | 0.0921 |
*Yayılım eğimi* = gerçek all-play kazanma oranının tahmine regresyonu (1 = takımlar arası fark doğru, < 1 = motor takımları olduğundan farklı gösteriyor). Bulgu: dünya, piyasaya çekme OLMADAN takım farklarını ~%35 fazla gösteriyor (9-cat eğimi 0.74); eski motorun κ'sını (9-cat 0.5, puan / High Score 0.25) dünyaya da uygulayınca 9-cat eğimi tam 1.00. Dünyada çekme artık varsayılan (`SeasonSim(world_shrink=True)`, ortalamayı kaydırır, gürültüyü korur).
**Karar: istatistiksel eşitlik.** Lig-kümeli bootstrap (2000 örnek) %95 aralıkları: 9-cat Brier dünya+çekme − eski = +0.0051 [−0.0005, +0.0107]; puan −0.0050 [−0.0122, +0.0018]; çekmesiz karşılaştırmada 9-cat +0.0006 [−0.0050, +0.0058]. Haftalık MSE farkları +0.0002 / +0.0004 (ölçeğin %0.3–0.4'ü; sezonlar ters yönde). Hiçbir fark sıfırdan ayırt edilemiyor; nokta tahminleri 9-cat'te hafif eski motordan yana, puanda dünyadan yana.
Dünyanın yapısal kazanımı (kalibrasyon kazancı değil): takım arkadaşı yeniden dağılımı ve ortak sakatlıklar, oyun düzeyinde dağılım (High Score), simülasyon projeksiyonuyla tutarlılık. **High Score haftanın en iyi tek maçı** (≥22 dk oyuncular, ~4000 oyuncu-hafta / sezon): ortalama sapma −0.6 puan (%1.5), MAE ≈ 9.5, P10–P90 kapsaması 0.79 / 0.77; beklenen oyun sayısı 2.85 (gerçek 2.96, ≈ %4 az).
**Varsayılan bırakıldı** (dünya açık; `FANTASY_WORLD=0` ile tek komutta eski motor). Puan formatında yayılım eğimi 0.61 (< 1): κ'yı 0.25'ten düşürmek (≈ 0.15) kalibrasyonu iyileştirebilir — ölçülmedi.
**Kararlar (kullanıcı, 2026-10-05):** varsayılan bakış = aşama 2'yi geçerse Simülasyon, geçmezse Model; K = 128; Harman bakışı gösterilir; sunucu belleği yeterli.
**Riskler.** Model ↔ simülasyon farkı küçük olduğundan faydayı abartmamak; oyun düzeyi gürültü dağılımı (FGA/FTA için sabit varyasyon katsayıları) logdan ölçülmeli; haftalık takım maç sayısı kesirli (NBA Cup) → tam sayıya rastgele yuvarlanır; simülasyon girdileri sezon öncesi kadroya ait → sezon içinde aşama 5 olmadan eskir.

### Faz 5 — Yahoo lig bağlantısı (Yahoo onayına bağlı)
OAuth ile lig içe aktarma: ayarlar, kadrolar, draft sonuçları, gerçek ADP (`draft_analysis`),
gerçek pozisyon uygunluğu. Yahoo API yalnızca **okuma** izni veriyor.

### Notlar — ileride (henüz yapılmayacak)
- **Yahoo mock draft kadrosunu içeri aktarma (2026-10-06, kullanıcı fikri):** Yahoo'da mock draft bitince oluşan kadro ("YOUR TEAM 13/13": PG, SG, G, SF, PF, F, C, C, UTIL, UTIL, BN×3; her satırda oyuncu, pozisyon uygunluğu, takım ve sakatlık etiketi Q/O/P)
  Simülatör / Takas / Bu hafta için bir kadro kaynağı olarak girilebilmeli. `useRosterSource` zaten "Latest mock / Assistant / Saved draft" kaynaklarını biliyor; dördüncü kaynak "Yahoo roster": oyuncuları isimle ara-ekle (Assistant'taki arama), ya da Yahoo ekranından metin yapıştır (isim eşleştirme `reference.norm_name`); ekran görüntüsünden OCR sonra düşünülür.
  Yahoo API (Faz 5) gelince bu elle giriş gerçek kadro okumasıyla değişir. Not: kadro slotları Yahoo'nun lig ayarına (Util sayısı, yedek) göre değişir; 13 oyunculu format zaten `_YAHOO_ROSTER`.

## Yahoo API — senin yapman gerekenler

Yahoo 2026 itibarıyla API erişimini **başvuru + onay** ile veriyor; inceleme süresi yazmıyor. Onay
gecikebileceği için başvuruyu şimdiden yapmak mantıklı — Faz 1-2 kendi ADP modelimizle ilerlerken
paralel yürür.

1. **Başvuru** — https://sports.yahoo.com/developer/access/
   - Beklenen kullanıcı: büyük ihtimalle "Small (<1,000)" ya da "Medium (1,000–100,000)".
   - Yahoo eksik başvuruları cevapsız kapatıyor. Notlar kısmına üçünü açıkça yaz:
     **ürün** (primaryarch.net'in basketbol fantezi analiz aracı), **gereken veri** (kullanıcının
     kendi liginin ayarları, kadroları, draft sonuçları, oyuncu ADP'si), **kullanıcı kitlesi**
     (kendi Yahoo ligini bağlayan site kullanıcıları; yalnızca okuma).
   - Client ID alanı: Yahoo Developer'da hesabın yoksa boş bırakılabilir.
2. **Yahoo Developer uygulaması** (onaydan sonra Yahoo'nun yönlendirmesine göre) — OAuth 2.0:
   - Redirect URI: `https://primaryarch.net/api/fantasy/yahoo/callback` (HTTPS zorunlu).
   - İzin: Fantasy Sports — **Read**.
3. **Sırlar** — Client ID / Client Secret'ı Railway ortam değişkenlerine koy
   (`YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`). Repo'ya, sohbete ya da ekran görüntüsüne koyma.
   Ayrıca saklanacak Yahoo token'larını şifrelemek için bir `TOKEN_ENCRYPTION_KEY` eklenecek
   (değerini ben üretmeyeceğim; komutunu vereceğim, sen Railway'e gireceksin).
4. **`JWT_SECRET`** — kod tarafı kapandı (2026-09-29'da görüldü): `api/auth.py` production'da
   `JWT_SECRET` yoksa ya da bilinen varsayılan anahtarsa açılmayı reddediyor. Senin yapman gereken:
   Railway'de `JWT_SECRET`'ın uzun, rastgele bir değerle tanımlı olduğunu teyit etmek (32+ karakter).
5. **Atıf zorunluluğu** — Yahoo verisi gösterilen her yerde "Fantasy data provided by Yahoo Fantasy"
   yazısı, Yahoo Fantasy bağlantısı ve **yalnızca resmi logo** (döndürme, renk değişimi, efekt,
   başka markayla birleştirme yasak). Yahoo verisi olmayan sayfalarda Yahoo'yu marka olarak kullanmıyoruz;
   formatlar "Yahoo varsayılan puanlaması" gibi tarif edici ifadelerle anılır.
6. **Gizlilik politikası** — hangi Yahoo verisinin okunduğu, saklandığı, ne kadar tutulduğu ve
   bağlantının nasıl kesileceği eklenmeli (`/privacy-policy`).
7. **Test ligi** — kendi Yahoo hesabında 2026-27 NBA ligi (tercihen 9-cat, 12 takım) — bağlantıyı
   gerçek veriyle doğrulamak ve yukarıdaki "teyit bekleyen varsayımlar"ı ekrandan kontrol etmek için.

## Kaynaklar
- Yahoo Help SLN6919 — Default league settings
- Yahoo Sports — 2026-27 Category vs Points vs High Score
- NBA.com — How to play Yahoo High Score
- Rosenof — Static (G-score), Dynamic (H-score), Rotisserie makaleleri (arXiv 2307.02188, 2409.09884, 2501.00933)
- Yahoo Sports Developer Portal — erişim başvurusu, atıf kuralları
- Önceki tasarım notu: `docs/fantasy-scoring-backend-report.md` (2026-08-16)
