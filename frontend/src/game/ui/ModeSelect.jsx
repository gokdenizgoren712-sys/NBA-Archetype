import { useNavigate } from "react-router-dom";
import GameStage from "./GameStage";
import { sportTheme } from "./sportTheme";

// Mod seçimi (mockup 3g / 4g). Metin mockup'tan: final, değiştirilmez.
const ROUTES = [
  "M14 50 C60 50 70 14 110 20 S160 40 184 16",
  "M14 50 C50 20 90 60 120 30 S170 20 184 16",
  "M14 50 L70 50 L100 18 L184 16",
  "M14 50 C40 10 80 10 100 34 S150 58 184 16",
];
const COPY = [
  { num: "01", title: "Spin & Build",    desc: "Build solo and chase the leaderboard.",                    tag: "1 player" },
  { num: "02", title: "Same Screen",     desc: "Two players, one device, take turns.",                     tag: "2 players · 1 device" },
  { num: "03", title: "With a Friend",   desc: "Share a 6-character code. Build privately, then face off.", tag: "2 players · online", live: true },
  { num: "04", title: "Online Opponent", desc: "Jump into an open room and get matched.",                  tag: "2 players · online", live: true },
];

// modes: [{ key, path }] — sırayla Spin & Build, Same Screen, With a Friend, Online.
export default function ModeSelect({ sport, modes, onRules }) {
  const navigate = useNavigate();
  const t = sportTheme(sport);
  return (
    <GameStage sport={sport}>
      <header className="sb-modes-head">
        <div>
          <p className="sb-mono sb-eyebrow">SPIN &amp; BUILD · 4 MODES</p>
          <h1 className="sb-h1 lg">Choose your play <span className="sb-accent">/ {t.name}</span></h1>
        </div>
        <p className="sb-modes-sub">Spin a team and season. Pick one player. Fill your lineup.</p>
      </header>
      <div className="sb-modes-grid">
        {modes.map((m, i) => {
          const c = COPY[i];
          const go = () => navigate(m.path);
          return (
            <article key={m.key} className={`sb-mode${i === 0 ? " primary" : ""}`}
              role="link" tabIndex={0} aria-label={`${c.title} — ${c.tag}`}
              onClick={go} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go()}>
              <div className="sb-mode-main">
                <div className="sb-mode-meta">
                  <span>PLAY {c.num}</span><span className="tag">{c.tag}</span>
                  {c.live && <span className="live">● LIVE</span>}
                </div>
                <h2 className="sb-mode-title">{c.title}</h2>
                <p className="sb-mode-desc">{c.desc}</p>
              </div>
              <svg className="sb-mode-route" viewBox="0 0 200 64" aria-hidden="true">
                <path d={ROUTES[i]} fill="none" stroke="var(--sb-accent)" strokeWidth="2" strokeDasharray="5 4" />
                <circle cx="14" cy="50" r="5" fill="none" stroke="#fff" strokeWidth="2" />
                <path d="M180 12l10 10m0-10l-10 10" stroke="var(--sb-accent)" strokeWidth="2" />
              </svg>
              <div className="sb-mode-foot">
                <button type="button" className="sb-mode-rules"
                  onClick={(e) => { e.stopPropagation(); onRules?.(m); }}>Rules</button>
                <span className="sb-btn" aria-hidden="true">Play →</span>
              </div>
            </article>
          );
        })}
      </div>
    </GameStage>
  );
}
