import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import "../game.css";

// ── Futbol oyuncu araması ────────────────────────────────────────────────
// Compare ve Custom XI ayrı ayrı kendi arama kutusunu taşıyordu ve ikisi de
// aynı üç hatayı yapıyordu:
//
//   1. Açılır liste .g-panel'in İÇİNDE konumlanıyordu — panelde
//      `overflow: hidden` var, dolayısıyla liste kırpılıyordu. "Sonuçların
//      altı yarım görünüyor" ve "tıklayınca oyuncu gelmiyor" şikâyetlerinin
//      ikisi de bu tek sebepten: kırpılan alana yapılan tıklama hiç
//      butona ulaşmıyordu.
//   2. Liste akışta absolute idi; panel kaydırılınca girdiden kopuyordu.
//   3. Blur ile kapanma yoktu, dışarı tıklayınca liste açık kalıyordu.
//
// Çözüm: liste PORTAL ile body'ye çiziliyor ve girdinin ekran koordinatına
// sabitleniyor (position: fixed). Böylece hiçbir kapsayıcı onu kırpamıyor.

const PHASE_COLOR = { gk: "#F2C14E", def: "#4C9BE8", mid: "#3FB08C", fwd: "#E8654C" };
const PHASE_LABEL = { gk: "Goalkeeper", def: "Defence", mid: "Midfield", fwd: "Attack" };

export default function PlayerSearch({
  label, value, onPick, phase, season, accent = "#3FB08C",
  placeholder, limit = 8,
  // Çağıranın eklemek istediği sorgu parametreleri (ör. fotoğraf yerleşimi
  // sayfası photos_only geçiyor). Sabit bir liste tutmak yerine geçirgen:
  // her yeni süzgeç için bu bileşeni değiştirmek gerekmesin.
  params,
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const boxRef = useRef(null);
  const deb = useRef();

  const measure = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    clearTimeout(deb.current);
    deb.current = setTimeout(() => {
      api.footballSearch({ q, season, limit, ...(phase ? { phase } : {}), ...params })
        .then(r => { setHits(r.players || []); measure(); })
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(deb.current);
  }, [q, phase, season, limit, params, measure]);

  // Liste açıkken sayfa kayarsa/boyut değişirse girdiye yapışık kalsın
  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [open, measure]);

  // Dışarı tıklayınca kapan — blur kullanmıyoruz, çünkü blur seçim
  // tıklamasından ÖNCE tetiklenip listeyi kaldırıyor ve seçim hiç olmuyor.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (e.target.closest?.("[data-player-search-menu]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (p) => { onPick(p); setQ(""); setHits([]); setOpen(false); };
  const showMenu = open && hits.length > 0 && !value && rect;

  return (
    <div style={{ position: "relative", flex: 1 }} ref={boxRef}>
      {label && <div className="g-label mb-1.5" style={{ "--accent": accent }}>{label}</div>}
      <input
        value={value ? value.PLAYER_NAME : q}
        onChange={e => { setQ(e.target.value); setOpen(true); measure(); if (value) onPick(null); }}
        onFocus={() => { setOpen(true); measure(); }}
        onKeyDown={e => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && hits.length) { e.preventDefault(); choose(hits[0]); }
        }}
        placeholder={placeholder || (phase ? `Search ${PHASE_LABEL[phase]}…` : "Search a player…")}
        className="aura-ghost-input w-full"
        style={value ? { borderColor: accent } : undefined}
      />

      {showMenu && createPortal(
        <div data-player-search-menu
          className="g-panel"
          style={{
            position: "fixed", left: rect.left, top: rect.top, width: rect.width,
            zIndex: 90, maxHeight: 264, overflowY: "auto", padding: 4,
            "--accent": accent, "--accent-line": accent + "55",
          }}>
          {hits.map(p => (
            <button key={`${p.PLAYER_ID}-${p.PHASE}-${p.LEAGUE}`}
              type="button"
              // mousedown ile seçiyoruz: click'ten önce gelir, girdi blur olup
              // listeyi kapatsa bile seçim garanti çalışır.
              onMouseDown={e => { e.preventDefault(); choose(p); }}
              className="g-rr w-full"
              style={{ "--accent": PHASE_COLOR[p.PHASE] || accent,
                       "--accent-a": (PHASE_COLOR[p.PHASE] || accent) + "1f",
                       "--accent-line": (PHASE_COLOR[p.PHASE] || accent) + "4d" }}>
              <span className="g-rr-pos">{p.POSITION}</span>
              <div className="flex-1 min-w-0">
                <div className="g-rr-name truncate">{p.PLAYER_NAME}</div>
                <div className="g-rr-meta">
                  <span className="g-rr-arch" style={{ color: PHASE_COLOR[p.PHASE] || accent }}>
                    {p.primary_arch || PHASE_LABEL[p.PHASE]}
                  </span>
                  <span className="g-rr-chip"
                    style={{ "--c": "#8b857e", "--c-a": "rgba(255,255,255,.04)", "--c-line": "rgba(255,255,255,.12)" }}>
                    {p.TEAM}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
