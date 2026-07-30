"""
Bileşen imzaları — tamamen yeniden yazıldı.

Mimari:
  CORE_NOUNS (12): oyuncunun temel rolünü tanımlayan isimler.
    → Sürekli [0..1] skor verilir, radar chart'ta gösterilir.
    → Duo/lineup uyum hesaplamalarında kullanılır.
    → primary_arch = en yüksek core noun skoru.

  MODIFIER_TAGS (22): oyuncunun özelliklerini niteleyen sıfatlar.
    → [0..1] skor verilir ama uyum hesabında yer almaz.
    → Eşik geçildiğinde boolean "aktif etiket" olur (frontend'de badge).

  FALLBACK_SIGNATURES: tarihsel sezonlar (1983+) için yalnızca klasik
    istatistiklerle hesaplanan core noun versiyonları.
"""

# ─── CORE NOUNS (12) ─────────────────────────────────────────────────────────

COMPONENT_SIGNATURES = {

    # 1) ENGINE — yüksek topla, hücumu kendi yaratan birincil üretici
    "Engine": {
        "type": "core",
        "desc": "Primary ball-dominant scorer-creator; offense runs through him (SGA/Luka type)",
        "percentile_threshold": 0.775,  # optimize: F1=0.625 @ 0.775
        "metrics": {
            "USG_PCT":          {"w": 0.12, "higher": True},
            "USG_TEAM_REL":     {"w": 0.08, "higher": True},   # takım bağlamında göreli USG (iyi takım cezasını dengeler)
            "TIME_OF_POSS":     {"w": 0.14, "higher": True},
            "PCT_UAST_FGM":     {"w": 0.14, "higher": True},   # yüzde: kendi şutunu yaratıyor
            "FGM":              {"w": 0.06, "higher": True},   # sayı çifti
            "DRIVES":           {"w": 0.12, "higher": True},
            "AST_PCT":          {"w": 0.09, "higher": True},
            "AST":              {"w": 0.06, "higher": True},   # sayı çifti
            "FGA":              {"w": 0.07, "higher": True},
            "PCT_PTS_OFF_TOV":  {"w": 0.04, "higher": True},
            "OBPM":             {"w": 0.08, "higher": True},
        },
    },

    # 2) ECOSYSTEM — yüksek gravity, skor + pas + etki; heliocentric-adjacent
    # Jokic, prime LeBron tipi: hem skorer, hem yaratıcı, hem de herkesin oyununu yükseltiyor.
    # Kendi şutunu yaratabilmeli + asist + gravity → ekibi ona bağımlı.
    "Ecosystem": {
        "type": "core",
        "desc": "High-gravity creator who scores, creates, and elevates everyone; offense is built around him",
        "percentile_threshold": 0.975,  # sadece gerçek heliocentric playmaker'lar — Jokic/prime LeBron seviyesi
        "metrics": {
            "AST_PCT":       {"w": 0.20, "higher": True},   # PRIMARY: creation rate (Jokic 0.46 vs Maxey 0.29)
            "POTENTIAL_AST": {"w": 0.16, "higher": True},   # court vision
            "OBPM":          {"w": 0.14, "higher": True},   # offensive win impact
            "USG_PCT":       {"w": 0.14, "higher": True},   # heliocentric gravity
            "SECONDARY_AST": {"w": 0.12, "higher": True},   # hockey assists
            "PTS":           {"w": 0.12, "higher": True},   # must score too (Giddey gibi passer-only oyuncuları filtreler)
            "AST":           {"w": 0.08, "higher": True},   # sayı çifti
            "PASSES_MADE":   {"w": 0.04, "higher": True},   # sadece minor volüm sinyal
        },
    },

    # 3) HUB — halfcourt'ta setlerin üzerinden kurulduğu yapısal merkez
    # Şengün tipi: guard değil, top sahaya gelince ona verilir, setler onun üzerinden akar.
    # Skor yapabilir ama birincil görevi ofsanstaki yapısal pivot noktası olmak.
    "Hub": {
        "type": "core",
        "desc": "Structural pivot of the halfcourt offense; sets are run through him, not a guard",
        "percentile_threshold": 0.74,
        "metrics": {
            "PASSES_MADE":   {"w": 0.25, "higher": True},   # top dağıtım hacmi
            "POTENTIAL_AST": {"w": 0.20, "higher": True},   # asist potansiyeli
            "AST":           {"w": 0.16, "higher": True},   # ham asist sayısı
            "USG_PCT":       {"w": 0.13, "higher": True},
            "DRIVES":        {"w": 0.09, "higher": False},  # guard gibi drive atmaz
            "AST_PCT":       {"w": 0.07, "higher": True},
            "OBPM":          {"w": 0.10, "higher": True},
        },
    },

    # (Conductor silindi — Initiator bu rolü kapsar)

    # 5) CONNECTOR — aksiyonları birbirine bağlayan tutkal (Draymond, Caruso, Josh Hart)
    "Connector": {
        "type": "core",
        "desc": "Glue player linking actions on both ends; screen-setting, cutting, energy — Draymond/Caruso type",
        "percentile_threshold": 0.90,  # optimize: F1=0.667 @ 0.90
        "metrics": {
            "SCREEN_ASSISTS": {"w": 0.20, "higher": True},
            "DEFLECTIONS":    {"w": 0.14, "higher": True},
            "AST_RATIO":      {"w": 0.12, "higher": True},
            "AST":            {"w": 0.08, "higher": True},
            "PASSES_MADE":    {"w": 0.12, "higher": True},
            "REB":            {"w": 0.10, "higher": True},
            "OREB":           {"w": 0.06, "higher": True},   # enerji proxy
            "DREB":           {"w": 0.04, "higher": True},
            "OBPM":           {"w": 0.07, "higher": True},
            "DBPM":           {"w": 0.07, "higher": True},
        },
    },

    # 6) CREATOR — hareket bazlı avantaj üreticisi; Banchero/Wagner tipi wing creator
    # Drive + dribble pick-and-roll + asist odaklı; kendi şutunu da yaratır ama sürüşle biter.
    # USG_PCT negatif: yüksek usage scorerlar (Engine) Creator'ı kazanmasın.
    "Creator": {
        "type": "core",
        "desc": "Movement-based advantage creator; creates off drives and reads — Banchero/Wagner type",
        "percentile_threshold": 0.785,
        "metrics": {
            "DRIVES":               {"w": 0.22, "higher": True},
            "AST_PCT":              {"w": 0.18, "higher": True},
            "AST_TO":               {"w": 0.16, "higher": True},
            "DRIVE_FGA":            {"w": 0.14, "higher": True},
            "AST":                  {"w": 0.10, "higher": True},
            "OBPM":                 {"w": 0.08, "higher": True},
            "TIME_OF_POSS":         {"w": 0.06, "higher": False},
            "USG_PCT":              {"w": 0.06, "higher": False},  # yüksek scorer → Engine değil Creator
        },
    },

    # (Fulcrum silindi)

    # 7) ANCHOR — savunmanın temel taşı; rim protection
    # DREB_PCT yanına ham DREB de eklendi; DBPM eklendi.
    "Anchor": {
        "type": "core",
        "desc": "Defensive cornerstone; rim protection and defensive rebounding",
        "percentile_threshold": 0.90,  # optimize: F1=0.857 @ 0.90
        "metrics": {
            "BLK":             {"w": 0.20, "higher": True},
            "DEF_RATING":      {"w": 0.16, "higher": False},
            "CONTESTED_SHOTS": {"w": 0.16, "higher": True},
            "DREB_PCT":        {"w": 0.12, "higher": True},
            "DREB":            {"w": 0.10, "higher": True},   # ham ribaund sayısı
            "DEF_WS":          {"w": 0.10, "higher": True},
            "STL":             {"w": 0.06, "higher": True},
            "DBPM":            {"w": 0.10, "higher": True},
        },
    },

    # 8) SPACER — guard/wing catch-and-shoot uzmanı; şut tehdidiyle alan açan
    # Stretch (modifier) büyükler içindir; Spacer 1-2-3 pozisyon oyuncuları içindir.
    # DRIVES kaldırıldı: fillna(0) ile eksik veri oyuncuları yanlış avantaj kazanıyordu.
    # Yerine PCT_PTS_3PT ağırlığı artırıldı; FG3A/FG3M çifti hacim sinyali veriyor.
    "Spacer": {
        "type": "core",
        "desc": "Guard/wing catch-and-shoot specialist; opens floor via 3PT threat — not a driver or handler",
        "percentile_threshold": 0.76,
        "metrics": {
            "FG3_PCT":     {"w": 0.28, "higher": True},   # isabetlilik — birincil sinyal
            "FG3A":        {"w": 0.22, "higher": True},   # hacim: çok 3PT atıyor
            "PCT_PTS_3PT": {"w": 0.22, "higher": True},   # puanın büyük çoğunluğu 3PT
            "FG3M":        {"w": 0.10, "higher": True},   # made hacmi teyit
            "AST_PCT":     {"w": 0.10, "higher": False},  # playmaker değil
            "TIME_OF_POSS":{"w": 0.08, "higher": False},  # top tutmuyor
        },
    },

    # 9) FINISHER — başkasının yarattığını bitiren; catch-and-finish + cut finisher
    # Asist edilmiş atışlar yüksek + paint bitirici; cut ederek pas alıp içerde bitirir.
    "Finisher": {
        "type": "core",
        "desc": "Converts what others create; catch-and-finish or cut-to-basket specialist",
        "percentile_threshold": 0.74,
        "metrics": {
            "PCT_AST_FGM":   {"w": 0.22, "higher": True},   # yüzde: highly assisted
            "FGM":           {"w": 0.12, "higher": True},   # sayı: hacim çifti
            "FG_PCT":        {"w": 0.18, "higher": True},   # yüzde: verimlilik
            "PCT_PTS_PAINT": {"w": 0.16, "higher": True},
            "USG_PCT":       {"w": 0.12, "higher": False},  # low usage = role player
            "DRIVES":        {"w": 0.10, "higher": False},  # kendisi yaratmaz
            "OBPM":          {"w": 0.10, "higher": True},
        },
    },

    # 10) FORCE — top elinde içeriye girerek fiziksel baskı uygulayan
    # Unassisted FGM yüksek (topu taşıyarak içeri giriyor), REB + foul drawing.
    # DIST_MILES kaldırıldı; PCT_UAST_FGM + FGM çifti eklendi.
    "Force": {
        "type": "core",
        "desc": "Powers through contact with the ball — self-created finisher, rebounder, foul drawer",
        "percentile_threshold": 0.76,
        "metrics": {
            "REB":           {"w": 0.22, "higher": True},
            "FTA":           {"w": 0.20, "higher": True},
            "PCT_UAST_FGM":  {"w": 0.16, "higher": True},  # yüzde: unassisted oran
            "FGM":           {"w": 0.12, "higher": True},  # sayı: hacim çifti
            "BLK":           {"w": 0.10, "higher": True},
            "STL":           {"w": 0.10, "higher": True},
            "OBPM":          {"w": 0.10, "higher": True},
        },
    },

    # 11) INITIATOR — tempo setter / transition starter; geçiş hücumunu başlatan
    # Topu geçişte ileriye taşır, aksiyon başlatır ama bitirmek zorunda değil.
    # DIST_MILES buraya taşındı (transition oyuncusu mesafe yapar).
    "Initiator": {
        "type": "core",
        "desc": "Transition starter and tempo setter; pushes pace, triggers early offense",
        "percentile_threshold": 0.74,
        "metrics": {
            "AVG_SPEED":    {"w": 0.22, "higher": True},   # hız = geçiş tetikleyici
            "PCT_PTS_FB":   {"w": 0.20, "higher": True},   # fast break üretimi
            "DIST_MILES":   {"w": 0.18, "higher": True},   # kapsanan alan
            "PASSES_MADE":  {"w": 0.15, "higher": True},   # aksiyon başlatma hacmi
            "TIME_OF_POSS": {"w": 0.10, "higher": False},  # kısa poz süresi = hızlı karar
            "OBPM":         {"w": 0.15, "higher": True},
        },
    },

    # 12) STOPPER — elit birebir/point-of-attack savunucusu
    "Stopper": {
        "type": "core",
        "desc": "Elite on-ball defender; shuts down perimeter assignments",
        "percentile_threshold": 0.80,
        "metrics": {
            "STL":             {"w": 0.29, "higher": True},
            "DEF_RATING":      {"w": 0.23, "higher": False},
            "DEFLECTIONS":     {"w": 0.22, "higher": True},
            "CONTESTED_SHOTS": {"w": 0.11, "higher": True},
            "BLK":             {"w": 0.05, "higher": False},  # stopper is perimeter, not rim
            "DBPM":            {"w": 0.10, "higher": True},
        },
    },

    # 13) RIM RUNNER — topsuz koşarak içerde bitiren; alley-oop / cut finisher
    # Assisted FGM yüksek (top olmadan içeri giriyor), Force'un tersi.
    # FGM/OREB ham sayıları kaldırıldı: az dakika oynayan rol oyuncularını cezalandırıyordu.
    # Yüzde tabanlı metrikler tercih edildi (dakika bağımsız).
    "Rim Runner": {
        "type": "core",
        "desc": "Off-ball cutter and alley-oop finisher; runs to the rim without the ball",
        "percentile_threshold": 0.76,
        "metrics": {
            "PCT_AST_FGM":   {"w": 0.28, "higher": True},  # topsuz bitirme oranı — birincil
            "FG_PCT":        {"w": 0.22, "higher": True},  # verimlilik
            "PCT_PTS_PAINT": {"w": 0.20, "higher": True},  # paint'te bitiyor
            "OREB_PCT":      {"w": 0.18, "higher": True},  # ofansif ribauntta — sepet yakını
            "PCT_PTS_FB":    {"w": 0.06, "higher": True},  # fast break finisher
            "OBPM":          {"w": 0.06, "higher": True},
        },
    },

    # ─── MODIFIER TAGS (27) ───────────────────────────────────────────────────
    # Bunlar boolean etikettir; uyum hesaplamalarına girmez.

    "Two-Way": {
        "type": "modifier",
        "desc": "Kawhi/Butler type: elite defender who also scores and creates offensively",
        "percentile_threshold": 0.74,
        # 2026-07 modifier denetimi: dış kaynaklara göre daha dengeli bir
        # ağırlık (daha az savunma, hücuma AST_PCT eklenmiş) DENENDİ, ama
        # 40 ground-truth oyuncuya karşı F1 0.522 -> 0.348'e DÜŞTÜ — bu
        # projenin "Two-Way" etiketlediği oyuncular dış literatürden daha
        # savunma-ağırlıklı görünüyor. Ground truth burada daha otoriter
        # (bkz. CLAUDE.md), o yüzden eski (savunma-ağırlıklı) ağırlık
        # BİLEREK geri alındı — konsept-tutarlılık F1'i feda etmeye değmedi.
        "metrics": {
            "DEF_RATING":  {"w": 0.16, "higher": False},
            "NET_RATING":  {"w": 0.14, "higher": True},
            "STL":         {"w": 0.11, "higher": True},
            "BLK":         {"w": 0.09, "higher": True},
            "DEFLECTIONS": {"w": 0.12, "higher": True},
            "DEF_WS":      {"w": 0.10, "higher": True},
            "OBPM":        {"w": 0.08, "higher": True},
            "DBPM":        {"w": 0.08, "higher": True},
            "PTS":         {"w": 0.08, "higher": True},    # ofansif üretim
            "FG_PCT":      {"w": 0.04, "higher": True},    # verimli skor
        },
    },

    "Heliocentric": {
        "type": "modifier",
        "desc": "Everything orbits around him; extremely high usage",
        "percentile_threshold": 0.93,
        "metrics": {
            "USG_PCT":      {"w": 0.38, "higher": True},
            "TIME_OF_POSS": {"w": 0.28, "higher": True},
            "FGA":          {"w": 0.14, "higher": True},
            "PCT_UAST_FGM": {"w": 0.10, "higher": True},
            "FGM":          {"w": 0.10, "higher": True},   # sayı çifti
        },
    },

    "Pressure": {
        "type": "modifier",
        # Foul-Drawing modifier merge edildi — FTA + FTM çifti eklendi.
        "desc": "Collapses defenses through rim/foul pressure; elite foul drawer",
        "percentile_threshold": 0.76,
        "metrics": {
            "FTA":             {"w": 0.28, "higher": True},
            "FTM":             {"w": 0.08, "higher": True},   # sayı çifti
            "FT_RATE":         {"w": 0.22, "higher": True},
            "DRIVES":          {"w": 0.20, "higher": True},
            "PCT_PTS_OFF_TOV": {"w": 0.12, "higher": True},
            # CONTESTED_SHOTS buradaydı — kod tabanının her yerinde (Anchor,
            # Stopper, Point-of-Attack) SAVUNMADA kontre edilen şut anlamına
            # geliyor, Pressure ise HÜCUM kavramı — copy-paste hatasıydı
            # (2026-07 modifier denetimi). Gerçek rim-pressure ölçümü boyalı
            # alan skorlama payı — PCT_PTS_PAINT ile değiştirildi.
            "PCT_PTS_PAINT":   {"w": 0.10, "higher": True},
        },
    },

    "Shotmaker": {
        "type": "modifier",
        "desc": "Creates and converts his own shot; pull-up specialist",
        "percentile_threshold": 0.775,  # optimize: F1=0.500 @ 0.775
        "metrics": {
            "PULL_UP_PTS":    {"w": 0.22, "higher": True},
            "PULL_UP_FG_PCT": {"w": 0.18, "higher": True},
            "PCT_UAST_FGM":   {"w": 0.18, "higher": True},
            "FGM":            {"w": 0.08, "higher": True},   # sayı çifti
            "PCT_PTS_2PT_MR": {"w": 0.14, "higher": True},
            "TS_PCT":         {"w": 0.10, "higher": True},
            "PTS":            {"w": 0.10, "higher": True},   # sayı çifti
        },
    },

    # 2026-07 modifier denetimi: eski weighted-sum formülü mimari olarak
    # yanlıştı — PCT_PTS_X'ler pay olduğundan sıfır-toplama yakın (biri
    # yükselince diğeri düşer), yani "iki bölgede elit + üçüncüde sıfır"
    # bile geçebiliyordu (F1=0.286, ligin en zayıf modifier'larından).
    # Artık mode="min": score_compat.py'de türetilen mutlak bölge-puanı
    # (PTS_ZONE_PAINT/MIDRANGE/3PT) persantillerinin EN DÜŞÜĞÜ — üçünde de
    # gerçekten belli bir bar'ı geçmek gerekiyor, telafi yok.
    # (Kalibrasyon: 0.60 canlıda ligin ~%19'unu aktif işaretliyordu, çoğu
    # modifier %2-13 bandında — 0.72'ye çekildi -> ~%10, Pressure/Shotmaker
    # ile aynı seçicilik bandında.)
    "Three-Level": {
        "type": "modifier",
        "desc": "Scores at the rim, mid-range, and three-point line",
        "percentile_threshold": 0.72,
        "mode": "min",
        "metrics": {
            "PTS_ZONE_PAINT":     {"higher": True},
            "PTS_ZONE_MIDRANGE":  {"higher": True},
            "PTS_ZONE_3PT":       {"higher": True},
        },
    },

    "Scoring": {
        "type": "modifier",
        "desc": "Scoring is the primary contribution",
        "percentile_threshold": 0.75,
        "metrics": {
            "PTS":     {"w": 0.28, "higher": True},
            "FGA":     {"w": 0.18, "higher": True},
            "USG_PCT": {"w": 0.16, "higher": True},
            "TS_PCT":  {"w": 0.13, "higher": True},
            "AST_PCT": {"w": 0.15, "higher": False},
            "AST":     {"w": 0.10, "higher": False},   # AST_PCT sayı çifti
        },
    },

    "Speed": {
        "type": "modifier",
        "desc": "Pure athleticism/quickness advantage; fastest player on the floor",
        "percentile_threshold": 0.76,
        # STL/BLK çıkarıldı (2026-07 modifier denetimi) — hıza dair kanıtlanmış
        # bir bağlantısı yok, sadece gürültü ekliyordu; ağırlık saf hareket
        # metriklerine (AVG_SPEED/DIST_MILES) yeniden dağıtıldı.
        "metrics": {
            "AVG_SPEED":  {"w": 0.55, "higher": True},
            "DIST_MILES": {"w": 0.45, "higher": True},
        },
    },

    # Orijinal Jargon Sözlüğü'nde ("her kategoride etki; çok amaçlı") tanımlı
    # ama şimdiye kadar HİÇ uygulanmamıştı (2026-07 modifier denetimi).
    # mode="min": REB/AST/STL/BLK persantillerinin en düşüğü — "stat sheet'i
    # dolduran" gerçek her-şeyi-yapan profilini yakalar (birinde elit,
    # diğerlerinde sıfır olan tek-boyutlu oyuncu bunu geçemez). Versatile'dan
    # farkı: Versatile "rol esnekliği/düşük kullanım" ölçüyor (dokunulmadı,
    # kendi F1'i zaten makul), All-Around "istatistik çeşitliliği" ölçüyor.
    # (2026-07 kalibrasyon: min-mode skor dağılımı ham persantillerden daha
    # sıkışık geliyor — 0.55 canlıda ligin ~%17'sini "aktif" işaretliyordu,
    # diğer modifier'ların çoğu %2-13 bandında. 0.65'e çekildi -> ~%7,
    # Pick-and-Roll/3-and-D ile aynı seçicilik bandında.)
    "All-Around": {
        "type": "modifier",
        "desc": "Impact in every category; multi-purpose stat-sheet filler",
        "percentile_threshold": 0.65,
        "mode": "min",
        "metrics": {
            "REB": {"higher": True},
            "AST": {"higher": True},
            "STL": {"higher": True},
            "BLK": {"higher": True},
        },
    },

    "Versatile": {
        "type": "modifier",
        "desc": "Handles multiple roles; not a star, but impactful in several areas",
        "percentile_threshold": 0.72,
        "metrics": {
            "PASSES_MADE": {"w": 0.20, "higher": True},
            "REB":         {"w": 0.16, "higher": True},
            "DRIVES":      {"w": 0.14, "higher": True},
            "AST_PCT":     {"w": 0.12, "higher": True},
            "AST":         {"w": 0.06, "higher": True},    # sayı çifti
            "PTS":         {"w": 0.14, "higher": False},   # not primary scorer
            "USG_PCT":     {"w": 0.12, "higher": False},   # not star-level
            "FGA":         {"w": 0.06, "higher": False},   # USG_PCT sayı çifti
        },
    },

    # Defensive VE Point-of-Attack 2026-07 modifier denetiminde KALDIRILDI —
    # ikisi de veride Stopper'ın neredeyse birebir kopyasıydı (Defensive vs
    # Stopper r=0.936, vs Two-Way r=0.904; Point-of-Attack vs Stopper r=0.949).
    # Defensive kendi açıklamasında bile "genel savunma şemsiye tag'i" diyordu;
    # Point-of-Attack'ın gerçek konsepti (kimi savunduğu / eşleşme zorluğu)
    # bizde hiç veri yok, REB/AST'a proxy olarak sarılmıştı — o yüzden Stopper'dan
    # ayrışamıyordu. Gerçek eşleşme-zorluğu verisi (Synergy/BBall-Index tipi)
    # eklenirse Point-of-Attack anlamlı şekilde geri getirilebilir.

    # Orijinal Jargon Sözlüğü'nde ("oyunun hızını/ritmini yöneten") tanımlı ama
    # hiç uygulanmamıştı (2026-07 modifier denetimi). Synergy Transition
    # possession-share (gerçek veri, fetch_data.py) + bireysel PACE (Advanced
    # tablosundan, sahadayken oynanan tempo) + TIME_OF_POSS (topu elinde
    # tutup tempoyu GERÇEKTEN etkiliyor mu, yoksa sadece hızlı oynayan bir
    # takımda mı koşuyor). Engine'le ortak TIME_OF_POSS var ama düşük ağırlıkta
    # (0.15) — Tempo'nun asıl ekseni hız, Engine'inki yaratıcılık/hacim.
    "Tempo": {
        "type": "modifier",
        "desc": "Pushes the pace; plays fast and gets into transition often",
        "percentile_threshold": 0.78,
        "metrics": {
            "TRANSITION_POSS_PCT": {"w": 0.40, "higher": True},
            "PACE":                {"w": 0.30, "higher": True},
            "TRANSITION_PPP":      {"w": 0.15, "higher": True},
            "TIME_OF_POSS":        {"w": 0.15, "higher": True},
        },
    },

    # Orijinal Jargon Sözlüğü'nde ("potaya doğru kuzey-güney hücum eden")
    # tanımlı ama hiç uygulanmamıştı. Pressure'dan (foul-drawing ağırlıklı)
    # ve yeni Slashing'ten (topsuz kesme/dalış, Synergy Cut) kasıtlı olarak
    # ayrıştırıldı: Downhill saf "topla sürüp bitirme hacmi", DRIVE_PASS_PCT
    # düşük ağırlığıyla (pas değil şut arıyor — Playmaking/Initiator'dan
    # ayrım) ve FT_RATE OLMADAN (Pressure'ın birincil ekseni faul, bunun
    # değil) tanımlanıyor.
    "Downhill": {
        "type": "modifier",
        "desc": "Drives north-south to score, not to pass or draw fouls",
        "percentile_threshold": 0.78,
        "metrics": {
            "DRIVES":        {"w": 0.28, "higher": True},
            "DRIVE_FGA":     {"w": 0.24, "higher": True},
            "DRIVE_FG_PCT":  {"w": 0.20, "higher": True},
            "DRIVE_PTS_PCT": {"w": 0.16, "higher": True},
            "DRIVE_PASSES_PCT":{"w": 0.12, "higher": False},  # pas değil, bitirme arıyor
        },
    },

    "Gravity": {
        "type": "modifier",
        # Spacer'dan fark: daha yüksek rol ve USG_PCT; any position; double-team cazibet çeker
        "desc": "Elite shooter who bends defenses — any position; Curry/Dame/KD type",
        "percentile_threshold": 0.86,
        "metrics": {
            "FG3_PCT":      {"w": 0.24, "higher": True},
            "FG3A":         {"w": 0.16, "higher": True},
            "FG3M":         {"w": 0.08, "higher": True},   # sayı çifti
            "PCT_PTS_3PT":  {"w": 0.14, "higher": True},
            "USG_PCT":      {"w": 0.12, "higher": True},   # yüksek rol (Spacer'dan fark)
            "PTS":          {"w": 0.14, "higher": True},   # skor üretimi
            "FGM":          {"w": 0.08, "higher": True},   # genel skor hacmi
            "POTENTIAL_AST":{"w": 0.04, "higher": True},   # gravity = savunma çekimi
        },
    },

    "Stretch": {
        "type": "modifier",
        # Spacer (1-2-3) ile ayrımı: Stretch büyükler için (PF/C).
        # Drive threshold Spacer'dan daha gevşek — biglar zaten daha az drive atar.
        "desc": "Big (PF/C) who can shoot threes; pulls the defense out of the paint",
        "percentile_threshold": 0.76,
        "metrics": {
            "FG3A":        {"w": 0.20, "higher": True},   # 3 atmak zorunda
            "FG3_PCT":     {"w": 0.18, "higher": True},   # ve verimli atmalı
            "FG3M":        {"w": 0.08, "higher": True},   # sayı çifti
            "PCT_PTS_3PT": {"w": 0.10, "higher": True},
            "REB":         {"w": 0.18, "higher": True},   # hâlâ big — ribaund
            "BLK":         {"w": 0.10, "higher": True},
            "PTS":         {"w": 0.08, "higher": True},   # skor ortalaması
            "FGM":         {"w": 0.04, "higher": True},   # genel skor hacmi
            "DRIVES":      {"w": 0.04, "higher": False},  # Spacer'dan daha yumuşak ceza
        },
    },

    # Eski proxy (DRIVES/FTA/PCT_PTS_PAINT) Pressure'ın neredeyse birebir
    # kopyasıydı (r=0.854, 2026-07 modifier denetimi) — ikisi de aynı
    # "topla sürüp potaya giden oyuncu" sinyalini ölçüyordu. Gerçek Synergy
    # Cut verisiyle (fetch_data.py) değiştirildi: topsuz kesme/dalış
    # possession-share + verimlilik — kavramsal olarak da orijinal Jargon
    # Sözlüğü tanımına ("sürekli ribaund/dalış ile pas alan dinamik hücum")
    # eski proxy'den çok daha yakın.
    "Slashing": {
        "type": "modifier",
        "desc": "Scores off cuts and dives to the rim, finishing plays others create",
        "percentile_threshold": 0.76,
        "metrics": {
            "CUT_POSS_PCT": {"w": 0.55, "higher": True},
            "CUT_PPP":      {"w": 0.45, "higher": True},
        },
    },

    # 2026-07 modifier denetimi: eski proxy (DRIVES/FTA/PCT_PTS_PAINT/AST_PCT)
    # Slashing ve Pressure'la neredeyse birebir aynı sinyaldi (r=0.87-0.93) —
    # "sürüşe dayalı hücum" ölçüyordu, PnR'a özgü hiçbir şey yakalamıyordu.
    # Artık gerçek Synergy play-type verisi (nba_api SynergyPlayTypes,
    # PRBallHandler) kullanıyor — src/fetch_data.py'nin fetch_synergy_playtype()
    # fonksiyonu. POSS_PCT: ofansif possession'ların % kaçı PnR ball-handler
    # olarak; PPP: o possession'larda possession başına puan (verimlilik).
    "Pick-and-Roll": {
        "type": "modifier",
        "desc": "Produces through pick-and-roll actions as the ball-handler",
        "percentile_threshold": 0.74,
        "metrics": {
            "PNR_BH_POSS_PCT": {"w": 0.55, "higher": True},   # hacim — ne kadar PnR koşuyor
            "PNR_BH_PPP":      {"w": 0.45, "higher": True},   # verimlilik — ne kadar iyi kullanıyor
        },
    },

    "3-and-D": {
        "type": "modifier",
        "desc": "Low-usage role specialist: corner/spot-up threes plus defense",
        "percentile_threshold": 0.74,
        "metrics": {
            "FG3_PCT":             {"w": 0.18, "higher": True},
            "CATCH_SHOOT_FG3_PCT": {"w": 0.14, "higher": True},
            "FG3A":                {"w": 0.10, "higher": True},   # sayı çifti
            "FG3M":                {"w": 0.06, "higher": True},   # made = verimlilik
            "PCT_PTS_3PT":         {"w": 0.12, "higher": True},
            "STL":                 {"w": 0.14, "higher": True},
            "DEFLECTIONS":         {"w": 0.14, "higher": True},
            "USG_PCT":             {"w": 0.06, "higher": False},
            "DEF_RATING":          {"w": 0.06, "higher": False},
        },
    },

    "Playmaking": {
        "type": "modifier",
        "desc": "Pass and assist creation is the primary offensive contribution",
        "percentile_threshold": 0.76,
        "metrics": {
            "AST":           {"w": 0.24, "higher": True},   # AST_PCT sayı çifti zaten
            "AST_PCT":       {"w": 0.22, "higher": True},
            "PASSES_MADE":   {"w": 0.20, "higher": True},
            "SECONDARY_AST": {"w": 0.14, "higher": True},
            "POTENTIAL_AST": {"w": 0.10, "higher": True},   # SECONDARY_AST sayı çifti
            "AST_TO":        {"w": 0.10, "higher": True},
        },
    },

    # Playmaking'den farkı: USG_PCT'e negatif ağırlık (düşük-kullanım kapısı) —
    # "ikinci opsiyon" kavramı zaten yüksek-kullanımlı bir yaratıcıdan ayrışmak
    # zorunda, yoksa Playmaking'in yarı-kopyası olur. Daha önce sadece
    # frontend/src/data/glossary.js'de görüntü-amaçlı tanımlıydı (hiç
    # skorlanmıyordu) — 2026-07 modifier denetiminde canlı imzaya taşındı.
    "Secondary": {
        "type": "modifier",
        "desc": "Second option creator; sets up plays that lead to other assists",
        "percentile_threshold": 0.80,
        "metrics": {
            "SECONDARY_AST": {"w": 0.28, "higher": True},
            "POTENTIAL_AST": {"w": 0.24, "higher": True},
            "AST_PCT":       {"w": 0.18, "higher": True},
            "AST":           {"w": 0.08, "higher": True},   # AST_PCT sayı çifti
            "PASSES_MADE":   {"w": 0.04, "higher": True},
            "USG_PCT":       {"w": 0.18, "higher": False},  # düşük-kullanım kapısı
        },
    },


}


