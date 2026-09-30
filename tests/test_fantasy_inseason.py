# -*- coding: utf-8 -*-
"""Faz 4 — sezon içi projeksiyon güncelleme ve günlük yayın betiği."""

import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from src.fantasy import inseason as ins  # noqa: E402
from src.fantasy import update as upd  # noqa: E402

PRE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
needs_pre = pytest.mark.skipif(not PRE.exists(), reason="cache'lenmiş projeksiyon yok")


def _logs(pid: int, team: str, n: int, mins: float, pts: float, start: int = 0) -> pd.DataFrame:
    rows = []
    for g in range(n):
        rows.append({"PLAYER_ID": pid, "TEAM_ABBREVIATION": team, "GAME_ID": f"{team}{start + g}",
                     "GAME_DATE": f"2026-10-{(start + g) % 28 + 1:02d}", "MIN": mins, "PTS": pts, "REB": 5, "OREB": 1,
                     "DREB": 4, "AST": 3, "STL": 1, "BLK": 0.5, "TOV": 2, "FG3M": 2, "FG3A": 5, "FGA": 12, "FGM": 6,
                     "FTA": 4, "FTM": 3, "PF": 2, "DD2": 0, "TD3": 0})
    return pd.DataFrame(rows)


def _base() -> pd.DataFrame:
    return pd.DataFrame([
        {"PLAYER_ID": 1, "TEAM": "AAA", "PROJ_MPG": 30.0, "PROJ_GP": 70.0, "PTS": 18.0, "REB": 5.0, "OREB": 1.0, "DREB": 4.0,
         "AST": 4.0, "STL": 1.0, "BLK": 0.5, "TOV": 2.0, "FG3M": 2.0, "FG3A": 5.0, "FGA": 13.0, "FTA": 4.0, "PF": 2.0,
         "FG%": 0.46, "FT%": 0.80, "FGM": 6.0, "FTM": 3.2, "DD2": 0.05, "TD3": 0.0, "SD_PTS": 6.0, "SD_REB": 2.5},
        {"PLAYER_ID": 2, "TEAM": "AAA", "PROJ_MPG": 20.0, "PROJ_GP": 60.0, "PTS": 8.0, "REB": 3.0, "OREB": 1.0, "DREB": 2.0,
         "AST": 2.0, "STL": 0.5, "BLK": 0.2, "TOV": 1.0, "FG3M": 1.0, "FG3A": 3.0, "FGA": 7.0, "FTA": 2.0, "PF": 2.0,
         "FG%": 0.44, "FT%": 0.75, "FGM": 3.1, "FTM": 1.5, "DD2": 0.0, "TD3": 0.0, "SD_PTS": 4.0, "SD_REB": 1.5}])


def test_no_games_means_no_change():
    base = _base()
    new = ins.update_projections(base, _logs(99, "AAA", 10, 30, 20))         # başka bir oyuncunun logları
    for c in ("PTS", "PROJ_MPG", "PROJ_GP", "FG%"):
        assert np.allclose(new[c], base[c])


def test_hot_start_pulls_rate_and_minutes_toward_the_evidence_but_not_all_the_way():
    base = _base()
    cur = pd.concat([_logs(1, "AAA", 15, 36, 30), _logs(2, "AAA", 15, 20, 8)])
    new = ins.update_projections(base, cur).set_index("PLAYER_ID")
    p1 = new.loc[1]
    assert 18.0 < p1["PTS"] < 42.0
    assert 30.0 < p1["PROJ_MPG"] < 36.0                       # ön bilgi (4 maç) hâlâ biraz ağırlıklı
    assert abs(new.loc[2, "PTS"] - 8.0) < 0.6                 # gözlemi ön bilgiyle uyumlu oyuncu neredeyse hiç kaymaz


def test_more_evidence_moves_the_projection_further():
    base = _base()
    few = ins.update_projections(base, _logs(1, "AAA", 5, 36, 30)).set_index("PLAYER_ID").loc[1, "PTS"]
    many = ins.update_projections(base, _logs(1, "AAA", 40, 36, 30)).set_index("PLAYER_ID").loc[1, "PTS"]
    assert 18.0 < few < many


