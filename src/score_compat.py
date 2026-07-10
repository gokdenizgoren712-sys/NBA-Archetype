"""
Skor tabanlı oyuncu profili + uyumluluk motoru.

Temel fikir:
  Boolean (var/yok) yerine her oyuncunun her bileşen için [0..1]
  ham percentile skoru kullanılır.

  Duo uyumu:
    coverage   = mean(max(s_a[c], s_b[c]))         # birlikte ne kadar güçlü
    complement = 1 - cosine_similarity(s_a, s_b)    # profiller ne kadar farklı
    affinity   = affinity_matrix[arch_a, arch_b]    # tarihsel arketip uyumu
    duo_score  = 0.45*coverage + 0.30*complement + 0.25*affinity

  5'li uyum:
    coverage   = mean(max(s1..s5)[c])               # her rol ne kadar kapanmış
    balance    = 1 - std(max_scores)                # dengeli mi, tek boyutlu mu
    depth      = n_comp_with_max>0.75 / n_comp      # kaç bileşende gerçekten güçlü
    lineup_score = 0.50*coverage + 0.25*balance + 0.25*depth
"""

import sys, json
from pathlib import Path
from itertools import combinations

import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from engine import predict_components, select_signatures
from signatures import COMPONENT_SIGNATURES, CORE_NOUNS, MODIFIER_TAGS, POSITION_COMPONENTS, NOUN_POSITION_MASK, NOUN_WEIGHTS
from roles import ROLE_SLOTS, compute_role_vec, get_affinity

# Creator slot indices (Primary Creation=0, Secondary Playmaking=1, Shot Creation=8)
_CREATOR_SLOTS = [0, 1, 8]
# Two-Way/Stopper/Versatile role indices (Two-Way Defense=7, Versatility=10)
_TWOWAY_SLOT = 7
_VERSATILITY_SLOT = 10

# Uyum hesabı sadece 14 core noun üzerinden yapılır
COMP_COLS = CORE_NOUNS
ALL_COMP_COLS = CORE_NOUNS + MODIFIER_TAGS   # skorlama için tümü
CORE      = CORE_NOUNS   # geriye dönük uyumluluk için alias

# Ağırlıklar
W_COVERAGE   = 0.45
W_COMPLEMENT = 0.30
W_AFFINITY   = 0.25

W5_COVERAGE = 0.50
W5_BALANCE  = 0.25
W5_DEPTH    = 0.25

DEPTH_THRESHOLD = 0.75   # bu skoru geçen bileşen "güçlü kapsandı" sayılır


# ─── 1. Oyuncu skor vektörleri ────────────────────────────────────────────────