# ─── Listeler ─────────────────────────────────────────────────────────────────

# ─── Pozisyon maskeleri: primary_arch seçiminde hangi noun hangi pozisyona uygulanır ───
# None = tüm pozisyonlar geçerli
# ─── Overall ağırlıkları: her core noun'un "rol değeri" ─────────────────────────
# Weighted mean = Σ(score_i × weight_i) / Σ(weight_i)
# Ecosystem/Engine/Creator yakın; Anchor defensif ama ofanstaki gibi kritik değil;
# Spacer rol oyuncusu ama değerlendi.
NOUN_WEIGHTS = {
    "Engine":     1.4,
    "Ecosystem":  1.5,
    "Hub":        0.65,   # Ecosystem ile r=0.982 korelasyon → ağırlığı düşür
    "Connector":  0.9,
    "Creator":    1.4,
    "Anchor":     1.1,
    "Spacer":     0.9,
    "Finisher":   0.8,
    "Force":      1.1,
    "Initiator":  1.0,
    "Stopper":    1.2,
    "Rim Runner": 0.7,
}

NOUN_POSITION_MASK = {
    "Engine":    {"PG", "SG", "SF"},
    "Ecosystem": None,              # any position
    "Hub":       {"PF", "C"},
    "Connector": None,
    "Creator":   None,
    "Anchor":    {"PF", "C"},
    "Spacer":    {"PG", "SG", "SF"},
    "Finisher":  {"SG", "SF", "PF", "C"},
    "Force":     {"SG", "SF", "PF", "C"},
    "Initiator": None,
    "Stopper":   None,
    "Rim Runner":{"SF", "PF", "C"},
}

