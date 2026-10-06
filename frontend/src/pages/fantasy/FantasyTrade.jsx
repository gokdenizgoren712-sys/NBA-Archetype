// Tasarım 12 — takas analizi. İki tarafa da oyuncu dokun; sonuç canlı yeniden hesaplanır.
// Sunucu (Faz 4): takas öncesi / sonrası kadroyla AYNI sezonlar oynatılır (ortak rastgele sayılar), fark verilir.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import RosterSourceBar from "./RosterSourceBar";
import { BAD, ENGINE_NOTE, ErrorNote, GOOD, SkeletonList, ValidationNotice, fmt1, ordinal, pct } from "./ui";
import { useFantasy, useIsPhone } from "./useFantasy";
import { useRosterSource } from "./useRosterSource";

const SIMS = 250;
const SEED = 7;
const LEAGUE_SEED = 1;              // "roster" kaynağında aynı simüle rakip seti (sayfa boyunca sabit)
const EMPTY = { key: null, give: [], get: [], partner: null, extra: {} };

const sgnPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(Math.round(v * 100))}`;
const tone = (v, eps = 0.005) => (v > eps ? GOOD : v < -eps ? BAD : "#8a8a8a");

function PlayerRow({ p, on, onClick, right }) {
  return (
    <button className="fz-row" onClick={onClick} aria-pressed={on}
      style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center", minHeight: 48, width: "100%", textAlign: "left",
               background: on ? "rgba(255,177,27,.09)" : "transparent", border: 0, borderRadius: 8, padding: "0 10px", cursor: "pointer",
               boxShadow: on ? "inset 0 0 0 1px rgba(255,177,27,.55)" : undefined, color: "inherit" }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
        <span className="fz-meta">{p.team} · {p.eligible.join(",") || "Util"}</span>
      </span>
      <span className="fz-num" style={{ fontSize: 16 }}>{right ?? fmt1(p.value)}</span>
    </button>
  );
}

function Delta({ label, now, after, fmt, dfmt, higherBetter = true, eps }) {
  const d = higherBetter ? after - now : now - after;       // + = senin lehine (sıralamada kazanılan basamak dahil)
  const flat = Math.abs(d) < eps;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
      <span className="fz-muted" style={{ fontSize: 13 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="fz-meta">from {fmt(now)}</span>
        <span className="fz-num" style={{ fontSize: 20 }}>{fmt(after)}</span>
        <span className="fz-num" style={{ fontSize: 14, color: flat ? "#8a8a8a" : d > 0 ? GOOD : BAD, minWidth: 44, textAlign: "right" }}>
          {flat ? "±0" : `${d > 0 ? "+" : "−"}${dfmt(Math.abs(d))}`}
        </span>
      </span>
    </div>
  );
}

function Result({ r, f }) {
  const cats = r.categories || [];
  const good = r.verdict === "Good for you";
  const bad = r.verdict === "Bad for you";
  return (
    <div className="fz-card" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="fz-d" style={{ fontSize: 30, lineHeight: 1.1, color: good ? GOOD : bad ? BAD : "#e5e5e5" }}>{r.verdict}</span>
        <span className="fz-sub" style={{ lineHeight: 1.5 }}>{r.why}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cats.length > 0
          ? <Delta label="Cats / week" now={r.before.category_wins_per_week} after={r.after.category_wins_per_week} fmt={(v) => v.toFixed(1)} dfmt={(d) => d.toFixed(1)} eps={0.05} />
          : <Delta label="Matchup win rate" now={r.before.all_play_rate} after={r.after.all_play_rate} fmt={(v) => pct(v)} dfmt={(d) => `${(d * 100).toFixed(1)}`} eps={0.004} />}
        <Delta label="Standing" now={r.before.rank_mean} after={r.after.rank_mean} fmt={(v) => ordinal(Math.round(v))} dfmt={(d) => d.toFixed(1)} higherBetter={false} eps={0.1} />
        <Delta label="Playoff odds" now={r.before.playoff_prob} after={r.after.playoff_prob} fmt={(v) => pct(v)} dfmt={(d) => `${Math.round(d * 100)}`} eps={0.01} />
        <span className="fz-meta">
          {r.scope?.mode === "rest" ? `Rest of season, from week ${r.scope.from_week}: only games still to play count. ` : ""}
          Average finish is over {r.sims} simulated seasons; the verdict rests on weekly matchup win rate, the steadiest of these. {ENGINE_NOTE[r.engine] || ""}
        </span>
      </div>
      {cats.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 56px 56px", gap: 10, fontSize: 12, color: "#8a8a8a", paddingBottom: 4 }}>
            <span /><span>Chance to win the category, per week</span><span style={{ textAlign: "right" }}>Now</span><span style={{ textAlign: "right" }}>After</span>
          </div>
          {cats.map((c) => (
            <div key={c.cat} style={{ display: "grid", gridTemplateColumns: "48px 1fr 56px 56px", gap: 10, alignItems: "center", minHeight: 30 }}>
              <span className="fz-num" style={{ fontSize: 14, color: "#8a8a8a" }}>{c.cat}</span>
              <span className="fz-num" style={{ fontSize: 14, color: tone(c.change, 0.01) }}>{Math.abs(c.change) < 0.01 ? "±0" : sgnPct(c.change)}</span>
              <span className="fz-num" style={{ fontSize: 14, textAlign: "right", color: "#8a8a8a" }}>{Math.round(c.now * 100)}%</span>
              <span className="fz-num" style={{ fontSize: 15, textAlign: "right" }}>{Math.round(c.after * 100)}%</span>
            </div>
          ))}
        </div>
      )}
      {r.roster_notes.length > 0 && (
        <div className="fz-notice" style={{ alignItems: "flex-start" }}>
          <span className="dot" style={{ marginTop: 6, flexShrink: 0 }} />
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>{r.roster_notes.map((n) => <span key={n}>{n}</span>)}</span>
        </div>
      )}
      <ValidationNotice v={r.validation} />
      <span className="fz-meta">{f.isCustom ? "Custom league" : f.fmtInfo.label} · {r.sims} simulated seasons, both rosters played through the same seasons.</span>
    </div>
  );
}

export default function FantasyTrade() {
  const f = useFantasy();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const rs = useRosterSource(f, isLoggedIn);
  const { body, ctxKey } = rs;
  const [league, setLeague] = useState({ key: null, data: null, error: null });
  const [selRaw, setSelRaw] = useState(EMPTY);
  const [resRaw, setResRaw] = useState({ key: null, data: null, error: null, loading: false });
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const seq = useRef(0);

  const sel = selRaw.key === ctxKey ? selRaw : { ...EMPTY, key: ctxKey };
  const update = (patch) => setSelRaw({ ...sel, ...patch });

  useEffect(() => {
    if (!body) return undefined;
    let live = true;
    fz.leagueRosters({ ...body, league_seed: LEAGUE_SEED })
      .then((data) => { if (live) setLeague({ key: ctxKey, data, error: null }); })
      .catch((error) => { if (live) setLeague({ key: ctxKey, data: null, error }); });
    return () => { live = false; };
  }, [ctxKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const lg = league.key === ctxKey ? league : { data: null, error: null };
  const slot = body?.slot;
  const rosters = lg.data?.rosters || {};
  const mine = rosters[String(slot)] || [];
  const others = Object.keys(rosters).map(Number).filter((t) => t !== slot).sort((a, b) => a - b);
  const partner = sel.partner ?? others[0] ?? null;
  const theirs = partner ? rosters[String(partner)] || [] : [];
  const byId = Object.fromEntries(Object.values(rosters).flat().map((p) => [p.player_id, p]));
  const lookup = (id) => byId[id] || sel.extra[id];
  const extras = sel.get.filter((id) => !theirs.some((p) => p.player_id === id));    // aramayla eklenenler

  const toggle = (key, id) => update({ [key]: sel[key].includes(id) ? sel[key].filter((x) => x !== id) : [...sel[key], id].slice(0, 5) });

  // Arama: kadrolarda olmayan oyuncuları da "get" tarafına ekleyebil
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return undefined;
    const t = setTimeout(() => {
      fz.rankings(f.apiFormat, f.apiTeams, { search: term, limit: 6 }).then((d) => setHits(d.players || [])).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, f.apiFormat, f.apiTeams]);
  const shownHits = q.trim().length < 2 ? [] : hits;
  const addExtra = (p) => {
    const info = { player_id: p.player_id, name: p.name, team: p.team, eligible: p.eligible, value: p.value };
    update({ get: sel.get.includes(p.player_id) ? sel.get : [...sel.get, p.player_id].slice(0, 5), extra: { ...sel.extra, [p.player_id]: info } });
    setQ("");
  };

  // Canlı analiz: seçim değişince kısa beklemeyle
  const anaKey = sel.give.length && sel.get.length ? JSON.stringify([ctxKey, sel.give, sel.get]) : null;
  useEffect(() => {
    if (!anaKey || !body) return undefined;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setResRaw((r) => ({ ...r, loading: true }));
      try {
        const data = await fz.trade({ ...body, league_seed: LEAGUE_SEED, give: sel.give, get: sel.get, sims: SIMS, seed: SEED });
        if (my === seq.current) setResRaw({ key: anaKey, data, error: null, loading: false });
      } catch (error) {
        if (my === seq.current) setResRaw({ key: anaKey, data: null, error, loading: false });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [anaKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const res = resRaw.key === anaKey ? resRaw : { data: null, error: null };
  const stale = anaKey && (resRaw.loading || resRaw.key !== anaKey);

  const sideStyle = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
  return (
    <>
      <SEO title="Fantasy trade analyzer" description="See how a trade changes your playoff odds, weekly matchups and category strengths." path="/basketball/fantasy/trade" />
      <div className="fz-page" style={{ gap: 22, maxWidth: 1300 }}>
        <div className="fz-head"><div className="fz-head-l">
          <h1 className="fz-h1">Trade analyzer</h1>
          <span className="fz-sub">Tap players on either roster to build the trade. Results recompute live.</span>
        </div></div>
        <RosterSourceBar rs={rs} />
        {rs.error && <ErrorNote error={rs.error} what="the saved draft" />}

        {!body && (
          <div className="fz-card" style={{ padding: "26px 24px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <span className="fz-h2">No roster to trade with yet</span>
            <span className="fz-sub" style={{ maxWidth: 560, lineHeight: 1.55 }}>Finish a mock draft, fill your roster in the assistant, or pick a saved draft. The analyzer plays your roster and the trade partner's through the season.</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="fz-btn light" onClick={() => navigate(`/basketball/fantasy/mock${f.query}`)}>Start a mock draft</button>
              <button className="fz-btn" onClick={() => navigate(`/basketball/fantasy/assistant${f.query}`)}>Open the assistant</button>
            </div>
          </div>
        )}
        {body && !lg.data && !lg.error && <SkeletonList rows={6} height={44} />}
        {lg.error && <ErrorNote error={lg.error} what="the rosters" />}

        {lg.data && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "minmax(0,1fr) minmax(0,1fr)", gap: phone ? 22 : 28 }}>
              <div style={sideStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4 }}>
                  <span className="fz-h2">You give</span><span className="fz-meta">Your roster · value</span>
                </div>
                {mine.map((p) => <PlayerRow key={p.player_id} p={p} on={sel.give.includes(p.player_id)} onClick={() => toggle("give", p.player_id)} />)}
              </div>
              <div style={sideStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, paddingBottom: 4 }}>
                  <span className="fz-h2">You get</span>
                  <select className="fz-btn sm" value={partner ?? ""} aria-label="Trade partner" onChange={(e) => update({ partner: Number(e.target.value), get: [] })}>
                    {others.map((t) => <option key={t} value={t}>Team {t}</option>)}
                  </select>
                </div>
                {theirs.map((p) => <PlayerRow key={p.player_id} p={p} on={sel.get.includes(p.player_id)} onClick={() => toggle("get", p.player_id)} />)}
                {extras.map((id) => (
                  <PlayerRow key={id} p={lookup(id)} on right="×" onClick={() => toggle("get", id)} />
                ))}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 8 }}>
                  <input className="fz-input" placeholder="Or search any player…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search any player to receive" />
                  {shownHits.map((p) => (
                    <button key={p.player_id} className="fz-row" onClick={() => addExtra(p)}
                      style={{ display: "flex", justifyContent: "space-between", minHeight: 40, alignItems: "center", background: "none", border: 0, color: "inherit", cursor: "pointer", padding: "0 10px" }}>
                      <span style={{ fontSize: 14 }}>{p.name} <span className="fz-meta">{p.team}</span></span><span className="fz-meta">Add</span>
                    </button>
                  ))}
                </div>
                {lg.data.mode === "simulated_rivals" && (
                  <span className="fz-meta" style={{ lineHeight: 1.5, paddingTop: 6 }}>Rival rosters here are simulated from how bots draft. Search adds any real player, even from a team not listed.</span>
                )}
              </div>
            </div>

            {!(sel.give.length && sel.get.length) && (
              <span className="fz-sub">Pick players on both sides to see how the trade changes your team.</span>
            )}
            {res.error && <ErrorNote error={res.error} what="the trade analysis" />}
            {res.data && (
              <div style={{ opacity: stale ? 0.5 : 1, transition: "opacity .15s" }}>
                <Result r={res.data} f={f} />
              </div>
            )}
            {stale && !res.data && <SkeletonList rows={4} height={40} />}
          </>
        )}
      </div>
    </>
  );
}
