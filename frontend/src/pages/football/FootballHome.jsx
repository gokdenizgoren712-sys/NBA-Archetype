import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { FootballIcon } from "../../components/BrandIcons";
import { TagIcon } from "../../game/GameIcons";
import FootballFeedbackModal from "./FootballFeedbackModal";
import "../../game/game.css";

// ── Futbol tarafı — geliştirme aşaması ───────────────────────────────────────
// Boş bir "coming soon" yerine ne kurulduğunu gösteriyor: 4 faz, 26 çekirdek
// arketip, 5 lig. Basketbol tarafından tamamen bağımsız — ortak olan sadece
// persantil yöntemi (bkz. futbol/fantezi yol haritası).
const PHASES = [
  { key: "gk",  label: "Goalkeeper", n: 4, roles: "Shot Stopper · Sweeper Keeper · Distributor · Command of Area" },
  { key: "def", label: "Defence",    n: 7, roles: "Ball-Playing CB · Stopper · Front-Foot Defender · Overlapping FB · Inverted FB · Wing-Back · Defensive FB" },
  { key: "mid", label: "Midfield",   n: 7, roles: "Anchor · Ball-Winner · Regista · Metronome · Box-to-Box · Mezzala · Late Runner" },
  { key: "fwd", label: "Attack",     n: 8, roles: "Poacher · Target Man · Complete Forward · Pressing Forward · Inside Forward · Touchline Winger · Take-On Merchant · Creator" },
];

const LEAGUES = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1"];

export default function FootballHome() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className="h-full overflow-y-auto relative">
      <SEO
        title="Football — In Development"
        description="Archetype scouting for Europe's big five leagues, currently in development."
        path="/football"
        noindex
      />

      <div className="g-smoke" />

      <div className="relative max-w-3xl mx-auto p-6 py-12 space-y-8">

        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ color: "#3FB08C", border: "1px solid #3FB08C55", background: "#3FB08C14" }}>
            <FootballIcon size={34} />
          </div>
          <h1 className="font-logo text-3xl font-bold text-white tracking-wide">Football</h1>
          <span className="g-status inline-block"
            style={{ "--accent": "#3FB08C", "--accent-a": "#3FB08C1f", "--accent-line": "#3FB08C55" }}>
            In Development
          </span>
          <p className="text-sm max-w-xl mx-auto" style={{ color: "var(--text-muted)" }}>
            Europe's big five leagues, scored through a completely separate archetype
            dictionary — one built specifically for football, with its own roles for
            every phase of the game.
          </p>
        </div>

        {/* Ligler */}
        <div className="g-panel p-5">
          <div className="text-[10.5px] uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
            Leagues
          </div>
          <div className="flex flex-wrap gap-2">
            {LEAGUES.map(l => (
              <span key={l} className="g-status"
                style={{ "--accent": "#3FB08C", "--accent-a": "#3FB08C14", "--accent-line": "#3FB08C40" }}>
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* Faz bazlı arketipler */}
        <div className="g-panel p-5 space-y-4">
          <div>
            <div className="text-[10.5px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Archetypes by phase
            </div>
            <p className="text-[11.5px] mt-1.5" style={{ color: "var(--text-faint)" }}>
              A full-back and a striker are measured on almost nothing in common — so
              instead of one dictionary, each phase gets its own.
            </p>
          </div>

          <div className="space-y-2.5">
            {PHASES.map(p => (
              <div key={p.key} className="rounded-lg p-3"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-logo font-bold text-sm text-white">{p.label}</span>
                  <span className="text-[10.5px] tabular-nums" style={{ color: "#3FB08C" }}>
                    {p.n} core
                  </span>
                </div>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {p.roles}
                </p>
              </div>
            ))}
          </div>

          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Wingers and pure number tens count as attackers; wing-backs count as defenders.
            A player who covers two phases gets a separate archetype in each.
          </p>
        </div>

        {/* Geri bildirim — sözlük henüz kilitlenmedi, kullanıcı girdisi
            bu aşamada en değerli olduğu için kartların hemen altında. */}
        <div className="g-panel p-5 text-center space-y-3"
          style={{ borderColor: "#3FB08C40" }}>
          <div>
            <h2 className="font-logo text-base font-bold text-white">
              Think a role is missing — or misnamed?
            </h2>
            <p className="text-[11.5px] mt-1.5 max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
              These 26 archetypes are a starting point, not a final list. If a role you
              know from watching football isn't here, tell us before the dictionary is
              locked in.
            </p>
          </div>
          <button onClick={() => setFeedbackOpen(true)} className="aura-rating-btn"
            style={{ padding: "11px 26px", fontSize: 13, letterSpacing: ".1em" }}>
            <TagIcon size={15} /> <span className="ml-2">Suggest an archetype</span>
          </button>
        </div>

        <div className="text-center pt-2">
          <Link to="/basketball" className="aura-pill-btn" style={{ padding: "9px 20px" }}>
            Basketball is live — go there instead
          </Link>
        </div>

      </div>

      {feedbackOpen && <FootballFeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