def build_score_table(season: str = "2025-26", league: str = "nba") -> pd.DataFrame:
    """
    Her oyuncu için bileşen skor vektörünü (0-1 percentile) hesaplar.
    Sonuç: PLAYER_NAME + score_Engine + score_Anchor + ... sütunları.
    league: "nba" (varsayılan) veya "gleague" — parquet prefix'ini belirler.
    """
    prefix = "" if league == "nba" else f"{league}__"
    merged = ROOT / "data" / f"{prefix}{season.replace('/', '-')}__merged.parquet"
    if not merged.exists():
        raise FileNotFoundError(merged)

    # BBR pozisyon verisi sadece NBA için kullanılır
    bref_merged = ROOT / "data" / f"{season.replace('/', '-')}__merged_bref.parquet"
    if league == "nba" and bref_merged.exists():
        df = pd.read_parquet(bref_merged)
    else:
        df = pd.read_parquet(merged)

    # bref_pos varsa POSITION kolonunu override et (38 eşleşmeyen için nba_api korunur)
    if "bref_pos" in df.columns:
        df["POSITION"] = df["bref_pos"].fillna(df["POSITION"])

    if "OBPM" not in df.columns or df["OBPM"].isna().all():
        try:
            from compute_bpm import compute_bpm
            df = compute_bpm(df)
        except Exception:
            pass

    if "FTA" in df.columns and "FGA" in df.columns:
        df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, pd.NA)).fillna(0)

    # Takım bağlamı: Bayesian pooling ile USG_TEAM_REL.
    # Küçük takım örnekleminde (12-15 oyuncu) takım std gürültülüdür;
    # havuzlanmış std = α·team_std + (1-α)·league_std ile dengelenir.
    # tanh ile [-3,3] yumuşak sıkıştırma (hard clip yerine).
    if "USG_PCT" in df.columns and "TEAM_ABBREVIATION" in df.columns:
        league_std = float(df["USG_PCT"].std(ddof=1)) or 0.04
        # GP ağırlıklı takım istatistikleri (az oynayan oyuncular az etki)
        gp_col = df["GP"].fillna(1) if "GP" in df.columns else pd.Series(1, index=df.index)
        team_stats = (df.assign(_w=gp_col)
                      .groupby("TEAM_ABBREVIATION")
                      .apply(lambda g: pd.Series({
                          "usg_med": float(np.average(g["USG_PCT"], weights=g["_w"])),
                          "usg_std": float(g["USG_PCT"].std(ddof=1)) if len(g) > 1 else league_std,
                          "n":       len(g),
                      }), include_groups=False))
        # Küçük takımlarda (n<8) league_std'ye tamamen çek
        alpha = (team_stats["n"].clip(upper=15) / 15).clip(0, 1)
        team_stats["usg_std_pool"] = alpha * team_stats["usg_std"] + (1 - alpha) * league_std
        df = df.join(team_stats[["usg_med", "usg_std_pool"]], on="TEAM_ABBREVIATION")
        z_raw = (df["USG_PCT"] - df["usg_med"]) / df["usg_std_pool"].clip(lower=0.005)
        df["USG_TEAM_REL"] = np.tanh(z_raw / 2) * 2   # tanh sıkıştırma, etkin aralık ~[-2, 2]
        df.drop(columns=["usg_med", "usg_std_pool"], inplace=True)

    sigset = select_signatures(df)
    lp = ROOT / "config" / "learned_thresholds.json"
    if lp.exists():
        learned = json.loads(lp.read_text())
        for c in list(sigset.keys()):
            if c in learned:
                sigset[c] = {**sigset[c], "percentile_threshold": learned[c]["percentile"]}

    scores, positives = predict_components(df, sigset=sigset)

    out = pd.DataFrame()
    out["PLAYER_ID"]         = df["PLAYER_ID"].values
    out["PLAYER_NAME"]       = df["PLAYER_NAME"].values
    out["TEAM_ABBREVIATION"] = df["TEAM_ABBREVIATION"].values
    if "POSITION" in df.columns:
        out["POSITION"] = df["POSITION"].values
    if "GP" in df.columns:
        out["GP"]  = df["GP"].values
    if "MIN" in df.columns:
        out["MIN"] = df["MIN"].values
    for col in ["PTS","REB","AST","STL","BLK","FGM","FG_PCT","TS_PCT","FG3A","FTA","PLAYER_HEIGHT_INCHES"]:
        if col in df.columns:
            out[col] = df[col].values
    # OBPM/DBPM: merged_bref'ten geliyorsa player_scores'a taşı
    for col in ["OBPM", "DBPM", "USG_PCT", "DEF_RATING", "OFF_RATING", "NET_RATING"]:
        if col in df.columns:
            out[col] = df[col].values
    # Lig-özel bağlam + prospect kolonları (varsa taşı — yaş, konferans, sınıf)
    for col in ["AGE", "CONFERENCE", "CLASS"]:
        if col in df.columns:
            out[col] = df[col].values

    for c in ALL_COMP_COLS:
        if c in scores.columns:
            out[f"score_{c}"] = scores[c].round(3).values

    # Pozisyon maskesi: hard exclusion yerine 0.3x soft penalty (versatile oyuncular kısıtlanmasın)
    # Yalnızca core noun skorlarına uygulanır
    POS_PENALTY = 0.30
    if "POSITION" in out.columns:
        for noun in CORE_NOUNS:
            col = f"score_{noun}"
            if col not in out.columns:
                continue
            allowed = NOUN_POSITION_MASK.get(noun)
            if allowed is None:
                continue  # pozisyon kısıtı yok
            mask_bad = ~out["POSITION"].str.upper().isin(allowed)
            out.loc[mask_bad, col] = (out.loc[mask_bad, col] * POS_PENALTY).round(3)

    # primary_arch: pozisyon maskesi + threshold gating uygulanarak en uygun CORE NOUN seçilir
    # Oyuncu bir noun'da threshold'u geçemiyorsa o noun primary_arch olamaz.
    core_score_cols = [f"score_{c}" for c in CORE_NOUNS if f"score_{c}" in out.columns]
    noun_thresholds = {c: sigset[c].get("percentile_threshold", 0.0) for c in CORE_NOUNS if c in sigset}
    if core_score_cols:
        # Initiator bias koruması: hız/mesafe metrikleri çok yaygın olduğu için
        # başka noun >= 0.52 varsa Initiator primary_arch olamaz
        _non_initiator_cols = [c for c in core_score_cols if not c.endswith("_Initiator")]

        def _pick_arch(row):
            pos = str(row.get("POSITION", "")).upper()
            ranked = sorted(
                [(col.replace("score_", ""), float(row.get(col, 0) or 0))
                 for col in core_score_cols],
                key=lambda x: x[1], reverse=True,
            )
            other_max = max(
                (float(row.get(c, 0) or 0) for c in _non_initiator_cols), default=0.0
            )
            # Geçiş 1: threshold'u geçen ilk noun (skor zaten pozisyon penalty'si içeriyor).
            # MIN_PRIMARY=0.70: öğrenilmiş düşük threshold'lar (Creator=0.575 gibi) spurious seçimi engeller.
            MIN_PRIMARY = 0.88
            for noun, score in ranked:
                thr = max(noun_thresholds.get(noun, 0.0), MIN_PRIMARY)
                if score >= thr:
                    if noun == "Initiator" and other_max >= 0.52:
                        continue
                    return noun
            # Geçiş 2 (fallback): threshold yok, en yüksek skorda noun
            ECO_FALLBACK_MIN = 0.90
            for noun, score in ranked:
                if noun == "Ecosystem" and score < ECO_FALLBACK_MIN:
                    continue
                if noun == "Initiator" and other_max >= 0.52:
                    continue
                return noun
            return ranked[0][0] if ranked else ""
        out["primary_arch"] = out.apply(_pick_arch, axis=1)

        # ── G4: NBA-dışı lig kalibrasyonu ────────────────────────────────────
        # FALLBACK yolu (tracking/hustle metrik yok) skorları sistematik olarak
        # sıkıştırır → ham argmax birkaç arketipe yığılır (5-7 arketip boş kalır).
        # Çözüm: primary_arch'ı LİG-İÇİ z-skor ile yeniden ata. Her arketip skoru
        # kendi lig dağılımında standardize edilir; oyuncu, o arketipte lig
        # ortalamasından en çok saptığı yere atanır → dağılım dengelenir, büyük-
        # adam arketipleri (Anchor/Rim Runner) yüzeye çıkar. Skorlar zaten
        # pozisyon-penalty'li olduğundan z pozisyona duyarlı kalır.
        # NBA'e UYGULANMAZ: zengin metriklerle zaten iyi kalibre (test_g4 doğruladı).
        if league != "nba":
            _M = out[core_score_cols].astype(float).fillna(0.0)
            _mu, _sd = _M.mean(), _M.std().replace(0, 1)
            _Z = (_M - _mu) / _sd
            out["primary_arch"] = _Z.idxmax(axis=1).str.replace("score_", "", regex=False)

    # Playoff blending: playoff parquet varsa comp_score'u harmanlıyoruz.
    # overall = 0.70 * reg_comp + 0.30 * playoff_comp  (GP_playoff >= 5 şartı)
    # NBA dışı ligler için playoff parquet yok — prefix ile kontrol et.
    playoff_p = ROOT / "data" / f"{prefix}{season.replace('/', '-')}__playoff_merged.parquet"
    if playoff_p.exists():
        try:
            pdf = pd.read_parquet(playoff_p)
            po_sigset = select_signatures(pdf)
            po_scores, _ = predict_components(pdf, sigset=po_sigset)
            po_noun_cols = [c for c in CORE_NOUNS if c in po_scores.columns]
            if po_noun_cols:
                po_weights = [NOUN_WEIGHTS.get(c, 1.0) for c in po_noun_cols]
                po_comp = (sum(po_scores[c].fillna(0) * w
                               for c, w in zip(po_noun_cols, po_weights))
                           / sum(po_weights))
                po_gp = pdf.get("GP", pd.Series(dtype=float))
                # PLAYER_ID üzerinden eşleştir
                po_map = pd.DataFrame({
                    "PLAYER_ID": pdf["PLAYER_ID"].values,
                    "po_comp":   po_comp.values,
                    "po_gp":     po_gp.values if len(po_gp) == len(pdf) else 0,
                })
                out = out.merge(po_map, on="PLAYER_ID", how="left")
                valid_po = out["po_gp"].fillna(0) >= 5
                if valid_po.any():
                    out.loc[valid_po, "score_playoff_comp"] = out.loc[valid_po, "po_comp"].round(3)
                out.drop(columns=["po_comp", "po_gp"], inplace=True, errors="ignore")
        except Exception as e:
            print(f"[UYARI] playoff blend hatası: {e}")

    # overall_score: saf bileşen ağırlıklı ortalaması (BPM ÇIKARILDI — circular validation).
    # BPM hem Engine/Ecosystem metriğinde kullanılıyor hem de overall validator'ı olamazdı.
    # BPM artık yalnızca referans alanı olarak saklanır (/api/players/{name}/scores'da görünür).
    if core_score_cols:
        noun_cols = [c for c in CORE_NOUNS if f"score_{c}" in out.columns]
        weights   = [NOUN_WEIGHTS.get(c, 1.0) for c in noun_cols]
        # TOP-4 + ^1.5: her oyuncunun en yüksek 4 noun skoru üzerinden ağırlıklı ortalama.
        # Breadth (Barnes: 8x0.75) yerine peak (SGA: 3x0.95) ödüllendirir.
        # ^1.5 exponent: orta skorları baskılar (0.65^1.5=0.524), elit skoru korur (0.97^1.5=0.955).
        import numpy as _np
        _score_mat = _np.array([out[f"score_{c}"].fillna(0).values**1.5 * w
                                for c, w in zip(noun_cols, weights)]).T   # (n_players, 12)
        _w_arr = _np.array(weights)
        _top_k = 4
        _sort_idx = _np.argsort(-_score_mat, axis=1)[:, :_top_k]
        _top_scores  = _np.take_along_axis(_score_mat, _sort_idx, axis=1)
        _top_weights = _w_arr[_sort_idx]
        comp_score = pd.Series(_top_scores.sum(axis=1) / _top_weights.sum(axis=1), index=out.index)

        # BPM "kazanma etkisi" bileşeni (0.40 ağırlık).
        # BPM clip(-5, 15) → [0, 1] normalize: Jokic(14.2)=0.96, SGA(11.7)=0.84, Giddey(2.7)=0.39.
        # Noun-only top-4 değeri + BPM → sıralamanın impact'e duyarlı olması.
        # BPM = Engine/Ecosystem signaturelarda da kullanılıyor (OBPM) ama farklı kanalda:
        #   orada percentile skoru etkiliyor; burada kazanma bağlamında bireysel verimliliği ölçüyor.
        if "BPM" in df.columns:
            out["BPM"] = df["BPM"].values
            _bpm = df["BPM"].fillna(df["BPM"].median())
            _BPM_MIN, _BPM_MAX = -5.0, 15.0
            _bpm_norm = ((_bpm.clip(_BPM_MIN, _BPM_MAX) - _BPM_MIN) / (_BPM_MAX - _BPM_MIN)).values
            comp_score = 0.60 * comp_score + 0.40 * pd.Series(_bpm_norm, index=out.index)

        # Playoff blending (GP_playoff >= 5 olanlar için)
        if "score_playoff_comp" in out.columns:
            has_playoff = out["score_playoff_comp"].notna()
            blended = comp_score.copy()
            blended[has_playoff] = (0.70 * comp_score[has_playoff]
                                    + 0.30 * out.loc[has_playoff, "score_playoff_comp"])
            raw_overall = blended
            n_blended = has_playoff.sum()
            if n_blended > 0:
                print(f"  [playoff blend] {n_blended} oyuncuya 0.70·reg + 0.30·playoff uygulandı")
        else:
            raw_overall = comp_score

        # Effective minutes eşiği: toplam dakika = GP × MIN_per_game ≥ 700.
        # "35 maç, 12 dk" = 420 dk → dışarıda; "35 maç, 35 dk" = 1225 dk → içeride.
        # MIN yoksa GP≥35 eski davranışı korunur.
        EFF_GAMES_THRESHOLD = 700   # toplam dakika (sezon boyunca)
        if "GP" in out.columns and "MIN" in out.columns:
            eff_games = out["GP"].fillna(0) * out["MIN"].fillna(0)   # toplam dakika
            out["eff_games"] = eff_games.round(1)
            raw_overall = raw_overall.where(eff_games >= EFF_GAMES_THRESHOLD, other=float("nan"))
        elif "GP" in out.columns:
            raw_overall = raw_overall.where(out["GP"].fillna(0) >= 35, other=float("nan"))

        # Bayesian shrinkage: eff_games 700-1400 dk (≈20-39 tam maç) → kısmi güven.
        # eff_games≥1400 dk → tam güven; 700 dk → %60 güven.
        if "eff_games" in out.columns:
            valid_mask = out["eff_games"].between(700, 1399) & raw_overall.notna()
            if valid_mask.any():
                season_mean = float(raw_overall[out["eff_games"].fillna(0) >= 1400].mean())
                if pd.notna(season_mean):
                    gp_w = (0.60 + 0.40 * ((out["eff_games"].fillna(0) - 700) / 700)).clip(0.60, 1.0)
                    raw_overall = raw_overall.where(~valid_mask,
                                                    other=gp_w * raw_overall + (1 - gp_w) * season_mean)
        elif "GP" in out.columns:
            valid_mask = out["GP"].fillna(0).between(35, 59) & raw_overall.notna()
            if valid_mask.any():
                season_mean = float(raw_overall[out["GP"].fillna(0) >= 60].mean())
                if pd.notna(season_mean):
                    gp_w = (0.60 + 0.40 * ((out["GP"].fillna(0) - 35) / 25)).clip(0.60, 1.0)
                    raw_overall = raw_overall.where(~valid_mask,
                                                    other=gp_w * raw_overall + (1 - gp_w) * season_mean)

        out["overall_score"] = raw_overall.round(3)

    # Kullanıcı/admin onaylı arketip düzeltmeleri — yalnızca NBA için
    if league == "nba":
        apply_overrides(out, ROOT / "data" / "arch_overrides.json")

    return out


