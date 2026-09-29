// Lig ayarları (tasarım 2): masaüstünde modal, telefonda tam sayfa sheet.
// Canlı doğrulama backend'in sınırlarıyla aynı (config/fantasy_formats.py LIMITS).
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { fz } from "./fantasyApi";
import { CATS, useFantasy } from "./useFantasy";

const SLOT_KEYS = ["PG", "SG", "G", "SF", "PF", "F", "C", "Util", "Bench", "IL"];
const SLOT_MAX = { Util: 6, Bench: 6, IL: 5 };
const YAHOO_SLOTS = { PG: 1, SG: 1, G: 1, SF: 1, PF: 1, F: 1, C: 2, Util: 2, Bench: 3, IL: 3 };
const WEIGHT_KEYS = [["PTS", "PTS"], ["REB", "REB"], ["AST", "AST"], ["STL", "STL"], ["BLK", "BLK"], ["TO", "TOV"]];
const YAHOO_WEIGHTS = { PTS: "1", REB: "1.2", AST: "1.5", STL: "3", BLK: "3", TO: "-1" };

function initialFrom(f) {
  if (f.isCustom) {
    const c = f.custom;
    const slots = Object.fromEntries(SLOT_KEYS.map((k) => [k, 0]));
    c.roster.starters.forEach((s) => { slots[s] = (slots[s] || 0) + 1; });
    slots.Bench = c.roster.bench || 0;
    slots.IL = c.roster.il || 0;
    const w = { ...YAHOO_WEIGHTS };
    Object.entries(c.weights || {}).forEach(([k, v]) => { w[k === "TOV" ? "TO" : k] = String(v); });
    return { name: c.label || "My league", teams: String(f.t), scoring: c.kind === "points" ? "points" : "cats",
             cats: CATS.map((x) => (c.categories || CATS).includes(x)), w, slots };
  }
  return { name: f.league?.name || "My league", teams: String(f.t),
           scoring: f.kind === "points" ? "points" : "cats",
           cats: CATS.map((x) => (f.cats.length ? f.cats : CATS).includes(x)), w: { ...YAHOO_WEIGHTS }, slots: { ...YAHOO_SLOTS } };
}

function toFormat(L) {
  const starters = [];
  SLOT_KEYS.filter((k) => k !== "Bench" && k !== "IL").forEach((k) => { for (let i = 0; i < L.slots[k]; i += 1) starters.push(k); });
  const base = { label: L.name.trim() || "My league", matchup: "h2h", teams: parseInt(L.teams, 10),
                 roster: { starters, bench: L.slots.Bench, il: L.slots.IL } };
  if (L.scoring === "cats") return { ...base, kind: "categories", categories: CATS.filter((_, i) => L.cats[i]) };
  return { ...base, kind: "points",
           weights: Object.fromEntries(WEIGHT_KEYS.map(([k, api]) => [api, parseFloat(L.w[k])]).filter(([, v]) => v !== 0 && Number.isFinite(v))) };
}

function Seg({ opts, val, on }) {
  return (
    <div className="fz-seg dark">
      {opts.map(([k, l]) => <button key={k} className={val === k ? "on" : ""} onClick={() => on(k)}>{l}</button>)}
    </div>
  );
}

