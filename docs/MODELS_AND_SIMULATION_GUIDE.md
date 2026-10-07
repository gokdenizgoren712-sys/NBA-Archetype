# Primary Arch: modeller, simülasyon ve ödül tahmini rehberi

Bu dosya şimdiye kadar konuştuklarımızı ve modellerin / simülasyonun ne yapması gerektiğini tek tek açıklar. **Her değişiklikte güncellenir** (en altta değişiklik günlüğü var). Teknik ayrıntı ve ölçüm tabloları için ilgili plan dosyalarına bağlantı verilir; burada amaç "ne, neden, nasıl, ne durumda" sorularını cevaplamak.

Son güncelleme: 2026-10-07 (akşam)

---

## 0. Çalışma kuralları (senin kararların)

- **Push yok:** Yerel commit'ler, sen "pushla" diyene kadar gönderilmez.
- **Dürüstlük:** Sonuçlar "eşit" ise "eşit" yazılır. Simülasyon "ikinci görüş"tür, "daha iyi model" değil.
- **Kapsam dışı:** RankIt'in tasarım/işleyişi bu rehberin konusu değil. Yahoo mock-draft kadrosunu 4. kadro kaynağı olarak içe aktarma fikri notlandı, yapılmadı.
- **Doğrulanmamış şey, doğrulanmamış olarak** söylenir (ör. NBA'nin 65 maç şartının MIP'e uygulanıp uygulanmadığı hâlâ kontrol edilmedi).
- Geliştirici veritabanına testler yazmaz (geçici DB).

---

# BÖLÜM A: Fantezi tarafı (projeksiyon ve simülasyon)

Ayrıntı: `docs/FANTASY_PLAN.md`, `docs/FANTASY_MODEL_IMPROVEMENTS.md`. Arayüz için: `docs/FRONTEND_PROMPT_FANTASY_SIMULATION.md`.

## A1. Projeksiyon (Model)

**Ne yapar:** Her oyuncunun 2026-27'deki maç başı istatistiklerini, oynayacağı maç sayısını ve dakikasını tahmin eder.
**Nasıl:** Marcel tarzı: son üç sezon 7:2:1 ağırlıkla, oynanan dakikaya göre sönümlenerek (`K_GP=500`). Yaş eğrisi, çaylaklar için draft sırasına göre referans değerleri.
**Aralıklar:** Gerçek sezonlardaki sapmalardan çıkan ampirik P10–P90 tabloları (üretim oranı ve oynanan maç ayrı).
**G-score / Z-score:** Simülasyondan değil, projeksiyon istatistiklerinden kapalı formülle hesaplanır (Rosenof). G-score haftalık H2H için değişkenliği hesaba katar.

## A2. Yedek oyuncu kredisi (`REPL_CREDIT = 0.75`)

Kaçırılan maç "sıfır" sayılmaz: yerine waiver seviyesinde bir oyuncunun üretimi konur (%75 kredi, `REPL_DEPTH=3`). Sakat kalma riski olan oyuncuların değeri bu yüzden gerçekçi.

## A3. Takım bağlamı katmanı

**Soru:** Yeni takıma giden ya da kalabalık rotasyonda olan oyuncu gerçekten projeksiyon kadar üretir mi?
**Yöntem:** Kullanım esnekliği `rate = a_p · L(-p)^(-θ)` (θ: kullanım ≈ 0.8, ribaund ≈ 0.5, asist ≈ 0.55); dakika oranı ve oran-başına kazanç için ridge regresyonları. 2023-26'da bir sezon dışarıda bırakılarak doğrulandı. Katsayılar: `data/2026-27__fantasy_context_model.json`.
**Sonuç:** Yeni takımlarda yaklaşık %10'luk fazla tahmin düzeltildi.

## A4. Takım simülasyonu (`team_sim.py`)

