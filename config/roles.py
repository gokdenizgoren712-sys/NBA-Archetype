"""
Fonksiyonel rol tanımları ve arketip uyum prior matrisi.

11 slot:
  7 core  — mevcut 12 noun'dan türetilir
  4 modifier — modifier etiketlerinden dedicated slot

Affinity prior: basketbol bilgisine dayalı elle yazılmış 12×12 matris.
Gerçek NBA lineup verisi çekildikçe update_affinity() ile güncellenir.
"""

from __future__ import annotations
import numpy as np
import pandas as pd

# ─── 11 Fonksiyonel Slot ──────────────────────────────────────────────────────

ROLE_SLOTS = [
    "Primary Creation",     # Engine / Ecosystem / Hub / Initiator
    "Secondary Playmaking", # Creator / Connector
    "Floor Spacing",        # Spacer
    "Interior Defense",     # Anchor / Force
    "Perimeter Defense",    # Stopper
    "Physical Force",       # Force / Anchor (ribaund/fizik)
    "Finishing",            # Finisher / Rim Runner
    # Modifier dedicated slots
    "Two-Way Defense",      # Two-Way modifier
    "Shot Creation",        # Pressure / Shotmaker / Gravity / Three-Level
    "Transition",           # Speed modifier
    "Versatility",          # Versatile modifier
]

ROLE_SHORT = {
    "Primary Creation":     "PRI",
    "Secondary Playmaking": "2ND",
    "Floor Spacing":        "SPC",
    "Interior Defense":     "INT",
    "Perimeter Defense":    "PER",
    "Physical Force":       "PHY",
    "Finishing":            "FIN",
    "Two-Way Defense":      "2WY",
    "Shot Creation":        "SCR",
    "Transition":           "TRN",
    "Versatility":          "VRS",
}


def compute_role_vec(row: dict | pd.Series) -> np.ndarray:
    """
    Bir oyuncunun 11 boyutlu rol vektörünü hesaplar [0..1].
    row: score_ prefix'li sütunları olan bir satır.
    """
    def s(key: str) -> float:
        v = row.get(f"score_{key}", 0)
        return float(v) if v is not None and not (isinstance(v, float) and np.isnan(v)) else 0.0

    vec = np.array([
        # Core slots
        min(1.0, max(
            s("Ecosystem") * 1.20,
            s("Engine")    * 1.10,
            s("Hub")       * 1.00,
            s("Initiator") * 0.90,
        )),
        min(1.0, max(
            s("Creator")   * 1.00,
            s("Connector") * 0.85,
        )),
        s("Spacer"),
        min(1.0, max(
            s("Anchor") * 1.10,
            s("Force")  * 0.65,
        )),
        s("Stopper"),
        min(1.0, max(
            s("Force")  * 1.00,
            s("Anchor") * 0.55,
        )),
        min(1.0, max(
            s("Finisher")    * 1.00,
            s("Rim Runner") * 0.90,
        )),
        # Modifier slots
        s("Two-Way"),
        min(1.0, max(
            s("Pressure"),
            s("Shotmaker"),
            s("Gravity"),
            s("Three-Level"),
        )),
        s("Speed"),
        s("Versatile"),
    ], dtype=np.float32)

    return np.clip(vec, 0.0, 1.0)


# ─── Affinity Prior Matrisi ───────────────────────────────────────────────────
# Basketbol bilgisine dayalı 12×12 arketip sinerji matrisi.
# Simetrik; (A, B) ile (B, A) aynı değer.
# Varsayılan: 0.65 (nötr-hafif pozitif).

_NOUNS = [
    "Engine", "Ecosystem", "Hub", "Connector", "Creator",
    "Anchor", "Spacer", "Finisher", "Force", "Initiator", "Stopper", "Rim Runner",
]

