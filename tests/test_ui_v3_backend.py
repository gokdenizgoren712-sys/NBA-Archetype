# -*- coding: utf-8 -*-
"""UI v3 backend maddeleri (docs/BACKEND_PROMPT_UI_V3_BASKETBALL.md): hesap ayarları (B1-B4, B9, B11, B12), sistem (B5, B6),
basketbol oyuncu profili (B7, B13, B14).

Geçici DB (tests/conftest.py); e-posta ve Google ağı sahte."""
import base64
import json
import re
import uuid

import pandas as pd
import pytest


@pytest.fixture()
def M():
    import api.main as m
    m._RL.clear()
    m._AUTH_HITS.clear()
    yield m
    m._RL.clear()
    m._AUTH_HITS.clear()


@pytest.fixture()
def client(M):
    from fastapi.testclient import TestClient
    with TestClient(M.app) as c:
        yield c


@pytest.fixture()
def mails(M, monkeypatch):
    sent = []
    monkeypatch.setattr(M, "_send_email", lambda to, subject, html, attachments=None: sent.append(
        {"to": to, "subject": subject, "html": html, "attachments": attachments}))
    return sent


def _db():
    from api.db import get_conn
    return get_conn()


def _register(client, password="correct-horse-1", accept_terms=True):
    tag = uuid.uuid4().hex[:10]
    email = f"v3-{tag}@example.test"
    body = {"email": email, "username": f"v3{tag}", "password": password}
    if accept_terms:
        body["accept_terms"] = True
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "username": body["username"], "token": d["token"], "id": d["user"]["id"], "password": password}


def _h(u):
    return {"Authorization": f"Bearer {u['token']}"}


# ── B11 / B12 / me ────────────────────────────────────────────────────────────

def test_me_carries_roster_count_terms_date_and_connection_state(client):
    u = _register(client)
    me = client.get("/api/auth/me", headers=_h(u)).json()
    assert me["saved_roster_count"] == 0 and me["terms_accepted_at"] and me["terms_current"] is True
    assert me["pending_email"] is None and me["google_linked"] is False and me["has_password"] is True
    with _db() as conn:
        for i, sport in enumerate(("basketball", "football", "basketball")):
            conn.execute("INSERT INTO saved_rosters (user_id, name, roster_json, sport) VALUES (?,?,?,?)", (u["id"], f"r{i}", "[]", sport))
    assert client.get("/api/auth/me", headers=_h(u)).json()["saved_roster_count"] == 3            # iki spor birlikte
    assert client.get("/api/auth/me").status_code == 401


def test_terms_accepted_date_is_written_on_register_and_on_the_updated_terms_banner(client):
    old = _register(client, accept_terms=False)
    me = client.get("/api/auth/me", headers=_h(old)).json()
    assert me["terms_accepted_at"] is None and me["terms_current"] is False                          # eski hesap: tarih uydurulmaz
    assert client.post("/api/account/accept-terms", headers=_h(old)).json()["terms_current"] is True
    again = client.get("/api/auth/me", headers=_h(old)).json()
    assert again["terms_accepted_at"] and again["terms_current"] is True


# ── B1 ────────────────────────────────────────────────────────────────────────

def test_username_change_rules(client):
    a, b = _register(client), _register(client)
    ok = client.patch("/api/account", json={"username": "New_Name9"}, headers=_h(a))
    assert ok.status_code == 200 and ok.json()["username"] == "New_Name9"
    assert client.get("/api/auth/me", headers=_h(a)).json()["username"] == "New_Name9"
    assert client.patch("/api/account", json={"username": "new_name9"}, headers=_h(b)).status_code == 409     # büyük/küçük harf duyarsız benzersiz
    for bad in ("ab", "x" * 25, "has space", "tr-ça", "<script>"):
        assert client.patch("/api/account", json={"username": bad}, headers=_h(a)).status_code == 400, bad
    assert client.patch("/api/account", json={}, headers=_h(a)).status_code == 400
    assert client.patch("/api/account", json={"username": "Valid_One"}).status_code == 401
    assert client.patch("/api/account", json={"username": "New_Name9"}, headers=_h(a)).status_code == 200  # kendi adına geri yazmak sorun değil


