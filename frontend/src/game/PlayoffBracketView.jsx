// ── Rewrite History: gerçek playoff bracket UI'ı ─────────────────────────────
// playoffBracket.js'in ürettiği bracket state'ini (initBracket/stepBracket)
// render eder — metin/kısaltma tabanlı, mevcut .g-panel/.g-tile diliyle
// (gerçek logo yok, bkz. plan). İki ilerleme modu: Manual (buton) / Auto
// (kendi kendine ilerler, SeasonSimPanel'in animate() deseniyle tutarlı).
import { useEffect, useRef, useState } from "react";
import { stepBracket, seriesMVP } from "./playoffBracket";
import { TrophyIcon, PlayIcon, WheelIcon, DnaIcon } from "./GameIcons";
import ChampionModal from "./ChampionModal";

function TeamBadge({ team, series, side }) {
  const isUser = team.isUser;
  const wins = side === "A" ? series.wA : series.wB;
  const won = series.winner && series.winner.abbr === team.abbr;
  const lost = series.winner && !won;
  return (
    <div className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-md text-[10.5px] ${lost ? "opacity-45" : ""}`}
      style={isUser ? { background: "rgba(255,177,27,.16)", color: "var(--yamabuki)", fontWeight: 700 }
        : { color: won ? "#fff" : "var(--text-secondary,#d1d5db)" }}>
      <span className="flex items-center gap-1 min-w-0">
        {team.seed != null && <span className="tabular-nums shrink-0" style={{ color: "var(--text-faint)" }}>{team.seed}</span>}
        <span className="truncate">{team.abbr}</span>
      </span>
      <span className="tabular-nums font-bold shrink-0">{wins}</span>
    </div>
  );
}

function SeriesCard({ series, showMVP }) {
  const mvp = showMVP && series.winner ? seriesMVP(series) : null;
  return (
    <div className="g-panel subtle p-1.5" style={{ minWidth: 108 }}>
      <TeamBadge team={series.teamA} series={series} side="A" />
      <div style={{ height: 2 }} />
      <TeamBadge team={series.teamB} series={series} side="B" />
      {mvp && (
        <div className="text-[9px] mt-1 truncate" style={{ color: "var(--yamabuki)" }} title={`Series MVP — ${mvp.pts} PPG`}>
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

  const eastCol = (arr) => arr.filter(s => s.conference === "East");
  const westCol = (arr) => arr.filter(s => s.conference === "West");

  return (
    <div className="space-y-3">
      {!bracket.champion && (
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
      )}

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
        {finals.length > 0 && (
          <>
            <div className="text-[9.5px] uppercase tracking-widest flex items-center gap-1" style={{ color: "var(--yamabuki)" }}>
              <DnaIcon size={10} /> NBA Finals
            </div>
            <div className="flex gap-2">
              <SeriesCard series={finals[0]} showMVP />
            </div>
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

      <ChampionModal
        champion={showChampionModal ? bracket.champion : null}
        season={bracket.season}
        finalsMVP={finals[0] ? seriesMVP(finals[0]) : null}
        onClose={() => setShowChampionModal(false)}
      />
    </div>
  );
}