**Ne yapar:** Her NBA takımını oyun oyun oynatır: sakatlık blokları, oyun içi dakika dağılımı, sahadaki takım arkadaşlarına göre kullanım (bir yıldız oynamazsa yedeğin payı artar), yetenek şoku. 100 senaryo × 82 oyun.
**Çıktı:** Her oyuncu için `SIM_*` sütunları (ortalama, P10, P90).
**Neden:** "LeBron ve Jaylen Brown'ın geldiği takımda Maxey gerçekten bu kadar üretir mi?" sorusu. Takım bağlamını oyun düzeyinde modeller.
**Sonuç (3 sezon, her sezon dışarıda):** Fantezi puanı hatası düştü, yanlılık yüzde birler seviyesine indi, P10–P90 aralığı gerçeği yaklaşık %80 kapsıyor. Modelle korelasyon 0.99: yani "ikinci görüş", çoğu oyuncuda ince fark, bazılarında net (449 rotasyon oyuncusunun 73'ünde fark ≥ 2 puan).

## A5. Dünya motoru (`world.py`) ve sezon simülatörü

**Ne yapar:** Takım simülasyonuna oyun içi gürültü ekler (negatif binom, binom isabetler, PTS = 2·FGM + 3PM + FTM kimliği) ve haftalık toplamlara çevirir. Fantezi sezon simülatörü, takas analizi ve "Bu hafta" artık oyuncu üretimini buradan okur: aynı NBA takımındaki iki oyuncu birlikte inip çıkar, High Score formatındaki "haftanın en iyi maçı" oyun düzeyinden gelir.
**Karar (kapı):** Eski motorla geçmiş sezonlarda yan yana test edildi; sonuç **istatistiksel eşitlik** (güven aralıkları sıfırı içeriyor). Sen yine de yapısal olarak oturtup **sitede varsayılan** yapmayı seçtin.
**Dayanıklılık:** Dünya hazır olana kadar ilk istekler en çok 25 sn bekler; hâlâ hazır değilse eski motor ve yanıtta `engine: legacy`.

## A6. Üç görünüm: Model | Simülasyon | Harman

- **Model:** Yalnızca bu görünümde draft önerileri geçmiş draftlarda test edildi.
- **Simülasyon (varsayılan):** 100 simüle sezonun ortalaması.
- **Harman:** %25 simülasyon + %75 model (aynı testte tek yolun en iyisinden düşük hata).
- **Ayrışanlar:** İkisi arasında maç başı ≥ 2 fantezi puanı fark olan oyuncular listesi, oyuncu sayfasında yan yana tablo.
- Model dışı bir görünümle draft planı/mock/öneri "doğrulanmamış" uyarısı taşır.

## A7. Sezon içi

Saatlik güncelleme (`update.py`): oynanan maçlara göre dakika, üretim ve kalan maç yenilenir. Ardından kalan maçlar için simülasyon yeniden koşulur (`inseason_sim.py`): güncel hızlar, eski takım yükü yok (güncel hızlar yeni rolü zaten içeriyor). Dünya yalnızca tamamen oynanmamış ilk haftadan itibaren oynatılır.
**Backtest (8 vaka):** Fantezi puanı hatası model 3.607 ↔ simülasyon 3.638 (eşit), yanlılık −0.94 → −0.60.
**Bilinen sınır:** Şu an kimin sakat olduğunu bilmiyoruz; Yahoo API gelince sakatlık bloklarına eklenecek (onayına bağlı).

## A8. Açık işler (fantezi)

- Puan/High Score formatında piyasa çekme katsayısı (κ = 0.25) belki yüksek; ~0.15 denenmedi.
- Sezon başında bağlam ve simülasyon parametrelerinin yeniden eğitilmesi (`python -m src.fantasy.context --fit`, `python -m src.fantasy.team_sim --fit`).
- Arayüz: genel Projeksiyon seçicisi, ayrışanlar listesi ve diğerleri için hazırlanan frontend prompt'u uygulanacak; tarayıcıda hiç görsel doğrulama yapılmadı.

---

# BÖLÜM B: Ödül tahmini (önce MIP, sonra tüm NBA ödülleri)

## B1. Amaç

NBA'nin bütün ödüllerini (MIP, ROY, 6MOY, DPOY, MVP, All-NBA, vb.) tahmin eden ortak bir iskelet kurmak. **Önce MIP (En Çok Gelişen Oyuncu)** ile başlıyoruz; çalışan bir model çıkınca diğer ödüllerin komple planını bunun üzerinden yaparız.
Çıktı: 2026-27 için **10 kişilik bir aday listesi** ve her isim için olasılık/güven. Bu liste "kesin tahmin" değil, "izleme listesi"dir (videodaki model 40 tahminde 7–8 isabet aldı; aynı seviye bekliyoruz).

## B2. İlham ve fark

İzlediğin videodaki yaklaşım: MIP oylama sonuçlarından öğrenen walk-forward lojistik regresyon, küçük örneklem sönümü (shrinkage) ve YouTube yorumlarından bir **hype indeksi** (model sevdiği ama kimsenin konuşmadığı oyuncular). Bizden farklar:
- Takım bağlamı (dakika/kullanım yeniden dağılımı) bizde model içinde; videoda elle denetlendi.
- Oylama geçmişi: videoda 2011'den, bizde 1985-86'dan.
- Hype: önce modelin kendisinin türettiği **sentetik hype**, sonra gerçek hype.

## B3. Önce ölçülen: mevcut projeksiyon breakout'u ne kadar yakalıyor?

3 sezon (2023-24, 2024-25, 2025-26), yalnızca sezon öncesi bilgiyle, ≥40 maç oynayanlar:
- Öngörülen artışla gerçekleşen artış sıra korelasyonu yaklaşık **0.34–0.38** (sinyal var, zayıf).
- Öngörü sıralamasındaki ilk 10, gerçek artış sıralamasında ilk 20'ye ortalama 1–3 oyuncu sokuyor, ama bu 10 kişinin gerçek artışı +2.7 ile +4.4 fantezi puanı (havuz ≈ 0).
- Kazananlar: Maxey (2024) simülasyon artış sırasında 279 içinde 16.; Daniels (2025) üst-uç (P90) sıralamasında 4.
- Düşük dakikalı oyuncular listeyi bozuyor (ör. Sochan): bu yüzden **dakika/rol filtresi yerine güvenilirlik ağırlığı** (aşağıda).
Sonuç: işe yarar bir taban var, ama MIP tek başına istatistikle yakalanmıyor; oylama davranışını öğrenmek gerek.

## B4. Veri

| Veri | Durum |
|---|---|
| Dakika, per-game, gelişmiş ölçüler (USG%, TS%, BPM, VORP, WS/48 ...) | 1983-84'ten beri **zaten var** (Basketball-Reference) |
| Yaş | 1996-97'den sonrası vardı; 1983-84 ve sonrası için `{sezon}__bref_age.parquet` olarak **çekildi** (42 sezon, yaş ve oyuncu anahtarı %100 dolu) |
| MIP oylaması | **Çekildi:** `awards__mip_voting.parquet`, 1985-86 – 2025-26, 41 sezon, 850 satır, sezon başına 4–36 oyuncu (RANK, ilk sıra oyu, PTS_WON, PTS_MAX, SHARE, kazanan). Son kazanan Nickeil Alexander-Walker (2025-26) |
| 2025-26 sezonu için B-Ref özellikleri | ✅ Çekildi (advanced, per-game, yaş) |

Çekim: `python -m src.fetch_awards --age` / `--mip` (3.5 sn aralık, önbellekli, 403/429'da durur; bağlantı koparsa 3 deneme).
MIP ödülü 1985-86'da başladığı için etiketli sezon sayısı 41; 1983-85 yalnızca özellik geçmişi.

## B5. Model tasarımı (iki aşamalı)

**Aşama A: istatistiksel gelişme.** "Bu oyuncu gelecek sezon istatistik olarak ne kadar artar?" Hedef MIP değil, gerçek artış (BPM ve maç başı sayı değişimi). Girdi: yaş, seviye persantilleri, son 1–2 yıl değişimi, usage, dakika, kıdem, güvenilirlik. Her sezon yüzlerce oyuncu etiketli → bol veri, **hype yok**.
**Aşama B: tanınma.** "Bu gelişme oylamaya yansır mı?" Girdi: A'nın öngördüğü artış, oyuncunun mevcut seviyesi (zaten iyi olan MIP almaz), önceki MIP oyları, tepe seviye. Etiket: MIP oylama payı (ballot'a girmek ve pay büyüklüğüne göre ağırlık).
**Sızıntısızlık:** Walk-forward. Hedef sezon t için yalnızca t'den önceki sezonlarla eğitilir; B'nin eğitim girdileri de ilgili sezonlarda **o gün A'nın verdiği tahminlerdir** (iç içe walk-forward). Test 2000'den başlar (en az 15 yıl eğitim).

**Dakika/rol filtresi yok (senin kararın):** Yerine güvenilirlik ağırlığı `RELIAB = MP / (MP + 800)`. Az dakika oynayanın artışına az güvenilir ama satır silinmez; usage ve dakika birlikte kullanılır.
**Eğitim penceresi:** 1986'dan beri tüm veri; özellikler sezon içi persantil (dönemler arası taşınabilir). Üç pencere yarıştırıldı (1986'dan beri, son 20, son 12 sezon): **fark yok** (B2'de son 20 − tüm geçmiş: −0.001 ± 0.004; son 12: +0.016 ± 0.009 NDCG). Karar: tüm geçmiş (daha kararlı).

**Oyuncu dönüşleri (senin düzeltmen):** Bir önceki sezonu NBA'de olmayan oyuncu (Avrupa'ya gitmiş, uzun sakatlık; ör. Isaac Austin 1997) artık dışarıda kalmıyor: o oyuncunun t'den önceki **en son NBA sezonu** (en çok 3 yıl geriye, o sezonda ≥ 300 dk) özellik olarak kullanılır, `GAP` aradaki yıl sayısı, yaş da aradaki yıllarla düzeltilir. Sonuç: oylamadaki 850 oyuncunun 848'i ve 41 kazananın 41'i veri setinde (önce 842 ve 40'tı).

