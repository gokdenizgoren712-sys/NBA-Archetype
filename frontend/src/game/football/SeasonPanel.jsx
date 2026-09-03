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
import { simulateSeason, simulateMany, simulateRealSeason, simulateRealMany,
         simulateRealLeague } from "./seasonSim";
import { LEAGUE_LABEL } from "./leagues";
import { ModeInfoButton } from "./ModeAbout";
import { ACCENT as ACC, PHASE_COLOR } from "./theme";

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
  // quick    — Berger fikstürü, lig kulüplerine karşı (sentetik takvim)
  // rewrite  — gerçek bir kulübün GERÇEK takvimi, gerçekte olanla karşılaştırmalı
  const [mode, setMode] = useState("quick");
  const [rhTeam, setRhTeam] = useState("");
  const [rhData, setRhData] = useState(null);   // {fixtures, real, ...}
  const [rh, setRh] = useState(null);           // simülasyon sonucu
  const [rhDist, setRhDist] = useState(null);
  const [rhLeague, setRhLeague] = useState(null);  // tüm ligin fikstürleri
  const [rhTable, setRhTable] = useState(null);    // alternatif tablo

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

  // Rewrite History: seçilen kulübün gerçek takvimi + gerçek sonucu
  // Tüm ligin gerçek fikstürleri — bir kez, lig başına (~60 KB). Hem seçilen
  // kulübün maçları hem alternatif tabloyu kurmak için gereken her şey burada.
  useEffect(() => {
    if (mode !== "rewrite") { setRhLeague(null); return; }
    setRhLeague(null);
    api.footballRealSeason({ season, league, full: 1 })
      .then((d) => setRhLeague(d.available ? d.clubs : null))
      .catch(() => setRhLeague(null));
  }, [mode, league, season]);

  useEffect(() => {
    setRh(null); setRhDist(null); setRhTable(null);
    if (mode !== "rewrite" || !rhTeam || !rhLeague) { setRhData(null); return; }
    setRhData(rhLeague.find((c) => c.team === rhTeam) || null);
  }, [mode, rhTeam, rhLeague]);
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
        const opts = { seed: (Math.random() * 1e9) | 0, replaceTeam: replace || undefined };
        if (mode === "rewrite") {
          if (!rhData?.fixtures?.length) { setErr("Pick a club to replace first."); return; }
          // theirs: aynı motoru kulübün KENDİ kadrosuyla da çalıştır — model
          // regresif olduğu için gerçek puanla kıyas tek başına yanıltıcı.
          const o = { ...opts, theirs: { quality: rhData.quality,
                                         chemistry: rhData.chemistry } };
          setRh(simulateRealSeason(you, rhData.fixtures, setup.coeffs, o));
          setRhDist(simulateRealMany(you, rhData.fixtures, setup.coeffs, 200, o));
          // Ligin tamamı da kendi gerçek takvimini oynasın — yoksa "onları
          // geçtim" diyebiliyoruz ama "kaçıncı bitirdim" diyemiyoruz.
          if (rhLeague) {
            setRhTable(simulateRealLeague(rhLeague, you, rhTeam, setup.coeffs, opts));
          }
          setRun(null); setDist(null);
        } else {
          const pool = setup.clubs.filter((c) => c.league === league);
          setRun(simulateSeason(you, pool, setup.coeffs, opts));
          setDist(simulateMany(you, pool, setup.coeffs, 200, opts));
          setRh(null); setRhDist(null);
        }
      } catch (e) {
        setErr("Simulation failed.");
      } finally { setBusy(false); }
    }, 30);
  }, [setup, quality, chemistry, league, replace, squadName, starters, mode,
      rhData, rhLeague, rhTeam]);

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

      {/* ── Mod ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {[["quick", "Quick Sim", "A full league season against the real clubs, on a generated fixture list."],
          ["rewrite", "Rewrite History", "Take a real club's actual fixtures and see if your eleven does better than they did."]]
          .map(([k, label, tip]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <button title={tip}
              onClick={() => { setMode(k); setRun(null); setDist(null); setRh(null); setRhDist(null); setErr(null); }}
              className="aura-pill-btn"
              style={mode === k ? { borderColor: ACC, color: ACC } : undefined}>{label}</button>
            <ModeInfoButton mode={k} />
          </span>
        ))}
      </div>

      {/* ── Kurulum ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {setup.leagues.map((l) => (
          <button key={l} onClick={() => { setLeague(l); setReplace(""); setRun(null); setDist(null); }}
            className="aura-pill-btn"
            style={league === l ? { borderColor: ACC, color: ACC } : undefined}>
            {LEAGUE_LABEL[l] || l}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {mode === "rewrite" ? "Replace" : "Take the place of"}
        </label>
        <div className="aura-select-wrap">
          {mode === "rewrite" ? (
            <select className="aura-select" value={rhTeam}
              onChange={(e) => setRhTeam(e.target.value)}>
              <option value="">Pick a club…</option>
              {clubs.map((c) => <option key={c.team} value={c.team}>{c.team}</option>)}
            </select>
          ) : (
            <select className="aura-select" value={replace}
              onChange={(e) => { setReplace(e.target.value); setRun(null); setDist(null); }}>
              <option value="">Nobody — join as a 21st club</option>
              {clubs.map((c) => <option key={c.team} value={c.team}>{c.team}</option>)}
            </select>
          )}
        </div>
        <button onClick={go}
          disabled={busy || quality == null || (mode === "rewrite" && !rhData)}
          className="aura-rating-btn" style={{ borderColor: ACC, color: ACC }}>
          {busy ? "Simulating…" : (run || rh) ? "Run again" : "Simulate season"}
        </button>
        {mode === "rewrite" && rhTeam && !rhData && (
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>loading fixtures…</span>
        )}
      </div>

      {mode === "rewrite" && rhData && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
          {rhData.team} played <b style={{ color: "var(--text-primary)" }}>{rhData.matches}</b> matches we
          have lineups for, finishing <b style={{ color: "var(--text-primary)" }}>
          {rhData.real.w}-{rhData.real.d}-{rhData.real.l}</b> on{" "}
          <b style={{ color: "var(--text-primary)" }}>{rhData.real.pts}</b> points
          ({rhData.real.gf}:{rhData.real.ga}). Your eleven plays the same fixtures.
        </div>
      )}

      {quality != null && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
          Your squad enters at quality <b style={{ color: ACC }}>{quality.toFixed(3)}</b>
          {" · "}chemistry <b style={{ color: ACC }}>{(chemistry ?? 0).toFixed(3)}</b>
          {" — "}the league runs {clubs.length ? `${Math.min(...clubs.map(c => c.quality)).toFixed(2)}–${Math.max(...clubs.map(c => c.quality)).toFixed(2)}` : "—"}
        </div>
      )}

      {/* ── Dağılım: asıl cevap bu ──────────────────────────────────────── */}
      {/* ── REWRITE HISTORY sonucu ─────────────────────────────────────── */}
      {rh && rhDist && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20,
            paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <Stat label="Your points" value={rh.you.pts}
              sub={`${rh.you.w}-${rh.you.d}-${rh.you.l} · ${rh.you.gf}:${rh.you.ga}`}
              color={ACC} />
            <Stat label={`${rhData?.team || "They"} actually`} value={rh.real.pts}
              sub={`${rh.real.w}-${rh.real.d}-${rh.real.l} · ${rh.real.gf}:${rh.real.ga}`} />
            {rh.model && (
              <Stat label="Their squad, same model" value={rh.model.pts}
                sub={`${rh.model.w}-${rh.model.d}-${rh.model.l}`} />
            )}
            <Stat label="Beat their real return"
              value={`${Math.round(rhDist.beatPct * 100)}%`}
              sub="of 200 runs" color={rhDist.beatPct >= 0.5 ? ACC : "#E8654C"} />
            {rhDist.beatModelPct != null && (
              <Stat label="Beat their squad, same model"
                value={`${Math.round(rhDist.beatModelPct * 100)}%`}
                sub="the fair comparison"
                color={rhDist.beatModelPct >= 0.5 ? ACC : "#E8654C"} />
            )}
            <Stat label="Points range" value={`${rhDist.p10}–${rhDist.p90}`}
              sub={`median ${rhDist.median}`} />
          </div>

          <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 14, lineHeight: 1.6 }}>
            Same opponents, same home and away, same season — only the eleven is different.
            Two comparisons are shown because they answer different questions. Beating
            their <i>real</i> return is the romantic one, but it is not quite fair: the
            model explains 14% of a match and so pulls every prediction toward the middle,
            which measured out at about 5 points short for the strongest clubs and 6 points
            generous for the weakest. Running <i>their</i> squad through the same model
            removes that, and is the number to judge yourself on. Only matches where both
            starting elevens were recorded are replayed, so the fixture list can be a
            little shorter than the real season.
          </p>

          <Awards a={rh.awards} />

          <div style={{ display: "flex", gap: 8, marginTop: 18, marginBottom: 10 }}>
            {[["table", "Where you finish"], ["fixtures", "Match by match"],
              ["squad", "Squad stats"]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className="aura-pill-btn"
                style={tab === k ? { borderColor: ACC, color: ACC } : undefined}>{label}</button>
            ))}
          </div>
          {tab === "squad" ? <SquadStats players={rh.players} />
            : tab === "table" ? (rhTable
                ? <RealTable rows={rhTable.standings} />
                : <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
                    League fixtures not loaded.</div>)
            : <RewriteFixtures matches={rh.matches} />}
        </>
      )}

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
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", marginTop: 2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          <div style={{ fontSize: 11, color: ACC }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

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
            <b style={{ color: "var(--text-primary)" }}>{p.goals}</b>G <b style={{ color: "var(--text-primary)" }}>{p.assists}</b>A
          </span>
        </div>
      ))}
    </div>
  );
}

