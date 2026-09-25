/* RankIt web kabuğu — ekran 7a, BUILD §17.
 *
 *   başlık   78, yapışkan: kilit (işaret 26 · kelime 19), dört gezinme
 *            (Home · Discover · Activity · Lists), GERÇEK arama alanı ve
 *            `/` ipucu, spoiler kalkanı, seri, avatar
 *   ray      232: YOUR STANDING · THE HUNT · FOLLOWING — telefonun bir dokunuş
 *            derine gömdüğü üç şey (§17)
 *   alt bar  yalnız ≤820: telefonun beşlisi, ortada Rank eylemi. Masaüstü
 *            başlığında elmas yok (§20: "a phone affordance pasted onto
 *            desktop chrome"); dar ekranda web uygulama gibi davranır (§25) ve
 *            sahibin 2026-09-02 kararı (Rank ortada, Lists Discover'ın içinde)
 *            orada geçerli.
 *
 * Veri: /rank (kademe + seri), /collections (Hunt), /onboarding
 * (followed_clubs). Hiçbiri uydurulmuyor; oturum yoksa ray bir giriş kartı.
 */
import { useEffect, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { Activity as ActivityIcon, CircleUserRound, Compass, Home, Plus, Search, Shield } from "lucide-react";
import { RankItMark } from "../redesign/BrandMark";
import { collectionPercent, ringFill } from "../redesign/huntSummary";
import { RAMP } from "../redesign/heat";

const NAV = [
  { to: "/rankit", end: true, label: "Home" },
  { to: "/rankit/discover", label: "Discover" },
  { to: "/rankit/activity", label: "Activity" },
  { to: "/rankit/lists", label: "Lists" },
];

// ≤820 alt bar: telefonun TABS dizisiyle aynı sıra, Rank ortada bir EYLEM.
const PHONE_TABS = [
  { to: "/rankit", end: true, Icon: Home, label: "Home" },
  { to: "/rankit/discover", Icon: Compass, label: "Discover" },
  { rank: true, Icon: Plus, label: "Rank" },
  { to: "/rankit/activity", Icon: ActivityIcon, label: "Activity" },
  { to: "/rankit/profile", Icon: CircleUserRound, label: "Profile" },
];

// Seri halkası 2a/7a: ısı-5 → ısı-4, payda 7 gece (Floodlight, §4.2).
const STREAK_OFF = "rgba(255,255,255,.1)";
const streakFill = progress => `conic-gradient(from -90deg,${RAMP[4]} 0turn,${RAMP[3]} ${progress}turn,${STREAK_OFF} ${progress}turn)`;

const HUNT_ROWS = 3;
const CLUB_ROWS = 3;

function initials(name = "") {
  return String(name).replace(/^@/, "").slice(0, 2).toUpperCase() || "?";
}

/* Kulüp sezonu koleksiyonlarının hepsinin adı "The 38" — rayda üç kez "The
   38" yazmak hiçbir şey söylemez. Kulüp adı öne geçer: "Arsenal · The 38". */
function huntTitle(c) {
  const club = c.kind === "club_season" ? (c.team?.short_name || c.team?.name) : "";
  return club ? `${club} · ${c.title}` : c.title;
}

/* 7a'nın takip satırı elması: kulüp rengi → aynı rengin koyusu. */
function shade(hex, factor = 0.45) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "#1a1b1e";
  const n = parseInt(m[1], 16);
  const part = shift => Math.round(((n >> shift) & 255) * factor).toString(16).padStart(2, "0");
  return `#${part(16)}${part(8)}${part(0)}`;
}

/* ── Başlık ───────────────────────────────────────────────────────────────── */

export function WebHeader({ user, isLoggedIn, hideScores, onToggleScores, nights, query, onQuery, onSearch, bell = null }) {
  const field = useRef(null);

  // `/` aramaya odaklar (§21) — yazı yazılan bir yerde değilken.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = nights > 0;
  const progress = Math.min(1, (nights || 0) / 7);
  return (
    <header className="riw-top">
      <Link to="/rankit" className="riw-lockup" aria-label="RankIt home">
        <RankItMark size={26} />
        <span><strong>RANK<span>IT</span></strong><small>BY PRIMARY ARCH</small></span>
      </Link>

      <nav className="riw-topnav" aria-label="RankIt">
        {NAV.map(({ to, end, label }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "on" : undefined)}>{label}</NavLink>
        ))}
      </nav>

      {/* §17: gerçek bir alan, modal açan bir ikon değil. Enter sonuç
          sayfasını açar (11c); sorgu alanda kalır, Esc temizler. */}
      <form role="search" className="riw-search" onSubmit={(event) => { event.preventDefault(); onSearch(query.trim()); }}>
        {/* Görünen alan 40 (7a), label'ın ::after'ı 44'e tamamlıyor (§6) —
            label'a dokunmak alanı odaklar. */}
        <label>
          <Search size={15} aria-hidden="true" />
          <input ref={field} type="search" value={query} placeholder="Search matches, clubs, people"
            aria-label="Search RankIt" aria-keyshortcuts="/"
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              if (query) onQuery(""); else event.currentTarget.blur();
            }} />
          {!query && <kbd aria-hidden="true">/</kbd>}
        </label>
      </form>

      <div className="riw-top-end">
        <button type="button" className={`riw-shield${hideScores ? " on" : ""}`} aria-pressed={hideScores}
          aria-label="Spoiler shield" title={hideScores ? "Scores, heat and reviews hidden" : "Hide scores"}
          onClick={onToggleScores}>
          <Shield size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {/* 14b: bildirimler başlıkta açılır menü (Aşama 17). */}
        {isLoggedIn && bell}
        {isLoggedIn && (
          <div className="riw-streak" role="img"
            aria-label={active ? `Streak: ${nights} ${nights === 1 ? "night" : "nights"}` : "No streak yet"}>
            <span className="riw-streak-ring" aria-hidden="true"
              style={{ "--fill": active ? streakFill(progress) : STREAK_OFF }}>
              <b className={active ? undefined : "is-off"}>{nights || 0}</b>
            </span>
            <small aria-hidden="true">{nights === 1 ? "NIGHT" : "NIGHTS"}</small>
          </div>
        )}
        {isLoggedIn
          ? <Link to="/rankit/profile" className="riw-me" aria-label={`Your profile, @${user?.username || ""}`}>{initials(user?.username)}</Link>
          : <Link to="/login?next=/rankit" className="riw-signin">Sign in</Link>}
      </div>
    </header>
  );
}

