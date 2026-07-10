"""
NBA Arketip API — FastAPI backend
Parquet dosyalarını okuyup JSON olarak sunar.
"""

import sys, json, os, time, logging, secrets, smtplib
from pathlib import Path
from functools import lru_cache
from typing import Optional
from email.mime.text import MIMEText
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
from fastapi import FastAPI, Query, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse, JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parent.parent
# Render disk mount path override (env var DATA_DIR ile dışarıdan ayarlanabilir)
DATA = Path(os.environ.get("DATA_DIR", str(ROOT / "data")))
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from signatures import COMPONENT_SIGNATURES, CORE_NOUNS, MODIFIER_TAGS, POSITION_COMPONENTS
from roles import ROLE_SLOTS, compute_role_vec

COMP_COLS = CORE_NOUNS        # uyum hesabı sadece core noun
ALL_COMP_COLS = CORE_NOUNS + MODIFIER_TAGS
CORE      = CORE_NOUNS        # geriye dönük alias

app = FastAPI(title="NBA Arketip API", version="1.0.0")

# Tüm unhandled exception'ları JSON olarak döndür (Starlette'in plain-text 500'ünü geç)
import traceback as _tb
@app.exception_handler(Exception)
async def _json_500(request: Request, exc: Exception):
    logging.error(f"Unhandled exception: {type(exc).__name__}: {exc}\n{_tb.format_exc()}")
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})

# ─── Middleware ────────────────────────────────────────────────────────────────

IS_PROD   = (os.environ.get("RENDER") == "true"
             or os.environ.get("RAILWAY_ENVIRONMENT") is not None
             or os.environ.get("IS_PROD") == "true")
SMTP_HOST        = os.environ.get("SMTP_HOST", "")
SMTP_PORT        = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER        = os.environ.get("SMTP_USER", "")
SMTP_PASS        = os.environ.get("SMTP_PASS", "")
SMTP_FROM        = os.environ.get("SMTP_FROM", SMTP_USER)
SITE_URL         = os.environ.get("SITE_URL", "https://nba-archetype.onrender.com")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

def _send_email(to: str, subject: str, html: str):
    if not SMTP_HOST or not SMTP_USER:
        logging.warning("SMTP not configured — skipping email to %s", to)
        return
    try:
        msg = MIMEText(html, "html")
        msg["Subject"] = subject
        msg["From"]    = SMTP_FROM
        msg["To"]      = to
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
    except Exception as e:
        logging.error("Email send failed: %s", e)

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[SITE_URL] if IS_PROD else ["*"],
    allow_methods=["GET", "POST", "DELETE", "PUT"],
    allow_headers=["Authorization", "Content-Type"],
)

# Güvenlik header'ları
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Request loglama (yavaş endpoint tespiti)
@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = int((time.perf_counter() - t0) * 1000)
    if ms > 500:
        logging.warning(f"SLOW {request.method} {request.url.path} {ms}ms")
    elif request.url.path.startswith("/api"):
        logging.info(f"{request.method} {request.url.path} {response.status_code} {ms}ms")
    return response

# ─── In-process response cache ────────────────────────────────────────────────
import hashlib, threading
_RESP_CACHE: dict = {}          # key → (ts, body)
_CACHE_TTL  = 300               # 5 dakika
_CACHE_LOCK = threading.Lock()
_CACHE_MAX  = 200               # maksimum entry

def _cache_key(path: str, params: dict) -> str:
    raw = path + "|" + json.dumps(params, sort_keys=True)
    return hashlib.md5(raw.encode()).hexdigest()

def cache_get(key: str):
    with _CACHE_LOCK:
        entry = _RESP_CACHE.get(key)
        if entry and (time.time() - entry[0]) < _CACHE_TTL:
            return entry[1]
        if entry:
            del _RESP_CACHE[key]
    return None

def cache_set(key: str, value):
    with _CACHE_LOCK:
        if len(_RESP_CACHE) >= _CACHE_MAX:
            oldest = min(_RESP_CACHE, key=lambda k: _RESP_CACHE[k][0])
            del _RESP_CACHE[oldest]
        _RESP_CACHE[key] = (time.time(), value)

# ─── Rate limiter (IP başına) ──────────────────────────────────────────────────
_RL: dict = {}   # ip → [timestamps]
_RL_LOCK = threading.Lock()
RL_WINDOW = 60   # saniye
RL_LIMIT  = 120  # istek / pencere

def _check_rate(ip: str) -> bool:
    now = time.time()
    with _RL_LOCK:
        hits = [t for t in _RL.get(ip, []) if now - t < RL_WINDOW]
        hits.append(now)
        _RL[ip] = hits
        return len(hits) > RL_LIMIT

@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.url.path.startswith("/api"):
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown").split(",")[0].strip()
        if _check_rate(ip):
            return JSONResponse({"detail": "Too many requests"}, status_code=429,
                                headers={"Retry-After": str(RL_WINDOW)})
    return await call_next(request)


# ─── Cache: parquet dosyalarını bir kez yükle ──────────────────────────────────

def _fill_position_from_components(df: pd.DataFrame) -> pd.DataFrame:
    """Historical parquet'ta POSITION NaN ise:
    1. BBref position_lookup.parquet'ten gerçek pozisyonu al (build_position_lookup.py çıktısı)
    2. Yoksa Center/Big/Forward/Guard/Wing boolean kolonlarından + istatistiklerden tahmin et."""
    if "POSITION" not in df.columns:
        df = df.copy()
        df["POSITION"] = ""
    mask = df["POSITION"].isna() | (df["POSITION"].astype(str).str.strip() == "")
    if not mask.any():
        return df

    # --- Adım 1: BBref lookup ---
    lkp = _load_position_lookup()
    if not lkp.empty and "SEASON" in df.columns:
        lkp_idx = lkp.set_index(["PLAYER_NAME", "SEASON"])
        def _from_lookup(row):
            key = (row["PLAYER_NAME"], row["SEASON"])
            if key in lkp_idx.index:
                pos = lkp_idx.loc[key, "POS_PRIMARY"]
                if isinstance(pos, pd.Series):
                    pos = pos.iloc[0]
                return str(pos) if pos else ""
            # Sezon bağımsız: oyuncunun en sık görülen pozisyonu
            sub = lkp[lkp["PLAYER_NAME"] == row["PLAYER_NAME"]]
            if not sub.empty:
                mode = sub["POS_PRIMARY"].mode()
                return str(mode.iloc[0]) if not mode.empty else ""
            return ""
        df = df.copy()
        df.loc[mask, "POSITION"] = df[mask].apply(_from_lookup, axis=1)
        # POS_SECONDARY ekle (BBref'ten)
        if "POS_SECONDARY" not in df.columns:
            df["POS_SECONDARY"] = ""
        def _sec_from_lookup(row):
            if not lkp.empty:
                key = (row["PLAYER_NAME"], row.get("SEASON", ""))
                if key in lkp_idx.index:
                    sec = lkp_idx.loc[key, "POS_SECONDARY"]
                    if isinstance(sec, pd.Series):
                        sec = sec.iloc[0]
                    return str(sec) if sec else ""
            return ""
        df["POS_SECONDARY"] = df.apply(_sec_from_lookup, axis=1)
        # Hâlâ boş kalanlar → stat inference'a düş
        mask = df["POSITION"].isna() | (df["POSITION"].astype(str).str.strip() == "")
        if not mask.any():
            return df

    def _n(row, col):
        try: return float(row.get(col) or 0)
        except: return 0.0

    def _b(row, col):
        v = row.get(col)
        return bool(v) if v is not None else False

    def _infer(row):
        reb = _n(row, "REB"); ast = _n(row, "AST"); blk = _n(row, "BLK")
        arch = str(row.get("primary_arch") or "")

        # 1. Boolean kolon kontrolü (engine çıktısı)
        if _b(row, "Center") or (reb >= 8.5 and blk >= 1.2):
            return "C"
        if _b(row, "Big") or (reb >= 7.5 and blk >= 0.5):
            return "PF"
        if _b(row, "Forward"):
            return "PF" if reb >= 6.5 else "SF"
        if _b(row, "Guard"):
            return "PG" if ast >= 6.5 else "SG"
        if _b(row, "Wing"):
            return "SG" if ast >= 4.0 and reb < 5.0 else "SF"

        # 2. Stat + arketip tabanlı fallback (tüm booleans False)
        # Yüksek AST her şeyden önce: Simmons, Magic gibi point-forward/PG
        if ast >= 7.5:
            return "PG"
        # Dominant rim presence
        if reb >= 9.0:
            return "C"
        if reb >= 7.5 and blk >= 1.0:
            return "PF"
        # Guard arketipi + yeterli AST → PG (Fox, Trae tipi)
        if arch in ("Initiator",):
            return "PG"
        if arch in ("Engine", "Ecosystem", "Hub", "Creator") and ast >= 5.0 and reb < 5.5:
            return "PG"
        # Genel PG eşiği
        if ast >= 6.5 and reb < 6.0:
            return "PG"
        # Big man
        if reb >= 6.5 and ast < 5.0:
            return "PF"
        if reb >= 5.0 and ast < 4.0:
            return "SF"
        # Scoring guard
        if ast >= 4.0 and reb < 4.5:
            return "SG"
        return "SF"

    df = df.copy()
    df.loc[mask, "POSITION"] = df[mask].apply(_infer, axis=1)
    return df


def _confidence_margin(gp: int) -> float:
    """GP'ye göre skor güven aralığı. GP≥70→0.02, GP=35→~0.08, GP=1→0.14."""
    return round(max(0.02, min(0.15, 0.12 * (1 - min(gp, 70) / 70))), 3)


def _assign_pos5(df: pd.DataFrame) -> pd.Series:
    """
    POSITION string → birincil PG/SG/SF/PF/C.
    Boy heuristiği KULLANILMAZ — API'nin position designation'ı öncelikli.
    Listedeki ilk kelime birincil rolü gösterir (ör. "Forward-Center" → PF).

      Center            → C
      Center-Forward    → C  (Center birincil)
      Forward-Center    → PF (Forward birincil, ama paint oyuncusu)
      Forward           → PF (REB≥6.5) veya SF
      Forward-Guard     → SF (forward leaning)
      Guard-Forward     → SG (REB≥5.0) veya SF → SG
      Guard             → PG (AST≥5.0) veya SG
    """
    def _s(col, default=""):
        return df[col].fillna(default) if col in df.columns else pd.Series([default]*len(df), index=df.index)
    def _n(col):
        return pd.to_numeric(_s(col, 0), errors="coerce").fillna(0)
    pos = _s("POSITION","").str.strip()
    ast = _n("AST"); reb = _n("REB")

    result = []
    for p, a, r in zip(pos, ast, reb):
        pu = p.upper().strip()
        # --- BBR kısa kodları (C, PG, SG, SF, PF, PG-SG, vb.) ---
        if pu in ("C",):
            result.append("C")
        elif pu in ("PG",):
            result.append("PG")
        elif pu in ("SG",):
            result.append("SG")
        elif pu in ("SF",):
            result.append("SF")
        elif pu in ("PF",):
            result.append("PF")
        elif pu in ("PG-SG",):
            # BBref PG-SG: PG birincil — yüksek eşik ile gerçek playmaker'ları seç
            result.append("PG" if a >= 6.5 else "SG")
        elif pu in ("SG-PG",):
            # BBref SG-PG: SG birincil — sadece çok yüksek AST'ta PG ver
            result.append("PG" if a >= 7.5 else "SG")
        elif pu in ("SG-SF", "SF-SG"):
            result.append("SF" if r >= 5.0 else "SG")
        elif pu in ("SF-PF", "PF-SF"):
            result.append("PF" if r >= 6.5 else "SF")
        elif pu in ("PF-C", "C-PF"):
            result.append("C" if r >= 8.5 else "PF")
        # --- nba_api uzun string'leri (fallback) ---
        elif "CENTER-FORWARD" in pu or pu in ("CENTER",):
            result.append("C")
        elif "FORWARD-CENTER" in pu:
            result.append("PF")
        elif "FORWARD-GUARD" in pu:
            result.append("SF")
        elif "GUARD-FORWARD" in pu:
            result.append("SF" if r >= 5.0 else "SG")
        elif "FORWARD" in pu:
            result.append("PF" if r >= 6.5 else "SF")
        elif "GUARD" in pu:
            # nba_api "Guard": gerçek playmaker eşiği daha yüksek tutulur
            result.append("PG" if a >= 6.5 else "SG")
        else:
            result.append("SF")
    return pd.Series(result, index=df.index)


def _assign_secondary_pos(df: pd.DataFrame, primary: pd.Series) -> pd.Series:
    """Primary pozisyona göre ikincil mevki atar."""
    def _n(col):
        s = df[col] if col in df.columns else pd.Series([0.0]*len(df), index=df.index)
        return pd.to_numeric(s, errors="coerce").fillna(0)
    pos = df["POSITION"].fillna("").str.strip() if "POSITION" in df.columns else pd.Series([""] * len(df), index=df.index)
    ast = _n("AST"); reb = _n("REB"); blk = _n("BLK"); ht = _n("PLAYER_HEIGHT_INCHES")

    _next = {"PG": "SG", "SG": "PG", "SF": "PF", "PF": "C", "C": "PF"}
    result = []
    for p1, p, a, r, b, h in zip(primary, pos, ast, reb, blk, ht):
        pu = p.upper()
        if p1 == "PG":
            result.append("SG" if a < 6.5 else "SG")
        elif p1 == "SG":
            result.append("PG" if a >= 4.0 else "SF")
        elif p1 == "SF":
            result.append("PF" if r >= 5.0 else "SG")
        elif p1 == "PF":
            result.append("C" if (b >= 1.0 or h >= 80) else "SF")
        elif p1 == "C":
            result.append("PF" if a >= 3.0 else "PF")
        else:
            result.append(_next.get(p1, "SF"))
    return pd.Series(result, index=df.index)


def _assign_tertiary_pos(primary: pd.Series, secondary: pd.Series) -> pd.Series:
    """Birincil ve ikincil dışındaki en yakın üçüncül mevki."""
    order = ["PG", "SG", "SF", "PF", "C"]
    result = []
    for p1, p2 in zip(primary, secondary):
        for p in order:
            if p not in (p1, p2):
                result.append(p)
                break
        else:
            result.append("SF")
    return pd.Series(result, index=primary.index)


# Parquet mtime izleme: dosya değişince cache otomatik temizlenir
_SCORES_MTIME: float = 0.0
_HIST_MTIME:   float = 0.0


