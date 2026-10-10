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

### B8c. İkinci tur ve üst sınır (`src/awards/mip_rank.py`)

Denenenler: yaş kutucukları, takım içi rol payı / sırası, sağlık, çıkış yaşı, geçmiş seviyeler, sıralama kaybı (ListNet), gradyan artırma. **Hiçbiri tek tek lojistik B2'yi anlamlı biçimde geçmedi** (NDCG 0.138 – 0.142; çiftli farklar hata payı içinde). Yaş bilgisini tamamen çıkarmak NDCG'yi 0.087'ye düşürüyor: yaş gerçek bilgi taşıyor ve ilk 10'un genç yığılması taban oranın sonucu (21 yaşındaki dakika alan oyuncunun oylamaya girme olasılığı yüksek).
**Üst sınır testi:** Aynı çerçeveye hedef sezonda gerçekleşen değişimi (BPM, maç başı sayı, dakika, usage) vermek NDCG'yi 0.142 → **0.675** yapıyor (+0.533 ± 0.043); kazanan %89 ilk 10'da, %70 ilk 3'te, medyan sıra 2. Sonuç: **MIP sezon öncesi değil, sezon içinde öngörülebilir** → asıl ürün canlı takip (Aşama 7).

### B8d. YAN DAL (ürün değil): "10 breakout adayı" etiketi (kazanan değil), sonuçlar (`src/awards/mip_breakout.py`)

> Not: Bu etiket bizim icadımız; videonun ölçütünden sapıyor. Ürün hedefi B8e'deki ölçüte döndü. Bulgular referans için duruyor.

**Ürün tanımı (senin):** MIP kılıfı altında, modelin ve simülasyonun breakout yılı geçirmesini beklediği 10 oyuncu. Hepsi doğru olmayabilir; çoğunun yıl sonunda kazanan olmasa bile listeye (oylamaya ya da en çok gelişenlere) girmesi beklenir.
**Etiket (`BREAKOUT`):** (a) MIP oylamasında pay ≥ 0.02 aldı, ya da (b) sezonun en çok gelişen ilk 12 oyuncusundan biri (`dVORP82 = (VORP_n − VORP) × 82 / sezon uzunluğu`, hedef sezonda ≥ 1200 dk). Sezon başına ortalama 17 oyuncu.

**Sonuç (2000–2026, 27 sezon, walk-forward): 10 kişilik listeden ortalama ~2.1–2.3 isabet** (rastgele 0.33, yani yaklaşık 7 kat). Tek sezonda 4+ isabet olan sezon oranı %7–19. İlk tur ballot modeli bu etikette 1.78; breakout için eğitilen modeller 2.1–2.3; Aşama A tek başına 0.37 (rastgele seviyesi).

**Etiket sıkılığı takası** (aynı model; liste = ilk 10; rastgele aynı etikette):

| "Breakout" tanımı | Model (10 kişide) | Rastgele | Sezonların ≥5 isabet oranı |
|---|---|---|---|
| En çok gelişen ilk 12 (+ oylama) | 2.07 | 0.29 | %4 |
| ilk 25 (+ oylama) | 3.04 | 0.46 | %11 |
| ilk 50 (+ oylama) | 3.93 | 0.84 | %30 |
| ilk 75 (+ oylama) | 5.07 | 1.23 | %59 |

