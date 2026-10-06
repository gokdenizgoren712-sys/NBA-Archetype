// Fantezi bağlamı: format · takım sayısı · draft sırası · (varsa) kayıtlı lig.
// Tasarımın kuralı: "URL ?f=9cat&t=12&s=7 taşır, paylaşılan link aynı görünümü
// verir". Öncelik URL > localStorage > varsayılan; değişince ikisi de yazılır.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fz } from "./fantasyApi";

export const FORMATS = [
  { k: "9cat",   key: "yahoo_h2h_9cat",   label: "H2H 9-Cat",  short: "9-Cat",
    d: "FG% · FT% · 3PM · PTS · REB · AST · STL · BLK · TO, weekly head-to-head. Yahoo default scoring." },
  { k: "8cat",   key: "yahoo_h2h_8cat",   label: "H2H 8-Cat",  short: "8-Cat",
    d: "The nine categories minus turnovers, weekly head-to-head." },
  { k: "roto",   key: "yahoo_roto_9cat",  label: "Roto 9-Cat", short: "Roto",
    d: "Nine categories ranked across the full season. No weekly matchups." },
  { k: "points", key: "yahoo_h2h_points", label: "H2H Points", short: "Points",
    d: "PTS 1 · REB 1.2 · AST 1.5 · STL 3 · BLK 3 · TO −1." },
  { k: "hs",     key: "yahoo_high_score", label: "High Score", short: "High Score",
    d: "PTS 1 · REB 1 · AST 2 · STL 3 · BLK 3. Each starter's best game of the week counts, so ceiling beats consistency." },
];
export const FMT_BY_K = Object.fromEntries(FORMATS.map((f) => [f.k, f]));
export const CATS = ["FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO"];
const STORE = "fz_prefs_v1";
const DEFAULTS = { f: "9cat", t: 12, s: 7, custom: null, league: null, pr: null };   // pr: Projeksiyon bakışı; null = sitenin varsayılanı (Simülasyon varsa)
export const PROJECTIONS = ["model", "sim", "blend"];

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE) || "null") || {}; } catch { return {}; }
}
function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

/** Snake draft pick numaraları (backend dr.snake_picks ile aynı). */
export function snakePicks(teams, rounds, slot) {
  return Array.from({ length: rounds }, (_, r) => r * teams + (r % 2 === 0 ? slot : teams - slot + 1));
}
export function pickOwner(overall, teams) {
  const rnd = Math.floor((overall - 1) / teams), pos = (overall - 1) % teams;
  return rnd % 2 === 0 ? pos + 1 : teams - pos;
}

const Ctx = createContext(null);

export function FantasyProvider({ children }) {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState(() => {
    const st = { ...DEFAULTS, ...readStore() };
    const f = params.get("f");
    if (f && (FMT_BY_K[f] || f === "custom")) st.f = f;
    st.t = clampInt(params.get("t") ?? st.t, 6, 16, 12);
    st.s = clampInt(params.get("s") ?? st.s, 1, st.t, Math.min(7, st.t));
    if (st.f === "custom" && !st.custom) st.f = "9cat";
    const pp = params.get("p");
    if (PROJECTIONS.includes(pp)) st.pr = pp;   // URL > localStorage > varsayılan (paylaşılan link aynı sayıları gösterir)
    return st;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [meta, setMeta] = useState(null);

  useEffect(() => { fz.meta().then(setMeta).catch(() => setMeta(null)); }, []);

  // localStorage + URL senkronu. Alt sayfaya geçişte (params değişir) de çalışır,
  // yani sayfalar sorguyu elle taşımaz. replace: geri tuşu şişmesin.
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* özel mod */ }
    const want = { f: state.f, t: String(state.t), s: String(state.s) };
    if (PROJECTIONS.includes(state.pr)) want.p = state.pr;
    const dropP = !PROJECTIONS.includes(state.pr) && params.has("p");
    if (dropP || Object.entries(want).some(([k, v]) => params.get(k) !== v)) {
      const next = new URLSearchParams(params);
      Object.entries(want).forEach(([k, v]) => next.set(k, v));
      if (dropP) next.delete("p");
      setParams(next, { replace: true });
    }
  }, [state, params]);   // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((patch) => setState((s) => {
    const n = { ...s, ...patch };
    n.t = clampInt(n.t, 6, 16, 12);
    n.s = clampInt(n.s, 1, n.t, 1);
    // Format, takım ya da sıra elle değişince kayıtlı lig bağı kopar (pill'ler "Quick setup")
    if (!("league" in patch) && ("f" in patch || "t" in patch) && s.league) n.league = null;
    return n;
  }), []);

  const value = useMemo(() => {
    const isCustom = state.f === "custom" && state.custom;
    const fmtInfo = isCustom
      ? { k: "custom", key: "custom", label: state.custom.label || "Custom", short: "Custom", d: "Your own league settings." }
      : FMT_BY_K[state.f];
    const kind = isCustom ? state.custom.kind : state.f === "points" ? "points" : state.f === "hs" ? "high_score" : "categories";
    const cats = isCustom ? (state.custom.categories || []) : state.f === "8cat" ? CATS.slice(0, 8) : kind === "categories" ? CATS : [];
    const rosterSize = isCustom
      ? state.custom.roster.starters.length + (state.custom.roster.bench || 0)
      : state.f === "hs" ? 10 : 13;
    /** API'ye giden format: hazır anahtar ya da takım sayısı işlenmiş özel format. */
    const simOk = !!meta?.simulation;
    const projection = simOk ? (PROJECTIONS.includes(state.pr) ? state.pr : "sim") : "model";
    const apiFormat = isCustom ? { ...state.custom, teams: state.t } : fmtInfo.key;
    return {
      ...state, set, meta, fmtInfo, projection, simAvailable: simOk, setProjection: (k) => set({ pr: k }), kind, cats, rosterSize, apiFormat, isCustom: !!isCustom,
      apiTeams: isCustom ? undefined : state.t,
      isH2H: isCustom ? state.custom.matchup !== "roto" : state.f !== "roto",
      picks: snakePicks(state.t, rosterSize, state.s),
      settingsOpen, openSettings: () => setSettingsOpen(true), closeSettings: () => setSettingsOpen(false),
      query: `?f=${state.f}&t=${state.t}&s=${state.s}${PROJECTIONS.includes(state.pr) ? `&p=${state.pr}` : ""}`,
    };
  }, [state, set, meta, settingsOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFantasy() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFantasy must be used inside FantasyProvider");
  return v;
}

/** Telefon düzeni (≤767px). Tasarımda bazı sayfaların telefon sürümü ayrı yapı. */
export function useIsPhone() {
  const q = "(max-width: 767px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setOn(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return on;
}

/** Basit async veri kancası: {data, error, loading, reload}. `key` değişince yeniden çeker. */
export function useAsync(fn, key) {
  const [st, setSt] = useState({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => alive && setSt({ data, error: null, loading: false }))
      .catch((error) => alive && setSt((s) => ({ data: s.data, error, loading: false })));
    return () => { alive = false; };
  }, [key, n]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { ...st, reload: () => setN((x) => x + 1) };
}