# Elle yazılmış çiftler: (noun1, noun2) -> affinity [0..1]
# Sadece dikkat çekici pairler, geri kalanı default 0.65
_AFFINITY_OVERRIDES: dict[tuple[str, str], float] = {
    # ── Ecosystem sinerji ──
    ("Ecosystem", "Spacer"):      0.87,
    ("Ecosystem", "Finisher"):    0.84,
    ("Ecosystem", "Anchor"):      0.82,
    ("Ecosystem", "Rim Runner"):  0.80,
    ("Ecosystem", "Stopper"):     0.77,
    ("Ecosystem", "Connector"):   0.74,
    ("Ecosystem", "Force"):       0.73,
    ("Ecosystem", "Creator"):     0.70,
    ("Ecosystem", "Initiator"):   0.63,
    ("Ecosystem", "Hub"):         0.60,
    ("Ecosystem", "Engine"):      0.50,  # iki top taşıyan
    ("Ecosystem", "Ecosystem"):   0.32,  # iki heliocentric — kötü

    # ── Engine sinerji ──
    ("Engine", "Spacer"):         0.83,
    ("Engine", "Anchor"):         0.79,
    ("Engine", "Rim Runner"):     0.77,
    ("Engine", "Finisher"):       0.79,
    ("Engine", "Stopper"):        0.74,
    ("Engine", "Connector"):      0.72,
    ("Engine", "Force"):          0.70,
    ("Engine", "Creator"):        0.66,
    ("Engine", "Hub"):            0.58,
    ("Engine", "Initiator"):      0.55,
    ("Engine", "Engine"):         0.44,  # iki ball-dominant

    # ── Hub sinerji ──
    ("Hub", "Anchor"):            0.80,
    ("Hub", "Spacer"):            0.78,
    ("Hub", "Rim Runner"):        0.76,
    ("Hub", "Finisher"):          0.74,
    ("Hub", "Stopper"):           0.73,
    ("Hub", "Connector"):         0.75,
    ("Hub", "Force"):             0.70,
    ("Hub", "Creator"):           0.68,
    ("Hub", "Initiator"):         0.55,
    ("Hub", "Hub"):               0.50,  # iki pass-first, eksik scoring

    # ── Initiator sinerji ──
    ("Initiator", "Spacer"):      0.79,
    ("Initiator", "Anchor"):      0.77,
    ("Initiator", "Rim Runner"):  0.75,
    ("Initiator", "Finisher"):    0.74,
    ("Initiator", "Stopper"):     0.70,
    ("Initiator", "Force"):       0.68,
    ("Initiator", "Creator"):     0.65,
    ("Initiator", "Connector"):   0.70,
    ("Initiator", "Initiator"):   0.50,

    # ── Spacer sinerji ──
    ("Spacer", "Rim Runner"):     0.82,  # çekip koşturmak
    ("Spacer", "Stopper"):        0.79,
    ("Spacer", "Anchor"):         0.77,
    ("Spacer", "Force"):          0.68,
    ("Spacer", "Finisher"):       0.72,
    ("Spacer", "Creator"):        0.72,
    ("Spacer", "Connector"):      0.74,
    ("Spacer", "Spacer"):         0.63,  # iki spacer ok, biraz pasif

    # ── Anchor sinerji ──
    ("Anchor", "Stopper"):        0.76,
    ("Anchor", "Connector"):      0.73,
    ("Anchor", "Rim Runner"):     0.58,  # her ikisi de içeride, redundant
    ("Anchor", "Finisher"):       0.62,
    ("Anchor", "Force"):          0.60,
    ("Anchor", "Creator"):        0.70,
    ("Anchor", "Anchor"):         0.38,  # iki rim protecter

    # ── Stopper sinerji ──
    ("Stopper", "Rim Runner"):    0.73,
    ("Stopper", "Force"):         0.71,
    ("Stopper", "Finisher"):      0.69,
    ("Stopper", "Creator"):       0.67,
    ("Stopper", "Connector"):     0.71,
    ("Stopper", "Stopper"):       0.58,

    # ── Finisher sinerji ──
    ("Finisher", "Creator"):      0.68,
    ("Finisher", "Connector"):    0.70,
    ("Finisher", "Force"):        0.60,
    ("Finisher", "Rim Runner"):   0.54,  # iki içeri oyuncu

    # ── Force sinerji ──
    ("Force", "Rim Runner"):      0.56,
    ("Force", "Creator"):         0.64,
    ("Force", "Connector"):       0.67,
    ("Force", "Force"):           0.46,

    # ── Rim Runner sinerji ──
    ("Rim Runner", "Creator"):    0.72,
    ("Rim Runner", "Connector"):  0.70,
    ("Rim Runner", "Rim Runner"): 0.42,
}


def _build_affinity_matrix() -> pd.DataFrame:
    M = pd.DataFrame(0.65, index=_NOUNS, columns=_NOUNS)
    # Köşegen — aynı arketipten iki oyuncu: genellikle redundant
    for n in _NOUNS:
        M.loc[n, n] = 0.55
    # Override pairs
    for (a, b), v in _AFFINITY_OVERRIDES.items():
        if a in M.index and b in M.columns:
            M.loc[a, b] = v
            M.loc[b, a] = v
    return M.round(3)


AFFINITY_MATRIX: pd.DataFrame = _build_affinity_matrix()


def update_affinity_from_lineups(lineups: pd.DataFrame,
                                  player_arch: dict[str, str],
                                  alpha: float = 0.3) -> pd.DataFrame:
    """
    Gerçek NBA lineup verisiyle prior matrisini günceller (EMA).
    alpha: gerçek verinin ağırlığı (0.3 = prior ağır, 1.0 = sadece veri).
    lineups: GROUP_NAME, MIN, NET_RATING sütunları gerekli.
    """
    from affinity import lineup_archetype_affinity
    empirical = lineup_archetype_affinity(lineups, player_arch)
    M = AFFINITY_MATRIX.copy()
    for a in _NOUNS:
        for b in _NOUNS:
            if a in empirical.index and b in empirical.columns:
                v = empirical.loc[a, b]
                if not pd.isna(v):
                    M.loc[a, b] = round((1 - alpha) * M.loc[a, b] + alpha * v, 3)
    return M


def get_affinity(arch1: str, arch2: str,
                 matrix: pd.DataFrame | None = None) -> float:
    """İki arketip arası affinity skoru. Default: global prior."""
    m = matrix if matrix is not None else AFFINITY_MATRIX
    if arch1 in m.index and arch2 in m.columns:
        v = m.loc[arch1, arch2]
        if not pd.isna(v):
            return float(v)
    return 0.65
