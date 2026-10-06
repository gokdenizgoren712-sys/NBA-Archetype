// Tasarım 13 — Kayıtlı ligler ve draftlar. Açınca kaldığın yerden: lig ayarları
// uygulanır, mock sonucuna, asistan işaretlenmiş picklerine döner.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import { ErrorNote, SkeletonList, formatPatch } from "./ui";
import { useFantasy, useIsPhone } from "./useFantasy";

const TABS = [["league", "Leagues"], ["mock", "Mock drafts"], ["assistant", "Assistant"]];
const EMPTY = {
  league: "Save a league from League settings to keep its format, size and your slot.",
  mock: "Finish a mock draft and press Save to keep it here.",
  assistant: "Drafts you track with the assistant show up here once saved.",
};
const UNDO_MS = 6000;
const fmtDate = (iso) => new Date(`${iso.replace(" ", "T")}Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function FantasySaved() {
  const f = useFantasy();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const { isLoggedIn } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "league";
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState({});   // id → zamanlayıcı (geri alınabilir silme)
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef({});

  const load = () => {
    setError(null);
    fz.drafts.list().then((d) => setRows(d.drafts || [])).catch(setError);
  };
  useEffect(() => { if (isLoggedIn) load(); }, [isLoggedIn]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const open = async (id) => {
    setBusy(true);
    try {
      const d = await fz.drafts.get(id);
      if (d.kind === "league") {
        f.set(formatPatch(d, { id: d.id, name: d.name }));
        navigate("/basketball/fantasy");
        return;
      }
      f.set(formatPatch(d));
      const fmt = d.format.key === "custom" ? { ...d.format, teams: d.teams } : d.format.key;
      if (d.kind === "mock") {
        sessionStorage.setItem(`fz_mock_${JSON.stringify([fmt, d.teams, d.slot])}`, JSON.stringify(d.state));
        navigate("/basketball/fantasy/mock");
      } else {
        localStorage.setItem(`fz_assist_${JSON.stringify([fmt, d.teams, d.slot])}`, JSON.stringify(d.state.order || []));
        navigate("/basketball/fantasy/assistant");
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // Ana sayfadaki "?open=" bağlantısı
  useEffect(() => {
    const id = params.get("open");
    if (id && isLoggedIn) open(Number(id));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const duplicate = async (id) => {
    try {
      const d = await fz.drafts.get(id);
      await fz.drafts.create({ kind: d.kind, name: `${d.name} (copy)`.slice(0, 60), format: d.format, teams: d.teams,
                               slot: d.slot, state: d.state, result: d.result || undefined });
      load();
    } catch (e) { setError(e); }
  };

  const remove = (id) => {
    setMenu(null);
    timers.current[id] = setTimeout(() => {
      fz.drafts.remove(id).then(load).catch(setError);
      setPending((p) => { const n = { ...p }; delete n[id]; return n; });
    }, UNDO_MS);
    setPending((p) => ({ ...p, [id]: true }));
  };
  const undo = (id) => {
    clearTimeout(timers.current[id]);
    setPending((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const list = (rows || []).filter((r) => r.kind === tab);

  const tabBar = (
    <div style={{ display: "flex", gap: 4, boxShadow: "inset 0 -1px 0 #1a1a1a", padding: phone ? "0 8px" : 0 }}>
      {TABS.map(([k, l]) => (
        <button key={k} onClick={() => setParams({ tab: k }, { replace: true })}
          style={{ flex: phone ? 1 : "none", height: phone ? 48 : 44, padding: "0 14px", border: 0, background: "transparent", cursor: "pointer",
                   color: tab === k ? "#e5e5e5" : "#8a8a8a", boxShadow: tab === k ? "inset 0 -2px 0 #e5e5e5" : "none",
                   fontSize: phone ? 13 : 15, fontWeight: 500 }}>{l}</button>
      ))}
    </div>
  );

  const meta = (r) => [r.format_label || "Custom", `${r.teams} teams`, r.slot ? `slot ${r.slot}` : null, fmtDate(r.updated_at)].filter(Boolean).join(" · ");

  return (
    <>
      <SEO title="My fantasy leagues and drafts" description="Your saved fantasy leagues, mock drafts and assistant drafts." path="/basketball/fantasy/saved" />
      <div className="fz-page" style={{ maxWidth: 960 }}>
        <div className="fz-head">
          <p className="pa-eyebrow">Fantasy · Saved</p>
        <h1 className="fz-h1">My leagues and drafts</h1>
          <button className="fz-btn fz-desk-only" onClick={f.openSettings}>New league</button>
        </div>
        {!isLoggedIn ? (
          <div className="fz-state">
            <span className="t">Sign in to see saved leagues and drafts</span>
            <span className="b">Leagues, mock drafts and assistant drafts are kept on your account across devices.</span>
            <button className="fz-btn sm" style={{ marginTop: 6 }} onClick={() => navigate("/login")}>Sign in</button>
          </div>
        ) : (
          <>
            {tabBar}
            {error && <ErrorNote error={error} onRetry={load} what="your saved items" />}
            {!rows && !error && <SkeletonList rows={4} height={64} />}
            <div style={{ display: "flex", flexDirection: "column", opacity: busy ? 0.6 : 1 }}>
              {list.map((r) => (pending[r.id] ? (
                <div key={r.id} className="fz-row" style={{ display: "flex", alignItems: "center", gap: 12, minHeight: phone ? 68 : 64 }}>
                  <span className="fz-sub" style={{ flex: 1 }}>Deleted {r.name}.</span>
                  <button className="fz-link" style={{ fontSize: 14, fontWeight: 600 }} onClick={() => undo(r.id)}>Undo</button>
                </div>
              ) : phone ? (
                <div key={r.id} className="fz-row" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 68 }}>
                  <button onClick={() => open(r.id)} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, border: 0, background: "none", color: "inherit", textAlign: "left", padding: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</span>
                    <span className="fz-meta" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta(r)}</span>
                  </button>
                  {r.grade && <span className="fz-num" style={{ fontSize: 17 }}>{r.grade.replace("-", "−")}</span>}
                  <button className="fz-close" style={{ color: "#e5e5e5", width: 44, height: 44 }} aria-label={`Actions for ${r.name}`} onClick={() => setMenu(r)}>⋯</button>
                </div>
              ) : (
                <div key={r.id} className="fz-row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px auto", gap: 18, alignItems: "center", minHeight: 64 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</span><span className="fz-sub" style={{ fontSize: 13 }}>{meta(r)}</span>
                  </div>
                  <span className="fz-num" style={{ fontSize: 18, textAlign: "right" }}>{r.grade ? r.grade.replace("-", "−") : ""}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="fz-btn sm" onClick={() => open(r.id)}>Open</button>
                    <button className="fz-btn sm quiet" onClick={() => duplicate(r.id)}>Duplicate</button>
                    <button className="fz-btn sm quiet fz-muted danger" onClick={() => remove(r.id)}>Delete</button>
                  </div>
                </div>
              )))}
              {rows && list.length === 0 && (
                <div className="fz-state" style={{ padding: "48px 0" }}>
                  <span className="t">Nothing here yet</span>
                  <span className="b">{EMPTY[tab]}</span>
                  {tab === "assistant" && <button className="fz-btn" style={{ marginTop: 6 }} onClick={() => navigate("/basketball/fantasy/assistant")}>Open draft assistant</button>}
                  {tab === "mock" && <button className="fz-btn" style={{ marginTop: 6 }} onClick={() => navigate("/basketball/fantasy/mock")}>Start a mock draft</button>}
                  {tab === "league" && <button className="fz-btn" style={{ marginTop: 6 }} onClick={f.openSettings}>New league</button>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {menu && (
        <div className="fz-sheet-root" onClick={() => setMenu(null)}>
          <div className="fz-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Actions for ${menu.name}`} style={{ gap: 0, padding: "8px 8px 20px" }}>
            <span className="fz-grip" style={{ marginBottom: 10 }} />
            <span className="fz-meta" style={{ padding: "4px 12px 8px" }}>{menu.name}</span>
            {[["Open", () => { setMenu(null); open(menu.id); }], ["Duplicate", () => { setMenu(null); duplicate(menu.id); }]].map(([l, fn]) => (
              <button key={l} onClick={fn} style={{ height: 52, border: 0, borderRadius: 10, background: "transparent", color: "#e5e5e5", fontSize: 16, textAlign: "left", padding: "0 12px" }}>{l}</button>
            ))}
            <button onClick={() => remove(menu.id)} style={{ height: 52, border: 0, borderRadius: 10, background: "transparent", color: "#f87171", fontSize: 16, textAlign: "left", padding: "0 12px" }}>Delete</button>
            <button className="fz-btn" style={{ height: 52, marginTop: 6, fontSize: 16 }} onClick={() => setMenu(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
