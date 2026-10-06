import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { EmptyState, ErrorState } from "../components/states/States";
import { ARCHETYPE_COLOR } from "../constants/archetypeColors";
import { PHASE_COLOR } from "../game/football/theme";
import "./profile.css";

// ── Profil (handoff 11d) ────────────────────────────────────────────────────
// Başlık: 84px avatar, kullanıcı adı, üyelik tarihi, sağda sayılar. Alt çizgili
// sekmeler; her kayıt 68px'lik bir satır (ad + meta · arketip noktaları · mod ·
// not · skor). Kadro tablosu iki sporu `sport` kolonuyla tutuyor — sekmeler
// buna göre ayrılıyor. Skorlar doğru adıyla: basketbolda 100 üzerinden Lineup
// Fit (persantil değil), futbolda 100 üzerinden kimya.

const BASE = "/api";
function authFetch(path, token, opts = {}) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}
const fmtDate = (d, day = true) => new Date(d).toLocaleDateString("en-US", day ? { year: "numeric", month: "short", day: "numeric" } : { year: "numeric", month: "long" });
const fitHex = (v) => (v >= 80 ? "#4ade80" : v >= 65 ? "#facc15" : v >= 50 ? "#fb923c" : "#f87171");
const SOURCE = { single: "Single Player", same_screen: "Same Screen", with_a_friend: "With a Friend" };

function Row({ title, meta, dots = [], mode, modeC, grade, score, scoreLabel, onRemove, children }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pf-row">
      <div className="nm"><b>{title}</b>{meta && <span>{meta}</span>}{children}</div>
      <div className="dots">{dots.map((d, i) => <i key={i} title={d.a} style={{ background: d.c, boxShadow: `0 0 8px ${d.c}` }} />)}</div>
      <span className="mode" style={modeC ? { color: modeC } : undefined}>{mode}</span>
      <span className="grade">{grade || ""}</span>
      <span className="sc" title={scoreLabel}>
        {score != null && <b style={{ color: fitHex(score) }}>{score}</b>}
        {scoreLabel && score != null && <em>{scoreLabel}</em>}
      </span>
      {onRemove && (confirm ? (
        <span className="rm">
          <button className="yes" onClick={onRemove}>Delete</button>
          <button onClick={() => setConfirm(false)}>Keep</button>
        </span>
      ) : (
        <button className="x" onClick={() => setConfirm(true)} aria-label={`Delete ${title}`}>×</button>
      ))}
    </div>
  );
}

