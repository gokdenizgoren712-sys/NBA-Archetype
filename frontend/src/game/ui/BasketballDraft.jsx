import { useEffect, useMemo, useRef, useState } from "react";
import DraftScreen from "./DraftScreen";
import PoolPanel from "./PoolPanel";
import BoardPanel from "./BoardPanel";
import { useDrawFlow } from "./useDrawFlow";
import { useFly } from "./useFly";
import { COURT_LINES, COURT_SLOTS } from "./boardGeometry";
import { ARCHETYPE_COLOR } from "../../constants/archetypeColors";
import { POSITIONS, BENCH_SLOTS, ALL_SLOTS, getPrimaryPos, posPenaltyFor } from "../positions";
import { priceOf } from "../salary";
import { teamName } from "./teamNames";

// Basketbol draft ekranı: motor durumunu (useLineupDraft, autoSpin:false) mockup 3c'ye bağlar.
// Fazlar: await_spin → (spin_season/spin_team/fetching örtüde) → pick_player → pick_pos → await_spin…
const SORTS = [
  { key: "default", label: "Default" }, { key: "MIN", label: "Minutes" }, { key: "PTS", label: "PTS" },
  { key: "REB", label: "REB" }, { key: "AST", label: "AST" }, { key: "FG3_PCT", label: "3P%" },
];
const num = (v) => (v == null || isNaN(+v) ? null : +v);
const fmt = (v, d = 1) => (num(v) == null ? "—" : (+v).toFixed(d));
const lastName = (n) => (n || "").split(" ").slice(-1)[0];
const archColor = (a) => ARCHETYPE_COLOR[a] || "#a8a8b2";
const penLabel = (pen) => (pen >= 1 ? "natural" : pen >= 0.9 ? "−10%" : "−25%");
const penTone = (pen) => (pen >= 1 ? "good" : pen >= 0.9 ? "warn" : "bad");

