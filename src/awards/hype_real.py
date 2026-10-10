# -*- coding: utf-8 -*-
"""Gerçek hype indeksi: YouTube yorumları → (Claude ile) anlamsal sınıflandırma → oyuncu başına halkın beklentisi.

Videodaki yöntemin birebir karşılığı:
  1. Yorumlar (YouTube Data API v3, resmî uç nokta; kazıma yok) oyuncu adlarıyla eşleştirilir.
  2. Her (yorum, oyuncu) çifti duygu değil ANLAM sınıfına girer: gelecek beklentisi / zaten kanıtlandı / şüpheci / ilgisiz.
     ("Black gerçekten iyi olacak" ile "Black zaten gerçekten iyi" aynı duyguda, farklı anlamda.)
  3. Tek bir yorum kamuoyu değildir: oyuncu başına skor, kaynağın (videonun) normal beklenti düzeyine doğru küçültülür (shrinkage).
  4. Bir oyuncu bir kaynakta hiç anılmadıysa o kaynak için EKSİK veridir, sıfır hype değil.
  5. Güçlü iddia için en az 10 ilgili yorum ve en az 2 kaynak şartı.

Gizlilik / koşullar: yorum METNİ saklanmaz; yalnız (video, yorum kimliğinin özeti, oyuncu, sınıf, güven) satırları yazılır.
Anahtarlar ortam değişkenlerinden: YOUTUBE_API_KEY, ANTHROPIC_API_KEY (kodda yok).

    python -m src.awards.hype_real --videos VIDEO_ID1,VIDEO_ID2 --players data/awards__mip_candidates.csv
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
LABELS_PATH = DATA / "awards__hype_labels.parquet"

CATEGORIES = ("future_expectation", "already_established", "skeptical", "irrelevant")
BELIEF = {"future_expectation": 1.0, "already_established": 1.0, "skeptical": -1.0, "irrelevant": np.nan}
MIN_COMMENTS = 10           # güçlü iddia için ilgili yorum şartı (videodaki eşik)
MIN_SOURCES = 2
SHRINK_K = 5.0              # bir kaynakta oyuncunun yorum sayısı bunun yanında küçükse kaynağın ortalamasına yakın kalır
STOP_LAST_NAMES = {"williams", "johnson", "jones", "smith", "brown", "davis", "jackson", "thomas", "young", "white", "green", "james", "harris", "walker", "murray", "george", "black"}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


# ── Oyuncu eşleştirme ─────────────────────────────────────────────────────────

def build_alias_map(names: Iterable[str], extra: dict[str, str] | None = None) -> dict[str, str]:
    """alias (katlanmış) → oyuncu. Tam ad her zaman; soyadı yalnız havuzda TEKİL ve ≥ 4 harfliyse ve yaygın bir soyad değilse
    ('Williams' gibi belirsiz adlar yorumda bir oyuncuya bağlanmaz)."""
    names = list(dict.fromkeys(names))
    out: dict[str, str] = {}
    last_count: dict[str, int] = {}
    for n in names:
        parts = fold(n).split()
        if parts:
            last_count[parts[-1]] = last_count.get(parts[-1], 0) + 1
    for n in names:
        f = fold(n)
        if not f:
            continue
        out[f] = n
        last = f.split()[-1]
        if last_count.get(last) == 1 and len(last) >= 4 and last not in STOP_LAST_NAMES:
            out.setdefault(last, n)
    for alias, n in (extra or {}).items():
        out[fold(alias)] = n
    return out


def match_players(text: str, alias_map: dict[str, str]) -> list[str]:
    f = f" {fold(text)} "
    hit = {n for a, n in alias_map.items() if f" {a} " in f}
    return sorted(hit)


# ── Yorum çekimi (YouTube Data API v3) ─────────────────────────────────────────

def youtube_comments(video_id: str, api_key: str | None = None, max_comments: int = 3000, session=None) -> Iterable[tuple[str, str]]:
    """(yorum_kimliği, metin) üretir. Her sayfa 100 yorum ve 1 kota birimi; resmî API."""
    import requests
    key = api_key or os.environ.get("YOUTUBE_API_KEY")
    if not key:
        raise RuntimeError("YOUTUBE_API_KEY tanımlı değil")
    s = session or requests
    token, got = None, 0
    while got < max_comments:
        params = {"part": "snippet", "videoId": video_id, "maxResults": 100, "order": "relevance", "textFormat": "plainText", "key": key}
        if token:
            params["pageToken"] = token
        r = s.get("https://www.googleapis.com/youtube/v3/commentThreads", params=params, timeout=20)
        r.raise_for_status()
        js = r.json()
        for it in js.get("items", []):
            sn = it["snippet"]["topLevelComment"]["snippet"]
            yield it["id"], sn.get("textDisplay", "")
            got += 1
        token = js.get("nextPageToken")
        if not token:
            break


# ── Sınıflandırma (Claude) ─────────────────────────────────────────────────────

PROMPT = """You classify NBA fan comments. For each comment you get the list of players it mentions.
For EACH (comment, player) pair choose exactly one category describing what the comment claims about that player:
- future_expectation: expects the player to become good / a star / break out (about the future)
- already_established: says the player is already good / a star / proven (about the present)
- skeptical: doubts, mocks or downplays the player (overrated, bust, will not improve)
- irrelevant: mentions the player without a claim about their level or future (jokes, trade talk, injuries, lists)
Give a confidence from 0 to 1. Answer with JSON only: a list of {"id": <comment id>, "player": <player>, "category": <one of the four>, "confidence": <0-1>}.
"""


def claude_classifier(model: str = "claude-haiku-4-5-20251001", client=None, batch: int = 20) -> Callable[[list[dict]], list[dict]]:
    """items: [{"id", "text", "players"}] → [{"id", "player", "category", "confidence"}]. Metin yalnız istekte gider, saklanmaz."""
    def _client():
        if client is not None:
            return client
        import anthropic
        return anthropic.Anthropic()

    def run(items: list[dict]) -> list[dict]:
        cl = _client()
        out: list[dict] = []
        for i in range(0, len(items), batch):
            chunk = items[i:i + batch]
            payload = [{"id": c["id"], "players": c["players"], "text": c["text"][:600]} for c in chunk]
            msg = cl.messages.create(model=model, max_tokens=2000, system=PROMPT,
                                     messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
            text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
            m = re.search(r"\[.*\]", text, flags=re.S)
            try:
                rows = json.loads(m.group(0)) if m else []
            except json.JSONDecodeError:
                rows = []
            ids = {c["id"]: set(c["players"]) for c in chunk}
            for r in rows:
                if r.get("id") in ids and r.get("player") in ids[r["id"]] and r.get("category") in CATEGORIES:
                    out.append({"id": r["id"], "player": r["player"], "category": r["category"],
                                "confidence": float(np.clip(r.get("confidence", 0.5), 0.0, 1.0))})
        return out
    return run


# ── Toplama ve saklama ────────────────────────────────────────────────────────

def _digest(video_id: str, comment_id: str) -> str:
    return hashlib.sha256(f"{video_id}:{comment_id}".encode()).hexdigest()[:20]


def collect(video_ids: list[str], players: list[str], classifier: Callable[[list[dict]], list[dict]],
            fetcher: Callable[[str], Iterable[tuple[str, str]]] = youtube_comments, extra_aliases: dict[str, str] | None = None,
            path: Path = LABELS_PATH) -> pd.DataFrame:
    """Videoları dolaşır, oyuncu anan yorumları sınıflandırır, etiket satırlarını `path`'e ekler (yinelemesiz). Dönüş: tüm etiketler."""
    aliases = build_alias_map(players, extra_aliases)
    rows: list[dict] = []
    for vid in video_ids:
        items, seen = [], set()
        for cid, text in fetcher(vid):
            pl = match_players(text, aliases)
            if pl and cid not in seen:
                seen.add(cid)
                items.append({"id": cid, "text": text, "players": pl})
        for r in classifier(items):
            rows.append({"video": vid, "comment": _digest(vid, r["id"]), "player": r["player"], "category": r["category"], "confidence": r["confidence"]})
    new = pd.DataFrame(rows, columns=["video", "comment", "player", "category", "confidence"])
    if path.exists():
        new = pd.concat([pd.read_parquet(path), new], ignore_index=True)
    new = new.drop_duplicates(["video", "comment", "player"], keep="last").reset_index(drop=True)
    new.to_parquet(path)
    return new


