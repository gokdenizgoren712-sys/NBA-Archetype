// Tasarım 8 — Canlı draft asistanı. Gerçek bir draft başka bir yerde oynanırken
// her pick "Taken" ya da "Mine" diye işaretlenir; öneri kadrona göre yeniden
// hesaplanır. Kayıt tarayıcıda (lig başına) + istenirse hesaba.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PaIcon from "../../components/shell/PaIcon";
import { ARCHETYPE_COLOR } from "../../constants/archetypeColors";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import { ErrorNote, Meter, ProbBar, ValidationNotice, fmt1, pct } from "./ui";
import { pickOwner, useAsync, useFantasy, useIsPhone } from "./useFantasy";

const fold = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const key = (f) => `fz_assist_${JSON.stringify([f.apiFormat, f.t, f.s])}`;
function load(f) { try { return JSON.parse(localStorage.getItem(key(f)) || "[]"); } catch { return []; } }
function save(f, order) { try { localStorage.setItem(key(f), JSON.stringify(order)); } catch { /* özel mod */ } }

export default function FantasyAssistant() {
  const f = useFantasy();
  const phone = useIsPhone();
  const { isLoggedIn } = useAuth();
  const [order, setOrder] = useState(() => load(f));
  const [undo, setUndo] = useState(null);
  const [q, setQ] = useState("");
  const [punt, setPunt] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [rec, setRec] = useState(null);
  const [recErr, setRecErr] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [saveErr, setSaveErr] = useState("");
  const input = useRef(null);
  const seq = useRef(0);

  useEffect(() => { setOrder(load(f)); setPunt([]); setDismissed([]); }, [f.apiFormat, f.t, f.s]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { save(f, order); }, [order]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pool = useAsync(() => fz.rankings(f.apiFormat, f.apiTeams, { limit: 300, source: f.projection }), JSON.stringify([f.apiFormat, f.apiTeams, f.projection]));
  const byId = useMemo(() => Object.fromEntries((pool.data?.players || []).map((p) => [p.player_id, p])), [pool.data]);

  const taken = order.filter((o) => !o.mine).map((o) => o.id);
  const mine = order.filter((o) => o.mine).map((o) => o.id);
  const current = order.length + 1;
  const done = current > f.t * f.rosterSize || mine.length >= f.rosterSize;

  useEffect(() => {
    if (done) { setRec(null); return; }
    const my = ++seq.current;
    setRecErr(null);
    fz.recommend({ format: f.apiFormat, teams: f.apiTeams, slot: f.s, taken, mine, punt, current_pick: current, n: 15, projection: f.projection })
      .then((d) => my === seq.current && setRec(d))
      .catch((e) => my === seq.current && setRecErr(e));
  }, [order, punt, f.apiFormat, f.apiTeams, f.s, f.projection]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mark = useCallback((p, isMine) => {
    setOrder((o) => (o.some((x) => x.id === p.player_id) ? o : [...o, { id: p.player_id, mine: isMine }]));
    setUndo({ text: `Marked ${p.name} as ${isMine ? "yours" : "taken"}.` });
    setQ("");
    input.current?.focus();
  }, []);
  const undoLast = useCallback(() => {
    setOrder((o) => o.slice(0, -1));
    setUndo(null);
  }, []);

  // Liste: arama boşsa öneriler (uyuma göre), doluysa işaretlenmemiş herkes (isimle).
  const marked = new Set(order.map((o) => o.id));
  const qq = fold(q.trim());
  const list = qq
    ? (pool.data?.players || []).filter((p) => !marked.has(p.player_id) && fold(p.name).includes(qq)).slice(0, 12)
        .map((p) => ({ p, v: p.value, avail: null, why: "" }))
    : (rec?.recommendations || []).map((r) => ({
        p: r.player, v: r.player.value, avail: r.available_next_pick,
        why: r.boosts?.length ? `Helps ${r.boosts.join(" · ")}` : "",
      }));

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && order.length) { e.preventDefault(); undoLast(); return; }
      if (e.key === "Enter" && document.activeElement === input.current && list[0]) {
        e.preventDefault();
        mark(list[0].p, e.shiftKey);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [list, order.length, mark, undoLast]);

  const nextMine = rec?.current_pick;
  const onClock = !done && pickOwner(current, f.t) === f.s;
  const round = Math.ceil(current / f.t);
  const pickLabel = done ? "Draft complete" : `Round ${round} · Pick ${current}`;
  const status = done ? "All set" : onClock ? "You're on the clock" : `${nextMine - current} pick${nextMine - current === 1 ? "" : "s"} until yours`;
  const suggestion = (rec?.punt_suggestion || []).filter((c) => !dismissed.includes(c) && !punt.includes(c));
  const probs = rec?.category_prob ? Object.entries(rec.category_prob) : [];
  const log = [...order].slice(-6).reverse();
  const nameOf = (id) => byId[id]?.name || `#${id}`;

  const saveToAccount = async () => {
    const body = { kind: "assistant", name: `Draft · ${f.fmtInfo.short} · slot ${f.s}`, format: f.apiFormat, teams: f.t, slot: f.s, state: { order } };
    setSaveErr("");
    try {
      const d = savedId ? await fz.drafts.update(savedId, { state: { order } }) : await fz.drafts.create(body);
      setSavedId(d.id);
    } catch (e) {
      setSaveErr(e.message);
    }
  };
  const startOver = () => { if (window.confirm("Clear every marked pick for this league?")) { setOrder([]); setUndo(null); setSavedId(null); } };

  const row = ({ p, v, avail, why }) => (
    <div key={p.player_id} className="fz-row"
      style={phone
        ? { display: "flex", alignItems: "center", gap: 8, minHeight: 68 }
        : { display: "grid", gridTemplateColumns: "minmax(0,1fr) 52px 110px 180px", gap: 10, alignItems: "center", minHeight: 60 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
        <span className="fz-meta" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {phone
            ? <>{p.eligible.join(",") || "Util"} · {fmt1(v)}{avail != null && <> · at {nextMine}: <span style={{ color: avail >= 0.65 ? "#4ade80" : avail < 0.35 ? "#f87171" : "#e5e5e5" }}>{pct(avail)}</span></>}</>
            : <>{p.team} · {p.eligible.join(",") || "Util"} · <span style={{ color: ARCHETYPE_COLOR[p.archetype] || "#8a8a8a" }}>{p.archetype || "—"}</span>{why ? ` · ${why}` : ""}</>}
        </span>
      </div>
      {!phone && <span className="fz-num" style={{ fontSize: 17, textAlign: "right" }}>{fmt1(v)}</span>}
      {!phone && (avail != null ? <Meter p={avail} width={44} /> : <span className="fz-meta" style={{ textAlign: "right" }}>–</span>)}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button className="fz-btn" style={phone ? { width: 72, height: 48 } : { height: 40, padding: "0 14px" }} onClick={() => mark(p, false)}>Taken</button>
        <button className="fz-btn light" style={phone ? { width: 64, height: 48 } : { height: 40, padding: "0 14px" }} onClick={() => mark(p, true)}>Mine</button>
      </div>
    </div>
  );

  const search = (
    <label className="fz-search primary">
      <PaIcon name="search" size={20} color="#e5e5e5" />
      <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!phone}
        placeholder={phone ? "Who just got picked?" : "Type a name to mark a pick"} aria-label="Search players to mark" />
    </label>
  );

  const puntCard = suggestion.length > 0 && f.kind === "categories" && (
    <div className="fz-card" style={{ padding: phone ? "10px 12px" : 18, display: "flex", flexDirection: phone ? "row" : "column", alignItems: phone ? "center" : "stretch", gap: 10 }}>
      {phone
        ? <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>Lean into punting <b style={{ fontWeight: 600 }}>{suggestion[0]}</b>? Your roster is weakest there.</span>
        : <>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Suggested: punt {suggestion[0]}</span>
            <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Your win odds in {suggestion[0]} are {pct(rec.category_prob[suggestion[0]])}. Punting it stops recommendations from spending picks there.
            </span>
          </>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="fz-btn sm" onClick={() => setPunt((p) => [...p, suggestion[0]])}>{phone ? "Apply" : "Apply punt"}</button>
        {!phone && <button className="fz-btn sm quiet fz-muted" onClick={() => setDismissed((d) => [...d, suggestion[0]])}>Dismiss</button>}
      </div>
    </div>
  );

  const listBody = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {!phone && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 52px 110px 180px", gap: 10, height: 32, alignItems: "center", boxShadow: "inset 0 -1px 0 #262626", fontSize: 12, color: "#8a8a8a" }}>
          <span>{qq ? "Matching players" : "Available · sorted by fit"}</span><span style={{ textAlign: "right" }}>Value</span>
          <span style={{ textAlign: "right" }}>{nextMine ? `Still there at ${nextMine}` : ""}</span><span />
        </div>
      )}
      {recErr && !qq && <ErrorNote error={recErr} what="recommendations" />}
      {!qq && <ValidationNotice v={rec?.validation} compact />}
      {list.map(row)}
      {list.length === 0 && !recErr && (
        <span className="fz-sub" style={{ padding: "24px 0" }}>{done ? "Your draft is complete." : qq ? "No available player matches. They may already be marked. Check Recent." : "Loading…"}</span>
      )}
    </div>
  );

  return (
    <>
      <SEO title="Fantasy draft assistant" description="Track a live fantasy draft and get recommendations for your roster at every pick." path="/basketball/fantasy/assistant" />
      {!phone ? (
        <div className="fz-page" style={{ display: "grid", gridTemplateColumns: "240px minmax(0,1fr) 320px", gap: 32, maxWidth: 1400, paddingTop: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="fz-meta">{pickLabel}</span>
              <span className="fz-d" style={{ fontSize: 28, lineHeight: 1.1, color: onClock ? "#FFB11B" : "#e5e5e5" }}>{status}</span>
              {!done && nextMine && <span className="fz-sub" style={{ fontSize: 13 }}>Your next pick: {nextMine}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 13, fontWeight: 600, paddingBottom: 6 }}>Recent</span>
              {log.map((o, i) => (
                <div key={o.id} className="fz-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 36, fontSize: 13 }}>
                  <span><span className="fz-muted" style={{ marginRight: 8 }}>{order.length - i}</span>{nameOf(o.id)}</span>
                  <span style={{ fontSize: 12, color: o.mine ? "#e5e5e5" : "#8a8a8a" }}>{o.mine ? "Mine" : "Taken"}</span>
                </div>
              ))}
              {!log.length && <span className="fz-sub" style={{ fontSize: 13 }}>Nothing marked yet.</span>}
            </div>
            <button className="fz-btn" disabled={!order.length} onClick={undoLast}>Undo last</button>
            <span className="fz-meta" style={{ lineHeight: 1.5 }}>Keyboard: type to search, Enter = taken, Shift+Enter = mine, Ctrl+Z = undo.</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isLoggedIn && <button className="fz-btn sm" disabled={!order.length} onClick={saveToAccount}>{savedId ? "Save again" : "Save to account"}</button>}
              <button className="fz-btn sm quiet fz-muted" disabled={!order.length} onClick={startOver}>Start over</button>
            </div>
            {saveErr && <span className="fz-err">{saveErr}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {search}
            {undo && (
              <div className="fz-notice" style={{ height: 44 }}>
                <span style={{ flex: 1, fontSize: 14 }}>{undo.text}</span>
                <button className="fz-link" style={{ fontSize: 14, fontWeight: 600 }} onClick={undoLast}>Undo</button>
              </div>
            )}
            {listBody}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {puntCard}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4 }}>
                <span className="fz-h2">Your team</span><span className="fz-meta">{mine.length} of {f.rosterSize}</span>
              </div>
              {mine.map((id) => (
                <div key={id} className="fz-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 36 }}>
                  <span style={{ fontSize: 14 }}>{nameOf(id)}</span><span className="fz-meta">{byId[id]?.eligible?.join(",") || ""}</span>
                </div>
              ))}
              {!mine.length && <span className="fz-sub" style={{ fontSize: 13 }}>Mark your picks with “Mine”.</span>}
            </div>
            {probs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="fz-h2" style={{ paddingBottom: 4 }}>Category profile</span>
                {probs.map(([c, p]) => <ProbBar key={c} cat={c} p={p} sm dim={punt.includes(c)} />)}
                {punt.length > 0 && <button className="fz-link" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={() => setPunt([])}>Clear punt ({punt.join(", ")})</button>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100% - 52px)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", boxShadow: "inset 0 -1px 0 #1a1a1a" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="fz-meta">{pickLabel}{nextMine && !done ? ` · next ${nextMine}` : ""}</span>
              <span className="fz-d" style={{ fontSize: 22, lineHeight: 1.1, color: onClock ? "#FFB11B" : "#e5e5e5" }}>{status}</span>
            </div>
            <button className="fz-btn" disabled={!order.length} onClick={undoLast}>Undo</button>
          </div>
          <div style={{ flex: 1, padding: "4px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
            {puntCard}
            {listBody}
          </div>
          {undo && (
            <div className="fz-notice" style={{ margin: "0 16px 8px", height: 48, borderRadius: 12, boxShadow: "0 12px 30px -10px #000" }}>
              <span style={{ flex: 1, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{undo.text}</span>
              <button className="fz-link" style={{ fontSize: 14, fontWeight: 600 }} onClick={undoLast}>Undo</button>
            </div>
          )}
          <div style={{ position: "sticky", bottom: 0, padding: "10px 16px 20px", background: "#0b0b0b", boxShadow: "inset 0 1px 0 #1a1a1a" }}>{search}</div>
        </div>
      )}
    </>
  );
}
