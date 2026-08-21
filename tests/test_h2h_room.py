# -*- coding: utf-8 -*-
"""Kafa kafaya oda akışı — uçtan uca, sunucu kararıyla.

Oda modlarında sonuç SUNUCUDA çözülüyor: istemci yalnız oyuncu kimliklerini
gönderiyor, kalite/kimya/eleme burada hesaplanıyor. Sebebi basit — sonucu
istemcide hesaplamak, oyuncunun kendi skorunu bildirmesi demek.

Bu test o güveni sınıyor: gönderilen kadro gerçekten kurallara karşı
doğrulanıyor mu, yoksa "11 tane var, tamam" mı deniyor. Doğrulama eklenmeden
önce buradaki dört saldırının dördü de geçiyordu.

Geçici bir veritabanı kullanıyor (DB_PATH), kullanıcının kendi data/app.db'sine
dokunmuyor.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

# DB_PATH, api.db import edilirken okunuyor — client fixture'ından ÖNCE kurulmalı
_TMP_DB = Path(tempfile.mkdtemp(prefix="h2h_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

from football import draft_rules as R   # noqa: E402

SEASON = "2023-2024"


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def users():
    """İki test kullanıcısı + token. Gerçek kayıt akışından geçmiyoruz —
    testin konusu oda mantığı, parola politikası değil."""
    from api.auth import create_token
    from api.db import get_conn
    out = []
    with get_conn() as conn:
        for name in ("h2h_tester_1", "h2h_tester_2"):
            row = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
            if row:
                uid = row["id"]
            else:
                uid = conn.execute(
                    "INSERT INTO users (username, email, hashed_password, role) "
                    "VALUES (?,?,?,'user')",
                    (name, f"{name}@test.invalid", "x")).lastrowid
            out.append({"id": uid, "name": name,
                        "h": {"Authorization": "Bearer " + create_token(uid, "user")}})
    return out


@pytest.fixture(scope="module")
def squads():
    """İki gerçek kulüpten, kurallara uyan iki XI + oyuncu tablosu."""
    import pandas as pd
    p = ROOT / "data" / f"football__{SEASON}__scores.parquet"
    if not p.exists():
        pytest.skip(f"{p.name} yok")
    df = pd.read_parquet(p)
    df = df[df["primary_arch"].notna()]

    def build(team, shape):
        d = (df[df.TEAM == team].sort_values("MINUTES_TOTAL", ascending=False)
             .drop_duplicates("PLAYER_ID").to_dict("records"))
        used, xi = set(), []
        for s in R.slots_for(shape):
            cand = next((r for r in d if r["PLAYER_ID"] not in used and R.can_place(r, s)), None)
            if cand is None:
                return None, None
            used.add(cand["PLAYER_ID"])
            xi.append({"player_id": int(cand["PLAYER_ID"]), "season": SEASON, "slot": s["id"]})
        return xi, {int(r["PLAYER_ID"]): r for r in d}

    a, a_by = build("Arsenal", "4-3-3")
    b, b_by = build("Liverpool", "4-2-3-1")
    if not a or not b:
        pytest.skip("test kulüpleri için XI kurulamadı")
    return {"a": a, "a_by": a_by, "b": b, "b_by": b_by}


def _room(client, users):
    r = client.post("/api/football/h2h/room",
                    json={"mode": "friend", "season": SEASON}, headers=users[0]["h"])
    assert r.status_code == 200, r.text
    code = r.json()["room_code"]
    j = client.post(f"/api/football/h2h/room/{code}/join", headers=users[1]["h"])
    assert j.status_code == 200, j.text
    return code


def test_room_create_and_join(client, users):
    code = _room(client, users)
    r = client.get(f"/api/football/h2h/room/{code}", headers=users[0]["h"])
    assert r.status_code == 200
    assert r.json()["status"] == "building"


def test_third_player_cannot_join(client, users):
    """Oda iki kişilik. Üçüncüsü kapıdan dönmeli."""
    from api.auth import create_token
    from api.db import get_conn
    code = _room(client, users)
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM users WHERE username=?", ("h2h_tester_3",)).fetchone()
        uid = row["id"] if row else conn.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,'user')",
            ("h2h_tester_3", "t3@test.invalid", "x")).lastrowid
    h = {"Authorization": "Bearer " + create_token(uid, "user")}
    r = client.post(f"/api/football/h2h/room/{code}/join", headers=h)
    assert r.status_code == 409


@pytest.mark.parametrize("saldiri", ["kalecisiz", "ikiz", "sahte_slot", "yanlis_dizilis"])
def test_server_rejects_illegal_squads(client, users, squads, saldiri):
    """Doğrulamadan önce dördü de geçiyordu — sunucu yalnız sayıya bakıyordu."""
    code = _room(client, users)
    xi = [dict(e) for e in squads["a"]]
    shape = "4-3-3"

    if saldiri == "kalecisiz":
        fwd = next(r for r in squads["a_by"].values()
                   if r["POSITION"] == "ST" and int(r["PLAYER_ID"]) not in
                   {e["player_id"] for e in xi})
        xi = [{**e, "player_id": int(fwd["PLAYER_ID"])} if e["slot"] == "GK" else e for e in xi]
    elif saldiri == "ikiz":
        xi = [*xi[:-1], {**xi[-1], "player_id": xi[1]["player_id"]}]
    elif saldiri == "sahte_slot":
        xi = [*xi[:-1], {**xi[-1], "slot": "LIBERO"}]
    elif saldiri == "yanlis_dizilis":
        shape = "3-5-2"

    r = client.post(f"/api/football/h2h/room/{code}/squad",
                    json={"entries": xi, "shape": shape, "name": "Attacker"},
                    headers=users[0]["h"])
    assert r.status_code == 400, f"{saldiri} kabul edildi: {r.text[:200]}"


def test_shape_is_required(client, users, squads):
    """Doğrulamayı atlamak isteyen istek gövdede shape'i hiç göndermez."""
    code = _room(client, users)
    r = client.post(f"/api/football/h2h/room/{code}/squad",
                    json={"entries": squads["a"]}, headers=users[0]["h"])
    assert r.status_code == 422