def apply_overrides(df: pd.DataFrame, path) -> None:
    """arch_overrides.json'daki onaylı düzeltmeleri primary_arch'a uygula (in-place)."""
    from pathlib import Path as _P
    p = _P(path)
    if not p.exists():
        return
    try:
        import json as _j
        overrides = _j.loads(p.read_text())
    except Exception:
        return
    if "primary_arch" not in df.columns or "PLAYER_NAME" not in df.columns:
        return
    for player_name, season_map in overrides.items():
        if not isinstance(season_map, dict):
            continue
        # Her sezon değerinin en son kaydını al (birden fazla sezon girişi olabilir)
        arch = next(reversed(list(season_map.values())), None)
        if arch:
            df.loc[df["PLAYER_NAME"] == player_name, "primary_arch"] = arch


def _score_vec(row: pd.Series) -> np.ndarray:
    """Bileşen skor vektörü — lineup/duo coverage hesabı için (12 core noun)."""
    vals = []
    for c in COMP_COLS:
        col = f"score_{c}"
        vals.append(float(row[col]) if col in row.index and not pd.isna(row[col]) else 0.0)
    return np.array(vals)


def _role_vec(row: pd.Series) -> np.ndarray:
    """11 boyutlu fonksiyonel rol vektörü."""
    return compute_role_vec(dict(row))


