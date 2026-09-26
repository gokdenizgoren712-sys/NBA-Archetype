import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import {
  Award, Bell, Bookmark, CalendarDays, ChevronDown, ChevronRight, CircleUserRound,
  Compass, Eye, EyeOff, Home, List, ListPlus, MessageCircle, Plus, Search,
  Heart, Radio, Send, Share2, SlidersHorizontal,
  Star, Trophy, Users, X, Shield} from "lucide-react";
import { rankitApi } from "./rankitApi";
import { readPrefs, writePrefs, resolveBroadcastCountry, hidesScore } from "./rankitPrefs";
import { fromApiMatch } from "./matchModel";
import { entryTagOptions } from "./redesign/entryTags";
import { communityHeat, communityRatingCount, communityVerdictCovered, hasCommunityVerdict, heatSteps, NAMES, MIN_COMMUNITY_RATINGS } from "./redesign/heat";
import CommunityVerdictGate from "./redesign/CommunityVerdictGate";
import ExpectedHeat from "./redesign/ExpectedHeat";
import { broadcastLabel } from "./redesign/broadcastLabel";
import { appetiteOpen, appetiteValue, nextAppetite } from "./redesign/appetite";
import { liveFreshness } from "./redesign/liveFreshness";
import { playedPlayers } from "./redesign/playedPlayers";
import { RankItMark } from "./redesign/BrandMark";
import PlayersPicker from "./redesign/PlayersPicker";
import ReviewComposer from "./redesign/ReviewComposer";
import HuntIndex from "./redesign/Hunt";
import FilterDrawer from "./redesign/FilterDrawer";
import { activeCount as filterCount, toCatalogQuery } from "./redesign/discoverFilters";
import LiveLineup from "./redesign/LiveLineup";
import MatchEvents from "./redesign/MatchEvents";
import { finishedMatchEventState } from "./redesign/finishedMatchEvents";
import { companionMinute } from "./redesign/companionView";
import { ratingField } from "./redesign/ratingField";
import { nightStatus } from "./redesign/streakNight";
import { huntLine, huntPercent } from "./redesign/huntSummary";
import { DiaryFilterBar, DiaryHeatStrip, DiaryTimeline } from "./redesign/Diary";
import FriendsFeed from "./redesign/FriendsFeed";
import { filterDiary, sortDiary, sortWatchlist, statLine, triggerLabel, groupsByMonth } from "./redesign/diaryView";
import { saveCta, RATE_CTA } from "./redesign/saveCta";
import { reviewerFromStorage, isOwnContent } from "./redesign/reviewIdentity";
import { createReplyAttempts } from "./redesign/replyAttempt";
// Faz 2 — redesign kartı bayrak arkasında; kapalıyken hiçbir şey değişmiyor.
import { RANKIT_NEW_CARD } from "./redesign/flags";
import RedesignMatchCard, { Shield as CrestDiamond, CrestPair } from "./redesign/MatchCard";
import { rankitDayContext, tonightRows, tonightLabel, tonightStatus } from "./redesign/homeTonight";
import { competitionEyebrow, competitionSub } from "./redesign/competitionHead";
import { toMatchCardProps, diaryToMatchCardProps } from "./redesign/toMatchCardProps";
import StreakRing from "./redesign/StreakRing";
import CompanionPanel from "./redesign/CompanionPanel";
import AllReviews from "./redesign/AllReviews";
import SearchSheet from "./redesign/SearchSheet";
import Alerts from "./redesign/Alerts";
import Settings from "./redesign/Settings";
import ListShelf from "./redesign/ListShelf";
import MemberProfile from "./redesign/MemberProfile";
import { closeTopmost } from "./redesign/backStack";
import { SkeletonCard, SkeletonRows, SheetSkeleton, Loading, EmptyState, EndOfList, ErrorState } from "./redesign/States";
import { saveRating, ratingAccount, flushOutbox, outbox, onOutboxChange } from "./rankitOutbox";
import { entrySnapshot, snapshotFromMatch } from "./entryState";
import { LAST_SYNC_KEY } from "./rankitApi";
import CompetitionMatches from "./redesign/CompetitionMatches";
import CompetitionPlayers from "./redesign/CompetitionPlayers";
import ReviewThread from "./redesign/ReviewThread";
import CollectibleResult from "./redesign/CollectibleResult";
import ProfileRoot from "./redesign/ProfileRoot";
import { createCollectible, collectibleEditMatch } from "./collectibleState";
import { rankitHaptics } from "./rankitHaptics";
import { useDialog, closeTopDialog } from "./redesign/useDialog";
import "./rankit.css";
import "./rankit-motion.css";
import "./rankit-filter.css";
import "./rankit-next.css";
import "./rankit-v030.css";

const SPORTS = ["All", "Basketball", "Football", "Olympics"];
const TABS = [
  ["Home", Home], ["Discover", Compass], ["Rank", Plus], ["Activity", Users], ["Profile", CircleUserRound],
];