def test_full_tie_resolves_server_side(client, users, squads):
    code = _room(client, users)

    r1 = client.post(f"/api/football/h2h/room/{code}/squad",
                     json={"entries": squads["a"], "shape": "4-3-3", "name": "Arsenal XI"},
                     headers=users[0]["h"])
    assert r1.status_code == 200, r1.text
    # Rakip kadrosunu göndermeden sonuç OLMAMALI
    assert r1.json().get("result") in (None, {}), "tek taraflıyken sonuç üretildi"

    r2 = client.post(f"/api/football/h2h/room/{code}/squad",
                     json={"entries": squads["b"], "shape": "4-2-3-1", "name": "Liverpool XI"},
                     headers=users[1]["h"])
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["status"] == "resolved"

    res = body["result"]
    assert res["winner"] in ("a", "b")
    assert len(res["legs"]) == 2
    for leg in res["legs"]:
        assert leg["hg"] >= 0 and leg["ag"] >= 0
    assert res["decidedBy"] in ("aggregate", "extra time", "penalties")


def test_result_is_stable_across_reads(client, users, squads):
    """Sonuç bir kez üretilip saklanıyor — yenilemek zar atmamalı."""
    code = _room(client, users)
    client.post(f"/api/football/h2h/room/{code}/squad",
                json={"entries": squads["a"], "shape": "4-3-3"}, headers=users[0]["h"])
    client.post(f"/api/football/h2h/room/{code}/squad",
                json={"entries": squads["b"], "shape": "4-2-3-1"}, headers=users[1]["h"])
    first = client.get(f"/api/football/h2h/room/{code}", headers=users[0]["h"]).json()["result"]
    for _ in range(3):
        again = client.get(f"/api/football/h2h/room/{code}", headers=users[1]["h"]).json()["result"]
        assert again == first, "aynı oda farklı sonuç döndürdü"


def test_opponent_squad_hidden_until_both_sent(client, users, squads):
    """İkinci oyuncu birincinin kadrosuna bakarak kuramamalı."""
    code = _room(client, users)
    client.post(f"/api/football/h2h/room/{code}/squad",
                json={"entries": squads["a"], "shape": "4-3-3"}, headers=users[0]["h"])
    seen = client.get(f"/api/football/h2h/room/{code}", headers=users[1]["h"]).json()
    blob = str(seen)
    leaked = [str(e["player_id"]) for e in squads["a"] if str(e["player_id"]) in blob]
    assert not leaked, f"rakip kadrosu sızdı: {leaked[:3]}"


def test_position_penalty_reaches_the_score(client, users, squads):
    """Aynı oyuncular, biri kurallara uygun biri kötü yerleştirilmiş: sunucunun
    verdiği kalite farklı olmalı. Öncesinde sunucu slotları hiç bilmediği için
    ikisi de aynı skoru alıyordu."""
    import json as _json
    from api.db import get_conn

    def quality_for(xi, shape, by_id):
        code = _room(client, users)
        r = client.post(f"/api/football/h2h/room/{code}/squad",
                        json={"entries": xi, "shape": shape}, headers=users[0]["h"])
        assert r.status_code == 200, r.text
        with get_conn() as conn:
            row = conn.execute("SELECT p1_squad_json FROM football_h2h_rooms WHERE room_code=?",
                               (code,)).fetchone()
        return _json.loads(row["p1_squad_json"])["side"]["quality"]

    good = quality_for(squads["a"], "4-3-3", squads["a_by"])

    # Aynı on bir kişi, saha oyuncuları ters yüz edilmiş sırada
    xi = [dict(e) for e in squads["a"]]
    outfield = [e for e in xi if e["slot"] != "GK"]
    ids = [e["player_id"] for e in outfield][::-1]
    shuffled = [xi[0]] + [{**e, "player_id": i} for e, i in zip(outfield, ids)]
    bad = quality_for(shuffled, "4-3-3", squads["a_by"])

    assert bad < good, f"kötü yerleşim cezalanmadı ({bad} >= {good})"