# ─── 2. Duo uyumu ─────────────────────────────────────────────────────────────

def _duo_role_score(rv1: np.ndarray, rv2: np.ndarray,
                    arch1: str, arch2: str,
                    affinity_matrix=None) -> tuple[float, float, float, float, dict]:
    """
    İki oyuncunun 11 boyutlu rol vektöründen uyum skoru hesaplar.
    Döner: (coverage, complement, affinity, duo_score, role_breakdown)
    """
    max_rv   = np.maximum(rv1, rv2)
    coverage = float(max_rv.mean())

    # Tamamlama: kaç slotta farklı oyuncu dominant?
    dom1 = rv1 > rv2 + 0.05   # r1 o slotta anlamlı üstün
    dom2 = rv2 > rv1 + 0.05
    complement = float((dom1.sum() + dom2.sum()) / (2 * len(rv1)))

    aff = get_affinity(arch1, arch2, affinity_matrix)

    duo_score = 0.40 * coverage + 0.30 * complement + 0.30 * aff

    role_breakdown = {
        slot: round(float(max_rv[i]), 3)
        for i, slot in enumerate(ROLE_SLOTS)
    }
    return coverage, complement, aff, duo_score, role_breakdown


def duo_compatibility(score_table: pd.DataFrame,
                      affinity_matrix=None,
                      min_games: int = 0) -> pd.DataFrame:
    """
    Tüm oyuncu çiftleri için rol tabanlı uyum skoru hesaplar.
    score_table: build_score_table() çıktısı.
    affinity_matrix: roles.AFFINITY_MATRIX (veya güncellenmiş versiyon).
    """
    tbl = score_table.copy()
    if min_games > 0 and "GP" in tbl.columns:
        tbl = tbl[tbl["GP"] >= min_games]
    tbl = tbl.reset_index(drop=True)

    rows = []
    for i, j in combinations(range(len(tbl)), 2):
        r1, r2 = tbl.iloc[i], tbl.iloc[j]
        rv1 = _role_vec(r1)
        rv2 = _role_vec(r2)
        a1  = r1.get("primary_arch", "")
        a2  = r2.get("primary_arch", "")

        coverage, complement, aff, duo_score, role_bd = _duo_role_score(
            rv1, rv2, a1, a2, affinity_matrix
        )

        max_rv   = np.maximum(rv1, rv2)
        n_strong = int((max_rv >= DEPTH_THRESHOLD).sum())

        rows.append({
            "Oyuncu_1":       r1["PLAYER_NAME"],
            "Takım_1":        r1.get("TEAM_ABBREVIATION", ""),
            "Arketip_1":      a1,
            "Oyuncu_2":       r2["PLAYER_NAME"],
            "Takım_2":        r2.get("TEAM_ABBREVIATION", ""),
            "Arketip_2":      a2,
            "Arketip_Cift":   " + ".join(sorted([a1 or "?", a2 or "?"])),
            "Kapsama":        round(coverage, 3),
            "Tamamlama":      round(complement, 3),
            "Affinity":       round(aff, 3),
            "Uyum_Skoru":     round(duo_score, 3),
            "Guclu_Bilesen":  n_strong,
            **{f"rol_{k.replace(' ','_')}": v for k, v in role_bd.items()},
        })

    return pd.DataFrame(rows).sort_values("Uyum_Skoru", ascending=False).reset_index(drop=True)


# ─── 3. 5'li lineup uyumu ─────────────────────────────────────────────────────

def _s(row, key: str) -> float:
    """Güvenli score_ okuyucu."""
    v = row.get(f"score_{key}", 0) if hasattr(row, "get") else 0
    try:
        f = float(v)
        return f if not np.isnan(f) else 0.0
    except (TypeError, ValueError):
        return 0.0


