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
| 3 | **Aralık kalibrasyonu:** out-of-sample %80 kapsama; istatistik bazında bantlar; yüzdelere ayrı oynaklık | Aralıklar sıralama, plan riski ve mock notunda kullanılıyor. |
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
