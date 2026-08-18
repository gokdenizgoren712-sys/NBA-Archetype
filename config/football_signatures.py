# -*- coding: utf-8 -*-
"""Futbol arketip sözlüğü — FotMob şeması.

BASKETBOLDAN TAMAMEN BAĞIMSIZ. Ortak olan tek şey yöntem: persantil tabanlı
ağırlıklı bileşik skor (bkz. src/engine.py). Metrikler, roller, faz yapısı
futbola özgü.

FAZ YAPISI (kullanıcı kararı)
────────────────────────────
Bir bek ile bir santrafor neredeyse hiçbir ortak metrikle ölçülmez, o yüzden
tek sözlük yerine her faz kendi sözlüğüne sahip: gk / def / mid / fwd.
  - Kanatlar ve saf 10 numaralar FORVET sayılır
  - Kanat bekler DEFANS sayılır
  - Saf on numaralar faz olarak FORVET ama pozisyon kodu AM (ST değil):
    santrafor sayılınca Poacher/Target Man'e aday oluyorlardı, oysa o
    rollerin hiçbirini oynamıyorlar
  - İki fazı birden kapsayan oyuncu her fazda ayrı arketip alır
    (eşik: fetch_fotmob.SECOND_PHASE_* — maçtan maça diziliş oynaması
     sahte ikinci rol üretmesin diye)

ŞEMA GEÇMİŞİ
────────────
İlk sürüm StatsBomb açık veri (2015/16) metrik adlarıyla yazılmıştı. FotMob'a
geçince (tek erişilebilir güncel kaynak, bkz. src/football/fetch_fotmob.py
başlığı) metrikler yeniden eşlendi. İki önemli değişiklik:

1. "Front-Foot Defender" KALDIRILDI. Tanımı "rakip yarı sahada müdahale eden
   stoper"di ve tamamen müdahale-bölgesi metriklerine (Tkl_Mid3rd/Att3rd)
   dayanıyordu; FotMob müdahaleyi bölgeye ayırmıyor. Uydurma bir vekil
   metrikle ayakta tutmaktansa Stopper'a katıldı — Stopper artık hem hava
   hâkimiyetini hem yerdeki agresifliği taşıyor. (Aynı gerekçeyle daha önce
   "Wing-Back" da kaldırılmıştı: o bir oynama biçimi değil dizilişin sonucu.)

2. Kaleci fazı GERÇEK metriklere kavuştu. StatsBomb'da 4 arketibin 4'ü de
   eksik/ölü kolon üzerindeydi (Sweeper Keeper'ın %50'si 83/83 sıfır olan
   OPA_90'daydı). FotMob'da goals_prevented, keeper_sweeper, keeper_high_claim,
   punches, player_throws hepsi dolu.

METRİK SAYISI
─────────────
Arketip başına 6-10 metrik. NBA tarafında 4-5 metrikle sıkıştığımız için
(yakın roller ayrışmıyordu) burada bilinçli olarak geniş tutuldu.

SEZONA GÖRE KADEMELİ KULLANIM
─────────────────────────────
Tüm metrikler her sezonda yok (probe: data/fotmob_season_probe.json):
    2016/17+  çekirdek + kaleci temeli + fiziksel
    2020/21+  xG ailesi (expected_goals*, expected_assists, xgot)
    2024/25+  goals_prevented, xgot_faced
Eksik metrik AĞIRLIKTAN DÜŞÜLÜR, uydurulmaz — skorlayıcı kalan ağırlığa göre
yeniden normalize eder (src/engine.py score_component deseni).
"""