# Modifier'lar için AYNI yumuşak pozisyon cezası (bkz. NOUN_POSITION_MASK) —
# ama varsayılan None (kısıtsız) yerine sparse: yalnızca burada AÇIKÇA
# listelenen modifier'lar cezalandırılır (score_compat._pick_arch'ın aksine,
# modifier'ların çoğu pozisyondan bağımsız gerçek bir kavram — sadece
# tanımı gereği pozisyona bağlı olanlar buraya eklenir).
# Stretch: gerçek "stretch big" tanımı PF/C'ye özgü (F1=0.222 ile en zayıf
# canlı modifier'dı — pozisyon kısıtı olmadan üç sayı atan her guard'ı da
# yakalıyordu, konsepti sulandırıyordu).
MODIFIER_POSITION_MASK = {
    "Stretch": {"PF", "C"},
}

CORE_NOUNS = [k for k, v in COMPONENT_SIGNATURES.items() if v["type"] == "core"]
MODIFIER_TAGS = [k for k, v in COMPONENT_SIGNATURES.items() if v["type"] == "modifier"]

# Eski uyumluluk için — bazı dosyalarda import ediliyor
POSITION_COMPONENTS = {"Guard", "Wing", "Forward", "Big", "Center"}

NBA_POSITION_MAP = {
    "Guard":          {"Guard"},
    "Guard-Forward":  {"Guard", "Wing"},
    "Forward-Guard":  {"Wing", "Forward"},
    "Forward":        {"Forward"},
    "Forward-Center": {"Forward", "Big"},
    "Center-Forward": {"Big"},
    "Center":         {"Big", "Center"},
}

