// Sezon simülasyonu paneli — kurulan XI'i gerçek bir ligde 38 maç oynatır.
//
// Basketboldaki SeasonSimPanel'in karşılığı, ama iki yerde ondan ayrılıyor:
//  1) Katsayılar elle seçilmedi — 2245 gerçek ilk-11'den regresyonla çıktı
//     (src/football/calibrate_sim.py). Panel bunu kullanıcıya açıkça yazıyor.
//  2) Tek sezon sonucu TEK BAŞINA gösterilmiyor. Futbolda maç başına
//     açıklanan varyans %14; tek bir 38 maçlık koşu şansa göre birkaç sıra
//     kayar. O yüzden hem bir "bu sezon" tablosu hem 200 koşuluk dağılım var.

import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";
import { simulateSeason, simulateMany } from "./seasonSim";
import { LEAGUE_LABEL } from "./leagues";

const ACC = "#3FB08C";

const FORM_COLOR = { W: ACC, D: "var(--text-faint)", L: "#E8654C" };

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ flex: "1 1 90px", minWidth: 90 }}>
      <div className="g-label" style={{ fontSize: 10, letterSpacing: ".08em",
        textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1,
        color: color || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{sub}</div>}
    </div>
  );
}

export default function SeasonPanel({ starters, chemistry, positionPenalty = 0,
                                      managerBonus = 0, season, squadName }) {
  const [setup, setSetup] = useState(null);
  const [league, setLeague] = useState("premier-league");
  const [replace, setReplace] = useState("");
  const [run, setRun] = useState(null);
  const [dist, setDist] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("table");
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.footballSimSetup({ season })
      .then((d) => { d.available ? setSetup(d) : setErr("Simulation data is not built yet."); })
      .catch(() => setErr("Could not load simulation data."));
  }, [season]);

  // Kalite = XI'in ortalama overall_score'u, pozisyon cezası düşülüp menajer
  // bonusu eklenmiş hâli. Kalibrasyon avg_quality'yi tam bu şekilde (11
  // oyuncunun overall_score ortalaması) tanımlıyor, ölçek birebir uyuyor.
  const quality = (() => {
    if (!starters?.length) return null;
    const mean = starters.reduce((a, p) => a + (p.overall_score || 0), 0) / starters.length;
    return Math.max(0.25, Math.min(0.95, mean - positionPenalty + managerBonus));
  })();

  const clubs = setup?.clubs.filter((c) => c.league === league) || [];
  // Bir kulübün yerine geçersen lig 20 takım (38 maç); 21. kulüp olarak
  // katılırsan tek sayı oluyor, her tur bir takım bay geçiyor -> 40 maç.
  // Her iki durumda da herkesle ikişer maç: 2*(n-1). Tek sayıda takımda
  // fazladan tur açılıyor ama o turlarda bay geçiliyor, maç sayısı değişmiyor.
  const teamCount = clubs.length + (replace ? 0 : 1);
  const matchCount = 2 * (teamCount - 1);

  const go = useCallback(() => {
    if (!setup || quality == null) return;
    setBusy(true); setErr(null);
    // Ağır kısım 200 koşu — bir tick geciktirip butonun "…" hâline geçmesine izin ver
    setTimeout(() => {
      try {
        const you = { name: squadName || "Your XI", quality,
                      chemistry: chemistry ?? 0.65, players: starters };
        const pool = setup.clubs.filter((c) => c.league === league);
        const opts = { seed: (Math.random() * 1e9) | 0, replaceTeam: replace || undefined };
        setRun(simulateSeason(you, pool, setup.coeffs, opts));
        setDist(simulateMany(you, pool, setup.coeffs, 200, opts));
      } catch (e) {
        setErr("Simulation failed.");
      } finally { setBusy(false); }
    }, 30);
  }, [setup, quality, chemistry, league, replace, squadName, starters]);

  if (err) return <div className="g-panel subtle" style={{ padding: 18, fontSize: 13,
    color: "var(--text-faint)" }}>{err}</div>;
  if (!setup) return <div className="g-panel subtle" style={{ padding: 18, fontSize: 13,
    color: "var(--text-faint)" }}>Loading league…</div>;

  const r2 = setup.coeffs?.r2?.goals_for;

  return (
    <div className="g-panel p-4" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
      <span className="aura-blob" style={{ "--slot-color": ACC, left: "25%", top: -48, width: 280, height: 145, opacity: 0.15 }} />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="g-mono" style={{ color: ACC }}>// Season Simulation</span>
        <span className="g-status"
          style={{ "--accent": "#9ca3af", "--accent-a": "rgba(156,163,175,.12)", "--accent-line": "rgba(156,163,175,.35)" }}>
          {matchCount} matches · fitted on {setup.coeffs?.n_matches ?? "—"} real
        </span>
      </div>

      {/* ── Kurulum ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {setup.leagues.map((l) => (
          <button key={l} onClick={() => { setLeague(l); setReplace(""); setRun(null); setDist(null); }}
            className="aura-pill-btn"
            style={league === l ? { borderColor: ACC, color: ACC } : undefined}>
            {LEAGUE_LABEL[l] || l}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: "var(--text-faint)" }}>Take the place of</label>
        <div className="aura-select-wrap">
          <select className="aura-select" value={replace}
            onChange={(e) => { setReplace(e.target.value); setRun(null); setDist(null); }}>
            <option value="">Nobody — join as a 21st club</option>
            {clubs.map((c) => <option key={c.team} value={c.team}>{c.team}</option>)}
          </select>
        </div>
        <button onClick={go} disabled={busy || quality == null}
          className="aura-rating-btn" style={{ borderColor: ACC, color: ACC }}>
          {busy ? "Simulating…" : run ? "Run again" : "Simulate season"}
        </button>
      </div>

      {quality != null && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
          Your squad enters at quality <b style={{ color: ACC }}>{quality.toFixed(3)}</b>
          {" · "}chemistry <b style={{ color: ACC }}>{(chemistry ?? 0).toFixed(3)}</b>
          {" — "}the league runs {clubs.length ? `${Math.min(...clubs.map(c => c.quality)).toFixed(2)}–${Math.max(...clubs.map(c => c.quality)).toFixed(2)}` : "—"}
        </div>
      )}

      {/* ── Dağılım: asıl cevap bu ──────────────────────────────────────── */}
      {dist && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20,
            paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <Stat label="Median finish" value={`${dist.medianPos}${ordinal(dist.medianPos)}`}
              sub={`range ${dist.p10}–${dist.p90}`} color={ACC} />
            <Stat label="Points" value={Math.round(dist.meanPts)} sub="average of 200 seasons" />
            <Stat label="Title" value={`${Math.round(dist.titlePct * 100)}%`} />
            <Stat label="Top 4" value={`${Math.round(dist.top4Pct * 100)}%`} />
            <Stat label="Relegated" value={`${Math.round(dist.relegationPct * 100)}%`}
              color={dist.relegationPct > 0.2 ? "#E8654C" : undefined} />
          </div>

          <PositionBars positions={dist.positions} n={clubs.length + (replace ? 0 : 1)} />

          <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 14, lineHeight: 1.6 }}>
            Football is noisy: the fitted model explains {r2 ? `${Math.round(r2 * 100)}%` : "~14%"} of
            the variance in a single match's goals, so one 38-game run can land several places
            off. The distribution above is the honest answer; the table below is one sample from it.
            Squad quality drives most of the result — chemistry carries the weight the real
            matches gave it, which is roughly a quarter of quality's.
          </p>
        </>
      )}

      {/* ── Tek sezon: tablo + fikstür ──────────────────────────────────── */}
      {run && (
        <>
          <Awards a={run.awards} />

          <div style={{ display: "flex", gap: 8, marginTop: 18, marginBottom: 10 }}>
            {[["table", "Table"], ["squad", "Squad stats"], ["fixtures", "Your results"]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className="aura-pill-btn"
                style={tab === k ? { borderColor: ACC, color: ACC } : undefined}>{label}</button>
            ))}
          </div>
          {tab === "table" ? <Table rows={run.standings} />
            : tab === "squad" ? <SquadStats players={run.players} />
              : <Fixtures matches={run.matches} />}
        </>
      )}
    </div>
  );
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function PositionBars({ positions, n }) {
  const counts = new Array(n + 1).fill(0);
  positions.forEach((p) => { if (p <= n) counts[p]++; });
  const max = Math.max(...counts, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56, marginTop: 14 }}>
      {counts.slice(1).map((c, i) => (
        <div key={i} title={`${i + 1}${ordinal(i + 1)} — ${Math.round(c / positions.length * 100)}%`}
          style={{ flex: 1, height: `${Math.max(2, (c / max) * 100)}%`, borderRadius: "2px 2px 0 0",
            background: c ? ACC : "var(--border)", opacity: c ? 0.25 + 0.75 * (c / max) : 0.4 }} />
      ))}
    </div>
  );
}