@lru_cache(maxsize=1)
def _load_scores() -> pd.DataFrame:
    p = DATA / "2025-26__player_scores.parquet"
    if not p.exists():
        raise FileNotFoundError("player_scores bulunamadı — önce export_excel.py çalıştır")
    df = pd.read_parquet(p)
    score_cols = [c for c in df.columns if c.startswith("score_")]
    df[score_cols] = df[score_cols].fillna(0)
    df["POS5"]           = _assign_pos5(df)
    df["POS5_SECONDARY"] = _assign_secondary_pos(df, df["POS5"])
    df["POS5_TERTIARY"]  = _assign_tertiary_pos(df["POS5"], df["POS5_SECONDARY"])
    # Eksik stat'ları Base parquet'ten tamamla (FG3_PCT, FGA, vb.)
    base_p = DATA / "2025-26__player_Base.parquet"
    if base_p.exists():
        try:
            base = pd.read_parquet(base_p)
            want = ["PLAYER_ID","FGA","FG_PCT","FG3A","FG3_PCT","STL","BLK"]
            merge_cols = ["PLAYER_ID"] + [c for c in want[1:] if c in base.columns and c not in df.columns]
            if len(merge_cols) > 1:
                df = df.merge(base[merge_cols], on="PLAYER_ID", how="left")
        except Exception:
            pass

    # Lig içi overall percentile + tier (runtime'da hesaplanır, parquet'e yazılmaz)
    if "overall_score" in df.columns:
        ranked = df["overall_score"].dropna()
        if len(ranked) > 0:
            df["overall_pct"] = (df["overall_score"]
                                 .rank(pct=True, na_option="keep")
                                 .round(3))
            # Tier: ligin en iyisi yukarıda
            # Elite = top 10%  (pct >= 0.90)
            # Star   = top 25% (pct >= 0.75)
            # Starter= top 50% (pct >= 0.50)
            # Role   = geri kalan (pct < 0.50, overall_score mevcut)
            def _tier(pct):
                if pd.isna(pct):
                    return ""
                if pct >= 0.90: return "Elite"
                if pct >= 0.75: return "Star"
                if pct >= 0.50: return "Starter"
                return "Role Player"
            df["overall_tier"] = df["overall_pct"].apply(_tier)

    return df


def _apply_prospect(df: pd.DataFrame) -> pd.DataFrame:
    """P3 prospect alanlarını ekle (floor/ceiling/grade/tier + strengths/weaknesses).
    Hata olursa loader'ı bozmadan df'i döner."""
    try:
        from prospect import add_prospect_fields
        return add_prospect_fields(df)
    except Exception as e:
        print(f"[UYARI] prospect fields: {e}", flush=True)
        return df


def _prospect_dict(row) -> Optional[dict]:
    """Detail endpoint için prospect alt-objesi (yoksa None)."""
    if "prospect_grade" not in row.index or pd.isna(row.get("prospect_grade")):
        return None
    def _num(k):
        return round(float(row[k]), 1) if k in row.index and pd.notna(row.get(k)) else None
    def _lst(k):
        v = row.get(k)
        return list(v) if v is not None and not isinstance(v, float) else []
    # P4: 1983+ NBA giriş-profili komparabılları ("genç X'e benziyor")
    comps = []
    try:
        from comparables import find_comparables, SC as _SC
        vec = [float(row.get(c, 0) or 0) for c in _SC]
        comps = find_comparables(vec, DATA / "historical__labeled.parquet",
                                 k=4, pos=row.get("POS5") or row.get("POSITION"))
    except Exception as e:
        print(f"[UYARI] comparables: {e}", flush=True)

    return {
        "grade":      _num("prospect_grade"),
        "tier":       row.get("prospect_tier", ""),
        "floor":      _num("prospect_floor"),
        "ceiling":    _num("prospect_ceiling"),
        "strengths":  _lst("strengths"),
        "weaknesses": _lst("weaknesses"),
        "comparables": comps,
    }


@lru_cache(maxsize=1)
def _load_gleague_scores() -> pd.DataFrame:
    """G-League player scores — gleague__2025-26__player_scores.parquet."""
    p = DATA / "gleague__2025-26__player_scores.parquet"
    if not p.exists():
        raise FileNotFoundError("G-League data not found. Run: python src/fetch_gleague.py")
    df = pd.read_parquet(p)
    score_cols = [c for c in df.columns if c.startswith("score_")]
    df[score_cols] = df[score_cols].fillna(0)
    df["POS5"] = _assign_pos5(df)
    if "overall_score" in df.columns:
        df["overall_pct"] = df["overall_score"].rank(pct=True, na_option="keep").round(3)
        def _tier(pct):
            if pd.isna(pct): return ""
            if pct >= 0.90: return "Elite"
            if pct >= 0.75: return "Star"
            if pct >= 0.50: return "Starter"
            return "Role Player"
        df["overall_tier"] = df["overall_pct"].apply(_tier)
    df = _apply_prospect(df)   # P3: floor/ceiling/grade/tier + güçlü/zayıf
    return df


@lru_cache(maxsize=1)
def _load_euroleague_scores() -> pd.DataFrame:
    """EuroLeague player scores — euroleague__2025-26__player_scores.parquet."""
    p = DATA / "euroleague__2025-26__player_scores.parquet"
    if not p.exists():
        raise FileNotFoundError("EuroLeague data not found. Run: python src/fetch_euroleague.py")
    df = pd.read_parquet(p)
    score_cols = [c for c in df.columns if c.startswith("score_")]
    df[score_cols] = df[score_cols].fillna(0)
    df["POS5"] = _assign_pos5(df)
    if "overall_score" in df.columns:
        df["overall_pct"] = df["overall_score"].rank(pct=True, na_option="keep").round(3)
        def _tier(pct):
            if pd.isna(pct): return ""
            if pct >= 0.90: return "Elite"
            if pct >= 0.75: return "Star"
            if pct >= 0.50: return "Starter"
            return "Role Player"
        df["overall_tier"] = df["overall_pct"].apply(_tier)
    return df


@lru_cache(maxsize=1)
def _load_ncaa_scores() -> pd.DataFrame:
    """NCAA D-I player scores — ncaa__2025-26__player_scores.parquet."""
    p = DATA / "ncaa__2025-26__player_scores.parquet"
    if not p.exists():
        raise FileNotFoundError("NCAA data not found. Run: python src/fetch_ncaa.py")
    df = pd.read_parquet(p)
    score_cols = [c for c in df.columns if c.startswith("score_")]
    df[score_cols] = df[score_cols].fillna(0)
    df["POS5"] = _assign_pos5(df)
    if "overall_score" in df.columns:
        df["overall_pct"] = df["overall_score"].rank(pct=True, na_option="keep").round(3)
        def _tier(pct):
            if pd.isna(pct): return ""
            if pct >= 0.90: return "Elite"
            if pct >= 0.75: return "Star"
            if pct >= 0.50: return "Starter"
            return "Role Player"
        df["overall_tier"] = df["overall_pct"].apply(_tier)
    df = _apply_prospect(df)   # P3: floor/ceiling/grade/tier + güçlü/zayıf
    return df


@lru_cache(maxsize=1)
def _load_labeled() -> pd.DataFrame:
    return pd.read_parquet(DATA / "2025-26__labeled.parquet")


@lru_cache(maxsize=1)
def _load_duo_compat() -> pd.DataFrame:
    # Önce hazır parquet'ten oku (export_excel.py çıktısı)
    p = DATA / "2025-26__duo_compat.parquet"
    if p.exists():
        return pd.read_parquet(p)
    # Yoksa hesapla ve kaydet (yalnızca ilk seferde, ~30sn)
    scores = _load_scores()
    from score_compat import duo_compatibility
    aff_p = DATA / "2025-26__affinity_matrix.parquet"
    aff = pd.read_parquet(aff_p) if aff_p.exists() else None
    df = duo_compatibility(scores, affinity_matrix=aff, min_games=20)
    df.to_parquet(p)
    return df


@lru_cache(maxsize=1)
def _load_lineup_compat() -> pd.DataFrame:
    scores = _load_scores()
    from score_compat import top_lineup_combos
    return top_lineup_combos(scores, top_n=3000, min_gp=35, min_mpg=22.0, pool_size=40)


@lru_cache(maxsize=1)
def _load_lineup_compat_positional() -> pd.DataFrame:
    scores = _load_scores()
    from score_compat import top_lineup_combos_positional
    # top_n=50: greedy inline tüm 248K üzerinde çalışıyor, 50 unique lineup döner
    return top_lineup_combos_positional(scores, top_n=50, min_gp=35, min_mpg=22.0, pool_per_pos=12)


@lru_cache(maxsize=1)
def _load_affinity() -> pd.DataFrame:
    p = DATA / "2025-26__affinity_matrix.parquet"
    return pd.read_parquet(p) if p.exists() else pd.DataFrame()


_HIST_STAT_COLS = ["STL", "BLK", "FGA", "FG_PCT", "FG3A", "FG3_PCT", "TEAM_ABBREVIATION"]


@lru_cache(maxsize=1)
def _load_position_lookup() -> pd.DataFrame:
    """BBref'ten derlenen pozisyon lookup tablosu. Yoksa boş DataFrame döner."""
    p = DATA / "position_lookup.parquet"
    if not p.exists():
        return pd.DataFrame(columns=["PLAYER_NAME", "SEASON", "POS_PRIMARY", "POS_SECONDARY"])
    return pd.read_parquet(p)

@lru_cache(maxsize=60)
def _load_hist_base_stats(season: str) -> pd.DataFrame:
    """Belirtilen sezon için hist_Base parquet'inden ek stat sütunlarını yükler."""
    p = DATA / f"{season}__hist_Base.parquet"
    if not p.exists():
        return pd.DataFrame()
    try:
        base = pd.read_parquet(p)
        avail = ["PLAYER_ID"] + [c for c in _HIST_STAT_COLS if c in base.columns]
        return base[avail] if len(avail) > 1 else pd.DataFrame()
    except Exception:
        return pd.DataFrame()


@lru_cache(maxsize=1)
def _load_historical() -> pd.DataFrame:
    p = DATA / "historical__labeled.parquet"
    return pd.read_parquet(p) if p.exists() else pd.DataFrame()


def _safe(df: pd.DataFrame) -> list[dict]:
    """NaN/Inf'leri temizleyip JSON-serileştirilebilir dict listesi döner.
    Numeric NaN → null (oyuncu GP eşiği altındaysa overall_score null gelir),
    string NaN → "" (frontend'de güvenli).
    """
    df = df.replace([np.inf, -np.inf], np.nan)
    str_cols = df.select_dtypes(include=["object"]).columns
    df = df.copy()
    df[str_cols] = df[str_cols].fillna("")
    return json.loads(df.to_json(orient="records"))


# ─── SEO ──────────────────────────────────────────────────────────────────────

BASE_URL = SITE_URL   # env-driven (Render: onrender default; Railway: SITE_URL set edilir)
STATIC_ROUTES = ["/", "/players", "/explore", "/compare", "/lineups", "/affinity", "/glossary", "/game", "/about"]

@app.get("/robots.txt", response_class=PlainTextResponse, include_in_schema=False)
def robots_txt():
    return f"User-agent: *\nAllow: /\nSitemap: {BASE_URL}/sitemap.xml\n"

@app.get("/sitemap.xml", response_class=PlainTextResponse, include_in_schema=False)
def sitemap_xml():
    import urllib.parse
    static_urls = "\n".join(
        f"  <url><loc>{BASE_URL}{r}</loc><changefreq>weekly</changefreq><priority>{'1.0' if r == '/' else '0.8'}</priority></url>"
        for r in STATIC_ROUTES
    )
    player_urls = ""
    try:
        sp = DATA / "2025-26__player_scores.parquet"
        if sp.exists():
            names = pd.read_parquet(sp, columns=["PLAYER_NAME"])["PLAYER_NAME"].dropna()
            player_urls = "\n".join(
                f'  <url><loc>{BASE_URL}/players/{urllib.parse.quote(str(n), safe="")}</loc>'
                f'<changefreq>weekly</changefreq><priority>0.6</priority></url>'
                for n in names
            )
    except Exception:
        pass
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{static_urls}
{player_urls}
</urlset>"""
    from fastapi.responses import Response
    return Response(content=xml, media_type="application/xml")

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def get_meta():
    """Veri güncelliği + sezon + oyuncu sayısı."""
    import datetime
    _auto_invalidate()
    df = _load_scores()
    scores_path = ROOT / "data" / "2025-26__player_scores.parquet"
    last_updated = None
    if scores_path.exists():
        mtime = scores_path.stat().st_mtime
        last_updated = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
    ranked = df[df["overall_score"].notna()] if "overall_score" in df.columns else df
    return {
        "season":       "2025-26",
        "player_count": int(len(ranked)),
        "last_updated": last_updated,
    }


@app.get("/api/player-names")
def get_player_names():
    """Tüm oyuncu adları — frontend autocomplete için."""
    _auto_invalidate()
    df = _load_scores()
    return {"names": sorted(df["PLAYER_NAME"].dropna().tolist())}


@app.post("/api/admin/clear-cache")
def clear_cache():
    """lru_cache'i temizle — yeni formülle lineup'lar yeniden hesaplanır."""
    _load_scores.cache_clear()
    _load_gleague_scores.cache_clear()
    _load_euroleague_scores.cache_clear()
    _load_ncaa_scores.cache_clear()
    _load_labeled.cache_clear()
    _load_duo_compat.cache_clear()
    _load_lineup_compat.cache_clear()
    _load_lineup_compat_positional.cache_clear()
    _load_affinity.cache_clear()
    _load_historical.cache_clear()
    _load_hist_base_stats.cache_clear()
    _load_real_lineups.cache_clear()
    _load_lineups_with_archs.cache_clear()
    _load_position_lookup.cache_clear()
    global _SCORES_MTIME, _HIST_MTIME
    _SCORES_MTIME = 0.0
    _HIST_MTIME   = 0.0
    with _CACHE_LOCK:
        _RESP_CACHE.clear()
    return {"status": "cleared", "message": "Tüm cache temizlendi. Sonraki istek verileri yeniden hesaplar."}


def _auto_invalidate():
    """Parquet dosyaları değiştiyse lru_cache'i otomatik temizle."""
    global _SCORES_MTIME, _HIST_MTIME
    sp = DATA / "2025-26__player_scores.parquet"
    hp = DATA / "historical__labeled.parquet"
    if sp.exists():
        mt = sp.stat().st_mtime
        if mt != _SCORES_MTIME:
            _load_scores.cache_clear()
            _SCORES_MTIME = mt
    if hp.exists():
        mt = hp.stat().st_mtime
        if mt != _HIST_MTIME:
            _load_historical.cache_clear()
            _HIST_MTIME = mt


@app.get("/api/components")
def get_components():
    """Tüm bileşen adları + core/modifier ayrımı."""
    return {
        "all":  COMP_COLS,
        "core": CORE,
        "modifiers": [c for c in COMP_COLS if c not in CORE],
    }