**Takım bağlamı değişimi (denendi):** `MOVED` (takım değişti), `VAC` (eski takımdan ayrılan dakika payı), `ARR` (yeni takıma gelenlerin dakika payı), t sezonunun kadro üyeliğinden (yaz transferleri). Üyelik bilgisi sezon öncesi bilinir ama sezon ortası takaslar küçük bir sızıntıdır.

## B6. Sentetik hype (senin fikrin)

**Fikir:** Gerçek hype'ın geçmişi yok (yorumları 2010'lara ait toplayamayız), o yüzden λ (hype cezası) veriden öğrenilemez. Onun yerine modelin kendisi "bariz olma"yı öğrenir.
**Mekanik:** Şengün örneği: A "birinci aday" der, ama zaten All-Star ve MIP almıyor. B bu tür oyuncuların puanını düşürmeyi öğrenir. **Hype = A'nın verdiği logit − B'nin verdiği logit**, yani B'nin uyguladığı indirim.
**Not:** Bu ders tek bir sezonun hatasından değil 40 yılın birikiminden gelir; hype gözlenebilir özelliklerin bir fonksiyonu olarak öğrenilir. Sezon sonlarında "model yüksek verdi, oylamaya girmedi" listeleri çıkarılıp ortak özellikleri incelenir.
**Aşırı öğrenme önlemi:** Kırk yılda yalnızca ~300 pozitif örnek var; B sade tutulur, regülarizasyon + bootstrap güven aralıkları.

