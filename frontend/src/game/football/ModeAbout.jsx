import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  TargetIcon, WheelIcon, CoachIcon, TrophyIcon, CardsIcon, DnaIcon,
  UsersIcon, LinkIcon, GlobeIcon, ScreenIcon, CalendarIcon, LoopIcon,
  ShieldIcon, EyeIcon, InfoIcon, BoltIcon,
} from "../GameIcons";
import "../game.css";
import { ACCENT as ACC } from "./theme";

// ── Moda özel "about" pop-up'ı ───────────────────────────────────────────────
// Basketboldaki ModeAboutModal'ın futbol karşılığı: her mod kendi ⓘ düğmesini
// taşıyor, kuralları orada anlatıyor.
//
// Bunun yerinde eskiden "henüz kalibre değil" uyarısı duruyordu. O uyarı artık
// YANLIŞ — kimya 28.388 gerçek ilk-11'e karşı ölçüldü ve ölçmediği çıkan
// bileşen (arketip-çifti önseli) skordan çıkarıldı. Ama asıl mesele şuydu:
// oyunun kuralları hiçbir yerde yazmıyordu, oyuncu tahmin etmek zorundaydı.
// Uyarıyı silip yerine bir şey koymamak o boşluğu bırakırdı.
//
// İçerik uydurulmuyor: akış ve sayılar oyunun kendi kodundan geliyor
// (positions.js cezaları, managers.js bonusu, seasonSim.js katsayıları,
// headToHead.js format kuralları).

const MODES = {
  spin: {
    title: "Spin & Build",
    tagline: "Solo · eighteen players · leaderboard scored",
    flow: [
      [WheelIcon, "Spin two wheels",
       "One lands on a club, the other on a season. The same club can come up again " +
       "in a different year — Barcelona 2018 and Barcelona 2025 are different squads, " +
       "so both count as fresh."],
      [TargetIcon, "Take one player, place him yourself",
       "Pick from that squad and drop him anywhere on the pitch. He does not have to " +
       "play his own position, but it costs: comfortable −5, out of position −11, " +
       "foreign role −20, and an outfielder in goal −45."],
      [CardsIcon, "Fill eleven and seven",
       "Eleven on the pitch, seven on the bench. Bench places carry no position " +
       "penalty, which makes them the home for an awkward pick."],
      [CoachIcon, "Pick a manager",
       "Three are offered once the eighteen are in. If a manager's preferred shape " +
       "matches yours you get a bonus — so the formation you chose before the first " +
       "spin is a decision that pays off or doesn't."],
    ],
    extras: [
      [CardsIcon, "#f0abfc", "Five jokers, once each",
       "Re-club keeps the year and respins the club. Re-year does the opposite. " +
       "Re-both starts over. Pick 2 takes two players from one squad. Discover " +
       "reveals ratings."],
      [EyeIcon, "#60a5fa", "Ratings are hidden",
       "You see the role, the position and the per-90 line while drafting — never " +
       "the number. Spend Discover if you want it."],
      [TrophyIcon, "#4ade80", "Then it plays out",
       "Finish the eighteen and a squad report opens, then a season simulation " +
       "underneath it."],
    ],
  },

  quick: {
    title: "Quick Sim",
    tagline: "Your eleven, a full league, 38 matches",
    flow: [
      [CalendarIcon, "Enter a league",
       "Your eleven joins one of the five as a twenty-first club, or takes an " +
       "existing club's place. Every other club plays too, with the strength its " +
       "own real starting elevens earned."],
      [BoltIcon, "Goals come from a fitted model",
       "Squad quality, chemistry and the opponent's quality, regressed on real " +
       "match outcomes. Home advantage falls out at +0.31 goals, which is what the " +
       "literature finds."],
      [LoopIcon, "Two hundred seasons, not one",
       "The model explains about 14% of a single match, so one 38-game run can land " +
       "several places off. The spread is the answer; the table is one sample."],
    ],
    extras: [
      [DnaIcon, "#60a5fa", "Scorers are drawn, not assigned",
       "Team goals come from the model; who scores them is drawn from each player's " +
       "real goals per 90. No position heuristic decides it."],
      [InfoIcon, "#9ca3af", "Poisson was checked",
       "Goals were not assumed Poisson — the observed distribution was compared " +
       "against it first."],
    ],
  },

  rewrite: {
    title: "Rewrite History",
    tagline: "A real club's real fixtures, your eleven",
    flow: [
      [CalendarIcon, "Take a club's season",
       "Same opponents, same order, same home and away. Only the eleven changes."],
      [ShieldIcon, "Two comparisons, both shown",
       "Beating their real return is the romantic one. Running their squad through " +
       "the same model is the fair one — and they differ."],
      [TrophyIcon, "The whole league replays",
       "Every club plays its own real fixtures with its own squad, so you see where " +
       "you finish, not just whether you beat one team."],
    ],
    extras: [
      [InfoIcon, "#FFB11B", "Why two numbers",
       "The model pulls predictions toward the middle: measured across the Premier " +
       "League it came in about 5 points short for the strongest six clubs and 6 " +
       "points generous for the weakest. Judging yourself against a real total would " +
       "read that regression as merit."],
      [LoopIcon, "#9ca3af", "Points per game",
       "Clubs replay different numbers of matches, because only games where both " +
       "starting elevens were recorded can be replayed. Totals would favour whoever " +
       "has more fixtures."],
    ],
  },

  same: {
    title: "Same screen",
    tagline: "Two elevens · one device · two legs",
    flow: [
      [ScreenIcon, "Nothing leaves the browser",
       "Both squads are here and the tie is played locally. No account needed."],
      [UsersIcon, "Two legs, aggregate",
       "Each side hosts once. Level after both matches means extra time at the " +
       "second leg's ground, then penalties."],
      [LoopIcon, "Then it replays 400 times",
       "Two matches decide very little in football. The single tie is one draw from " +
       "the spread, not a verdict."],
    ],
    extras: [
      [InfoIcon, "#9ca3af", "No away-goals rule",
       "UEFA dropped it in 2021, so applying it now would be wrong."],
      [BoltIcon, "#60a5fa", "Same engine as the season",
       "No separate knockout model. The only difference is that the opponent is " +
       "another squad rather than a number drawn from the league."],
    ],
  },

  friend: {
    title: "With a friend",
    tagline: "Two devices · a room code",
    flow: [
      [LinkIcon, "Open a room, share the code",
       "Six characters. Whoever has it can join, and only one other player can."],
      [CardsIcon, "Both build, neither peeks",
       "An opponent's eleven stays hidden until both have submitted — otherwise the " +
       "second player would simply build against the first."],
      [TrophyIcon, "The server plays the tie",
       "Result and odds are computed server-side. Working it out in the browser " +
       "would amount to letting a player report their own score."],
    ],
    extras: [
      [ShieldIcon, "#4ade80", "Squad value is server-side too",
       "You send player ids; quality and chemistry are computed there, with the same " +
       "definitions the season panel uses."],
      [LoopIcon, "#9ca3af", "Refreshing is safe",
       "The tie's seed comes from the room code, so reloading shows the same result " +
       "rather than rerolling it."],
    ],
  },

  online: {
    title: "Online",
    tagline: "Two devices · open room",
    flow: [
      [GlobeIcon, "Open and wait, or paste a code",
       "Same room machinery as playing a friend; the difference is that you are not " +
       "handing the code to someone in particular."],
      [CardsIcon, "Both build, neither peeks", "As above."],
      [TrophyIcon, "The server plays the tie", "As above."],
    ],
    extras: [
      [InfoIcon, "#FFB11B", "Draft build",
       "Matchmaking is not wired up yet — for now this behaves like a friend room " +
       "with a code you pass along however you like."],
    ],
  },
};