@app.get("/api/players")
def get_players(
    search:    Optional[str] = Query(None, description="İsim arama"),
    team:      Optional[str] = Query(None),
    position:  Optional[str] = Query(None),
    arch:      Optional[str] = Query(None, description="Core noun filtre (primary_arch)"),
    modifier:  Optional[str] = Query(None, description="Modifier tag filtre (score >= threshold)"),
    min_score: float = Query(0.0, ge=0, le=1),
    sort_by:   str = Query("overall_score", description="Sıralama: overall_score | PTS | REB | AST"),
    limit:     int = Query(50, ge=1, le=500),
    offset:    int = Query(0, ge=0),
):
    """Oyuncu listesi — filtre + sayfalama."""
    _auto_invalidate()
    df = _load_scores().copy()

    if search:
        df = df[df["PLAYER_NAME"].str.contains(search, case=False, na=False)]
    if team:
        df = df[df["TEAM_ABBREVIATION"].str.upper() == team.upper()]
    if position:
        pos_upper = position.upper()
        if pos_upper in ("PG", "SG", "SF", "PF", "C") and "POS5" in df.columns:
            df = df[df["POS5"] == pos_upper]
        elif "POSITION" in df.columns:
            df = df[df["POSITION"].str.contains(position, case=False, na=False)]
    if arch:
        df = df[df["primary_arch"].str.lower() == arch.lower()]
    if modifier:
        col = f"score_{modifier}"
        if col in df.columns:
            from signatures import COMPONENT_SIGNATURES as _CS
            thr = _CS.get(modifier, {}).get("percentile_threshold", 0.75)
            df = df[df[col] >= thr]
    if min_score > 0 and "overall_score" in df.columns:
        df = df[df["overall_score"] >= min_score]

    valid_sort = sort_by if sort_by in df.columns else "overall_score"
    df = df.sort_values(valid_sort, ascending=False, na_position="last")

    total = len(df)
    page  = df.iloc[offset: offset + limit]

    return {
        "total":   total,
        "offset":  offset,
        "limit":   limit,
        "players": _safe(page),
    }


@app.get("/api/players/{player_name}/scores")
def get_player_scores(player_name: str):
    """Tek oyuncunun bileşen skor profili."""
    df = _load_scores()
    match = df[df["PLAYER_NAME"].str.lower() == player_name.lower()]
    if match.empty:
        # Fuzzy fallback
        match = df[df["PLAYER_NAME"].str.contains(player_name, case=False, na=False)]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"{player_name} not found")

    row = match.iloc[0]
    score_cols = [c for c in df.columns if c.startswith("score_")]
    scores = {c.replace("score_",""):round(float(row[c]),3) for c in score_cols}

    score_cols_core = [c for c in score_cols if c.replace("score_","") in CORE_NOUNS]
    score_cols_mod  = [c for c in score_cols if c.replace("score_","") in MODIFIER_TAGS]
    core_scores = {c.replace("score_",""):round(float(row[c]),3) for c in score_cols_core}
    mod_scores  = {c.replace("score_",""):round(float(row[c]),3) for c in score_cols_mod}

    # Aktif modifier taglar (eşik geçilmiş olanlar)
    from signatures import COMPONENT_SIGNATURES as CS
    active_modifiers = [
        m for m, sc in mod_scores.items()
        if sc >= CS.get(m, {}).get("percentile_threshold", 0.75)
    ]

    # Rol vektörü
    role_vec = compute_role_vec(dict(row))
    role_scores = {slot: round(float(role_vec[i]), 3) for i, slot in enumerate(ROLE_SLOTS)}

    return {
        "name":          row["PLAYER_NAME"],
        "team":          row.get("TEAM_ABBREVIATION",""),
        "position":      row.get("POSITION",""),
        "pos5":          row.get("POS5",""),
        "pos5_secondary":row.get("POS5_SECONDARY",""),
        "pos5_tertiary": row.get("POS5_TERTIARY",""),
        "gp":            int(row.get("GP",0)) if pd.notna(row.get("GP",0)) else 0,
        "pts":           round(float(row["PTS"]),1) if "PTS" in row.index and pd.notna(row.get("PTS")) else None,
        "reb":           round(float(row["REB"]),1) if "REB" in row.index and pd.notna(row.get("REB")) else None,
        "ast":           round(float(row["AST"]),1) if "AST" in row.index and pd.notna(row.get("AST")) else None,
        "primary_arch":  row.get("primary_arch",""),
        "overall_score": round(float(row["overall_score"]),3) if pd.notna(row.get("overall_score")) else None,
        "overall_pct":   round(float(row["overall_pct"]),3) if pd.notna(row.get("overall_pct")) else None,
        "overall_tier":  row.get("overall_tier",""),
        "bpm":           round(float(row["BPM"]),1)  if "BPM"  in row.index and pd.notna(row.get("BPM"))  else None,
        "obpm":          round(float(row["OBPM"]),1) if "OBPM" in row.index and pd.notna(row.get("OBPM")) else None,
        "dbpm":          round(float(row["DBPM"]),1) if "DBPM" in row.index and pd.notna(row.get("DBPM")) else None,
        "scores":        core_scores,
        "modifier_scores": mod_scores,
        "active_modifiers": active_modifiers,
        "role_scores":   role_scores,
        "confidence_margin": _confidence_margin(int(row.get("GP", 70)) if pd.notna(row.get("GP")) else 70),
    }


@app.get("/api/players/{player_name}/duo-partners")
def get_duo_partners(player_name: str, limit: int = Query(20, ge=1, le=100)):
    """Bir oyuncunun en uyumlu duo ortakları."""
    df = _load_duo_compat()
    p = player_name.lower()
    mask = (df["Oyuncu_1"].str.lower().str.contains(p, na=False) |
            df["Oyuncu_2"].str.lower().str.contains(p, na=False))
    result = df[mask].head(limit)

    # Partner adını öne al
    rows = []
    for _, r in result.iterrows():
        if p in r["Oyuncu_1"].lower():
            partner, partner_team, partner_arch = r["Oyuncu_2"], r["Takım_2"], r["Arketip_2"]
            self_arch = r["Arketip_1"]
        else:
            partner, partner_team, partner_arch = r["Oyuncu_1"], r["Takım_1"], r["Arketip_1"]
            self_arch = r["Arketip_2"]
        rows.append({
            "partner":      partner,
            "partner_team": partner_team,
            "partner_arch": partner_arch,
            "self_arch":    self_arch,
            "coverage":     r["Kapsama"],
            "complement":   r["Tamamlama"],
            "affinity":     r["Affinity"],
            "duo_score":    r["Uyum_Skoru"],
            "n_strong":     r["Guclu_Bilesен"],
        })
    return rows


