"""Guess odaları: oluştur, katıl, yalnız kendi sütununu yaz, kilit."""
import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import api.db as dbmod
    import api.guess as guess
    monkeypatch.setattr(dbmod, "DB_PATH", tmp_path / "t.db")
    monkeypatch.setattr(guess, "_ready", False)
    monkeypatch.delenv("GUESS_LOCK_AT", raising=False)
    dbmod.init_db()
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(guess.router)
    return TestClient(app)


def test_create_join_and_own_column_only(client):
    r = client.post("/api/guess/rooms", json={"title": "Office", "members": [
        {"name": "Deniz", "picks": {"ou": {"NYK": "O", "XXX": "U"}, "champ": "OKC"}}]})
    assert r.status_code == 200
    room = r.json()
    rid, deniz = room["room_id"], room["members"][0]
    got = client.get(f"/api/guess/rooms/{rid}").json()
    assert got["members"][0]["picks"] == {"ou": {"NYK": "O"}, "champ": "OKC"}  # bilinmeyen takım atıldı

    ece = client.post(f"/api/guess/rooms/{rid}/members", json={"name": "Ece"}).json()
    # Ece, Deniz'in sütununu yazamaz
    bad = client.put(f"/api/guess/rooms/{rid}/members/{deniz['id']}",
                     json={"picks": {"ou": {"BOS": "U"}}}, headers={"X-Guess-Key": ece["key"]})
    assert bad.status_code == 403
    ok = client.put(f"/api/guess/rooms/{rid}/members/{ece['id']}",
                    json={"picks": {"ou": {"BOS": "U"}, "order": {"east": ["BOS", "BOS", "NYK"]}}},
                    headers={"X-Guess-Key": ece["key"]})
    assert ok.status_code == 200
    assert ok.json()["picks"]["order"]["east"] == ["BOS", "NYK"]  # tekrar atıldı


def test_duplicate_name_and_unknown_room(client):
    rid = client.post("/api/guess/rooms", json={}).json()["room_id"]
    assert client.post(f"/api/guess/rooms/{rid}/members", json={"name": "Ali"}).status_code == 200
    assert client.post(f"/api/guess/rooms/{rid}/members", json={"name": "ali"}).status_code == 409
    assert client.get("/api/guess/rooms/nope").status_code == 404


def test_lock(client, monkeypatch):
    rid = client.post("/api/guess/rooms", json={}).json()["room_id"]
    monkeypatch.setenv("GUESS_LOCK_AT", "2000-01-01T00:00:00+00:00")
    assert client.post(f"/api/guess/rooms/{rid}/members", json={"name": "Ali"}).status_code == 423
    assert client.get(f"/api/guess/rooms/{rid}").json()["locked"] is True
