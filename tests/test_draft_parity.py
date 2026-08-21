# -*- coding: utf-8 -*-
"""Draft kuralları: Python ↔ JavaScript paritesi.

src/football/draft_rules.py, frontend'deki formations.js + positions.js +
draft.js'in sunucu kopyası. İki kopya demek, birinin sessizce kaymasına açık
kapı demek — ve kayma burada görünmez bir şekilde acıtır: istemci "bu seçim
geçerli" der, sunucu reddeder; ya da daha kötüsü, sunucu istemcinin izin
vermediği bir kadroyu kabul eder.

Bu test iki tarafı da GERÇEKTEN koşturuyor (node ile JS, doğrudan Python) ve
çıktıları karşılaştırıyor. "Aynı yazdım" demiyor, aynı davrandığını gösteriyor.

Kural değiştirdiysen ve bu test kırıldıysa: iki taraftan birini güncellemeyi
unutmuşsundur.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.football import draft_rules as R   # noqa: E402

JS_DIR = ROOT / "frontend" / "src" / "game" / "football"
NODE = shutil.which("node")

# Ceza tablosunu köşe noktalarıyla tarıyoruz: her pozisyon × her slot pozisyonu.
ALL_POS = ["GK", "CB", "FB", "DM", "CM", "W", "AM", "ST"]
ALL_SLOT_POS = ["GK", "CB", "FB", "DM", "CM", "W", "AM", "ST"]

JS_PROBE = r"""
import { FORMATIONS, SHAPE_KEYS } from "%(dir)s/formations.js";
import { canPlace, posPenaltyFor, isPrimarySlot } from "%(dir)s/positions.js";
import * as D from "%(dir)s/draft.js";

const ALL_POS = %(pos)s;
const ALL_SLOT_POS = %(slotpos)s;

// 1) Diziliş slotları — kimlik, istenen pozisyon, faz
const shapes = {};
for (const k of SHAPE_KEYS) {
  shapes[k] = FORMATIONS[k].slots.map(s => [s.id, s.pos, s.phase]);
}

// 2) Ceza + yerleştirme tablosu
const table = {};
for (const p of ALL_POS) {
  for (const want of ALL_SLOT_POS) {
    const player = { POSITION: p };
    const slot = { id: "X", pos: want, phase: "mid" };
    table[p + ">" + want] = [
      posPenaltyFor(player, slot),
      canPlace(player, slot),
      isPrimarySlot(player, slot),
    ];
  }
}

// 3) Senaryolu draft — sıra, yılan davranışı, bitiş
// Havuz: her turda aynı 22 kişilik yapay kadro; ilk uygun slota yerleştir.
const pool = [];
for (let i = 0; i < 40; i++) {
  pool.push({ PLAYER_ID: 1000 + i, POSITION: ALL_POS[i %% ALL_POS.length] });
}
let d = D.createDraft({ shapes: { 1: "4-3-3", 2: "4-2-3-1" }, wheelMode: "round", first: 1 });
const order = [];
let guard = 0;
while (d.phase !== "done" && guard++ < 200) {
  if (d.phase === "spinning") { d = D.setPool(d, { team: "T" + guard, season: "S", players: pool }); continue; }
  const seat = D.activeSeat(d);
  const p = pool.find(x => D.canPick(d, seat, x));
  if (!p) { d = D.setPool(d, { team: "T" + guard, season: "S", players: pool }); continue; }
  const slot = D.openSlotsFor(d, seat, p)[0];
  order.push([d.round, seat, p.PLAYER_ID, slot.id]);
  const r = D.pick(d, seat, p, slot.id);
  if (!r.ok) { order.push(["FAIL", r.reason]); break; }
  d = r.state;
}
const squads = {};
for (const s of [1, 2]) {
  const sq = D.squadOf(d, s);
  squads[s] = { shape: sq.shape, n: sq.players.length,
                penalty: Math.round(sq.positionPenalty * 1e6) / 1e6,
                slots: sq.players.map(p => p._slot) };
}

