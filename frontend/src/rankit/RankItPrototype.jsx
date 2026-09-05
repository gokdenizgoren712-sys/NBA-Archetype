import { useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import {
  Award, Bell, Bookmark, CalendarDays, ChevronLeft, ChevronRight, CircleUserRound,
  Compass, Eye, EyeOff, Home, LayoutGrid, List, ListPlus, MessageCircle, Plus, Search,
  ChevronDown, Heart, LoaderCircle, Radio, RotateCcw, Send, Share2, SlidersHorizontal,
  Star, ThumbsUp, Trophy, Users, X,
} from "lucide-react";
import { activity, lists, matches } from "./mockData";
import { rankitApi, rankitSocketUrl } from "./rankitApi";
import { rankitHaptics } from "./rankitHaptics";
import "./rankit.css";
import "./rankit-motion.css";
import "./rankit-filter.css";
import "./rankit-next.css";
import "./rankit-v030.css";

const SPORTS = ["All", "Basketball", "Football", "Olympics"];
const TABS = [
  ["Home", Home], ["Discover", Compass], ["Rank", Plus], ["Activity", Users], ["Profile", CircleUserRound],
];

function fromApiMatch(m) {
  if (!m) return m;
  const when = new Date(m.starts_at);
  const fullDate = Number.isNaN(when.getTime()) ? m.starts_at : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(when);
  const time = Number.isNaN(when.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit",
  }).format(when);
  return {
    ...m,
    // `date` tam dize olarak KALIYOR: fikstür listesi ve bildirimlerde tek
    // zaman referansı o. Kart ve maç sayfası ise parçaları ayrı kullanır,
    // yoksa aynı kartta saat iki, maç sayfasında tarih iki kez yazılıyordu.
    date: `${fullDate}${time ? ` · ${time}` : ""}`,
    dateOnly: fullDate,
    time,
    communityRating: m.community_rating,
    ratings: m.rating_count || 0,
    reviewCount: m.review_count || 0,
    reviews: Array.isArray(m.reviews) ? m.reviews : [],
    player: m.potm?.name,
    playerNo: m.potm?.shirt_no,
    instantClassic: m.instant_classic,
    dominantTag: m.dominant_tag,
    friends: [],
  };
}

function rankitDayContext(now = new Date()) {
  const start = new Date(now);
  start.setHours(11, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const hour = now.getHours();
  const daytime = hour >= 5 && hour < 17;
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    eyebrow: daytime ? "YOUR DAY" : "YOUR NIGHT",
    title: daytime ? "Today on RankIt" : "Tonight on RankIt",
  };
}

function loadRankitHome(sport = "All") {
  const day = rankitDayContext();
  return rankitApi.home(sport, day.start, day.end);
}

function RankItMark({ size = 28 }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="RankIt">
    <polygon points="24,3 34.5,5.8 42.2,13.5 45,24 42.2,34.5 34.5,42.2 24,45 13.5,42.2 5.8,34.5 3,24 5.8,13.5 13.5,5.8" stroke="#FFB11B" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M16 35V13h10.2c6 0 9.4 3.2 9.4 8.2 0 3.7-2 6.4-5.4 7.5L36 35h-6.6l-7-8.3h3.3c2.7 0 4.2-1.7 4.2-4.7 0-2.8-1.6-4.3-4.5-4.3h-3.7V35H16Z" fill="url(#rankit-r)"/>
    <defs><linearGradient id="rankit-r" x1="16" y1="13" x2="36" y2="35"><stop stopColor="#FFE09A"/><stop offset="1" stopColor="#FFB11B"/></linearGradient></defs>
  </svg>;
}

function SheetHandle({ onClose }) {
  const drag = useRef(null);
  const move = event => {
    if (!drag.current) return;
    const distance = Math.max(0, event.clientY - drag.current.startY);
    drag.current.distance = distance;
    drag.current.sheet.style.setProperty("--ri-sheet-drag", `${distance}px`);
  };
  const finish = event => {
    if (!drag.current) return;
    const { sheet, startTime, distance = 0 } = drag.current;
    const velocity = distance / Math.max(1, performance.now() - startTime);
    drag.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture zaten bırakılmış olabilir */ }
    sheet.classList.remove("is-dragging");
    if (distance > 105 || velocity > 0.65) {
      sheet.classList.add("is-dismissing");
      sheet.style.setProperty("--ri-sheet-drag", `${window.innerHeight}px`);
      setTimeout(onClose, 220);
    } else {
      sheet.style.setProperty("--ri-sheet-drag", "0px");
      setTimeout(() => sheet.style.removeProperty("--ri-sheet-drag"), 300);
    }
  };
  return <div className="ri-sheet-grab ri-sheet-drag-handle" role="button" aria-label="Drag down to close"
    onClick={event => event.stopPropagation()}
    onPointerDown={event => {
      if (event.button !== 0) return;
      const sheet = event.currentTarget.closest(".ri-detail-sheet, .ri-rank-sheet");
      if (!sheet) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      sheet.classList.add("is-dragging");
      drag.current = { startY: event.clientY, startTime: performance.now(), distance: 0, sheet };
    }}
    onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}/>;
}

function Stars({ value = 0, onChange, compact = false }) {
  return <div className={`ri-stars${compact ? " compact" : ""}`} aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(n => {
      const fill = value >= n ? 100 : value >= n - .5 ? 50 : 0;
      const glyph = <span className="ri-star-glyph" style={{"--star-fill":`${fill}%`}}><Star size={compact ? 13 : 26}/><span><Star size={compact ? 13 : 26} fill="currentColor"/></span></span>;
      if (!onChange) return <span key={n} className={fill ? "on" : ""}>{glyph}</span>;
      return <button type="button" key={n} className={fill ? "on" : ""} aria-label={`${n - .5} or ${n} stars`}
        onClick={event => { const box=event.currentTarget.getBoundingClientRect(); rankitHaptics.select(); onChange(event.clientX-box.left < box.width/2 ? n-.5 : n); }}>{glyph}</button>;
    })}
  </div>;
}

function ClassicStamp({ active, onClick, small = false }) {
  return <button className={`ri-classic${active ? " active" : ""}${small ? " small" : ""}`} onClick={onClick ? event => { rankitHaptics.impact(); onClick(event); } : undefined}>
    <span>CLASSIC</span><small>RANKIT SELECT</small>
  </button>;
}

function TeamMark({ team }) {
  // Arma URL'i 404 verirse kalkan bomboş kalıyordu — kulüp kimliği tamamen
  // kayboluyor. Hata durumunda kısa ada (monogram) düşülür.
  // Boolean + "prop degisince sifirla" effect'i yerine BASARISIZ URL tutuluyor:
  // arma adresi degistiginde karsilastirma kendiliginden yeniden dogru oluyor,
  // efekt gerekmiyor (react-hooks/set-state-in-effect de bundan sikayetciydi).
  const [failedCrest, setFailedCrest] = useState(null);
  const showCrest = !!team.crest_url && failedCrest !== team.crest_url;
  return <div className={`ri-team-mark${showCrest ? " has-logo" : ""}`} style={{ "--team": team.color }}>
    {showCrest
      ? <img src={team.crest_url} alt={`${team.name || team.short} logo`} loading="lazy" onError={() => setFailedCrest(team.crest_url)}/>
      : <span>{team.short}</span>}
  </div>;
}

function ScoreValue({ match, detail = false }) {
  if (match.status !== "finished") return <>VS</>;
  const parts = match.score.split(/\s*[–-]\s*/);
  if (match.sport === "Basketball" && parts.length === 2) {
    return <span className={`ri-basket-score${detail ? " detail" : ""}`}><b>{parts[0]}</b><b>{parts[1]}</b></span>;
  }
  return <>{match.score}</>;
}

async function shareMatch(match, hideScores = false) {
  const score = match.status === "finished" && !hideScores ? ` ${match.score}` : "";
  const text = `${match.home.name} vs ${match.away.name}${score} · ${match.competition}`;
  const url = `${window.location.origin}/rankit?match=${match.id}`;
  try {
    if (navigator.share) await navigator.share({ title: "RankIt by Primary Arch", text, url });
    else await navigator.clipboard.writeText(`${text} ${url}`);
    rankitHaptics.success();
  } catch { /* paylaşım kullanıcı tarafından kapatılabilir */ }
}

function MatchCard({ match, hideScores, onOpen, onOpenCompetition, featured = false }) {
  const finished = match.status === "finished";
  const live = match.status === "live";
  // role/tabIndex/onKeyDown eskiden yoktu — bu kart bir <article onClick>, ve
  // telefon Capacitor uygulaması olarak da paketlendiği için erişilebilirlik
  // servisi kullanan biri için tamamen erişilemezdi. Web'in kendi MatchCard'ı
  // (cards.jsx) bunu zaten doğru yapıyordu; aynı deseni buraya taşıyoruz.
  return <article className={`ri-match-card${featured ? " featured" : ""}${match.instantClassic ? " instant" : ""}`}
    role="button" tabIndex={0}
    aria-label={`${match.home.name || match.home.short} versus ${match.away.name || match.away.short}`}
    onClick={event => {
      if (event.target.closest("button")) return;
      onOpen(match);
    }}
    onKeyDown={event => {
      if (event.target.closest("button")) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(match); }
    }}
    style={{ "--home": match.home.color, "--away": match.away.color }}>
    <div className="ri-card-holo" />
    <div className="ri-match-top">
      {match.instantClassic ? <span>INSTANT CLASSIC</span> : <button type="button" disabled={!match.competition_id}
        onClick={event=>{event.stopPropagation();onOpenCompetition?.(match.competition_id)}}>{match.competition}</button>}
      {finished ? <span className="ri-community-rating"><Star size={11} fill="currentColor" /> {match.communityRating}</span> : live ? <span className="ri-live-tag">LIVE</span> : <span className="ri-live-date">{match.dateOnly || match.date}</span>}
    </div>

    <div className="ri-match-art">
      <div className="ri-team-side home"><TeamMark team={match.home} /></div>
      {finished && match.player ? (
        <div className="ri-player-art">
          <span className="ri-player-no">{match.playerNo}</span>
          <div className="ri-player-silhouette" />
          <div className="ri-potm"><small>COMMUNITY POTM</small><strong>{match.player}</strong></div>
        </div>
      ) : (
        <div className="ri-versus"><small>{match.editorial ? "FEATURED MATCH" : match.time}</small><strong>VS</strong></div>
      )}
      <div className="ri-team-side away"><TeamMark team={match.away} /></div>
    </div>

    {/* Kısa ad çoğu kulüpte tam adın AYNISI ("Toulouse / Toulouse",
        "Sassuolo / Sassuolo") — ikinci satır o zaman bilgi değil tekrar.
        rankit/DESIGN.md'de "wrong" diye kayıtlıydı, düzeltilmemişti. */}
    <div className="ri-score-band">
      <div>
        <strong>{match.home.short}</strong>
        {match.home.name !== match.home.short && <small>{match.home.name}</small>}
      </div>
      <div className={`ri-score${hideScores && finished ? " hidden" : ""}`}>
        {finished ? <ScoreValue match={match}/> : "—"}
      </div>
      <div>
        <strong>{match.away.short}</strong>
        {match.away.name !== match.away.short && <small>{match.away.name}</small>}
      </div>
    </div>

    <div className="ri-match-foot">
      <span>{finished
        ? `${match.ratings.toLocaleString()} ratings · ${match.reviewCount ?? 0} reviews`
        : match.broadcaster ? `Watch on ${match.broadcaster}` : "Broadcast details pending"}</span>
      <span>{finished && match.dominantTag ? match.dominantTag : match.stage || match.date}</span>
    </div>
    {!finished && <button className="ri-card-share" aria-label="Share match" onClick={event=>{event.stopPropagation();shareMatch(match,hideScores)}}><Share2 size={13}/></button>}
  </article>;
}

