import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui";

// Bakım sayfası (v3 Account Y8), kabuksuz. Tetikleyici backend'e bağlı (ticket B5, henüz yok):
// /api mimarisi `503 + Retry-After` döndürdüğünde açılır. Bu yüzden bayrak arkasında:
// VITE_MAINTENANCE_GATE=1 olmadıkça hiçbir şey kurulmaz ve uygulama davranışı değişmez.
// Gösterilen saatler yalnız yanıt başlıklarından (Retry-After, Date) türetilir; yoksa o satır gizlenir.

export const MAINTENANCE_ENABLED = import.meta.env?.VITE_MAINTENANCE_GATE === "1";
const EVENT = "pa:maintenance";

const utc = (d) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;

/** Başlıklardan başlangıç/dönüş zamanı. Retry-After saniye ya da HTTP tarihi olabilir. */
export function parseMaintenance(headers) {
  const dateHdr = headers.get("Date");
  const now = dateHdr ? new Date(dateHdr) : new Date();
  const ra = headers.get("Retry-After");
  let back = null;
  if (ra) {
    const secs = Number(ra);
    back = Number.isFinite(secs) ? new Date(now.getTime() + secs * 1000) : new Date(ra);
    if (Number.isNaN(back.getTime())) back = null;
  }
  return { started: dateHdr ? now : null, back };
}

/** fetch'i sarar: /api isteği 503 dönerse sayfayı tetikler. Bayrak kapalıyken hiçbir şey yapmaz. */
export function installMaintenanceWatch() {
  if (!MAINTENANCE_ENABLED || typeof window === "undefined" || window.__paMaint) return;
  window.__paMaint = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await orig(...args);
    const url = String(args[0]?.url || args[0] || "");
    if (res.status === 503 && url.includes("/api/")) {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: parseMaintenance(res.headers) }));
    }
    return res;
  };
}

export function MaintenancePage({ info, onCheck, checking }) {
  return (
    <div className="pa-maint pa-grid">
      <div className="pa-maint-in">
        <p className="pa-maint-brand">PRIMARY ARCH</p>
        <p className="pa-eyebrow">503 · Scheduled maintenance</p>
        <h1 className="pa-h1">{info?.back ? `Back at ${utc(info.back)}` : "Back soon"}</h1>
        <p className="pa-sys-body" style={{ textAlign: "center" }}>
          We're updating Primary Arch. Everything you saved is safe. Games, Fantasy and RankIt return together.
        </p>
        {(info?.started || info?.back) && (
          <dl className="pa-panel pa-maint-times">
            {info.started && <div><dt className="pa-eyebrow">Started</dt><dd>{utc(info.started)}</dd></div>}
            {info.back && <div><dt className="pa-eyebrow">Expected back</dt><dd>{utc(info.back)}</dd></div>}
          </dl>
        )}
        <Button variant="outline" onClick={onCheck} disabled={checking}>{checking ? "Checking…" : "Check again"}</Button>
      </div>
    </div>
  );
}

/** Uygulamayı sarar; 503 olayını dinler, "Check again" /api/meta'yı yoklar, 503 değilse sayfayı kaldırır. */
export function MaintenanceGate({ children }) {
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!MAINTENANCE_ENABLED) return undefined;
    const on = (e) => setInfo(e.detail || {});
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/meta", { cache: "no-store" });
      if (r.status === 503) setInfo(parseMaintenance(r.headers)); else setInfo(null);
    } catch { /* ağ yok: sayfa kalır */ }
    setChecking(false);
  }, []);
  if (info) return <MaintenancePage info={info} onCheck={check} checking={checking} />;
  return children;
}