# Tracking/Hustle metrikleri eski sezonlarda yok
MODERN_ONLY_METRICS = {
    "DRIVES", "DRIVE_FGA", "PULL_UP_PTS", "PULL_UP_FG_PCT",
    "CATCH_SHOOT_FG3_PCT", "CONTESTED_SHOTS", "SCREEN_ASSISTS",
    "DEFLECTIONS", "TIME_OF_POSS", "PASSES_MADE", "SECONDARY_AST",
    "POTENTIAL_AST", "AVG_SPEED", "DIST_MILES",
}


# ─── FALLBACK (tarihsel sezonlar, 1983+) ──────────────────────────────────────
# Yalnızca 12 core noun için — modifier etiketleri tarihsel analizde kullanılmaz.

FALLBACK_SIGNATURES = {
    "Engine": {
        "percentile_threshold": 0.82,
        "metrics": {
            "USG_PCT":      {"w": 0.30, "higher": True},
            "AST_PCT":      {"w": 0.20, "higher": True},
            "PCT_UAST_FGM": {"w": 0.22, "higher": True},
            "FGA":          {"w": 0.14, "higher": True},
            "PTS":          {"w": 0.14, "higher": True},
        },
    },
    "Ecosystem": {
        # Jokić/Magic/Big O tipi: hem yaratıcı hem de skorer, top hamlesini domine eder.
        # ESKİ: USG_PCT higher=False (Jokić gibi yüksek USG oyuncuları penalize ediyordu) → DÜZELTİLDİ.
        "percentile_threshold": 0.90,
        "metrics": {
            "AST_PCT": {"w": 0.32, "higher": True},   # PRIMARY: creation rate
            "AST":     {"w": 0.22, "higher": True},   # raw assists
            "PTS":     {"w": 0.20, "higher": True},   # scoring gate (saf passer'ları filtreler)
            "USG_PCT": {"w": 0.14, "higher": True},   # heliocentric — FLIPPED from old False
            "AST_TO":  {"w": 0.12, "higher": True},   # efficiency
        },
    },
    "Hub": {
        "percentile_threshold": 0.74,
        "metrics": {
            "AST":     {"w": 0.40, "higher": True},
            "AST_PCT": {"w": 0.32, "higher": True},
            "USG_PCT": {"w": 0.28, "higher": False},
        },
    },
    "Connector": {
        "percentile_threshold": 0.68,  # Diaw/Draymond tipi tutkal oyuncular için daha kapsayıcı
        "metrics": {
            "AST_RATIO": {"w": 0.34, "higher": True},
            "REB":       {"w": 0.24, "higher": True},
            "TS_PCT":    {"w": 0.22, "higher": True},
            "STL":       {"w": 0.20, "higher": True},
        },
    },
    "Creator": {
        "percentile_threshold": 0.72,  # Kidd/Magic tipi playmaker için
        "metrics": {
            "AST_PCT":       {"w": 0.32, "higher": True},
            "AST_TO":        {"w": 0.28, "higher": True},  # karar kalitesi (FTA yerine)
            "PCT_PTS_PAINT": {"w": 0.22, "higher": True},
            "PCT_UAST_FGM":  {"w": 0.18, "higher": True},
        },
    },
    "Anchor": {
        "percentile_threshold": 0.82,
        "metrics": {
            "BLK":        {"w": 0.32, "higher": True},
            "DEF_RATING": {"w": 0.24, "higher": False},
            "DREB_PCT":   {"w": 0.22, "higher": True},
            "REB":        {"w": 0.14, "higher": True},
            "STL":        {"w": 0.08, "higher": True},
        },
    },
    "Spacer": {
        "percentile_threshold": 0.72,  # klasik dönem shooterları (Allen/Miller) için daha kapsayıcı
        "metrics": {
            "FG3_PCT":    {"w": 0.35, "higher": True},   # saf isabetlilik — dönemden bağımsız
            "FG3A":       {"w": 0.28, "higher": True},   # hacim
            "PCT_PTS_3PT":{"w": 0.25, "higher": True},   # puan içindeki 3pt payı
            "FTA":        {"w": 0.08, "higher": False},  # klasik dönemde shooterlar da fuar atardı
            "USG_PCT":    {"w": 0.04, "higher": False},  # hafif penaltı yeterli
        },
    },
    "Finisher": {
        "percentile_threshold": 0.74,
        "metrics": {
            "PCT_AST_FGM":   {"w": 0.34, "higher": True},
            "FG_PCT":        {"w": 0.28, "higher": True},
            "PCT_PTS_PAINT": {"w": 0.24, "higher": True},
            "USG_PCT":       {"w": 0.14, "higher": False},
        },
    },
    "Force": {
        "percentile_threshold": 0.76,
        "metrics": {
            "REB":  {"w": 0.36, "higher": True},
            "FTA":  {"w": 0.30, "higher": True},
            "BLK":  {"w": 0.20, "higher": True},
            "STL":  {"w": 0.14, "higher": True},
        },
    },
    "Initiator": {
        "percentile_threshold": 0.74,
        "metrics": {
            "AST_PCT": {"w": 0.36, "higher": True},
            "AST":     {"w": 0.30, "higher": True},
            "FTA":     {"w": 0.20, "higher": True},
            "USG_PCT": {"w": 0.14, "higher": True},
        },
    },
    "Stopper": {
        "percentile_threshold": 0.80,
        "metrics": {
            "STL":        {"w": 0.40, "higher": True},
            "DEF_RATING": {"w": 0.32, "higher": False},
            "BLK":        {"w": 0.18, "higher": True},
            "REB":        {"w": 0.10, "higher": True},
        },
    },
    "Rim Runner": {
        "percentile_threshold": 0.78,
        "metrics": {
            "PCT_PTS_PAINT": {"w": 0.26, "higher": True},
            "FG_PCT":        {"w": 0.22, "higher": True},
            "PCT_AST_FGM":   {"w": 0.24, "higher": True},
            "OREB_PCT":      {"w": 0.18, "higher": True},
            "USG_PCT":       {"w": 0.10, "higher": False},
        },
    },
    # Modifier fallback'leri yok — tarihsel analizde sadece core nouns
}