@app.get("/api/duo-compat")
def get_duo_compat(
    arch1: Optional[str] = None,
    arch2: Optional[str] = None,
    same_team: bool = False,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Duo uyum tablosu — arketip filtresiyle."""
    df = _load_duo_compat()

    if arch1:
        df = df[df["Arketip_1"].str.lower() == arch1.lower() |
                df["Arketip_2"].str.lower() == arch1.lower()]
    if same_team:
        df = df[df["Takım_1"] == df["Takım_2"]]

    total = len(df)
    return {
        "total":  total,
        "duos":   _safe(df.iloc[offset: offset + limit]),
    }


@app.get("/api/lineup-compat")
def get_lineup_compat(
    limit:      int = Query(50, ge=1, le=500),
    offset:     int = Query(0, ge=0),
    positional: int = Query(1, ge=0, le=1),
    unique:     int = Query(1, ge=0, le=1,
                            description="1=Her oyuncu tek lineup'ta (greedy), 0=tüm liste"),
):
    """
    En uyumlu teorik 5'li kombinasyonlar.
    positional=1 (varsayılan): her pozisyondan tam 1 oyuncu (PG/SG/SF/PF/C).
    positional=0: kısıtsız, en iyi 40 oyuncudan herhangi 5'li.
    unique=1: greedy seçim — her oyuncu yalnızca bir lineup'ta görünür.
    """
    df = _load_lineup_compat_positional() if positional else _load_lineup_compat()
    # Greedy positional'da inline yapılıyor; kısıtsız mod için dışarıdan uygula
    if unique and not positional and not df.empty:
        from score_compat import greedy_unique_lineups
        df = greedy_unique_lineups(df, top_n=limit + offset + 5)
    total = len(df)
    return {
        "total":   total,
        "lineups": _safe(df.iloc[offset: offset + limit]),
    }


@lru_cache(maxsize=1)
def _load_real_lineups() -> pd.DataFrame:
    """Gerçek oynanmış 5'li lineup'ları fit_score ile zenginleştirir."""
    p5 = DATA / "2025-26__lineups_5man.parquet"
    if not p5.exists():
        return pd.DataFrame()
    lineups = pd.read_parquet(p5)
    lineups = lineups[lineups["MIN"] >= 50].copy().reset_index(drop=True)

    scores = _load_scores()
    # İsim lookup: kısaltılmış (A. Edwards) → tam isim
    from collections import defaultdict
    init_last: dict = {}
    last_uniq: dict = {}
    last_count: dict = defaultdict(list)
    for name in scores["PLAYER_NAME"]:
        parts = name.split()
        if not parts:
            continue
        last = parts[-1].lower()
        first_init = parts[0][0].lower() if parts[0] else ""
        init_last[f"{first_init}_{last}"] = name
        last_count[last].append(name)
    for last, names in last_count.items():
        if len(names) == 1:
            last_uniq[last] = names[0]

    def expand(abbr: str) -> str:
        parts = abbr.strip().split()
        if not parts:
            return abbr
        last = parts[-1].lower()
        first_init = parts[0].rstrip(".").lower() if len(parts) > 1 else ""
        k = f"{first_init}_{last}"
        if k in init_last:
            return init_last[k]
        if last in last_uniq:
            return last_uniq[last]
        return abbr

    from score_compat import lineup_score_from_names
    fit_scores = []
    for _, row in lineups.iterrows():
        raw = [n.strip() for n in row["GROUP_NAME"].split(" - ")]
        names = [expand(n) for n in raw]
        try:
            res = lineup_score_from_names(names, scores)
            fit_scores.append(res.get("lineup_score") or res.get("total_fit"))
        except Exception:
            fit_scores.append(None)
    lineups["fit_score"] = fit_scores
    return lineups


@app.get("/api/lineups/correlation")
def lineups_correlation():
    """Fit skoru ↔ NET_RATING Pearson r (yeni 5-pillar formülü)."""
    df = _load_real_lineups()
    if df.empty or "fit_score" not in df.columns or "NET_RATING" not in df.columns:
        return {"r": None, "n": 0, "p": None}
    sub = df[["fit_score", "NET_RATING"]].dropna()
    if len(sub) < 5:
        return {"r": None, "n": len(sub), "p": None}
    from scipy.stats import pearsonr
    r_val, p_val = pearsonr(sub["fit_score"], sub["NET_RATING"])
    return {"r": round(float(r_val), 3), "n": int(len(sub)), "p": round(float(p_val), 4)}


@app.get("/api/real-lineups")
def get_real_lineups(
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("NET_RATING", description="NET_RATING veya fit_score"),
    min_min: int = Query(50, ge=0, description="Minimum dakika eşiği"),
    playoff: int = Query(0, ge=0, le=1, description="1=playoff, 0=regular"),
):
    """
    Gerçek oynanmış 5'li lineup'lar — NET_RATING + arketip fit_score.
    r(fit, NET_RATING) ≈ 0.53 (Pearson, n≈79 @MIN>=100).
    """
    # Playoff seçimi
    key_p = "2025-26__playoff_lineups_5man.parquet"
    key_r = "2025-26__lineups_5man.parquet"
    p5 = DATA / (key_p if playoff else key_r)
    if not p5.exists():
        return {"total": 0, "lineups": []}

    df = _load_real_lineups() if not playoff else pd.read_parquet(p5)
    if df.empty:
        return {"total": 0, "lineups": []}

    df = df[df["MIN"] >= min_min].copy()
    sort_col = sort_by if sort_by in df.columns else "NET_RATING"
    df = df.sort_values(sort_col, ascending=False).reset_index(drop=True)

    keep = ["GROUP_NAME", "NET_RATING", "MIN", "PLUS_MINUS", "W_PCT"]
    if "fit_score" in df.columns:
        keep.append("fit_score")
    keep = [c for c in keep if c in df.columns]
    out = df[keep].iloc[offset: offset + limit]
    return {"total": len(df), "lineups": _safe(out)}


@app.post("/api/lineup-compat/custom")
def custom_lineup_compat(body: dict):
    """
    Verilen 5 oyuncu için uyum skoru hesapla.
    Body: {"players": ["Player A", "Player B", ...]}
    """
    names = body.get("players", [])
    if len(names) < 2:
        raise HTTPException(400, "En az 2 oyuncu gerekli")
    from score_compat import lineup_score_from_names
    scores = _load_scores()
    result = lineup_score_from_names(names, scores)
    if not result:
        raise HTTPException(404, "Players not found — check the name list")

    # Per-player skor verileri (era-adjusted frontend scoring için)
    SCORE_KEYS = ["Engine","Ecosystem","Hub","Creator","Connector","Initiator",
                  "Anchor","Force","Spacer","Finisher","Stopper","Rim Runner",
                  "3-and-D","Two-Way","Stretch","Gravity","Slashing","Three-Level"]
    players_data = []
    for name in names:
        nm = name.strip()
        row = scores[scores["PLAYER_NAME"].str.lower() == nm.lower()]
        if row.empty:
            row = scores[scores["PLAYER_NAME"].str.contains(nm, case=False, na=False)]
        if not row.empty:
            r = row.iloc[0]
            pd_entry = {
                "name": str(r.get("PLAYER_NAME", nm)),
                "primary_arch": str(r.get("primary_arch", "")),
                "overall_score": float(r.get("overall_score", 0) or 0),
                "_season": "2025-26",
            }
            for k in SCORE_KEYS:
                col = f"score_{k}"
                pd_entry[f"score_{k}"] = float(r[col]) if col in r and pd.notna(r[col]) else 0.0
            players_data.append(pd_entry)
    if players_data:
        result["players_data"] = players_data

    # 3-season weighted overall_score context (son 3 sezon, son sezon 2x ağırlıklı)
    hist = _load_historical()
    if not hist.empty and "overall_score" in hist.columns and "SEASON" in hist.columns:
        player_career_scores = {}
        for name in names:
            nm = name.strip()
            rows = hist[hist["PLAYER_NAME"].str.lower() == nm.lower()]
            if rows.empty:
                rows = hist[hist["PLAYER_NAME"].str.contains(nm, case=False, na=False)]
            if not rows.empty:
                last3 = rows.sort_values("SEASON").tail(3)
                valid = last3["overall_score"].dropna()
                if len(valid) > 0:
                    # Son sezon 2x, öncekiler 1x
                    wts = [1.0] * len(valid)
                    wts[-1] = 2.0
                    wavg = float(np.average(valid.values, weights=wts))
                    player_career_scores[nm] = round(wavg, 3)
        if player_career_scores:
            result["player_career_scores"] = player_career_scores

    # NaN / numpy type temizle
    def _clean(v):
        if isinstance(v, float) and (v != v):  # NaN check
            return None
        if hasattr(v, "item"):                  # numpy scalar → python
            return v.item()
        return v
    return {k: (_clean(v) if not isinstance(v, (dict, list)) else v)
            for k, v in result.items()}


@lru_cache(maxsize=1)
def _load_lineups_with_archs() -> pd.DataFrame:
    """Real lineup'ları arketip bilgisiyle zenginleştirir; /api/affinity/lineups için."""
    lineups = _load_real_lineups()
    if lineups.empty:
        return lineups
    scores = _load_scores()
    arch_map = {}
    if "primary_arch" in scores.columns:
        arch_map = dict(zip(scores["PLAYER_NAME"], scores["primary_arch"].fillna("")))

    from collections import defaultdict
    init_last: dict = {}
    last_uniq: dict = {}
    last_count: dict = defaultdict(list)
    for name in scores["PLAYER_NAME"]:
        parts = name.split()
        if not parts: continue
        last = parts[-1].lower()
        fi = parts[0][0].lower() if parts[0] else ""
        init_last[f"{fi}_{last}"] = name
        last_count[last].append(name)
    for last, names in last_count.items():
        if len(names) == 1:
            last_uniq[last] = names[0]

    def expand(abbr: str) -> str:
        parts = abbr.strip().split()
        if not parts: return abbr
        last = parts[-1].lower()
        fi = parts[0].rstrip(".").lower() if len(parts) > 1 else ""
        k = f"{fi}_{last}"
        if k in init_last: return init_last[k]
        if last in last_uniq: return last_uniq[last]
        return abbr

    archs_list, names_list = [], []
    for _, row in lineups.iterrows():
        raw = [n.strip() for n in row["GROUP_NAME"].split(" - ")]
        expanded = [expand(n) for n in raw]
        archs_list.append([arch_map.get(n, "") for n in expanded])
        names_list.append(expanded)
    lineups = lineups.copy()
    lineups["_archs"] = archs_list
    lineups["_names"] = names_list
    return lineups


@app.get("/api/affinity")
def get_affinity_endpoint():
    """Arketip x arketip uyum matrisi. Prior (12 noun); empirikal varsa EMA ile güncellenir."""
    ck = "affinity_matrix"
    cached = cache_get(ck)
    if cached: return cached
    from roles import AFFINITY_MATRIX as PRIOR
    empirical = _load_affinity()
    # Pair dakikalarını blending öncesinde hesapla (adaptif alpha + sample_counts için)
    pair_min: dict = {}
    sample_counts: dict = {}
    try:
        lu = _load_lineups_with_archs()
        if not lu.empty and "_archs" in lu.columns:
            from itertools import combinations as _comb
            for _, row in lu.iterrows():
                archs = [a for a in row["_archs"] if a]
                mins  = float(row.get("MIN", 0) or 0)
                for a, b in _comb(sorted(set(archs)), 2):
                    pair_min[(a, b)] = pair_min.get((a, b), 0) + mins
            for (a, b), total_min in pair_min.items():
                sample_counts.setdefault(a, {})[b] = round(total_min)
                sample_counts.setdefault(b, {})[a] = round(total_min)
    except Exception:
        pass

    if empirical.empty:
        df = PRIOR
        source = "prior"
    else:
        df = PRIOR.copy()
        for a in df.index:
            for b in df.columns:
                if a in empirical.index and b in empirical.columns:
                    v = empirical.loc[a, b]
                    if pd.notna(v):
                        # Adaptif alpha: 2000+ dakika → max 0.6 empirik ağırlık
                        pair_mins = pair_min.get(tuple(sorted([a, b])), 0)
                        alpha = min(0.6, pair_mins / 2000)
                        df.loc[a, b] = round((1 - alpha) * df.loc[a, b] + alpha * float(v), 3)
        source = "blended"

    result = {
        "archetypes": list(df.index),
        "matrix": json.loads(df.round(3).to_json()),
        "source": source,
        "sample_counts": sample_counts,
    }
    cache_set(ck, result)
    return result


@app.get("/api/affinity/lineups")
def get_affinity_lineups(
    arch_a: str = Query(..., description="İlk arketip"),
    arch_b: str = Query(..., description="İkinci arketip"),
    limit:  int = Query(10, ge=1, le=50),
):
    """Verilen iki arketipi birlikte içeren gerçek 5'li lineup'lar."""
    lu = _load_lineups_with_archs()
    if lu.empty or "_archs" not in lu.columns:
        return {"total": 0, "lineups": [], "avg_net": None}

    mask = lu["_archs"].apply(lambda archs: arch_a in archs and arch_b in archs)
    filtered = lu[mask].copy()
    if filtered.empty:
        return {"total": 0, "lineups": [], "avg_net": None}

    filtered = filtered.sort_values("NET_RATING", ascending=False).reset_index(drop=True)
    avg_net = round(float(filtered["NET_RATING"].mean()), 2) if "NET_RATING" in filtered.columns else None

    keep = ["GROUP_NAME", "NET_RATING", "MIN", "PLUS_MINUS", "fit_score"]
    keep = [c for c in keep if c in filtered.columns]
    out = filtered[keep].iloc[:limit]
    return {
        "total":   int(len(filtered)),
        "avg_net": avg_net,
        "lineups": _safe(out),
    }


@app.get("/api/role-stats")
def get_role_stats():
    """
    Lig genelinde 11 fonksiyonel rol istatistikleri:
    - coverage_rate: kaç % oyuncu o rolde ≥0.70 skora sahip
    - avg_score: lig ortalaması
    - net_rating_corr: role skoru ile NET_RATING korelasyonu (kazanma etkisi)
    """
    from roles import ROLE_SLOTS, compute_role_vec
    df = _load_scores()
    qualified = df[df["GP"].fillna(0) >= 35].copy().reset_index(drop=True)

    # NET_RATING için merged dosyasına bak
    merged_p = DATA / "2025-26__merged_bref.parquet"
    if not merged_p.exists():
        merged_p = DATA / "2025-26__merged.parquet"
    if merged_p.exists():
        merged = pd.read_parquet(merged_p, columns=["PLAYER_NAME", "NET_RATING", "BPM"])
        qualified = qualified.merge(merged[["PLAYER_NAME","NET_RATING","BPM"]],
                                    on="PLAYER_NAME", how="left", suffixes=("","_m"))
        if "NET_RATING_m" in qualified.columns:
            qualified["NET_RATING"] = qualified["NET_RATING"].fillna(qualified["NET_RATING_m"])

    role_matrix = np.array(
        [compute_role_vec(dict(qualified.iloc[i])) for i in range(len(qualified))],
        dtype=np.float32,
    )  # (n_players, 11)

    has_net = "NET_RATING" in qualified.columns
    net_arr = qualified["NET_RATING"].fillna(0).values.astype(np.float32) if has_net else None

    stats = []
    for j, slot in enumerate(ROLE_SLOTS):
        col = role_matrix[:, j]
        coverage_rate = float((col >= 0.70).mean())
        avg_score     = float(col.mean())
        if has_net and net_arr is not None and col.std() > 0:
            corr = float(np.corrcoef(col, net_arr)[0, 1])
        else:
            corr = 0.0
        stats.append({
            "slot":          slot,
            "coverage_rate": round(coverage_rate, 3),
            "avg_score":     round(avg_score, 3),
            "net_corr":      round(corr, 3),
            "n_players":     int((col >= 0.70).sum()),
        })

    # Kazanmaya en çok katkı sağlayan roller (net_corr'a göre sıralı)
    stats_sorted = sorted(stats, key=lambda x: -x["net_corr"])

    return {
        "season": "2025-26",
        "n_qualified": len(qualified),
        "roles": stats,
        "by_impact": [s["slot"] for s in stats_sorted],
    }


@app.get("/api/seasons")
def get_seasons():
    """Mevcut tarihsel sezonlar (2025-26 dahil)."""
    seasons = []
    # Güncel sezon her zaman listenin başında
    if (DATA / "2025-26__player_scores.parquet").exists():
        seasons.append("2025-26")
    df = _load_historical()
    if not df.empty:
        for s in sorted(df["SEASON"].unique().tolist(), reverse=True):
            if s not in seasons:
                seasons.append(s)
    return {"seasons": seasons}


_HIST_EXTRA = ["STL","BLK","FG_PCT","FG3_PCT","TEAM_ABBREVIATION","overall_score","primary_arch","POSITION"]

@app.get("/api/historical/{season}")
def get_historical(
    season: str,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_col: str = Query("overall_score", description="Sıralama kolonu"),
    sort_asc: bool = Query(False),
):
    """Tarihsel sezon oyuncu listesi — 2025-26 dahil."""
    # 2025-26 için güncel player_scores kullan
    if season == "2025-26":
        df = _load_scores().copy()
        df["SEASON"] = "2025-26"
    else:
        hist = _load_historical()
        df = hist[hist["SEASON"] == season].copy()
        if df.empty:
            raise HTTPException(404, f"Season {season} not found")
        # hist_Base'den ek stat sütunlarını merge et (STL, BLK, FG_PCT, FG3_PCT)
        base_stats = _load_hist_base_stats(season)
        if not base_stats.empty and "PLAYER_ID" in df.columns:
            missing_cols = [c for c in base_stats.columns if c != "PLAYER_ID" and c not in df.columns]
            if missing_cols:
                df = df.merge(base_stats[["PLAYER_ID"] + missing_cols], on="PLAYER_ID", how="left")

    if search:
        df = df[df["PLAYER_NAME"].str.contains(search, case=False, na=False)]

    if season == "2025-26":
        # score_ sütunlarından bileşen listesi (threshold 0.50)
        score_cols = {c.replace("score_",""): c for c in df.columns if c.startswith("score_") and c.replace("score_","") in COMP_COLS}
        df["Bileşenler"] = df.apply(
            lambda r: " | ".join(cn for cn, sc in score_cols.items() if float(r.get(sc, 0) or 0) >= 0.50), axis=1)
    else:
        comp_avail = [c for c in COMP_COLS if c in df.columns]
        df["Bileşenler"] = df.apply(
            lambda r: " | ".join(c for c in comp_avail if r.get(c, False)), axis=1)

    base_cols = ["PLAYER_NAME","GP","MIN","PTS","REB","AST","STL","BLK","FGA","FG_PCT","FG3A","FG3_PCT","Bileşenler"]
    extra = ["overall_score","primary_arch","TEAM_ABBREVIATION","POSITION"]
    score_cols = [c for c in df.columns if c.startswith("score_")]
    keep = [c for c in base_cols + extra if c in df.columns] + score_cols

    total = len(df)

    # Sıralama
    valid_sort = sort_col if sort_col in df.columns else (
        "overall_score" if "overall_score" in df.columns else "PTS"
    )
    df = df.sort_values(valid_sort, ascending=sort_asc, na_position="last")

    # data_era: hangi metrik setinin kullanıldığını UI'a bildir
    def _data_era(s: str) -> str:
        try:
            year = int(s.split("-")[0])
        except (ValueError, IndexError):
            return "classic"
        if year >= 2015:
            return "tracking"    # hustle + tracking (2015-16+)
        if year >= 2013:
            return "hustle"      # tracking ama hustle yok (2013-16 arası)
        return "classic"         # sadece box-score + advanced (1983-2013)

    return {
        "season":   season,
        "total":    total,
        "data_era": _data_era(season),
        "players":  _safe(df[keep].iloc[offset: offset + limit]),
    }


# ─── Tarihsel sezon: boolean-tabanlı duo/lineup uyumu ─────────────────────────

def _bool_duo_compat(df_season: pd.DataFrame, top_n: int = 100) -> list[dict]:
    """
    Tarihsel sezon için boolean bileşen vektörlerinden duo uyumu hesaplar.
    Skor vektörü olmadığı için 0/1 bileşen bayrakları kullanılır.
    """
    comp_avail = [c for c in COMP_COLS if c in df_season.columns]
    if not comp_avail:
        return []

    df = df_season[df_season["GP"] >= 20].reset_index(drop=True) if "GP" in df_season.columns else df_season.reset_index(drop=True)
    mat = df[comp_avail].fillna(0).values.astype(float)   # (n, n_comp)
    names  = df["PLAYER_NAME"].tolist()
    teams  = df["TEAM_ABBREVIATION"].tolist() if "TEAM_ABBREVIATION" in df.columns else [""] * len(df)

    # Baskın arketip: en çok core bileşen veya versatility_score
    core_avail = [c for c in CORE if c in comp_avail]

    rows = []
    n = len(df)
    from itertools import combinations as comb
    for i, j in comb(range(n), 2):
        v1, v2 = mat[i], mat[j]
        union      = np.maximum(v1, v2)
        coverage   = float(union.mean())
        complement = float((v1 != v2).mean())  # farklı bileşen oranı
        duo_score  = 0.55 * coverage + 0.45 * complement
        n_strong   = int(union.sum())
        rows.append({
            "Oyuncu_1":    names[i],
            "Takım_1":     teams[i],
            "Oyuncu_2":    names[j],
            "Takım_2":     teams[j],
            "Kapsama":     round(coverage, 3),
            "Tamamlama":   round(complement, 3),
            "Uyum_Skoru":  round(duo_score, 3),
            "Ortak_Rol":   n_strong,
        })

    rows.sort(key=lambda x: -x["Uyum_Skoru"])
    return rows[:top_n]


def _bool_lineup_compat(df_season: pd.DataFrame, top_n: int = 50) -> list[dict]:
    """Tarihsel sezon için boolean vektörden en iyi 5'liler."""
    comp_avail = [c for c in COMP_COLS if c in df_season.columns]
    if not comp_avail or len(df_season) < 5:
        return []

    df = df_season[df_season["GP"] >= 20].reset_index(drop=True) if "GP" in df_season.columns else df_season.reset_index(drop=True)
    # top-30 versatility_score veya GP*MIN'e göre havuz
    if "versatility_score" in df.columns:
        pool = df.nlargest(30, "versatility_score").reset_index(drop=True)
    else:
        pool = df.head(30).reset_index(drop=True)

    mat   = pool[comp_avail].fillna(0).values.astype(float)
    names = pool["PLAYER_NAME"].tolist()
    n_comp = len(comp_avail)

    from itertools import combinations as comb
    combos = list(comb(range(len(pool)), 5))
    idx_arr = np.array(combos)
    max_sc  = mat[idx_arr].max(axis=1)   # (n_combos, n_comp)

    coverage = max_sc.mean(axis=1)
    depth    = (max_sc >= 0.5).sum(axis=1) / n_comp
    ls       = 0.60 * coverage + 0.40 * depth

    top_idx = np.argsort(-ls)[:top_n]
    rows = []
    for i in top_idx:
        cidx = combos[i]
        ms   = max_sc[i]
        rows.append({
            "Oyuncu_1":   names[cidx[0]],
            "Oyuncu_2":   names[cidx[1]],
            "Oyuncu_3":   names[cidx[2]],
            "Oyuncu_4":   names[cidx[3]],
            "Oyuncu_5":   names[cidx[4]],
            "Kapsama":    round(float(coverage[i]), 3),
            "Derinlik":   round(float(depth[i]), 3),
            "Uyum_Skoru": round(float(ls[i]), 3),
            "Guclu_Rol":  int((ms >= 0.5).sum()),
        })
    return rows


@app.get("/api/historical/{season}/duo-compat")
def get_historical_duo(season: str, limit: int = Query(50, ge=1, le=200)):
    if season == "2025-26":
        df = _load_scores().copy()
    else:
        df = _load_historical()
        df = df[df["SEASON"] == season]
    if df.empty:
        raise HTTPException(404, f"Season {season} not found")
    rows = _bool_duo_compat(df, top_n=limit)
    return {"season": season, "total": len(rows), "duos": rows}


@app.get("/api/historical/{season}/lineup-compat")
def get_historical_lineup(season: str, limit: int = Query(30, ge=1, le=100)):
    if season == "2025-26":
        df = _load_scores().copy()
    else:
        df = _load_historical()
        df = df[df["SEASON"] == season]
    if df.empty:
        raise HTTPException(404, f"Season {season} not found")
    rows = _bool_lineup_compat(df, top_n=limit)
    return {"season": season, "total": len(rows), "lineups": rows}


# ─── G-League endpoints ───────────────────────────────────────────────────────

@app.get("/api/gleague/players")
def get_gleague_players(
    search:   Optional[str] = Query(None),
    position: Optional[str] = Query(None),
    arch:     Optional[str] = Query(None),
    sort_by:  str = Query("overall_score"),
    limit:    int = Query(80, ge=1, le=500),
    offset:   int = Query(0, ge=0),
):
    try:
        df = _load_gleague_scores().copy()
    except FileNotFoundError:
        return {"coming_soon": False, "players": [], "total": 0,
                "message": "Run python src/fetch_gleague.py to fetch G-League data"}

    if search:
        df = df[df["PLAYER_NAME"].str.contains(search, case=False, na=False)]
    if position:
        pos_upper = position.upper()
        if pos_upper in ("PG", "SG", "SF", "PF", "C") and "POS5" in df.columns:
            df = df[df["POS5"] == pos_upper]
        elif "POSITION" in df.columns:
            df = df[df["POSITION"].str.contains(position, case=False, na=False)]
    if arch:
        df = df[df["primary_arch"].str.lower() == arch.lower()]

    valid_sort = sort_by if sort_by in df.columns else "overall_score"
    df = df.sort_values(valid_sort, ascending=False, na_position="last")

    total = len(df)
    page  = df.iloc[offset: offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "players": _safe(page)}


@app.get("/api/gleague/players/{player_name}/scores")
def get_gleague_player_scores(player_name: str):
    try:
        df = _load_gleague_scores()
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="G-League data not available")

    match = df[df["PLAYER_NAME"].str.lower() == player_name.lower()]
    if match.empty:
        match = df[df["PLAYER_NAME"].str.contains(player_name, case=False, na=False)]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"{player_name} not found in G-League")

    row = match.iloc[0]
    score_cols = [c for c in df.columns if c.startswith("score_")]
    score_cols_core = [c for c in score_cols if c.replace("score_","") in CORE_NOUNS]
    core_scores = {c.replace("score_",""):round(float(row[c]),3) for c in score_cols_core}
    gp = int(row.get("GP", 35)) if pd.notna(row.get("GP")) else 35

    return {
        "name":             row["PLAYER_NAME"],
        "team":             row.get("TEAM_ABBREVIATION",""),
        "position":         row.get("POSITION",""),
        "pos5":             row.get("POS5",""),
        "gp":               gp,
        "pts":              round(float(row["PTS"]),1) if "PTS" in row.index and pd.notna(row.get("PTS")) else None,
        "reb":              round(float(row["REB"]),1) if "REB" in row.index and pd.notna(row.get("REB")) else None,
        "ast":              round(float(row["AST"]),1) if "AST" in row.index and pd.notna(row.get("AST")) else None,
        "primary_arch":     row.get("primary_arch",""),
        "overall_score":    round(float(row["overall_score"]),3) if pd.notna(row.get("overall_score")) else None,
        "overall_pct":      round(float(row["overall_pct"]),3)   if pd.notna(row.get("overall_pct"))   else None,
        "overall_tier":     row.get("overall_tier",""),
        "scores":           core_scores,
        "age":              round(float(row["AGE"]),1) if "AGE" in row.index and pd.notna(row.get("AGE")) else None,
        "prospect":         _prospect_dict(row),
        "confidence_margin": _confidence_margin(gp),
        "league":           "gleague",
    }


