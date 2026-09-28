import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import PlayerCard from "../components/PlayerCard";
import PaIcon from "../components/shell/PaIcon";
import ExploreHeader from "../components/explore/ExploreHeader";
import { useLang } from "../contexts/LanguageContext";
import { ARCHETYPE_COLOR as ARCH_COLOR } from "../constants/archetypeColors";

// ── Explore · Compare (handoff 8b / mobil 19e) ──────────────────────────────
// İki kart, ortada VS + rol benzerliği (12 arketip skorunun merkezlenmiş
// kosinüsü) ve veriden kurulan tek cümle. Altta üst üste 12 eksenli radar |
// kazanan tarafın parladığı H2H satırları. Her oyuncu kendi sezonundan
// seçilebilir (eralar arası). URL: ?a=&as=&b=&bs=
// İlk açılışta boş sayfa yerine sezonun ilk iki oyuncusu yüklenir.

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const CURRENT = "2025-26";
const YOU = "#60a5fa", OPP = "#f87171";

const lastName = (n = "") => n.split(" ").slice(-1)[0];
const initials = (n = "") => n.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

function toCardShape(d) {
  if (!d) return null;
  return {
    PLAYER_NAME: d.name, TEAM_ABBREVIATION: d.team, POSITION: d.position,
    primary_arch: d.primary_arch, overall_score: d.overall_score, overall_pct: d.overall_pct,
    PTS: d.pts, REB: d.reb, AST: d.ast, GP: d.gp, overall_tier: d.overall_tier || "",
  };
}

