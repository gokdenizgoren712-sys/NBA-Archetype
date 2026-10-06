# -*- coding: utf-8 -*-
"""Futbol draft kuralları — SUNUCU tarafı.

NEDEN SUNUCUDA
──────────────
Bugüne kadar diziliş, slot uygunluğu ve pozisyon cezası yalnızca istemcide
vardı (formations.js + positions.js + draft.js). Same Screen için sorun değil:
iki oyuncu aynı ekrana bakıyor, kimse kimseyi kandıramıyor. Ama oda modlarında
XI sunucuya gönderiliyor ve sunucu bugün yalnız "11 tane mi?" diye bakıyor —
elle hazırlanmış bir istek 11 forvetli, kalecisiz bir kadro gönderebilir ve
sunucu onu seve seve skorlar. Oda içi draft de aynı sebeple sunucuda çözülmeli:
sırayı ve havuzu istemciye bırakmak, oyuncuya "sıra bende" dedirtmek demek.

frontend/src/game/football/{formations,positions,draft}.js ile AYNI kurallar.
İki uygulamanın ayrı durması bilinçli — istemci tarafı Same Screen'i sunucuya
hiç gitmeden oynatıyor, sunucu tarafı resmî kararı veriyor. Aynısını
src/football/tie.py headToHead.js için yapıyor.

PARİTE: tests/test_draft_parity.py iki tarafı yan yana koşturup slot kimlikleri,
ceza tablosu, kaleci kuralı ve seçim sırasının aynı olduğunu doğruluyor. Kural
değiştirirken İKİSİNİ birden değiştir, test tutmazsa yanlış yapılmıştır.

SAHA KOORDİNATLARI BURADA YOK. formations.js'teki x/y yalnız çizim için;
sunucu saha çizmiyor. İkinci bir kopya tutmak, kaymanın tek faydasız kaynağı
olurdu — slot KİMLİKLERİ ortak sözleşme, geri kalanı istemcinin işi.
"""

from __future__ import annotations

from typing import Any, Iterable

# ── Dizilişler ───────────────────────────────────────────────────────────────
# (slot_id, istenen pozisyon, faz). Sıra formations.js'teki sırayla aynı —
# parite testi bunu kimlik kimlik karşılaştırıyor.
FORMATIONS: dict[str, list[tuple[str, str, str]]] = {
    "4-3-3": [
        ("GK", "GK", "gk"),
        ("LB", "FB", "def"), ("LCB", "CB", "def"),
        ("RCB", "CB", "def"), ("RB", "FB", "def"),
        ("DM", "DM", "mid"), ("LCM", "CM", "mid"), ("RCM", "CM", "mid"),
        ("LW", "W", "fwd"), ("ST", "ST", "fwd"), ("RW", "W", "fwd"),
    ],
    "4-2-3-1": [
        ("GK", "GK", "gk"),
        ("LB", "FB", "def"), ("LCB", "CB", "def"),
        ("RCB", "CB", "def"), ("RB", "FB", "def"),
        ("LDM", "DM", "mid"), ("RDM", "DM", "mid"),
        ("LAM", "W", "fwd"), ("CAM", "AM", "fwd"),
        ("RAM", "W", "fwd"), ("ST", "ST", "fwd"),
    ],
    "4-4-2": [
        ("GK", "GK", "gk"),
        ("LB", "FB", "def"), ("LCB", "CB", "def"),
        ("RCB", "CB", "def"), ("RB", "FB", "def"),
        ("LM", "W", "fwd"), ("LCM", "CM", "mid"),
        ("RCM", "CM", "mid"), ("RM", "W", "fwd"),
        ("LST", "ST", "fwd"), ("RST", "ST", "fwd"),
    ],
    "3-5-2": [
        ("GK", "GK", "gk"),
        ("LCB", "CB", "def"), ("CCB", "CB", "def"), ("RCB", "CB", "def"),
        ("LWB", "FB", "def"), ("RWB", "FB", "def"),
        ("LCM", "CM", "mid"), ("CM", "CM", "mid"), ("RCM", "CM", "mid"),
        ("LST", "ST", "fwd"), ("RST", "ST", "fwd"),
    ],
    "3-4-2-1": [
        ("GK", "GK", "gk"),
        ("LCB", "CB", "def"), ("CCB", "CB", "def"), ("RCB", "CB", "def"),
        ("LWB", "FB", "def"), ("RWB", "FB", "def"),
        ("LCM", "CM", "mid"), ("RCM", "CM", "mid"),
        ("LAM", "W", "fwd"), ("RAM", "W", "fwd"), ("ST", "ST", "fwd"),
    ],
    "4-1-4-1": [
        ("GK", "GK", "gk"),
        ("LB", "FB", "def"), ("LCB", "CB", "def"),
        ("RCB", "CB", "def"), ("RB", "FB", "def"),
        ("DM", "DM", "mid"),
        ("LM", "W", "fwd"), ("LCM", "CM", "mid"),
        ("RCM", "CM", "mid"), ("RM", "W", "fwd"), ("ST", "ST", "fwd"),
    ],
    "5-3-2": [
        ("GK", "GK", "gk"),
        ("LWB", "FB", "def"), ("LCB", "CB", "def"),
        ("CCB", "CB", "def"), ("RCB", "CB", "def"), ("RWB", "FB", "def"),
        ("LCM", "CM", "mid"), ("DM", "DM", "mid"), ("RCM", "CM", "mid"),
        ("LST", "ST", "fwd"), ("RST", "ST", "fwd"),
    ],
}

