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
| 1 | **Strateji backtest'i:** 2024-25 bilgisiyle draft et, gerçek 2025-26 istatistikleriyle puanla | Döngüselliği kaldırır; planların ve notların gerçekten işe yarayıp yaramadığını söyleyen tek test. Sonuca göre not ölçeği de kalibre edilir. |
| 2 | **Takım dakika bütçesi:** takım başı maç başına 240 dk'ya normalize et, takaslarla boşalan dakikayı dağıt | En büyük hata kaynağı; takas edilen oyuncuların sıralamasını doğrudan bozuyor. |
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
