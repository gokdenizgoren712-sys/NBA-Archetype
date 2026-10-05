import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";
import * as D from "./draft";
import { buildSide } from "./headToHead";
import { FootballVersusEntry, FootballVersusDraft, FootballVersusLocked } from "../ui/VersusFootball";

// ── Same Screen draft ────────────────────────────────────────────────────────
// İki oyuncu tek cihazda sırayla seçiyor. Kurallar draft.js'te (saf durum
// makinesi); burası yalnızca onu çiziyor ve çarkı çeviriyor.
//
// EKRAN DÜZENİ basketbolun SameScreenGame'inden alındı, çünkü site zaten o dili
// konuşuyor: g-dock başlık barı, ortada InlineSpin şeritleri, altta yan yana iki
// koltuk paneli (aktif olan kendi renginde parlıyor). Önceki hâli tek düz bir
// panelde yalnız sıradaki oyuncuyu gösteriyordu — rakibin kadrosu kurulurken
// görünmüyordu ve sayfa sitenin geri kalanına hiç benzemiyordu.
//
// Futbola özgü iki fark duruyor: seçilen oyuncu bir SLOT'a yerleşiyor, ve draft
// 11 seçimle bitiyor (eleme skoru yalnızca ilk 11'den hesaplanıyor).

const SPIN_MS = 1500;

export default function SameScreenDraft({ onDone }) {
  const [meta, setMeta] = useState({ pairs: [], teams: [], seasons: [] });
  const [shapes, setShapes] = useState({ 1: "4-3-3", 2: "4-3-3" });
  const [wheelMode, setWheelMode] = useState("round");
  const [names, setNames] = useState({ 1: "Player 1", 2: "Player 2" });
  const [d, setD] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [pickingFor, setPickingFor] = useState(null);   // slot bekleyen oyuncu
  const [msg, setMsg] = useState("");
  const timer = useRef(null);
  const spinRef = useRef(false);

  useEffect(() => {
    api.footballGameTeams({})
      .then((r) => setMeta({ pairs: r.pairs || [], teams: r.teams || [],
                             seasons: r.seasons || [] }))
      .catch(() => setMsg("Could not load the club pool."));
    return () => clearTimeout(timer.current);
  }, []);

  const seat = d ? D.activeSeat(d) : 1;

  /** Çark: kullanılmamış bir kulüp-sezon seç, kadrosunu getir. */
  const spin = useCallback((state) => {
    if (spinRef.current || !meta.pairs.length) return;
    const used = new Set(state.usedPairs);
    const pool = meta.pairs.filter((p) => !used.has(`${p.team}|${p.season}`));
    if (!pool.length) { setMsg("No fresh club-season left."); return; }

    spinRef.current = true;
    setSpinning(true); setMsg(""); setPickingFor(null);
    const t = pool[Math.floor(Math.random() * pool.length)];

    // Şeritlerin kendi animasyonu var (InlineSpin) — burada yalnız süre tutuluyor.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.footballGamePlayers({ season: t.season, team: t.team })
        .then((r) => {
          spinRef.current = false; setSpinning(false);
          setD((cur) => D.setPool(cur, { ...t, players: r.players || [] }));
        })
        .catch(() => {
          spinRef.current = false; setSpinning(false);
          setMsg("Could not load that squad — spin again.");
        });
    }, SPIN_MS);
  }, [meta.pairs]);

  // Faz "spinning"e düştüğünde otomatik çevir; havuz ölüyse tekrar çevir.
  useEffect(() => {
    if (!d) return;
    if (d.phase === "spinning" && !spinRef.current) spin(d);
    else if (d.phase === "drafting" && D.poolIsDead(d) && !spinRef.current) {
      setMsg("Nobody left there for this side — spinning again.");
      spin(d);
    }
  }, [d, spin]);

  const start = () =>
    setD(D.createDraft({ shapes, wheelMode, first: Math.random() < 0.5 ? 1 : 2 }));

  const choose = (p) => {
    if (!D.canPick(d, seat, p)) return;
    const open = D.openSlotsFor(d, seat, p);
    if (open.length === 1) { place(p, open[0].id); return; }
    setPickingFor(p);
  };

  const place = (player, slotId) => {
    const r = D.pick(d, seat, player, slotId);
    if (!r.ok) { setMsg(r.reason); return; }
    setPickingFor(null); setMsg("");
    setD(r.state);
  };

  // Kurulum, draft ve kilitli XI ekranları game/ui/VersusFootball.jsx'te (mockup 8a–8d); mantık burada.
  if (!d) {
    return (
      <FootballVersusEntry names={names} setNames={setNames} shapes={shapes} setShapes={setShapes}
        wheelMode={wheelMode} setWheelMode={setWheelMode} ready={meta.pairs.length > 0} onStart={start} msg={msg} />
    );
  }

  if (d.phase === "done") {
    const squads = { 1: { ...D.squadOf(d, 1), name: names[1] }, 2: { ...D.squadOf(d, 2), name: names[2] } };
    const score = (s) => Math.round(buildSide(squads[s].name, squads[s].players, null, squads[s].positionPenalty).quality * 100);
    return (
      <FootballVersusLocked d={d} names={names} scores={{ 1: score(1), 2: score(2) }} onPlay={() => onDone?.(squads)} />
    );
  }

  return (
    <FootballVersusDraft d={d} names={names} spinning={spinning} pickingFor={pickingFor}
      msg={msg} canPick={(p) => D.canPick(d, seat, p)} onChoose={choose} onPlace={place}
      onCancel={() => { setPickingFor(null); setMsg(""); }} round={d.round} />
  );
}