// Gerçek sonuçla yan yana: hangi maçta onlardan iyi, hangisinde kötü oynadın.
// Alternatif tablo. Kulüplerin maç sayısı EŞİT DEĞİL — her maçın iki ilk-11'i
// kayıtlı olmadığı için kimi 32, kimi 37 maç oynuyor. Ham puana göre sıralamak
// haksız olurdu, o yüzden sıralama ve gösterim maç başına puan üzerinden.
function RealTable({ rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12,
        fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr style={{ color: "var(--text-faint)", fontSize: 10, textTransform: "uppercase",
            letterSpacing: ".07em" }}>
            {["", "Club", "P", "W", "D", "L", "GD", "Pts", "Per game", "Really got"]
              .map((h, i) => (
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
              {[s.p, s.w, s.d, s.l].map((v, i) => (
                <td key={i} style={{ textAlign: "right", padding: "5px 6px",
                  color: "var(--text-faint)" }}>{v}</td>
              ))}
              <td style={{ textAlign: "right", padding: "5px 6px",
                color: s.gd > 0 ? ACC : s.gd < 0 ? "#E8654C" : "var(--text-faint)" }}>
                {s.gd > 0 ? "+" : ""}{s.gd}</td>
              <td style={{ textAlign: "right", padding: "5px 6px", fontWeight: 700 }}>{s.pts}</td>
              <td style={{ textAlign: "right", padding: "5px 6px", color: ACC }}>
                {s.ppg.toFixed(2)}</td>
              <td style={{ textAlign: "right", padding: "5px 6px",
                color: "var(--text-faint)" }}>{s.realPts ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.6 }}>
        Clubs play different numbers of matches here, because only games where both
        starting elevens were recorded can be replayed. Ranking is by points per game
        for that reason. The last column is what each club really finished on.
      </p>
    </div>
  );
}

function RewriteFixtures({ matches }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
      gap: 6 }}>
      {matches.map((m) => (
        <div key={m.round} style={{ display: "flex", alignItems: "center", gap: 8,
          padding: "6px 9px", borderRadius: 8, fontSize: 12,
          background: m.beat ? `${ACC}12` : "rgba(255,255,255,.022)",
          border: `1px solid ${m.beat ? ACC + "33" : "var(--border)"}` }}>
          <span style={{ color: "var(--text-faint)", fontSize: 10, width: 30 }}>
            {m.home ? "HOME" : "AWAY"}</span>
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis" }}>{m.opponent}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600,
            color: FORM_COLOR[m.result] }}>{m.gf}–{m.ga}</span>
          <span title="what actually happened"
            style={{ fontVariantNumeric: "tabular-nums", fontSize: 10.5,
              color: "var(--text-faint)" }}>({m.realGf}–{m.realGa})</span>
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
