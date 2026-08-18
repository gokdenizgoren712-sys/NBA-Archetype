import { useEffect, useMemo, useState } from "react";
import {
  Bell, Bookmark, CalendarDays, ChevronLeft, ChevronRight, CircleUserRound,
  Compass, Eye, EyeOff, Home, LayoutGrid, List, ListPlus, MessageCircle, Plus, Search,
  Heart, Radio, Send, Star, ThumbsUp, Trophy, Users, X,
} from "lucide-react";
import { activity, lists, matches } from "./mockData";
import { rankitApi } from "./rankitApi";
import "./rankit.css";

const SPORTS = ["All", "Basketball", "Football", "Olympics"];
const TABS = [
  ["Home", Home], ["Discover", Compass], ["Rank", Plus], ["Activity", Users], ["Profile", CircleUserRound],
];

function fromApiMatch(m) {
  if (!m) return m;
  const when = new Date(m.starts_at);
  const fullDate = Number.isNaN(when.getTime()) ? m.starts_at : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: m.provider === "nba" ? "UTC" : undefined,
  }).format(when);
  const time = Number.isNaN(when.getTime()) || m.provider === "nba" ? "" : new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit",
  }).format(when);
  return {
    ...m,
    date: `${fullDate}${time ? ` · ${time}` : ""}`,
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

function RankItMark({ size = 28 }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="RankIt">
    <polygon points="24,3 34.5,5.8 42.2,13.5 45,24 42.2,34.5 34.5,42.2 24,45 13.5,42.2 5.8,34.5 3,24 5.8,13.5 13.5,5.8" stroke="#FFB11B" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M16 35V13h10.2c6 0 9.4 3.2 9.4 8.2 0 3.7-2 6.4-5.4 7.5L36 35h-6.6l-7-8.3h3.3c2.7 0 4.2-1.7 4.2-4.7 0-2.8-1.6-4.3-4.5-4.3h-3.7V35H16Z" fill="url(#rankit-r)"/>
    <defs><linearGradient id="rankit-r" x1="16" y1="13" x2="36" y2="35"><stop stopColor="#FFE09A"/><stop offset="1" stopColor="#FFB11B"/></linearGradient></defs>
  </svg>;
}

function Stars({ value = 0, onChange, compact = false }) {
  return <div className={`ri-stars${compact ? " compact" : ""}`} aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} onClick={() => onChange?.(n)} className={n <= value ? "on" : ""} aria-label={`${n} stars`}>
        <Star size={compact ? 13 : 26} fill={n <= value ? "currentColor" : "none"} />
      </button>
    ))}
  </div>;
}

function ClassicStamp({ active, onClick, small = false }) {
  return <button className={`ri-classic${active ? " active" : ""}${small ? " small" : ""}`} onClick={onClick}>
    <span>CLASSIC</span><small>RANKIT SELECT</small>
  </button>;
}

function TeamMark({ team }) {
  return <div className="ri-team-mark" style={{ "--team": team.color }}><span>{team.short}</span></div>;
}

function ScoreValue({ match, detail = false }) {
  if (match.status !== "finished") return <>VS</>;
  const parts = match.score.split(/\s*[–-]\s*/);
  if (match.sport === "Basketball" && parts.length === 2) {
    return <span className={`ri-basket-score${detail ? " detail" : ""}`}><b>{parts[0]}</b><b>{parts[1]}</b></span>;
  }
  return <>{match.score}</>;
}

function MatchCard({ match, hideScores, onOpen, featured = false }) {
  const finished = match.status === "finished";
  return <article className={`ri-match-card${featured ? " featured" : ""}${match.instantClassic ? " instant" : ""}`} onClick={() => onOpen(match)} style={{ "--home": match.home.color, "--away": match.away.color }}>
    <div className="ri-card-holo" />
    <div className="ri-match-top">
      <span>{match.instantClassic ? "INSTANT CLASSIC" : match.competition}</span>
      {finished ? <span className="ri-community-rating"><Star size={11} fill="currentColor" /> {match.communityRating}</span> : <span className="ri-live-date">{match.date}</span>}
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
        <div className="ri-versus"><small>{match.editorial ? "FEATURED MATCH" : match.date}</small><strong>VS</strong></div>
      )}
      <div className="ri-team-side away"><TeamMark team={match.away} /></div>
    </div>

    <div className="ri-score-band">
      <div><strong>{match.home.short}</strong><small>{match.home.name}</small></div>
      <div className={`ri-score${hideScores && finished ? " hidden" : ""}`}>
        {finished ? <ScoreValue match={match}/> : "—"}
      </div>
      <div><strong>{match.away.short}</strong><small>{match.away.name}</small></div>
    </div>

    <div className="ri-match-foot">
      <span>{finished ? `${match.ratings.toLocaleString()} ratings · ${match.reviewCount ?? 0} reviews` : `Watch on ${match.broadcaster}`}</span>
      <span>{finished && match.dominantTag ? match.dominantTag : match.date}</span>
    </div>
  </article>;
}

