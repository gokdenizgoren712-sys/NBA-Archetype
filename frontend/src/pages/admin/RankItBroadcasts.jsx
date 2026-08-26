import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";

// ── RankIt yayıncı eşlemeleri ────────────────────────────────────────────────
// "Bu maçı bende hangi kanaldan izlerim?" sorusunun cevabı sağlayıcıdan
// gelmiyor — elle giriliyor. Burası o girişin yeri; RankIt aynı uçtan çekiyor.
//
// İKİ KATMAN, bilinçli (bkz. api/db.py'deki tablo notu):
//   Kural  — turnuva + ülke varsayılanı. 3000 maçı elle girmek mümkün değil.
//   Kesin  — tek maç, kuralı ezer. Bir maç öbür yayıncıya geçtiğinde.
// İkisi aynı dille sunulmuyor: kural "typical", maç kaydı "confirmed".
// Hiçbiri yoksa RankIt boş gösteriyor — yanlış kanal, boş alandan kötü.

const ACC = "#FFB11B";
const COUNTRY_LABEL = { GB: "United Kingdom", US: "United States", TR: "Türkiye" };

function authFetch(path, token, opts = {}) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || `${r.status}`);
    return d;
  });
}

export default function RankItBroadcasts() {
  const { token, isAdmin, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [country, setCountry] = useState("TR");
  const [data, setData] = useState(null);
  const [channels, setChannels] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Kural formu
  const [rule, setRule] = useState({ competition_id: "", broadcaster_id: "", note: "" });
  // Maç formu
  const [exact, setExact] = useState({ match_id: "", broadcaster_id: "" });

  const load = useCallback(() => {
    if (!token) return;
    Promise.all([
      authFetch(`/rankit/admin/broadcasts?country=${country}`, token),
      authFetch(`/rankit/broadcasters?country=${country}`, token),
    ])
      .then(([d, c]) => { setData(d); setChannels(c.broadcasters || []); setErr(""); })
      .catch((e) => setErr(String(e.message || e)));
  }, [token, country]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate("/login"); return; }
    load();
  }, [isLoggedIn, isAdmin, navigate, load]);

  const save = (body) => {
    setMsg(""); setErr("");
    authFetch("/rankit/admin/broadcasts", token,
      { method: "POST", body: JSON.stringify({ ...body, country }) })
      .then((d) => { setMsg(d.kind === "confirmed" ? "Match record saved." : "Competition rule saved."); load(); })
      .catch((e) => setErr(String(e.message || e)));
  };

  const remove = (q) => {
    setMsg(""); setErr("");
    authFetch(`/rankit/admin/broadcasts?country=${country}&${q}`, token, { method: "DELETE" })
      .then(() => { setMsg("Removed."); load(); })
      .catch((e) => setErr(String(e.message || e)));
  };

  const label = (b) => `${b.name}${b.kind === "streaming" ? " (streaming)" : ""}`;

  return (
    <div className="h-full overflow-y-auto">
      <SEO title="RankIt broadcasters" noindex />
      <div className="max-w-5xl mx-auto p-5 space-y-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-logo text-2xl font-bold text-white">RankIt broadcasters</h1>
          <Link to="/admin/articles" className="aura-pill-btn" style={{ fontSize: 11 }}>&larr; Admin</Link>
          <div className="flex gap-1.5 ml-auto">
            {["GB", "US", "TR"].map((c) => (
              <button key={c} onClick={() => setCountry(c)} className="aura-pill-btn"
                style={{ fontSize: 11, ...(country === c
                  ? { borderColor: ACC, color: ACC, background: `${ACC}14` } : null) }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 720 }}>
          Where a match can be watched in <b>{COUNTRY_LABEL[country]}</b>. This is not
          provider data — it is typed here and RankIt reads it back. A competition rule
          covers every match in that competition and shows as <i>typical</i>; a match
          record overrides it for one fixture and shows as <i>confirmed</i>. With neither,
          RankIt shows nothing, which is the right answer when we do not know.
        </p>

        {err && <div className="g-panel p-3" style={{ fontSize: 12, color: "#E8654C" }}>{err}</div>}
        {msg && <div className="g-panel p-3" style={{ fontSize: 12, color: "#4ade80" }}>{msg}</div>}

        {/* ── Turnuva kuralı ─────────────────────────────────────────── */}
        <div className="g-panel p-4 space-y-3" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
          <div className="g-label">Competition rule — covers every match in it</div>
          <div className="flex gap-2 flex-wrap items-end">
            <div className="aura-select-wrap" style={{ minWidth: 240 }}>
              <select className="aura-select" value={rule.competition_id}
                onChange={(e) => setRule({ ...rule, competition_id: e.target.value })}>
                <option value="">Choose a competition…</option>
                {(data?.competitions || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.sport} · {c.name} {c.season} ({c.match_count})</option>
                ))}
              </select>
            </div>
            <div className="aura-select-wrap" style={{ minWidth: 190 }}>
              <select className="aura-select" value={rule.broadcaster_id}
                onChange={(e) => setRule({ ...rule, broadcaster_id: e.target.value })}>
                <option value="">Channel…</option>
                {channels.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
              </select>
            </div>
            <input className="aura-ghost-input" placeholder="note, e.g. selected matches"
              value={rule.note} maxLength={120} style={{ width: 220 }}
              onChange={(e) => setRule({ ...rule, note: e.target.value })} />
            <button className="aura-rating-btn" style={{ padding: "9px 20px", fontSize: 12 }}
              disabled={!rule.competition_id || !rule.broadcaster_id}
              onClick={() => save({ competition_id: Number(rule.competition_id),
                                    broadcaster_id: Number(rule.broadcaster_id), note: rule.note })}>
              Add rule
            </button>
          </div>

          <div className="flex flex-col gap-1 pt-1">
            {(data?.rules || []).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5"
                style={{ background: "rgba(255,255,255,.022)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-faint)", width: 62 }}>{r.sport}</span>
                <span className="flex-1 truncate">{r.competition} <span style={{ color: "var(--text-faint)" }}>{r.season}</span></span>
                <b style={{ color: ACC }}>{r.broadcaster}</b>
                {r.note && <span style={{ color: "var(--text-faint)" }}>({r.note})</span>}
                <button className="aura-pill-btn" style={{ fontSize: 10, padding: "2px 8px" }}
                  onClick={() => remove(`competition_id=${r.competition_id}&broadcaster_id=${r.broadcaster_id}`)}>
                  remove
                </button>
              </div>
            ))}
            {!data?.rules?.length && (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                No rules for {country} yet — every match resolves empty.
              </div>
            )}
          </div>
        </div>

        {/* ── Maç başına kesin kayıt ─────────────────────────────────── */}
        <div className="g-panel p-4 space-y-3" style={{ "--accent": "#3FB08C", "--accent-line": "#3FB08C44" }}>
          <div className="g-label">Single match — overrides the rule</div>
          <div className="flex gap-2 flex-wrap items-end">
            <input className="aura-ghost-input" placeholder="match id" style={{ width: 110 }}
              value={exact.match_id} onChange={(e) => setExact({ ...exact, match_id: e.target.value })} />
            <div className="aura-select-wrap" style={{ minWidth: 190 }}>
              <select className="aura-select" value={exact.broadcaster_id}
                onChange={(e) => setExact({ ...exact, broadcaster_id: e.target.value })}>
                <option value="">Channel…</option>
                {channels.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
              </select>
            </div>
            <button className="aura-rating-btn" style={{ padding: "9px 20px", fontSize: 12 }}
              disabled={!exact.match_id || !exact.broadcaster_id}
              onClick={() => save({ match_id: Number(exact.match_id),
                                    broadcaster_id: Number(exact.broadcaster_id) })}>
              Add record
            </button>
          </div>

          <div className="flex flex-col gap-1 pt-1">
            {(data?.matches || []).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5"
                style={{ background: "rgba(255,255,255,.022)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-faint)", width: 46 }}>#{r.match_id}</span>
                <span className="flex-1 truncate">{r.home} v {r.away}
                  <span style={{ color: "var(--text-faint)" }}> · {r.competition}</span></span>
                <b style={{ color: "#3FB08C" }}>{r.broadcaster}</b>
                <span style={{ color: "var(--text-faint)" }}>{(r.verified_at || "").slice(0, 10)}</span>
                <button className="aura-pill-btn" style={{ fontSize: 10, padding: "2px 8px" }}
                  onClick={() => remove(`match_id=${r.match_id}&broadcaster_id=${r.broadcaster_id}`)}>
                  remove
                </button>
              </div>
            ))}
            {!data?.matches?.length && (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                No match records for {country}.
              </div>
            )}
          </div>
        </div>

        <p style={{ fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.7 }}>
          Rights move during a season, so match records keep the date they were entered.
          A rule that has gone stale is worse than no rule — RankIt will state it as fact.
        </p>
      </div>
    </div>
  );
}