def _lineup_role_score(rows: list, affinity_matrix=None) -> dict:
    """
    5 basketbol boyutunda lineup uyum skoru.

    1. Creation  (0.28) — yaratıcılık kalitesi + derinliği
    2. Spacing   (0.27) — şut tehdidi: Spacer | 3-and-D | Stretch | Gravity
    3. Defense   (0.22) — iç saha + dış hat savunması + derinlik
    4. Finishing (0.12) — son dokunuş: Finisher / Rim Runner / Slashing
    5. Role Fit  (0.11) — top-dominant redundancy penaltısı (düşük = iyi)

    Bonus: Creation × Spacing sinerjisi (max +0.05)
    """
    # ── 1. CREATION ────────────────────────────────────────────────────────
    # Primary: lineup'ta en iyi yaratıcı oyuncu
    primary_creation_scores = [
        max(_s(r,"Ecosystem")*1.10, _s(r,"Engine")*1.00,
            _s(r,"Hub")*0.90, _s(r,"Creator")*0.88,
            _s(r,"Connector")*0.75, _s(r,"Initiator")*0.80)
        for r in rows
    ]
    primary_creation = min(1.0, max(primary_creation_scores))

    # Depth: kaç oyuncu yaratıcılık üretebilir? (3 = tam derinlik)
    n_creators = sum(1 for v in primary_creation_scores if v >= 0.65)
    creation_depth = min(1.0, n_creators / 3.0)

    # Playmaking modifier: pas ve asist organizasyonu
    playmaking_pool = max(_s(r,"Playmaking") for r in rows)

    creation = min(1.0, 0.60 * primary_creation + 0.25 * creation_depth + 0.15 * playmaking_pool)

    # ── 2. SPACING ──────────────────────────────────────────────────────────
    # Her oyuncunun spacing skoru: en yüksek şut tehdidi kaynağı
    spacing_per_player = [
        max(_s(r,"Spacer"), _s(r,"3-and-D")*0.90,
            _s(r,"Stretch")*0.85, _s(r,"Gravity")*0.95,
            _s(r,"Three-Level")*0.80)
        for r in rows
    ]
    n_shooters = sum(1 for v in spacing_per_player if v >= 0.70)
    avg_spacing = float(np.mean(spacing_per_player))

    # Shooter sayısına göre tablo: 2-3 ideal, 0 çok kötü, 5 pasif
    shooter_table = {0: 0.15, 1: 0.48, 2: 0.80, 3: 1.00, 4: 0.92, 5: 0.78}
    shooter_score  = shooter_table.get(n_shooters, shooter_table.get(min(n_shooters, 5), 0.78))
    spacing = min(1.0, 0.60 * shooter_score + 0.40 * avg_spacing)

    # ── 3. DEFENSE ──────────────────────────────────────────────────────────
    interior_def = min(1.0, max(
        max(_s(r,"Anchor")*1.10, _s(r,"Force")*0.75, _s(r,"Rim Runner")*0.65)
        for r in rows
    ))
    perimeter_def = min(1.0, max(
        max(_s(r,"Stopper"), _s(r,"Two-Way")*0.90,
            _s(r,"Point-of-Attack")*0.88, _s(r,"Defensive")*0.92)
        for r in rows
    ))
    n_defenders = sum(1 for r in rows if max(
        _s(r,"Two-Way"), _s(r,"Stopper"), _s(r,"Point-of-Attack"),
        _s(r,"Defensive"), _s(r,"Anchor")
    ) >= 0.65)
    def_depth = min(1.0, n_defenders / 2.5)

    defense = 0.35 * interior_def + 0.35 * perimeter_def + 0.30 * def_depth

    # ── 4. FINISHING ────────────────────────────────────────────────────────
    finishing = min(1.0, max(
        max(_s(r,"Finisher")*1.00, _s(r,"Rim Runner")*0.95,
            _s(r,"Force")*0.75, _s(r,"Slashing")*0.82, _s(r,"Anchor")*0.60)
        for r in rows
    ))

    # ── 5. ROLE FIT (redundancy) ────────────────────────────────────────────
    # Ball-dominant fazlası: 2+ Engine/Ecosystem ≥ 0.80 → penaltı
    ball_dominant = sum(
        1 for r in rows
        if max(_s(r,"Engine")*1.05, _s(r,"Ecosystem")*1.00) >= 0.80
    )
    redundancy = max(0.0, (ball_dominant - 1) * 0.18)
    role_fit = max(0.0, 1.0 - redundancy)

    # ── SINERJI: Creation × Spacing ─────────────────────────────────────────
    # 3 şut tehdidi oluşturucusu → yaratıcının etkinliğini artırır
    spacing_bonus = max(0.0, spacing - 0.60) * 0.25   # spacing 0.60'ın üstünde her +0.10 = +0.025
    synergy_bonus = min(0.05, creation * spacing_bonus)

    # ── FİNAL ────────────────────────────────────────────────────────────────
    lineup_score = min(1.0,
        0.28 * creation
        + 0.27 * spacing
        + 0.22 * defense
        + 0.12 * finishing
        + 0.11 * role_fit
        + synergy_bonus
    )

    # Arketip affinity (bilgilendirme amaçlı)
    get_arch = lambda r: str(r.get("primary_arch", "")) if hasattr(r, "get") else ""
    archs = [get_arch(r) for r in rows]
    pairs_aff = [get_affinity(archs[a], archs[b], affinity_matrix)
                 for a, b in combinations(range(len(archs)), 2)]
    affinity = round(float(np.mean(pairs_aff)), 3) if pairs_aff else 0.65

    pillars = {
        "Creation":  round(creation, 3),
        "Spacing":   round(spacing, 3),
        "Defense":   round(defense, 3),
        "Finishing": round(finishing, 3),
        "Role Fit":  round(role_fit, 3),
    }
    weakest   = sorted(pillars, key=pillars.get)[:2]
    strongest = sorted(pillars, key=pillars.get, reverse=True)[:2]

    return {
        "creation":           round(creation, 3),
        "spacing":            round(spacing, 3),
        "defense":            round(defense, 3),
        "finishing":          round(finishing, 3),
        "role_fit":           round(role_fit, 3),
        "synergy_bonus":      round(synergy_bonus, 3),
        "n_shooters":         n_shooters,
        "ball_dominant":      ball_dominant,
        "redundancy_penalty": round(redundancy, 3),
        "affinity":           affinity,
        "lineup_score":       round(lineup_score, 3),
        "pillar_breakdown":   pillars,
        "weakest":            weakest,
        "strongest":          strongest,
        # Eski alan adları — geriye dönük uyumluluk
        "coverage":           round((creation + spacing + defense) / 3, 3),
        "balance":            round(role_fit, 3),
        "role_breakdown":     pillars,
    }


def _fuzzy_match(name: str, all_names: list[str]) -> str | None:
    """Tam eşleşme yoksa en yakın ismi döner (difflib)."""
    import difflib
    m = difflib.get_close_matches(name, all_names, n=1, cutoff=0.75)
    return m[0] if m else None


def lineup_score_from_names(names: list[str],
                            score_table: pd.DataFrame) -> dict:
    """5 oyuncu adından oluşan listeyi alır, uyum metriklerini döner."""
    name_idx  = {r["PLAYER_NAME"]: i for i, r in score_table.iterrows()}
    all_names = list(name_idx.keys())
    matched: dict[str, str] = {}   # girilen isim → eşleşen isim
    for n in names:
        if n in name_idx:
            matched[n] = n
        else:
            fuzzy = _fuzzy_match(n, all_names)
            if fuzzy:
                matched[n] = fuzzy
    found = [score_table.iloc[name_idx[matched[n]]] for n in names if n in matched]
    if len(found) < 2:
        return {}

    result = _lineup_role_score(found)
    result["n_players_found"] = len(found)
    result["depth"] = result["balance"]
    result["comp_detail"] = result["role_breakdown"]
    # Her oyuncunun overall_score'u — frontend en yüksek skora sahip oyuncuyu belirler
    result["player_scores"] = {
        r["PLAYER_NAME"]: round(float(v) if pd.notna(v := r.get("overall_score", 0)) else 0.0, 3)
        for r in found
    }
    return result


