import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import AdminLayout, { authFetch, fmtDate } from "./AdminLayout";
import PaIcon from "../../components/shell/PaIcon";
import { EmptyState, SkeletonRows } from "../../components/states/States";

// ── Admin · Users (handoff 15b) ─────────────────────────────────────────────
// Arama + tablo (kullanıcı · e-posta · rol · durum · katılım · aksiyonlar).
// Yıkıcı işlemler iki adımlı: satırda "Delete" → "Delete for good".
// Sunucu kuralları aynı: kendi rolünü kaldıramazsın, son admin düşmez.
export default function UserList() {
  const { token, user: me } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);   // {id, kind}
  const [err, setErr] = useState("");

  useEffect(() => {
    authFetch("/admin/users", token).then(r => r.json()).then(d => setUsers(d.users || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? users.filter(u => `${u.username} ${u.email}`.toLowerCase().includes(n)) : users;
  }, [users, q]);

  const patch = async (u, body, apply) => {
    setErr("");
    const r = await authFetch(`/admin/users/${u.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.detail || "That change wasn't saved."); return; }
    setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, ...apply } : x)));
    setConfirm(null);
  };
  const deleteUser = async (id) => {
    const r = await authFetch(`/admin/users/${id}`, token, { method: "DELETE" });
    if (r.ok) setUsers(prev => prev.filter(x => x.id !== id));
    setConfirm(null);
  };
  const deleteAll = async () => {
    const r = await authFetch("/admin/users/all", token, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setUsers([]); setErr(`Deleted ${d.deleted ?? 0} users.`); }
    setConfirm(null);
  };

  const ask = (id, kind) => confirm?.id === id && confirm?.kind === kind;

  return (
    <AdminLayout title="Users" aside={
      <label className="ad-search">
        <PaIcon name="search" size={16} color="var(--text-muted)" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${users.length} users`} aria-label="Search users" />
      </label>
    }>
      {err && <p className="ad-note" role="status" style={{ marginBottom: 12 }}>{err}</p>}
      {loading ? <SkeletonRows count={8} height={52} /> : shown.length === 0 ? (
        <EmptyState tint="#f2efea" title={q ? "No user matches" : "No users yet"} body={q ? "Try part of the username or the email." : null} />
      ) : (
        <div className="ad-table scroll" style={{ "--cols": "minmax(0,1fr) minmax(0,1fr) 80px 90px 110px 250px" }}>
          <div className="ad-th"><span>User</span><span>Email</span><span>Role</span><span>Status</span><span>Joined</span><span /></div>
          {shown.map(u => (
            <div key={u.id} className="ad-tr">
              <div className="ad-user"><span className="ad-av">{(u.username || "?")[0].toUpperCase()}</span><div className="ad-cell-main"><b>{u.username}</b><span>#{u.id}</span></div></div>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
              <span style={{ color: u.role === "admin" ? "#FFB11B" : undefined }}>{u.role === "admin" ? "Admin" : "Member"}</span>
              <span className="ad-status" style={{ "--c": u.is_banned ? "#f87171" : "#4ade80" }}><i />{u.is_banned ? "Banned" : "Active"}</span>
              <span>{fmtDate(u.created_at)}</span>
              <div className="ad-actions">
                {ask(u.id, "del") ? (
                  <><button className="ad-sm bad" onClick={() => deleteUser(u.id)}>Delete for good</button><button className="ad-sm" onClick={() => setConfirm(null)}>Keep</button></>
                ) : ask(u.id, "role") ? (
                  <><button className="ad-sm good" onClick={() => patch(u, { role: u.role === "admin" ? "user" : "admin" }, { role: u.role === "admin" ? "user" : "admin" })}>
                    {u.role === "admin" ? "Confirm remove" : "Confirm admin"}</button><button className="ad-sm" onClick={() => setConfirm(null)}>Cancel</button></>
                ) : (
                  <>
                    <button className={`ad-sm${u.is_banned ? "" : " warn"}`} onClick={() => patch(u, { is_banned: u.is_banned ? 0 : 1 }, { is_banned: u.is_banned ? 0 : 1 })}>{u.is_banned ? "Unban" : "Ban"}</button>
                    {u.id !== me?.id && <button className="ad-sm" onClick={() => setConfirm({ id: u.id, kind: "role" })}>{u.role === "admin" ? "Remove admin" : "Make admin"}</button>}
                    <button className="ad-sm" onClick={() => setConfirm({ id: u.id, kind: "del" })}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="ad-block">
        <span>Danger zone</span>
        {confirm?.kind === "all" ? (
          <div className="ad-actions" style={{ justifyContent: "flex-start" }}>
            <button className="ad-sm bad" onClick={deleteAll}>Delete every user, admins and you included</button>
            <button className="ad-sm" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        ) : (
          <button className="ad-link bad" style={{ alignSelf: "flex-start" }} onClick={() => setConfirm({ id: null, kind: "all" })}>Delete all users…</button>
        )}
      </div>
    </AdminLayout>
  );
}
