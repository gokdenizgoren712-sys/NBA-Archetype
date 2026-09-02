import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";

// ── RankIt Android yayınları ─────────────────────────────────────────────────
// Derlemeler tek makinede birikiyordu: sekiz APK, hangisinin güncel olduğunu
// söyleyen kayıt yok, dosyanın bozulmadığını gösteren sağlama yok. Dağıtım
// sideload olduğuna göre o adım ürünün parçası — burası onun yeri.
//
// Dosya Railway volume'unda duruyor, repoda değil. İndirme bağlantısı herkese
// açık ama hiçbir yerde listelenmiyor: küçük gruba dağıtımın istediği bu.

const ACC = "#FFB11B";
const CHANNELS = ["alpha", "beta", "release"];

function mb(n) { return `${(n / 1048576).toFixed(2)} MB`; }

export default function RankItReleases() {
  const { token, isAdmin, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [releases, setReleases] = useState([]);
  const [dir, setDir] = useState("");
  const [form, setForm] = useState({ version_name: "", version_code: "", channel: "alpha", notes: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(null);

  const load = useCallback(() => {
    if (!token) return;
    fetch("/api/rankit/admin/releases", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.detail || r.status); return d; })
      .then((d) => { setReleases(d.releases || []); setDir(d.dir || ""); setErr(""); })
      .catch((e) => setErr(String(e.message || e)));
  }, [token]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate("/login"); return; }
    load();
  }, [isLoggedIn, isAdmin, navigate, load]);

  // Dosya adından sürümü tahmin et — "RankIt-0.4.0-alpha-debug.apk" gibi
  // adlandırıyoruz zaten; elle yazdırmak gereksiz bir hata kaynağı.
  const pickFile = (f) => {
    setFile(f);
    if (!f) return;
    const m = f.name.match(/(\d+\.\d+\.\d+)/);
    if (m && !form.version_name) {
      const [maj, min, patch] = m[1].split(".").map(Number);
      setForm((s) => ({
        ...s,
        version_name: /alpha/i.test(f.name) ? `${m[1]}-alpha` : m[1],
        version_code: String(maj * 10000 + min * 100 + patch),
      }));
    }
  };

  const upload = () => {
    if (!file) return;
    setBusy(true); setErr(""); setMsg("");
    const body = new FormData();
    body.append("file", file);
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    fetch("/api/rankit/admin/releases", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body,
    })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.detail || r.status); return d; })
      .then((d) => {
        setMsg(`${d.version_name} published · ${mb(d.size_bytes)}`);
        setFile(null); setForm({ version_name: "", version_code: "", channel: "alpha", notes: "" });
        load();
      })
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setBusy(false));
  };

  const remove = (id, version) => {
    if (!window.confirm(`Delete build ${version}? The APK file is removed too.`)) return;
    fetch(`/api/rankit/admin/releases/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    }).then(() => { setMsg("Build deleted."); load(); })
      .catch((e) => setErr(String(e.message || e)));
  };

  const copyLink = (rel) => {
    const url = `${window.location.origin}${rel.download_url}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(rel.id); setTimeout(() => setCopied(null), 1600);
    }).catch(() => {});
  };

  return (
    <div className="h-full overflow-y-auto">
      <SEO title="RankIt builds" noindex />
      <div className="max-w-4xl mx-auto p-5 space-y-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-logo text-2xl font-bold text-white">RankIt builds</h1>
          <Link to="/admin/articles" className="aura-pill-btn" style={{ fontSize: 11 }}>&larr; Admin</Link>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
            {releases.length} build{releases.length === 1 ? "" : "s"}
          </span>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 700 }}>
          Android builds live here rather than on one laptop. Each one keeps its SHA-256,
          so whoever installs it can check the file arrived intact. The download link is
          public but listed nowhere — hand it to whoever should have it. Version codes
          have to increase or Android will not treat a build as an update, so a repeated
          one is refused.
        </p>

        {err && <div className="g-panel p-3" style={{ fontSize: 12, color: "#E8654C" }}>{err}</div>}
        {msg && <div className="g-panel p-3" style={{ fontSize: 12, color: "#4ade80" }}>{msg}</div>}

        <div className="g-panel p-4 space-y-3" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
          <div className="g-label">Publish a build</div>

          <input type="file" accept=".apk,application/vnd.android.package-archive"
            onChange={(e) => pickFile(e.target.files?.[0] || null)}
            style={{ fontSize: 12, color: "var(--text-muted)" }} />
          {file && (
            <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
              {file.name} · {mb(file.size)}
            </div>
          )}

          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <div className="g-label mb-1">Version name</div>
              <input className="aura-ghost-input" placeholder="0.4.0-alpha" style={{ width: 160 }}
                value={form.version_name}
                onChange={(e) => setForm({ ...form, version_name: e.target.value })} />
            </div>
            <div>
              <div className="g-label mb-1">Version code</div>
              <input className="aura-ghost-input" placeholder="400" style={{ width: 100 }}
                value={form.version_code}
                onChange={(e) => setForm({ ...form, version_code: e.target.value.replace(/\D/g, "") })} />
            </div>
            <div className="aura-select-wrap">
              <select className="aura-select" value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <input className="aura-ghost-input w-full" placeholder="What changed in this build?"
            value={form.notes} maxLength={2000}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <button className="aura-rating-btn" style={{ padding: "10px 24px", fontSize: 12.5 }}
            disabled={busy || !file || !form.version_name || !form.version_code}
            onClick={upload}>
            {busy ? "Uploading…" : "Publish build"}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {releases.map((r) => (
            <div key={r.id} className="g-panel p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <b className="font-logo text-sm" style={{ color: ACC }}>{r.version_name}</b>
                <span className="g-status" style={{ "--accent": "#9ca3af",
                  "--accent-a": "rgba(156,163,175,.14)", "--accent-line": "rgba(156,163,175,.4)" }}>
                  {r.channel} · code {r.version_code}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{mb(r.size_bytes)}</span>
                {!r.file_present && (
                  <span style={{ fontSize: 11, color: "#E8654C" }}>file missing on disk</span>
                )}
                <div className="ml-auto flex gap-1.5">
                  <button className="aura-pill-btn" style={{ fontSize: 10.5 }}
                    onClick={() => copyLink(r)}>{copied === r.id ? "copied" : "copy link"}</button>
                  <a className="aura-pill-btn" style={{ fontSize: 10.5 }}
                    href={r.download_url}>download</a>
                  <button className="aura-pill-btn" style={{ fontSize: 10.5, color: "#E8654C" }}
                    onClick={() => remove(r.id, r.version_name)}>delete</button>
                </div>
              </div>
              {r.notes && (
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{r.notes}</div>
              )}
              <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "monospace",
                wordBreak: "break-all" }}>
                sha256 {r.sha256}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-faint)" }}>
                {(r.created_at || "").slice(0, 16)}{r.uploader ? ` · @${r.uploader}` : ""}
              </div>
            </div>
          ))}
          {!releases.length && (
            <div className="g-panel subtle p-4" style={{ fontSize: 12, color: "var(--text-faint)" }}>
              No builds yet. The APKs sitting in <code>artifacts/</code> can be published here.
            </div>
          )}
        </div>

        {dir && (
          <p style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
            Stored at <code>{dir}</code> on the server volume — kept across deploys, never in git.
          </p>
        )}
      </div>
    </div>
  );
}