export default function BasketballDraft({ draft, onInfo }) {
  const d = draft;
  const [sortKey, setSortKey] = useState("default");
  const [lastJoker, setLastJoker] = useState(null);
  const { fly, token, flying } = useFly();
  const shown = useRef({ season: "—", team: "—" });

  const ready = d.phase === "pick_player" || d.phase === "pick_pos";
  const flow = useDrawFlow({
    spinSeq: d.spinSeq, spinKind: d.spinKind, seasons: d.seasons, teamPool: d.teamPool,
    targetSIdx: d.targetSIdx, targetTIdx: d.targetTIdx, chosenSeason: d.chosenSeason, chosenTeam: d.chosenTeam, ready, label: teamName,
  });
  const placing = d.phase === "pick_pos" && !!d.pickedPlayer;
  const salary = d.mode === "salarycap";

  // Çekiliş şeridi: örtü kalkana kadar eski değer görünür.
  if (flow.poolShown && d.chosenSeason) shown.current = { season: d.chosenSeason, team: teamName(d.chosenTeam) };
  const draw = flow.poolShown && d.chosenSeason ? { season: d.chosenSeason, team: teamName(d.chosenTeam) } : shown.current;

  useEffect(() => { setSortKey("default"); }, [d.spinSeq]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && placing) d.cancelPick(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, d]);

  // ── Havuz ──────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const list = [...d.players];
    if (sortKey !== "default") list.sort((a, b) => (num(b[sortKey]) ?? -1) - (num(a[sortKey]) ?? -1));
    return list.map((p) => {
      const price = salary ? priceOf(p) : null;
      const insufficient = p.overall_score == null || +p.overall_score <= 0;
      const ovr = p.overall_score != null ? Math.round(p.overall_score * 100) : "—";
      return {
        id: p.PLAYER_NAME, player: p, pos: getPrimaryPos(p), name: p.PLAYER_NAME,
        arch: p.primary_arch || "—", archColor: archColor(p.primary_arch),
        stats: `${fmt(p.PTS)} PTS · ${fmt(p.REB)} REB · ${fmt(p.AST)} AST`,
        right: ovr, sub: salary ? `${price}% cap` : num(p.MIN) != null ? `${Math.round(p.MIN)} mpg` : "",
        disabled: insufficient || (salary && d.spendCap != null && price > d.spendCap),
      };
    });
  }, [d.players, sortKey, salary, d.spendCap]);

  const onPick = (row) => {
    if (placing && d.pickedPlayer?.PLAYER_NAME === row.id) { d.cancelPick(); return; }
    d.pickPlayer(row.player);
  };

  // ── Tahta ──────────────────────────────────────────────────────────────
  const pen = (pos) => (placing ? posPenaltyFor(d.pickedPlayer, pos) : 1);
  const slotState = (pos) => (d.lineup[pos] ? "filled" : placing ? "target" : "empty");
  const place = (key) => {
    if (flying) return;
    const name = d.pickedPlayer.PLAYER_NAME;
    const row = [...document.querySelectorAll("[data-row]")].find((e) => e.dataset.row === name);
    const el = document.querySelector(`.sb-bslot[data-slot="${key}"] .dot`) || document.querySelector(`.sb-bench-row [data-slot="${key}"]`);
    fly(row, el, POSITIONS.includes(key) ? key : "B", () => d.pickPos(key));
  };
  const onSlot = (key) => (placing && !d.lineup[key] ? place(key) : d.slotTap(key));

  const slots = COURT_SLOTS.map((s) => {
    const p = d.lineup[s.pos], st = slotState(s.pos), pn = st === "target" ? pen(s.pos) : 1;
    return {
      key: s.pos, x: s.x, y: s.y, state: st, name: p?.PLAYER_NAME,
      center: p ? (d.discoverActive ? Math.round((p.overall_score || 0) * 100) : "??") : s.pos,
      label: p ? lastName(p.PLAYER_NAME) : st === "target" && pn >= 1 ? "Pick here" : s.pos,
      cost: st === "target" ? penLabel(pn) : p && p._posPenalty < 1 ? penLabel(p._posPenalty) : null,
      costTone: st === "target" ? penTone(pn) : p ? penTone(p._posPenalty) : "",
      tap: !placing && d.canRearrange && (!!p || !!d.moveSrc),
    };
  });
  const bench = BENCH_SLOTS.map((b) => {
    const p = d.lineup[b];
    return {
      key: b, state: p ? "filled" : placing ? "target" : "empty", label: p ? lastName(p.PLAYER_NAME) : placing ? "Place here" : "",
      tap: !placing && d.canRearrange && (!!p || !!d.moveSrc),
    };
  });

  // ── Jokerler ───────────────────────────────────────────────────────────
  const J = [
    { key: "reTeam", icon: "team", label: "Re-spin Team", act: d.jokerReTeam, ok: d.jokers.reTeam },
    { key: "reYear", icon: "year", label: "Re-spin Year", act: d.jokerReYear, ok: d.jokers.reYear },
    { key: "reBoth", icon: "both", label: "Re-spin Both", act: d.jokerReBoth, ok: d.jokers.reBoth },
    { key: "double", icon: "pick2", label: "Pick 2", act: d.jokerDouble, ok: d.jokerAvailable.double, active: d.doubleActive },
    { key: "discover", icon: "discover", label: "Discover", act: d.jokerDiscover, ok: d.jokerAvailable.discover, active: d.discoverActive },
  ];
  const usable = d.phase === "pick_player" && flow.poolShown;
  const jokers = J.map((j) => {
    const pressed = j.active || (flow.overlayOn && lastJoker === j.key);
    const used = !pressed && !d.jokers[j.key];
    return {
      key: j.key, icon: j.icon, label: j.label, state: pressed ? "pressed" : used ? "used" : "ready",
      enabled: usable && j.ok, onClick: () => { setLastJoker(j.key); j.act(); },
    };
  });

  // ── Spin ───────────────────────────────────────────────────────────────
  const canSpin = d.phase === "await_spin";
  const spinning = flow.overlayOn || ["spin_season", "spin_team", "fetching"].includes(d.phase);
  const spin = {
    label: canSpin ? "Spin" : spinning ? "Spinning…" : "Locked",
    disabled: !canSpin, idle: canSpin && d.filledSlots.length === 0,
    onClick: () => { setLastJoker(null); d.startFullSpin(); },
  };

  const empty = d.phase === "await_spin" ? "Press Spin to draw a team and a season." : "Loading players…";
  const benchPick = placing && BENCH_SLOTS.some((b) => !d.lineup[b]) && (
    <div className="sb-only-mobile sb-benchpick">
      <span>Or send to the bench</span>
      {BENCH_SLOTS.filter((b) => !d.lineup[b]).map((b) => <button key={b} type="button" onClick={() => place(b)}>{b}</button>)}
    </div>
  );

  return (
    <>
      <DraftScreen sport="basketball" chip={d.simEra?.label}
        progress={{ filled: d.filledSlots.length, total: ALL_SLOTS.length }} onInfo={onInfo}
        draw={{ season: draw.season, team: draw.team }} flow={flow} spin={spin} jokers={jokers}
        pool={
          <PoolPanel title={placing ? "Pick a slot" : "Pick one player"} count={rows.length}
            sortChips={SORTS} sortKey={sortKey} onSort={setSortKey} rows={rows}
            selectedId={placing ? d.pickedPlayer.PLAYER_NAME : null} onPick={onPick}
            reveal={d.discoverActive} rowsIn={flow.poolIn && rows.length > 0} stagger={flow.stagger}
            blocked={!flow.poolShown || flying} empty={empty} note={benchPick} />
        }
        board={
          <BoardPanel title="Your five" filled={d.filledSlots.length} total={ALL_SLOTS.length}
            lines={COURT_LINES} slots={slots} bench={bench} onSlot={onSlot} movingKey={d.moveSrc} />
        } />
      {token}
    </>
  );
}