@app.get("/api/euroleague/players")
def get_euroleague_players(
    search:   Optional[str] = Query(None),
    position: Optional[str] = Query(None),
    arch:     Optional[str] = Query(None),
    sort_by:  str = Query("overall_score"),
    limit:    int = Query(80, ge=1, le=500),
    offset:   int = Query(0, ge=0),
):
    try:
        df = _load_euroleague_scores().copy()
    except FileNotFoundError:
        return {"coming_soon": False, "players": [], "total": 0,
                "message": "Run python src/fetch_euroleague.py to fetch EuroLeague data"}

    if search:
        df = df[df["PLAYER_NAME"].str.contains(search, case=False, na=False)]
    if position:
        pos_upper = position.upper()
        if pos_upper in ("PG", "SG", "SF", "PF", "C") and "POS5" in df.columns:
            df = df[df["POS5"] == pos_upper]
        elif "POSITION" in df.columns:
            df = df[df["POSITION"].str.contains(position, case=False, na=False)]
    if arch:
        df = df[df["primary_arch"].str.lower() == arch.lower()]

    valid_sort = sort_by if sort_by in df.columns else "overall_score"
    df = df.sort_values(valid_sort, ascending=False, na_position="last")

    total = len(df)
    page  = df.iloc[offset: offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "players": _safe(page)}


@app.get("/api/euroleague/players/{player_name}/scores")
def get_euroleague_player_scores(player_name: str):
    try:
        df = _load_euroleague_scores()
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="EuroLeague data not available")

    match = df[df["PLAYER_NAME"].str.lower() == player_name.lower()]
    if match.empty:
        match = df[df["PLAYER_NAME"].str.contains(player_name, case=False, na=False)]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"{player_name} not found in EuroLeague")

    row = match.iloc[0]
    score_cols = [c for c in df.columns if c.startswith("score_")]
    score_cols_core = [c for c in score_cols if c.replace("score_","") in CORE_NOUNS]
    core_scores = {c.replace("score_",""):round(float(row[c]),3) for c in score_cols_core}
    gp = int(row.get("GP", 30)) if pd.notna(row.get("GP")) else 30

    return {
        "name":             row["PLAYER_NAME"],
        "team":             row.get("TEAM_ABBREVIATION",""),
        "position":         row.get("POSITION",""),
        "pos5":             row.get("POS5",""),
        "gp":               gp,
        "pts":              round(float(row["PTS"]),1) if "PTS" in row.index and pd.notna(row.get("PTS")) else None,
        "reb":              round(float(row["REB"]),1) if "REB" in row.index and pd.notna(row.get("REB")) else None,
        "ast":              round(float(row["AST"]),1) if "AST" in row.index and pd.notna(row.get("AST")) else None,
        "primary_arch":     row.get("primary_arch",""),
        "overall_score":    round(float(row["overall_score"]),3) if pd.notna(row.get("overall_score")) else None,
        "overall_pct":      round(float(row["overall_pct"]),3)   if pd.notna(row.get("overall_pct"))   else None,
        "overall_tier":     row.get("overall_tier",""),
        "scores":           core_scores,
        "age":              round(float(row["AGE"]),1) if "AGE" in row.index and pd.notna(row.get("AGE")) else None,
        "confidence_margin": _confidence_margin(gp),
        "league":           "euroleague",
    }


@app.get("/api/ncaa/players")
def get_ncaa_players(
    search:   Optional[str] = Query(None),
    position: Optional[str] = Query(None),
    arch:     Optional[str] = Query(None),
    sort_by:  str = Query("overall_score"),
    limit:    int = Query(80, ge=1, le=500),
    offset:   int = Query(0, ge=0),
):
    try:
        df = _load_ncaa_scores().copy()
    except FileNotFoundError:
        return {"coming_soon": False, "players": [], "total": 0,
                "message": "Run python src/fetch_ncaa.py to fetch NCAA data"}

    if search:
        df = df[df["PLAYER_NAME"].str.contains(search, case=False, na=False)]
    if position:
        pos_upper = position.upper()
        if pos_upper in ("PG", "SG", "SF", "PF", "C") and "POS5" in df.columns:
            df = df[df["POS5"] == pos_upper]
        elif "POSITION" in df.columns:
            df = df[df["POSITION"].str.contains(position, case=False, na=False)]
    if arch:
        df = df[df["primary_arch"].str.lower() == arch.lower()]

    valid_sort = sort_by if sort_by in df.columns else "overall_score"
    df = df.sort_values(valid_sort, ascending=False, na_position="last")

    total = len(df)
    page  = df.iloc[offset: offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "players": _safe(page)}


@app.get("/api/ncaa/players/{player_name}/scores")
def get_ncaa_player_scores(player_name: str):
    try:
        df = _load_ncaa_scores()
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="NCAA data not available")

    match = df[df["PLAYER_NAME"].str.lower() == player_name.lower()]
    if match.empty:
        match = df[df["PLAYER_NAME"].str.contains(player_name, case=False, na=False)]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"{player_name} not found in NCAA")

    row = match.iloc[0]
    score_cols = [c for c in df.columns if c.startswith("score_")]
    score_cols_core = [c for c in score_cols if c.replace("score_","") in CORE_NOUNS]
    core_scores = {c.replace("score_",""):round(float(row[c]),3) for c in score_cols_core}
    gp = int(row.get("GP", 30)) if pd.notna(row.get("GP")) else 30

    return {
        "name":             row["PLAYER_NAME"],
        "team":             row.get("TEAM_ABBREVIATION",""),
        "conference":       row.get("CONFERENCE",""),
        "class":            row.get("CLASS",""),
        "age":              round(float(row["AGE"]),1) if "AGE" in row.index and pd.notna(row.get("AGE")) else None,
        "position":         row.get("POSITION",""),
        "pos5":             row.get("POS5",""),
        "gp":               gp,
        "pts":              round(float(row["PTS"]),1) if "PTS" in row.index and pd.notna(row.get("PTS")) else None,
        "reb":              round(float(row["REB"]),1) if "REB" in row.index and pd.notna(row.get("REB")) else None,
        "ast":              round(float(row["AST"]),1) if "AST" in row.index and pd.notna(row.get("AST")) else None,
        "primary_arch":     row.get("primary_arch",""),
        "overall_score":    round(float(row["overall_score"]),3) if pd.notna(row.get("overall_score")) else None,
        "overall_pct":      round(float(row["overall_pct"]),3)   if pd.notna(row.get("overall_pct"))   else None,
        "overall_tier":     row.get("overall_tier",""),
        "scores":           core_scores,
        "prospect":         _prospect_dict(row),
        "confidence_margin": _confidence_margin(gp),
        "league":           "ncaa",
    }


# ─── Takım bazlı endpointler ──────────────────────────────────────────────────

@app.get("/api/teams")
def get_teams(season: str = "2025-26"):
    """Belirtilen sezondaki takım listesi."""
    if season == "2025-26":
        df = _load_scores()
        col = "TEAM_ABBREVIATION"
    else:
        df = _load_historical()
        df = df[df["SEASON"] == season]
        col = "TEAM_ABBREVIATION"
    if col not in df.columns or df.empty:
        return {"teams": []}
    return {"teams": sorted(df[col].dropna().unique().tolist())}


@app.get("/api/teams/{team}/players")
def get_team_players(team: str, season: str = "2025-26"):
    """Takımın oyuncuları (skor vektörleriyle, 2025-26 için; tarihsel için boolean)."""
    if season == "2025-26":
        df = _load_scores()
        df = df[df["TEAM_ABBREVIATION"].str.upper() == team.upper()]
        return _safe(df.sort_values("overall_score", ascending=False))
    else:
        df = _load_historical()
        df = df[(df["SEASON"] == season) & (df["TEAM_ABBREVIATION"].str.upper() == team.upper())]
        comp_avail = [c for c in COMP_COLS if c in df.columns]
        df = df.copy()
        df["Bileşenler"] = df.apply(
            lambda r: " | ".join(c for c in comp_avail if r.get(c, False)), axis=1)
        keep = ["PLAYER_NAME","GP","MIN","PTS","REB","AST","Bileşenler"]
        keep = [c for c in keep if c in df.columns]
        return _safe(df[keep].sort_values("overall_score", ascending=False) if "overall_score" in df.columns else df[keep])


@app.get("/api/teams/{team}/duo-compat")
def get_team_duo_compat(team: str, season: str = "2025-26"):
    """Takım içi duo uyum tablosu."""
    if season == "2025-26":
        df = _load_duo_compat()
        mask = ((df["Takım_1"].str.upper() == team.upper()) &
                (df["Takım_2"].str.upper() == team.upper()))
        result = df[mask].sort_values("Uyum_Skoru", ascending=False)
        return _safe(result)
    else:
        df = _load_historical()
        df = df[(df["SEASON"] == season) & (df["TEAM_ABBREVIATION"].str.upper() == team.upper())]
        rows = _bool_duo_compat(df, top_n=100)
        return rows


