# -*- coding: utf-8 -*-
"""Games by Primary Arch — uygulamanın (çapraz köken) API sözleşmesi.

RankIt uygulaması WebView'da https://localhost'tan çalışır; site ise API'ye
aynı kökenden gider. Rate limiter'ın 429'u CORS başlığı taşımazsa uygulama
429'u okuyamaz, "ağ hatası" görür ve Rewrite History'nin lig kurulumu
(frontend/src/game/leagueSim.js, 429'da Retry-After bekler) yeniden denemeden
düşer. CORS middleware'i bu yüzden en dışta olmalı.

Geçici DB; ağ yok.
"""
import os
import tempfile
from pathlib import Path

import pytest

_TMP_DB = Path(tempfile.mkdtemp()) / "games_cors.db"
os.environ.setdefault("DB_PATH", str(_TMP_DB))

ORIGIN = "https://localhost"


@pytest.fixture()
def client(monkeypatch):
    from fastapi.testclient import TestClient
    import api.main as M
    M._RL.clear()
    with TestClient(M.app) as c:
        yield c, M
    M._RL.clear()


def test_rate_limited_response_carries_cors_headers(client, monkeypatch):
    c, M = client
    monkeypatch.setattr(M, "RL_LIMIT", 0)          # ilk istek bile sınırı aşsın
    r = c.get("/api/game/seasons", headers={"Origin": ORIGIN})
    assert r.status_code == 429
    assert r.headers.get("access-control-allow-origin") in ("*", ORIGIN)
    assert r.headers.get("retry-after") == str(M.RL_WINDOW)


def test_preflight_is_answered_before_the_rate_limiter(client, monkeypatch):
    c, M = client
    monkeypatch.setattr(M, "RL_LIMIT", 0)
    r = c.options("/api/game/score", headers={
        "Origin": ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") in ("*", ORIGIN)
    assert not any(M._RL.values())                  # preflight sayaca girmedi


def test_normal_cross_origin_get_still_allowed(client):
    c, _ = client
    r = c.get("/api/game/seasons", headers={"Origin": ORIGIN})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") in ("*", ORIGIN)
    assert r.headers.get("x-content-type-options") == "nosniff"