function MatchDetail({ match, hideScores, onClose, onSave, onToggleWatchlist, onToggleFavorite, onRefresh }) {
  const [rating, setRating] = useState(match.status === "finished" ? 4 : 0);
  const [classic, setClassic] = useState(false);
  const [watchlist, setWatchlist] = useState(!!match.watchlisted);
  const [favorited, setFavorited] = useState(!!match.favorited);
  const [section, setSection] = useState("Match");
  const [tags, setTags] = useState([]);
  const [respect, setRespect] = useState([]);
  const [potmId, setPotmId] = useState(match.potm?.id || null);
  const [review, setReview] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const tagOptions = match.sport === "Football"
    ? ["Nail-biter", "Great Atmosphere", "Comeback", "Penalty Drama", "Goal Fest"]
    : ["Nail-biter", "Great Atmosphere", "Comeback", "Overtime", "Clutch Performance"];
  const respectOptions = match.sport === "Football"
    ? ["Declan Rice", "Vinícius Jr.", "Martin Ødegaard"]
    : ["Jayson Tatum", "Josh Hart", "Derrick White"];
  const playerOptions = match.players || [];
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
        diary: { match_id: match.id, watched_date: new Date().toISOString().slice(0, 10), rating, review, classic, tags, visibility: "public" },
        matchId: match.id, potmId, respectIds: respect,
      });
      setSaveState("saved");
    } catch { setSaveState("error"); }
  };
  const toggleWatchlist = async () => {
    const result = await onToggleWatchlist(match.id);
    setWatchlist(result.watchlisted);
  };
  const toggleFavorite = async () => {
    const result = await onToggleFavorite({ target_type: "match", target_id: match.id });
    setFavorited(result.favorited);
  };
  return <div className="ri-sheet-wrap" onClick={onClose}>
    <section className="ri-detail-sheet" onClick={e => e.stopPropagation()}>
      <button className="ri-sheet-close" onClick={onClose}><X size={19} /></button>
      <div className="ri-detail-kicker">{match.competition}</div>
      <div className="ri-detail-teams">
        <TeamMark team={match.home} />
        <div><small>{match.date}</small><strong className={hideScores && match.status === "finished" ? "ri-blur" : ""}><ScoreValue match={match} detail/></strong></div>
        <TeamMark team={match.away} />
      </div>
      <h2>{match.home.name} vs {match.away.name}</h2>
      <div className="ri-detail-tabs"><button className={section === "Match" ? "active" : ""} onClick={() => setSection("Match")}>Match</button><button className={section === "Community" ? "active" : ""} onClick={() => setSection("Community")}>Community</button></div>
      {section === "Match" ? <>
        {match.summary && <p className="ri-summary">{match.summary}</p>}
        <div className="ri-broadcast"><small>WATCH IN TÜRKİYE</small><strong>{match.broadcaster}</strong><span>{match.status === "finished" ? "Broadcast information for this match" : "Coverage starts 15 min before the match"}</span></div>
        <div className="ri-timeline"><small>MATCH</small><div><span>{match.status === "finished" ? "FT" : match.date}</span><strong>{match.status === "finished" ? "Full time" : "Scheduled"}</strong></div><button onClick={() => setSection("Community")}>Community <ChevronRight size={14}/></button></div>
        {playerOptions.length > 0 && <div className="ri-squad-preview"><div className="ri-chip-title">SEASON SQUADS <span>{playerOptions.length}</span></div><div>{[match.home,match.away].map(team=><section key={team.id}><header><TeamMark team={team}/><strong>{team.name}</strong></header><div>{playerOptions.filter(p=>p.team===team.short).map(p=><span key={p.id}>{p.shirt_no&&<b>{p.shirt_no}</b>}{p.name}</span>)}</div></section>)}</div></div>}
        <div className="ri-detail-actions">
          {match.status === "upcoming" && <button className={`ri-review-cta${watchlist ? " saved" : ""}`} onClick={toggleWatchlist}><Bookmark size={17} fill={watchlist ? "currentColor" : "none"} /> {watchlist ? "In your watchlist" : "Add to watchlist"}</button>}
          <button className={`ri-review-cta secondary${favorited ? " saved" : ""}`} onClick={toggleFavorite}><Heart size={17} fill={favorited ? "currentColor" : "none"}/> {favorited ? "Favourite" : "Add to favourites"}</button>
        </div>
      </> : match.status === "finished" ? <>
        <div className="ri-rating-panel"><small>YOUR RATING</small><Stars value={rating} onChange={setRating}/><ClassicStamp active={classic} onClick={() => setClassic(v => !v)}/></div>
        <div className="ri-chip-title">DESCRIBE THE MATCH <span>{tags.length}/3</span></div>
        <div className="ri-tag-picker">{tagOptions.map(tag => <button key={tag} className={tags.includes(tag) ? "active" : ""} onClick={() => toggleTag(tag)}>{tag}</button>)}</div>
        <div className="ri-detail-row"><span>Community rating</span><strong><Star size={14} fill="currentColor"/> {match.communityRating} <small>({match.ratings.toLocaleString()})</small></strong></div>
        <div className="ri-vote-block">
          <div><Trophy size={15}/><span><small>YOUR PLAYER OF THE MATCH</small><strong>{hideScores ? "Tap to reveal" : (playerOptions.find(p => p.id === potmId)?.name || "Choose a player")}</strong></span><b>{potmId ? "SELECTED" : "OPEN"}</b></div>
          <div className="ri-respect-grid">{playerOptions.map(player => <button key={`potm-${player.id}`} className={potmId === player.id ? "active" : ""} onClick={() => choosePotm(player.id)}><Trophy size={12}/>{player.name}</button>)}</div>
          <p>Choose up to two other players whose performance deserves recognition.</p>
          <div className="ri-respect-grid">{playerOptions.filter(player => player.id !== potmId).map(player => <button key={`respect-${player.id}`} className={respect.includes(player.id) ? "active" : ""} onClick={() => toggleRespect(player.id)}><ThumbsUp size={12}/>{player.name}</button>)}</div>
        </div>
        <textarea className="ri-review-input" value={review} onChange={e=>setReview(e.target.value)} placeholder="Write an optional review…" rows="3"/>
        <button className={`ri-review-cta${saveState === "saved" ? " saved" : ""}`} onClick={saveLog}><MessageCircle size={17}/> {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to Diary" : saveState === "error" ? "Try again" : "Save to Diary"}</button>
        <ReviewFeed reviews={match.reviews || []} onRefresh={onRefresh}/>
      </> : <WatchalongPanel matchId={match.id}/>} 
    </section>
  </div>;
}