SHAPE_KEYS = list(FORMATIONS)
XI_PICKS = 11          # eleme skoru yalnız ilk 11'den
SQUAD_PICKS = 18       # 11 ilk + 7 yedek

# DRAFT UZUNLUĞU — iki seçenek, futboldaki her modda geçerli:
#   "xi"    yalnız ilk 11 (kısa draft)
#   "squad" 11 + 7 yedek (tam kadro; slot takası ve menajer aşaması da var)
# Leaderboard yalnız 18'lik kadrolardan hesaplanıyor: /api/rosters futbolda tam
# 18 kişi istiyor, yani "xi" ile oynanan oyun leaderboard'a hiç giremez.
LENGTHS = ("xi", "squad")
BENCH_COUNT = 7
BENCH = [{"id": f"SUB{i + 1}", "pos": None, "phase": None, "bench": True}
         for i in range(BENCH_COUNT)]


def slots_for(shape: str) -> list[dict]:
    """Dizilişin slotları — {id, pos, phase}."""
    return [{"id": i, "pos": p, "phase": f} for i, p, f in FORMATIONS.get(shape, [])]


# ── Pozisyon uygunluğu ───────────────────────────────────────────────────────
POS_ELIGIBLE: dict[str, list[str]] = {
    "GK": ["GK"],
    "CB": ["CB", "FB", "DM"],
    "FB": ["FB", "W", "CB"],
    "DM": ["DM", "CM", "CB"],
    "CM": ["CM", "DM", "AM", "W"],
    "W": ["W", "AM", "ST", "FB"],
    "AM": ["AM", "W", "CM", "ST"],
    "ST": ["ST", "AM", "W"],
}

PENALTY_BY_RANK = [0.0, 0.05, 0.11]
PENALTY_FOREIGN = 0.20
PENALTY_GK_MISMATCH = 0.45


def _pos(player: Any) -> str:
    if isinstance(player, dict):
        return str(player.get("POSITION") or "").upper()
    return str(getattr(player, "POSITION", "") or "").upper()


