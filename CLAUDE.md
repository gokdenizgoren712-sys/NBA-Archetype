# NBA Arketip Etiketleme Sistemi — Proje Brief

Bu dosyayı oku ve projenin tamamını kavra. Sistem artık NBA-tek-lig değil,
**çok-lig (v3.x)**: NBA (güncel+tarihsel 1983+) + G-League + NCAA + EuroLeague +
Prospect derecelendirme + Comparables motoru + FastAPI backend + React frontend
("Primary Arch" marka kimliği) hepsi canlıda.

## Amaç
Kullanıcının elle hazırladığı NBA jargon sözlüğündeki oyuncu arketiplerini
niceliksel metriklerle eşleştiren, doğrulayan ve NBA (1983+) + G-League +
NCAA + EuroLeague'deki TÜM oyunculara otomatik uygulayan bir sistem.
Arketip uyumlarını (lineup/duo) ve genç oyuncu (prospect) derecelendirmesini
hesaplayıp web sitesinde sunuyor.

## Kullanıcının elindeki kaynak
`nba_scouting_tags.xlsx` — 2 sheet:
  - "Top 41": 40 oyuncu, her biri Seviye + bileşik Etiket (ör. "Pressure Scoring Engine")
  - "Jargon Sözlüğü": Core nouns / Modifiers / Position tags / Tiers taksonomisi
Bu dosya GROUND TRUTH'tur. Yolu run_validation.py içinde TAGS_XLSX ile ayarla.

## Yol Haritası ve Durum (v3.x — hepsi canlı)
1. [BİTTİ] Veri çekme — src/fetch_data.py (NBA), src/fetch_gleague.py, src/fetch_ncaa.py, src/fetch_euroleague.py
2. [BİTTİ] Threshold motoru + 2 katmanlı doğrulama — src/engine.py, config/signatures.py
3. [BİTTİ] Tüm liglere uygulama — her lig kendi FALLBACK/COMPONENT imza seçimiyle skorlanıyor (src/score_compat.py)
4. [BİTTİ] Tarihsel genişletme 1983+ — src/fetch_historical.py, src/enrich_historical.py + gerçek B-Ref BPM
5. [BİTTİ] Arketip uyumu — src/affinity.py (lineup/duo, NBA-only) + score_compat.py'nin canlı duo/lineup formülleri
6. [BİTTİ] Prospect derecelendirme — src/prospect.py (floor/ceiling/grade/tier, NCAA+G-League+EuroLeague)
7. [BİTTİ] Comparables motoru — src/comparables.py ("genç X'e benziyor", 1983+ NBA rookie-sezon havuzu)
8. [BİTTİ] FastAPI backend + React/Vite frontend — api/main.py, frontend/

