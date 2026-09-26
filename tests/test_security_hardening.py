# -*- coding: utf-8 -*-
"""2026-09 güvenlik sertleştirmesi (Faz 1) — her madde bir saldırı senaryosu.

- Canlıda JWT sırrı yoksa sunucu açılmaz.
- Admin davet kodu yok; rol token'dan değil DB'den okunur.
- Şifre sıfırlama: token yalnız özetiyle saklanır, süresi gerçekten 1 saat,
  şifre değişince eski oturumlar düşer.
- Giriş/sıfırlama uçlarında hesap başına sınır (IP'den bağımsız).
- Google: hedef kitle, issuer ve doğrulanmış e-posta zorunlu; önden ele
  geçirilmiş şifreli hesap Google sahibi gelince kilitlenir.
- İstek sınırı istemcinin yazdığı X-Forwarded-For'a kanmaz; Cloudflare
  arkasında gerçek IP'yi CF-Connecting-IP'den alır.
- Güvenlik başlıkları.

Geçici DB; ağ yok (Google ve e-posta sahte).
"""
import hashlib
import os
import re
import tempfile
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest

_TMP_DB = Path(tempfile.mkdtemp()) / "security_hardening.db"
os.environ.setdefault("DB_PATH", str(_TMP_DB))


@pytest.fixture()
def app_mod():
    import api.main as M
    M._RL.clear()
    M._AUTH_HITS.clear()
    yield M
    M._RL.clear()
    M._AUTH_HITS.clear()


@pytest.fixture()
def client(app_mod):
    from fastapi.testclient import TestClient
    with TestClient(app_mod.app) as c:
        yield c