function loadRankitHome(sport = "All") {
  const day = rankitDayContext();
  const region = resolveBroadcastCountry();
  return rankitApi.home(sport, day.start, day.end, region.supported ? region.code : "");
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
  return <div className="ri-sheet-grab ri-sheet-drag-handle" aria-hidden="true"
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
  const className = `ri-classic${active ? " active" : ""}${small ? " small" : ""}`;
  const inner = <><span>CLASSIC</span><small>RANKIT SELECT</small></>;
  // Damga yalnizca puanlama panelinde bir KONTROL; gunluk kartinda ve profil
  // satirinda okunan bir ISARET. onClick yokken de <button> uretmek klavye
  // sirasina hicbir sey yapmayan duraklar koyuyordu (§26) ve 35.5px'lik bu
  // duraklar 44px hedef kuralini bos yere ihlal ediyordu (§6).
  if (!onClick) return <span className={className}>{inner}</span>;
  return <button className={className} onClick={event => { rankitHaptics.impact(); onClick(event); }}>
    {inner}
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
  if (!["finished", "live"].includes(match.status)) return <>VS</>;
  if (!match.score) return <>—</>;
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
  const [communityRevealed, setCommunityRevealed] = useState(false);
  const finished = match.status === "finished";
  const live = match.status === "live";
  const hidden = hidesScore(hideScores, match);
  const verdictCovered = communityVerdictCovered(match, { revealed: communityRevealed });
  const rating = communityHeat(match);
  const count = communityRatingCount(match);
  // role/tabIndex/onKeyDown eskiden yoktu — bu kart bir <article onClick>, ve
  // telefon Capacitor uygulaması olarak da paketlendiği için erişilebilirlik
  // servisi kullanan biri için tamamen erişilemezdi. Web'in kendi MatchCard'ı
  // (cards.jsx) bunu zaten doğru yapıyordu; aynı deseni buraya taşıyoruz.
  return <article className={`ri-match-card${featured ? " featured" : ""}${finished && match.instantClassic && !hidden && !verdictCovered ? " instant" : ""}`}
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
      {finished && match.instantClassic && !hidden && !verdictCovered ? <span>INSTANT CLASSIC</span> : <button type="button" disabled={!match.competition_id}
        onClick={event=>{event.stopPropagation();onOpenCompetition?.(match.competition_id)}}>{match.competition}</button>}
      {finished ? <span className="ri-community-rating">{hidden ? "PLAYED" : verdictCovered ? "FULL TIME" : rating !== null ? <><Star size={11} fill="currentColor" /> {rating.toFixed(1)}</> : count !== null && count < MIN_COMMUNITY_RATINGS ? "TOO FEW RATINGS" : "FULL TIME"}</span> : live ? <span className="ri-live-tag">LIVE</span> : <span className="ri-live-date">{match.dateOnly || match.date}</span>}
    </div>

    <div className="ri-match-art">
      <div className="ri-team-side home"><TeamMark team={match.home} /></div>
      {finished && match.player && !hidden && !verdictCovered ? (
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
      <div className={`ri-score${hidden ? " hidden" : ""}`}>
        {finished ? hidden ? <span aria-label="Score hidden">—</span> : <ScoreValue match={match}/> : "—"}
      </div>
      <div>
        <strong>{match.away.short}</strong>
        {match.away.name !== match.away.short && <small>{match.away.name}</small>}
      </div>
    </div>

    <div className="ri-match-foot">
      <span>{finished
        ? `${match.ratings.toLocaleString()} ratings · ${match.reviewCount ?? 0} reviews`
        : broadcastLabel(match)}</span>
      <span>{finished && match.dominantTag && !hidden && !verdictCovered ? match.dominantTag : match.stage || match.date}</span>
    </div>
    {verdictCovered && !hidden && <button type="button" className="ri-spoiler-gate" onClick={event => { event.stopPropagation(); setCommunityRevealed(true); }}>
      Rate it first — then see whether the room agreed with you. <b>REVEAL ANYWAY</b>
    </button>}
    {!finished && <button className="ri-card-share" aria-label="Share match" onClick={event=>{event.stopPropagation();shareMatch(match,hideScores)}}><Share2 size={13}/></button>}
  </article>;
}

function CompetitionDetail({ detail, hideScores, onClose, onOpenMatch, onOpenPlayer }) {
  // Sekme sirasi 3c/3d'ye gore: Table · Matches · Players. Matches ile
  // Players artik paylasilan bilesenler (redesign/) — web ile telefon ayni
  // ekrani iki kez yazmiyor.
  const [section, setSection] = useState("Table");
  const competitionId = detail?.competition?.id;
  const dialog = useDialog({ onClose, label: detail?.competition?.name || "Competition" });
  if (!detail) return <div className="ri-sheet-wrap" onClick={onClose}><section {...dialog} className="ri-detail-sheet ri-competition-sheet" onClick={event=>event.stopPropagation()}><SheetHandle onClose={onClose}/><Loading label="Loading competition"><SheetSkeleton rows={5}/></Loading></section></div>;
  const competition = detail.competition;
  return <div className="ri-sheet-wrap" onClick={onClose}><section {...dialog} className="ri-detail-sheet ri-competition-sheet" onClick={event=>event.stopPropagation()}>
    <SheetHandle onClose={onClose}/><button className="ri-sheet-close" onClick={onClose}><X size={19}/></button>
    {/* 2i: sola yasli; "ENGLAND · 2026/27" / ad / "Football · 20 clubs · Matchweek 4". */}
    <header className="ri-competition-head"><small>{competitionEyebrow(competition)}</small><h2>{competition.name}</h2><span>{competitionSub(detail)}</span></header>
    <div className="ri-detail-tabs ri-competition-tabs">{["Table","Matches","Players"].map(name=><button key={name} className={section===name?"active":""} onClick={()=>setSection(name)}>{name}</button>)}</div>
    {section === "Matches" && <CompetitionMatches competitionId={competitionId} hideScores={hideScores}
      matchweeks={detail.matchweeks || []} fixtures={detail.fixtures || []}
      onOpenMatch={match=>{onClose();onOpenMatch(fromApiMatch(match))}}/>}
    {section === "Table" && <div className="ri-competition-table"><header><span>#</span><strong>{competition.sport === "Basketball" ? "Team" : "Club"}</strong><span>P</span><span>{competition.sport === "Basketball" ? "+/-" : "GD"}</span><span>{competition.sport === "Basketball" ? "W" : "PTS"}</span></header>{(detail.standings||[]).map((row,index)=><div key={row.team_id}><span>{index+1}</span><strong><CrestDiamond side={31} color={row.color || "#3a3f47"} ink="#fff" abbr={(row.short_name || row.name || "").slice(0, 3).toUpperCase()} crestUrl={row.crest_url} badgeScale={0.3}/><b>{row.name || row.short_name}</b></strong><span>{row.played}</span><span>{row.gd>0?`+${row.gd}`:row.gd}</span><span>{row.points}</span></div>)}{!detail.standings?.length&&<div className="ri-empty-state"><List size={22}/><strong>No league table for this stage</strong><span>Qualifying and knockout ties are shown under fixtures.</span></div>}</div>}
    {section === "Players" && <CompetitionPlayers competitionId={competitionId}
      onOpenPlayer={id=>{onClose();onOpenPlayer(id)}}/>}
  </section></div>;
}

export function MatchDetail({ match, hideScores, onClose, onSave, onResult, onToggleWatchlist, onToggleFavorite, onRefresh, onOpenCompetition }) {
  const dialog = useDialog({ onClose, label: `${match.home.short} vs ${match.away.short}` });
  const draftKey = `rankit:draft:${ratingAccount()}:${match.id}`;
  const [initialEntry] = useState(() => {
    if (match.__entry) return match.__entry;
    const base = JSON.parse(snapshotFromMatch(match));
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey));
      if (draft) return {...base, ...draft};
      const queued = outbox().find(item => item.matchId === match.id);
      if (queued) return {...base, ...queued.diary, entryId:queued.receipt?.entry_id || queued.diary.entry_id, watchedDate:queued.diary.watched_date, potmId:queued.potmId, respect:queued.respectIds, rewatch:queued.diary.is_rewatch};
    } catch { /* Okunamayan taslak uygulamayi cokertmez. */ }
    return base;
  });
  const [rating, setRating] = useState(initialEntry.rating);
  /* Puan alanini SADECE kullanici dokunduysa gonderiyoruz (§5.4 "never discard
     work the user already did"). Uc artik "alan yok" ile "alan null" arasini
     ayiriyor: alan yoksa puana dokunulmuyor, null ise puan SILINIYOR. Eski
     `rating: rating || null` kalibi, composer bayat bir `match` nesnesiyle
     acildiginda (cevrimdisi kopya, my_rating tasimayan liste yaniti) yalniz
     inceleme yazan kullanicinin sunucudaki puanini sessizce siliyordu. */
  const [ratingTouched, setRatingTouched] = useState(false);
  const rate = value => { setRatingTouched(true); setRating(value); };
  const [classic, setClassic] = useState(initialEntry.classic);
  const [watchlist, setWatchlist] = useState(!!match.watchlisted);
  const [appetite, setAppetite] = useState(() => appetiteValue(match.my_appetite));
  const [appetiteBusy, setAppetiteBusy] = useState(false);
  const [appetiteError, setAppetiteError] = useState("");
  const [appetiteClosed, setAppetiteClosed] = useState(false);
  const [appetiteClock, setAppetiteClock] = useState(Date.now);
  const [liveClock, setLiveClock] = useState(Date.now);
  const [favorited, setFavorited] = useState(!!match.favorited);
  const [section, setSection] = useState(match.status === "finished" ? "Community" : "Match");
  const [tags, setTags] = useState(initialEntry.tags || []);
  const [respect, setRespect] = useState(initialEntry.respect || []);
  const [potmId, setPotmId] = useState(initialEntry.potmId || null);
  const [review, setReview] = useState(initialEntry.review || "");
  const [spoiler, setSpoiler] = useState(!!initialEntry.spoiler);
  const [visibility, setVisibility] = useState(initialEntry.visibility || "public");
  const [rewatch, setRewatch] = useState(!!initialEntry.rewatch);
  const [entryId, setEntryId] = useState(initialEntry.entryId || null);
  const [saveState, setSaveState] = useState(match.__entry ? (match.__entryPending ? "queued" : "saved") : "idle");
  const [saveError, setSaveError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [communityRevealed, setCommunityRevealed] = useState(false);
  const scoreHidden = hidesScore(hideScores, match) && !revealed;
  // Secilmis ama kaydedilmemis yildizlar kalabalik sonucunu erken acmamali.
  const verdictCovered = communityVerdictCovered(match, { revealed: communityRevealed });
  const hasCrowdData = hasCommunityVerdict(match) || Number(match.rating_count) > 0;
  const communityHidden = hasCrowdData && (scoreHidden || verdictCovered);
  const liveDelayed = liveFreshness(match, liveClock) === "stale";
  const [savedSnapshot, setSavedSnapshot] = useState(() => match.__entry ? entrySnapshot(match.__entry) : snapshotFromMatch(match));
  const snapshot = entrySnapshot({ rating, classic, tags, review, spoiler, visibility, potmId, respect, rewatch });
  const dirty = snapshot !== savedSnapshot;
  // Kaydet dugmesinin etiketi + etkinligi tek yerde (§5.4 / §9, bkz. saveCta.js).
  const cta = saveCta({ saveState, dirty, entryId, watchedDate: match.my_watched_date,
                        loadedRating: initialEntry.rating, rewatch });
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [broadcastInfo, setBroadcastInfo] = useState(undefined);
  useEffect(() => {
    if (match.status !== "upcoming") return undefined;
    const timer = setInterval(() => setAppetiteClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [match.status]);
  useEffect(() => {
    if (match.status !== "live") return undefined;
    const timer = setInterval(() => setLiveClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [match.status]);
  // Companion rozeti (ekran 5a/5b). Katilim sayisi sunucudan gelir; sekme
  // sayiyi gostermek icin panelin acilmasini beklememeli.
  const [allReviewsOpen, setAllReviewsOpen] = useState(false);
  // 5c -> 4a: bir incelemeye tiklamak ONUN yuzeyini acar (§6.1: mac
  // sayfasinin listesi ile bir incelemenin dizisi AYRI yuzeyler).
  const [threadId, setThreadId] = useState(null);
  const [companionState, setCompanionState] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = () => rankitApi.companion(match.id).then(data => { if (active) setCompanionState(data); }).catch(() => { if (active) setCompanionState(null); });
    refresh();
    const timer = section !== "Companion" && ["upcoming", "live"].includes(match.status) ? setInterval(refresh, 30000) : null;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [match.id, match.status, section]);
  const companionBadge = companionState?.badge || null;
  const resultEventState = finishedMatchEventState(match, companionState);
  // "Bu maçı listeme ekle": addListItem ucu vardı ama iki yüzey de
  // çağırmıyordu. Web'e eklenirken telefon geride kalmasın — parite
  // sözleşmesi tek yönlü değil (bkz. rankit/PRODUCT.md).
  const [myLists, setMyLists] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const tagOptions = entryTagOptions(match.sport);
  const seasonPlayers = match.players || [];
  const playerOptions = playedPlayers(match.lineups);
  const visibleTags = showMoreTags ? tagOptions : tagOptions.slice(0,5);
  const crowdHeat = communityHeat(match);
  const crowdRatings = communityRatingCount(match);
  const selectedPotm = playerOptions.find(player => player.id === potmId);
  const selectedRespect = playerOptions.filter(player => respect.includes(player.id));
  const eligibleIds = new Set(playerOptions.map(player => player.id));
  // Ülke artık sabit değil: tercihten, yoksa cihaz dilinden. Kapsam dışıysa
  // hiç sormuyoruz — başka bir ülkenin yayıncısını göstermek yanlış bilgi.
  const country = useMemo(() => resolveBroadcastCountry(), []);
  useEffect(() => {
    if (!country.supported) return undefined;
    rankitApi.broadcasts(match.id, country.code).then(setBroadcastInfo).catch(()=>setBroadcastInfo(null));
    return undefined;
  }, [match.id, country]);
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(draftKey, JSON.stringify({...JSON.parse(snapshot),entryId,watchedDate:initialEntry.watchedDate || match.my_watched_date}));
      else localStorage.removeItem(draftKey);
    } catch { /* Kalici kaydetme hatayi ayrica bildirir. */ }
    return undefined;
  }, [draftKey, snapshot, dirty, entryId, initialEntry.watchedDate, match.my_watched_date]);
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
    if (saveState === "saving") return;
    setSaveState("saving");
    setSaveError("");
    try {
      const result = await onSave?.({
        // tz_offset: RankIt gunu kullanicinin saatinde (§7.2). Gonderilmiyordu
        // ve sunucu UTC ile hesapliyordu -- UTC+3'te "gecesinde" sinirlari
        // uc saat kayiyordu.
        diary: { match_id: match.id, entry_id:entryId || undefined, watched_date: initialEntry.watchedDate || match.my_watched_date || new Date().toISOString().slice(0, 10),
          ...ratingField({ touched: ratingTouched, hasEntry: !!entryId, rating }),
          review, classic, tags, visibility, spoiler, is_rewatch: rewatch, tz_offset: -new Date().getTimezoneOffset() },
        matchId: match.id,
        potmId: rating > 0 && eligibleIds.has(potmId) ? potmId : null,
        respectIds: rating > 0 ? respect.filter(id => eligibleIds.has(id) && id !== potmId).slice(0, 2) : [],
      });
      setSavedSnapshot(snapshot);
      if (result?.receipt?.entry_id) setEntryId(result.receipt.entry_id);
      setSaveState(result?.queued ? "queued" : "saved");
      if (!result?.queued) rankitHaptics.success();
      onResult?.(createCollectible(match, { ...JSON.parse(snapshot), entryId:result?.receipt?.entry_id || entryId,
        watchedDate:initialEntry.watchedDate || match.my_watched_date || new Date().toISOString().slice(0,10) }, result));
    } catch (error) {
      const partial = outbox().find(item=>item.matchId===match.id)?.receipt;
      if (partial?.entry_id) setEntryId(partial.entry_id);
      setSaveState("error"); setSaveError(error.message || "Could not save. Your changes are still here.");
    }
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
      const result = await onToggleWatchlist(match.id, optimistic);
      setWatchlist(result.watchlisted);
      if (!result.watchlisted) setAppetite(null);
      showNotice(result.watchlisted ? "Added to your watchlist" : "Removed from your watchlist");
    } catch {
      setWatchlist(previous);
      showNotice("Watchlist could not be updated", "error");
    } finally {
      setWatchlistBusy(false);
    }
  };
  const chooseAppetite = async (value) => {
    if (appetiteBusy || appetiteClosed || !appetiteOpen(match, appetiteClock)) return;
    const previous = appetite;
    const next = nextAppetite(previous, value);
    setAppetite(next);
    setAppetiteBusy(true);
    setAppetiteError("");
    try {
      const result = await rankitApi.appetite(match.id, next);
      setAppetite(appetiteValue(result.my_appetite));
      setWatchlist(!!result.watchlisted);
      if (onRefresh) Promise.resolve(onRefresh()).catch(() => {});
    } catch (error) {
      setAppetite(previous);
      if (error.status === 409) {
        setAppetiteClosed(true);
        setAppetiteError("Expected heat closed at kick-off.");
      } else if (error.status === 401) {
        setAppetiteError("Sign in again to save your read.");
      } else {
        setAppetiteError(error.offline ? "You're offline. Your read was not saved." : "Your read could not be saved. Try again.");
      }
    } finally {
      setAppetiteBusy(false);
    }
  };
  const toggleFavorite = async () => {
    if (favoriteBusy) return;
    const previous = favorited;
    const optimistic = !previous;
    setFavorited(optimistic);
    setFavoriteBusy(true);
    try {
      const result = await onToggleFavorite({ target_type: "match", target_id: match.id }, !previous);
      setFavorited(result.favorited);
      showNotice(result.favorited ? "Added to your favourites" : "Removed from your favourites");
    } catch {
      setFavorited(previous);
      showNotice("Favourites could not be updated", "error");
    } finally {
      setFavoriteBusy(false);
    }
  };
  // 2f / 2g / 15a: maç sayfasının iki başlık hali. Match sekmesinde sade
  // hero (gri eyebrow, iki elmas, durum hapı + skor, "Arsenal vs Tottenham",
  // tarih satırı); Community ve Companion'da kompakt satır ("Arsenal 3–1
  // Tottenham" / "Community · 318 reviews"). Kapat solda, sekmeler sola yaslı.
  const heroStatus = match.status === "finished" ? scoreHidden ? "PLAYED" : "FULL TIME"
    : match.status === "live" ? `LIVE${match.live_minute ? ` · ${companionMinute(match.live_minute, match.sport)}` : ""}${liveDelayed ? " · DELAYED" : ""}` : "UPCOMING";
  const statusWord = match.status === "finished" ? "Full time" : match.status === "live" ? "Live" : "Upcoming";
  const whenLine = [match.dateOnly || match.date, match.time, match.venue].filter(Boolean).join(" · ");
  const scoreText = !scoreHidden && ["finished","live"].includes(match.status) && match.score
    ? match.score.replace(/\s*[–-]\s*/, "–") : null;
  const compactTitle = scoreText ? `${match.home.short} ${scoreText} ${match.away.short}` : `${match.home.short} vs ${match.away.short}`;
  const compactSub = section === "Community" && match.reviewCount > 0
    ? `Community · ${match.reviewCount.toLocaleString("en-GB")} ${match.reviewCount === 1 ? "review" : "reviews"}`
    : [statusWord, match.dateOnly].filter(Boolean).join(" · ");
  const crest = toMatchCardProps(match);
  return <div className="ri-sheet-wrap" onClick={onClose}>
    <section {...dialog} className="ri-detail-sheet ri-match-sheet" onClick={e => e.stopPropagation()}>
      <SheetHandle onClose={onClose}/>
      <button className="ri-sheet-close" onClick={onClose} aria-label="Close match"><X size={17} /></button>
      {section === "Match" ? <div className="ri-v03-hero is-2f">
        <div className={`ri-detail-kicker ${match.status}${liveDelayed ? " is-stale" : ""}`}>{match.competition_id
          ? <button type="button" className="ri-kicker-comp" onClick={()=>{onClose();onOpenCompetition?.(match.competition_id)}}>{match.competition}{match.stage ? ` · ${match.stage}` : ""}</button>
          : <span>{match.competition}{match.stage ? ` · ${match.stage}` : ""}</span>}</div>
        <div className="ri-detail-teams">
          <div className="ri-v03-team"><CrestDiamond side={44} color={crest.homeColor} ink={crest.homeCrestInk} abbr={crest.homeAbbr} crestUrl={crest.homeCrestUrl} badgeScale={0.28}/></div>
          <div className="ri-v03-score"><b className={`ri-status-pill ${match.status}${liveDelayed ? " is-stale" : ""}`}>{heroStatus}</b>
            {scoreHidden ? <button className="ri-card-reveal" onClick={()=>setRevealed(true)}>Reveal match</button> : <strong><ScoreValue match={match} detail/></strong>}</div>
          <div className="ri-v03-team"><CrestDiamond side={44} color={crest.awayColor} ink={crest.awayCrestInk} abbr={crest.awayAbbr} crestUrl={crest.awayCrestUrl} badgeScale={0.28}/></div>
        </div>
        <div className="ri-v03-names"><strong>{match.home.name || match.home.short} vs {match.away.name || match.away.short}</strong>
          {whenLine && <small>{whenLine}</small>}</div>
      </div>
      : <div className="ri-sheet-compact"><strong>{compactTitle}</strong><small>{compactSub}</small></div>}
      <div className="ri-detail-tabs" role="tablist">{["Match","Community","Companion"].map(name=><button key={name} role="tab" aria-selected={section===name} className={section===name?"active":""} onClick={()=>setSection(name)}>{name}{/* Rozet mac durumundan turer: katilim sayisi -> LIVE -> hicbir sey. */}{name==="Companion" && companionBadge && <i className={`ri-tab-badge${companionState?.status==="live"?" live":""}`}>{companionBadge}</i>}</button>)}</div>
      {section === "Companion" ? <CompanionPanel matchId={match.id} sport={match.sport} onStateChange={setCompanionState}
        isLoggedIn={!!localStorage.getItem("nba_arch_token")} rated={rating > 0}
        onRate={value=>{if(!rating && value)rate(value);setSection("Community");}}/>
      : section === "Match" ? <>
        {!scoreHidden && match.summary && <p className="ri-summary">{match.summary}</p>}
        {match.status === "upcoming" && <ExpectedHeat match={match}/>}
        <div className="ri-broadcast"><small>{country.supported ? `WATCH IN ${country.code}` : "BROADCAST"}</small><strong>{!country.supported ? "Not covered in your region yet" : broadcastInfo === undefined ? "Checking coverage…" : broadcastInfo === null ? "Broadcast information unavailable" : broadcastInfo?.channels?.length ? broadcastInfo.channels.map(channel=>channel.name).join(" · ") : "Not covered in your region yet"}</strong><span>{broadcastInfo?.confidence === "confirmed" ? "Confirmed broadcaster" : broadcastInfo?.confidence === "typical" ? "Typical competition coverage · check before the match" : "Coverage has not been confirmed yet"}</span></div>
        <div className="ri-timeline"><small>MATCH</small><div><span>{match.status === "finished" ? scoreHidden ? "—" : "FT" : match.status === "live" ? companionMinute(match.live_minute, match.sport) || "LIVE" : match.time || match.dateOnly}</span><strong>{match.status === "finished" ? scoreHidden ? "Played" : "Full time" : match.status === "live" ? liveDelayed ? "Updates delayed" : "Live now" : "Scheduled"}</strong></div><button onClick={() => setSection("Community")}>Community <ChevronRight size={14}/></button></div>
        {/* Doğrulanmış kadro: sağlayıcının o maça özel açıkladığı 11, yedekler,
            diziliş ve teknik direktör. Sezon kadrosundan AYRI alan (`lineups`
            vs `players`) — "gerçek ilk 11 mi bilmiyoruz" sorusunun cevabı bu
            ayrım. Elde yoksa hiç basılmıyor, sezon kadrosu 11'miş gibi
            sunulmuyor. */}
        {match.status === "live" && match.lineups?.length > 0 && <LiveLineup lineups={match.lineups}
          inRoom={companionState?.in_room} onCompanion={() => setSection("Companion")} />}
        {match.status !== "live" && match.lineups?.length > 0 && <div className="ri-lineup">
          <div className="ri-lineup-title"><span>CONFIRMED LINEUP</span>{match.status === "upcoming" && <em>Can change until kick-off</em>}</div>
          <div className="ri-lineup-grid">{match.lineups.map(side => <section key={side.team_id} className="ri-lineup-side">
            <div className="ri-lineup-head">
              <strong>{side.team}</strong>
              {side.formation && <span className="ri-lineup-formation">{side.formation}</span>}
              {side.coach && <span className="ri-lineup-coach"><b>Manager</b>{side.coach}</span>}
            </div>
            <div className="ri-lineup-list">{side.starters.map((p,i)=><span key={`s-${i}`}><b>{p.shirt_no ?? ""}</b><i>{p.name}</i></span>)}</div>
            {side.bench?.length > 0 && <div className="ri-lineup-bench">
              <small>BENCH · {side.bench.length}</small>
              <div className="ri-lineup-list">{side.bench.map((p,i)=><span key={`b-${i}`}><b>{p.shirt_no ?? ""}</b><i>{p.name}</i></span>)}</div>
            </div>}
          </section>)}</div>
        </div>}
        {match.status === "upcoming" && !match.lineups?.length && <div className="ri-squad-preview"><div className="ri-chip-title">SEASON SQUADS {seasonPlayers.length > 0 && <span>{seasonPlayers.length}</span>}</div><p>Lineups are not announced — a season squad is not a starting eleven.</p>{seasonPlayers.length > 0 && <div>{[match.home,match.away].map(team=><section key={team.id}><header><TeamMark team={team}/><strong>{team.name}</strong></header><div>{seasonPlayers.filter(p=>p.team===team.short).map(p=><span key={p.id}>{p.shirt_no&&<b>{p.shirt_no}</b>}{p.name}</span>)}</div></section>)}</div>}</div>}
        {match.status === "finished" && <MatchEvents events={resultEventState.events} checked={resultEventState.checked}
          sport={match.sport} home={match.home} away={match.away}/>}
        <div className="ri-detail-actions">
          {match.status === "upcoming" && !!match.lineups?.length && <button className="ri-review-cta" onClick={() => setSection("Companion")}>Watch with your Companion</button>}
          {match.status === "upcoming" && <button disabled={watchlistBusy} aria-busy={watchlistBusy} className={`ri-review-cta${watchlist ? " saved" : ""}${watchlistBusy ? " is-busy" : ""}${match.lineups?.length ? " secondary" : ""}`} onClick={toggleWatchlist}><Bookmark size={17} fill={watchlist ? "currentColor" : "none"} /> {watchlist ? "In your watchlist" : "Add to watchlist"}</button>}
          {match.status === "live" && !match.lineups?.length && <button className="ri-live-lineup-cta" onClick={() => setSection("Companion")}>Watch with your Companion</button>}
          <button disabled={favoriteBusy} aria-busy={favoriteBusy} className={`ri-review-cta secondary${favorited ? " saved" : ""}${favoriteBusy ? " is-busy" : ""}`} onClick={toggleFavorite}><Heart size={17} fill={favorited ? "currentColor" : "none"}/> {favorited ? "Favourite" : "Add to favourites"}</button>
          <button className="ri-review-cta secondary" aria-expanded={listOpen} onClick={openLists}><ListPlus size={17}/> Add to list</button>
          {listOpen && <div className="ri-tag-picker">
            {myLists === null && <Loading label="Loading your lists"><SkeletonRows count={1} height={36} radius={999}/></Loading>}
            {myLists?.map(l => <button key={l.id} onClick={()=>addToList(l.id,l.title)}>{l.title}</button>)}
            {myLists?.length === 0 && <span>No lists yet — make one from the Rank sheet.</span>}
          </div>}
        </div>
      </> : match.status === "finished" ? <>
        {rating <= 0 ? <>
          <section className="ri-unrated-entry">
            <div className="ri-block-head"><small>YOUR ENTRY</small><b>NOT LOGGED</b></div>
            <h2>How was it?</h2>
            <Stars value={rating} onChange={rate} />
            <p>Tap to rate · half stars are fine</p>
          </section>
          <p className="ri-unrated-hint">Tags, players and a review open once there is a rating.</p>
        </> : <>
        {/* BUILD §9.4 / 2g: review girişin parçası; etiket ve oyuncular aynı
            ikinci blokta. Kalabalığın hükmü yalnız bundan sonra gelir. */}

        {/* 1 — YOUR ENTRY */}
        <section className="ri-entry-block">
          <div className="ri-block-head">
            <small>YOUR ENTRY</small>
            {dirty ? <b>UNSAVED CHANGES</b> : (match.my_watched_date || saveState === "saved") && <b className="ri-saved-flag">SAVED</b>}
          </div>
          <div className="ri-rating-panel">
            <Stars value={rating} onChange={rate}/>
            <ClassicStamp active={classic} onClick={() => setClassic(v => !v)}/>
          </div>
          {/* §11.1: inceleme girdinin bir ALANI; yazma ekrani (15c) girdiden
              acilir ve girdiye geri yazar. Oyuncu satiriyla ayni dil. */}
          <button type="button" className="ri-players-trigger ri-review-trigger" onClick={() => setComposerOpen(true)}>
            <span><small>YOUR REVIEW</small><strong>{review ? review.trim().slice(0, 60) + (review.trim().length > 60 ? "…" : "") : "Write about the night"}</strong></span>
            <b>{review ? "EDIT" : "WRITE"}</b>
          </button>
          <div className="ri-review-options">
            <label><input type="checkbox" checked={spoiler} onChange={e=>setSpoiler(e.target.checked)}/> Contains spoilers</label>
            <label><input type="checkbox" checked={rewatch} disabled={!!entryId} onChange={e=>setRewatch(e.target.checked)}/> {entryId ? (rewatch ? "Editing this rewatch" : "Editing this diary entry") : "Log as rewatch"}</label>
            <select value={visibility} onChange={e=>setVisibility(e.target.value)} aria-label="Review visibility">
              <option value="public">Public</option><option value="followers">Followers</option><option value="private">Private</option>
            </select>
          </div>
        </section>

        {/* 2 — TAGS & PLAYERS */}
        <section className="ri-entry-block">
          <div className="ri-block-head"><small>TAGS &amp; PLAYERS</small><b>{tags.length} of 3 tags</b></div>
          <div className="ri-tag-picker">{visibleTags.map(tag =>
            <button key={tag} className={tags.includes(tag) ? "active" : ""} onClick={() => toggleTag(tag)}>{tag}</button>)}
            <button className="ri-more-tags" onClick={()=>setShowMoreTags(v=>!v)}>{showMoreTags?"Less":"More"}</button></div>
          <div className="ri-block-head ri-players-summary-head"><small>PLAYERS</small><b>{potmId ? 1 : 0} POTM · {selectedRespect.length} RESPECT</b></div>
          {playerOptions.length > 0 ? <div className="ri-vote-block">
            <button type="button" className="ri-players-trigger" onClick={() => setPlayersOpen(true)}>
              <span><small>PLAYER OF THE MATCH &amp; RESPECT</small><strong>{selectedPotm?.name || "Choose a player"}{selectedRespect.length ? ` · ${selectedRespect.map(p => p.name).join(" · ")}` : ""}</strong></span>
              <b>CHOOSE</b>
            </button>
          </div> : <p className="ri-companion-note">{match.lineups?.length
            // Kadro gorunuyor ama oyunculara henuz bagli degil (saglayicidan yeniden cekiliyor):
            // "kadro gelince acilir" demek ekrandaki kadroyla celisirdi.
            ? "Player picks open once this lineup is linked to players."
            : "Player picks open when a confirmed match lineup is available."}</p>}
          <button disabled={cta.disabled} aria-busy={cta.busy}
            className={`ri-review-cta${cta.state === "saved" ? " saved" : ""}${cta.busy ? " is-busy" : ""}`} onClick={saveLog}>
            {/* §5: donen cark yok. Mesgul durum metinle ve aria-busy ile. */}
            <MessageCircle size={17}/>{" "}
            {cta.label}
          </button>
          {saveError && <p role="alert">{saveError}</p>}
        </section>
        </>}

        {/* 3 — WHAT EVERYONE ELSE SAID */}
        <section className="ri-entry-block">
          <div className="ri-block-head">
            <small>WHAT EVERYONE ELSE SAID</small>
            {/* Ekran 2g'deki "318 reviews >" — 5c'ye acilan tek kapi. */}
            {match.reviewCount > 0 ? <button className="ri-reviews-link" disabled={communityHidden} onClick={()=>setAllReviewsOpen(true)}>
              {match.reviewCount} {match.reviewCount === 1 ? "review" : "reviews"} <ChevronRight size={13}/>
            </button> : <span className="ri-reviews-count">0 reviews</span>}
          </div>
          {!hasCrowdData ? <p className="ri-crowd-empty">No community ratings yet. Your entry can be the first.</p>
          : communityHidden ? <CommunityVerdictGate spoiler={scoreHidden} onReveal={()=>{setRevealed(true);setCommunityRevealed(true)}}/> : <>
            <div className="ri-crowd-heat-head"><span>{crowdHeat === null ? "TOO FEW RATINGS" : NAMES[Math.round(crowdHeat) - 1]}</span><strong>{crowdHeat?.toFixed(1) ?? "—"}</strong></div>
            <div className="ri-crowd-heat-ramp" aria-label={crowdHeat === null ? "Too few ratings for heat" : `Community heat ${crowdHeat.toFixed(1)} out of 5`}>
              {heatSteps(crowdHeat).map((color, index) => <i key={index} style={{background:color}} />)}
            </div>
            <p className="ri-crowd-verdict">{(crowdRatings ?? 0).toLocaleString()} ratings
              {crowdHeat !== null && crowdRatings > 0 && ` · ${Math.round((Number(match.classic_count) || 0) / crowdRatings * 100)}% called it a Classic`}
              {Number(match.potm_votes) >= MIN_COMMUNITY_RATINGS && match.potm?.name && ` · POTM went to ${match.potm.name}`}
              {match.potm_votes != null && Number(match.potm_votes) < MIN_COMMUNITY_RATINGS && " · POTM: TOO FEW VOTES"}</p>
            <ReviewFeed reviews={match.reviews || []} onRefresh={onRefresh}/>
          </>}
        </section>
        {/* §9 tablosu "Full time, unrated -> Rate this match"; §9.3 "inert until
            there are stars". BUILD bu evre icin baska bir etiket vermiyor. */}
        {rating <= 0 && <div className="ri-unrated-footer"><button type="button" disabled>{RATE_CTA}</button></div>}
      </> : match.status === "upcoming" ? <section className="ri-appetite-entry">
        <div className="ri-block-head"><small>YOUR READ</small><b>MATCH PREVIEW</b></div>
        <h2>How much do you want to watch?</h2>
        <p>Share a 1–5 reading before kick-off. This is not a match rating.</p>
        {appetiteOpen(match, appetiteClock) && !appetiteClosed ? <>
          <div className="ri-appetite-choices" role="group" aria-label="Your interest in watching this match" aria-busy={appetiteBusy}>
            {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" disabled={appetiteBusy}
              aria-pressed={appetite === value} aria-label={`${value} out of 5`}
              onClick={() => chooseAppetite(value)}>{value}</button>)}
          </div>
          <p className="ri-appetite-note">{appetite ? `${appetite} / 5 · Tap again to clear your read.` : "A read also adds this match to your watchlist."}</p>
        </> : <p className="ri-appetite-note">Expected heat closes at kick-off.</p>}
        {appetiteError && <p className="ri-appetite-error" role="alert">{appetiteError}</p>}
      </section> : <div className="ri-empty-state"><Radio size={22}/><strong>Nothing to review yet</strong><span>Community opens when the match finishes. The Companion tab is live now.</span></div>}

      {allReviewsOpen && <AllReviews matchId={match.id}
        title={`${match.home.short} ${scoreHidden ? "vs" : match.score || "vs"} ${match.away.short}`}
        onOpenThread={id=>setThreadId(id)}
        onClose={()=>setAllReviewsOpen(false)}/>}
      {composerOpen && <ReviewComposer value={review} onChange={setReview} onClose={() => setComposerOpen(false)}
        matchLabel={`${match.home.short} ${scoreHidden ? "vs" : (match.score || "vs")} ${match.away.short}`}
        rating={rating} classic={classic}/>}
      {playersOpen && <PlayersPicker players={playerOptions} potmId={eligibleIds.has(potmId) ? potmId : null}
        respectIds={respect.filter(id => eligibleIds.has(id) && id !== potmId)}
        onPotm={choosePotm} onRespect={toggleRespect} onClose={() => setPlayersOpen(false)}
        matchLabel={`${match.home.short} ${scoreHidden ? "vs" : match.score || "vs"} ${match.away.short}`} />}
      {threadId && <ReviewThread entryId={threadId} onClose={()=>setThreadId(null)}/>}
      {actionNotice && <div key={actionNotice.id} role="status" className={`ri-action-toast ${actionNotice.tone}`} onAnimationEnd={() => setActionNotice(null)}>{actionNotice.message}</div>}
    </section>
  </div>;
}

