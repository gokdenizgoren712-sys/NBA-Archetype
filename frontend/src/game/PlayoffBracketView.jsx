// ── Rewrite History: gerçek playoff bracket UI'ı ─────────────────────────────
// playoffBracket.js'in ürettiği bracket state'ini (initBracket/stepBracket)
// render eder — metin/kısaltma tabanlı, mevcut .g-panel/.g-tile diliyle
// (gerçek logo yok, bkz. plan). İki ilerleme modu: Manual (buton) / Auto
// (kendi kendine ilerler, SeasonSimPanel'in animate() deseniyle tutarlı).
import { useEffect, useRef, useState } from "react";
import { stepBracket, seriesMVP } from "./playoffBracket";
import { TrophyIcon, PlayIcon, WheelIcon, DnaIcon } from "./GameIcons";
import ChampionModal from "./ChampionModal";

function TeamBadge({ team, series, side, wide }) {
  const isUser = team.isUser;
  const wins = side === "A" ? series.wA : series.wB;
  const won = series.winner && series.winner.abbr === team.abbr;
  const lost = series.winner && !won;
  return (
    <div className={`flex items-center justify-between gap-1.5 rounded-md ${wide ? "px-3 py-2 text-[13px]" : "px-2 py-1 text-[10.5px]"} ${lost ? "opacity-45" : ""}`}
      style={isUser ? { background: "rgba(255,177,27,.16)", color: "var(--yamabuki)", fontWeight: 700 }
        : { color: won ? "#fff" : "var(--text-secondary,#d1d5db)" }}>
      <span className="flex items-center gap-1.5 min-w-0">
        {team.seed != null && <span className="tabular-nums shrink-0" style={{ color: "var(--text-faint)" }}>{team.seed}</span>}
        <span className="truncate">{team.abbr}</span>
      </span>
      <span className="tabular-nums font-bold shrink-0">{wins}</span>
    </div>
  );
}

function SeriesCard({ series, showMVP, wide }) {
  const mvp = showMVP && series.winner ? seriesMVP(series) : null;
  return (
    <div className={`g-panel subtle ${wide ? "p-3" : "p-1.5"}`} style={wide ? undefined : { minWidth: 108 }}>
      <TeamBadge team={series.teamA} series={series} side="A" wide={wide} />
      <div style={{ height: wide ? 4 : 2 }} />
      <TeamBadge team={series.teamB} series={series} side="B" wide={wide} />
      {mvp && (
        <div className={wide ? "text-[11px] mt-2" : "text-[9px] mt-1 truncate"} style={{ color: "var(--yamabuki)" }} title={`Series MVP — ${mvp.pts} PPG`}>
          ⭐ {mvp.name} ({mvp.abbr})
        </div>
      )}
    </div>
  );
}

function RoundColumn({ label, series, showMVP }) {
  return (
    <div className="flex flex-col gap-2 justify-around flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-widest text-center" style={{ color: "var(--text-faint)" }}>{label}</div>
      {series.map((s, i) => <SeriesCard key={i} series={s} showMVP={showMVP} />)}
    </div>
  );
}