def pos_penalty_for(player: Any, slot: dict | None) -> float:
    """Bu oyuncunun bu slotta oynamasının cezası [0 .. 0.45]."""
    if not player or not slot:
        return 0.0
    if slot.get("bench"):
        return 0.0
    p, want = _pos(player), slot.get("pos")
    if not p or not want:
        return 0.0
    # Kaleci meselesi ayrı: kaleci olmayan kalede (ya da tersi) ağır ceza
    if (want == "GK") != (p == "GK"):
        return PENALTY_GK_MISMATCH
    lst = POS_ELIGIBLE.get(p, [])
    if want not in lst:
        return PENALTY_FOREIGN
    return PENALTY_BY_RANK[min(lst.index(want), len(PENALTY_BY_RANK) - 1)]


def is_primary_slot(player: Any, slot: dict | None) -> bool:
    if not player or not slot or slot.get("bench"):
        return False
    p = _pos(player)
    lst = POS_ELIGIBLE.get(p, [])
    return bool(p) and bool(lst) and slot.get("pos") == lst[0]


def can_place(player: Any, slot: dict | None) -> bool:
    """Sert kural: kaleci slotuna yalnız kaleci, kaleci de saha slotuna giremez.
    Geri kalan her yer cezalı ama serbest."""
    if not player or not slot:
        return False
    if slot.get("bench"):
        return True
    is_gk = _pos(player) == "GK"
    if slot.get("pos") == "GK":
        return is_gk
    return not is_gk


# ── XI doğrulama ─────────────────────────────────────────────────────────────
class InvalidXI(ValueError):
    """Gönderilen kadro kurallara uymuyor — mesaj kullanıcıya gösterilebilir."""


def validate_xi(placements: Iterable[dict], shape: str,
                players_by_id: dict[int, Any] | None = None) -> dict:
    """Bir XI'i doğrula: 11 slot, hepsi dolu, tekrar yok, kaleci kuralı tamam.

    placements: [{player_id, slot, season?}]
    players_by_id: doluysa POSITION'a bakılıp kaleci kuralı ve ceza hesaplanır;
    boşsa yalnız slot bütünlüğü kontrol edilir (pozisyon bilgisi olmadan ceza
    uydurmaktansa hiç hesaplamamak doğru — çağıran skorlarken zaten yükleyecek).
    """
    if shape not in FORMATIONS:
        raise InvalidXI(f"Unknown formation: {shape}")
    slots = {s["id"]: s for s in slots_for(shape)}

    seen_slots: set[str] = set()
    seen_players: set[int] = set()
    penalty = 0.0
    for pl in placements:
        sid = str(pl.get("slot") or "")
        pid = pl.get("player_id")
        if sid not in slots:
            raise InvalidXI(f"{shape} has no slot called {sid or '(blank)'}")
        if sid in seen_slots:
            raise InvalidXI(f"Two players in {sid}")
        if pid is None:
            raise InvalidXI(f"No player given for {sid}")
        pid = int(pid)
        if pid in seen_players:
            raise InvalidXI("The same player appears twice")
        seen_slots.add(sid)
        seen_players.add(pid)

        if players_by_id is not None:
            p = players_by_id.get(pid)
            if p is None:
                raise InvalidXI(f"Unknown player in {sid}")
            if not can_place(p, slots[sid]):
                who = (p.get("PLAYER_NAME") if isinstance(p, dict) else None) or "That player"
                raise InvalidXI(
                    f"{who} cannot play {sid}: a keeper only fills the keeper slot, "
                    "and nobody else does")
            penalty += pos_penalty_for(p, slots[sid])

    missing = set(slots) - seen_slots
    if missing:
        raise InvalidXI("Empty slots: " + ", ".join(sorted(missing)))

    return {"shape": shape, "slots": sorted(seen_slots),
            "position_penalty": round(penalty / max(1, len(slots)), 6)}


# ── Draft durum makinesi ─────────────────────────────────────────────────────
# draft.js'in birebir karşılığı. Durumu MUTASYONA UĞRATMADAN yeni durum
# döndürüyor — sunucuda durum veritabanına yazılıp geri okunuyor, yerinde
# değiştirmek iki isteğin birbirini ezmesine açık kapı bırakırdı.

def other(seat: int) -> int:
    return 2 if seat == 1 else 1