function MatchDetailLoading({ onClose }) {
  const dialog = useDialog({ onClose, label: "Match" });
  return <div className="ri-sheet-wrap" onClick={onClose}><section {...dialog} className="ri-detail-sheet" onClick={event => event.stopPropagation()}>
    <SheetHandle onClose={onClose}/><Loading label="Loading match"><SheetSkeleton rows={3}/></Loading>
  </section></div>;
}

function ReviewFeed({ reviews, onRefresh }) {
  const reviewer = reviewerFromStorage(localStorage);
  const [replyAttempts] = useState(createReplyAttempts);
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
    const content = draft.trim();
    const clientId = replyAttempts.forSend(id, content);
    setCommentState(v => ({ ...v, [id]: "saving" }));
    try {
      await rankitApi.addComment(id, content, null, clientId);
      replyAttempts.confirmed(id, content);
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
    if (isOwnContent(review, reviewer) || busyLikes.includes(review.id)) return;
    const previous = reactions[review.id] || { liked: !!review.liked, likes: review.likes || 0 };
    const optimistic = { liked: !previous.liked, likes: Math.max(0, previous.likes + (previous.liked ? -1 : 1)) };
    setReactions(v => ({ ...v, [review.id]: optimistic }));
    setBusyLikes(v => [...v, review.id]);
    // `selection` diye bir cagri YOK (select / impact / success): TypeError
    // try'dan once atiyor, respect istegi hic gitmiyordu (0.3.0'dan beri).
    rankitHaptics.select();
    try {
      const result = await rankitApi.likeReview(review.id, optimistic.liked);
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
    <footer><button disabled={isOwnContent(r, reviewer) || busyLikes.includes(r.id)} aria-label={isOwnContent(r, reviewer) ? `Your review · ${reactions[r.id]?.likes ?? r.likes} respects` : `${reactions[r.id]?.liked ? "Unlike" : "Like"} review by ${r.username}`} className={reactions[r.id]?.liked ? "active" : ""} onClick={() => like(r)}><Heart size={12} fill={reactions[r.id]?.liked ? "currentColor" : "none"}/> {reactions[r.id]?.likes ?? r.likes}</button><button disabled={!!r.spoiler && !revealed.includes(r.id)} onClick={() => toggleComments(r.id)}><MessageCircle size={12}/> {r.comments}</button></footer>
    {openId === r.id && <div className="ri-comments">{commentState[r.id] === "loading" ? <Loading label="Loading replies"><SkeletonRows count={2} height={40} gap={6} radius={10}/></Loading> : r.spoiler && !revealed.includes(r.id) ? <p>Reveal the review to read its replies.</p> : (comments[r.id] || []).map(c => <p key={c.id}><strong>@{c.username}</strong> {c.content}</p>)}{commentState[r.id] === "error" && <p className="ri-inline-state error">Could not update replies. Try again.</p>}<div><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e=>e.key === "Enter" && addComment(r.id)} placeholder="Write a reply"/><button disabled={commentState[r.id] === "saving" || !draft.trim()} onClick={() => addComment(r.id)}><Send size={13}/></button></div></div>}
  </article>)}</div>;
}

