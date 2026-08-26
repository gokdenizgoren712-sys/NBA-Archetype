"""RankIt yorum/rating veri butunlugu smoke testi (gecici SQLite)."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

fd, db_path = tempfile.mkstemp(prefix="rankit-integrity-", suffix=".db")
os.close(fd)
os.environ["DB_PATH"] = db_path

from fastapi.testclient import TestClient  # noqa: E402
from api.auth import create_token  # noqa: E402
from api.db import get_conn, init_db  # noqa: E402
from api.main import app  # noqa: E402
from api.rankit import seed_rankit  # noqa: E402


def run():
    init_db()
    seed_rankit()
    client = TestClient(app)
    with get_conn() as conn:
        finished = conn.execute("SELECT id FROM rankit_matches WHERE status='finished' ORDER BY id LIMIT 1").fetchone()["id"]
        upcoming = conn.execute("SELECT id FROM rankit_matches WHERE status='upcoming' ORDER BY id LIMIT 1").fetchone()["id"]
        demo = conn.execute("SELECT id FROM users WHERE username='rankit_demo'").fetchone()["id"]
        ece = conn.execute("SELECT id FROM users WHERE username='ece'").fetchone()["id"]

    payload = {"match_id": finished, "watched_date": "2026-08-18", "rating": 4.5,
               "review": "First version", "visibility": "public", "tags": ["Comeback"]}
    first = client.post("/api/rankit/diary", json=payload)
    assert first.status_code == 200, first.text
    payload.update(rating=2.5, review="Updated version", tags=["Nail-biter"])
    second = client.post("/api/rankit/diary", json=payload)
    assert second.status_code == 200 and second.json()["updated"] is True, second.text
    with get_conn() as conn:
        rows = conn.execute("SELECT id,rating,review FROM rankit_diary_entries WHERE user_id=? AND match_id=? AND is_rewatch=0", (demo, finished)).fetchall()
        assert len(rows) == 1 and rows[0]["rating"] == 2.5 and rows[0]["review"] == "Updated version"

    payload.update(rating=5, review="Rewatch", is_rewatch=True)
    rewatch = client.post("/api/rankit/diary", json=payload)
    assert rewatch.status_code == 200 and rewatch.json()["updated"] is False, rewatch.text
    detail = client.get(f"/api/rankit/matches/{finished}").json()
    assert detail["my_rating"] == 5 and detail["community_rating"] <= 5

    future_match = client.post("/api/rankit/diary", json={**payload, "match_id": upcoming, "is_rewatch": False})
    assert future_match.status_code == 409, future_match.text

    private_payload = {**payload, "is_rewatch": False, "visibility": "private", "review": "Private"}
    private = client.post("/api/rankit/diary", json=private_payload)
    entry_id = private.json()["entry_id"]
    outsider = client.get(f"/api/rankit/reviews/{entry_id}/comments",
                          headers={"Authorization": f"Bearer {create_token(ece, 'user')}"})
    assert outsider.status_code == 403, outsider.text
    owner = client.get(f"/api/rankit/reviews/{entry_id}/comments",
                       headers={"Authorization": f"Bearer {create_token(demo, 'user')}"})
    assert owner.status_code == 200, owner.text

    auth_header = {"Authorization": f"Bearer {create_token(demo, 'user')}"}
    mobile_code = client.post("/api/auth/mobile-code", headers=auth_header)
    assert mobile_code.status_code == 200 and mobile_code.json()["deep_link"].startswith("rankit://auth?code=")
    code = mobile_code.json()["code"]
    exchange = client.post("/api/auth/mobile-exchange", json={"code": code})
    assert exchange.status_code == 200 and exchange.json()["user"]["id"] == demo
    reused = client.post("/api/auth/mobile-exchange", json={"code": code})
    assert reused.status_code == 401, reused.text
    print("RankIt integrity: 10/10 checks passed")


if __name__ == "__main__":
    try:
        run()
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass
