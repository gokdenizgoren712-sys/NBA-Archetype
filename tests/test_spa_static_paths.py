# -*- coding: utf-8 -*-
"""SPA yedek yolu yalnız frontend/dist İÇİNDEKİ dosyaları sunar.

api/main.py _spa_file: istenen yol çözülüp dist altında kaldığı doğrulanır;
dışarıyı gösteren her yol (.., %2F ile kodlanmış .., mutlak yol, dist'ten
dışarı symlink) index.html'e düşer. Geçici dizin; ağ yok.
"""
import os
import tempfile
from pathlib import Path

import pytest

_TMP_DB = Path(tempfile.mkdtemp()) / "spa_paths.db"
os.environ.setdefault("DB_PATH", str(_TMP_DB))


@pytest.fixture()
def layout(tmp_path):
    dist = tmp_path / "frontend" / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html>index")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    secret = tmp_path / "data" / "app.db"
    secret.parent.mkdir()
    secret.write_text("users")
    return dist, secret


def _pick(dist, path):
    from api.main import _spa_file
    return _spa_file(dist, path)


def test_files_inside_dist_are_served(layout):
    dist, _ = layout
    assert _pick(dist, "assets/app.js") == (dist / "assets" / "app.js").resolve()
    assert _pick(dist, "favicon.svg") == (dist / "favicon.svg").resolve()


def test_client_routes_fall_back_to_index(layout):
    dist, _ = layout
    for p in ("", "rankit", "basketball/game", "assets", "assets/", "nope.js"):
        assert _pick(dist, p) == dist / "index.html", p


@pytest.mark.parametrize("path", [
    "../../data/app.db",            # "/..%2F..%2Fdata%2Fapp.db" uvicorn'da böyle çözülür
    "../data/app.db",
    "assets/../../../data/app.db",
    "/etc/hostname",                # "//etc/hostname" → mutlak yol
    "//etc/hostname",
    "\x00",
])
def test_paths_outside_dist_never_served(layout, path):
    dist, secret = layout
    got = _pick(dist, path)
    assert got == dist / "index.html"
    assert got.resolve() != secret.resolve()


def test_symlink_out_of_dist_is_not_followed(layout):
    dist, secret = layout
    link = dist / "leak.db"
    try:
        link.symlink_to(secret)
    except (OSError, NotImplementedError):
        pytest.skip("symlink desteklenmiyor")
    assert _pick(dist, "leak.db") == dist / "index.html"
