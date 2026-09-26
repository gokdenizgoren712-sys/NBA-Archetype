# -*- coding: utf-8 -*-
"""Kullanici icerigi moderasyonu — magaza sarti (Apple 1.2, Play UGC).

docs/RANKIT_STORE_BLOCKERS_PLAN.md Paket B. Her madde bir magaza inceleyicisinin
deneyecegi senaryo:
  * sikayet: tekrar etmez, kendini sikayet yok, goremedigini sikayet yok;
  * 3 farkli (24 saatten eski) hesap sikayet edince icerik admin beklemeden
    gizlenir; admin gizler / geri acar / siler / banlar, yetkisi olmayan yapamaz;
  * engel IKI YONLU ve HER yuzeyde (her sorgu icin ayri test): biri digerinin
    incelemesini, yanitini, listesini, profilini, bildirimini, sohbet mesajini
    gormez; takip ve yanit engeli dolanamaz;
  * toplam puan istatistigi engelden etkilenmez (bilincli karar);
  * gonderim filtresi (TR/EN, baglanti) ve dakikada 5 siniri;
  * hesap silinince sikayet ve engeller temizlenir.
Gecici DB; ag yok (e-posta sahte).
"""
import tempfile
import threading
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import api.db as DB
from api import moderation_words as W
from api import rankit as RK
from api.auth import create_token

FINISHED, LIVE = 1, 2
OLD = "2026-01-01 10:00:00"      # esige sayilan hesap
REVIEW, COMMENT, LIST, MESSAGE = 100, 200, 300, 400
# 1 izleyen, 2 yazar, 3-5 sikayetciler, 6 admin, 7 yeni hesap
ADMIN, FRESH = 6, 7


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_moderation_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        for i in range(1, 7):
            c.execute("""INSERT INTO users(id,email,username,hashed_password,created_at,role)
                         VALUES(?,?,?,'x',?,?)""", (i, f"u{i}@t", f"user{i}", OLD, "admin" if i == ADMIN else "user"))
        c.execute("INSERT INTO users(id,email,username,hashed_password) VALUES(7,'u7@t','user7','x')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','League','2026-27')")
        c.execute("""INSERT INTO rankit_teams(id,sport,name,short_name)
                     VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Chelsea','CHE')""")
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,home_score,away_score,provider)
                     VALUES(1,'Football',1,'2026-27','2026-08-01T20:00:00','finished',1,2,2,1,'fotmob'),
                           (2,'Football',1,'2026-27',datetime('now','-30 minutes'),'live',1,2,0,0,'fotmob')""")
        # 2'nin incelemesi, 1'in yaniti, 2'nin listesi, 2'nin sohbet mesaji
        c.execute("""INSERT INTO rankit_diary_entries(id,user_id,match_id,watched_date,rating,review,visibility)
                     VALUES(?,2,1,'2026-08-01',4.5,'What a derby, pure chaos','public')""", (REVIEW,))
        c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,review,visibility)
                     VALUES(1,1,'2026-08-01',3.0,'Solid','public')""")
        c.execute("""INSERT INTO rankit_review_comments(id,user_id,entry_id,content,reply_to_user_id)
                     VALUES(?,2,?,'Agreed, mad second half',2)""", (COMMENT, REVIEW))
        c.execute("""INSERT INTO rankit_lists(id,user_id,title,description,visibility)
                     VALUES(?,2,'Best derbies','Only the loud ones','public')""", (LIST,))
        c.execute("INSERT INTO rankit_list_items(list_id,match_id,position) VALUES(?,1,1)", (LIST,))
        c.execute("""INSERT INTO rankit_watchalong_messages(id,match_id,user_id,room,content)
                     VALUES(?,2,2,'community','Come on you gunners')""", (MESSAGE,))
    RK._ALERTS_SENT.clear()
    return path


def who(uid):
    return {"sub": str(uid)}


def report(uid, target_type, target_id, reason="harassment", note=""):
    return RK.rankit_report(RK.ReportIn(target_type=target_type, target_id=target_id,
                                        reason=reason, note=note), user=who(uid))


def block(a, b):
    return RK.rankit_block(b, user=who(a))


def one(sql, args=()):
    with DB.get_conn() as c:
        return c.execute(sql, args).fetchone()


