import { useState, useEffect, useRef } from "react";

// ── SpinWheel ─────────────────────────────────────────────────────────────────
export default function SpinWheel({ items, spinning, targetIdx, label }) {
  const [centerIdx, setCenterIdx] = useState(0);
  const intRef = useRef(null);
  useEffect(() => {
    clearInterval(intRef.current);
    if (spinning && items.length > 0) { intRef.current = setInterval(() => setCenterIdx(i => (i + 1) % items.length), 70); }
    else if (items.length > 0) { setCenterIdx(targetIdx % items.length); }
    return () => clearInterval(intRef.current);
  }, [spinning, targetIdx, items.length]);

  const visible = [-2, -1, 0, 1, 2].map(off => ({ off, item: items[((centerIdx + off) % items.length + items.length) % items.length] }));
  return (
    <div className="flex flex-col items-center select-none">
      <div className="text-[10.5px] text-gray-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="relative w-32 rounded-xl overflow-hidden border border-gray-800 bg-darkBg">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 z-10" style={{ background: "linear-gradient(to bottom,#020817,transparent)" }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 z-10" style={{ background: "linear-gradient(to top,#020817,transparent)" }} />
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 border-y z-0"
          style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }} />
        <div className="py-1">
          {visible.map(({ off, item }) => (
            <div key={off} className={`h-10 flex items-center justify-center font-mono px-1 text-center text-xs ${off === 0 ? "font-bold" : ""}`}
              style={{ opacity: Math.max(0.07, 1 - Math.abs(off) * 0.40), color: off === 0 ? "var(--accent)" : "#64748b" }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