def create_draft(shapes: dict[int, str] | None = None,
                 wheel_mode: str = "round", first: int = 1,
                 length: str = "xi") -> dict:
    sh = {1: (shapes or {}).get(1) or "4-3-3", 2: (shapes or {}).get(2) or "4-3-3"}
    for s in sh.values():
        if s not in FORMATIONS:
            raise InvalidXI(f"Unknown formation: {s}")
    if wheel_mode not in ("round", "pick"):
        raise InvalidXI(f"Unknown wheel mode: {wheel_mode}")
    if length not in LENGTHS:
        raise InvalidXI(f"Unknown draft length: {length}")
    return {
        "length": length,
        "wheelMode": wheel_mode,
        "shapes": sh,
        "round": 1,
        "queue": [first, other(first)],
        "turnPos": 0,
        "squads": {1: {}, 2: {}},     # slot_id -> oyuncu
        "takenIds": [],               # JSON'a yazılabilsin diye liste (set değil)
        "pool": None,                 # {team, season, league, players}
        "usedPairs": [],
        "phase": "spinning",          # spinning | drafting | done
    }


def active_seat(d: dict) -> int:
    q = d["queue"]
    return q[d["turnPos"]] if d["turnPos"] < len(q) else q[0]


def waiting_seat(d: dict) -> int:
    return other(active_seat(d))


def pitch_of(d: dict, seat: int) -> list[dict]:
    """Yalnız saha slotları (ceza ve skor yalnız bunlardan)."""
    return slots_for(d["shapes"][seat])


def slots_of(d: dict, seat: int) -> list[dict]:
    """Draft'ın doldurduğu slotlar: "xi"de saha, "squad"da saha + 7 yedek."""
    pitch = pitch_of(d, seat)
    return pitch + [dict(b) for b in BENCH] if d.get("length") == "squad" else pitch


def filled(d: dict, seat: int) -> int:
    return len(d["squads"][seat])


def is_complete(d: dict, seat: int) -> bool:
    return filled(d, seat) >= len(slots_of(d, seat))


def open_slots_for(d: dict, seat: int, player: Any) -> list[dict]:
    taken = d["squads"][seat]
    return [s for s in slots_of(d, seat) if s["id"] not in taken and can_place(player, s)]


def can_pick(d: dict, seat: int, player: Any) -> bool:
    pid = player.get("PLAYER_ID") if isinstance(player, dict) else None
    if pid is not None and int(pid) in {int(x) for x in d["takenIds"]}:
        return False
    return len(open_slots_for(d, seat, player)) > 0


def set_pool(d: dict, pool: dict | None) -> dict:
    nxt = {**d, "pool": pool, "phase": "drafting"}
    if pool:
        nxt["usedPairs"] = [*d["usedPairs"], f"{pool.get('team')}|{pool.get('season')}"]
    return nxt


def pick(d: dict, seat: int, player: dict, slot_id: str) -> tuple[bool, Any]:
    """(ok, yeni_durum) ya da (False, sebep)."""
    if seat != active_seat(d):
        return False, "not your turn"
    pid = int(player.get("PLAYER_ID"))
    if pid in {int(x) for x in d["takenIds"]}:
        return False, "already taken"
    slot = next((s for s in slots_of(d, seat) if s["id"] == slot_id), None)
    if slot is None:
        return False, "unknown slot"
    if slot_id in d["squads"][seat]:
        return False, "slot filled"
    if not can_place(player, slot):
        return False, "cannot play there"

    squads = {**d["squads"], seat: {**d["squads"][seat], slot_id: {**player, "_slot": slot_id}}}
    return True, _advance({**d, "squads": squads, "takenIds": [*d["takenIds"], pid]})


