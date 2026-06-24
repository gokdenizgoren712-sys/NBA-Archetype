"""
Aşama 5 çalıştırıcı: lineup + duo verisi çek, arketip uyum matrisi üret.

Adımlar:
  1. leaguedashlineups  -> 5'li lineup'lar (NET_RATING, MIN)
  2. leaguedashlineups(2-man) -> ikili kombinasyonlar
  3. leaguestandingsv3   -> takım regular season win%
  4. team playoff win%   -> playoffbracket / team game log
  5. Lineup'lara takım başarısını ekle -> composite_success()
  6. player_to_primary_archetype() -> her oyuncuya core-noun arketipi
  7. lineup_archetype_affinity() -> arketip x arketip uyum matrisi (BİRİNCİL)
  8. best_duos()          -> en iyi duolar (İKİNCİL)
"""
import sys, time, json
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from affinity import (composite_success, player_to_primary_archetype,
                      lineup_archetype_affinity, best_duos,
                      MIN_LINEUP_MINUTES, MIN_DUO_MINUTES)

SLEEP = 0.8
SEASON = "2025-26"


# ── 1. Veri çekme yardımcıları ────────────────────────────────────────────────

def _cache(name: str) -> Path:
    return DATA_DIR / f"{SEASON.replace('/', '-')}__{name}.parquet"


def fetch_lineups(group_quantity: str = "5") -> pd.DataFrame:
    """5'li ya da 2'li lineup tablosunu çeker."""
    cp = _cache(f"lineups_{group_quantity}man")
    if cp.exists():
        print(f"[cache] lineups {group_quantity}man")
        return pd.read_parquet(cp)
    from nba_api.stats.endpoints import leaguedashlineups
    try:
        resp = leaguedashlineups.LeagueDashLineups(
            season=SEASON,
            season_type_all_star="Regular Season",
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="PerGame",
            group_quantity=group_quantity,
        )
        df = resp.get_data_frames()[0]
        df.to_parquet(cp)
        print(f"[fetch] lineups {group_quantity}man: {len(df)} kombinasyon")
        time.sleep(SLEEP)
        return df
    except Exception as e:
        print(f"[HATA] lineups {group_quantity}man: {e}")
        return pd.DataFrame()


def fetch_playoff_lineups(group_quantity: str = "5") -> pd.DataFrame:
    """Playoff lineup'larını çeker (eğer sezon bitmiş ve playoff varsa)."""
    cp = _cache(f"playoff_lineups_{group_quantity}man")
    if cp.exists():
        print(f"[cache] playoff lineups {group_quantity}man")
        return pd.read_parquet(cp)
    from nba_api.stats.endpoints import leaguedashlineups
    try:
        resp = leaguedashlineups.LeagueDashLineups(
            season=SEASON,
            season_type_all_star="Playoffs",
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="PerGame",
            group_quantity=group_quantity,
        )
        df = resp.get_data_frames()[0]
        if df.empty:
            print(f"[uyarı] playoff lineup {group_quantity}man boş")
            return pd.DataFrame()
        df.to_parquet(cp)
        print(f"[fetch] playoff lineups {group_quantity}man: {len(df)} kombinasyon")
        time.sleep(SLEEP)
        return df
    except Exception as e:
        print(f"[HATA/yok] playoff lineups {group_quantity}man: {e}")
        return pd.DataFrame()


def fetch_team_standings() -> pd.DataFrame:
    """Takım regular season win% çeker (leaguestandingsv3)."""
    cp = _cache("team_standings")
    if cp.exists():
        print("[cache] team_standings")
        return pd.read_parquet(cp)
    from nba_api.stats.endpoints import leaguestandingsv3
    try:
        resp = leaguestandingsv3.LeagueStandingsV3(
            season=SEASON, season_type="Regular Season")
        df = resp.get_data_frames()[0]
        df.to_parquet(cp)
        print(f"[fetch] team_standings: {len(df)} takım")
        time.sleep(SLEEP)
        return df
    except Exception as e:
        print(f"[HATA] team_standings: {e}")
        return pd.DataFrame()


