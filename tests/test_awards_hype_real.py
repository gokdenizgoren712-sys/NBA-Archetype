# -*- coding: utf-8 -*-
"""Gerçek hype hattı: oyuncu eşleştirme, toplama, küçültme, eksik veri ve gizlilik (ağ ve gerçek API yok)."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from src.awards import hype_real as hr  # noqa: E402

POOL = ["Cooper Flagg", "Alperen Şengün", "Jalen Williams", "Jaylin Williams", "Victor Wembanyama", "Anthony Black", "Reed Sheppard", "Alex Sarr"]


def test_full_names_always_match_and_diacritics_are_folded():
    al = hr.build_alias_map(POOL)
    assert hr.match_players("Sengun is a monster", al) == ["Alperen Şengün"]
    assert hr.match_players("Alperen Şengün > everyone", al) == ["Alperen Şengün"]
    assert hr.match_players("flagg and wembanyama next year", al) == ["Cooper Flagg", "Victor Wembanyama"]


def test_ambiguous_or_common_last_names_do_not_bind_to_a_player():
    al = hr.build_alias_map(POOL)
    assert hr.match_players("Williams will be great", al) == []                       # iki Williams: belirsiz
    assert hr.match_players("Black is underrated", al) == []                          # yaygın soyad listesi
    assert hr.match_players("Jalen Williams is great", al) == ["Jalen Williams"]       # tam ad bağlanır
    assert hr.match_players("shepard", al) == []                                      # yanlış yazılış eşleşmez (sessizce yanlış oyuncu yok)
    assert hr.match_players("sheppard", al) == ["Reed Sheppard"]                       # doğru yazılış tekil soyadıyla bağlanır


def test_extra_aliases_are_honoured():
    al = hr.build_alias_map(POOL, {"wemby": "Victor Wembanyama"})
    assert hr.match_players("Wemby is different", al) == ["Victor Wembanyama"]


def _fake_classifier(rules):
    def run(items):
        out = []
        for it in items:
            for p in it["players"]:
                cat = next((c for k, c in rules.items() if k in it["text"].lower()), "irrelevant")
                out.append({"id": it["id"], "player": p, "category": cat, "confidence": 0.9})
        return out
    return run


RULES = {"will be": "future_expectation", "already": "already_established", "overrated": "skeptical"}


def _fetcher(by_video):
    return lambda vid: iter(by_video[vid])


def test_collect_never_stores_comment_text_and_dedupes(tmp_path):
    comments = {"v1": [("c1", "Flagg will be a superstar"), ("c2", "Flagg is already great"), ("c3", "nothing relevant here")]}
    path = tmp_path / "labels.parquet"
    a = hr.collect(["v1"], POOL, _fake_classifier(RULES), _fetcher(comments), path=path)
    assert set(a.columns) == {"video", "comment", "player", "category", "confidence"}          # metin / kullanıcı yok
    assert len(a) == 2 and a["comment"].str.len().eq(20).all() and not a["comment"].isin(["c1", "c2"]).any()   # kimlik özeti
    b = hr.collect(["v1"], POOL, _fake_classifier(RULES), _fetcher(comments), path=path)
    assert len(b) == 2                                                                         # aynı yorumlar tekrar eklenmez


def _labels(rows):
    return pd.DataFrame(rows, columns=["video", "comment", "player", "category", "confidence"])


def _many(player, video, n, cat, conf=0.9, start=0):
    return [(video, f"{video}-{player}-{start + i}", player, cat, conf) for i in range(n)]


def test_missing_in_a_source_is_missing_not_zero_and_support_needs_two_sources_and_ten_comments():
    rows = (_many("A", "v1", 8, "future_expectation") + _many("A", "v2", 4, "future_expectation")      # 12 yorum, 2 kaynak → desteklenir
            + _many("B", "v1", 15, "future_expectation")                                              # 15 yorum ama tek kaynak → desteklenmez
            + _many("C", "v1", 4, "skeptical") + _many("C", "v2", 3, "skeptical"))                    # 7 yorum, 2 kaynak → desteklenmez
    agg = hr.aggregate(_labels(rows)).set_index("player")
    assert bool(agg.loc["A", "supported"]) and not bool(agg.loc["B", "supported"]) and not bool(agg.loc["C", "supported"])
    assert agg.loc["A", "n"] == 12 and agg.loc["A", "sources"] == 2
    z = hr.hype_z(hr.aggregate(_labels(rows + _many("D", "v1", 6, "future_expectation") + _many("D", "v2", 6, "already_established")
                                       + _many("E", "v1", 6, "skeptical") + _many("E", "v2", 6, "skeptical"))))
    assert set(z.index) == {"A", "D", "E"} and "B" not in z.index                                   # desteklenmeyen oyuncu NaN (z'de yok)
    assert z["E"] < z["A"] and z["E"] < z["D"]                                                      # şüpheciler en altta


def test_shrinkage_pulls_a_tiny_sample_toward_the_source_average():
    base = _many("X", "v1", 40, "future_expectation") + _many("Y", "v1", 40, "skeptical")            # kaynak ortalaması ~0
    tiny = _many("T", "v1", 1, "future_expectation")                                                 # tek yorum, tam +1
    agg = hr.aggregate(_labels(base + tiny)).set_index("player")
    assert agg.loc["X", "hype"] > 0.85 and agg.loc["Y", "hype"] < -0.85                              # büyük örnek ham değerine yakın
    assert 0.0 < agg.loc["T", "hype"] < 0.4                                                          # tek yorum +1 olmaz: kaynağa doğru çekildi


def test_low_confidence_and_irrelevant_labels_are_ignored():
    rows = _many("A", "v1", 12, "future_expectation") + _many("A", "v2", 12, "irrelevant") + _many("A", "v2", 12, "skeptical", conf=0.2)
    agg = hr.aggregate(_labels(rows)).set_index("player")
    assert agg.loc["A", "n"] == 12 and agg.loc["A", "sources"] == 1


def test_apply_real_hype_ranks_and_flags_unknown_players_without_penalty():
    z = pd.Series({"Cooper Flagg": 2.0, "Alex Sarr": -1.0})
    cands = pd.DataFrame({"PLAYER_NAME": ["Cooper Flagg", "Alex Sarr", "Reed Sheppard"], "score": [1.0, 0.7, 0.9]})
    out = hr.apply_real_hype(cands, z, lam=0.4)
    assert list(out["PLAYER_NAME"]) == ["Alex Sarr", "Reed Sheppard", "Cooper Flagg"]                # Sarr 0.7+0.4=1.1, Sheppard 0.9 (hype bilinmiyor), Flagg 1.0−0.8=0.2
    r = out.set_index("PLAYER_NAME")
    assert not bool(r.loc["Reed Sheppard", "hype_known"]) and r.loc["Reed Sheppard", "score_hype"] == pytest.approx(0.9)   # bilinmiyor: cezasız
    assert r.loc["Cooper Flagg", "score_hype"] == pytest.approx(1.0 - 0.4 * 2.0)


class _Msg:
    def __init__(self, text):
        self.content = [type("B", (), {"type": "text", "text": text})()]


class _FakeClient:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        return _Msg(self.replies.pop(0))


def test_claude_classifier_parses_json_batches_and_rejects_invented_players_or_categories():
    items = [{"id": f"c{i}", "text": "Flagg will be great", "players": ["Cooper Flagg"]} for i in range(3)]
    reply = json.dumps([{"id": "c0", "player": "Cooper Flagg", "category": "future_expectation", "confidence": 0.8},
                        {"id": "c1", "player": "Someone Else", "category": "future_expectation", "confidence": 0.9},       # yorumda anılmayan oyuncu
                        {"id": "c2", "player": "Cooper Flagg", "category": "bogus", "confidence": 0.9}])                    # geçersiz sınıf
    fake = _FakeClient(["Here you go:\n" + reply])
    out = hr.claude_classifier(client=fake, batch=20)(items)
    assert out == [{"id": "c0", "player": "Cooper Flagg", "category": "future_expectation", "confidence": 0.8}]
    assert len(fake.calls) == 1 and "claude" in fake.calls[0]["model"]


def test_claude_classifier_survives_malformed_replies():
    items = [{"id": "c0", "text": "x", "players": ["Cooper Flagg"]}]
    assert hr.claude_classifier(client=_FakeClient(["not json at all"]))(items) == []


def test_youtube_fetcher_pages_and_stops(monkeypatch):
    pages = [{"items": [{"id": "a", "snippet": {"topLevelComment": {"snippet": {"textDisplay": "one"}}}}], "nextPageToken": "t2"},
             {"items": [{"id": "b", "snippet": {"topLevelComment": {"snippet": {"textDisplay": "two"}}}}]}]

    class R:
        def __init__(self, js):
            self.js = js
        def raise_for_status(self):
            pass
        def json(self):
            return self.js

    class S:
        def __init__(self):
            self.n = 0
        def get(self, url, params, timeout):
            assert params["key"] == "k" and params["videoId"] == "vid"
            r = R(pages[self.n]); self.n += 1
            return r
    assert list(hr.youtube_comments("vid", api_key="k", session=S())) == [("a", "one"), ("b", "two")]
    monkeypatch.delenv("YOUTUBE_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        list(hr.youtube_comments("vid"))