// Finals'a özel: SADECE en son oynanan maçın box score'u (series.lastGameBoxA/B,
// bkz. playoffBracket.js accumulateBoxScores) — her yeni maçta ÜZERİNE YAZILIR,
// aşağı doğru birikmez ("maç maç ilerlerken sadece o anki maçın box'u" isteği).
function GameBoxTable({ label, lines, teamPts, won }) {
  if (!lines?.length) return null;
  const sorted = [...lines].sort((a, b) => (a.bench === b.bench ? 0 : a.bench ? 1 : -1));
  const COLS = "grid-cols-[1fr_2.2rem_2.2rem_2.2rem_2.2rem_2.2rem]";
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9.5px] uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>{label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: won ? "var(--yamabuki)" : "var(--text-muted)" }}>{teamPts}</span>
        <span className={`text-[8.5px] font-bold ${won ? "text-emerald-400" : "text-red-400"}`}>{won ? "W" : "L"}</span>
      </div>
      <div className={`grid ${COLS} gap-x-1 text-[8.5px] text-gray-500 uppercase tracking-wider pb-1`}>
        <span>Player</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span><span className="text-right">STL</span><span className="text-right">BLK</span>
      </div>
      {sorted.map((l, i) => (
        <div key={i} className={`grid ${COLS} gap-x-1 text-[10px] leading-relaxed ${l.bench ? "text-gray-500" : "text-gray-300"}`}>
          <span className="truncate">{l.bench ? "· " : ""}{l.name?.split(" ").slice(-1)[0]}</span>
          <span className="text-right tabular-nums">{l.pts}</span>
          <span className="text-right tabular-nums">{l.reb}</span>
          <span className="text-right tabular-nums">{l.ast}</span>
          <span className="text-right tabular-nums">{l.stl}</span>
          <span className="text-right tabular-nums">{l.blk}</span>
        </div>
      ))}
      <div className={`grid ${COLS} gap-x-1 text-[10px] font-bold text-white mt-1 pt-1 border-t border-white/10`}>
        <span>TEAM</span>
        <span className="text-right tabular-nums">{teamPts}</span>
        <span className="text-right tabular-nums">{lines.reduce((a, l) => a + l.reb, 0)}</span>
        <span className="text-right tabular-nums">{lines.reduce((a, l) => a + l.ast, 0)}</span>
        <span className="text-right tabular-nums">{lines.reduce((a, l) => a + l.stl, 0)}</span>
        <span className="text-right tabular-nums">{lines.reduce((a, l) => a + l.blk, 0)}</span>
      </div>
    </div>
  );
}

function Controls({ mode, setMode, startAuto, advance, champion }) {
  if (champion) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
        {mode ? "Series in progress — every team plays with the same engine that scored your roster." : "Pick how the bracket plays out."}
      </p>
      {!mode && (
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => setMode("manual")}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
            Manual
          </button>
          <button onClick={startAuto}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1"
            style={{ background: "linear-gradient(90deg,#FFD470,#FFB11B)", color: "#000" }}>
            <WheelIcon size={11} /> Auto
          </button>
        </div>
      )}
      {mode === "manual" && (
        <button onClick={advance}
          className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold uppercase tracking-wide inline-flex items-center gap-1.5 shrink-0"
          style={{ background: "linear-gradient(90deg,#FFD470,#FFB11B)", color: "#000" }}>
          <PlayIcon size={12} /> Play Round
        </button>
      )}
    </div>
  );
}

