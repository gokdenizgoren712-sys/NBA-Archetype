# Primary Arch: modeller, simülasyon ve ödül tahmini rehberi

Bu dosya şimdiye kadar konuştuklarımızı ve modellerin / simülasyonun ne yapması gerektiğini tek tek açıklar. **Her değişiklikte güncellenir** (en altta değişiklik günlüğü var). Teknik ayrıntı ve ölçüm tabloları için ilgili plan dosyalarına bağlantı verilir; burada amaç "ne, neden, nasıl, ne durumda" sorularını cevaplamak.

Son güncelleme: 2026-10-07

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
| 2025-26 sezonu için B-Ref özellikleri | **Eksik**: 2026-27 tahmini için bref_advanced, per-game ve yaş 2025-26 için de çekilecek |

Çekim: `python -m src.fetch_awards --age` / `--mip` (3.5 sn aralık, önbellekli, 403/429'da durur; bağlantı koparsa 3 deneme).
MIP ödülü 1985-86'da başladığı için etiketli sezon sayısı 41; 1983-85 yalnızca özellik geçmişi.

## B5. Model tasarımı (iki aşamalı)

**Aşama A: istatistiksel gelişme.** "Bu oyuncu gelecek sezon istatistik olarak ne kadar artar?" Hedef MIP değil, gerçek artış (BPM ve maç başı sayı değişimi). Girdi: yaş, seviye persantilleri, son 1–2 yıl değişimi, usage, dakika, kıdem, güvenilirlik. Her sezon yüzlerce oyuncu etiketli → bol veri, **hype yok**.
**Aşama B: tanınma.** "Bu gelişme oylamaya yansır mı?" Girdi: A'nın öngördüğü artış, oyuncunun mevcut seviyesi (zaten iyi olan MIP almaz), önceki MIP oyları, tepe seviye. Etiket: MIP oylama payı (ballot'a girmek ve pay büyüklüğüne göre ağırlık).
**Sızıntısızlık:** Walk-forward. Hedef sezon t için yalnızca t'den önceki sezonlarla eğitilir; B'nin eğitim girdileri de ilgili sezonlarda **o gün A'nın verdiği tahminlerdir** (iç içe walk-forward). Test 2000'den başlar (en az 15 yıl eğitim).

**Dakika/rol filtresi yok (senin kararın):** Yerine güvenilirlik ağırlığı `RELIAB = MP / (MP + 800)`. Az dakika oynayanın artışına az güvenilir ama satır silinmez; usage ve dakika birlikte kullanılır.
**Eğitim penceresi:** 1986'dan beri tüm veri; özellikler sezon içi persantil (dönemler arası taşınabilir). Üç pencere yarıştırılacak: 1986'dan beri, son 20 yıl, son 12 yıl. Veri karar verir.

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
| Veri seti kurucu `src/awards/mip_data.py` | ✅ Çalıştı: `data/awards__mip_dataset.parquet`, 18 476 satır × 93 sütun, 41 etiketli sezon. Oylamadaki 850 oyun %99.1'i (842) eşleşti, 41 kazananın 40'ı (eşleşmeyenler bir önceki sezonu NBA'de oynamamış, ör. Isaac Austin 1997) |
| 2025-26 sezonu için B-Ref özellikleri | ⏳ |
| Aşama A (gelişme) ve B (tanınma) modelleri, walk-forward | ⏳ |
| Pencere karşılaştırması (1986 / 20 yıl / 12 yıl) | ⏳ |
| Sentetik hype raporu (yıllara göre yanlış pozitif listeleri) | ⏳ |
| 2026-27 için 10 kişilik aday listesi | ⏳ |
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

# Değişiklik günlüğü

| Tarih | Değişiklik |
|---|---|
| 2026-10-07 (b) | MIP veri seti kuruldu ve doğrulandı (18 476 satır, oylama eşleşmesi %99.1, kazananlar 40/41). Satır = (oyuncu, hedef sezon); özellikler t−1'den: seviye ve persantiller, son 1–2 yıl değişimi, tepe VORP, kıdem, önceki MIP payı, güvenilirlik ağırlığı. |
| 2026-10-07 | Rehber oluşturuldu (fantezi aşama 0–5, ödül tahmini planı). MIP için yaş (42 sezon) ve MIP oylama (41 sezon) verisi çekildi; veri seti kurucusu yazıldı. |