@app.get("/api/historical/{season}/player/{player_name}/scores")
def get_historical_player_scores(season: str, player_name: str):
    """Tarihsel sezonda oyuncunun bileşen profili (radar için). 2025-26 destekli."""
    if season == "2025-26":
        df = _load_scores().copy()
        # score_ sütunlarını boolean gibi kullan
        score_cols = [c for c in df.columns if c.startswith("score_")]
        comp_avail = [c.replace("score_","") for c in score_cols if c.replace("score_","") in COMP_COLS]
    else:
        df = _load_historical()
        df = df[df["SEASON"] == season]
        # score_* kolonları sürekli [0,1] percentile — boolean kolon değil
        comp_avail = [c for c in COMP_COLS if f"score_{c}" in df.columns]

    match = df[df["PLAYER_NAME"].str.contains(player_name, case=False, na=False)]
    if match.empty:
        raise HTTPException(404, f"{player_name} not found ({season})")
    row = match.iloc[0]

    if season == "2025-26":
        scores = {c: round(float(row.get(f"score_{c}", 0)), 3) for c in comp_avail}
    else:
        scores = {c: round(float(row.get(f"score_{c}", 0)), 3) for c in comp_avail}
        # Modifier skorları: hist_merged'den on-the-fly hesapla (var olan metriklerle)
        modifier_scores: dict = {}
        active_modifiers: list = []
        try:
            from engine import predict_components, compute_percentiles
            from signatures import COMPONENT_SIGNATURES, MODIFIER_TAGS
            merged_p = DATA / f"{season.replace('/', '-')}__hist_merged.parquet"
            if merged_p.exists():
                mdf = pd.read_parquet(merged_p)
                # FT_RATE türet
                if "FTA" in mdf.columns and "FGA" in mdf.columns:
                    mdf["FT_RATE"] = (mdf["FTA"] / mdf["FGA"].replace(0, pd.NA)).fillna(0)
                mod_sigs = {k: v for k, v in COMPONENT_SIGNATURES.items() if k in MODIFIER_TAGS}
                if mod_sigs:
                    all_m = sorted({m for c in mod_sigs for m in mod_sigs[c]["metrics"]})
                    pct_df = compute_percentiles(mdf, all_m)
                    from engine import score_component
                    for tag in MODIFIER_TAGS:
                        if tag not in mod_sigs:
                            continue
                        s = score_component(pct_df, tag, mod_sigs)
                        # Bu oyuncunun satırını bul
                        p_match = mdf[mdf["PLAYER_NAME"].str.contains(player_name, case=False, na=False)]
                        if p_match.empty:
                            continue
                        idx = p_match.index[0]
                        val = float(s.loc[idx]) if idx in s.index else 0.0
                        if pd.isna(val):
                            val = 0.0
                        modifier_scores[tag] = round(val, 3)
                    thr_def = 0.70
                    active_modifiers = [t for t, v in modifier_scores.items() if v >= thr_def]
        except Exception:
            pass

    overall = row.get("overall_score", None)
    primary = row.get("primary_arch", "")
    pos_raw = str(row.get("POSITION","") or "")
    def _stat(col):
        v = row.get(col)
        return round(float(v), 1) if v is not None and pd.notna(v) else None

    _gp_val = int(row.get("GP", 70)) if pd.notna(row.get("GP", 70)) else 70
    result = {
        "name":               row["PLAYER_NAME"],
        "season":             season,
        "team":               row.get("TEAM_ABBREVIATION",""),
        "position":           pos_raw,
        "gp":                 _gp_val,
        "pts":                _stat("PTS"),
        "reb":                _stat("REB"),
        "ast":                _stat("AST"),
        "bpm":                _stat("BPM"),
        "scores":             scores,
        "overall_score":      round(float(overall),3) if overall is not None and pd.notna(overall) else None,
        "primary_arch":       primary if isinstance(primary, str) else "",
        "confidence_margin":  _confidence_margin(_gp_val),
    }
    if season != "2025-26":
        result["modifier_scores"]  = modifier_scores
        result["active_modifiers"] = active_modifiers
    return result


@app.post("/api/historical/{season}/lineup-compat/custom")
def post_historical_custom_lineup(season: str, body: dict):
    """Tarihsel sezon için özel 5'li lineup uyumu. Body: {players: [name, ...]}"""
    names = body.get("players", [])
    if len(names) < 2:
        raise HTTPException(400, "En az 2 oyuncu gerekli")

    if season == "2025-26":
        df = _load_scores().copy()
    else:
        hist = _load_historical()
        df = hist[hist["SEASON"] == season].copy()
        if df.empty:
            raise HTTPException(404, f"Season {season} not found")

    score_cols = [c for c in df.columns if c.startswith("score_") and c.replace("score_","") in ALL_COMP_COLS]
    matched = []
    for name in names:
        hit = df[df["PLAYER_NAME"].str.contains(name, case=False, na=False)]
        if not hit.empty:
            matched.append(hit.iloc[0])

    if len(matched) < 2:
        raise HTTPException(404, "Players not found in dataset")

    from roles import compute_role_vec, ROLE_SLOTS
    players_out = []
    for row in matched:
        sc = {c.replace("score_",""): round(float(row.get(c,0)),3) for c in score_cols if pd.notna(row.get(c))}
        players_out.append({
            "name":         row["PLAYER_NAME"],
            "team":         row.get("TEAM_ABBREVIATION",""),
            "primary_arch": row.get("primary_arch",""),
            "overall_score": round(float(row["overall_score"]),3) if pd.notna(row.get("overall_score")) else None,
            "scores":       sc,
        })

    # Coverage hesabı — score_* tabanlı
    comp_avail = list({c.replace("score_","") for c in score_cols})
    import numpy as np
    mat = np.array([[float(row.get(f"score_{c}",0) or 0) for c in comp_avail] for row in matched])
    max_cov = mat.max(axis=0)
    coverage = float(max_cov.mean())
    depth    = float((max_cov >= 0.50).mean())
    lineup_score = round(0.60 * coverage + 0.40 * depth, 3)

    pillar_keys = {
        "Creation":  ["Engine","Ecosystem","Hub","Creator","Initiator"],
        "Spacing":   ["Spacer","3-and-D","Stretch","Gravity","Three-Level"],
        "Defense":   ["Anchor","Stopper","Two-Way","Force"],
        "Finishing": ["Finisher","Rim Runner","Force","Slashing"],
    }
    pillar_breakdown = {}
    for pillar, comps in pillar_keys.items():
        vals = [float(row.get(f"score_{c}", 0) or 0) for row in matched for c in comps if f"score_{c}" in df.columns]
        pillar_breakdown[pillar] = round(max(vals) if vals else 0, 3)

    ball_dom = sum(
        1 for row in matched
        if max(float(row.get("score_Engine",0) or 0)*1.05, float(row.get("score_Ecosystem",0) or 0)) >= 0.80
    )
    role_fit = max(0.0, 1.0 - max(0, (ball_dom - 1) * 0.15))
    pillar_breakdown["Role Fit"] = round(role_fit, 3)

    return {
        "season":          season,
        "players":         players_out,
        "lineup_score":    lineup_score,
        "coverage":        round(coverage, 3),
        "pillar_breakdown": pillar_breakdown,
        "role_fit":        round(role_fit, 3),
        "n_matched":       len(matched),
    }


# ── Franchise geçmişi: modern kısaltma → tarihsel kısaltmalar ─────────────────
# Her giriş: (ilk_sezon_yılı, son_sezon_yılı, tarihsel_kısaltma)
_FRANCHISE_HISTORY: dict[str, list[tuple[int,int,str]]] = {
    "BKN": [(1967,2011,"NJN")],                          # New Jersey Nets
    "OKC": [(1967,2007,"SEA")],                          # Seattle SuperSonics
    "NOP": [(2002,2004,"NOH"),(2005,2006,"NOK"),(2007,2013,"NOH")],  # NO Hornets/OKC Hornets
    "MEM": [(1995,2000,"VAN")],                          # Vancouver Grizzlies
    "CHA": [(1988,2001,"CHH"),(2004,2013,"CHA")],        # Charlotte Hornets / Bobcats
    "UTA": [(1974,1978,"NOJ")],                          # New Orleans Jazz → Utah
    "WAS": [(1961,1996,"WSB"),(1997,2000,"WAS")],        # Washington Bullets
    "SAC": [(1972,1984,"KCK"),(1984,1984,"KCO")],        # Kansas City Kings
    "LAC": [(1970,1977,"BUF"),(1978,1983,"SDC")],        # Buffalo/SD Clippers
    "GSW": [(1962,1970,"SFW"),(1971,1971,"GSW")],        # SF/GS Warriors
    "DAL": [],  # her zaman DAL
    "DEN": [],
}

# Tarihsel kısaltma → modern kısaltma (ters tablo)
_HIST_TO_MODERN: dict[str, str] = {}
for _modern, _entries in _FRANCHISE_HISTORY.items():
    for _s, _e, _hist in _entries:
        _HIST_TO_MODERN[_hist] = _modern


def _resolve_abbrev(modern: str, season: str) -> list[str]:
    """Modern kısaltmayı (BKN) verilen sezondaki gerçek kısaltmaya (NJN) çevirir."""
    try:
        year = int(season[:4])
    except ValueError:
        return [modern]
    entries = _FRANCHISE_HISTORY.get(modern, [])
    for start, end, hist in entries:
        if start <= year <= end:
            return [hist]
    return [modern]


def _gp_filter(df: pd.DataFrame, min_gp: int = 15) -> pd.DataFrame:
    """GP veya G kolonuyla filtrele (BBref 'G', nba_api 'GP')."""
    col = next((c for c in ["GP","G"] if c in df.columns), None)
    if col:
        df = df[df[col].fillna(0) >= min_gp]
    return df


@app.get("/api/game/seasons")
def game_seasons():
    """Mevcut tüm sezonlar — oyun için (güncel + tarihsel)."""
    seasons = ["2025-26"]
    hist = _load_historical()
    if not hist.empty and "SEASON" in hist.columns:
        hist_seasons = sorted(hist["SEASON"].unique().tolist(), reverse=True)
        seasons.extend(hist_seasons)
    return {"seasons": seasons}


@app.get("/api/game/teams")
def game_teams(season: str = Query("2025-26")):
    """Belirtilen sezonda veri olan takımlar.
    Tarihsel kısaltmalar (NJN, SEA…) modern karşılıklarına (BKN, OKC…) çevrilir."""
    if season == "2025-26":
        df = _load_scores()
        if df.empty or "TEAM_ABBREVIATION" not in df.columns:
            return {"teams": []}
        raw = df["TEAM_ABBREVIATION"].dropna().unique().tolist()
    else:
        df = _load_historical()
        if df.empty or "TEAM_ABBREVIATION" not in df.columns:
            return {"teams": []}
        df = df[df["SEASON"] == season]
        df = _gp_filter(df, 10)
        raw = df["TEAM_ABBREVIATION"].dropna().unique().tolist()

    # Multi-team sözde-takımları (2TM/3TM/TOT — sezon içi takas totali) çıkar;
    # bunlar game_players'da filtrelendiği için "no data" respin'e yol açıyordu.
    _multi = {"2TM", "3TM", "4TM", "5TM", "TOT"}
    raw = [t for t in raw if str(t).upper() not in _multi]

    # Tarihsel kısaltmalar → modern kısaltmalar
    modern = sorted({_HIST_TO_MODERN.get(t, t) for t in raw})
    return {"teams": modern}


def _timeless_cutoff(overall_series, n: int = 2, floor: float = 0.80) -> float:
    """TIMELESS hibrit eşiği: sezonun en iyi n oyuncusu VE overall >= floor.
    Eşik = max(floor, n. en yüksek overall). Düşük tavanlı sezon (2001-02 max
    0.756) → floor'a takılır, hiç timeless çıkmaz. Şişik sezon (1984-85) →
    yalnız gerçek top-n timeless olur (sabit eşikteki aşırı-cömertlik biter)."""
    vals = overall_series.dropna().sort_values(ascending=False)
    if len(vals) == 0:
        return 1.0
    nth = float(vals.iloc[min(n, len(vals)) - 1])
    return max(floor, nth)


@app.get("/api/game/players")
def game_players(season: str = Query("2025-26"), team: str = Query("")):
    """Oyun için oyuncu listesi. Modern takım adı (BKN) tarihsel karşılığa (NJN)
    otomatik çevrilir; score_* kolonları + is_timeless bayrağı döner."""
    if season == "2025-26":
        full = _load_scores().copy()
        full = _gp_filter(full, 20)
        tl_cutoff = _timeless_cutoff(full["overall_score"]) if "overall_score" in full.columns else 1.0
        df = full[full["TEAM_ABBREVIATION"].str.upper() == team.upper()] if team else full
    else:
        full = _load_historical().copy()
        full = full[full["SEASON"] == season]
        # Multi-team (2TM/3TM/TOT) satırlarını filtrele — sadece per-takım satırları kalsın
        _multi = {"2TM","3TM","4TM","TOT"}
        if "TEAM_ABBREVIATION" in full.columns:
            full = full[~full["TEAM_ABBREVIATION"].str.upper().isin(_multi)]
        full = _gp_filter(full, 10)
        # Sezonun tam havuzundan timeless eşiği (takım filtresinden ÖNCE)
        tl_cutoff = _timeless_cutoff(full["overall_score"]) if "overall_score" in full.columns else 1.0
        df = full
        if team and "TEAM_ABBREVIATION" in df.columns:
            hist_abbrevs = [a.upper() for a in _resolve_abbrev(team.upper(), season)]
            df = df[df["TEAM_ABBREVIATION"].str.upper().isin(hist_abbrevs)]
        # hist_Base'den eksik stat sütunlarını merge et (FG3_PCT, FG_PCT, STL, BLK)
        base_stats = _load_hist_base_stats(season)
        if not base_stats.empty and "PLAYER_ID" in df.columns:
            missing_cols = [c for c in base_stats.columns if c != "PLAYER_ID" and c not in df.columns]
            if missing_cols:
                df = df.merge(base_stats[["PLAYER_ID"] + missing_cols], on="PLAYER_ID", how="left")

    # VERSATILE eşiği (takım filtresinden ÖNCE, tam havuzdan) — modern
    # score_Versatile (0-1), tarihsel versatility_score (0-9 skala) farklı
    # kolonlar; ikisi de havuzun üst ~%15'i versatile sayılır.
    _vcol = "score_Versatile" if "score_Versatile" in full.columns else (
        "versatility_score" if "versatility_score" in full.columns else None)
    v_cut = float(full[_vcol].quantile(0.85)) if _vcol and full[_vcol].notna().any() else None

    df = df.copy()
    # NaN pozisyonları doldur, POS5 hesapla
    df = _fill_position_from_components(df)
    df["POS5"] = _assign_pos5(df)
    # İkincil mevki: BBref POS_SECONDARY (gerçek "SG-PG"/"PF-C" verisi) varsa
    # onu kullan, yoksa stat-heuristik (asist→guard, blok/boy→C ikincil).
    _sec_heur = _assign_secondary_pos(df, df["POS5"])
    if "POS_SECONDARY" in df.columns:
        _bref_sec = df["POS_SECONDARY"].astype(str).str.strip().str.upper()
        _valid = _bref_sec.isin(["PG", "SG", "SF", "PF", "C"])
        df["POS5_SECONDARY"] = _bref_sec.where(_valid, _sec_heur)
    else:
        df["POS5_SECONDARY"] = _sec_heur
    # İkincil primary'yle aynıysa temizle (tek pozisyonluk oyuncu)
    df.loc[df["POS5_SECONDARY"] == df["POS5"], "POS5_SECONDARY"] = ""
    # TIMELESS: hibrit (sezon top-2 + taban 0.80) — frontend bunu okur
    if "overall_score" in df.columns:
        df["is_timeless"] = (df["overall_score"] >= tl_cutoff).astype(bool)
    # VERSATILE: havuzun üst ~%15'i (FLEX + tag) — frontend bunu okur
    if _vcol and v_cut is not None and _vcol in df.columns:
        df["is_versatile"] = (df[_vcol].fillna(-1) >= v_cut).astype(bool)

    score_cols = [c for c in df.columns if c.startswith("score_")]
    keep = ["PLAYER_ID", "PLAYER_NAME", "primary_arch", "overall_score", "POSITION", "POS5",
            "POS5_SECONDARY", "TEAM_ABBREVIATION", "GP", "G", "MIN", "PTS", "REB", "AST",
            "STL", "BLK", "TOV", "FG3_PCT", "is_timeless", "is_versatile"] + score_cols
    keep = [c for c in keep if c in df.columns]

    df = df[keep].copy()
    if "overall_score" in df.columns:
        df = df.sort_values("overall_score", ascending=False, na_position="last")

    limit = 20 if team else 60
    return {"players": _safe(df.head(limit))}