function EntityDetail({ detail, onClose, onOpenMatch, onOpenEntity, onChanged, hideScores = false, ratedMatchIds }) {
  const { kind, data } = detail;
  const entityName = data?.[kind]?.name || data?.[kind]?.username || data?.[kind]?.title;
  const dialog = useDialog({ onClose, label: entityName || kind });
  if (!data) return <div className="ri-sheet-wrap" onClick={onClose}><section {...dialog} className="ri-detail-sheet ri-entity-sheet" onClick={e=>e.stopPropagation()}><SheetHandle onClose={onClose}/><Loading label="Loading"><SheetSkeleton rows={4}/></Loading></section></div>;
  const entity = data[kind];
  const title = entity?.name || entity?.username || entity?.title;
  const subtitle = kind === "player" ? `${entity.sport} · ${entity.team_name || "Free agent"}` : kind === "team" ? `${entity.sport} · ${entity.country || "Global"}` : kind === "member" ? "RankIt member" : `Curated by @${entity.username}`;
  const matchesForEntity = (data.matches || []).map(fromApiMatch);
  const targetType = kind === "member" ? "user" : kind;
  // Istenen durum ekranin gosterdiginin tersi; belirsiz istegin tekrari
  // bunu geri cevirmesin diye acikca gonderiliyor (§5.4).
  const toggleFollow = async () => { await rankitApi.follow({target_type:targetType,target_id:entity.id,notify:false}, !data.following); onChanged(kind,entity.id); };
  const toggleFavoriteEntity = async () => { await rankitApi.favorite({target_type:kind,target_id:entity.id}, !data.favorited); onChanged(kind,entity.id); };
  return <div className="ri-sheet-wrap" onClick={onClose}><section {...dialog} className="ri-detail-sheet ri-entity-sheet" onClick={e=>e.stopPropagation()}>
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
    {kind === "member" && <section className="ri-entity-section"><div className="ri-section-head"><div><small>RECENTLY</small><h2>Public diary</h2></div></div><div className="ri-member-diary">{data.entries.map(e=>{
      const shielded = hidesScore(hideScores, { status: "finished", my_rating: ratedMatchIds?.has(Number(e.match_id)) ? 1 : null });
      return <button key={e.id} onClick={()=>onOpenMatch({id:e.match_id})}><strong>{e.home_short} · {e.away_short}</strong>
        {!shielded && !e.review_withheld && <Stars value={e.rating || 0} compact/>}
        <span>{e.review_withheld ? "Contains spoilers — open match to read" : shielded ? "Review hidden — open match to reveal" : e.review || e.watched_date}</span>
      </button>;
    })}</div></section>}
    {matchesForEntity.length > 0 && <section className="ri-entity-section"><div className="ri-section-head"><div><small>{kind === "list" ? "COLLECTION" : "MATCH HISTORY"}</small><h2>{kind === "list" ? `${matchesForEntity.length} matches` : "Recent matches"}</h2></div></div><div className="ri-entity-matches">{matchesForEntity.map(m=><button key={m.id} onClick={()=>onOpenMatch(m)}><div className="ri-mini-crests"><TeamMark team={m.home}/><TeamMark team={m.away}/></div><span><strong>{m.home.short} vs {m.away.short}</strong><small>{m.competition} · {m.date}</small></span><ChevronRight size={15}/></button>)}</div></section>}
  </section></div>;
}

/* Ekran 3j — altın elmasın açtığı sheet.
   Genel bir arama DEĞİL. §7.2'ye dayanan üç bölüm: bu gece oynanıp
   puanlanmamışlar (puanlamak seriyi ayakta tutar), sonra son yedi günün
   yakalanmamışları. Arama en altta, çünkü çoğu zaman aradığın maç zaten
   ilk listede. */
