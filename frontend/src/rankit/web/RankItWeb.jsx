import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useParams, useNavigate } from "react-router-dom";
import {
  Home, Compass, Activity as ActivityIcon, List as ListIcon, CircleUserRound,
  Smartphone, Star, X, ChevronRight, FileText, Plus, Search,
  SlidersHorizontal, MessageSquare, Award, Eye, EyeOff,
} from "lucide-react";
import { SEO } from "../../hooks/useSEO";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { MatchCard, Stars, RankItMark, TeamMark, formatWhen } from "./cards";
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
  const when = formatWhen(m.starts_at);
  return {
    id: m.id,
    competition: m.competition_name || m.competition || "",
    competition_id: m.competition_id,
    sport: m.sport,
    status: m.status,
    date: when.full,
    time: when.time,
    startsAt: m.starts_at,
    stage: m.stage,
    // crest_url sunucunun alan adı; kart bileşeni ikisini de kabul ediyor ama
    // burada doğru adı geçirmek tek gerçek kaynağı korur.
    home: { name: m.home?.name, short: m.home?.short_name || m.home?.short, color: m.home?.color, crest_url: m.home?.crest_url },
    away: { name: m.away?.name, short: m.away?.short_name || m.away?.short, color: m.away?.color, crest_url: m.away?.crest_url },
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

/* Günlük satırı maç satırıyla AYNI şekle sahip değil: /diary sorgusu düz
   sütunlar döndürüyor (home_name, home_short, … ) ve `id` alanı MAÇIN değil
   GÜNLÜK KAYDININ id'si. toCard'ı doğrudan bu satıra uygulamak takım adlarını
   undefined bırakıyor, skoru yok ediyor (bitmiş maç "VS" gösteriyor) ve kart
   tıklanınca yanlış maçı açıyordu. Bu yüzden ayrı bir çevirici. */
function diaryToCard(e) {
  const when = formatWhen(e.starts_at);
  const score = e.home_score == null ? null : `${e.home_score} – ${e.away_score}`;
  return {
    id: e.match_id,
    competition: e.competition || "",
    sport: e.sport,
    status: e.status,
    date: when.full || e.watched_date || "",
    time: when.time,
    home: { name: e.home_name, short: e.home_short, color: e.home_color, crest_url: e.home_crest },
    away: { name: e.away_name, short: e.away_short, color: e.away_color, crest_url: e.away_crest },
    score,
    myRating: e.rating,
    instantClassic: !!e.classic,
    raw: e,
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

function Wall({ matches, loading, error, onOpen, empty, hideScores = false }) {
  // Hata varken iskelet göstermek sonsuz parıltı demekti: yükleme dalı hatayı
  // render etmeden dönüyordu ve başarısız bir istek asla kullanıcıya ulaşmıyordu.
  if (loading && !error) {
    return (
      <div className="riw-wall">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="riw-skeleton" />)}
      </div>
    );
  }
  return (
    <div className="riw-wall">
      {error && <div className="riw-note">{error}</div>}
      {matches.map((m) => <MatchCard key={m.id} match={m} onOpen={onOpen} hideScores={hideScores} />)}
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

/* Topluluk yorumu satırı — /home ve Activity aynı şekli paylaşıyor. */
function ReviewRow({ row, onOpen }) {
  const initial = (row.username || "?").slice(0, 1).toUpperCase();
  const teams = `${row.home_short || row.home_name} v ${row.away_short || row.away_name}`;
  return (
    <article className="riw-review" onClick={() => onOpen?.(row.match_id)}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(row.match_id); } }}>
      <span className="riw-avatar">{initial}</span>
      <div>
        <p><strong>@{row.username}</strong> rated <b>{teams}</b></p>
        {typeof row.rating === "number" && row.rating > 0 && <Stars value={row.rating} compact />}
        {row.review && <blockquote>{row.review}</blockquote>}
      </div>
    </article>
  );
}

/* ── Home ─────────────────────────────────────────────────────────────────────
   Home, Discover'ın bir kopyası değil. Discover KATALOG: filtrele, ara, bul.
   Home ise telefondaki gibi BU GECE — yakındaki birkaç maç ve topluluğun ne
   dediği. İkisi de aynı <Catalog> bileşenini render ettiği için beş gezinme
   yerinden ikisi birebir aynı sayfayı açıyordu; sunucunun /home ucu (hero
   kartlar + son herkese açık yorumlar) hiç çağrılmıyordu bile. */
