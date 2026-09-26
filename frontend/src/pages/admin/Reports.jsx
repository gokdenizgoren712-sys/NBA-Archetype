import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";

// RankIt şikâyet kuyruğu (docs/RANKIT_STORE_BLOCKERS_PLAN.md B6). Mağaza
// taahhüdü 24 saat: açık kuyruk en çok şikâyet alan hedefle başlar, eşitlikte
// en eski. 3 kişinin şikâyet ettiği içerik zaten gizli gelir ("Hidden").
// Eylem hedefin TÜM açık şikâyetlerine uygulanır (api/rankit.py
// rankit_admin_report_action).

function authFetch(path, token, opts = {}) {
  return fetch(`/api/rankit${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

const TABS = [["open", "Open"], ["actioned", "Actioned"], ["dismissed", "Dismissed"]];
const TYPE_LABEL = { review: "Review", comment: "Reply", list: "List", message: "Chat message", user: "Account" };
const REASON_LABEL = {
  spam: "Spam", harassment: "Harassment", hate: "Hate speech",
  sexual: "Sexual content", spoiler: "Spoilers", other: "Other",
};

const chip = { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" };

function when(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Actions({ item, busy, onAct }) {
  const hideable = item.target_type !== "user";
  const btn = (action, label, tone = "plain") => (
    <button key={action} type="button" disabled={busy} onClick={() => onAct(item, action, label)}
      className="px-3 py-1.5 rounded-[8px] text-sm font-semibold disabled:opacity-50"
      style={tone === "danger"
        ? { background: "transparent", color: "#f87171", border: "1px solid rgba(248,113,113,.45)" }
        : tone === "primary" ? { background: "var(--accent)", color: "#000", border: "1px solid transparent" } : chip}>
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {hideable && !item.live?.hidden && item.live?.exists && btn("hide", "Hide", "primary")}
      {hideable && item.live?.hidden && btn("unhide", "Unhide")}
      {item.reports_status === "open" && btn("dismiss", "Dismiss — no violation")}
      {hideable && item.live?.exists && btn("delete", item.target_type === "review" ? "Delete text" : "Delete", "danger")}
      {item.owner && !item.owner.is_banned && btn("ban", `Ban @${item.owner.username}`, "danger")}
    </div>
  );
}

export default function Reports() {
  const { token, isAdmin, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("open");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    authFetch(`/admin/reports?status=${status}`, token)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d) => { setData(d); setError(""); })
      .catch(() => setError("Could not load the report queue."));
  }, [status, token]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate("/login"); return; }
    load();
  }, [isLoggedIn, isAdmin, navigate, load]);

  const act = async (item, action, label) => {
    if (["delete", "ban"].includes(action) && !confirm(`${label}? This can't be undone from here.`)) return;
    setBusyId(item.report_id);
    try {
      const r = await authFetch(`/admin/reports/${item.report_id}/action`, token, {
        method: "POST", body: JSON.stringify({ action }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Action failed");
      }
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const items = (data?.items || []).map((item) => ({ ...item, reports_status: data.status }));

  return (
    <>
      <SEO title="Admin — Reports" noindex path="/admin/reports" />
      <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>RankIt reports</h1>
            <div className="flex gap-2">
              <Link to="/admin/users" className="px-3 py-1.5 rounded-[8px] text-sm" style={chip}>Users</Link>
              <Link to="/admin/articles" className="px-3 py-1.5 rounded-[8px] text-sm" style={chip}>Articles</Link>
            </div>
          </div>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Answer every open report within 24 hours. Content reported by three established accounts is
            already hidden; dismiss restores it, hide keeps it down.
          </p>

          <div className="flex gap-2 mb-5" role="tablist" aria-label="Report status">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={status === key}
                onClick={() => setStatus(key)}
                className="px-3 py-1.5 rounded-[8px] text-sm font-semibold"
                style={status === key ? { background: "var(--accent)", color: "#000", border: "1px solid transparent" } : chip}>
                {label}{data?.counts?.[key] != null && ` · ${data.counts[key]}`}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="text-sm mb-4 text-red-400">{error}</p>}
          {!data && !error && <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>}
          {data && !items.length && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {status === "open" ? "Nothing waiting. The queue is clear." : "Nothing here yet."}
            </p>
          )}

          <div className="space-y-3">
            {items.map((item) => {
              const text = item.live?.exists ? item.live.text : item.snapshot;
              return (
                <article key={`${item.target_type}:${item.target_id}`} className="rounded-xl p-4"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                    <strong style={{ color: "var(--text-primary)" }}>{TYPE_LABEL[item.target_type]}</strong>
                    {item.owner && <span>by @{item.owner.username}{item.owner.is_banned ? " (banned)" : ""}</span>}
                    <span>· {item.reports} {item.reports === 1 ? "report" : "reports"}</span>
                    <span>· first {when(item.first_at)}</span>
                    {item.live?.hidden && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(248,113,113,.12)", color: "#fca5a5" }}>Hidden</span>}
                    {!item.live?.exists && <span className="px-1.5 py-0.5 rounded" style={chip}>Removed</span>}
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                    {text || <em style={{ color: "var(--text-muted)" }}>(no text)</em>}
                  </p>
                  {item.live?.exists && item.snapshot && item.snapshot !== item.live.text && (
                    <p className="mt-1 text-xs whitespace-pre-wrap break-words" style={{ color: "var(--text-muted)" }}>
                      When reported: {item.snapshot}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(item.reasons || {}).map(([reason, n]) => (
                      <span key={reason} className="px-2 py-0.5 rounded text-xs" style={chip}>
                        {REASON_LABEL[reason] || reason} · {n}
                      </span>
                    ))}
                  </div>
                  {!!item.notes?.length && (
                    <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      {item.notes.map((n, i) => <li key={i}>“{n.note}” — @{n.reporter}</li>)}
                    </ul>
                  )}
                  {item.live?.match_id && item.target_type !== "list" && (
                    <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      Match #{item.live.match_id}{item.live.entry_id ? ` · review #${item.live.entry_id}` : ""}
                    </p>
                  )}
                  <Actions item={item} busy={busyId === item.report_id} onAct={act} />
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
