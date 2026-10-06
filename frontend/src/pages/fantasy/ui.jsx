// Fantezi ortak bileşenleri — tasarımın C1 "Shared components" sayfası.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PaIcon from "../../components/shell/PaIcon";
import { ARCHETYPE_COLOR } from "../../constants/archetypeColors";
import { useAuth } from "../../contexts/AuthContext";
import { fz } from "./fantasyApi";
import { FORMATS, useFantasy } from "./useFantasy";

export const GOOD = "#4ade80";
export const BAD = "#f87171";
const MUTED = "#8a8a8a";

export const sgn = (v, nd = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(nd)}`);
export const fmt1 = (v, nd = 1) => (v == null ? "–" : Number(v).toFixed(nd));
export const pct = (v) => (v == null ? "–" : `${Math.round(v * 100)}%`);
export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// ── Çipler ────────────────────────────────────────────────────────────────
export function ArchChip({ arch }) {
  if (!arch) return null;
  return <span className="fz-arch"><i style={{ background: ARCHETYPE_COLOR[arch] || MUTED }} />{arch}</span>;
}

export const FLAGS = {
  rookie:           { l: "Rookie",          d: "No NBA history yet. Projected from earlier draft classes picked in the same range." },
  new_team:         { l: "New team",        d: "Changed teams since last season, so the role can shift." },
  injury_risk:      { l: "Injury risk",     d: "Played under 65% of games over the last three seasons.", bad: true },
  limited_history:  { l: "Limited history", d: "Only one NBA season in the projection window." },
  age_decline:      { l: "Age 33+",         d: "Our age curve expects some decline from here." },
  unknown_position: { l: "Util only",       d: "No position listed yet. Can only fill Util slots." },
  rising:           { l: "Rising",          d: "Production per 36 minutes has been climbing over the last seasons.", good: true },
  steady:           { l: "Steady",          d: "Production per 36 minutes has been flat over the last seasons.", quiet: true },
  declining:        { l: "Declining",       d: "Production per 36 minutes has been falling over the last seasons.", bad: true },
};
export const ENGINE_NOTE = {
  world: "Played on the team simulation: for every NBA team, injuries, rotation minutes and who shares the ball are drawn game by game.",
  legacy: "Using the simpler engine for now: the team simulation is not available right now, so teammates are treated as independent.",
};
/** Genel "Projeksiyon" seçici: üç bakış. Harman = %25 simülasyon + %75 model. */
export const PROJECTION_INFO = {
  model: { l: "Model", d: "Our projection from each player's last three seasons, adjusted for his new team. The version tested against past drafts." },
  sim: { l: "Simulation", d: "Plays every team through 100 seasons of 82 games (injuries, rotation minutes, shared usage) and averages each player." },
  blend: { l: "Blend", d: "25% simulation, 75% model. In our test the mix beat either one alone on stat error." },
};
// Seçicinin işe yaradığı sayfalar: sezon simülatörü, takas ve Bu hafta zaten her zaman takım simülasyonunda çalışır.
const PROJECTION_PAGES = /\/fantasy\/(rankings|player\/|draft-plan|mock|assistant)/;
export const TREND_NOTE = "Direction over the last 2-4 seasons, already built into our projection. It describes the path, it is not a separate forecast.";

export function FlagChips({ flags = [] }) {
  return flags.filter((f) => FLAGS[f] && !FLAGS[f].quiet).map((f) => (
    <span key={f} className={`fz-flag${FLAGS[f].bad ? " bad" : FLAGS[f].good ? " good" : ""}`} title={FLAGS[f].d}>{FLAGS[f].l}</span>
  ));
}

export function PlayerMeta({ p, gap = false }) {
  const pos = p.eligible?.length ? p.eligible.join(",") : "Util";
  return (
    <div className="fz-pmeta">
      <span className="tp">{p.team} · {pos}</span>
      <ArchChip arch={p.archetype} />
      <FlagChips flags={p.flags} />
      {gap && p.sim_delta != null && (
        <span className={`fz-flag ${p.sim_delta > 0 ? "good" : "bad"}`}
          title={`Simulation ${fmt1(p.fp_sim)} vs model ${fmt1(p.fp_model)} fantasy points per game`}>
          Sim {sgn(p.sim_delta)} FP
        </span>
      )}
    </div>
  );
}

// ── Çubuklar ──────────────────────────────────────────────────────────────
/** −3…+3 SD'ye ölçeklenmiş dolgu: {left, width, color}. TO önceden çevrilmiş (sağ = iyi). */
export function barGeom(z) {
  const w = Math.min(Math.abs(z || 0) / 3, 1) * 50;
  return { left: `${z >= 0 ? 50 : 50 - w}%`, width: `${w}%`, background: z >= 0 ? GOOD : BAD };
}

export function CatBar({ cat, z, dim = false, sm = false, label, extra }) {
  return (
    <div className="fz-cbar" style={{ opacity: dim ? 0.35 : 1, ...(extra ? { gridTemplateColumns: "40px minmax(0,1fr) 40px 40px" } : {}) }}>
      <span className="c">{cat}</span>
      <div className={`fz-track${sm ? " sm" : ""}`}><span className="zero" /><span className="fill" style={barGeom(z)} /></div>
      <span className="v">{label ?? sgn(z)}</span>
      {extra != null && <span className="fz-meta" style={{ textAlign: "right" }}>{extra}</span>}
    </div>
  );
}

export function MiniCat({ z, dim = false }) {
  return (
    <div className="fz-mini" style={{ opacity: dim ? 0.35 : 1 }}>
      <span className="t">{z == null ? "–" : sgn(z)}</span>
      <div className="tr"><span className="zero" /><span className="fill" style={z == null ? {} : barGeom(z)} /></div>
    </div>
  );
}

/** Olasılığı (0..1) −3…+3 çubuğuna çevir: 50% = sıfır, 97.7% ≈ +2. Etiket yüzde. */
export function ProbBar({ cat, p, dim, sm, extra }) {
  const z = p == null ? 0 : Math.max(-3, Math.min(3, (p - 0.5) * 6));
  return <CatBar cat={cat} z={z} dim={dim} sm={sm} label={pct(p)} extra={extra} />;
}

export function RangeBar({ lo, hi, v, min, max, lg = false, title }) {
  const m = (x) => `${Math.max(0, Math.min(100, ((x - min) / (max - min || 1)) * 100))}%`;
  if (v == null) return <div className={`fz-range${lg ? " lg" : ""}`} />;
  const L = m(lo ?? v), R = m(hi ?? v);
  return (
    <div className={`fz-range${lg ? " lg" : ""}`} title={title}>
      <span className="band" style={{ left: L, width: `calc(${R} - ${L})` }} />
      <span className="mark" style={{ left: m(v) }} />
    </div>
  );
}

/** Kalma olasılığı: ≥65 yeşil · 35–64 nötr · <35 kırmızı. */
export function Meter({ p, width = 52 }) {
  const v = Math.round((p ?? 0) * 100);
  const c = v >= 65 ? GOOD : v >= 35 ? MUTED : BAD;
  const tc = v >= 65 ? GOOD : v >= 35 ? "#e5e5e5" : BAD;
  return (
    <div className="fz-meter">
      <div className="tr" style={{ width }}><div style={{ width: `${v}%`, background: c }} /></div>
      <span className="t" style={{ color: tc }}>{p == null ? "–" : `${v}%`}</span>
    </div>
  );
}

/** Küçük (i) düğmesi: üzerine gelince / odaklanınca / tıklayınca kısa açıklama. Terimleri bilmeyen kullanıcı için. */
// Ipucu ekran dışına taşarsa karşı yana çevirir (DOM'u doğrudan ayarlar: ek çizim gerektirmez).
const placeTip = (pref) => (el) => {
  if (!el) return;
  const side = (x) => { el.style.left = x === "left" ? "0" : "auto"; el.style.right = x === "left" ? "auto" : "0"; };
  side(pref);
  const r = el.getBoundingClientRect();
  const box = el.closest(".fz-page")?.getBoundingClientRect();           // yan menü / kaydırma alanı içinde kal
  const lo = Math.max(box ? box.left : 0, 0) + 8, hi = Math.min(box ? box.right : window.innerWidth, window.innerWidth) - 8;
  if (r.left < lo) side("left"); else if (r.right > hi) side("right");
};

export function InfoTip({ title, children, label = "What is this?", align = "right" }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useOutside(open, close);
  return (
    <span ref={ref} className="fz-infowrap" onMouseEnter={() => setOpen(true)} onMouseLeave={close}>
      <button type="button" className="fz-info" aria-label={label} aria-expanded={open} onFocus={() => setOpen(true)}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}>i</button>
      {open && (
        <span className="fz-tip" role="tooltip" ref={placeTip(align)}>
          {title && <span className="fz-tip-t">{title}</span>}
          {children}
        </span>
      )}
    </span>
  );
}

export function TierHeader({ label, drop }) {
  return (
    <div className="fz-tier"><span className="l">{label}</span><span className="rule" />{drop && <span className="fz-meta">{drop}</span>}</div>
  );
}

/** Fikstür hücresi. Mod: g (maç) · b2b · light. Noktalı alt çizgi = tarihsiz Cup maçı içerir. */
export function heatStyle(n, mode) {
  if (mode === "g") {
    return {
      background: n <= 2 ? `${BAD}33` : n < 3.5 ? "#1a1a1a" : n < 4.5 ? `${GOOD}29` : `${GOOD}55`,
      color: n <= 2 ? BAD : n < 3.5 ? MUTED : n < 4.5 ? GOOD : "#e5e5e5",
    };
  }
  if (mode === "b2b") return { background: n === 0 ? "#131313" : n === 1 ? "#1a1a1a" : `${BAD}33`, color: n === 0 ? MUTED : n === 1 ? "#e5e5e5" : BAD };
  return { background: n === 0 ? "#131313" : n === 1 ? "#1a1a1a" : `${GOOD}29`, color: n === 0 ? MUTED : n === 1 ? "#e5e5e5" : GOOD };
}

export function HeatCell({ w, mode = "g", height }) {
  const n = mode === "g" ? w.games_expected : mode === "b2b" ? w.back_to_backs : w.light_day_games;
  const pending = mode === "g" && (w.pending_expected || 0) > 0.01;
  const txt = mode === "g" ? (pending ? n.toFixed(1) : String(Math.round(n))) : n === 0 ? "–" : String(n);
  return (
    <div className={`fz-heat${pending ? " dotted" : ""}`} style={{ ...heatStyle(n, mode), ...(height ? { height } : {}) }}
      title={pending ? "Includes undated NBA Cup games (expected value)" : undefined}>
      {txt}
      {mode === "g" && w.back_to_backs > 0 && <span className="b2b"><i /><i /></span>}
    </div>
  );
}

// ── Durumlar ──────────────────────────────────────────────────────────────
export function SkeletonList({ rows = 8, height = 52 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="fz-row" style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr) 60px", gap: 12, alignItems: "center", height }}>
          <span className="fz-skel" style={{ height: 12 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="fz-skel" style={{ width: 180, height: 12 }} />
            <span className="fz-skel" style={{ width: 120, height: 10 }} />
          </div>
          <span className="fz-skel" style={{ height: 14 }} />
        </div>
      ))}
    </div>
  );
}

// Bu bakışta/formatta önerilerimiz gerçek sezonlarda sınanmadıysa (API `validation`) — öneri yine verilir, yalnız güven söylenir.
// Sakin ton (nötr nokta), ilk ekranda görünür; Simülasyon/Harman'dayken "Switch to Model" eylemi vardır. Bakış başına, kapatılmaz.
export function ValidationNotice({ v, compact = false }) {
  const f = useFantasy();
  const { pathname } = useLocation();
  if (!v || v.status === "validated") return null;
  const canSwitch = f.simAvailable && f.projection !== "model" && PROJECTION_PAGES.test(pathname);
  return (
    <div className="fz-notice" role="note" style={{ alignItems: "flex-start", padding: compact ? "8px 10px" : "10px 12px", flexWrap: "wrap" }}>
      <span className="dot" style={{ marginTop: 6, flexShrink: 0, background: MUTED }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 260px", minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{v.title}</span>
        {!compact && <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45 }}>{v.body}</span>}
      </span>
      {canSwitch && <button type="button" className="fz-btn sm" onClick={() => f.setProjection("model")}>Switch to Model</button>}
    </div>
  );
}

/** Sayfanın hangi bakışı gösterdiğini başlığın yanında söyler (çubuktaki seçici kolay gözden kaçar). Simülasyon yoksa hiçbir şey çizmez. */
export function ProjectionTag() {
  const f = useFantasy();
  if (!f.simAvailable) return null;
  const o = PROJECTION_INFO[f.projection];
  return (
    <span className="fz-projtag">
      <span className="fz-meta">Projection</span>
      <span className="fz-seg sm" role="group" aria-label="Projection view">
        {Object.entries(PROJECTION_INFO).map(([k, v]) => (
          <button key={k} type="button" aria-pressed={f.projection === k} className={f.projection === k ? "on" : ""} onClick={() => f.setProjection(k)}>{v.l}</button>
        ))}
      </span>
      <InfoTip label="Which numbers these are" title={`${o.l} projection`}>
        <p>{o.d}</p>
        <p>Change it from the Projection menu at the top. Simulation is the default.</p>
        <p><Link to={`/basketball/fantasy/methodology${f.query}`}>How the three views work</Link></p>
      </InfoTip>
    </span>
  );
}

/** İstek `ms`'den uzun sürdüyse true: takım simülasyonu sunucu yeniden başlayınca ~13 sn ısınır. */
function useSlow(active, ms = 3000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => setSlow(true), ms);
    return () => { clearTimeout(t); setSlow(false); };
  }, [active, ms]);
  return active && slow;
}
const WARMUP_COPY = "Warming up the league simulation, this can take up to half a minute after an update.";
export function WarmupNote({ active }) {
  const slow = useSlow(active);
  if (!active || !slow) return null;
  return <span className="fz-meta" role="status" style={{ lineHeight: 1.5 }}>{WARMUP_COPY}</span>;
}

/** Takvimli araçlar (Simulator, Trade, This week) her zaman takım simülasyonunda koşar; `legacy` = yedek motor. */
export function TeamSimLabel({ engine, onRetry }) {
  if (!engine) return null;
  return (
    <span className="fz-projtag">
      {engine === "legacy"
        ? <span className="fz-flag bad">Simpler model</span>
        : <span className="fz-flag">Team simulation</span>}
      <InfoTip label="About the team simulation" title="Team simulation" align="left">
        <p>Plays every team through 100 seasons of 82 games, with injuries, rotation minutes and shared usage, and averages each player. Injuries are drawn at random.</p>
        <p>Nobody is added or dropped in season: a player who is out only shows up as missed games.</p>
        <p><Link to="/basketball/fantasy/methodology">How it works</Link></p>
      </InfoTip>
      {engine === "legacy" && (
        <span className="fz-meta" role="status">
          We used a simpler model this time because the team simulation was not ready.
          {onRetry && <> <button type="button" className="fz-link" onClick={onRetry}>Try again</button></>}
        </span>
      )}
    </span>
  );
}

export function ErrorNote({ error, onRetry, what = "projections" }) {
  return (
    <div className="fz-state" role="alert">
      <span className="t err">Couldn't load {what}</span>
      <span className="b">{error?.message || "The server didn't answer."}</span>
      {onRetry && <button className="fz-link" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function SignInPrompt({ text = "Sign in to save leagues and drafts." }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className="fz-sub" style={{ flex: 1, fontSize: 13 }}>{text}</span>
      <button className="fz-btn sm" onClick={() => navigate("/login")}>Sign in</button>
    </div>
  );
}

// ── Format çubuğu ─────────────────────────────────────────────────────────
function useOutside(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const k = (e) => e.key === "Escape" && close();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open, close]);
  return ref;
}

export function seasonStatus(meta) {
  if (!meta) return "";
  const opening = new Date(`${meta.opening_night}T00:00:00`);
  const now = new Date();
  if (now >= opening) {
    const week = Math.max(1, Math.floor((now - opening) / 6048e5) + 1);
    const through = meta.inseason_as_of ? new Date(`${meta.inseason_as_of}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
    return `Week ${week} · in season${through ? ` · data through ${through}` : ""}`;
  }
  const built = meta.built_at ? new Date(meta.built_at) : null;
  return `Pre-season${built ? ` · projections ${built.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`;
}

function FormatMenu({ onPick, onCustom }) {
  const f = useFantasy();
  return (
    <div className="fz-pop" role="menu">
      {FORMATS.map((o) => {
        const on = !f.isCustom && f.f === o.k;
        return (
          <button key={o.k} role="menuitemradio" aria-checked={on} className={`fz-pop-item${on ? " on" : ""}`} onClick={() => onPick(o.k)}>
            <span className="t">{o.label}{on && <span className="cur">Current</span>}</span>
            <span className="d">{o.d}</span>
          </button>
        );
      })}
      <div className="fz-pop-sep" />
      <button className="fz-pop-item" style={{ minHeight: 40 }} onClick={onCustom}>
        <span style={{ fontSize: 14 }}>{f.isCustom ? `Edit ${f.fmtInfo.label}…` : "Custom league…"}</span>
      </button>
    </div>
  );
}

function ProjectionMenu({ onPick }) {
  const f = useFantasy();
  return (
    <div className="fz-pop" role="menu">
      {Object.entries(PROJECTION_INFO).map(([k, o]) => (
        <button key={k} role="menuitemradio" aria-checked={f.projection === k} className={`fz-pop-item${f.projection === k ? " on" : ""}`} onClick={() => onPick(k)}>
          <span className="t">{o.l}{f.projection === k && <span className="cur">Current</span>}</span>
          <span className="d">{o.d}</span>
        </button>
      ))}
    </div>
  );
}

function Pop({ label, value, txt, chevron = true, children, name }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="fz-pill" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={name}>
        <span className="k">{label}</span><span className={`v${txt ? " txt" : ""}`}>{value}</span>
        {chevron && <PaIcon name="chevron" size={14} color={MUTED} />}
      </button>
      {open && children(() => setOpen(false))}
    </div>
  );
}

function TeamsSlotControls({ compact = false }) {
  const f = useFantasy();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: compact ? 0 : 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <span className="fz-sub" style={{ fontSize: 13 }}>Teams</span>
        <div className="fz-stepper">
          <button aria-label="Fewer teams" disabled={f.t <= 6} onClick={() => f.set({ t: f.t - 1 })}>−</button>
          <span className="v">{f.t}</span>
          <button aria-label="More teams" disabled={f.t >= 16} onClick={() => f.set({ t: f.t + 1 })}>+</button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="fz-sub" style={{ fontSize: 13 }}>Your draft slot</span>
        <div className="fz-slots">
          {Array.from({ length: f.t }, (_, i) => i + 1).map((n) => (
            <button key={n} className={n === f.s ? "on" : ""} aria-pressed={n === f.s} onClick={() => f.set({ s: n })}>{n}</button>
          ))}
        </div>
        <span className="fz-meta">Snake · your picks <span style={{ color: "#e5e5e5" }}>{f.picks.slice(0, 4).join(", ")}…</span></span>
      </div>
    </div>
  );
}

function useSavedLeagues() {
  const { isLoggedIn } = useAuth();
  const [leagues, setLeagues] = useState([]);
  useEffect(() => {
    if (!isLoggedIn) { setLeagues([]); return; }
    fz.drafts.list()
      .then((d) => setLeagues((d.drafts || []).filter((x) => x.kind === "league")))
      .catch(() => setLeagues([]));
  }, [isLoggedIn]);
  return { leagues, isLoggedIn };
}

const K_BY_KEY = Object.fromEntries(FORMATS.map((o) => [o.key, o.k]));

/** Kayıtlı bir kaydın formatı → bağlam yaması (hazır anahtar ya da özel format). */
export function formatPatch(d, league = null) {
  const k = K_BY_KEY[d.format.key];
  return k ? { f: k, custom: null, t: d.teams, s: d.slot || 1, league }
           : { f: "custom", custom: d.format, t: d.teams, s: d.slot || 1, league };
}

/** Kayıtlı ligi seç: hazır formatsa anahtarına, değilse özel formata geç. */
export async function applySavedLeague(f, id) {
  const d = await fz.drafts.get(id);
  f.set(formatPatch(d, { id: d.id, name: d.name }));
}

export function FantasyBar() {
  const f = useFantasy();
  const [sheet, setSheet] = useState(false);
  const { leagues, isLoggedIn } = useSavedLeagues();
  const status = seasonStatus(f.meta);
  const pickFormat = (k) => f.set({ f: k });
  const { pathname } = useLocation();
  const showProj = f.simAvailable && PROJECTION_PAGES.test(pathname);

  return (
    <>
      <div className="fz-bar">
        <div style={{ flex: 1 }} />
        <Pop label="Format" value={f.fmtInfo.label} name="Change format">
          {(close) => <FormatMenu onPick={(k) => { pickFormat(k); close(); }} onCustom={() => { close(); f.openSettings(); }} />}
        </Pop>
        {showProj && (
          <Pop label="Projection" value={PROJECTION_INFO[f.projection].l} txt name="Change projection">
            {(close) => <ProjectionMenu onPick={(k) => { f.setProjection(k); close(); }} />}
          </Pop>
        )}
        <Pop label="Teams" value={f.t} chevron={false} name="Change league size">
          {() => <div className="fz-pop" style={{ minWidth: 340 }}><TeamsSlotControls /></div>}
        </Pop>
        <Pop label="Your slot" value={f.s} chevron={false} name="Change draft slot">
          {() => <div className="fz-pop" style={{ minWidth: 340 }}><TeamsSlotControls /></div>}
        </Pop>
        <Pop label="League" value={f.league?.name || "Quick setup"} txt name="Pick a saved league">
          {(close) => (
            <div className="fz-pop">
              <button className={`fz-pop-item${!f.league ? " on" : ""}`} onClick={() => { f.set({ league: null }); close(); }}>
                <span className="t">Quick setup</span><span className="d">Format, teams and slot picked by hand</span>
              </button>
              {leagues.map((l) => (
                <button key={l.id} className={`fz-pop-item${f.league?.id === l.id ? " on" : ""}`}
                  onClick={() => { applySavedLeague(f, l.id).catch(() => {}); close(); }}>
                  <span className="t">{l.name}</span>
                  <span className="d">{l.format_label || "Custom"} · {l.teams} teams{l.slot ? ` · slot ${l.slot}` : ""}</span>
                </button>
              ))}
              <div className="fz-pop-sep" />
              <div style={{ padding: "6px 12px 8px", fontSize: 13, color: MUTED }}>
                {isLoggedIn ? "Save a league from League settings." : "Sign in to save leagues."}
              </div>
            </div>
          )}
        </Pop>
        <button className="fz-icon-btn" title="League settings" aria-label="League settings" onClick={f.openSettings}>
          <PaIcon name="sliders" size={18} color={MUTED} />
        </button>
        {status && <><span className="fz-bar-sep" /><span className="fz-meta">{status}</span></>}
      </div>

      <div className="fz-bar-phone">
        <span className="status">{status}</span>
        <button className="fz-fmtchip" onClick={() => setSheet(true)} aria-label="Change format and league">
          <span className="f">{f.fmtInfo.short}</span><span className="m">{f.t} · #{f.s}</span>
          <PaIcon name="chevron" size={13} color={MUTED} />
        </button>
      </div>

      {sheet && (
        <div className="fz-sheet-root" onClick={() => setSheet(false)}>
          <div className="fz-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Format and league">
            <span className="fz-grip" />
            <span className="fz-h3">Format</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FORMATS.map((o) => (
                <button key={o.k} className={`fz-btn${!f.isCustom && f.f === o.k ? " light" : ""}`} onClick={() => pickFormat(o.k)}>{o.label}</button>
              ))}
            </div>
            <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45 }}>{f.fmtInfo.d}</span>
            {showProj && (
              <>
                <span className="fz-h3">Projection</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(PROJECTION_INFO).map(([k, o]) => (
                    <button key={k} className={`fz-btn${f.projection === k ? " light" : ""}`} onClick={() => f.setProjection(k)}>{o.l}</button>
                  ))}
                </div>
                <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45 }}>{PROJECTION_INFO[f.projection].d}</span>
              </>
            )}
            <TeamsSlotControls compact />
            <button className="fz-btn" onClick={() => { setSheet(false); f.openSettings(); }}>League settings…</button>
            <button className="fz-btn light" onClick={() => setSheet(false)}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
