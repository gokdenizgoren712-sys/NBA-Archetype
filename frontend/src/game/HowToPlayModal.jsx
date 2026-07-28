import { useState } from "react";
import { CORE_COMPONENTS, MODIFIER_COMPONENTS, ERA_GUIDE } from "../data/glossary";
import {
  DnaIcon, CardsIcon, TargetIcon, WheelIcon, LoopIcon, CapIcon, WarnIcon,
  RefreshIcon, CalendarIcon, BoltIcon, UsersIcon, SearchIcon,
} from "./GameIcons";

// ── Geniş, tile-tabanlı "How to Play" modalı — mevcut dar InfoModal'dan
// FARKLI, Same Screen (ve ileride With a Friend) ana ekranındaki "How to
// Play" butonundan açılır. 3 tile = 3 sekme, içerik mevcut veri
// kaynaklarından (glossary.js, MechanicsPanel/WheelModePicker copy'si,
// seasonSim.js'in gerçek ağırlıkları) türetilmiş — yeni içerik icat
// edilmiyor, tek kaynak korunuyor. ─────────────────────────────────────────

const TILES = [
  { key: "archetypes", Icon: DnaIcon, title: "Archetypes & Modifiers" },
  { key: "jokers", Icon: CardsIcon, title: "Jokers & Counter Jokers" },
  { key: "modes", Icon: TargetIcon, title: "Modes, Engine & Eras" },
];