def fetch_playoff_team_wins() -> pd.DataFrame:
    """Takım playoff win% — teamgamelog ile playoff galibiyetleri."""
    cp = _cache("playoff_team_wins")
    if cp.exists():
        print("[cache] playoff_team_wins")
        return pd.read_parquet(cp)
    from nba_api.stats.endpoints import leaguestandingsv3
    try:
        resp = leaguestandingsv3.LeagueStandingsV3(
            season=SEASON, season_type="Playoffs")
        df = resp.get_data_frames()[0]
        if df.empty:
            print("[uyarı] playoff standings boş — sezon bitmemiş olabilir")
            return pd.DataFrame()
        df.to_parquet(cp)
        print(f"[fetch] playoff_team_wins: {len(df)} takım")
        time.sleep(SLEEP)
        return df
    except Exception as e:
        print(f"[HATA/yok] playoff_team_wins: {e}")
        return pd.DataFrame()


# ── 2. Takım başarısını lineup'lara ekle ──────────────────────────────────────

def attach_team_success(lineups: pd.DataFrame,
                        reg_standings: pd.DataFrame,
                        po_standings: pd.DataFrame) -> pd.DataFrame:
    """TEAM_ABBREVIATION üzerinden regular/playoff win% ekler."""
    lineups = lineups.copy()

    # regular season win%
    if not reg_standings.empty:
        reg_wp_col = next((c for c in reg_standings.columns if "WIN_PCT" in c), None)
        team_col   = next((c for c in reg_standings.columns
                          if "ABBREVIATION" in c or "TEAM_ABBR" in c), None)
        if reg_wp_col and team_col:
            reg_map = reg_standings.set_index(team_col)[reg_wp_col].to_dict()
            lineups["regular_win_pct"] = lineups["TEAM_ABBREVIATION"].map(reg_map)

    # playoff win%
    if not po_standings.empty:
        po_wp_col = next((c for c in po_standings.columns if "WIN_PCT" in c), None)
        team_col2 = next((c for c in po_standings.columns
                         if "ABBREVIATION" in c or "TEAM_ABBR" in c), None)
        if po_wp_col and team_col2:
            po_map = po_standings.set_index(team_col2)[po_wp_col].to_dict()
            lineups["playoff_win_pct"] = lineups["TEAM_ABBREVIATION"].map(po_map)

    if "regular_win_pct" not in lineups.columns:
        lineups["regular_win_pct"] = np.nan
    if "playoff_win_pct" not in lineups.columns:
        lineups["playoff_win_pct"] = np.nan

    return lineups


# ── 3. İkili lineup -> duo tablo dönüşümü ────────────────────────────────────

def twoman_to_duo_table(twoman: pd.DataFrame) -> pd.DataFrame:
    """2-man lineup GROUP_NAME'den (oyuncu1 - oyuncu2) PLAYER1/PLAYER2 sütunları üret."""
    if twoman.empty:
        return pd.DataFrame()
    df = twoman.copy()
    split = df["GROUP_NAME"].str.split(" - ", expand=True)
    df["PLAYER1_NAME"] = split[0].str.strip()
    df["PLAYER2_NAME"] = split[1].str.strip() if split.shape[1] > 1 else ""
    return df


# ── 4. Ana akış ───────────────────────────────────────────────────────────────