function CompetitionDetail({ detail, onClose, onOpenMatch, onOpenPlayer }) {
  const [section, setSection] = useState("Upcoming");
  if (!detail) return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-detail-sheet ri-competition-sheet" onClick={event=>event.stopPropagation()}><SheetHandle onClose={onClose}/><div className="ri-entity-loading">Loading competition…</div></section></div>;
  const competition = detail.competition;
  const fixtures = (detail.fixtures || []).map(fromApiMatch);
  return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-detail-sheet ri-competition-sheet" onClick={event=>event.stopPropagation()}>
    <SheetHandle onClose={onClose}/><button className="ri-sheet-close" onClick={onClose}><X size={19}/></button>
    <header className="ri-competition-head"><small>{competition.country || "Competition"} · {competition.season}</small><h2>{competition.name}</h2><span>{competition.sport}</span></header>
    <div className="ri-detail-tabs ri-competition-tabs">{["Upcoming","Standings","Popular Players"].map(name=><button key={name} className={section===name?"active":""} onClick={()=>setSection(name)}>{name}</button>)}</div>
    {section === "Upcoming" && <div className="ri-competition-fixtures">{fixtures.map(match=><button key={match.id} onClick={()=>{onClose();onOpenMatch(match)}}><span><small>{match.stage || "Upcoming fixture"}</small><strong>{match.home.short} <b>vs</b> {match.away.short}</strong></span><time>{match.status === "live" ? "LIVE" : match.date}</time><ChevronRight size={15}/></button>)}{!fixtures.length&&<div className="ri-empty-state"><CalendarDays size={22}/><strong>No upcoming fixtures</strong><span>The next scheduled matches will appear here.</span></div>}</div>}
    {section === "Standings" && <div className="ri-competition-table"><header><span>#</span><strong>Team</strong><span>P</span><span>{competition.sport === "Basketball" ? "+/-" : "GD"}</span><span>{competition.sport === "Basketball" ? "W" : "PTS"}</span></header>{(detail.standings||[]).map((row,index)=><div key={row.team_id}><span>{index+1}</span><strong><TeamMark team={{name:row.name,short:row.short_name,color:row.color,crest_url:row.crest_url}}/><b>{row.short_name}</b></strong><span>{row.played}</span><span>{row.gd>0?`+${row.gd}`:row.gd}</span><span>{row.points}</span></div>)}{!detail.standings?.length&&<div className="ri-empty-state"><List size={22}/><strong>No league table for this stage</strong><span>Qualifying and knockout ties are shown under fixtures.</span></div>}</div>}
    {section === "Popular Players" && <div className="ri-popular-players">{(detail.popular_players||[]).map((player,index)=><button key={player.id} onClick={()=>{onClose();onOpenPlayer(player.id)}}><b>{index+1}</b>{player.image_url?<img src={player.image_url} alt=""/>:<span>{player.name.slice(0,2).toUpperCase()}</span>}<div><strong>{player.name}</strong><small>{player.team_name || "Competition player"}</small></div><em>{player.potm_votes} POTM · {player.respect_votes} Respect</em></button>)}{!detail.popular_players?.length&&<div className="ri-empty-state"><Trophy size={22}/><strong>Popular players will appear here</strong><span>Community POTM and Respect votes shape this list.</span></div>}</div>}
  </section></div>;
}

function MatchDetail({ match, hideScores, onClose, onSave, onToggleWatchlist, onToggleFavorite, onRefresh }) {
  const draftReady = useRef(false);
  const [rating, setRating] = useState(match.my_rating ?? 0);
  const [classic, setClassic] = useState(!!match.my_classic);
  const [watchlist, setWatchlist] = useState(!!match.watchlisted);
  const [favorited, setFavorited] = useState(!!match.favorited);
  const [section, setSection] = useState(match.status === "finished" ? "Community" : "Match");
  const [tags, setTags] = useState(match.my_tags || []);
  const [respect, setRespect] = useState(match.my_respect_ids || []);
  const [potmId, setPotmId] = useState(match.my_potm_id || null);
  const [review, setReview] = useState(match.my_review || "");
  const [spoiler, setSpoiler] = useState(!!match.my_spoiler);
  const [visibility, setVisibility] = useState(match.my_visibility || "public");
  const [rewatch, setRewatch] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [showPotmPicker, setShowPotmPicker] = useState(false);
  const [showRespectPicker, setShowRespectPicker] = useState(false);
  const [broadcastInfo, setBroadcastInfo] = useState(null);
  // "Bu maçı listeme ekle": addListItem ucu vardı ama iki yüzey de
  // çağırmıyordu. Web'e eklenirken telefon geride kalmasın — parite
  // sözleşmesi tek yönlü değil (bkz. rankit/PRODUCT.md).
  const [myLists, setMyLists] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const tagOptions = match.sport === "Football"
    ? ["Nail-biter", "Great Atmosphere", "Comeback", "Penalty Drama", "Goal Fest", "Tactical Battle", "Upset", "Late Winner", "Derby Energy"]
    : ["Nail-biter", "Great Atmosphere", "Comeback", "Overtime", "Clutch Performance", "Shootout", "Defensive Masterclass", "Upset", "Buzzer Beater"];
  const playerOptions = match.players || [];
  const visibleTags = showMoreTags ? tagOptions : tagOptions.slice(0,5);
  const playersByTeam = playerOptions.reduce((groups, player) => ({ ...groups, [player.team]: [...(groups[player.team] || []), player] }), {});
  const communityTags = Array.isArray(match.tags) ? match.tags : [];
  const selectedPotm = playerOptions.find(player => player.id === potmId);
  const selectedRespect = playerOptions.filter(player => respect.includes(player.id));
  useEffect(() => {
    setRating(match.my_rating ?? 0); setClassic(!!match.my_classic);
    setTags(match.my_tags || []); setRespect(match.my_respect_ids || []);
    setPotmId(match.my_potm_id || null); setReview(match.my_review || "");
    setSpoiler(!!match.my_spoiler); setVisibility(match.my_visibility || "public");
    try {
      const draft = JSON.parse(localStorage.getItem(`rankit:draft:${match.id}`));
      if (draft && !match.my_watched_date) {
        setRating(draft.rating || 0); setClassic(!!draft.classic); setTags(draft.tags || []);
        setReview(draft.review || ""); setSpoiler(!!draft.spoiler); setVisibility(draft.visibility || "public");
        setPotmId(draft.potmId || null); setRespect(draft.respect || []);
      }
    } catch { /* bozuk taslak yok sayılır */ }
    draftReady.current = true;
  }, [match.id, match.my_watched_date]);
  useEffect(() => { rankitApi.broadcasts(match.id, "TR").then(setBroadcastInfo).catch(()=>setBroadcastInfo(null)); }, [match.id]);
  useEffect(() => {
    if (!draftReady.current) return undefined;
    const timer = setTimeout(() => {
      try { localStorage.setItem(`rankit:draft:${match.id}`, JSON.stringify({ rating, classic, tags, review, spoiler, visibility, potmId, respect })); } catch { /* taslak opsiyonel */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [match.id,rating,classic,tags,review,spoiler,visibility,potmId,respect]);
  const toggleTag = tag => setTags(v => v.includes(tag) ? v.filter(x => x !== tag) : v.length < 3 ? [...v, tag] : v);
  const toggleRespect = id => {
    if (id === potmId) return;
    setRespect(v => v.includes(id) ? v.filter(x => x !== id) : v.length < 2 ? [...v, id] : v);
  };
  const choosePotm = id => {
    setPotmId(id);
    setRespect(v => v.filter(x => x !== id));
  };
  const saveLog = async () => {
    setSaveState("saving");
    try {
      await onSave?.({
        diary: { match_id: match.id, watched_date: new Date().toISOString().slice(0, 10), rating: rating || null, review, classic, tags, visibility, spoiler, is_rewatch: rewatch },
        matchId: match.id, potmId, respectIds: respect,
      });
      setSaveState("saved");
      rankitHaptics.success();
      try { localStorage.removeItem(`rankit:draft:${match.id}`); } catch { /* kayıt tamamlandı */ }
    } catch { setSaveState("error"); }
  };
  const showNotice = (message, tone = "success") => {
    // id yalnızca React key'i: değişince toast animasyonu baştan oynar.
    // Date.now() saf olmayan bir çağrı; sayaç aynı işi görüyor ve arka arkaya
    // gelen iki aynı mesajda da farklı key üretiyor. (Web tarafında da böyle.)
    setActionNotice((n) => ({ message, tone, id: (n?.id || 0) + 1 }));
  };
  const openLists = async () => {
    const next = !listOpen;
    setListOpen(next);
    if (next && myLists === null) {
      try { setMyLists((await rankitApi.lists()).lists || []); }
      catch { setMyLists([]); }
    }
  };
  const addToList = async (listId, listTitle) => {
    setListOpen(false);
    try {
      await rankitApi.addListItem(listId, { match_id: match.id });
      rankitHaptics.success();
      showNotice(`Added to ${listTitle}`);
    } catch { showNotice("Could not add to that list", "error"); }
  };

  const toggleWatchlist = async () => {
    if (watchlistBusy) return;
    const previous = watchlist;
    const optimistic = !previous;
    setWatchlist(optimistic);
    setWatchlistBusy(true);
    try {
      const result = await onToggleWatchlist(match.id);
      setWatchlist(result.watchlisted);
      showNotice(result.watchlisted ? "Added to your watchlist" : "Removed from your watchlist");
    } catch {
      setWatchlist(previous);
      showNotice("Watchlist could not be updated", "error");
    } finally {
      setWatchlistBusy(false);
    }
  };
  const toggleFavorite = async () => {
    if (favoriteBusy) return;
    const previous = favorited;
    const optimistic = !previous;
    setFavorited(optimistic);
    setFavoriteBusy(true);
    try {
      const result = await onToggleFavorite({ target_type: "match", target_id: match.id });
      setFavorited(result.favorited);
      showNotice(result.favorited ? "Added to your favourites" : "Removed from your favourites");
    } catch {
      setFavorited(previous);
      showNotice("Favourites could not be updated", "error");
    } finally {
      setFavoriteBusy(false);
    }
  };
  return <div className="ri-sheet-wrap" onClick={onClose}>
    <section className="ri-detail-sheet" onClick={e => e.stopPropagation()}>
      <SheetHandle onClose={onClose}/>
      <button className="ri-sheet-close" onClick={onClose}><X size={19} /></button>
      <div className="ri-v03-hero" style={{"--detail-home":match.home.color,"--detail-away":match.away.color}}>
        <div className={`ri-detail-kicker ${match.status}`}><span>{match.competition}{match.stage ? ` · ${match.stage}` : ""}</span><b>{match.status === "finished" ? "FULL TIME" : match.status === "live" ? "LIVE" : "UPCOMING"}</b></div>
        <div className="ri-detail-teams">
          <div className="ri-v03-team"><TeamMark team={match.home}/><strong>{match.home.short}</strong>{match.home.name !== match.home.short && <small>{match.home.name}</small>}</div>
          <div className="ri-v03-score"><small>{match.dateOnly || match.date}</small><strong className={hideScores && match.status === "finished" ? "ri-blur" : ""}><ScoreValue match={match} detail/></strong><span>{match.season}</span></div>
          <div className="ri-v03-team"><TeamMark team={match.away}/><strong>{match.away.short}</strong>{match.away.name !== match.away.short && <small>{match.away.name}</small>}</div>
        </div>
      </div>
      <div className="ri-detail-tabs"><button className={section === "Match" ? "active" : ""} onClick={() => setSection("Match")}>Match</button><button className={section === "Community" ? "active" : ""} onClick={() => setSection("Community")}>Community</button></div>
      {section === "Match" ? <>
        {match.summary && <p className="ri-summary">{match.summary}</p>}
        <div className="ri-broadcast"><small>WATCH IN TÜRKİYE</small><strong>{broadcastInfo?.channels?.map(channel=>channel.name).join(" · ") || match.broadcaster || "To be announced"}</strong><span>{broadcastInfo?.confidence === "confirmed" ? "Confirmed broadcaster" : broadcastInfo?.confidence === "typical" ? "Typical competition coverage · check before the match" : match.status === "finished" ? "Broadcast information unavailable" : "Coverage has not been confirmed yet"}</span></div>
        <div className="ri-timeline"><small>MATCH</small><div><span>{match.status === "finished" ? "FT" : match.time || match.dateOnly}</span><strong>{match.status === "finished" ? "Full time" : "Scheduled"}</strong></div><button onClick={() => setSection("Community")}>Community <ChevronRight size={14}/></button></div>
        {playerOptions.length > 0 && <div className="ri-squad-preview"><div className="ri-chip-title">SEASON SQUADS <span>{playerOptions.length}</span></div><div>{[match.home,match.away].map(team=><section key={team.id}><header><TeamMark team={team}/><strong>{team.name}</strong></header><div>{playerOptions.filter(p=>p.team===team.short).map(p=><span key={p.id}>{p.shirt_no&&<b>{p.shirt_no}</b>}{p.name}</span>)}</div></section>)}</div></div>}
        <div className="ri-detail-actions">
          {match.status === "upcoming" && <button disabled={watchlistBusy} aria-busy={watchlistBusy} className={`ri-review-cta${watchlist ? " saved" : ""}${watchlistBusy ? " is-busy" : ""}`} onClick={toggleWatchlist}>{watchlistBusy ? <LoaderCircle className="ri-spin" size={17}/> : <Bookmark size={17} fill={watchlist ? "currentColor" : "none"} />} {watchlist ? "In your watchlist" : "Add to watchlist"}</button>}
          <button disabled={favoriteBusy} aria-busy={favoriteBusy} className={`ri-review-cta secondary${favorited ? " saved" : ""}${favoriteBusy ? " is-busy" : ""}`} onClick={toggleFavorite}>{favoriteBusy ? <LoaderCircle className="ri-spin" size={17}/> : <Heart size={17} fill={favorited ? "currentColor" : "none"}/>} {favorited ? "Favourite" : "Add to favourites"}</button>
          <button className="ri-review-cta secondary" aria-expanded={listOpen} onClick={openLists}><ListPlus size={17}/> Add to list</button>
          {listOpen && <div className="ri-tag-picker">
            {myLists === null && <span style={{fontSize:11,color:"#777"}}>Loading…</span>}
            {myLists?.map(l => <button key={l.id} onClick={()=>addToList(l.id,l.title)}>{l.title}</button>)}
            {myLists?.length === 0 && <span style={{fontSize:11,color:"#777"}}>No lists yet — make one from the Rank sheet.</span>}
          </div>}
        </div>
      </> : match.status === "finished" ? <>
        <div className="ri-v03-community-stats">
          <div><Star size={15} fill="currentColor"/><strong>{match.communityRating ?? "—"}</strong><span>COMMUNITY</span></div>
          <div><MessageCircle size={15}/><strong>{match.reviewCount || 0}</strong><span>REVIEWS</span></div>
          <div><Award size={15}/><strong>{match.classic_count || 0}</strong><span>CLASSICS</span></div>
        </div>
        {(match.potm || communityTags.length > 0) && <section className="ri-v03-consensus">
          {match.potm && <div className="ri-v03-potm"><Trophy size={18}/><span><small>COMMUNITY PLAYER OF THE MATCH</small><strong>{match.potm.name}</strong></span><b>{match.potm.votes || 0}×</b></div>}
          {communityTags.length > 0 && <div className="ri-v03-tag-cloud">{communityTags.map(item=><span key={item.tag} className={item.tag===match.dominantTag?"dominant":""}>{item.tag}<b>{item.count.toLocaleString()}×</b></span>)}</div>}
        </section>}
        <div className="ri-v03-log-head"><div><small>YOUR MATCH DIARY</small><h3>{match.my_watched_date ? "Update your entry" : "Log this match"}</h3></div>{match.my_watched_date&&<b>LOGGED</b>}</div>
        <div className="ri-rating-panel"><small>YOUR RATING</small><Stars value={rating} onChange={setRating}/><ClassicStamp active={classic} onClick={() => setClassic(v => !v)}/></div>
        <div className="ri-chip-title">DESCRIBE THE MATCH <span>{tags.length}/3</span></div>
        <div className="ri-tag-picker">{visibleTags.map(tag => <button key={tag} className={tags.includes(tag) ? "active" : ""} onClick={() => toggleTag(tag)}>{tag}</button>)}<button className="ri-more-tags" onClick={()=>setShowMoreTags(v=>!v)}>{showMoreTags?"Less":"More"}</button></div>
        <div className="ri-detail-row"><span>Community rating</span><strong><Star size={14} fill="currentColor"/> {match.communityRating ?? "Not rated"} <small>({match.ratings.toLocaleString()})</small></strong></div>
        <div className="ri-vote-block ri-v03-votes">
          <button className="ri-v03-vote-trigger" onClick={()=>setShowPotmPicker(value=>!value)}><Trophy size={16}/><span><small>YOUR PLAYER OF THE MATCH</small><strong>{selectedPotm?.name || "Choose one player"}</strong></span><b>{showPotmPicker ? "CLOSE" : potmId ? "CHANGE" : "CHOOSE"}</b></button>
          {showPotmPicker && <div className="ri-match-player-groups">{Object.entries(playersByTeam).map(([team,players])=><section key={`potm-${team}`}><small>{team}</small><div className="ri-respect-grid">{players.map(player => <button key={`potm-${player.id}`} className={potmId === player.id ? "active" : ""} onClick={() => {choosePotm(player.id);setShowPotmPicker(false)}}>{player.image_url?<img src={player.image_url} alt=""/>:<Trophy size={12}/>}<span>{player.name}</span></button>)}</div></section>)}</div>}
          <button className="ri-v03-vote-trigger respect" onClick={()=>setShowRespectPicker(value=>!value)}><ThumbsUp size={16}/><span><small>RESPECT · UP TO TWO</small><strong>{selectedRespect.length ? selectedRespect.map(player=>player.name).join(" · ") : "Recognise other performances"}</strong></span><b>{showRespectPicker ? "CLOSE" : respect.length ? "CHANGE" : "CHOOSE"}</b></button>
          {showRespectPicker && <div className="ri-match-player-groups">{Object.entries(playersByTeam).map(([team,players])=><section key={`respect-${team}`}><small>{team}</small><div className="ri-respect-grid">{players.filter(player=>player.id!==potmId).map(player => <button key={`respect-${player.id}`} className={respect.includes(player.id) ? "active" : ""} onClick={() => toggleRespect(player.id)}>{player.image_url?<img src={player.image_url} alt=""/>:<ThumbsUp size={12}/>}<span>{player.name}</span></button>)}</div></section>)}</div>}
        </div>
        <textarea className="ri-review-input" maxLength={4000} value={review} onChange={e=>setReview(e.target.value)} placeholder="Write an optional review…" rows="3"/>
        <div className="ri-review-options"><label><input type="checkbox" checked={spoiler} onChange={e=>setSpoiler(e.target.checked)}/> Contains spoilers</label><label><input type="checkbox" checked={rewatch} onChange={e=>setRewatch(e.target.checked)}/> Log as rewatch</label><select value={visibility} onChange={e=>setVisibility(e.target.value)} aria-label="Review visibility"><option value="public">Public</option><option value="followers">Followers</option><option value="private">Private</option></select></div>
        <button disabled={saveState === "saving"} aria-busy={saveState === "saving"} className={`ri-review-cta${saveState === "saved" ? " saved" : ""}${saveState === "saving" ? " is-busy" : ""}`} onClick={saveLog}>{saveState === "saving" ? <LoaderCircle className="ri-spin" size={17}/> : <MessageCircle size={17}/>} {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to Diary" : saveState === "error" ? "Could not save · Try again" : match.my_watched_date && !rewatch ? "Update Diary Entry" : "Save to Diary"}</button>
        {saveState === "saved" && <div className="ri-save-result"><span>YOUR RANKIT</span><strong>{rating || "—"} / 5 {classic ? "· CLASSIC" : ""}</strong><button onClick={()=>shareMatch(match,hideScores)}><Share2 size={14}/> Share rating card</button></div>}
        <ReviewFeed reviews={match.reviews || []} onRefresh={onRefresh}/>
      </> : <WatchalongPanel matchId={match.id}/>} 
      {actionNotice && <div key={actionNotice.id} role="status" className={`ri-action-toast ${actionNotice.tone}`} onAnimationEnd={() => setActionNotice(null)}>{actionNotice.message}</div>}
    </section>
  </div>;
}

function MatchDetailLoading({ onClose }) {
  return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-detail-sheet" onClick={event => event.stopPropagation()}>
    <SheetHandle onClose={onClose}/><div className="ri-entity-loading">Loading match…</div>
  </section></div>;
}

function NotificationCenter({ feed, watchlist, onClose, onOpenMatch }) {
  const [filter,setFilter]=useState("All");
  const social=feed.map(item=>({id:`social-${item.id}`,kind:"Social",title:`@${item.user} published a review`,text:item.text,match:item.match}));
  const matchesFeed=watchlist.slice(0,8).map(match=>({id:`match-${match.id}`,kind:"Matches",title:`${match.home.short} vs ${match.away.short}`,text:match.status==="live"?"Live now":"Coming up from your watchlist",match}));
  const items=[...matchesFeed,...social].filter(item=>filter==="All"||item.kind===filter);
  return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-rank-sheet ri-notification-sheet" onClick={event=>event.stopPropagation()}><SheetHandle onClose={onClose}/><div className="ri-rank-head"><div><small>STAY IN THE LOOP</small><h2>Notifications</h2></div><button onClick={onClose}><X size={20}/></button></div><div className="ri-search-kinds">{["All","Matches","Social"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div><div className="ri-notification-list">{items.map(item=><button key={item.id} onClick={()=>{onClose();onOpenMatch(item.match)}}><i className={item.kind.toLowerCase()}/><span><strong>{item.title}</strong><small>{item.text||item.kind}</small></span><ChevronRight size={15}/></button>)}{!items.length&&<div className="ri-empty-state"><Bell size={20}/><strong>Nothing new here</strong><span>Your match and social updates will appear here.</span></div>}</div></section></div>;
}

function ReviewFeed({ reviews, onRefresh }) {
  const [openId, setOpenId] = useState(null);
  const [comments, setComments] = useState({});
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState([]);
  const [reactions, setReactions] = useState({});
  const [busyLikes, setBusyLikes] = useState([]);
  const [commentState, setCommentState] = useState({});
  useEffect(() => {
    setReactions(Object.fromEntries(reviews.map(review => [review.id, { liked: !!review.liked, likes: review.likes || 0 }])));
  }, [reviews]);
  const toggleComments = async id => {
    setOpenId(openId === id ? null : id);
    if (openId === id) return;
    if (!comments[id]) setComments(v => ({ ...v, [id]: [] }));
    setCommentState(v => ({ ...v, [id]: "loading" }));
    try {
      const data = await rankitApi.comments(id);
      setComments(v => ({ ...v, [id]: data.comments || [] }));
      setCommentState(v => ({ ...v, [id]: "ready" }));
    } catch {
      setCommentState(v => ({ ...v, [id]: "error" }));
    }
  };
  const addComment = async id => {
    if (!draft.trim()) return;
    setCommentState(v => ({ ...v, [id]: "saving" }));
    try {
      await rankitApi.addComment(id, draft.trim());
      setDraft("");
      const data = await rankitApi.comments(id);
      setComments(v => ({ ...v, [id]: data.comments || [] }));
      setCommentState(v => ({ ...v, [id]: "ready" }));
      await onRefresh?.();
    } catch {
      setCommentState(v => ({ ...v, [id]: "error" }));
    }
  };
  const like = async review => {
    if (busyLikes.includes(review.id)) return;
    const previous = reactions[review.id] || { liked: !!review.liked, likes: review.likes || 0 };
    const optimistic = { liked: !previous.liked, likes: Math.max(0, previous.likes + (previous.liked ? -1 : 1)) };
    setReactions(v => ({ ...v, [review.id]: optimistic }));
    setBusyLikes(v => [...v, review.id]);
    rankitHaptics.selection();
    try {
      const result = await rankitApi.likeReview(review.id);
      setReactions(v => ({ ...v, [review.id]: result }));
      await onRefresh?.();
    } catch {
      setReactions(v => ({ ...v, [review.id]: previous }));
    } finally {
      setBusyLikes(v => v.filter(id => id !== review.id));
    }
  };
  return <div className="ri-review-feed"><div className="ri-chip-title">COMMUNITY REVIEWS <span>{reviews.length}</span></div>{reviews.map(r => <article key={r.id}>
    <div><strong>@{r.username}</strong><Stars value={r.rating || 0} compact/></div>{r.spoiler && !revealed.includes(r.id) ? <button className="ri-spoiler-cover" onClick={()=>setRevealed(v=>[...v,r.id])}><EyeOff size={14}/><span>Spoiler review</span><small>Tap to reveal</small></button> : <p>{r.review}</p>}
    <footer><button disabled={busyLikes.includes(r.id)} aria-label={`${reactions[r.id]?.liked ? "Unlike" : "Like"} review by ${r.username}`} className={reactions[r.id]?.liked ? "active" : ""} onClick={() => like(r)}><Heart size={12} fill={reactions[r.id]?.liked ? "currentColor" : "none"}/> {reactions[r.id]?.likes ?? r.likes}</button><button onClick={() => toggleComments(r.id)}><MessageCircle size={12}/> {r.comments}</button></footer>
    {openId === r.id && <div className="ri-comments">{commentState[r.id] === "loading" ? <p className="ri-inline-state">Loading replies…</p> : (comments[r.id] || []).map(c => <p key={c.id}><strong>@{c.username}</strong> {c.content}</p>)}{commentState[r.id] === "error" && <p className="ri-inline-state error">Could not update replies. Try again.</p>}<div><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e=>e.key === "Enter" && addComment(r.id)} placeholder="Write a reply"/><button disabled={commentState[r.id] === "saving" || !draft.trim()} onClick={() => addComment(r.id)}>{commentState[r.id] === "saving" ? <LoaderCircle className="ri-spin" size={13}/> : <Send size={13}/>}</button></div></div>}
  </article>)}</div>;
}

function WatchalongPanel({ matchId }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useMemo(() => ({ current: null }), []);
  useEffect(() => {
    rankitApi.watchalong(matchId).then(d => setMessages(d.messages || [])).catch(() => {});
    const token = localStorage.getItem("nba_arch_token") || "";
    const ws = new WebSocket(rankitSocketUrl(`/api/rankit/ws/watchalong/${matchId}?token=${encodeURIComponent(token)}`));
    socketRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = event => { const data = JSON.parse(event.data); if (data.message) setMessages(v => [...v, data.message]); };
    return () => ws.close();
  }, [matchId, socketRef]);
  const send = () => { if (!draft.trim() || socketRef.current?.readyState !== WebSocket.OPEN) return; socketRef.current.send(JSON.stringify({ content: draft.trim() })); setDraft(""); };
  return <div className="ri-watchalong-live"><div className="ri-watchalong-card"><Radio size={22}/><div><small>LIVE WATCHALONG</small><strong>{connected ? "Community room connected" : "Connecting…"}</strong><span>React together without turning RankIt into a score app.</span></div></div><div className="ri-chat-log">{messages.map(m => <p key={m.id}><strong>@{m.username}</strong><span>{m.content}</span></p>)}</div><div className="ri-chat-compose"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key === "Enter" && send()} placeholder="Say something about the match"/><button onClick={send}><Send size={15}/></button></div></div>;
}

function GlobalSearch({ onClose, onOpenMatch, onOpenEntity, initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState("All");
  const [results, setResults] = useState({ matches: [], players: [], teams: [], members: [], lists: [] });
  const [suggestedMembers, setSuggestedMembers] = useState([]);
  useEffect(()=>{ rankitApi.search("","Members").then(data=>setSuggestedMembers(data.members||[])).catch(()=>{}); },[]);
  useEffect(() => {
    if (!query.trim()) {
      setResults({ matches: [], players: [], teams: [], members: [], lists: [] });
      return;
    }
    const timer = setTimeout(() => {
      rankitApi.search(query.trim(), kind)
        .then(data => setResults({ ...data, matches: (data.matches || []).map(fromApiMatch) }))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(timer);
  }, [query, kind]);
  return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-rank-sheet ri-global-sheet" onClick={e => e.stopPropagation()}>
    <SheetHandle onClose={onClose}/><div className="ri-rank-head"><div><small>SEARCH ALL OF RANKIT</small><h2>Discover something memorable</h2></div><button onClick={onClose}><X size={20}/></button></div>
    <label className="ri-search"><Search size={17}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Matches, teams, players, members, lists"/></label>
    <div className="ri-search-kinds">{["All","Matches","Players","Teams","Members","Lists"].map(x=><button key={x} className={kind===x?"active":""} onClick={()=>setKind(x)}>{x}</button>)}</div>
    {!query && <><div className="ri-search-shelves"><small>TRENDING NOW</small><div><button>Champions League</button><button>NBA Playoffs</button><button>Community Classics</button></div></div><div className="ri-people-shelf"><small>PEOPLE TO FOLLOW</small>{suggestedMembers.map(member=><button key={member.id} onClick={()=>{onClose();onOpenEntity("member",member.id)}}><span>{member.username.slice(0,2).toUpperCase()}</span><strong>@{member.username}</strong><ChevronRight size={14}/></button>)}</div></>}
    {(kind === "All" || kind === "Matches") && <div className="ri-rank-results">{results.matches.map(m=><button key={m.id} onClick={()=>{onClose();onOpenMatch(m)}}><div className="ri-mini-crests"><TeamMark team={m.home}/><TeamMark team={m.away}/></div><span><strong>{m.home.short} vs {m.away.short}</strong><small>{m.competition} · {m.date}</small></span><ChevronRight size={17}/></button>)}</div>}
    {kind === "All" && <div className="ri-rank-results">{[...results.players.map(x=>({...x,_kind:"player"})),...results.teams.map(x=>({...x,_kind:"team"})),...results.members.map(x=>({...x,_kind:"member"})),...results.lists.map(x=>({...x,_kind:"list"}))].map(item=><button key={`${item._kind}-${item.id}`} onClick={()=>{onClose();onOpenEntity(item._kind,item.id)}}><span><strong>{item.name||item.username||item.title}</strong><small>{item._kind}</small></span><ChevronRight size={17}/></button>)}</div>}
    {query && ["Players","Teams","Members","Lists"].includes(kind) && <div className="ri-rank-results">{(results[kind.toLowerCase()] || []).map(item => { const entityKind={Players:"player",Teams:"team",Members:"member",Lists:"list"}[kind]; return <button key={`${entityKind}-${item.id}`} onClick={()=>{onClose();onOpenEntity(entityKind,item.id)}}><span><strong>{item.name || item.username || item.title}</strong><small>{item.sport || item.team || item.description || kind.slice(0,-1)}</small></span><ChevronRight size={17}/></button>})}</div>}
  </section></div>;
}

function EntityDetail({ detail, onClose, onOpenMatch, onOpenEntity, onChanged }) {
  const { kind, data } = detail;
  if (!data) return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-detail-sheet ri-entity-sheet" onClick={e=>e.stopPropagation()}><SheetHandle onClose={onClose}/><div className="ri-entity-loading">Loading profile…</div></section></div>;
  const entity = data[kind];
  const title = entity?.name || entity?.username || entity?.title;
  const subtitle = kind === "player" ? `${entity.sport} · ${entity.team_name || "Free agent"}` : kind === "team" ? `${entity.sport} · ${entity.country || "Global"}` : kind === "member" ? "RankIt member" : `Curated by @${entity.username}`;
  const matchesForEntity = (data.matches || []).map(fromApiMatch);
  const targetType = kind === "member" ? "user" : kind;
  const toggleFollow = async () => { await rankitApi.follow({target_type:targetType,target_id:entity.id,notify:false}); onChanged(kind,entity.id); };
  const toggleFavoriteEntity = async () => { await rankitApi.favorite({target_type:kind,target_id:entity.id}); onChanged(kind,entity.id); };
  return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-detail-sheet ri-entity-sheet" onClick={e=>e.stopPropagation()}>
    <SheetHandle onClose={onClose}/>
    <button className="ri-sheet-close" onClick={onClose}><X size={19}/></button>
    <div className="ri-entity-hero" style={{"--entity-color":entity?.color || entity?.team_color || "#FFB11B"}}>
      <div className="ri-entity-mark">{kind === "team" ? entity.short_name : title?.slice(0,2).toUpperCase()}</div>
      <div><small>{kind.toUpperCase()}</small><h2>{title}</h2><p>{subtitle}</p></div>
    </div>
    {kind !== "list" && <div className="ri-entity-actions"><button className={data.following?"active":""} onClick={toggleFollow}>{data.following?"Following":"Follow"}</button>{kind !== "member" && <button className={data.favorited?"active favourite":""} onClick={toggleFavoriteEntity}><Heart size={14} fill={data.favorited?"currentColor":"none"}/>{data.favorited?"Favourite":"Add favourite"}</button>}</div>}
    {kind === "player" && <div className="ri-entity-stats"><div><strong>{data.stats.potm_votes}</strong><span>POTM</span></div><div><strong>{data.stats.respect_votes}</strong><span>Respect</span></div><div><strong>{data.stats.appearances}</strong><span>Matches</span></div></div>}
    {kind === "member" && <div className="ri-entity-stats"><div><strong>{data.stats.matches}</strong><span>Matches</span></div><div><strong>{data.stats.classics}</strong><span>Classics</span></div><div><strong>{Number(data.stats.avg_rating || 0).toFixed(1)}</strong><span>Average</span></div></div>}
    {kind === "team" && <section className="ri-entity-section"><div className="ri-section-head"><div><small>SEASON SQUAD</small><h2>Players</h2></div></div><div className="ri-player-links">{data.players.slice(0,30).map(p=><button key={p.id} onClick={()=>onOpenEntity("player",p.id)}><b>{p.shirt_no || "—"}</b><span>{p.name}<small>{p.potm_votes} POTM · {p.respect_votes} Respect</small></span><ChevronRight size={14}/></button>)}</div></section>}
    {kind === "member" && <section className="ri-entity-section"><div className="ri-section-head"><div><small>RECENTLY</small><h2>Public diary</h2></div></div><div className="ri-member-diary">{data.entries.map(e=><button key={e.id} onClick={()=>onOpenMatch({id:e.match_id})}><strong>{e.home_short} · {e.away_short}</strong><Stars value={e.rating || 0} compact/><span>{e.review || e.watched_date}</span></button>)}</div></section>}
    {matchesForEntity.length > 0 && <section className="ri-entity-section"><div className="ri-section-head"><div><small>{kind === "list" ? "COLLECTION" : "MATCH HISTORY"}</small><h2>{kind === "list" ? `${matchesForEntity.length} matches` : "Recent matches"}</h2></div></div><div className="ri-entity-matches">{matchesForEntity.map(m=><button key={m.id} onClick={()=>onOpenMatch(m)}><div className="ri-mini-crests"><TeamMark team={m.home}/><TeamMark team={m.away}/></div><span><strong>{m.home.short} vs {m.away.short}</strong><small>{m.competition} · {m.date}</small></span><ChevronRight size={15}/></button>)}</div></section>}
  </section></div>;
}

function RankSheet({ onClose, onOpenMatch, catalog = matches }) {
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState(catalog.filter(m=>m.status==="finished"));
  const [loading, setLoading] = useState(false);
  useEffect(()=>{
    const timer=setTimeout(async()=>{
      setLoading(true);
      try {
        const data=query.trim().length>=2 ? await rankitApi.search(query.trim(),"Matches") : await rankitApi.catalog({status:"finished",limit:60});
        setFiltered((data.matches||[]).map(fromApiMatch));
      } finally { setLoading(false); }
    },180);
    return()=>clearTimeout(timer);
  },[query]);
  return <div className="ri-sheet-wrap" onClick={onClose}>
    <section className="ri-rank-sheet" onClick={e => e.stopPropagation()}>
      <SheetHandle onClose={onClose}/>
      <div className="ri-rank-head"><div><small>ADD TO YOUR DIARY</small><h2>Rank a match</h2></div><button onClick={onClose}><X size={20} /></button></div>
      <label className="ri-search"><Search size={17} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search teams or matches" /></label>
      <div className="ri-quick-date"><CalendarDays size={15} /> {loading ? "Searching all matches…" : query ? `${filtered.length} matches found` : "Recently played"}</div>
      <div className="ri-rank-results">
        {filtered.map(m => <button key={m.id} onClick={() => { onClose(); onOpenMatch(m); }}>
          <div className="ri-mini-crests"><TeamMark team={m.home} /><TeamMark team={m.away} /></div>
          <span><strong>{m.home.short} vs {m.away.short}</strong><small>{m.competition} · {m.date}</small></span>
          <ChevronRight size={17} />
        </button>)}
      </div>
    </section>
  </div>;
}

function MatchCardSkeleton({ featured = false }) {
  return <div className={`ri-match-skeleton${featured ? " featured" : ""}`} aria-hidden="true"><i/><div><span/><span/></div><b/><footer><span/><span/></footer></div>;
}

/* Kaydırılan bir şeridin AKTİF kartını izler ve o karta götürür.
   Noktalar eskiden `index===0`'a sabitti: üç kart arasında kaydırsan da ilk
   nokta yanık kalıyordu, yani gösterge yalan söylüyordu — ve tıklanamıyordu.
   Kaydırma pozisyonundan hesaplamak tek doğru kaynak: dokunmatik kaydırma,
   nokta tıklaması ve klavye aynı değeri üretiyor. */
function useCarousel(count) {
  const ref = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || count < 1) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const child = el.children[0];
      if (!child) return;
      // Adım = kart genişliği + aralık. Yüzde tabanlı sütunlarda sabit bir
      // sayı varsaymak yanlış olur, ölçerek alıyoruz.
      const step = child.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || 0);
      if (step <= 0) return;
      setIndex(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / step))));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    el.addEventListener("scroll", onScroll, { passive: true });
    read();
    return () => { el.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [count]);

  const goTo = i => {
    const el = ref.current;
    const child = el?.children[i];
    if (!el || !child) return;
    // Gösterge hemen ilerlesin: yumuşak kaydırmanın bitmesini beklemek noktayı
    // dokunuşun gerisinde bırakıyor, ve dinleyici rAF'a bağlı (arka plandayken
    // durur). Elle kaydırmada dinleyici bu değeri düzeltiyor.
    setIndex(i);
    el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  return { ref, index, goTo };
}

function HomeView({ sport, setSport, hideScores, setHideScores, onOpen, onOpenCompetition, onNavigate, catalog = matches, feed = activity, loading = false }) {
  const shown = useMemo(() => catalog.filter(m => sport === "All" || m.sport === sport), [sport, catalog]);
  const heroes = useMemo(() => shown.slice(0, 3), [shown]);
  const day = rankitDayContext();
  const carousel = useCarousel(loading ? 3 : heroes.length);
  return <>
    <div className="ri-home-controls">
      <div className="ri-sport-scroll">
        {SPORTS.map(s => <button key={s} className={sport === s ? "active" : ""} onClick={() => setSport(s)}>{s}</button>)}
      </div>
      <button className={`ri-hide-score${hideScores ? " active" : ""}`} onClick={() => setHideScores(v => !v)}>
        {hideScores ? <EyeOff size={15} /> : <Eye size={15} />} Hide scores
      </button>
    </div>
    <section className="ri-section">
      <div className="ri-section-head"><div><small>{day.eyebrow}</small><h2>{day.title}</h2></div><button onClick={() => onNavigate("Discover")}>See all</button></div>
      <div className="ri-hero-carousel" ref={carousel.ref}>{loading ? [0,1,2].map(i=><MatchCardSkeleton key={i} featured/>) : heroes.length ? heroes.map(m => <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={onOpen} onOpenCompetition={onOpenCompetition} featured />) : <div className="ri-day-empty"><CalendarDays size={20}/><strong>No {sport === "All" ? "matches" : sport.toLowerCase()} in this RankIt day</strong><span>11:00 today → 11:00 tomorrow</span></div>}</div>
      {heroes.length > 1 && <div className="ri-carousel-dots" role="tablist" aria-label="Tonight's matches">
        {heroes.map((match, index) => <button key={match.id} type="button" role="tab"
          aria-selected={carousel.index === index}
          aria-label={`Match ${index + 1} of ${heroes.length}`}
          className={carousel.index === index ? "active" : ""}
          onClick={() => carousel.goTo(index)} />)}
      </div>}
    </section>
    <section className="ri-section ri-friends-preview">
      <div className="ri-section-head"><div><small>POPULAR ACROSS RANKIT</small><h2>Community reviews</h2></div><button onClick={() => onNavigate("Activity")}>Activity</button></div>
      {feed.slice(0, 2).map(a => <div className="ri-activity-row" key={`${a.user}-${a.id || a.match?.id}`}>
        <div className="ri-avatar">{a.initials}</div><div><p><strong>{a.user}</strong> {a.action} <b>{a.match.home.short}–{a.match.away.short}</b></p><Stars value={a.rating || 0} compact /><span>{a.text}</span></div>
      </div>)}
    </section>
  </>;
}

function DiscoverView({ hideScores, onOpen, onOpenCompetition, catalog = matches, meta, listCatalog = [], onCreateList, onOpenList }) {
  const [sportFilter, setSportFilter] = useState(() => {
    try {
      const saved = localStorage.getItem("rankit:discover-sport");
      return ["All", "Basketball", "Football"].includes(saved) ? saved : "All";
    } catch { return "All"; }
  });
  const [competition, setCompetition] = useState("All");
  const [season, setSeason] = useState("All");
  const [status, setStatus] = useState("All");
  const [pageCatalog, setPageCatalog] = useState(catalog);
  const [total, setTotal] = useState(catalog.length);
  const [loading, setLoading] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const competitions = (meta?.competitions || []).filter(c => sportFilter === "All" || c.sport === sportFilter);
  useEffect(() => {
    try { localStorage.setItem("rankit:discover-sport", sportFilter); } catch { /* depolama kapalıysa filtre yine çalışır */ }
  }, [sportFilter]);
  const load = async (append = false) => {
    setLoading(true);
    const offset = append ? pageCatalog.length : 0;
    const data = await rankitApi.catalog({ sport: sportFilter, competition, season, status: status === "All" ? "All" : status.toLowerCase(), limit: 60, offset });
    setPageCatalog(v => append ? [...v, ...(data.matches || []).map(fromApiMatch)] : (data.matches || []).map(fromApiMatch));
    setTotal(data.total || 0); setLoading(false);
  };
  useEffect(() => { load(false).catch(()=>setLoading(false)); }, [sportFilter, competition, season, status]);
  const clearFilters = () => { setSportFilter("All"); setCompetition("All"); setSeason("All"); setStatus("All"); setRefineOpen(false); };
  const activeFilterCount = [sportFilter,competition,season,status].filter(x=>x!=="All").length;
  const refinementCount = [competition, season].filter(x => x !== "All").length;
  const refinementSummary = [competition !== "All" ? competition : null, season !== "All" ? season : null].filter(Boolean).join(" · ") || "All seasons and competitions";
  const smartCatalog = useMemo(() => [...pageCatalog].sort((a, b) => {
    const statusRank = { live: 0, upcoming: 1, finished: 2 };
    const aStatus = String(a.status || "upcoming").toLowerCase();
    const bStatus = String(b.status || "upcoming").toLowerCase();
    const statusDiff = (statusRank[aStatus] ?? 3) - (statusRank[bStatus] ?? 3);
    if (statusDiff) return statusDiff;
    if (aStatus === "finished") {
      const popularity = m => (Number(m.ratings || m.rating_count) || 0) * 3 + (Number(m.reviewCount || m.review_count) || 0) * 2 + (Number(m.communityRating || m.community_rating) || 0);
      return popularity(b) - popularity(a);
    }
    const timeOf = m => {
      const parsed = new Date(m.starts_at || m.date).getTime();
      return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
    };
    return timeOf(a) - timeOf(b);
  }), [pageCatalog]);
  return <><div className="ri-page-title"><small>FIND YOUR NEXT MATCH</small><h1>Discover</h1></div>
    <div className={`ri-filter-panel ri-filter-redesign${refineOpen ? " is-open" : ""}`}>
      <div className="ri-filter-heading"><div><small>QUICK FILTERS</small><strong>{loading ? "Updating matches…" : `${total} matches`}</strong></div>{activeFilterCount>0&&<button className="ri-filter-reset" onClick={clearFilters}><RotateCcw size={12}/> Clear {activeFilterCount}</button>}</div>
      <div className="ri-filter-group"><span>SPORT</span><div className="ri-filter-pills">{["All","Basketball","Football"].map(s=><button key={s} className={sportFilter===s?"active":""} onClick={()=>{setSportFilter(s);setCompetition("All")}}>{s}</button>)}</div></div>
      <div className="ri-filter-group"><span>STATUS</span><div className="ri-filter-pills">{["All","Live","Upcoming","Finished"].map(s=><button key={s} className={status===s?"active":""} onClick={()=>setStatus(s)}>{s}</button>)}</div></div>
      <button className="ri-refine-trigger" aria-expanded={refineOpen} onClick={()=>setRefineOpen(v=>!v)}>
        <span className="ri-refine-icon"><SlidersHorizontal size={16}/></span><span><strong>Season & competition</strong><small>{refinementSummary}</small></span>{refinementCount>0&&<b>{refinementCount}</b>}<ChevronDown className="ri-refine-chevron" size={16}/>
      </button>
      <div className="ri-refine-collapse" aria-hidden={!refineOpen}><div><div className="ri-catalog-selects">
        <label><span>SEASON</span><select value={season} onChange={e=>{setSeason(e.target.value);setCompetition("All")}}><option value="All">All seasons</option>{(meta?.seasons||[]).map(s=><option key={s} value={s}>{s}</option>)}</select></label>
        <label><span>COMPETITION</span><select value={competition} onChange={e=>setCompetition(e.target.value)}><option value="All">All competitions</option>{competitions.filter(c=>season==="All"||c.season===season).map(c=><option key={`${c.sport}-${c.name}-${c.season}`} value={c.name}>{c.name} · {c.season}</option>)}</select></label>
      </div></div></div>
    </div>
    <section className="ri-section"><div className="ri-section-head"><div><small>COMMUNITY PICKS</small><h2>Popular this week</h2></div></div>
      <div className="ri-discover-grid">{smartCatalog.map(m => <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={onOpen} onOpenCompetition={onOpenCompetition} />)}</div>
      {pageCatalog.length < total && <button className="ri-load-more" disabled={loading} onClick={()=>load(true)}>{loading?"Loading…":`Load more · ${pageCatalog.length}/${total}`}</button>}
    </section>
    <section className="ri-section"><div className="ri-section-head"><div><small>CURATED BY MEMBERS</small><h2>Popular lists</h2></div><button onClick={onCreateList}>Create</button></div>
      <div className="ri-list-row">{(listCatalog.length ? listCatalog : lists).map((l, index) => <button key={l.id || l.title} onClick={()=>l.id && onOpenList(l.id)} style={{"--list-accent":l.accent || ["#FFB11B","#3FB08C","#7B61FF"][index%3]}}><div className="ri-list-cover"><i/><i/><i/><i/></div><ListPlus size={18}/><strong>{l.title}</strong><span>{l.match_count ?? l.count ?? 0} matches · @{l.username || "member"}</span></button>)}</div>
    </section></>;
}

function ListCreator({ catalog, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [ranked, setRanked] = useState(false);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const toggle = id => setSelected(v => v.includes(id) ? v.filter(x=>x!==id) : [...v,id]);
  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await rankitApi.createList({ title: title.trim(), description: "Created in RankIt", ranked, visibility: "public", match_ids: selected });
    await onCreated(); onClose();
  };
  return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-rank-sheet" onClick={e=>e.stopPropagation()}><SheetHandle onClose={onClose}/><div className="ri-rank-head"><div><small>YOUR COLLECTION</small><h2>Create a list</h2></div><button onClick={onClose}><X size={20}/></button></div><label className="ri-search"><ListPlus size={17}/><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="List title"/></label><label className="ri-check"><input type="checkbox" checked={ranked} onChange={e=>setRanked(e.target.checked)}/> Ranked list</label><div className="ri-rank-results">{catalog.map(m=><button key={m.id} className={selected.includes(m.id)?"selected":""} onClick={()=>toggle(m.id)}><div className="ri-mini-crests"><TeamMark team={m.home}/><TeamMark team={m.away}/></div><span><strong>{m.home.short} vs {m.away.short}</strong><small>{m.competition}</small></span><b>{selected.includes(m.id)?"✓":"+"}</b></button>)}</div><button className="ri-review-cta" disabled={saving || !title.trim()} onClick={save}>{saving?"Creating…":"Create list"}</button></section></div>;
}

function ActivityView({ diaryEntries = [], watchlist = [], listCatalog = [], friendFeed = [], onOpen, onOpenCompetition, onOpenList }) {
  const [sub, setSub] = useState(() => { try { return localStorage.getItem("rankit:activity-tab") || "Friends"; } catch { return "Friends"; } });
  const [diaryView, setDiaryView] = useState("Timeline");
  const [filter, setFilter] = useState("Watched");
  const [watchSort, setWatchSort] = useState("Match date");
  const diaryRows = diaryEntries.length ? diaryEntries : matches.filter(m=>m.status==="finished").map(m=>({
    id:m.id,match_id:m.id,watched_date:m.date.split(" · ")[0],rating:m.id.includes?.("fcb")?5:4,classic:m.id.includes?.("fcb")?1:0,
    home_short:m.home.short,home_name:m.home.name,home_color:m.home.color,away_short:m.away.short,away_name:m.away.name,away_color:m.away.color,
    home_score:Number(m.score?.split("–")[0]),away_score:Number(m.score?.split("–")[1]),competition:m.competition,sport:m.sport,
  }));
  const filteredDiary = filter === "Classics" ? diaryRows.filter(e=>e.classic) : diaryRows;
  const sortedWatchlist = useMemo(() => [...watchlist].sort((a,b) => watchSort === "Competition" ? a.competition.localeCompare(b.competition) : watchSort === "Added" ? Number(b.id)-Number(a.id) : new Date(a.starts_at)-new Date(b.starts_at)), [watchlist,watchSort]);
  useEffect(()=>{ try { localStorage.setItem("rankit:activity-tab",sub); } catch { /* tercih opsiyonel */ } },[sub]);
  const heatDays = Array.from({length:28},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-(27-i)); const key=d.toISOString().slice(0,10); return diaryRows.filter(e=>e.watched_date===key).length; });
  return <><div className="ri-page-title"><small>YOUR SPORTING LIFE</small><h1>Activity</h1></div>
    <div className="ri-segment"><button className={sub === "Friends" ? "active" : ""} onClick={() => setSub("Friends")}>Friends</button><button className={sub === "Diary" ? "active" : ""} onClick={() => setSub("Diary")}>Diary</button></div>
    {sub === "Friends" ? <div className="ri-activity-list">{friendFeed.map(a => <article key={a.id || `${a.user}-${a.match.id}`} onClick={()=>onOpen(a.match)}><div className="ri-avatar">{a.initials}</div><div className="ri-feed-copy"><p><strong>{a.user}</strong> {a.action}</p><h3>{a.match.home.name || a.match.home.short} <span>vs</span> {a.match.away.name || a.match.away.short}</h3><Stars value={a.rating || 0} compact /><blockquote>"{a.text}"</blockquote><small><MessageCircle size={12}/> Open match</small></div></article>)}{!friendFeed.length && <div className="ri-empty-state"><Users size={22}/><strong>No activity yet</strong><span>Follow members to build your feed.</span></div>}</div>
      : <div className="ri-diary"><div className="ri-diary-toolbar"><div className="ri-diary-filters">{["Watched","Watchlist","Classics","Lists"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div>{filter !== "Lists" && <div className="ri-view-toggle"><button className={diaryView==="Timeline"?"active":""} onClick={()=>setDiaryView("Timeline")}><List size={14}/></button><button className={diaryView==="Cards"?"active":""} onClick={()=>setDiaryView("Cards")}><LayoutGrid size={14}/></button></div>}</div>
      {filter === "Watchlist" ? <><label className="ri-watch-sort"><span>SORT WATCHLIST</span><select value={watchSort} onChange={e=>setWatchSort(e.target.value)}><option>Match date</option><option>Added</option><option>Competition</option></select></label><div className="ri-discover-grid">{sortedWatchlist.map(m=><MatchCard key={m.id} match={m} hideScores={false} onOpen={onOpen} onOpenCompetition={onOpenCompetition}/>)}</div></>
      : filter === "Lists" ? <div className="ri-list-stack">{listCatalog.map(l=><article key={l.id} onClick={()=>onOpenList(l.id)}><ListPlus size={18}/><div><strong>{l.title}</strong><span>{l.match_count} matches · {l.ranked?"Ranked":"Unranked"}</span></div></article>)}</div>
      : diaryView === "Timeline" ? <><div className="ri-diary-heat"><header><span>LAST 28 DAYS</span><strong>{heatDays.reduce((a,n)=>a+n,0)} watched</strong></header><div>{heatDays.map((n,i)=><i key={i} data-level={Math.min(3,n)}/>)}</div></div>{filteredDiary.map((e,index)=>{const month=new Date(`${e.watched_date}T12:00:00`).toLocaleDateString("en-GB",{month:"long",year:"numeric"});const prev=index?new Date(`${filteredDiary[index-1].watched_date}T12:00:00`).toLocaleDateString("en-GB",{month:"long",year:"numeric"}):null;return <div key={e.id}>{month!==prev&&<div className="ri-diary-group"><span>{e.competition}</span><strong>{month}</strong></div>}<div className="ri-diary-row" onClick={()=>onOpen({id:e.match_id})}><span className="ri-diary-date">{e.watched_date}</span><div className="ri-mini-crests"><TeamMark team={{short:e.home_short,color:e.home_color}}/><TeamMark team={{short:e.away_short,color:e.away_color}}/></div><div><strong>{e.home_short} vs {e.away_short}</strong><small>{e.home_score} - {e.away_score} · {e.competition}</small></div><Stars value={e.rating||0} compact/></div></div>})}</>
      : <div className="ri-diary-cards">{filteredDiary.map(e=><div role="button" tabIndex={0} aria-label={`Open ${e.home_short} vs ${e.away_short}`} onClick={()=>onOpen({id:e.match_id})} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onOpen({id:e.match_id})}}} key={e.id} style={{"--card-a":e.home_color,"--card-b":e.away_color}}><small>{e.competition}</small><strong>{e.home_short}</strong><b>{e.sport==="Basketball"?<>{e.home_score}<br/>{e.away_score}</>:<>{e.home_score} – {e.away_score}</>}</b><strong>{e.away_short}</strong><Stars value={e.rating||0} compact/><ClassicStamp active={!!e.classic} small/></div>)}</div>}</div>}
  </>;
}