# ── Dakika eşiği ────────────────────────────────────────────────────────────
# Az oynayan oyuncu persantil havuzunu bozar: 200 dakikada 3 hava topu kazanan
# bir yedek, sezonu oynayan bir stoperden yüksek per-90 üretir. Basketbol
# tarafındaki MIN_GP/MIN_MPG kuralının futbol karşılığı.
#
# SABİT SAYI YAZMIYORUZ: eşik sezonun KENDİ uzunluğundan türetilir. Devam eden
# bir sezonda (ör. 8. hafta) kimse 855 dakikaya ulaşmamış olur; sabit eşik o
# sezonu tamamen boşaltırdı. Havuzdaki en yüksek dakika, "sezonun ne kadarı
# oynandı"nın doğrudan ölçüsü (hep oynayan bir oyuncu her zaman vardır).
MIN_MINUTES_SHARE = 0.25   # sezonun oynanabilir dakikasının yüzdesi
MIN_MINUTES_FLOOR = 270    # 3 tam maç — sezon başında havuz tamamen boşalmasın

# ── Dakika güvenilirlik ağırlığı ────────────────────────────────────────────
# Eşiği geçmek yetmiyor: 1000 dakikalık per-90 hem gürültülü hem uç persantile
# şansla çıkması kolay. Skor havuz medyanına doğru çekilir, çekme miktarı
# oynanan dakikayla azalır.
#
# KRİTİK ARALIK %25–%65 (kullanıcı kararı). Üstünde dakika artık ek bilgi
# TAŞIMAZ — sezonun üçte ikisini oynamış bir oyuncu için "daha da çok oynadı"
# bir üstünlük değil, ve ağırlık orada da artmaya devam ederse sıralama
# arketip uyumuna değil dakikaya göre kurulmuş olur. Bu yüzden %65 üstü DÜZ 1.0.
# (Önceki sürüm √(dakika/sezon) kullanıyordu; %65'te hâlâ 0.81 uygulayıp tam
#  sezon oynayanları haksız yere öne çıkarıyordu.)
WEIGHT_RAMP_LO = 0.25      # buradan itibaren ceza azalmaya başlar
WEIGHT_RAMP_HI = 0.65      # buradan sonra ceza YOK
WEIGHT_AT_FLOOR = 0.55     # eşikteki oyuncunun sapması ~yarıya iner


def minutes_weight(minutes: float, season_max: float) -> float:
    """Örneklem güvenilirlik ağırlığı [WEIGHT_AT_FLOOR..1].

    Skor şöyle uygulanır: 0.5 + (skor - 0.5) * w  — yani w=1 dokunmaz,
    w<1 skoru medyana çeker. ARKETİP SEÇİMİNİ DEĞİŞTİRMEZ (tüm arketiplere
    aynı çarpan gider, argmax sabit kalır); değişen sadece skorun büyüklüğü
    ve oyuncular arası sıralama.
    """
    if not season_max or season_max <= 0:
        return 1.0
    share = minutes / season_max
    if share >= WEIGHT_RAMP_HI:
        return 1.0
    if share <= WEIGHT_RAMP_LO:
        return WEIGHT_AT_FLOOR
    t = (share - WEIGHT_RAMP_LO) / (WEIGHT_RAMP_HI - WEIGHT_RAMP_LO)
    return WEIGHT_AT_FLOOR + (1.0 - WEIGHT_AT_FLOOR) * t


def min_minutes_for(season_max_minutes: float) -> int:
    """Bir (lig, sezon) havuzu için dakika eşiği.

    season_max_minutes: o havuzdaki en yüksek MINUTES_TOTAL.
    Tam 38 haftalık sezonda 3420 -> 855 dakika (~9.5 maç).
    """
    if not season_max_minutes or season_max_minutes <= 0:
        return MIN_MINUTES_FLOOR
    return int(max(MIN_MINUTES_FLOOR, round(MIN_MINUTES_SHARE * season_max_minutes)))