def top_lineup_combos(score_table: pd.DataFrame,
                      top_n: int = 200,
                      min_gp: int = 35,
                      min_mpg: float = 22.0,
                      pool_size: int = 40) -> pd.DataFrame:
    """
    Skor tablosundan en uyumlu teorik 5'li kombinasyonları hesaplar.
    pool_size=40 -> 658K kombinasyon, saniyeler içinde biter.
    min_mpg: sadece gerçek starter/key-bench oyuncuları dahil et.
    """
    pool = score_table.copy()
    if "GP" in pool.columns:
        pool = pool[pool["GP"] >= min_gp]
    if "MIN" in pool.columns:
        pool = pool[pool["MIN"] >= min_mpg]
    pool = pool.nlargest(pool_size, "overall_score").reset_index(drop=True)

    names  = pool["PLAYER_NAME"].tolist()
    archs  = pool["primary_arch"].tolist() if "primary_arch" in pool.columns else ["?"]*len(pool)

    combo_indices = list(combinations(range(len(pool)), 5))
    idx_arr = np.array(combo_indices)              # (n_combos, 5)

    # ── Per-player pillar vektörleri ─────────────────────────────────────────
    def _gp(col, mult=1.0):
        c = f"score_{col}"
        arr = pool[c].fillna(0).values.astype(np.float32) if c in pool.columns else np.zeros(len(pool), np.float32)
        return np.minimum(1.0, arr * mult)

    creat_p = np.minimum(1.0, np.maximum.reduce([
        _gp("Ecosystem",1.10), _gp("Engine",1.00), _gp("Hub",0.90),
        _gp("Creator",0.88),   _gp("Connector",0.75), _gp("Initiator",0.80),
    ]))
    spac_p = np.minimum(1.0, np.maximum.reduce([
        _gp("Spacer"), _gp("3-and-D",0.90), _gp("Stretch",0.85),
        _gp("Gravity",0.95), _gp("Three-Level",0.80),
    ]))
    intd_p = np.minimum(1.0, np.maximum(_gp("Anchor",1.10), _gp("Force",0.65)))
    perd_p = np.minimum(1.0, np.maximum.reduce([
        _gp("Stopper"), _gp("Two-Way",0.90), _gp("Point-of-Attack",0.88), _gp("Defensive",0.92),
    ]))
    dflg_p = (np.maximum.reduce([_gp("Two-Way"), _gp("Stopper"), _gp("Point-of-Attack"),
                                  _gp("Defensive"), _gp("Anchor")]) >= 0.65).astype(np.float32)
    fini_p = np.minimum(1.0, np.maximum.reduce([
        _gp("Finisher"), _gp("Rim Runner",0.95), _gp("Force",0.75), _gp("Slashing",0.82),
    ]))
    bdom_p  = (np.maximum(_gp("Engine",1.05), _gp("Ecosystem")) >= 0.80).astype(np.float32)
    play_p  = _gp("Playmaking")

    # ── Combo-level aggregation ───────────────────────────────────────────────
    creat_s = creat_p[idx_arr]   # (n_combos, 5)
    primary_creation = np.minimum(1.0, creat_s.max(axis=1))
    n_creators       = (creat_s >= 0.65).sum(axis=1).astype(np.float32)
    creation_depth   = np.minimum(1.0, n_creators / 3.0)
    creation = np.minimum(1.0, 0.60*primary_creation + 0.25*creation_depth + 0.15*play_p[idx_arr].max(axis=1))

    spac_s      = spac_p[idx_arr]
    n_shooters  = (spac_s >= 0.70).sum(axis=1)
    avg_spacing = spac_s.mean(axis=1)
    _stbl       = np.array([0.15, 0.48, 0.80, 1.00, 0.92, 0.78], dtype=np.float32)
    spacing = np.minimum(1.0, 0.60*_stbl[np.minimum(n_shooters, 5)] + 0.40*avg_spacing)

    interior_def  = np.minimum(1.0, intd_p[idx_arr].max(axis=1))
    perimeter_def = np.minimum(1.0, perd_p[idx_arr].max(axis=1))
    def_depth     = np.minimum(1.0, dflg_p[idx_arr].sum(axis=1) / 2.5)
    defense = 0.35*interior_def + 0.35*perimeter_def + 0.30*def_depth

    finishing = np.minimum(1.0, fini_p[idx_arr].max(axis=1))

    ball_dom_count = bdom_p[idx_arr].sum(axis=1)
    redundancy     = np.maximum(0.0, (ball_dom_count - 1.0) * 0.18)
    role_fit       = np.maximum(0.0, 1.0 - redundancy)

    spacing_bonus = np.maximum(0.0, spacing - 0.60) * 0.25
    synergy_bonus = np.minimum(0.05, creation * spacing_bonus)

    # Affinity — vektörize
    from roles import AFFINITY_MATRIX
    _NOUNS = list(AFFINITY_MATRIX.index)
    _aff_mat = AFFINITY_MATRIX.values.astype(np.float32)
    _noun_idx = {n: i for i, n in enumerate(_NOUNS)}
    _default_idx = len(_NOUNS)
    aff_ext = np.full((_default_idx + 1, _default_idx + 1), 0.65, dtype=np.float32)
    aff_ext[:_default_idx, :_default_idx] = _aff_mat
    arch_idx_arr = np.array([_noun_idx.get(a, _default_idx) for a in archs], dtype=np.int32)

    aff_vals = np.zeros(len(combo_indices), dtype=np.float32)
    pair_slots = list(combinations(range(5), 2))
    for pa, pb in pair_slots:
        ai = arch_idx_arr[idx_arr[:, pa]]
        bi = arch_idx_arr[idx_arr[:, pb]]
        aff_vals += aff_ext[ai, bi]
    aff_vals /= len(pair_slots)

    ls = np.minimum(1.0,
        0.28*creation + 0.27*spacing + 0.22*defense
        + 0.12*finishing + 0.11*role_fit + synergy_bonus
    )

    top_idx = np.argsort(-ls)[:top_n]

    rows = []
    for i in top_idx:
        cidx = combo_indices[i]
        player_rows = [pool.iloc[k] for k in cidx]
        pillar = _lineup_role_score(player_rows)
        rows.append({
            "Oyuncu_1":    names[cidx[0]], "Oyuncu_2": names[cidx[1]],
            "Oyuncu_3":    names[cidx[2]], "Oyuncu_4": names[cidx[3]],
            "Oyuncu_5":    names[cidx[4]],
            "Arketipler":  " | ".join(archs[k] for k in cidx),
            "Affinity":    round(float(aff_vals[i]), 3),
            "Uyum_Skoru":  round(float(ls[i]),       3),
            "creation":    pillar.get("creation",  0),
            "spacing":     pillar.get("spacing",   0),
            "defense":     pillar.get("defense",   0),
            "finishing":   pillar.get("finishing", 0),
            "role_fit":    pillar.get("role_fit",  0),
            "n_shooters":  pillar.get("n_shooters", 0),
            "pillar_breakdown": pillar.get("pillar_breakdown", {}),
            # geriye uyumluluk
            "Kapsama":  pillar.get("creation", 0),
            "Denge":    pillar.get("role_fit", 0),
            "Switch":   pillar.get("defense",  0),
            "ShotDepth":pillar.get("spacing",  0),
        })

    return pd.DataFrame(rows).reset_index(drop=True)


