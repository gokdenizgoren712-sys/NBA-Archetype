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

### Faz 4 — Sezon içi araçlar (sürekli)
Haftalık maç sayısına göre waiver önerileri, High Score haftalık kadro seçici, simülasyonla takas
analizi, günlük veri güncelleme job'u.

### Faz 5 — Yahoo lig bağlantısı (Yahoo onayına bağlı)
OAuth ile lig içe aktarma: ayarlar, kadrolar, draft sonuçları, gerçek ADP (`draft_analysis`),
gerçek pozisyon uygunluğu. Yahoo API yalnızca **okuma** izni veriyor.

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