def status_of(call):
    with pytest.raises(HTTPException) as err:
        call()
    return err.value.status_code


def match_reviews(uid):
    body = RK.rankit_match_reviews(FINISHED, user=who(uid))
    return [r["id"] for r in body["followed"] + body["everyone"]]


# ── Kelime ve baglanti filtresi ──────────────────────────────────────────────

@pytest.mark.parametrize("text", [
    "Bu hakem orospu cocugu", "AMK boyle mac", "siktir git", "SİKTİR", "0rospu", "piç kurusu",
    "Amına koyayım", "yarrrak", "FUUUCK this ref", "what a cunt", "ｆｕｃｋ", "f4ggot", "motherfucking var",
])
def test_filter_blocks_slurs_and_strong_profanity(text):
    assert W.problem(text) == W.MESSAGE_WORDS


@pytest.mark.parametrize("text", [
    # Aksansiz "sıkıcı" / "sık sık" — Turkce klavyesi olmayanin gunluk yazimi.
    "Çok sıkıcı bir maçtı", "cok sikici bir macti", "sik sik gol atiyor", "Top sıkıştı",
    "Scunthorpe away day", "classic assist", "Dick Advocaat's side", "nice pic", "got it",
    "Osimhen, the Nigerian striker", "Wankdorf was loud", "Göttingen", "Amina scored twice",
    "the cockerel on the badge", "4.5 stars, 3-1 win", "Sikkim", "Fukuoka", "What a shit ref",
])
def test_filter_leaves_football_talk_alone(text):
    assert W.problem(text) is None


def test_links_are_blocked_only_where_asked():
    for text in ("see https://spam.example", "www.bets.io", "join t.me/free", "bit.ly/xyz", "promo on bets.com"):
        assert W.problem(text, allow_links=False) == W.MESSAGE_LINKS
        assert W.problem(text) is None
    for text in ("4.5 stars", "e.g. a great game", "Mr.Smith", "3.0"):
        assert W.problem(text, allow_links=False) is None


def test_submissions_are_filtered_at_every_entry_point(db):
    assert status_of(lambda: RK.rankit_log(RK.DiaryIn(match_id=FINISHED, rating=2, review="hakem orospu"),
                                           who(3))) == 422
    ok = RK.rankit_log(RK.DiaryIn(match_id=FINISHED, rating=2, review="Recap at www.example.com"), who(3))
    assert ok["ok"]                                         # incelemede baglanti serbest
    assert status_of(lambda: RK.add_review_comment(REVIEW, RK.ReviewCommentIn(content="read bit.ly/xyz"),
                                                   who(1))) == 422
    assert status_of(lambda: RK.add_review_comment(REVIEW, RK.ReviewCommentIn(content="you retard"),
                                                   who(1))) == 422
    assert status_of(lambda: RK.create_rankit_list(RK.ListIn(title="amk derbileri"), who(1))) == 422
    assert status_of(lambda: RK.rankit_update_list(LIST, RK.ListUpdateIn(description="fucking great"),
                                                   who(2))) == 422
    assert status_of(lambda: RK.add_rankit_list_item(LIST, RK.ListItemIn(match_id=FINISHED, note="piç"),
                                                     who(2))) == 422


