# -*- coding: utf-8 -*-
"""Yer tutucu kulup rengi -- sahibin karari (2026-09-21): 12 renkli palet.

Kaynakta gercek renk olmayan kulupler (FotMob lig/takim uclari, EuroLeague)
bu paletten KARARLI bir renk alir. Palet tasarimin anlamli token'larini
kulup rengi diye dagitmamali: eski palet 169 futbol kulubunu altin
(#FFB11B) yapiyordu ve kartlarda altin butcesini (BUILD §1.2) bozuyordu.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import rankit_sync  # noqa: E402

# BUILD §1 token'lari: altin ailesi, positive, isi rampasi, zemin/yuzey/murekkep,
# ve Primary Arch'in yalnizca kendi isaretinde yasayan teal'i (§7.1).
DESIGN_TOKENS = {
    "#FFB11B", "#FFE9B0", "#E08F00", "#8A6A12", "#17120A",
    "#3FB08C",
    "#2F5480", "#5B4FA8", "#9A3F96", "#D43A63", "#F5402E",
    "#090A0B", "#121315", "#151618", "#1A1B1E",
    "#ECEDED", "#C9CCCD", "#9AA0A6", "#7F868B", "#4D5256",
    "#00A3AF",
}


def test_palette_has_twelve_distinct_hex_colours():
    palette = rankit_sync.CLUB_PALETTE
    assert len(palette) == 12 and len({c.upper() for c in palette}) == 12
    assert all(re.fullmatch(r"#[0-9A-Fa-f]{6}", c) for c in palette)


def test_palette_never_hands_out_a_design_token():
    assert not {c.upper() for c in rankit_sync.CLUB_PALETTE} & DESIGN_TOKENS


def test_colour_is_stable_per_club_and_uses_the_whole_palette():
    assert rankit_sync._color("Borussia Dortmund") == rankit_sync._color("Borussia Dortmund")
    used = {rankit_sync._color(f"Club {i}") for i in range(600)}
    assert used == set(rankit_sync.CLUB_PALETTE)



def test_startup_recolours_only_fabricated_colours(tmp_path, monkeypatch):
    """Eski uydurma renk yeni palete tasinir; gercek renk ve tekrar calistirma
    hicbir seyi degistirmez."""
    import api.db as DB
    from api.rankit_colors import club_color, legacy_club_color

    monkeypatch.setattr(DB, "DB_PATH", tmp_path / "colors.db")
    DB.init_db()
    fake, real = "Relegated FC", "Boston Celtics"
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_teams(sport,name,short_name,color) VALUES('Football',?,?,?)",
                  (fake, "REL", legacy_club_color(fake)))
        c.execute("INSERT INTO rankit_teams(sport,name,short_name,color) VALUES('Basketball',?,?,?)",
                  (real, "BOS", "#007A33"))
    for _ in range(2):                      # ikinci acilis: idempotent
        DB.init_db()
        with DB.get_conn() as c:
            colours = dict(c.execute("SELECT name,color FROM rankit_teams WHERE name IN (?,?)",
                                     (fake, real)).fetchall())
        assert colours == {fake: club_color(fake), real: "#007A33"}
