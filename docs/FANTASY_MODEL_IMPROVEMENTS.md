# Fantezi modeli — değerlendirme ve iyileştirme planı

**Tarih:** 2026-09-29 · **Bağlam:** Faz 0-2 backend + frontend bitti (commit `a88958b`, push edilmedi).
Ana plan: `docs/FANTASY_PLAN.md`.

## Mevcut durum özeti

### Projeksiyon (src/fantasy/projections.py)
- Son 3 sezonun maç loglarından dakika başı üretim, 7/2/1 ağırlık (5/3/2, 6/3/1, 5/4/3'e karşı backtest ile seçildi).
- Az dakikalı oyuncu pozisyon grubu (G/F/C) ortalamasına çekiliyor; STL/BLK daha sert. FG%/FT% deneme sayısıyla.
- Yaş eğrisi: 2013-14'ten beri art arda iki sezon oynayanların yıldan yıla değişimi (delta yöntemi).
- Dakika ve maç: kendi geçmişi + lig ortalamasına çekme. Gençlerin dakika artışı 36 dk boşluğuyla sınırlı.
- Çaylaklar: önceki yıllarda aynı draft aralığında seçilenlerin ilk sezonları.
- Belirsizlik: backtest artıklarından. Üretim bandı dakika kovasına, maç bandı sakatlık geçmişine göre.

**Backtest (2025-26, hiç görülmemiş sezon):**

| Ölçü | Model | Taban (geçen sezon) |
|---|---|---|
| Maç başı Yahoo puanı MAE | 4.57 | 5.02 |
| Korelasyon | 0.85 | 0.84 |
| Maç sayısı korelasyonu | 0.40 | 0.39 |
| p10-p90 bandı kapsamı | %77 (örneklem içi, hedef %80) | – |

### Değerleme (src/fantasy/valuation.py)
- 9-cat: Rosenof G-score / Z-score. Points: sezon toplamı − yedek seviyesi.
- High Score: haftalık gerçek maç sayısı × oynama olasılığı üzerinden "haftanın en iyi maçı" beklentisi.
- ADP: bizim "piyasa" modelimiz (geçen sezon maç başı üretim, formatın ölçüsüyle).

### Draft simülasyonu (src/fantasy/draft.py)
- Tam snake draft; botların yarısı ADP + gürültü, yarısı bizim değer + gürültü; kadro doldurulabilirliği eşleştirmeyle.
- 9-cat önerisi: ortalama rakibe karşı kategori kazanma olasılığındaki artış (Φ); punt kendiliğinden öğreniliyor.
- Her simülasyonda oyuncu sezonları backtest hata payıyla yeniden çekiliyor; plan başına 60, not için 150 çekiliş.
- **Henüz sezon simülasyonu değil:** haftalık eşleşme, günlük kadro, sezon içi sakatlık, waiver, playoff eşleşmesi yok.

## Güçlü yanlar
- Görülmemiş sezonda basit tabanı ölçülebilir biçimde yenen, dürüst doğrulanmış tahmin.
- Formata doğru değerleme; High Score için "haftanın en iyi maçı" hesabı.
- Veriden türetilmiş, oyuncuya göre değişen belirsizlik aralıkları.
- Gerçek 2026-27 fikstürü (haftalık maç, fantezi playoff haftaları).
- Hızlı, durumsuz, tohumla tekrarlanabilir simülasyonlar.

## Zayıf yanlar (etki sırasıyla)
1. **Değerlendirmede döngüsellik:** kullanıcının takımı yine bizim projeksiyonlarımızla ölçülüyor; gürültü rastgele hatayı temsil ediyor, sistematik model hatasını değil. Notlar muhtemelen iyimser.
2. **Takım bağlamı yok:** dakika eski rolden; takımı değişenler eski dakikasını taşıyor, boşalan kullanım dağıtılmıyor.
3. **Maç sayısı zayıf:** korelasyon 0.40, ~2.6 maç iyimserlik.
4. **Aralıklar dar:** %77 < %80, üstelik örneklem içi.
5. **Tek çarpan:** oyuncunun tüm istatistikleri birlikte oynuyor; istatistikler arası ve takım içi korelasyon yok; yüzdeler ayrıca oynamıyor.
6. **Tek yaş eğrisi:** istatistiğe özgü değil; hayatta kalma yanlılığı gençlerin gelişimini abartıyor.
7. **Çaylak tabanı iyimser:** ligden düşenler veride yok; comparables bağlı değil.
8. **ADP ve botlar kalibre değil:** gürültü (0.12·ADP + 2) sezgisel; botlar punt yapmıyor, pozisyon akınlarına uymuyor.
9. **Yaklaşımlar:** kategoriler ve oyuncular bağımsız; √(2N) ölçeği kaba; 60 simülasyon planları ayırmaya yetmiyor.
10. **Teyit edilmemiş varsayımlar:** pozisyon uygunluğu, High Score slot yapısı, All-Star haftası birleşimi.

## İyileştirmeler ve sıralama

Karar (2026-09-29): **karışık sıra.** Draft kararlarını etkileyenler draft sezonundan (10-19 Ekim) önce,
sezon simülatörüne ait olanlar Faz 3'ün içinde, geri kalanlar sonra.

### Faz 2.5 — Draft sezonundan önce (hedef ~5 Ekim, Faz 3'ten ÖNCE)
| # | İş | Neden şimdi |
|---|---|---|
| 1 ✅ | **Strateji backtest'i (bitti, aşağıya bak):** her sezon öncesi bilgiyle draft et, gerçek sezon istatistikleriyle puanla | Döngüselliği kaldırır; planların ve notların gerçekten işe yarayıp yaramadığını söyleyen tek test. Sonuca göre not ölçeği de kalibre edilir. |
| 2 ❌ | **Takım dakika bütçesi — denendi, işe yaramadı, gönderilmedi (aşağıya bak)** | Hipotez: en büyük hata kaynağı. Backtest: değil. |
| 3 ✅ | **Aralık/tahmin kalibrasyonu (bitti, aşağıya bak):** ürünün playoff/sıra tahminleri artık gerçekleşenle uyuşuyor (9-cat) | Aralıklar sıralama, plan riski ve mock notunda kullanılıyor. |
| 10 | **Plan karşılaştırmasında ortak rastgele çekilişler** (common random numbers) | Planlar arası farkı daha az simülasyonla ayırır; şu an çoğu "berabere". |

### Faz 3 içinde — sezon simülatörü
| # | İş |
|---|---|
| 4 | Gerçek sezon simülasyonu: fikstürle haftalık eşleşmeler, günlük kadro kısıtı, maç loglarından örnekleme, sezon içi sakatlık, playoff eşleşmeleri. Draft notları da buna taşınır. |
| 5 | Maç sayısı modeli: sakatlık geçmişi, yaş, dakika yükü + elle girilebilen sezon öncesi sakatlık tablosu. |

### Sonra (sezon içi / Faz 5 ile)
| # | İş | Ne zaman |
|---|---|---|
| 6 | İstatistik bazında yaş eğrileri, kullanım oranına bağlı düzeltmeler | Sezon içi |
| 7 | Çaylaklar için comparables motoru + NCAA istatistikleri | Sezon içi |
| 8 | Yahoo ADP ile piyasa modeli ve bot kalibrasyonu; punt yapan bot tipleri | Faz 5 (Yahoo onayına bağlı) |
| 9 | Tam H-score (kategori ağırlıklarını optimize etmek) | Sezon içi |

## Açık karar
- Faz 0-2 commit'leri (`fdeea83`, `533ca55`, `057c98d`, `a88958b`) push edilmedi. Faz 2.5 bitmeden canlıya
  alınırsa draft notları ve plan sıralamaları doğrulanmamış bir güvenle yayına girer; alternatif olarak
  notlar geçici olarak "deneysel" etiketiyle çıkabilir.

## Faz 2.5 #1 sonuçları — strateji backtest'i (2026-09-29)

`python -m src.fantasy.strategy_backtest` → `data/fantasy_strategy_backtest.json`, testler `tests/test_fantasy_strategy_backtest.py`.
İki katlama: hedef 2024-25 (2021-22…2023-24 verisiyle) ve 2025-26 (2022-23…2024-25). Her katta 12 sıra × 10 tohum,
üç strateji aynı bot tahtalarına karşı (ortak rastgele sayılar), gerçek maç loglarıyla hafta hafta all-play (son 3 hafta = playoff, dışarıda).
Karşılaştırma ölçüsü: piyasa (ADP) stratejisine göre haftalık eşleşme kazanma oranı farkı.

| Format / lig | Strateji − piyasa (havuzlanmış) | 2024-25 | 2025-26 |
|---|---|---|---|
| 9-cat, karışık botlar | dinamik **+0.128 ± 0.013**, statik +0.092 ± 0.014 | +0.161 | +0.095 |
| 9-cat, hepsi ADP botu | dinamik +0.055 ± 0.013 | +0.152 | **−0.041** |
| Puan, karışık botlar | statik +0.071 ± 0.016 | +0.015 | +0.126 |
| Puan, hepsi ADP botu | statik +0.068 ± 0.015 | **−0.029** | +0.166 |

**Okuma**
- 9-cat'te bizim değerleme + dinamik öneri piyasadan tutarlı biçimde iyi (karışık ligde iki sezonda da). Dinamik, statikten +0.036 daha iyi.
  Ama botların hepsi ADP ise 2025-26'da piyasanın altında kaldı: avantaj rakip tahtasına duyarlı.
- Puan formatında avantaj **kanıtlanmadı**: 2024-25'te sıfır, 2025-26'daki kazanç tek sezona ait.
- Sıralama kalitesi (ilk 36 oyuncunun gerçek 9-cat değeri): 2024-25'te bizim tahta +0.74 önde, 2025-26'da −0.42 geride.
  İkinci sezonu sakatlıklar belirledi (Haliburton 0 maç, Tatum 16, Sabonis 19, Trae Young 15 — hepsi bizim ilk 10'umuzdaydı).
  Piyasamız da sezon öncesi sakatlığı bilmiyor; gerçek Yahoo ADP bilir, yani gerçek dünyadaki avantaj bundan küçük olabilir.

**Ürün tahmini aşırı emin (asıl bulgu)**

| | Tahmin ettiği | Gerçekleşen |
|---|---|---|
| 9-cat, ortalama sıra / playoff olasılığı | 3.67 / %86.6 | 4.58 / %74.6 |
| Puan, ortalama sıra / playoff olasılığı | 4.08 / %81.1 | 5.21 / %65.4 |

- Playoff olasılığının Brier'ı 0.208 (9-cat) ve 0.243 (puan); "herkese gerçekleşen oranı söyle" referansı 0.190 / 0.226 — yani mevcut tahmin bu referanstan **kötü**.
- Lojistik kalibrasyon eğimi b ≈ 0.41 (9-cat) / 0.33 (puan): tahmin edilen logit farklarının yalnızca üçte biri-yarısı gerçek. Sıra için gerçek ≈ 2.66 + 0.58·tahmin (9-cat), 3.39 + 0.40·tahmin (puan).
- Nedenler (tahmin): (1) gerçekleşme örneklemesi oyuncular arası bağımsız, sakatlık/rol şokları takım içinde ve sezon içinde korelasyonlu; (2) aralıklar dar (#3);
  (3) rakip takımlar gerçekte sezon içinde waiver/takasla düzeliyor, biz sabit draft kadrosuyla kıyaslıyoruz ama kendi takımımız da sabit — ikisi simetrik, yani ana neden (1)-(2).
- `fit_calibration` / `apply_calibration` (strategy_backtest.py) bu eşlemeyi hesaplıyor; henüz ürüne **bağlanmadı**. Önce kaynağı (#2, #3, sakatlık modeli #5) düzeltip backtest'i yeniden koşmak, sonra kalan farkı kalibrasyonla kapatmak daha sağlam.

**Yöntem sınırları:** piyasa = bizim geçen-sezon ADP modelimiz (gerçek Yahoo ADP değil); pozisyon kodları güncel kadro/eski bios/boy tahmininden (küçük sızıntı);
çaylak havuzu güncel kadrodan (ligden düşen çaylaklar yok); iki sezon = az örnek (sıra başına SE ≈ 0.3), sezona özgü sakatlık şansı sonucu belirliyor.
Bu backtest artık #2, #3, #5 için ölçü çubuğu: her iyileştirmeden sonra yeniden koşulup Brier / kalibrasyon eğimi kıyaslanacak.

## Faz 2.5 #2 sonucu — takım dakika bütçesi (2026-09-29): işe yaramadı

Sorun gerçek: güncel kadroda projeksiyonlu takım dakika toplamı ortalama 269 (243–313), gerçek bütçe ≈ 241.
Ama düzeltmek doğruluğu artırmadı. Test: 2024-25 ve 2025-26, takım = sezon açılışı takımı, hepsi sezon öncesi bilgiyle.

| Ayar | Maç başı puan MAE (tüm oyuncular, 24-25 / 25-26) | İlk 150 (24-25 / 25-26) | Takas edilenler, ilk 150 |
|---|---|---|---|
| Bütçe yok (mevcut) | 4.288 / 4.726 | 4.219 / 4.341 | 4.27 / 6.60 |
| Orantılı, tam (λ=1) | 4.502 / 4.900 | 5.077 / 4.531 | 5.54 / 6.16 |
| Yalnız <26 dk oyuncuları kısar | 4.327 / 4.998 | 4.458 / 4.438 | 4.42 / 7.06 |
| Yalnız <22 dk oyuncuları kısar | 4.493 / 5.050 | 4.197 / 4.275 | 4.27 / 6.74 |

- Hiçbir varyant iki sezonda birden anlamlı iyileşme getirmedi; orantılı kısma yıldızları (−2.4 puan sapma) yanlış aşağı çekiyor.
- Fazla dakika ağırlıkla ortalamaya çekmenin şişirdiği kenar oyuncularda (10 günlükler, ikiyol) — bunlar draftta zaten alakasız.
- Takas edilen yıldızların hatası (2025-26'da 6.6) dakika toplamından değil, rol/kullanım değişiminden geliyor; bunu bütçe çözmüyor.
- Karar: canlı projeksiyona bağlanmadı. Yeniden denenecekse rol değişimi (kullanım devri) modeliyle, #6-#7 ile birlikte.

## Faz 2.5 — düzeltmeler ve gerçek Yahoo verisi (2026-09-29, akşam)

Kullanıcı gerçek Yahoo verisini verdi (`config/reference/`, README'sine bak): **gerçek ADP** (ekran görüntüsü) ve
format başına **Yahoo değer sıralamaları** (9-cat, puan, High Score; pozisyon + takımla). İkisi farklı şeyler: ADP = insanların draftı, sıralama = Yahoo'nun tahmini.

**Bulunan hatalar ve düzeltmeler**
1. **Sahte piyasa (ADP) modeli saftı.** Kawhi'yi 4. sıraya koyuyordu (gerçek Yahoo ADP'si 29.9). Artık ADP'si güvenilir (%Drafted ≥ 50) 126 oyuncu için gerçek Yahoo ADP'si kullanılıyor
   (`valuation.market_adp` → `reference.load_adp`); kalanlar onların arkasına, model sırasıyla. Geçmiş backtest tahtaları gerçek ADP taşımaz, modele düşer;
   o model Yahoo listesine uydurulup (çıpa 0.4, maç karışımı 0.25; Spearman 0.656 → 0.705) hâlâ kullanılıyor.
2. **Pozisyon uygunluğu:** kural tabanlı tahmin Yahoo'yla yalnız %36 birebir örtüşüyordu (çoğunlukla alt küme). 261 oyuncu için artık Yahoo'nun kendi pozisyonları kullanılıyor (`SOURCE = yahoo`); takımlar 249/250 uyuşuyor.
3. **Maç sayısı çekmesi fazla zayıftı:** `K_GP` 164 → 500. Geçen sezon <40 maç oynayanı ~5.6 maç eksik, 72+ oynayanı ~7.5 maç fazla tahmin ediyorduk (rotasyon oyuncuları, 3 kat, n=671). Yeni sapmalar −0.6 / +2.9.
   Korelasyon değişmedi (0.39): maç sayısı zaten zor öngörülüyor. Sezonlara eşit ağırlık vermek daha kötü (MAE 14.9 → 16.2), geri alındı.
4. **Tek seferlik sakatlık dönüşü:** geçen sezon <45, öncesi ≥62 maç oynayan rotasyon oyuncusu (n=28): gerçekleşen 51, model 46, "sağlıklı geçmiş" 68. Yarı yarıya karışım MAE'yi 21.8 → 18.8'e indirdi. Küçük örnek; kural bilerek basit (`ONEOFF_*`).
   Etkisi: Giannis 47 → 59 maç, Sabonis 38 → 59, Tatum 36 → 56. Bu kural bu katlardan çıktı, bağımsız doğrulanmadı.
5. **Yahoo sakat dönen yıldızları iskonto etmiyor** (Tatum ADP 9.4, Haliburton 15.8, Giannis 7.7; ekran görüntüsünde çoğunda sakatlık etiketi yok). Bizim modelimiz ediyor. Doğrusu ikisinin arası (yukarıdaki n=28 sonucu): "sağlıklıymış gibi" de tutmuyor.
   Hâlâ ayrılanlar (iki sezondur sakat): Trae Young (ADP 27, bizde 184), Kessler (39, 222), Edey (75, 263), Dejounte Murray, Ja Morant, Ty Jerome. Çaylaklarda da fark büyük (Khaman Maluach ADP 119, bizde 396): çaylak tabanı üniversite verisini görmüyor (#7).
6. Değer sıralamamız gerçek ADP ile Spearman 0.729 (9-cat), 0.789 (puan), 0.807 (High Score). Yahoo'nun kendi sıralamalarıyla: 0.73 / 0.77 / 0.81.

**Strateji backtest'i yenilendi (gerçekçi piyasa + yeni maç modeliyle) — önceki "+0.128" saf piyasaya karşıydı**

| Piyasa varsayımı | 9-cat: dinamik − piyasa | Puan: statik − piyasa |
|---|---|---|
| Saf (geçen sezon per-game) | +0.165 | +0.033 |
| İlk elle tahmin | +0.101 | +0.035 |
| **Yahoo'ya uydurulmuş (varsayılan)** | **+0.076 ± 0.017** | **−0.014 ± 0.017** |
| Şüpheci (kalabalık sakatlığı çok fiyatlıyor) | +0.127 | +0.090 |

- 9-cat avantajımız her piyasa varsayımında pozitif (+0.04…+0.17), gerçekçi olanda +0.076: **güvenilir sonuç**.
- Puan formatında **avantaj kanıtlanamadı**: gerçekçi piyasada sıfır, yalnızca kalabalığın sakatlığı çok fiyatladığı varsayımda pozitif. Puan formatı için "piyasayı yeniyoruz" iddiası yapılmamalı.
- Ürünün kendi tahminleri hâlâ fazla emin: 9-cat playoff olasılığı tahmini %78, gerçekleşen %62; Brier 0.259, sabit referans 0.236. Puan formatında tahmin neredeyse hiç bilgi taşımıyor (kalibrasyon eğimi 0.08).
  Kalibrasyon (`fit_calibration`) hâlâ ürüne bağlı değil; nedenler (bağımsız oyuncu çekilişi, dar aralıklar) #3 ve Faz 3'te.

## Faz 2.5 #3 sonucu — tahmin kalibrasyonu (2026-09-29, gece)

Sorun: ürünün "playoff olasılığı %78" dediği yerde gerçekleşen %62'ydi. Üç olası neden ölçüldü; ikisi bulundu.

1. **Gürültü kalın kuyruklu değildi.** Simülatör oyuncu sezonlarını backtest artıklarının p10/p90'ına uydurulmuş lognormal ile çekiyordu; sezonu tümden kaçıranlar (Haliburton 2025-26'da 0 maç) neredeyse hiç üretilmiyordu.
   Üstelik backtest'in maç oranı artıkları hedef sezonda hiç oynamayanları dışarıda bırakıyordu (en kötü kuyruk ölçülmüyordu). Düzeltme: `run_fold` artık güncel kadroda kalan sıfır maçlı oyuncuları içeriyor;
   `backtest.ratio_tables` 101 kantillik gerçek oran tabloları çıkarıyor (üretim oranı MPG kovasına, maç oranı sakatlık geçmişi kovasına göre); `draft.sample_multipliers` bunlardan ters-CDF ile ÖRNEKLER.
   Etki (9-cat, aynı draftlar): kalibrasyon eğimi 0.63 → 1.05, playoff Brier 0.258 → 0.235 (sabit referans 0.234).
2. **Kazananın laneti.** Simülatör herkesin yaptığı draft (ADP stratejisi) için doğru kalibreydi (tahmin 7.06 / gerçek 7.18) ama BİZİM takımımız için iyimserdi (4.44 / 5.41): iddia ettiğimiz avantajın 9-cat'te %56'sı, puanda %0'ı gerçekleşti
   (modelimizin piyasadan ayrıldığı yerlerde haklı olma oranı <1). Düzeltme: `draft.SHRINK` — değerler aynı ADP sırasındaki oyuncuların yerel ortalamasına doğru büzülüyor (`value = piyasa + κ·(bizim − piyasa)`).
   κ tahmin edilen ile gerçekleşeni eşitleyecek şekilde seçildi: **9-cat 0.5, puan 0.25, High Score 0.25 (test edilmedi, muhafazakâr).** Gerçekleşen avantaj κ = 0.25–1.0 arasında değişmedi; büzme sonucu bozmuyor, iddiayı dürüstleştiriyor.
   Ekranda gösterilen değer/sıra ham kalır; yalnız draft motoru (öneri, simülasyon, not) büzülmüş değerleri kullanır.
3. **Aralık kapsamı:** bantlar bir önceki sezondan kurulup sonrakinde sınandı: FP/maç bandı %74–78, maç sayısı bandı %72–77 (hedef %80). Hafif dar. Metodoloji sayfası artık bu dışarıdan sayıyı gösteriyor (%74).

**Sonuç (strateji backtest'i, 2024-25 + 2025-26, gerçekçi piyasa, 240/120 draft)**

| | 9-cat (dinamik) | Puan (statik) |
|---|---|---|
| Tahmin edilen / gerçekleşen sıra | 4.96 / 4.92 | 5.55 / 5.75 |
| Tahmin edilen / gerçekleşen playoff | %68.4 / %67.9 | %61.4 / %59.2 |
| Playoff Brier (sabit referans) | 0.2135 (0.2179) — **referansı yeniyor** | 0.2471 (0.2416) — eşit |
| Kalibrasyon eğimi | 0.84 | 0.28 (ayırt gücü zayıf) |
| Piyasadan avantaj: karışık botlar / hepsi ADP botu | +0.098 ± 0.013 / +0.051 | +0.040 ± 0.012 / −0.040 |

- 9-cat: ürünün tahminleri artık güvenilir; `fit_calibration` düzeltmesi gerekmiyor (eğim 0.84, kayma −0.10).
- Puan: tahminler dürüst ama ayırt edici değil (iki sezon, avantaj rakiplerin nasıl draft ettiğine bağlı). "Doğrulanmamış" uyarısı kalıyor.
- Sınır: büzme hedefi backtest'te model tabanlı piyasa (geçmiş sezonlarda gerçek ADP yok). Canlıda gerçek Yahoo ADP daha bilgili; κ muhtemelen çok yanlış değil ama yeni ADP verisi gelince yeniden ölçülmeli.
- Yapılmayanlar (#3'ün alt maddeleri): istatistik bazında bantlar ve yüzdelere ayrı oynaklık — kalibrasyon hedefi (tahmin = gerçekleşen) tutturulduğu için ertelendi.

## Faz 3 — sezon simülatörü, backend (2026-09-29, gece)

`src/fantasy/season_sim.py` · `POST /api/fantasy/season/simulate` · testler `tests/test_fantasy_season_sim.py` · doğrulama `python -m src.fantasy.strategy_backtest --sim-calibration`.

**Ne yapıyor:** draft edilen ligi 2026-27 fikstürüyle hafta hafta oynatır (22 fantezi haftası, son 3'ü playoff): oyuncu başına sezon gerçekleşmesi (ampirik kantil tablolarından, #3 ile aynı),
kaçırılan maçların haftalara dağıtımı, haftalık takım toplamları, all-play + rastgele round-robin H2H, playoff tek eleme (üst tohumlar bay). Çıktı: sıra dağılımı, playoff / şampiyonluk olasılığı,
hafta × kategori kazanma olasılığı, hafta başına oynanan maç (ligin ortalamasıyla), en zayıf haftalar için veri. 100 simülasyon ≈ 0.6 sn (9-cat), sunucuda; en çok 2 eşzamanlı, en çok 500 simülasyon/istek.

**Sakatlık modeli (ölçüldü):** 986 rotasyon oyuncu-sezonunda (2023-24…2025-26, ≥8 kaçırılan maç) kaçırılan maçların yalnız **%41'i tek ardışık blokta** — sakatlıklar parça parça.
Simülatör bu yüzden iki ardışık blok (%42 + %25) ve kalan %33 dağınık kayıp kullanır; blok payları veriyle seçildi, blok uzunluk dağılımı ayrıca kalibre edilmedi.

**Doğrulama (2024-25 + 2025-26, 120 draft/format, aynı draftlarda statik değerlendirmeyle):**

| 9-cat | Statik | Simülatör |
|---|---|---|
| Playoff tahmini (gerçekleşen %66.7) | %68.5 | %69.0 |
| Brier (sabit referans 0.2222) | 0.2140 | **0.2125** |
| Kalibrasyon eğimi | 0.96 | 1.15 |
| Sıra tahmini (gerçekleşen 5.03) / sıra korelasyonu | 4.95 / 0.317 | 4.92 / 0.337 |

Puan formatında ikisi de ayırt gücü göstermiyor (eğim 0.23 / −0.01) — 9-cat'in aksine; "doğrulanmamış" uyarısı kalıyor.

**Bilerek basit:** günlük kadro sınırı yok (nadiren devreye giriyor), pozisyon slotu kısıtı yok, sezon içi waiver/takas yok, maçtan maça gürültü oyuncular arası bağımsız, High Score simüle edilmiyor.
Dış kadrolar: mock'tan tam draft ya da yalnız kullanıcı kadrosu verilirse diğer 11 kadro botlarla tamamlanır (her `seed` farklı rakip seti).

**#5 (maç sayısı modeli) durumu:** kısmen — `K_GP` ve tek seferlik sakatlık kuralı ile projeksiyon düzeldi (bu belgenin önceki bölümleri). Yapılmayan: elle girilebilen sezon öncesi sakatlık tablosu, yaş/dakika yükü etkileri.

## Değerleme: kaçırılan maçın yerine yedek (2026-10-05)

**Sorun (kullanıcı geri bildirimi — Trae Young 184.):** değerleme kaçırılan her maçı SIFIR üretim sayıyordu (`mu = maç başı × oynanacak maç`). Gerçek ligde yerine
yedek / waiver oyuncusu girer. Trae Young: 38.8 maçta 184., 50 maçta 98., 70 maçta 21. — değer maça aşırı duyarlıydı.
Maç tahminimizin kendisi hatalı değil: geçen sezon <45, öncesinde ≥62 maç oynayanlar (n=55, 2023-26) ertesi sezon ortalama 45 maç oynadı; modelimiz 50 diyordu.
Piyasa (Yahoo) onları sağlıklı gibi fiyatlıyor; farkın bir kısmı gerçek (haber bilgisi yok), bir kısmı bizim cezanın fazla sert olması.

**Değişiklik:** `valuation.REPL_CREDIT = 0.75` — üretim = oyuncu·oynanan + 0.75·yedek·(takım maçı − oynanan); yedek = havuz dışı ilk `takım × 3` oyuncunun ortalaması
(kategoride kategori başına, puanda maç başı puan). Puanda toplam − yedek seviyesi yine aynı kredili toplamdan. `basis="per_game"` etkilenmez.

**Doğrulama:** `python -m src.fantasy.valuation_backtest` (sıralamanın gerçekleşen sezon değeriyle uyumu, büzme kapalı, ilk 200) — kredi 0 → 1.0:
| sezon / format | Spearman |
|---|---|
| 2023-24 9-cat | 0.611 → 0.643 |
| 2024-25 9-cat | 0.539 → 0.600 |
| 2025-26 9-cat | 0.392 → 0.435 |
| 2023-24 puan | 0.620 → 0.679 |
| 2024-25 puan | 0.587 → 0.678 |
| 2025-26 puan | 0.436 → 0.524 |
6/6 sezon-format tutarlı artış (eğri 1.0'a kadar monoton). Sakatlıktan dönenlerde (n=12–16/sezon) tahtanın "olduğundan yukarı" koyma hatası: kredi 0'da +17…+100 sıra, 0.75'te sezonlar arası ortalama ≈ 0. 0.75 seçildi: Spearman 1.0'da biraz daha yüksek ama tam kredi (yedek her zaman hazır) iyimser.
Strateji backtest (2 sezon, 4 tohum/slot — gürültülü, se ≈ 0.02): piyasaya karşı eşleşme kazanma oranı 9-cat karışık botlarda 0.100 → 0.154 (statik 0.088 → 0.156), ADP botlarında 0.044 → 0.115; puanda 0.026 → −0.012 (karışık) ve −0.043 → +0.035 (ADP) — ayırt edilemez.
Yahoo'nun 9-CAT sırasıyla uyum: Spearman 0.748 → 0.841; Yahoo ADP ile 0.652 → 0.741 (bağımsız doğrulama: piyasanın bilgisi bizim verimizde yok).
Etki: Trae Young 184 → 99, Embiid 111 → 61, Walker Kessler 222 → 108, Zach Edey 263 → 164, Anthony Davis 123 → 64. Hâlâ Yahoo'nun gerisinde: maç sayıları gerçekten düşük, sakatlık haberi yok.

**Ayrıca ölçüldü ve YAPILMADI:**
- Saf "track record" sıralaması (son 3 sezonun gerçek ortalaması, projeksiyon yok, çaylak yok): gerçekleşen sezonu projeksiyondan biraz kötü öngördü (Spearman ortalaması 0.48–0.50 vs 0.52; sezondan sezona değişken: 2025-26'da 0.25 vs 0.38). Ayrı sıralama olarak değer katmıyor; trend etiketi daha anlamlı.
- Maç ağırlıklarını/çekmeyi yeniden ayarlamak: 573 oyuncu-sezonluk grid'de MAE 15.0 civarında düz; slope 0.81 (kalibre), ortalama yanlılık +5 maç (iyimser) — ayar yok.

**Açık:** sophomore'larda piyasadan çok yukarıdayız (Knueppel 15 vs Yahoo 62, Edgecombe 27 vs 75, Jabari Smith 47 vs 100) — ölçülmedi.

## Trend etiketleri + sophomore incelemesi (2026-10-05)

**Trend etiketi** (`src/fantasy/trends.py`, projeksiyon tablosuna `TREND / TREND_PCT / TREND_SERIES`, `FLAGS`'e rising|steady|declining): son 4 sezonun 36 dakikadaki Yahoo puanı, ≥400 dk sezonlar, ≥2 sezon;
dakika ağırlıklı doğrusal eğim / ortalama, ±%4 / sezon. Havuzda 130 yükselişte, 158 sabit, 58 düşüşte, 279 etiketsiz (çaylak / tek sezon).
**Etiket tahmin değiştirmez:** 715 oyuncu-sezonda (2023-26) etiket ile (gerçek − tahmin) artığı arasındaki korelasyon +0.07 (yükselişte +%0.6, sabitte −%2.0, düşüşte −%1.8; se ≈ %1.5). Projeksiyon zaten 7:2:1 + yaş eğrisi.
Etiket açıklayıcı bağlam olarak gösterilir (Rankings'te Rising / Declining çipi, Flags filtresi, oyuncu sayfasında sezon serisi); arayüz bunu açıkça söyler.

**Sophomore / tek sezonluk projeksiyonlar şişiyor mu?** (3 hedef sezon, geçen sezon ≥800 dk, n=77 tek sezonlu): tahmin − gerçek FP/maç +0.87 (%4), dakika +1.3; üç sezonda da aynı yönde ama küçük (≈1.3 se).
Kalibrasyon sağlam: eğim 1.06, korelasyon 0.82 (3 sezonlularda 1.05 / 0.88); projeksiyonu yüksek olanlarda (FP ≥ 26, n=26) yanlılık −0.17 — yani üst düzey sophomore'lar şişmiyor.
Şişme orta grupta: projeksiyonu 18–22 FP olanlarda +3.5 FP / +3.8 dk (n=17) — rol / dakika tahmini (yeni takım bağlamı yok, bkz. "takım bağlamı yok" zayıflığı). Bu yüzden Yahoo'yla farkın büyük kısmı model hatası değil: Yahoo çaylak sezonu iskonto ediyor
ve takım bağlamını (ör. Edgecombe: PHI'ye Brown, LeBron gelmiş) biliyor. Sophomore'larda tek yönlü fark da yok: Knueppel / Edgecombe / Queen / Bailey / Fears'ı yukarı, Coward / Harper / Flagg / Murray-Boyles'ı aşağı koyuyoruz. Kalibrasyon değişikliği yapılmadı.

## Takım bağlamı katmanı (2026-10-05) — `src/fantasy/context.py`

**Soru (kullanıcı):** simülasyon oyuncuları yeni takımlarında değerlendiriyor mu, Maxey LeBron / Brown'lı PHI'da gerçekten bu kadar üretir mi? **Tespit:** hayır — projeksiyon oyuncunun KENDİ geçmişinden, takım bağlamı yoktu; simülatör yalnız fikstürü yeni takımdan alıyordu.

**Teşhis (2023-26, 1128 oyuncu-sezon, tahmini ≥15 dk):** yeni takıma geçenler (n=420) fantezi puanında +%10, dakikada +%9 fazla tahmin ediliyor (+1.8 FP, +2.0 dk; 3 sezonda da aynı yön); kalanlar kalibre (+0.03).
Takım projeksiyon dakika toplamı ortalama 274 (bütçe ≈ 241); fazla tahmin rotasyonun 5.–10. sırasında (+1 … +3 dk), ilk üçte yok. Kaba "takım bütçesine normalleştirme" ve rotasyon simülasyonu (sakatlık senaryoları + öncelik-doldurma) yanlılığı sıfırlıyor ama MAE'yi KÖTÜLEŞTİRİYOR (4.53 → 4.56+): gürültü ekliyor.

**İşe yarayan:** (1) yapısal kullanım yükü: hız = a_p · L_{−p}^(−θ), θ göç eden oyuncuların doğal deneyinden (kullanım ≈ 0.77–0.85, ribaund ≈ 0.41–0.56, asist ≈ 0.55–0.58; hedef sezondan bağımsız tahminlerde kararlı), (2) dakika ve (3) hız için ridge regresyonlar: yeni takım, takım dakika fazlası, öncelik-doldurma payı, rotasyon sırası, yaş, yapısal μ.
**Doğrulama (leave-one-season-out: iki sezonda öğren, üçüncüde uygula):**
| | 2023-24 | 2024-25 | 2025-26 |
|---|---|---|---|
| FP MAE | 4.516 → 4.279 | 4.332 → 4.226 | 4.730 → 4.613 |
| FP yanlılık | +1.05 → +0.30 | +0.38 → −0.48 | +0.60 → −0.27 |
| PTS MAE | 2.506 → 2.302 | 2.412 → 2.326 | 2.718 → 2.591 |
| REB MAE | 0.918 → 0.888 | 0.876 → 0.864 | 0.896 → 0.890 |
| AST MAE | 0.692 → 0.659 | 0.687 → 0.676 | 0.738 → 0.728 |
| dakika MAE / yanlılık | 4.04 → 3.90 / +1.33 → +0.35 | 3.96 → 3.92 / +0.67 → −0.37 | 4.22 → 4.20 / +1.04 → +0.09 |
Dört istatistikte ve üç sezonun hepsinde MAE düştü; ortalama |yanlılık| 0.68 → 0.35 (2024-25'te hafif aşırı düzeltme: 0.38 → 0.48). Ridge 1–30 arası duyarsız (3 seçildi).
Değerleme sıralaması (gerçekleşen sezonla Spearman, kredi 0.75): 9-cat 3/3 sezonda arttı (+0.003, +0.019, +0.010); puan formatında karışık (+0.001, −0.012, −0.029) — oyuncu düzeyinde doğruluk net iyileşti, puan sıralaması gürültü içinde. Strateji backtest'i bağlamsız tahtalarla koşuyor (`historical_projections` düzeltmeyi uygulamaz).

**Canlıda:** `publish.build_projections` kayıtlı katsayılarla (`data/2026-27__fantasy_context_model.json`; `python -m src.fantasy.context --fit`) uygular; `CTX_MIN_RATIO` / `CTX_RATE_*` sütunları yazılır. Rotasyon (≥15 dk) medyan dakika çarpanı 0.95. Örnekler: Brown PHI'da 32.1 → 29.8 dk, 24.7 → 21.4 sayı; LeBron −8% sayı; Giannis −6%; Curry / Jokić (ince kadro) +9% / +4% dakika; Maxey ≈ değişmez (yapısal yük PHI'da eskisiyle benzer).
**Sınırlar:** kadro değişimi bilgisi hedef sezon takımından (backtest'te sezon ortası göçler küçük sızıntı); 3 sezon = az veri; katsayılar sezon başında yeniden öğrenilmeli (`--fit`); sezon içi güncelleme bu düzeltmenin ÜSTÜNE oynanan maçları ekler.