/** Bir modun ⓘ düğmesi. Yanına konduğu yerde küçük durur. */
export function ModeInfoButton({ mode, style }) {
  const [open, setOpen] = useState(false);
  if (!MODES[mode]) return null;
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`About ${MODES[mode].title}`}
        aria-label={`About ${MODES[mode].title}`}
        style={{
          width: 18, height: 18, borderRadius: "50%", flex: "0 0 auto",
          border: `1px solid ${ACC}66`, background: `${ACC}14`, color: ACC,
          fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          ...style,
        }}>i</button>
      {open && <ModeAbout mode={mode} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function ModeAbout({ mode, onClose }) {
  const m = MODES[mode];
  if (!m) return null;
  // PORTAL ŞART. Modal, dock'un içindeki bir başlıktan açılıyor ve dock'ta
  // backdrop-filter var; bir ata üzerinde backdrop-filter/transform/filter
  // olduğunda position:fixed artık VIEWPORT'a değil o ataya göre konumlanıyor.
  // Sonuç: modal dock'un içine hapsolup kırpılıyor ve sayfa öğeleri metnin
  // üstüne biniyordu. PlayerSearch aynı sorunu aynı şekilde çözmüştü.
  return createPortal(
    <div className="g-modal-backdrop" onClick={onClose}>
      <div className="g-modal" onClick={(e) => e.stopPropagation()}
        style={{ "--accent": ACC, "--accent-line": `${ACC}55`, maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#fff" }}>
              {m.title}
            </h2>
            <div style={{ fontSize: 11.5, color: ACC, marginTop: 2 }}>{m.tagline}</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "none", border: 0, color: "var(--text-faint)",
              fontSize: 22, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
          {m.flow.map(([Icon, title, desc], i) => (
            <div key={title + i} style={{ display: "flex", gap: 10 }}>
              <span style={{ flex: "0 0 26px", height: 26, borderRadius: 8,
                background: `${ACC}18`, border: `1px solid ${ACC}44`, color: ACC,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon width={14} height={14} />
              </span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>{title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)",
                  lineHeight: 1.6 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {m.extras?.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12,
            borderTop: "1px solid var(--border)", display: "flex",
            flexDirection: "column", gap: 9 }}>
            {m.extras.map(([Icon, hex, title, desc], i) => (
              <div key={title + i} style={{ display: "flex", gap: 9 }}>
                <span style={{ flex: "0 0 16px", color: hex, marginTop: 2 }}>
                  <Icon width={13} height={13} />
                </span>
                <div style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                  <b style={{ color: hex }}>{title}</b>
                  <span style={{ color: "var(--text-muted)" }}> — {desc}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 14,
          lineHeight: 1.7 }}>
          What these numbers do <i>not</i> claim is set out in{" "}
          <Link to="/football/about" style={{ color: ACC }}>About</Link>; every role's
          exact metrics are in the{" "}
          <Link to="/football/glossary" style={{ color: ACC }}>glossary</Link>.
        </p>
      </div>
    </div>,
    document.body
  );
}