# ── Türetilmiş oranlar ──────────────────────────────────────────────────────
# fetch_fotmob.derive() bunları parquet'e yazar; imzalar doğrudan kullanır.
DERIVED = {
    "pass_pct":        ("accurate_passes_90", "accurate_passes_att_90"),
    "long_pct":        ("long_balls_accurate_90", "long_balls_accurate_att_90"),
    "cross_pct":       ("accurate_crosses_90", "accurate_crosses_att_90"),
    "aerial_pct":      ("aerials_won_90", "aerials_won_att_90"),
    "ground_duel_pct": ("ground_duels_won_90", "ground_duels_won_att_90"),
    "dribble_pct":     ("dribbles_succeeded_90", "dribbles_succeeded_att_90"),
    "long_share":      ("long_balls_accurate_att_90", "accurate_passes_att_90"),
    "npxg_per_shot":   ("expected_goals_non_penalty_90", "total_shots_90"),
    "sot_pct":         ("ShotsOnTarget_90", "total_shots_90"),
    # Kaleci: HACİM değil ORAN. Pas hacmi kalecinin değil TAKIMIN özelliği —
    # topa hakim takımın kalecisi hem Distributor hem Sweeper skorunu birlikte
    # yükseltiyordu (r=+0.57, ikisi de pas hacmiyle 0.54/0.62 korelasyon).
    # Paydaya bölünce eşdoğrusallık r=+0.19'a düşüyor.
    "ft_share":        ("passes_into_final_third_90", "accurate_passes_att_90"),
    "sweep_rate":      ("keeper_sweeper_90", "defensive_actions_90"),
}
# save_pct ayrı: saves / (saves + goals_conceded)
DERIVED_SAVE = ("saves_90", "goals_conceded_90")
# Karşılaşılan isabetli şut = kurtarış + yenilen gol. FotMob doğrudan
# vermiyor ama kalecinin iş yükünü ölçen tek şey bu: %80 kurtarış oranı
# 30 şutta başka, 150 şutta başka anlama gelir.
DERIVED_SOT_FACED = ("saves_90", "goals_conceded_90")


def _s(desc, threshold, positions, metrics):
    return {"type": "core", "desc": desc, "percentile_threshold": threshold,
            "positions": positions, "metrics": metrics}


def _m(**kw):
    """m(metric=weight) veya m(metric=(weight, False)) — False = düşük iyi."""
    out = {}
    for k, v in kw.items():
        if isinstance(v, tuple):
            out[k] = {"w": v[0], "higher": v[1]}
        else:
            out[k] = {"w": v, "higher": True}
    return out


