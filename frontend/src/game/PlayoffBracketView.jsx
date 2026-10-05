// ── Rewrite History: gerçek playoff bracket UI'ı (mockup 3f) ─────────────────
// playoffBracket.js'in ürettiği bracket state'ini (initBracket/stepBracket) render eder.
// İki ilerleme modu: Manual (buton) / Auto (kendi kendine ilerler). Mantık değişmedi;
// yalnız sunum yeni dile geçti: turlar yan yana sütunlar, kullanıcının takımı vurgulu.
import { useEffect, useRef, useState } from "react";
import { stepBracket, seriesMVP } from "./playoffBracket";
import ChampionModal from "./ChampionModal";

function Team({ team, series, side }) {
  const wins = side === "A" ? series.wA : series.wB;
  const won = series.winner && series.winner.abbr === team.abbr;
  const lost = series.winner && !won;
  return (
    <div className={`t${team.isUser ? " me" : ""}${won ? " won" : ""}${lost ? " lost" : ""}`}>
      <span className="nm">{team.seed != null && <i>{team.seed}</i>}{team.abbr}</span>
      <b>{wins}</b>
    </div>
  );
}

function SeriesCard({ series, showMVP, wide }) {
  const mvp = showMVP && series.winner ? seriesMVP(series) : null;
  return (
    <div className={`sb-br-card${wide ? " wide" : ""}${series.teamA.isUser || series.teamB.isUser ? " mine" : ""}`}>
      <Team team={series.teamA} series={series} side="A" />
      <Team team={series.teamB} series={series} side="B" />
      {mvp && <div className="mvp" title={`Series MVP — ${mvp.pts} PPG`}>★ {mvp.name} ({mvp.abbr})</div>}
    </div>
  );
}

function RoundColumn({ label, series, showMVP }) {
  return (
    <div className="sb-br-col">
      <span className="sb-mono lbl">{label}</span>
      <div className="cards">{series.map((s, i) => <SeriesCard key={i} series={s} showMVP={showMVP} />)}</div>
    </div>
  );
}

// Finals'a özel: SADECE en son oynanan maçın box score'u (series.lastGameBoxA/B) — her yeni maçta ÜZERİNE YAZILIR.
function GameBoxTable({ label, lines, teamPts, won }) {
  if (!lines?.length) return null;
  const sorted = [...lines].sort((a, b) => (a.bench === b.bench ? 0 : a.bench ? 1 : -1));
  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  return (
    <div className="sb-br-box">
      <div className="h"><b>{label}</b><span style={{ color: won ? "var(--sb-accent)" : "var(--sb-muted)" }}>{teamPts}</span><em className={won ? "w" : "l"}>{won ? "W" : "L"}</em></div>
      <div className="g head"><span>Player</span><span>PTS</span><span>REB</span><span>AST</span><span>STL</span><span>BLK</span></div>
      {sorted.map((l, i) => (
        <div key={i} className={`g${l.bench ? " bench" : ""}`}>
          <span>{l.bench ? "· " : ""}{l.name?.split(" ").slice(-1)[0]}</span>
          <span>{l.pts}</span><span>{l.reb}</span><span>{l.ast}</span><span>{l.stl}</span><span>{l.blk}</span>
        </div>
      ))}
      <div className="g tot"><span>TEAM</span><span>{teamPts}</span><span>{sum("reb")}</span><span>{sum("ast")}</span><span>{sum("stl")}</span><span>{sum("blk")}</span></div>
    </div>
  );
}

function Controls({ mode, setMode, startAuto, advance, champion }) {
  if (champion) return null;
  return (
    <div className="sb-br-controls">
      <p>{mode ? "Series in progress — every team plays with the same engine that scored your roster." : "Pick how the bracket plays out."}</p>
      {!mode && (
        <div className="btns">
          <button type="button" className="sb-btn" onClick={() => setMode("manual")}>Manual</button>
          <button type="button" className="sb-btn solid" onClick={startAuto}>Auto</button>
        </div>
      )}
      {mode === "manual" && <button type="button" className="sb-btn solid" onClick={advance}>Play round</button>}
    </div>
  );
}