export default function HowToPlayModal({ open, onClose }) {
  const [tile, setTile] = useState("archetypes");
  const [sub, setSub] = useState("modes");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surfaceBg border border-gray-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-[fadeScaleIn_0.18s_ease-out]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
          <h3 className="font-logo text-lg font-bold text-white">How to Play</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-3 gap-2 p-4 shrink-0">
          {TILES.map(t => (
            <button key={t.key} onClick={() => setTile(t.key)}
              className={`rounded-xl border p-3 text-left transition-all
                ${tile === t.key ? "border-yamabuki bg-yamabuki/10" : "border-gray-800 bg-surfaceCard hover:border-gray-700"}`}>
              <div className={`flex items-center gap-1.5 ${tile === t.key ? "text-yamabuki" : "text-gray-400"}`}>
                <t.Icon size={16} />
                <span className="font-logo text-xs font-bold uppercase tracking-wide">{t.title}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {tile === "archetypes" && <ArchetypesTile />}
          {tile === "jokers" && <JokersTile />}
          {tile === "modes" && <ModesTile sub={sub} setSub={setSub} />}
        </div>
      </div>
    </div>
  );
}

function ArchetypesTile() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Core Archetypes (12)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {CORE_COMPONENTS.map(c => (
            <div key={c.name} className={`rounded-lg border p-2 ${c.bg}`}>
              <div className={`text-xs font-bold ${c.color}`}>{c.name}</div>
              <div className="text-[10.5px] text-gray-400 mt-0.5 leading-snug">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Modifiers (22)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {MODIFIER_COMPONENTS.map(m => (
            <div key={m.name} className={`rounded-lg border p-2 ${m.bg}`}>
              <div className={`text-xs font-bold ${m.color}`}>{m.name}</div>
              <div className="text-[10.5px] text-gray-400 mt-0.5 leading-snug">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1 border-t border-gray-800">
        <a href="/glossary" className="text-xs underline underline-offset-2 text-yamabuki">Full Glossary</a>
        <span className="text-gray-700">·</span>
        <a href="/about" className="text-xs underline underline-offset-2 text-yamabuki">About the System</a>
      </div>
    </div>
  );
}

const SELF_JOKERS = [
  [RefreshIcon, "Team", "Re-spin the team wheel. Get a different roster from the same season."],
  [CalendarIcon, "Year", "Re-spin the season wheel. Jump to a completely different era."],
  [BoltIcon, "Both", "Re-spin both wheels at once. Full reset of the current pick."],
  [UsersIcon, "Pick 2", "Choose two players from the current roster in a single turn."],
  [SearchIcon, "Discover", "Reveal every player's hidden overall score this turn, then choose with full information."],
];
const COUNTER_JOKERS = [
  [WarnIcon, "BAN", "Block one player from your opponent's current roster — they can't pick them this turn."],
  [RefreshIcon, "Force Team", "Force your opponent's team wheel to re-spin — a completely different roster."],
  [CalendarIcon, "Force Year", "Force your opponent's season wheel to re-spin — a completely different era."],
];

function JokersTile() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Your Jokers — used on your own turn</div>
        <div className="space-y-2">
          {SELF_JOKERS.map(([Icon, name, desc]) => (
            <div key={name} className="flex gap-3 items-start">
              <span className="shrink-0 text-yamabuki mt-0.5"><Icon size={18} /></span>
              <div>
                <div className="text-white font-medium text-sm">{name}</div>
                <div className="text-gray-400 text-xs leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 pt-2 border-t border-gray-800 mt-2">Each player has their own 5 self-jokers, one use each per game.</p>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-brandRed mb-2">Counter Jokers — used on your opponent's turn</div>
        <p className="text-[11px] text-gray-500 mb-2">When it's your opponent's turn, a pop-up appears on your side offering one of three counters. Pick one, or dismiss with "No thanks" — you can only act once per turn.</p>
        <div className="space-y-2">
          {COUNTER_JOKERS.map(([Icon, name, desc]) => (
            <div key={name} className="flex gap-3 items-start">
              <span className="shrink-0 text-brandRed mt-0.5"><Icon size={18} /></span>
              <div>
                <div className="text-white font-medium text-sm">{name}</div>
                <div className="text-gray-400 text-xs leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 pt-2 border-t border-gray-800 mt-2">Each counter joker is a single use per game. If BAN's target owner uses any of their own jokers on that pick, the BAN is voided — countering it costs a joker, so it's a real trade-off. Force Team/Year effects are immediate and can't be undone.</p>
      </div>
    </div>
  );
}

function ModesTile({ sub, setSub }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-gray-800 pb-2">
        {[["modes", "Modes"], ["engine", "Engine"], ["eras", "Eras"]].map(([k, label]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`px-3 py-1 rounded-lg font-logo text-[10.5px] font-bold uppercase tracking-wide transition-colors
              ${sub === k ? "bg-yamabuki text-darkBg" : "text-gray-500 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>
      {sub === "modes" && <ModesSub />}
      {sub === "engine" && <EngineSub />}
      {sub === "eras" && <ErasSub />}
    </div>
  );
}

function ModesSub() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Wheel Mode — Same Screen &amp; With a Friend</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-xl border border-gray-800 bg-surfaceCard p-3">
            <div className="font-logo text-sm font-bold text-white flex items-center gap-1.5"><span className="text-brandBlue"><WheelIcon size={15} /></span> Round-Based</div>
            <div className="text-[11px] text-gray-400 mt-1 leading-snug">The wheel spins once per round. Both players draft from that same team, in snake order.</div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-surfaceCard p-3">
            <div className="font-logo text-sm font-bold text-white flex items-center gap-1.5"><span className="text-yamabuki"><LoopIcon size={15} /></span> Pick-Based</div>
            <div className="text-[11px] text-gray-400 mt-1 leading-snug">The wheel spins again before every single pick — each player gets their own fresh team.</div>
          </div>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Budget Mode — Single Player</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-xl border border-gray-800 bg-surfaceCard p-3">
            <div className="font-logo text-sm font-bold text-white flex items-center gap-1.5"><span className="text-brandBlue"><WheelIcon size={15} /></span> Classic</div>
            <div className="text-[11px] text-gray-400 mt-1 leading-snug">No cap, no limits — pure wheel luck. Overalls stay hidden; read the archetypes.</div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-surfaceCard p-3">
            <div className="font-logo text-sm font-bold text-white flex items-center gap-1.5"><span className="text-asagi"><CapIcon size={15} /></span> Salary Cap</div>
            <div className="text-[11px] text-gray-400 mt-1 leading-snug">
              Start with a <span className="text-emerald-300 font-semibold">100% cap</span>. Every player costs a slice by quality — a superstar eats <span style={{ color: "#a78bfa" }}>~30%</span>, a role player <span style={{ color: "#fb923c" }}>4%</span>. Each roster's best men carry a star premium (14/10/7% floors). Same Screen and With a Friend always play Salary Cap.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EngineSub() {
  return (
    <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
      <p>Each simulated game is decided by a team rating built from your drafted roster:</p>
      <div className="space-y-2">
        {[
          ["Roster Quality", "42%", "Minutes-weighted quality across your 5 starters + bench, adjusted for fatigue at heavy minutes."],
          ["Star Power", "18%", "Your best player's effective quality — but a star playing limited minutes can't carry as much."],
          ["Lineup Coverage", "28%", "How well your archetypes cover creation, spacing, rim protection, perimeter defense and finishing — weighted by how much your chosen era actually values each."],
          ["Role Fit", "12%", "A mild penalty for too many ball-dominant players fighting for the same touches."],
        ].map(([label, pct, desc]) => (
          <div key={label} className="flex gap-3">
            <div className="w-32 shrink-0"><span className="font-bold text-white text-xs">{label}</span> <span className="text-yamabuki text-[11px]">{pct}</span></div>
            <div className="text-xs text-gray-400 flex-1">{desc}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 pt-2 border-t border-gray-800">On top of that: your <span className="text-white">coach</span>'s O/D grades and championship rings add a rating bonus, <span className="text-white">chemistry</span> (archetype pairwise affinity) nudges it further, and real award tags on your roster (MVP, DPOY, rings, iconic duos) add small regular-season and playoff boosts.</p>
    </div>
  );
}

function ErasSub() {
  return (
    <div className="space-y-3">
      {ERA_GUIDE.map(era => (
        <div key={era.label} className="rounded-xl border border-gray-800 bg-surfaceCard p-3">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded font-bold"
              style={{ color: era.color, border: `1px solid ${era.color}50`, background: `${era.color}15` }}>{era.short}</span>
            <span className="font-bold text-sm" style={{ color: era.color }}>{era.label}</span>
            <span className="text-[10px] text-gray-500 ml-auto">{era.years}</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed mb-2">{era.desc}</p>
          <div className="flex flex-wrap gap-1.5">
            {era.top.map(t => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded font-medium"
                style={{ color: "#34d399", border: "1px solid #34d39940", background: "#34d39915" }}>{t}</span>
            ))}
            {era.low.map(t => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded font-medium"
                style={{ color: "#f87171", border: "1px solid #f8717140", background: "#f8717115" }}>{t}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
