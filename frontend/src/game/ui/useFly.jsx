import { useCallback, useEffect, useRef, useState } from "react";

// Seçilen satırdan slota uçan token (Draft Flow adım 4 → 5): 0.8 sn, cubic-bezier(.5,0,.2,1).
// fly(fromEl, toEl, label, done): animasyon bitince done() çağrılır (slot o zaman dolar).
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function useFly() {
  const [t, setT] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const fly = useCallback((fromEl, toEl, label, done) => {
    if (!fromEl || !toEl || reduced()) { done(); return; }
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const from = { x: a.left + 28, y: a.top + a.height / 2 }, to = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    setT({ ...from, op: 0, label, tr: "none" });
    timers.current.push(setTimeout(() => setT({ ...from, op: 1, label, tr: "opacity .2s" }), 20));
    timers.current.push(setTimeout(() => setT({ ...to, op: 1, label, tr: "left .8s cubic-bezier(.5,0,.2,1), top .8s cubic-bezier(.5,0,.2,1)" }), 220));
    timers.current.push(setTimeout(() => { setT((c) => c && { ...c, op: 0, tr: "opacity .3s" }); done(); }, 1020));
    timers.current.push(setTimeout(() => setT(null), 1340));
  }, []);
  const token = t && (
    <div className="sb-token" aria-hidden="true" style={{ left: t.x, top: t.y, opacity: t.op, transition: t.tr }}>{t.label}</div>
  );
  return { fly, token, flying: !!t };
}