# ── KALECİ ──────────────────────────────────────────────────────────────────
GK_SIGNATURES = {
    # KARŞILAŞILAN ŞUT BİLİNÇLİ OLARAK YOK. Bir ara sot_faced_90'ı 0.22 ağırlıkla
    # koymuştum ("iş yükü bağlamı" diye) ve sonuç ters çıktı: Oblak 32, Courtois
    # 36, Sommer 18 aldı — ligin en iyi kalecileri en düşük skorları.
    #
    # Sebebi kaleci metriklerinin PCA'sinde görünüyor (72 kaleci, 2025/26):
    #   Eksen 1 (%26): karşılaşılan şut + kurtarış sayısı + uzun top oranı
    #                  <-> pas isabeti.  Bu eksen TAKIM GÜCÜ. Zayıf takımın
    #                  kalecisi çok şut yer ve baskı altında topu uzağa vurur.
    #   Eksen 3 (%14): kurtarış% + önlenen gol + uçlanarak kurtarış.
    #                  Bu eksen SAF KURTARIŞ KALİTESİ.
    # İmza ikisini karıştırdığı için birbirini götürüyordu. Shot Stopper artık
    # yalnızca eksen 3'te yaşıyor — kullanıcının kastettiği şey bu (etiket
    # "artık kategori" değil, gerçek bir üstünlük).
    "Shot Stopper": _s(
        "Keeps out what he shouldn't — beats the shot quality he faces",
        0.80, ("GK",),
        _m(save_pct=0.32, goals_prevented_90=0.28, keeper_diving_save_90=0.18,
           saves_inside_box_90=0.14, saves_90=0.08)),

    # HACİM KOLONLARI ÇIKARILDI (touches_90, accurate_passes_att_90). Ölçüm:
    # bu ikisi Sweeper'ı Distributor'la eşdoğrusal yapıyordu (r=+0.57) çünkü
    # ikisi de "topa hakim takımın kalecisi" demekti, kalecinin davranışı değil.
    # Kalan set saf davranış: ceza sahası DIŞINDA iş yapıyor mu, ve yaptığı
    # işin ne kadarı orada (sweep_rate).
    "Sweeper Keeper": _s(
        "Defends the space behind a high line, not just the goal line",
        0.80, ("GK",),
        _m(keeper_sweeper_90=0.44, sweep_rate=0.24,
           defensive_actions_90=0.18, recoveries_90=0.14)),

    # Kullanıcı kararı: ÜST SEVİYE dağıtıcı olsun. Eski sürüm ham pas hacmine
    # (accurate_passes_att 0.26) dayanıyordu ve 2025'te hiçbir kaleciyi
    # ayırmıyordu — modern kalecilerin hepsi ayakla oynuyor, imza herkeste
    # yüksek çıkıp Shot Stopper'ı eziyordu (ground truth'ta 6x Distributor ->
    # Shot Stopper karışıklığı). İlk düzeltmede hacim 0.26'dan 0.08'e indi ama
    # SIFIRLANMADI; passes_into_final_third de ham sayı olduğu için hacim yine
    # arka kapıdan giriyordu. Artık tamamen ORAN: ilerletme payı (ft_share),
    # isabet, uzun top payı/isabeti. Hiçbiri "kaç pas attı"ya bakmıyor.
    "Distributor": _s(
        "Builds the attack from the back — not just short passes, real ones",
        0.78, ("GK",),
        _m(ft_share=0.34, pass_pct=0.24,
           long_share=(0.22, False), long_pct=0.20)),

    "Command of Area": _s(
        "Owns the box — claims crosses instead of parrying them",
        0.78, ("GK",),
        _m(keeper_high_claim_90=0.32, punches_90=0.24, aerials_won_90=0.16,
           clearances_90=0.12, recoveries_90=0.10, was_fouled_90=0.06)),
}

# ── DEFANS ──────────────────────────────────────────────────────────────────
DEF_SIGNATURES = {
    "Ball-Playing CB": _s(
        "Breaks lines from the back — the defence's first passer",
        0.78, ("CB",),
        _m(passes_into_final_third_90=0.24, accurate_passes_att_90=0.20,
           pass_pct=0.16, long_balls_accurate_90=0.12, long_pct=0.10,
           touches_90=0.08, dribbles_succeeded_90=0.06,
           dispossessed_90=(0.04, False))),

    # Eski "Front-Foot Defender" buraya katıldı (bkz. modül başlığı): artık
    # hem hava hâkimiyeti hem yerdeki agresiflik tek arketipte.
    "Stopper": _s(
        "Wins the duel — in the air, on the ground, in the box",
        0.78, ("CB",),
        _m(aerials_won_90=0.20, aerial_pct=0.14, clearances_90=0.14,
           headed_clearance_90=0.12, blocked_shots_90=0.10,
           ground_duels_won_90=0.10, tackles_90=0.08, interceptions_90=0.08,
           dribbled_past_90=(0.04, False))),

    "Overlapping Fullback": _s(
        "Provides the width and the crosses from deep",
        0.78, ("FB",),
        _m(accurate_crosses_att_90=0.24, accurate_crosses_90=0.16,
           touches_opp_box_90=0.14, expected_assists_90=0.12, assists_90=0.12,
           chances_created_90=0.10, corners_90=0.06,
           physical_metrics_distance_covered_90=0.04,
           physical_metrics_number_of_sprints_90=0.02)),

    "Inverted Fullback": _s(
        "Steps inside to make an extra midfielder",
        0.80, ("FB",),
        _m(accurate_passes_att_90=0.26, pass_pct=0.20, touches_90=0.16,
           passes_into_final_third_90=0.14,
           accurate_crosses_att_90=(0.14, False),
           touches_opp_box_90=(0.10, False))),

    "Defensive Fullback": _s(
        "Defends first and rarely joins the attack",
        0.76, ("FB",),
        _m(tackles_90=0.18, interceptions_90=0.16, clearances_90=0.14,
           blocked_shots_90=0.12, aerials_won_90=0.10,
           ground_duels_won_90=0.10, touches_opp_box_90=(0.10, False),
           accurate_crosses_att_90=(0.06, False),
           dribbled_past_90=(0.04, False))),
}