function Table({ rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12,
        fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr style={{ color: "var(--text-faint)", fontSize: 10, textTransform: "uppercase",
            letterSpacing: ".07em" }}>
            {["", "Club", "P", "W", "D", "L", "GF", "GA", "GD", "Pts", "Form"].map((h, i) => (
              <th key={i} style={{ textAlign: i < 2 ? "left" : "right", padding: "6px 6px",
                borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.team} style={{
              background: s.isYou ? `${ACC}14` : undefined,
              borderLeft: s.isYou ? `2px solid ${ACC}` : "2px solid transparent" }}>
              <td style={{ padding: "5px 6px", color: "var(--text-faint)" }}>{s.pos}</td>
              <td style={{ padding: "5px 6px", fontWeight: s.isYou ? 700 : 400,
                color: s.isYou ? ACC : "var(--text)", whiteSpace: "nowrap" }}>{s.team}</td>
              {[s.p, s.w, s.d, s.l, s.gf, s.ga].map((v, i) => (
                <td key={i} style={{ textAlign: "right", padding: "5px 6px",
                  color: "var(--text-faint)" }}>{v}</td>
              ))}
              <td style={{ textAlign: "right", padding: "5px 6px",
                color: s.gd > 0 ? ACC : s.gd < 0 ? "#E8654C" : "var(--text-faint)" }}>
                {s.gd > 0 ? "+" : ""}{s.gd}</td>
              <td style={{ textAlign: "right", padding: "5px 6px", fontWeight: 700 }}>{s.pts}</td>
              <td style={{ textAlign: "right", padding: "5px 6px", whiteSpace: "nowrap" }}>
                {s.form.map((f, i) => (
                  <span key={i} style={{ color: FORM_COLOR[f], marginLeft: 2 }}>{f}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Ödüller kadronun İÇİNDEN — rakip kulüplerin oyuncu listesi elimizde yok,
// o yüzden "league top scorer" değil "your top scorer" deniyor.
function Awards({ a }) {
  if (!a) return null;
  const cards = [
    a.topScorer && ["Your top scorer", a.topScorer.name, `${a.topScorer.goals} goals`],
    a.topAssists && ["Most assists", a.topAssists.name, `${a.topAssists.assists} assists`],
    a.keeper && ["Clean sheets", a.keeper.name, `${a.keeper.cs} clean sheets`],
  ].filter(Boolean);
  if (!cards.length) return null;
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 16,
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      {cards.map(([label, name, sub]) => (
        <div key={label} className="g-tile" style={{ padding: "10px 12px",
          "--accent": ACC, "--accent-a": `${ACC}1a`, "--accent-line": `${ACC}44`, cursor: "default" }}>
          <span className="aura-blob" style={{ "--slot-color": ACC, right: -18, top: -20, width: 100, height: 62, opacity: 0.18 }} />
          <div className="g-label">{label}</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginTop: 2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          <div style={{ fontSize: 11, color: ACC }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

const PHASE_COLOR = { gk: "#F2C14E", def: "#4C9BE8", mid: "#3FB08C", fwd: "#E8654C" };

function SquadStats({ players }) {
  if (!players?.length) return <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
    No player data for this squad.</div>;
  const max = Math.max(1, ...players.map((p) => p.goals + p.assists));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {players.map((p) => (
        <div key={p.name} className="g-rr" style={{ fontSize: 12,
          "--accent": PHASE_COLOR[p.phase], "--accent-a": PHASE_COLOR[p.phase] + "1f",
          "--accent-line": PHASE_COLOR[p.phase] + "4d" }}>
          <span className="g-rr-pos">{p.pos}</span>
          <span style={{ flex: "1 1 120px", whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis" }}>{p.name}</span>
          <span style={{ flex: "1 1 60px", color: "var(--text-faint)", fontSize: 10.5,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.arch}</span>
          <div className="g-bar-track shrink-0" style={{ width: 70, height: 7 }}>
            <div className="g-bar-fill" style={{ width: `${((p.goals + p.assists) / max) * 100}%`,
              "--fill": PHASE_COLOR[p.phase], "--fill-a": PHASE_COLOR[p.phase] + "66" }} />
          </div>
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 62,
            textAlign: "right", color: "var(--text-muted)" }}>
            <b style={{ color: "#fff" }}>{p.goals}</b>G <b style={{ color: "#fff" }}>{p.assists}</b>A
          </span>
        </div>
      ))}
    </div>
  );
}

function Fixtures({ matches }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
      gap: 6 }}>
      {matches.map((m) => (
        <div key={m.round} style={{ display: "flex", alignItems: "center", gap: 8,
          padding: "6px 9px", borderRadius: 8, fontSize: 12,
          background: "rgba(255,255,255,.025)", border: "1px solid var(--border)" }}>
          <span style={{ color: "var(--text-faint)", fontSize: 10, width: 30 }}>
            {m.home ? "HOME" : "AWAY"}</span>
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis" }}>{m.opponent}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600,
            color: FORM_COLOR[m.result] }}>{m.gf}–{m.ga}</span>
        </div>
      ))}
    </div>
  );
}