## ONAYLANMIŞ TASARIM KARARLARI (değiştirme, kullanıcı verdi)
- Doğrulama İKİ KATMANLI: bileşen F1 (Katman 1) + kompozit Jaccard (Katman 2).
- Pozisyonlar skor motorunda İKİ KATMANLI kullanılır:
  (a) NBA_POSITION_MAP/POSITION_COMPONENTS — yalnızca eski boolean/tarihsel etiketleme
      yolunda (engine.assign_positions(), run_validation.py, label_league.py).
  (b) NOUN_POSITION_MASK (config/signatures.py) — CANLI skorlama yolu (score_compat.py),
      PG/SG/SF/PF/C kısa kod bekler. TÜM liglerin POSITION alanı bu formatta olmalı
      (fetch_ncaa.py ROLE_MAP, fetch_gleague.py _infer_position() bunu üretir — 2026-07'ye
      kadar bu ikisi uzun-form/boş üretiyordu, bu yüzden 7/12 çekirdek noun skoru tüm
      NCAA+G-League oyuncularında ~0.30'a sıkışıyordu; düzeltildi).
- Eşikler: ÖNCE ELLE (config'deki percentile_threshold), SONRA 40 oyuncudan
  F1-maksimize ederek optimize. Bkz. engine.optimize_thresholds().
- Metrikler HAM DEĞİL PERSANTİL tabanlı -> dönemler arası VE ligler arası taşınabilir.
- Sözlük genişletme ÖNCE mevcut 40 doğrulandıktan SONRA yapılacak.
- Tarihsel + non-NBA ligler: eksik (tracking/hustle) metrikler için FALLBACK imzalar kullan
  (select_signatures() modern-metrik kapsamına göre otomatik seçer).
  NBA'de gerçek Basketball-Reference BPM (src/fetch_bref.py); NCAA/G-League/EuroLeague'de
  kendi-üretilmiş proxy BPM (src/compute_bpm.py). 2026-07: proxy artık NBA'de real-vs-proxy
  yan yana ölçülerek (582 oyuncu, OBPM corr=0.82, DBPM corr=0.58) gerçek B-Ref dağılımına
  (mean/std) kalibre ediliyor — önceden sabit ×3.5/×2.5 çarpanı proxy'yi sistematik dar
  tutuyordu (std 1.98 vs gerçek 3.38), bu da non-NBA liglerin aynı [-5,15] overall_score
  kırpma aralığını NBA kadar hiç dolduramaması demekti; artık dolduruyor.
- Affinity başarı skoru AĞIRLIKLI: playoff_win_pct (0.50) > net_rating (0.30) > regular_win_pct (0.20),
  MIN_LINEUP_MINUTES=100 (duo=250). src/affinity.py NBA-only, hâlâ "iskelet" — canlı
  duo/lineup-compat endpoint'leri (score_compat.py _duo_role_score/_lineup_role_score) FARKLI,
  kendi 5-pillar formülleriyle çalışıyor (bkz. dosya başındaki docstring, güncel tutulmalı).
- Prospect derecelendirme (src/prospect.py): floor = OBPM+PTS persantili × SOS persantili
  (overall_pct'ten DAHA yordayıcı bulundu, Spearman 0.14→0.20), ceiling = yaş-projeksiyonlu,
  grade = floor/ceiling harmanı × yaş cezası. EuroLeague'de max_age=20 (U21) kapısı var,
  NCAA/G-League'de yaş sınırı yok. Sabitler "varsayılan" — gerçek NBA draft-sonucuna karşı
  tam backtest henüz yapılmadı (P5 cetveli kısmi).
- Comparables (src/comparables.py): yalnızca 1983+ NBA rookie-sezon havuzundan eşleşir
  (min_seasons=2), cosine benzerliği mean-centered 12-arketip vektöründe. NCAA/G-League/
  EuroLeague prospect'leri arası veya kendi-lig-içi comparable yok.

## BİLİNEN KISITLAR / DİKKAT
- stats.nba.com / Torvik / euroleague-api resmi API DEĞİL: rate-limit'e dikkat, her tabloyu
  cache'le (data/*.parquet, {league}__{season}__*.parquet formatı).
- Oyuncu isim eşleştirmesi TEK NOKTADA STANDART DEĞİL: NBA'de bref-merge + validation'da
  aksan-temizleme var (src/fetch_bref_positions.py, src/validate_ground_truth.py), ama
  CANLI API sorgu katmanında (api/main.py'deki tüm /players/{name}/scores endpoint'leri)
  yalnızca büyük/küçük harf + substring eşleşmesi var, aksan yok. NCAA/G-League isim
  normalizasyonu hiç yok. Bir isim normalizasyon tablosu tüm liglere genellenebilir.
- Lineup verisi gürültülü: MIN_LINEUP_MINUTES=100 (duo=250) eşiği + dakika-ağırlıklı
  ortalama zorunlu. src/affinity.py NBA-only.
- G-League/EuroLeague'de SOS (strength-of-schedule) sinyali YOK — CONF_ADJEM sadece
  NCAA'da mevcut, diğer ikisinde prospect.py nötr 0.5 kullanır.
- G-League/NCAA/EuroLeague'de modifier etiketleri YOK (FALLBACK_SIGNATURES yalnızca
  12 çekirdek noun tanımlar) — /scores yanıtında modifier_scores/active_modifiers alanı
  bu 3 ligde her zaman boş.
- API'de G-League/NCAA/EuroLeague endpoint'lerinde season/team/tier/min_gp/age
  parametreleri var (2026-07 eklendi) ama yalnızca cache'lenmiş sezonlar için çalışır —
  yeni sezon eklemek için ilgili fetch_*.py --season X önce koşulmalı, sonra
  api/admin/clear-cache ile lru_cache temizlenmeli.

## İLK ÇALIŞTIRMA
```
pip install -r requirements.txt
python src/fetch_data.py          # NBA güncel sezon
python src/fetch_gleague.py       # G-League güncel sezon
python src/fetch_ncaa.py          # NCAA güncel sezon (Torvik)
python src/fetch_euroleague.py    # EuroLeague güncel sezon
python src/run_validation.py      # gerçek F1 + Jaccard + optimize eşikler (NBA ground truth)
uvicorn api.main:app --reload     # backend
cd frontend && npm run dev        # frontend
```

## DOSYA HARİTASI
- config/signatures.py : modern imzalar (COMPONENT_SIGNATURES) + fallback (FALLBACK_SIGNATURES)
                         + NOUN_POSITION_MASK (canlı skorlama pozisyon kısıtı) + MODERN_ONLY_METRICS
                         + eski NBA_POSITION_MAP (yalnızca tarihsel boolean yol)
- config/roles.py      : AFFINITY_MATRIX (arketip-arketip uyum önseli, lineup verisiyle güncellenir)
- src/fetch_data.py    : NBA nba_api çekme (player stats + hustle + tracking)
- src/fetch_gleague.py : G-League nba_api çekme (Base+Adv+Usage, pozisyon inferansı dahil)
- src/fetch_ncaa.py    : NCAA Torvik çekme (SOS/CONF_ADJEM, pozisyon rol-eşleme dahil)
- src/fetch_euroleague.py : EuroLeague euroleague-api çekme (pozisyon inferansı, U21 prospect gate)
- src/fetch_historical.py / enrich_historical.py : 1983+ tarihsel NBA + gerçek B-Ref BPM
- src/compute_bpm.py   : BPM proxy (NCAA/G-League/EuroLeague — B-Ref verisi yok bu liglerde)
- src/engine.py        : persantil motoru, select_signatures (modern/fallback otomatik),
                         doğrulama, eski pozisyon atama (assign_positions), eşik optimizasyonu
- src/score_compat.py  : CANLI skor tablosu (build_score_table, tüm ligler) + duo/lineup
                         uyum formülleri (_duo_role_score/_lineup_role_score)
- src/prospect.py      : Prospect floor/ceiling/grade/tier + güçlü/zayıf yanlar
- src/comparables.py   : "genç X'e benziyor" — 1983+ NBA rookie-sezon havuzu, cosine benzerlik
- src/run_validation.py: NBA ground-truth çalıştırıcı (gerçek veri, Top 41 xlsx)
- src/affinity.py      : lineup/duo uyumu (NBA-only, gerçek lineup verisinden — iskelet)
- src/mock_test.py     : internetsiz pipeline doğrulama (sentetik veri)
- api/main.py          : FastAPI — /api/players, /api/gleague|ncaa|euroleague/players(+/scores,
                         +/seasons), /api/historical/*, /api/lineup-compat, /api/affinity, vb.
- frontend/            : React/Vite — Players/GLeague/NCAAPage/EuroLeaguePage/Compare/Explore/
                         Affinity/LineupGame(oyun) sayfaları, "Primary Arch" marka kimliği

## KOD STİLİ
- Türkçe yorumlar (kullanıcı Türkçe çalışıyor), kısa ve öz.
- Frontend kullanıcı-karşı TÜM metin İNGİLİZCE olmalı (i18n/en.js + tr.js dil anahtarlarıyla
  toggle edilen bilinçli çeviriler hariç) — yorumlar Türkçe kalabilir.
- Hesaplamaları hardcode etme; persantil/eşik mantığını koru.
- Her yeni sezon/tablo için cache kontrolü yap (gereksiz API çağrısı yapma).
- Yeni bir lig eklerken POSITION alanını mutlaka PG/SG/SF/PF/C kısa koduna normalize et
  (NOUN_POSITION_MASK bunu bekliyor — bkz. yukarıdaki BİLİNEN KISITLAR notu).