function RankSheet({ onClose, onOpenMatch, hideScores }) {
  const dialog = useDialog({ onClose, label: "Rate a match" });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState(null);
  const [data, setData] = useState(null);
  // 3j: "Last 7 days · 18 unrated" KAPALI bir kart; liste dokununca acilir.
  const [catchupOpen, setCatchupOpen] = useState(false);
  const tz = -new Date().getTimezoneOffset();

  useEffect(() => {
    rankitApi.quickRate(tz).then(setData).catch(() => setData(null));
  }, [tz]);

  useEffect(() => {
    if (query.trim().length < 2) { setFound(null); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const r = await rankitApi.search(query.trim(), "Matches");
        setFound((r.matches || []).map(fromApiMatch));
      } catch { setFound([]); }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const night = nightStatus(data);
  const row = (m, note, streak = false) => (
    <button key={m.id} className={`ri-quick-row${streak ? " is-streak" : ""}`} onClick={() => { onClose(); onOpenMatch(m); }}>
      <CrestPair home={{ short: m.home.short, color: m.home.color, crest_url: m.home.crest_url }} away={{ short: m.away.short, color: m.away.color, crest_url: m.away.crest_url }}/>
      <span>
        <strong>{m.home.short} vs {m.away.short}</strong>
        <small>{note}</small>
      </span>
      <ChevronRight size={16}/>
    </button>
  );

  return <div className="ri-sheet-wrap" onClick={onClose}>
    <section {...dialog} className="ri-rank-sheet ri-quick-sheet" onClick={e => e.stopPropagation()}>
      <SheetHandle onClose={onClose}/>
      <div className="ri-rank-head">
        <div><small>RATE A MATCH</small><h2>What did you watch?</h2></div>
        <button onClick={onClose}><X size={20}/></button>
      </div>
      <label className="ri-search"><Search size={17}/>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search any match"/>
      </label>

      {found ? (
        <div className="ri-quick-group">
          <small>{found.length} FOUND</small>
          {found.map(m => row(m, `${m.competition} · ${m.dateOnly || m.date}`))}
        </div>
      ) : !data ? <Loading label="Loading matches"><SkeletonRows count={4}/></Loading> : <>
        {!!data.tonight.length && (
          <div className="ri-quick-group">
            <small>FROM TONIGHT · NOT YET LOGGED</small>
            {night.note && <p className={`ri-quick-note${night.tone === 'at-risk' ? ' at-risk' : ''}`} role="status">{night.note}</p>}
            {data.tonight.map(m => {
              const card = fromApiMatch(m);
              return row(card, night.keepsStreak
                ? <em>Keeps your streak alive</em>
                : `${hidesScore(hideScores, card) ? "Played" : "Full time"} · ${card.time}`, night.keepsStreak);
            })}
          </div>
        )}
        {!!data.catchup_total && (
          <div className="ri-quick-group">
            <small>OR CATCH UP</small>
            <button type="button" className="ri-quick-row ri-quick-catchup" aria-expanded={catchupOpen}
              onClick={() => setCatchupOpen(open => !open)}>
              <CalendarDays size={16}/>
              <span><strong>Last 7 days</strong></span>
              <b className="ri-quick-count">{data.catchup_total} unrated</b>
            </button>
            {catchupOpen && data.catchup.slice(0, 8).map(m => {
              const card = fromApiMatch(m);
              return row(card, `${card.competition} · ${card.dateOnly || card.date}`);
            })}
          </div>
        )}
        {!data.tonight.length && !data.catchup_total && (
          <div className="ri-empty-state"><CalendarDays size={22}/>
            <strong>Everything is logged</strong>
            <span>Nothing from the last seven days is waiting for a rating.</span></div>
        )}
      </>}
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

function FeedVerdict({ activity, ratedMatchIds, hideScores, quote = false, onOpen }) {
  const [revealed, setRevealed] = useState(false);
  const match = { status: "finished", my_rating: ratedMatchIds.has(Number(activity.match.id)) ? 1 : null, review_count: 1 };
  const scoreHidden = hidesScore(hideScores, match) && !revealed;
  const verdictCovered = communityVerdictCovered(match, { revealed });
  if (activity.reviewWithheld) {
    return <CommunityVerdictGate spoiler actionLabel="OPEN MATCH"
      message="Contains spoilers — open the match to read this review."
      onReveal={event => { event.stopPropagation(); onOpen?.(activity.match); }} />;
  }
  if (scoreHidden || verdictCovered) {
    return <CommunityVerdictGate spoiler={scoreHidden} onReveal={event => { event.stopPropagation(); setRevealed(true); }} />;
  }
  return <><Stars value={activity.rating || 0} compact />{quote ? <blockquote>"{activity.text}"</blockquote> : <span>{activity.text}</span>}</>;
}

function HomeView({ sport, setSport, hideScores, setHideScores, onOpen, onOpenCompetition, onNavigate, catalog = [], feed = [], ratedMatchIds, loading = false }) {
  const shown = useMemo(() => catalog.filter(m => sport === "All" || m.sport === sport), [sport, catalog]);
  const heroes = useMemo(() => shown.slice(0, 3), [shown]);
  const day = rankitDayContext();
  const carousel = useCarousel(loading ? 3 : heroes.length);
  return <>
    {/* 2b: kalkan acikken durum satiri + anahtar. Kontrolun kendisi 2a/2b'de
        basliktaki kalkan; ayrica bir "Hide scores" dugmesi tahtada yok (ayni
        ayar iki yerde duruyordu). Bayrak kapaliyken baslikta kalkan cizilmedigi
        icin eski dugme yalniz o yolda kaliyor. */}
    {RANKIT_NEW_CARD && hideScores && <div className="ri-shield-row">
      <Shield size={19} aria-hidden="true"/>
      <span><strong>Spoiler shield</strong><small>Scores, heat and reviews hidden</small></span>
      <button type="button" role="switch" aria-checked="true" aria-label="Spoiler shield" onClick={() => setHideScores(false)}><i/></button>
    </div>}
    <div className="ri-home-controls">
      <div className="ri-sport-scroll">
        {SPORTS.map(s => <button key={s} className={sport === s ? "active" : ""} onClick={() => setSport(s)}>{s}</button>)}
      </div>
      {!RANKIT_NEW_CARD && <button className={`ri-hide-score${hideScores ? " active" : ""}`} onClick={() => setHideScores(v => !v)}>
        {hideScores ? <EyeOff size={15} /> : <Eye size={15} />} Hide scores
      </button>}
    </div>
    {/* 2a: hero pill'lerin hemen altinda, ustunde baslik yok; gunun listesi
        hero'nun ALTINDA "TONIGHT · 4 MATCHES" olarak geliyor. */}
    <section className="ri-section ri-home-hero">
      <div className={`ri-hero-carousel${RANKIT_NEW_CARD ? " is-redesign" : ""}`} ref={carousel.ref}>{loading ? (RANKIT_NEW_CARD
          // 3k: iskelet kartin KENDI geometrisi, ayni yuvada -- veri gelince kayma yok.
          ? [0,1,2].map(i=><div key={i} className="ri-hero-slot"><SkeletonCard artHeight={150} crestSize={62} cut={22}/></div>)
          : [0,1,2].map(i=><MatchCardSkeleton key={i} featured/>)) : heroes.length ? heroes.map(m => RANKIT_NEW_CARD
        // Ekran 2a: hero kartı 323 genişlik / 150 sanat / 62 crest / 52 skor (§2.5).
        ? <div key={m.id} className="ri-hero-slot" role="button" tabIndex={0} onClick={e=>{if(!e.target.closest("button"))onOpen(m)}}
            onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onOpen(m)}}}
            aria-label={`${m.home.short} vs ${m.away.short}`}>
            <RedesignMatchCard {...toMatchCardProps(m,{hideScores,scoreSize:52,cardWidth:323,crestSize:62})} onOpenCompetition={m.competition_id ? ()=>onOpenCompetition?.(m.competition_id) : undefined} artHeight={150} crestSize={62} cut={22}/>
          </div>
        : <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={onOpen} onOpenCompetition={onOpenCompetition} featured />) : <div className="ri-day-empty-slot"><EmptyState title={`No ${sport === "All" ? "matches" : sport.toLowerCase()} in this RankIt day`}
          body="A RankIt day runs 11:00 to 11:00. Nothing is scheduled in this one yet."
          action="Find a match" onAction={() => onNavigate("Discover")} quiet/></div>}</div>
      {heroes.length > 1 && <div className="ri-carousel-dots" role="tablist" aria-label="Tonight's matches">
        {heroes.map((match, index) => <button key={match.id} type="button" role="tab"
          aria-selected={carousel.index === index}
          aria-label={`Match ${index + 1} of ${heroes.length}`}
          className={carousel.index === index ? "active" : ""}
          onClick={() => carousel.goTo(index)} />)}
      </div>}
    </section>
    {!loading && shown.length > 0 && <section className="ri-section ri-tonight">
      <div className="ri-label-row"><span>{tonightLabel(shown.length, day.daytime)}</span>
        <button type="button" onClick={() => onNavigate("Discover")}>See all</button></div>
      <div className="ri-tonight-list">{tonightRows(shown).slice(0, 6).map(m => {
        const st = tonightStatus(m);
        const card = toMatchCardProps(m);
        return <button type="button" key={m.id} className={`ri-tonight-row is-${st.kind}`} onClick={() => onOpen(m)}
          aria-label={`${m.home.name || m.home.short} vs ${m.away.name || m.away.short}, ${st.text}`}>
          <CrestDiamond side={32} color={card.homeColor} ink={card.homeCrestInk} abbr={card.homeAbbr} crestUrl={card.homeCrestUrl} badgeScale={0.3}/>
          <span><strong>{m.home.name || m.home.short} vs {m.away.name || m.away.short}</strong>
            <small>{st.kind === "live" && <i aria-hidden="true"/>}{st.text}</small></span>
          {st.action && <b>{st.action}</b>}
        </button>;
      })}</div>
    </section>}
    <section className="ri-section ri-friends-preview">
      {/* 2b: bu bolumun basligi bir etiket satiri, iri bir baslik degil. */}
      <div className="ri-label-row"><span>POPULAR ACROSS RANKIT</span>
        <button type="button" onClick={() => onNavigate("Activity")}>Activity</button></div>
      {loading && !feed.length && <Loading label="Loading reviews"><SkeletonRows count={2} height={72}/></Loading>}
      {!loading && !feed.length && <EmptyState title="No reviews yet" body="Reviews people write about matches show up here." action="Find a match" onAction={() => onNavigate("Discover")}/>}
      {feed.slice(0, 2).map(a => <div className="ri-activity-row" key={`${a.user}-${a.id || a.match?.id}`}>
        <div className="ri-avatar">{a.initials}</div><div><p><strong>{a.user}</strong> {a.action} <b>{a.match.home.short}–{a.match.away.short}</b></p><FeedVerdict activity={a} ratedMatchIds={ratedMatchIds} hideScores={hideScores} onOpen={onOpen}/></div>
      </div>)}
    </section>
  </>;
}

