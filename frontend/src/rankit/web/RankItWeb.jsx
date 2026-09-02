import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useParams, useNavigate } from "react-router-dom";
import {
  Home, Compass, Activity as ActivityIcon, List as ListIcon, CircleUserRound,
  Smartphone, Star, X, ChevronRight, FileText, Plus, Search,
} from "lucide-react";
import { SEO } from "../../hooks/useSEO";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { MatchCard, Stars, RankItMark } from "./cards";
import "../rankit.css";
import "./rankit-web.css";

// ── RankIt web yüzeyi ────────────────────────────────────────────────────────
// Görsel dünya telefondan devralınıyor; masaüstünün getirdiği tek şey aynı anda
// daha çok kart görebilmek. Yapı "The Wall": sol ray, ayakta duran filtre rayı,
// ve kartların duvarı. Kart açılınca sayfa değişmiyor — duvarın üstüne denetçi
// yükseliyor, telefonun sayfa açması gibi.
//
// Download rayın beşlisine DAHİL DEĞİL, dibinde ve kendi çizgisinin altında:
// ürüne girmenin değil, ürünü almanın yolu.

// Telefonun TABS dizisiyle AYNI sıra: Rank ortada. Alt bar beş yer taşır ve
// ortadaki bir gezinme değil bir EYLEM — puanlanacak maçı aramak. Lists o yeri
// işgal ediyordu, Discover'ın içine sekme olarak taşındı.
const SECTIONS = [
  { to: "/rankit", end: true, Icon: Home, label: "Home" },
  { to: "/rankit/discover", Icon: Compass, label: "Discover" },
  { rank: true, Icon: Plus, label: "Rank" },
  { to: "/rankit/activity", Icon: ActivityIcon, label: "Activity" },
  { to: "/rankit/profile", Icon: CircleUserRound, label: "Profile" },
];

/* Sunucu maçı zengin bir satır olarak veriyor; kart onun yüzeyi. */
function toCard(m) {
  return {
    id: m.id,
    competition: m.competition_name || m.competition || "",
    competition_id: m.competition_id,
    sport: m.sport,
    status: m.status,
    date: m.date_label || m.starts_at?.slice(0, 10) || "",
    home: { name: m.home?.name, short: m.home?.short_name || m.home?.short, color: m.home?.color },
    away: { name: m.away?.name, short: m.away?.short_name || m.away?.short, color: m.away?.color },
    score: m.score,
    communityRating: m.community_rating,
    ratings: m.rating_count,
    reviews: m.review_count,
    player: m.potm?.name,
    playerNo: m.potm?.shirt_no,
    instantClassic: m.instant_classic,
    myRating: m.my_rating,
    raw: m,
  };
}

/* ── Ray ──────────────────────────────────────────────────────────────────── */