export default function LeagueSettings() {
  const f = useFantasy();
  const { isLoggedIn } = useAuth();
  const [L, setL] = useState(() => initialFrom(f));
  const [saving, setSaving] = useState(false);
  const [serverErr, setServerErr] = useState("");
  const upd = (o) => setL((s) => ({ ...s, ...o }));

  useEffect(() => {
    const k = (e) => e.key === "Escape" && f.closeSettings();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [f]);

  const tn = parseInt(L.teams, 10);
  const tOk = /^\d+$/.test(String(L.teams).trim()) && tn >= 6 && tn <= 16;
  const nCats = L.cats.filter(Boolean).length;
  const starters = SLOT_KEYS.filter((k) => k !== "Bench" && k !== "IL").reduce((a, k) => a + L.slots[k], 0);
  const badWeight = L.scoring === "points" && WEIGHT_KEYS.some(([k]) => !Number.isFinite(parseFloat(L.w[k])));
  const errs = useMemo(() => {
    const e = [];
    if (!tOk) e.push("League size must be 6–16");
    if (L.scoring === "cats" && nCats < 3) e.push("Pick at least 3 categories");
    if (starters < 5 || starters > 15) e.push("Starting slots must be 5–15");
    if (badWeight) e.push("Point weights must be numbers");
    return e;
  }, [tOk, L.scoring, nCats, starters, badWeight]);
  const drafted = tOk ? tn * (starters + L.slots.Bench) : 0;

  const apply = (league) => {
    f.set({ f: "custom", custom: toFormat(L), t: tn, league });
    f.closeSettings();
  };

  const save = async () => {
    if (errs.length) return;
    setServerErr("");
    if (!isLoggedIn) { apply(null); return; }
    setSaving(true);
    try {
      const fmt = toFormat(L);
      const d = await fz.drafts.create({ kind: "league", name: fmt.label, format: fmt, teams: tn,
                                          slot: Math.min(f.s, tn), state: {} });
      apply({ id: d.id, name: d.name });
    } catch (e) {
      setServerErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fz-overlay" onClick={f.closeSettings}>
      <div className="fz-modal" role="dialog" aria-modal="true" aria-label="League settings" onClick={(e) => e.stopPropagation()}>
        <div className="fz-modal-head">
          <span className="fz-d" style={{ fontSize: 26 }}>League settings</span>
          <button className="fz-close" aria-label="Close" onClick={f.closeSettings}>×</button>
        </div>
        <div className="fz-modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 160px", gap: 16 }}>
            <label className="fz-field"><span>League name</span>
              <input className="fz-input" value={L.name} maxLength={60} onChange={(e) => upd({ name: e.target.value })} /></label>
            <label className="fz-field"><span>Teams</span>
              <input className={`fz-input fz-num${tOk ? "" : " bad"}`} style={{ fontSize: 18 }} inputMode="numeric"
                value={L.teams} onChange={(e) => upd({ teams: e.target.value })} aria-invalid={!tOk} />
              {!tOk && <span className="fz-err">League size must be 6–16</span>}
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="fz-d" style={{ fontSize: 19 }}>Scoring</span>
              <Seg opts={[["cats", "Categories"], ["points", "Points"]]} val={L.scoring} on={(k) => upd({ scoring: k })} />
            </div>
            {L.scoring === "cats" ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {CATS.map((c, i) => {
                    const on = L.cats[i];
                    return (
                      <button key={c} className="fz-d" aria-pressed={on}
                        style={{ height: 36, padding: "0 13px", border: 0, borderRadius: 9, fontSize: 15, cursor: "pointer",
                                 background: on ? "#262626" : "transparent", color: on ? "#e5e5e5" : "#8a8a8a",
                                 boxShadow: on ? "none" : "inset 0 0 0 1px #262626" }}
                        onClick={() => upd({ cats: L.cats.map((x, j) => (j === i ? !x : x)) })}>{c}</button>
                    );
                  })}
                </div>
                <span style={{ fontSize: 13, color: nCats < 3 ? "#f87171" : "#8a8a8a" }}>
                  {nCats < 3 ? "Pick at least 3 categories" : `${nCats} categories · ${L.cats[8] ? "TO counts, lower is better" : "no turnovers"}`}
                </span>
              </>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "8px 16px" }}>
                {WEIGHT_KEYS.map(([k]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44,
                                          padding: "0 4px 0 12px", borderRadius: 10, background: "#0b0b0b" }}>
                    <span className="fz-d" style={{ fontSize: 15, color: "#8a8a8a" }}>{k}</span>
                    <input className="fz-num" inputMode="decimal" value={L.w[k]}
                      onChange={(e) => upd({ w: { ...L.w, [k]: e.target.value } })}
                      style={{ width: 64, height: 36, border: 0, borderRadius: 8, background: "#1a1a1a", color: "#e5e5e5",
                               textAlign: "right", padding: "0 10px", fontSize: 17, outline: "none" }} />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="fz-d" style={{ fontSize: 19 }}>Roster slots</span>
              <span style={{ fontSize: 13, color: "#8a8a8a" }}>{starters} starters · {L.slots.Bench} bench · {L.slots.IL} IL</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0 28px" }}>
              {SLOT_KEYS.map((k) => (
                <div key={k} className="fz-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 48 }}>
                  <span className="fz-d" style={{ fontSize: 16 }}>{k}</span>
                  <div className="fz-stepper" style={{ background: "transparent" }}>
                    <button aria-label={`Fewer ${k}`} disabled={L.slots[k] <= 0}
                      onClick={() => upd({ slots: { ...L.slots, [k]: Math.max(0, L.slots[k] - 1) } })}>−</button>
                    <span className="v" style={{ width: 28, fontSize: 18 }}>{L.slots[k]}</span>
                    <button aria-label={`More ${k}`} disabled={L.slots[k] >= (SLOT_MAX[k] || 4)}
                      onClick={() => upd({ slots: { ...L.slots, [k]: Math.min(SLOT_MAX[k] || 4, L.slots[k] + 1) } })}>+</button>
                  </div>
                </div>
              ))}
            </div>
            {drafted > 220 && (
              <span style={{ fontSize: 13, paddingTop: 6 }}>
                {tn} teams × {starters + L.slots.Bench} spots drafts {drafted} players. Projections past the top 220 get rough.
              </span>
            )}
          </div>
        </div>
        <div className="fz-modal-foot">
          <span className="fz-err" style={{ flex: 1 }}>
            {serverErr || (errs.length ? `Fix ${errs.length} issue${errs.length > 1 ? "s" : ""} to save: ${errs.join(" · ")}` : "")}
          </span>
          <button className="fz-btn quiet" onClick={f.closeSettings}>Cancel</button>
          <button className="fz-gold" disabled={errs.length > 0 || saving} onClick={save}>
            {isLoggedIn ? (saving ? "Saving…" : "Save league") : "Use these settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