function DiscoverView({ hideScores, onOpen, onOpenCompetition, onOpenHunt, catalog = [], meta, listCatalog = [], onCreateList, onOpenList }) {
  // 2c ust bloğu: The Hunt ilerlemesi. Hata durumunda blok sessizce yok olur —
  // Discover'in kendi isi katalog, koleksiyon ozeti onun ustune bir katman.
  const [hunt, setHunt] = useState(null);
  useEffect(() => {
    let alive = true;
    rankitApi.collections().then(r => { if (alive) setHunt(r?.summary || null); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [sportFilter, setSportFilter] = useState(() => {
    try {
      const saved = localStorage.getItem("rankit:discover-sport");
      return ["All", "Basketball", "Football"].includes(saved) ? saved : "All";
    } catch { return "All"; }
  });
  const [competition, setCompetition] = useState("All");
  const [season, setSeason] = useState("All");
  const [status, setStatus] = useState("All");
  // 6c MINIMUM HEAT (null = filtre yok) ve soldan acilan cekmece.
  const [minHeat, setMinHeat] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pageCatalog, setPageCatalog] = useState(catalog);
  const [total, setTotal] = useState(catalog.length);
  // Ilk sayfa gelene kadar YUKLENIYOR: bos izgara "0 matches" gibi okunurdu.
  const [loading, setLoading] = useState(true);
  // Yukleme BASARISIZ mi oldu? Cevrimdisi ve onbellekte bir sey yokken bos
  // izgara "bu filtrelere uyan mac yok" diyordu -- yalan: bakilamadi bile.
  const [failed, setFailed] = useState(false);
  const requestVersion = useRef(0);
  // Turnuva sezondan BAGIMSIZ (sahibin karari, 2026-09-12): "Premier League
  // 25-26" ve "26-27" iki turnuva degil, bir turnuvanin iki sezonu. /meta
  // satirlari sezon basina geliyor; burada her turnuva BIR KEZ, sezonlariyla.
  // Cekmece (6c) tum aileleri alir ve kendi taslak sporuna gore suzer; turnuva
  // secince sezon en guncele kendiliginden gelir (FilterDrawer.pickCompetition).
  const allFamilies = useMemo(() => {
    const byKey = new Map();
    for (const c of meta?.competitions || []) {
      const key = `${c.sport}|${c.name}`;
      const fam = byKey.get(key) || { key, name: c.name, sport: c.sport, seasons: [] };
      if (!fam.seasons.includes(c.season)) fam.seasons.push(c.season);
      byKey.set(key, fam);
    }
    return [...byKey.values()].map(f => ({ ...f, seasons: [...f.seasons].sort().reverse() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [meta?.competitions]);
  useEffect(() => {
    try { localStorage.setItem("rankit:discover-sport", sportFilter); } catch { /* depolama kapalıysa filtre yine çalışır */ }
  }, [sportFilter]);
  const load = useCallback(async (offset = 0) => {
    const append = offset > 0;
    const version = ++requestVersion.current;
    setLoading(true); setFailed(false);
    try {
      const data = await rankitApi.catalog({ sport: sportFilter, competition, season, status: status === "All" ? "All" : status.toLowerCase(), minHeat, limit: 60, offset });
      if (version !== requestVersion.current) return;
      const incoming = (data.matches || []).map(fromApiMatch);
      setPageCatalog(v => append ? [...new Map([...v, ...incoming].map(m => [m.id, m])).values()] : incoming);
      setTotal(data.total || 0);
    } catch (error) {
      if (version === requestVersion.current) setFailed(error);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [sportFilter, competition, season, status, minHeat]);
  useEffect(() => {
    let active = true;
    const requests = requestVersion;
    // StrictMode'un ilk kurulum/temizlik çevriminde gereksiz istek başlatma.
    Promise.resolve().then(() => { if (active) load(); });
    return () => { active = false; requests.current++; };
  }, [load]);
  const clearFilters = () => { setSportFilter("All"); setCompetition("All"); setSeason("All"); setStatus("All"); setMinHeat(null); };
  const filters = { sport: sportFilter, status, minHeat, competition, season };
  const activeFilterCount = filterCount(filters);
  const applyFilters = f => { setSportFilter(f.sport); setStatus(f.status); setMinHeat(f.minHeat); setCompetition(f.competition); setSeason(f.season); };
  // Cekmecenin "Show N matches" sayisi: ayni uc, tek satir, gercek `total`.
  const countFor = useCallback(async draft => (await rankitApi.catalog({ ...toCatalogQuery(draft), limit: 1, offset: 0 })).total ?? 0, []);
  // Siralama katalog ucuna ait; her sayfa geldiginde ekrani yeniden dizme.
  const smartCatalog = pageCatalog;
  return <><div className="ri-page-title ri-discover-title"><div><small>FIND YOUR NEXT MATCH</small><h1>Discover</h1></div>
      {/* 6c: filtreler SOLDAN acilan cekmecede, sayfanin ustunde degil. Ikon
          filtre aktifken altin (tahta), degilken notr. */}
      <button type="button" className={`ri-filter-trigger${activeFilterCount ? " is-active" : ""}`} onClick={()=>setDrawerOpen(true)}
        aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : "Filters"} aria-haspopup="dialog">
        <SlidersHorizontal size={18}/>{!!activeFilterCount && <b>{activeFilterCount}</b>}
      </button>
    </div>
    {drawerOpen && <FilterDrawer value={filters} families={allFamilies} allSeasons={meta?.seasons || []}
      countFor={countFor} onApply={applyFilters} onClose={()=>setDrawerOpen(false)}/>}
    {/* 2c: The Hunt ozeti — 2m dizininin girisi. Yuzde yoksa (hic acilmis
        koleksiyon yok) blok hic cizilmiyor: "0%" bilmemekle ayni sey degil. */}
    {huntLine(hunt) && <button type="button" className="ri-hunt-summary" onClick={onOpenHunt}>
      <strong>{huntPercent(hunt) || "—"}</strong>
      <span><small>THE HUNT</small><b>{huntLine(hunt)}</b></span>
      <ChevronRight size={16}/>
    </button>}
    <section className="ri-section"><div className="ri-section-head"><div><small>{season === "All" ? "MATCH CATALOGUE" : season}</small><h2>{status === "All" ? "Matches to explore" : `${status} matches`}</h2></div>
      {/* Satir ici panel gidince sayi burada (2c altinda "148 MATCHES"). */}
      <span className="ri-discover-count" aria-live="polite">{loading ? "Updating…" : failed ? "" : `${total.toLocaleString("en-GB")} ${total === 1 ? "MATCH" : "MATCHES"}`}</span></div>
      {failed && <ErrorState error={failed} onRetry={()=>load()}/>}
      {loading && !pageCatalog.length && <Loading label="Loading matches"><div className={`ri-discover-grid${RANKIT_NEW_CARD ? " is-redesign" : ""}`}>
        {[0,1,2,3].map(i=><div key={i} className="ri-card-slot">{RANKIT_NEW_CARD ? <SkeletonCard compact crestSize={44} cut={14} scoreSize={30}/> : <MatchCardSkeleton/>}</div>)}
      </div></Loading>}
      {!loading && !failed && !pageCatalog.length && <EmptyState title="No matches for these filters" body="Nothing in the catalogue matches this sport, status, competition and season together." action="Clear filters" onAction={clearFilters}/>}
      <div className={`ri-discover-grid${RANKIT_NEW_CARD ? " is-redesign" : ""}`}>{smartCatalog.map(m => RANKIT_NEW_CARD
        // Ekran 2c, §2.5 preset: 155 genislik / crest 44 / skor 30, compact.
        ? <div key={m.id} className="ri-card-slot" role="button" tabIndex={0} onClick={e=>{if(!e.target.closest("button"))onOpen(m)}}
            onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onOpen(m)}}}
            aria-label={`${m.home.short} vs ${m.away.short}`}>
            <RedesignMatchCard {...toMatchCardProps(m,{hideScores,compact:true,scoreSize:30,cardWidth:155,crestSize:44})} onOpenCompetition={m.competition_id ? ()=>onOpenCompetition?.(m.competition_id) : undefined} crestSize={44} cut={14}/>
          </div>
        : <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={onOpen} onOpenCompetition={onOpenCompetition} />)}</div>
      {pageCatalog.length < total && <button className="ri-load-more" disabled={loading} aria-busy={loading} onClick={()=>load(pageCatalog.length)}>{loading?"Loading…":`Load more · ${pageCatalog.length}/${total}`}</button>}
      {/* Sonlu koleksiyon: hepsi yuklendiyse bunu SOYLER (§5). */}
      {!loading && !failed && total > 0 && pageCatalog.length >= total && <EndOfList count={total}/>}
    </section>
    <section className="ri-section"><div className="ri-section-head"><div><small>CURATED BY MEMBERS</small><h2>Popular lists</h2></div><button onClick={onCreateList}>Create</button></div>
      {!listCatalog.length && <EmptyState title="No lists yet" body="A list is a shelf of matches someone curates. Nobody has made one." action="Create a list" onAction={onCreateList}/>}
      <div className="ri-list-row">{listCatalog.map((l, index) => <button key={l.id || l.title} onClick={()=>l.id && onOpenList(l.id)} style={{"--list-accent":l.accent || ["#FFB11B","#3FB08C","#7B61FF"][index%3]}}><div className="ri-list-cover"><i/><i/><i/><i/></div><ListPlus size={18}/><strong>{l.title}</strong><span>{l.match_count ?? l.count ?? 0} matches · @{l.username || "member"}</span></button>)}</div>
    </section></>;
}

function ListCreator({ catalog, onClose, onCreated }) {
  const dialog = useDialog({ onClose, label: "Create a list" });
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
  return <div className="ri-sheet-wrap" onClick={onClose}><section {...dialog} className="ri-rank-sheet" onClick={e=>e.stopPropagation()}><SheetHandle onClose={onClose}/><div className="ri-rank-head"><div><small>YOUR COLLECTION</small><h2>Create a list</h2></div><button onClick={onClose}><X size={20}/></button></div><label className="ri-search"><ListPlus size={17}/><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="List title"/></label><label className="ri-check"><input type="checkbox" checked={ranked} onChange={e=>setRanked(e.target.checked)}/> Ranked list</label><div className="ri-rank-results">{catalog.map(m=><button key={m.id} className={selected.includes(m.id)?"selected":""} onClick={()=>toggle(m.id)}><div className="ri-mini-crests"><TeamMark team={m.home}/><TeamMark team={m.away}/></div><span><strong>{m.home.short} vs {m.away.short}</strong><small>{m.competition}</small></span><b>{selected.includes(m.id)?"✓":"+"}</b></button>)}</div><button className="ri-review-cta" disabled={saving || !title.trim()} onClick={save}>{saving?"Creating…":"Create list"}</button></section></div>;
}

function ActivityView({ initialShelf = false, diaryEntries = [], diaryLoaded = true, watchlist = [], listCatalog = [], friendFeed = [], ratedMatchIds, hideScores, onOpen, onOpenCompetition, onOpenList, onRank, onFind, onNavigate, onCreateList }) {
  const [sub, setSub] = useState(() => { if (initialShelf) return "Diary"; try { return localStorage.getItem("rankit:activity-tab") || "Friends"; } catch { return "Friends"; } });
  const [diaryView, setDiaryView] = useState(initialShelf ? "Cards" : "Timeline");
  // Sahibin karari (2026-09-23): Watched / Classics / Watchlist / Lists ve
  // siralama sayfanin ustunde pill olarak DURMUYOR; 2e'deki sag ust "Newest"
  // yazisina dokununca acilan barda. Sayfa tahtadaki sade haline donuyor.
  const [show, setShow] = useState("Watched");
  const [sort, setSort] = useState("Newest");
  const [watchSort, setWatchSort] = useState("Match date");
  const [barOpen, setBarOpen] = useState(false);
  // Defter BOSSA bos kalir (§5, 3l: "We won't fill it with anything you
  // didn't watch"). Eskiden bos bir defter mockData'daki maclarla -- ve
  // kullanicinin hic vermedigi 5 yildizlarla -- dolduruluyordu.
  const diaryRows = diaryEntries;
  const shownDiary = useMemo(() => sortDiary(filterDiary(diaryRows, show), sort), [diaryRows, show, sort]);
  const sortedWatchlist = useMemo(() => sortWatchlist(watchlist, watchSort), [watchlist, watchSort]);
  const activeSort = show === "Watchlist" ? watchSort : sort;
  const pickSort = value => show === "Watchlist" ? setWatchSort(value) : setSort(value);
  const hasViews = show === "Watched" || show === "Classics";
  const isHidden = e => hidesScore(hideScores, { status: e.status, my_rating: e.rating });
  useEffect(()=>{ try { localStorage.setItem("rankit:activity-tab",sub); } catch { /* tercih opsiyonel */ } },[sub]);
  const openMatch = match => onOpen(match);
  // 2e raf karti: 200px, crest 34, skor 26 (basketbol 21). Cerceve YOK --
  // kart kendi kesigini tasiyor (eski .ri-diary-cards kutusu ikinci bir
  // cerceve ciziyordu).
  const shelfSlot = (key, label, open, card) => <div key={key} className="ri-card-slot" role="button" tabIndex={0}
    aria-label={label} onClick={event=>{if(!event.target.closest("button"))open()}}
    onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==="Enter"||event.key===" ")){event.preventDefault();open()}}}>{card}</div>;
  return <><div className="ri-page-title ri-activity-title"><h1>Activity</h1>
      {/* 2e: TIMELINE | SHELF baslik satirinin saginda. Yeri sabit -- 2d'deki
          gibi ay satirina konsaydi, basinca yer degistiren bir dugme olurdu. */}
      {sub === "Diary" && hasViews && <div className="ri-view-toggle" role="group" aria-label="Diary view">
        <button type="button" aria-pressed={diaryView==="Timeline"} className={diaryView==="Timeline"?"active":""} onClick={()=>setDiaryView("Timeline")}>TIMELINE</button>
        <button type="button" aria-pressed={diaryView==="Cards"} className={diaryView==="Cards"?"active":""} onClick={()=>setDiaryView("Cards")}>SHELF</button></div>}
    </div>
    <div className="ri-segment is-tabs"><button className={sub === "Friends" ? "active" : ""} onClick={() => setSub("Friends")}>Friends</button><button className={sub === "Diary" ? "active" : ""} onClick={() => setSub("Diary")}>Diary</button></div>
    {sub === "Friends" ? RANKIT_NEW_CARD
      // 2q: takip ettiklerinin akisi, her kayit bir koleksiyon karti.
      ? <FriendsFeed hideScores={hideScores} onOpen={onOpen} onFind={onFind}/>
      : <div className="ri-activity-list">{friendFeed.map(a => <article key={a.id || `${a.user}-${a.match.id}`} onClick={event=>{if(!event.target.closest("button"))onOpen(a.match)}}><div className="ri-avatar">{a.initials}</div><div className="ri-feed-copy"><p><strong>{a.user}</strong> {a.action}</p><h3>{a.match.home.name || a.match.home.short} <span>vs</span> {a.match.away.name || a.match.away.short}</h3><FeedVerdict activity={a} ratedMatchIds={ratedMatchIds} hideScores={hideScores} onOpen={onOpen} quote/><small><MessageCircle size={12}/> Open match</small></div></article>)}{!friendFeed.length && <EmptyState title="No activity yet" body="Reviews from people you follow land here. RankIt won't suggest anyone — search for someone you know." action="Find people" onAction={onFind}/>}</div>
      : <div className="ri-diary">
        {/* 2e: "142 WATCHED · 11 CLASSICS" ve sagda "Newest" -- filtre barinin tetikleyicisi. */}
        <div className="ri-diary-meta">
          <span>{statLine({ show, entries: diaryRows, watchlist, lists: listCatalog })}</span>
          <button type="button" className={`ri-diary-sort${barOpen ? " is-open" : ""}`} aria-expanded={barOpen}
            aria-controls="ri-diary-bar" onClick={()=>setBarOpen(open=>!open)}>
            {triggerLabel(show, activeSort)}<ChevronDown size={12} aria-hidden="true"/></button>
        </div>
        {barOpen && <DiaryFilterBar id="ri-diary-bar" show={show} sort={activeSort} onShow={setShow} onSort={pickSort}/>}
      {show === "Watchlist" ? (!sortedWatchlist.length
          ? <EmptyState title="Nothing on your watchlist" body="Add an upcoming match and it waits here until kick-off." action="Browse upcoming" onAction={() => onNavigate?.("Discover")}/>
          : <><div className={`ri-diary-cards${RANKIT_NEW_CARD ? " is-redesign" : ""}`}>{sortedWatchlist.map(m => RANKIT_NEW_CARD
              ? shelfSlot(m.id, `${m.home.short} vs ${m.away.short}`, () => openMatch(m),
                <RedesignMatchCard {...toMatchCardProps(m,{hideScores,compact:true,scoreSize:m.sport==="Basketball"?21:26,cardWidth:155,crestSize:34})} onOpenCompetition={m.competition_id ? ()=>onOpenCompetition?.(m.competition_id) : undefined} crestSize={34} cut={14}/>)
              : <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={onOpen} onOpenCompetition={onOpenCompetition}/>)}</div>
            <EndOfList count={sortedWatchlist.length}/></>)
      : show === "Lists" ? (listCatalog.length
          // 3h'in satir dili: 68px, #151618, 14px yaricap.
          ? <div className="ri-dlists">{listCatalog.map(l=><button type="button" key={l.id} onClick={()=>onOpenList(l.id)}>
              <span><strong>{l.title}</strong><small>{(l.match_count ?? 0).toLocaleString("en-GB")} {l.match_count === 1 ? "match" : "matches"} · {l.ranked ? "Ranked" : "Unranked"}</small></span>
              <ChevronRight size={15} aria-hidden="true"/></button>)}</div>
          : <EmptyState title="No lists yet" body="A list is a shelf you curate — the matches you'd put in front of someone." action="Create a list" onAction={onCreateList}/>)
      : !diaryLoaded ? <Loading label="Loading your diary">{diaryView === "Cards" && RANKIT_NEW_CARD
          ? <div className="ri-diary-cards is-redesign">{[0,1,2,3].map(i=><div key={i} className="ri-card-slot"><SkeletonCard compact crestSize={34} cut={14} scoreSize={26}/></div>)}</div>
          : <SkeletonRows count={4} height={72} gap={0} radius={0}/>}</Loading>
      : !shownDiary.length ? (show === "Classics"
          ? <EmptyState title="No classics yet" body="Stamp a match Classic when it earns it. Only the ones you stamp show here." action="Rate a match" onAction={onRank}/>
          : <EmptyState title="Nothing in the diary yet" body="Rate one match and it starts here. We won't fill it with anything you didn't watch." action="Rate your first match" onAction={onRank}/>)
      : diaryView === "Timeline" ? <>
          {/* 2d: son 28 gece. Seridin sorusu "ne kadar izledim" -- Classics
              gorunumunde tum defteri gosterirdi, o yuzden yalniz Watched'ta. */}
          {show === "Watched" && <DiaryHeatStrip entries={diaryRows}/>}
          <DiaryTimeline entries={shownDiary} grouped={groupsByMonth(sort)} isHidden={isHidden} onOpen={onOpen}/>
          <EndOfList count={shownDiary.length}/></>
      : RANKIT_NEW_CARD
      ? <><div className="ri-diary-cards is-redesign">{shownDiary.map(e=>shelfSlot(e.id, `Open ${e.home_short} vs ${e.away_short}`, ()=>onOpen({id:e.match_id}),
          <RedesignMatchCard {...diaryToMatchCardProps(e,{compact:true,scoreSize:e.sport==="Basketball"?21:26,cardWidth:155,crestSize:34,hideScores})} crestSize={34} cut={14}/>))}</div>
        <EndOfList count={shownDiary.length}/></>
      : <div className="ri-diary-cards">{shownDiary.map(e=><div role="button" tabIndex={0} aria-label={`Open ${e.home_short} vs ${e.away_short}`} onClick={()=>onOpen({id:e.match_id})} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onOpen({id:e.match_id})}}} key={e.id} style={{"--card-a":e.home_color,"--card-b":e.away_color}}><small>{e.competition}</small><strong>{e.home_short}</strong><b>{isHidden(e) ? "—" : e.sport==="Basketball"?<>{e.home_score}<br/>{e.away_score}</>:<>{e.home_score} – {e.away_score}</>}</b><strong>{e.away_short}</strong><Stars value={e.rating||0} compact/><ClassicStamp active={!!e.classic&&!isHidden(e)} small/></div>)}</div>}</div>}
  </>;
}

