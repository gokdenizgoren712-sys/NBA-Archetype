import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import { api } from "../../api";

// ── Fotoğraf yerleşimi ───────────────────────────────────────────────────────
// Arka planı kaldırılmış fotoğraflar farklı oranlarda kesiliyor: kimi omuzdan,
// kimi belden, kiminde oyuncu kadrajın kenarında. Kartta tek bir CSS kuralı
// hepsine oturmuyor — kimi yüzden kırpılıyor, kimi kartın dibinde kalıyor.
// Bu sayfa o istisnaları elle düzeltmek için: solda gerçek kart ölçüsünde
// önizleme, sağda üç kaydırma. Kaydı olmayan oyuncu varsayılanı kullanır,
// yani burada hiçbir şey yapılmazsa site bugünküyle aynı görünür.

const ACC = "#3FB08C";
const DEF = { scale: 1.0, x: 50, y: 100 };
const PHASE_LABEL = { gk: "Goalkeeper", def: "Defence", mid: "Midfield", fwd: "Attack" };

function authFetch(path, token, opts = {}) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

/** Karttaki fotoğraf kutusunun birebir kopyası — ölçüler PlayerCard.css ile aynı. */
function Preview({ src, lay, name }) {
  return (
    <div style={{ position: "relative", width: 168, height: 236, borderRadius: 12,
      overflow: "hidden", background: "linear-gradient(160deg,#201c14,#0c0b0e)",
      border: "1px solid var(--border)", flex: "0 0 auto" }}>
      {src && (
        <img src={src} alt="" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "contain",
          objectPosition: `${lay.x}% ${lay.y}%`,
          transform: `scale(${lay.scale})`,
          transformOrigin: `${lay.x}% ${lay.y}%`,
          filter: "drop-shadow(0 10px 18px rgba(0,0,0,.55))",
        }} />
      )}
      {/* Kartta isim bandı fotoğrafın altını örtüyor — kırpma kararını
          etkilediği için önizlemede de var. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 46,
        background: "linear-gradient(to top, rgba(12,11,14,.96), transparent)" }} />
      <div style={{ position: "absolute", left: 8, right: 8, bottom: 6, fontSize: 11,
        fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis" }}>{name}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
      <span style={{ width: 74, color: "var(--text-muted)" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: ACC }} />
      <span style={{ width: 46, textAlign: "right", fontVariantNumeric: "tabular-nums",
        color: ACC }}>{value}{suffix}</span>
    </div>
  );
}

export default function PhotoLayout() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [sel, setSel] = useState(null);
  const [lay, setLay] = useState(DEF);
  const [meta, setMeta] = useState(null);       // credits + cdn + layouts
  const [msg, setMsg] = useState("");
  const deb = useRef();

  useEffect(() => {
    fetch("/api/football/photo-credits", { cache: "no-store" })
      .then(r => r.json()).then(setMeta).catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    clearTimeout(deb.current);
    deb.current = setTimeout(() => {
      api.footballSearch({ q, limit: 10 })
        .then(r => setHits(r.players || []))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(deb.current);
  }, [q]);

  const pick = (p) => {
    setSel(p); setQ(""); setHits([]); setMsg("");
    const saved = meta?.layouts?.[String(p.PLAYER_ID)];
    setLay(saved ? { scale: saved.scale, x: saved.x, y: saved.y } : DEF);
  };

  const src = (() => {
    if (!sel || !meta) return null;
    const id = meta.cloudinary?.ids?.[String(sel.PLAYER_ID)];
    if (id && meta.cloudinary?.cloud_name)
      return `https://res.cloudinary.com/${meta.cloudinary.cloud_name}/image/upload/f_auto,q_auto,h_472/${id}`;
    const c = meta.credits?.[String(sel.PLAYER_ID)];
    return c?.modified
      ? `/football-cutouts/${sel.PLAYER_ID}.webp`
      : `/football-photos/${sel.PLAYER_ID}.jpg`;
  })();

  const save = useCallback(() => {
    if (!sel) return;
    authFetch("/admin/football/photo-layout", token, {
      method: "POST",
      body: JSON.stringify({ player_id: sel.PLAYER_ID, scale: lay.scale,
                             offset_x: lay.x, offset_y: lay.y }),
    }).then(r => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setMsg("Saved.");
        setMeta(m => ({ ...m, layouts: { ...(m?.layouts || {}),
          [String(sel.PLAYER_ID)]: { scale: lay.scale, x: lay.x, y: lay.y } } }));
      })
      .catch(() => setMsg("Could not save."));
  }, [sel, lay, token]);

  const clearSaved = useCallback(() => {
    if (!sel) return;
    authFetch(`/admin/football/photo-layout/${sel.PLAYER_ID}`, token, { method: "DELETE" })
      .then(() => {
        setLay(DEF); setMsg("Reset to default.");
        setMeta(m => {
          const next = { ...(m?.layouts || {}) };
          delete next[String(sel.PLAYER_ID)];
          return { ...m, layouts: next };
        });
      })
      .catch(() => setMsg("Could not reset."));
  }, [sel, token]);

  const adjusted = Object.keys(meta?.layouts || {}).length;

  return (
    <div className="h-full overflow-y-auto">
      <SEO title="Photo layout" noindex />
      <div className="max-w-4xl mx-auto p-5 space-y-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-logo text-2xl font-bold text-white">Photo layout</h1>
          <Link to="/admin/articles" className="aura-pill-btn" style={{ fontSize: 11 }}>
            &larr; Admin
          </Link>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
            {adjusted} player{adjusted === 1 ? "" : "s"} adjusted
          </span>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 640 }}>
          Cut-out photos come in different crops &mdash; some from the shoulders, some
          from the waist, some with the player off to one side. Adjust how one sits in
          the card here. Players you never touch keep the default framing.
        </p>

        <div className="g-panel p-4" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
          <div style={{ position: "relative" }}>
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search a player…" className="aura-ghost-input w-full" />
            {hits.length > 0 && (
              <div className="absolute z-30 w-full mt-1 rounded-lg overflow-hidden"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                {hits.map(p => (
                  <button key={`${p.PLAYER_ID}-${p.LEAGUE}-${p.PHASE}`} onClick={() => pick(p)}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2"
                    style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-[9.5px] uppercase"
                      style={{ minWidth: 22, color: "var(--text-faint)" }}>{p.POSITION}</span>
                    <span className="text-[12px] text-white truncate" style={{ flex: 1 }}>
                      {p.PLAYER_NAME}
                    </span>
                    <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                      {p.TEAM}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!sel && (
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 14 }}>
              Search for a player to start.
            </div>
          )}

          {sel && (
            <div style={{ display: "flex", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
              <Preview src={src} lay={lay} name={sel.PLAYER_NAME} />

              <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column",
                gap: 12, minWidth: 260 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {sel.PLAYER_NAME}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                    {sel.TEAM} · {PHASE_LABEL[sel.PHASE] || sel.PHASE} · {sel.POSITION}
                    {meta?.credits?.[String(sel.PLAYER_ID)]?.modified
                      ? " · cut-out" : " · raw photo"}
                  </div>
                </div>

                <Slider label="Zoom" value={lay.scale} min={0.5} max={2.5} step={0.05}
                  onChange={v => setLay(l => ({ ...l, scale: v }))} suffix="×" />
                <Slider label="Horizontal" value={lay.x} min={0} max={100} step={1}
                  onChange={v => setLay(l => ({ ...l, x: v }))} suffix="%" />
                <Slider label="Vertical" value={lay.y} min={0} max={100} step={1}
                  onChange={v => setLay(l => ({ ...l, y: v }))} suffix="%" />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <button onClick={save} className="aura-rating-btn"
                    style={{ borderColor: ACC, color: ACC }}>Save</button>
                  <button onClick={() => setLay(DEF)} className="aura-pill-btn">Default</button>
                  <button onClick={clearSaved} className="aura-pill-btn">Clear saved</button>
                  {msg && <span style={{ fontSize: 11, color: "var(--text-muted)",
                    alignSelf: "center" }}>{msg}</span>}
                </div>

                {!src && (
                  <div style={{ fontSize: 11, color: "#E8654C" }}>
                    No photo for this player &mdash; nothing to position.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