console.log(JSON.stringify({ shapes, table, order, phase: d.phase, squads }));
"""


def _js() -> dict:
    if NODE is None:
        pytest.skip("node bulunamadı — JS tarafı koşturulamıyor")
    src = JS_PROBE % {
        # Windows'ta ESM mutlak yolu file:// URL'i olmak ZORUNDA — düz
        # "C:/..." yolu ERR_UNSUPPORTED_ESM_URL_SCHEME veriyor ('c:' protokol
        # sanılıyor). as_uri() üç platformda da doğru olanı üretiyor.
        "dir": JS_DIR.as_uri(),
        "pos": json.dumps(ALL_POS),
        "slotpos": json.dumps(ALL_SLOT_POS),
    }
    probe = ROOT / "_parity_probe.mjs"
    probe.write_text(src, encoding="utf-8")
    try:
        out = subprocess.run([NODE, str(probe)], capture_output=True, text=True, timeout=90)
        if out.returncode != 0:
            pytest.fail("node hatası:\n" + out.stderr[-2000:])
        return json.loads(out.stdout.strip().splitlines()[-1])
    finally:
        probe.unlink(missing_ok=True)


@pytest.fixture(scope="module")
def js():
    return _js()


def test_shapes_match(js):
    """Slot kimlikleri ortak sözleşme: sunucu bunlarla karar veriyor, istemci
    bunlarla saha çiziyor. Biri diğerinde olmayan bir kimlik kullanırsa seçim
    'unknown slot' diye reddedilir."""
    assert sorted(js["shapes"]) == sorted(R.FORMATIONS), "diziliş listesi farklı"
    for shape, js_slots in js["shapes"].items():
        py_slots = [[s["id"], s["pos"], s["phase"]] for s in R.slots_for(shape)]
        assert py_slots == js_slots, f"{shape} slotları farklı"


def test_penalty_and_placement_match(js):
    """Ceza tablosu ve kaleci kuralı — 64 kombinasyonun hepsi."""
    for p in ALL_POS:
        for want in ALL_SLOT_POS:
            key = f"{p}>{want}"
            js_pen, js_can, js_prim = js["table"][key]
            slot = {"id": "X", "pos": want, "phase": "mid"}
            player = {"POSITION": p}
            assert R.pos_penalty_for(player, slot) == pytest.approx(js_pen), f"ceza {key}"
            assert R.can_place(player, slot) is js_can, f"yerleştirme {key}"
            assert R.is_primary_slot(player, slot) is js_prim, f"asıl mevki {key}"


def test_draft_sequence_matches(js):
    """Aynı senaryo iki tarafta da aynı seçim sırasını üretmeli — yılan sırası,
    havuz tükenmesi, tamamlanan tarafın sıradan düşmesi dahil."""
    pool = [{"PLAYER_ID": 1000 + i, "POSITION": ALL_POS[i % len(ALL_POS)]}
            for i in range(40)]
    d = R.create_draft(shapes={1: "4-3-3", 2: "4-2-3-1"}, wheel_mode="round", first=1)
    order = []
    guard = 0
    while d["phase"] != "done" and guard < 200:
        guard += 1
        if d["phase"] == "spinning":
            d = R.set_pool(d, {"team": f"T{guard}", "season": "S", "players": pool})
            continue
        seat = R.active_seat(d)
        p = next((x for x in pool if R.can_pick(d, seat, x)), None)
        if p is None:
            d = R.set_pool(d, {"team": f"T{guard}", "season": "S", "players": pool})
            continue
        slot = R.open_slots_for(d, seat, p)[0]
        order.append([d["round"], seat, p["PLAYER_ID"], slot["id"]])
        ok, res = R.pick(d, seat, p, slot["id"])
        assert ok, f"seçim reddedildi: {res}"
        d = res

    assert d["phase"] == "done" == js["phase"]
    assert order == [list(x) for x in js["order"]], "seçim sırası farklı"

    for seat in (1, 2):
        sq = R.squad_of(d, seat)
        j = js["squads"][str(seat)]
        assert sq["shape"] == j["shape"]
        assert len(sq["players"]) == j["n"] == R.XI_PICKS
        assert sq["positionPenalty"] == pytest.approx(j["penalty"], abs=1e-6)
        assert [p["_slot"] for p in sq["players"]] == j["slots"]


def test_snake_order():
    """Yılan: her turda ilk seçen taraf değişmeli. Parite testinden bağımsız —
    JS de aynı hatayı yapıyorsa parite tutar ama kural yine yanlış olur."""
    pool = [{"PLAYER_ID": 2000 + i, "POSITION": ALL_POS[i % len(ALL_POS)]}
            for i in range(40)]
    d = R.create_draft(shapes={1: "4-3-3", 2: "4-3-3"}, wheel_mode="round", first=1)
    first_of_round: dict[int, int] = {}
    guard = 0
    while d["phase"] != "done" and guard < 200:
        guard += 1
        if d["phase"] == "spinning":
            d = R.set_pool(d, {"team": f"T{guard}", "season": "S", "players": pool})
            continue
        seat = R.active_seat(d)
        first_of_round.setdefault(d["round"], seat)
        p = next((x for x in pool if R.can_pick(d, seat, x)), None)
        if p is None:
            d = R.set_pool(d, {"team": f"T{guard}", "season": "S", "players": pool})
            continue
        ok, res = R.pick(d, seat, p, R.open_slots_for(d, seat, p)[0]["id"])
        assert ok
        d = res

    rounds = sorted(first_of_round)
    starts = [first_of_round[r] for r in rounds]
    assert len(rounds) >= 4, "tur sayısı beklenenden az"
    for a, b in zip(starts, starts[1:]):
        assert a != b, f"tur sırası dönüşmüyor: {starts}"


def test_no_player_on_both_sides():
    """Aynı oyuncu iki kadroya birden gidemez."""
    pool = [{"PLAYER_ID": 3000 + i, "POSITION": ALL_POS[i % len(ALL_POS)]}
            for i in range(40)]
    d = R.create_draft(shapes={1: "4-4-2", 2: "3-5-2"}, wheel_mode="round", first=2)
    guard = 0
    while d["phase"] != "done" and guard < 200:
        guard += 1
        if d["phase"] == "spinning":
            d = R.set_pool(d, {"team": f"T{guard}", "season": "S", "players": pool})
            continue
        seat = R.active_seat(d)
        p = next((x for x in pool if R.can_pick(d, seat, x)), None)
        if p is None:
            d = R.set_pool(d, {"team": f"T{guard}", "season": "S", "players": pool})
            continue
        ok, d = R.pick(d, seat, p, R.open_slots_for(d, seat, p)[0]["id"])
        assert ok
    a = {p["PLAYER_ID"] for p in R.squad_of(d, 1)["players"]}
    b = {p["PLAYER_ID"] for p in R.squad_of(d, 2)["players"]}
    assert not (a & b), "aynı oyuncu iki tarafta"


def test_keeper_slot_is_hard_both_ways():
    gk = {"PLAYER_ID": 1, "POSITION": "GK"}
    st = {"PLAYER_ID": 2, "POSITION": "ST"}
    gk_slot = {"id": "GK", "pos": "GK", "phase": "gk"}
    out_slot = {"id": "ST", "pos": "ST", "phase": "fwd"}
    assert R.can_place(gk, gk_slot) and not R.can_place(st, gk_slot)
    assert R.can_place(st, out_slot) and not R.can_place(gk, out_slot)


# ── XI doğrulama ─────────────────────────────────────────────────────────────

def _valid_xi(shape="4-3-3"):
    """Her slota kurallara uyan bir oyuncu koy."""
    out, players = [], {}
    for i, s in enumerate(R.slots_for(shape)):
        pid = 500 + i
        pos = "GK" if s["pos"] == "GK" else s["pos"]
        players[pid] = {"PLAYER_ID": pid, "POSITION": pos, "PLAYER_NAME": f"P{pid}"}
        out.append({"player_id": pid, "slot": s["id"]})
    return out, players


def test_validate_accepts_a_real_xi():
    xi, players = _valid_xi()
    r = R.validate_xi(xi, "4-3-3", players)
    assert len(r["slots"]) == 11
    assert r["position_penalty"] == 0.0      # herkes asıl mevkisinde


def test_validate_rejects_keeperless_xi():
    """Sunucunun bugün yakalayamadığı asıl senaryo: 11 forvet."""
    xi, players = _valid_xi()
    for pid in players:
        players[pid]["POSITION"] = "ST"
    with pytest.raises(R.InvalidXI, match="keeper"):
        R.validate_xi(xi, "4-3-3", players)


def test_validate_rejects_duplicate_player_and_slot():
    xi, players = _valid_xi()
    dup = [*xi[:-1], {"player_id": xi[0]["player_id"], "slot": xi[-1]["slot"]}]
    with pytest.raises(R.InvalidXI, match="twice"):
        R.validate_xi(dup, "4-3-3", players)

    two_in_one = [*xi[:-1], {"player_id": xi[-1]["player_id"], "slot": xi[0]["slot"]}]
    with pytest.raises(R.InvalidXI, match="Two players"):
        R.validate_xi(two_in_one, "4-3-3", players)


def test_validate_rejects_missing_and_unknown_slots():
    xi, players = _valid_xi()
    with pytest.raises(R.InvalidXI, match="Empty slots"):
        R.validate_xi(xi[:-1], "4-3-3", players)

    bad = [*xi[:-1], {"player_id": xi[-1]["player_id"], "slot": "SWEEPER"}]
    with pytest.raises(R.InvalidXI, match="no slot called"):
        R.validate_xi(bad, "4-3-3", players)


def test_validate_rejects_wrong_shape_slots():
    """4-3-3 için geçerli XI, 3-5-2'ye gönderilirse tutmamalı."""
    xi, players = _valid_xi("4-3-3")
    with pytest.raises(R.InvalidXI):
        R.validate_xi(xi, "3-5-2", players)
