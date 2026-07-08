import { useState, useEffect, useRef, useCallback } from "react";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { ERAS, ERA_META_BLURB, ERA_PILLAR_WEIGHTS, getEra } from "../game/eras";
import { computePlayerFit, computeLineupFit, computeAffinity } from "../game/lineupScore";
import SeasonSimPanel from "../game/SeasonSimPanel";
import { COACHES } from "../game/coaches";
import { getPlayerTags, TAG_INFO, isVersatile } from "../game/awards";
import CourtBoard from "../game/CourtBoard";
import { START_BUDGET, MIN_COST, costColor, totalSpent, maxSpendNow, applyTeamPricing, priceOf } from "../game/salary";
import {
  StarIcon, CoachIcon, TrophyIcon, CrownIcon, CapIcon, TargetIcon, WheelIcon,
  CardsIcon, TagIcon, DnaIcon, RefreshIcon, CalendarIcon, BoltIcon, UsersIcon,
  SearchIcon, LoopIcon, GapIcon, WarnIcon, EyeIcon, LinkIcon, CheckIcon,
  DownloadIcon, XLogoIcon, DiceIcon,
} from "../game/GameIcons";

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

const _POS5 = ["PG","SG","SF","PF","C"];

// Birincil mevki: backend POS5 → POSITION eşleme → arketip fallback
function getPrimaryPos(player) {
  const p = String(player.POS5 || "").toUpperCase().trim();
  if (_POS5.includes(p)) return p;
  const raw = String(player.POSITION || "").toUpperCase().trim();
  if (raw && POS_STRING_MAP[raw]) return POS_STRING_MAP[raw][0];
  return (ARCH_POSITIONS[player.primary_arch] || POSITIONS)[0];
}
// İkincil mevki: backend POS5_SECONDARY (BBref "SG-PG"/"PF-C" verisi + stat
// heuristik). Yoksa POSITION eşlemesinin 2. mevkisi; o da yoksa null.
function getSecondaryPos(player) {
  const s = String(player.POS5_SECONDARY || "").toUpperCase().trim();
  if (_POS5.includes(s) && s !== getPrimaryPos(player)) return s;
  const raw = String(player.POSITION || "").toUpperCase().trim();
  const mapped = POS_STRING_MAP[raw];
  if (mapped && mapped[1] && mapped[1] !== getPrimaryPos(player)) return mapped[1];
  return null;
}
// Uygun mevkiler = [birincil, (varsa) ikincil]
function getEligiblePos(player) {
  const prim = getPrimaryPos(player);
  const sec  = getSecondaryPos(player);
  return sec ? [prim, sec] : [prim];
}

// ── Faz 2: bench + pozisyon cezası ───────────────────────────────────────────
const BENCH_SLOTS = ["B1","B2","B3","B4"];
const ALL_SLOTS   = [...POSITIONS, ...BENCH_SLOTS];

// VERSATILE artık "her mevki bedava" DEĞİL — sadece İKİNCİL mevkide ceza yemez.
function isFlex(player) { return isVersatile(player); }

// Birincil = ceza yok; ikincil = versatile ? yok : −10%.
// Versatile ayrıca span'e bitişik 3. mevkide −25% yerine −10% yer (küçük upgrade);
// daha uzak mevkiler herkes için −25% (her yeri oynayamaz).
function posPenaltyFor(player, pos) {
  if (!POSITIONS.includes(pos)) return 1.0;   // bench
  const prim = getPrimaryPos(player);
  if (pos === prim) return 1.0;
  const sec = getSecondaryPos(player);
  if (sec && pos === sec) return isVersatile(player) ? 1.0 : 0.90;
  // Ne birincil ne ikincil — birincil/ikincil bloğuna uzaklık
  const idx = POSITIONS.indexOf(pos);
  const spanDist = Math.min(
    Math.abs(idx - POSITIONS.indexOf(prim)),
    sec ? Math.abs(idx - POSITIONS.indexOf(sec)) : 99,
  );
  if (isVersatile(player) && spanDist === 1) return 0.90;   // versatile 3. mevki −10%
  return 0.75;   // mevki dışı −25%
}

const POS_COLORS = {
  PG:"bg-blue-900/60 text-blue-300 border-blue-700/50",
  SG:"bg-sky-900/60 text-sky-300 border-sky-700/50",
  SF:"bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  PF:"bg-amber-900/60 text-amber-300 border-amber-700/50",
  C: "bg-red-900/60 text-red-300 border-red-700/50",
};

// ── Skorlama çekirdeği ────────────────────────────────────────────────────────
// computePlayerFit / computeLineupFit / computeAffinity → game/lineupScore.js'e
// taşındı (v3.9 / G3): UI ve headless backtest (scripts/backtest.mjs) aynı saf
// mantığı tek kaynaktan kullanır.