## B7. Gerçek hype indeksi (sonra)

- **Kaynak:** YouTube Data API'sinin resmî yorum uç noktası (kazıma yok; yorum metni saklanmaz, yalnızca etiketler).
- **Sınıflandırma:** Claude yorumları "gelecek beklentisi / zaten kanıtlandı / şüpheci / ilgisiz" diye etiketler (güven puanıyla). Bu, kredi başvurusu için de gerçek bir kullanım örneği.
- **Videodaki dürüstlük kuralları:** Eksik veri "sıfır hype" değil "bilinmiyor"; güçlü iddia için en az 10 yorum ve en az 2 kaynak; her kaynak ayrı skorlanıp shrinkage ile birleşir.
- **Entegrasyon:** Gerçek hype 2026'da toplanır; sentetik hype ile karşılaştırılır; örtüşüyorsa sentetik ölçeğe çevrilip B'ye ek girdi olur. λ gerçek veriyle seçilmez, sentetik tarihten öğrenilen ölçeğe bağlanır.
- **Hedef:** `skor = breakout olasılığı − λ·hype` (videoda λ = 0.65 uydurmaydı; biz sentetikten tahmin edip 0.40 / 0.80 duyarlılık testi yaparız).

## B8. Değerlendirme

Doğruluk değil, **sıralama** ölçütleri: sezon başına ilk 10'un oylamaya giren oyuncuları yakalaması, oy payı geri çağırma, NDCG@10 (kazanç = oy payı), kazananın sırası, olasılık kalibrasyonu (Brier). Karşılaştırma tabanları: "genç + üretken", "son yıl artışı", A tek başına, mevcut simülasyon artışı.
Final olasılık: `P(MIP) = P(gelişme) × P(yeterli maç oynama)`; ikinci terim için simülasyonun maç dağılımı hazır. (65 maç şartı henüz doğrulanmadı.)

### B8b. İlk sonuçlar (2000–2026, 27 sezon, walk-forward, `python -m src.awards.mip_model`)

Ölçütler sezon ortalaması; "hits@10": modelin ilk 10'unun kaçı oylamaya girdi (oylamada sezon başına 4–36, tipik ~14 oyuncu); "recall@10": oy payının ne kadarı ilk 10'da.

