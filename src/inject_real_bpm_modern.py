"""
G2 fix — modern sezonlara gerçek B-Ref BPM enjekte et (G1'in paraleli).

Modern merged'de compute_bpm PROXY var (scrublara +22 BPM veriyor, bozuk).
bref_advanced'te GERÇEK BPM mevcut. Bunu isimle eşleyip PROXY'nin yerine koyar,
sonra build_score_table ile yeniden skorlar → modern overall düzelir.

Çalıştır:  python src/inject_real_bpm_modern.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import pandas as pd  # noqa: E402
from score_compat import build_score_table  # noqa: E402

SEASONS = ["2016-17", "2017-18", "2018-19", "2021-22", "2022-23", "2023-24"]


def main():
    for s in SEASONS:
        merged_p = ROOT / "data" / f"{s}__merged.parquet"
        bref_p = ROOT / "data" / f"{s}__bref_advanced.parquet"
        m = pd.read_parquet(merged_p)
        if bref_p.exists():
            b = pd.read_parquet(bref_p, columns=["PLAYER_NAME", "BPM"]).drop_duplicates("PLAYER_NAME")
            m = m.drop(columns=["BPM", "OBPM", "DBPM"], errors="ignore")
            m = m.merge(b, on="PLAYER_NAME", how="left")
            m.to_parquet(merged_p)
            matched = int(m["BPM"].notna().sum())
            print(f"{s}: gerçek BPM eşlendi {matched}/{len(m)}  "
                  f"(en iyi: {m.loc[m['BPM'].idxmax(), 'PLAYER_NAME']}={m['BPM'].max():.1f})")
        else:
            print(f"{s}: bref_advanced YOK — proxy kaldı")
        st = build_score_table(s, "nba")
        st.to_parquet(ROOT / "data" / f"{s}__player_scores.parquet")
    print("\nYeniden skorlandı. Şimdi: python src/export_modern_backtest.py")


if __name__ == "__main__":
    main()
