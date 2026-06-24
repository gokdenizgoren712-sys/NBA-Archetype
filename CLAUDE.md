# NBA Arketip Etiketleme Sistemi — Proje Brief

Bu dosyayı oku ve projenin tamamını kavra. Aşama 1-2 hazır ve test edildi;
geri kalanı senin gerçek veriyle (kullanıcının internet bağlantısı) tamamlayacağın.

## Amaç
Kullanıcının elle hazırladığı NBA jargon sözlüğündeki oyuncu arketiplerini
niceliksel NBA metrikleriyle eşleştiren, doğrulayan ve TÜM aktif + tarihsel
(1983+) oyunculara otomatik uygulayan bir sistem. Sonunda arketip uyumlarını
hesaplayıp bir web sitesinde sunacağız.

## Kullanıcının elindeki kaynak
`nba_scouting_tags.xlsx` — 2 sheet:
  - "Top 41": 40 oyuncu, her biri Seviye + bileşik Etiket (ör. "Pressure Scoring Engine")
  - "Jargon Sözlüğü": Core nouns / Modifiers / Position tags / Tiers taksonomisi
Bu dosya GROUND TRUTH'tur. Yolu run_validation.py içinde TAGS_XLSX ile ayarla.

## 7 Aşamalık Yol Haritası ve Durum
1. [BİTTİ] Veri çekme — src/fetch_data.py (nba_api, cache'li, rate-limited)
2. [BİTTİ] Threshold motoru + 2 katmanlı doğrulama — src/engine.py, config/signatures.py
3. [SIRADA] Tüm aktif oyunculara uygula — motor hazır, lig geneline koş + etiketle
4. [HAZIR-İSKELET] Tarihsel genişletme 1983+ — fallback imzalar tanımlı (aşağıda)
5. [HAZIR-İSKELET] Arketip uyumu — src/affinity.py (beşli lineup birincil + duo ikincil)
6. [PLANLI] Versatile/non-versatile faktörü
7. [PLANLI] FastAPI backend + web

## ONAYLANMIŞ TASARIM KARARLARI (değiştirme, kullanıcı verdi)
- Doğrulama İKİ KATMANLI: bileşen F1 (Katman 1) + kompozit Jaccard (Katman 2).
- Pozisyonlar (Guard/Wing/Big...) nba_api POSITION alanından gelir, skor motorundan DEĞİL.
  Bkz. engine.assign_positions() + signatures.NBA_POSITION_MAP.
- Eşikler: ÖNCE ELLE (config'deki percentile_threshold), SONRA 40 oyuncudan
  F1-maksimize ederek optimize. Bkz. engine.optimize_thresholds().
- Metrikler HAM DEĞİL PERSANTİL tabanlı -> dönemler arası taşınabilir (1983 vs 2026).
- Sözlük genişletme ÖNCE mevcut 40 doğrulandıktan SONRA yapılacak.
- Aşama 4 tarihsel: eksik (tracking/hustle) metrikler için FALLBACK imzalar kullan.
  Kullanıcı BPM önerdi AMA BPM stats.nba.com'da YOK (Basketball-Reference metriği).
  Fallback'lerde BPM yerine OFF/DEF_RATING + PIE + NET_RATING muadilleri kullanıldı.
  Kullanıcı gerçek BPM isterse: nba_api box-score'undan compute_bpm() yazılır (B-Ref formülü).
- Aşama 5 başarı skoru AĞIRLIKLI: playoff_win_pct (0.50) > net_rating (0.30) > regular_win_pct (0.20).
- Aşama 5 BİRİNCİL beşli lineup, İKİNCİL en iyi duolar.

## BİLİNEN KISITLAR / DİKKAT
- 40 oyuncuda 22 bileşen sadece 1 kez geçiyor -> onlar "doğrulanamaz" (LOW_SAMPLE_COMPONENTS).
  Aşama 3'te lig geneline uygulayınca örnek birikir; o zaman daha çok bileşen doğrulanabilir.
  Doğrulanabilir olanlar (n>=2): Two-Way(13), Engine(7), Scoring(5), Downhill(5),
  Anchor/Rim Runner/Stretch/Shotmaker(3), Creator/Connector/Spacer/3-and-D/Three-Level/Versatile(2).
- stats.nba.com resmi API DEĞİL: rate-limit'e dikkat (SLEEP=0.8s), her tabloyu cache'le.
- Oyuncu isim eşleştirmesi: xlsx'teki adlar nba_api PLAYER_NAME ile birebir tutmayabilir
  (ör. "Şengün" vs "Sengun", "Dončić" vs "Doncic"). run_validation.py eşleşmeyenleri raporlar;
  bir isim normalizasyon/eşleme tablosu gerekebilir.
- Lineup verisi gürültülü: MIN_LINEUP_MINUTES=100 eşiği + dakika-ağırlıklı ortalama zorunlu.

## İLK ÇALIŞTIRMA (senin yapacağın)
```
pip install -r requirements.txt
python src/fetch_data.py          # 2025-26 verisini çek (internet gerekli, ~1-2 dk)
python src/run_validation.py      # gerçek F1 + Jaccard + optimize eşikler
```
Çıktıdan sonra: gerçek F1'ler düşükse imza ağırlıklarını/metriklerini iterate et,
sonra Aşama 3'e geç (lig geneli etiketleme).

## DOSYA HARİTASI
- config/signatures.py : modern imzalar (COMPONENT_SIGNATURES) + fallback (FALLBACK_SIGNATURES)
                         + pozisyon eşleme + LOW_SAMPLE + MODERN_ONLY_METRICS
- src/fetch_data.py    : nba_api çekme (player stats + hustle + tracking)
- src/engine.py        : persantil motoru, select_signatures (modern/fallback otomatik),
                         doğrulama, pozisyon atama, eşik optimizasyonu
- src/run_validation.py: Aşama 2 çalıştırıcı (gerçek veri)
- src/affinity.py      : Aşama 5 (lineup + duo uyumu)
- src/mock_test.py     : internetsiz pipeline doğrulama (sentetik veri)

## KOD STİLİ
- Türkçe yorumlar (kullanıcı Türkçe çalışıyor), kısa ve öz.
- Hesaplamaları hardcode etme; persantil/eşik mantığını koru.
- Her yeni sezon/tablo için cache kontrolü yap (gereksiz API çağrısı yapma).
