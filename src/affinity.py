"""
Aşama 5: Arketip uyum analizi.
  BİRİNCİL: beşli lineup'lar üzerinden arketip-arketip uyumu.
  İKİNCİL:  en iyi duolar (iki-adam kombinasyonları).

Takım/lineup başarısı = AĞIRLIKLI kompozit (kullanıcı kararı):
    w1 * playoff_win_pct  +  w2 * net_rating_norm  +  w3 * regular_win_pct
  w1 > w2 > w3  (playoff en yüksek ağırlık).

Veri kaynakları (nba_api):
  - leaguedashlineups : beşli kombinasyon GP/MIN/NET_RATING/OFF/DEF
  - leaguedashptstats (player_or_team, two-man) veya
    leaguedashteamptstats : ikili kombinasyonlar
  - oyuncu->arketip eşlemesi: Aşama 3 çıktısı (player_archetypes.parquet)

DİKKAT — örneklem gürültüsü:
  Lineup'ların çoğu az dakika oynar. MIN_MINUTES eşiği + dakika-ağırlıklı
  ortalama zorunlu, yoksa 12 dakikalık bir beşli istatistikleri bozar.
"""

import numpy as np
import pandas as pd
from itertools import combinations
from pathlib import Path

# Başarı ağırlıkları (kullanıcı: playoff > net rating > regular)
SUCCESS_WEIGHTS = {"playoff_win_pct": 0.50, "net_rating": 0.30, "regular_win_pct": 0.20}
MIN_LINEUP_MINUTES = 100   # bu altındaki beşliler güvenilmez
MIN_DUO_MINUTES = 250


def composite_success(row, net_min=-15, net_max=15) -> float:
    """Bir lineup/takım satırı için [0..1] ağırlıklı başarı skoru.
    net_rating min-max ile [0..1]'e normalize edilir."""
    nr = row.get("NET_RATING", 0.0)
    nr_norm = np.clip((nr - net_min) / (net_max - net_min), 0, 1)
    pw = row.get("playoff_win_pct", np.nan)
    rw = row.get("regular_win_pct", np.nan)
    # playoff verisi yoksa (playoff'a kalmamış takım) ağırlığı regular'a kaydır
    parts, wsum = 0.0, 0.0
    if not np.isnan(pw):
        parts += SUCCESS_WEIGHTS["playoff_win_pct"] * pw; wsum += SUCCESS_WEIGHTS["playoff_win_pct"]
    parts += SUCCESS_WEIGHTS["net_rating"] * nr_norm; wsum += SUCCESS_WEIGHTS["net_rating"]
    if not np.isnan(rw):
        parts += SUCCESS_WEIGHTS["regular_win_pct"] * rw; wsum += SUCCESS_WEIGHTS["regular_win_pct"]
    return parts / wsum if wsum else nr_norm


def player_to_primary_archetype(archetype_df: pd.DataFrame) -> dict:
    """Her oyuncuyu TEK bir baskın core-noun arketipine indirger (uyum matrisi için).
    archetype_df: Aşama 3 çıktısı; oyuncu x bileşen skorları/pozitiflikleri.
    Basit kural: en yüksek skorlu core-noun. (Versatile ayrı ele alınır — Aşama 6.)"""
    CORE = ["Engine","Anchor","Rim Runner","Spacer","Connector","Creator"]
    mapping = {}
    for _, r in archetype_df.iterrows():
        scores = {c: r.get(f"score_{c}", r.get(c, 0)) for c in CORE if f"score_{c}" in r or c in r}
        if scores:
            mapping[r["PLAYER_NAME"]] = max(scores, key=scores.get)
    return mapping


def lineup_archetype_affinity(lineups: pd.DataFrame, player_arch: dict) -> pd.DataFrame:
    """BİRİNCİL: beşli lineup'lardan arketip-çifti uyum matrisi.
    Her lineup'taki 5 oyuncunun arketip çiftlerine, lineup başarısını dakika-ağırlıklı dağıtır.
    Dönen: arketip x arketip ortalama başarı [0..1]."""
    lineups = lineups[lineups["MIN"] >= MIN_LINEUP_MINUTES].copy()
    lineups["success"] = lineups.apply(composite_success, axis=1)

    from collections import defaultdict
    pair_succ = defaultdict(float)
    pair_wt = defaultdict(float)
    for _, lu in lineups.iterrows():
        # lineup oyuncu adları 'GROUP_NAME' içinde ' - ' ile ayrık gelir (nba_api formatı)
        names = [n.strip() for n in str(lu.get("GROUP_NAME", "")).split(" - ")]
        archs = [player_arch.get(n) for n in names if player_arch.get(n)]
        w = lu["MIN"]
        for a, b in combinations(sorted(set(archs)), 2):
            pair_succ[(a, b)] += lu["success"] * w
            pair_wt[(a, b)] += w
        for a in archs:  # köşegen: aynı arketipten iki oyuncu
            if archs.count(a) >= 2:
                pair_succ[(a, a)] += lu["success"] * w
                pair_wt[(a, a)] += w

    arts = sorted({a for pair in pair_succ for a in pair})
    M = pd.DataFrame(np.nan, index=arts, columns=arts)
    for (a, b), s in pair_succ.items():
        v = s / pair_wt[(a, b)] if pair_wt[(a, b)] else np.nan
        M.loc[a, b] = round(v, 3); M.loc[b, a] = round(v, 3)
    return M


def best_duos(duos: pd.DataFrame, player_arch: dict, top_n: int = 30) -> pd.DataFrame:
    """İKİNCİL: en iyi oyuncu ikilileri + arketip etiketleriyle.
    duos: iki-adam kombinasyon tablosu (oyuncu1, oyuncu2, MIN, NET_RATING...)."""
    duos = duos[duos["MIN"] >= MIN_DUO_MINUTES].copy()
    duos["success"] = duos.apply(composite_success, axis=1)
    duos["arch1"] = duos["PLAYER1_NAME"].map(player_arch)
    duos["arch2"] = duos["PLAYER2_NAME"].map(player_arch)
    duos["arch_pair"] = duos.apply(
        lambda r: " + ".join(sorted([str(r["arch1"]), str(r["arch2"])])), axis=1)
    return duos.sort_values("success", ascending=False).head(top_n)[
        ["PLAYER1_NAME","PLAYER2_NAME","arch_pair","MIN","NET_RATING","success"]]


if __name__ == "__main__":
    print("Aşama 5 iskeleti. Gerçek lineup verisi çekildikten sonra Claude Code ile koşulacak.")
    print("Gerekli girdiler: data/<season>__lineups.parquet, player_archetypes.parquet,")
    print("ve takım playoff/regular win% tablosu.")