def test_a_blocked_username_is_refused(client, M, monkeypatch):
    u = _register(client)
    monkeypatch.setattr(M.moderation_words, "blocked_word", lambda s: "badword" in s.lower())
    assert client.patch("/api/account", json={"username": "my_badword"}, headers=_h(u)).status_code == 400


def test_email_change_waits_for_confirmation(client, mails):
    u, other = _register(client), _register(client)
    new = f"fresh-{uuid.uuid4().hex[:8]}@example.test"
    r = client.patch("/api/account", json={"email": new.upper()}, headers=_h(u))
    assert r.status_code == 200 and r.json()["pending_email"] == new and r.json()["email"] == u["email"]   # onaya kadar eski e-posta geçerli
    to_new = [m for m in mails if m["to"] == new][0]
    to_old = [m for m in mails if m["to"] == u["email"]][0]
    assert "confirm-email?token=" in to_new["html"] and new in to_old["html"]                            # eski adrese bildirim gider
    token = re.search(r"token=([A-Za-z0-9_-]+)", to_new["html"]).group(1)
    with _db() as conn:
        stored = conn.execute("SELECT email_change_token FROM users WHERE id=?", (u["id"],)).fetchone()[0]
    assert stored != token and len(stored) == 64                                                          # DB'de yalnız özet
    assert client.post("/api/auth/login", json={"email": new, "password": u["password"]}).status_code == 401
    ok = client.post("/api/account/confirm-email", json={"token": token})                                # giriş gerekmeden: bağlantıyı yeni posta kutusu açar
    assert ok.status_code == 200 and ok.json()["email"] == new
    me = client.get("/api/auth/me", headers=_h(u)).json()
    assert me["email"] == new and me["pending_email"] is None
    assert client.post("/api/auth/login", json={"email": new, "password": u["password"]}).status_code == 200
    assert client.post("/api/account/confirm-email", json={"token": token}).status_code == 400           # tek kullanımlık


def test_email_change_validation_and_expiry(client, mails):
    u, other = _register(client), _register(client)
    for bad in ("not-an-email", "a@b", "x" * 260 + "@example.test"):
        assert client.patch("/api/account", json={"email": bad}, headers=_h(u)).status_code == 400, bad
    assert client.patch("/api/account", json={"email": u["email"]}, headers=_h(u)).status_code == 400    # zaten kendi adresi
    assert client.patch("/api/account", json={"email": other["email"]}, headers=_h(u)).status_code == 409
    new = f"slow-{uuid.uuid4().hex[:8]}@example.test"
    client.patch("/api/account", json={"email": new}, headers=_h(u))
    token = re.search(r"token=([A-Za-z0-9_-]+)", [m for m in mails if m["to"] == new][0]["html"]).group(1)
    with _db() as conn:
        conn.execute("UPDATE users SET email_change_expires=datetime('now','-1 minute') WHERE id=?", (u["id"],))
    assert client.post("/api/account/confirm-email", json={"token": token}).status_code == 400
    assert client.post("/api/account/confirm-email", json={"token": "x" * 300}).status_code == 400


def test_email_taken_between_request_and_confirmation_is_refused(client, mails):
    u, other = _register(client), _register(client)
    new = f"race-{uuid.uuid4().hex[:8]}@example.test"
    client.patch("/api/account", json={"email": new}, headers=_h(u))
    token = re.search(r"token=([A-Za-z0-9_-]+)", [m for m in mails if m["to"] == new][0]["html"]).group(1)
    with _db() as conn:
        conn.execute("UPDATE users SET email=? WHERE id=?", (new, other["id"]))
    assert client.post("/api/account/confirm-email", json={"token": token}).status_code == 409