function ProfileView({ profileData, diaryEntries = [], onOpen, hideScores, onHideScoresChange }) {
  // Ayarlar telefonda HİÇ yoktu (web'de vardı) — parite tek yönlü değil.
  const [tab, setTab] = useState("Overview");
  const [prefs, setPrefs] = useState(readPrefs);
  const setPref = patch => {
    setPrefs(writePrefs(patch));
    if (Object.hasOwn(patch, "hideScores")) onHideScoresChange?.(patch.hideScores);
  };
  const stats = profileData?.stats || {};
  const username = profileData?.user?.username || "";
  const initials = username.slice(0, 2).toUpperCase();
  const favourites = (profileData?.favorite_matches || []).map(fromApiMatch);
  const sports=[...new Set(diaryEntries.map(entry=>entry.sport))].filter(Boolean);
  const recentClassics=diaryEntries.filter(entry=>entry.classic).slice(0,3);
  // Ekran 3g tam ekran ve kendi basligi var; artik Profil'in bir sekmesi
  // degil, onun uzerine acilan bir yuzey. "no orphan rows" duz listeyle
  // uyusmuyordu.
  if (tab === "Settings") return (
    <Settings prefs={{ ...prefs, hideScores }} setPref={setPref}
      followCount={profileData?.stats?.following_sources ?? 0}
      onClose={() => setTab("Overview")} />
  );

  return <><div className="ri-profile-head"><div className="ri-profile-avatar">{initials}</div><div>{username && <small>@{username}</small>}<h1>{username || "Your profile"}</h1></div></div>
    <div className="ri-detail-tabs">{["Overview","Settings"].map(name=><button key={name} className={tab===name?"active":""} onClick={()=>setTab(name)}>{name}</button>)}</div>
    <div className="ri-profile-taste">{sports.map(sport=><span key={sport}>{sport}</span>)}{recentClassics.map(entry=><b key={entry.id}>CLASSIC · {entry.home_short}–{entry.away_short}</b>)}</div>
    <div className="ri-profile-stats"><div><strong>{stats.matches ?? 0}</strong><span>matches</span></div><div><strong>{stats.classics ?? 0}</strong><span>classics</span></div><div><strong>{stats.diary_count ?? 0}</strong><span>diary entries</span></div><div><strong>{stats.watchlist ?? 0}</strong><span>watchlist</span></div><div><strong>{stats.favorites ?? 0}</strong><span>favourites</span></div><div><strong>{stats.lists ?? 0}</strong><span>lists</span></div></div>
    <section className="ri-section"><div className="ri-section-head"><div><small>TASTE ON DISPLAY</small><h2>Four favourites</h2></div></div>{favourites.length ? <div className="ri-favourites">{favourites.map(m=><div key={m.id} onClick={()=>onOpen(m)} style={{"--fav-a":m.home.color,"--fav-b":m.away.color}}><span>{m.home.short}</span><b>VS</b><span>{m.away.short}</span></div>)}</div> : <div className="ri-empty-state"><Heart size={22}/><strong>No favourites yet</strong><span>Favourite a match to display your taste.</span></div>}</section>
    <section className="ri-section"><div className="ri-section-head"><div><small>RECENTLY</small><h2>Your latest rankings</h2></div></div>{diaryEntries.slice(0,6).map(e=><div className="ri-profile-log" key={e.id} onClick={()=>onOpen({id:e.match_id})}><strong>{e.home_short} - {e.away_short}</strong><Stars value={e.rating || 0} compact/>{!!e.classic && <ClassicStamp active small/>}</div>)}{!diaryEntries.length && <div className="ri-empty-state"><CalendarDays size={22}/><strong>Your diary is empty</strong><span>Rank a finished match to begin.</span></div>}</section>
  </>;
}