function ReviewFeed({ reviews, onRefresh }) {
  const [openId, setOpenId] = useState(null);
  const [comments, setComments] = useState({});
  const [draft, setDraft] = useState("");
  const toggleComments = async id => {
    setOpenId(openId === id ? null : id);
    if (!comments[id]) setComments(v => ({ ...v, [id]: [] }));
    const data = await rankitApi.comments(id);
    setComments(v => ({ ...v, [id]: data.comments || [] }));
  };
  const addComment = async id => {
    if (!draft.trim()) return;
    await rankitApi.addComment(id, draft.trim());
    setDraft("");
    const data = await rankitApi.comments(id);
    setComments(v => ({ ...v, [id]: data.comments || [] }));
    await onRefresh?.();
  };
  const like = async id => { await rankitApi.likeReview(id); await onRefresh?.(); };
  return <div className="ri-review-feed"><div className="ri-chip-title">COMMUNITY REVIEWS <span>{reviews.length}</span></div>{reviews.map(r => <article key={r.id}>
    <div><strong>@{r.username}</strong><Stars value={r.rating || 0} compact/></div><p>{r.review}</p>
    <footer><button className={r.liked ? "active" : ""} onClick={() => like(r.id)}><Heart size={12} fill={r.liked ? "currentColor" : "none"}/> {r.likes}</button><button onClick={() => toggleComments(r.id)}><MessageCircle size={12}/> {r.comments}</button></footer>
    {openId === r.id && <div className="ri-comments">{(comments[r.id] || []).map(c => <p key={c.id}><strong>@{c.username}</strong> {c.content}</p>)}<div><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a reply"/><button onClick={() => addComment(r.id)}><Send size={13}/></button></div></div>}
  </article>)}</div>;
}

function WatchalongPanel({ matchId }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useMemo(() => ({ current: null }), []);
  useEffect(() => {
    rankitApi.watchalong(matchId).then(d => setMessages(d.messages || [])).catch(() => {});
    const host = window.location.hostname;
    const port = window.location.port === "5173" ? ":8010" : window.location.port ? `:${window.location.port}` : "";
    const ws = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${host}${port}/api/rankit/ws/watchalong/${matchId}`);
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
    <div className="ri-sheet-grab"/><div className="ri-rank-head"><div><small>SEARCH ALL OF RANKIT</small><h2>Discover something memorable</h2></div><button onClick={onClose}><X size={20}/></button></div>
    <label className="ri-search"><Search size={17}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Matches, teams, players, members, lists"/></label>
    <div className="ri-search-kinds">{["All","Matches","Players","Teams","Members","Lists"].map(x=><button key={x} className={kind===x?"active":""} onClick={()=>setKind(x)}>{x}</button>)}</div>
    {!query && <div className="ri-search-shelves"><small>TRENDING NOW</small><div><button>Champions League</button><button>NBA Playoffs</button><button>Community Classics</button></div></div>}
    {(kind === "All" || kind === "Matches") && <div className="ri-rank-results">{results.matches.map(m=><button key={m.id} onClick={()=>{onClose();onOpenMatch(m)}}><div className="ri-mini-crests"><TeamMark team={m.home}/><TeamMark team={m.away}/></div><span><strong>{m.home.short} vs {m.away.short}</strong><small>{m.competition} · {m.date}</small></span><ChevronRight size={17}/></button>)}</div>}
    {kind === "All" && <div className="ri-rank-results">{[...results.players.map(x=>({...x,_kind:"player"})),...results.teams.map(x=>({...x,_kind:"team"})),...results.members.map(x=>({...x,_kind:"member"})),...results.lists.map(x=>({...x,_kind:"list"}))].map(item=><button key={`${item._kind}-${item.id}`} onClick={()=>{onClose();onOpenEntity(item._kind,item.id)}}><span><strong>{item.name||item.username||item.title}</strong><small>{item._kind}</small></span><ChevronRight size={17}/></button>)}</div>}
    {query && ["Players","Teams","Members","Lists"].includes(kind) && <div className="ri-rank-results">{(results[kind.toLowerCase()] || []).map(item => { const entityKind={Players:"player",Teams:"team",Members:"member",Lists:"list"}[kind]; return <button key={`${entityKind}-${item.id}`} onClick={()=>{onClose();onOpenEntity(entityKind,item.id)}}><span><strong>{item.name || item.username || item.title}</strong><small>{item.sport || item.team || item.description || kind.slice(0,-1)}</small></span><ChevronRight size={17}/></button>})}</div>}
  </section></div>;
}

function EntityDetail({ detail, onClose, onOpenMatch, onOpenEntity, onChanged }) {
  const { kind, data } = detail;
  if (!data) return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-detail-sheet ri-entity-sheet" onClick={e=>e.stopPropagation()}><div className="ri-entity-loading">Loading profile…</div></section></div>;
  const entity = data[kind];
  const title = entity?.name || entity?.username || entity?.title;
  const subtitle = kind === "player" ? `${entity.sport} · ${entity.team_name || "Free agent"}` : kind === "team" ? `${entity.sport} · ${entity.country || "Global"}` : kind === "member" ? "RankIt member" : `Curated by @${entity.username}`;
  const matchesForEntity = (data.matches || []).map(fromApiMatch);
  const targetType = kind === "member" ? "user" : kind;
  const toggleFollow = async () => { await rankitApi.follow({target_type:targetType,target_id:entity.id,notify:false}); onChanged(kind,entity.id); };
  const toggleFavoriteEntity = async () => { await rankitApi.favorite({target_type:kind,target_id:entity.id}); onChanged(kind,entity.id); };
  return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-detail-sheet ri-entity-sheet" onClick={e=>e.stopPropagation()}>
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
  const filtered = catalog.filter(m => `${m.home.name} ${m.away.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="ri-sheet-wrap" onClick={onClose}>
    <section className="ri-rank-sheet" onClick={e => e.stopPropagation()}>
      <div className="ri-sheet-grab" />
      <div className="ri-rank-head"><div><small>ADD TO YOUR DIARY</small><h2>Rank a match</h2></div><button onClick={onClose}><X size={20} /></button></div>
      <label className="ri-search"><Search size={17} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search teams or matches" /></label>
      <div className="ri-quick-date"><CalendarDays size={15} /> Recently played</div>
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

function HomeView({ sport, setSport, hideScores, setHideScores, onOpen, onNavigate, catalog = matches, feed = activity }) {
  const shown = useMemo(() => catalog.filter(m => sport === "All" || m.sport === sport), [sport, catalog]);
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
      <div className="ri-section-head"><div><small>YOUR EVENING</small><h2>Tonight on RankIt</h2></div><button onClick={() => onNavigate("Discover")}>See all</button></div>
      <div className="ri-hero-carousel">{shown.slice(0, 3).map(m => <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={onOpen} featured />)}</div>
      <div className="ri-carousel-dots"><i className="active"/><i/><i/></div>
    </section>
    <section className="ri-section ri-friends-preview">
      <div className="ri-section-head"><div><small>FROM PEOPLE YOU FOLLOW</small><h2>Friends are watching</h2></div><button onClick={() => onNavigate("Activity")}>Activity</button></div>
      {feed.slice(0, 2).map(a => <div className="ri-activity-row" key={`${a.user}-${a.id || a.match?.id}`}>
        <div className="ri-avatar">{a.initials}</div><div><p><strong>{a.user}</strong> {a.action} <b>{a.match.home.short}–{a.match.away.short}</b></p><Stars value={a.rating || 0} compact /><span>{a.text}</span></div>
      </div>)}
    </section>
  </>;
}

function DiscoverView({ hideScores, onOpen, catalog = matches, meta, listCatalog = [], onCreateList, onOpenList }) {
  const [sportFilter, setSportFilter] = useState("All");
  const [competition, setCompetition] = useState("All");
  const [pageCatalog, setPageCatalog] = useState(catalog);
  const [total, setTotal] = useState(catalog.length);
  const [loading, setLoading] = useState(false);
  const competitions = (meta?.competitions || []).filter(c => sportFilter === "All" || c.sport === sportFilter);
  const load = async (append = false) => {
    setLoading(true);
    const offset = append ? pageCatalog.length : 0;
    const data = await rankitApi.catalog({ sport: sportFilter, competition, limit: 60, offset });
    setPageCatalog(v => append ? [...v, ...(data.matches || []).map(fromApiMatch)] : (data.matches || []).map(fromApiMatch));
    setTotal(data.total || 0); setLoading(false);
  };
  useEffect(() => { load(false).catch(()=>setLoading(false)); }, [sportFilter, competition]);
  return <><div className="ri-page-title"><small>FIND YOUR NEXT MATCH</small><h1>Discover</h1></div>
    <div className="ri-catalog-filters"><div>{["All","Basketball","Football"].map(s=><button key={s} className={sportFilter===s?"active":""} onClick={()=>{setSportFilter(s);setCompetition("All")}}>{s}</button>)}</div><select value={competition} onChange={e=>setCompetition(e.target.value)}><option value="All">All competitions</option>{competitions.map(c=><option key={`${c.sport}-${c.name}`} value={c.name}>{c.name} · {c.match_count}</option>)}</select></div>
    <section className="ri-section"><div className="ri-section-head"><div><small>COMMUNITY PICKS</small><h2>Popular this week</h2></div></div>
      <div className="ri-discover-grid">{pageCatalog.map(m => <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={onOpen} />)}</div>
      {pageCatalog.length < total && <button className="ri-load-more" disabled={loading} onClick={()=>load(true)}>{loading?"Loading…":`Load more · ${pageCatalog.length}/${total}`}</button>}
    </section>
    <section className="ri-section"><div className="ri-section-head"><div><small>CURATED BY MEMBERS</small><h2>Popular lists</h2></div><button onClick={onCreateList}>Create</button></div>
      <div className="ri-list-row">{(listCatalog.length ? listCatalog : lists).map((l, index) => <button key={l.id || l.title} onClick={()=>l.id && onOpenList(l.id)} style={{"--list-accent":l.accent || ["#FFB11B","#3FB08C","#7B61FF"][index%3]}}><ListPlus size={18}/><strong>{l.title}</strong><span>{l.match_count ?? l.count ?? 0} matches · @{l.username || "member"}</span></button>)}</div>
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
  return <div className="ri-sheet-wrap" onClick={onClose}><section className="ri-rank-sheet" onClick={e=>e.stopPropagation()}><div className="ri-sheet-grab"/><div className="ri-rank-head"><div><small>YOUR COLLECTION</small><h2>Create a list</h2></div><button onClick={onClose}><X size={20}/></button></div><label className="ri-search"><ListPlus size={17}/><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="List title"/></label><label className="ri-check"><input type="checkbox" checked={ranked} onChange={e=>setRanked(e.target.checked)}/> Ranked list</label><div className="ri-rank-results">{catalog.map(m=><button key={m.id} className={selected.includes(m.id)?"selected":""} onClick={()=>toggle(m.id)}><div className="ri-mini-crests"><TeamMark team={m.home}/><TeamMark team={m.away}/></div><span><strong>{m.home.short} vs {m.away.short}</strong><small>{m.competition}</small></span><b>{selected.includes(m.id)?"✓":"+"}</b></button>)}</div><button className="ri-review-cta" disabled={saving || !title.trim()} onClick={save}>{saving?"Creating…":"Create list"}</button></section></div>;
}

function ActivityView({ diaryEntries = [], watchlist = [], listCatalog = [], friendFeed = [], onOpen, onOpenList }) {
  const [sub, setSub] = useState("Friends");
  const [diaryView, setDiaryView] = useState("Timeline");
  const [filter, setFilter] = useState("Watched");
  const diaryRows = diaryEntries.length ? diaryEntries : matches.filter(m=>m.status==="finished").map(m=>({
    id:m.id,match_id:m.id,watched_date:m.date.split(" · ")[0],rating:m.id.includes?.("fcb")?5:4,classic:m.id.includes?.("fcb")?1:0,
    home_short:m.home.short,home_name:m.home.name,home_color:m.home.color,away_short:m.away.short,away_name:m.away.name,away_color:m.away.color,
    home_score:Number(m.score?.split("–")[0]),away_score:Number(m.score?.split("–")[1]),competition:m.competition,sport:m.sport,
  }));
  const filteredDiary = filter === "Classics" ? diaryRows.filter(e=>e.classic) : diaryRows;
  return <><div className="ri-page-title"><small>YOUR SPORTING LIFE</small><h1>Activity</h1></div>
    <div className="ri-segment"><button className={sub === "Friends" ? "active" : ""} onClick={() => setSub("Friends")}>Friends</button><button className={sub === "Diary" ? "active" : ""} onClick={() => setSub("Diary")}>Diary</button></div>
    {sub === "Friends" ? <div className="ri-activity-list">{friendFeed.map(a => <article key={a.id || `${a.user}-${a.match.id}`} onClick={()=>onOpen(a.match)}><div className="ri-avatar">{a.initials}</div><div className="ri-feed-copy"><p><strong>{a.user}</strong> {a.action}</p><h3>{a.match.home.name || a.match.home.short} <span>vs</span> {a.match.away.name || a.match.away.short}</h3><Stars value={a.rating || 0} compact /><blockquote>"{a.text}"</blockquote><small><MessageCircle size={12}/> Open match</small></div></article>)}{!friendFeed.length && <div className="ri-empty-state"><Users size={22}/><strong>No activity yet</strong><span>Follow members to build your feed.</span></div>}</div>
      : <div className="ri-diary"><div className="ri-diary-toolbar"><div className="ri-diary-filters">{["Watched","Watchlist","Classics","Lists"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div>{filter !== "Lists" && <div className="ri-view-toggle"><button className={diaryView==="Timeline"?"active":""} onClick={()=>setDiaryView("Timeline")}><List size={14}/></button><button className={diaryView==="Cards"?"active":""} onClick={()=>setDiaryView("Cards")}><LayoutGrid size={14}/></button></div>}</div>
      {filter === "Watchlist" ? <div className="ri-discover-grid">{watchlist.map(m=><MatchCard key={m.id} match={m} hideScores={false} onOpen={onOpen}/>)}</div>
      : filter === "Lists" ? <div className="ri-list-stack">{listCatalog.map(l=><article key={l.id} onClick={()=>onOpenList(l.id)}><ListPlus size={18}/><div><strong>{l.title}</strong><span>{l.match_count} matches · {l.ranked?"Ranked":"Unranked"}</span></div></article>)}</div>
      : diaryView === "Timeline" ? filteredDiary.map(e=><div className="ri-diary-row" key={e.id} onClick={()=>onOpen({id:e.match_id})}><span className="ri-diary-date">{e.watched_date}</span><div className="ri-mini-crests"><TeamMark team={{short:e.home_short,color:e.home_color}}/><TeamMark team={{short:e.away_short,color:e.away_color}}/></div><div><strong>{e.home_short} vs {e.away_short}</strong><small>{e.home_score} - {e.away_score} · {e.competition}</small></div><Stars value={e.rating||0} compact/></div>)
      : <div className="ri-diary-cards">{filteredDiary.map(e=><div key={e.id} style={{"--card-a":e.home_color,"--card-b":e.away_color}}><small>{e.competition}</small><strong>{e.home_short}</strong><b>{e.sport==="Basketball"?<>{e.home_score}<br/>{e.away_score}</>:<>{e.home_score} – {e.away_score}</>}</b><strong>{e.away_short}</strong><Stars value={e.rating||0} compact/><ClassicStamp active={!!e.classic} small/></div>)}</div>}</div>}
  </>;
}

function ProfileView({ profileData, diaryEntries = [], onOpen }) {
  const stats = profileData?.stats || {};
  const username = profileData?.user?.username || "gokdeniz";
  const initials = username.slice(0, 2).toUpperCase();
  const favourites = (profileData?.favorite_matches || []).map(fromApiMatch);
  return <><div className="ri-profile-head"><div className="ri-profile-avatar">{initials}</div><div><small>@{username}</small><h1>{username}</h1><p>Basketball nights, European football and the occasional instant classic.</p></div></div>
    <div className="ri-profile-stats"><div><strong>{stats.matches ?? 0}</strong><span>matches</span></div><div><strong>{stats.classics ?? 0}</strong><span>classics</span></div><div><strong>{stats.diary_count ?? 0}</strong><span>diary entries</span></div><div><strong>{stats.watchlist ?? 0}</strong><span>watchlist</span></div><div><strong>{stats.favorites ?? 0}</strong><span>favourites</span></div><div><strong>{stats.lists ?? 0}</strong><span>lists</span></div></div>
    <section className="ri-section"><div className="ri-section-head"><div><small>TASTE ON DISPLAY</small><h2>Four favourites</h2></div></div>{favourites.length ? <div className="ri-favourites">{favourites.map(m=><div key={m.id} onClick={()=>onOpen(m)} style={{"--fav-a":m.home.color,"--fav-b":m.away.color}}><span>{m.home.short}</span><b>VS</b><span>{m.away.short}</span></div>)}</div> : <div className="ri-empty-state"><Heart size={22}/><strong>No favourites yet</strong><span>Favourite a match to display your taste.</span></div>}</section>
    <section className="ri-section"><div className="ri-section-head"><div><small>RECENTLY</small><h2>Your latest rankings</h2></div></div>{diaryEntries.slice(0,6).map(e=><div className="ri-profile-log" key={e.id} onClick={()=>onOpen({id:e.match_id})}><strong>{e.home_short} - {e.away_short}</strong><Stars value={e.rating || 0} compact/>{!!e.classic && <ClassicStamp active small/>}</div>)}{!diaryEntries.length && <div className="ri-empty-state"><CalendarDays size={22}/><strong>Your diary is empty</strong><span>Rank a finished match to begin.</span></div>}</section>
  </>;
}

export default function RankItPrototype() {
  const [tab, setTab] = useState("Home");
  const [sport, setSport] = useState("All");
  const [hideScores, setHideScores] = useState(false);
  const [detail, setDetail] = useState(null);
  const [entityDetail, setEntityDetail] = useState(null);
  const [rankOpen, setRankOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [listCreatorOpen, setListCreatorOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [catalog, setCatalog] = useState(matches);
  const [feed, setFeed] = useState(activity);
  const [apiError, setApiError] = useState("");
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const [listCatalog, setListCatalog] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [catalogMeta, setCatalogMeta] = useState(null);
  const refreshCollections = async () => {
    const [listData, watchData] = await Promise.all([rankitApi.lists(), rankitApi.watchlist()]);
    setListCatalog(listData.lists || []);
    setWatchlist((watchData.matches || []).map(fromApiMatch));
  };
  const refreshPersonal = async () => {
    const [diary, profile, home] = await Promise.all([rankitApi.diary(), rankitApi.profile(), rankitApi.home("All")]);
    setDiaryEntries(diary.entries || []);
    setProfileData(profile);
    setCatalog((home.matches || []).map(fromApiMatch));
  };
  useEffect(() => {
    rankitApi.home("All").then(data => {
      setCatalog((data.matches || []).map(fromApiMatch));
      setFeed((data.activity || []).map(a => ({
        id: a.id, user: a.username, initials: a.username?.slice(0,2).toUpperCase(), action: "reviewed",
        match: { id: a.match_id, home: { short: a.home_short, name:a.home_name }, away: { short: a.away_short, name:a.away_name } }, rating: a.rating, text: a.review,
      })));
      setApiError("");
    }).catch(e => setApiError(e.message));
    rankitApi.diary().then(d=>setDiaryEntries(d.entries||[])).catch(()=>{});
    rankitApi.profile().then(setProfileData).catch(()=>{});
    rankitApi.meta().then(setCatalogMeta).catch(()=>{});
    refreshCollections().catch(()=>{});
  }, []);
  const openMatch = async match => {
    setEntityDetail(null);
    setDetail(match);
    try { setDetail(fromApiMatch(await rankitApi.match(match.id))); } catch { /* mock fallback */ }
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
    if (potmId) await rankitApi.potm(matchId, potmId);
    await rankitApi.respect(matchId, respectIds || []);
    await refreshPersonal();
    setDetail(fromApiMatch(await rankitApi.match(matchId)));
  };
  const refreshDetail = async () => {
    if (detail?.id) setDetail(fromApiMatch(await rankitApi.match(detail.id)));
  };
  const toggleWatchlist = async id => { const result = await rankitApi.toggleWatchlist(id); await refreshCollections(); return result; };
  const toggleFavorite = async value => { const result = await rankitApi.favorite(value); setProfileData(await rankitApi.profile()); return result; };
  return <div className="rankit-app">
    <header className="ri-header"><div className="ri-brand"><RankItMark size={29}/><div><strong>RANKIT</strong><small>BY PRIMARY ARCH</small></div></div><button><Bell size={19}/><i/></button></header>
    <main className="ri-main">
      {apiError && <div className="ri-api-note">Offline demo · {apiError}</div>}
      {tab === "Home" && <HomeView sport={sport} setSport={setSport} hideScores={hideScores} setHideScores={setHideScores} onOpen={openMatch} onNavigate={setTab} catalog={catalog} feed={feed}/>} 
      {tab === "Discover" && <DiscoverView hideScores={hideScores} onOpen={openMatch} catalog={catalog} meta={catalogMeta} listCatalog={listCatalog} onCreateList={()=>setListCreatorOpen(true)} onOpenList={id=>openEntity("list",id)}/>} 
      {tab === "Activity" && <ActivityView diaryEntries={diaryEntries} watchlist={watchlist} listCatalog={listCatalog} friendFeed={feed} onOpen={openMatch} onOpenList={id=>openEntity("list",id)}/>} 
      {tab === "Profile" && <ProfileView profileData={profileData} diaryEntries={diaryEntries} onOpen={openMatch}/>} 
    </main>
    {!detail && !entityDetail && !rankOpen && !searchOpen && <form className={`ri-floating-search${searchExpanded ? " expanded" : ""}`} onSubmit={e=>{e.preventDefault();setSearchOpen(true);setSearchExpanded(false)}}>
      <button type="button" aria-label="Open global search" onClick={()=>{if(searchExpanded&&quickSearch.trim()){setSearchOpen(true);setSearchExpanded(false)}else setSearchExpanded(true)}}><Search size={21}/></button>
      <input value={quickSearch} onChange={e=>setQuickSearch(e.target.value)} onFocus={()=>setSearchExpanded(true)} placeholder="Search RankIt…" aria-label="Search RankIt"/>
    </form>}
    <nav className="ri-bottom-nav">{TABS.map(([name, Icon]) => <button key={name} className={`${tab === name ? "active" : ""}${name === "Rank" ? " rank" : ""}`} onClick={() => name === "Rank" ? setRankOpen(true) : setTab(name)}><span><Icon size={name === "Rank" ? 25 : 20}/></span><small>{name}</small></button>)}</nav>
    {detail && <MatchDetail match={detail} hideScores={hideScores} onClose={() => setDetail(null)} onSave={saveMatchLog} onToggleWatchlist={toggleWatchlist} onToggleFavorite={toggleFavorite} onRefresh={refreshDetail}/>} 
    {entityDetail && <EntityDetail detail={entityDetail} onClose={()=>setEntityDetail(null)} onOpenMatch={openMatch} onOpenEntity={openEntity} onChanged={openEntity}/>} 
    {rankOpen && <RankSheet catalog={catalog} onOpenMatch={openMatch} onClose={() => setRankOpen(false)}/>} 
    {searchOpen && <GlobalSearch initialQuery={quickSearch} onClose={() => setSearchOpen(false)} onOpenMatch={openMatch} onOpenEntity={openEntity}/>} 
    {listCreatorOpen && <ListCreator catalog={catalog} onClose={()=>setListCreatorOpen(false)} onCreated={refreshCollections}/>} 
  </div>;
}
