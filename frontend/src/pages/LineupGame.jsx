import { useState, useEffect, useRef, useCallback } from "react";
import { useLang } from "../contexts/LanguageContext";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

// Arketipe göre oynayabileceği mevkiler (ilk = birincil)
const ARCH_POSITIONS = {
  Ecosystem:    ["PG","SG"],
  Engine:       ["PG","SG"],
  Hub:          ["PG","SG","SF"],
  Creator:      ["PG","SG"],
  Initiator:    ["PG"],
  Connector:    ["SG","SF"],
  Spacer:       ["SG","SF","PF"],
  Stopper:      ["SF","PF"],
  Finisher:     ["SF","PF"],
  Force:        ["PF","C"],
  Anchor:       ["C","PF"],
  "Rim Runner": ["C","PF"],
};

// POSITION string → eligible positions (game slot eligibility + chemistry bonus)
const POS_STRING_MAP = {
  // Tek pozisyon — sadece kendi slotları (badge karışıklığını önler)
  "PG":["PG"],       "POINT GUARD":["PG"],
  "SG":["SG","SF"],  "SHOOTING GUARD":["SG","SF"],
  "SF":["SF","PF"],  "SMALL FORWARD":["SF","PF"],
  "PF":["PF","C"],   "POWER FORWARD":["PF","C"],
  "C": ["C","PF"],   "CENTER":["C","PF"],
  // Generic / dual pozisyonlar
  "G":["PG","SG"],   "GUARD":["PG","SG"],
  "F":["SF","PF"],   "FORWARD":["SF","PF"],
  "G-F":["SG","SF"], "GUARD-FORWARD":["SG","SF"], "FORWARD-GUARD":["SG","SF"],
  "F-C":["PF","C"],  "FORWARD-CENTER":["PF","C"], "CENTER-FORWARD":["PF","C"],
  // BBref dual kod formatı
  "PG-SG":["PG","SG"], "SG-PG":["SG","PG"],
  "SG-SF":["SG","SF"], "SF-SG":["SF","SG"],
  "SF-PF":["SF","PF"], "PF-SF":["PF","SF"],
  "PF-C": ["PF","C"],  "C-PF": ["C","PF"],
};

function getEligiblePos(player) {
  // POS5 (backend hesaplı) → POSITION (raw) → arketip fallback
  const raw = (player.POS5 || player.POSITION || "").toUpperCase().trim();
  if (raw && POS_STRING_MAP[raw]) return POS_STRING_MAP[raw];
  return ARCH_POSITIONS[player.primary_arch] || POSITIONS;
}
function getPrimaryPos(player) { return getEligiblePos(player)[0]; }

const POS_COLORS = {
  PG:"bg-blue-900/60 text-blue-300 border-blue-700/50",
  SG:"bg-sky-900/60 text-sky-300 border-sky-700/50",
  SF:"bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  PF:"bg-amber-900/60 text-amber-300 border-amber-700/50",
  C: "bg-red-900/60 text-red-300 border-red-700/50",
};

// ── Lineup fit hesaplama ──────────────────────────────────────────────────────
function computeLineupFit(players) {
  if (!players || players.length < 2) return null;
  const _s = (p,k) => { const v=parseFloat(p[`score_${k}`]??0); return isNaN(v)?0:Math.max(0,v); };
  const creationPP = players.map(p=>Math.min(1,Math.max(_s(p,"Ecosystem")*1.10,_s(p,"Engine"),_s(p,"Hub")*0.90,_s(p,"Creator")*0.88,_s(p,"Connector")*0.75,_s(p,"Initiator")*0.80)));
  const creation=Math.min(1,0.60*Math.min(1,Math.max(...creationPP))+0.25*Math.min(1,creationPP.filter(v=>v>=0.65).length/3)+0.15*Math.max(...players.map(p=>_s(p,"Playmaking"))));
  const spacingPP=players.map(p=>Math.min(1,Math.max(_s(p,"Spacer"),_s(p,"3-and-D")*0.90,_s(p,"Stretch")*0.85,_s(p,"Gravity")*0.95,_s(p,"Three-Level")*0.80)));
  const nShooters=spacingPP.filter(v=>v>=0.70).length;
  const spacing=Math.min(1,0.60*[0.15,0.48,0.80,1.00,0.92,0.78][Math.min(nShooters,5)]+0.40*(spacingPP.reduce((a,b)=>a+b,0)/players.length));
  const intDef=Math.min(1,Math.max(...players.map(p=>Math.max(_s(p,"Anchor")*1.10,_s(p,"Force")*0.65))));
  const perDef=Math.min(1,Math.max(...players.map(p=>Math.max(_s(p,"Stopper"),_s(p,"Two-Way")*0.90,_s(p,"Point-of-Attack")*0.88,_s(p,"Defensive")*0.92))));
  const defense=0.35*intDef+0.35*perDef+0.30*Math.min(1,players.filter(p=>Math.max(_s(p,"Two-Way"),_s(p,"Stopper"),_s(p,"Anchor"))>=0.65).length/2.5);
  const finishing=Math.min(1,Math.max(...players.map(p=>Math.max(_s(p,"Finisher"),_s(p,"Rim Runner")*0.95,_s(p,"Force")*0.75,_s(p,"Slashing")*0.82))));
  const ballDom=players.filter(p=>Math.max(_s(p,"Engine")*1.05,_s(p,"Ecosystem"))>=0.80).length;
  const roleFit=Math.max(0,1-Math.max(0,(ballDom-1)*0.18));
  const synergy=Math.min(0.05,creation*Math.max(0,spacing-0.60)*0.25);
  return {creation,spacing,defense,finishing,roleFit,nShooters,lineupScore:Math.min(1,0.28*creation+0.27*spacing+0.22*defense+0.12*finishing+0.11*roleFit+synergy),synergyBonus:synergy};
}