# ── ORTA SAHA ───────────────────────────────────────────────────────────────
MID_SIGNATURES = {
    "Anchor": _s(
        "Screens the back four and keeps it simple",
        0.78, ("DM",),
        _m(interceptions_90=0.20, tackles_90=0.16, pass_pct=0.14,
           clearances_90=0.12, blocked_shots_90=0.10,
           accurate_passes_att_90=0.10, defensive_actions_90=0.08,
           aerials_won_90=0.06, touches_opp_box_90=(0.04, False))),

    "Ball-Winner": _s(
        "Hunts the ball and takes it back",
        0.78, ("DM", "CM"),
        _m(tackles_90=0.24, ground_duels_won_90=0.18, recoveries_90=0.16,
           interceptions_90=0.14, ground_duel_pct=0.10, duel_won_90=0.08,
           fouls_90=0.06, dribbled_past_90=(0.04, False))),

    "Regista": _s(
        "Dictates tempo and range from deep",
        0.78, ("DM", "CM"),
        _m(passes_into_final_third_90=0.24, long_balls_accurate_90=0.18,
           accurate_passes_att_90=0.16, long_pct=0.14, pass_pct=0.12,
           touches_90=0.10, big_chances_created_90=0.06)),

    "Metronome": _s(
        "Highest volume, highest accuracy — the team's pulse",
        0.80, ("DM", "CM"),
        _m(accurate_passes_att_90=0.30, pass_pct=0.26, touches_90=0.16,
           dispossessed_90=(0.10, False), long_share=(0.10, False),
           passes_into_final_third_90=0.08)),

    # FİZİKSEL METRİK UYARISI: FotMob'da kilometersCovered/sprints yalnızca
    # oyuncuların ~%10'unda dolu (424 PL oyuncusunun 41'i). İlk tasarımda
    # Box-to-Box'ın ağırlığının %46'sını bunlara vermiştim; %90 oyuncuda o
    # ağırlık düştüğü için arketip zayıflayıp sadece 6 kişiye atandı.
    # Artık fiziksel metrikler sadece AKSAN (toplam ≤0.10) — arketibi
    # tanımlayan yük, her oyuncuda dolu olan metriklerde.
    "Box-to-Box": _s(
        "Covers the whole pitch — defends one box, arrives in the other",
        0.78, ("CM",),
        _m(tackles_90=0.18, touches_opp_box_90=0.18, recoveries_90=0.16,
           total_shots_90=0.14, dribbles_succeeded_90=0.10,
           interceptions_90=0.08, accurate_passes_att_90=0.06,
           physical_metrics_distance_covered_90=0.06,
           physical_metrics_number_of_sprints_90=0.04)),

    "Mezzala": _s(
        "Drifts into the half-space and creates from there",
        0.78, ("CM",),
        _m(expected_assists_90=0.20, chances_created_90=0.18, assists_90=0.14,
           passes_into_final_third_90=0.14, touches_opp_box_90=0.12,
           big_chances_created_90=0.12, dribbles_succeeded_90=0.10)),

    "Late Runner": _s(
        "Arrives in the box from midfield, late and unmarked",
        0.78, ("CM",),
        _m(touches_opp_box_90=0.26, expected_goals_non_penalty_90=0.20, goals_90=0.18,
           total_shots_90=0.16, xgot_90=0.10,
           physical_metrics_number_of_sprints_90=0.06,
           physical_metrics_distance_covered_90=0.04)),
}

