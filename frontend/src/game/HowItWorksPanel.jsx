import { useState } from "react";
import "./game.css";

// ── Draft süreci paneli — Single Player, Same Screen ve With a Friend
// arasında paylaşılır. steps/note prop'larla her sayfa kendi akışını yazar.
//
// Kare 2×2 ikon kutucukları yerine YATAY numaralı satırlar: numaralandırma
// burada gerçekten anlam taşıyor (draft 1→4 sırayla işliyor), dekor değil.
// Sıra rengi de akışı anlatıyor: sarı → mavi → yeşil → mor (başlangıç→zafer).
//
// step formatı: [n, Icon, _legacyColor, title, sub, detail?, example?]
// detail verilirse satır tıklanabilir olur ve oyuncu kartlarındaki gibi
// aşağı doğru açılır (açıklama + somut örnek).
const STEP_HEX = ["#FFB11B", "#60a5fa", "#4ade80", "#c084fc"];

function Step({ n, Icon, title, sub, detail, example, hex, fill }) {
  const [open, setOpen] = useState(false);
  const expandable = !!detail;

  return (
    <div className={`g-step${expandable ? " clickable" : ""}${open ? " open" : ""}`}
      onClick={() => expandable && setOpen(o => !o)}
      style={{ "--accent": hex, "--accent-a": hex + "1f", "--accent-line": hex + "4d",
               // fill: satırlar paneli eşit paylaşıp kortun alt hattına kadar
               // uzar (grow 1 / shrink 0 → açıldığında kısalmaz, panel kaydırır).
               // İçerik dikeyde ortalanır, yoksa kalınlaşan kutunun üstünde
               // sıkışık dururdu.
               display: "flex", flexDirection: "column", justifyContent: "center",
               ...(fill ? { flex: "1 0 auto" } : null),
               padding: "11px 13px" }}>
      <div className="flex items-center gap-3">
        <span className="g-step-idx">{String(n).padStart(2, "0")}</span>
        <span className="shrink-0" style={{ color: hex }}><Icon size={19} /></span>
        <div className="min-w-0">
          <div className="g-step-title">{title}</div>
          <div className="g-step-sub">{sub}</div>
        </div>
        {expandable && <span className="g-step-chev">▾</span>}
      </div>

      {expandable && (
        <div className="g-step-wrap">
          <div className="g-step-inner">
            <div className="g-step-body" onClick={e => e.stopPropagation()}>
              <p className="g-step-detail">{detail}</p>
              {example && (
                <div className="g-step-eg">
                  <span className="g-step-eg-label">Example</span>
                  {example}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// fill=true: panel kortla aynı alt hatta bitsin diye grid hücresini doldurur
// (.g-hud-fill), adımlar taşarsa panel içinde kayar — kort büyümez.
export default function HowItWorksPanel({ steps, note, label = "Draft Process", fill = false }) {
  return (
    <div className={`g-panel p-4 space-y-3${fill ? " g-hud-fill" : ""}`}>
      <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: "15%", top: -44, width: 200, height: 110, opacity: 0.13 }} />

      <div className="g-label shrink-0">
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "var(--yamabuki)" }} />
        {label}
      </div>

      <div className={fill ? "flex-1 min-h-0 overflow-y-auto pr-0.5 flex flex-col gap-2.5" : "space-y-2.5"}>
        {steps.map(([n, Icon, , title, sub, detail, example], i) => (
          <Step key={n} n={n} Icon={Icon} title={title} sub={sub} fill={fill}
            detail={detail} example={example} hex={STEP_HEX[i % STEP_HEX.length]} />
        ))}
      </div>

      {note && (
        <p className="text-[11px] leading-relaxed pt-2.5 shrink-0"
          style={{ color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,.07)" }}>{note}</p>
      )}
    </div>
  );
}