def test_posting_is_limited_to_five_per_minute(db):
    for i in range(5):
        RK.add_review_comment(REVIEW, RK.ReviewCommentIn(content=f"reply {i}"), who(1))
    err = pytest.raises(HTTPException, RK.add_review_comment, REVIEW,
                        RK.ReviewCommentIn(content="one more"), who(1))
    assert err.value.status_code == 429
    # Yeni inceleme: dakikada 5. Ayni incelemeyi duzenlemek (yazarken
    # otomatik kayit) sayilmaz.
    with DB.get_conn() as c:
        for mid in range(10, 17):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,provider) VALUES(?,'Football',1,'2026-27',
                         ?,'finished',1,2,'fotmob')""", (mid, f"2026-08-{mid:02d}T20:00:00"))
    for mid in range(10, 15):
        RK.rankit_log(RK.DiaryIn(match_id=mid, rating=3, review=f"take {mid}"), who(3))
    assert status_of(lambda: RK.rankit_log(RK.DiaryIn(match_id=15, rating=3, review="sixth"), who(3))) == 429
    entry = one("SELECT id FROM rankit_diary_entries WHERE user_id=3 AND match_id=10")["id"]
    for text in ("take 10 edited", "take 10 edited again", "take 10 final"):
        RK.rankit_update_entry(entry, RK.DiaryIn(match_id=10, review=text), who(3))
    assert RK.rankit_log(RK.DiaryIn(match_id=16, rating=3), who(3))["ok"]   # metinsiz kayit serbest


# ── Sikayet ──────────────────────────────────────────────────────────────────

def test_report_is_once_per_person_never_self_and_only_what_you_can_see(db):
    assert report(1, "review", REVIEW) == {"ok": True, "duplicate": False, "hidden": False}
    assert report(1, "review", REVIEW, reason="spam")["duplicate"] is True
    assert one("SELECT COUNT(*) FROM rankit_reports")[0] == 1
    assert one("SELECT snapshot,target_user_id FROM rankit_reports")[:] == ("What a derby, pure chaos", 2)
    assert status_of(lambda: report(2, "review", REVIEW)) == 422
    assert status_of(lambda: report(2, "user", 2)) == 422
    assert status_of(lambda: report(1, "comment", 99999)) == 404
    assert status_of(lambda: report(1, "user", 99999)) == 404
    with DB.get_conn() as c:
        c.execute("UPDATE rankit_lists SET visibility='private' WHERE id=?", (LIST,))
    assert status_of(lambda: report(1, "list", LIST)) == 404
    for kind, tid in (("comment", COMMENT), ("message", MESSAGE), ("user", 2)):
        assert report(1, kind, tid)["duplicate"] is False
    assert status_of(lambda: RK.rankit_report(RK.ReportIn(target_type="review", target_id=REVIEW,
                                                          reason="spam"), user=None)) == 401


def test_reporting_is_rate_limited(db, monkeypatch):
    monkeypatch.setattr(RK, "REPORTS_PER_HOUR", 2)
    report(1, "review", REVIEW)
    report(1, "comment", COMMENT)
    assert status_of(lambda: report(1, "list", LIST)) == 429


def test_three_established_accounts_hide_content_without_waiting_for_an_admin(db):
    report(FRESH, "review", REVIEW)                 # 24 saatlik hesap esige sayilmaz
    report(3, "review", REVIEW)
    assert report(4, "review", REVIEW)["hidden"] is False
    assert report(5, "review", REVIEW)["hidden"] is True
    assert one("SELECT hidden_reason FROM rankit_diary_entries WHERE id=?", (REVIEW,))[0] == "reports"
    # Baskalari icin metin her yuzeyden kalkar; puan istatistikte kalir.
    assert REVIEW not in match_reviews(1)
    assert REVIEW not in [r["id"] for r in RK.rankit_match(FINISHED, user=who(1))["reviews"]]
    assert REVIEW not in [a["id"] for a in RK.rankit_home(user=who(1))["activity"]]
    assert status_of(lambda: RK.rankit_review_thread(REVIEW, user=who(1))) == 404
    member = RK.rankit_member_detail(2, user=who(1))
    assert [e["review"] for e in member["entries"]] == [""] and member["entries"][0]["rating"] == 4.5
    assert RK.rankit_match(FINISHED, user=who(1))["rating_count"] == 2
    # Yazar kendi incelemesini gorur ve gizlendigini bilir.
    own = RK.rankit_review_thread(REVIEW, user=who(2))["review"]
    assert own["hidden"] is True and own["review"] == "What a derby, pure chaos"
    assert RK.rankit_member_detail(2, user=who(2))["entries"][0]["review_hidden"] is True


@pytest.mark.parametrize("kind,target,visible", [
    ("comment", COMMENT, lambda: [c["id"] for c in RK.review_comments(REVIEW, user=who(1))["comments"]]),
    ("list", LIST, lambda: [l["id"] for l in RK.rankit_lists(user=who(1))["lists"]]),
    ("message", MESSAGE, lambda: [m["id"] for m in RK.watchalong_history(LIVE, before_id=None, limit=100, user=who(1))["messages"]]),
])
def test_auto_hide_covers_replies_lists_and_chat(db, kind, target, visible):
    assert target in visible()
    for uid in (3, 4, 5):
        report(uid, kind, target)
    assert target not in visible()


def test_accounts_are_never_auto_hidden_only_banned_by_an_admin(db):
    for uid in (3, 4, 5):
        assert report(uid, "user", 2)["hidden"] is False
    assert one("SELECT is_banned FROM users WHERE id=2")[0] == 0


def test_first_report_alerts_the_admin_once(db, monkeypatch):
    sent = []

    class Inline:
        def __init__(self, target, daemon=None):
            self.target = target

        def start(self):
            self.target()

    monkeypatch.setattr(RK, "threading", type("T", (), {"Thread": Inline}))
    monkeypatch.setattr(RK, "ALERT_SENDER", lambda to, subject, html: sent.append((to, subject, html)))
    monkeypatch.delenv("ADMIN_ALERT_EMAIL", raising=False)
    report(1, "comment", COMMENT)
    assert sent == []                                   # adres yoksa e-posta yok
    monkeypatch.setenv("ADMIN_ALERT_EMAIL", "mod@example.test")
    report(3, "review", REVIEW, note="<script>x</script>")
    report(4, "review", REVIEW)                         # ayni hedefin ikinci sikayeti
    assert len(sent) == 1 and sent[0][0] == "mod@example.test"
    assert "review" in sent[0][1] and "<script>" not in sent[0][2]
    assert "/admin/reports" in sent[0][2]


# ── Admin ────────────────────────────────────────────────────────────────────

def queue(status="open"):
    return RK.rankit_admin_reports(status=status, limit=100, user=who(ADMIN))


def act(action, kind, target):
    rid = one("SELECT MIN(id) FROM rankit_reports WHERE target_type=? AND target_id=?", (kind, target))[0]
    return RK.rankit_admin_report_action(rid, RK.ReportActionIn(action=action), user=who(ADMIN))


def test_admin_queue_groups_by_target_with_reasons_and_live_state(db):
    report(1, "comment", COMMENT, reason="hate")
    report(1, "review", REVIEW, reason="spam", note="bot account")
    report(3, "review", REVIEW, reason="harassment")
    report(4, "review", REVIEW, reason="harassment")
    body = queue()
    assert body["counts"] == {"open": 2, "actioned": 0, "dismissed": 0}
    top = body["items"][0]
    assert (top["target_type"], top["target_id"], top["reports"]) == ("review", REVIEW, 3)
    assert top["reasons"] == {"harassment": 2, "spam": 1}
    assert top["notes"][0]["note"] == "bot account" and top["owner"]["username"] == "user2"
    assert top["live"]["exists"] and top["live"]["match_id"] == FINISHED


def test_admin_actions_hide_restore_delete_and_ban(db):
    for uid in (3, 4, 5):
        report(uid, "review", REVIEW)
    act("dismiss", "review", REVIEW)                   # ihlal yok: esikle gizlenen geri acilir
    assert one("SELECT hidden_at FROM rankit_diary_entries WHERE id=?", (REVIEW,))[0] is None
    assert queue()["items"] == [] and queue("dismissed")["items"][0]["target_id"] == REVIEW

    report(1, "comment", COMMENT)
    act("hide", "comment", COMMENT)
    assert one("SELECT hidden_reason FROM rankit_review_comments WHERE id=?", (COMMENT,))[0] == "admin"
    assert queue("actioned")["items"][0]["live"]["hidden"] is True
    act("unhide", "comment", COMMENT)
    assert one("SELECT hidden_at FROM rankit_review_comments WHERE id=?", (COMMENT,))[0] is None

    report(1, "message", MESSAGE)
    act("delete", "message", MESSAGE)
    assert one("SELECT 1 FROM rankit_watchalong_messages WHERE id=?", (MESSAGE,)) is None

    RK.rankit_log(RK.DiaryIn(match_id=FINISHED, rating=1, review="terrible"), who(4))
    entry = one("SELECT id FROM rankit_diary_entries WHERE user_id=4")[0]
    report(1, "review", entry)
    act("delete", "review", entry)                     # yalniz METIN; puan kalir
    assert one("SELECT review,rating FROM rankit_diary_entries WHERE id=?", (entry,))[:] == ("", 1.0)

    report(1, "user", 5)
    with pytest.raises(HTTPException) as err:
        act("hide", "user", 5)
    assert err.value.status_code == 422
    act("ban", "user", 5)
    assert one("SELECT is_banned FROM users WHERE id=5")[0] == 1

    report(1, "list", LIST)
    act("ban", "list", LIST)                            # icerigin sahibi banlanir
    assert one("SELECT is_banned FROM users WHERE id=2")[0] == 1
    assert REVIEW not in match_reviews(1)


def test_admin_cannot_ban_themselves_through_a_report(db):
    report(1, "user", ADMIN)
    with pytest.raises(HTTPException) as err:
        act("ban", "user", ADMIN)
    assert err.value.status_code == 400


def test_moderation_endpoints_need_an_admin_over_http(db):
    app = FastAPI()
    app.include_router(RK.router)
    api = TestClient(app)
    report(1, "review", REVIEW)
    rid = one("SELECT id FROM rankit_reports")[0]
    user_h = {"Authorization": f"Bearer {create_token(1, 'admin')}"}   # token'daki rol sayilmaz
    admin_h = {"Authorization": f"Bearer {create_token(ADMIN, 'user')}"}
    assert api.get("/api/rankit/admin/reports").status_code == 401
    assert api.get("/api/rankit/admin/reports", headers=user_h).status_code == 403
    assert api.post(f"/api/rankit/admin/reports/{rid}/action", json={"action": "hide"},
                    headers=user_h).status_code == 403
    assert api.get("/api/rankit/admin/reports", headers=admin_h).json()["counts"]["open"] == 1
    assert api.post(f"/api/rankit/admin/reports/{rid}/action", json={"action": "hide"},
                    headers=admin_h).status_code == 200
    bad = api.post("/api/rankit/reports", headers=user_h,
                   json={"target_type": "review", "target_id": REVIEW, "reason": "nope"})
    assert bad.status_code == 422


# ── Engel: her yuzey ─────────────────────────────────────────────────────────

def test_block_removes_follows_both_ways_and_blocks_new_ones(db):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(1,'user',2),(2,'user',1)")
    assert block(1, 2) == {"blocked": True}
    assert block(1, 2) == {"blocked": True}             # tekrar guvenli
    assert one("SELECT COUNT(*) FROM rankit_follows WHERE target_type='user'")[0] == 0
    assert status_of(lambda: RK.rankit_set_user_follow(1, RK.UserFollowIn(following=True), who(2))) == 404
    assert status_of(lambda: RK.rankit_set_user_follow(2, RK.UserFollowIn(following=True), who(1))) == 404
    assert status_of(lambda: RK.rankit_follow(RK.FollowIn(target_type="user", target_id=1), who(2))) == 404
    assert status_of(lambda: block(1, 1)) == 422
    assert status_of(lambda: block(1, 999)) == 404
    assert RK.rankit_blocked_accounts(user=who(1))["blocked"][0]["username"] == "user2"
    assert RK.rankit_blocked_accounts(user=who(2))["blocked"] == []   # kimin engelledigi soylenmez
    assert RK.rankit_unblock(2, user=who(1)) == {"blocked": False}
    assert RK.rankit_set_user_follow(2, RK.UserFollowIn(following=True), who(1))["following"] is True


@pytest.mark.parametrize("blocker,viewer", [(1, 1), (2, 1)], ids=["i-blocked-them", "they-blocked-me"])
def test_block_hides_reviews_on_every_review_surface(db, blocker, viewer):
    other = 2 if blocker == 1 else 1
    block(blocker, other)
    assert REVIEW not in match_reviews(viewer)
    assert REVIEW not in [r["id"] for r in RK.rankit_match(FINISHED, user=who(viewer))["reviews"]]
    assert REVIEW not in [a["id"] for a in RK.rankit_home(user=who(viewer))["activity"]]
    assert status_of(lambda: RK.rankit_review_thread(REVIEW, user=who(viewer))) == 404
    assert status_of(lambda: RK.toggle_review_like(REVIEW, user=who(viewer))) == 404
    assert status_of(lambda: RK.add_review_comment(REVIEW, RK.ReviewCommentIn(content="hey"), who(viewer))) == 404
    # Blok iki yonlu: yazar da izleyenin incelemesini gormez.
    mine = one("SELECT id FROM rankit_diary_entries WHERE user_id=1")[0]
    assert mine not in match_reviews(2)
    # Sayilar: 5c'nin "N reviews" linki gostermedigini vaat etmez.
    assert RK.rankit_match(FINISHED, user=who(viewer))["review_count"] == 1


def test_block_hides_replies_in_comments_and_thread(db):
    RK.add_review_comment(REVIEW, RK.ReviewCommentIn(content="nice one"), who(3))
    block(3, 2)
    # 3, 2'nin incelemesine artik ulasamaz; 1 ise 3'u engelleyince onun yanitini gormez.
    block(1, 3)
    replies = [r["user_id"] for r in RK.rankit_review_thread(REVIEW, user=who(1))["replies"]]
    assert 3 not in replies and 2 in replies
    assert 3 not in [c["user_id"] for c in RK.review_comments(REVIEW, user=who(1))["comments"]]
    comment = one("SELECT id FROM rankit_review_comments WHERE user_id=3")[0]
    assert status_of(lambda: RK.rankit_comment_respect(comment, user=who(1))) == 404


def test_block_hides_lists_everywhere(db):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_list_saves(list_id,user_id) VALUES(?,1)", (LIST,))
    block(2, 1)
    assert LIST not in [l["id"] for l in RK.rankit_lists(user=who(1))["lists"]]
    assert status_of(lambda: RK.rankit_list_detail(LIST, user=who(1))) == 404
    assert RK.rankit_my_lists(user=who(1))["saved"] == []
    found = RK.rankit_search(q="derbies", kind="Lists", status="All", user=who(1))
    assert found["lists"] == [] and found["counts"]["lists"] == 0


def test_block_hides_the_person_in_search_people_profile_and_shelf(db):
    block(1, 2)
    found = RK.rankit_search(q="user2", kind="Members", status="All", user=who(1))
    assert found["members"] == [] and found["counts"]["members"] == 0
    assert 2 not in [p["id"] for p in RK.rankit_discover_people(q="user", offset=0, limit=20,
                                                                  user=who(1))["people"]]
    # Engelleyen icin profil yalniz "You blocked @user2 · Unblock" kadar.
    profile = RK.rankit_member_detail(2, user=who(1))
    assert profile["blocked"] is True and profile["entries"] == [] and profile["stats"] is None
    assert profile["member"]["username"] == "user2"
    # Engellenen icin engelleyen yok (banli hesap gibi).
    assert status_of(lambda: RK.rankit_member_detail(1, user=who(2))) == 404
    assert status_of(lambda: RK.rankit_shelf(member_id=2, sort="newest", limit=100, offset=0,
                                             user=who(1))) == 404
    assert 1 not in [p["id"] for p in RK.rankit_discover_people(q="user", offset=0, limit=20,
                                                                  user=who(2))["people"]]


def test_block_empties_the_friends_feed(db):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(1,'user',2)")
    feed = lambda: RK.rankit_activity(scope="following", limit=30, offset=0, tz_offset=0, user=who(1))
    assert [i["entry_id"] for i in feed()["items"]] == [REVIEW]
    block(2, 1)
    assert feed()["items"] == []


def test_block_silences_notifications_old_and_new(db):
    RK.toggle_review_like(REVIEW, user=who(1))          # 1 -> 2: respect bildirimi
    items = lambda: [n for n in RK.rankit_notifications(tz=0, user=who(2))["items"] if n.get("actor")]
    assert [n["actor"] for n in items()] == ["user1"]
    block(2, 1)
    assert items() == []                                # eski satir da gorunmez
    RK.rankit_unblock(1, user=who(2))
    block(1, 2)                                         # bu kez engelleyen 1
    assert items() == []
    with DB.get_conn() as c:
        RK.rankit_notify.notify(c, 2, "follow", actor_id=1)
        assert c.execute("SELECT COUNT(*) FROM rankit_notifications WHERE kind='follow'").fetchone()[0] == 0


def test_block_hides_chat_history(db):
    assert MESSAGE in [m["id"] for m in RK.watchalong_history(LIVE, before_id=None, limit=100, user=who(1))["messages"]]
    block(1, 2)
    assert RK.watchalong_history(LIVE, before_id=None, limit=100, user=who(1))["messages"] == []
    assert MESSAGE in [m["id"] for m in RK.watchalong_history(LIVE, before_id=None, limit=100, user=who(3))["messages"]]


def test_block_does_not_touch_community_totals(db):
    before = RK.rankit_match(FINISHED, user=who(1))
    block(1, 2)
    after = RK.rankit_match(FINISHED, user=who(1))
    for key in ("rating_count", "community_rating", "classic_count"):
        assert before[key] == after[key]
    stats = RK.rankit_match_reviews(FINISHED, user=who(1))
    assert stats["rating_count"] == 2


def test_live_chat_is_not_delivered_across_a_block(db, monkeypatch):
    # Test istemcisi her soketi ayri olay dongusunde acar; odadaki yayini
    # alici secimi uzerinden dogruluyoruz (soketin kendisi asagida).
    peers = {uid: object() for uid in (1, 2, 3)}
    key = (LIVE, "community")
    monkeypatch.setitem(RK.WATCHALONG_CONNECTIONS, key, list(peers.values()))
    for uid, peer in peers.items():
        monkeypatch.setitem(RK.WATCHALONG_UIDS, peer, uid)
    block(1, 2)
    with DB.get_conn() as c:
        got = lambda sender: sorted(uid for uid, p in peers.items()
                                    if p in RK._watchalong_recipients(c, key, sender))
        assert got(2) == [2, 3]          # 1 engelledi: 2'nin mesaji 1'e gitmez
        assert got(1) == [1, 3]          # iki yonlu: 1'in mesaji da 2'ye gitmez
        assert got(3) == [1, 2, 3]


def test_chat_socket_carries_the_author_and_refuses_links(db):
    app = FastAPI()
    app.include_router(RK.router)
    api = TestClient(app)
    with api.websocket_connect(f"/api/rankit/ws/watchalong/{LIVE}?token={create_token(2, 'user')}") as ws:
        ws.send_json({"content": "free bets at www.bets.io", "client_id": "a1"})
        err = ws.receive_json()
        assert err["type"] == "error" and err["error"] == W.MESSAGE_LINKS
        ws.send_json({"content": "hello room", "client_id": "a2"})
        assert ws.receive_json()["message"]["user_id"] == 2
    assert one("SELECT COUNT(*) FROM rankit_watchalong_messages WHERE content LIKE '%bets%'")[0] == 0


# ── Hesap silme ──────────────────────────────────────────────────────────────

def test_deleting_an_account_clears_its_reports_and_blocks(db):
    import api.main as M
    report(1, "review", REVIEW)
    report(2, "user", 3)
    block(1, 2)
    block(3, 1)
    with DB.get_conn() as c:
        M._delete_account(c, 1)
        assert c.execute("SELECT COUNT(*) FROM rankit_reports WHERE reporter_id=1").fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM rankit_blocks WHERE 1 IN (blocker_id, blocked_id)").fetchone()[0] == 0
        M._delete_account(c, 2)                             # icerik sahibi: hakkindaki sikayetler de gider
        assert c.execute("SELECT COUNT(*) FROM rankit_reports").fetchone()[0] == 0


# ── Kayit: kullanici adi filtresi ve sartlarin kabulu (B4, B7) ───────────────

def test_register_filters_usernames_and_records_accepted_terms(db):
    import api.main as M
    M._RL.clear()
    M._AUTH_HITS.clear()
    with TestClient(M.app) as api:
        def reg(name, **extra):
            return api.post("/api/auth/register", json={"email": f"{name}@x.test", "username": name,
                                                        "password": "secret12", **extra})
        assert reg("orospu_cocugu", accept_terms=True).status_code == 400
        assert reg("fan1907", accept_terms=False).status_code == 400
        agreed = reg("fan1907", accept_terms=True)
        assert agreed.status_code == 200
        me = lambda token: api.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert me(agreed.json()["token"])["terms_current"] is True
        # Onay kutusundan onceki onbellekli istemci: kayit olur, bant cikar.
        legacy = reg("oldclient").json()["token"]
        assert me(legacy)["terms_current"] is False
        assert api.post("/api/account/accept-terms",
                        headers={"Authorization": f"Bearer {legacy}"}).json()["terms_current"] is True
        assert me(legacy)["terms_current"] is True
    M._RL.clear()
    M._AUTH_HITS.clear()