def top_lineup_combos_positional(score_table: pd.DataFrame,
                                  top_n: int = 200,
                                  min_gp: int = 35,
                                  min_mpg: float = 22.0,
                                  pool_per_pos: int = 12) -> pd.DataFrame:
    """
    PG×SG×SF×PF×C kısıtıyla en uyumlu 5'lileri bulur.
    Her pozisyondan top-pool_per_pos oyuncu seçilir.
    pool_per_pos=12 → en fazla 12^5 ≈ 248K kombinasyon.
    min_mpg: sadece gerçek starter/key-bench oyuncuları dahil et.
    """
    df = score_table.copy()
    if "GP" in df.columns:
        df = df[df["GP"] >= min_gp]
    if "MIN" in df.columns:
        df = df[df["MIN"] >= min_mpg]

    if "POS5" not in df.columns:
        raise ValueError("POS5 sütunu yok — api/main.py _assign_pos5() ile ekle")

    positions = ["PG", "SG", "SF", "PF", "C"]
    pools: dict[str, pd.DataFrame] = {}
    for pos in positions:
        sub = df[df["POS5"] == pos].nlargest(pool_per_pos, "overall_score").reset_index(drop=True)
        pools[pos] = sub

    # Boş havuz varsa daha geniş pozisyon grubundan doldur
    fallback_map = {"SG": "Guard", "SF": "Forward", "PF": "Forward"}
    for pos in positions:
        if len(pools[pos]) < 3:
            pools[pos] = df.nlargest(pool_per_pos, "overall_score").reset_index(drop=True)

    # Meshgrid ile tüm kombinasyonları oluştur
    ranges = [np.arange(len(pools[p])) for p in positions]
    grids  = np.meshgrid(*ranges, indexing="ij")
    idx    = np.stack([g.ravel() for g in grids], axis=1)  # (n_combos, 5)

    # ── Per-player pillar vektörleri (her pozisyon havuzu için) ──────────────
    def _gsc(pool, col, mult=1.0):
        """pool'dan score_col al → float32 array."""
        c = f"score_{col}"
        arr = pool[c].fillna(0).values.astype(np.float32) if c in pool.columns else np.zeros(len(pool), np.float32)
        return np.minimum(1.0, arr * mult)

    creation_v, spacing_v = {}, {}
    int_def_v, per_def_v, def_flag_v = {}, {}, {}
    finishing_v, ball_dom_v, playmaking_v = {}, {}, {}

    for pos in positions:
        pool = pools[pos]
        creation_v[pos]  = np.minimum(1.0, np.maximum.reduce([
            _gsc(pool, "Ecosystem", 1.10), _gsc(pool, "Engine", 1.00),
            _gsc(pool, "Hub", 0.90),       _gsc(pool, "Creator", 0.88),
            _gsc(pool, "Connector", 0.75), _gsc(pool, "Initiator", 0.80),
        ]))
        spacing_v[pos]   = np.minimum(1.0, np.maximum.reduce([
            _gsc(pool, "Spacer"),        _gsc(pool, "3-and-D", 0.90),
            _gsc(pool, "Stretch", 0.85), _gsc(pool, "Gravity", 0.95),
            _gsc(pool, "Three-Level", 0.80),
        ]))
        int_def_v[pos]   = np.minimum(1.0, np.maximum(_gsc(pool, "Anchor", 1.10), _gsc(pool, "Force", 0.65)))
        per_def_v[pos]   = np.minimum(1.0, np.maximum.reduce([
            _gsc(pool, "Stopper"),            _gsc(pool, "Two-Way", 0.90),
            _gsc(pool, "Point-of-Attack", 0.88), _gsc(pool, "Defensive", 0.92),
        ]))
        def_flag_v[pos]  = (np.maximum.reduce([
            _gsc(pool, "Two-Way"), _gsc(pool, "Stopper"),
            _gsc(pool, "Point-of-Attack"), _gsc(pool, "Defensive"), _gsc(pool, "Anchor"),
        ]) >= 0.65).astype(np.float32)
        finishing_v[pos] = np.minimum(1.0, np.maximum.reduce([
            _gsc(pool, "Finisher"),       _gsc(pool, "Rim Runner", 0.95),
            _gsc(pool, "Force", 0.75),    _gsc(pool, "Slashing", 0.82),
        ]))
        ball_dom_v[pos]  = (np.maximum(_gsc(pool, "Engine", 1.05), _gsc(pool, "Ecosystem")) >= 0.80).astype(np.float32)
        playmaking_v[pos]= _gsc(pool, "Playmaking")

    # ── Combo-level pillars (vectorized) ─────────────────────────────────────
    def _combo_stack(vec_by_pos):
        return np.stack([vec_by_pos[pos][idx[:, slot]] for slot, pos in enumerate(positions)], axis=1)

    creat_s = _combo_stack(creation_v)       # (n, 5)
    spac_s  = _combo_stack(spacing_v)
    intd_s  = _combo_stack(int_def_v)
    perd_s  = _combo_stack(per_def_v)
    dflg_s  = _combo_stack(def_flag_v)
    fini_s  = _combo_stack(finishing_v)
    bdom_s  = _combo_stack(ball_dom_v)
    play_s  = _combo_stack(playmaking_v)

    primary_creation = np.minimum(1.0, creat_s.max(axis=1))
    n_creators       = (creat_s >= 0.65).sum(axis=1).astype(np.float32)
    creation_depth   = np.minimum(1.0, n_creators / 3.0)
    creation = np.minimum(1.0, 0.60*primary_creation + 0.25*creation_depth + 0.15*play_s.max(axis=1))

    n_shooters       = (spac_s >= 0.70).sum(axis=1)   # int
    avg_spacing      = spac_s.mean(axis=1)
    _shoot_tbl       = np.array([0.15, 0.48, 0.80, 1.00, 0.92, 0.78], dtype=np.float32)
    shooter_score    = _shoot_tbl[np.minimum(n_shooters, 5)]
    spacing = np.minimum(1.0, 0.60*shooter_score + 0.40*avg_spacing)

    interior_def  = np.minimum(1.0, intd_s.max(axis=1))
    perimeter_def = np.minimum(1.0, perd_s.max(axis=1))
    n_defenders   = dflg_s.sum(axis=1)
    def_depth     = np.minimum(1.0, n_defenders / 2.5)
    defense = 0.35*interior_def + 0.35*perimeter_def + 0.30*def_depth

    finishing = np.minimum(1.0, fini_s.max(axis=1))

    ball_dominant_count = bdom_s.sum(axis=1)
    redundancy = np.maximum(0.0, (ball_dominant_count - 1.0) * 0.18)
    role_fit = np.maximum(0.0, 1.0 - redundancy)

    spacing_bonus = np.maximum(0.0, spacing - 0.60) * 0.25
    synergy_bonus = np.minimum(0.05, creation * spacing_bonus)

    # Affinity — vektörize: her pozisyon havuzu için arketip index dizisi hazırla
    from roles import AFFINITY_MATRIX
    _NOUNS = list(AFFINITY_MATRIX.index)
    _aff_mat = AFFINITY_MATRIX.values.astype(np.float32)
    _noun_idx = {n: i for i, n in enumerate(_NOUNS)}
    _default_idx = len(_NOUNS)  # bilinmeyen arketip için dummy

    # Her pozisyon havuzu için arketip index dizisi: (pool_size,)
    arch_idx_by_pos = {}
    for pos in positions:
        arch_idx_by_pos[pos] = np.array([
            _noun_idx.get(pools[pos].iloc[k].get("primary_arch", ""), _default_idx)
            for k in range(len(pools[pos]))
        ], dtype=np.int32)

    # Genişletilmiş affinity matrisi (default satır/sütun 0.65)
    aff_ext = np.full((_default_idx + 1, _default_idx + 1), 0.65, dtype=np.float32)
    aff_ext[:_default_idx, :_default_idx] = _aff_mat

    # Her kombo için 10 çiftin affinity ortalaması — vektörize
    aff_vals = np.zeros(len(idx), dtype=np.float32)
    pair_slots = list(combinations(range(5), 2))  # 10 çift
    for pa, pb in pair_slots:
        pos_a, pos_b = positions[pa], positions[pb]
        ai = arch_idx_by_pos[pos_a][idx[:, pa]]   # (n_combos,)
        bi = arch_idx_by_pos[pos_b][idx[:, pb]]
        aff_vals += aff_ext[ai, bi]
    aff_vals /= len(pair_slots)

    ls = np.minimum(1.0,
        0.28 * creation + 0.27 * spacing + 0.22 * defense
        + 0.12 * finishing + 0.11 * role_fit + synergy_bonus
    )

    # Skor sırasına göre TÜM kombolar — greedy sonradan veya inline kullanır
    sorted_idx_all = np.argsort(-ls)  # (n_combos,) tam sıralı

    def _build_row(i):
        slot_idx_ = idx[i]
        pbp, abp  = {}, {}
        rows_for_pillar = []
        for slot_, pos_ in enumerate(positions):
            r_ = pools[pos_].iloc[slot_idx_[slot_]]
            pbp[pos_] = r_["PLAYER_NAME"]
            abp[pos_] = r_.get("primary_arch", "?")
            rows_for_pillar.append(r_)
        # Pillar detail: _lineup_role_score üzerinden tam hesapla (top-n satır için ok)
        pillar = _lineup_role_score(rows_for_pillar)
        scores_by_pos = {}
        for slot_, pos_ in enumerate(positions):
            r2_ = pools[pos_].iloc[slot_idx_[slot_]]
            v_  = r2_.get("overall_score", 0)
            scores_by_pos[pos_] = round(float(v_) if pd.notna(v_) else 0.0, 3)
        return {
            "Oyuncu_1":   pbp["PG"], "Oyuncu_2": pbp["SG"],
            "Oyuncu_3":   pbp["SF"], "Oyuncu_4": pbp["PF"], "Oyuncu_5": pbp["C"],
            "Pos_PG":     pbp["PG"], "Pos_SG":   pbp["SG"],
            "Pos_SF":     pbp["SF"], "Pos_PF":   pbp["PF"], "Pos_C":    pbp["C"],
            "Skor_PG": scores_by_pos["PG"], "Skor_SG": scores_by_pos["SG"],
            "Skor_SF": scores_by_pos["SF"], "Skor_PF": scores_by_pos["PF"],
            "Skor_C":  scores_by_pos["C"],
            "Arketipler":     " | ".join(abp[p] for p in positions),
            "Affinity":       round(float(aff_vals[i]), 3),
            "Uyum_Skoru":     round(float(ls[i]),       3),
            "creation":       pillar.get("creation",  0),
            "spacing":        pillar.get("spacing",   0),
            "defense":        pillar.get("defense",   0),
            "finishing":      pillar.get("finishing", 0),
            "role_fit":       pillar.get("role_fit",  0),
            "n_shooters":     pillar.get("n_shooters", 0),
            "synergy_bonus":  pillar.get("synergy_bonus", 0),
            "pillar_breakdown": pillar.get("pillar_breakdown", {}),
            # Geriye uyumluluk
            "Kapsama":  pillar.get("creation",  0),
            "Denge":    pillar.get("role_fit",  0),
            "Switch":   pillar.get("defense",   0),
            "ShotDepth":pillar.get("spacing",   0),
        }

    # ── Inline greedy: tüm kombolar üzerinde —
    # Her oyuncu yalnızca bir lineup'ta. Skor sırasını korur, top_n kadar seç.
    used_players: set = set()
    rows = []
    # Her pozisyon için oyuncu adı dizisi (fast lookup)
    name_by_pos = {pos: pools[pos]["PLAYER_NAME"].tolist() for pos in positions}

    for i in sorted_idx_all:
        slot_idx_ = idx[i]
        players_  = {name_by_pos[pos][slot_idx_[s]] for s, pos in enumerate(positions)}
        if not players_ & used_players:
            rows.append(_build_row(i))
            used_players |= players_
        if len(rows) >= top_n:
            break

    return pd.DataFrame(rows).reset_index(drop=True)


