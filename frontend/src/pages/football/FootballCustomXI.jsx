import { useState, useEffect, useRef } from "react";
import { api } from "../../api";
import SeasonPanel from "../../game/football/SeasonPanel";
import SquadAnalysis from "../../game/football/SquadAnalysis";

// ── Custom XI ────────────────────────────────────────────────────────────────
// Basketboldaki customLineup deseninin futbol karşılığı: arama + otomatik
// tamamlama ile kadro kur, skorla. Fark: kaleci seçilebilir ama kimya hesabına
// GİRMEZ — motor onu sessizce atıyor (src/football/affinity.lineup_fit), o
// yüzden arayüz bunu açıkça söylüyor, kullanıcı puanın neden 10 kişilik
// olduğunu merak etmesin.

const PHASE_COLOR = { gk: "#F2C14E", def: "#4C9BE8", mid: "#3FB08C", fwd: "#E8654C" };

function Bar({ label, value, accent = "#3FB08C" }) {
  const v = Math.round((value ?? 0) * 100);
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11.5px] shrink-0 text-right" style={{ width: 104, color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="g-bar-track flex-1" style={{ height: 8 }}>
        <div className="g-bar-fill" style={{ width: `${v}%`, "--fill": accent, "--fill-a": accent + "66" }} />
      </div>
      <span className="font-logo text-[12.5px] font-bold w-7 text-right shrink-0 tabular-nums"
        style={{ color: accent }}>{v}</span>
    </div>
  );
}

export default function FootballCustomXI({ season }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState([]);
  const [fit, setFit] = useState(null);
  const [busy, setBusy] = useState(false);
  const deb = useRef();

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    clearTimeout(deb.current);
    deb.current = setTimeout(() => {
      api.footballSearch({ q, season, limit: 8 })
        .then(r => setHits(r.players || []))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(deb.current);
  }, [q, season]);

  const add = (p) => {
    if (picked.length >= 11) return;
    if (picked.some(x => x.PLAYER_ID === p.PLAYER_ID)) return;
    setPicked(v => [...v, p]);
    setQ(""); setHits([]); setFit(null);
  };
  const drop = (id) => {
    setPicked(v => v.filter(p => p.PLAYER_ID !== id));
    setFit(null);
  };

  const outfield = picked.filter(p => p.PHASE !== "gk").length;

  const score = () => {
    if (outfield < 2) return;
    setBusy(true);
    api.footballLineupFit(picked.map(p => p.PLAYER_ID), season)
      .then(setFit).catch(() => setFit(null)).finally(() => setBusy(false));
  };

  return (
    <div className="g-panel p-4 space-y-3">
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Build your own XI from any club in any loaded season. A goalkeeper is
        allowed but sits outside the score — only the ten outfield players are
        judged on how they fit together.
      </div>

      <div style={{ position: "relative" }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search a player…" className="aura-ghost-input w-full"
          disabled={picked.length >= 11} />
        {hits.length > 0 && (
          <div className="absolute z-30 w-full mt-1 rounded-lg overflow-hidden"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            {/* Anahtar lig+faz içeriyor: ara transferde aynı PLAYER_ID iki
                ligde birden dönüyor (ör. Lookman: Atlético + Atalanta). */}
            {hits.map(p => (
              <button key={`${p.PLAYER_ID}-${p.LEAGUE}-${p.PHASE}`} onClick={() => add(p)}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2"
                style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-[9.5px] uppercase"
                  style={{ color: PHASE_COLOR[p.PHASE], minWidth: 22 }}>{p.POSITION}</span>
                <span className="text-[12px] text-white truncate" style={{ flex: 1 }}>
                  {p.PLAYER_NAME}
                </span>
                <span className="text-[10.5px] truncate"
                  style={{ color: "var(--text-faint)", maxWidth: 110 }}>{p.TEAM}</span>
                <b className="text-[11px]" style={{ color: PHASE_COLOR[p.PHASE] }}>
                  {Math.round((p.overall_score || 0) * 100)}
                </b>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span>{picked.length}/11 · {outfield} outfield</span>
        <button onClick={score} className="aura-pill-btn active ml-auto"
          disabled={outfield < 2 || busy}>{busy ? "Scoring…" : "Score this XI"}</button>
        {picked.length > 0 && (
          <button onClick={() => { setPicked([]); setFit(null); }}
            className="aura-pill-btn">Clear</button>
        )}
      </div>

      {picked.length > 0 && (
        <div className="grid gap-1"
          style={{ gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))" }}>
          {picked.map(p => (
            <button key={`${p.PLAYER_ID}-${p.LEAGUE}-${p.PHASE}`} onClick={() => drop(p.PLAYER_ID)}
              title="Remove" className="g-rr text-left"
              style={{ "--accent": PHASE_COLOR[p.PHASE], "--accent-a": PHASE_COLOR[p.PHASE] + "1f",
                       "--accent-line": PHASE_COLOR[p.PHASE] + "4d" }}>
              <span className="g-rr-pos">{p.POSITION || p.PHASE.toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <div className="g-rr-name truncate">{p.PLAYER_NAME}</div>
                <div className="g-rr-meta">
                  <span className="g-rr-arch" style={{ color: PHASE_COLOR[p.PHASE] }}>{p.primary_arch}</span>
                  {p.PHASE === "gk" && (
                    <span className="g-rr-chip"
                      style={{ "--c": "#8b857e", "--c-a": "rgba(255,255,255,.04)", "--c-line": "rgba(255,255,255,.12)" }}>
                      NOT SCORED
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {fit && !fit.error && (
        <div className="pt-2 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold" style={{ color: "#3FB08C" }}>
              {Math.round(fit.score * 100)}
            </span>
            <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              {fit.formation ? `reads as ${fit.formation}` : "not a legal shape yet"}
              {" · "}{fit.n_outfield} outfield scored
            </span>
          </div>
          <Bar label="Role slots" value={fit.slots} />
          {/* Skora dahil DEĞİL — ölçümde sıfırdan ayırt edilemedi
              (bkz. src/football/affinity.py ağırlık notu). Teşhis için duruyor. */}
          <Bar label="Pair affinity *" value={fit.pairs} accent="#6b7280" />
          <Bar label="Shape" value={fit.shape} />
          <Bar label="Role diversity" value={fit.diversity} />
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Strongest <b style={{ color: "#3FB08C" }}>{fit.strongest}</b>{" · "}
            Weakest <b style={{ color: "#E8654C" }}>{fit.weakest}</b>
          </div>
        </div>
      )}

      {/* Karne "bu XI ne yapabiliyor", simülasyon "peki ne kazanır". */}
      {fit && !fit.error && <SquadAnalysis fit={fit} starters={picked} />}

      {fit && !fit.error && (
        <SeasonPanel starters={picked} chemistry={fit.score} season={season}
          squadName="Custom XI" />
      )}
    </div>
  );
}