function ProfileView({ profileData, diaryEntries = [], onOpen }) {
  const stats = profileData?.stats || {};
  const username = profileData?.user?.username || "gokdeniz";
  const initials = username.slice(0, 2).toUpperCase();
  const favourites = (profileData?.favorite_matches || []).map(fromApiMatch);
  const sports=[...new Set(diaryEntries.map(entry=>entry.sport))].filter(Boolean);
  const recentClassics=diaryEntries.filter(entry=>entry.classic).slice(0,3);
  return <><div className="ri-profile-head"><div className="ri-profile-avatar">{initials}</div><div><small>@{username}</small><h1>{username}</h1><p>Basketball nights, European football and the occasional instant classic.</p></div></div>
    <div className="ri-profile-taste">{sports.map(sport=><span key={sport}>{sport}</span>)}{recentClassics.map(entry=><b key={entry.id}>CLASSIC · {entry.home_short}–{entry.away_short}</b>)}</div>
    <div className="ri-profile-stats"><div><strong>{stats.matches ?? 0}</strong><span>matches</span></div><div><strong>{stats.classics ?? 0}</strong><span>classics</span></div><div><strong>{stats.diary_count ?? 0}</strong><span>diary entries</span></div><div><strong>{stats.watchlist ?? 0}</strong><span>watchlist</span></div><div><strong>{stats.favorites ?? 0}</strong><span>favourites</span></div><div><strong>{stats.lists ?? 0}</strong><span>lists</span></div></div>
    <section className="ri-section"><div className="ri-section-head"><div><small>TASTE ON DISPLAY</small><h2>Four favourites</h2></div></div>{favourites.length ? <div className="ri-favourites">{favourites.map(m=><div key={m.id} onClick={()=>onOpen(m)} style={{"--fav-a":m.home.color,"--fav-b":m.away.color}}><span>{m.home.short}</span><b>VS</b><span>{m.away.short}</span></div>)}</div> : <div className="ri-empty-state"><Heart size={22}/><strong>No favourites yet</strong><span>Favourite a match to display your taste.</span></div>}</section>
    <section className="ri-section"><div className="ri-section-head"><div><small>RECENTLY</small><h2>Your latest rankings</h2></div></div>{diaryEntries.slice(0,6).map(e=><div className="ri-profile-log" key={e.id} onClick={()=>onOpen({id:e.match_id})}><strong>{e.home_short} - {e.away_short}</strong><Stars value={e.rating || 0} compact/>{!!e.classic && <ClassicStamp active small/>}</div>)}{!diaryEntries.length && <div className="ri-empty-state"><CalendarDays size={22}/><strong>Your diary is empty</strong><span>Rank a finished match to begin.</span></div>}</section>
  </>;
}