function HomeView({ onOpenMatch }) {
  const [sport, setSport] = useState("All");
  const [hideScores, setHideScores] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setData(null); setErr("");
    rankitApi.home(sport)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => { alive = false; };
  }, [sport]);

  const cards = (data?.matches || []).map(toCard);
  const hero = cards.slice(0, 6);
  const activity = data?.activity || [];

  return (
    <>
      <header className="riw-head">
        <h1>Tonight on RankIt</h1>
        <p>The matches closest to now, and what people made of them.</p>
      </header>

      <div className="riw-home-controls">
        <div className="riw-chips">
          {["All", "Football", "Basketball"].map((s) => (
            <button key={s} className={sport === s ? "on" : undefined}
              aria-pressed={sport === s} onClick={() => setSport(s)}>{s}</button>
          ))}
        </div>
        <button className={`riw-hide${hideScores ? " on" : ""}`}
          aria-pressed={hideScores} onClick={() => setHideScores((v) => !v)}>
          {hideScores ? <EyeOff size={14} /> : <Eye size={14} />}
          {hideScores ? "Scores hidden" : "Hide scores"}
        </button>
      </div>

      <div className="riw-main solo">
        {err && <div className="riw-note">{err}</div>}

        {!data && !err && (
          <div className="riw-wall">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="riw-skeleton" />)}
          </div>
        )}

        {data && (
          <>
            <div className="riw-wall">
              {hero.map((m) => (
                <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={(x) => onOpenMatch(x.id)} />
              ))}
            </div>
            {!hero.length && (
              <Empty icon={Compass} title="No matches in this window"
                note="Try another sport, or open Discover for the full catalog." />
            )}

            <section className="riw-section">
              <header className="riw-section-head">
                <small>POPULAR ACROSS RANKIT</small>
                <h2>Community reviews</h2>
              </header>
              <div className="riw-review-list">
                {activity.map((r) => <ReviewRow key={r.id} row={r} onOpen={onOpenMatch} />)}
                {!activity.length && (
                  <Empty icon={MessageSquare} title="No reviews yet"
                    note="Be the first to write one — open a finished match and rate it." />
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </>
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
  // Telefonla aynı varsayılan: bitmiş maçta önce topluluk, oynanmamışta künye.
  const [tab, setTab] = useState("Match");

  useEffect(() => {
    let alive = true;
    rankitApi.match(id)
      .then((d) => {
        if (!alive) return;
        setDetail(d); setRating(d.my_rating || 0); setReview(d.my_review || "");
        setTab(d.status === "finished" ? "Community" : "Match");
      })
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Kaydettikten sonra puanı değiştirince buton "Saved" olarak kalıyordu:
  // kullanıcı kaydedilmemiş bir değişikliği kaydedilmiş sanıp kapatıyordu.
  useEffect(() => { setState((s) => (s === "saved" ? "idle" : s)); }, [rating, review]);

  const save = () => {
    setState("saving");
    rankitApi.log({ match_id: id, rating: rating || null, review })
      .then(() => { setState("saved"); onLogged?.(); })
      .catch((e) => { setState("error"); setErr(String(e.message || e)); });
  };

  const finished = detail?.status === "finished";
  const when = formatWhen(detail?.starts_at);
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
              <small>{detail.competition || detail.competition_name} · {detail.season}
                {detail.stage ? ` · ${detail.stage}` : ""}</small>
            </div>

            {/* Armalar telefonda maçın kimliği; burada da olmalı. */}
            <div className="ri-detail-teams riw-detail-teams">
              <div>
                <TeamMark team={detail.home} />
                <strong>{detail.home?.short || detail.home?.name}</strong>
              </div>
              <div>
                <small>{finished ? "FULL TIME" : when.time || detail.status?.toUpperCase()}</small>
                <strong>{detail.score || "VS"}</strong>
                <small>{when.date}</small>
              </div>
              <div>
                <TeamMark team={detail.away} />
                <strong>{detail.away?.short || detail.away?.name}</strong>
              </div>
            </div>

            {/* Telefondaki Match/Community ayrımı — webde hiç yoktu. */}
            <div className="ri-detail-tabs" role="tablist" aria-label="Match">
              {["Match", "Community"].map((name) => (
                <button key={name} role="tab" aria-selected={tab === name}
                  className={tab === name ? "active" : undefined}
                  onClick={() => setTab(name)}>{name}</button>
              ))}
            </div>

            {tab === "Match" ? (
              <>
                {detail.summary && <p className="ri-summary">{detail.summary}</p>}
                <div className="riw-facts">
                  <div><span>KICK-OFF</span><strong>{when.full || "—"}</strong></div>
                  <div><span>COMPETITION</span><strong>{detail.competition || "—"}</strong></div>
                  {detail.broadcaster && <div><span>BROADCAST</span><strong>{detail.broadcaster}</strong></div>}
                  {detail.potm && (
                    <div><span>COMMUNITY POTM</span><strong>{detail.potm.name}</strong></div>
                  )}
                </div>
                {!finished && (
                  <p className="riw-quiet">This match has not been played yet.</p>
                )}
              </>
            ) : (
              <>
                <div className="riw-community-stats">
                  <div>
                    <Star size={14} fill="currentColor" />
                    <strong>{detail.community_rating ?? "—"}</strong>
                    <span>COMMUNITY</span>
                  </div>
                  <div>
                    <MessageSquare size={14} />
                    <strong>{detail.review_count ?? 0}</strong>
                    <span>REVIEWS</span>
                  </div>
                  <div>
                    <Award size={14} />
                    <strong>{detail.classic_count ?? 0}</strong>
                    <span>CLASSICS</span>
                  </div>
                </div>

                {!!detail.tags?.length && (
                  <div className="riw-tagcloud">
                    {detail.tags.slice(0, 6).map((t) => (
                      <span key={t.tag}>{t.tag}<b>{t.count}</b></span>
                    ))}
                  </div>
                )}

                {finished ? (
                  isLoggedIn ? (
                    <>
                      <div className="ri-rating-panel">
                        <small>YOUR RATING</small>
                        <Stars value={rating} onChange={setRating} />
                      </div>
                      <textarea className="ri-review-input" rows="3" maxLength={4000}
                        aria-label="Your review"
                        value={review} onChange={(e) => setReview(e.target.value)}
                        placeholder="Write an optional review…" />
                      <button className="ri-review-cta" onClick={save} disabled={state === "saving"}>
                        {state === "saving" ? "Saving…"
                          : state === "saved" ? "Saved to your diary"
                          : detail.my_watched_date ? "Update diary entry" : "Save to diary"}
                      </button>
                      {detail.my_watched_date && (
                        <p className="riw-quiet riw-merge-note">
                          Your Classic stamp, tags and visibility stay as you set them in the app.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="riw-quiet">
                      <Link to="/login?next=/rankit" style={{ color: "var(--ri-gold, #FFB11B)" }}>Sign in</Link>{" "}
                      to rate this match and keep it in your diary.
                    </p>
                  )
                ) : (
                  <p className="riw-quiet">Ratings open when the match finishes.</p>
                )}

                <div className="ri-review-feed">
                  {detail.reviews?.slice(0, 8).map((r) => (
                    <article key={r.id}>
                      <div>
                        <strong style={{ font: "700 11px var(--font-logo)" }}>@{r.username}</strong>
                        <Stars value={r.rating || 0} compact />
                      </div>
                      {r.review && <p>{r.spoiler ? "Contains spoilers — open in the app." : r.review}</p>}
                    </article>
                  ))}
                  {!detail.reviews?.length && (
                    <Empty icon={MessageSquare} title="No reviews yet"
                      note="Write the first one — it shows up here for everyone." />
                  )}
                </div>
              </>
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [hideScores, setHideScores] = useState(false);

  const filters = useMemo(() => ({ sport, competition, season, status }),
    [sport, competition, season, status]);
  const { matches, total, loading, error, more, canLoadMore } = useCatalog(filters);

  const comps = (meta?.competitions || [])
    .filter((c) => sport === "All" || c.sport === sport);

  const active = [sport, competition, season, status].filter((v) => v !== "All").length;
  const clear = () => { setSport("All"); setCompetition("All"); setSeason("All"); setStatus("All"); };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setFilterOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

      {/* Filtreler artık ayakta duran bir ray değil, Players sayfasındaki gibi
          soldan açılan yarı saydam bir panel: duvar tüm genişliği kullanıyor
          ve filtreler yalnızca ihtiyaç duyulduğunda yer kaplıyor. */}
      <div className="riw-toolbar">
        <button className={`riw-filter-btn${active ? " on" : ""}`}
          onClick={() => setFilterOpen(true)} aria-expanded={filterOpen}>
          <SlidersHorizontal size={13} />
          Filters
          {active > 0 && <span className="riw-filter-badge">{active}</span>}
        </button>
        {active > 0 && (
          <button className="riw-filter-btn" onClick={clear}>Clear</button>
        )}
        <div className="riw-toolbar-gap" />
        <button className={`riw-hide${hideScores ? " on" : ""}`}
          aria-pressed={hideScores} onClick={() => setHideScores((v) => !v)}>
          {hideScores ? <EyeOff size={14} /> : <Eye size={14} />}
          {hideScores ? "Scores hidden" : "Hide scores"}
        </button>
      </div>

      {filterOpen && <div className="riw-scrim" onClick={() => setFilterOpen(false)} />}
      <aside className={`riw-drawer${filterOpen ? " open" : ""}`}
        aria-hidden={!filterOpen} aria-label="Filters">
        <header>
          <span>FILTERS</span>
          <button onClick={() => setFilterOpen(false)} aria-label="Close filters"><X size={14} /></button>
        </header>

        <div className="riw-drawer-body">
          <div className="riw-fgroup">
            <span>SPORT</span>
            <div>
              {["All", "Football", "Basketball"].map((s) => (
                <button key={s} className={sport === s ? "on" : undefined} aria-pressed={sport === s}
                  onClick={() => { setSport(s); setCompetition("All"); }}>{s}</button>
              ))}
            </div>
          </div>
          <div className="riw-fgroup">
            <span>STATUS</span>
            <div>
              {[["All", "All"], ["upcoming", "Upcoming"], ["live", "Live"], ["finished", "Finished"]].map(([v, label]) => (
                <button key={v} className={status === v ? "on" : undefined} aria-pressed={status === v}
                  onClick={() => setStatus(v)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="riw-fgroup">
            <label htmlFor="riw-comp">COMPETITION</label>
            <select id="riw-comp" value={competition} onChange={(e) => setCompetition(e.target.value)}>
              <option value="All">All competitions</option>
              {comps.map((c) => (
                <option key={`${c.name}-${c.season}`} value={c.name}>
                  {c.name} ({c.match_count})
                </option>
              ))}
            </select>
          </div>
          <div className="riw-fgroup">
            <label htmlFor="riw-season">SEASON</label>
            <select id="riw-season" value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="All">All seasons</option>
              {(meta?.seasons || []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {active > 0 && (
          <footer>
            <button onClick={clear}>Clear {active} filter{active > 1 ? "s" : ""}</button>
          </footer>
        )}
      </aside>

      <div className="riw-main solo">
        <Wall matches={matches} loading={loading} error={error} hideScores={hideScores}
          onOpen={(m) => setOpen(m.id)}
          empty={<Empty icon={Compass} title="Nothing matches those filters"
            note="Try a wider competition or season — the catalog covers two seasons." />} />
        {canLoadMore && !loading && (
          <button className="ri-load-more riw-more" onClick={more}>Load more</button>
        )}
      </div>

      {open && <Inspector id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/* Activity iki şeyi birden taşıyor ve eskiden yalnızca ikincisi vardı:
   TOPLULUK (başkalarının kayıtları ve yorumları) ve SENİN GÜNLÜĞÜN. Sayfanın
   adı "Activity" olmasına rağmen tek gösterdiği kendi kayıtlarındı; başka
   kimsenin yorumu web'de hiçbir yerde görünmüyordu. */
function ActivityView() {
  const { isLoggedIn } = useAuth();
  const [tab, setTab] = useState("community");
  const [rows, setRows] = useState(null);
  const [feed, setFeed] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    if (!isLoggedIn) { setRows([]); return; }
    rankitApi.diary()
      .then((d) => setRows((d.entries || []).map(diaryToCard)))
      .catch((e) => { setErr(String(e.message || e)); setRows([]); });
  }, [isLoggedIn]);
  useEffect(load, [load]);

  useEffect(() => {
    let alive = true;
    rankitApi.home("All")
      .then((d) => alive && setFeed(d.activity || []))
      .catch(() => alive && setFeed([]));
    return () => { alive = false; };
  }, []);

  const tabs = (
    <div className="riw-tabs" role="tablist" aria-label="Activity">
      {[["community", "Community"], ["diary", "Your diary"]].map(([key, label]) => (
        <button key={key} role="tab" aria-selected={tab === key}
          className={tab === key ? "on" : undefined} onClick={() => setTab(key)}>{label}</button>
      ))}
    </div>
  );

  return (
    <>
      <header className="riw-head">
        <h1>Activity</h1>
        <p>{tab === "community"
          ? "What other members are watching and writing."
          : "Everything you have logged, newest first."}</p>
        {tab === "diary" && rows && <span className="riw-count">{rows.length} entries</span>}
      </header>
      {tabs}

      <div className="riw-main solo">
        {tab === "community" ? (
          <div className="riw-review-list">
            {feed === null && <p className="ri-entity-loading">Loading…</p>}
            {feed?.map((r) => <ReviewRow key={r.id} row={r} onOpen={setOpen} />)}
            {feed && !feed.length && (
              <Empty icon={MessageSquare} title="No public reviews yet"
                note="Reviews members choose to make public show up here." />
            )}
          </div>
        ) : (
          <Wall matches={rows || []} loading={rows === null} error={err}
            onOpen={(m) => setOpen(m.id)}
            empty={<Empty icon={ActivityIcon}
              title={isLoggedIn ? "No entries yet" : "Sign in to keep a diary"}
              note={isLoggedIn
                ? "Rate a match from Home or Discover and it lands here."
                : "Your diary follows your Primary Arch account, so it is the same on the phone."} />} />
        )}
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
    home: <HomeView onOpenMatch={setRankPick} />,
    discover,
    lists: discover,
    activity: <ActivityView />,
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
