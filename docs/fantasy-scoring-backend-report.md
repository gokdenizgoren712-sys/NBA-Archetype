# Fantezi Lig Puanlama Motoru — Backend Raporu (Basketbol + Futbol)

**Tarih:** 2026-08-16 · **Durum:** Rapor/tasarım — ileride ihtiyaç olduğunda uygulanmak üzere hazırlandı, henüz kod yazılmadı.
**Kapsam:** Gerçek maç istatistiklerinden "fantezi puanı" hesaplayan bir backend motoru — hem basketbol (bu repoda veri zaten var) hem futbol (veri katmanı ayrı, kullanıcı kendi planında ele alıyor) için ortak bir mimari önerisi.

---

## 0. Özet — en önemli 3 bulgu

1. **Fantezi puanı, sitenin mevcut hiçbir skorlama sistemiyle aynı şey değil** — `overall_score` (percentile-tabanlı arketip kalitesi) ile karıştırılmamalı, `game/salary.js`'in draft-bütçesi "cost"uyla da karıştırılmamalı (bkz. §2). Üçü de meşru ama farklı kavramlar; fantasy puanlama BUNLARIN YERİNE geçmiyor, yanına ekleniyor.
2. **Basketbol tarafında veri şeması eksik** — mevcut `data/2025-26__player_scores.parquet`'te `TOV` (top kaybı), `FTM`, `FT_PCT`, `PF`, `PLUS_MINUS` kolonları **yok** (doğrulandı, bkz. §3.2). Standart fantasy formatlarının hemen hepsi (ESPN, Yahoo, 9-cat) top kaybını cezalandırır — bu olmadan gerçekçi bir puanlama motoru kurulamaz. Küçük ama gerçek bir `src/fetch_data.py` eklentisi gerekiyor.
3. **Gerçek maç-maç (haftalık) fantezi ligi ayrı bir veri sorunu** — bu repodaki NBA istatistikleri SEZON ORTALAMASI; gerçek tarihsel oyuncu box score'ları hiç çekilmiyor (oyun motorundaki box score'lar SENTETİK, bkz. `seasonSim.js`/`headToHead.js`). "Bu hafta kim en çok puan topladı" tarzı klasik/canlı bir fantezi ligi, sezon-ortalama puanlamadan farklı, YENİ bir veri-fetch işidir — bu raporun kapsamı sadece puanlama MEKANİĞİ, haftalık canlı veri ayrı bir iştir (bkz. §7 açık karar 3).

---

## 1. Amaç ve Kapsam

"Fantezi lig puanlama" — bir oyuncunun GERÇEK istatistiklerini (PTS/REB/AST/... ya da futbolda gol/asist/clean sheet/...) sabit bir kural tablosuna göre TEK bir sayıya (fantezi puanı) çeviren mekanizma. Bu, çoğu fantasy platformunun (ESPN, Yahoo, DraftKings, FPL) temelini oluşturan, iyi bilinen, standart bir hesaplama — mimari riski düşük, ama **doğru veri + doğru kural tablosu** gerektiriyor.

Bu rapor bir UYGULAMA değil, ileride ("ilerleyen süreçlerde ihtiyacımız olabilir" — kullanıcı notu) hızlı başlanabilecek bir TASARIM. Amaç: mimari kararları şimdiden netleştirip, iş gerçekten başladığında "nereden başlasak" sorusuyla kaybedilecek zamanı önlemek.

---

## 2. Mevcut mimariyle ilişki — karıştırılmaması gereken 3 farklı "skor" kavramı

| Kavram | Nerede | Neyi ölçer | Girdi |
|---|---|---|---|
| `overall_score` / arketip skorları | `src/score_compat.py`, `config/signatures.py` | Oyuncunun rol/kalite kimliği — **percentile-tabanlı**, sezonlar/ligler arası taşınabilir | Advanced/tracking metrikler (USG_PCT, AST_PCT, DRIVES...) |
| Draft "cost" (%) | `frontend/src/game/salary.js` | Lineup Builder oyununda bir oyuncuyu draft etmenin bütçe maliyeti — `overall_score`'dan türeyen bir EĞRİ, oyun-içi ekonomi | `overall_score` |
| **Fantezi puanı (bu rapor)** | **Henüz yok** | Oyuncunun GERÇEK bir maçta/sezonda ürettiği **ham** istatistiğin, sabit bir kural tablosuyla puana çevrilmiş hâli | Ham box-score istatistikleri (PTS, REB, AST, TOV...) |