export default function PlayoffBracket({ bracket, onUpdate }) {
  const [mode, setMode] = useState(null);   // null | "manual" | "auto"
  const [showChampionModal, setShowChampionModal] = useState(false);
  const timerRef = useRef(null);
  const announcedRef = useRef(false);   // şampiyon penceresi sadece İLK kez otomatik açılsın

  useEffect(() => () => clearInterval(timerRef.current), []);
  useEffect(() => {
    if (bracket.champion && !announcedRef.current) { announcedRef.current = true; setShowChampionModal(true); }
  }, [bracket.champion]);

  const advance = () => onUpdate({ ...stepBracket(bracket) });
  const startAuto = () => setMode("auto");
  // bracket referansı her stepBracket sonrası değiştiği için interval her seferinde yeniden kurulur.
  useEffect(() => {
    if (mode !== "auto") return undefined;
    clearInterval(timerRef.current);
    if (bracket.champion) return undefined;
    timerRef.current = setInterval(() => onUpdate({ ...stepBracket(bracket) }), 500);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, bracket]);

  // bracket.rounds sırası R1/SEMI/CF/F (playoffBracket.js ROUND_ORDER).
  const [round1, semis, cfs, finals] = [0, 1, 2, 3].map((i) => bracket.rounds[i] || []);
  const finalsSeries = finals[0] || null;
  const finalsGameNo = finalsSeries ? finalsSeries.wA + finalsSeries.wB : 0;
  const conf = (arr, c) => arr.filter((s) => s.conference === c);
  const controls = { mode, setMode, startAuto, advance, champion: bracket.champion };

  return (
    <div className="sb-br">
      <Controls {...controls} />
      {["West", "East"].map((c) => (
        <div key={c} className="sb-br-conf">
          <h3 className="sb-br-h">{c === "West" ? "Western" : "Eastern"} Conference</h3>
          <div className="sb-br-cols">
            <RoundColumn label="ROUND 1" series={conf(round1, c)} />
            <RoundColumn label="SEMIS" series={conf(semis, c)} />
            <RoundColumn label="CONF. FINALS" series={conf(cfs, c)} showMVP />
          </div>
        </div>
      ))}

      {finalsSeries && (
        <div className="sb-br-conf">
          <h3 className="sb-br-h">NBA Finals</h3>
          <SeriesCard series={finalsSeries} showMVP wide />
          {finalsGameNo > 0 && (() => {
            // Kazanan series.games[son].aWon'dan gelir, box toplamından DEĞİL (iki bağımsız rastgelelik kaynağı).
            const last = finalsSeries.games[finalsSeries.games.length - 1];
            const ptsA = (finalsSeries.lastGameBoxA || []).reduce((a, l) => a + l.pts, 0);
            const ptsB = (finalsSeries.lastGameBoxB || []).reduce((a, l) => a + l.pts, 0);
            return (
              <div className="sb-br-boxes">
                <span className="sb-mono lbl">GAME {finalsGameNo} BOX SCORE</span>
                <GameBoxTable label={finalsSeries.teamA.abbr} lines={finalsSeries.lastGameBoxA} teamPts={ptsA} won={last?.aWon} />
                <GameBoxTable label={finalsSeries.teamB.abbr} lines={finalsSeries.lastGameBoxB} teamPts={ptsB} won={last && !last.aWon} />
              </div>
            );
          })()}
        </div>
      )}

      {bracket.champion && (
        <button type="button" className="sb-btn solid sb-br-champ" onClick={() => setShowChampionModal(true)}>
          {bracket.champion.abbr} win the title — view champion
        </button>
      )}

      <Controls {...controls} />

      <ChampionModal champion={showChampionModal ? bracket.champion : null} season={bracket.season}
        finalsMVP={finalsSeries ? seriesMVP(finalsSeries) : null} onClose={() => setShowChampionModal(false)} />
    </div>
  );
}