# ── Hype indeksi ──────────────────────────────────────────────────────────────

def aggregate(labels: pd.DataFrame, k: float = SHRINK_K, min_conf: float = 0.5) -> pd.DataFrame:
    """Oyuncu başına: ilgili yorum sayısı, kaynak sayısı, hype (küçültülmüş inanç ortalaması, [-1, 1]) ve `supported` (≥10 yorum, ≥2 kaynak).
    İlgisiz etiketler ve düşük güvenli (conf < min_conf) satırlar hesaba girmez; bir kaynakta anılmayan oyuncu o kaynak için eksik sayılır."""
    d = labels[(labels["category"] != "irrelevant") & (labels["confidence"] >= min_conf)].copy()
    if d.empty:
        return pd.DataFrame(columns=["player", "n", "sources", "hype", "supported", "future", "established", "skeptical"])
    d["belief"] = d["category"].map(BELIEF)
    src_mean = d.groupby("video")["belief"].mean()                       # kaynağın "normal" beklenti düzeyi
    g = d.groupby(["player", "video"])["belief"].agg(["sum", "count"]).reset_index()
    g["m"] = g["video"].map(src_mean)
    g["h"] = (g["sum"] + k * g["m"]) / (g["count"] + k)                  # kaynağın ortalamasına doğru küçültme
    rows = []
    for p, gg in g.groupby("player"):
        n = int(gg["count"].sum())
        # kaynaklar yorum sayısıyla ağırlıklanır; yalnız anıldığı kaynaklar
        hype = float((gg["h"] * gg["count"]).sum() / max(n, 1))
        cats = d[d["player"] == p]["category"].value_counts()
        rows.append({"player": p, "n": n, "sources": int(gg["video"].nunique()), "hype": hype,
                     "supported": bool(n >= MIN_COMMENTS and gg["video"].nunique() >= MIN_SOURCES),
                     "future": int(cats.get("future_expectation", 0)), "established": int(cats.get("already_established", 0)),
                     "skeptical": int(cats.get("skeptical", 0))})
    return pd.DataFrame(rows).sort_values("hype", ascending=False).reset_index(drop=True)