def _register(client, password="correct-horse-1"):
    tag = uuid.uuid4().hex[:10]
    email = f"sec-{tag}@example.test"
    r = client.post("/api/auth/register", json={"email": email, "username": f"sec{tag}", "password": password})
    assert r.status_code == 200, r.text
    d = r.json()
    return email, d["token"], d["user"]["id"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _db():
    from api.db import get_conn
    return get_conn()


# ── Sır ──────────────────────────────────────────────────────────────────────

def test_production_refuses_to_start_without_a_real_jwt_secret():
    from api.auth import _resolve_secret, _DEV_SECRET
    for bad in (None, "", "   ", _DEV_SECRET):
        with pytest.raises(RuntimeError):
            _resolve_secret(bad, prod=True)
    assert _resolve_secret("x" * 64, prod=True) == "x" * 64
    assert _resolve_secret(None, prod=False) == _DEV_SECRET


# ── Admin ────────────────────────────────────────────────────────────────────

def test_register_never_grants_admin_and_promote_is_gone(client):
    tag = uuid.uuid4().hex[:10]
    r = client.post("/api/auth/register", json={
        "email": f"inv-{tag}@example.test", "username": f"inv{tag}",
        "password": "correct-horse-1", "admin_invite_code": "anything"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "user"
    r = client.post("/api/auth/promote", json={"email": "", "password": "guess"},
                    headers=_auth(r.json()["token"]))
    assert r.status_code in (404, 405)


def test_admin_role_is_read_from_the_database_not_the_token(client):
    from jose import jwt
    from api.auth import SECRET_KEY, ALGORITHM
    _, token, uid = _register(client)
    # Rolü "admin" yazılmış ama DB'de "user" olan token (ör. yetkisi alınmış admin)
    forged = jwt.encode({"sub": str(uid), "role": "admin", "tv": 0,
                         "exp": datetime.utcnow() + timedelta(hours=1)}, SECRET_KEY, algorithm=ALGORITHM)
    assert client.get("/api/admin/users", headers=_auth(forged)).status_code == 403
    # DB'de admin yapılınca, token'daki "user" rolüne rağmen içeri girer (yeniden giriş gerekmez)
    with _db() as conn:
        conn.execute("UPDATE users SET role='admin' WHERE id=?", (uid,))
    assert client.get("/api/admin/users", headers=_auth(token)).status_code == 200
    assert client.get("/api/admin/request-ip", headers=_auth(token)).status_code == 200
    assert client.get("/api/admin/request-ip").status_code == 401


# ── Şifre sıfırlama ──────────────────────────────────────────────────────────

def _request_reset(client, app_mod, monkeypatch, email):
    sent = []
    monkeypatch.setattr(app_mod, "_send_email", lambda to, subject, html: sent.append(html))
    assert client.post("/api/auth/forgot-password", json={"email": email}).json() == {"ok": True}
    assert sent, "e-posta gönderilmedi"
    return re.search(r"token=([A-Za-z0-9_\-]+)", sent[-1]).group(1)


def test_reset_token_is_stored_hashed_and_kills_old_sessions(client, app_mod, monkeypatch):
    email, old_token, uid = _register(client)
    raw = _request_reset(client, app_mod, monkeypatch, email)
    with _db() as conn:
        stored = conn.execute("SELECT reset_token FROM users WHERE id=?", (uid,)).fetchone()[0]
    assert stored != raw and stored == hashlib.sha256(raw.encode()).hexdigest()

    r = client.post("/api/auth/reset-password", json={"token": raw, "password": "brand-new-pass"})
    assert r.status_code == 200, r.text
    new_token = r.json()["token"]
    assert client.get("/api/auth/me", headers=_auth(old_token)).status_code == 401   # eski oturum düştü
    assert client.get("/api/auth/me", headers=_auth(new_token)).status_code == 200
    # Aynı bağlantı ikinci kez çalışmaz
    assert client.post("/api/auth/reset-password", json={"token": raw, "password": "x" * 8}).status_code == 400
    with _db() as conn:
        assert conn.execute("SELECT email_verified FROM users WHERE id=?", (uid,)).fetchone()[0] == 1


def test_reset_link_really_expires_after_one_hour(client, app_mod, monkeypatch):
    email, _, uid = _register(client)
    raw = _request_reset(client, app_mod, monkeypatch, email)
    # Sunucunun YAZDIĞI süre, SQLite'ın karşılaştırmasında 1 saatten uzun
    # görünmemeli (eski hata: isoformat'ın "T"si yüzünden gün sonuna kadar)
    with _db() as conn:
        too_long = conn.execute("SELECT reset_expires > datetime('now', '+2 hours') FROM users WHERE id=?",
                                (uid,)).fetchone()[0]
        still_valid = conn.execute("SELECT reset_expires > datetime('now') FROM users WHERE id=?",
                                   (uid,)).fetchone()[0]
    assert (too_long, still_valid) == (0, 1)
    # 5 saat önce dolmuş gibi yap (eski hata: aynı UTC gün içinde hâlâ geçerliydi)
    past = (datetime.utcnow() - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M:%S")
    with _db() as conn:
        conn.execute("UPDATE users SET reset_expires=? WHERE id=?", (past, uid))
    r = client.post("/api/auth/reset-password", json={"token": raw, "password": "brand-new-pass"})
    assert r.status_code == 400


def test_forgot_password_sends_at_most_three_emails_per_hour(client, app_mod, monkeypatch):
    email, _, _ = _register(client)
    sent = []
    monkeypatch.setattr(app_mod, "_send_email", lambda to, subject, html: sent.append(to))
    for _ in range(6):
        assert client.post("/api/auth/forgot-password", json={"email": email}).json() == {"ok": True}
    assert len(sent) == 3


# ── Giriş ────────────────────────────────────────────────────────────────────

def test_login_locks_an_account_after_ten_wrong_passwords(client, app_mod):
    email, _, _ = _register(client, password="right-password-1")
    for _ in range(10):
        # Her istek BAŞKA bir sahte IP'den — sınır hesaba bağlı olmalı
        r = client.post("/api/auth/login", json={"email": email, "password": "wrong"},
                        headers={"X-Forwarded-For": f"10.0.{uuid.uuid4().int % 250}.1"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"email": email, "password": "right-password-1"})
    assert r.status_code == 429
    other, _, _ = _register(client, password="right-password-1")
    assert client.post("/api/auth/login", json={"email": other, "password": "right-password-1"}).status_code == 200
    app_mod._AUTH_HITS.clear()
    assert client.post("/api/auth/login", json={"email": email, "password": "right-password-1"}).status_code == 200


def test_seeded_accounts_with_placeholder_hash_do_not_500():
    from api.auth import verify_password
    assert verify_password("anything", "!") is False


# ── Google ───────────────────────────────────────────────────────────────────

class _FakeResp:
    def __init__(self, info, status=200):
        self._info, self.status_code = info, status

    def json(self):
        return self._info


def _google(monkeypatch, app_mod, **info):
    base = {"aud": "cid-test", "iss": "https://accounts.google.com", "email_verified": "true",
            "email": "x@example.test", "given_name": "Gee"}
    base.update(info)
    monkeypatch.setattr(app_mod, "GOOGLE_CLIENT_ID", "cid-test")
    monkeypatch.setattr(app_mod.httpx, "get", lambda *a, **k: _FakeResp(base))


def test_google_sign_in_is_off_without_a_client_id(client, app_mod, monkeypatch):
    monkeypatch.setattr(app_mod, "GOOGLE_CLIENT_ID", "")
    assert client.post("/api/auth/google", json={"credential": "t"}).status_code == 503


@pytest.mark.parametrize("bad", [{"aud": "someone-elses-app"}, {"iss": "https://evil.example"},
                                 {"email_verified": "false"}])
def test_google_token_must_be_ours_and_verified(client, app_mod, monkeypatch, bad):
    _google(monkeypatch, app_mod, **bad)
    assert client.post("/api/auth/google", json={"credential": "t"}).status_code == 400


def test_google_owner_locks_out_a_pre_registered_password_account(client, app_mod, monkeypatch):
    # Saldırgan kurbanın e-postasıyla şifreli hesap açar (e-posta doğrulanmadan)
    email, attacker_token, uid = _register(client, password="attacker-pass-1")
    _google(monkeypatch, app_mod, email=email)
    r = client.post("/api/auth/google", json={"credential": "t"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=_auth(attacker_token)).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "attacker-pass-1"}).status_code == 401
    assert client.get("/api/auth/me", headers=_auth(r.json()["token"])).status_code == 200


def test_google_keeps_the_password_of_a_verified_account(client, app_mod, monkeypatch):
    email, _, uid = _register(client, password="owner-pass-12")
    with _db() as conn:
        conn.execute("UPDATE users SET email_verified=1 WHERE id=?", (uid,))
    _google(monkeypatch, app_mod, email=email)
    assert client.post("/api/auth/google", json={"credential": "t"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": email, "password": "owner-pass-12"}).status_code == 200


# ── İstek sınırı / istemci IP'si ─────────────────────────────────────────────

def _req(headers, peer="10.9.9.9"):
    from starlette.requests import Request
    return Request({"type": "http", "method": "GET", "path": "/", "client": (peer, 1234),
                    "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]})


def test_client_ip_ignores_what_the_client_writes(app_mod):
    ip = app_mod.client_ip
    # Solu sahte, sağı Railway'in eklediği: sağ kazanır
    assert ip(_req({"X-Forwarded-For": "1.2.3.4, 203.0.113.9"})) == "203.0.113.9"
    # Cloudflare üzerinden: gerçek istemci CF-Connecting-IP
    assert ip(_req({"X-Forwarded-For": "1.2.3.4, 162.158.10.20", "CF-Connecting-IP": "198.51.100.7"})) == "198.51.100.7"
    # Railway'e doğrudan gelip CF başlığı uyduran: başlığa güvenilmez
    assert ip(_req({"X-Forwarded-For": "203.0.113.9", "CF-Connecting-IP": "198.51.100.7"})) == "203.0.113.9"
    assert ip(_req({})) == "10.9.9.9"


def test_rate_limit_cannot_be_dodged_with_a_fake_forwarded_for(client, app_mod, monkeypatch):
    monkeypatch.setattr(app_mod, "RL_LIMIT", 3)
    codes = [client.get("/api/health", headers={"X-Forwarded-For": f"6.6.6.{i}, 203.0.113.50"}).status_code
             for i in range(6)]
    assert codes[:3] == [200, 200, 200] and 429 in codes[3:]


def test_rate_limit_table_stays_bounded(app_mod, monkeypatch):
    monkeypatch.setattr(app_mod, "RL_MAX_KEYS", 10)
    stale = time.time() - app_mod.RL_WINDOW - 5
    for i in range(50):
        app_mod._RL[f"198.18.0.{i}"] = [stale]
    app_mod._check_rate("198.18.1.1")
    assert len(app_mod._RL) <= 10


# ── Başlıklar ────────────────────────────────────────────────────────────────

def test_security_headers(client, app_mod, monkeypatch):
    r = client.get("/api/health")
    assert r.headers["x-frame-options"] == "DENY"
    assert "camera=()" in r.headers["permissions-policy"]
    assert "strict-transport-security" not in r.headers           # yerelde http
    monkeypatch.setattr(app_mod, "IS_PROD", True)
    assert client.get("/api/health").headers["strict-transport-security"].startswith("max-age=")
    assert "frame-ancestors 'none'" in app_mod._CSP and "report-uri /api/csp-report" in app_mod._CSP
    r = client.post("/api/csp-report", content=b'{"csp-report": {"violated-directive": "img-src"}}',
                    headers={"Content-Type": "application/csp-report"})
    assert r.status_code == 204


# ── Admin atama (davet kodunun yerine panelden) ──────────────────────────────

def test_admins_can_grant_and_revoke_admin_from_the_panel(client):
    _, admin_token, admin_id = _register(client)
    _, user_token, user_id = _register(client)
    with _db() as conn:
        conn.execute("UPDATE users SET role='admin' WHERE id=?", (admin_id,))
    patch = lambda tok, uid, body: client.patch(f"/api/admin/users/{uid}", json=body, headers=_auth(tok))

    # Admin olmayan kimseye rol veremez, kendine de
    assert patch(user_token, user_id, {"role": "admin"}).status_code == 403
    # Admin başkasını admin yapar; yeni admin hemen (yeniden giriş olmadan) içeride
    assert patch(admin_token, user_id, {"role": "admin"}).status_code == 200
    assert client.get("/api/admin/users", headers=_auth(user_token)).status_code == 200
    # Kendi yetkini kaldıramaz, kendini banlayamaz; geçersiz rol reddedilir
    assert patch(admin_token, admin_id, {"role": "user"}).status_code == 400
    assert patch(admin_token, admin_id, {"is_banned": 1}).status_code == 400
    assert patch(admin_token, user_id, {"role": "owner"}).status_code == 400
    # Geri alınınca aynı token'la anında dışarıda
    assert patch(admin_token, user_id, {"role": "user"}).status_code == 200
    assert client.get("/api/admin/users", headers=_auth(user_token)).status_code == 403
    assert patch(admin_token, 10**9, {"role": "admin"}).status_code == 404