def test_email_change_requests_are_rate_limited(client, mails):
    u = _register(client)
    codes = [client.patch("/api/account", json={"email": f"rl{i}-{uuid.uuid4().hex[:6]}@example.test"}, headers=_h(u)).status_code for i in range(7)]
    assert codes[:5] == [200] * 5 and 429 in codes[5:]


# ── B2 ────────────────────────────────────────────────────────────────────────

def test_change_password_flow(client):
    u = _register(client)
    wrong = client.post("/api/account/change-password", json={"current_password": "nope", "new_password": "fresh-pass-2"}, headers=_h(u))
    assert wrong.status_code == 400 and "current password" in wrong.json()["detail"].lower()
    for bad in ("short", "x" * 19):
        r = client.post("/api/account/change-password", json={"current_password": u["password"], "new_password": bad}, headers=_h(u))
        assert r.status_code == 400, bad
    same = client.post("/api/account/change-password", json={"current_password": u["password"], "new_password": u["password"]}, headers=_h(u))
    assert same.status_code == 400
    ok = client.post("/api/account/change-password", json={"current_password": u["password"], "new_password": "fresh-pass-2"}, headers=_h(u))
    assert ok.status_code == 200 and ok.json()["token"]
    assert client.get("/api/auth/me", headers=_h(u)).status_code == 401                                   # eski oturum düştü
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {ok.json()['token']}"}).status_code == 200   # dönen token oturumu sürdürür
    assert client.post("/api/auth/login", json={"email": u["email"], "password": "fresh-pass-2"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": u["email"], "password": u["password"]}).status_code == 401
    assert client.post("/api/account/change-password", json={"current_password": "a", "new_password": "b"}).status_code == 401


def test_google_only_account_cannot_change_a_password_it_does_not_have(client):
    u = _register(client)
    with _db() as conn:
        conn.execute("UPDATE users SET hashed_password='', google_linked=1 WHERE id=?", (u["id"],))
    r = client.post("/api/account/change-password", json={"current_password": "x", "new_password": "fresh-pass-2"}, headers=_h(u))
    assert r.status_code == 400 and "no password set" in r.json()["detail"].lower()


def test_wrong_current_passwords_count_toward_the_account_lockout(client, M):
    u = _register(client)
    codes = [client.post("/api/account/change-password", json={"current_password": f"bad{i}", "new_password": "fresh-pass-2"},
                         headers=_h(u)).status_code for i in range(M.LOGIN_FAIL_LIMIT + 2)]
    assert codes[0] == 400 and codes[-1] == 429


# ── B3 ────────────────────────────────────────────────────────────────────────

def _google(M, monkeypatch, email):
    class R:
        status_code = 200
        def json(self):
            return {"aud": "cid-test", "iss": "https://accounts.google.com", "email_verified": "true", "email": email, "given_name": "Gee"}
    monkeypatch.setattr(M, "GOOGLE_CLIENT_ID", "cid-test")
    monkeypatch.setattr(M.httpx, "get", lambda *a, **k: R())


def test_unlink_refuses_when_google_is_the_only_way_in(client):
    u = _register(client)
    with _db() as conn:
        conn.execute("UPDATE users SET hashed_password='', google_linked=1 WHERE id=?", (u["id"],))
    r = client.post("/api/account/google/unlink", headers=_h(u))
    assert r.status_code == 400 and "only sign-in method" in r.json()["detail"]
    assert client.get("/api/auth/me", headers=_h(u)).json()["google_linked"] is True


def test_unlink_then_google_sign_in_is_off_until_relinked(client, M, monkeypatch):
    u = _register(client)
    with _db() as conn:
        conn.execute("UPDATE users SET email_verified=1 WHERE id=?", (u["id"],))                          # doğrulanmamış şifreli hesap Google'da şifresini kaybeder (güvenlik kuralı)
    assert client.post("/api/account/google/unlink", headers=_h(u)).status_code == 400                   # hiç bağlı değil
    _google(M, monkeypatch, u["email"])
    assert client.post("/api/auth/google", json={"credential": "t"}).status_code == 200                  # Google ile giriş hesabı bağlar
    assert client.get("/api/auth/me", headers=_h(u)).json()["google_linked"] is True
    off = client.post("/api/account/google/unlink", headers=_h(u))
    assert off.status_code == 200 and off.json()["google_linked"] is False
    assert client.post("/api/account/google/unlink", headers=_h(u)).status_code == 400                   # ikinci kez
    blocked = client.post("/api/auth/google", json={"credential": "t"})
    assert blocked.status_code == 403 and "turned off" in blocked.json()["detail"]
    assert client.post("/api/auth/login", json={"email": u["email"], "password": u["password"]}).status_code == 200   # şifreyle girmeye devam
    _google(M, monkeypatch, "someone-else@example.test")
    assert client.post("/api/account/google/link", json={"credential": "t"}, headers=_h(u)).status_code == 400      # başka e-posta
    _google(M, monkeypatch, u["email"])
    back = client.post("/api/account/google/link", json={"credential": "t"}, headers=_h(u))
    assert back.status_code == 200 and back.json()["google_linked"] is True
    assert client.post("/api/auth/google", json={"credential": "t"}).status_code == 200


def test_google_created_accounts_start_linked_with_a_terms_date(client, M, monkeypatch):
    email = f"gnew-{uuid.uuid4().hex[:8]}@example.test"
    _google(M, monkeypatch, email)
    d = client.post("/api/auth/google", json={"credential": "t"}).json()
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {d['token']}"}).json()
    assert me["google_linked"] is True and me["has_password"] is False and me["terms_accepted_at"]


# ── B4 ────────────────────────────────────────────────────────────────────────

def test_data_export_is_emailed_once_a_day(client, mails):
    u = _register(client)
    with _db() as conn:
        conn.execute("INSERT INTO saved_rosters (user_id, name, roster_json, sport, overall_pct) VALUES (?,?,?,?,?)",
                     (u["id"], "My five", json.dumps([{"PLAYER_NAME": "Test Guy"}]), "basketball", 0.7))
        conn.execute("INSERT INTO saved_lineups (user_id, players, score, grade) VALUES (?,?,?,?)", (u["id"], json.dumps(["A", "B"]), 8.1, "A"))
        conn.execute("INSERT INTO saved_players (user_id, player_name, season) VALUES (?,?,?)", (u["id"], "Test Guy", "2025-26"))
    r = client.post("/api/account/export", headers=_h(u))
    assert r.status_code == 202 and r.json()["email"] == u["email"]
    sent = [m for m in mails if m["attachments"]]
    assert len(sent) == 1 and sent[0]["to"] == u["email"]
    data = json.loads(base64.b64decode(sent[0]["attachments"][0]["content"]))
    assert data["profile"]["email"] == u["email"] and "hashed_password" not in json.dumps(data) and "reset_token" not in json.dumps(data)
    assert data["saved_rosters"][0]["roster_json"][0]["PLAYER_NAME"] == "Test Guy"                        # JSON olarak, çift kodlanmış metin değil
    assert data["saved_lineups"][0]["players"] == ["A", "B"] and data["saved_players"][0]["player_name"] == "Test Guy"
    assert "rankit_diary" in data
    again = client.post("/api/account/export", headers=_h(u))
    assert again.status_code == 429 and int(again.headers["Retry-After"]) > 3000
    assert len([m for m in mails if m["attachments"]]) == 1
    with _db() as conn:
        conn.execute("UPDATE users SET last_export_at=datetime('now','-25 hours') WHERE id=?", (u["id"],))
    assert client.post("/api/account/export", headers=_h(u)).status_code == 202                           # 24 saat geçince yeniden
    assert client.post("/api/account/export").status_code == 401


def test_export_never_includes_another_users_data(client, mails):
    a, b = _register(client), _register(client)
    with _db() as conn:
        conn.execute("INSERT INTO saved_rosters (user_id, name, roster_json) VALUES (?,?,?)", (b["id"], "Bs secret", "[]"))
    client.post("/api/account/export", headers=_h(a))
    data = json.loads(base64.b64decode([m for m in mails if m["attachments"]][0]["attachments"][0]["content"]))
    assert data["saved_rosters"] == []


# ── B9 ────────────────────────────────────────────────────────────────────────

def test_leaderboard_me_ranks_the_best_run_and_counts_runs(client):
    me, rival = _register(client), _register(client)
    with _db() as conn:
        conn.execute("DELETE FROM lineup_games")
        for uid, pct, mode in ((rival["id"], 90, "classic"), (me["id"], 80, "classic"), (me["id"], 60, "classic"), (rival["id"], 70, "classic"),
                               (me["id"], 99, "salarycap")):
            conn.execute("INSERT INTO lineup_games (user_id, pct, grade, mode) VALUES (?,?,?,?)", (uid, pct, "A", mode))
    r = client.get("/api/leaderboard/me", params={"mode": "classic"}, headers=_h(me)).json()
    assert r == {"sport": "basketball", "mode": "classic", "rank": 2, "total": 4, "runs": 2, "best_pct": 80}
    sc = client.get("/api/leaderboard/me", params={"mode": "salarycap"}, headers=_h(me)).json()
    assert sc["rank"] == 1 and sc["total"] == 1 and sc["runs"] == 1
    assert client.get("/api/leaderboard", params={"mode": "classic"}).json()["total"] == r["total"]       # tablonun "N koşudan" referansıyla aynı
    fresh = _register(client)
    empty = client.get("/api/leaderboard/me", headers=_h(fresh)).json()
    assert empty["rank"] is None and empty["runs"] == 0 and empty["best_pct"] is None and empty["total"] == 4
    assert client.get("/api/leaderboard/me").status_code == 401
    assert client.get("/api/leaderboard/me", params={"mode": "bogus"}, headers=_h(me)).json()["mode"] == "classic"


def test_leaderboard_me_football(client):
    me, rival = _register(client), _register(client)
    with _db() as conn:
        conn.execute("DELETE FROM saved_rosters")
        for uid, name, shape, pct in ((rival["id"], "a", "4-3-3", 0.9), (me["id"], "b", "4-3-3", 0.8), (me["id"], "c", "4-4-2", 0.95),
                                      (me["id"], "bb", "4-3-3", 0.3)):
            conn.execute("INSERT INTO saved_rosters (user_id, name, roster_json, sport, mode, overall_pct) VALUES (?,?,?,?,?,?)",
                         (uid, name, "[]", "football", shape, pct))
        conn.execute("INSERT INTO saved_rosters (user_id, name, roster_json, sport, mode, overall_pct) VALUES (?,?,?,?,?,?)",
                     (me["id"], "hoops", "[]", "basketball", "classic", 0.99))                             # basketbol kadrosu futbol tablosuna sayılmaz
    r = client.get("/api/leaderboard/me", params={"sport": "football"}, headers=_h(me)).json()
    assert r["sport"] == "football" and r["rank"] == 1 and r["total"] == 4 and r["runs"] == 3 and r["best_pct"] == 0.95
    shaped = client.get("/api/leaderboard/me", params={"sport": "football", "shape": "4-3-3"}, headers=_h(me)).json()
    assert shaped["rank"] == 2 and shaped["total"] == 3 and shaped["runs"] == 2 and shaped["best_pct"] == 0.8
    assert "percentile" in r
    assert client.get("/api/leaderboard/me", params={"sport": "rugby"}, headers=_h(me)).status_code == 422


# ── B5 / B6 ───────────────────────────────────────────────────────────────────

def test_every_response_carries_a_request_id(client):
    r = client.get("/api/health")
    rid = r.headers["x-request-id"]
    assert re.fullmatch(r"[0-9a-f]{16}", rid)
    assert client.get("/api/health").headers["x-request-id"] != rid                                        # istek başına yeni
    assert client.get("/api/nope-nothing-here").headers["x-request-id"]                                    # hata yanıtlarında da
    mine = "client-req-12345"
    assert client.get("/api/health", headers={"X-Request-Id": mine}).headers["x-request-id"] == mine        # geçerli istemci kimliği korunur
    for bad in ("short", "has space in it!!", "x" * 80, "<script>alert(1)</script>"):
        assert client.get("/api/health", headers={"X-Request-Id": bad}).headers["x-request-id"] != bad


def test_unhandled_errors_return_the_id_in_header_and_body(M, monkeypatch):
    from fastapi.testclient import TestClient

    def boom():
        raise RuntimeError("secret internals")
    monkeypatch.setattr(M, "_load_scores", boom)
    path = "/api/players"
    with TestClient(M.app, raise_server_exceptions=False) as c:
        r = c.get(path, headers={"X-Request-Id": "trace-me-123456"})
    assert r.status_code == 500 and r.headers["x-request-id"] == "trace-me-123456"
    assert r.json()["request_id"] == "trace-me-123456"
    assert "secret internals" not in r.text or not M.IS_PROD


def test_rate_limited_responses_also_carry_an_id(client, M):
    M.RL_LIMIT_BACKUP = M.RL_LIMIT
    M.RL_LIMIT = 1
    try:
        client.get("/api/health")
        r = client.get("/api/health")
    finally:
        M.RL_LIMIT = M.RL_LIMIT_BACKUP
    assert r.status_code == 429 and r.headers["x-request-id"]


def test_maintenance_mode_answers_503_with_retry_after_and_date(client, monkeypatch):
    monkeypatch.setenv("MAINTENANCE_MODE", "1")
    monkeypatch.setenv("MAINTENANCE_RETRY_AFTER", "900")
    r = client.get("/api/players")
    assert r.status_code == 503 and r.headers["retry-after"] == "900" and r.headers["date"] and r.headers["x-request-id"]
    assert "maintenance" in r.json()["detail"].lower()
    assert client.post("/api/auth/login", json={"email": "a@b.co", "password": "x"}).status_code == 503
    assert client.get("/api/health").status_code == 200                                                     # sağlık ve meta açık kalır
    meta = client.get("/api/meta").json()
    assert meta["maintenance"] is True and meta["retry_after"] == 900
    monkeypatch.setenv("MAINTENANCE_RETRY_AFTER", "oops")
    assert client.get("/api/players").headers["retry-after"] == "600"
    monkeypatch.delenv("MAINTENANCE_MODE")
    assert client.get("/api/players", params={"limit": 1}).status_code == 200
    assert client.get("/api/meta").json()["maintenance"] is False


def test_cors_preflight_allows_patch_and_exposes_the_headers(client, M):
    origin = "http://localhost"
    r = client.options("/api/account", headers={"Origin": origin, "Access-Control-Request-Method": "PATCH",
                                                "Access-Control-Request-Headers": "authorization,content-type,x-request-id"})
    assert r.status_code == 200 and "PATCH" in r.headers["access-control-allow-methods"]
    got = client.get("/api/health", headers={"Origin": origin})
    exposed = got.headers.get("access-control-expose-headers", "").lower()
    assert "x-request-id" in exposed and "retry-after" in exposed


# ── B7 / B13 / B14 ────────────────────────────────────────────────────────────

def _scores(client, name):
    r = client.get(f"/api/players/{name}/scores")
    assert r.status_code == 200, r.text
    assert "NaN" not in r.text and "Infinity" not in r.text
    return r.json()


def test_player_scores_carry_rank_pool_age_and_lineups(client):
    top = client.get("/api/players", params={"limit": 3}).json()["players"]
    first, third = _scores(client, top[0]["PLAYER_NAME"]), _scores(client, top[2]["PLAYER_NAME"])
    assert first["rank"] == 1 and third["rank"] == 3 and first["pool"] > 100
    assert isinstance(first["age"], int) and 18 <= first["age"] <= 45
    assert isinstance(first["lineup_count"], int) and first["lineup_count"] >= 0


def test_description_inputs_are_well_formed(client):
    p = _scores(client, client.get("/api/players", params={"limit": 1}).json()["players"][0]["PLAYER_NAME"])
    assert p["confidence"] in ("solid", "early read")
    assert 2 <= len(p["strengths"]) <= 3 and len(p["weaknesses"]) <= 2
    for m in p["strengths"] + p["weaknesses"]:
        assert set(m) == {"key", "label", "value", "unit", "percentile"} and 0 <= m["percentile"] <= 100
    assert all(m["percentile"] >= 70 for m in p["strengths"][:1]) and all(m["percentile"] <= 40 for m in p["weaknesses"])
    assert [m["percentile"] for m in p["strengths"]] == sorted((m["percentile"] for m in p["strengths"]), reverse=True)
    assert p["primary_arch"] in p["role_text"] and p["role_text"].endswith(".")
    assert len(p["recent_seasons"]) <= 3


def test_early_read_for_players_with_few_games(client):
    low = client.get("/api/players", params={"limit": 500}).json()["players"]
    few = next(p for p in low if p.get("GP") is not None and p["GP"] < 40 and p.get("overall_score") is not None)
    assert _scores(client, few["PLAYER_NAME"])["confidence"] == "early read"


def test_last_three_seasons_are_newest_first_with_the_live_season_on_top(client):
    name = client.get("/api/players", params={"limit": 1}).json()["players"][0]["PLAYER_NAME"]
    rs = client.get("/api/player/career", params={"name": name}).json()["recent_seasons"]
    assert 1 <= len(rs) <= 3 and rs[0]["season"] == "2025-26"
    assert [r["season"] for r in rs] == sorted((r["season"] for r in rs), reverse=True)
    for r in rs:
        assert set(r) == {"season", "pts", "reb", "ast", "stl", "blk", "fg3m"}
    assert rs == _scores(client, name)["recent_seasons"]                                                    # iki uç aynı satırları verir


def test_a_player_without_history_still_gets_the_live_season():
    from api import player_profile as pp
    row = pd.Series({"PTS": 10.0, "REB": 3.0, "AST": 2.0, "STL": 0.5, "BLK": 0.2, "FG3M": 1.1})
    out = pp.recent_seasons(pd.DataFrame(), None, row)
    assert out == [{"season": "2025-26", "pts": 10.0, "reb": 3.0, "ast": 2.0, "stl": 0.5, "blk": 0.2, "fg3m": 1.1}]
    assert pp.recent_seasons(pd.DataFrame(), None, None) == []


def test_historical_threes_made_come_from_attempts_times_percentage():
    from api import player_profile as pp
    r = pp.per_game_row("2023-24", pd.Series({"PTS": 20.0, "FG3A": 10.0, "FG3_PCT": 0.4}))
    assert r["fg3m"] == 4.0 and r["reb"] is None and r["stl"] is None                                      # eksik değer NaN değil null


def test_lineup_count_uses_the_minutes_floor_and_whole_ids():
    from api import player_profile as pp
    lu = pd.DataFrame({"GROUP_ID": ["-12-345-6-7-8-", "-12-9-6-7-8-", "-1234-5-6-7-8-", "-12-345-6-7-9-"], "MIN": [300.0, 150.0, 500.0, 40.0]})
    assert pp.lineup_count(lu, 12) == 2          # 12: ilk iki (üçüncüde 1234 başka oyuncu, dördüncü dakikası düşük)
    assert pp.lineup_count(lu, 345) == 1
    assert pp.lineup_count(pd.DataFrame(columns=["GROUP_ID", "MIN"]), 12) == 0 and pp.lineup_count(lu, None) == 0


def test_defensive_rating_percentile_is_inverted():
    from api import player_profile as pp
    s = pd.Series(range(100, 140), dtype=float)
    assert pp._percentile(s, 101.0, -1) > 90 and pp._percentile(s, 101.0, 1) < 10
