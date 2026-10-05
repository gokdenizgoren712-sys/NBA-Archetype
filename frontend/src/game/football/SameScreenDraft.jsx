import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";
import * as D from "./draft";
import { buildSide } from "./headToHead";
import { FootballVersusEntry, FootballVersusDraft, FootballVersusLocked } from "../ui/VersusFootball";

// ── Same Screen draft ────────────────────────────────────────────────────────
// İki oyuncu tek cihazda sırayla seçiyor. Kurallar draft.js'te (saf durum
// makinesi); burası onu çiziyor, çarkı çeviriyor ve jokerleri yönetiyor.
//
// Futbola özgü farklar: seçilen oyuncu bir SLOT'a yerleşiyor, kadro 18 kişi
// (11 + 7 yedek, skor yalnız ilk 11'den) ve jokerler basketbolla aynı set:
// kendi 5 jokeri (Club/Year/Both/Pick 2/Discover) + bekleyen tarafın karşı-jokerleri
// (BAN / Force Club / Force Year). Menajer, eşleşme ve ayaklar FootballVersus'ta.

const SPIN_MS = 1500;
const EMPTY_JOKERS = { reTeam: true, reYear: true, reBoth: true, double: true, discover: true, ban: true, forceTeam: true, forceYear: true };
const freshJokers = () => ({ 1: { ...EMPTY_JOKERS }, 2: { ...EMPTY_JOKERS } });

