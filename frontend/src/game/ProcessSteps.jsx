import { useState } from "react";
import RulesSheet from "./RulesSheet";
import "./game.css";

// ── Draft süreci, kutusuz satır (handoff 3a / 18b) ─────────────────────────
// Eski dikey "Draft Process" panelinin yerine: dört adım yan yana, her biri
// kendi renginde parlayan numara + başlık + kısa açıklama. Kutu yok.
// Uzun açıklama ve örnek kaybolmuyor — adıma tıklayınca kural penceresinde
// açılıyor (eskiden kartın içinde açılıyordu).
//
// steps: HowItWorksPanel ile aynı biçim — [n, Icon, _, title, sub, detail, eg]
const STEP_HEX = ["#FFB11B", "#60a5fa", "#4ade80", "#c084fc"];

export default function ProcessSteps({ steps, colors = STEP_HEX, eyebrow = "Draft process" }) {
  const [open, setOpen] = useState(null);
  const cur = open != null ? steps[open] : null;
  return (
    <>
      <ol className="g-steps" aria-label="Draft process">
        {steps.map(([n, Icon, , title, sub, detail], i) => {
          const hex = colors[i % colors.length];
          const Tag = detail ? "button" : "div";
          return (
            <li key={title}>
              <Tag className="g-pstep" style={{ "--c": hex }}
                {...(detail ? { type: "button", onClick: () => setOpen(i), "aria-label": `${title} — details` } : {})}>
                <span className="g-pstep-idx">{n}</span>
                <span className="g-pstep-text">
                  <span className="g-pstep-title">
                    {Icon && <Icon size={15} />}{title}
                  </span>
                  <span className="g-pstep-sub">{sub}</span>
                </span>
              </Tag>
            </li>
          );
        })}
      </ol>
      {cur && (
        <RulesSheet accent={colors[open % colors.length]} eyebrow={`${eyebrow} · step ${cur[0]}`}
          title={cur[3]} sub={cur[4]}
          sections={[{ rows: [
            { k: "How it works", v: cur[5] },
            ...(cur[6] ? [{ k: "For example", v: cur[6] }] : []),
          ] }]}
          onClose={() => setOpen(null)} />
      )}
    </>
  );
}