// ── Era sistemi ───────────────────────────────────────────────────────────────
const ERAS = [
  { id:"magic_bird", label:"Magic vs Bird Era",    short:"80s",       color:"text-amber-400",    bg:"bg-amber-900/30 border-amber-700/40",    years:[1979,1991] },
  { id:"jordan",     label:"Jordan Era",           short:"Jordan",    color:"text-red-400",      bg:"bg-red-900/30 border-red-700/40",        years:[1991,1998] },
  { id:"dead_ball",  label:"Dead Ball Era",        short:"Dead Ball", color:"text-slate-400",    bg:"bg-slate-700/50 border-slate-500/40",    years:[1998,2008] },
  { id:"proto",      label:"Proto Super Team Era", short:"Proto ST",  color:"text-blue-400",     bg:"bg-blue-900/30 border-blue-700/40",      years:[2008,2014] },
  { id:"small_ball", label:"Small Ball Era",       short:"Small Ball",color:"text-emerald-400",  bg:"bg-emerald-900/30 border-emerald-700/40",years:[2014,2020] },
  { id:"parity",     label:"Parity Era",           short:"Parity",    color:"text-violet-400",   bg:"bg-violet-900/30 border-violet-700/40",  years:[2020,2030] },
];

// Her arketipin o era'da ne kadar "meta" olduğu (1.0 = nötr, >1 meta, <1 meta-dışı)
const ERA_ARCH_WEIGHTS = {
  magic_bird: { Engine:0.90, Ecosystem:1.30, Hub:1.15, Creator:0.85, Connector:0.95, Anchor:1.15, Force:1.20, Spacer:0.45, Finisher:0.85, Initiator:0.70, Stopper:0.95, "Rim Runner":0.70 },
  jordan:     { Engine:1.25, Ecosystem:0.85, Hub:0.90, Creator:1.20, Connector:0.85, Anchor:0.95, Force:1.00, Spacer:0.60, Finisher:0.90, Initiator:0.85, Stopper:1.15, "Rim Runner":0.80 },
  dead_ball:  { Engine:0.90, Ecosystem:0.85, Hub:0.85, Creator:0.95, Connector:0.85, Anchor:1.25, Force:1.15, Spacer:0.55, Finisher:0.85, Initiator:0.75, Stopper:1.20, "Rim Runner":0.85 },
  proto:      { Engine:1.10, Ecosystem:0.95, Hub:1.00, Creator:1.05, Connector:0.95, Anchor:1.00, Force:1.00, Spacer:0.80, Finisher:1.05, Initiator:0.85, Stopper:1.00, "Rim Runner":1.10 },
  small_ball: { Engine:1.20, Ecosystem:1.05, Hub:1.00, Creator:1.10, Connector:1.00, Anchor:0.70, Force:0.65, Spacer:1.35, Finisher:1.00, Initiator:0.90, Stopper:0.95, "Rim Runner":1.10 },
  parity:     { Engine:1.10, Ecosystem:1.15, Hub:1.05, Creator:1.05, Connector:1.10, Anchor:0.85, Force:0.80, Spacer:1.20, Finisher:1.00, Initiator:0.95, Stopper:1.05, "Rim Runner":1.05 },
};

const ERA_META_BLURB = {
  magic_bird: "Post play & team ball. Ecosystems and powerful bigs reign. Spacers barely exist.",
  jordan:     "Isolation era. Engines and Creators peak. Stoppers at a premium.",
  dead_ball:  "Grind-it-out defense. Anchors and Stoppers dominate. Pace is dead.",
  proto:      "Pick-and-roll transition. Stretch bigs emerging. Relatively balanced.",
  small_ball: "Spacing is king. Spacers peak. Traditional bigs and Forces struggle.",
  parity:     "Two-way versatility rewarded. Ecosystems and connectors shine.",
};

function getEra(season) {
  if (!season) return ERAS[5];
  const year = parseInt(season.split("-")[0]);
  return ERAS.find(e => year >= e.years[0] && year < e.years[1]) || ERAS[5];
}

function computeEraFit(player, season) {
  const era = getEra(season || player._season);
  const arch = player.primary_arch || "";
  const w = (ERA_ARCH_WEIGHTS[era.id] || {})[arch] ?? 1.0;
  const archScore = parseFloat(player[`score_${arch}`] ?? 0) || 0;
  return Math.min(1, w * archScore);
}

function computeLineupEraFit(lineup) {
  const filled = POSITIONS.map(p => lineup[p]).filter(Boolean);
  if (!filled.length) return null;
  const items = filled.map(p => ({ player: p, era: getEra(p._season), fit: computeEraFit(p) }));
  const avg = items.reduce((a, b) => a + b.fit, 0) / items.length;
  return { avg, items };
}