@app.get("/api/players/{player_name}/similar")
def get_similar_players(player_name: str, n: int = Query(10, ge=1, le=50)):
    """
    En benzer n oyuncu — çok boyutlu benzerlik skoru.
    Vektör: core noun skorları (ağırlık 1.0) + modifier skorları (ağırlık 0.4).
    Cosine similarity sadece core noun'larla çalışıyordu;
    modifier'lar eklenerek "Pressure Engine" ile "Volume Engine" ayrışıyor.
    """
    _auto_invalidate()
    df = _load_scores()

    # Sorgu oyuncusunu bul
    match = df[df["PLAYER_NAME"].str.lower() == player_name.lower()]
    if match.empty:
        match = df[df["PLAYER_NAME"].str.contains(player_name, case=False, na=False)]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"{player_name} not found")

    # Vektör: core (ağırlık 1.0) + modifier (ağırlık 0.4)
    core_cols = [f"score_{c}" for c in CORE_NOUNS    if f"score_{c}" in df.columns]
    mod_cols  = [f"score_{c}" for c in MODIFIER_TAGS if f"score_{c}" in df.columns]

    core_mat = df[core_cols].fillna(0).values.astype(float)
    mod_mat  = df[mod_cols].fillna(0).values.astype(float) * 0.4 if mod_cols else np.zeros((len(df), 0))

    mat = np.hstack([core_mat, mod_mat]) if mod_cols else core_mat

    # L2 normalize
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    mat_norm = mat / norms

    # df'deki integer index yerine iloc pozisyonunu kullan
    iloc_idx = df.index.get_loc(match.index[0])
    query_vec = mat_norm[iloc_idx]
    similarities = mat_norm @ query_vec

    # Kendisini hariç tut, en yüksek n'yi al
    similarities[iloc_idx] = -1.0
    top_idx = np.argsort(similarities)[::-1][:n]

    results = []
    for i in top_idx:
        row = df.iloc[i]
        results.append({
            "name":         row["PLAYER_NAME"],
            "team":         row.get("TEAM_ABBREVIATION", ""),
            "position":     row.get("POSITION", ""),
            "primary_arch": row.get("primary_arch", ""),
            "overall_score": round(float(row["overall_score"]), 3) if pd.notna(row.get("overall_score")) else None,
            "overall_tier": row.get("overall_tier", ""),
            "similarity":   round(float(similarities[i]), 3),
        })
    return {"query": match.iloc[0]["PLAYER_NAME"], "similar": results}


@app.get("/api/player/career")
def get_player_career(name: str = Query(..., description="Oyuncu adı")):
    """
    Sezon bazında kariyer zaman çizelgesi.
    BREF_SLUG ile çapraz sezon eşleştirme; yoksa isim benzeri eşleşme.
    Döner: season, primary_arch, overall_score, GP listesi.
    """
    _auto_invalidate()
    hist = _load_historical()
    if hist.empty:
        raise HTTPException(status_code=503, detail="historical__labeled.parquet yok")

    # Önce tam isim eşleştirme
    match = hist[hist["PLAYER_NAME"].str.lower() == name.lower()]
    if match.empty:
        match = hist[hist["PLAYER_NAME"].str.contains(name, case=False, na=False)]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"{name} not found in career data")

    player_name_canonical = match.iloc[0]["PLAYER_NAME"]

    # BREF_SLUG varsa slug ile de eşleştir (isim değişmiş olabilir)
    slug = None
    slug_conflict = None
    if "BREF_SLUG" in match.columns:
        slugs = match["BREF_SLUG"].dropna().unique()
        if len(slugs) > 0:
            slug = slugs[0]
            slug_rows = hist[hist["BREF_SLUG"] == slug]
            if len(slug_rows) > len(match):
                match = slug_rows
            # Çakışma kontrolü: slug → birden fazla farklı oyuncu adı
            names_for_slug = slug_rows["PLAYER_NAME"].unique().tolist() if not slug_rows.empty else []
            if len(names_for_slug) > 1:
                slug_conflict = names_for_slug
                import logging
                logging.getLogger("uvicorn").warning(
                    "BREF_SLUG cakisma: slug=%s → %s", slug, names_for_slug
                )

    seasons = match.sort_values("SEASON")
    timeline = []
    for _, row in seasons.iterrows():
        ovr = row.get("overall_score")
        entry = {
            "season":       row["SEASON"],
            "team":         row.get("TEAM_ABBREVIATION", ""),
            "primary_arch": row.get("primary_arch", "") if isinstance(row.get("primary_arch"), str) else "",
            "overall_score": round(float(ovr), 3) if ovr is not None and pd.notna(ovr) else None,
            "gp":           int(row["GP"]) if pd.notna(row.get("GP")) else None,
            "pts":          round(float(row["PTS"]), 1) if pd.notna(row.get("PTS")) else None,
            "reb":          round(float(row["REB"]), 1) if pd.notna(row.get("REB")) else None,
            "ast":          round(float(row["AST"]), 1) if pd.notna(row.get("AST")) else None,
        }
        timeline.append(entry)

    return {
        "name":          player_name_canonical,
        "slug":          slug,
        "slug_conflict": slug_conflict,
        "seasons":       timeline,
    }


@app.get("/api/explore/pca")
def get_pca_loadings():
    """
    PCA yüklemeleri — PC1 ve PC2 için hangi arketip boyutunun ne kadar katkıda bulunduğunu döner.
    İstemci tarafı PCA ile tutarlı: 12 core noun skor vektörü üzerinden covariance PCA.
    """
    _auto_invalidate()
    df = _load_scores()
    score_cols = [f"score_{c}" for c in CORE_NOUNS if f"score_{c}" in df.columns]
    if len(score_cols) < 3:
        raise HTTPException(503, "Yeterli skor kolonu yok")

    mat = df[score_cols].fillna(0).values.astype(float)
    # Merkezi hale getir
    mat -= mat.mean(axis=0, keepdims=True)
    # Covariance
    cov = (mat.T @ mat) / max(len(mat) - 1, 1)

    # Power iteration ile PC1 ve PC2
    def power_iter(cov_m, deflate=None, iters=80):
        v = np.zeros(cov_m.shape[0])
        v[0] = 1.0
        if deflate is not None:
            for ev in deflate:
                v -= np.dot(ev, v) * ev
        for _ in range(iters):
            v = cov_m @ v
            if deflate is not None:
                for ev in deflate:
                    v -= np.dot(ev, v) * ev
            norm = np.linalg.norm(v)
            if norm < 1e-12:
                break
            v = v / norm
        return v

    ev1 = power_iter(cov)
    ev2 = power_iter(cov, deflate=[ev1])

    # Açıklanan varyans tahmini
    lam1 = float(ev1 @ cov @ ev1)
    lam2 = float(ev2 @ cov @ ev2)
    total_var = float(np.trace(cov))
    pct1 = round(lam1 / total_var, 4) if total_var > 0 else 0
    pct2 = round(lam2 / total_var, 4) if total_var > 0 else 0

    labels = [c.replace("score_", "") for c in score_cols]
    return {
        "pc1": {"pct_variance": pct1,
                "loadings": {l: round(float(ev1[i]), 4) for i, l in enumerate(labels)}},
        "pc2": {"pct_variance": pct2,
                "loadings": {l: round(float(ev2[i]), 4) for i, l in enumerate(labels)}},
    }


# ─── Auth + User + Article + Comment endpoints ────────────────────────────────

from .db   import init_db, get_conn
from .auth import (hash_password, verify_password, create_token,
                   get_current_user, get_optional_user, require_admin,
                   ADMIN_INVITE_CODE)
from pydantic import BaseModel, EmailStr
import re as _re

init_db()

# Teşhis: app.db gerçekte nereye yazıyor + kaç satır var? Volume kalıcılığını
# loglardan doğrulamak için. Restart sonrası sayılar 0'a düşüyorsa persistence bozuk.
# /data/... → volume (kalıcı) ; /app/data/... → image (restart'ta sıfırlanır)
import api.db as _dbmod
try:
    with get_conn() as _c:
        _u = _c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        _g = _c.execute("SELECT COUNT(*) FROM lineup_games").fetchone()[0]
    print(f"[startup] DB_PATH = {_dbmod.DB_PATH.resolve()}  users={_u}  lineup_games={_g}",
          flush=True)
except Exception as _e:
    print(f"[startup] DB_PATH diag failed: {_e}", flush=True)

# ── Pydantic modelleri ────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    email: str
    username: str
    password: str
    admin_invite_code: str = ""

class LoginBody(BaseModel):
    email: str
    password: str

class PatchUserBody(BaseModel):
    is_banned: int = None

class ForgotBody(BaseModel):
    email: str

class ResetBody(BaseModel):
    token: str
    password: str

class GoogleAuthBody(BaseModel):
    credential: str

class ArticleBody(BaseModel):
    title: str
    slug: str = ""
    content: str = ""
    cover_image_url: str = ""
    status: str = "draft"

class CommentBody(BaseModel):
    content: str

class SavePlayerBody(BaseModel):
    player_name: str
    season: str = "2025-26"

class SaveLineupBody(BaseModel):
    players: list
    score: float = None
    grade: str = ""
    pct: float = None
    label: str = ""

# ── Yardımcı ─────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    s = text.lower().strip()
    s = _re.sub(r"[^\w\s-]", "", s)
    s = _re.sub(r"[\s_-]+", "-", s)
    return s[:80]

def _row(r) -> dict:
    return dict(r) if r else None

# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(body: RegisterBody):
    is_admin = body.admin_invite_code and body.admin_invite_code == ADMIN_INVITE_CODE
    role = "admin" if is_admin else "user"
    if not body.email or "@" not in body.email:
        raise HTTPException(400, "Invalid email address")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if len(body.username) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    hashed = hash_password(body.password)
    try:
        with get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, username, hashed_password, role) VALUES (?,?,?,?)",
                (body.email.lower(), body.username, hashed, role)
            )
            user_id = cur.lastrowid
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(409, "Email or username already taken")
        raise HTTPException(500, str(e))
    token = create_token(user_id, role)
    return {"token": token, "user": {"id": user_id, "email": body.email, "username": body.username, "role": role}}

@app.post("/api/auth/login")
def login(body: LoginBody):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email=?", (body.email.lower(),)).fetchone()
    if not row or not row["hashed_password"]:
        raise HTTPException(401, "Incorrect email or password")
    if not verify_password(body.password, row["hashed_password"]):
        raise HTTPException(401, "Incorrect email or password")
    if row["is_banned"]:
        raise HTTPException(403, "This account has been suspended")
    token = create_token(row["id"], row["role"])
    return {"token": token, "user": {"id": row["id"], "email": row["email"],
                                      "username": row["username"], "role": row["role"]}}

@app.post("/api/auth/google")
def google_auth(body: GoogleAuthBody):
    import httpx
    resp = httpx.get(
        f"https://oauth2.googleapis.com/tokeninfo?id_token={body.credential}",
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(400, "Invalid Google token")
    info = resp.json()
    if GOOGLE_CLIENT_ID and info.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(400, "Token audience mismatch")
    email = info.get("email", "")
    if not email:
        raise HTTPException(400, "No email in Google token")
    base = _re.sub(r"[^A-Za-z0-9_]", "", info.get("given_name", email.split("@")[0]))[:20] or "user"
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email.lower(),)).fetchone()
        if row:
            if row["is_banned"]:
                raise HTTPException(403, "Account suspended")
            user_id, role = row["id"], row["role"]
        else:
            username = base
            for i in range(1, 100):
                exists = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
                if not exists:
                    break
                username = f"{base}{i}"
            cur = conn.execute(
                "INSERT INTO users (email, username, hashed_password, role) VALUES (?,?,?,?)",
                (email.lower(), username, "", "user"),
            )
            user_id, role = cur.lastrowid, "user"
        user_row = conn.execute(
            "SELECT id,email,username,role FROM users WHERE id=?", (user_id,)
        ).fetchone()
    return {"token": create_token(user_id, role), "user": dict(user_row)}

@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotBody):
    with get_conn() as conn:
        row = conn.execute("SELECT id, email FROM users WHERE email=?", (body.email.lower(),)).fetchone()
    if row:
        token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        with get_conn() as conn:
            conn.execute("UPDATE users SET reset_token=?, reset_expires=? WHERE id=?",
                         (token, expires, row["id"]))
        reset_url = f"{SITE_URL}/reset-password?token={token}"
        _send_email(
            row["email"],
            "NBA Archetype — Password Reset",
            f"""<p>Click the link below to reset your password. It expires in 1 hour.</p>
            <p><a href="{reset_url}">{reset_url}</a></p>
            <p>If you didn't request this, you can ignore this email.</p>""",
        )
    return {"ok": True}  # always OK — don't reveal if email exists

@app.post("/api/auth/reset-password")
def reset_password(body: ResetBody):
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, role FROM users WHERE reset_token=? AND reset_expires > datetime('now')",
            (body.token,),
        ).fetchone()
    if not row:
        raise HTTPException(400, "Invalid or expired reset link")
    hashed = hash_password(body.password)
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET hashed_password=?, reset_token=NULL, reset_expires=NULL WHERE id=?",
            (hashed, row["id"]),
        )
        user_row = conn.execute("SELECT id,email,username,role FROM users WHERE id=?", (row["id"],)).fetchone()
    new_token = create_token(row["id"], row["role"])
    return {"token": new_token, "user": dict(user_row)}