function centered(scores) {
  const v = CORE.map(c => Number(scores?.[c] ?? 0));
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return v.map(x => x - m);
}
function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/* Oyuncu seçici: sezon + arama (sonuçlar açılır liste) */
function Picker({ season, seasons, onSeason, onPick, color, lang }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { setQ(""); setRes([]); setOpen(false); }, [season]);

  const change = (v) => {
    setQ(v);
    clearTimeout(timer.current);
    if (v.trim().length < 2) { setRes([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await api.historical(season, { search: v, limit: 8 });
        setRes(d.players || []); setOpen(true);
      } catch { /* sessiz: liste boş kalır */ }
    }, 280);
  };

  return (
    <div ref={ref} className="cmp-picker" style={{ "--c": color }}>
      <label className="cmp-season">
        <select value={season} onChange={e => onSeason(e.target.value)} aria-label="Season">
          {seasons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <PaIcon name="chevron" size={14} color="var(--text-muted)" />
      </label>
      <label className="ex-search cmp-q" style={{ "--tint": color }}>
        <PaIcon name="search" size={15} color="var(--text-muted)" />
        <input value={q} onChange={e => change(e.target.value)} onFocus={() => res.length && setOpen(true)}
          placeholder={lang === "tr" ? "Oyuncu değiştir" : "Change player"} aria-label="Change player" />
      </label>
      {open && res.length > 0 && (
        <div className="cmp-results" role="listbox">
          {res.map(p => (
            <button key={p.PLAYER_NAME} role="option" onClick={() => { setOpen(false); setQ(""); onPick(p.PLAYER_NAME); }}>
              <span className="nm">{p.PLAYER_NAME}<em>{p.TEAM_ABBREVIATION} · {p.POSITION}</em></span>
              <span className="ar" style={{ color: ARCH_COLOR[p.primary_arch] || "var(--text-muted)" }}>{p.primary_arch}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* 12 eksenli üst üste radar */
function Radar({ a, b, ca, cb }) {
  const N = CORE.length, R = 78, C = 100;
  const pt = (i, v) => {
    const ang = (Math.PI * 2 * i) / N - Math.PI / 2;
    return [C + Math.cos(ang) * R * v, C + Math.sin(ang) * R * v];
  };
  const poly = (sc) => CORE.map((k, i) => pt(i, Math.max(0.02, Number(sc?.[k] ?? 0))).join(",")).join(" ");
  const ring = (v) => CORE.map((_, i) => pt(i, v).join(",")).join(" ");
  return (
    <div className="cmp-radar">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {[0.25, 0.5, 0.75, 1].map(v => <polygon key={v} points={ring(v)} fill="none" stroke="rgba(255,255,255,.07)" />)}
        {CORE.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="rgba(255,255,255,.04)" />; })}
        <polygon points={poly(a)} fill={ca} fillOpacity=".18" stroke={ca} strokeWidth="1.4" style={{ filter: `drop-shadow(0 0 6px ${ca})` }} />
        <polygon points={poly(b)} fill={cb} fillOpacity=".16" stroke={cb} strokeWidth="1.4" style={{ filter: `drop-shadow(0 0 6px ${cb})` }} />
      </svg>
      {CORE.map((k, i) => {
        const [x, y] = pt(i, 1.2);
        const tx = x < 90 ? "-100%" : x > 110 ? "0%" : "-50%";
        return <span key={k} style={{ left: `${x / 2}%`, top: `${y / 2}%`, transform: `translate(${tx}, -50%)` }}>{k}</span>;
      })}
    </div>
  );
}

function H2HRow({ label, a, b, ca, cb, fmt = (v) => Math.round(v), bar = true, lowerBetter = false }) {
  if (a == null && b == null) return null;
  const aw = a != null && b != null && (lowerBetter ? a < b : a > b);
  const bw = a != null && b != null && (lowerBetter ? b < a : b > a);
  const pct = (v) => `${Math.max(0, Math.min(100, v ?? 0))}%`;
  return (
    <div className={`cmp-row${bar ? "" : " nobar"}`}>
      <b style={{ color: aw ? ca : "var(--text-secondary)", textShadow: aw ? `0 0 12px ${ca}88` : "none" }}>{a != null ? fmt(a) : "—"}</b>
      {bar && <div className="tr l"><i style={{ width: pct(a), background: ca, opacity: aw ? 1 : 0.45, boxShadow: aw ? `0 0 10px ${ca}` : "none" }} /></div>}
      <span>{label}</span>
      {bar && <div className="tr"><i style={{ width: pct(b), background: cb, opacity: bw ? 1 : 0.45, boxShadow: bw ? `0 0 10px ${cb}` : "none" }} /></div>}
      <b className="r" style={{ color: bw ? cb : "var(--text-secondary)", textShadow: bw ? `0 0 12px ${cb}88` : "none" }}>{b != null ? fmt(b) : "—"}</b>
    </div>
  );
}

export default function CompareContent() {
  const { lang } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();

  const [seasons, setSeasons] = useState([CURRENT]);
  const [side, setSide] = useState({
    a: { name: searchParams.get("a"), season: searchParams.get("as") || CURRENT, detail: null, loading: false },
    b: { name: searchParams.get("b"), season: searchParams.get("bs") || CURRENT, detail: null, loading: false },
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.seasons().then(d => setSeasons([CURRENT, ...(d.seasons || []).filter(s => s !== CURRENT)])).catch(() => {});
  }, []);

  const load = async (k, name, season) => {
    setSide(s => ({ ...s, [k]: { ...s[k], name, season, loading: true } }));
    try {
      const d = await api.historicalPlayer(season, name);
      setSide(s => ({ ...s, [k]: { name, season, detail: d, loading: false } }));
    } catch {
      setSide(s => ({ ...s, [k]: { ...s[k], loading: false } }));
    }
  };

  // İlk yükleme: URL'dekiler, yoksa sezonun en yüksek iki overall'ı
  useEffect(() => {
    const a = searchParams.get("a"), b = searchParams.get("b");
    if (a) load("a", a, side.a.season);
    if (b) load("b", b, side.b.season);
    if (!a || !b) {
      api.players({ limit: 2, sort_by: "overall_score" }).then(d => {
        const [p1, p2] = d.players || [];
        if (!a && p1) load("a", p1.PLAYER_NAME, CURRENT);
        if (!b && p2) load("b", p2.PLAYER_NAME, CURRENT);
      }).catch(() => {});
    }
  }, []); // eslint-disable-line

  // URL'yi senkron tut (paylaşılabilir karşılaştırma)
  useEffect(() => {
    const p = new URLSearchParams();
    if (side.a.detail) { p.set("a", side.a.name); p.set("as", side.a.season); }
    if (side.b.detail) { p.set("b", side.b.name); p.set("bs", side.b.season); }
    setSearchParams(p, { replace: true });
  }, [side.a.detail, side.b.detail]); // eslint-disable-line

  const A = side.a.detail, B = side.b.detail;
  const archA = A?.primary_arch, archB = B?.primary_arch;
  // Aynı arketipse iki taraf aynı renge düşmesin
  const ca = archA && archA !== archB ? ARCH_COLOR[archA] : YOU;
  const cb = archB && archA !== archB ? ARCH_COLOR[archB] : OPP;

  const sim = useMemo(() => (A && B ? cosine(centered(A.scores), centered(B.scores)) : null), [A, B]);
  const verdict = useMemo(() => {
    if (!A || !B) return "";
    const rows = CORE.map(k => ({ k, a: Number(A.scores?.[k] ?? 0), b: Number(B.scores?.[k] ?? 0) }));
    const shared = [...rows].sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b))[0];
    const split = [...rows].sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0];
    const who = split.a > split.b ? lastName(A.name) : lastName(B.name);
    const both = Math.min(shared.a, shared.b) >= 0.7
      ? `Both rate high as ${shared.k}.`
      : `Their closest ground is ${shared.k}.`;
    return `${both} They split most on ${split.k}, where ${who} is far ahead.`;
  }, [A, B]);

  const swap = () => setSide(s => ({ a: s.b, b: s.a }));
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: "Primary Arch comparison", url }).catch(() => {});
    else { await navigator.clipboard.writeText(url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };
  const sameSeason = side.a.season === side.b.season;
  const bpmFmt = (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

  // Bileşen değil düz fonksiyon: her render'da yeniden kurulup aramayı sıfırlamasın
  const renderSide = (k, d, color) => (
    <div className="cmp-side">
      <div className="cmp-card">
        {d ? <PlayerCard player={toCardShape(d)} season={side[k].season !== CURRENT ? side[k].season : undefined} expandable />
           : <div className="cmp-slot">{side[k].loading ? "Loading…" : "Pick a player"}</div>}
      </div>
      <div className="cmp-av" style={{ "--c": color }}>
        <span className="av">{d ? initials(d.name) : "?"}</span>
        <b>{d?.name || "Pick a player"}</b>
        {d && <em>{d.primary_arch}</em>}
      </div>
      <Picker season={side[k].season} seasons={seasons} color={color} lang={lang}
        onSeason={(s) => setSide(st => ({ ...st, [k]: { ...st[k], season: s } }))}
        onPick={(n) => load(k, n, side[k].season)} />
    </div>
  );

  return (
    <div className="ex-page">
      <div className="cmp-glow" aria-hidden="true" style={{ "--a": ca, "--b": cb }} />
      <div className="ex-inner">
        <ExploreHeader active="compare" />

        <div className="cmp-top">
          {renderSide("a", A, ca)}
          <div className="cmp-vs">
            <span className="vs">VS</span>
            {sim != null && (
              <>
                <span className="lbl">Role similarity</span>
                {/* kosinüs [-1,1] → 0–100: zıt profil 0, ilgisiz 50, aynı 100 */}
                <span className="pct">{Math.round(((sim + 1) / 2) * 100)}%</span>
                <p>{verdict}</p>
              </>
            )}
            <div className="cmp-actions">
              <button className="pa-btn-secondary" onClick={swap} disabled={!A && !B}>Swap sides</button>
              <button className="pa-btn-secondary cmp-share" onClick={share} disabled={!A || !B}>{copied ? "Link copied" : "Share comparison"}</button>
            </div>
          </div>
          {renderSide("b", B, cb)}
        </div>

        {A && B && (
          <>
            <div className="ex-divider" />
            <div className="cmp-bottom">
              <section className="ex-panel">
                <div className="ex-h">
                  <span>Archetype profile</span>
                  <span className="cmp-legend"><i style={{ color: ca }}>● {lastName(A.name)}</i><i style={{ color: cb }}>● {lastName(B.name)}</i></span>
                </div>
                <Radar a={A.scores} b={B.scores} ca={ca} cb={cb} />
              </section>

              <section className="ex-panel cmp-h2h">
                <div className="ex-h">
                  <span>Head to head</span>
                  <em>{sameSeason ? `Percentile within the ${side.a.season} season` : "Percentile within each player's own season"}</em>
                </div>
                {CORE.map(k => (
                  <H2HRow key={k} label={k} ca={ca} cb={cb}
                    a={A.scores?.[k] != null ? A.scores[k] * 100 : null}
                    b={B.scores?.[k] != null ? B.scores[k] * 100 : null} />
                ))}
                <div className="ex-h cmp-sub"><span>Season stats</span></div>
                <H2HRow bar={false} label="Overall" ca={ca} cb={cb}
                  a={A.overall_score != null ? A.overall_score * 100 : null} b={B.overall_score != null ? B.overall_score * 100 : null} />
                <H2HRow bar={false} label="Points" a={A.pts} b={B.pts} ca={ca} cb={cb} fmt={v => v.toFixed(1)} />
                <H2HRow bar={false} label="Rebounds" a={A.reb} b={B.reb} ca={ca} cb={cb} fmt={v => v.toFixed(1)} />
                <H2HRow bar={false} label="Assists" a={A.ast} b={B.ast} ca={ca} cb={cb} fmt={v => v.toFixed(1)} />
                <H2HRow bar={false} label="BPM" a={A.bpm} b={B.bpm} ca={ca} cb={cb} fmt={bpmFmt} />
                <H2HRow bar={false} label="Offensive BPM" a={A.obpm} b={B.obpm} ca={ca} cb={cb} fmt={bpmFmt} />
                <H2HRow bar={false} label="Defensive BPM" a={A.dbpm} b={B.dbpm} ca={ca} cb={cb} fmt={bpmFmt} />
                <H2HRow bar={false} label="Games" a={A.gp} b={B.gp} ca={ca} cb={cb} fmt={v => v} />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