export default function RankItPrototype({ nativeBack = false, accountAction, accountActionLabel }) {
  const [collectible, setCollectible] = useState(null);
  const [tab, setTab] = useState("Home");
  const [activityShelf, setActivityShelf] = useState(false);
  const [profileRevision, setProfileRevision] = useState(0);
  const [sport, setSport] = useState("All");
  const [hideScores, setHideScores] = useState(() => {
    try {
      if (localStorage.getItem("rankit:prefs") === null) return localStorage.getItem("rankit:hide-scores") === "true";
    } catch { /* depolama kapalıysa ortak varsayılanı kullan */ }
    return readPrefs().hideScores;
  });
  const [detail, setDetail] = useState(null);
  const [competitionDetail, setCompetitionDetail] = useState(null);
  const [entityDetail, setEntityDetail] = useState(null);
  // 3h / 3i tam ekran YERLER, sheet degil: kendi verilerini cekiyorlar ve
  // geri tusu yiginina kendileri kaydoluyorlar (redesign/backStack.js).
  const [shelfId, setShelfId] = useState(null);
  const [memberId, setMemberId] = useState(null);
  // 2m/2n The Hunt: null = kapali; {collectionId} = dizin acik, istenirse
  // dogrudan bir koleksiyonla (alerts'ten gelen derin baglanti).
  const [hunt, setHunt] = useState(null);
  const openHunt = (collectionId = null) => setHunt({ collectionId });
  const [rankOpen, setRankOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [listCreatorOpen, setListCreatorOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  /* Zil noktası yalnız okunmamış varken (web zili gibi); sayfa kapanınca
     yeniden sorulur — okunanlar orada işaretlenir. */
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  useEffect(() => {
    if (notificationOpen) return undefined;
    let live = true;
    rankitApi.notifications(-new Date().getTimezoneOffset())
      .then(data => { if (live) setUnreadAlerts(Number(data?.unread) || 0); })
      .catch(() => { if (live) setUnreadAlerts(0); });
    return () => { live = false; };
  }, [notificationOpen]);
  const [quickSearch, setQuickSearch] = useState("");
  // Ornek veri YOK (§5: "no sample fixtures"). Kabuk eskiden mockData'daki
  // uydurma maclarla ve uydurma arkadas etkinligiyle aciliyordu; API
  // cevap vermezse kullanici var olmayan maclari goruyordu.
  const [catalog, setCatalog] = useState([]);
  const [feed, setFeed] = useState([]);
  const [apiError, setApiError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const refreshPersonalRef = useRef(null);
  const [networkState, setNetworkState] = useState(() => navigator.onLine ? "online" : "offline");
  const [tabDirection, setTabDirection] = useState(1);
  const [syncAge, setSyncAge] = useState("");
  const [diaryEntries, setDiaryEntries] = useState([]);
  const ratedMatchIds = useMemo(() => new Set(diaryEntries.filter(entry => Number(entry.rating) > 0).map(entry => Number(entry.match_id))), [diaryEntries]);
  // Defter YUKLENMEDEN bos durum gosterilmemeli: once iskelet, sonra ya
  // kayitlar ya da "Nothing in the diary yet".
  const [diaryLoaded, setDiaryLoaded] = useState(false);
  const [queued, setQueued] = useState(() => outbox().length);
  // §7.2 — seri SUNUCUDAN. Faz 2'de bunu istemcide hesaplıyordum çünkü arka
  // uçta streak yoktu; §7 yazıldıktan sonra iki hesap birbirine düştü
  // (sunucu 1, istemci 0). Dinlenme gecesi kuralı kullanıcının neyi takip
  // ettiğini bilmeyi gerektiriyor, o bilgi istemcide yok — vekil kaldırıldı.
  const [streakNights, setStreakNights] = useState(0);
  useEffect(() => {
    rankitApi.rank().then(d => setStreakNights(d?.streak?.current || 0)).catch(() => {});
  }, [diaryEntries]);
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
  const resultWasOpen = useRef(false);
  useEffect(() => {
    if (resultWasOpen.current && !collectible && !detail) document.querySelector('.ri-bottom-nav button.active')?.focus();
    resultWasOpen.current = !!collectible;
  }, [collectible, detail]);
  useEffect(() => { backStateRef.current = { detail, competitionDetail, entityDetail, rankOpen, searchOpen, searchExpanded, listCreatorOpen, notificationOpen, tab }; });

  useEffect(() => {
    if (!nativeBack) return undefined;
    let handle;
    let active = true;
    CapacitorApp.addListener("backButton", () => {
      const state = backStateRef.current;
      if (closeTopDialog()) { /* Android ve Escape ayni ust dialogu kapatir. */ }
      else if (state.listCreatorOpen) setListCreatorOpen(false);
      else if (state.notificationOpen) setNotificationOpen(false);
      else if (state.competitionDetail) setCompetitionDetail(null);
      else if (state.rankOpen) setRankOpen(false);
      else if (state.searchOpen) setSearchOpen(false);
      else if (state.detail) setDetail(null);
      else if (state.entityDetail) setEntityDetail(null);
      else if (state.searchExpanded) setSearchExpanded(false);
      // Kayitli tam ekran yuzeyler (Settings, liste, profil) BURADA: kabugun
      // sheet'leri z-20, bunlar z-19 -- sheet'ler hep ustte, once onlar
      // kapanir. Yuzeylerin kendi aralarindaki sirayi yigin tutuyor.
      else if (closeTopmost()) { /* en ustteki kayitli yuzey kapandi */ }
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
  useEffect(() => { writePrefs({ hideScores }); }, [hideScores]);
  // Kuyruk (ekran 3l): cevrimdisi yapilan puan telefonda bekler ve sunucuya
  // ulasilinca yuklenir. Tetik OLAYLAR: tarayicinin "online"i ve ilk basarili
  // istek ("rankit:network" online) -- acilista ag varsa ikincisi gelir.
  // Bir efekt degil: ag durumuna bakan bir efektten setState cagirmak
  // react-hooks/set-state-in-effect'in tam yakaladigi sey.
  const flushQueued = useCallback(async (retryFailed = false) => {
    const out = await flushOutbox({ retryFailed });
    if (out.sent) refreshPersonalRef.current?.().catch(() => {});
    if (out.rejected) setApiError(out.rejected === 1 ? "A saved rating could not be uploaded" : `${out.rejected} saved ratings could not be uploaded`);
    return out;
  }, []);
  useEffect(() => {
    // "3h ago": son basarili senkronun yasi. OLAY aninda hesaplaniyor, render'da
    // degil (Date.now() render'da saf olmayan bir cagri).
    const age = () => {
      let at = 0;
      try { at = Number(localStorage.getItem(LAST_SYNC_KEY)) || 0; } catch { /* bilinmiyor */ }
      if (!at) return "";
      const mins = Math.max(1, Math.round((Date.now() - at) / 60000));
      return mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
    };
    const offline = () => { setNetworkState("offline"); setSyncAge(age()); };
    const reconnect = () => setNetworkState("reconnecting");
    const network = event => {
      setNetworkState(event.detail);
      if (event.detail === "offline") setSyncAge(age());
      if (event.detail === "online" && outbox().length) flushQueued().catch(() => {});
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", reconnect);
    window.addEventListener("rankit:network", network);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", reconnect); window.removeEventListener("rankit:network", network); };
  }, [flushQueued]);   // flushQueued sabit (useCallback []); dinleyiciler bir kez kurulur
  useEffect(() => onOutboxChange(setQueued), []);
  const refreshCollections = async () => {
    const [listData, watchData] = await Promise.all([rankitApi.lists(), rankitApi.watchlist()]);
    setListCatalog(listData.lists || []);
    setProfileRevision(value => value + 1);
    setWatchlist((watchData.matches || []).map(fromApiMatch));
  };
  const refreshPersonal = async () => {
    const [diary, profile, home] = await Promise.all([rankitApi.diary(), rankitApi.profile(), loadRankitHome("All")]);
    setDiaryEntries(diary.entries || []);
    setDiaryLoaded(true);
    setProfileData(profile);
    setProfileRevision(value => value + 1);
    setCatalog((home.matches || []).map(fromApiMatch));
  };
  useEffect(() => {
    loadRankitHome("All").then(data => {
      setCatalog((data.matches || []).map(fromApiMatch));
      setFeed((data.activity || []).map(a => ({
        id: a.id, user: a.username, initials: a.username?.slice(0,2).toUpperCase(), action: "reviewed",
        match: { id: a.match_id, home: { short: a.home_short, name:a.home_name }, away: { short: a.away_short, name:a.away_name } }, rating: a.rating, text: a.review,
        reviewWithheld: !!a.review_withheld,
      })));
      setApiError("");
    }).catch(e => setApiError(e.message)).finally(() => setInitialLoading(false));
    rankitApi.diary().then(d=>setDiaryEntries(d.entries||[])).catch(()=>{}).finally(()=>setDiaryLoaded(true));
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
    // Liste ve uye bir YER: acilinca ustunu ortecek gecici sheet'ler kapanir,
    // yoksa z-19'daki tam ekran yuzey z-20'deki sheet'in ALTINDA kalirdi.
    if (kind === "list" || kind === "member") {
      setEntityDetail(null); setDetail(null); setCompetitionDetail(null);
      setSearchOpen(false); setNotificationOpen(false); setRankOpen(false);
      if (kind === "list") setShelfId(id); else setMemberId(id);
      return;
    }
    setEntityDetail({ kind, data: null });
    try {
      const loader = kind === "list" ? rankitApi.list : kind === "member" ? rankitApi.member : kind === "team" ? rankitApi.team : rankitApi.player;
      setEntityDetail({ kind, data: await loader(id) });
    } catch (error) {
      setEntityDetail(null);
      setApiError(error.message);
    }
  };
  // Render sirasinda ref'e YAZILMAZ (react-hooks/refs); her render sonrasi guncellenir.
  useEffect(() => { refreshPersonalRef.current = refreshPersonal; });
  const saveMatchLog = async ({ diary, matchId, potmId, respectIds }) => {
    const result = await saveRating({ diary, matchId, potmId, respectIds });
    if (!result.queued) {
      // Kayit tamamlandiktan sonra GET hatasi kaydetmeyi basarisiz yapmaz.
      refreshPersonal().catch(() => {});
      rankitApi.match(matchId).then(updatedMatch => setDetail(current =>
        current?.id === matchId ? fromApiMatch(updatedMatch) : current)).catch(() => {});
    }
    return result;
  };
  const refreshDetail = async () => {
    if (detail?.id) setDetail(fromApiMatch(await rankitApi.match(detail.id)));
  };
  const toggleWatchlist = async (id, on) => {
    const result = await rankitApi.toggleWatchlist(id, on);
    rankitHaptics.success();
    refreshCollections().catch(() => {});
    return result;
  };
  const toggleFavorite = async (value, on) => {
    const result = await rankitApi.favorite(value, on);
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
  const showCollectible = result => {
    setDetail(null); setRankOpen(false); setSearchOpen(false); setCompetitionDetail(null);
    setEntityDetail(null); setNotificationOpen(false); setShelfId(null); setMemberId(null);
    setCollectible(result);
  };
  // 2j: 6a'da secilen skin defterdeki AYNI kaydi boyar; liste yeniden
  // yuklenmeden once yerelde guncellenir (raf 6a'dan donunce eski skinle kaliyordu).
  const skinApplied = (entryId, skin) => {
    setDiaryEntries(list => list.map(e => e.id === entryId ? { ...e, skin } : e));
    setProfileRevision(value => value + 1);
  };
  if (collectible) return <CollectibleResult result={collectible} hideScores={hideScores} onSkinApplied={skinApplied}
    onDone={()=>setCollectible(null)} onEdit={()=>{setDetail(collectibleEditMatch(collectible));setCollectible(null);}}/>;
  return <div className={`rankit-app${headerHidden ? " header-hidden" : ""}${networkState === "offline" ? " is-offline" : ""}${RANKIT_NEW_CARD && tab === "Profile" ? " ri-profile6-mode" : ""}`}>
    <header className="ri-header"><div className="ri-brand"><RankItMark size={24}/><div><strong aria-label="RankIt">RANK<span>IT</span></strong><small>BY PRIMARY ARCH</small></div></div>
      <div className="ri-header-tools">
        {/* Ekran 2a: seri halkası ve spoiler kalkanı başlıkta, bildirimin solunda. */}
        {RANKIT_NEW_CARD && <StreakRing nights={streakNights}/>}
        {RANKIT_NEW_CARD && <button className={`ri-shield${hideScores?" on":""}`} aria-pressed={hideScores}
          aria-label={hideScores?"Show scores":"Hide scores"} onClick={()=>setHideScores(v=>!v)}>
          <Shield size={19} strokeWidth={1.8}/></button>}
        <button aria-label={unreadAlerts ? `Open notifications, ${unreadAlerts} unread` : "Open notifications"}
          onClick={()=>setNotificationOpen(true)}><Bell size={19}/>{unreadAlerts > 0 && <i aria-hidden="true"/>}</button>
      </div></header>
    <main className="ri-main" onScroll={handleMainScroll}>
      {/* 3l — ag gidince: kirmizi cizgili serit, kartlar %62 (bkz. .is-offline),
          ve kuyrukta puan varsa "telefonda saklandi" sozu + 44px Retry. */}
      {networkState === "offline" && <div className="ri-offline" role="status"><i aria-hidden="true"/><span>OFFLINE — SHOWING YOUR LAST SYNC{syncAge ? ` · ${syncAge.toUpperCase()}` : ""}</span></div>}
      {queued > 0 && <div className="ri-outbox" role="status">
        <p>{queued} {queued === 1 ? "rating is" : "ratings are"} saved on this phone, waiting to upload. If sign-in or review is needed, your saved changes stay here.</p>
        <button type="button" className="ri-outbox-retry" onClick={() => flushQueued(true).catch(error => setApiError(error.message))}>Retry upload</button>
      </div>}
      {apiError && networkState === "online" && <div className="ri-api-note">Could not refresh · {apiError}</div>}
      <div key={tab} className={`ri-tab-stage ${tabDirection > 0 ? "forward" : "backward"}`}>
        {tab === "Home" && (
          <HomeView sport={sport} setSport={setSport} hideScores={hideScores} setHideScores={setHideScores} onOpen={openMatch} onOpenCompetition={openCompetition} onNavigate={name=>{setTabDirection(TABS.findIndex(x=>x[0]===name)-TABS.findIndex(x=>x[0]===tab));setTab(name)}} catalog={catalog} feed={feed} ratedMatchIds={ratedMatchIds} loading={initialLoading}/>
        )}
        {tab === "Discover" && (
          <DiscoverView hideScores={hideScores} onOpenHunt={()=>openHunt()} onOpen={openMatch} onOpenCompetition={openCompetition} catalog={catalog} meta={catalogMeta} listCatalog={listCatalog} onCreateList={()=>setListCreatorOpen(true)} onOpenList={id=>openEntity("list",id)}/>
        )}
        {tab === "Activity" && (
          <ActivityView initialShelf={activityShelf} diaryEntries={diaryEntries} diaryLoaded={diaryLoaded} watchlist={watchlist} listCatalog={listCatalog} friendFeed={feed} ratedMatchIds={ratedMatchIds} hideScores={hideScores} onOpen={openMatch} onOpenCompetition={openCompetition} onOpenList={id=>openEntity("list",id)}
            onRank={()=>setRankOpen(true)} onFind={()=>setSearchOpen(true)} onCreateList={()=>setListCreatorOpen(true)}
            onNavigate={name=>{setTabDirection(TABS.findIndex(x=>x[0]===name)-TABS.findIndex(x=>x[0]===tab));setTab(name)}}/>
        )}
        {tab === "Profile" && (
          RANKIT_NEW_CARD ? <ProfileRoot key={ratingAccount()} revision={profileRevision} onOpenHunt={()=>openHunt()} onOpen={openMatch} accountAction={accountAction} accountActionLabel={accountActionLabel}
            hideScores={hideScores}
            onHideScoresChange={setHideScores}
            onShelf={()=>{setActivityShelf(true);setTabDirection(-1);setTab("Activity")}}
            onFind={()=>setSearchOpen(true)} onRank={()=>setRankOpen(true)}
            onOpenList={id=>openEntity("list",id)} onCreateList={()=>setListCreatorOpen(true)}/>
            : <ProfileView profileData={profileData} diaryEntries={diaryEntries} onOpen={openMatch} hideScores={hideScores} onHideScoresChange={setHideScores}/>
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
      <MatchDetail key={`${ratingAccount()}:${detail.id}`} match={detail} hideScores={hideScores} onClose={() => setDetail(null)} onSave={saveMatchLog} onResult={showCollectible} onToggleWatchlist={toggleWatchlist} onToggleFavorite={toggleFavorite} onRefresh={refreshDetail} onOpenCompetition={openCompetition}/>
    )}
    {competitionDetail && <CompetitionDetail detail={competitionDetail.data} hideScores={hideScores} onClose={()=>setCompetitionDetail(null)} onOpenMatch={openMatch} onOpenPlayer={id=>openEntity("player",id)}/>}
    {entityDetail && <EntityDetail detail={entityDetail} onClose={()=>setEntityDetail(null)} onOpenMatch={openMatch} onOpenEntity={openEntity} onChanged={openEntity} hideScores={hideScores} ratedMatchIds={ratedMatchIds}/>}
    {shelfId && <ListShelf listId={shelfId} hideScores={hideScores} onClose={()=>setShelfId(null)}
      onOpenMatch={m=>openMatch(fromApiMatch(m))} onOpenMember={id=>setMemberId(id)}/>}
    {memberId && <MemberProfile memberId={memberId} hideScores={hideScores} onClose={()=>setMemberId(null)}
      onOpenMatch={m=>openMatch(fromApiMatch(m))}/>} 
    {hunt && <HuntIndex collectionId={hunt.collectionId} onCollection={id=>setHunt({collectionId:id})}
      hideScores={hideScores} onClose={()=>setHunt(null)} onOpenMatch={m=>openMatch(fromApiMatch(m))}/>}
    {rankOpen && (
      <RankSheet onOpenMatch={openMatch} hideScores={hideScores} onClose={() => setRankOpen(false)}/>
    )}
    {/* Ekran 3e. Eski GlobalSearch alti kutulu bir filtre satiri ve ayrimsiz
        bir liste tasiyordu; 3e tek alan + gruplu sonuc istiyor. */}
    {searchOpen && <SearchSheet initialQuery={quickSearch} hideScores={hideScores} onClose={() => setSearchOpen(false)}
      onOpenMatch={m => {setSearchOpen(false);openMatch(fromApiMatch(m))}}
      onOpenEntity={(kind,id) => {setSearchOpen(false);openEntity(kind,id)}}/>} 
    {listCreatorOpen && <ListCreator catalog={catalog} onClose={()=>setListCreatorOpen(false)} onCreated={refreshCollections}/>} 
    {notificationOpen && (
      /* Ekran 3f. Eskisi arkadas akisi + izleme listesini istemcide birlestirip
         bildirim gibi gosteriyordu; artik gercek olaylar ve turetilmis
         durumlar var (bkz. api/rankit_notify.py). */
      <Alerts ratedMatchIds={ratedMatchIds} onClose={()=>setNotificationOpen(false)}
        onOpenMatch={id=>{setNotificationOpen(false);openMatch({id})}}
        onOpenList={id=>{setNotificationOpen(false);openEntity("list",id)}}
        onOpenCollection={id=>{setNotificationOpen(false);openHunt(id)}}/>
    )}
    {exitNotice && <div role="status" className="ri-action-toast success">Press back again to exit</div>}
  </div>;
}
