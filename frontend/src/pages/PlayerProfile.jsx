import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import PlayerCard from "../components/PlayerCard";
import { useAuth } from "../contexts/AuthContext";
import { EmptyState } from "../components/states/States";
import { Button } from "../components/ui";
import { ARCHETYPE_COLOR } from "../constants/archetypeColors";
import { getAwardBadges } from "../game/awards";
import "./player-profile.css";

// ── Oyuncu profili (handoff 9a / mobil 19c) ─────────────────────────────────
// Önceden sayfa yalnızca açık kartın kendisiydi. Artık: solda kart | sağda
// başlık (56px), gerçek ödüller, hızlı istatistik, 12 arketip persantili;
// altta kariyer grafiği (sezon başına overall + arketip) ve "Plays most like".
// Mobilde bölümler sekmelere ayrılıyor (Overview / Archetype / Seasons / Similar).

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const CURRENT = "2025-26";
const AWARD = {
  MVP:   { c: "#facc15", l: (n) => `${n}× MVP` },
  DPOY:  { c: "#38bdf8", l: (n) => `${n}× DPOY` },
  RING:  { c: "#fbbf24", l: (n) => `${n}× Champion` },
  FMVP:  { c: "#fb923c", l: (n) => `${n}× Finals MVP` },
  SIXTH: { c: "#f97316", l: () => "Sixth Man" },
};
const TABS = [["overview", "Overview"], ["archetype", "Archetype"], ["seasons", "Seasons"], ["similar", "Similar"]];

const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));
// Arama substring ile eşleşiyor ("Gary Payton" → "Gary Payton II" de gelir):
// tam ad eşleşmesini tercih et.
const pickRow = (list, n) =>
  list.find(p => (p.PLAYER_NAME || "").toLowerCase() === n.toLowerCase()) || list[0] || null;

/* Kariyer grafiği: overall (0–100) çizgisi, noktada değer, altta yıl + arketip */
function CareerChart({ seasons, tint }) {
  if (!seasons.length) return <p className="pp-muted">No earlier seasons on record.</p>;
  const vals = seasons.map(s => Math.round((s.overall_score || 0) * 100));
  const lo = Math.max(0, Math.min(...vals) - 8), hi = Math.min(100, Math.max(...vals) + 8);
  const n = seasons.length;
  const x = (i) => (n === 1 ? 50 : 4 + (i / (n - 1)) * 92);
  const y = (v) => 88 - ((v - lo) / Math.max(1, hi - lo)) * 70;
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line = pts.map(([a, b], i) => `${i ? "L" : "M"}${a},${b}`).join(" ");
  const dense = n > 12;   // 12 sütundan sonra adlar sığmıyor → yıl kısaltılır, arketip nokta olur
  return (
    <>
      <div className={`pp-chart${dense ? " dense" : ""}`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="pp-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={tint} stopOpacity=".22" />
              <stop offset="1" stopColor={tint} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map(g => <line key={g} x1="0" x2="100" y1={g} y2={g} className="grid" vectorEffect="non-scaling-stroke" />)}
          <path d={`${line} L${pts[n - 1][0]},100 L${pts[0][0]},100 Z`} fill="url(#pp-area)" />
          <path d={line} fill="none" stroke={tint} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {pts.map(([a, b], i) => (
          <span key={seasons[i].season} className="pt" style={{ left: `${a}%`, top: `${b}%`, "--c": tint }}>
            {/* dar ekranda (ve yoğun modda) her ikinci değer gizlenir, sonuncu hep kalır */}
            <b className={i % 2 === 1 && i !== n - 1 ? "odd" : ""}>{vals[i]}</b>
          </span>
        ))}
      </div>
      {/* Tam yıl + arketip adı ya da kısa yıl + arketip noktası — hangisinin
          görüneceğine sütun genişliği karar verir (dense sınıfı / mobil CSS) */}
      <div className={`pp-chart-x${dense ? " dense" : ""}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {seasons.map(s => (
          <div key={s.season} title={`${s.season} · ${s.team || ""} · ${s.primary_arch || ""}`}>
            <span className="full">{s.season}</span>
            <span className="short">{`'${s.season.slice(2, 4)}`}</span>
            <em style={{ color: ARCHETYPE_COLOR[s.primary_arch] || "var(--text-muted)" }}>{s.primary_arch || "—"}</em>
            <i style={{ background: ARCHETYPE_COLOR[s.primary_arch] || "#5a5650" }} />
          </div>
        ))}
      </div>
    </>
  );
}