def _advance(d: dict) -> dict:
    """Sırayı ilerlet. Round içinde bekleyen varsa ona geç; yoksa yeni round aç
    ve BAŞLAYAN TARAFI DEĞİŞTİR (yılan). Tamamlanan taraf sıradan düşer."""
    remaining = [s for s in (1, 2) if not is_complete(d, s)]
    if not remaining:
        return {**d, "phase": "done", "pool": None}

    nxt = d["turnPos"] + 1
    still = [s for s in d["queue"][nxt:] if s in remaining]
    if still:
        pos = d["queue"].index(still[0])
        pick_mode = d["wheelMode"] == "pick"
        return {**d, "turnPos": pos,
                "phase": "spinning" if pick_mode else "drafting",
                "pool": None if pick_mode else d["pool"]}

    first_next = other(d["queue"][0]) if len(remaining) == 2 else remaining[0]
    queue = [s for s in (first_next, other(first_next)) if s in remaining]
    return {**d, "round": d["round"] + 1, "queue": queue, "turnPos": 0,
            "phase": "spinning", "pool": None}


def pool_is_dead(d: dict) -> bool:
    """Havuzda aktif taraf için seçilebilir kimse yoksa tur boşa düşer —
    çağıran yeniden spin etmeli (kaleci dolu + elde yalnız kaleci kalması
    gerçek bir durum, sessizce kilitlenmemeli)."""
    pool = d.get("pool") or {}
    players = pool.get("players") or []
    if not players:
        return True
    seat = active_seat(d)
    return not any(can_pick(d, seat, p) for p in players)


def squad_of(d: dict, seat: int) -> dict:
    """Eleme motoruna verilecek hâli. Ceza ve skor YALNIZ ilk 11'den; yedekler
    kadronun parçası ama sayıya girmiyor (client draft.js squadOf ile aynı)."""
    pitch = pitch_of(d, seat)
    squad = d["squads"][seat]
    players = [squad[x["id"]] for x in pitch if x["id"] in squad]
    bench = [squad[b["id"]] for b in BENCH if b["id"] in squad]
    pen = sum(pos_penalty_for(squad[x["id"]], x) for x in pitch if x["id"] in squad)
    return {"players": players, "bench": bench,
            "positionPenalty": pen / max(1, len(pitch)),
            "shape": d["shapes"][seat]}


def swap(d: dict, seat: int, a: str, b: str) -> tuple[bool, Any]:
    """Aynı taraf içinde iki slotu takas et (kilitli kadro ekranındaki son
    düzenleme). Kaleci kuralı burada da sert: kaleci yalnız kaleye girer."""
    slots = {x["id"]: x for x in slots_of(d, seat)}
    if a == b or a not in slots or b not in slots:
        return False, "bad slots"
    sq = dict(d["squads"][seat])
    pa, pb = sq.pop(a, None), sq.pop(b, None)
    if pa and not can_place(pa, slots[b]):
        return False, "A goalkeeper can only stand in goal."
    if pb and not can_place(pb, slots[a]):
        return False, "A goalkeeper can only stand in goal."
    if pa:
        sq[b] = {**pa, "_slot": b}
    if pb:
        sq[a] = {**pb, "_slot": a}
    return True, {**d, "squads": {**d["squads"], seat: sq}}