| Model | hits@10 | recall@10 | NDCG@10 | Kazanan ilk 10'da | Kazanan ilk 3'te |
|---|---|---|---|---|---|
| Rastgele | 0.33 | 0.023 | 0.023 | %0 | - |
| Son yıl artışı (BPM / sayı) | 1.2 | 0.05 | 0.03 | %4 | - |
| Aşama A tek başına | 0.63 | 0.007 | 0.004 | %0 | - |
| Genç + üretken | 2.15 | 0.12 | 0.084 | %15 | - |
| B0 (yalnız A'nın istatistik beklentisi) | 2.81 | 0.13 | 0.104 | %7 | %0 |
| B1 (+ seviye / tarihçe) | 3.07 | 0.19 | 0.142 | %22 | %4 |
| **B2 (üretim: seviye + yaş + tarihçe + büyüme, A'sız)** | 2.81 | 0.20 | 0.142 | %26 | %7 |
| B4 (B2 + takım bağlamı değişimi) | 2.85 | 0.19 | 0.137 | %22 | %7 |

Çiftli sezon farkları (NDCG@10, ortalama ± standart hata): B1 − B0 **+0.039 ± 0.022**; B2 − "genç + üretken" **+0.058 ± 0.022**; B2 − B1 0.000 ± 0.018; B3 − B2 (A eklemek) +0.011 ± 0.009; B4 − B2 (takım değişimi) −0.006 ± 0.012. Yani tanınma katmanı (seviye / yaş / tarihçe) ve genç+üretken tabanını aşmak gerçek kazanç; A'yı ya da takım değişimini eklemenin **ölçülebilir bir katkısı yok** (hepsi hata payı içinde).

**Aşama A tek başına iyi bir istatistik tahmincisi** (BPM değişimi için korelasyon 0.48, sıfır tahminine göre MSE iyileşmesi %23; maç başı sayı: 0.45 ve %20) ama **MIP sıralaması için işe yaramıyor**: öngördüğü artış büyük ölçüde ortalamaya dönüş. Oylama "istatistik artışı"nı değil, seviye, yaş ve tarihçeyle şekillenen bir tanınmayı ödüllendiriyor.

**Dürüst sınırlar:**
- Model oylamaya girenleri iyi buluyor (rastgele 0.33 → 2.8–3.1), **kazananı değil**: son 8 sezonda kazananın sırası 29, 70, 98, 9, 68, 27, 19, 157. İlk 5'te genellikle zaten yıldız olan genç oyuncular çıkıyor (Dončić, Tatum, Wembanyama, Şengün dört yıl üst üste). Kazananların çoğu rol değişikliği yaşayan oyuncular.
- Kalibrasyon: kazanan başına log-olasılık −4.91 (eşit olasılıkta −6.43): kazanana tesadüfün yaklaşık 4–5 katı olasılık veriyor; en yüksek `P(kazanma)` yaklaşık %4. Liste bir **izleme listesi**.
- Bu sonuçlar henüz hype olmadan; sentetik hype'ın (B0 − üretim logiti) şu an anlamlı bir ayrıştırması yok (kazananla ilişkisi ölçülmedi).

**2026-27 ilk adaylar (üretim modeli):** Flagg, Harper, Sheppard, Knueppel, Castle, Clingan, Buzelis, Ware, Sarr, Edgecombe, Holland, Podziemski, Queen, Rollins, Mitchell. 19–21 yaşında ağırlıklı: bu modelin yaşa verdiği güçlü ağırlığın sonucu, tek başına güven vermiyor. Maç sayısı (65 maç şartı) henüz uygulanmadı.

## B9. Diğer ödüller: komple plan (MIP sonrası)

Aynı iskelet: oylama payı hedefi + walk-forward + sentetik/gerçek hype. İhtiyaçlar:
- **ROY:** Çaylaklar; draft sırası, kolej/uluslararası geçmiş, bizim çaylak referans değerlerimiz.
- **6MOY:** Rol (bench), dakika başı üretim, kullanım.
- **DPOY:** Savunma ölçüleri (DBPM, STL/BLK, DEF_RATING, takım savunması).
- **MVP / All-NBA:** Seviye ve takım başarısı, pozisyon kısıtları.
- **Koç ödülü:** Takım düzeyinde, beklentiye göre galibiyet; takım simülasyonumuz için doğal uyum.
- **Clutch Player (2023'ten beri):** Kısa geçmiş, ayrı değerlendirme gerekir.
Ayrıntılı plan MIP modeli çalıştıktan sonra yazılacak.

## B10. Durum ve sıradaki adımlar

| Adım | Durum |
|---|---|
| Yaş (42 sezon) ve MIP oylama (41 sezon) çekimi | ✅ Bitti |
| Veri seti kurucu `src/awards/mip_data.py` | ✅ `data/awards__mip_dataset.parquet`, 24 349 satır × 106 sütun, 41 etiketli sezon. Oylamadaki 850 oyuncunun 848'i, 41 kazananın 41'i eşleşti (dönüş yapan oyuncular için `GAP`: Isaac Austin 1997 dahil). 2027 hedef sezonu (2026-27) 583 satır, etiketsiz |
| 2025-26 sezonu için B-Ref özellikleri | ✅ Çekildi (advanced, per-game, yaş) |
| Aşama A (gelişme) ve B (tanınma) modelleri, walk-forward | ✅ `src/awards/mip_model.py`; A iyi bir istatistik tahmincisi ama MIP sıralamasına katkısı yok; üretim modeli B2 (B8b) |
| Pencere karşılaştırması (1986 / 20 yıl / 12 yıl) | ✅ Fark yok; tüm geçmiş seçildi |
| Sentetik hype raporu (yıllara göre yanlış pozitif listeleri) | 🔶 Hype değeri hesaplanıyor (B0 − üretim logiti) ama kazananlarla ilişkisi ve yanlış pozitif listeleri henüz incelenmedi |
| 2026-27 için 10 kişilik aday listesi | 🔶 İlk liste çıktı (B8b) ama 19–21 yaşa yığılmış; 65 maç şartı ve maç sayısı olasılığı uygulanmadı, kazanan tahmininde zayıf: şimdilik izleme listesi |
| Kazananı yakalamak için yeni yöntem (sıralama / koşullu lojistik, rol değişikliği vurgusu, simülasyon bağlamı) | ⏳ Sıradaki |
| Gerçek hype hattı (YouTube + Claude sınıflandırması) | ⏳ (2026 sezonu) |
| Diğer ödüller planı | ⏳ |

---

# BÖLÜM C: Dosya ve komut haritası

| Ne | Nerede |
|---|---|
| Fantezi planı, aşama sonuçları | `docs/FANTASY_PLAN.md` |
| Model iyileştirmeleri | `docs/FANTASY_MODEL_IMPROVEMENTS.md` |
| Fantezi frontend prompt'u | `docs/FRONTEND_PROMPT_FANTASY_SIMULATION.md` |
| Projeksiyon, bağlam, takım simülasyonu | `src/fantasy/projections.py`, `context.py`, `team_sim.py`, `world.py`, `season_sim.py`, `inseason_sim.py` |
| Ödül veri çekimi | `src/fetch_awards.py` |
| MIP veri seti | `src/awards/mip_data.py` → `data/awards__mip_dataset.parquet` |
| Backtest'ler | `python -m src.fantasy.team_sim --backtest`, `python -m src.fantasy.inseason_sim`, `python -m src.fantasy.world_backtest` |

---

# BÖLÜM D: Yolculuk: aşamalar, problemler ve çözümler (video için)

Her aşama aynı kalıpta: **ne istedik → ne ters gitti → nasıl düzelttik → ne öğrendik.** Bu bölüm de her değişiklikte güncellenir; yeni aşama eklenince sona eklenir, devam eden aşama "🔶" ile işaretlenir.

## D1. Fantezi tarafı

### Aşama 1: "Sıralamalar gerçekçi değil" (Trae Young sorunu)
- **İstek:** Sıralamada G/Z skoru açıklamaları, sıralanabilir sütunlar, sabit arama çubuğu; ama asıl şikâyet: bazı oyuncular gerçekçi görünmüyor.
- **Problem 1:** Kaçırılan maçlar **sıfır üretim** sayılıyordu. Sakatlığa yatkın yıldız, ilk bakışta olduğundan çok daha değersiz görünüyordu.
- **Çözüm:** Kaçırılan maçın yerine waiver seviyesinde bir oyuncunun üretimi konuyor (`REPL_CREDIT = 0.75`). Sakatlık riski artık "sıfır" değil, "yedek oyuncuyla doldurulmuş boşluk".
- **Problem 2:** Piyasa verisi eskiydi. **Çözüm:** Yeni Yahoo ADP (270 oyuncu, ekran görüntülerinden) ve "ADP ≠ sıralama" ilkesi: ADP piyasanın kendisi.
- **Problem 3:** Tek bir sezondan fazla yükselen projeksiyonlar şüphesi. **Çözüm:** İkinci sezon (sophomore) kontrolü ve "yükseliyor / sabit / düşüyor" etiketleri; etiket projeksiyonu değiştirmiyor, yolu anlatıyor (korelasyon 0.07 ile ölçtük: gerçekten ayrı bir tahmin değil).
- **Ders:** Gerçekçilik çoğu zaman yeni bir model değil, eksik bir varsayımı (kaçırılan maç = 0) düzeltmek.

### Aşama 2: Takım bağlamı: "Maxey bu kadar üretir mi?"
- **İstek:** LeBron ve Jaylen Brown'ın geldiği takımda Maxey gerçekten bu kadar üretir mi?
- **Problem:** Yeni takıma geçen oyuncular yaklaşık %10 fazla tahmin ediliyordu.
- **Çözüm:** Kullanım esnekliği (`rate = a·L^(−θ)`) ve dakika/oran regresyonları; her sezon dışarıda bırakılarak doğrulandı (3 sezon).
- **Ders:** Doğrulamayı "bir sezonu dışarıda bırak" şeklinde yapmasaydık, bağlam katmanı kendi verisini ezberlerdi.

### Aşama 3: Takım simülasyonu: dört hata
Hedef: her NBA takımını oyun oyun oynatıp oyuncunun payını hesaplamak. Dört ayrı hata ve çözümleri:
1. **Sabit 241 dakikalık bütçe** hatayı büyüttü (MAE 5.39). → Bütçe, takımın kendi beklenen dakika toplamı oldu.
2. **Bağlam iki kez sayıldı** (dakikaya önceden uygulanan bağlam + simülasyonun kendi dağılımı). → Önceden düzeltme kaldırıldı.
3. **Yetenek şoku ortalamayı kaydırıyordu** (yanlılık −0.9). → Şok ortalamayı koruyacak şekilde normalize edildi.
4. **Sakatlık blokları üst üste biniyor, kaçırılan maçı olduğundan az gösteriyordu.** → Eksik kadarını rastgele maçlardan çıkaran "açık kapatma" adımı; bütçe ölçeği 0.94'e yeniden ayarlandı.
- **Ders:** Karmaşık modelde hata tek yerden gelmez; her bileşeni tek tek ölçmek (yanlılık, MAE, aralık kapsaması) gerekli.

### Aşama 4: Oyun içi gürültü (dünya motoru)
- **Problem:** 3'lük isabet %6.6 eksik çıktı (FG3M yanlılığı). Neden: 3'lük deneme sayısı ayrı bir sayma değişkeni olarak çekilip kırpılıyordu.
- **Çözüm:** 3'lük denemeyi, atış denemesinin binom payı olarak çekmek. Yanlılık kayboldu.
- **Ders:** Birbirine bağlı sayıları (FGA ≥ 3PA) ayrı ayrı çekmek tutarsızlık üretir; yapıyı baştan doğru kurmak lazım.

### Aşama 5: Eski motorla yan yana test: "eşitlik"
- **Problem:** Yeni motor eskisinden **daha iyi değil**, istatistiksel olarak eşit çıktı (güven aralıkları sıfırı içeriyor).
- **Karar:** Dürüstçe "eşit" dedik; yine de takım içi bağımlılığı yapısal olarak doğru modellediği için sitede varsayılan yaptık (senin kararın).
- **Test problemi:** Varsayılan piyasa çekmesi açılınca eski/yeni motor uyum testi kırıldı. → Testi "çekmesiz katı" ve "varsayılan çekmeli daha gevşek" olarak ikiye böldük.
- **Ders:** "Yeni = daha iyi" demek yerine, kanıtı olduğu kadar söylemek.

### Aşama 6: Sunucu ve sezon içi
- **Problem 1:** Sunucu yeniden başlayınca dünya 13 saniyede kuruluyor; bu sırada gelen istekler önce eski, sonra yeni motordan yanıt alıyordu. → Hazır olana kadar en çok 25 sn bekleme; hâlâ olmazsa eski motor ve yanıtta bunu söyleyen alan.
- **Problem 2:** Saatlik sezon içi güncellemede dünya yeniden kurulurken yeni istek eski motora düşebilirdi. → Önceki saatin dünyası, yenisi kurulana kadar hizmet veriyor.
- **Problem 3 (modelleme):** Sezon içinde güncel hızlar yeni rolü zaten içeriyor; sezon öncesi bağlam düzeltmesi tekrar uygulanırsa çift sayım olur. → Eski takım yükü yok (çarpan 1).
- **Sonuç:** Sezon içi simülasyon da modelle eşit (FP hatası 3.607 ↔ 3.638); yanlılık daha düşük.
- **Ders:** Sistem güvenilirliği (bekleme, yedek motor, eski dünya) modelin kendisi kadar önemli.

### Süreç problemleri (fantezi)
- Yan oturumlar aynı dosyalarda çalışırken yalnızca kendi değişikliklerimizi commit'lemek için hunk bazlı hazırlama.
- Tarayıcı paneli hiç açılamadı: arayüz yalnızca derleme/lint ve API testleriyle doğrulandı, görsel doğrulama yapılmadı (bilinen açık).
- Push yapılmadı (senin kuralın); yerel commit'ler birikti.

## D2. Ödül tahmini (MIP)

### Aşama 1: İlham ve ilk sorular
- **İstek:** Videodaki gibi MIP adayı listesi ve hype indeksi. Soru: simülasyonumuz bunu yapabilir mi?
- **İlk ölçüm:** Mevcut projeksiyonun artış öngörüsüyle gerçekleşen artış arasındaki sıra korelasyonu 0.34–0.38 (sinyal var, zayıf); ilk 10'un yalnız 1–3'ü gerçek ilk 20'ye giriyor.
- **Ders:** Hazır bir modelin başka bir soruya (ödül) uyup uymadığını **önce ölçmek**, doğrudan kullanmaktan iyi.

### Aşama 2: Veri: "elimizde var sandığımız" şeyler
- **Problem 1:** Yaşın tüm geçmişte elimizde olduğunu düşünüyorduk; yalnız 1996-97'den sonrası vardı. → Basketball-Reference'tan 42 sezon yaş çekildi.
- **Problem 2:** Usage'ı çekeceğimizi sanıyorduk; zaten kayıtlıydı. → Sadece yaş ve MIP oylaması çekildi (gereksiz istek yok).
- **Problem 3:** Çekim 5. sezonda **bağlantı kopması** ile durdu. → Yeniden deneme (20/40 sn bekleyerek), 403/429'da dur; kaldığı yerden devam.
- **Problem 4:** Takas edilen oyuncular son yıllarda "TOT" yerine "2TM/3TM" ile geliyor; çift satırlar oluşuyordu. → Oyuncu başına en çok maçı olan (toplam) satır.
- **Problem 5:** Oyuncu anahtarı iki dosyada farklı biçimdeydi (`b/bridgmi01` ve `bridgmi01`). → Ortak anahtar normalizasyonu.
- **Ders:** "Bunu zaten biliyoruz" varsayımlarını veriyle doğrulamak iki gereksiz çekimi önledi, bir eksiği yakaladı.

### Aşama 3: Isaac Austin düzeltmesi (senin yakaladığın hata)
- **Problem:** Bir önceki sezonu NBA'de olmayan oyuncu (Avrupa'dan dönen Isaac Austin, 1997 kazananı) veri setinden düşüyordu; 41 kazanandan 40'ı eşleşiyordu.
- **Çözüm:** Oyuncunun t'den önceki **en son NBA sezonu** kullanılıyor (en çok 3 yıl geriye), aradaki yıl `GAP` özelliği, yaş düzeltildi. Eşleşme: kazananlar 41/41, oylama 848/850.
- **Ders:** Eksik veri satırını silmeden önce "neden eksik?" diye sormak; bir kazananın eksikliği bile modelin ne öğrendiğini bozar.

### Aşama 4: Veri setindeki iki sessiz hata
- **Hata 1:** Aynı sütun iki kez eklenince "duplicate labels" hatası. → Sütun listesi tekilleştirildi.
- **Hata 2 (sessiz):** Maç başı sayı değişimini tahmin eden model **tamamen boş (NaN)** çıktı, ama program hata vermedi; sonraki aşama NaN'i sıfır sayıp katsayıyı 0.0 buldu. Aday listesindeki boş sütun ve sıfır katsayı bunu ele verdi. → Hedefi NaN olan satırlar eğitimden çıkarıldı. Sonra Aşama A'nın gerçek kalitesi ölçülebildi (korelasyon 0.48).
- **Ders:** Sessiz hatalar en pahalısı: çıktıdaki "çok temiz" katsayılar (tam 0.0) şüpheli olmalı.

### Aşama 5: İlk model ve beklenmedik bulgular
- **İstek:** İki aşamalı model (gelişme tahmini + tanınma), walk-forward; sentetik hype.
- **Bulgu 1:** Aşama A iyi bir istatistik tahmincisi ama MIP sıralamasında **rastgele seviyesinde** (hits@10 0.63, rastgele 0.33). Öngördüğü artış çoğunlukla ortalamaya dönüş.
- **Bulgu 2:** Tanınma katmanı gerçek kazanç sağlıyor (genç+üretken tabanına göre +0.058 ± 0.022 NDCG).
- **Bulgu 3:** Aşama A'yı da, takım değişimi özelliklerini de eklemek **fark yaratmadı**. Üç eğitim penceresi de eşit.
- **Bulgu 4 (asıl problem):** Model oylamaya girenleri buluyor (ilk 10'da 3 isabet) ama **kazananı değil**: son 8 sezonda kazananın sırası 29, 70, 98, 9, 68, 27, 19, 157. Hep zaten yıldız olan gençler (Şengün dört yıl üst üste) ilk 5'te çıkıyor.
- **Ders:** Ortalama bir metrik (ballot isabeti) iyi görünürken asıl hedefi (kazanan) kaçırmak mümkün; metrikleri hedefe göre seçmek şart.

### Aşama 6 🔶: Teşhis ve ikinci tur (devam ediyor)
- **Teşhis (veriyle):** Kazananların yaşı 20–26 arasında dengeli dağılırken modelin ilk 10'unun **%81'i 21 ve altı**. Model ayrıca bir önceki yıl zaten çok gelişmiş oyuncuları seçiyor (dakika +5, BPM +1.5); kazananlar ise önceki yıl sıçrama yapmamış (BPM değişimi 0.0). Yani model "momentum"u kovalıyor, MIP sürprizi ödüllendiriyor.
- **Neden:** Yaş doğrusal ve tek yönlü bir ağırlıktı; "genç = iyi" kuralı yaş sınıflarının gerçek dağılımını yansıtmıyor. Sentetik hype henüz sıralamaya girmiyor, sadece teşhis çıktısı (bu da bir eksik).
- **Plan (senin sezgin):** (a) yaş kutucukları, (b) daha fazla özellik: takım içi rol payı ve sırası, geçmiş seviyeler, sağlık, çıkış yaşı, (c) hedefi "kim kazanır" olarak değiştirmek (sezon içi sıralama kaybı), (d) sentetik hype'ı gerçekten sıralamaya dahil etmek.
- **Sonuç:** Bu aşama bitince buraya yazılacak.

## D3. Sürekli tekrar eden dersler (video için ortak tema)
1. **Önce ölç, sonra inşa et:** Mevcut modelin yeni soruya uyup uymadığı, kurmadan önce ölçüldü.
2. **"Eşit" demek de bir sonuç:** Yeni motor eskisinden iyi çıkmayınca bunu saklamadık.
3. **Sessiz hatalar:** Çıktıdaki "fazla temiz" sayılar (tam sıfır, boş sütun) hataya işaret etti.
4. **Metrik hedefle uyumlu olmalı:** Ortalama isabet iyi, kazananı bulmak kötü: ikisini ayrı ölçmek şart.
5. **Veri varsayımları doğrulanmalı:** "Elimizde var" dediklerimizin yarısı yoktu, bir kısmı zaten vardı.
6. **Kullanıcı gözlemleri modelden değerli olabiliyor:** Isaac Austin, yaşın ağırlığı ve Şengün sezgisi; üçü de model hatasını ortaya çıkardı.

---

# Değişiklik günlüğü

| Tarih | Değişiklik |
|---|---|
| 2026-10-07 (e) | Bölüm D eklendi: aşamalar, karşılaşılan problemler ve çözümleri (video metni için). Teşhis: model kazananların yaş dağılımını yansıtmıyor (ilk 10'un %81'i ≤21 yaş) ve momentum kovalıyor; ikinci tur başladı. |
| 2026-10-07 (d) | Aşama A ve B kuruldu, walk-forward ile 2000–2026'da test edildi (B8b). Bulgular: tanınma katmanı genç+üretken tabanını aşıyor (+0.058 ± 0.022 NDCG), A ve takım değişimi katkı vermiyor, pencere farkı yok; model oylamaya girenleri buluyor ama kazananı değil. Üretim modeli B2; ilk 2026-27 listesi çıktı. |
| 2026-10-07 (c) | Isaac Austin düzeltmesi (senin notun): önceki sezonu olmayan oyuncu için en son NBA sezonu + `GAP` özelliği; 2025-26 B-Ref verisi çekildi; takım değişimi özellikleri (`MOVED`, `VAC`, `ARR`) eklendi. |
| 2026-10-07 (b) | MIP veri seti kuruldu ve doğrulandı (18 476 satır, oylama eşleşmesi %99.1, kazananlar 40/41). Satır = (oyuncu, hedef sezon); özellikler t−1'den: seviye ve persantiller, son 1–2 yıl değişimi, tepe VORP, kıdem, önceki MIP payı, güvenilirlik ağırlığı. |
| 2026-10-07 | Rehber oluşturuldu (fantezi aşama 0–5, ödül tahmini planı). MIP için yaş (42 sezon) ve MIP oylama (41 sezon) verisi çekildi; veri seti kurucusu yazıldı. |