export default function PlayerProfile() {
  const { name: rawName } = useParams();
  const navigate = useNavigate();
  const name = decodeURIComponent(rawName || "");

  const { isLoggedIn, token } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [row, setRow] = useState(null);          // liste satırı (kart için tam alanlar)
  const [pool, setPool] = useState(0);
  const [career, setCareer] = useState(null);
  const [similar, setSimilar] = useState(null);
  const [mtab, setMtab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagArch, setFlagArch] = useState("");
  const [flagNote, setFlagNote] = useState("");
  const [flagStatus, setFlagStatus] = useState(null); // null | "sending" | "ok" | "err"

  useEffect(() => {
    if (!name) return;
    setLoading(true); setNotFound(false); setCareer(null); setSimilar(null); setRow(null); setMtab("overview");
    api.playerScores(name)
      .then(d => setDetail(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    api.players({ search: name, limit: 5 })
      .then(d => { setRow(pickRow(d.players || [], name)); setPool(d.pool || 0); })
      .catch(() => {});
    api.playerCareer(name).then(d => setCareer(d.seasons || [])).catch(() => setCareer([]));
    // Benzerler: kart tam satır ister (PTS/REB/AST vb.), endpoint yalnızca özet veriyor
    api.similarPlayers(name, 3)
      .then(async r => {
        const list = r.similar || [];
        const rows = await Promise.all(list.map(s =>
          api.players({ search: s.name, limit: 5 }).then(d => pickRow(d.players || [], s.name)).catch(() => null)));
        setSimilar(list.map((s, i) => ({ ...s, row: rows[i] })).filter(s => s.row));
      })
      .catch(() => setSimilar([]));
  }, [name]);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: name, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const arch = detail?.primary_arch || "";
  const tint = ARCHETYPE_COLOR[arch] || "#FFB11B";

  const seasons = useMemo(() => {
    const list = [...(career || [])];
    if (detail && !list.some(s => s.season === CURRENT)) {
      list.push({ season: CURRENT, team: detail.team, primary_arch: detail.primary_arch, overall_score: detail.overall_score });
    }
    return list.sort((a, b) => a.season.localeCompare(b.season));
  }, [career, detail]);

  if (loading) return (
    <div className="pp-page"><div className="pp-skel" aria-busy="true" aria-label="Loading" /></div>
  );

  if (notFound || !detail) return (
    <EmptyState title="Player not found"
      body={`Nobody called "${name}" in the ${CURRENT} season. The name may be spelled differently in the data.`}
      actions={[{ label: "Back to NBA players", primary: true, onClick: () => navigate("/basketball/players") }]} />
  );

  const pts = detail.pts, reb = detail.reb, ast = detail.ast, gp = detail.gp ?? null;
  const overall = detail.overall_score != null ? Math.round(detail.overall_score * 100) : null;
  const topPct = detail.overall_pct != null ? Math.round((1 - detail.overall_pct) * 100) : null;
  const topLabel = topPct == null ? null : topPct < 1 ? "top <1%" : `top ${topPct}%`;

  const seoDesc = `${name} (${arch})${pts != null ? `: ${fmt1(pts)} PTS · ${fmt1(reb)} REB · ${fmt1(ast)} AST` : ""}${overall != null ? ` · Overall: ${overall}` : ""}. Archetype scores, career timeline, and similar players.`;

  const cardPlayer = row ? { ...row, overall_tier: row.overall_tier || "" } : {
    PLAYER_NAME: detail.name || name, TEAM_ABBREVIATION: detail.team, POSITION: detail.pos5,
    primary_arch: arch, overall_score: detail.overall_score, overall_pct: detail.overall_pct,
    PTS: pts, REB: reb, AST: ast, GP: gp,
  };

  const awards = getAwardBadges(detail.name || name).map(({ key, count }) => ({ key, c: AWARD[key].c, l: AWARD[key].l(count) }));
  const bpm = detail.bpm;
  const quick = [
    { v: fmt1(pts), l: "Points" }, { v: fmt1(reb), l: "Rebounds" }, { v: fmt1(ast), l: "Assists" },
    { v: bpm == null ? "—" : `${bpm > 0 ? "+" : ""}${fmt1(bpm)}`, l: "BPM", c: bpm == null ? null : bpm >= 0 ? "#4ade80" : "#f87171" },
    { v: gp ?? "—", l: "Games" },
  ];
  const scores = detail.scores || {};
  const archRows = CORE.filter(a => scores[a] != null).map(a => ({ a, v: Math.round(scores[a] * 100) }));

  const sec = (k) => `pp-sec${mtab === k ? " m-on" : ""}`;

  return (
    <>
      <SEO title={name} description={seoDesc} path={`/basketball/players/${encodeURIComponent(name)}`} />
      <div className="pp-page" style={{ "--tint": tint }}>
        <div className="pp-inner">
          <div className="pp-top">
            <div className="pp-card">
              <PlayerCard player={cardPlayer} expandable />
              {detail.lineup_count != null && <p className="pp-cap">Found in {detail.lineup_count} lineups · {CURRENT}</p>}
            </div>

            <header className="pp-head">
              <span className="eyebrow">{["NBA", detail.team, detail.pos5, detail.age != null ? `Age ${detail.age}` : CURRENT].filter(Boolean).join(" · ")}</span>
              <h1>{detail.name || name}</h1>
              <div className="pp-stats">
                <div className="hot"><span>Rating</span><b>{overall ?? "—"}</b></div>
                <div><span>{detail.rank != null ? "Rank" : "Top"}</span><b>{detail.rank != null ? detail.rank : topPct == null ? "—" : `${Math.max(1, topPct)}%`}</b></div>
                <div><span>Games</span><b>{gp ?? "—"}</b></div>
              </div>
              <div className="pp-actions">
                <Button variant="outline" size={34} onClick={share}>{copied ? "Link copied" : "Share"}</Button>
                {isLoggedIn && arch && (
                  <Button variant="outline" size={34}
                    onClick={() => { setFlagOpen(true); setFlagArch(""); setFlagNote(""); setFlagStatus(null); }}>
                    Suggest a different archetype
                  </Button>
                )}
              </div>
            </header>

            <nav className="pp-tabs" role="tablist" aria-label="Profile sections">
              {TABS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={mtab === k} className={mtab === k ? "on" : ""} onClick={() => setMtab(k)}>{l}</button>
              ))}
            </nav>

            <div className="pp-body">
              <section className={sec("overview")}>
                {arch && (
                  <div className="pp-panel pp-about">
                    <span className="pp-chip" style={{ "--c": tint }}><i />{arch}</span>
                    <div className="pp-about-copy">
                      {detail.role_text
                        ? <p>{detail.role_text}</p>
                        : <p><b>{detail.name || name}</b> reads as a{/^[AEIOU]/i.test(arch) ? "n" : ""} {arch}{overall != null && <> with an overall rating of {overall}{topLabel && <>, {topLabel}{pool ? ` of ${pool} qualified players` : ""}</>} this season</>}.</p>}
                      {(detail.strengths?.length > 0 || detail.weaknesses?.length > 0) && (
                        <div className="pp-evidence">
                          {(detail.strengths || []).map(m => <span key={m.key} className="pp-ev good"><i>{m.label}</i><b>{m.value}</b><em>{m.percentile}th</em></span>)}
                          {(detail.weaknesses || []).map(m => <span key={m.key} className="pp-ev bad"><i>{m.label}</i><b>{m.value}</b><em>{m.percentile}th</em></span>)}
                        </div>
                      )}
                      {detail.confidence && <p className="pp-fine">{detail.confidence === "solid" ? "Played enough games, so the read is solid." : "Early read: few games played so far."}</p>}
                    </div>
                  </div>
                )}
                {awards.length > 0 && (
                  <div className="pp-awards">
                    {awards.map(a => <span key={a.key} style={{ "--c": a.c }}>{a.l}</span>)}
                  </div>
                )}
                <div className="pp-panel pp-quick">
                  {quick.map(q => (
                    <div key={q.l}><b style={q.c ? { color: q.c, textShadow: `0 0 14px ${q.c}55` } : undefined}>{q.v}</b><span>{q.l}</span></div>
                  ))}
                </div>
              </section>

              {detail.recent_seasons?.length > 0 && (
                <section className={`${sec("seasons")} pp-panel`}>
                  <div className="pp-h"><span>Last three seasons</span><em>Per game</em></div>
                  <div className="pp-scroll">
                    <table className="pp-table">
                      <thead><tr><th>Season</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>3PM</th></tr></thead>
                      <tbody>
                        {detail.recent_seasons.map(r => (
                          <tr key={r.season}><td>{r.season}</td><td>{fmt1(r.pts)}</td><td>{fmt1(r.reb)}</td><td>{fmt1(r.ast)}</td><td>{fmt1(r.stl)}</td><td>{fmt1(r.blk)}</td><td>{fmt1(r.fg3m)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className={`${sec("archetype")} pp-panel`}>
                <div className="pp-h"><span>Archetype profile</span><em>Percentile within the season</em></div>
                <div className="pp-bars">
                  {archRows.map(r => {
                    const on = r.a === arch;
                    return (
                      <div key={r.a} className={on ? "on" : ""} style={{ "--c": ARCHETYPE_COLOR[r.a] }}>
                        <span>{r.a}</span>
                        <div className="track"><i style={{ width: `${r.v}%` }} /></div>
                        <b>{r.v}</b>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          <section className={`${sec("seasons")} pp-panel pp-career`}>
            <div className="pp-h"><span>Career trajectory</span><em>Overall by season · primary archetype under each point</em></div>
            {career == null ? <div className="pp-skel sm" /> : <CareerChart seasons={seasons} tint={tint} />}
          </section>

          <section className={`${sec("similar")} pp-panel pp-similar`}>
            <div className="pp-h"><span>Plays like</span><em>Closest by archetype and production</em></div>
            {similar == null ? <div className="pp-skel sm" /> : similar.length === 0 ? (
              <p className="pp-muted">No close match this season.</p>
            ) : (
              <div className="pp-sim-row">
                {similar.map(s => (
                  <Link key={s.name} to={`/basketball/players/${encodeURIComponent(s.name)}`} className="pp-sim">
                    <b>{s.name}</b>
                    {s.row.primary_arch && <span className="pp-chip" style={{ "--c": ARCHETYPE_COLOR[s.row.primary_arch] }}><i />{s.row.primary_arch}</span>}
                    <strong>{(s.similarity * 100).toFixed(0)}%<small>MATCH</small></strong>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Arketip düzeltme önerisi */}
      {flagOpen && (
        <div className="pp-modal" role="dialog" aria-modal="true" aria-label="Suggest a different archetype">
          <div className="pp-modal-scrim" onClick={() => setFlagOpen(false)} />
          <div className="pp-modal-box">
            <div className="pp-modal-head">
              <span>Suggest a different archetype</span>
              <button onClick={() => setFlagOpen(false)} aria-label="Close">×</button>
            </div>
            <p className="pp-muted">Currently <b style={{ color: tint }}>{arch}</b>. An admin reviews every suggestion before anything changes.</p>
            <label className="pp-field">
              <span>Suggested archetype</span>
              <select value={flagArch} onChange={e => setFlagArch(e.target.value)} className="aura-select" style={{ width: "100%" }}>
                <option value="">Choose one</option>
                {CORE.filter(a => a !== arch).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="pp-field">
              <span>Why? (optional)</span>
              <textarea value={flagNote} onChange={e => setFlagNote(e.target.value)} rows={2}
                placeholder="What does the data miss about how they play?" className="aura-ghost-input w-full resize-none" />
            </label>
            {flagStatus === "ok" && <p className="pp-msg ok">Sent. Thanks — an admin will review it.</p>}
            {flagStatus === "err" && <p className="pp-msg err">That didn't send. Check your connection and try again.</p>}
            <div className="pp-modal-actions">
              <Button variant="outline" onClick={() => setFlagOpen(false)}>Cancel</Button>
              <Button variant="primary"
                disabled={!flagArch || flagStatus === "sending" || flagStatus === "ok"}
                onClick={async () => {
                  if (!flagArch) return;
                  setFlagStatus("sending");
                  try {
                    const res = await fetch("/api/corrections", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({
                        player_name: name, season: detail?.season || CURRENT,
                        current_arch: arch, suggested_arch: flagArch, note: flagNote,
                      }),
                    });
                    setFlagStatus(res.ok ? "ok" : "err");
                    if (res.ok) setTimeout(() => setFlagOpen(false), 1500);
                  } catch {
                    setFlagStatus("err");
                  }
                }}>
                {flagStatus === "sending" ? "Sending…" : "Send suggestion"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
