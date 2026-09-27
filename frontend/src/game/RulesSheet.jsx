import { useEffect } from "react";
import { createPortal } from "react-dom";
import PaIcon from "../components/shell/PaIcon";
import "./game.css";

// ── Kural penceresi (handoff 17c) ──────────────────────────────────────────
// İki sporun ⓘ modalları aynı kalıbı paylaşıyor: üstte "How to play" + büyük
// başlık, ortada anahtar/değer satırları, altta sporun aksanında CTA.
// Mobilde tam genişlikte alt sayfa. PORTAL şart: modal bazen transform/filter
// taşıyan bir atanın içinden açılıyor ve fixed konum ona hapsoluyordu.
//
// sections: [{ title?, rows: [{ k, v, c? }] }] — k: kısa anahtar (aksan renginde
// ya da c ile), v: açıklama (metin ya da JSX).
export default function RulesSheet({
  accent = "#FFB11B", eyebrow = "How to play", title, sub,
  sections = [], cta, footnote, onClose,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="g-rules-backdrop" onClick={onClose}>
      <div className="g-rules" role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()} style={{ "--accent": accent }}>
        <span className="g-rules-glow" />
        <div className="g-rules-head">
          <div className="min-w-0">
            <div className="g-rules-eyebrow">{eyebrow}</div>
            <h2 className="g-rules-title">{title}</h2>
            {sub && <div className="g-rules-sub">{sub}</div>}
          </div>
          <button className="g-rules-close" onClick={onClose} aria-label="Close">
            <PaIcon name="close" size={18} color="#b4afa8" />
          </button>
        </div>

        <div className="g-rules-body">
          {sections.map((s, si) => (
            <section key={si} className="g-rules-section">
              {s.title && <div className="g-rules-section-title">{s.title}</div>}
              {s.rows.map((r, ri) => (
                <div key={ri} className="g-rules-row">
                  <span className="k" style={r.c ? { color: r.c } : undefined}>{r.k}</span>
                  <span className="v">{r.v}</span>
                </div>
              ))}
            </section>
          ))}
          {footnote && <div className="g-rules-foot">{footnote}</div>}
        </div>

        {cta && (
          <button className="aura-rating-btn g-rules-cta" onClick={cta.onClick}>{cta.label}</button>
        )}
      </div>
    </div>,
    document.body
  );
}
