import { useMemo, useRef, useState } from "react";
import DraftScreen from "./DraftScreen";
import PoolPanel from "./PoolPanel";
import BoardPanel from "./BoardPanel";
import { useDrawFlow } from "./useDrawFlow";
import { useFly } from "./useFly";
import { PITCH_LINES, footballSlotPos } from "./boardGeometry";
import useMediaQuery from "../../hooks/useMediaQuery";
import { FORMATIONS, benchSlots } from "../football/formations";
import { posPenaltyFor, isPrimarySlot, canPlace } from "../football/positions";
import { LEAGUE_LABEL } from "../football/leagues";
import { PHASE_COLOR } from "../football/theme";

// Futbol draft ekranı: sayfanın kendi durumunu (FootballGame) mockup 11b / Draft Flow'a bağlar.
// Masaüstü: yatay saha (kendi kalen solda). Mobil (≤700px): dikey saha, mockup 13b.
const VERTICAL_LINES = [
  "M1 1H99V69H1Z", "M1 35H99", "M42 35a8 8 0 1 0 16 0a8 8 0 1 0 -16 0",
  "M30 1V14H70V1", "M41 1V5H59V1", "M30 69V56H70V69", "M41 65H59V69",
];
const SORTS = [
  { key: "default", label: "Default" }, { key: "MINUTES_TOTAL", label: "Minutes" },
  { key: "goals_90", label: "Goals" }, { key: "assists_90", label: "Assists" },
];
const ROW_STATS = {
  gk:  [["CLEAN_SHEETS", "CS"], ["APPS", "APP"]],
  def: [["CLEAN_SHEETS", "CS"], ["assists_90", "A"]],
  mid: [["goals_90", "G"], ["assists_90", "A"]],
  fwd: [["goals_90", "G"], ["assists_90", "A"]],
};
const COUNT_STAT = new Set(["CLEAN_SHEETS", "APPS"]);
const n = (v) => { const x = parseFloat(v); return isNaN(x) ? null : x; };
const statVal = (p, key) => {
  const v = n(p?.[key]);
  if (v == null) return "—";
  return COUNT_STAT.has(key) ? String(Math.round(v)) : v.toFixed(v >= 10 ? 0 : 2);
};
const mins = (p) => { const v = n(p.MINUTES_TOTAL); return v == null ? "" : `${Math.round(v).toLocaleString("en-US")}'`; };
const lastName = (s) => (s || "").split(" ").slice(-1)[0];
const costText = (pen) => (pen === 0 ? "natural" : `−${Math.round(pen * 100)}`);
const costTone = (pen) => (pen === 0 ? "good" : pen <= 0.11 ? "warn" : "bad");