// ── Era sistemi — src/game/eras.js'ten import edilir ─────────────────────────
// (Era Fit paneli v3.6'da kaldırıldı; Faz B'de era etkisi dönem-uzaklığına taşınacak)

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
      <div className="text-[10.5px] text-slate-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="relative w-32 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 z-10" style={{background:"linear-gradient(to bottom,#020817,transparent)"}}/>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 z-10" style={{background:"linear-gradient(to top,#020817,transparent)"}}/>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 border-y z-0"
          style={{borderColor:"var(--accent-border)",background:"var(--accent-dim)"}}/>
        <div className="py-1">
          {visible.map(({off,item})=>(
            <div key={off} className={`h-10 flex items-center justify-center font-mono px-1 text-center text-xs ${off===0?"font-bold":""}`}
              style={{opacity:Math.max(0.07,1-Math.abs(off)*0.40), color: off===0 ? "var(--accent)" : "#64748b"}}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Lineup slot ───────────────────────────────────────────────────────────────
function LineupSlot({ pos, player, bench=false, selected=false, canTap=false, onTap }) {
  const isPrimary = !bench && player && getPrimaryPos(player) === pos;
  const posLabel = bench ? "BENCH" : pos;
  return (
    <div onClick={()=>canTap&&onTap&&onTap(pos)}
      className={`flex-1 rounded-lg p-1.5 border text-center min-w-0 transition-all
      ${selected?"border-amber-400 shadow-[0_0_8px_rgba(245,158,11,.35)]":player?(bench?"border-slate-600/50 bg-slate-800/30":"border-amber-500/40 bg-amber-900/10"):"border-slate-800 bg-slate-900/60"}
      ${canTap?"cursor-pointer":""}`}>
      <div className={`text-[8.5px] uppercase tracking-wider mb-0.5 ${bench?"text-slate-600":POS_COLORS[pos]?.split(" ")[1]||"text-slate-600"}`}>{posLabel}</div>
      {player ? (
        <>
          <div className="text-[10.5px] text-white font-semibold truncate leading-tight">
            {player.PLAYER_NAME?.split(" ").slice(-1)[0]}
          </div>
          <div className="text-[8.5px] text-slate-500">{(player._season||"").slice(0,4)}</div>
          {isPrimary && <div className="text-yellow-400 flex justify-center mt-0.5"><StarIcon size={9} /></div>}
        </>
      ) : (
        <div className="text-slate-700 text-sm">—</div>
      )}
    </div>
  );
}

// ── Oyuncu satırı (eraball tarzı liste) ──────────────────────────────────────
function headshotUrl(p) {
  return p.PLAYER_ID ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.PLAYER_ID}.png` : null;
}

function posGroupOf(p) {
  const raw = String(p?.POS5 || p?.POSITION || "").toUpperCase().trim();
  if (raw === "C" || raw.startsWith("CENTER")) return "C";
  if (raw === "PG" || raw === "SG" || raw.startsWith("G") || raw.includes("GUARD")) return "G";
  return "F";
}

// Kompakt tag rozeti — baş harf + renk (uzun label yerine)
function TagBadge({ t }) {
  return (
    <span title={t.detail}
      className="inline-flex items-center justify-center text-[8.5px] font-bold rounded leading-none shrink-0 px-1 h-[15px] min-w-[15px]"
      style={{ color: t.color, background: t.color + "22", border: `1px solid ${t.color}66` }}>
      {t.abbr}
    </span>
  );
}

function PlayerRow({ player, discover, onClick, cost, unaffordable, highlightStat }) {
  const [imgOk, setImgOk] = useState(true);
  const stat = (k) => {
    const v = player[k];
    if (v == null || isNaN(+v)) return "—";
    if (k === "FG3_PCT") return `${Math.round(+v * 100)}%`;
    return (+v).toFixed(1);
  };
  const overall = player.overall_score != null ? Math.round(player.overall_score * 100) : null;
  const tags = getPlayerTags(player);
  const url = headshotUrl(player);
  const cell = (k) => (
    <span className={`w-9 text-right tabular-nums shrink-0 text-xs
      ${highlightStat === k ? "font-bold" : "text-slate-500"}`}
      style={highlightStat === k ? { color: "#e2b34c" } : {}}>
      {stat(k)}
    </span>
  );
  return (
    <button onClick={onClick} disabled={unaffordable}
      className={`w-full min-w-[560px] flex items-center gap-2 pr-3 py-2.5 border-b text-left transition-colors
        ${unaffordable ? "opacity-30 cursor-not-allowed" : "hover:bg-slate-800/70 cursor-pointer group"}`}
      style={{ borderColor: "rgba(30,41,59,.6)" }}>
      {/* Sabit sol blok (yatay kaydırmada pinli): avatar + isim + arketip + rozetler */}
      <div className="sticky left-0 z-10 flex items-center gap-2 pl-3 pr-2 py-0.5 shrink-0 w-[240px]"
        style={{ background: "var(--bg-surface, #0f172a)" }}>
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-slate-700 bg-slate-800 flex items-center justify-center">
          {url && imgOk ? (
            <img src={url} alt="" loading="lazy" onError={() => setImgOk(false)}
              className="w-full h-full object-cover object-top" />
          ) : (
            <span className="text-[11px] font-bold text-slate-500">
              {player.PLAYER_NAME?.split(" ").map(w => w[0]).slice(0, 2).join("")}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white truncate leading-tight">{player.PLAYER_NAME}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-slate-500 shrink-0">{player.POSITION || player.POS5 || ""}</span>
            <span className="text-[10px] text-blue-400 font-medium truncate">{player.primary_arch || "—"}</span>
            {tags.slice(0, 3).map(t => <TagBadge key={t.key} t={t} />)}
          </div>
        </div>
      </div>
      {/* TAG sayısı sütunu */}
      <span className="w-8 text-center shrink-0 text-xs tabular-nums"
        title={tags.length ? tags.map(t => t.label).join(" · ") : "No tags"}>
        {tags.length ? <span className="text-slate-300 font-bold">{tags.length}</span> : <span className="text-slate-700">–</span>}
      </span>
      {/* Sözleşme maliyeti (Salary Cap) */}
      {cost != null && (
        <span className="text-xs font-black shrink-0 tabular-nums px-1 py-0.5 rounded"
          style={{ color: costColor(cost), background: costColor(cost) + "14", border: `1px solid ${costColor(cost)}44` }}
          title={unaffordable ? `Costs ${cost}% — over your spendable cap` : `Contract: ${cost}% of the cap`}>
          {cost}%
        </span>
      )}
      {/* Discover: yalnızca overall'ı ifşa eder */}
      {discover && overall != null && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-700/50 bg-violet-900/30 text-violet-300 font-bold shrink-0">{overall}</span>
      )}
      {/* İstatistikler */}
      {cell("PTS")}{cell("REB")}{cell("AST")}{cell("FG3_PCT")}{cell("STL")}{cell("BLK")}
    </button>
  );
}

// [alan, etiket] — 3P% alan adı FG3_PCT
const SORT_KEYS = [
  ["TAGGED", "TAGGED"], ["PTS", "PTS"], ["REB", "REB"], ["AST", "AST"],
  ["FG3_PCT", "3P%"], ["STL", "STL"], ["BLK", "BLK"],
];

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
function JokerBtn({ Icon, label, available, onClick }) {
  return (
    <button onClick={onClick} disabled={!available}
      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border text-center transition-all
        ${available?"border-amber-700/60 bg-amber-900/20 hover:bg-amber-900/40 cursor-pointer text-amber-300"
                  :"border-slate-800 bg-slate-900/40 cursor-not-allowed text-slate-600"}`}>
      <Icon size={16} />
      <span className="text-[9.5px] leading-tight whitespace-nowrap">{label}</span>
    </button>
  );
}

// ── Post-game analiz ──────────────────────────────────────────────────────────
// Pillar → hangi score_ kolonları yüksek olmalı (bestAlt önerisi için)
const PILLAR_SCORE_KEYS = {
  creation:       ["Engine","Ecosystem","Creator","Hub","Initiator"],
  spacing:        ["Spacer","Three-Level","Gravity","Shotmaker"],
  rim_protection: ["Anchor","Force"],
  perimeter_d:    ["Stopper","Two-Way","Point-of-Attack","Defensive"],
  finishing:      ["Finisher","Rim Runner","Force"],
};

function analyzeLineup(fit, lineup, roundHistory=[], simEra=null) {
  const filled = POSITIONS.map(p=>lineup[p]).filter(Boolean);
  const W = ERA_PILLAR_WEIGHTS[(simEra||ERAS[5]).id];
  const pillars = [
    { key:"creation",  label:"Creation",  val:fit.creation,  w:W.creation,
      fix:"No true playmaker. An Engine, Ecosystem, Hub or Creator covers this." },
    { key:"spacing",   label:"Spacing",   val:fit.spacing,   w:W.spacing,
      fix:`${fit.nShooters} shooter${fit.nShooters===1?"":"s"} — optimal is 2–3. A Spacer, 3-and-D or Gravity player covers this.` },
    { key:"rim_protection", label:"Rim Protection", val:fit.rim_protection, w:W.rim_protection,
      fix:"No interior deterrent. An Anchor or Force protects the rim." },
    { key:"perimeter_d", label:"Perimeter D", val:fit.perimeter_d, w:W.perimeter_d,
      fix:"No on-ball stopper. A Stopper, Two-Way or Point-of-Attack defender covers the perimeter." },
    { key:"finishing", label:"Finishing", val:fit.finishing, w:W.finishing,
      fix:"No one finishing at the rim. A Finisher, Rim Runner or Force covers this." },
  ];

  // Era-ağırlıklı sıralama: açık = önem × eksik; silah = önem × değer.
  // Small Ball'da 0.5'lik spacing, 0.5'lik finishing'den ÇOK daha büyük dert.
  const weakest   = [...pillars].sort((a,b)=>(b.w*(1-b.val))-(a.w*(1-a.val)))[0];
  const strongest = [...pillars].sort((a,b)=>(b.w*b.val)-(a.w*a.val))[0];

  const ballDomPlayers = fit.ballDomPlayers || filled.filter(p => {
    const _bs = (k) => parseFloat(p[`score_${k}`] ?? 0) || 0;
    return Math.max(_bs("Engine") * 1.05, _bs("Ecosystem")) >= 0.80;
  }).map(p => p.PLAYER_NAME || "?");
  const ballDom = ballDomPlayers.length;

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

  return { weakest, strongest, ballDom, ballDomPlayers, primaryFits, byScore, pillars, bestAlt };
}

// ── Sonuç ekranı ──────────────────────────────────────────────────────────────
function ScoreReveal({ fit, lineup, primaryCount, roundHistory, onReset, lang, affinityMatrix, simEra, coach, mode="classic" }) {
  const { isLoggedIn, token } = useAuth();
  const analysis  = analyzeLineup(fit, lineup, roundHistory, simEra);
  const chemBonus = primaryCount * 0.02;
  const rawScore  = fit.lineupScore;
  const totalScore = Math.min(1, rawScore + chemBonus);
  const pct  = Math.round(totalScore * 100);
  // Eşikler ağırlıklı-toplam bandına göre: tipik çekiliş ~66-72 (C+/B), iyi ~78 (A), efsane 85+ (S)
  const grade = pct>=85?"S":pct>=78?"A":pct>=70?"B":pct>=62?"C":"D";

  // Archetype affinity score — v3.8: her oyuncunun TOP-3 arketibinin ağırlıklı
  // profili üzerinden (sadece birincil arketip değil). Çift affinity'si iki
  // oyuncunun tüm arketip-çifti kombinasyonlarının ağırlıklı ortalamasıdır.
  const affinityScore = (() => {
    const a = computeAffinity(POSITIONS.map(p => lineup[p]), affinityMatrix);
    return a == null ? null : Math.round(a * 100);
  })();

  const [leaderboard, setLeaderboard] = useState(null);

  // Auto-save score (once on mount, if logged in)
  useEffect(() => {
    if (!isLoggedIn || !token) return;
    const players = ALL_SLOTS.map(p => lineup[p]).filter(Boolean).map(p => p.PLAYER_NAME);
    fetch("/api/game/score", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pct, grade, lineup: players, mode }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaderboard — mod bazlı
  useEffect(() => {
    fetch(`/api/leaderboard?limit=10&mode=${mode}`).then(r => r.json()).then(d => setLeaderboard(d.entries || [])).catch(() => {});
  }, [mode]);
  const gColor = pct>=85?"text-blue-300":pct>=78?"text-sky-300":pct>=70?"text-emerald-300":pct>=62?"text-amber-300":"text-red-400";

  // Per-oyuncu → pozisyona göre eşle (computeLineupFit POSITIONS sırasında çağrıldı)
  const perPlayerMap = {};
  POSITIONS.forEach((pos, i) => {
    if (lineup[pos] && fit.perPlayer?.[i]) perPlayerMap[pos] = fit.perPlayer[i];
  });

  const coveragePct = Math.round((fit.coverage || 0) * 100);
  const qualityPct  = Math.round((fit.avgQuality || 0) * 100);

  return (
    <div className="space-y-4">
      {/* Ana skor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Lineup Fit</div>
        {simEra&&(
          <div className="mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded border ${simEra.bg} ${simEra.color}`}>
              built for the {simEra.label}
            </span>
          </div>
        )}
        <div className={`text-7xl font-black mb-1 ${pct>=78?"text-blue-400":pct>=62?"text-sky-400":"text-slate-300"}`}>{pct}</div>
        <div className={`text-3xl font-bold mb-1 ${gColor}`}>{grade}</div>
        {chemBonus > 0 && (
          <div className="text-xs text-yellow-400 mb-2">
            <span className="inline-flex items-center gap-1"><StarIcon size={11} /> Chemistry Bonus: +{primaryCount} primary slot (+{Math.round(chemBonus*100)} pts)</span>
          </div>
        )}

        {/* Skor bileşenleri: 45% kalite + 40% kapsama + 15% rol — görsel özet */}
        <div className="mt-5 grid grid-cols-3 gap-2 max-w-sm mx-auto">
          {[
            ["Quality",  qualityPct,                      "45%"],
            ["Coverage", coveragePct,                     "40%"],
            ["Role Fit", Math.round(fit.roleFit * 100),   "15%"],
          ].map(([label, val, w]) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-center">
              <div className={`text-2xl font-black ${val>=75?"text-blue-300":val>=55?"text-slate-200":"text-red-400"}`}>{val}</div>
              <div className="text-[10.5px] text-slate-400 mt-0.5">{label}</div>
              <div className="text-[9.5px] text-slate-600">weight {w}</div>
            </div>
          ))}
        </div>

      </div>

      {/* Sezon simülasyonu (v3.5) */}
      <SeasonSimPanel
        players={POSITIONS.map(p => lineup[p]).filter(Boolean)}
        bench={BENCH_SLOTS.map(p => lineup[p]).filter(Boolean)}
        coach={coach}
        simEra={simEra || ERAS[5]}
        fit={fit}
        affinity01={affinityScore != null ? affinityScore / 100 : null}
      />

      {/* Roster Breakdown — tek birleşik tablo (lineup + kalite + era + tag) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] text-slate-400 uppercase tracking-widest">Roster Breakdown</div>
          <div className="text-xs text-slate-500">
            <span className="text-slate-600">ovr → qual · </span>avg <span className="text-white font-bold">{qualityPct}</span>
          </div>
        </div>
        <div className="space-y-1">
          {POSITIONS.map(pos=>{
            const p=lineup[pos]; if(!p) return null;
            const pp=perPlayerMap[pos] || computePlayerFit(p, simEra);
            const qPct=Math.round(pp.quality*100);
            const base=Math.round((parseFloat(p.overall_score)||0)*100);
            const isPrimary=getPrimaryPos(p)===pos;
            const pen=p._posPenalty??1;
            const tags=getPlayerTags(p).slice(0,2);
            return (
              <div key={pos} className="flex items-center gap-2.5 py-1.5 border-b last:border-b-0" style={{borderColor:"rgba(30,41,59,.5)"}}>
                <span className={`text-[10px] font-bold px-1.5 py-1 rounded border shrink-0 w-8 text-center ${POS_COLORS[pos]||""}`}>{pos}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] text-white font-semibold truncate">{p.PLAYER_NAME}</span>
                    {isPrimary&&<span className="text-yellow-400 shrink-0"><StarIcon size={11} /></span>}
                    {pen<1&&<span className="text-[10px] text-red-400 shrink-0 font-medium">{pen<=0.75?"−25% pos":"−10% pos"}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-blue-400 font-medium">{p.primary_arch||"—"}</span>
                    <span className={`text-[10px] ${pp.era.color}`}>{pp.era.short} '{(p._season||"").slice(2,4)}</span>
                    {pp.timeless&&<span className="text-[10px] text-purple-400" title="Timeless — era distance fully ignored">TL</span>}
                    {!pp.timeless&&pp.fitShift<0&&<span className="text-[10px] text-emerald-400" title="Archetype fits this era — one era closer">fits</span>}
                    {pp.dist>0&&!pp.timeless&&<span className="text-[10px] text-amber-500">−{pp.dist} era</span>}
                    {tags.map(t=>(
                      <span key={t.key} title={t.detail} className="text-[8.5px] px-1 py-px rounded font-bold leading-none"
                        style={{color:t.color,background:t.color+"1a",border:`1px solid ${t.color}44`}}>
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
                {/* base overall → quality (oyun bitti, ham overall açık) */}
                <span className="text-[10px] text-slate-500 tabular-nums shrink-0 w-11 text-right"
                  title={`Raw overall ${base} (hidden during the draft) → ${qPct} after era distance & position`}>
                  <span className="text-slate-600">ovr</span> {base}
                </span>
                <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden shrink-0">
                  <div className="h-full rounded-full" style={{width:`${qPct}%`,background:qPct>=75?"#1D428A":qPct>=55?"#2a3d6b":"#7f1d1d"}}/>
                </div>
                <span className={`text-[13px] font-bold w-7 text-right shrink-0 ${qPct>=75?"text-blue-300":qPct>=55?"text-slate-200":"text-red-400"}`}>{qPct}</span>
              </div>
            );
          })}
          {/* Bench satırları */}
          {BENCH_SLOTS.map(b=>{
            const p=lineup[b]; if(!p) return null;
            const pp=computePlayerFit(p, simEra);
            const qPct=Math.round(pp.quality*100);
            const base=Math.round((parseFloat(p.overall_score)||0)*100);
            const tags=getPlayerTags(p,{onBench:true}).slice(0,2);
            return (
              <div key={b} className="flex items-center gap-2.5 py-1.5 border-b last:border-b-0 opacity-75" style={{borderColor:"rgba(30,41,59,.5)"}}>
                <span className="text-[10px] font-bold px-1.5 py-1 rounded border border-slate-700 text-slate-500 shrink-0 w-8 text-center">BN</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-200 font-semibold truncate">{p.PLAYER_NAME}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-blue-400/70">{p.primary_arch||"—"}</span>
                    <span className={`text-[10px] ${pp.era.color}`}>{pp.era.short} '{(p._season||"").slice(2,4)}</span>
                    {pp.timeless&&<span className="text-[10px] text-purple-400">TL</span>}
                    {!pp.timeless&&pp.fitShift<0&&<span className="text-[10px] text-emerald-400" title="Archetype fits this era">fits</span>}
                    {pp.dist>0&&!pp.timeless&&<span className="text-[10px] text-amber-500">−{pp.dist} era</span>}
                    {tags.map(t=>(
                      <span key={t.key} title={t.detail} className="text-[8.5px] px-1 py-px rounded font-bold leading-none"
                        style={{color:t.color,background:t.color+"1a",border:`1px solid ${t.color}44`}}>
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 tabular-nums shrink-0 w-11 text-right"
                  title={`Raw overall ${base} → ${qPct} after era distance & position`}>
                  <span className="text-slate-600">ovr</span> {base}
                </span>
                <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden shrink-0">
                  <div className="h-full rounded-full" style={{width:`${qPct}%`,background:"#334155"}}/>
                </div>
                <span className="text-[13px] font-bold w-7 text-right shrink-0 text-slate-400">{qPct}</span>
              </div>
            );
          })}
          {/* Koç */}
          {coach&&(
            <div className="flex items-center gap-2.5 pt-2">
              <span className="shrink-0 w-8 flex justify-center text-slate-300"><CoachIcon size={15} /></span>
              <span className="text-[13px] text-white font-semibold flex-1 truncate">{coach.name}</span>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">O:{coach.off} · D:{coach.def}</span>
              {coach.champs>0&&<span className="text-[11px] text-yellow-400 shrink-0 inline-flex items-center gap-0.5"><TrophyIcon size={11} />×{coach.champs}</span>}
              {coach.tag&&<span className="text-[9px] px-1 py-0.5 rounded bg-violet-900/40 text-violet-300 shrink-0">{coach.tag}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Era Report — era-ağırlıklı kadro analizi (Lineup Analysis'in yerini aldı) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-300 uppercase tracking-widest font-semibold">Era Report</div>
          {simEra&&<span className={`text-[11px] px-2 py-0.5 rounded border ${simEra.bg} ${simEra.color}`}>{simEra.label}</span>}
        </div>
        {simEra&&<p className="text-[13px] text-slate-400 italic leading-relaxed">{ERA_META_BLURB[simEra.id]}</p>}

        {/* Era-ağırlıklı pillar tablosu */}
        <div className="space-y-2.5">
          {analysis.pillars.map(pl=>{
            const vp = Math.round(pl.val*100);
            const wLabel = pl.w>=1.2 ? "KEY" : pl.w>=0.95 ? "CORE" : "MINOR";
            const wColor = pl.w>=1.2 ? "#facc15" : pl.w>=0.95 ? "#94a3b8" : "#475569";
            return (
              <div key={pl.key} className="flex items-center gap-2.5">
                <span className="text-[13px] text-slate-200 w-24 text-right shrink-0">{pl.label}</span>
                <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded shrink-0 w-14 text-center"
                  style={{color:wColor,border:`1px solid ${wColor}55`,background:wColor+"11"}}
                  title={`This pillar's weight in the ${simEra?.label||"current era"}: ×${pl.w.toFixed(2)}`}>
                  {wLabel}
                </span>
                <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${vp}%`,background:vp>=75?"#1D428A":vp>=55?"#2a3d6b":"#7f1d1d"}}/>
                </div>
                <span className={`text-sm font-bold w-7 text-right shrink-0 ${vp>=65?"text-blue-300":vp>=45?"text-slate-200":"text-red-400"}`}>{vp}</span>
              </div>
            );
          })}
          <p className="text-[11.5px] text-slate-500">
            Coverage = era-weighted average · {fit.nShooters} shooter{fit.nShooters===1?"":"s"} in the lineup
          </p>
        </div>

        {/* Era silahı + era açığı */}
        <div className="border-t border-slate-800 pt-3 space-y-2.5">
          <div className="flex gap-2 items-start">
            <span className="text-green-400 shrink-0 mt-0.5"><BoltIcon size={16} /></span>
            <p className="text-sm text-slate-300">
              <span className="font-semibold">Era weapon: </span>
              <span className="text-green-400">{analysis.strongest.label} ({Math.round(analysis.strongest.val*100)})</span>
              <span className="text-slate-400"> — {analysis.strongest.w>=1.2?"exactly what this era pays for.":analysis.strongest.w>=0.95?"solid currency in this era.":"strong, but this era barely values it."}</span>
            </p>
          </div>
          <div className="flex gap-2 items-start">
            <span className="text-red-400 shrink-0 mt-0.5"><GapIcon size={16} /></span>
            <div>
              <p className="text-sm text-slate-300">
                <span className="font-semibold">Era liability: </span>
                <span className="text-red-400">{analysis.weakest.label} ({Math.round(analysis.weakest.val*100)})</span>
                {analysis.weakest.w>=1.2&&<span className="text-amber-400"> — a KEY pillar here, this will cost you games</span>}
              </p>
              <p className="text-[13px] text-slate-500 mt-0.5">{analysis.weakest.fix}</p>
            </div>
          </div>
        </div>

        {/* Ball-dom uyarısı */}
        {analysis.ballDom >= 2 && (
          <div className="flex gap-2 items-start">
            <span className="text-amber-400 shrink-0 mt-0.5"><WarnIcon size={16} /></span>
            <p className="text-sm text-amber-400/80">
              {analysis.ballDom} ball-dominant players ({analysis.ballDomPlayers.map(n=>n.split(" ").slice(-1)[0]).join(", ")}) — role fit penalty applied.
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
                <p className="text-[12.5px] text-slate-300 font-medium">
                  Better pick for {analysis.weakest.label}:
                </p>
                <p className="text-[12.5px] text-slate-400 mt-0.5">
                  <span className="text-white font-semibold">{alt.PLAYER_NAME}</span>
                  {" "}<span className="text-slate-500">({altArch}, overall {altPct})</span>
                  {" "}— {altTeam} · {altSeason} — was available this game. Would have covered your lineup's {analysis.weakest.label.toLowerCase()} gap.
                </p>
              </div>
            </div>
          );
        })()}

        {/* Archetype affinity */}
        {affinityScore != null && (
          <div className="flex gap-2 items-start">
            <span className="text-violet-400 text-sm shrink-0">⬡</span>
            <p className="text-[12.5px] text-slate-400">
              Archetype affinity: <span className="text-violet-400 font-semibold">{affinityScore}</span>
              <span className="text-slate-600"> — avg pairwise synergy</span>
            </p>
          </div>
        )}

      </div>

      {/* Share butonu */}
      <ShareCard pct={pct} grade={grade} fit={fit} lineup={lineup} />

      {/* Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="text-[11px] text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <span>Top Scores</span>
            {mode==="salarycap"&&<span className="inline-flex items-center gap-1 text-emerald-400">— <CapIcon size={12} /> Salary Cap</span>}
          </div>
          {leaderboard.slice(0, 10).map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className="text-slate-700 w-5 text-right shrink-0 font-mono">{i + 1}.</span>
              <span className="text-slate-300 flex-1 truncate">{entry.username}</span>
              {entry.season_result === "THREEPEAT" && <span className="shrink-0 text-yellow-300" title="THREEPEAT — three straight simulated titles"><CrownIcon size={13} /></span>}
              {entry.season_result === "REPEAT" && <span className="shrink-0 text-yellow-400 inline-flex" title="Back-to-back simulated champion"><TrophyIcon size={12} /><TrophyIcon size={12} /></span>}
              {entry.season_result === "CHAMPION" && <span className="shrink-0 text-yellow-400" title="Won a simulated championship"><TrophyIcon size={12} /></span>}
              {entry.wins != null && <span className="text-slate-600 shrink-0 text-[10px]">{entry.wins}W</span>}
              <span className={`font-bold shrink-0 ${entry.pct>=85?"text-blue-400":entry.pct>=78?"text-sky-300":entry.pct>=70?"text-emerald-400":entry.pct>=62?"text-amber-400":"text-red-400"}`}>
                {entry.pct}
              </span>
              <span className="text-slate-600 shrink-0 w-4">{entry.grade}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={onReset}
        className="w-full py-3 rounded-xl font-semibold transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-2 text-slate-950"
        style={{background:"var(--accent)"}}>
        <LoopIcon size={15} /> Play Again
      </button>
    </div>
  );
}

// ── Paylaşım kartı — canvas üzerinde çizilir ─────────────────────────────────
function ShareCard({ pct, grade, fit, lineup }) {
  const [preview, setPreview] = useState(null);
  const [copied, setCopied]   = useState(false);

  const SITE_URL = "https://nba-archetype.onrender.com";

  const buildCanvas = () => {
    const W = 520, H = 420;
    const canvas = document.createElement("canvas");
    canvas.width  = W * 2;   // retina
    canvas.height = H * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);

    // Arkaplan
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // Üst çizgi (accent)
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(0, 0, W, 3);

    // Başlık — çizilmiş basketbol topu ikonu (emoji yerine)
    const bx = 26, by = 24, br = 7;
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by - br); ctx.lineTo(bx, by + br); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - br, by); ctx.lineTo(bx + br, by); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx - br, by, br, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx + br, by, br, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("NBA Archetype", 38, 28);

    ctx.font = "10px system-ui";
    ctx.fillStyle = "#475569";
    ctx.fillText("Lineup Builder", 20, 42);

    // Büyük skor
    const scoreColor = pct >= 85 ? "#f59e0b" : pct >= 75 ? "#4a7fc1" : pct >= 65 ? "#34d399" : pct >= 55 ? "#fbbf24" : "#f87171";
    ctx.font = "bold 72px system-ui";
    ctx.fillStyle = scoreColor;
    ctx.textAlign = "center";
    ctx.fillText(pct, W - 80, 68);

    ctx.font = "bold 28px system-ui";
    ctx.fillStyle = scoreColor;
    ctx.fillText(grade, W - 80, 95);

    ctx.font = "9px system-ui";
    ctx.fillStyle = "#334155";
    ctx.fillText("FIT SCORE", W - 80, 110);
    ctx.textAlign = "left";

    // Oyuncular
    const players = POSITIONS.map(pos => lineup[pos]).filter(Boolean);
    let y = 60;
    players.forEach((p, i) => {
      const pos = POSITIONS[i];
      const arch = p.primary_arch || "—";
      const season = (p._season || "").slice(2, 4);

      // Pos badge
      const posColors = { PG:"#a78bfa", SG:"#60a5fa", SF:"#34d399", PF:"#fb923c", C:"#f87171" };
      ctx.font = "bold 8px system-ui";
      ctx.fillStyle = posColors[pos] || "#64748b";
      ctx.fillText(pos, 20, y + 4);

      // İsim
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#e2e8f0";
      const lastName = p.PLAYER_NAME?.split(" ").slice(-1)[0] || p.PLAYER_NAME || "—";
      ctx.fillText(lastName, 50, y + 4);

      // Arch
      ctx.font = "10px system-ui";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(arch, 200, y + 4);

      // Sezon
      ctx.font = "9px system-ui";
      ctx.fillStyle = "#334155";
      ctx.fillText(`'${season}`, 310, y + 4);

      y += 22;
    });

    // Ayırıcı
    const sepY = y + 6;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, sepY); ctx.lineTo(W - 20, sepY); ctx.stroke();

    // Pillar barlar (paylaşım kartı 2×2 kalsın: rim+perim → tek "Defense" özeti)
    const pillars = [
      ["Creation",  fit.creation],
      ["Spacing",   fit.spacing],
      ["Defense",   Math.max(fit.rim_protection || 0, fit.perimeter_d || 0)],
      ["Finishing", fit.finishing],
    ];
    const barY = sepY + 14;
    const BAR_W = 160, BAR_H = 5;
    pillars.forEach(([label, val], i) => {
      const x = i < 2 ? 20 : 270;
      const rowY = barY + (i % 2) * 20;
      const vp = Math.round((val || 0) * 100);
      const barColor = vp >= 75 ? "#1D428A" : vp >= 55 ? "#2a3d6b" : "#7f1d1d";

      ctx.font = "9px system-ui";
      ctx.fillStyle = "#64748b";
      ctx.fillText(label, x, rowY);

      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.roundRect(x, rowY + 4, BAR_W, BAR_H, 2);
      ctx.fill();

      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.roundRect(x, rowY + 4, BAR_W * (vp / 100), BAR_H, 2);
      ctx.fill();

      ctx.font = "bold 9px system-ui";
      ctx.fillStyle = vp >= 65 ? "#60a5fa" : "#475569";
      ctx.fillText(vp, x + BAR_W + 5, rowY + 9);
    });

    // Site URL (watermark)
    ctx.font = "9px system-ui";
    ctx.fillStyle = "#1e293b";
    ctx.textAlign = "right";
    ctx.fillText(SITE_URL, W - 20, H - 14);
    ctx.textAlign = "left";

    return canvas;
  };

  const generate = () => {
    const canvas = buildCanvas();
    setPreview(canvas.toDataURL("image/png"));
  };

  const download = () => {
    const canvas = buildCanvas();
    const a = document.createElement("a");
    a.download = `nba-lineup-${Date.now()}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const tweet = () => {
    const text = `I scored ${pct}/100 (${grade}) on NBA Archetype Lineup Builder!\n\nBuild your all-time lineup across eras 🏀\n${SITE_URL}/game\n\n#NBAArchetype #NBA`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${SITE_URL}/game`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-widest">Share Your Result</div>

      {/* Preview */}
      {preview ? (
        <div className="rounded-xl overflow-hidden border border-slate-700">
          <img src={preview} alt="score card" className="w-full" />
        </div>
      ) : (
        <button onClick={generate}
          className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors border border-slate-700 hover:border-slate-500 inline-flex items-center justify-center gap-2"
          style={{ color: "#94a3b8" }}>
          <EyeIcon size={15} /> Preview Card
        </button>
      )}

      {/* Butonlar */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={download}
          className="py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5"
          style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155" }}
          onMouseEnter={e => e.currentTarget.style.background = "#334155"}
          onMouseLeave={e => e.currentTarget.style.background = "#1e293b"}>
          <DownloadIcon size={13} /> Save PNG
        </button>
        <button onClick={tweet}
          className="py-2 rounded-lg text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5"
          style={{ background: "#0f172a", color: "#e2e8f0", border: "1px solid #1d4ed8" }}
          onMouseEnter={e => e.currentTarget.style.background = "#1d4ed8"}
          onMouseLeave={e => e.currentTarget.style.background = "#0f172a"}>
          <XLogoIcon size={12} /> Tweet
        </button>
        <button onClick={copyLink}
          className="py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5"
          style={{ background: "#1e293b", color: copied ? "#34d399" : "#94a3b8", border: "1px solid #334155" }}>
          {copied ? <><CheckIcon size={13} /> Copied!</> : <><LinkIcon size={13} /> Copy Link</>}
        </button>
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function LineupGame() {
  const { lang } = useLang();

  // Oyun fazı
  const [phase, setPhase] = useState("idle");
  // idle | pick_era | spin_season | spin_team | fetching | pick_player | pick_pos | pick_coach | complete

  // Simülasyon era'sı (v3.5): sezon simülasyonunun oynanacağı dönem
  const [simEra, setSimEra] = useState(null);

  // Oyun modu (Faz 3b): classic | salarycap
  const [mode, setMode] = useState("classic");
  const modeRef = useRef("classic");
  useEffect(()=>{ modeRef.current = mode; },[mode]);
  const guaranteeRef = useRef(0);    // salary cap: art arda kaç spin'de seçilebilir tier çıkmadı
  const wildcardRef  = useRef(false); // 15 denemede tier bulunamadı → herkes seçilebilir
  const startSpinRef = useRef(null);  // fetchPlayers → startFullSpin döngüsel referansı

  // Koç draft'ı (Faz 2)
  const [coach, setCoach]               = useState(null);
  const [coachOptions, setCoachOptions] = useState([]);

  // Veriler
  const [seasons, setSeasons]       = useState([]);
  const [teamPool, setTeamPool]     = useState([]);
  const [players, setPlayers]       = useState([]);
  const [lineup, setLineup]         = useState({PG:null,SG:null,SF:null,PF:null,C:null,B1:null,B2:null,B3:null,B4:null});
  const [pickedPlayer, setPickedPlayer] = useState(null);
  const [fitResult, setFitResult]   = useState(null);
  const [statusMsg, setStatusMsg]   = useState("");
  const [moveSrc, setMoveSrc]       = useState(null); // saha üzerinde taşınan slot
  const [posFilter, setPosFilter]   = useState("");   // pick listesi G/F/C filtresi
  const [sortKey, setSortKey]       = useState("PTS"); // pick listesi sıralaması

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
  const [modal, setModal] = useState(null); // "chemistry" | "jokers" | "archetype" | "tags"

  const lineupRef = useRef(lineup);
  useEffect(()=>{ lineupRef.current=lineup; },[lineup]);
  const timerRef = useRef(null);
  // Her tur: {season, team, available:[...], picked: player}
  const roundHistoryRef = useRef([]);
  const pendingRoundRef = useRef(null); // fetchPlayers tamamlanınca set edilir

  const filledSlots = ALL_SLOTS.filter(p=>lineup[p]!==null);
  const emptySlots  = ALL_SLOTS.filter(p=>lineup[p]===null);
  // Kimya: mevcut dizilime göre türetilir (taşıma/swap sonrası güncel kalır)
  const primaryCount = POSITIONS.filter(p=>lineup[p]&&getPrimaryPos(lineup[p])===p).length;

  // ── Saha üzerinde taşı / takas et ─────────────────────────────────────────
  const canRearrange = ["spin_season","spin_team","fetching","pick_player","pick_coach"].includes(phase);
  const handleSlotTap = useCallback((slot)=>{
    const cur = lineupRef.current;
    if(moveSrc==null){
      if(cur[slot]) setMoveSrc(slot);
      return;
    }
    if(moveSrc===slot){ setMoveSrc(null); return; }
    const place=(pl,s)=>pl?{...pl,_assignedPos:s,_isBench:!POSITIONS.includes(s),
                            _posPenalty:posPenaltyFor(pl,s),
                            _isPrimary:POSITIONS.includes(s)&&getPrimaryPos(pl)===s}:null;
    const nl={...cur,[slot]:place(cur[moveSrc],slot),[moveSrc]:place(cur[slot],moveSrc)};
    setLineup(nl);
    lineupRef.current=nl;
    setMoveSrc(null);
  },[moveSrc]);

  const [affinityMatrix, setAffinityMatrix] = useState(null);

  useEffect(()=>{
    fetch("/api/game/seasons").then(r=>r.json()).then(d=>setSeasons(d.seasons||["2025-26"])).catch(()=>setSeasons(["2025-26"]));
    fetch("/api/affinity").then(r=>r.json()).then(d=>setAffinityMatrix(d.matrix||null)).catch(()=>{});
  },[]);

  // ── Oyuncu çek (ortak) ───────────────────────────────────────────────────
  const fetchPlayers = useCallback((season, team, onEmpty) => {
    setPhase("fetching");
    setStatusMsg("Loading players...");
    fetch(`/api/game/players?season=${encodeURIComponent(season)}&team=${encodeURIComponent(team)}`)
      .then(r=>r.json())
      .then(d=>{
        const taken=Object.values(lineupRef.current).filter(Boolean).map(x=>x.PLAYER_NAME);
        let list=(d.players||[]).filter(p=>!taken.includes(p.PLAYER_NAME));
        if(list.length===0){ onEmpty(); return; }

        // Takım içi fiyatlama: rosterın en iyi 3'üne yıldız primi tabanı
        if(modeRef.current==="salarycap") list = applyTeamPricing(list);

        // Salary Cap garantisi: rosterda kalan bütçeyle alınabilir oyuncu olmalı
        // (kalan her slota %4 rezerv bırakarak). Yoksa otomatik yeniden çevir
        // (15 denemeden sonra wildcard: rezerv şartı kalkar).
        if(modeRef.current==="salarycap" && !wildcardRef.current){
          const lu=Object.values(lineupRef.current);
          const budgetLeft=START_BUDGET-totalSpent(lu);
          const slotsLeft=ALL_SLOTS.length-lu.filter(Boolean).length;
          const cap=maxSpendNow(budgetLeft, slotsLeft);
          const pickable=list.some(p=>priceOf(p)<=cap);
          if(!pickable){
            guaranteeRef.current++;
            if(guaranteeRef.current>=15){
              wildcardRef.current=true;
              setStatusMsg("Tier hunt exhausted — wildcard round: anyone is pickable");
            } else {
              setStatusMsg(`No open-tier players on this roster — respinning (${guaranteeRef.current})...`);
              setTimeout(()=>startSpinRef.current&&startSpinRef.current(),650);
              return;
            }
          } else {
            guaranteeRef.current=0;
          }
        }

        setPlayers(list);
        pendingRoundRef.current={season,team,available:list};
        setPosFilter("");
        setPhase("pick_player");
        if(!wildcardRef.current) setStatusMsg("");
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

  // fetchPlayers içindeki otomatik respin için güncel referans
  useEffect(()=>{ startSpinRef.current = startFullSpin; },[startFullSpin]);

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
    startFullSpin(picked, chosenTeam);  // takım sabit kalır
  },[jokers.reYear,seasons,chosenSeason,chosenTeam,startFullSpin]);

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
    let enrichedPick = player;
    // Salary Cap: bütçeyi aşan sözleşme alınamaz (wildcard'da rezerv şartı düşer)
    if(mode==="salarycap"){
      const c=priceOf(player);
      const lu=Object.values(lineupRef.current);
      const budgetLeft=START_BUDGET-totalSpent(lu);
      const slotsLeft=ALL_SLOTS.length-lu.filter(Boolean).length;
      const cap=wildcardRef.current ? budgetLeft : maxSpendNow(budgetLeft, slotsLeft);
      if(c>cap) return; // kart zaten disabled — guard
      enrichedPick={...player,_cost:c};
    }
    if(pendingRoundRef.current){
      roundHistoryRef.current = [...roundHistoryRef.current, {...pendingRoundRef.current, picked: enrichedPick}];
      pendingRoundRef.current = null;
    }
    setPickedPlayer(enrichedPick);
    setDiscoverActive(false);
    setStatusMsg("");
    setPhase("pick_pos");
  };

  // ── Pozisyon seç (starter mevkisi veya bench slotu) ──────────────────────
  const handlePickPos = (pos) => {
    const isStarter = POSITIONS.includes(pos);
    const isPrimary = isStarter && getPrimaryPos(pickedPlayer) === pos;

    const enriched={...pickedPlayer,_season:chosenSeason,_team:chosenTeam,_isPrimary:isPrimary,
                    _assignedPos:pos,_isBench:!isStarter,
                    _posPenalty:posPenaltyFor(pickedPlayer,pos)};
    const newLineup={...lineupRef.current,[pos]:enriched};
    setLineup(newLineup);
    lineupRef.current=newLineup;
    setPickedPlayer(null);

    const filled=ALL_SLOTS.filter(p=>newLineup[p]!==null);
    if(filled.length===ALL_SLOTS.length){
      // Koç draft'ı: 4 rastgele aday. Fit, koç seçilirken hesaplanır
      // (pick_coach sırasında dizilim hâlâ değiştirilebilir).
      setCoachOptions([...COACHES].sort(()=>Math.random()-0.5).slice(0,4));
      setPhase("pick_coach");
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
    const empty={PG:null,SG:null,SF:null,PF:null,C:null,B1:null,B2:null,B3:null,B4:null};
    setLineup(empty);
    lineupRef.current=empty;
    setCoach(null);
    setCoachOptions([]);
    setFitResult(null);
    setPlayers([]);
    setPickedPlayer(null);
    setChosenSeason("");
    setChosenTeam("");
    setTeamPool([]);
    setStatusMsg("");
    setSpinS(false);
    setSpinT(false);
    setMoveSrc(null);
    setJokers({reTeam:true,reYear:true,reBoth:true,double:true,discover:true});
    setDoubleActive(false);
    setDiscoverActive(false);
    setSimEra(null);
    guaranteeRef.current=0;
    wildcardRef.current=false;
    roundHistoryRef.current=[];
    pendingRoundRef.current=null;
    setPhase("idle");
  };

  const isSpinPhase = phase==="spin_season"||phase==="spin_team"||phase==="fetching";

  return (
    <div className="h-full overflow-y-auto">
    <SEO
      title="Lineup Builder Game"
      description="Build the greatest 5-man lineup in NBA history. Pick players from any era — 1983 to today — and see how well your roster fits together across archetypes and eras."
      path="/game"
    />
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-3 pb-6">

      {/* Başlık */}
      <div>
        <h1 className="text-xl font-bold text-white">Lineup Builder</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Each round the wheels pick a random era and team. Draft 9 players — 5 starters, 4 bench — then a coach, and take them through a full season.
        </p>
      </div>

      {phase!=="complete"&&(
      <div className="flex flex-col lg:flex-row gap-4 items-start">

      {/* ── SOL PANEL: kontroller ── */}
      <div className="w-full lg:w-[460px] shrink-0 min-w-0 space-y-3">

      {/* Lineup bar (mobil) — desktop'ta sağdaki saha görünümü kullanılır */}
      <div className="flex gap-1 lg:hidden">
        {POSITIONS.map(pos=><LineupSlot key={pos} pos={pos} player={lineup[pos]}
          selected={moveSrc===pos} canTap={canRearrange} onTap={handleSlotTap}/>)}
      </div>
      <div className="flex gap-1 opacity-80 lg:hidden">
        {BENCH_SLOTS.map(pos=><LineupSlot key={pos} pos={pos} player={lineup[pos]} bench
          selected={moveSrc===pos} canTap={canRearrange} onTap={handleSlotTap}/>)}
      </div>
      {canRearrange&&moveSrc&&(
        <p className="text-[9.5px] text-yellow-400/90 lg:hidden">Moving {lineup[moveSrc]?.PLAYER_NAME?.split(" ").slice(-1)[0]} — tap a destination slot</p>
      )}

      {/* İlerleme */}
      {phase!=="idle"&&phase!=="pick_era"&&phase!=="complete"&&(
        <div className="flex items-center gap-2">
          {simEra&&(
            <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${simEra.bg} ${simEra.color}`}
              title={`Season will simulate in the ${simEra.label}`}>
              SIM: {simEra.short}
            </span>
          )}
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{width:`${(filledSlots.length/ALL_SLOTS.length)*100}%`,background:"var(--accent)"}}/>
          </div>
          <span className="text-[10.5px] text-slate-500">{filledSlots.length}/{ALL_SLOTS.length}</span>
          {primaryCount>0&&<span className="text-[10.5px] text-yellow-400 inline-flex items-center gap-0.5"><StarIcon size={10} />×{primaryCount}</span>}
        </div>
      )}

      {/* Salary Cap bütçe barı */}
      {mode==="salarycap"&&phase!=="idle"&&phase!=="pick_era"&&phase!=="complete"&&(()=>{
        const budgetLeft=START_BUDGET-totalSpent(Object.values(lineup));
        const slotsLeft=emptySlots.length;
        const cap=Math.max(0, maxSpendNow(budgetLeft, slotsLeft));
        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px] text-slate-400 uppercase tracking-widest inline-flex items-center gap-1.5"><CapIcon size={13} /> Cap Space</span>
              <span className={`text-2xl font-black tabular-nums leading-none
                ${budgetLeft<=15?"text-red-400":budgetLeft<=35?"text-amber-300":"text-emerald-300"}`}>
                {budgetLeft}<span className="text-sm">%</span>
              </span>
            </div>
            <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{width:`${budgetLeft}%`,
                  background:budgetLeft<=15?"#7f1d1d":budgetLeft<=35?"#b45309":"#047857"}}/>
            </div>
            {slotsLeft>0&&(
              <div className="text-[10px] text-slate-500 mt-1.5">
                {slotsLeft} contract{slotsLeft>1?"s":""} left · max <span className="text-slate-300 font-semibold">{cap}%</span> on this pick
                {slotsLeft>1&&<span> (reserving {(slotsLeft-1)*MIN_COST}% for the rest)</span>}
              </div>
            )}
          </div>
        );
      })()}

      {/* Jokerler (sadece pick_player fazında) */}
      {phase==="pick_player"&&(
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2">
          <div className="text-[9.5px] text-slate-600 uppercase tracking-widest mb-1.5 text-center">Jokers</div>
          <div className="flex gap-1.5 justify-center">
            <JokerBtn Icon={RefreshIcon}  label="Team"     available={jokers.reTeam}   onClick={jokerReTeam}/>
            <JokerBtn Icon={CalendarIcon} label="Year"     available={jokers.reYear}   onClick={jokerReYear}/>
            <JokerBtn Icon={BoltIcon}     label="Both"     available={jokers.reBoth}   onClick={jokerReBoth}/>
            <JokerBtn Icon={UsersIcon}    label="Pick 2"   available={jokers.double&&!doubleActive&&emptySlots.length>=2} onClick={jokerDouble}/>
            <JokerBtn Icon={SearchIcon}   label="Discover" available={jokers.discover&&!discoverActive} onClick={jokerDiscover}/>
          </div>
          {doubleActive&&(
            <div className="flex items-center justify-center gap-1.5 text-xs text-amber-400 mt-1.5 animate-pulse">
              <UsersIcon size={13} /> Double pick active — choose 2 players
            </div>
          )}
          {discoverActive&&(
            <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400 mt-1.5 animate-pulse">
              <SearchIcon size={13} /> Discover active — hidden overalls revealed this round
            </div>
          )}
        </div>
      )}

      {/* Info modals */}
      <InfoModal open={modal==="chemistry"} onClose={()=>setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-yellow-400"><StarIcon size={17} /></span> Chemistry</span>}>
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>Each player has a <span className="text-white font-medium">primary position</span> based on their archetype and real-life role. When you slot a player into their primary position, you earn a chemistry point.</p>
          <p>At the end of the game, each chemistry point adds <span className="text-yellow-300 font-medium">+2 to your final score</span> (up to +10 for a perfect lineup).</p>
          <p className="text-slate-400 text-xs">A star marks the primary slot button. You can still place players in other positions — sometimes a mismatched role is the right tactical call.</p>
        </div>
      </InfoModal>

      <InfoModal open={modal==="jokers"} onClose={()=>setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-amber-300"><CardsIcon size={17} /></span> Jokers</span>}>
        <div className="space-y-3">
          {[
            [RefreshIcon,"Team","Re-spin the team wheel. Get a different roster from the same season."],
            [CalendarIcon,"Year","Re-spin the season wheel. Jump to a completely different era."],
            [BoltIcon,"Both","Re-spin both wheels at once. Full reset of the current round."],
            [UsersIcon,"Pick 2","Choose two players from the current roster in a single round."],
            [SearchIcon,"Discover","Reveal every player's hidden overall score this round, then choose with full information."],
          ].map(([Icon,name,desc])=>(
            <div key={name} className="flex gap-3 items-start">
              <span className="shrink-0 text-amber-300 mt-0.5"><Icon size={18} /></span>
              <div>
                <div className="text-white font-medium text-sm">{name}</div>
                <div className="text-slate-400 text-xs leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
          <p className="text-[12.5px] text-slate-600 pt-1 border-t border-slate-800">Each joker can be used once per game.</p>
        </div>
      </InfoModal>

      <InfoModal open={modal==="tags"} onClose={()=>setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-slate-300"><TagIcon size={16} /></span> Player Tag Effects</span>}>
        <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-1">
          <p className="text-[11px] text-slate-500 leading-relaxed pb-1">
            On player rows tags show as small colored initials. Here's what each means:
          </p>
          {TAG_INFO.map(t=>(
            <div key={t.key} className="rounded-lg p-2.5 flex items-start gap-2.5"
              style={{background:t.color+"0d",borderLeft:`3px solid ${t.color}`}}>
              {/* baş harf rozeti = satırlarda göründüğü hâli */}
              <span className="shrink-0 mt-0.5 inline-flex items-center justify-center text-[10px] font-bold rounded px-1.5 h-[18px] min-w-[18px]"
                style={{color:t.color,background:t.color+"22",border:`1px solid ${t.color}66`}}>{t.abbr}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-bold" style={{color:t.color}}>{t.label}</div>
                <div className="text-xs text-slate-300 leading-relaxed mt-0.5">{t.desc}</div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-slate-500 italic pt-1">
            Tags come from real award history (1983+) and live archetype data.
            Click a player to see their tags full-size with effects.
          </p>
        </div>
      </InfoModal>

      <InfoModal open={modal==="archetype"} onClose={()=>setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-blue-300"><DnaIcon size={16} /></span> Archetypes</span>}>
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>Every player's archetype is <span className="text-white font-medium">visible while you draft</span> — read the role, build the puzzle. What stays hidden is the <span className="text-white font-medium">overall score</span>: you know WHAT a player is, not how good. Stats, tags and contract price are your clues (or burn the Discover joker).</p>
          <p>Each archetype is a percentile score built from real NBA tracking and box-score data. The 12 roles range from <span className="text-orange-300">Engine</span> (usage, creation) to <span className="text-blue-300">Anchor</span> (rim protection, defensive rating).</p>
          <p className="text-slate-400 text-xs">Final score = 45% Player Quality + 40% Lineup Coverage + 15% Role Fit. Quality is each player's overall scaled by distance to your chosen sim era. Coverage is where archetypes live: does the lineup collectively cover creation, spacing, defense and finishing? One great specialist is enough for their pillar.</p>
          <div className="flex gap-2 pt-1 border-t border-slate-800">
            <a href="/glossary" className="text-xs underline underline-offset-2" style={{color:"var(--accent)"}}>Full Glossary</a>
            <span className="text-slate-700">·</span>
            <a href="/about" className="text-xs underline underline-offset-2" style={{color:"var(--accent)"}}>About the System</a>
          </div>
        </div>
      </InfoModal>

      {/* === IDLE === */}
      {phase==="idle"&&(
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            {/* 4 adımlı görsel akış */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ["1",TargetIcon,"text-rose-300","Pick your era","distance + style fit"],
                ["2",WheelIcon,"text-blue-300","Spin & draft 9","5 starters + 4 bench"],
                ["3",CoachIcon,"text-emerald-300","Hire a coach","O/D grades + rings"],
                ["4",TrophyIcon,"text-yellow-300","Simulate 82","playoffs · awards · glory"],
              ].map(([n,Icon,color,title,sub])=>(
                <div key={n} className="relative rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
                  <div className="absolute top-1.5 left-2 text-[10px] font-black text-slate-600">{n}</div>
                  <div className={`flex justify-center mb-1.5 ${color}`}><Icon size={26} /></div>
                  <div className="text-xs font-bold text-white leading-tight">{title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{sub}</div>
                </div>
              ))}
            </div>
            {/* Skor formülü — görsel ağırlık şeridi */}
            <div>
              <div className="flex h-7 rounded-lg overflow-hidden text-[10.5px] font-bold">
                <div className="flex items-center justify-center" style={{width:"45%",background:"#1D428A"}}>QUALITY 45%</div>
                <div className="flex items-center justify-center" style={{width:"40%",background:"#274690"}}>COVERAGE 40%</div>
                <div className="flex items-center justify-center text-slate-300" style={{width:"15%",background:"#1e293b"}}>ROLE 15%</div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Quality = overall × era fit (distance + style) × position · Coverage = your archetypes covering Creation / Spacing / Defense / Finishing
              </p>
            </div>
            {/* Mekanik kartları */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {key:"chemistry", Icon:StarIcon, color:"text-yellow-400", title:"Chemistry",   desc:"Natural positions earn a score bonus"},
                {key:"jokers",    Icon:CardsIcon, color:"text-amber-300", title:"Jokers",      desc:"Five one-time abilities per game"},
                {key:"archetype", Icon:DnaIcon, color:"text-blue-300", title:"Archetypes",  desc:"Visible while you draft — overalls stay hidden"},
                {key:"tags",      Icon:TagIcon, color:"text-slate-300", title:"Player Tags", desc:"MVP, rings, duos — real history feeds the sim"},
              ].map(({key,Icon,color,title,desc})=>(
                <button key={key} onClick={()=>setModal(key)}
                  className="bg-slate-800/60 hover:bg-slate-700/60 rounded-lg p-3 text-left transition-colors border border-slate-700/50 hover:border-slate-600">
                  <div className="text-sm font-bold text-white mb-0.5 flex items-center gap-1.5"><span className={color}><Icon size={15} /></span> {title}</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">{desc}</div>
                </button>
              ))}
            </div>
          </div>
          {/* Mod seçimi */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>setMode("classic")}
              className={`text-left rounded-xl border p-3 transition-all
                ${mode==="classic"?"border-blue-500 bg-blue-900/20":"border-slate-800 bg-slate-900/60 hover:border-slate-600"}`}>
              <div className="text-sm font-bold text-white flex items-center gap-1.5"><span className="text-blue-300"><WheelIcon size={15} /></span> Classic</div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">No cap, no limits — pure wheel luck. Overalls stay hidden; read the archetypes.</div>
            </button>
            <button onClick={()=>setMode("salarycap")}
              className={`text-left rounded-xl border p-3 transition-all
                ${mode==="salarycap"?"border-violet-500 bg-violet-900/20":"border-slate-800 bg-slate-900/60 hover:border-slate-600"}`}>
              <div className="text-sm font-bold text-white flex items-center gap-1.5"><span className="text-emerald-300"><CapIcon size={15} /></span> Salary Cap</div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                Start with a <span className="text-emerald-300 font-semibold">100% cap</span>. Every player costs a slice by quality — a superstar eats <span style={{color:"#a78bfa"}}>~30%</span>, a role player <span style={{color:"#fb923c"}}>4%</span>. Each roster's best men carry a star premium (14/10/7% floors) — nobody's franchise player comes cheap. Fit 9 contracts.
              </div>
            </button>
          </div>
          <div className="text-center">
            <button onClick={()=>setPhase("pick_era")} disabled={seasons.length===0}
              className="px-10 py-3 rounded-xl font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2 text-slate-950"
              style={{background: seasons.length===0 ? "#334155" : "var(--accent)"}}>
              {seasons.length===0?"Loading..."
                :mode==="salarycap"?<><CapIcon size={17} /> Start Salary Cap Draft</>
                :<><WheelIcon size={17} /> Start Game</>}
            </button>
          </div>
        </div>
      )}

      {/* === PICK SIM ERA === */}
      {phase==="pick_era"&&(
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest mb-1">Step 1 — Pick Your Simulation Era</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your whole run lives in this era. Every player's power scales with distance from
              their home decade (one era off ≈ −3%, five eras ≈ −22%) — but an archetype the era
              loves travels one era closer, one it dumps travels one further. TIMELESS greats
              (a season's top 2) ignore distance entirely.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ERAS.map(era=>(
              <button key={era.id}
                onClick={()=>{setSimEra(era);startFullSpin();}}
                className={`text-left rounded-xl border p-3 transition-all hover:scale-[1.02] ${era.bg}`}>
                <div className={`text-sm font-bold ${era.color}`}>{era.label}</div>
                <div className="text-[9.5px] text-slate-500 mt-0.5">{era.years[0]}–{Math.min(era.years[1],2026)}</div>
                <div className="text-[10px] text-slate-400 mt-1.5 leading-snug">{ERA_META_BLURB[era.id]}</div>
              </button>
            ))}
          </div>
          <button
            onClick={()=>{setSimEra(ERAS[Math.floor(Math.random()*ERAS.length)]);startFullSpin();}}
            className="w-full py-2.5 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:border-blue-500 hover:text-blue-300 transition-colors inline-flex items-center justify-center gap-2">
            <DiceIcon size={15} /> Random Era
          </button>
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
      {phase==="pick_player"&&(()=>{
        const salary = mode==="salarycap";
        const budgetLeft = salary ? START_BUDGET-totalSpent(Object.values(lineup)) : null;
        const spendCap = salary
          ? (wildcardRef.current ? budgetLeft : maxSpendNow(budgetLeft, emptySlots.length))
          : null;
        let list = posFilter ? players.filter(p=>posGroupOf(p)===posFilter) : players;
        const sorted = [...list].sort((a,b)=>{
          if(sortKey==="TAGGED"){
            const ta=getPlayerTags(a).length, tb=getPlayerTags(b).length;
            if(tb!==ta) return tb-ta;
            return (parseFloat(b.PTS||0)||0)-(parseFloat(a.PTS||0)||0);
          }
          return (parseFloat(b[sortKey]||0)||0)-(parseFloat(a[sortKey]||0)||0);
        });
        return (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {/* Üst bar: takım-dönem + G/F/C filtre + sayı */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b flex-wrap" style={{borderColor:"rgba(30,41,59,.8)"}}>
              <span className="text-[11px] font-mono tracking-widest text-slate-400 uppercase">
                {chosenTeam} · {chosenSeason}
              </span>
              <span className="ml-auto flex items-center border rounded-lg overflow-hidden" style={{borderColor:"#334155"}}>
                {["G","F","C"].map(g=>(
                  <button key={g} onClick={()=>setPosFilter(f=>f===g?"":g)}
                    className={`px-2.5 py-1 text-[11px] font-bold transition-colors border-r last:border-r-0
                      ${posFilter===g?"bg-slate-200 text-slate-900":"text-slate-400 hover:text-white"}`}
                    style={{borderColor:"#334155"}}>
                    {g}
                  </button>
                ))}
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">{sorted.length}</span>
            </div>
            {/* Satır listesi — yatay kaydırmalı (mobil/dar panelde stat'lar kayar,
                isim+arketip+tag'ler solda pinli kalır) */}
            <div className="max-h-[26rem] overflow-auto">
              {/* Kolon başlıkları */}
              {sorted.length>0&&(
                <div className="min-w-[560px] flex items-center gap-2 pr-3 py-1 border-b sticky top-0 z-20"
                  style={{borderColor:"rgba(30,41,59,.8)",background:"var(--bg-surface,#0f172a)"}}>
                  <span className="sticky left-0 pl-3 pr-2 w-[240px] shrink-0 text-[9px] uppercase tracking-wider text-slate-600"
                    style={{background:"var(--bg-surface,#0f172a)"}}>Player</span>
                  <span className="w-8 text-center shrink-0 text-[9px] uppercase text-slate-600" title="Tag count">TAG</span>
                  {salary&&<span className="text-[9px] uppercase text-slate-600 shrink-0 w-9 text-right">$</span>}
                  {discoverActive&&<span className="text-[9px] uppercase text-slate-600 shrink-0">OVR</span>}
                  {["PTS","REB","AST","3P%","STL","BLK"].map(h=>(
                    <span key={h} className="w-9 text-right shrink-0 text-[9px] uppercase text-slate-600">{h}</span>
                  ))}
                </div>
              )}
              {sorted.map((p,i)=>{
                const c = salary ? priceOf(p) : null;
                const over = salary && c>spendCap;
                return <PlayerRow key={i} player={p} discover={discoverActive}
                  onClick={()=>handlePickPlayer(p)} cost={c} unaffordable={over}
                  highlightStat={sortKey==="TAGGED"?"PTS":sortKey}/>;
              })}
              {sorted.length===0&&(
                <div className="py-8 text-center text-xs text-slate-600">No players in this group — clear the filter.</div>
              )}
            </div>
            {/* Alt bar: sıralama */}
            <div className="flex items-center px-3 py-2 border-t gap-1 flex-wrap" style={{borderColor:"rgba(30,41,59,.8)"}}>
              <span className="text-[10px] tracking-widest text-slate-500 uppercase mr-1">Sort</span>
              {SORT_KEYS.map(([field,label])=>(
                <button key={field} onClick={()=>setSortKey(field)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold tracking-wider transition-colors
                    ${sortKey===field?"text-slate-900":"text-slate-400 hover:text-white"}`}
                  style={sortKey===field?{background:"#e2b34c"}:{}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* === PICK POSITION === */}
      {phase==="pick_pos"&&pickedPlayer&&(()=>{
        const eligible=getEligiblePos(pickedPlayer);
        const primary=eligible[0];
        return (
          <div className="bg-slate-900 rounded-2xl p-4" style={{border:"1px solid var(--accent-border)"}}>
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <div className="text-white font-semibold flex items-center gap-2 flex-wrap">
                  {pickedPlayer.PLAYER_NAME}
                  <span className="text-[11px] text-blue-400 font-medium">{pickedPlayer.primary_arch||"—"}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{chosenSeason} · {chosenTeam}</div>
                {/* İstatistikler (arketip her zaman açık, overall gizli) */}
                <div className="flex gap-3 mt-1.5">
                  {[["PTS","PTS"],["REB","REB"],["AST","AST"],["FG3_PCT","3P%"]].map(([k,l])=>{
                    const v=pickedPlayer[k];
                    const disp=v==null||isNaN(+v)?"—":k==="FG3_PCT"?`${Math.round(+v*100)}%`:(+v).toFixed(1);
                    return (
                      <div key={k} className="text-center">
                        <div className="text-[13px] font-bold text-white tabular-nums">{disp}</div>
                        <div className="text-[8.5px] uppercase tracking-wide text-slate-600">{l}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1 mt-2 flex-wrap items-center">
                  {eligible.map(p=>(
                    <span key={p} className={`text-[9.5px] px-1.5 py-0.5 rounded border font-bold inline-flex items-center gap-0.5 ${POS_COLORS[p]||""}`}>
                      {p}{p===primary&&<StarIcon size={9} />}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={()=>{setPickedPlayer(null);setPhase("pick_player");}}
                className="text-slate-600 hover:text-slate-300 text-xs shrink-0">← Back</button>
            </div>
            {/* Tag'ler büyütülmüş — tam ad + etkisi (oyuncuya tıklayınca ne olduğu net) */}
            {(()=>{ const tg=getPlayerTags(pickedPlayer); return tg.length>0&&(
              <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {tg.map(t=>(
                  <div key={t.key} className="rounded-lg px-2 py-1.5 flex items-start gap-2"
                    style={{background:t.color+"14",border:`1px solid ${t.color}44`}}>
                    <span className="shrink-0 mt-0.5 inline-flex items-center justify-center text-[10px] font-bold rounded px-1 h-[16px] min-w-[16px]"
                      style={{color:t.color,background:t.color+"22",border:`1px solid ${t.color}66`}}>{t.abbr}</span>
                    <div className="min-w-0">
                      <div className="text-[11.5px] font-bold leading-tight" style={{color:t.color}}>{t.label}</div>
                      <div className="text-[10.5px] text-slate-400 leading-snug">{t.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            ); })()}
            {/* Desktop: court spot'una tıkla; Mobil: butonlar (court yok) */}
            <div className="hidden lg:flex items-center gap-1.5 text-[13px] text-amber-300 mt-1 mb-1">
              <span className="text-base leading-none">↘</span>
              <span>Pick a spot on the court or bench to place <span className="font-semibold">{pickedPlayer.PLAYER_NAME?.split(" ").slice(-1)[0]}</span></span>
            </div>
            <div className="lg:hidden">
            <div className="text-xs text-slate-500 mb-2 inline-flex items-center gap-1 flex-wrap">
              <span>Which position? (</span><StarIcon size={10} /><span>= primary → chemistry bonus · secondary −10%{isFlex(pickedPlayer)?", next-nearest −10% (VERSATILE), rest −25%":", elsewhere −25%"})</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {POSITIONS.filter(p=>!lineup[p]).map(pos=>{
                const isElig=eligible.includes(pos);
                const isPrim=pos===primary;
                const pen=posPenaltyFor(pickedPlayer,pos);
                const penLabel=pen>=1?null:pen>=0.90?"−10%":"−25%";
                return (
                  <button key={pos} onClick={()=>handlePickPos(pos)}
                    className={`flex-1 min-w-[3rem] py-2 border rounded-xl font-bold text-sm transition-all
                      ${isPrim?"bg-amber-900/30 border-amber-500/60 text-amber-200 hover:bg-amber-600 hover:text-white"
                               :isElig?"bg-slate-800 border-slate-600 text-white hover:bg-blue-700 hover:border-blue-500"
                                      :"bg-slate-900/50 border-slate-800 text-slate-500 hover:bg-slate-800"}`}>
                    <div className="inline-flex items-center gap-1 justify-center">{pos}{isPrim&&<StarIcon size={11} />}</div>
                    {penLabel&&<div className="text-[8.5px] font-medium text-red-400/90">{penLabel}</div>}
                    {!penLabel&&!isPrim&&isFlex(pickedPlayer)&&<div className="text-[8.5px] font-medium text-violet-400">vers.</div>}
                  </button>
                );
              })}
            </div>
            {BENCH_SLOTS.some(b=>!lineup[b])&&(
              <>
                <div className="text-xs text-slate-500 mt-3 mb-2">
                  Or send to the bench — no position penalty, but reduced minutes (~22% of the load)
                </div>
                <div className="flex gap-2">
                  {BENCH_SLOTS.filter(b=>!lineup[b]).map(b=>(
                    <button key={b} onClick={()=>handlePickPos(b)}
                      className="flex-1 py-2 border rounded-xl font-bold text-sm transition-all bg-slate-900/70 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white">
                      {b}
                    </button>
                  ))}
                </div>
              </>
            )}
            </div>
          </div>
        );
      })()}

      {/* === PICK COACH === */}
      {phase==="pick_coach"&&(
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest mb-1">Final Step — Draft a Coach</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Offense and Defense grades shift your team rating all season. Championship rings add
              playoff DNA — the more rings, the bigger the boost when the lights are brightest.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {coachOptions.map(c=>(
              <button key={c.name}
                onClick={()=>{
                  setCoach(c);
                  setMoveSrc(null);
                  const fit=computeLineupFit(POSITIONS.map(p=>lineupRef.current[p]), simEra);
                  setFitResult(fit);
                  setPhase("complete");
                }}
                className="text-left rounded-xl border border-slate-700 bg-slate-800/50 p-3 transition-all hover:border-blue-500 hover:scale-[1.02]">
                <div className="text-sm font-bold text-white">{c.name}</div>
                <div className="text-[9.5px] text-slate-500 mt-0.5">{c.years}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-mono"><span className="text-slate-500">OFF</span> <span className={`font-bold ${c.off.startsWith("A")?"text-emerald-400":c.off.startsWith("B")?"text-sky-300":c.off.startsWith("C")?"text-amber-400":"text-red-400"}`}>{c.off}</span></span>
                  <span className="text-[10px] font-mono"><span className="text-slate-500">DEF</span> <span className={`font-bold ${c.def.startsWith("A")?"text-emerald-400":c.def.startsWith("B")?"text-sky-300":c.def.startsWith("C")?"text-amber-400":"text-red-400"}`}>{c.def}</span></span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 min-h-[16px]">
                  {c.champs>0&&<span className="text-[9.5px] text-yellow-400 inline-flex items-center gap-0.5"><TrophyIcon size={10} />×{c.champs}</span>}
                  {c.tag&&<span className="text-[8.5px] px-1 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-700/40">{c.tag}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      </div>{/* sol panel sonu */}

      {/* ── SAĞ PANEL: yarım saha (desktop) ── */}
      <div className="hidden lg:block flex-1 min-w-0">
        <div className="sticky top-2">
          <CourtBoard lineup={lineup} coach={coach} moveSrc={moveSrc}
            canRearrange={canRearrange} onSlotTap={handleSlotTap} getPrimaryPos={getPrimaryPos}
            placing={phase==="pick_pos"&&!!pickedPlayer}
            placingEligible={pickedPlayer?getEligiblePos(pickedPlayer):[]}
            placingPenalties={pickedPlayer?Object.fromEntries(POSITIONS.map(p=>[p,posPenaltyFor(pickedPlayer,p)])):{}}
            onPlace={handlePickPos}/>
        </div>
      </div>

      </div>
      )}

      {/* === COMPLETE === */}
      {phase==="complete"&&fitResult&&(
        <div className="max-w-3xl mx-auto space-y-3">
          <ScoreReveal fit={fitResult} lineup={lineup} primaryCount={primaryCount} roundHistory={roundHistoryRef.current} onReset={resetGame} lang={lang} affinityMatrix={affinityMatrix} simEra={simEra} coach={coach} mode={mode}/>
        </div>
      )}
    </div>
    </div>
  );
}