// ── SpinWheel ─────────────────────────────────────────────────────────────────
function SpinWheel({ items, spinning, targetIdx, label }) {
  const [centerIdx,setCenterIdx]=useState(0);
  const intRef=useRef(null);
  useEffect(()=>{
    clearInterval(intRef.current);
    if(spinning&&items.length>0){ intRef.current=setInterval(()=>setCenterIdx(i=>(i+1)%items.length),70); }
    else if(items.length>0){ setCenterIdx(targetIdx%items.length); }
    return ()=>clearInterval(intRef.current);
  },[spinning,targetIdx,items.length]);

  const visible=[-2,-1,0,1,2].map(off=>({off,item:items[((centerIdx+off)%items.length+items.length)%items.length]}));
  return (
    <div className="flex flex-col items-center select-none">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="relative w-32 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 z-10" style={{background:"linear-gradient(to bottom,#020817,transparent)"}}/>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 z-10" style={{background:"linear-gradient(to top,#020817,transparent)"}}/>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 border-y border-blue-500/30 bg-blue-500/5 z-0"/>
        <div className="py-1">
          {visible.map(({off,item})=>(
            <div key={off} className={`h-10 flex items-center justify-center font-mono px-1 text-center text-xs ${off===0?"text-white font-bold":"text-slate-500"}`}
              style={{opacity:Math.max(0.07,1-Math.abs(off)*0.40)}}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Oyuncu kartı ─────────────────────────────────────────────────────────────
function PlayerCard({ player, season, discover, onClick, dimmed }) {
  const eligible = getEligiblePos(player);
  const primary  = eligible[0];
  const stat = (k,d=1) => player[k]!=null ? (+player[k]).toFixed(d) : "—";
  const era = getEra(season);
  const overall = player.overall_score != null ? Math.round(player.overall_score * 100) : null;
  return (
    <button onClick={onClick} disabled={dimmed}
      className={`w-full text-left border rounded-xl p-2.5 transition-all group
        ${dimmed?"opacity-30 cursor-not-allowed border-slate-800 bg-slate-900/50"
                :discover?"border-emerald-700/60 hover:border-emerald-500/80 hover:bg-slate-800 bg-slate-900 cursor-pointer"
                         :"border-slate-700 hover:border-blue-500/60 hover:bg-slate-800 bg-slate-900 cursor-pointer"}`}>
      {/* İsim + era chip */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className={`text-sm font-medium leading-tight truncate ${discover?"text-emerald-200":"text-white group-hover:text-blue-200"}`}>
          {player.PLAYER_NAME}
        </div>
        <span className={`text-[8px] px-1.5 py-0.5 rounded border shrink-0 font-medium ${era.bg} ${era.color}`}>
          {era.short}
        </span>
      </div>
      {/* İstatistikler */}
      <div className="flex gap-2 text-[10px] text-slate-400 mb-1.5 flex-wrap">
        <span>PTS <span className="text-slate-200 font-medium">{stat("PTS")}</span></span>
        <span>REB <span className="text-slate-200 font-medium">{stat("REB")}</span></span>
        <span>AST <span className="text-slate-200 font-medium">{stat("AST")}</span></span>
        <span>STL <span className="text-slate-200 font-medium">{stat("STL")}</span></span>
        <span>BLK <span className="text-slate-200 font-medium">{stat("BLK")}</span></span>
      </div>
      {/* Mevkiler + arketip */}
      <div className="flex gap-1 flex-wrap">
        {eligible.map(p=>(
          <span key={p} className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${p===primary?"ring-1 ring-blue-400/40":""} ${POS_COLORS[p]||"bg-slate-800 text-slate-400 border-slate-700"}`}>
            {p}{p===primary?" ★":""}
          </span>
        ))}
        {discover ? (
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-700/50 bg-emerald-900/30 text-emerald-300 font-medium">
              {player.primary_arch || "—"}
            </span>
            {overall != null && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700/50 bg-violet-900/30 text-violet-300 font-bold">
                {overall}
              </span>
            )}
          </span>
        ) : (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-500 font-mono">???</span>
        )}
      </div>
    </button>
  );
}

// ── Lineup slot ───────────────────────────────────────────────────────────────
function LineupSlot({ pos, player }) {
  const isPrimary = player && getPrimaryPos(player) === pos;
  return (
    <div className={`flex-1 rounded-lg p-1.5 border text-center min-w-0 transition-all
      ${player?"border-blue-500/40 bg-blue-900/15":"border-slate-800 bg-slate-900/60"}`}>
      <div className={`text-[8px] uppercase tracking-wider mb-0.5 ${POS_COLORS[pos]?.split(" ")[1]||"text-slate-600"}`}>{pos}</div>
      {player ? (
        <>
          <div className="text-[10px] text-white font-semibold truncate leading-tight">
            {player.PLAYER_NAME?.split(" ").slice(-1)[0]}
          </div>
          <div className="text-[8px] text-slate-500">{(player._season||"").slice(0,4)}</div>
          {isPrimary && <div className="text-[8px] text-yellow-400">⭐</div>}
        </>
      ) : (
        <div className="text-slate-700 text-sm">—</div>
      )}
    </div>
  );
}

// ── Info Modal ────────────────────────────────────────────────────────────────
function InfoModal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl
                      animate-[fadeScaleIn_0.18s_ease-out]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Joker butonu ──────────────────────────────────────────────────────────────
function JokerBtn({ icon, label, available, onClick }) {
  return (
    <button onClick={onClick} disabled={!available}
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border text-center transition-all
        ${available?"border-amber-700/60 bg-amber-900/20 hover:bg-amber-900/40 cursor-pointer text-amber-300"
                  :"border-slate-800 bg-slate-900/40 cursor-not-allowed text-slate-600"}`}>
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[9px] leading-tight whitespace-nowrap">{label}</span>
    </button>
  );
}

// ── Post-game analiz ──────────────────────────────────────────────────────────
// Pillar → hangi score_ kolonları yüksek olmalı
const PILLAR_SCORE_KEYS = {
  creation:  ["Engine","Ecosystem","Creator","Hub","Initiator"],
  spacing:   ["Spacer","Three-Level","Gravity","Shotmaker"],
  defense:   ["Anchor","Stopper","Two-Way","Force"],
  finishing: ["Finisher","Rim Runner","Force"],
  roleFit:   ["Connector","Spacer"],
};

function analyzeLineup(fit, lineup, roundHistory=[]) {
  const filled = POSITIONS.map(p=>lineup[p]).filter(Boolean);
  const pillars = [
    { key:"creation",  label:"Creation",  val:fit.creation,  w:0.28,
      fix:"You need a true playmaker — an Engine, Ecosystem, or Creator archetype." },
    { key:"spacing",   label:"Spacing",   val:fit.spacing,   w:0.27,
      fix:`${fit.nShooters} shooter${fit.nShooters===1?"":"s"} detected. Optimal is 2–3. Add a Spacer, 3-and-D, or Gravity player.` },
    { key:"defense",   label:"Defense",   val:fit.defense,   w:0.22,
      fix:"No interior anchor or perimeter stopper. Add an Anchor or Two-Way Stopper." },
    { key:"finishing", label:"Finishing", val:fit.finishing, w:0.12,
      fix:"Weak at the rim. Add a Finisher, Rim Runner, or Force player." },
    { key:"roleFit",   label:"Role Fit",  val:fit.roleFit,   w:0.11,
      fix:"Too many ball-dominant players competing for the same role. Mix in off-ball specialists." },
  ];

  const sorted = [...pillars].sort((a,b)=>a.val-b.val);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length-1];

  const ballDom = filled.filter(p=>{
    const _s=(k)=>parseFloat(p[`score_${k}`]??0)||0;
    return Math.max(_s("Engine")*1.05,_s("Ecosystem"))>=0.80;
  }).length;

  const primaryFits = filled.filter(p=>p._isPrimary);
  const byScore = [...filled].sort((a,b)=>(parseFloat(b.overall_score)||0)-(parseFloat(a.overall_score)||0));

  // Round history'den somut öneri: weakest pillar için en yüksek skora sahip
  // seçilmemiş oyuncu
  const scoreFor = (player, keys) =>
    Math.max(...keys.map(k=>parseFloat(player[`score_${k}`]??0)||0));

  const pickedNames = new Set(filled.map(p=>p.PLAYER_NAME));
  const wKeys = PILLAR_SCORE_KEYS[weakest.key] || [];
  let bestAlt = null;
  for(const round of roundHistory){
    const notPicked = (round.available||[]).filter(p=>!pickedNames.has(p.PLAYER_NAME));
    for(const p of notPicked){
      const s = scoreFor(p, wKeys);
      if(!bestAlt || s > scoreFor(bestAlt.player, wKeys)){
        bestAlt = {player:p, season:round.season, team:round.team, score:s};
      }
    }
  }

  return { weakest, strongest, ballDom, primaryFits, byScore, pillars, bestAlt };
}

// ── Sonuç ekranı ──────────────────────────────────────────────────────────────
function ScoreReveal({ fit, lineup, primaryCount, roundHistory, onReset, lang }) {
  const analysis  = analyzeLineup(fit, lineup, roundHistory);
  const eraResult = computeLineupEraFit(lineup);
  const chemBonus = primaryCount * 0.02;
  const rawScore  = fit.lineupScore;
  const totalScore = Math.min(1, rawScore + chemBonus);
  const pct  = Math.round(totalScore * 100);
  const grade = pct>=85?"S":pct>=75?"A":pct>=65?"B":pct>=55?"C":"D";
  const gColor = pct>=85?"text-blue-300":pct>=75?"text-sky-300":pct>=65?"text-emerald-300":pct>=55?"text-amber-300":"text-red-400";

  const pillars = [
    { label:"Creation",  val:fit.creation,  w:0.28 },
    { label:"Spacing",   val:fit.spacing,   w:0.27, extra:`(${fit.nShooters})` },
    { label:"Defense",   val:fit.defense,   w:0.22 },
    { label:"Finishing", val:fit.finishing, w:0.12 },
    { label:"Role Fit",  val:fit.roleFit,   w:0.11 },
  ];

  return (
    <div className="space-y-4">
      {/* Ana skor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Lineup Fit</div>
        <div className={`text-7xl font-black mb-1 ${pct>=75?"text-blue-400":pct>=55?"text-sky-400":"text-slate-300"}`}>{pct}</div>
        <div className={`text-3xl font-bold mb-1 ${gColor}`}>{grade}</div>
        {chemBonus > 0 && (
          <div className="text-xs text-yellow-400 mb-4">
            ⭐ Chemistry Bonus: +{primaryCount} primary slot (+{Math.round(chemBonus*100)} pts)
          </div>
        )}
        <div className="space-y-2 max-w-xs mx-auto">
          {pillars.map(({label,val,extra})=>{
            const p=Math.round(val*100);
            const bar=p>=80?"bg-blue-500":p>=65?"bg-blue-600/70":p>=45?"bg-slate-600":"bg-red-900/60";
            return (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 w-24 text-right shrink-0">{label}{extra&&<span className="text-slate-600 text-[9px] ml-0.5">{extra}</span>}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${bar} rounded-full`} style={{width:`${p}%`}}/>
                </div>
                <span className={`text-[11px] w-6 shrink-0 ${p>=65?"text-blue-300":p>=45?"text-slate-300":"text-red-400"}`}>{p}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lineup — arketip artık açık */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Final Lineup</div>
        <div className="space-y-2">
          {POSITIONS.map(pos=>{
            const p=lineup[pos]; if(!p) return null;
            const isPrimary = getPrimaryPos(p) === pos;
            return (
              <div key={pos} className="flex items-center gap-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${POS_COLORS[pos]||""}`}>{pos}</span>
                <span className="text-sm text-white font-medium flex-1 min-w-0 truncate">{p.PLAYER_NAME}</span>
                <span className="text-[10px] text-blue-400 shrink-0">{p.primary_arch||"—"}</span>
                <span className="text-[10px] text-slate-500 shrink-0">{(p._season||"").slice(0,4)}</span>
                {isPrimary&&<span className="text-yellow-400 text-xs shrink-0">⭐</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Era Fit */}
      {eraResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-slate-600 uppercase tracking-widest">Era Fit</div>
            <div className="text-right">
              <span className={`text-lg font-bold ${eraResult.avg>=0.75?"text-emerald-400":eraResult.avg>=0.55?"text-amber-400":"text-red-400"}`}>
                {Math.round(eraResult.avg*100)}
              </span>
              <span className="text-[10px] text-slate-500 ml-1">avg</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {eraResult.items.map(({player:p, era, fit}, i) => {
              const fitPct = Math.round(fit*100);
              const arch = p.primary_arch || "—";
              const weight = (ERA_ARCH_WEIGHTS[era.id]||{})[arch] ?? 1.0;
              const isBonus = weight > 1.0;
              const isPenalty = weight < 0.85;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] px-1.5 py-0.5 rounded border shrink-0 ${era.bg} ${era.color}`}>{era.short}</span>
                    <span className="text-xs text-white font-medium flex-1 truncate">{p.PLAYER_NAME}</span>
                    <span className={`text-[10px] font-bold shrink-0 ${fitPct>=75?"text-emerald-400":fitPct>=55?"text-amber-400":"text-red-400"}`}>{fitPct}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-0">
                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${fitPct>=75?"bg-emerald-500":fitPct>=55?"bg-amber-500":"bg-red-700"}`}
                           style={{width:`${fitPct}%`}}/>
                    </div>
                    <span className={`text-[9px] shrink-0 ${isBonus?"text-emerald-500":isPenalty?"text-red-500":"text-slate-600"}`}>
                      {arch} {isBonus?`↑${Math.round((weight-1)*100)}%`:isPenalty?`↓${Math.round((1-weight)*100)}%`:""}
                    </span>
                  </div>
                  {isPenalty && (
                    <p className="text-[9px] text-slate-600 pl-0 leading-tight">
                      {arch} was off-meta in the {era.label} — {ERA_META_BLURB[era.id]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] text-slate-500 italic leading-relaxed">
              Era Fit measures how well each player's archetype aligned with the meta of their era.
              A Spacer from the Dead Ball era scores low — not because they were bad, but because spacing wasn't the league's currency yet.
            </p>
          </div>
        </div>
      )}

      {/* Post-game analysis */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="text-[10px] text-slate-600 uppercase tracking-widest">Lineup Analysis</div>

        {/* Güçlü yön */}
        <div className="flex gap-2 items-start">
          <span className="text-green-400 text-sm shrink-0">✓</span>
          <div>
            <span className="text-[11px] text-slate-300 font-medium">Strongest pillar: </span>
            <span className="text-[11px] text-green-400">{analysis.strongest.label} ({Math.round(analysis.strongest.val*100)})</span>
          </div>
        </div>

        {/* Zayıf yön + öneri */}
        <div className="flex gap-2 items-start">
          <span className="text-red-400 text-sm shrink-0">✗</span>
          <div>
            <span className="text-[11px] text-slate-300 font-medium">Biggest gap: </span>
            <span className="text-[11px] text-red-400">{analysis.weakest.label} ({Math.round(analysis.weakest.val*100)})</span>
            <p className="text-[11px] text-slate-500 mt-0.5">{analysis.weakest.fix}</p>
          </div>
        </div>

        {/* Ball-dom uyarısı */}
        {analysis.ballDom > 1 && (
          <div className="flex gap-2 items-start">
            <span className="text-amber-400 text-sm shrink-0">⚠</span>
            <p className="text-[11px] text-amber-400/80">
              {analysis.ballDom} ball-dominant players competing for creation. Consider replacing one with an off-ball scorer or specialist.
            </p>
          </div>
        )}

        {/* Kimya notu */}
        {analysis.primaryFits.length > 0 && (
          <div className="flex gap-2 items-start">
            <span className="text-yellow-400 text-sm shrink-0">⭐</span>
            <p className="text-[11px] text-slate-400">
              {analysis.primaryFits.map(p=>p.PLAYER_NAME?.split(" ").slice(-1)[0]).join(", ")} played in their natural position — chemistry bonus earned.
            </p>
          </div>
        )}

        {/* Somut alternatif öneri */}
        {analysis.bestAlt && (() => {
          const {player:alt, season:altSeason, team:altTeam} = analysis.bestAlt;
          const altPct = Math.round((parseFloat(alt.overall_score)||0)*100);
          const altArch = alt.primary_arch || "unknown";
          return (
            <div className="flex gap-2 items-start">
              <span className="text-blue-400 text-sm shrink-0">💡</span>
              <div>
                <p className="text-[11px] text-slate-300 font-medium">
                  Better pick for {analysis.weakest.label}:
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  <span className="text-white font-semibold">{alt.PLAYER_NAME}</span>
                  {" "}<span className="text-slate-500">({altArch}, overall {altPct})</span>
                  {" "}— {altTeam} · {altSeason} — was available but not selected. Would have significantly improved your lineup's {analysis.weakest.label.toLowerCase()}.
                </p>
              </div>
            </div>
          );
        })()}

        {/* Genel değerlendirme */}
        <div className="pt-1 border-t border-slate-800">
          <p className="text-[11px] text-slate-500 italic">
            {pct>=85
              ? "Elite lineup construction. All five pillars covered — this roster would compete at the highest level."
              : pct>=75
              ? "Strong lineup with a clear identity. Minor gaps, but the core is functional."
              : pct>=65
              ? "Decent fit. You have a foundation, but one key piece could unlock this lineup's potential."
              : pct>=55
              ? "Some compatibility, but notable holes. The wheel wasn't kind — or the picks didn't mesh."
              : "Significant mismatches. Try again with a more balanced role distribution."}
          </p>
        </div>
      </div>

      <button onClick={onReset}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors">
        🔄 Play Again
      </button>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function LineupGame() {
  const { lang } = useLang();

  // Oyun fazı
  const [phase, setPhase] = useState("idle");
  // idle | spin_season | spin_team | fetching | pick_player | pick_pos | complete

  // Veriler
  const [seasons, setSeasons]       = useState([]);
  const [teamPool, setTeamPool]     = useState([]);
  const [players, setPlayers]       = useState([]);
  const [lineup, setLineup]         = useState({PG:null,SG:null,SF:null,PF:null,C:null});
  const [pickedPlayer, setPickedPlayer] = useState(null);
  const [fitResult, setFitResult]   = useState(null);
  const [statusMsg, setStatusMsg]   = useState("");
  const [primaryCount, setPrimaryCount] = useState(0); // kimya sayacı

  // Çark
  const [spinSeasons, setSpinS] = useState(false);
  const [spinTeams,   setSpinT] = useState(false);
  const [targetSIdx,  setTargetSIdx] = useState(0);
  const [targetTIdx,  setTargetTIdx] = useState(0);
  const [chosenSeason, setChosenSeason] = useState("");
  const [chosenTeam,   setChosenTeam]   = useState("");

  // Jokerler
  const [jokers, setJokers] = useState({reTeam:true,reYear:true,reBoth:true,double:true,discover:true});
  const [doubleActive, setDoubleActive]   = useState(false);
  const [discoverActive, setDiscoverActive] = useState(false);
  // Info modals
  const [modal, setModal] = useState(null); // "chemistry" | "jokers" | "archetype"

  const lineupRef = useRef(lineup);
  useEffect(()=>{ lineupRef.current=lineup; },[lineup]);
  const timerRef = useRef(null);
  // Her tur: {season, team, available:[...], picked: player}
  const roundHistoryRef = useRef([]);
  const pendingRoundRef = useRef(null); // fetchPlayers tamamlanınca set edilir

  const filledPositions = POSITIONS.filter(p=>lineup[p]!==null);
  const emptyPositions  = POSITIONS.filter(p=>lineup[p]===null);

  useEffect(()=>{
    fetch("/api/game/seasons").then(r=>r.json()).then(d=>setSeasons(d.seasons||["2025-26"])).catch(()=>setSeasons(["2025-26"]));
  },[]);

  // ── Oyuncu çek (ortak) ───────────────────────────────────────────────────
  const fetchPlayers = useCallback((season, team, onEmpty) => {
    setPhase("fetching");
    setStatusMsg("Loading players...");
    fetch(`/api/game/players?season=${encodeURIComponent(season)}&team=${encodeURIComponent(team)}`)
      .then(r=>r.json())
      .then(d=>{
        const taken=Object.values(lineupRef.current).filter(Boolean).map(x=>x.PLAYER_NAME);
        const list=(d.players||[]).filter(p=>!taken.includes(p.PLAYER_NAME));
        if(list.length===0){ onEmpty(); return; }
        setPlayers(list);
        pendingRoundRef.current={season,team,available:list};
        setPhase("pick_player");
        setStatusMsg("");
      })
      .catch(()=>{ setStatusMsg("API hatası"); setPhase("idle"); });
  },[lang]);

  // ── TAM SPIN: sezon → takım → oyuncular ──────────────────────────────────
  const startFullSpin = useCallback((fixedSeason=null, fixedTeam=null) => {
    if(seasons.length===0) return;
    clearTimeout(timerRef.current);

    // Eğer sabit sezon varsa sadece takım çarkı, yoksa iki çark
    const spinSeasonWheel = !fixedSeason;
    const sIdx = fixedSeason ? seasons.indexOf(fixedSeason) : Math.floor(Math.random()*seasons.length);
    setTargetSIdx(Math.max(0,sIdx));
    setSpinS(spinSeasonWheel);
    setSpinT(false);
    setPlayers([]);
    setPhase(spinSeasonWheel?"spin_season":"spin_team");
    setStatusMsg("");

    const afterSeasonStop = (season) => {
      setChosenSeason(season);
      setStatusMsg("Loading teams...");

      fetch(`/api/game/teams?season=${encodeURIComponent(season)}`)
        .then(r=>r.json())
        .then(d=>{
          const teams=d.teams||[];
          if(teams.length===0){ startFullSpin(); return; }
          setTeamPool(teams);

          // Sabit takım varsa onu seç, yoksa rastgele
          let tIdx;
          if(fixedTeam){
            const fi=teams.indexOf(fixedTeam);
            tIdx=fi>=0?fi:Math.floor(Math.random()*teams.length);
          } else {
            tIdx=Math.floor(Math.random()*teams.length);
          }
          setTargetTIdx(tIdx);
          setSpinT(true);
          setPhase("spin_team");
          setStatusMsg("");

          timerRef.current=setTimeout(()=>{
            const team=teams[tIdx];
            setSpinT(false);
            setChosenTeam(team);
            fetchPlayers(season, team, ()=>{
              setStatusMsg("No data, re-spinning...");
              setTimeout(()=>startFullSpin(),700);
            });
          },2000);
        })
        .catch(()=>startFullSpin());
    };

    if(fixedSeason){
      afterSeasonStop(fixedSeason);
    } else {
      timerRef.current=setTimeout(()=>{
        const season=seasons[Math.max(0,sIdx)];
        setSpinS(false);
        afterSeasonStop(season);
      },2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[seasons, lang, fetchPlayers]);

  // ── Joker: sadece takım çevir (mevcut takım hariç) ───────────────────────
  const jokerReTeam = useCallback(()=>{
    if(!jokers.reTeam||teamPool.length===0) return;
    setJokers(j=>({...j,reTeam:false}));
    clearTimeout(timerRef.current);
    // Mevcut takımı havuzdan çıkar
    const otherTeams = teamPool.filter(t => t !== chosenTeam);
    const pool = otherTeams.length > 0 ? otherTeams : teamPool;
    const tIdx = teamPool.indexOf(pool[Math.floor(Math.random()*pool.length)]);
    setTargetTIdx(Math.max(0,tIdx));
    setSpinT(true);
    setSpinS(false);
    setPlayers([]);
    setPhase("spin_team");

    timerRef.current=setTimeout(()=>{
      const team=teamPool[Math.max(0,tIdx)];
      setSpinT(false);
      setChosenTeam(team);
      fetchPlayers(chosenSeason,team,()=>{
        // hâlâ boş ise tekrar dene
        const alt=pool.filter(t=>t!==team);
        if(alt.length===0) return;
        const ai=teamPool.indexOf(alt[Math.floor(Math.random()*alt.length)]);
        setTargetTIdx(Math.max(0,ai));
        setSpinT(true);
        timerRef.current=setTimeout(()=>{
          const t2=teamPool[Math.max(0,ai)];
          setSpinT(false);
          setChosenTeam(t2);
          fetchPlayers(chosenSeason,t2,()=>{});
        },2000);
      });
    },2000);
  },[jokers.reTeam,teamPool,chosenTeam,chosenSeason,fetchPlayers]);

  // ── Joker: sadece yılı çevir (mevcut sezon hariç) ────────────────────────
  const jokerReYear = useCallback(()=>{
    if(!jokers.reYear||seasons.length===0) return;
    setJokers(j=>({...j,reYear:false}));
    const otherSeasons = seasons.filter(s => s !== chosenSeason);
    const pool = otherSeasons.length > 0 ? otherSeasons : seasons;
    const picked = pool[Math.floor(Math.random()*pool.length)];
    startFullSpin(picked, null);
  },[jokers.reYear,seasons,chosenSeason,startFullSpin]);

  // ── Joker: ikisini de çevir (mevcut sezon+takım kombinasyonu hariç) ──────
  const jokerReBoth = useCallback(()=>{
    if(!jokers.reBoth) return;
    setJokers(j=>({...j,reBoth:false}));
    // startFullSpin tamamen rastgele — sadece aynı sezonu almamaya çalış
    const otherSeasons = seasons.filter(s => s !== chosenSeason);
    const pool = otherSeasons.length > 0 ? otherSeasons : seasons;
    const picked = pool[Math.floor(Math.random()*pool.length)];
    startFullSpin(picked, null);
  },[jokers.reBoth,seasons,chosenSeason,startFullSpin]);

  // ── Joker: ikili seçim ────────────────────────────────────────────────────
  const jokerDouble = useCallback(()=>{
    if(!jokers.double) return;
    setJokers(j=>({...j,double:false}));
    setDoubleActive(true);
  },[jokers.double]);

  // ── Joker: discover (arketip + skor göster) ───────────────────────────────
  const jokerDiscover = useCallback(()=>{
    if(!jokers.discover) return;
    setJokers(j=>({...j,discover:false}));
    setDiscoverActive(true);
  },[jokers.discover]);

  // ── Oyuncu seç ────────────────────────────────────────────────────────────
  const handlePickPlayer = (player) => {
    if(pendingRoundRef.current){
      roundHistoryRef.current = [...roundHistoryRef.current, {...pendingRoundRef.current, picked: player}];
      pendingRoundRef.current = null;
    }
    setPickedPlayer(player);
    setDiscoverActive(false);
    setPhase("pick_pos");
  };

  // ── Pozisyon seç ──────────────────────────────────────────────────────────
  const handlePickPos = (pos) => {
    const isPrimary = getPrimaryPos(pickedPlayer) === pos;
    if(isPrimary) setPrimaryCount(c=>c+1);

    const enriched={...pickedPlayer,_season:chosenSeason,_team:chosenTeam,_isPrimary:isPrimary};
    const newLineup={...lineupRef.current,[pos]:enriched};
    setLineup(newLineup);
    lineupRef.current=newLineup;
    setPickedPlayer(null);

    const filled=POSITIONS.filter(p=>newLineup[p]!==null);
    if(filled.length===5){
      const fit=computeLineupFit(POSITIONS.map(p=>newLineup[p]));
      setFitResult(fit);
      setPhase("complete");
    } else if(doubleActive){
      // İkili seçim: aynı havuzdan tekrar seç
      setPlayers(prev=>prev.filter(p=>p.PLAYER_NAME!==pickedPlayer.PLAYER_NAME));
      setDoubleActive(false);
      setPhase("pick_player");
    } else {
      setTimeout(()=>startFullSpin(),400);
    }
  };

  const resetGame = () => {
    clearTimeout(timerRef.current);
    setLineup({PG:null,SG:null,SF:null,PF:null,C:null});
    lineupRef.current={PG:null,SG:null,SF:null,PF:null,C:null};
    setFitResult(null);
    setPlayers([]);
    setPickedPlayer(null);
    setChosenSeason("");
    setChosenTeam("");
    setTeamPool([]);
    setStatusMsg("");
    setSpinS(false);
    setSpinT(false);
    setPrimaryCount(0);
    setJokers({reTeam:true,reYear:true,reBoth:true,double:true,discover:true});
    setDoubleActive(false);
    setDiscoverActive(false);
    roundHistoryRef.current=[];
    pendingRoundRef.current=null;
    setPhase("idle");
  };

  const isSpinPhase = phase==="spin_season"||phase==="spin_team"||phase==="fetching";

  return (
    <div className="min-h-full p-4 sm:p-6 max-w-xl mx-auto space-y-3">

      {/* Başlık */}
      <div>
        <h1 className="text-xl font-bold text-white">Lineup Builder</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Wheels pick a random season + team. Pick one player per round and slot them into a position.
        </p>
      </div>

      {/* Lineup bar */}
      <div className="flex gap-1">
        {POSITIONS.map(pos=><LineupSlot key={pos} pos={pos} player={lineup[pos]}/>)}
      </div>

      {/* İlerleme */}
      {phase!=="idle"&&phase!=="complete"&&(
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{width:`${(filledPositions.length/5)*100}%`}}/>
          </div>
          <span className="text-[10px] text-slate-500">{filledPositions.length}/5</span>
          {primaryCount>0&&<span className="text-[10px] text-yellow-400">⭐×{primaryCount}</span>}
        </div>
      )}

      {/* Jokerler (sadece pick_player fazında) */}
      {phase==="pick_player"&&(
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2">
          <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5 text-center">Jokers</div>
          <div className="flex gap-1.5 justify-center">
            <JokerBtn icon="🔄" label="Team"     available={jokers.reTeam}   onClick={jokerReTeam}/>
            <JokerBtn icon="📅" label="Year"     available={jokers.reYear}   onClick={jokerReYear}/>
            <JokerBtn icon="⚡" label="Both"     available={jokers.reBoth}   onClick={jokerReBoth}/>
            <JokerBtn icon="👥" label="Pick 2"   available={jokers.double&&!doubleActive&&emptyPositions.length>=2} onClick={jokerDouble}/>
            <JokerBtn icon="🔍" label="Discover" available={jokers.discover&&!discoverActive} onClick={jokerDiscover}/>
          </div>
          {doubleActive&&(
            <div className="text-center text-xs text-amber-400 mt-1.5 animate-pulse">
              👥 Double pick active — choose 2 players
            </div>
          )}
          {discoverActive&&(
            <div className="text-center text-xs text-emerald-400 mt-1.5 animate-pulse">
              🔍 Discover active — archetypes and scores revealed this round
            </div>
          )}
        </div>
      )}

      {/* Info modals */}
      <InfoModal open={modal==="chemistry"} onClose={()=>setModal(null)} title="⭐ Chemistry">
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>Each player has a <span className="text-white font-medium">primary position</span> based on their archetype and real-life role. When you slot a player into their primary position, you earn a chemistry point.</p>
          <p>At the end of the game, each chemistry point adds <span className="text-yellow-300 font-medium">+2 to your final score</span> (up to +10 for a perfect lineup).</p>
          <p className="text-slate-400 text-xs">A star (⭐) marks the primary slot button. You can still place players in other positions — sometimes a mismatched role is the right tactical call.</p>
        </div>
      </InfoModal>

      <InfoModal open={modal==="jokers"} onClose={()=>setModal(null)} title="🃏 Jokers">
        <div className="space-y-3">
          {[
            ["🔄","Team","Re-spin the team wheel. Get a different roster from the same season."],
            ["📅","Year","Re-spin the season wheel. Jump to a completely different era."],
            ["⚡","Both","Re-spin both wheels at once. Full reset of the current round."],
            ["👥","Pick 2","Choose two players from the current roster in a single round."],
            ["🔍","Discover","Reveal every player's archetype and overall score this round, then choose with full information."],
          ].map(([icon,name,desc])=>(
            <div key={name} className="flex gap-3 items-start">
              <span className="text-xl shrink-0">{icon}</span>
              <div>
                <div className="text-white font-medium text-sm">{name}</div>
                <div className="text-slate-400 text-xs leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-800">Each joker can be used once per game.</p>
        </div>
      </InfoModal>

      <InfoModal open={modal==="archetype"} onClose={()=>setModal(null)} title="??? Archetypes">
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>Player archetypes are <span className="text-white font-medium">hidden during the game</span> and revealed after your 5th pick. Read the stats and position clues to guess the role.</p>
          <p>Each archetype is a percentile score built from real NBA tracking and box-score data. The 12 core archetypes range from <span className="text-orange-300">Engine</span> (usage, creation) to <span className="text-blue-300">Anchor</span> (rim protection, defensive rating).</p>
          <p className="text-slate-400 text-xs">The lineup is scored across five pillars: Creation, Spacing, Defense, Finishing, and Role Fit. Archetypes that complement each other score higher than redundant ones.</p>
          <div className="flex gap-2 pt-1 border-t border-slate-800">
            <a href="/glossary" className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2">Full Glossary</a>
            <span className="text-slate-700">·</span>
            <a href="/about" className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2">About the System</a>
          </div>
        </div>
      </InfoModal>

      {/* === IDLE === */}
      {phase==="idle"&&(
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="text-[10px] text-slate-600 uppercase tracking-widest">How it works</div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Each round, two wheels spin: one for <span className="text-blue-400 font-medium">season</span>, one for <span className="text-blue-400 font-medium">team</span>. Pick one player from that roster, then choose their position.
            </p>
            <p className="text-sm text-slate-400 leading-relaxed">
              After 5 picks, your lineup is scored across five pillars: <span className="text-slate-300">Creation · Spacing · Defense · Finishing · Role Fit</span>. Each player also receives an <span className="text-amber-300 font-medium">Era Fit</span> score — how well their archetype aligned with the meta of their era. Build the highest-scoring lineup you can; the wheels decide who you choose from.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                {key:"chemistry", icon:"⭐", title:"Chemistry",   desc:"Slot players into natural positions for a score bonus"},
                {key:"jokers",    icon:"🃏", title:"Jokers",      desc:"Five one-time abilities to reshape your options"},
                {key:"archetype", icon:"???",title:"Archetypes",  desc:"Hidden until the end — revealed alongside your score"},
              ].map(({key,icon,title,desc})=>(
                <button key={key} onClick={()=>setModal(key)}
                  className="bg-slate-800/60 hover:bg-slate-700/60 rounded-lg p-2.5 text-left transition-colors border border-slate-700/50 hover:border-slate-600">
                  <div className="text-[13px] font-bold text-white mb-0.5">{icon} {title}</div>
                  <div className="text-[10px] text-slate-500 leading-relaxed">{desc}</div>
                </button>
              ))}
            </div>
            <div className="pt-1 border-t border-slate-800">
              <p className="text-[11px] text-slate-500 italic">
                Archetypes that win together: Creation + Spacing is the foundation. You need at least one true playmaker, 2 to 3 shooters, and a credible defensive anchor. Ball-dominant duos hurt — redundancy kills lineups.
              </p>
            </div>
          </div>
          <div className="text-center">
            <button onClick={()=>startFullSpin()} disabled={seasons.length===0}
              className="px-10 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl font-semibold text-base transition-colors">
              {seasons.length===0?"Loading...":"🎰 Start Game"}
            </button>
          </div>
        </div>
      )}

      {/* === SPIN / FETCHING === */}
      {isSpinPhase&&(
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-center gap-8 mb-4">
            <SpinWheel items={seasons} spinning={spinSeasons} targetIdx={targetSIdx} label={lang==="tr"?"Sezon":"Season"}/>
            <SpinWheel items={teamPool.length>0?teamPool:["..."]} spinning={spinTeams} targetIdx={targetTIdx} label={lang==="tr"?"Takım":"Team"}/>
          </div>
          <p className="text-center text-xs text-slate-500 animate-pulse">
            {statusMsg||(phase==="spin_season"?"Picking season...":phase==="spin_team"?"Picking team...":"Loading...")}
          </p>
        </div>
      )}

      {/* === PICK PLAYER === */}
      {phase==="pick_player"&&(
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-mono px-2 py-0.5 rounded-lg">{chosenSeason}</span>
            <span className="bg-slate-800 border border-slate-700 text-white text-xs font-mono px-2 py-0.5 rounded-lg">{chosenTeam}</span>
            <span className="text-xs text-slate-500">— pick a player</span>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {players.map((p,i)=><PlayerCard key={i} player={p} season={chosenSeason} discover={discoverActive} onClick={()=>handlePickPlayer(p)} dimmed={false}/>)}
          </div>
        </div>
      )}

      {/* === PICK POSITION === */}
      {phase==="pick_pos"&&pickedPlayer&&(()=>{
        const eligible=getEligiblePos(pickedPlayer);
        const primary=eligible[0];
        return (
          <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-white font-semibold">{pickedPlayer.PLAYER_NAME}</div>
                <div className="text-xs text-slate-500 mt-0.5">{chosenSeason} · {chosenTeam}</div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {eligible.map(p=>(
                    <span key={p} className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${POS_COLORS[p]||""}`}>
                      {p}{p===primary?" ★":""}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={()=>{setPickedPlayer(null);setPhase("pick_player");}}
                className="text-slate-600 hover:text-slate-300 text-xs">← Back</button>
            </div>
            <div className="text-xs text-slate-500 mb-2">
              Which position? (★ = primary → chemistry bonus)
            </div>
            <div className="flex gap-2 flex-wrap">
              {emptyPositions.map(pos=>{
                const isElig=eligible.includes(pos);
                const isPrim=pos===primary;
                return (
                  <button key={pos} onClick={()=>handlePickPos(pos)}
                    className={`flex-1 min-w-[3rem] py-2.5 border rounded-xl font-bold text-sm transition-all
                      ${isPrim?"bg-amber-900/30 border-amber-500/60 text-amber-200 hover:bg-amber-600 hover:text-white"
                               :isElig?"bg-slate-800 border-slate-600 text-white hover:bg-blue-700 hover:border-blue-500"
                                      :"bg-slate-900/50 border-slate-800 text-slate-500 hover:bg-slate-800"}`}>
                    {pos}{isPrim?" ⭐":""}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* === COMPLETE === */}
      {phase==="complete"&&fitResult&&(
        <ScoreReveal fit={fitResult} lineup={lineup} primaryCount={primaryCount} roundHistory={roundHistoryRef.current} onReset={resetGame} lang={lang}/>
      )}
    </div>
  );
}