**Neden ayrı tutulmalı:** `overall_score` kasıtlı olarak percentile-tabanlı (CLAUDE.md'nin "ONAYLANMIŞ TASARIM KARARLARI" bölümü — ham metrik DEĞİL persantil, sezonlar/ligler arası taşınabilir olsun diye). Fantezi puanlama ise TANIM GEREĞİ ham istatistik üzerinden çalışır (gerçek fantasy platformlarının hepsi böyle — "bu hafta 35 sayı attı" ham bir sayı, percentile değil). İkisini tek bir motorda birleştirmeye çalışmak, ikisinin de amacını bozar. Ayrı, paralel bir modül olmalı.

---

## 3. Basketbol tarafı — somut, veri büyük ölçüde zaten var, hemen başlanabilir

### 3.1 Bilinen fantasy scoring formatları (referans)

| Format | Tip | Kategoriler/Ağırlıklar |
|---|---|---|
| **Kategori-tabanlı (9-cat, en yaygın "roto" ligi)** | Karşılaştırmalı, ağırlıksız | PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, TOV (ters yönlü) |
| **ESPN Standard Puan Ligi** | Doğrusal puan | PTS×1, REB×1, AST×2, STL×4, BLK×4, TOV×-2 (yaklaşık, platform güncellemelerine göre değişir) |
| **Yahoo Standard Puan Ligi** | Doğrusal puan | Benzer ama katsayılar farklı — PTS×1, REB×1.2, AST×1.5, STL×3, BLK×3, TOV×-1 |
| **DraftKings (günlük fantasy)** | Doğrusal puan + bonus | PTS×1, 3PM×0.5, REB×1.25, AST×1.5, STL×2, BLK×2, TOV×-0.5, + double-double/triple-double bonusu |
| **FanDuel (günlük fantasy)** | Doğrusal puan | DraftKings'e benzer, katsayılar biraz farklı |

**Kritik tasarım kararı:** Bu formatların hiçbiri "tek doğru" değil — motor bunların HEPSİNİ desteklemeli, kullanıcı/geliştirici hangi profille hesaplanacağını SEÇEBİLMELİ (bkz. §3.3, §5).

### 3.2 Veri boşlukları (gerçek, doğrulanmış — 2026-08-16)

`data/2025-26__player_scores.parquet` üzerinde doğrudan kontrol edildi:

| Kolon | Durum | Neden lazım |
|---|---|---|
| `TOV` (top kaybı) | **YOK** | Hemen hemen HER format top kaybını cezalandırır (9-cat'te ayrı kategori, puan liglerinde negatif katsayı) |
| `FTM` (isabetli serbest atış) | **YOK** | Sadece `FTA` var — puan-tabanlı formatlarda FTM gerekir (9-cat'te FT% zaten `FT_PCT` üzerinden, ama FTM tek başına bazı formatlarda ayrı ağırlık taşır) |
| `FT_PCT` | **YOK** | 9-cat formatının doğrudan bir kategorisi |
| `PF` (faul) | **YOK** | Bazı puan formatlarında hafif negatif ağırlık taşır |
| `PLUS_MINUS` | **YOK** | Fantezi puanlamada genelde kullanılmaz ama bazı özel/DFS formatlarında bonus olarak geçer |
| `PTS`, `REB`, `AST`, `STL`, `BLK`, `FGM`, `FGA`, `FG3M`, `FG3A`, `FG_PCT`, `FG3_PCT`, `MIN`, `GP` | **VAR** | — |

**Sonuç:** Standart bir 9-cat ya da ESPN/Yahoo puan formatı için `TOV`+`FTM`+`FT_PCT` şart — bunlar olmadan motor eksik/yanlış puanlama yapar. Bu, `src/fetch_data.py`'ye küçük bir ek gerektiriyor (nba_api'nin zaten çektiği "Base" istatistik setinde bu kolonlar mevcut — sadece seçilen/kaydedilen kolon listesine ekleme meselesi, yeni bir API çağrısı değil, muhtemelen tek satırlık bir değişiklik).

### 3.3 Önerilen mimari

```
config/fantasy_profiles_nba.py     # her preset için {stat: katsayı} sözlüğü + eşik kuralları
src/fantasy_scoring.py             # compute_fantasy_points(df, profile_name) -> pd.Series
api/main.py                        # /api/fantasy/nba/players, /api/fantasy/nba/leaderboard
```

`config/fantasy_profiles_nba.py` — `config/signatures.py`'nin `COMPONENT_SIGNATURES` desenine BENZER şekilde yapılandırılmış ama anlamı farklı (percentile threshold değil, DOĞRUDAN doğrusal puan katsayısı):

```python
FANTASY_PROFILES = {
    "espn_standard": {
        "label": "ESPN Standard (Points League)",
        "weights": {"PTS": 1.0, "REB": 1.0, "AST": 2.0, "STL": 4.0, "BLK": 4.0, "TOV": -2.0},
    },
    "yahoo_standard": {
        "label": "Yahoo Standard (Points League)",
        "weights": {"PTS": 1.0, "REB": 1.2, "AST": 1.5, "STL": 3.0, "BLK": 3.0, "TOV": -1.0},
    },
    "draftkings": {
        "label": "DraftKings Classic",
        "weights": {"PTS": 1.0, "FG3M": 0.5, "REB": 1.25, "AST": 1.5, "STL": 2.0, "BLK": 2.0, "TOV": -0.5},
        "bonus": {"double_double": 1.5, "triple_double": 3.0},
    },
    "nine_cat": {
        "label": "9-Category Roto",
        "type": "category",   # doğrusal puan DEĞİL — karşılaştırmalı, ayrı motor mantığı gerekir
        "categories": ["PTS", "REB", "AST", "STL", "BLK", "FG3M", "FG_PCT", "FT_PCT", "TOV"],
    },
}
```

`src/fantasy_scoring.py`'nin çekirdek fonksiyonu basit ve saf (percentile motoruna hiç dokunmuyor):

```python
def compute_fantasy_points(df: pd.DataFrame, profile_name: str) -> pd.Series:
    profile = FANTASY_PROFILES[profile_name]
    pts = pd.Series(0.0, index=df.index)
    for stat, weight in profile["weights"].items():
        pts += df[stat].fillna(0) * weight
    if "bonus" in profile:
        dd = (df[["PTS","REB","AST","STL","BLK"]].fillna(0) >= 10).sum(axis=1)
        pts += (dd >= 2) * profile["bonus"].get("double_double", 0)
        pts += (dd >= 3) * profile["bonus"].get("triple_double", 0)
    return pts
```

(9-cat gibi kategori-tabanlı formatlar doğrusal toplama uymaz — ayrı bir `compute_category_ranks()` fonksiyonu gerekir, karşılaştırmalı sıralama mantığı taşır. Kapsam dışına not düşülüyor, v1'de doğrusal puan formatlarıyla başlanması önerilir, kategori ligi Faz 2.)

### 3.4 Per-game / sezon-ortalama sınırı (önemli, bkz. özet madde 3)

Yukarıdaki tasarım **sezon ortalaması** (`data/2025-26__player_scores.parquet`) üzerinden çalışır — "bu sezon boyunca hangi profile göre kim en değerliydi" sorusuna cevap verir. Bu, mevcut veri altyapısıyla UYUMLU ve HEMEN uygulanabilir.

Ama gerçek bir "haftalık fantasy ligi" deneyimi (klasik ESPN/Yahoo lig formatı — her hafta gerçek maçlardan puan toplarsın) MAÇ-MAÇ gerçek box score gerektirir. Bu repo'da:
- NBA güncel sezon için maç-maç GERÇEK box score hiç çekilmiyor (sadece sezon/kariyer toplamları).
- Oyun motorundaki (`seasonSim.js`/`headToHead.js`) box score'lar SENTETİK — gerçek maç sonuçlarını yansıtmıyor, oyunun kendi iç simülasyonu.

Yani "haftalık gerçek fantasy ligi" özelliği bu rapor kapsamının DIŞINDA — ayrı bir veri-fetch projesi (nba_api'nin `PlayerGameLog` gibi endpoint'lerinden maç-maç veri çekmek) gerektirir. Bu rapor sadece MEVCUT sezon-ortalama veriyle çalışan, hemen uygulanabilir bir "sezon fantezi değeri" motorunu kapsıyor.

---

## 4. Futbol tarafı — veri katmanından bağımsız, sadece puanlama mekaniği

**Not:** Futbolun kendi veri/lig-entegrasyon planı ayrı ele alınıyor (kullanıcı notu — bu raporun kapsamında değil). Burada SADECE, veri geldiğinde takılacak puanlama KURALLARI ve bunların §3'teki mimariyle nasıl aynı şemaya oturacağı var.

### 4.1 Referans format: Fantasy Premier League (FPL) klasik kuralları

Dünyada en yaygın bilinen, iyi belgelenmiş futbol fantasy formatı — pozisyon-bağımlı puanlama:

| Olay | Kaleci (GK) | Defans (DF) | Orta Saha (MF) | Forvet (FW) |
|---|---|---|---|---|
| Gol | +6 | +6 | +5 | +4 |
| Asist | +3 | +3 | +3 | +3 |
| Clean sheet (60+ dk) | +4 | +4 | +1 | 0 |
| Her 2 gol yeme | −1 | −1 | 0 | 0 |
| 60+ dakika oynamak | +2 | +2 | +2 | +2 |
| 60 dk altı oynamak | +1 | +1 | +1 | +1 |
| Sarı kart | −1 | −1 | −1 | −1 |
| Kırmızı kart | −3 | −3 | −3 | −3 |
| Kendi kalesine gol | −2 | −2 | −2 | −2 |
| Penaltı kaçırma | −2 | −2 | −2 | −2 |
| Penaltı kurtarma (sadece GK) | +5 | — | — | — |
| Her 3 kurtarış (sadece GK) | +1 | — | — | — |

Ayrıca FPL'de **Bonus Points System (BPS)** var: her maçta performans bazlı (pas isabeti, top kapma, şut, vs.) bir arka-plan skoru hesaplanır, maçın en iyi 3'üne +3/+2/+1 bonus verilir — bu, sitenin KENDİ arketip-tarzı ağırlıklı-metrik mantığına (bkz. `COMPONENT_SIGNATURES`) şaşırtıcı derecede yakın bir desen; futbol verisi geldiğinde BPS'in kendi versiyonu bu sitenin already-existing "ağırlıklı metrik toplamı" desenine doğal olarak oturur.

### 4.2 Aynı mimari desenin futbola uyarlanması

```
config/fantasy_profiles_football.py   # FPL-tarzı, pozisyon-bağımlı kural tablosu
src/fantasy_scoring_football.py       # ya da src/fantasy_scoring.py'nin ORTAK çekirdeğini reuse eden ince bir katman
```

Örnek profil şeması (§3.3'teki `FANTASY_PROFILES` deseniyle aynı AİLEDE, ama pozisyon-bağımlı olduğu için bir katman daha var):

```python
FOOTBALL_PROFILES = {
    "fpl_classic": {
        "label": "FPL Classic",
        "position_weights": {
            "GK": {"goal": 6, "assist": 3, "clean_sheet": 4, "goals_conceded_per_2": -1, "penalty_save": 5, "saves_per_3": 1},
            "DF": {"goal": 6, "assist": 3, "clean_sheet": 4, "goals_conceded_per_2": -1},
            "MF": {"goal": 5, "assist": 3, "clean_sheet": 1},
            "FW": {"goal": 4, "assist": 3},
        },
        "shared": {"yellow_card": -1, "red_card": -3, "own_goal": -2, "penalty_miss": -2,
                    "played_60plus": 2, "played_under_60": 1},
    },
}
```

**Önemli mimari nokta:** `compute_fantasy_points`'in ÇEKİRDEĞİ (ağırlıklı toplam + eşik/bonus mantığı) basketbol ile aynı desendir — sadece (a) pozisyona göre farklı ağırlık tablosu seçmek, (b) "her 2 gol yeme" gibi eşik-bazlı kuralları işlemek için küçük bir genelleme gerekir. Yani futbol verisi geldiğinde SIFIRDAN bir motor yazılmaz — `src/fantasy_scoring.py`'nin çekirdeği İKİ SPORDA DA aynı kalır, sadece profil config dosyası + pozisyon-ağırlık katmanı eklenir (bkz. §5).

---

## 5. Ortak mimari önerisi (iki spor için TEK çekirdek)

**Öneri: TEK bir `src/fantasy_scoring.py` çekirdeği, sport-specific profil dosyaları.**

Gerekçe: hesaplama mantığı (ağırlıklı doğrusal toplam + eşik/bonus kuralları) her iki sporda da aynı ŞEKİL — farklı olan sadece (1) hangi ham istatistik kolonlarının kullanıldığı, (2) futbolda pozisyona göre ağırlığın değişmesi. Bu, `config/signatures.py`'nin zaten kanıtlanmış desenidir (CORE_NOUNS/MODIFIER_TAGS tek bir `score_component()` motoruyla hesaplanıyor, spor/lig farkı sadece FALLBACK_SIGNATURES gibi config katmanında yaşıyor) — aynı prensip burada da işler.

```python
# src/fantasy_scoring.py (taslak imza)
def compute_fantasy_points(df: pd.DataFrame, profile: dict, position_col: str = None) -> pd.Series:
    """position_col verilmezse basketbol-tarzı (pozisyon-bağımsız) tek ağırlık
    tablosu kullanılır. Verilirse (futbol) her satır kendi pozisyonunun
    ağırlık tablosuyla hesaplanır."""
    ...
```

Bu, iki ayrı modül yazıp aynı hatayı iki kere yapma riskini (bkz. roadmap dokümanındaki "seri-skor formatlayıcı" dersi — `docs/online-architecture-review-and-roadmap.md` §1.2 madde 7) baştan önler.

---

## 6. Leaderboard/oyun sistemleriyle ilişki — erken uyarı

`docs/online-architecture-review-and-roadmap.md` §2.4'te tam olarak bu sitede yaşanmış bir ders var: **"üç paralel kadro deposu + lider tablosu" riski** (Klasik Leaderboard / Board Challenge / önerilip iptal edilen Kadro Savaşı). Fantezi puanlama motoru gelecekte kendi lider tablosunu isteyebilir ("bu sezon en çok fantezi puanı toplayan oyuncu kim") — bu YENİ bir dördüncü paralel sistem olmasın diye ŞİMDİDEN düşünülmesi gereken soru:

- Fantezi puanı sadece Players/Explore sayfalarına bir SÜTUN olarak mı eklenecek (ucuz, mevcut sayfaya ek), yoksa kendi ayrı sayfası/lider tablosu mu olacak?
- Eğer ayrı bir lider tablosu olacaksa, mevcut `/api/leaderboard` (kullanıcı draft sonuçları) ile KARIŞTIRILMAMALI — bu ayrı bir kavram (gerçek NBA/futbol oyuncularının gerçek performansı, kullanıcı draftı değil).

Bu, §7'de açık bir karar maddesi olarak bırakılıyor — şimdi karar vermeye gerek yok, ama uygulamaya geçilirken ilk soru bu olmalı.

---

## 7. Açık kararlar (uygulamaya geçmeden önce kullanıcı onayı gerekiyor)

1. **Hangi presetler önce gelsin?** (Basketbol: ESPN/Yahoo/DraftKings/9-cat'ten hangisi/hangileri v1'de olsun?)
2. **Kullanıcı kendi özel puanlama profilini oluşturabilsin mi** (DB'de saklanan custom profil, yeni bir tablo gerektirir) yoksa sabit presetler mi yeterli (v1 basitliği, öneri: sabit presetlerle başla)?
3. **Sezon-ortalama mı, gerçek maç-maç mı?** (İkincisi §3.4'te açıklanan yeni bir veri-fetch işi — NBA için gerçek historical box score fetch edilmiyor şu an.)
4. **Nerede gösterilecek?** Mevcut Players/Explore sayfasına sütun mu, yoksa yeni bir sayfa/lider tablosu mu (bkz. §6)?
5. **Futbol tarafı ne zaman devreye girer?** Veri katmanı kullanıcının kendi planına bağlı — bu rapor sadece puanlama motorunun futbola HAZIR olmasını sağlıyor, veri entegrasyonu ayrı bir iş/karar.

---

## 8. Önerilen faz sıralaması

```
Faz 1 (Basketbol — hemen başlanabilir, veri büyük ölçüde hazır)
  1a. src/fetch_data.py: TOV/FTM/FT_PCT/PF kolonlarını ekle (küçük iş, yeni API çağrısı değil)
  1b. config/fantasy_profiles_nba.py + src/fantasy_scoring.py çekirdeği
  1c. 2-3 preset (öneri: ESPN standard + DraftKings + 9-cat)
  1d. API: /api/fantasy/nba/players?profile=X
  1e. Frontend: Players sayfasına "Fantasy Pts" sütunu (açık karar #4'e göre)

Faz 2 (Basketbol — açık karara bağlı)
  Ayrı lider tablosu/sayfa, ya da custom profil desteği

Faz 3 (Futbol — veri katmanı ayrı planda)
  config/fantasy_profiles_football.py eklenir, src/fantasy_scoring.py'nin
  pozisyon-ağırlıklı genellemesi (§5) devreye girer — çekirdek kod DEĞİŞMEZ.
```

Faz 1 diğerlerinden bağımsız, veri boşluğu kapatılınca hemen başlanabilir.

---

*Bu rapor 2026-08-16 tarihinde, gerçek repo verisine karşı doğrulanan bulgularla (veri boşlukları §3.2) hazırlanmıştır. Kod yazılmadan önce §7'deki açık kararların netleşmesi gerekiyor.*
