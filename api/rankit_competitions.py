"""RankIt yarisma kaydi: TEK kaynak.

Eskiden lig listesi uc yerde tekrar ediyordu (src/rankit_sync.py
FOOTBALL_LEAGUES, api/rankit_live_sync.py FOTMOB_LEAGUES, api/rankit.py
FOTMOB_LEAGUE_IDS). Birine eklenip digerine eklenmeyen lig sessizce yarim
calisiyordu: fikstur gelir, canli skor gelmez. Uc liste artik buradan turuyor.

Alanlar
-------
key       slug; parquet ve log adlari.
name      rankit_competitions.name -- kullaniciya gorunen ad. Var olan
          satirlarla eslesmesi icin mevcut adlar DEGISTIRILMEDI.
sport     Football | Basketball | Volleyball
provider  fotmob | euroleague | eurocup | nba | sofascore
mode      league | cup | supercup | uefa | qualifying | season
source    saglayicinin kimligi:
            fotmob      -> lig kimligi (int)
            euroleague  -> yarisma kodu ("E", "U")
            sofascore   -> (spor slug'i, kategori) ; kimlik adla cozulur
expect    saglayicinin dondurdugu adda bulunmasi gereken kelimelerden
          BIRI (kucuk harf, aksansiz). Kimlik yanlissa yanlis lig iceri
          alinmaz: senkron o yarismayi atlar ve hatayi gunluge yazar.
avoid     adda bulunmamasi gerekenler (kadin/erkek, kupa/super kupa ayrimi).
require   expect'e ek olarak bunlardan biri de sart (kadin yarismasinda "women").
women     kadin yarismasi: takimlar "(W)" ekiyle ayri satir (ayni kulubun
          erkek ve kadin takimi karismasin).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Competition:
    key: str
    name: str
    sport: str
    country: str
    provider: str
    mode: str
    source: object
    expect: tuple = ()
    avoid: tuple = ()
    women: bool = False
    require: tuple = ()      # expect'e EK olarak bunlardan biri de sart ("women")
    extra_sources: tuple = field(default=())   # ayni yarismanin ek kaynaklari (UEFA eleme turlari)


C = Competition
COMPETITIONS: tuple[Competition, ...] = (
    # ── Futbol: FotMob ──────────────────────────────────────────────────────
    C("premier-league", "Premier League", "Football", "England", "fotmob", "league", 47, ("premier league",)),
    C("la-liga", "La Liga", "Football", "Spain", "fotmob", "league", 87, ("laliga", "la liga")),
    C("serie-a", "Serie A", "Football", "Italy", "fotmob", "league", 55, ("serie a",)),
    C("bundesliga", "Bundesliga", "Football", "Germany", "fotmob", "league", 54, ("bundesliga",)),
    C("ligue-1", "Ligue 1", "Football", "France", "fotmob", "league", 53, ("ligue 1",)),
    C("fa-cup", "FA Cup", "Football", "England", "fotmob", "cup", 132, ("fa cup",)),
    C("copa-del-rey", "Copa del Rey", "Football", "Spain", "fotmob", "cup", 138, ("copa del rey",)),
    C("coppa-italia", "Coppa Italia", "Football", "Italy", "fotmob", "cup", 141, ("coppa italia",)),
    C("dfb-pokal", "DFB-Pokal", "Football", "Germany", "fotmob", "cup", 209, ("pokal",)),
    C("coupe-de-france", "Coupe de France", "Football", "France", "fotmob", "cup", 134, ("coupe de france",)),
    # Ulusal kupalarin eksikleri (2026-10-18). Kimlikler ad dogrulamasiyla korunuyor.
    C("efl-cup", "EFL Cup", "Football", "England", "fotmob", "cup", 133, ("efl cup", "league cup", "carabao")),
    C("community-shield", "FA Community Shield", "Football", "England", "fotmob", "supercup", 247, ("community shield",)),
    C("supercopa", "Supercopa de España", "Football", "Spain", "fotmob", "supercup", 139, ("supercopa",)),
    C("supercoppa", "Supercoppa Italiana", "Football", "Italy", "fotmob", "supercup", 222, ("supercoppa",)),
    C("dfl-supercup", "DFL-Supercup", "Football", "Germany", "fotmob", "supercup", 8924, ("supercup",)),
    C("trophee-des-champions", "Trophée des Champions", "Football", "France", "fotmob", "supercup", 207, ("trophee des champions",)),
    C("champions-league", "UEFA Champions League", "Football", "Europe", "fotmob", "uefa", 42,
      ("champions league",), extra_sources=((10611, "qualifying"),)),
    C("europa-league", "UEFA Europa League", "Football", "Europe", "fotmob", "uefa", 73,
      ("europa league",), extra_sources=((10613, "qualifying"),)),
    C("conference-league", "UEFA Conference League", "Football", "Europe", "fotmob", "uefa", 10216,
      ("conference league",), extra_sources=((10615, "qualifying"),)),

    # ── Basketbol ───────────────────────────────────────────────────────────
    C("nba", "NBA", "Basketball", "USA", "nba", "league", None),
    C("euroleague", "EuroLeague", "Basketball", "Europe", "euroleague", "league", "E"),
    C("eurocup", "EuroCup", "Basketball", "Europe", "eurocup", "season", "U"),
    C("bsl", "Basketbol Süper Ligi", "Basketball", "Turkey", "sofascore", "league", ("basketball", "TR"),
      ("super lig", "super league", "bsl"), ("women", "kadin", "1. lig", "tbl", "cup", "kupa")),
    C("tr-basketball-cup", "Turkish Cup", "Basketball", "Turkey", "sofascore", "cup", ("basketball", "TR"),
      ("cup", "kupa"), ("super cup", "super kupa", "cumhurbaskanligi", "president", "women", "kadin")),
    C("tr-basketball-supercup", "Turkish Super Cup", "Basketball", "Turkey", "sofascore", "supercup",
      ("basketball", "TR"), ("super cup", "super kupa", "cumhurbaskanligi", "president"), ("women", "kadin")),

    # ── Voleybol: SofaScore ─────────────────────────────────────────────────
    C("sultanlar-ligi", "Sultanlar Ligi", "Volleyball", "Turkey", "sofascore", "league", ("volleyball", "TR"),
      ("sultanlar",), (), women=True),
    C("efeler-ligi", "Efeler Ligi", "Volleyball", "Turkey", "sofascore", "league", ("volleyball", "TR"),
      ("efeler",)),
    C("kupa-voley-women", "Kupa Voley Women", "Volleyball", "Turkey", "sofascore", "cup", ("volleyball", "TR"),
      ("cup", "kupa"), ("super",), women=True, require=("women", "kadin")),
    C("kupa-voley-men", "Kupa Voley Men", "Volleyball", "Turkey", "sofascore", "cup", ("volleyball", "TR"),
      ("cup", "kupa"), ("super", "women", "kadin")),
    C("tr-volleyball-supercup-women", "Turkish Super Cup Women", "Volleyball", "Turkey", "sofascore", "supercup",
      ("volleyball", "TR"), ("super cup", "super kupa"), (), women=True, require=("women", "kadin")),
    C("tr-volleyball-supercup-men", "Turkish Super Cup Men", "Volleyball", "Turkey", "sofascore", "supercup",
      ("volleyball", "TR"), ("super cup", "super kupa"), ("women", "kadin")),
    C("cev-champions-league-women", "CEV Champions League Women", "Volleyball", "Europe", "sofascore", "season",
      ("volleyball", "EU"), ("champions league",), (), women=True, require=("women",)),
    C("cev-champions-league", "CEV Champions League", "Volleyball", "Europe", "sofascore", "season",
      ("volleyball", "EU"), ("champions league",), ("women",)),
)
del C

BY_NAME = {c.name: c for c in COMPETITIONS}
BY_KEY = {c.key: c for c in COMPETITIONS}


def of(provider: str) -> list[Competition]:
    return [c for c in COMPETITIONS if c.provider == provider]


# ── Eski adlarla turetilmis gorunumler (cagiranlar degismesin) ──────────────

def football_leagues() -> dict:
    """src/rankit_sync.FOOTBALL_LEAGUES bicimi: slug -> (kimlik, ad, ulke, mod).
    UEFA eleme kaynaklari ayri slug ama ayni yarisma adi (bugunku davranis)."""
    out = {}
    for c in of("fotmob"):
        out[c.key] = (c.source, c.name, c.country, "cup" if c.mode == "supercup" else c.mode)
        for league_id, mode in c.extra_sources:
            out[f"{c.key}-qualification"] = (league_id, c.name, c.country, mode)
    return out


def fotmob_leagues() -> dict:
    """api/rankit_live_sync.FOTMOB_LEAGUES bicimi: ad -> [(kimlik, mod)]."""
    return {c.name: [(c.source, "cup" if c.mode == "supercup" else c.mode), *c.extra_sources]
            for c in of("fotmob")}


def fotmob_league_ids() -> dict:
    """api/rankit.FOTMOB_LEAGUE_IDS bicimi: ad -> [kimlik]."""
    return {name: [league_id for league_id, _mode in sources] for name, sources in fotmob_leagues().items()}


def round_robin_names() -> set[str]:
    """Cift devreli ligler (Hunt "sezonu bastan sona" kurali)."""
    return {c.name for c in COMPETITIONS if c.mode == "league" and c.provider not in ("nba",)}


def fold(text: str) -> str:
    """Ad karsilastirmasi icin: kucuk harf, aksansiz, Turkce i'ler duz."""
    import unicodedata

    flat = str(text or "").replace("ı", "i").replace("İ", "i")
    flat = unicodedata.normalize("NFKD", flat)
    return "".join(ch for ch in flat if not unicodedata.combining(ch)).lower()


def name_matches(comp: Competition, provider_name: str) -> bool:
    """Saglayicinin adi bu yarismaya ait mi? Beklentisi olmayan yarisma her
    adi kabul eder (NBA, EuroLeague: kaynak tek yarismali)."""
    folded = fold(provider_name)
    if comp.expect and not any(word in folded for word in comp.expect):
        return False
    if comp.require and not any(word in folded for word in comp.require):
        return False
    return not any(word in folded for word in comp.avoid)