function Rail({ user, onRank }) {
  return (
    <aside className="riw-rail">
      <div className="riw-brand">
        <RankItMark size={26} />
        <div>
          <strong>RANKIT</strong>
          <small>BY PRIMARY ARCH</small>
        </div>
      </div>

      <nav className="riw-nav">
        {SECTIONS.map(({ to, end, Icon, label, rank }) => (
          rank ? (
            <button key={label} type="button" className="rank" onClick={onRank}>
              <span className="riw-rank-gem"><Icon size={22} /></span>
              <span>{label}</span>
            </button>
          ) : (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => (isActive ? "on" : undefined)}>
              <Icon size={16} /> <span>{label}</span>
            </NavLink>
          )
        ))}
      </nav>

      <div className="riw-rail-foot">
        {/* Uygulamayı almak/güncellemek gezinme değil — alt bar en fazla beş
            birincil yer taşımalı ve altıncısı Settings'e gider. Profile'da. */}
        {user ? (
          <div className="riw-account">
            Signed in as <b>@{user.username}</b>
          </div>
        ) : (
          <div className="riw-account">
            <Link to="/login?next=/rankit" style={{ color: "var(--ri-gold, #FFB11B)" }}>
              Sign in
            </Link>{" "}
            to rate and keep a diary.
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── Duvar ────────────────────────────────────────────────────────────────── */

function Wall({ matches, loading, error, onOpen, empty }) {
  if (loading) {
    return (
      <div className="riw-wall">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="riw-skeleton" />)}
      </div>
    );
  }
  return (
    <div className="riw-wall">
      {error && <div className="riw-note">{error}</div>}
      {matches.map((m) => <MatchCard key={m.id} match={m} onOpen={onOpen} />)}
      {!matches.length && !error && empty}
    </div>
  );
}

function Empty({ icon: Icon, title, note }) {
  return (
    <div className="riw-empty">
      <Icon size={22} />
      <strong>{title}</strong>
      <span>{note}</span>
    </div>
  );
}

/* ── Denetçi ──────────────────────────────────────────────────────────────── */

function Inspector({ id, onClose, onLogged }) {
  const { isLoggedIn } = useAuth();
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [state, setState] = useState("idle");

  useEffect(() => {
    let alive = true;
    rankitApi.match(id)
      .then((d) => { if (!alive) return; setDetail(d); setRating(d.my_rating || 0); setReview(d.my_review || ""); })
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    setState("saving");
    rankitApi.log({ match_id: id, rating: rating || null, review })
      .then(() => { setState("saved"); onLogged?.(); })
      .catch((e) => { setState("error"); setErr(String(e.message || e)); });
  };

  const finished = detail?.status === "finished";
  return (
    <div className="riw-inspect-wrap" onClick={onClose}>
      <section className="riw-inspect" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Match">
        <button onClick={onClose} className="ri-sheet-close" aria-label="Close"><X size={16} /></button>

        {!detail && !err && (
          <p className="ri-entity-loading">Loading match…</p>
        )}
        {err && <div className="riw-note">{err}</div>}

        {detail && (
          <>
            <div className="ri-detail-kicker">
              <small>{detail.competition || detail.competition_name} · {detail.season}</small>
            </div>
            <div className="ri-detail-teams">
              <div><strong>{detail.home?.short_name || detail.home?.name}</strong></div>
              <div>
                <small>{finished ? "FULL TIME" : detail.status?.toUpperCase()}</small>
                <strong>{detail.score || "—"}</strong>
              </div>
              <div><strong>{detail.away?.short_name || detail.away?.name}</strong></div>
            </div>

            {detail.summary && <p className="ri-summary">{detail.summary}</p>}

            {finished ? (
              isLoggedIn ? (
                <>
                  <div className="ri-rating-panel">
                    <small>YOUR RATING</small>
                    <Stars value={rating} onChange={setRating} />
                  </div>
                  <textarea className="ri-review-input" rows="3" maxLength={4000}
                    value={review} onChange={(e) => setReview(e.target.value)}
                    placeholder="Write an optional review…" />
                  <button className="ri-review-cta" onClick={save} disabled={state === "saving"}>
                    {state === "saving" ? "Saving…"
                      : state === "saved" ? "Saved to your diary"
                      : detail.my_watched_date ? "Update diary entry" : "Save to diary"}
                  </button>
                </>
              ) : (
                <p style={{ textAlign: "center", fontSize: 12, color: "#7d8184", marginTop: 18 }}>
                  <Link to="/login?next=/rankit" style={{ color: "var(--ri-gold, #FFB11B)" }}>Sign in</Link>{" "}
                  to rate this match and keep it in your diary.
                </p>
              )
            ) : (
              <p style={{ textAlign: "center", fontSize: 12, color: "#7d8184", marginTop: 18 }}>
                This match has not been played yet.
              </p>
            )}

            {!!detail.reviews?.length && (
              <div className="ri-review-feed">
                {detail.reviews.slice(0, 4).map((r) => (
                  <article key={r.id}>
                    <div>
                      <strong style={{ font: "700 11px var(--font-logo)" }}>@{r.username}</strong>
                      <Stars value={r.rating || 0} compact />
                    </div>
                    {r.review && <p>{r.spoiler ? "Contains spoilers — open in the app." : r.review}</p>}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}


/* ── Rank: puanlanacak maçı bul ───────────────────────────────────────────────
   Telefondaki orta düğmenin karşılığı. Duvarda maçı aramak "önce filtrele,
   sonra bul" demek; buradaki iş tek bir maçı hatırlayıp puanlamak, o yüzden
   ayrı bir yüzey ve doğrudan arama. Yalnızca BİTMİŞ maçlar: oynanmamış bir
   maçı puanlatmak anlamsız. */
function RankSheet({ onClose, onPick }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setRows(null); setErr("");
      const p = q.trim().length >= 2
        ? rankitApi.search(q.trim(), "Matches", "finished")
        : rankitApi.catalog({ status: "finished", limit: 40 });
      p.then((d) => alive && setRows((d.matches || []).map(toCard)))
       .catch((e) => alive && setErr(String(e.message || e)));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="riw-inspect-wrap" onClick={onClose}>
      <section className="riw-inspect riw-rank-sheet" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Rank a match">
        <button onClick={onClose} className="ri-sheet-close" aria-label="Close"><X size={16} /></button>

        <h2 className="riw-rank-title">Rank a match</h2>
        <label className="riw-rank-search">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search finished matches — team, competition…" />
        </label>

        {err && <div className="riw-note">{err}</div>}

        <div className="riw-rank-results">
          {rows === null && !err && (
            <p className="ri-entity-loading">Looking…</p>
          )}
          {rows?.map((m) => (
            <button key={m.id} type="button" onClick={() => onPick(m.id)}>
              <span className="riw-rank-comp">{m.competition}</span>
              <span className="riw-rank-teams">
                {m.home.short || m.home.name} <b>{m.score || "—"}</b> {m.away.short || m.away.name}
              </span>
              <span className="riw-rank-date">{m.date}</span>
            </button>
          ))}
          {rows && !rows.length && (
            <Empty icon={Search} title="No finished match matches that"
              note="Try a club's short name, or clear the search to see the most recent." />
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Bölümler ─────────────────────────────────────────────────────────────── */

function useCatalog(filters) {
  const [state, setState] = useState({ matches: [], total: 0, loading: true, error: "" });
  const [offset, setOffset] = useState(0);

  useEffect(() => { setOffset(0); }, [filters.sport, filters.competition, filters.season, filters.status]);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: offset === 0, error: "" }));
    rankitApi.catalog({ ...filters, limit: 24, offset })
      .then((d) => {
        if (!alive) return;
        const rows = (d.matches || []).map(toCard);
        setState((s) => ({
          matches: offset === 0 ? rows : [...s.matches, ...rows],
          total: d.total || 0, loading: false, error: "",
        }));
      })
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: String(e.message || e) })));
    return () => { alive = false; };
  }, [filters, offset]);

  return { ...state, more: () => setOffset((o) => o + 24), canLoadMore: state.matches.length < state.total };
}

function Catalog({ title, note, meta, tabs }) {
  const [sport, setSport] = useState("All");
  const [competition, setCompetition] = useState("All");
  const [season, setSeason] = useState("All");
  const [status, setStatus] = useState("All");
  const [open, setOpen] = useState(null);

  const filters = useMemo(() => ({ sport, competition, season, status }),
    [sport, competition, season, status]);
  const { matches, total, loading, error, more, canLoadMore } = useCatalog(filters);

  const comps = (meta?.competitions || [])
    .filter((c) => sport === "All" || c.sport === sport);

  return (
    <>
      <header className="riw-head">
        <h1>{title}</h1>
        <p>{note}</p>
        <span className="riw-count">
          {loading ? "…" : `${matches.length} of ${total.toLocaleString()}`}
        </span>
      </header>
      {tabs}

      <div className="riw-main">
        <div className="riw-filters">
          <div className="riw-fgroup">
            <span>SPORT</span>
            <div>
              {["All", "Football", "Basketball"].map((s) => (
                <button key={s} className={sport === s ? "on" : undefined}
                  onClick={() => { setSport(s); setCompetition("All"); }}>{s}</button>
              ))}
            </div>
          </div>
          <div className="riw-fgroup">
            <span>STATUS</span>
            <div>
              {["All", "upcoming", "live", "finished"].map((s) => (
                <button key={s} className={status === s ? "on" : undefined}
                  onClick={() => setStatus(s)}>{s === "All" ? "All" : s}</button>
              ))}
            </div>
          </div>
          <div className="riw-fgroup">
            <span>COMPETITION</span>
            <select value={competition} onChange={(e) => setCompetition(e.target.value)}>
              <option value="All">All competitions</option>
              {comps.map((c) => (
                <option key={`${c.name}-${c.season}`} value={c.name}>
                  {c.name} ({c.match_count})
                </option>
              ))}
            </select>
          </div>
          <div className="riw-fgroup">
            <span>SEASON</span>
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="All">All seasons</option>
              {(meta?.seasons || []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <Wall matches={matches} loading={loading} error={error} onOpen={(m) => setOpen(m.id)}
            empty={<Empty icon={Compass} title="Nothing matches those filters"
              note="Try a wider competition or season — the catalog covers two seasons." />} />
          {canLoadMore && !loading && (
            <button className="ri-load-more riw-more" onClick={more}>Load more</button>
          )}
        </div>
      </div>

      {open && <Inspector id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Diary() {
  const { isLoggedIn } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    if (!isLoggedIn) { setRows([]); return; }
    rankitApi.diary()
      .then((d) => setRows((d.entries || []).map((e) => ({ ...toCard(e.match || e), entry: e }))))
      .catch((e) => setErr(String(e.message || e)));
  }, [isLoggedIn]);
  useEffect(load, [load]);

  return (
    <>
      <header className="riw-head">
        <h1>Activity</h1>
        <p>Everything you have logged, newest first.</p>
        {rows && <span className="riw-count">{rows.length} entries</span>}
      </header>
      <div className="riw-main solo">
        <Wall matches={rows || []} loading={rows === null} error={err}
          onOpen={(m) => setOpen(m.id)}
          empty={<Empty icon={ActivityIcon}
            title={isLoggedIn ? "No entries yet" : "Sign in to keep a diary"}
            note={isLoggedIn
              ? "Rate a match from Home or Discover and it lands here."
              : "Your diary follows your Primary Arch account, so it is the same on the phone."} />} />
      </div>
      {open && <Inspector id={open} onClose={() => setOpen(null)} onLogged={load} />}
    </>
  );
}

function Lists({ tabs }) {
  const { isLoggedIn } = useAuth();
  const [lists, setLists] = useState(null);
  useEffect(() => {
    if (!isLoggedIn) { setLists([]); return; }
    rankitApi.lists().then((d) => setLists(d.lists || [])).catch(() => setLists([]));
  }, [isLoggedIn]);

  return (
    <>
      <header className="riw-head">
        <h1>Discover</h1>
        <p>Collections you have made, ranked or not.</p>
        {lists && <span className="riw-count">{lists.length}</span>}
      </header>
      {tabs}
      <div className="riw-main solo">
        <div className="ri-list-stack">
          {(lists || []).map((l) => (
            <article key={l.id}>
              <ListIcon size={18} />
              <div>
                <strong>{l.title}</strong>
                <span>{l.match_count} matches · {l.ranked ? "Ranked" : "Unranked"}</span>
              </div>
            </article>
          ))}
          {lists && !lists.length && (
            <Empty icon={ListIcon}
              title={isLoggedIn ? "No lists yet" : "Sign in to build lists"}
              note="A list is any set of matches worth keeping together — a season, a rivalry, a run of finals." />
          )}
        </div>
      </div>
    </>
  );
}

function Profile() {
  const { isLoggedIn, user } = useAuth();
  const [data, setData] = useState(null);
  const [build, setBuild] = useState(undefined);   // undefined = yükleniyor

  useEffect(() => {
    if (isLoggedIn) rankitApi.profile().then(setData).catch(() => setData(null));
  }, [isLoggedIn]);

  // Yayın bilgisi girişten bağımsız: sürümü görmek için hesap gerekmiyor.
  useEffect(() => {
    fetch("/api/rankit/releases/latest", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setBuild(d.release || null))
      .catch(() => setBuild(null));
  }, []);

  const s = data?.stats || {};
  return (
    <>
      <header className="riw-head">
        <h1>{isLoggedIn ? `@${user?.username}` : "Profile"}</h1>
        <p>{isLoggedIn ? "Your record across both sports." : "Sign in to keep a diary."}</p>
      </header>

      <div className="riw-main solo">
        {isLoggedIn ? (
          <div className="ri-entity-stats">
            <div><strong>{s.matches ?? 0}</strong><span>matches</span></div>
            <div><strong>{s.classics ?? 0}</strong><span>classics</span></div>
            <div><strong>{s.diary_count ?? 0}</strong><span>diary entries</span></div>
            <div><strong>{s.watchlist ?? 0}</strong><span>watchlist</span></div>
            <div><strong>{s.favorites ?? 0}</strong><span>favourites</span></div>
            <div><strong>{s.lists ?? 0}</strong><span>lists</span></div>
          </div>
        ) : (
          <Empty icon={CircleUserRound} title="Not signed in"
            note="RankIt uses your Primary Arch account — the same one that owns your squads and lineups." />
        )}

        <section className="riw-settings">
          <h2>Settings</h2>

          <div className="riw-set-group">
            <span>ANDROID APP</span>
            <Link to="/rankit/download" className="riw-set-row">
              <Smartphone size={16} />
              <div>
                <strong>Update RankIt</strong>
                <small>
                  {build === undefined ? "Checking for a build…"
                    : build ? `${build.version_name} · ${(build.size_bytes / 1048576).toFixed(1)} MB`
                    : "No build published yet"}
                </small>
              </div>
              <ChevronRight size={15} />
            </Link>
          </div>

          <div className="riw-set-group">
            <span>LEGAL</span>
            {[["/privacy-policy", "Privacy policy"],
              ["/terms-of-service", "Terms of service"],
              ["/contact", "Contact"],
              ["/affiliate-disclosure", "Affiliate disclosure"]].map(([to, label]) => (
              <Link key={to} to={to} className="riw-set-row">
                <FileText size={16} />
                <div><strong>{label}</strong></div>
                <ChevronRight size={15} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/* ── Kabuk ────────────────────────────────────────────────────────────────── */

export default function RankItWeb({ section = "home" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [rankOpen, setRankOpen] = useState(false);
  const [rankPick, setRankPick] = useState(null);

  // Lists artık gezinme değil, Discover'ın ikinci sekmesi. /rankit/lists eski
  // bağlantıları kırmasın diye duruyor ve doğrudan o sekmeyi açıyor.
  const [discoverTab, setDiscoverTab] = useState(section === "lists" ? "lists" : "matches");
  useEffect(() => { setDiscoverTab(section === "lists" ? "lists" : "matches"); }, [section]);

  useEffect(() => { rankitApi.meta().then(setMeta).catch(() => setMeta(null)); }, []);

  const discoverTabs = (
    <div className="riw-tabs" role="tablist" aria-label="Discover">
      {[["matches", "Matches"], ["lists", "Lists"]].map(([key, label]) => (
        <button key={key} role="tab" aria-selected={discoverTab === key}
          className={discoverTab === key ? "on" : undefined}
          onClick={() => {
            setDiscoverTab(key);
            navigate(key === "lists" ? "/rankit/lists" : "/rankit/discover",
                     { replace: true });
          }}>
          {label}
        </button>
      ))}
    </div>
  );

  const discover = discoverTab === "lists"
    ? <Lists tabs={discoverTabs} />
    : <Catalog meta={meta} title="Discover" tabs={discoverTabs}
        note="Filter down to a competition, a season or a state of play." />;

  const body = {
    home: <Catalog meta={meta} title="Matches"
      note="Every fixture we carry, nearest first. Open one to rate it." />,
    discover,
    lists: discover,
    activity: <Diary />,
    profile: <Profile />,
  }[section];

  return (
    <div className="riw">
      <SEO title="RankIt — rate the matches you watch"
        description="A social diary for football and basketball. Rate matches, keep a record, follow people whose taste you recognise."
        path="/rankit" />
      <Rail user={user} onRank={() => setRankOpen(true)} />
      <div className="riw-body">{body}</div>

      {rankOpen && (
        <RankSheet onClose={() => setRankOpen(false)}
          onPick={(id) => { setRankOpen(false); setRankPick(id); }} />
      )}
      {rankPick && <Inspector id={rankPick} onClose={() => setRankPick(null)} />}
    </div>
  );
}
