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

### Faz 1 — Projeksiyon ve sıralamalar (hedef ~7 Ekim)
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

### Faz 2 — Draft Lab (hedef ~14 Ekim)
- Draft sırasına göre plan: snake pick numaraları, rakipler ADP + gürültüyle, pick başına
  "oyuncu sende kalır mı" olasılığı, beam search ile 3 alternatif kadro planı.
- Botlara karşı mock draft; canlı draft asistanı (seçilenleri işaretle, H-score mantığıyla yeniden hesap).
- Mock draft ve kadrolar kullanıcı hesabına kaydedilir (yeni tablo, `api/db.py`).

### Faz 3 — Sezon simülatörü (sezonun ilk 2 haftası)
Draft edilen ligi gerçek fikstürle Monte Carlo oynatma: günlük kadro optimizasyonu, maç loglarından
örnekleme, sakatlık riski → playoff olasılığı, beklenen sıralama, kategori kazanma olasılıkları.
Simülasyon tarayıcıda Web Worker'da (Railway sunucusu tek worker, 512MB).

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
4. **Önce kapanması gereken açık** — `api/auth.py:11`: `JWT_SECRET` tanımlı değilse repo'da yazan
   varsayılan anahtara düşüyor. Üçüncü taraf token'ı saklamadan önce bu fail-fast'e çevrilmeli ve
   Railway'de `JWT_SECRET`'ın tanımlı olduğunu teyit etmelisin.
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
