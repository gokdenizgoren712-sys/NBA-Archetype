import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gameClass } from "./ui/sportTheme";
import "./ui/sport-theme.css";
import "./ui/rules.css";

// ── Kural penceresi (mockup 5y / 6x, mobil alt sayfa) ──────────────────────
// Masaüstünde ortada modal, ≤700px'te alt sayfa. PORTAL şart: modal bazen transform/filter
// taşıyan bir atanın içinden açılıyor ve fixed konum ona hapsoluyordu.
//   steps:    [{ b, t }]  mockup'taki numaralı akış (kalın başlık + açıklama)
//   sections: [{ title?, rows: [{ k, v, c? }] }]  moda özel ayrıntılar, "More about this mode" altında
// Erişilebilirlik: odak pencereye taşınır, Tab pencere içinde döner, Esc kapatır, kapanınca odak geri gider.
export default function RulesSheet({
  sport = "basketball", title, sub, steps = [], sections = [], cta, footnote, onClose, dismissLabel = "Got it",
}) {
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = box.current;
    el?.querySelector("[data-first]")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll("button, a[href], summary, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  return createPortal(
    <div className={gameClass(sport, "sb-rsheet-backdrop")} onClick={onClose}>
      <div ref={box} className="sb-rsheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <h2>{title}</h2>
          <button type="button" className="x" data-first onClick={onClose} aria-label="Close">×</button>
        </div>
        {sub && <p className="sub">{sub}</p>}
        <div className="body">
          {steps.length > 0 && (
            <ol className="steps">
              {steps.map((s, i) => <li key={i}><span className="n">{i + 1}</span><p><b>{s.b}</b> {s.t}</p></li>)}
            </ol>
          )}
          {sections.length > 0 && (
            <details className="more">
              <summary>More about this mode</summary>
              {sections.map((s, si) => (
                <section key={si}>
                  {s.title && <h3>{s.title}</h3>}
                  {s.rows.map((r, ri) => (
                    <div key={ri} className="row"><span className="k" style={r.c ? { color: r.c } : undefined}>{r.k}</span><span className="v">{r.v}</span></div>
                  ))}
                </section>
              ))}
            </details>
          )}
          {footnote && <p className="foot">{footnote}</p>}
        </div>
        <div className="actions">
          <button type="button" className="sb-btn solid" onClick={onClose}>{dismissLabel}</button>
          {cta && <button type="button" className="sb-btn" onClick={cta.onClick}>{cta.label}</button>}
        </div>
      </div>
    </div>,
    document.body
  );
}