# ── FORVET ──────────────────────────────────────────────────────────────────
FWD_SIGNATURES = {
    "Poacher": _s(
        "Lives in the box — minimum touches, maximum chances",
        0.78, ("ST",),
        _m(goals_90=0.20, npxg_per_shot=0.20, touches_opp_box_90=0.20,
           expected_goals_non_penalty_90=0.16, sot_pct=0.06, Offsides_90=0.06,
           touches_90=(0.06, False), accurate_passes_att_90=(0.06, False))),

    "Target Man": _s(
        "The reference point — wins it in the air and holds it up",
        0.78, ("ST",),
        _m(aerials_won_90=0.26, aerial_pct=0.18, was_fouled_90=0.12, goals_90=0.12,
           duel_won_90=0.10, touches_90=0.08, headed_clearance_90=0.06,
           dribbles_succeeded_90=(0.08, False))),

    "Complete Forward": _s(
        "Scores and creates in equal measure",
        0.82, ("ST", "W", "AM"),
        _m(expected_goals_non_penalty_90=0.18, expected_assists_90=0.16,
           goals_90=0.14, assists_90=0.12, chances_created_90=0.12,
           dribbles_succeeded_90=0.10, total_shots_90=0.08,
           big_chances_created_90=0.06, pass_pct=0.04)),

    "Pressing Forward": _s(
        "Defends from the front — the first line of the press",
        0.78, ("ST", "W", "AM"),
        _m(recoveries_90=0.24, tackles_90=0.20, interceptions_90=0.16,
           defensive_actions_90=0.12, ground_duels_won_90=0.10, fouls_90=0.08,
           physical_metrics_number_of_sprints_90=0.06,
           physical_metrics_distance_covered_90=0.04)),

    "Inside Forward": _s(
        "Cuts in from wide to shoot, not to cross",
        0.78, ("W", "AM"),
        _m(expected_goals_non_penalty_90=0.22, total_shots_90=0.18, goals_90=0.16,
           touches_opp_box_90=0.14, dribbles_succeeded_90=0.10, xgot_90=0.10,
           accurate_crosses_att_90=(0.10, False))),

    "Touchline Winger": _s(
        "Stays wide, beats his man, delivers",
        0.78, ("W",),
        _m(accurate_crosses_att_90=0.26, accurate_crosses_90=0.18,
           expected_assists_90=0.14, assists_90=0.12, chances_created_90=0.12,
           corners_90=0.08, touches_opp_box_90=(0.07, False),
           physical_metrics_number_of_sprints_90=0.02,
           physical_metrics_topspeed=0.01)),

    "Take-On Merchant": _s(
        "Beats his man off the dribble, again and again",
        0.78, ("W", "ST", "AM"),
        _m(dribbles_succeeded_90=0.31, dribbles_succeeded_att_90=0.22,
           dribble_pct=0.16, was_fouled_90=0.13, dispossessed_90=0.11,
           physical_metrics_topspeed=0.04,
           physical_metrics_number_of_sprints_90=0.03)),

    "Creator": _s(
        "The final ball — everything runs through him",
        0.80, ("W", "ST", "AM"),
        _m(expected_assists_90=0.24, chances_created_90=0.20, assists_90=0.20,
           big_chances_created_90=0.14, passes_into_final_third_90=0.10,
           accurate_passes_att_90=0.06, corners_90=0.06)),
}

PHASES = ("gk", "def", "mid", "fwd")
_BY_PHASE = {"gk": GK_SIGNATURES, "def": DEF_SIGNATURES,
             "mid": MID_SIGNATURES, "fwd": FWD_SIGNATURES}


def signatures_for(phase):
    return _BY_PHASE[phase]


def archetypes_for(phase):
    return list(_BY_PHASE[phase])


def metrics_for(phase):
    out = []
    for sig in _BY_PHASE[phase].values():
        for m in sig["metrics"]:
            if m not in out:
                out.append(m)
    return out


def all_metrics():
    out = []
    for ph in PHASES:
        for m in metrics_for(ph):
            if m not in out:
                out.append(m)
    return out
