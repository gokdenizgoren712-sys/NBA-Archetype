import { useState } from "react";
import GameStage from "./GameStage";
import PlayoffBracket from "../PlayoffBracketView";
import { computeLeagueAwards } from "../seasonSim";
import { buildConferenceStandings, computeUserPlayoffStatLines } from "../playoffBracket";
import "./result.css";
import "./season.css";

// Sezon sonucu (mockup 3f): "FINAL RECORD · #n SEED" + büyük rekor + playoff'lara geçiş,
// altında puan durumu | playoff ağacı. Quick Sim'de lig kurulmaz: sol panel playoff merdiveni,
// sağ panel sezon ödülleri ve kadro istatistikleri olur. Mantık useSeasonSim'den gelir.
export default function SeasonResult({ sim, players, bench, noSave, onReset, extra = null }) {
  const {
    result, revealGames, revealRounds, stage, dynasty, league, leagueWarning, leagueLoading, bracket, rhTitleWon,
    rhActive, rhSchedule, shownWins, shownLosses, shownRealWins, shownRealLosses, month,
    run, defend, startBracket, updateBracket,
  } = sim;
  const [statView, setStatView] = useState("regular");
  const [confTab, setConfTab] = useState(null);
  if (!result) return null;

  const nGames = result.gameLog.length;
  const halfway = Math.ceil(nGames / 2);
  const done = stage === "done";
  const leagueReady = !!(league && rhSchedule && league.teamsBuilt >= 20);
  const standings = leagueReady ? buildConferenceStandings(league.teamSeasons, rhSchedule.team, result.wins, result.losses) : null;
  // RH'de seed gerçek konferans sıralamasından türer; lig kurulmadıysa hiç seed gösterme.
  const displaySeed = rhActive
    ? (standings ? [...standings.East, ...standings.West].find((e) => e.isUser)?.seed ?? null : null)
    : result.seed;

  // Verdict (Rewrite History): nihai rekor, gerçek takımın gerçek sezonuyla.
  let verdict = null;
  if (done && result.gameSchedule?.length > 0) {
    const realWins = result.gameSchedule.filter((g) => g.realTeamPts > g.realOppPts).length;
    const realLosses = result.gameSchedule.length - realWins;
    const delta = result.wins - realWins;
    verdict = {
      tone: delta > 0 ? "good" : delta < 0 ? "bad" : "even",
      word: delta > 0 ? "You improved history" : delta < 0 ? "History took a hit" : "Exactly as it happened",
      real: `the real ${result.realTeam} went ${realWins}–${realLosses}`,
    };
  }

  const banner = rhActive ? "Regular season complete"
    : dynasty.titles >= 3 ? "Threepeat — dynasty complete"
    : result.champion && dynasty.titles === 2 ? "Back-to-back champions"
    : result.champion ? "Champions" : result.resultLabel;
  const canDefend = done && (rhActive ? rhTitleWon : result.champion) && dynasty.titles < 3;

  // Playoff merdiveni yalnız Quick Sim'de (RH'de playofflar gerçek bracket'ten oynanır).
  const ladder = !rhActive && result.madePlayoffs && (stage === "playoffs" || done)
    ? result.playoffRounds.slice(0, revealRounds) : [];

  const awardsAll = leagueReady ? computeLeagueAwards([
    { abbr: rhSchedule.team, players, bench, statLines: result.statLines, wins: result.wins },
    ...Object.entries(league.teamSeasons).map(([abbr, s]) => ({
      abbr, players: league.rosterByAbbr[abbr]?.starters, bench: league.rosterByAbbr[abbr]?.bench, statLines: s.statLines, wins: s.wins,
    })),
  ]) : [];

  const playoffStatLines = bracket ? computeUserPlayoffStatLines(bracket) : [];
  const showingPlayoffs = statView === "playoffs" && playoffStatLines.length > 0;
  const lines = showingPlayoffs ? playoffStatLines : result.statLines;
  const regByName = Object.fromEntries((result.statLines || []).map((l) => [l.name, l]));
  const tot = (k) => +(lines || []).reduce((a, l) => a + (l[k] || 0), 0).toFixed(1);
  const fg3s = (lines || []).filter((l) => l.fg3 != null);
  const fg3avg = fg3s.length ? Math.round(fg3s.reduce((a, l) => a + l.fg3, 0) / fg3s.length) : null;

  const userConf = standings ? (standings.West.some((t) => t.isUser) ? "West" : "East") : null;
  const activeConf = confTab || userConf;

  const StatsPanel = (
    <section className="sb-panel sb-sr-stats">
      <div className="head">
        <h2 className="sb-card-title">{leagueReady ? "Roster stats" : "Season awards"}</h2>
        {playoffStatLines.length > 0 && (
          <div className="sb-modetabs" role="tablist">
            {[["regular", "Regular season"], ["playoffs", "Playoffs"]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={statView === k} onClick={() => setStatView(k)}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {!leagueReady && (result.awards?.length > 0
        ? <ul className="awards">{result.awards.map((a, i) => <li key={i}>{a}</li>)}</ul>
        : <p className="sb-sr-note">No individual hardware this season.</p>)}
      {lines?.length > 0 && (
        <div className="tbl">
          <div className="row head"><span>Player</span><span>PTS</span><span>REB</span><span>AST</span><span>STL</span><span>BLK</span><span>{showingPlayoffs ? "GP" : "3P%"}</span></div>
          {lines.map((l, i) => {
            const reg = showingPlayoffs ? regByName[l.name] : null;
            const d = reg != null ? +(l.pts - reg.pts).toFixed(1) : null;
            return (
              <div key={i} className={`row${l.bench ? " bench" : ""}`}>
                <span>{l.bench ? "· " : ""}{l.name?.split(" ").slice(-1)[0]}</span>
                <span>{l.pts}{d != null && Math.abs(d) >= 0.5 && <em className={d > 0 ? "up" : "dn"}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</em>}</span>
                <span>{l.reb}</span><span>{l.ast}</span><span>{l.stl ?? "—"}</span><span>{l.blk ?? "—"}</span>
                <span>{showingPlayoffs ? l.games : l.fg3 != null ? `${l.fg3}%` : "—"}</span>
              </div>
            );
          })}
          <div className="row tot"><span>TEAM</span><span>{tot("pts")}</span><span>{tot("reb")}</span><span>{tot("ast")}</span><span>{tot("stl")}</span><span>{tot("blk")}</span><span>{showingPlayoffs ? "" : fg3avg != null ? `${fg3avg}%` : "—"}</span></div>
        </div>
      )}
    </section>
  );

  return (
    <GameStage sport="basketball" className="sb-skin sb-season sb-sr">
      <header className="sb-sr-hero">
        <div className="rec">
          <span className="sb-mono eyebrow">
            {!done || revealGames < nGames ? `REGULAR SEASON · ${String(month || "").toUpperCase()}` : `FINAL RECORD${displaySeed ? ` · #${displaySeed} SEED` : ""}`}
            {dynasty.year > 1 ? ` · YEAR ${dynasty.year}` : ""}
          </span>
          <span className="big">{shownWins}<s>–</s>{shownLosses}</span>
        </div>
        <div className="mid">
          <div className="bar"><i style={{ width: `${(revealGames / nGames) * 100}%` }} /></div>
          {revealGames >= nGames ? (
            <p>
              Best streak <b className="good">W{result.bestStreak}</b> · Worst skid <b className="bad">L{result.worstSkid}</b>
              {verdict && <> · Verdict: <b className={verdict.tone === "good" ? "good" : verdict.tone === "bad" ? "bad" : ""}>{verdict.word}</b>, {verdict.real}</>}
            </p>
          ) : result.gameSchedule?.length > 0 && revealGames > 0 ? (
            <p>Real {result.realTeam} at this point: <b>{shownRealWins}–{shownRealLosses}</b> · You: <b className="me">{shownWins}–{shownLosses}</b></p>
          ) : <p>Simulating the regular season…</p>}
          {done && !rhActive && <p className="banner">{banner}{result.seasonScore != null ? ` · Score ${result.seasonScore}` : ""}</p>}
          {revealGames >= nGames && !result.madePlayoffs && (
            <p className="bad">Missed the playoffs — needed {halfway} wins, finished with {result.wins}.</p>
          )}
        </div>
        <div className="cta">
          {done && leagueReady && !bracket && (
            <button type="button" className="sb-btn solid cta md" disabled={leagueLoading} onClick={startBracket}>Play the playoffs →</button>
          )}
          {canDefend && (
            <button type="button" className="sb-btn solid cta md" disabled={leagueLoading} onClick={defend}>
              {leagueLoading ? "Advancing the league…" : `Defend the title — season ${dynasty.year + 1}`}
            </button>
          )}
        </div>
      </header>

      {done && leagueWarning && <p className="sb-sr-warn">{leagueWarning}</p>}

      <div className="sb-sr-cols">
        {leagueReady ? (
          <section className="sb-panel sb-standings">
            <div className="head">
              <h2 className="sb-card-title">{activeConf === "West" ? "Western" : "Eastern"} Conference</h2>
              <div className="sb-modetabs" role="tablist">
                {[["West", "West"], ["East", "East"]].map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={activeConf === k} onClick={() => setConfTab(k)}>{l}</button>
                ))}
              </div>
            </div>
            {standings[activeConf].map((t) => (
              <div key={t.abbr} className={`r${t.isUser ? " me" : ""}`}>
                <span className="seed">{t.seed}</span><span className="ab">{t.abbr}</span><span className="rc">{t.wins}-{t.losses}</span>
              </div>
            ))}
          </section>
        ) : (
          <section className="sb-panel sb-ladder">
            <h2 className="sb-card-title">Playoffs</h2>
            {ladder.length === 0 && <p className="sb-sr-note">{result.madePlayoffs ? "The playoffs start after the regular season." : "No playoffs this year."}</p>}
            {ladder.map((rd, i) => (
              <div key={i} className="rd">
                <span className="lb">{rd.label}</span><span className="op">vs {Math.round(rd.opp * 100)}-rated</span>
                <b className={rd.won ? "good" : "bad"}>{rd.won ? "W" : "L"} {rd.w}–{rd.l}</b>
              </div>
            ))}
          </section>
        )}

        {leagueReady ? (
          <section className="sb-panel sb-bracketbox">
            {bracket ? <PlayoffBracket bracket={bracket} onUpdate={updateBracket} />
              : <p className="sb-sr-note">The bracket opens when you play the playoffs. All 30 teams are simulated the same way your roster was — every real player scored through the same engine.</p>}
          </section>
        ) : StatsPanel}
      </div>

      {done && leagueReady && (
        <div className="sb-sr-cols">
          {StatsPanel}
          <section className="sb-panel sb-sr-awards">
            <h2 className="sb-card-title">League awards</h2>
            <ul className="awards">{awardsAll.map((a, i) => <li key={i}>{a.icon} {a.label} — {a.name} <em>({a.team})</em></li>)}</ul>
          </section>
        </div>
      )}

      {done && result.gameSchedule?.length > 0 && (
        <section className="sb-panel sb-sr-log">
          <h2 className="sb-card-title">Game log · {result.realTeam} · {result.realSeason}</h2>
          <div className="list">
            {result.gameSchedule.map((g, i) => (
              <div key={i} className="g">
                <span className="n">{g.gameNum}</span><span className="vs">{g.isHome ? "vs" : "@"}</span><span className="op">{g.opponent}</span>
                <span className="sc">{g.realTeamPts}-{g.realOppPts}</span><b className={g.won ? "good" : "bad"}>{g.won ? "W" : "L"}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {done && result.tagNotes?.length > 0 && (
        <section className="sb-panel sb-sr-tags">
          <h2 className="sb-card-title">Active tag effects</h2>
          <ul className="awards">{result.tagNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}

      {done && extra}

      {done && (
        <div className="sb-res-actions">
          <div className="save"><span className="note">{noSave ? "Run it back starts a fresh dynasty — just for fun, nothing is saved." : "Run it back starts a fresh dynasty — only your first counts for the board."}</span></div>
          <button type="button" className="sb-btn" disabled={leagueLoading} onClick={run}>Run it back</button>
          {onReset && <button type="button" className="sb-btn solid" onClick={onReset}>Play again</button>}
        </div>
      )}
    </GameStage>
  );
}
