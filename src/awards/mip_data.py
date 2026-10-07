# -*- coding: utf-8 -*-
"""MIP (Most Improved Player) veri seti: sezon t−1 sonundaki bilgiyle sezon t oylama payını tahmin etmek için satırlar.

Her satır = bir oyuncunun t−1 sezonu (özellikler) + t sezonundaki MIP oy payı (etiket). Sızıntı yok: özellikler t−1 ve öncesi.
Kaynaklar (hepsi yerel parquet): `{sezon}__bref_age`, `__bref_advanced`, `__bref_pergame` (B-Ref), `awards__mip_{sezon}`.

Özellik tasarımı (docs/FANTASY_PLAN.md değil, bu dosya): dakika ve rol FİLTRESİ YOK. Güvenilirlik ağırlığı `RELIAB = MP / (MP + K)`:
az dakika oynayanın artışı sönümlenir, ama satır silinmez. Seviye ve değişim ölçüleri sezon içi persantil olarak da verilir
(dönemler arası taşınabilirlik: 1986'nın 'yüksek kullanım'ı ile 2025'inki aynı şey değil).
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
MAX_GAP = 3                 # en çok kaç yıl geriye bakılır (Avrupa / sakatlık dönüşü)
MIN_GAP_MP = 300            # boşluklu oyuncunun son sezonunda en az bu kadar dakika
RELIAB_K = 800.0            # MP / (MP + K): ~800 dk'da güvenilirlik 0.5
FIRST_FEATURE_END_YEAR = 1984        # 1983-84
MULTI_TEAM = re.compile(r"^(TOT|\d+TM)$")


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[2:]}"


def _one_row_per_slug(df: pd.DataFrame) -> pd.DataFrame:
    """Takas edilen oyuncunun takım satırları + toplam satırı var: en çok maçı olan (toplam) satırı tut."""
    return df.sort_values("GP", ascending=False).drop_duplicates("SLUG").reset_index(drop=True)


def season_frame(end_year: int) -> pd.DataFrame:
    """Bir sezonun oyuncu tablosu (SLUG anahtarlı): yaş, dakika, kullanım ve gelişmiş ölçüler, 36 dakikaya göre üretim."""
    s = season_label(end_year)
    age = pd.read_parquet(DATA / f"{s}__bref_age.parquet").rename(columns={"BREF_SLUG": "SLUG", "MP": "MP_age"})
    adv = pd.read_parquet(DATA / f"{s}__bref_advanced.parquet")
    pg = pd.read_parquet(DATA / f"{s}__bref_pergame.parquet")
    pg["SLUG"] = pg["BREF_SLUG"].astype(str).str.split("/").str[-1]
    age = _one_row_per_slug(age)
    adv = adv.merge(age[["SLUG", "PLAYER_NAME", "TEAM_ABBREVIATION", "GP"]], on=["PLAYER_NAME", "TEAM_ABBREVIATION", "GP"], how="inner")
    adv = _one_row_per_slug(adv)
    pg = _one_row_per_slug(pg)
    keep_adv = ["SLUG", "MP", "BPM", "OBPM", "DBPM", "VORP", "WS", "WS48", "TS_PCT_bref", "USG_PCT_bref", "AST_PCT_bref", "TRB_PCT_bref", "TOV_PCT_bref"]
    keep_pg = ["SLUG", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FGA", "FG3A", "FTA"]
    df = (age[["SLUG", "PLAYER_NAME", "TEAM_ABBREVIATION", "AGE", "GP"]]
          .merge(adv[keep_adv], on="SLUG", how="left").merge(pg[keep_pg], on="SLUG", how="left"))
    df = df.rename(columns={"MIN": "MPG", "USG_PCT_bref": "USG", "TS_PCT_bref": "TS", "AST_PCT_bref": "AST_PCT", "TRB_PCT_bref": "TRB_PCT", "TOV_PCT_bref": "TOV_PCT"})
    df["MP"] = df["MP"].fillna(df["MPG"] * df["GP"])
    mpg = df["MPG"].where(df["MPG"] > 0)
    for c in ("PTS", "REB", "AST", "STL", "BLK", "TOV", "FGA", "FG3A", "FTA"):
        df[f"{c}36"] = df[c] / mpg * 36.0
    df["RELIAB"] = df["MP"] / (df["MP"] + RELIAB_K)
    df["SEASON"] = s
    df["END_YEAR"] = end_year
    return df


# Düzey / değişim ölçüleri (sezon içi persantili de alınır)
LEVEL = ["MPG", "MP", "USG", "TS", "AST_PCT", "TRB_PCT", "BPM", "VORP", "WS48", "PTS36", "AST36", "REB36"]
DELTA = ["MPG", "USG", "TS", "BPM", "PTS36", "AST36", "WS48"]


def _pct_within(df: pd.DataFrame, col: str) -> pd.Series:
    """Sezon içi persantil (dakika ağırlıksız; 100 dk altı oyuncular dağılımı bozmasın diye onlar hesaba girmez ama kendileri persantil alır)."""
    ref = df.loc[df["MP"] >= 100, col].dropna().to_numpy()
    if len(ref) < 20:
        return pd.Series(np.nan, index=df.index)
    ref = np.sort(ref)
    return pd.Series(np.searchsorted(ref, df[col].to_numpy(), side="right") / len(ref), index=df.index).where(df[col].notna())


def mip_shares() -> pd.DataFrame:
    p = DATA / "awards__mip_voting.parquet"
    if p.exists():
        return pd.read_parquet(p)
    frames = [pd.read_parquet(f) for f in sorted(DATA.glob("awards__mip_????-??.parquet"))]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


TEAM_MP = 19680.0           # bir takımın sezonluk toplam oyuncu dakikası (240 × 82)


def team_rows(end_year: int) -> pd.DataFrame:
    """(SLUG, TEAM, MP) — takım başına satırlar; çok-takımlı toplam satırları (TOT / 2TM ...) hariç."""
    try:
        a = pd.read_parquet(DATA / f"{season_label(end_year)}__bref_age.parquet")
    except FileNotFoundError:
        return pd.DataFrame(columns=["SLUG", "TEAM", "MP"])
    a = a.rename(columns={"BREF_SLUG": "SLUG", "TEAM_ABBREVIATION": "TEAM"})
    return a[~a["TEAM"].astype(str).str.match(MULTI_TEAM)][["SLUG", "TEAM", "MP"]].dropna(subset=["MP"])


def main_team(rows: pd.DataFrame) -> pd.Series:
    """Oyuncunun o sezon en çok dakika oynadığı takım."""
    return rows.sort_values("MP", ascending=False).drop_duplicates("SLUG").set_index("SLUG")["TEAM"]


def team_share_features(base_year: int, slugs: pd.Series) -> pd.DataFrame:
    """Oyuncunun kendi takımındaki rolü (t−1): dakika payı ve takım içi dakika sırası. Takas edilenler için en çok dakika oynadığı takım."""
    rb = team_rows(base_year)
    if rb.empty:
        return pd.DataFrame({"TEAM_SHARE": np.nan, "TEAM_RANK": np.nan}, index=range(len(slugs)))
    rb = rb.sort_values("MP", ascending=False).drop_duplicates("SLUG")
    tot = rb.groupby("TEAM")["MP"].transform("sum")
    rb["TEAM_SHARE"] = rb["MP"] / tot
    rb["TEAM_RANK"] = rb.groupby("TEAM")["MP"].rank(ascending=False, method="first")
    m = rb.set_index("SLUG")[["TEAM_SHARE", "TEAM_RANK"]]
    return pd.DataFrame({"TEAM_SHARE": slugs.map(m["TEAM_SHARE"]).to_numpy(), "TEAM_RANK": slugs.map(m["TEAM_RANK"]).to_numpy()})


def role_change_features(base_year: int, t: int, slugs: pd.Series) -> pd.DataFrame:
    """Takım bağlamı değişimi (bizim bağlam katmanımızın tarihsel karşılığı). t sezonunun kadro üyeliği sezon öncesi bilinen bilgidir
    (yaz transferleri); yalnız üyelik kullanılır, performans değil. Sezon ortası takaslar küçük bir sızıntıdır (dokümante)."""
    rb, rt = team_rows(base_year), team_rows(t)
    tb, tt = main_team(rb), main_team(rt)
    out = pd.DataFrame({"SLUG": slugs.to_numpy()})
    out["T_BASE"], out["T_NEXT"] = out["SLUG"].map(tb), out["SLUG"].map(tt)
    out["MOVED"] = ((out["T_BASE"] != out["T_NEXT"]) & out["T_BASE"].notna() & out["T_NEXT"].notna()).astype(float)
    # ayrılan dakika: eski takımda oynayıp t'de aynı takımda olmayanların dakikası (kendisi hariç)
    rb = rb.assign(TB=rb["SLUG"].map(tb), TN=rb["SLUG"].map(tt))
    rb = rb[rb["TEAM"] == rb["TB"]]
    leaving = rb[rb["TN"] != rb["TB"]].groupby("TB")["MP"].sum()
    own = rb.set_index("SLUG")["MP"]
    out["VAC"] = ((out["T_BASE"].map(leaving).fillna(0.0) - np.where(out["MOVED"] > 0, out["SLUG"].map(own).fillna(0.0), 0.0)) / TEAM_MP).clip(lower=0)
    # gelen dakika: t'de bu takıma katılıp önceki sezon başka takımda (ya da başka yerde) oynayanların dakikası
    mb = rb.set_index("SLUG")["MP"]
    arrivals = pd.DataFrame({"SLUG": tt.index, "TN": tt.values})
    arrivals["TB"] = arrivals["SLUG"].map(tb)
    arrivals = arrivals[arrivals["TB"] != arrivals["TN"]]
    arrivals["MPB"] = arrivals["SLUG"].map(mb).fillna(0.0)
    arr = arrivals.groupby("TN")["MPB"].sum()
    out["ARR"] = (out["T_NEXT"].map(arr).fillna(0.0) / TEAM_MP).clip(upper=1.0)
    return out[["MOVED", "VAC", "ARR"]]


def build(first_target: int = 1986, last_target: int = 2027, include_unlabeled_last: bool = True) -> pd.DataFrame:
    """Satır: (SLUG, hedef sezon t). Özellikler t−1'den; etiket t'nin MIP payı (oylamada yoksa 0). Etiketsiz son hedef
    (henüz oynanmamış sezon) tahmin için tutulur (`LABELED` = 0)."""
    frames: dict[int, pd.DataFrame] = {}
    for y in range(FIRST_FEATURE_END_YEAR, last_target + 1):
        try:
            frames[y] = season_frame(y)
        except FileNotFoundError:
            continue
    votes = mip_shares()
    vote_seasons = set(votes["SEASON"].unique()) if len(votes) else set()
    out = []
    pct_cache: dict[int, pd.DataFrame] = {}
    lookup = lambda f, cols: (f.set_index("SLUG")[cols] if f is not None else pd.DataFrame(columns=cols))     # noqa: E731
    for t in range(first_target, last_target + 1):
        covered: set = set()
        # Her oyuncu için t'den önceki EN SON NBA sezonu (en çok MAX_GAP yıl geriye). Avrupa'ya giden / sakatlıktan dönen oyuncu
        # (ör. Isaac Austin 1997: iki yıl Avrupa) bir önceki sezonu olmadığı için kaybolmasın; GAP özelliği aradaki yılı söyler.
        for gap in range(0, MAX_GAP + 1):
            y = t - 1 - gap
            base = frames.get(y)
            if base is None:
                continue
            if y not in pct_cache:
                b = base.copy()
                for c in LEVEL:
                    b[f"{c}_pct"] = _pct_within(b, c)
                pct_cache[y] = b
            cur = pct_cache[y]
            cur = cur[~cur["SLUG"].isin(covered)]
            if gap > 0:
                cur = cur[cur["MP"] >= MIN_GAP_MP]                  # yıllardır yok olan bir oyuncu havuzu şişirmesin: gerçekten oynamış olanlar
            if cur.empty:
                continue
            covered |= set(cur["SLUG"])
            cur = cur.copy()
            cur["GAP"] = gap
            cur["AGE"] = cur["AGE"] + gap                           # t−1 sezonundaki yaş
            p1 = lookup(frames.get(y - 1), list(dict.fromkeys(DELTA + ["MP", "BPM", "VORP"]))).add_suffix("_p1")
            p2 = lookup(frames.get(y - 2), list(dict.fromkeys(DELTA + ["MP"]))).add_suffix("_p2")
            d = cur.join(p1, on="SLUG").join(p2, on="SLUG")
            nxt = frames.get(t)                                      # t sezonunun gerçekleşen değerleri: yalnız Aşama A'nın EĞİTİM hedefi
            if nxt is not None:
                nx = lookup(nxt, ["MP", "MPG", "GP", "BPM", "VORP", "WS48", "PTS", "PTS36", "USG"]).add_suffix("_n")
                d = d.join(nx, on="SLUG")
            for c in DELTA:
                d[f"d_{c}"] = d[c] - d[f"{c}_p1"]                   # son sezon değişimi
                d[f"d2_{c}"] = d[c] - d[f"{c}_p2"]                  # iki yıllık değişim
            d["HAS_PREV"] = d["MP_p1"].notna().astype(float)
            rc = role_change_features(y, t, d["SLUG"].reset_index(drop=True))
            d = d.reset_index(drop=True)
            for c in ("MOVED", "VAC", "ARR"):
                d[c] = rc[c].to_numpy()
            ts_ = team_share_features(y, d["SLUG"].reset_index(drop=True))
            d["TEAM_SHARE"], d["TEAM_RANK"] = ts_["TEAM_SHARE"].to_numpy(), ts_["TEAM_RANK"].to_numpy()
            d["TARGET_SEASON"] = season_label(t)
            out.append(d)
    ds = pd.concat(out, ignore_index=True)

    # Tarihçe: tepe seviye, kıdem, önceki MIP payı (yalnız t−1 ve öncesi)
    hist = pd.concat([f[["SLUG", "END_YEAR", "MP", "BPM", "VORP", "WS48"]] for f in frames.values()], ignore_index=True)
    hist = hist.sort_values(["SLUG", "END_YEAR"])
    g = hist.groupby("SLUG")
    hist["PEAK_VORP"] = g["VORP"].cummax()
    hist["PEAK_BPM"] = hist["BPM"].where(hist["MP"] >= 500).groupby(hist["SLUG"]).cummax()
    hist["SEASONS"] = g.cumcount() + 1
    ds = ds.merge(hist[["SLUG", "END_YEAR", "PEAK_VORP", "PEAK_BPM", "SEASONS"]], on=["SLUG", "END_YEAR"], how="left")
    if len(votes):
        v = votes.assign(END_YEAR=votes["SEASON"].str[:4].astype(int) + 1)
        prior = v.groupby("BREF_SLUG").apply(lambda x: x.set_index("END_YEAR")["SHARE"].to_dict(), include_groups=False).to_dict()
        ds["PRIOR_MIP_MAX"] = [max([s for y, s in prior.get(sl, {}).items() if y <= ey] or [0.0]) for sl, ey in zip(ds["SLUG"], ds["END_YEAR"])]
        key = votes.rename(columns={"BREF_SLUG": "SLUG", "SEASON": "TARGET_SEASON"})[["SLUG", "TARGET_SEASON", "SHARE", "WINNER", "RANK", "PTS_WON"]]
        ds = ds.merge(key, on=["SLUG", "TARGET_SEASON"], how="left")
        ds["LABELED"] = ds["TARGET_SEASON"].isin(vote_seasons).astype(int)
        ds["SHARE"] = ds["SHARE"].fillna(0.0)
        ds["WINNER"] = ds["WINNER"].fillna(0).astype(int)
    return ds


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    d = build()
    out = DATA / "awards__mip_dataset.parquet"
    d.to_parquet(out)
    print(out.name, d.shape, "etiketli sezon", d.loc[d["LABELED"] == 1, "TARGET_SEASON"].nunique() if "LABELED" in d else "-")