/* ── Ray ──────────────────────────────────────────────────────────────────── */

function RailLabel({ children }) {
  return <h2 className="riw-rail-label">{children}</h2>;
}

export function WebRail({ isLoggedIn, rank, hunt, clubs, onOpenEntity }) {
  const tier = rank?.rank;
  const collections = (hunt?.collections || []).filter(c => c.status !== "not_open" && Number(c.total) > 0);
  // Açık olanlar önce (kapanmaya en yakın), bitenler sonra.
  const huntRows = [...collections]
    .sort((a, b) => Number(a.collected >= a.total) - Number(b.collected >= b.total)
      || (collectionPercent(b) ?? 0) - (collectionPercent(a) ?? 0))
    .slice(0, HUNT_ROWS);
  const clubRows = (clubs || []).slice(0, CLUB_ROWS);
  const moreClubs = Math.max(0, (clubs || []).length - clubRows.length);

  return (
    <aside className="riw-rail" aria-label="Your RankIt">
      {isLoggedIn ? (
        <>
          <section>
            <RailLabel>YOUR STANDING</RailLabel>
            {tier ? (
              <Link to="/rankit/profile" className="riw-standing"
                aria-label={`Your standing: ${tier.name}, ${tier.points.toLocaleString()} points`}>
                <span className="riw-standing-emblem" aria-hidden="true"><b>{String(tier.tier).padStart(2, "0")}</b></span>
                <span className="riw-standing-copy">
                  <strong>{tier.name}</strong>
                  <small>{tier.points.toLocaleString()} pts</small>
                </span>
              </Link>
            ) : <div className="riw-rail-skeleton" aria-hidden="true" />}
          </section>

          <section>
            <RailLabel>THE HUNT</RailLabel>
            {!hunt && <div className="riw-rail-skeleton short" aria-hidden="true" />}
            {hunt && !huntRows.length && <p className="riw-rail-note">Follow a club to start a season collection.</p>}
            {!!huntRows.length && (
              <ul className="riw-rail-list">
                {huntRows.map((c) => (
                  <li key={c.id} className={`riw-hunt-row${c === huntRows[0] ? " is-lead" : ""}`}
                    aria-label={`${huntTitle(c)}, ${c.collected} of ${c.total} collected`}>
                    <span className="riw-hunt-ring" aria-hidden="true" style={{ "--fill": ringFill(collectionPercent(c)) }} />
                    <span className="riw-rail-name">{huntTitle(c)}</span>
                    <small aria-hidden="true">{c.collected}/{c.total}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <RailLabel>FOLLOWING</RailLabel>
            {!clubs && <div className="riw-rail-skeleton short" aria-hidden="true" />}
            {clubs && !clubRows.length && <p className="riw-rail-note">Clubs you follow show up here.</p>}
            {!!clubRows.length && (
              <ul className="riw-rail-list">
                {/* §23 / 12a: kulüp bir hedef değil bir bakış — Inspector'da açılır. */}
                {clubRows.map((club) => (
                  <li key={club.id}>
                    <button type="button" className="riw-club-row" onClick={() => onOpenEntity("team", club.id)}>
                      <span className="riw-club-mark" aria-hidden="true"
                        style={{ background: `linear-gradient(135deg,${club.color || "#3a3f47"},${shade(club.color)})` }} />
                      <span className="riw-rail-name">{club.name}</span>
                    </button>
                  </li>
                ))}
                {moreClubs > 0 && <li className="riw-rail-more">+{moreClubs} more</li>}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section className="riw-rail-guest">
          <RailLabel>YOUR RANKIT</RailLabel>
          <p>Sign in with your Primary Arch account to keep a standing, chase collections and follow clubs.</p>
          <Link to="/login?next=/rankit" className="riw-rail-cta">Sign in</Link>
        </section>
      )}

      {/* Sitenin üst barı RankIt'in içinde çekiliyor (7a'da yok); Primary
          Arch'a dönüş yolu burada kalıyor. */}
      <div className="riw-rail-foot">
        <Link to="/" className="riw-home-link">Primary Arch</Link>
      </div>
    </aside>
  );
}

/* ── ≤820 alt bar ─────────────────────────────────────────────────────────── */

export function PhoneTabs({ onRank }) {
  return (
    <nav className="riw-nav riw-phone-tabs" aria-label="RankIt">
      {PHONE_TABS.map(({ to, end, Icon, label, rank }) => (
        rank ? (
          <button key={label} type="button" className="rank" onClick={onRank}>
            <span className="riw-rank-gem"><Icon size={22} /></span>
            <span>{label}</span>
          </button>
        ) : (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "on" : undefined)}>
            <Icon size={16} /> <span>{label}</span>
          </NavLink>
        )
      ))}
    </nav>
  );
}