export default function PlayoffBracket({ bracket, onUpdate }) {
  const [mode, setMode] = useState(null);   // null | "manual" | "auto"
  const [showChampionModal, setShowChampionModal] = useState(false);
  const timerRef = useRef(null);
  const announcedRef = useRef(false);   // şampiyon pop-up'ı sadece İLK kez otomatik açılsın

  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    if (bracket.champion && !announcedRef.current) {
      announcedRef.current = true;
      setShowChampionModal(true);
    }
  }, [bracket.champion]);

  const advance = () => {
    const next = stepBracket(bracket);
    onUpdate({ ...next });
  };

  const startAuto = () => setMode("auto");
  // bracket referansı her stepBracket sonrası değiştiği için auto interval'ı
  // en güncel bracket'e karşı çalıştırmak üzere her seferinde yeniden kurulur
  // (tek interval sahibi bu effect — startAuto sadece modu değiştirir).
  useEffect(() => {
    if (mode !== "auto") return;
    clearInterval(timerRef.current);
    if (bracket.champion) return;
    timerRef.current = setInterval(() => {
      const next = stepBracket(bracket);
      onUpdate({ ...next });
    }, 500);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, bracket]);

  // bracket.rounds indeksleri sırasıyla R1/SEMI/CF/F (playoffBracket.js'in
  // ROUND_ORDER sabiti ile aynı sıra — initBracket/advanceIfRoundComplete
  // her zaman bu sırayla push eder).
  const round1 = bracket.rounds[0] || [];
  const semis = bracket.rounds[1] || [];
  const cfs = bracket.rounds[2] || [];
  const finals = bracket.rounds[3] || [];
  const finalsSeries = finals[0] || null;
  const finalsGameNo = finalsSeries ? finalsSeries.wA + finalsSeries.wB : 0;

  const eastCol = (arr) => arr.filter(s => s.conference === "East");
  const westCol = (arr) => arr.filter(s => s.conference === "West");

  const controlsProps = { mode, setMode, startAuto, advance, champion: bracket.champion };

  return (
    <div className="space-y-3">
      {/* Üst kontrol çubuğu — Finals'a inince aşağı-yukarı gitmeden ilerletebilmek
          için AYNI kontroller alt kısımda da tekrarlanıyor (bkz. altta). */}
      <Controls {...controlsProps} />

      <div className="space-y-3">
        <div className="text-[9.5px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Eastern Conference</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <RoundColumn label="First Round" series={eastCol(round1)} />
          <RoundColumn label="Semis" series={eastCol(semis)} />
          <RoundColumn label="Conf. Finals" series={eastCol(cfs)} showMVP />
        </div>
        <div className="text-[9.5px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Western Conference</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <RoundColumn label="First Round" series={westCol(round1)} />
          <RoundColumn label="Semis" series={westCol(semis)} />
          <RoundColumn label="Conf. Finals" series={westCol(cfs)} showMVP />
        </div>

        {finalsSeries && (
          <>
            <div className="text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: "var(--yamabuki)" }}>
              <DnaIcon size={11} /> NBA Finals
            </div>
            <SeriesCard series={finalsSeries} showMVP wide />
            {finalsGameNo > 0 && (() => {
              // Kazanan bilgisi playGame()'den geliyor (series.games[son].aWon),
              // box score toplamından DEĞİL — ikisi bağımsız rastgelelik
              // kaynağı (headToHead.js'deki mevcut teamPts/won ayrımıyla aynı
              // desen). Takım puanı yine de box-line'ların toplamı (gösterim
              // amaçlı, gerçek galibiyeti belirleyen o değil).
              const lastGame = finalsSeries.games[finalsSeries.games.length - 1];
              const ptsA = (finalsSeries.lastGameBoxA || []).reduce((a, l) => a + l.pts, 0);
              const ptsB = (finalsSeries.lastGameBoxB || []).reduce((a, l) => a + l.pts, 0);
              return (
                <div className="g-panel subtle p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
                    Game {finalsGameNo} Box Score
                  </div>
                  <GameBoxTable label={finalsSeries.teamA.abbr} lines={finalsSeries.lastGameBoxA} teamPts={ptsA} won={lastGame?.aWon} />
                  <GameBoxTable label={finalsSeries.teamB.abbr} lines={finalsSeries.lastGameBoxB} teamPts={ptsB} won={lastGame && !lastGame.aWon} />
                </div>
              );
            })()}
          </>
        )}

        {bracket.champion && (
          <button onClick={() => setShowChampionModal(true)}
            className="w-full text-center py-2 rounded-xl border inline-flex items-center justify-center gap-1.5 font-bold"
            style={{ borderColor: "rgba(255,177,27,.4)", background: "rgba(255,177,27,.08)", color: "var(--yamabuki)" }}>
            <TrophyIcon size={16} /> {bracket.champion.abbr} WIN THE TITLE — view champion
          </button>
        )}
      </div>

      {/* Alt kontrol çubuğu — üsttekiyle birebir aynı state'i sürüyor, sadece
          Finals'a inince yukarı çıkmadan ilerletebilmek için burada da var. */}
      <Controls {...controlsProps} />

      <ChampionModal
        champion={showChampionModal ? bracket.champion : null}
        season={bracket.season}
        finalsMVP={finalsSeries ? seriesMVP(finalsSeries) : null}
        onClose={() => setShowChampionModal(false)}
      />
    </div>
  );
}