@app.post("/api/auth/promote")
def promote(body: LoginBody, user=Depends(get_current_user)):
    """Mevcut kullanıcıyı admin'e yükselt — invite code doğruysa."""
    if not ADMIN_INVITE_CODE:
        raise HTTPException(400, "ADMIN_INVITE_CODE env var not set on server")
    if body.password != ADMIN_INVITE_CODE:
        raise HTTPException(403, "Invalid admin invite code")
    uid = int(user["sub"])
    with get_conn() as conn:
        conn.execute("UPDATE users SET role='admin' WHERE id=?", (uid,))
        row = conn.execute("SELECT id,email,username,role FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(404, "User not found in database")
    new_token = create_token(uid, "admin")
    return {"token": new_token, "user": dict(row)}

@app.get("/api/auth/me")
def me(user=Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute("SELECT id,email,username,role,created_at FROM users WHERE id=?",
                           (int(user["sub"]),)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return _row(row)

# ── Articles (public) ─────────────────────────────────────────────────────────

@app.get("/api/articles")
def list_articles(limit: int = Query(20), offset: int = Query(0)):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT a.id, a.title, a.slug, a.cover_image_url, a.created_at, a.updated_at,
                      u.username as author
               FROM articles a LEFT JOIN users u ON a.author_id=u.id
               WHERE a.status='published'
               ORDER BY a.created_at DESC LIMIT ? OFFSET ?""",
            (limit, offset)
        ).fetchall()
    return {"articles": [_row(r) for r in rows]}

@app.get("/api/articles/{slug}")
def get_article(slug: str, user=Depends(get_optional_user)):
    with get_conn() as conn:
        row = conn.execute(
            """SELECT a.*, u.username as author
               FROM articles a LEFT JOIN users u ON a.author_id=u.id
               WHERE a.slug=?""", (slug,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Article not found")
    art = _row(row)
    if art["status"] != "published":
        if not user or user.get("role") != "admin":
            raise HTTPException(404, "Article not found")
    return art

# ── Articles (admin) ──────────────────────────────────────────────────────────

@app.get("/api/admin/articles")
def admin_list_articles(user=Depends(require_admin)):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT a.id, a.title, a.slug, a.status, a.cover_image_url,
                      a.created_at, a.updated_at, u.username as author
               FROM articles a LEFT JOIN users u ON a.author_id=u.id
               ORDER BY a.created_at DESC"""
        ).fetchall()
    return {"articles": [_row(r) for r in rows]}

@app.post("/api/admin/articles")
def create_article(body: ArticleBody, user=Depends(require_admin)):
    slug = body.slug.strip() or _slugify(body.title)
    if not slug:
        raise HTTPException(400, "Title is required")
    from datetime import datetime as _dt
    now = _dt.utcnow().isoformat()
    try:
        with get_conn() as conn:
            cur = conn.execute(
                """INSERT INTO articles (title, slug, content, cover_image_url, author_id, status, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (body.title, slug, body.content, body.cover_image_url or None,
                 int(user["sub"]), body.status, now, now)
            )
            return {"id": cur.lastrowid, "slug": slug}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(409, "This slug is already in use")
        raise HTTPException(500, str(e))

@app.put("/api/admin/articles/{article_id}")
def update_article(article_id: int, body: ArticleBody, user=Depends(require_admin)):
    from datetime import datetime as _dt
    now = _dt.utcnow().isoformat()
    slug = body.slug.strip() or _slugify(body.title)
    with get_conn() as conn:
        conn.execute(
            """UPDATE articles SET title=?, slug=?, content=?, cover_image_url=?,
               status=?, updated_at=? WHERE id=?""",
            (body.title, slug, body.content, body.cover_image_url or None,
             body.status, now, article_id)
        )
    return {"ok": True, "slug": slug}

@app.get("/api/admin/users")
def admin_list_users(_user=Depends(require_admin)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id,email,username,role,is_banned,created_at FROM users ORDER BY created_at DESC"
        ).fetchall()
    return {"users": [dict(r) for r in rows]}

@app.patch("/api/admin/users/{user_id}")
def admin_patch_user(user_id: int, body: PatchUserBody, _user=Depends(require_admin)):
    if body.is_banned is not None:
        with get_conn() as conn:
            conn.execute("UPDATE users SET is_banned=? WHERE id=?", (body.is_banned, user_id))
    return {"ok": True}

# /all must come BEFORE /{user_id} — otherwise FastAPI tries int("all") → 422
@app.delete("/api/admin/users/all")
def delete_all_users(_user=Depends(require_admin)):
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        conn.execute("DELETE FROM saved_lineups")
        conn.execute("DELETE FROM saved_players")
        conn.execute("DELETE FROM comments")
        conn.execute("DELETE FROM users")
    return {"deleted": count}

@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, _user=Depends(require_admin)):
    with get_conn() as conn:
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    return {"ok": True}

@app.delete("/api/admin/articles/{article_id}")
def delete_article(article_id: int, user=Depends(require_admin)):
    with get_conn() as conn:
        conn.execute("DELETE FROM articles WHERE id=?", (article_id,))
    return {"ok": True}

# ── Comments ──────────────────────────────────────────────────────────────────

@app.get("/api/articles/{slug}/comments")
def list_comments(slug: str):
    with get_conn() as conn:
        art = conn.execute("SELECT id FROM articles WHERE slug=?", (slug,)).fetchone()
        if not art:
            raise HTTPException(404, "Article not found")
        rows = conn.execute(
            """SELECT c.id, c.content, c.created_at, u.username
               FROM comments c LEFT JOIN users u ON c.user_id=u.id
               WHERE c.article_id=? ORDER BY c.created_at ASC""",
            (art["id"],)
        ).fetchall()
    return {"comments": [_row(r) for r in rows]}

@app.post("/api/articles/{slug}/comments")
def add_comment(slug: str, body: CommentBody, user=Depends(get_current_user)):
    if not body.content.strip():
        raise HTTPException(400, "Comment cannot be empty")
    with get_conn() as conn:
        art = conn.execute("SELECT id FROM articles WHERE slug=? AND status='published'", (slug,)).fetchone()
        if not art:
            raise HTTPException(404, "Article not found")
        cur = conn.execute(
            "INSERT INTO comments (article_id, user_id, content) VALUES (?,?,?)",
            (art["id"], int(user["sub"]), body.content.strip())
        )
    return {"id": cur.lastrowid, "ok": True}

@app.delete("/api/comments/{comment_id}")
def delete_comment(comment_id: int, user=Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute("SELECT user_id FROM comments WHERE id=?", (comment_id,)).fetchone()
        if not row:
            raise HTTPException(404)
        if row["user_id"] != int(user["sub"]) and user.get("role") != "admin":
            raise HTTPException(403, "Yetkisiz")
        conn.execute("DELETE FROM comments WHERE id=?", (comment_id,))
    return {"ok": True}

# ── Profile & saved items ─────────────────────────────────────────────────────

@app.get("/api/profile")
def get_profile(user=Depends(get_current_user)):
    uid = int(user["sub"])
    with get_conn() as conn:
        u = conn.execute("SELECT id,email,username,role,created_at FROM users WHERE id=?", (uid,)).fetchone()
        players = conn.execute("SELECT * FROM saved_players WHERE user_id=? ORDER BY created_at DESC", (uid,)).fetchall()
        lineups = conn.execute("SELECT * FROM saved_lineups WHERE user_id=? ORDER BY created_at DESC", (uid,)).fetchall()
        comments = conn.execute(
            """SELECT c.id, c.content, c.created_at, a.title as article_title, a.slug as article_slug
               FROM comments c JOIN articles a ON c.article_id=a.id
               WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT 20""", (uid,)
        ).fetchall()
    return {
        "user": _row(u),
        "saved_players": [_row(r) for r in players],
        "saved_lineups": [dict(r) | {"players": __import__("json").loads(r["players"])} for r in lineups],
        "comments": [_row(r) for r in comments],
    }

@app.post("/api/profile/saved-players")
def save_player(body: SavePlayerBody, user=Depends(get_current_user)):
    try:
        with get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO saved_players (user_id, player_name, season) VALUES (?,?,?)",
                (int(user["sub"]), body.player_name, body.season)
            )
        return {"id": cur.lastrowid, "ok": True}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(409, "Already saved")
        raise HTTPException(500, str(e))

@app.delete("/api/profile/saved-players/{item_id}")
def unsave_player(item_id: int, user=Depends(get_current_user)):
    with get_conn() as conn:
        conn.execute("DELETE FROM saved_players WHERE id=? AND user_id=?", (item_id, int(user["sub"])))
    return {"ok": True}

@app.post("/api/profile/saved-lineups")
def save_lineup(body: SaveLineupBody, user=Depends(get_current_user)):
    import json as _json
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO saved_lineups (user_id, players, score, grade, pct, label) VALUES (?,?,?,?,?,?)",
            (int(user["sub"]), _json.dumps(body.players), body.score, body.grade, body.pct, body.label)
        )
    return {"id": cur.lastrowid, "ok": True}

@app.delete("/api/profile/saved-lineups/{item_id}")
def delete_lineup(item_id: int, user=Depends(get_current_user)):
    with get_conn() as conn:
        conn.execute("DELETE FROM saved_lineups WHERE id=? AND user_id=?", (item_id, int(user["sub"])))
    return {"ok": True}

class GameScoreBody(BaseModel):
    pct: int
    grade: str
    lineup: list = []
    mode: str = "classic"

class CorrectionBody(BaseModel):
    player_name: str
    season: str = "2025-26"
    current_arch: str
    suggested_arch: str
    note: str = ""

class PatchCorrectionBody(BaseModel):
    status: str

@app.post("/api/game/score")
def save_game_score(body: GameScoreBody, user=Depends(get_current_user)):
    if not 0 <= body.pct <= 100:
        raise HTTPException(400, "Invalid score")
    if body.grade not in ("S","A","B","C","D"):
        raise HTTPException(400, "Invalid grade")
    if body.mode not in ("classic", "salarycap"):
        raise HTTPException(400, "Invalid mode")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO lineup_games (user_id, pct, grade, lineup_json, mode) VALUES (?,?,?,?,?)",
            (int(user["sub"]), body.pct, body.grade, json.dumps(body.lineup), body.mode),
        )
    return {"ok": True}


class SeasonResultBody(BaseModel):
    wins: int
    season_result: str   # CHAMPION | FINALS | CF | SEMI | R1 | MISSED
    sim_era: str = ""

_VALID_SEASON_RESULTS = {"CHAMPION", "REPEAT", "THREEPEAT", "FINALS", "CF", "SEMI", "R1", "MISSED"}

@app.post("/api/game/season-result")
def save_season_result(body: SeasonResultBody, user=Depends(get_current_user)):
    """Sezon simülasyonu sonucunu kullanıcının son lineup_games kaydına işler."""
    if body.season_result not in _VALID_SEASON_RESULTS:
        raise HTTPException(400, "Invalid season result")
    if not 0 <= body.wins <= 82:
        raise HTTPException(400, "Invalid wins")
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM lineup_games WHERE user_id=? ORDER BY id DESC LIMIT 1",
            (int(user["sub"]),),
        ).fetchone()
        if not row:
            return {"ok": False, "detail": "No game score to attach to"}
        conn.execute(
            "UPDATE lineup_games SET wins=?, season_result=?, sim_era=? WHERE id=?",
            (body.wins, body.season_result, body.sim_era[:32], row["id"]),
        )
    return {"ok": True}


@app.get("/api/leaderboard")
def get_leaderboard(limit: int = Query(50, le=100), mode: str = Query("classic")):
    if mode not in ("classic", "salarycap"):
        mode = "classic"
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT lg.pct, lg.grade, lg.lineup_json, lg.created_at, u.username,
                   lg.wins, lg.season_result, lg.sim_era, lg.mode
            FROM lineup_games lg JOIN users u ON lg.user_id = u.id
            WHERE COALESCE(lg.mode, 'classic') = ?
            ORDER BY lg.pct DESC LIMIT ?
        """, (mode, limit)).fetchall()
    return {"entries": [dict(r) for r in rows]}


# ── Tag Corrections ───────────────────────────────────────────────────────────

VALID_ARCHES = {"Engine","Ecosystem","Hub","Connector","Creator","Anchor",
                "Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"}

@app.post("/api/corrections")
def submit_correction(body: CorrectionBody, user=Depends(get_current_user)):
    if body.suggested_arch not in VALID_ARCHES:
        raise HTTPException(400, "Invalid archetype")
    if body.current_arch == body.suggested_arch:
        raise HTTPException(400, "Same archetype")
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO tag_corrections
               (user_id, player_name, season, current_arch, suggested_arch, note)
               VALUES (?,?,?,?,?,?)""",
            (int(user["sub"]), body.player_name, body.season,
             body.current_arch, body.suggested_arch, body.note or None),
        )
    return {"ok": True}

@app.get("/api/admin/corrections")
def admin_list_corrections(status: str = "pending", user=Depends(require_admin)):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT tc.*, u.username
               FROM tag_corrections tc LEFT JOIN users u ON tc.user_id = u.id
               WHERE tc.status = ? ORDER BY tc.created_at DESC""",
            (status,),
        ).fetchall()
    return {"corrections": [dict(r) for r in rows]}

@app.patch("/api/admin/corrections/{correction_id}")
def patch_correction(correction_id: int, body: PatchCorrectionBody,
                     user=Depends(require_admin)):
    if body.status not in ("approved", "rejected", "pending"):
        raise HTTPException(400, "Invalid status")
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM tag_corrections WHERE id=?",
                           (correction_id,)).fetchone()
        if not row:
            raise HTTPException(404)
        conn.execute("UPDATE tag_corrections SET status=? WHERE id=?",
                     (body.status, correction_id))
    return {"ok": True}

@app.post("/api/admin/apply-corrections")
def apply_corrections(user=Depends(require_admin)):
    import threading, json as _json
    overrides_path = ROOT / "data" / "arch_overrides.json"
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT player_name, season, suggested_arch FROM tag_corrections WHERE status='approved'"
        ).fetchall()
    if not rows:
        return {"ok": True, "applied": 0}
    # Build override dict: {player_name: {season: arch}}
    overrides: dict = {}
    if overrides_path.exists():
        try:
            overrides = _json.loads(overrides_path.read_text())
        except Exception:
            overrides = {}
    for r in rows:
        overrides.setdefault(r["player_name"], {})[r["season"]] = r["suggested_arch"]
    overrides_path.write_text(_json.dumps(overrides, ensure_ascii=False, indent=2))
    # Rebuild scores in background
    def _rebuild():
        try:
            from src.score_compat import build_score_table
            build_score_table("2025-26")
            _load_scores.cache_clear()
            _load_labeled.cache_clear()
            _load_lineup_compat.cache_clear()
        except Exception as e:
            import logging; logging.getLogger(__name__).error("apply-corrections rebuild: %s", e)
    threading.Thread(target=_rebuild, daemon=True).start()
    return {"ok": True, "applied": len(rows)}


# ── Manual Refresh ───────────────────────────────────────────────────────────

@app.post("/api/admin/trigger-refresh")
def trigger_refresh(season: str = "2025-26", user=Depends(require_admin)):
    import sys as _sys
    _scripts = ROOT / "scripts"
    if str(_scripts) not in _sys.path:
        _sys.path.insert(0, str(_scripts))
    from refresh import start_refresh, is_running
    if is_running():
        return {"ok": False, "reason": "already running"}
    start_refresh(season)
    from datetime import datetime as _dt, timezone as _tz
    return {"ok": True, "started_at": _dt.now(_tz.utc).isoformat()}

@app.get("/api/admin/refresh-status")
def get_refresh_status(user=Depends(require_admin)):
    import sys as _sys
    _scripts = ROOT / "scripts"
    if str(_scripts) not in _sys.path:
        _sys.path.insert(0, str(_scripts))
    from refresh import read_status, is_running
    status = read_status()
    status["running"] = is_running()
    return status


# ─── Frontend statik dosyaları (build sonrası) ────────────────────────────────

frontend_dist = ROOT / "frontend" / "dist"
if frontend_dist.exists():
    # Catch-all: React Router path'lerini index.html'e yönlendir (SPA routing)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        index = frontend_dist / "index.html"
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(index))

    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")


# ─── Prod entrypoint ─────────────────────────────────────────────────────────
# PORT'u shell'e bırakmayız: Python env'den kendisi okur (Railway/Render güvenli).
# `python -m api.main` ile çalışır; shell/exec form farkı, $PORT genişlemesi derdi yok.
if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        workers=int(os.environ.get("WEB_CONCURRENCY", "1")),  # 512MB'de 1 worker
    )
