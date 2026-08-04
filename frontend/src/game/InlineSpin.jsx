import { useState, useEffect, useRef } from "react";
import "./game.css";

// ── Tek satırlık spin şeridi ──────────────────────────────────────────────
// Header dock'un ince hâlinde 3 satırlık çarka yer yok; bu yüzden aynı işi
// yapan yatay bir "tarama" şeridi: dönerken isimler kayarak geçer, durunca
// seçilen isimde sabitlenir. Kutu YOK — kenarları maskeyle söner, arka plan
// dock'un kendi camı olarak kalır.
export default function InlineSpin({ items, spinning, targetIdx, label, accent = "#FFB11B" }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);

  // 150ms: okunacak kadar yavaş, "dönüyor" hissini verecek kadar hızlı.
  // CSS'teki gSpinRoll süresiyle eşleşmeli (bkz. game.css).
  useEffect(() => {
    clearInterval(timer.current);
    if (spinning && items.length > 0) {
      timer.current = setInterval(() => setIdx(i => (i + 1) % items.length), 150);
    } else if (items.length > 0) {
      setIdx(targetIdx % items.length);
    }
    return () => clearInterval(timer.current);
  }, [spinning, targetIdx, items.length]);

  const current = items[idx] ?? "—";

  return (
    <div className="min-w-0">
      <div className={`g-spin-inline${spinning ? " spinning" : ""}`}>
        {/* key = değer: her değişimde animasyon yeniden başlar, "kayma" hissi verir */}
        <span key={`${current}-${idx}`} className="g-spin-inline-item"
          style={{
            color: spinning ? "var(--text-muted)" : accent,
            textShadow: spinning ? "none" : `0 0 20px ${accent}66`,
          }}>
          {current}
        </span>
      </div>
      {label && <div className="g-spin-caption">{label}</div>}
    </div>
  );
}
