import GameStage from "./GameStage";
import "./result.css";
import "./result-basketball.css";
import PillarBars from "./PillarBars";
import { computePlayerFit } from "../lineupScore";
import { POSITIONS, BENCH_SLOTS } from "../positions";
import { BASE_MINUTES, MINUTE_FLEX } from "../seasonSim";
import { ARCHETYPE_COLOR } from "../../constants/archetypeColors";

// Sonuç sayfası (mockup 3e / mobil 12g): Lineup Fit + Five Pillars | rotasyon, altta kaydet · paylaş · simüle et.
// Sezon motoru (sim) ScoreReveal'da kuruluyor; burada yalnız idle ekranı çiziliyor.
const GRADE_TONE = { S: "var(--sb-special)", A: "var(--sb-good)", B: "var(--sb-pos-pg)", C: "var(--sb-warn)", D: "var(--sb-bad-2)" };
const partTone = (v) => (v >= 75 ? "var(--sb-good)" : v >= 55 ? "var(--sb-warn)" : "var(--sb-warn-2)");
const posOf = (i) => (i < 5 ? POSITIONS[i] : i === 5 ? "6TH" : `B${i - 4}`);

export default function ResultStage({
  fit, simEra, grade, pct, refLine, chemBonus, primaryCount, lineup, sim, enableRealHistory,
  saveUI, onShare, onReset, loggedIn,
}) {
  const g = GRADE_TONE[grade] || "var(--sb-muted)";
  const parts = [
    ["Quality", Math.round((fit.avgQuality || 0) * 100), "45%"],
    ["Coverage", Math.round((fit.coverage || 0) * 100), "40%"],
    ["Chemistry", Math.round((fit.roleFit || 0) * 100), "15%"],
  ];
  const roster = [...POSITIONS, ...BENCH_SLOTS].map((k) => lineup[k]).filter(Boolean);
  const { minutes, minuteBank, simMode, rhStep, rhSeasons, rhSchedule, rhLoading, rhError, visibleRhTeams, leagueLoading } = sim;
  const history = simMode === "history";
  const picking = history && rhStep !== "ready";

  return (
    <GameStage sport="basketball" className="sb-result sb-skin">
      <div className="sb-res-cols">
        <div className="sb-res-left">
          <section className="sb-panel sb-fit" style={{ "--g": g }}>
            <span className="sb-mono eyebrow" style={{ color: g }}>
              LINEUP FIT{simEra ? ` · BUILT FOR THE ${simEra.label.toUpperCase()}` : ""}
            </span>
            <span className="grade" style={{ color: g }}>{grade}</span>
            <div className="score"><b>{pct}</b><i>/ 100</i></div>
            {refLine && <span className="ref">{refLine}</span>}
            {chemBonus > 0 && <span className="chem">★ Chemistry bonus · {primaryCount} primary slot{primaryCount === 1 ? "" : "s"} (+{Math.round(chemBonus * 100)})</span>}
            <div className="parts">
              {parts.map(([l, v, w]) => (
                <div key={l}><b style={{ color: partTone(v) }}>{v}</b><span>{l}</span><i>weight {w}</i></div>
              ))}
            </div>
          </section>
          <PillarBars fit={fit} simEra={simEra} />
        </div>

        <section className="sb-panel sb-roster-edit">
          <div className="head">
            <h2 className="sb-card-title">Your roster</h2>
            <span className="sb-mono bank" style={{ color: minuteBank > 0 ? "var(--sb-good)" : "var(--sb-muted)" }}>
              {minuteBank > 0 ? `${minuteBank} MIN IN THE BANK` : "240 / 240 MIN"}
            </span>
          </div>

          {enableRealHistory && (
            <div className="sb-modetabs" role="tablist" aria-label="Simulation mode">
              {[["quick", "Quick Sim"], ["history", "Rewrite History"]].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={simMode === k} disabled={leagueLoading}
                  onClick={() => sim.setSimMode(k)}>{l}</button>
              ))}
            </div>
          )}

          {picking ? (
            <div className="sb-rhpick">
              <p>Step into a real {simEra?.label}. Pick the year, then the team your draft replaces — you play their exact schedule, real opponents and all.</p>
              {rhError && <p className="err">{rhError}</p>}
              {rhStep === "season" && (
                <div className="grid">
                  {rhSeasons.map((s) => <button key={s} type="button" disabled={rhLoading || leagueLoading} onClick={() => sim.pickRhSeason(s)}>{s}</button>)}
                  {rhSeasons.length === 0 && <p>No completed real seasons in this era yet.</p>}
                </div>
              )}
              {rhStep === "team" && (
                <>
                  <button type="button" className="back" disabled={leagueLoading} onClick={sim.backToSeasons}>← Back to seasons</button>
                  <div className="grid teams">
                    {visibleRhTeams.map((t) => (
                      <button key={t.abbr} type="button" disabled={rhLoading || leagueLoading} onClick={() => sim.pickRhTeam(t.abbr)}>
                        <b>{t.abbr}</b><span>{t.wins}-{t.losses}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {rhLoading && <p>Loading…</p>}
            </div>
          ) : (
            <>
              {history && rhSchedule && (
                <div className="sb-standin">
                  <span>Standing in for <b>{rhSchedule.season} {rhSchedule.team}</b> ({rhSchedule.wins}-{rhSchedule.losses})</span>
                  <button type="button" onClick={sim.changeTeam} disabled={leagueLoading}>Change</button>
                </div>
              )}
              <div className="sb-rot">
                {roster.map((p, i) => {
                  const f = computePlayerFit(p, simEra);
                  const q = Math.round((f.quality || 0) * 100);
                  const m = minutes[i] ?? 0, base = BASE_MINUTES[i] ?? 13;
                  const hex = q >= 65 ? "var(--sb-warn)" : "var(--sb-bad)";
                  return (
                    <div key={p.PLAYER_NAME} className="r">
                      <span className={`pos${i < 5 ? " st" : ""}`}>{posOf(i)}</span>
                      <span className="who">
                        <b>{p.PLAYER_NAME}</b>
                        <em style={{ color: ARCHETYPE_COLOR[p.primary_arch] || "var(--sb-text-3)" }}>{p.primary_arch}</em>
                      </span>
                      <span className="bar"><i style={{ width: `${q}%`, background: hex }} /></span>
                      <span className="q" style={{ color: hex }}>{q}</span>
                      <span className="step">
                        <button type="button" aria-label={`Fewer minutes for ${p.PLAYER_NAME}`} onClick={() => sim.bumpMinute(i, -1)}
                          disabled={m <= Math.max(6, base - MINUTE_FLEX)}>−</button>
                        <b>{m}</b>
                        <button type="button" aria-label={`More minutes for ${p.PLAYER_NAME}`} onClick={() => sim.bumpMinute(i, 1)}
                          disabled={m >= base + MINUTE_FLEX || minuteBank <= 0}>+</button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="sb-rot-note">Minutes drive production, 37+ brings fatigue, resting starters banks playoff freshness.</p>
            </>
          )}
        </section>
      </div>

      <div className="sb-res-actions">
        <div className="save">{loggedIn ? saveUI : <span className="note">Sign in to save rosters and land on the board.</span>}</div>
        <button type="button" className="sb-btn" onClick={onShare}>Share card</button>
        <button type="button" className="sb-btn" onClick={onReset}>Play again</button>
        <button type="button" className="sb-btn solid cta md" onClick={sim.run}
          disabled={picking || (history && !rhSchedule) || leagueLoading}>
          {leagueLoading ? "Building the league…" : history && rhSchedule ? `▶ Simulate the ${rhSchedule.team}'s season` : "▶ Simulate season"}
        </button>
      </div>
    </GameStage>
  );
}