export default function SameScreenDraft({ onDone }) {
  const [meta, setMeta] = useState({ pairs: [], teams: [], seasons: [] });
  const [shapes, setShapes] = useState({ 1: "4-3-3", 2: "4-3-3" });
  const [wheelMode, setWheelMode] = useState("round");
  const [names, setNames] = useState({ 1: "Player 1", 2: "Player 2" });
  const [d, setD] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [pickingFor, setPickingFor] = useState(null);   // slot bekleyen oyuncu
  const [msg, setMsg] = useState("");
  const [jokers, setJokers] = useState(freshJokers);
  const [doubleActive, setDoubleActive] = useState(false);
  const [discoverActive, setDiscoverActive] = useState(false);
  const [bannedId, setBannedId] = useState(null);
  const [banVoided, setBanVoided] = useState(false);
  const [banPicking, setBanPicking] = useState(false);
  const [counterDismissed, setCounterDismissed] = useState(false);
  const [moveSrc, setMoveSrc] = useState({ 1: null, 2: null });
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
  const waiting = d ? D.waitingSeat(d) : 2;

  /** Çark: kullanılmamış bir kulüp-sezon seç, kadrosunu getir. lockSeason/lockTeam jokerler için. */
  const spin = useCallback((state, lockSeason = null, lockTeam = null) => {
    if (spinRef.current || !meta.pairs.length) return;
    const used = new Set(state.usedPairs);
    const pool = meta.pairs.filter((p) => !used.has(`${p.team}|${p.season}`)
      && (!lockSeason || p.season === lockSeason) && (!lockTeam || p.team === lockTeam));
    if (!pool.length) { setMsg(lockSeason || lockTeam ? "No fresh option left for that lock." : "No fresh club-season left."); return; }

    spinRef.current = true;
    setSpinning(true); setMsg(""); setPickingFor(null);
    const t = pool[Math.floor(Math.random() * pool.length)];

    // Şeritlerin kendi animasyonu var — burada yalnız süre tutuluyor.
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

  const start = () => {
    setJokers(freshJokers()); setDoubleActive(false); setDiscoverActive(false);
    setBannedId(null); setBanVoided(false); setBanPicking(false); setCounterDismissed(false); setMoveSrc({ 1: null, 2: null });
    setD(D.createDraft({ shapes, wheelMode, first: Math.random() < 0.5 ? 1 : 2 }));
  };

  // ── Jokerler ──────────────────────────────────────────────────────────────
  const spend = (who, k) => setJokers((j) => ({ ...j, [who]: { ...j[who], [k]: false } }));
  const useJoker = (k) => {
    if (!d?.pool || spinning || pickingFor || !jokers[seat][k]) return;
    if (k === "double" && D.slotsOf(d, seat).filter((s) => !d.squads[seat][s.id]).length < 2) return;
    if (bannedId && !banVoided) setBanVoided(true);       // herhangi bir joker banı kaldırır
    spend(seat, k);
    if (k === "reTeam") spin(d, d.pool.season, null);
    else if (k === "reYear") spin(d, null, d.pool.team);
    else if (k === "reBoth") spin(d);
    else if (k === "double") { setDoubleActive(true); setMsg("Pick 2 — take two players from this squad."); }
    else if (k === "discover") setDiscoverActive(true);
  };
  const useCounter = (k) => {
    if (!d?.pool || !jokers[waiting][k] || counterDismissed) return;
    spend(waiting, k); setCounterDismissed(true);
    if (k === "ban") { setBanPicking(true); return; }
    setBannedId(null); setBanVoided(false);               // yeni havuzda eski ban anlamsız
    if (k === "forceTeam") spin(d, d.pool.season, null);
    else spin(d, null, d.pool.team);
  };
  const confirmBan = (p) => { setBannedId(p.PLAYER_ID); setBanPicking(false); };

  const choose = (p) => {
    if (!D.canPick(d, seat, p) || (bannedId === p.PLAYER_ID && !banVoided)) return;
    const open = D.openSlotsFor(d, seat, p);
    if (open.length === 1) { place(p, open[0].id); return; }
    setPickingFor(p);
  };

  const place = (player, slotId) => {
    const again = doubleActive;
    const r = D.pick(d, seat, player, slotId, { again });
    if (!r.ok) { setMsg(r.reason); return; }
    setPickingFor(null); setMsg("");
    setDoubleActive(false);
    if (!again || r.state.phase !== "drafting" || D.activeSeat(r.state) !== seat) {
      setDiscoverActive(false); setBannedId(null); setBanVoided(false); setBanPicking(false); setCounterDismissed(false);
    }
    setD(r.state);
  };

  // Kilitli kadroda son düzenleme: iki slotu takas et
  const tapSlot = (who, id) => {
    const src = moveSrc[who];
    if (src == null) { if (d.squads[who][id]) setMoveSrc((m) => ({ ...m, [who]: id })); return; }
    if (src === id) { setMoveSrc((m) => ({ ...m, [who]: null })); return; }
    const r = D.swap(d, who, src, id);
    if (!r.ok) setMsg(r.reason); else { setD(r.state); setMsg(""); }
    setMoveSrc((m) => ({ ...m, [who]: null }));
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
      <FootballVersusLocked d={d} names={names} scores={{ 1: score(1), 2: score(2) }} moveSrc={moveSrc} onSlotTap={tapSlot} msg={msg}
        onPlay={() => onDone?.(squads)} />
    );
  }

  const counterOn = d.phase === "drafting" && !!d.pool && !spinning && !pickingFor && !counterDismissed && !banPicking
    && (jokers[waiting].ban || jokers[waiting].forceTeam || jokers[waiting].forceYear);
  return (
    <FootballVersusDraft d={d} names={names} spinning={spinning} pickingFor={pickingFor}
      msg={msg} canPick={(p) => D.canPick(d, seat, p)} onChoose={choose} onPlace={place}
      onCancel={() => { setPickingFor(null); setMsg(""); }} round={d.round}
      jokers={jokers[seat]} onUseJoker={useJoker} doubleActive={doubleActive} discoverActive={discoverActive}
      bannedId={bannedId} banVoided={banVoided} banPicking={banPicking} onConfirmBan={confirmBan}
      counter={counterOn ? { jokers: jokers[waiting], onUse: useCounter, onDismiss: () => setCounterDismissed(true) } : null} />
  );
}