export default function RankItPrototype({ nativeBack = false }) {
  const [tab, setTab] = useState("Home");
  const [sport, setSport] = useState("All");
  const [hideScores, setHideScores] = useState(() => { try { return localStorage.getItem("rankit:hide-scores") === "true"; } catch { return false; } });
  const [detail, setDetail] = useState(null);
  const [competitionDetail, setCompetitionDetail] = useState(null);
  const [entityDetail, setEntityDetail] = useState(null);
  const [rankOpen, setRankOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [listCreatorOpen, setListCreatorOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [catalog, setCatalog] = useState(matches);
  const [feed, setFeed] = useState(activity);
  const [apiError, setApiError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [networkState, setNetworkState] = useState(() => navigator.onLine ? "online" : "offline");
  const [tabDirection, setTabDirection] = useState(1);
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const [listCatalog, setListCatalog] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [catalogMeta, setCatalogMeta] = useState(null);
  const [exitNotice, setExitNotice] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const exitArmedRef = useRef(false);
  const exitTimerRef = useRef(null);
  const lastScrollRef = useRef(0);
  const backStateRef = useRef(null);
  backStateRef.current = { detail, competitionDetail, entityDetail, rankOpen, searchOpen, searchExpanded, listCreatorOpen, notificationOpen, tab };

  useEffect(() => {
    if (!nativeBack) return undefined;
    let handle;
    let active = true;
    CapacitorApp.addListener("backButton", () => {
      const state = backStateRef.current;
      if (state.listCreatorOpen) setListCreatorOpen(false);
      else if (state.notificationOpen) setNotificationOpen(false);
      else if (state.competitionDetail) setCompetitionDetail(null);
      else if (state.rankOpen) setRankOpen(false);
      else if (state.searchOpen) setSearchOpen(false);
      else if (state.detail) setDetail(null);
      else if (state.entityDetail) setEntityDetail(null);
      else if (state.searchExpanded) setSearchExpanded(false);
      else if (state.tab !== "Home") { setTabDirection(-1); setTab("Home"); }
      else if (exitArmedRef.current) CapacitorApp.exitApp();
      else {
        exitArmedRef.current = true;
        setExitNotice(true);
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => { exitArmedRef.current = false; setExitNotice(false); }, 1800);
      }
    }).then(listener => {
      if (active) handle = listener;
      else listener.remove();
    });
    return () => { active = false; handle?.remove(); clearTimeout(exitTimerRef.current); };
  }, [nativeBack]);
  useEffect(()=>{ try { localStorage.setItem("rankit:hide-scores",String(hideScores)); } catch { /* tercih opsiyonel */ } },[hideScores]);
  useEffect(() => {
    const offline = () => setNetworkState("offline");
    const reconnect = () => setNetworkState("reconnecting");
    const network = event => setNetworkState(event.detail);
    window.addEventListener("offline", offline);
    window.addEventListener("online", reconnect);
    window.addEventListener("rankit:network", network);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", reconnect); window.removeEventListener("rankit:network", network); };
  }, []);
  const refreshCollections = async () => {
    const [listData, watchData] = await Promise.all([rankitApi.lists(), rankitApi.watchlist()]);
    setListCatalog(listData.lists || []);
    setWatchlist((watchData.matches || []).map(fromApiMatch));
  };
  const refreshPersonal = async () => {
    const [diary, profile, home] = await Promise.all([rankitApi.diary(), rankitApi.profile(), loadRankitHome("All")]);
    setDiaryEntries(diary.entries || []);
    setProfileData(profile);
    setCatalog((home.matches || []).map(fromApiMatch));
  };
  useEffect(() => {
    loadRankitHome("All").then(data => {
      setCatalog((data.matches || []).map(fromApiMatch));
      setFeed((data.activity || []).map(a => ({
        id: a.id, user: a.username, initials: a.username?.slice(0,2).toUpperCase(), action: "reviewed",
        match: { id: a.match_id, home: { short: a.home_short, name:a.home_name }, away: { short: a.away_short, name:a.away_name } }, rating: a.rating, text: a.review,
      })));
      setApiError("");
    }).catch(e => setApiError(e.message)).finally(() => setInitialLoading(false));
    rankitApi.diary().then(d=>setDiaryEntries(d.entries||[])).catch(()=>{});
    rankitApi.profile().then(setProfileData).catch(()=>{});
    rankitApi.meta().then(setCatalogMeta).catch(()=>{});
    refreshCollections().catch(()=>{});
  }, []);
  useEffect(() => {
    const refreshVisibleMatches = () => {
      loadRankitHome("All").then(data => setCatalog((data.matches || []).map(fromApiMatch))).catch(()=>{});
      if (detail?.id) rankitApi.match(detail.id).then(data => setDetail(fromApiMatch(data))).catch(()=>{});
    };
    const interval = setInterval(refreshVisibleMatches, 15 * 60 * 1000);
    const onVisibility = () => { if (document.visibilityState === "visible") refreshVisibleMatches(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, [detail?.id]);
  const openMatch = async match => {
    setEntityDetail(null);
    const hasPreview = !!(match?.home && match?.away);
    setDetail(hasPreview ? match : { id: match?.id, _loading: true });
    try { setDetail(fromApiMatch(await rankitApi.match(match.id))); }
    catch (error) {
      if (!hasPreview) setDetail(null);
      setApiError(error.message || "Could not load this match");
    }
  };
  const openCompetition = async competitionId => {
    if (!competitionId) return;
    setCompetitionDetail({ id: competitionId, data: null });
    try { setCompetitionDetail({ id: competitionId, data: await rankitApi.competition(competitionId) }); }
    catch (error) {
      setCompetitionDetail(null);
      setApiError(error.message || "Could not load competition");
    }
  };
  const openEntity = async (kind, id) => {
    setEntityDetail({ kind, data: null });
    try {
      const loader = kind === "list" ? rankitApi.list : kind === "member" ? rankitApi.member : kind === "team" ? rankitApi.team : rankitApi.player;
      setEntityDetail({ kind, data: await loader(id) });
    } catch (error) {
      setEntityDetail(null);
      setApiError(error.message);
    }
  };
  const saveMatchLog = async ({ diary, matchId, potmId, respectIds }) => {
    await rankitApi.log(diary);
    await Promise.all([
      potmId ? rankitApi.potm(matchId, potmId) : Promise.resolve(),
      rankitApi.respect(matchId, respectIds || []),
    ]);
    const [, updatedMatch] = await Promise.all([refreshPersonal(), rankitApi.match(matchId)]);
    setDetail(fromApiMatch(updatedMatch));
  };
  const refreshDetail = async () => {
    if (detail?.id) setDetail(fromApiMatch(await rankitApi.match(detail.id)));
  };
  const toggleWatchlist = async id => {
    const result = await rankitApi.toggleWatchlist(id);
    rankitHaptics.success();
    refreshCollections().catch(() => {});
    return result;
  };
  const toggleFavorite = async value => {
    const result = await rankitApi.favorite(value);
    rankitHaptics.success();
    rankitApi.profile().then(setProfileData).catch(() => {});
    return result;
  };
  const handleMainScroll = event => {
    const next = event.currentTarget.scrollTop;
    const delta = next - lastScrollRef.current;
    if (next < 14) setHeaderHidden(false);
    else if (delta > 7) setHeaderHidden(true);
    else if (delta < -7) setHeaderHidden(false);
    lastScrollRef.current = next;
  };
  return <div className={`rankit-app${headerHidden ? " header-hidden" : ""}`}>
    <header className="ri-header"><div className="ri-brand"><RankItMark size={29}/><div><strong>RANKIT</strong><small>BY PRIMARY ARCH</small></div></div><button aria-label="Open notifications" onClick={()=>setNotificationOpen(true)}><Bell size={19}/><i/></button></header>
    <main className="ri-main" onScroll={handleMainScroll}>
      {networkState !== "online" && <div className={`ri-network-note ${networkState}`}><i/>{networkState === "reconnecting" ? "Reconnecting…" : "Offline · showing your latest saved content"}</div>}
      {apiError && networkState === "online" && <div className="ri-api-note">Could not refresh · {apiError}</div>}
      <div key={tab} className={`ri-tab-stage ${tabDirection > 0 ? "forward" : "backward"}`}>
        {tab === "Home" && (
          <HomeView sport={sport} setSport={setSport} hideScores={hideScores} setHideScores={setHideScores} onOpen={openMatch} onOpenCompetition={openCompetition} onNavigate={name=>{setTabDirection(TABS.findIndex(x=>x[0]===name)-TABS.findIndex(x=>x[0]===tab));setTab(name)}} catalog={catalog} feed={feed} loading={initialLoading}/>
        )}
        {tab === "Discover" && (
          <DiscoverView hideScores={hideScores} onOpen={openMatch} onOpenCompetition={openCompetition} catalog={catalog} meta={catalogMeta} listCatalog={listCatalog} onCreateList={()=>setListCreatorOpen(true)} onOpenList={id=>openEntity("list",id)}/>
        )}
        {tab === "Activity" && (
          <ActivityView diaryEntries={diaryEntries} watchlist={watchlist} listCatalog={listCatalog} friendFeed={feed} onOpen={openMatch} onOpenCompetition={openCompetition} onOpenList={id=>openEntity("list",id)}/>
        )}
        {tab === "Profile" && (
          <ProfileView profileData={profileData} diaryEntries={diaryEntries} onOpen={openMatch}/>
        )}
      </div>
    </main>
    {!detail && !competitionDetail && !entityDetail && !rankOpen && !searchOpen && <form className={`ri-floating-search${searchExpanded ? " expanded" : ""}`} onSubmit={e=>{e.preventDefault();setSearchOpen(true);setSearchExpanded(false)}}>
      <button type="button" aria-label="Open global search" onClick={()=>{if(searchExpanded&&quickSearch.trim()){setSearchOpen(true);setSearchExpanded(false)}else setSearchExpanded(true)}}><Search size={21}/></button>
      <input value={quickSearch} onChange={e=>setQuickSearch(e.target.value)} onFocus={()=>setSearchExpanded(true)} placeholder="Search RankIt…" aria-label="Search RankIt"/>
    </form>}
    <nav className="ri-bottom-nav">{TABS.map(([name, Icon], index) => <button key={name} className={`${tab === name ? "active" : ""}${name === "Rank" ? " rank" : ""}`} onClick={() => { if(name === "Rank") setRankOpen(true); else if(name !== tab) { setTabDirection(index-TABS.findIndex(x=>x[0]===tab)); setTab(name); } }}><span><Icon size={name === "Rank" ? 25 : 20}/></span><small>{name}</small></button>)}</nav>
    {detail?._loading ? (
      <MatchDetailLoading onClose={() => setDetail(null)}/>
    ) : detail && (
      <MatchDetail match={detail} hideScores={hideScores} onClose={() => setDetail(null)} onSave={saveMatchLog} onToggleWatchlist={toggleWatchlist} onToggleFavorite={toggleFavorite} onRefresh={refreshDetail}/>
    )}
    {competitionDetail && <CompetitionDetail detail={competitionDetail.data} onClose={()=>setCompetitionDetail(null)} onOpenMatch={openMatch} onOpenPlayer={id=>openEntity("player",id)}/>}
    {entityDetail && <EntityDetail detail={entityDetail} onClose={()=>setEntityDetail(null)} onOpenMatch={openMatch} onOpenEntity={openEntity} onChanged={openEntity}/>} 
    {rankOpen && <RankSheet catalog={catalog} onOpenMatch={openMatch} onClose={() => setRankOpen(false)}/>} 
    {searchOpen && <GlobalSearch initialQuery={quickSearch} onClose={() => setSearchOpen(false)} onOpenMatch={openMatch} onOpenEntity={openEntity}/>} 
    {listCreatorOpen && <ListCreator catalog={catalog} onClose={()=>setListCreatorOpen(false)} onCreated={refreshCollections}/>} 
    {notificationOpen && (
      <NotificationCenter feed={feed} watchlist={watchlist} onClose={()=>setNotificationOpen(false)} onOpenMatch={openMatch}/>
    )}
    {exitNotice && <div role="status" className="ri-action-toast success">Press back again to exit</div>}
  </div>;
}