def greedy_unique_lineups(df_lineups: pd.DataFrame, top_n: int = 10) -> pd.DataFrame:
    """Her oyuncuyu yalnızca bir kez kullanan greedy seçim."""
    used: set = set()
    selected = []
    player_cols = ["Oyuncu_1", "Oyuncu_2", "Oyuncu_3", "Oyuncu_4", "Oyuncu_5"]
    for _, row in df_lineups.iterrows():
        players = {row[c] for c in player_cols if c in row and pd.notna(row[c]) and row[c]}
        if not players & used:
            selected.append(row)
            used |= players
        if len(selected) >= top_n:
            break
    return pd.DataFrame(selected).reset_index(drop=True) if selected else pd.DataFrame()


if __name__ == "__main__":
    print("Skor tablosu hesaplanıyor...")
    st = build_score_table("2025-26")
    out = ROOT / "data" / "2025-26__player_scores.parquet"
    st.to_parquet(out)
    print(f"Kaydedildi: {out.name}  ({len(st)} oyuncu)")

    score_cols = [f"score_{c}" for c in COMP_COLS if f"score_{c}" in st.columns]
    print("\nİlk 5 oyuncu skor profili:")
    print(st[["PLAYER_NAME","primary_arch","overall_score"] + score_cols].head(5).to_string(index=False))
