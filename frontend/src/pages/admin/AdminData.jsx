import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import AdminLayout, { authFetch, ago } from "./AdminLayout";
import { ErrorState } from "../../components/states/States";

// ── Admin · Data (handoff 15a / mobil 21g) ──────────────────────────────────
// Kenar çubuğundaki "Refresh data" buraya taşındı (handoff kuralı). Göstergeler
// gerçek: son yenilemenin durumu/süresi/hatası (scripts/refresh.py'nin durum
// dosyası), kaynak başına cache dosyalarının değişiklik zamanı. Siteden
// yalnızca NBA güncel sezonu yenilenebiliyor; diğer kaynaklar elle koşulan
// betikler — satırları bunu söylüyor, sahte bir "Run" düğmesi yok.

const DAY = 86400000;
function freshness(iso) {
  if (!iso) return { t: "Missing", c: "#f87171" };
  const age = Date.now() - new Date(iso).getTime();
  if (age < 2 * DAY) return { t: "Fresh", c: "#4ade80" };
  if (age < 14 * DAY) return { t: "Aging", c: "#facc15" };
  return { t: "Stale", c: "#fb923c" };
}
const RUN_LABEL = { ok: ["Succeeded", "#4ade80"], error: ["Failed", "#f87171"], running: ["Running", "#60a5fa"], never_run: ["Never run", "#8b857e"], unreadable: ["Unreadable", "#f87171"] };

export default function AdminData() {
  const { token } = useAuth();
  const [status, setStatus] = useState(null);
  const [sources, setSources] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const poll = useRef(null);

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        authFetch("/admin/refresh-status", token).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
        authFetch("/admin/data-sources", token).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      ]);
      setStatus(s); setSources(d.sources || []); setError(false);
      return s;
    } catch { setError(true); return null; }
  }, [token]);

  useEffect(() => { load(); return () => clearInterval(poll.current); }, [load]);

  // Çalışırken 5 sn'de bir durum sor; bitince dur
  useEffect(() => {
    clearInterval(poll.current);
    if (status?.running || status?.status === "running") {
      poll.current = setInterval(async () => { const s = await load(); if (s && !s.running && s.status !== "running") clearInterval(poll.current); }, 5000);
    }
  }, [status?.running, status?.status, load]);

  const refresh = async () => {
    setBusy("refresh"); setMsg("");
    const r = await authFetch("/admin/trigger-refresh", token, { method: "POST" }).then(x => x.json()).catch(() => null);
    setMsg(!r ? "The refresh didn't start. Check the API server." : r.ok ? "Refresh started. This page updates on its own." : "A refresh is already running.");
    setBusy(""); load();
  };
  const clearCache = async () => {
    setBusy("cache"); setMsg("");
    const r = await authFetch("/admin/clear-cache", token, { method: "POST" }).catch(() => null);
    setMsg(r?.ok ? "API cache cleared — the next request reloads every table." : "The cache wasn't cleared. Check the API server.");
    setBusy("");
  };

  const running = status?.running || status?.status === "running";
  const [runLbl, runC] = RUN_LABEL[running ? "running" : status?.status] || ["Unknown", "#8b857e"];
  const fresh = (sources || []).filter(s => freshness(s.updated_at).t === "Fresh").length;
  const KPIS = [
    { v: running ? "Running" : ago(status?.last_run), l: "Last NBA refresh", c: running ? "#60a5fa" : null },
    { v: runLbl, l: "Last result", c: runC },
    { v: status?.duration_s != null ? `${Math.round(status.duration_s / 60)} min` : "—", l: "Took" },
    { v: sources ? `${fresh}/${sources.length}` : "—", l: "Sources updated in 2 days" },
  ];

  return (
    <AdminLayout title="Data" aside={
      <>
        <button className="ad-btn ghost" onClick={clearCache} disabled={!!busy}>{busy === "cache" ? "Clearing…" : "Clear API cache"}</button>
        <button className="ad-btn" onClick={refresh} disabled={!!busy || running}>{running ? "Refreshing…" : "Refresh NBA season"}</button>
      </>
    }>
      {error && !status ? <ErrorState title="Admin data didn't load" body="The API didn't answer, or your session has no admin rights." onRetry={load} /> : (
        <>
          <div className="ad-kpis">
            {KPIS.map(k => <div key={k.l} className="ad-kpi"><b style={k.c ? { color: k.c } : undefined}>{k.v}</b><span>{k.l}</span></div>)}
          </div>
          {msg && <p className="ad-note" role="status" style={{ marginBottom: 14 }}>{msg}</p>}

          <div className="ad-table ad-data" style={{ "--cols": "minmax(0,1.4fr) 110px 130px 80px minmax(0,1fr)" }}>
            <div className="ad-th card"><span>Source</span><span>Status</span><span>Last updated</span><span>Files</span><span>How it refreshes</span></div>
            {(sources || []).map(s => {
              const f = freshness(s.updated_at);
              const site = s.how === "trigger-refresh";
              return (
                <div key={s.key} className="ad-tr card">
                  <div className="ad-cell-main"><b>{s.name}</b><span>{s.desc}</span></div>
                  <span className="ad-status" style={{ "--c": f.c }}><i />{f.t}</span>
                  <span>{ago(s.updated_at)}</span>
                  <span>{s.files}</span>
                  {site
                    ? <span className="ad-actions" style={{ justifyContent: "flex-start" }}><button className="ad-sm" onClick={refresh} disabled={!!busy || running}>{running ? "Running…" : "Refresh"}</button></span>
                    : <code className="ad-code">python {s.how}</code>}
                </div>
              );
            })}
          </div>

          {status?.errors?.length > 0 && (
            <div className="ad-block">
              <span>Last error · {ago(status.last_run)}</span>
              {status.errors.map((e, i) => <pre key={i}>{e}</pre>)}
            </div>
          )}
          <p className="ad-block ad-note">
            After running a fetch script by hand, use "Clear API cache" so the site reads the new files. Only the current NBA season can be refreshed from here.
          </p>
          <p className="ad-mobile-note">Editing users and articles is easier on desktop.</p>
        </>
      )}
    </AdminLayout>
  );
}
