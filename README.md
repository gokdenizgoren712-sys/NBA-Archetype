# NBA Arketip Etiketleme Sistemi

Jargon sözlüğündeki oyuncu arketiplerini niceliksel NBA metrikleriyle eşleştiren,
doğrulayan ve otomatik etiketleyen sistem.

## Kurulum
    pip install nba_api pandas numpy pyarrow openpyxl scikit-learn

## Aşama durumu
- [x] Aşama 1: Veri çekme (src/fetch_data.py) — cache'li, rate-limited
- [x] Aşama 2: Threshold motoru + iki katmanlı doğrulama (src/engine.py, config/signatures.py)
- [ ] Aşama 3: Tüm aktif oyunculara uygulama (motor hazır, sadece lig geneline koş)
- [ ] Aşama 4: Tarihsel genişletme (1983+) — dönem-uyarlamalı imzalar gerek
- [ ] Aşama 5: Arketip uyum korelasyonu (ağırlıklı takım başarısı)
- [ ] Aşama 6: Versatile/non-versatile faktörü
- [ ] Aşama 7: FastAPI backend + web

## Çalıştırma sırası
1. python src/fetch_data.py          # gerçek veriyi çek (internet gerekli)
2. python src/run_validation.py      # 40 oyuncuyu doğrula + eşik optimize et
3. (sonraki aşamalar)

## Dosyalar
- config/signatures.py : 14 bileşen × 6-7 metrik imzası + pozisyon eşleme
- src/fetch_data.py     : nba_api veri çekme
- src/engine.py         : persantil motoru, doğrulama, pozisyon atama, eşik optimizasyonu
- src/mock_test.py      : gerçek veri olmadan pipeline doğrulama (sentetik)

## Önemli tasarım kararları
- Ham eşik değil PERSANTİL kullanılır -> dönemler arası taşınabilir (1983 vs 2026)
- Pozisyonlar nba_api POSITION alanından gelir (skor motorundan değil)
- Eşikler: önce elle, sonra 40 oyuncudan F1-maksimize ederek optimize edilir
- Doğrulama 2 katmanlı: bileşen F1 (Katman 1) + kompozit Jaccard (Katman 2)
- Tracking/Hustle metrikleri eski sezonlarda yoksa motor otomatik düşürür