def hype_z(agg: pd.DataFrame, only_supported: bool = True) -> pd.Series:
    """Oyuncu → hype z-skoru (desteklenenler arasında); desteklenmeyen / bilinmeyen oyuncu NaN (eksik veri, sıfır değil)."""
    a = agg[agg["supported"]] if only_supported else agg
    if len(a) < 3:
        return pd.Series(dtype=float)
    z = (a["hype"] - a["hype"].mean()) / (a["hype"].std(ddof=0) + 1e-9)
    return pd.Series(z.to_numpy(), index=a["player"].to_numpy())


def apply_real_hype(cands: pd.DataFrame, z: pd.Series, lam: float, score_col: str = "score", name_col: str = "PLAYER_NAME") -> pd.DataFrame:
    """skor' = skor − λ·hype_z; hype'ı bilinmeyen oyuncu cezasız kalır ve `hype_known=False` işaretlenir (eksik veri ≠ sıfır hype)."""
    d = cands.copy()
    d["hype_z"] = d[name_col].map(z)
    d["hype_known"] = d["hype_z"].notna()
    d["score_hype"] = d[score_col] - lam * d["hype_z"].fillna(0.0)
    return d.sort_values("score_hype", ascending=False)


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--videos", required=True, help="virgülle ayrılmış YouTube video kimlikleri")
    ap.add_argument("--players", required=True, help="oyuncu adları: CSV (PLAYER_NAME sütunu) ya da satır başına bir ad")
    ap.add_argument("--max", type=int, default=3000)
    a = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    p = Path(a.players)
    names = pd.read_csv(p)["PLAYER_NAME"].tolist() if p.suffix == ".csv" else [x.strip() for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
    labels = collect([v.strip() for v in a.videos.split(",") if v.strip()], names, claude_classifier(),
                     fetcher=lambda v: youtube_comments(v, max_comments=a.max))
    agg = aggregate(labels)
    print(agg.head(20).to_string(index=False))
    print(f"\n{len(labels)} etiket, {agg['supported'].sum()} oyuncu 'desteklenen' (≥{MIN_COMMENTS} yorum, ≥{MIN_SOURCES} kaynak)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
