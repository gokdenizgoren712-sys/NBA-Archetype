/* 14a — ilk kurulum TEK ekran (BUILD §23.3: "The promise is the permanent
 * left half, the choices the live right half — you read why you're here
 * *while* you pick. The step counter stays").
 *
 *   sol    592: kilit · "Rate one match. The rest builds itself." · üç adım ·
 *          COLD TO HOT rampası
 *   sağ    SET UP · 3 THINGS (üç çizgi) · Primary Arch connected + e-posta
 *          (`account.email`; "N people you know" yalnız uç sayı verirse —
 *          `primary_arch_connections` null iken yok) · WHAT DO YOU FOLLOW?
 *          (seçili kulüpler, turnuvalar, önerilen kulüpler, Search) · ONE
 *          LAST THING: spoiler kalkanı (yerel tercih, `hideScores`)
 *   alt    Find a match from this week (altın) · Browse tonight instead
 *
 * İkisi de kurulumu kapatır (`POST /onboarding`); Skip bir daha sormaz.
 * Takipler eklenir, var olanlar silinmez (uç kuralı).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { RankItMark } from "../redesign/BrandMark";
import { RAMP } from "../redesign/heat";
import { welcomeSteps } from "./pagesView";

const STEPS = [
  ["Stars, and a sentence if you want one", "Half stars are fine. A review is optional and always has been."],
  ["The night becomes a card", "Yours to keep, skin and share. It goes on a shelf that fills up over a season."],
  ["Heat tells you what to watch next", "What everyone else made of a match — cold to hot, never a prediction."],
];

function Chip({ label, on, color, onToggle }) {
  return (
    <button type="button" className={`riw-welcome-chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={onToggle}>
      {color && <i aria-hidden="true" style={{ background: `linear-gradient(135deg,${color},color-mix(in oklab,${color} 34%,#0b0b0b))` }} />}
      {label}
    </button>
  );
}

export default function WelcomePage({ hideScores, onToggleScores }) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [comps, setComps] = useState(new Set());
  const [clubs, setClubs] = useState(new Set());
  const [known, setKnown] = useState([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState({ q: "", teams: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [shieldDecided, setShieldDecided] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.onboarding("").then((d) => {
      if (!alive) return;
      setData(d);
      setComps(new Set(d.followed_competition_ids || []));
      setClubs(new Set((d.followed_clubs || []).map((c) => c.id)));
      setKnown(d.followed_clubs || []);
    }).catch(() => alive && setData({ competitions: [], clubs: [] }));
    return () => { alive = false; };
  }, [isLoggedIn]);

  const term = query.trim();
  useEffect(() => {
    if (term.length < 2) return undefined;
    const t = setTimeout(() => {
      rankitApi.search(term, "Teams").then((d) => setFound({ q: term, teams: (d.teams || []).slice(0, 8) })).catch(() => setFound({ q: term, teams: [] }));
    }, 180);
    return () => clearTimeout(t);
  }, [term]);

  // İki hızlı dokunuş aynı eski kümeden başlamasın: işlevsel güncelleme.
  const toggle = (setter, id) => setter((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const pickClub = (team) => { setKnown((k) => (k.some((x) => x.id === team.id) ? k : [...k, team])); toggle(setClubs, team.id); };

  const chosenClubs = useMemo(() => known.filter((c) => clubs.has(c.id)), [known, clubs]);
  const suggested = (data?.clubs || []).filter((c) => !clubs.has(c.id)).slice(0, 6);
  const picks = clubs.size + comps.size;
  const steps = welcomeSteps({ connected: isLoggedIn, picks, shieldDecided });

  const finish = async (skipped, to) => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await rankitApi.saveOnboarding({ competitions: [...comps], clubs: [...clubs], skipped });
      navigate(to, { replace: true });
    } catch (e) { setError(String(e.message || e)); setSaving(false); }
  };

  return (
    <div className="riw-welcome">
      <section className="riw-welcome-promise" aria-labelledby="riw-welcome-title">
        <div className="riw-welcome-lockup"><RankItMark size={30} /><span><strong>RANK<span>IT</span></strong><small>BY PRIMARY ARCH</small></span></div>
        <h1 id="riw-welcome-title">Rate one match.<br />The rest builds itself.</h1>
        <p className="riw-welcome-lede">Your diary, your shelf, your standing — all of it starts from a single night. We won't fill it with anything you didn't watch.</p>
        <ol className="riw-welcome-steps">
          {STEPS.map(([title, body], i) => (
            <li key={title}><span aria-hidden="true">{i + 1}</span><div><strong>{title}</strong><p>{body}</p></div></li>
          ))}
        </ol>
        <p className="riw-welcome-scale">
          <span aria-hidden="true">{RAMP.map((c) => <i key={c} style={{ background: c }} />)}</span>
          COLD TO HOT · THE ONLY SCALE HERE
        </p>
      </section>

      <section className="riw-welcome-choices" aria-label="Set up">
        {!isLoggedIn ? (
          <div className="riw-page-empty riw-profile-empty">
            <strong>RankIt uses your Primary Arch account</strong>
            <p>The same one that owns your squads and lineups. <Link to="/login?next=/rankit/welcome">Sign in</Link> to set up.</p>
          </div>
        ) : (
          <>
            <div className="riw-welcome-top">
              <span className="riw-page-eyebrow">SET UP · 3 THINGS</span>
              <span className="riw-welcome-bars" role="img" aria-label={`${steps.filter(Boolean).length} of 3 set`}>
                {steps.map((on, i) => <i key={i} className={on ? "is-on" : undefined} />)}
              </span>
              <button type="button" className="riw-welcome-skip" onClick={() => finish(true, "/rankit")} disabled={saving}>Skip</button>
            </div>

            <div className="riw-welcome-card is-done">
              <RankItMark size={34} />
              <div>
                <p><strong>Primary Arch connected</strong><b>DONE</b></p>
                <small>{[data?.account?.email, data?.primary_arch_connections ? `${data.primary_arch_connections} people you know are already here` : ""].filter(Boolean).join(" · ") || "Your account is linked."}</small>
              </div>
            </div>

            <h2 className="riw-page-eyebrow riw-welcome-label">WHAT DO YOU FOLLOW?</h2>
            {!data ? <div className="riw-rail-skeleton" aria-hidden="true" /> : (
              <div className="riw-welcome-chips" role="group" aria-label="Clubs and competitions to follow">
                {chosenClubs.map((c) => <Chip key={`t${c.id}`} label={c.short_name || c.name} color={c.color || "#3a3f47"} on onToggle={() => toggle(setClubs, c.id)} />)}
                {(data.competitions || []).slice(0, 8).map((c) => <Chip key={`c${c.id}`} label={c.name} on={comps.has(c.id)} onToggle={() => toggle(setComps, c.id)} />)}
                {suggested.map((c) => <Chip key={`s${c.id}`} label={c.short_name || c.name} color={c.color || "#3a3f47"} on={false} onToggle={() => pickClub(c)} />)}
                <button type="button" className="riw-welcome-chip" aria-expanded={searching} onClick={() => setSearching((v) => !v)}><Search size={13} aria-hidden="true" /> Search</button>
              </div>
            )}
            {searching && (
              <div className="riw-welcome-search">
                <label className="riw-people-search">
                  <Search size={15} aria-hidden="true" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a club" aria-label="Find a club" autoFocus />
                </label>
                {term.length >= 2 && found.q === term && (
                  <div className="riw-welcome-chips">
                    {found.teams.length ? found.teams.map((t) => <Chip key={`f${t.id}`} label={t.short_name || t.name} color={t.color || "#3a3f47"} on={clubs.has(t.id)} onToggle={() => pickClub(t)} />)
                      : <p className="riw-page-fine riw-profile-fine">No club by that name.</p>}
                  </div>
                )}
              </div>
            )}
            <p className="riw-welcome-note">{picks ? `${picks} picked.` : "Nothing picked yet."} You can skip this entirely — Discover works without it.</p>

            <h2 className="riw-page-eyebrow riw-welcome-label">ONE LAST THING</h2>
            <div className={`riw-welcome-card${hideScores ? " is-done" : ""}`}>
              <div>
                <p><strong>Hide scores until you've rated</strong></p>
                <small>The spoiler shield blurs scores, heat and reviews so a rating site can't ruin the match for you.</small>
              </div>
              <button type="button" role="switch" aria-checked={hideScores} aria-label="Hide scores until you've rated" className="riw-switch is-big" onClick={() => { setShieldDecided(true); onToggleScores(); }}><i /></button>
            </div>

            {error && <p className="riw-note" role="alert">{error}</p>}
            <div className="riw-welcome-actions">
              <button type="button" className="riw-welcome-go" onClick={() => finish(false, "/rankit/discover?status=finished")} disabled={saving}>Find a match from this week</button>
              <button type="button" className="riw-welcome-alt" onClick={() => finish(false, "/rankit")} disabled={saving}>Browse tonight instead</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