export default function FootballDraft({
  shape, squad, phase, spinning, chosen, roster, rosterReady, pickingFor, jokers, doubleLeft, discover,
  seasons, teams, spinSeq, spinKind, msg, moveSrc,
  onSpin, jokerReTeam, jokerReYear, jokerReBoth, jokerDouble, jokerDiscover,
  choosePlayer, cancelPick, onSlotClick, onInfo,
}) {
  const [sortKey, setSortKey] = useState("default");
  const [lastJoker, setLastJoker] = useState(null);
  const { fly, token, flying } = useFly();
  const vertical = useMediaQuery("(max-width: 700px)");
  const shown = useRef({ season: "—", team: "—", sub: "" });

  const f = FORMATIONS[shape];
  const pitchSlots = f?.slots || [];
  const bench = benchSlots();
  const total = pitchSlots.length + bench.length;
  const filled = [...pitchSlots, ...bench].filter((s) => squad[s.id]).length;
  const open = [...pitchSlots, ...bench].filter((s) => !squad[s.id]);

  const flow = useDrawFlow({
    spinSeq, spinKind, seasons, teamPool: teams,
    targetSIdx: chosen ? seasons.indexOf(chosen.season) : 0, targetTIdx: chosen ? teams.indexOf(chosen.team) : 0,
    chosenSeason: chosen?.season, chosenTeam: chosen?.team, ready: phase === "picking" && rosterReady,
  });
  const placing = !!pickingFor;

  if (flow.poolShown && chosen) shown.current = { season: chosen.season, team: chosen.team, sub: LEAGUE_LABEL[chosen.league] || chosen.league };
  const draw = flow.poolShown && chosen ? { season: chosen.season, team: chosen.team, sub: LEAGUE_LABEL[chosen.league] || chosen.league } : shown.current;

  // ── Havuz ────────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const list = [...roster];
    if (sortKey !== "default") list.sort((a, b) => (n(b[sortKey]) ?? -1) - (n(a[sortKey]) ?? -1));
    return list.map((p) => {
      const hex = PHASE_COLOR[p.PHASE] || "#a8a8b2";
      const st = (ROW_STATS[p.PHASE] || []).map(([k, l]) => `${statVal(p, k)} ${l}`).join(" · ");
      return {
        id: String(p.PLAYER_ID), player: p, pos: p.POSITION, name: p.PLAYER_NAME, arch: p.primary_arch || "—", archColor: hex,
        stats: p.PHASE === "gk" || p.PHASE === "def" ? st : `${st} /90`,
        right: Math.round((p.overall_score || 0) * 100), sub: mins(p), disabled: false,
      };
    });
  }, [roster, sortKey]);

  // ── Tahta ────────────────────────────────────────────────────────────────
  const place = (slot) => {
    if (flying || !pickingFor) return;
    const from = document.querySelector(".sb-picked");
    const to = document.querySelector(`.sb-bslot[data-slot="${slot.id}"] .dot`) || document.querySelector(`.sb-bench-row [data-slot="${slot.id}"]`);
    fly(from, to, slot.bench ? "S" : slot.pos, () => onSlotClick(slot));
  };
  const click = (slot) => (placing && !squad[slot.id] ? place(slot) : onSlotClick(slot));

  const slots = pitchSlots.map((s) => {
    const p = squad[s.id];
    const ok = placing && !p && canPlace(pickingFor, s);
    const pen = ok ? posPenaltyFor(pickingFor, s) : 0;
    const pos = vertical ? { x: s.x, y: s.y } : (() => { const q = footballSlotPos(s); return { x: q.left, y: q.top }; })();
    return {
      key: s.id, ...pos, state: p ? "filled" : ok ? "target" : "empty", name: p?.PLAYER_NAME,
      center: p ? (discover ? Math.round((p.overall_score || 0) * 100) : "??") : s.pos,
      label: p ? lastName(p.PLAYER_NAME) : ok && pen === 0 ? "Pick here" : s.pos,
      cost: ok ? costText(pen) : p && !isPrimarySlot(p, s) && posPenaltyFor(p, s) > 0 ? costText(posPenaltyFor(p, s)) : null,
      costTone: ok ? costTone(pen) : p ? costTone(posPenaltyFor(p, s)) : "",
      tap: !placing && (!!p || moveSrc != null),
    };
  });
  const benchSlotsView = bench.map((b) => {
    const p = squad[b.id];
    return {
      key: b.id, state: p ? "filled" : placing ? "target" : "empty", label: p ? lastName(p.PLAYER_NAME) : placing ? "Place here" : "",
      tap: !placing && (!!p || moveSrc != null),
    };
  });

  // ── Jokerler ─────────────────────────────────────────────────────────────
  const usable = phase === "picking" && flow.poolShown && !placing && !spinning;
  const J = [
    { key: "reTeam", icon: "team", label: "Re-spin Club", act: jokerReTeam, ok: jokers.reTeam && !!chosen },
    { key: "reYear", icon: "year", label: "Re-spin Year", act: jokerReYear, ok: jokers.reYear && !!chosen },
    { key: "reBoth", icon: "both", label: "Re-spin Both", act: jokerReBoth, ok: jokers.reBoth },
    { key: "double", icon: "pick2", label: "Pick 2", act: jokerDouble, ok: jokers.double && open.length >= 2, active: doubleLeft > 0 },
    { key: "discover", icon: "discover", label: "Discover", act: jokerDiscover, ok: jokers.discover, active: discover },
  ];
  const jokerViews = J.map((j) => {
    const pressed = j.active || (flow.overlayOn && lastJoker === j.key);
    const used = !pressed && !jokers[j.key];
    return {
      key: j.key, icon: j.icon, label: j.label, state: pressed ? "pressed" : used ? "used" : "ready",
      enabled: usable && j.ok, onClick: () => { setLastJoker(j.key); j.act(); },
    };
  });

  // Seçilebilecek kimse kalmadıysa (kalan slotlara uyan oyuncu yok) tekrar çevirmek serbest.
  const stuck = phase === "picking" && rosterReady && rows.length === 0 && !placing && !spinning;
  const canSpin = (phase === "idle" && filled > 0) || stuck;
  const spin = {
    label: canSpin ? "Spin" : flow.overlayOn || spinning ? "Spinning…" : "Locked",
    disabled: !canSpin, idle: false, onClick: () => { setLastJoker(null); onSpin(); },
  };

  // ── Seçilen oyuncu kartı (11b) ───────────────────────────────────────────
  const fits = placing ? [...pitchSlots, ...bench].filter((s) => !squad[s.id] && canPlace(pickingFor, s)) : [];
  const chips = placing
    ? [...new Map(fits.filter((s) => !s.bench).map((s) => [s.pos, posPenaltyFor(pickingFor, s)])).entries()].sort((a, b) => a[1] - b[1])
    : [];
  const natural = placing && fits.some((s) => !s.bench && isPrimarySlot(pickingFor, s)) ? pickingFor.POSITION : null;
  const pickedPanel = placing && (
    <div className="sb-pickwrap">
      <section className="sb-panel sb-picked">
        <p className="hint">Pick a slot on the pitch (or a bench spot below).</p>
        <p className="name">{pickingFor.PLAYER_NAME}</p>
        <p className="sub"><span style={{ color: PHASE_COLOR[pickingFor.PHASE] }}>{pickingFor.primary_arch}</span> · natural {pickingFor.POSITION}</p>
        <p className="note">Tap a slot on the pitch. Off-position slots cost you points.</p>
        <div className="chips">
          {chips.map(([pos, pen]) => (
            <span key={pos} className="sb-chip-cost" style={{
              color: pen === 0 ? "var(--sb-good)" : pen <= 0.11 ? "var(--sb-warn)" : "var(--sb-warn-2)",
              borderColor: pen === 0 ? "var(--sb-bad-2)" : "currentColor",
            }}>{pos} {costText(pen)}</span>
          ))}
        </div>
        <button type="button" className="cancel" onClick={cancelPick}>Cancel</button>
      </section>
      <div className="sb-locked-note">Wheels and jokers are locked until you place {natural ? "him" : "them"}.</div>
    </div>
  );

  const empty = msg || (phase === "idle" ? "Press Spin to draw a club and a season." : "Loading players…");

  return (
    <>
      <DraftScreen sport="football" chip={shape} progress={{ filled, total }} onInfo={onInfo}
        draw={draw} flow={flow} spin={spin} jokers={jokerViews}
        pool={pickedPanel || (
          <PoolPanel title="Pick one player" count={rows.length} sortChips={SORTS} sortKey={sortKey} onSort={setSortKey}
            rows={rows} selectedId={null} onPick={(r) => choosePlayer(r.player)} reveal={discover}
            rowsIn={flow.poolIn && rows.length > 0} stagger={flow.stagger} blocked={!flow.poolShown || spinning} empty={empty} />
        )}
        board={
          <BoardPanel title="Your XI" filled={filled} total={total} variant={vertical ? "pitch vertical" : "pitch"}
            lines={vertical ? VERTICAL_LINES : PITCH_LINES} slots={slots} bench={benchSlotsView}
            onSlot={(id) => click([...pitchSlots, ...bench].find((s) => s.id === id))} movingKey={moveSrc} />
        } />
      {token}
    </>
  );
}