def main():
    # 4a. Verileri çek
    print("=== VERİ ÇEKME ===")
    lineups5   = fetch_lineups("5")
    lineups2   = fetch_lineups("2")
    po5        = fetch_playoff_lineups("5")
    po2        = fetch_playoff_lineups("2")
    reg_std    = fetch_team_standings()
    po_std     = fetch_playoff_team_wins()

    if lineups5.empty:
        print("[HATA] 5'li lineup verisi yok, dur.")
        return

    # 4b. Takım başarısını ekle
    print("\n=== BAŞARI SKORU ===")
    lineups5 = attach_team_success(lineups5, reg_std, po_std)
    lineups5["success"] = lineups5.apply(composite_success, axis=1)
    print(f"5'li lineup: {len(lineups5)} kombinasyon, "
          f"filtre sonrası: {(lineups5['MIN'] >= MIN_LINEUP_MINUTES).sum()}")

    # Playoff lineup başarısı
    if not po5.empty:
        po5 = attach_team_success(po5, reg_std, po_std)
        po5["success"] = po5.apply(composite_success, axis=1)
        # Playoff'u iki kat ağırlıkla birleştir
        combined5 = pd.concat([lineups5, po5, po5], ignore_index=True)
        print(f"Playoff {len(po5)} lineup eklendi (2x ağırlık)")
    else:
        combined5 = lineups5

    # 4c. Oyuncu -> arketip eşlemesi
    print("\n=== OYUNCU ARKETİP EŞLEMESİ ===")
    labeled_path = DATA_DIR / "2025-26__labeled.parquet"
    if not labeled_path.exists():
        print("[HATA] data/2025-26__labeled.parquet yok. Önce: python src/label_league.py")
        return
    labeled = pd.read_parquet(labeled_path)

    # Skor tabanlı arketip eşlemesi (boolean değil, ham skor)
    merged_path = DATA_DIR / "2025-26__merged.parquet"
    df_full = pd.read_parquet(merged_path)
    if "FTA" in df_full.columns and "FGA" in df_full.columns:
        df_full["FT_RATE"] = (df_full["FTA"] / df_full["FGA"].replace(0, pd.NA)).fillna(0)
    # Sadece labeled oyuncuları al
    df_sub = df_full[df_full["PLAYER_NAME"].isin(labeled["PLAYER_NAME"])].reset_index(drop=True)
    from engine import predict_components, select_signatures
    import json as _json
    from signatures import COMPONENT_SIGNATURES
    sigset = select_signatures(df_sub, force_fallback=False)
    learned_path = ROOT / "config" / "learned_thresholds.json"
    if learned_path.exists():
        learned = _json.loads(learned_path.read_text())
        for comp in list(sigset.keys()):
            if comp in learned:
                sigset[comp] = {**sigset[comp], "percentile_threshold": learned[comp]["percentile"]}
    scores, _ = predict_components(df_sub, sigset=sigset)
    scores["PLAYER_NAME"] = df_sub["PLAYER_NAME"].values

    CORE = ["Engine", "Anchor", "Rim Runner", "Spacer", "Connector", "Creator"]
    core_in_scores = [c for c in CORE if c in scores.columns]
    player_arch = {}
    for _, row in scores.iterrows():
        core_scores = {c: row[c] for c in core_in_scores if not pd.isna(row[c])}
        if core_scores:
            player_arch[row["PLAYER_NAME"]] = max(core_scores, key=core_scores.get)

    # Kısaltmalı isim -> tam isim eşleme (lineup'lar için)
    # Örnek: "S. Gilgeous-Alexander" -> "Shai Gilgeous-Alexander"
    abbrev_to_full = {}
    for full_name in player_arch:
        parts = full_name.split(" ", 1)
        if len(parts) == 2:
            abbrev = parts[0][0] + ". " + parts[1]  # "Shai" -> "S."
            abbrev_to_full[abbrev] = full_name
    # Çakışan kısaltmalar için tam ismi sakla (eşleşmez; lineup'ta genelde benzersiz)

    print(f"Arketip eşlenen oyuncu: {len(player_arch)}")
    arch_dist = {}
    for a in player_arch.values():
        arch_dist[a] = arch_dist.get(a, 0) + 1
    for a, n in sorted(arch_dist.items(), key=lambda x: -x[1]):
        print(f"  {a:<15} {n} oyuncu")

    # Lineup GROUP_NAME'deki kısaltmalı isimleri tam isime çevir
    def resolve_name(name: str) -> str | None:
        name = name.strip()
        if name in player_arch:
            return name
        return abbrev_to_full.get(name)

    # 4d. BİRİNCİL: 5'li lineup uyum matrisi
    print("\n=== BİRİNCİL: ARKETİP x ARKETİP UYUM MATRİSİ ===")

    # lineup_archetype_affinity'ye resolve_name enjekte et
    def _lineup_affinity_resolved(lineups: pd.DataFrame) -> pd.DataFrame:
        from collections import defaultdict
        lineups = lineups[lineups["MIN"] >= MIN_LINEUP_MINUTES].copy()
        lineups["success"] = lineups.apply(composite_success, axis=1)
        pair_succ: dict = defaultdict(float)
        pair_wt:   dict = defaultdict(float)
        from itertools import combinations as _comb
        for _, lu in lineups.iterrows():
            raw_names = [n.strip() for n in str(lu.get("GROUP_NAME", "")).split(" - ")]
            archs = [player_arch[resolve_name(n)]
                     for n in raw_names if resolve_name(n) and resolve_name(n) in player_arch]
            w = lu["MIN"]
            seen = sorted(set(archs))
            for a, b in _comb(seen, 2):
                pair_succ[(a, b)] += lu["success"] * w
                pair_wt[(a, b)] += w
            for a in seen:
                if archs.count(a) >= 2:
                    pair_succ[(a, a)] += lu["success"] * w
                    pair_wt[(a, a)] += w
        arts = sorted({x for pair in pair_succ for x in pair})
        M = pd.DataFrame(np.nan, index=arts, columns=arts)
        for (a, b), s in pair_succ.items():
            v = s / pair_wt[(a, b)] if pair_wt[(a, b)] else np.nan
            M.loc[a, b] = round(v, 3); M.loc[b, a] = round(v, 3)
        return M

    affinity_matrix = _lineup_affinity_resolved(combined5)
    print(affinity_matrix.round(3).to_string())

    out_matrix = DATA_DIR / "2025-26__affinity_matrix.parquet"
    affinity_matrix.to_parquet(out_matrix)
    affinity_matrix.round(3).to_csv(
        DATA_DIR / "2025-26__affinity_matrix.csv", encoding="utf-8-sig")
    print(f"\nKaydedildi: {out_matrix.name}")

    # En güçlü çiftler
    print("\nEn güçlü arketip çiftleri:")
    pairs = []
    for i in affinity_matrix.index:
        for j in affinity_matrix.columns:
            if i <= j and not np.isnan(affinity_matrix.loc[i, j]):
                pairs.append((i, j, affinity_matrix.loc[i, j]))
    pairs.sort(key=lambda x: -x[2])
    for a, b, v in pairs[:10]:
        label = f"{a} + {b}" if a != b else f"{a} (çift)"
        print(f"  {label:<35} {v:.3f}")

    # 4e. İKİNCİL: en iyi duolar
    print("\n=== İKİNCİL: EN İYİ DUOLAR ===")
    if not lineups2.empty:
        duos_df = twoman_to_duo_table(lineups2)
        duos_df = attach_team_success(duos_df, reg_std, po_std)
        if not po2.empty:
            po2_df = twoman_to_duo_table(po2)
            po2_df = attach_team_success(po2_df, reg_std, po_std)
            duos_df = pd.concat([duos_df, po2_df, po2_df], ignore_index=True)
        # Kısaltmalı isimleri tam isme çevir
        duos_df["PLAYER1_NAME"] = duos_df["PLAYER1_NAME"].map(
            lambda n: resolve_name(n) or n)
        duos_df["PLAYER2_NAME"] = duos_df["PLAYER2_NAME"].map(
            lambda n: resolve_name(n) or n)
        top_duos = best_duos(duos_df, player_arch, top_n=20)
        print(top_duos.to_string(index=False))
        out_duos = DATA_DIR / "2025-26__best_duos.csv"
        top_duos.to_csv(out_duos, index=False, encoding="utf-8-sig")
        print(f"\nKaydedildi: {out_duos.name}")
    else:
        print("[uyarı] 2'li lineup verisi yok, duolar atlanıyor.")

    print("\n=== AŞAMA 5 TAMAMLANDI ===")


if __name__ == "__main__":
    main()
