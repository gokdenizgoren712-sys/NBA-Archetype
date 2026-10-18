"""SofaScore istemcisi: voleybol, Basketbol Super Ligi ve Turk kupalari.

Sahibin karari (2026-10-18): Turkiye lansmani icin voleybol ve BSL "simdilik"
SofaScore'dan. Resmi olmayan bir uc -- FotMob'la ayni risk sinifi: kullanim
sartlari, engellenme, habersiz sema degisikligi. Lisansli saglayiciya gecis
lansman sonrasi (docs/RANKIT_SPORTS_EXPANSION_AND_LAUNCH_ACCELERATION.md).

Korumalar
---------
* Yarisma kimlikleri SABIT YAZILMADI. Ulke kategorisinden ADLA bulunur ve
  kayittaki beklentiyle (rankit_competitions.name_matches) dogrulanir. Tek
  aday yoksa hata: yanlis lig iceri alinmaz, aday adlari gunluge yazilir.
  Elle sabitlemek icin: SOFASCORE_TOURNAMENT_IDS='{"bsl": 519, ...}'.
* Istekler arasinda bekleme; 403/429'da geri cekilme, ust uste engelde
  Blocked -- tur o saglayici icin durur, digerleri etkilenmez.
* Armalar kullanilmaz (Paket E): takim rengi + kisa ad.

Bu dosya SAF eslemeyi ve HTTP'yi tasir; veritabanina yazan senkron
src/rankit_sync.sync_sofascore, canli guncelleme api/rankit_live_sync.
Testler HTTP'yi `get` parametresiyle sahte bir fonksiyonla degistirir.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Callable, Optional

from . import rankit_competitions as rc

API = os.environ.get("SOFASCORE_API", "https://api.sofascore.com/api/v1").rstrip("/")
PAUSE_SECONDS = float(os.environ.get("SOFASCORE_PAUSE", "0.6"))
MAX_PAGES = 25
MAX_BLOCK_STREAK = 4
WOMEN_SUFFIX = " (W)"


class Blocked(RuntimeError):
    """Saglayici ust uste 403/429 dondu: bu tur icin vazgec."""


_streak = 0


def http_get(path: str, tries: int = 3) -> Optional[dict]:
    """GET {API}{path}. 404 -> None. 403/429 -> geri cekil, sonra Blocked."""
    global _streak
    from curl_cffi import requests

    for attempt in range(tries):
        time.sleep(PAUSE_SECONDS)
        try:
            response = requests.get(f"{API}{path}", impersonate="chrome124", timeout=25,
                                    headers={"Referer": "https://www.sofascore.com/",
                                             "Origin": "https://www.sofascore.com"})
        except Exception:
            time.sleep(3 * (attempt + 1))
            continue
        if response.status_code == 200:
            _streak = 0
            try:
                return response.json()
            except ValueError:
                return None
        if response.status_code == 404:
            _streak = 0
            return None
        if response.status_code in (403, 429):
            _streak += 1
            if _streak >= MAX_BLOCK_STREAK:
                raise Blocked(f"{_streak} consecutive {response.status_code} from SofaScore")
            time.sleep(10 * (attempt + 1))
    return None


Getter = Callable[[str], Optional[dict]]


# ── Kimlik cozumu ────────────────────────────────────────────────────────────

def _pinned() -> dict:
    try:
        return {str(k): int(v) for k, v in json.loads(os.environ.get("SOFASCORE_TOURNAMENT_IDS") or "{}").items()}
    except (ValueError, TypeError):
        return {}


def _categories(sport: str, region: str, get: Getter) -> list[dict]:
    """Ulke kodu (TR) ya da "EU" (Avrupa / Uluslararasi kategorileri)."""
    rows = (get(f"/sport/{sport}/categories") or {}).get("categories") or []
    if region == "EU":
        return [c for c in rows if any(w in rc.fold(c.get("name") or c.get("slug") or "")
                                       for w in ("europe", "international"))]
    return [c for c in rows if str(c.get("alpha2") or "").upper() == region
            or rc.fold(c.get("name") or "") == {"TR": "turkey", "TR2": "turkiye"}.get(region, "")]


def _tournaments(category_id: int, get: Getter) -> list[dict]:
    payload = get(f"/category/{category_id}/unique-tournaments") or {}
    found = [t for group in payload.get("groups") or [] for t in group.get("uniqueTournaments") or []]
    return found or (payload.get("uniqueTournaments") or [])


def resolve_tournament(comp: rc.Competition, get: Getter) -> tuple[int, str]:
    """(SofaScore unique-tournament kimligi, saglayicidaki adi)."""
    pinned = _pinned().get(comp.key)
    if pinned:
        info = (get(f"/unique-tournament/{pinned}") or {}).get("uniqueTournament") or {}
        name = info.get("name") or ""
        if name and not rc.name_matches(comp, name):
            raise LookupError(f"{comp.key}: pinned id {pinned} is '{name}', not this competition")
        return pinned, name
    sport, region = comp.source
    candidates, seen = [], []
    for category in _categories(sport, region, get):
        for item in _tournaments(category["id"], get):
            seen.append(item.get("name") or "")
            if rc.name_matches(comp, item.get("name") or ""):
                candidates.append(item)
    unique = {item["id"]: item for item in candidates if item.get("id")}
    if len(unique) != 1:
        raise LookupError(f"{comp.key}: {len(unique)} SofaScore matches "
                          f"({', '.join(sorted({c.get('name') or '' for c in unique.values()})) or 'none'}); "
                          f"seen: {', '.join(sorted(set(seen)))[:400]}")
    item = next(iter(unique.values()))
    return int(item["id"]), item.get("name") or ""


def season_ids(tournament_id: int, season: str, get: Getter) -> list[int]:
    """Bizim "2025-26" sezonumuza dusen SofaScore sezonlari.

    Iki yillik ad ("25/26", "2025/2026") once; yoksa tek yillik sezonlar
    (Super Kupa, CEV final asamasi): baslangic ya da bitis yili. Tarihi pencere
    disinda kalan maclar yine events() sonrasinda elenir."""
    start = int(season.split("-")[0])
    yy, ny = str(start)[-2:], str(start + 1)[-2:]
    rows = (get(f"/unique-tournament/{tournament_id}/seasons") or {}).get("seasons") or []
    two = [r for r in rows if str(r.get("year") or r.get("name") or "").replace(" ", "") .endswith(
        (f"{yy}/{ny}", f"{start}/{start + 1}", f"{start}/{ny}"))]
    if two:
        return [int(r["id"]) for r in two]
    return [int(r["id"]) for r in rows if str(r.get("year") or "").strip() in (str(start), str(start + 1))]


def events(tournament_id: int, season_id: int, get: Getter) -> list[dict]:
    """Sezonun tum maclari: gecmis ve gelecek sayfalari, tekrarsiz."""
    seen: dict[int, dict] = {}
    for direction in ("last", "next"):
        for page in range(MAX_PAGES):
            payload = get(f"/unique-tournament/{tournament_id}/season/{season_id}/events/{direction}/{page}")
            if not payload:
                break
            for event in payload.get("events") or []:
                if event.get("id") is not None:
                    seen[int(event["id"])] = event
            if not payload.get("hasNextPage"):
                break
    return list(seen.values())


# ── Esleme ───────────────────────────────────────────────────────────────────

LIVE_TYPES = {"inprogress"}
SKIP_TYPES = {"canceled", "cancelled", "abandoned", "removed", "deleted"}


def status_of(event: dict) -> Optional[str]:
    """upcoming | live | finished; iptal edilmis mac None (iceri alinmaz)."""
    kind = str((event.get("status") or {}).get("type") or "").lower()
    if kind in SKIP_TYPES:
        return None
    if kind == "finished":
        return "finished"
    if kind in LIVE_TYPES:
        return "live"
    return "upcoming"     # notstarted, postponed, delayed, interrupted


def starts_at(event: dict) -> str:
    stamp = event.get("startTimestamp")
    if not stamp:
        return ""
    return datetime.fromtimestamp(int(stamp), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def scores(event: dict, status: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """Voleybolda kazanilan set sayisi (3-1), basketbolda sayi."""
    if status not in ("live", "finished"):
        return None, None
    home = (event.get("homeScore") or {}).get("current")
    away = (event.get("awayScore") or {}).get("current")
    return (int(home) if isinstance(home, (int, float)) else None,
            int(away) if isinstance(away, (int, float)) else None)


def stage_of(event: dict, comp: rc.Competition) -> str:
    info = event.get("roundInfo") or {}
    name = str(info.get("name") or "").strip()
    number = info.get("round")
    if name:
        return name
    if comp.mode == "supercup":
        return "Final"
    if isinstance(number, int):
        return f"Matchday {number}" if comp.mode == "league" else f"Round {number}"
    return ""


def in_season(event: dict, season: str) -> bool:
    start = int(season.split("-")[0])
    day = starts_at(event)[:10]
    return bool(day) and f"{start}-07-01" <= day < f"{start + 1}-07-01"


def team_name(side: dict, comp: rc.Competition) -> str:
    """Kadin takimi ayri satir: "Fenerbahce Medicana" -> "Fenerbahce Medicana (W)"."""
    name = str(side.get("name") or "").strip()
    if comp.women and name:
        for tail in (", Women", " Women", " W", " (W)", " Kadin", " Kadın"):
            if name.endswith(tail):
                name = name[: -len(tail)].rstrip()
                break
        name += WOMEN_SUFFIX
    return name