def test_games_played_bounds_and_availability():
    base = _base()
    cur = pd.concat([_logs(1, "AAA", 20, 30, 18), _logs(2, "AAA", 4, 20, 8)])    # takım 20 maç oynadı; 2. oyuncu 4'üne çıktı
    new = ins.update_projections(base, cur).set_index("PLAYER_ID")
    assert 20 <= new.loc[1, "PROJ_GP"] <= 82
    assert new.loc[2, "PROJ_GP"] < base.set_index("PLAYER_ID").loc[2, "PROJ_GP"]  # 20 maçın 4'ünde oynadı → oran düşer
    assert list(new["INSEASON_GP"]) == [20, 4]


def test_update_is_idempotent_from_the_same_base_and_logs():
    base = _base()
    cur = pd.concat([_logs(1, "AAA", 12, 33, 22), _logs(2, "AAA", 12, 18, 6)])
    a, b = upd.refresh_projections(cur, base), upd.refresh_projections(cur, base)
    cols = [c for c in a.columns if c != "BUILT_AT"]
    pd.testing.assert_frame_equal(a[cols], b[cols])
    assert a["INSEASON_AS_OF"].iloc[0] == str(cur["GAME_DATE"].max())


def test_traded_player_takes_the_new_team():
    new = ins.update_projections(_base(), _logs(1, "BBB", 6, 30, 18))
    assert new.set_index("PLAYER_ID").loc[1, "TEAM"] == "BBB"


@needs_pre
def test_real_projection_table_updates_without_schema_change():
    base = pd.read_parquet(PRE)
    if "INSEASON_AS_OF" in base.columns:
        pytest.skip("yayındaki dosya zaten güncellenmiş")
    gl = ROOT / "data" / "2025-26__player_gamelogs.parquet"
    if not gl.exists():
        pytest.skip("maç logları yok")
    logs = pd.read_parquet(gl)
    cur = logs[logs["GAME_DATE"] <= sorted(logs["GAME_DATE"].unique())[25]]
    new = upd.refresh_projections(cur, base)
    assert set(base.columns) <= set(new.columns) and len(new) == len(base)
    assert new[["PTS", "REB", "AST", "PROJ_MPG", "PROJ_GP"]].notna().all().all()
    assert (new["PROJ_GP"] <= 82).all() and (new["PROJ_GP"] >= new["INSEASON_GP"]).all()


def _run(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


def test_publish_sends_only_the_data_file_and_never_local_commits(tmp_path):
    """Geçici origin: yerel, gönderilmemiş commit yayına gitmemeli; çalışma dizini bozulmamalı."""
    origin, work = tmp_path / "origin.git", tmp_path / "work"
    _run(tmp_path, "init", "--bare", "-b", "main", str(origin))
    _run(tmp_path, "clone", str(origin), str(work))
    for k, v in (("user.email", "t@t"), ("user.name", "t")):
        _run(work, "config", k, v)
    (work / "data").mkdir()
    (work / "data" / "proj.parquet").write_bytes(b"v1")
    _run(work, "add", "-f", ".")
    _run(work, "commit", "-m", "init")
    _run(work, "push", "origin", "HEAD:main")
    (work / "secret.txt").write_text("unreviewed", encoding="utf-8")               # yerel, GÖNDERİLMEMİŞ commit
    _run(work, "add", "secret.txt")
    _run(work, "commit", "-m", "local only")
    (work / "data" / "proj.parquet").write_bytes(b"v2")
    assert upd.publish([work / "data" / "proj.parquet"], "data v2", root=work) is True
    shown = subprocess.run(["git", "--git-dir", str(origin), "show", "main:data/proj.parquet"], capture_output=True).stdout
    assert shown == b"v2"
    files = subprocess.run(["git", "--git-dir", str(origin), "ls-tree", "-r", "--name-only", "main"],
                           capture_output=True, text=True).stdout.split()
    assert "secret.txt" not in files
    assert (work / "secret.txt").exists() and (work / "data" / "proj.parquet").read_bytes() == b"v2"
    assert upd.publish([work / "data" / "proj.parquet"], "again", root=work) is False      # değişiklik yok
    assert not any(p.name.startswith("pa-fantasy-update-") for p in Path(tmp_path).iterdir())