# ── Menajerler ───────────────────────────────────────────────────────────────
# frontend/src/game/football/managers.js'in birebir karşılığı (parite testi
# ikisini yan yana koşturuyor). Notlar sübjektif ve dönem itibarına dayalı;
# ölçülmüş bir şey değil. Menajer bir DİZİLİŞLE özdeşleşir: tercih ettiği şekil
# seninkiyle eşleşirse tam bonus, eşleşmezse küçük bir pay.
MANAGERS = [
    {"name": "Pep Guardiola", "shape": "4-3-3", "att": "A+", "def": "A-", "tag": "POSSESSION"},
    {"name": "Jürgen Klopp", "shape": "4-3-3", "att": "A", "def": "A-", "tag": "PRESSING"},
    {"name": "Carlo Ancelotti", "shape": "4-3-3", "att": "A", "def": "B+", "tag": "MAN-MANAGER"},
    {"name": "Diego Simeone", "shape": "4-4-2", "att": "B-", "def": "A+", "tag": "LOW BLOCK"},
    {"name": "Antonio Conte", "shape": "3-5-2", "att": "A-", "def": "A", "tag": "BACK THREE"},
    {"name": "José Mourinho", "shape": "4-2-3-1", "att": "B+", "def": "A", "tag": "COUNTER"},
    {"name": "Mikel Arteta", "shape": "4-3-3", "att": "A-", "def": "A-", "tag": "POSSESSION"},
    {"name": "Simone Inzaghi", "shape": "3-5-2", "att": "A", "def": "A-", "tag": "BACK THREE"},
    {"name": "Xabi Alonso", "shape": "3-4-2-1", "att": "A", "def": "A-", "tag": "BACK THREE"},
    {"name": "Luis Enrique", "shape": "4-3-3", "att": "A", "def": "B+", "tag": "POSSESSION"},
    {"name": "Hansi Flick", "shape": "4-2-3-1", "att": "A+", "def": "B", "tag": "HIGH LINE"},
    {"name": "Roberto De Zerbi", "shape": "4-2-3-1", "att": "A-", "def": "B", "tag": "BUILD-UP"},
    {"name": "Unai Emery", "shape": "4-4-2", "att": "B+", "def": "A-", "tag": None},
    {"name": "Marcelo Bielsa", "shape": "3-4-2-1", "att": "A", "def": "C+", "tag": "PRESSING"},
    {"name": "Massimiliano Allegri", "shape": "3-5-2", "att": "B", "def": "A", "tag": "PRAGMATIST"},
    {"name": "Gian Piero Gasperini", "shape": "3-4-2-1", "att": "A", "def": "B+", "tag": "MAN-MARKING"},
    {"name": "Arne Slot", "shape": "4-2-3-1", "att": "A-", "def": "A-", "tag": None},
    {"name": "Enzo Maresca", "shape": "4-2-3-1", "att": "B+", "def": "B+", "tag": "BUILD-UP"},
    {"name": "Thomas Frank", "shape": "4-3-3", "att": "B", "def": "B+", "tag": "SET PIECES"},
    {"name": "Oliver Glasner", "shape": "3-4-2-1", "att": "B+", "def": "B+", "tag": "BACK THREE"},
    {"name": "Diego Pablo Cholo", "shape": "5-3-2", "att": "C+", "def": "A+", "tag": "LOW BLOCK"},
    {"name": "Rafa Benítez", "shape": "4-2-3-1", "att": "B", "def": "A-", "tag": None},
    {"name": "Ange Postecoglou", "shape": "4-3-3", "att": "A-", "def": "C+", "tag": "HIGH LINE"},
    {"name": "Vincent Kompany", "shape": "4-2-3-1", "att": "A-", "def": "B", "tag": None},
]
MANAGER_BY_NAME = {m["name"]: m for m in MANAGERS}

_GRADE = {"A+": 1.00, "A": 0.92, "A-": 0.85, "B+": 0.78, "B": 0.70,
          "B-": 0.63, "C+": 0.55, "C": 0.48, "C-": 0.40, "D": 0.30, "F": 0.15}


def grade_value(g: str) -> float:
    return _GRADE.get(g, 0.5)


def manager_bonus(manager: dict | None, shape: str) -> dict:
    """{bonus, matched}. Eşleşmede en fazla +0.05, eşleşmezse en fazla +0.01."""
    if not manager:
        return {"bonus": 0.0, "matched": False}
    matched = manager["shape"] == shape
    quality = (grade_value(manager["att"]) + grade_value(manager["def"])) / 2
    return {"bonus": (0.05 if matched else 0.01) * quality, "matched": matched}


def draw_managers(n: int = 4, rng=None) -> list[dict]:
    """n farklı rastgele menajer. Seçenekleri SUNUCU çekiyor: istemci kendi
    havuzunu seçseydi en iyi menajeri hep önüne koyardı."""
    import random as _random
    return [dict(m) for m in (rng or _random).sample(MANAGERS, min(n, len(MANAGERS)))]