export default function Profile() {
  const { token, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData]   = useState(null);
  const [tab, setTab]     = useState("bb");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    authFetch("/profile", token).then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!isLoggedIn) { navigate("/login?next=/profile"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const remove = async (path, key, id) => {
    const r = await authFetch(path, token, { method: "DELETE" });
    if (r.ok) setData(d => ({ ...d, [key]: d[key].filter(x => x.id !== id) }));
  };

  if (loading) return <div className="pf-page"><div className="pf-inner"><div className="pa-skel" style={{ height: 84, width: 420, borderRadius: 42 }} /></div></div>;
  if (error || !data) return <ErrorState title="Your profile didn't load" body="The server didn't answer. Try again in a moment." onRetry={load} />;

  const rosters = data.saved_rosters || [];
  const bb = rosters.filter(r => (r.sport || "basketball") === "basketball");
  const fb = rosters.filter(r => r.sport === "football");
  const u = data.user || {};

  const TABS = [
    ["bb", "Basketball rosters", bb.length], ["fb", "Football squads", fb.length],
    ["lineups", "Lineups", data.saved_lineups.length], ["players", "Players", data.saved_players.length],
    ["comments", "Comments", data.comments.length],
  ];
  // "Rank on the board" ve "Runs" mockup'ta var ama API'de karşılığı yok (ticket B9); uydurulmadı.
  const best = bb.reduce((m, r) => (r.overall_pct != null ? Math.max(m, Math.round(r.overall_pct)) : m), 0);
  const STATS = [
    { v: bb.length + fb.length, l: "Saved rosters" }, { v: best || "—", l: "Best rating" },
    { v: data.saved_lineups.length, l: "Saved lineups" },
  ];

  return (
    <>
      <SEO title="Profile" path="/profile" noindex />
      <div className="pf-page">
        <div className="pf-inner">
          <header className="pf-head">
            <span className="av" aria-hidden="true">{(u.username || "?")[0].toUpperCase()}</span>
            <div className="who">
              <p className="pa-eyebrow">Profile · Member since {fmtDate(u.created_at, false)}{u.role === "admin" ? " · Admin" : ""}</p>
              <h1>{u.username}</h1>
            </div>
            <div className="pf-actions">
              <Link to="/settings" className="pa-btn outline s44">Edit profile</Link>
              <Link to="/leaderboard" className="pa-btn quiet s44">Leaderboard</Link>
              {u.role === "admin" && <Link to="/admin/articles" className="pa-btn quiet s44">Admin panel</Link>}
              <button type="button" className="pa-btn quiet s44" onClick={() => { logout(); navigate("/"); }}>Sign out</button>
            </div>
          </header>
          <div className="pf-tiles">
            {STATS.map(s => <div key={s.l} className="pa-panel"><span className="pa-eyebrow">{s.l}</span><b>{s.v}</b></div>)}
          </div>

          <nav className="pa-tabs pf-tabs" role="tablist">
            {TABS.map(([k, l, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} className="pa-tab" onClick={() => setTab(k)}>
                {l}{n > 0 && <em>{n}</em>}
              </button>
            ))}
          </nav>

          <section className="pf-list">
            {tab === "bb" && (bb.length ? bb.map(r => {
              const score = r.overall_pct != null ? Math.round(r.overall_pct) : null;
              return (
                <Row key={r.id} title={r.name}
                  meta={[fmtDate(r.created_at), SOURCE[r.source_mode] || null, r.sim_era ? `${r.sim_era} era` : null].filter(Boolean).join(" · ")}
                  dots={(r.roster || []).slice(0, 9).map(p => ({ a: `${p.PLAYER_NAME} · ${p.primary_arch || ""}`, c: ARCHETYPE_COLOR[p.primary_arch] || "#5a5650" }))}
                  mode={r.mode === "salarycap" ? "Salary Cap" : "Classic"} modeC={r.mode === "salarycap" ? "#FFB11B" : "#60a5fa"}
                  grade={r.grade} score={score} scoreLabel="Lineup Fit"
                  onRemove={() => remove(`/rosters/${r.id}`, "saved_rosters", r.id)} />
              );
            }) : <EmptyState title="No saved rosters yet" body="Draft a roster in the game and save it from the result screen."
                    actions={[{ label: "Play the game", primary: true, onClick: () => navigate("/basketball/game") }]} />)}

            {tab === "fb" && (fb.length ? fb.map(r => {
              const raw = r.overall_pct ?? null;
              const score = raw == null ? null : Math.round(raw <= 1 ? raw * 100 : raw);
              const starters = (r.roster || []).filter(p => !String(p._slot || "").startsWith("SUB")).slice(0, 11);
              return (
                <Row key={r.id} title={r.name}
                  meta={[fmtDate(r.created_at), SOURCE[r.source_mode] || null].filter(Boolean).join(" · ")}
                  dots={starters.map(p => ({ a: `${p.PLAYER_NAME} · ${p.primary_arch || ""}`, c: PHASE_COLOR[p.PHASE] || "#5a5650" }))}
                  mode={r.mode} modeC="#3FB08C" score={score} scoreLabel="Chemistry"
                  onRemove={() => remove(`/rosters/${r.id}`, "saved_rosters", r.id)} />
              );
            }) : <EmptyState tint="#3FB08C" title="No saved squads yet" body="Build an eleven in Spin & Build and save it from the result screen."
                    actions={[{ label: "Play football", primary: true, onClick: () => navigate("/football/game") }]} />)}

            {tab === "lineups" && (data.saved_lineups.length ? data.saved_lineups.map(l => {
              const score = l.pct != null ? Math.round(l.pct) : null;
              return (
                <Row key={l.id} title={l.label || l.players.join(" · ")} meta={fmtDate(l.created_at)}
                  mode={`${l.players.length} players`} grade={l.grade} score={score} scoreLabel="Lineup Fit"
                  onRemove={() => remove(`/profile/saved-lineups/${l.id}`, "saved_lineups", l.id)} />
              );
            }) : <EmptyState title="No saved lineups yet" body="Build a five on the Lineups page and save it."
                    actions={[{ label: "Open Lineups", primary: true, onClick: () => navigate("/basketball/lineups") }]} />)}

            {tab === "players" && (data.saved_players.length ? data.saved_players.map(p => (
              <Row key={p.id} title={<Link to={`/basketball/players/${encodeURIComponent(p.player_name)}`}>{p.player_name}</Link>}
                meta={p.season} onRemove={() => remove(`/profile/saved-players/${p.id}`, "saved_players", p.id)} />
            )) : <EmptyState title="No saved players yet" body="Open a player card and use the bookmark to keep it here." />)}

            {tab === "comments" && (data.comments.length ? data.comments.map(c => (
              <div key={c.id} className="pf-comment">
                <Link to={`/blog/${c.article_slug}`}>{c.article_title}</Link>
                <p>{c.content}</p>
                <span>{fmtDate(c.created_at)}</span>
              </div>
            )) : <EmptyState title="No comments yet" body="Comments you leave on blog posts show up here." />)}
          </section>
        </div>
      </div>
    </>
  );
}