Liste boyutu (etiket: ilk 12 + oylama): 10 kişi 2.07 (%21), 15 kişi 2.89 (%19), 20 kişi 3.56 (%18), 30 kişi 5.04 (%17). Yani **"çoğu tutsun" ancak "breakout" tanımı genişletilirse mümkün** (en çok gelişen ilk 75 ≈ uygun rotasyon oyuncularının en iyi çeyreği → 10'da ~5 isabet); katı tanımda (elit breakout / oylama) gerçekçi hedef 10'da ~2 (20 kişide ~3.5).

**Simülasyon artışı denendi, ek bilgi yok:** 3 sezonda (2023-24 – 2025-26, simülasyon yalnız bu sezonlarda geriye dönük üretilebiliyor) "simülasyon − geçen yıl" sıralaması 10'da 0.33 breakout verdi (rastgele seviyesi), model + simülasyon harmanı da modeli geçmedi. Nedeni: ham fark küçük bazlı düşük dakikalı oyuncuları öne çıkarıyor. Takım değişimi / ayrılan dakika özellikleri de ballot modelinde fark yaratmamıştı (B8b).

**Sentetik hype'ın etiket biçimi (önceki sezon VORP persantili ≥ 0.85 olanlar breakout sayılmaz):** İsabet aynı kaldı (1.9–2.3/10). Liste değişti: LaMelo, Luka, Zion gibi yıldızlar gitti, yerlerine **genç, üst sıradan seçilmiş ve düşük BPM'li ikinci yıl oyuncuları** geldi (Fears, Bailey, Johnson, Carrington ...). Yani senin kaygın doğru çıktı: istatistik, üst sıradan seçilen ikinci yıllara (düşük taban + yüksek dakika) güçlü bir artış eğilimi veriyor, ama 2025 listesi 0/10, 2022-23 listeleri 2/10 oldu: bu sınıfın artışı kolay ama oylama/en iyi gelişenler arasında olması düzensiz.

**2026-27 listesi (breakout-B3, elit hariç):** Flagg, Fears, Bailey, Knueppel, Edgecombe, Johnson, Traoré, Carrington, Riley, Harper. Elit dahil edilince Şengün, Thompson, Banchero listeye giriyor. Henüz **izleme listesi**; çoğunun tutması için etiket tanımı (aşağıdaki seçenekler) kararlaştırılmalı.

**Karar seçenekleri:**
1. **Katı tanım** (elit breakout / oylama): 10'da ~2 isabet, dürüstçe "bunlar en olası 10 aday, beklenen ~2'si tutar".
2. **Geniş tanım** ("sezonun en çok gelişen çeyreğinde": ilk 75): 10'da ~5 isabet, "çoğu tutar" hedefiyle uyumlu; adı "breakout" değil "belirgin gelişme".
3. **İki kademe:** her oyuncu için hem P(belirgin gelişme) hem P(elit breakout / oylama) gösterilir; liste ikincisine göre, başlık beklentisi birincisine göre.
4. **Çeşitlilik kuralı:** aynı draft sınıfından / üst sıradan seçilen ikinci yılların sayısını sınırlamak (ürün kararı; draft sırası verisi çekilirse "üst sıradan seçilen" bilgisi modele de girer).
### B8e. Videoyla yan yana: aynı ölçüt, aynı sonuç

**Videodaki ölçüt (transkriptten):** 2023, 2024, 2025, 2026 sezonları, her sezon ilk 10 tahmin; "40 tahminde 7 gerçek top MIP finisher" (hype'sız model). Küçültme, sade özellik kümesi ve önceki fold'ları ekleyince 8. Taban: "genç + üretken" ve "son yıl gelişimi". Eğitim: yalnız önceki sezonlar (walk-forward). Videonun kendi uyarısı: 2023–26'yı model geliştirirken defalarca gördü, yani 7–8 hafif iyimser.
**Bizim önceki ölçütümüz farklıydı:** "ilk 10'dan kaçı oylamaya girdi" (oylamada 1 oy alanlar dahil, eski yıllarda 25–36 kişilik liste) ve 2000–2026 ortalaması. Bu, videodan "daha iyi" göründü ama aynı şey değildi; sonra "breakout" etiketine kayınca (B8d) videodan ayrıldık. **Düzeltme: videonun ölçütüne dönüldü.**

**Aynı ölçütle sonuç (ilk 10 tahminden kaçı gerçek top-10 MIP finisher; liste başına ortalama):**

| Model | 2023–26 (4 sezon, videonun dönemi) | 2011–26 (16 sezon) | 2000–26 (27 sezon) |
|---|---|---|---|
| **B2sh (üretim: B2 + dakikaya göre küçültülmüş hızlar)** | **1.75 (7/40)** | **1.62** | **1.70** |
| B2 | 1.25 (5/40) | 1.31 | 1.56 |
| B1_noA | 1.50 | 1.50 | 1.74 |
| B3 (+ Aşama A) | 1.25 | 1.38 | 1.63 |
| B4 (+ takım değişimi) | 1.00 | 1.19 | 1.56 |
| Genç + üretken (taban) | 1.00 (4/40) | 1.25 | 1.04 |
| Son yıl gelişimi (BPM / sayı) | 1.00 / 0.75 | 0.62 / 0.56 | 0.59 / 0.67 |
| Aşama A tek başına | 0.00 | 0.38 | 0.22 |
| Videodaki model (hype'sız) | 7/40 = 1.75 | - | - |

Yani **videoyla aynı seviyedeyiz** (7/40) ve daha uzun dönemde de (16–27 sezon) kararlıyız (1.6–1.7). Dört sezonluk örnekte bizim varyantlarımız 3/40 ile 7/40 arasında oynuyor: tek bir dört sezonlukta 5 ile 8 arasındaki farklar gürültü. Videonun taban karşılaştırması da bizimkiyle uyuyor (genç + üretken ≈ 1.0–1.25).
**Videodan kazanım:** Küçültme (dakika başı hızı oynanan dakikaya göre sezon ortalamasına çekmek) bizde de işe yaradı (B2 → B2sh: +0.3 liste başına 2011–26'da, NDCG +0.013 ± 0.011). Aşama A, takım değişimi ve ek özellikler katkı vermedi (videoda "özellik kümesini küçültmek" de buydu).
**Videoda hype ne yaptı:** Hype yeni isabet eklemedi; yalnız sıralamayı değiştirdi (örn. Flagg 5. → 8.). Hype katmanı, "bariz olanı" aşağı çeken bir yeniden sıralama.

**2026-27 listesi (B2sh; `P_top10` = top-10 MIP finisher olasılığı, kalibre):** Harper 0.18, Sheppard 0.17, Flagg 0.16, Clingan 0.15, Castle 0.15, Knueppel 0.14, Ware 0.12, Edgecombe 0.11, Buzelis 0.11, Sarr 0.10. Olasılıkların toplamı ≈ 1.5: listeden beklenen isabet yaklaşık 1.5–1.7, tıpkı videodaki gibi.
**Hype (şu an yalnız teşhis):** `hype` = B0 (yalnız istatistik) − üretim logiti. Pozitif = model bu oyuncuyu istatistiğe göre aşağı çekiyor (Flagg +0.41, Knueppel +0.50, Edgecombe +0.58); negatif = yukarı çekiyor (Rollins −0.64, Sarr −0.27). Sıralamaya videodaki gibi `skor − λ·hype` olarak katılacak (λ = 0.40 / 0.65 / 0.80 duyarlılık).

### B8f. Sentetik hype: modelin kendi hatalarından öğrenilen ceza (`src/awards/mip_hype.py`)

**Mekanik (senin fikrin):** Üretim modeli (B2sh) her sezon sonunda "ilk 30 aday"ını listeler; gerçekte top-10 MIP finisher olmayanlar yanlış pozitif. H aşaması **geçmiş** sezonların ilk-30 listelerinde "hangi tip aday tutmuyor"u öğrenir (sezon öncesi özellikler: rookie yılında elit olma, seviye persantilleri, yaş, çıkış yaşı, tepe VORP, önceki MIP payı, modelin skoru). Hype = H'nin "bu aday büyük ihtimalle tutmaz" logiti (sezon içi z-skoru). Videodaki gibi: `skor' = skor − λ·hype`. Walk-forward: t sezonu için H yalnız t'den önceki sezonlarla eğitilir. Videodaki λ = 0.65 uydurmaydı; biz 0.40 / 0.65 / 0.80 / 1.2 / 2.0 duyarlılığıyla test ettik.

**Sonuç (ilk 10'dan kaçı gerçek top-10 finisher, liste başına):**

| λ | 2023–26 | 2011–26 | 2000–26 | ilk-3 (2000–26) |
|---|---|---|---|---|
| 0 (hype'sız) | 1.75 (7/40) | 1.62 | 1.70 | 0.63 |
| **0.40** | **2.00 (8/40)** | **1.81** | **1.85** | 0.67 |
| 0.65 | 2.25 (9/40) | 1.69 | 1.74 | 0.63 |
| 0.80 | 2.25 | 1.75 | 1.74 | 0.56 |
| 2.00 | 2.25 | 1.81 | 1.67 | 0.48 |

Hype katmanı videodaki gibi küçük bir iyileştirme veriyor (videoda 7 → 8; bizde 7 → 8 aynı dönemde) ama **istatistiksel olarak anlamlı değil**: λ = 0.40 için sezon başına fark +0.15 ± 0.14 (7 sezon iyileşti, 4 kötüleşti, 16 aynı); λ = 0.65 için +0.04 ± 0.16. Öğrenilen H katsayıları: ELITE_SOPH (rookie yılında VORP persantili ≥ 0.85) **negatif** (−0.29: bu tip aday beklenenden az tutuyor), ama SOPH (rookie yılını bitirmiş olmak) pozitif (+0.38) ve tepe VORP pozitif (+0.40).

**"Elit rookie sophomore'lar MIP kazanmaz" sezgisinin sınanması:**
- 1986'dan beri rookie yılında elit (VORP persantili ≥ 0.85) 66 sophomore: kazanan **0**, ilk 3: 4 (%6), ilk 10: 5 (%7.6). Güçlü (≥ 0.75) 145 oyuncu: kazanan 1. Yani tarihte bu gruptan kazanan çok az; ama bu grubun beklenen kazanma sayısı da zaten ~0.4 (genç oyuncu taban oranı %0.57), yani "hiç kazanmadı" taban orandan ayırt edilemiyor.
- Modelin top-10 finisher olasılığı bu grupta **kalibre** (2000–26'da elit 36 vaka: 4.8 beklendi, 4 oldu). Model ilk 10'unda bu gruptan 18 oyuncu seçti, 4'ü tuttu (%22; genel %17).
- Açık kural testi: "ilk 3 sezonunda tepe VORP ≥ 2.0 / 3.0 / 4.0 olan oyunculara −κ ceza": **isabet düştü** (2000–26: 1.70 → 1.30–1.52; eşik 4.0'da 1.63). Modelin ilk 10'unda SEASONS ≤ 3 ve tepe VORP ≥ 2.0 olan oyuncular daha **çok** tutuyor (%23.4, diğerleri %14.5); kazanan 3/77 (%3.9) ve diğerleri 5/193 (%2.6).
- **Sonuç:** Veri "genç ve zaten elit olan oyuncular daha az tutar" sezgisini top-10 finisher / ilk 3 / kazanan düzeylerinde **desteklemiyor** (küçük örneklem; kazanan sayıları 0–3). Ceza koymak geçmiş isabeti düşürüyor.

**2026-27 (λ = 0.40):** Harper, Sheppard, Clingan, Castle, Edgecombe, Knueppel, Flagg, Ware, Queen, Murray-Boyles; hype'sızda ilk 10: Harper, Sheppard, Flagg, Clingan, Castle, Knueppel, Ware, Edgecombe, Buzelis, Sarr. En yüksek hype (aşağı çekilenler): Daniels, Kyshawn George, J. Smith Jr., Black, Rollins; Buzelis ve Sarr hype ile 9.→14. ve 10.→11. sıraya düşüyor, sophomore'lar yükseliyor (modelin kendi hatalarından çıkan şey bu).

**Gerçek hype'ın rolü:** Sentetik hype geçmiş veriden "tutmaz" tipini öğrenir; **gerçek hype** (halkın ne beklediği: YouTube yorumları) geçmişte yok, yalnız 2026'dan itibaren toplanabilir. Bu yüzden senin sezginin ölçülebilir hâli (herkes zaten Flagg'e inanıyorsa MIP oyu "sürpriz" olmaz) ancak gerçek hype ile ileriye dönük test edilebilir. Videodaki λ da geçmişte öğrenilmemişti.

### B8g. "Sentetik hype neden 2011-12'yi düzeltemiyor?" (tavan analizi)

**Soru (senin):** 2011-12'de isabet 1/10; tahmin sırası ile gerçek MIP sırası çok farklı. Hype bunu neden düzeltmiyor?
**Cevap:** Hype bir **yeniden sıralayıcı**; yalnızca modelin ilk 30 adayı arasında yer değiştirir, listeye yeni aday ekleyemez. 2011-12'de gerçek ilk 10'dan **yalnız 3'ü** (Anderson 13., Monroe 7., Teague 18.) modelin ilk 30'undaydı; kalan 7'si (İlyasova 69, Peković 198, Bynum 55, Lin 190, Dragić 63, Bradley 171, Green 220) model için aday bile değildi. **Mükemmel bir hype ile bile tavan 3/10**; biz 1 aldık (Monroe).

**Tavan analizi (2010-11 → 2025-26, liste başına ortalama; gerçek top-10 finisher'dan):** modelin ilk 10'unda 1.62, ilk 30'unda **3.19**, ilk 50'sinde 4.94. Yani mükemmel hype ile tavan 3.19; biz 1.81. Hype'ın kurtarabileceği en çok ~1.4 isabet/liste, ve bu mükemmel bir hype gerektirir. Asıl darboğaz **aday havuzu (recall)**, sıralama değil.

**Neden 7 oyuncu kaçıyor (2011-12 örneği):** Gerçek ilk 10'un çoğu **yedek ve düşük dakikalı** oyuncular (Bradley 5.2 dk, Lin 9.8 dk, Green 11.5 dk, Peković 13.6 dk, Dragić 17.6 dk) ve çoğunun önceki sezon BPM'i negatif. Kimin dakikasının açılacağı (sakatlık, takas, lockout kısa sezonu) sezon öncesi kutu skoru geçmişinden okunamıyor; daha önce denediğimiz takım değişimi / ayrılan dakika özellikleri bu bilgiyi yakalayamadı (B8b). Model ise tam tersi arketipi seçiyor: genç, yüksek dakikalı, zaten üretken (Holiday, Wall, Harden, Jennings, Cousins, Curry) ve bunların çoğu bir önceki sezon zaten iyiydi (Curry VORP persantili 0.92, Jennings 0.86); MIP "zaten iyi" olanı değil sıçrayanı ödüllüyor.

**Hype neden bunları aşağı çekmiyor:** H aşaması geçmişte ilk 30'daki bu tipin (genç, yüksek dakikalı) genel olarak **iyi tuttuğunu** öğrenmiş (2010-11'de Love, Rose, Westbrook, Holiday dördü birden tuttu). 2011-12 (kilitlenme sezonu, 66 maç) bu kuralın dışında kalan bir yıl. Bu bir **örneklem varyansı**: tek sezonun hatası tarihin ortalamasını değiştirmez. Hype tüm sezonlarda ölçüldüğünde ilk-30 içinde bu tipin tutma oranı genel ortalamanın üstünde.

**Pencereyi büyütmek yardım etmiyor:** H'nin öğrendiği/yeniden sıraladığı pencere K = 10 / 20 / 30 / 50 / 80 / 120 denendi (λ = 0.4, 0.8, 1.5): en iyisi K = 30, λ = 0.4 (2000–26'da +0.15 ± 0.14, anlamlı değil); K = 50 ve üstü fark yaratmıyor (±0.00 ile −0.15 arası). Yani özellik kümemiz geniş havuzda "tutan"ı "tutmayan"dan ayırt etmiyor.

**Sonuç:** 2011-12'deki fark kusur değil, bu yaklaşımın tavanı: sezon öncesi kutu skoru bilgisi bu tip yedek-oyuncu sıçramalarını görmüyor; hype yalnız sıralar. Yukarı çıkmak için ya (1) aday üretimini değiştirmek (dakika açılma sinyali: gerçek sakatlık / takas / kadro verisi) ya da (2) dışarıdan gelen bilgi (gerçek hype: yorumlar, gazeteci tahminleri) gerekir.

### B9a. Mekanik diğer ödüllere genişletildi: MVP, DPOY, 6MOY (`src/awards/award_run.py`)

**Genişletilen:** Veri çekimi (`fetch_awards --awards`: tek sayfadan MVP, ROY, DPOY, 6MOY, MIP, Clutch, COY oy tabloları) → ödül-bağımsız veri seti (`mip_data.py award=`; ek ölçüler DBPM, OBPM, WS, STL36, BLK36, TOV%; `PREV_SHARE` = bir önceki sezonun oy payı) → ödüle özgü özellik kümesi + aynı walk-forward + küçültme + sentetik hype (λ = 0.4) → videonun ölçütü.
**Özellik kümeleri:** Ortak: yaş, seviye persantilleri, büyüklük, tarihçe, küçültülmüş hızlar, önceki sezon oy payı. MVP: + WS, OBPM, PTS/AST persantilleri, usage. DPOY: + DBPM, STL36, BLK36, TRB% persantilleri. 6MOY: + takım içi dakika payı ve sırası, OBPM, PTS36.

**Sonuç (ilk 10 tahminden kaçı gerçek top-10 finisher; liste başına ortalama; 2000–26):**

| Ödül | Model | Model + hype (λ = 0.4) | Geçen yılın oy payı | Geçen yılın VORP pers. | Genç + üretken | Rastgele | Kazanan ilk 10'da / ilk 3'te |
|---|---|---|---|---|---|---|---|
| **MVP** | 6.07 | **6.19** | 5.89 | 5.26 | 2.30 | 0.19 | %89 / %70 |
| **DPOY** | 4.74 | **4.78** | 4.59 | 2.15 | 1.48 | 0.22 | %85 / %52 |
| **6MOY** | 2.22 | 2.15 | 2.44 | 0.07 | 0.19 | 0.07 | %35 / %27 |
| MIP (referans) | 1.70 | 1.85 | - | - | 1.04 | 0.17 | %26 / %7 |

**Okuma:**
- **MVP ve DPOY öngörülebilir ödüller:** Sezon öncesi bilgiyle ilk 10'un 6'sı (MVP) ve ~4.7'si (DPOY) gerçek top-10; kazanan %85–89 ihtimalle ilk 10'da. Ama **geçen yılın oy payı** tabanı zaten 5.9 / 4.6 veriyor: kazanç modelde değil **süreklilikte** (MVP ve DPOY'u önceki yıl zirveye yakın olanlar alıyor). Model bunu +0.2 / +0.15 geçiyor (hype ile +0.11 ± 0.06 ve +0.04 ± 0.06, anlamlı değil).
- **6MOY zayıf (2.2/10):** Rol (yedekte oynamak) sezon öncesi bilinmiyor; geçen yılın oy payı modelden iyi (2.44). Hype faydasız (−0.07 ± 0.07). Maç başlangıç sayısı (GS) elimizde yok; bunu çekmek ve "yedek mi" bilgisini eklemek sıradaki adım.
- **Hype'ın yeri:** Süreklilik ödüllerinde (MVP, DPOY) hype zaten yüksek olasılıklı adayları sıralıyor; "bariz olanı cezalandırma" fikri burada anlamsız (bariz aday gerçekten kazanır). MIP'te işe yarayan ceza mantığı bu ödüllerde yok.

**2026-27 ilk 10:**
- **MVP:** Jokić, Gilgeous-Alexander, Wembanyama, Dončić, Cunningham, Giannis, J. Johnson, LeBron, Şengün, Edwards.
- **DPOY:** Wembanyama, Holmgren, Gobert, Daniels, Mobley, A. Thompson, Bridges, Barnes, Am. Thompson, Wallace.
- **6MOY:** K. Johnson, Jaquez, Reid, Beasley, Herro, Monk, Hyland, Sexton, Pritchard, Quickley.

**Kapsam dışı / sonra:** Clutch POY (yalnız 4 sezon: walk-forward için yetersiz), COY (koç düzeyi; tablo koç adı sütunuyla geliyor, ayrıca ayrıştırılacak), All-NBA / All-Defense / All-Rookie (oy payı yerine takım yerleşimi; pozisyon kısıtı), ROY (çaylaklar önceki sezonu olmadığı için ayrı veri yapısı: draft sırası, kolej/uluslararası; draft verisi çekiliyor).

### B9b. ROY (`src/awards/roy.py`): ayrı veri yapısı

**Neden ayrı:** Çaylakların önceki sezonu yok; satır = o sezon ilk NBA sezonunu oynayan oyuncu. Sezon öncesi bilgi yalnız: draft sırası (`LOG_PICK`, lotarya, ilk 3), kolej / uluslararası, sezon başı yaş, draft ile ilk sezon arası yıl ("stash"), takımın açılan dakikası. Kaynak: B-Ref draft sayfaları (1984–2026, 43 sınıf) + yaş dosyaları.

**Sonuç (2000–26; ilk 5 tahminden kaçı gerçek top-5 finisher):**

| | Model | Yalnız draft sırası | Rastgele |
|---|---|---|---|
| Top-5 finisher (5 tahminde) | 2.56 | **2.63** | 0.22 |
| Top-10 finisher (10 tahminde) | 4.44 | 4.37 | 0.93 |
| Kazanan model 1.'si / ilk 3 / ilk 5 | %38 / %62 / %81 | %42 / %65 / %81 | - |

**Okuma:** ROY neredeyse tamamen **draft sırası**: ek özellikler (yaş, kolej, takımın açılan dakikası) taban çizgisini geçmedi (2.56 vs 2.63; fark gürültü). Kazanan çoğunlukla ilk 3 pick'ten (%62–65). Burada sentetik hype'a gerek yok: pick zaten hype'ın kendisi.
**2026-27 ilk 10 (draft sırası):** Dybantsa (#1), Peterson (#2), Boozer (#3), Wilson (#4), Wagler (#5), Brown Jr. (#6), Acuff Jr. (#7), Flemings (#8), M. Johnson Jr. (#9), Burries (#10).
**Eksik:** Kolej istatistikleri (üretim, yaş, kolej seviyesi) ve uluslararası oyuncular için lig verisi yok; bunlar eklenirse pick'in ötesine geçmek mümkün. Takım fırsatı (açılan dakika) sezon öncesi 2026 kadrosu bilinmediği için 2026-27 satırlarında boş.

### B9c. Diğer ödüller için plan (önceki durum; güncel durum B9e'de)

| Ödül | Durum | Sıradaki eksik |
|---|---|---|
| MVP | ✅ 6.2/10, kazanan ilk 10'da %89 | Takım başarısı (galibiyet): sezon öncesi bilinmiyor, simülasyonla tahmin edilebilir; takım galibiyet tahmini eklenmeli |
| DPOY | ✅ 4.8/10, kazanan ilk 10'da %85 | Takım savunma reytingi, blok/çalma tipi büyüme, pozisyon (pivot ağırlığı) |
| 6MOY | 🔶 2.2/10 zayıf | `GS` (başlangıç sayısı) çekilmeli; "yedek mi" rolü sezon öncesi bilgisi; geçen yılın oy payı modeli geçiyor |
| ROY | ✅ pick taban çizgisinde (2.56 vs 2.63) | Kolej / uluslararası lig istatistikleri |
| Clutch POY | ⏳ | Yalnız 4 sezon etiketli: walk-forward yok; clutch maç verisi (`clutch` tracking) gerekir |
| COY | ⏳ | Koç düzeyinde: oy tablosu koç adı sütunuyla geliyor (ayrıştırılacak); hedef = takım galibiyeti beklentisine göre sürpriz; **takım simülasyonumuz doğal uyum** |
| All-NBA / All-Defense / All-Rookie | ⏳ | Oy payı yerine takım yerleşimi + pozisyon kısıtı (2 G, 2 F, 1 C); B-Ref "leading_all_*" tablolarında oy puanı var |

### B9d. Uygulama planı (2026-10-11; sırayla)

**Kararlar (senin):** MVP ve DPOY adaylarına yüzde verilsin; Herro 6MOY listesinde olmamalı (yedekten gireceğini düşünmüyorsun) → GS verisi çekilsin; ROY'a kolej istatistikleri sürekli hâle getirilsin; koç verisi eklensin (COY); **Clutch POY yapılmayacak**; All-NBA ve All-Defense eklensin; MVP/DPOY için önerdiğim takım başarısı özelliği yapılsın.

| Sıra | İş | Veri | Çıktı | Durum |
|---|---|---|---|---|
| 0 | Veri çekimi: GS (`games_started`), takım gücü (W, L, MOV, SRS, ORtg, DRtg), koçlar, All-NBA / All-Defense / COY oy tabloları, NCAA 2008-09 → 2015-16 | B-Ref + Torvik | `bref_gs`, `team__`, `coach__`, `awards__allnba/alldef/coy`, `ncaa__*` | 🔶 çekiliyor |
| 1 | **MVP ve DPOY**: takım başarısı özelliği (geçen sezonun galibiyet yüzdesi, SRS, ORtg/DRtg; takım değiştiyse yeni takım) + **aday yüzdeleri** (kazanma, ilk 3, ilk 5, ilk 10 olasılığı; kalibre) | takım verisi | model + yüzdeli liste | ⏳ |
| 2 | **6MOY**: GS özellikleri (geçen sezon başlangıç oranı, kariyer başlangıç oranı, yedek rolü); uygunluk: sezonun çoğunda yedek | `bref_gs` | model + Herro gibi başlangıç oyuncularının elenmesi | ⏳ |
| 3 | **All-NBA ve All-Defense**: etiket = takıma girmek (1., 2., 3. takım; 15 / 10 kişi); pozisyon kısıtı (2 G, 2 F, 1 C) | `awards__allnba/alldef` | P(takıma girme), liste | ⏳ |
| 4 | **COY**: koç özellikleri (kıdem, franchise kıdemi, geçen sezon galibiyet, takım gücü değişimi); hedef: galibiyet beklentisine göre sürpriz | `coach__`, `team__` | P(COY) | ⏳ |
| 5 | **ROY**: kolej istatistikleri ve prospect notu (draft sınıfı ↔ NCAA sezonu eşleme), uluslararası oyuncular için lig verisi (EuroLeague / G-League) | `ncaa__*`, `prospect.py` | draft sırasını aşan model | ⏳ |

**İlkeler:** Her adımda videonun ölçütü ve tabanlar (geçen yılın payı, draft sırası); eşit çıkarsa "eşit" yazılır. Eksik veri (örn. GS'in olmadığı eski sezonlar) sıfır değil "bilinmiyor" olarak işlenir. Rehber her adımda güncellenir.

### B9e. Plan yürütüldü (2026-10-11): sonuçlar ve güncel durum

Rapor: `docs/AWARDS_2026-27_CANDIDATES.md` (`python -m src.awards.report`). Tüm ödüller walk-forward; ölçüt: modelin ilk 10'u (All-NBA'de 15'i) içinden gerçek finisher / takım üyesi sayısı.

| Ödül | Eklenen | Sonuç (2000–26) | Taban | Durum |
|---|---|---|---|---|
| **MVP** | Takım başarısı (geçen sezon galibiyet %, SRS, ORtg/DRtg; yeni takım) + aday yüzdeleri | 6.07 / 10 (değişmedi: takım özelliği +0.00 ± 0.09) | geçen yılın payı 5.89 | ✅ yüzdeli liste; takım özelliği katkısız olduğu için sade sürüm kullanılıyor |
| **DPOY** | Aynı | 4.74 / 10 (takım özelliği +0.00 ± 0.11) | geçen yılın payı 4.59 | ✅ yüzdeli liste |
| **6MOY** | **GS** (geçen sezon / bir önceki / kariyer başlangıç oranı) + yedek süzgeci | **2.67 / 10** (GS'siz 2.22; **+0.44 ± 0.15**); kazanan ilk 10'da %35 → **%54**, medyan sıra 39 → **9** | geçen yılın payı 2.44 | ✅ Herro (geçen sezon başlangıç oranı %85) listeden düştü |
| **All-NBA** | Oy tablosu (takım etiketi), takıma girme olasılığı, pozisyonlu dizilim | **9.19 / 15** (2011–26: 8.62; 2023–26: 7.75) | geçen yıl takımdaydı 8.85 (+0.33 ± 0.23) | ✅ 3 takım dizilimi + yüzdeler |
| **All-Defense** | Aynı | **5.52 / 10** (2023–26: 3.0) | geçen yıl takımdaydı 5.30 | ✅ |
| **COY** | Koç tablosu (kıdem, franchise kıdemi, geçen sezon takım gücü) + yaz yetenek değişimi | 4.56 / 10 (30 koç içinden; yetenek değişimi +0.26 ± 0.20); kazanan ilk 10'da %41 | rastgele 2.6; geçen sezon galibiyet % 4.37 | 🔶 zayıf, tabanın biraz üstü |
| **ROY** | Kolej istatistikleri (Torvik 2008-09 → 2025-26; 40 dk üretim, BPM, yaş, lig gücü, boy); draft sınıfı ↔ NCAA sezon eşlemesi (katlanmış ad) | top-5/5: 2.54–2.69 vs yalnız pick 2.62 (2014–26; **tutarlı kazanç yok**) | draft sırası 2.63 | 🔶 hat sürekli çalışıyor; pick'in ötesine geçmedi |
| **Clutch POY** | Yapılmayacak (kararın) | - | - | ⛔ |
| **MIP** | (önceki) | 1.85 / 10, 8/40 | genç + üretken 1.04 | ✅ |

**Yüzdeler (MVP, DPOY, 6MOY):** P(kazanır) kalibre softmax (sezon içinde toplamı 1; β walk-forward kazanan olabilirliğiyle seçildi); P(ilk 3 / 5 / 10) walk-forward puanlardan doğrudan Platt kalibrasyonu, tutarlılık için P(kazanır) ≤ P(ilk 3) ≤ P(ilk 5) ≤ P(ilk 10). Bir kalibrasyon sorunu bulundu ve düzeltildi: Plackett-Luce ile türetilen üst-k olasılıkları, kazanan için kalibre edilen sıcaklıkla DPOY'da düşük kalıyordu (ilk-10 isabeti beklenen 2.45 ↔ gerçek 4.74). Güncel model için ilk-10 toplamı gerçeğe yakın.
**Takım başarısı özelliği neden fayda vermedi:** MVP ve DPOY'u önceki yılın oy payı ve oyuncu seviyesi zaten belirliyor; geçen sezonun takım galibiyeti bunların üstüne bir şey eklemiyor. Takım başarısının *tahmini* (simülasyonla) bu testte yer almadı: tarihsel olarak geriye dönük simülasyon yalnız 3 sezon.
**Eksik verinin sınırı:** 2023–26 All-NBA / All-Defense örnekleri küçük (4 sezon); varyans yüksek.

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
| Kazananı yakalamak için yeni yöntem (sıralama kaybı, yeni özellikler, GBM) | ✅ Denendi, kazanç yok (B8c); sezon öncesi tavan ~3/10 isabet |
| Üst sınır testi (gerçekleşen sezon içi gelişme) | ✅ NDCG 0.675, kazanan ilk 10'da %89: asıl ürün canlı takip |
| Videonun ölçütüyle yan yana (4 sezon × ilk 10, gerçek top-10 finisher) | ✅ B2sh 7/40 = videodaki 7/40 (2011–26: 1.62, 2000–26: 1.70/liste); küçültme (shrinkage) eklendi |
| Hedef: 10 breakout adayı etiketi (yan dal) | ✅ Ölçüldü (B8d), ürün değil |
| Sentetik hype (modelin ilk-30 yanlış pozitiflerinden öğrenilen, `skor − λ·hype`) | ✅ Kuruldu, ölçüldü (B8f): λ = 0.4'te 8/40 ve 2000–26'da 1.70 → 1.85; anlamlı değil (+0.15 ± 0.14); sezgi (elit sophomore'lar) veride desteklenmedi |
| Hype kararı | ✅ Sentetik hype λ = 0.4 varsayılan (`mip_hype.DEFAULT_LAMBDA`, `python -m src.awards.mip_hype --predict`); gerçek hype sonra |
| Diğer ödüller: mekanik genişletildi (MVP, DPOY, 6MOY) | ✅ B9a: MVP 6.2/10 ve DPOY 4.8/10 isabet (kazanan ilk 10'da %89 / %85), 6MOY zayıf 2.2/10 |
| ROY (draft verisiyle) | ✅ `src/awards/roy.py`: draft sırası tabanını geçmiyor (2.56 vs 2.63); ROY neredeyse tamamen pick (B9b) |
| COY, All-NBA, All-Defense | ✅ B9e: koç verisi, yetenek değişimi, takım etiketi; All-NBA 9.2/15, All-Defense 5.5/10, COY 4.56/10 (zayıf) |
| 6MOY GS verisi ve yedek süzgeci | ✅ +0.44 ± 0.15 (2.22 → 2.67); Herro listeden düştü |
| MVP/DPOY yüzdeleri ve takım başarısı özelliği | ✅ yüzdeli liste; takım özelliği katkısız (+0.00) |
| ROY kolej istatistikleri | 🔶 sürekli hat kuruldu (NCAA 2008-09 → 2025-26); pick'i geçmedi |
| Clutch POY | ⛔ yapılmayacak (kararın) |
| All-Rookie | ⏳ yapılmadı (ROY pick'ine bağlı; isteğe bağlı) |
| 2026-27 ödül aday raporu (yüzdelerle) | ✅ `docs/AWARDS_2026-27_CANDIDATES.md`, `python -m src.awards.report` |
| Çevrimdışı testler (oy tablosu, slug, ölçüt, hype sızıntısı) | ✅ `tests/test_awards_mechanics.py` (6) + `test_awards_hype_real.py` (11) |
| Gerçek hype hattı (YouTube yorumları + Claude sınıflandırması): kod ve testler | ✅ `src/awards/hype_real.py`, 11 test (çevrimdışı, sahte yorum/sınıflandırıcı) |
| Gerçek hype: yorumların çekilmesi ve sınıflandırılması | ⏳ YouTube API anahtarı, Anthropic API anahtarı ve 6–8 video seçimi gerekli |
| Breakout etiketinin tanımı (seçenek 1–4, B8d) | ⏸ Yan dal; ürün hedefi videonun ölçütüne döndü (B8e) |
| Canlı MIP takibi (kısmi sezon: 20 / 40 / 60 maç testi, güncelleme hattına bağlama) | ⏳ Sonra (Aşama 8) |
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
| MIP tahmin ↔ gerçek tablosu (2010-11 → 2025-26, λ = 0.4) | `docs/MIP_PREDICTIONS_VS_ACTUAL_2011_2026.md` |
| Diğer ödüller | `src/awards/award_run.py` (MVP, DPOY, 6MOY), `team_awards.py` (All-NBA, All-Defense), `coy.py`, `roy.py`, `report.py`; veri: `awards__{ödül}_voting.parquet`, `draft__{yıl}.parquet`, `{sezon}__bref_gs.parquet`, `team__{sezon}.parquet`, `coach__{sezon}.parquet`, `ncaa__{sezon}__player_scores.parquet` |
| 2026-27 ödül aday raporu (yüzdelerle) | `docs/AWARDS_2026-27_CANDIDATES.md` |
| Gerçek hype hattı | `src/awards/hype_real.py` |
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

### Aşama 6: Teşhis ve ikinci tur: "özellik eklersek düzelir mi?"
- **Teşhis (veriyle):** Kazananların yaşı 20–26 arasında dengeli dağılırken modelin ilk 10'unun **%81'i 21 ve altı**. Model ayrıca bir önceki yıl zaten çok gelişmiş oyuncuları seçiyor (dakika +5, BPM +1.5); kazananlar ise önceki yıl sıçrama yapmamış (BPM değişimi 0.0). Yani model "momentum"u kovalıyor, MIP sürprizi ödüllendiriyor.
- **Senin hipotezin:** Özellikler az; birkaç özellik eklenirse yaşın ağırlığı azalır, ilk 6–7 pick'in ikinci yılları listeyi doldurmaz. Sentetik hype kurulmadığı için de olabilir.
- **Denenen (src/awards/mip_rank.py):** (a) yaş kutucukları (8 sınıf), (b) yeni özellikler: takım içi dakika payı ve sırası, sağlık (maç oranı), çıkış yaşı, geçmiş seviyeler, ek persantiller, takım değişimi, (c) hedefi "kim kazanır" yapan sıralama kaybı (ListNet; kazanan en çok kütleyi alır), (d) gradyan artırma (GBM).
- **Sonuç (2000–2026, çiftli sezon farkı, NDCG@10): hiçbiri anlamlı iyileştirme getirmedi.** ListNet − tek tek lojistik: −0.004 ± 0.029; yeni özellikler (v2) − yaş kutucukları: +0.025 ± 0.022; GBM − ListNet: −0.001 ± 0.032. En iyi ikinci tur modeli (NDCG 0.138) ilk turu (0.142) geçemedi.
- **Yaş yığılması azalmadı, arttı:** Yaş kutucuklarıyla ilk 10'un %97'si ≤ 21 yaş. Sebep model hatası değil, **taban oran**: 21 yaşında dakika alan oyuncunun oylamaya girme olasılığı gerçekten yüksek (katsayılar: 21 yaş +0.136, ≤20 +0.089, 22 +0.081). İlk 10 kişi başına en yüksek olasılıkları seçtiği için gençleri seçiyor; kazananlar ise sayıca çok olan 22–26 yaş grubundan, ama tek tek düşük olasılıkla. Yaşı tamamen çıkarınca (`noage`) NDCG 0.138 → 0.087: yaş gerçekten bilgi taşıyor.
- **Sentetik hype:** Hype şu an yalnızca teşhis çıktısı, sıralamada kullanılmıyor; sıralamaya katmak (B0 − üretim logiti cezası) denenecek, ama özellik eklemeyle elde edilen sonuç hype'ın da büyük bir sıçrama yapmayacağına işaret ediyor.
- **Asıl bulgu: üst sınır testi.** Aynı çerçeveye, hedef sezonda **gerçekleşen** gelişmeyi (BPM, sayı, dakika, usage değişimi) verince: kazanan %89 ilk 10'a, %70 ilk 3'e giriyor, medyan sıra 2, NDCG 0.142 → **0.675** (fark +0.533 ± 0.043). Son 8 sezon kazanan sırası: 2, 7, 4, 1, 1, 5, 2, 2.
- **Ders:** MIP sezon öncesi bilgiyle tahmin edilebilecek bir ödül değil, **sezon içinde okunabilecek** bir ödül. Sezon öncesi özellik eklemek tavana (yaklaşık 3/10 isabet, kazananı bulamama) yakın; geri kalanı sezonun kendisi söylüyor. Tahmin yerine **canlı takip** doğru ürün (sezon içi güncellemelerimiz zaten saatlik çalışıyor).

### Aşama 7: Hedefi netleştirmek: "kazanan" değil "10 breakout adayı"
- **İstek (senin netleştirmen):** MIP sezon içi okunur, ama asıl ürün sezon öncesi 10 breakout adayı: çoğu yıl sonunda kazanan olmasa bile listeye girsin.
- **Problem:** Ölçütümüz kazananı arıyordu (kazanan sırası 20–150). Yeni hedefe uygun bir etiket gerekti.
- **Çözüm:** `BREAKOUT` etiketi: oylamada pay almak YA DA sezonun en çok gelişen ilk 12'sinde olmak (`dVORP82`). Ölçüt: 10 kişilik listeden kaçı tuttu.
- **Bulgu 1:** Katı etikette 10'da ~2 isabet (rastgele 0.33); 4+ isabet olan sezon oranı %7–19.
- **Bulgu 2 (takas):** "Breakout" tanımı genişledikçe isabet artıyor (ilk 12: 2.1, ilk 25: 3.0, ilk 50: 3.9, ilk 75: 5.1 /10). "Çoğu tutsun" ancak tanım genişse mümkün.
- **Bulgu 3:** Simülasyon artışı bu hedefte ek bilgi vermedi (3 sezonda 0.33/10; harman da geçmedi).
- **Bulgu 4 (sentetik hype etiketi):** Elit oyuncuları dışarıda bırakınca liste, üst sıradan seçilen ve düşük BPM'li genç ikinci yıllarla doldu: tam senin kaygın. İsabet aynı (1.9–2.3).
- **Ders:** Ürünün başarı ölçütünü (neyi "doğru" sayıyoruz) modelden önce netleştirmek, aynı veriyle 2 ile 5 isabet arasındaki farkı yaratıyor. Karar ürün tarafında.
- **Durum:** 🔶 Karar bekliyor (B8d, seçenekler 1–4).

### Aşama 8: Videoya geri dönüş (senin düzeltmen)
- **Problem:** Hedefi "10 breakout adayı" diye genişletip kendi etiketimizi (en çok gelişen ilk 12) icat ettik. Videodan uzaklaştık, anlamsız bir ölçüt üretmeye başladık ve "2 isabet" gibi videodan kötü görünen bir sayı çıktı. Gerçekte video "10'da 7" demiyor, "40 tahminde 7" diyor.
- **Teşhis:** Videoyu satır satır yeniden okuduk: ölçüt 4 sezon × ilk 10 = 40 tahminde gerçek top MIP finisher sayısı (hype'sız 7, birleşik 8); taban "genç + üretken" ve "son yıl gelişimi"; kazanım küçültme, sade özellik kümesi ve önceki fold'lardan geliyor; hype yalnız yeniden sıralıyor. Bizim eski ölçütümüz (oylamaya giren, 2000–2026) farklıydı.
- **Çözüm:** Aynı ölçüt, aynı 4 sezon, sonra daha uzun dönemler. Küçültmeyi (dakikaya göre sezon ortalamasına çekme) üretim modeline aldık.
- **Sonuç:** Üretim modeli 2023–26'da tam 7/40 (1.75), 2011–26'da 1.62, 2000–26'da 1.70; taban 1.0–1.25. **Videoyla aynı seviye.** Videonun 7'si ile bizim 5–7 arasındaki fark dört sezonluk örneklemin gürültüsü.
- **Ders:** Kıyas yaparken ölçütü, dönemi ve örneklemi birebir eşlemek şart: bizim "10'da 3" ve videonun "40'ta 7" farklı şeylerdi. Ürün hedefini (breakout) modelden önce kendi icat ettiğimiz bir etikete bağlamak, doğrulanmış bir hattan sapmak demekti. Breakout etiketi yan dal olarak duruyor (B8d), ürün değil.
- **Sıradaki:** Videodaki hype katmanını eklemek: önce sentetik (veriden), sonra gerçek (YouTube yorumları + Claude sınıflandırması); sıralama `skor − λ·hype`.

### Aşama 9: Sentetik hype: sezgi ile veri ayrıştı
- **İstek (senin):** Harper, Flagg, Knueppel, Edgecombe gibi rookie yılında elit olan sophomore'lar tarihte MIP kazanmaz; bizim farkımızı sentetik hype yaratsın.
- **Kurulan:** Modelin ilk-30 listesindeki yanlış pozitiflerden öğrenen ikinci aşama (`mip_hype.py`); sıralama `skor − λ·hype`.
- **Bulgu 1 (olumlu):** Videodaki gibi küçük bir iyileşme: 7/40 → 8/40 (λ = 0.4), 2000–26'da 1.70 → 1.85 liste başına. Ama anlamlı değil (+0.15 ± 0.14).
- **Bulgu 2 (sezgiyle ters):** Model bu sophomore'ları cezalandırmadı, yükseltti: modelin kendi hatalarından öğrendiği şey "sophomore'lar ilk 30'da ortalamadan çok tutuyor" oldu. Elit rookie sophomore'lar için model kalibre; bu grup tarihte 66 oyuncuda 0 kazanan veriyor ama beklenen zaten ~0.4.
- **Bulgu 3:** Açık bir ceza kuralı ("ilk 3 sezonunda zaten elit olana −κ") geçmişte isabeti düşürdü (1.70 → 1.30–1.52). Bu tip oyuncu modelin ilk 10'unda daha çok tutuyor (%23 vs %14.5).
- **Ders:** Sezgiyi modelin içine sokmadan önce geçmişe karşı ölçmek zorunlu; ölçüm yanıtı bazen "sezgi örneklemde yok" olur. Küçük sayılarda (kazanan: 0 / 66) hem "kanıtlandı" hem "çürütüldü" demek haksızlık olur.
- **Karar noktası:** (a) veriden öğrenilen hype'ı (λ = 0.4) kullan, ya da (b) editoryal bir katman ekle ve bunu açıkça "editoryal" etiketle (geçmiş isabet maliyeti ölçüldü), ya da (c) gerçek hype'ı topla ve sezgiyi 2026-27'de ileriye dönük test et.

### Aşama 9b: "Hype neden 2011-12'yi düzeltmiyor?" (senin sorun)
- **Problem:** 2011-12'de isabet 1/10; tahmin ve gerçek sıralama arasındaki fark çok büyük, hype bunu düzeltmiyor.
- **Teşhis:** Hype yalnız modelin ilk 30'unu yeniden sıralar. O sezon gerçek ilk 10'dan yalnız 3'ü ilk 30'daydı; mükemmel hype ile tavan 3/10. 16 sezon ortalaması: gerçek ilk 10'dan ilk 10'da 1.62, ilk 30'da 3.19, ilk 50'de 4.94. Darboğaz sıralama değil, aday havuzu.
- **Neden kaçıyor:** Kaçırılanlar düşük dakikalı yedek oyuncular (Bradley 5 dk, Lin 10 dk, Green 12 dk); rol açılması sezon öncesi kutu skorundan okunamıyor.
- **Denenen çare:** Hype penceresini 10–120 arasında genişletmek: fayda yok (±0.00 ile −0.15).
- **Ders:** Bir yeniden sıralayıcıyı değerlendirmeden önce tavanını (mükemmel sıralamayla elde edilebilecek en iyi sonuç) hesaplamak, beklentiyi doğru koyar: bu durumda bizim 1.81'imiz, tavan 3.19'un yarısından fazla.

### Aşama 10: Gerçek hype hattı (kod hazır, anahtar ve video bekliyor)
- **İstek:** Videodaki gerçek hype indeksi: YouTube yorumları → anlam sınıflandırması → oyuncu başına halkın beklentisi.
- **Kurulan (`src/awards/hype_real.py`, 11 testle):** (1) yorum çekimi: YouTube Data API v3 resmî uç noktası, sayfalı; (2) oyuncu eşleştirme: tam ad her zaman, soyadı yalnız havuzda tekil ve yaygın olmayan soyadıysa (Williams, Black gibi belirsizler bağlanmaz), aksan katlama, takma ad sözlüğü; (3) Claude ile (yorum, oyuncu) başına anlam sınıfı: gelecek beklentisi / zaten kanıtlandı / şüpheci / ilgisiz + güven; (4) küçültme: oyuncunun kaynaktaki skoru kaynağın normal beklenti düzeyine doğru çekilir (tek yorum +1 olmaz); (5) eksik veri ≠ sıfır hype; güçlü iddia için ≥ 10 ilgili yorum ve ≥ 2 kaynak; (6) `skor' = skor − λ·hype_z`, hype'ı bilinmeyen oyuncu cezasız ve işaretli.
- **Gizlilik ve koşullar:** Yorum metni saklanmaz; yalnız (video, yorum kimliğinin özeti, oyuncu, sınıf, güven) yazılır. Anahtarlar ortam değişkeninden (`YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`).
- **Problemler (testte yakalandı):** Yaygın / çift soyad yanlış oyuncuya bağlanıyordu (`Williams`) → tekillik ve durdurma listesi; Claude cevabı JSON dışına metin ekleyebiliyor ya da yorumda olmayan oyuncu uydurabiliyor → köşeli parantez içindeki JSON ayrıştırılır, yorumda anılmayan oyuncu ve geçersiz sınıf elenir.
- **Henüz yapılmadı:** Gerçek yorumlar çekilmedi (YouTube API anahtarı ve video listesi gerekiyor); Claude çağrısı yok. Gerçek hype geçmişte olmadığından λ veriyle öğrenilemez; 2026-27 sonuçlarıyla ileriye dönük değerlendirilecek.
- **Durum:** 🔶 Anahtar ve video seçimi bekleniyor.

### Aşama 11: Mekaniği diğer ödüllere genişletmek (MVP, DPOY, 6MOY, ROY)
- **İstek:** MIP'te oturan mekaniği (walk-forward, küçültme, sentetik hype) tüm NBA ödüllerine genişlet.
- **Yaklaşım:** Veri kurucusunu ödül-bağımsız yaptık (tek sayfadan tüm oy tabloları; ödül parametresi; `PREV_SHARE`), ödüle özgü özellik kümeleri, aynı değerlendirme (videonun ölçütü).
- **Bulgu 1:** MVP (6.2/10) ve DPOY (4.8/10) iyi öngörülüyor, ama **geçen yılın oy payı** tabanı neredeyse aynı (5.9 ve 4.6): bu ödüller süreklilik ödülleri; model tabanı ancak +0.2 geçiyor. Hype burada anlamlı bir fark yaratmadı.
- **Bulgu 2:** 6MOY zayıf (2.2/10) ve geçen yılın oy payı modeli geçiyor: yedek rolü sezon öncesi bilinmiyor. Eksik ölçü: başlangıç sayısı.
- **Problem (ROY):** Çaylakların önceki sezonu olmadığı için aynı veri yapısına girmedi. → Ayrı çaylak veri seti (draft sırası, kolej, yaş, takım fırsatı). Bu sırada iki veri hatası: (1) draft tablosunda oyuncu bağlantısı yoktu ve tüm oyuncular tek bir "boş" satırda birleşiyordu (hepsi pick 1 görünüyordu; ROY modeli draft sırası tabanından kötü çıktı) → slug oyuncu hücresindeki bağlantıdan çıkarıldı; (2) tablo içi başlık satırı ("Player") oyuncu sayıldı → süzüldü.
- **Sonuç (ROY):** Model draft sırası tabanını geçemedi (2.56 vs 2.63). ROY neredeyse tamamen pick.
- **Ders:** Tabanları (geçen yılın payı, draft sırası) model kadar özenle kurmak, "modelimiz işe yarıyor" ile "modelimiz zaten bilinen şeyi söylüyor" arasındaki farkı gösteriyor; süreklilik ödüllerinde fark ancak ek, bağımsız bilgiyle (takım başarısı, kolej verisi) açılır.
- **Test:** Oy tablosu ayrıştırma, slug çıkarma, ölçüt ve hype'ın zaman sızıntısı olmaması (t sezonunun hype'ı t'den sonraki sonuçları değiştirince aynı kalıyor) çevrimdışı testlerle kilitlendi (6 test).

### Aşama 12: Planı yürütmek: MVP/DPOY yüzdeleri, 6MOY GS, All-NBA/All-Defense, COY koç verisi, ROY kolej
- **İstek (senin):** MVP/DPOY'a yüzdeler; Herro yedekten girmez → GS çekilsin; ROY'a kolej istatistikleri sürekli hâle gelsin; koç verisi eklensin; Clutch POY boşver; All-NBA ve All-Defense eklensin; MVP/DPOY için takım başarısı.
- **Problem 1 (veri çekimi):** İlk çekim işini durdurmaya çalıştım ama durmadı; yeni bir işi başlatınca ikisi aynı anda B-Ref'e gitti (iki kat istek, nezaket kuralını çiğnedi). Üstüne takım dosyaları kısaltma sütunu olmadan yazılmıştı. → Dosyalar yeniden çekildi (43 istek), takım gücü franchise koduyla bağlandı (NJN→BRK, NOH→NOP, SEA→OKC, CHA/CHH→CHO). **Ders:** arka plan işini durdurduğundan emin olmadan yenisini başlatma; her çekim işi tek ve kontrollü olmalı.
- **Problem 2 (etiket biçimi):** All-NBA'de 2021-22'den sonra takım etiketi "1st/2nd/3rd" yerine "1T/2T/3T" geldi; son dört sezon sıfır takım üyesi görünüyor ve model 2023–26'da 0.00 isabet gösteriyordu (taban dahil). → Etiket ilk rakamdan okunuyor. **Ders:** "taban dahil herkes 0.00" bir veri hatası işaretidir, modelin başarısızlığı değil.
- **Problem 3 (COY):** Oy tablosunda oyuncu yerine koç sütunu vardı (ilk çekimde 0 satır); aynı koç aynı sezon iki takımda görünebiliyor (yinelenen anahtar). → Koç sütunu okunuyor, koç başına en çok maçlı satır tutuluyor.
- **Problem 4 (NCAA):** Kolej verisi 2008-09 → 2015-16 ve 2021-22 → 2024-25 aralıkları eksikti (yalnız 2016-21 ve 2025-26 vardı). → 12 sezon çekildi (iki zaman aşımı yeniden denendi).
- **Problem 5 (kalibrasyon):** Üst-k olasılıkları (Plackett-Luce) DPOY'da gerçeği yarıya yakın eksik tahmin ediyordu. → Kazanan için softmax, üst-k için doğrudan Platt.
- **Sonuçlar:** 6MOY GS ile belirgin düzeldi (+0.44 ± 0.15, kazanan ilk 10'da %35 → %54); MVP/DPOY'da takım başarısı katkı vermedi; All-NBA (9.2/15) ve All-Defense (5.5/10) tabana +0.2–0.3 ekliyor; COY zayıf; ROY'da kolej istatistikleri pick'i geçmedi.
- **Ders:** Eklenen özelliklerin işe yaradığı yerler (GS) eksik bilgiyi tamamlayanlar; yaramadıkları yerler (takım başarısı, kolej) zaten başka özelliklerin yakaladığı bilgiyi tekrar edenler.

### Aşama 13 (sonra): Canlı MIP takibi
- **Fikir:** Sezon öncesi liste "izleme listesi" kalır (dürüstçe: ilk 10'da ~3 oylama adayı, kazanan tahmini zayıf). Asıl model sezon içinde çalışır: oyuncunun şimdiye kadarki değişimi (maç başı sayı, dakika, usage, BPM) güvenilirlik ağırlığıyla, sezon başlarında temkinli, ilerledikçe güçlü.
- **Soru:** Kaç maç sonra kazananı güvenle ilk 10'a / ilk 3'e sokar? Üst sınır (82 maç) 0.675; 20 / 40 / 60 maçta ne olacak?
- **Plan:** (1) 2021-22'den beri maç logları var (5 sezon): kısmi sezon istatistiklerini üretip aynı modeli kısmi sezonda değerlendirmek; (2) eğitimi tam sezon verisi üzerinden yapıp kısmi sezonda güvenilirlik ağırlığıyla küçültmek; (3) sezon içi güncelleme hattına (`update.py`) bağlamak; (4) sentetik hype'ı burada sıralamaya katmak (bariz olan, yani zaten yıldız olan gelişimi indirmek).
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
| 2026-10-11 (d) | Plan yürütüldü (B9e): MVP/DPOY yüzdeleri; 6MOY'a GS (+0.44 ± 0.15, Herro düştü); All-NBA (9.2/15) ve All-Defense (5.5/10); COY (koç verisi, yetenek değişimi: 4.56/10); ROY'a kolej istatistikleri (pick'i geçmedi, hat kuruldu). Takım başarısı özelliği MVP/DPOY'da katkısız. Üst-k olasılık kalibrasyonu düzeltildi. Çevrimdışı ek testler (7). Aday raporu üretildi. |
| 2026-10-11 (c) | Plan (B9d): MVP/DPOY'a takım başarısı + aday yüzdeleri, 6MOY'a GS, All-NBA / All-Defense, COY (koç verisi), ROY'a kolej istatistikleri; Clutch POY yapılmayacak. NCAA 2008-09 → 2015-16 çekildi (ROY için 18 sezon). |
| 2026-10-11 (b) | ROY için ayrı çaylak veri seti (`roy.py`, draft sınıfları): model draft sırası tabanını geçmiyor. Diğer ödüller için veri/özellik eksikleri planı (B9c). Çevrimdışı mekanik testleri (6). Draft verisinde iki hata düzeltildi (oyuncu anahtarı bağlantıdan, tablo içi başlık satırı). |
| 2026-10-11 | Sentetik hype λ = 0.4 varsayılan yapıldı (`--predict` giriş noktası). Mekanik diğer ödüllere genişletildi: ödül-bağımsız veri seti ve `award_run.py`; MVP (6.19/10), DPOY (4.78/10), 6MOY (2.15/10). MVP ve DPOY'da kazanan ilk 10'da %85–89; kazanç büyük ölçüde geçen yılın oy payı süreğenliğinden. Tüm ödül oylama tabloları ve draft sınıfları çekildi. |
| 2026-10-10 (c) | 2011-12 sorusu: hype yalnız ilk 30'u yeniden sıralıyor; gerçek ilk 10'un çoğu aday havuzunda yoktu (mükemmel hype tavanı 3.19/liste, biz 1.81). Pencere genişletme fayda vermedi (K = 10–120). B8g ve Aşama 9b eklendi. |
| 2026-10-10 (b) | λ = 0.6 denendi: λ = 0.4'e göre −0.07 ± 0.07, ilk 10 aynı; yarar tavanı λ ≈ 0.4–0.5. Sezon sezon tahmin ↔ gerçek tablosu üretildi (16 sezon, 29/160 = 1.81 liste başına). |
| 2026-10-10 | Gerçek hype hattı çevrimdışı kuruldu (`hype_real.py`, 11 test): yorum çekimi (resmî API), oyuncu eşleştirme, Claude sınıflandırma, küçültme, eksik veri kuralı, `skor − λ·hype_z`. Gerçek çekim için anahtarlar ve video listesi bekleniyor. |
| 2026-10-07 (i) | Sentetik hype kuruldu (`mip_hype.py`): modelin ilk-30 yanlış pozitiflerinden öğrenen ikinci aşama. λ = 0.4'te 7/40 → 8/40 (videoyla aynı) ama anlamlı değil. Elit rookie sophomore sezgisi test edildi: veri desteklemiyor (kalibre, açık ceza isabeti düşürüyor, 66 vakada 0 kazanan ama beklenen ~0.4). |
| 2026-10-07 (h) | Videoya geri dönüş: transkriptteki ölçüt (4 sezon × ilk 10, gerçek top-10 finisher) bire bir uygulandı. Üretim modeli (küçültmeli B2sh) 2023–26'da 7/40 = videoyla aynı; 2011–26: 1.62, 2000–26: 1.70/liste; taban 1.0–1.25. Breakout etiketi yan dala alındı. 2026-27 listesi `P_top10` ile yenilendi (Harper, Sheppard, Flagg, Clingan, Castle, Knueppel, Ware, Edgecombe, Buzelis, Sarr). Hype katmanı sıradaki adım. |
| 2026-10-07 (g) | Hedef netleşti: sezon öncesi 10 breakout adayı. `BREAKOUT` etiketi (oylama ya da en çok gelişen ilk 12) ve etiket sıkılığı takası ölçüldü: katı etikette 10'da ~2 isabet (rastgele 0.33), geniş etikette (ilk 75) ~5. Simülasyon artışı ek bilgi vermedi. Elit oyuncuları dışarıda bırakan sentetik hype etiketi listeyi üst sıradan seçilen düşük BPM'li ikinci yıllara kaydırdı. Etiket kararı bekliyor. |
| 2026-10-07 (f) | İkinci tur: yaş kutucukları, yeni özellikler, ListNet sıralama kaybı ve GBM denendi, anlamlı kazanç yok. Üst sınır testi: gerçekleşen sezon içi gelişme verilince NDCG 0.142 → 0.675 (kazanan %89 ilk 10'da). MIP'in sezon içinde okunabilir bir ödül olduğu görüldü; Aşama 7 (canlı takip) planlandı. |
| 2026-10-07 (e) | Bölüm D eklendi: aşamalar, karşılaşılan problemler ve çözümleri (video metni için). Teşhis: model kazananların yaş dağılımını yansıtmıyor (ilk 10'un %81'i ≤21 yaş) ve momentum kovalıyor; ikinci tur başladı. |
| 2026-10-07 (d) | Aşama A ve B kuruldu, walk-forward ile 2000–2026'da test edildi (B8b). Bulgular: tanınma katmanı genç+üretken tabanını aşıyor (+0.058 ± 0.022 NDCG), A ve takım değişimi katkı vermiyor, pencere farkı yok; model oylamaya girenleri buluyor ama kazananı değil. Üretim modeli B2; ilk 2026-27 listesi çıktı. |
| 2026-10-07 (c) | Isaac Austin düzeltmesi (senin notun): önceki sezonu olmayan oyuncu için en son NBA sezonu + `GAP` özelliği; 2025-26 B-Ref verisi çekildi; takım değişimi özellikleri (`MOVED`, `VAC`, `ARR`) eklendi. |
| 2026-10-07 (b) | MIP veri seti kuruldu ve doğrulandı (18 476 satır, oylama eşleşmesi %99.1, kazananlar 40/41). Satır = (oyuncu, hedef sezon); özellikler t−1'den: seviye ve persantiller, son 1–2 yıl değişimi, tepe VORP, kıdem, önceki MIP payı, güvenilirlik ağırlığı. |
| 2026-10-07 | Rehber oluşturuldu (fantezi aşama 0–5, ödül tahmini planı). MIP için yaş (42 sezon) ve MIP oylama (41 sezon) verisi çekildi; veri seti kurucusu yazıldı. |
