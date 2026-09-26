import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Compass, X, ChevronLeft, ChevronRight, MessageSquare, Heart, SlidersHorizontal,
} from "lucide-react";
import { SEO } from "../../hooks/useSEO";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { hidesScore, readPrefs, writePrefs, resolveBroadcastCountry } from "../rankitPrefs";
import { WallCard, Stars, formatWhen } from "./cards";
import { WebHeader, WebRail, PhoneTabs } from "./WebShell";
import { useShellData } from "./useShellData";
import FollowFeed from "./FollowFeed";
import Inspector from "./Inspector";
import CollectibleOverlay from "./CollectibleOverlay";
import QuickRate from "./QuickRate";
import { CardHoverContext, useCardHover } from "./cardHover";
import ShelfPage from "./ShelfPage";
import HeatMapPage from "./HeatMapPage";
import ReviewsPage from "./ReviewsPage";
import CompetitionPage from "./CompetitionPage";
import ClubInspector from "./ClubInspector";
import SearchPage from "./SearchPage";
import ProfilePage from "./ProfilePage";
import PeoplePage from "./PeoplePage";
import ListsPage from "./ListsPage";
import HuntPage from "./HuntPage";
import ActivityPage from "./ActivityPage";
import DiscoverFilters from "./DiscoverFilters";
import NotificationsMenu from "./NotificationsMenu";
import WelcomePage from "./WelcomePage";
import SkinPage from "./SkinPage";
import { WallSkeleton } from "./Skeletons";
import { useNetwork } from "./useNetwork";
import Sheet from "./Sheet";
import RankSheet from "./RankSheet";
import { PageHead, SortBar } from "./PageParts";
import { DISCOVER_SORTS, activeFilterCount, discoverEmpty, discoverEyebrow, discoverFilters, discoverParams } from "./pagesView";
import { rankitDayContext, tonightLabel, tonightRows } from "../redesign/homeTonight";
import CommunityVerdictGate from "../redesign/CommunityVerdictGate";
import { communityVerdictCovered } from "../redesign/heat";
import "../rankit.css";
import "./rankit-web.css";
import "./rankit-inspector.css";
import "./rankit-pages.css";
import "./rankit-responsive.css";

// ── RankIt web yüzeyi ────────────────────────────────────────────────────────
// Görsel dünya telefondan devralınıyor; masaüstünün getirdiği tek şey aynı anda
// daha çok kart görebilmek. Yapı "The Wall": sol ray, ayakta duran filtre rayı,
// ve kartların duvarı. Kart açılınca sayfa değişmiyor — duvarın üstüne denetçi
// yükseliyor, telefonun sayfa açması gibi.
//
// Download rayın beşlisine DAHİL DEĞİL, dibinde ve kendi çizgisinin altında:
// ürüne girmenin değil, ürünü almanın yolu.

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
    // Üçü de eksikti — API zaten gönderiyordu (_match_dict), toCard hiç
    // okumuyordu. Sonuç: her kartın ayak satırı, gerçekten hiçbir bilgisi
    // olmasa bile tarihi ÜÇÜNCÜ kez tekrarlıyordu (üstte tam tarih, ortada
    // tekrar tam tarih, altta yine tam tarih) — yayın/tur bilgisi olsaydı
    // hiç kullanılmıyordu.
    broadcaster: m.broadcaster,
    editorial: !!m.editorial,
    dominantTag: m.dominant_tag,
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

/* ── Duvar ────────────────────────────────────────────────────────────────── */

function Wall({ matches, loading, error, onOpen, empty, hideScores = false }) {
  // Hata varken iskelet göstermek sonsuz parıltı demekti: yükleme dalı hatayı
  // render etmeden dönüyordu ve başarısız bir istek asla kullanıcıya ulaşmıyordu.
  // 8d: iskelet kartın gerçek geometrisiyle — veri gelince sayfa zıplamaz.
  if (loading && !error) return <WallSkeleton />;
  return (
    <div className="riw-wall">
      {error && <div className="riw-note">{error}</div>}
      {matches.map((m) => <WallCard key={m.key ?? m.id} card={m} onOpen={onOpen} hideScores={hideScores} />)}
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

/* ── Carousel ─────────────────────────────────────────────────────────────────
   Telefonun hero şeridinin masaüstü karşılığı. Aynı mekanik (scroll-snap +
   kaydırma pozisyonundan hesaplanan aktif kart), masaüstünün ek verdiği tek
   şey: fare için ok düğmeleri. Aktif kart HER ZAMAN kaydırma pozisyonundan
   okunuyor — ok, nokta ve doğrudan kaydırma tek bir doğruyu paylaşsın. */
function useCarousel(count) {
  const ref = useRef(null);
  const [index, setIndex] = useState(0);
  // 7a üç kartı yan yana gösteriyor: son üçlü göründüğünde index son karta
  // varmadan kaydırma biter. "İleri" oku orada kapanmalı.
  const [maxed, setMaxed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || count < 1) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const child = el.children[0];
      if (!child) return;
      const step = child.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || 0);
      if (step <= 0) return;
      setIndex(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / step))));
      setMaxed(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    el.addEventListener("scroll", onScroll, { passive: true });
    read();
    return () => { el.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [count]);

  const goTo = (i) => {
    const el = ref.current;
    const target = Math.max(0, Math.min(count - 1, i));
    const child = el?.children[target];
    if (!el || !child) return;
    // İndeksi hemen ilerlet: yumuşak kaydırma bitene kadar beklemek noktayı
    // tıklamanın gerisinde bırakıyor, ve kaydırma dinleyicisi rAF'a bağlı —
    // sekme arka plandayken rAF durur, gösterge donardı. Dinleyici yine
    // çalışıyor ve elle kaydırmada bu değeri düzeltiyor.
    setIndex(target);
    el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  return { ref, index, goTo, atStart: index <= 0, atEnd: maxed || index >= count - 1 };
}

/* 7a "TONIGHT · 4 MATCHES": etiket satırı + sağda 30px iki ok, altında
   yan yana üç kart. Noktalar yok (tahtada yok); kaydırma, ok ve klavye
   tek doğruyu paylaşıyor. */
function Carousel({ items, label, hideScores, onOpen }) {
  const { ref, index, goTo, atStart, atEnd } = useCarousel(items.length);
  return (
    <section className="riw-tonight" aria-label={label}>
      <div className="riw-label-row">
        <h2>{label}</h2>
        {items.length > 1 && (
          <div className="riw-arrows">
            <button type="button" onClick={() => goTo(index - 1)} disabled={atStart} aria-label="Previous match"><ChevronLeft size={13} /></button>
            <button type="button" onClick={() => goTo(index + 1)} disabled={atEnd} aria-label="Next match"><ChevronRight size={13} /></button>
          </div>
        )}
      </div>
      <div className="riw-carousel" ref={ref}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
        }}>
        {items.map((m) => <WallCard key={m.id} card={m} hideScores={hideScores} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

/* Topluluk yorumu satırı — /home ve Activity aynı şekli paylaşıyor. */
function ReviewRow({ row, onOpen, onOpenEntity, ratedMatchIds, hideScores = false }) {
  const [revealed, setRevealed] = useState(false);
  const initial = (row.username || "?").slice(0, 1).toUpperCase();
  const teams = `${row.home_short || row.home_name} v ${row.away_short || row.away_name}`;
  const match = { status: "finished", review_count: 1, my_rating: ratedMatchIds?.has(Number(row.match_id)) ? 1 : null };
  const scoreHidden = hidesScore(hideScores, match) && !revealed;
  const verdictCovered = communityVerdictCovered(match, { revealed });
  return (
    <article className="riw-review" onClick={event => { if (!event.target.closest("button")) onOpen?.(row.match_id); }}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (!e.target.closest("button") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen?.(row.match_id); } }}>
      <span className="riw-avatar">{initial}</span>
      <div>
        <p>
          {/* Satırın kendisi maçı açıyor; kullanıcı adı üyeyi açar, o yüzden
              tıklama yukarı kabarmamalı. */}
          {row.user_id && onOpenEntity ? (
            <strong><button type="button" className="riw-linkish"
              onClick={(e) => { e.stopPropagation(); onOpenEntity("member", row.user_id); }}>
              @{row.username}
            </button></strong>
          ) : <strong>@{row.username}</strong>}
          {" "}rated <b>{teams}</b>
        </p>
        {row.review_withheld ? <CommunityVerdictGate spoiler actionLabel="OPEN MATCH"
          message="Contains spoilers — open the match to read this review."
          onReveal={event => { event.stopPropagation(); onOpen?.(row.match_id); }} />
          : scoreHidden || verdictCovered ? <CommunityVerdictGate spoiler={scoreHidden} onReveal={event => { event.stopPropagation(); setRevealed(true); }} /> : <>
          {typeof row.rating === "number" && row.rating > 0 && <Stars value={row.rating} compact />}
          {row.review && <blockquote>{row.review}</blockquote>}
        </>}
      </div>
    </article>
  );
}

/* ── Home ─────────────────────────────────────────────────────────────────────
   Ekran 7a. Home KATALOG değil (Discover o): bu RankIt günü — telefonla AYNI
   pencere (11:00–11:00, `rankitDayContext`), canlı önce — ve takip
   ettiklerinin ne dediği. Oturum yoksa takip akışı yok; yerine herkese açık
   incelemeler (telefonun 2a'daki "POPULAR ACROSS RANKIT"i). Spor çipleri ve
   "Hide scores" düğmesi 7a'da yok: kalkan başlıkta, filtre Discover'da. */
function HomeView({ onOpenMatch, hideScores, ratedMatchIds, accountId, refreshToken, onOpenEntity }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [day] = useState(() => rankitDayContext());

  useEffect(() => {
    let alive = true;
    const region = resolveBroadcastCountry();
    rankitApi.home("All", day.start, day.end, region.supported ? region.code : "")
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => { alive = false; };
  }, [day]);

  const tonight = tonightRows(data?.matches || []).map(toCard);
  const activity = data?.activity || [];
  const label = tonightLabel(tonight.length, day.daytime);

  return (
    <div className="riw-home">
      {err && <div className="riw-note">{err}</div>}

      {!data && !err && (
        <section className="riw-tonight" aria-busy="true" aria-label="Loading tonight">
          <div className="riw-label-row"><h2>{day.daytime ? "TODAY" : "TONIGHT"}</h2></div>
          <WallSkeleton count={3} className="riw-carousel" />
        </section>
      )}

      {data && (tonight.length
        ? <Carousel items={tonight} label={label} hideScores={hideScores} onOpen={(x) => onOpenMatch(x.id)} />
        : (
          <section className="riw-tonight">
            <div className="riw-label-row"><h2>{label}</h2></div>
            <Empty icon={Compass} title="No matches in this RankIt day"
              note="A RankIt day runs 11:00 to 11:00. Nothing is scheduled in this one yet — Discover has the full catalog." />
          </section>
        ))}

      {accountId != null ? (
        <section className="riw-home-section">
          <div className="riw-label-row">
            <h2>FROM PEOPLE YOU FOLLOW</h2>
            <Link to="/rankit/activity" className="riw-label-link">All activity ›</Link>
          </div>
          <FollowFeed accountId={accountId} refreshToken={refreshToken} hideScores={hideScores}
            onOpenMatch={onOpenMatch} onOpenEntity={onOpenEntity} />
        </section>
      ) : data && (
        <section className="riw-home-section">
          <div className="riw-label-row">
            <h2>POPULAR ACROSS RANKIT</h2>
            <Link to="/rankit/activity" className="riw-label-link">Activity ›</Link>
          </div>
          <div className="riw-review-list">
            {activity.map((r) => <ReviewRow key={r.id} row={r} onOpen={onOpenMatch} onOpenEntity={onOpenEntity} ratedMatchIds={ratedMatchIds} hideScores={hideScores} />)}
            {!activity.length && (
              <Empty icon={MessageSquare} title="No reviews yet"
                note="Be the first to write one — open a finished match and rate it." />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Varlık çekmecesi: turnuva / oyuncu / takım / üye / liste ─────────────────
   Beş uç da arka uçta vardı ve telefon hepsini kullanıyordu; web hiçbirini
   çağırmıyordu. Telefonun EntityDetail'inin karşılığı, aynı .ri-entity-*
   sınıflarıyla (bunlar rankit.css'te — web onu yüklüyor).

   DİKKAT: telefonun fikstür listesi, yalnızca rankit-v030.css'te tanımlı
   olan kendi sınıfını kullanıyor ve web o dosyayı YÜKLEMİYOR. Burada
   webin kendi Wall'u kullanılıyor — hem stilsiz kalmıyor hem geniş ekranda
   zaten daha doğru. (Aynı tuzağa .ri-live-tag'de düşülmüştü.) */
// Turnuva 8c sayfası, kulüp 12a Inspector'ı, liste 12b sayfası — çekmecede
// oyuncu ve üye kaldı.
const ENTITY_LOADER = {
  player: rankitApi.player,
  member: rankitApi.member,
};

function EntityDrawer({ kind, id, onClose, onOpenMatch, onOpenEntity, hideScores, ratedMatchIds }) {
  const { isLoggedIn } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [following, setFollowing] = useState(false);
  const [favorited, setFavorited] = useState(false);

  // Not: kind/id değişince state'i burada SIFIRLAMIYORUZ — çağrı yerinde
  // key veriliyor, React bileşeni baştan kuruyor. Efekt içinde setState ile
  // sıfırlamak fazladan bir render turu ve React'in önerdiği yol değil.
  // Bilinmeyen tür bir YÜKLEME hatası değil, programlama hatası — efekt içinde
  // state'e yazmak yerine doğrudan render'da gösteriliyor.
  const load = ENTITY_LOADER[kind];
  useEffect(() => {
    let alive = true;
    if (!load) return undefined;
    load(id)
      .then((d) => {
        if (!alive) return;
        setData(d); setFollowing(!!d.following); setFavorited(!!d.favorited);
      })
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => { alive = false; };
  }, [load, id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entity = data && (data[kind] || null);
  const matches = useMemo(() => {
    if (!data) return [];
    // Her uç ilişkili maçları FARKLI adla döndürüyor.
    return (data.matches || data.fixtures || []).map(toCard);
  }, [data]);

  const subtitle = !entity ? "" :
    kind === "player" ? `${entity.sport || ""} · ${entity.team_name || "Free agent"}`.trim()
    : kind === "team" ? `${entity.sport || ""} · ${entity.country || "Global"}`.trim()
    : kind === "member" ? "RankIt member"
    : kind === "list" ? `${entity.match_count ?? matches.length} matches · ${entity.ranked ? "Ranked" : "Unranked"}`
    : `${entity.country || ""} · ${entity.season || ""}`.replace(/^ · | · $/, "");

  const title = entity?.name || entity?.username || entity?.title || "";
  // follow hedef türü üyede 'user', diğerlerinde kendi türü.
  const followTarget = kind === "member" ? "user" : kind;

  const toggleFollow = async () => {
    if (!isLoggedIn) return;
    const before = following;
    setFollowing(!before);
    try {
      const r = await rankitApi.follow({ target_type: followTarget, target_id: id, notify: false }, !before);
      setFollowing(r.following);
    } catch { setFollowing(before); }
  };

  const toggleFav = async () => {
    if (!isLoggedIn) return;
    const before = favorited;
    setFavorited(!before);
    try {
      const r = await rankitApi.favorite({ target_type: kind, target_id: id }, !before);
      setFavorited(r.favorited);
    } catch { setFavorited(before); }
  };

  return (
    <div className="riw-inspect-wrap" onClick={onClose}>
      <section className="riw-inspect" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title || kind}>
        <div className="ri-sheet-grab" aria-hidden="true" />
        <div className="riw-sheet-actions">
          <button onClick={onClose} className="ri-sheet-close" aria-label="Close"><X size={16} /></button>
        </div>

        {!load && <div className="riw-note">Unknown entity type: {kind}</div>}
        {err && <div className="riw-note">{err}</div>}
        {load && !data && !err && <p className="ri-entity-loading">Loading…</p>}

        {entity && (
          <>
            <div className="ri-entity-hero"
              style={{ "--entity-color": entity.color || entity.team_color || "#FFB11B" }}>
              <div className="ri-entity-mark">
                {kind === "team" ? (entity.short_name || title.slice(0, 2)) : title.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <small>{kind.toUpperCase()}</small>
                <h2>{title}</h2>
                <p>{subtitle}</p>
              </div>
            </div>

            {kind !== "list" && (
              isLoggedIn ? (
                <div className="ri-entity-actions">
                  <button className={following ? "active" : undefined} onClick={toggleFollow}>
                    {following ? "Following" : "Follow"}
                  </button>
                  {kind !== "member" && (
                    <button className={favorited ? "active favourite" : undefined} onClick={toggleFav}>
                      <Heart size={14} fill={favorited ? "currentColor" : "none"} />
                      {favorited ? "Favourite" : "Add favourite"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="riw-quiet">
                  <Link to="/login?next=/rankit" style={{ color: "var(--ri-gold, #FFB11B)" }}>Sign in</Link>{" "}
                  to follow and keep favourites.
                </p>
              )
            )}

            {kind === "member" && !!data.entries?.length && (
              <div className="riw-review-list">
                {data.entries.slice(0, 8).map((e) => (
                  <ReviewRow key={e.id} row={e} onOpen={onOpenMatch}
                    onOpenEntity={onOpenEntity} ratedMatchIds={ratedMatchIds}
                    hideScores={hideScores} />
                ))}
              </div>
            )}

            {!!matches.length && (
              <>
                <div className="ri-chip-title" style={{ marginTop: 16 }}>
                  MATCHES <span>{matches.length}</span>
                </div>
                <Wall matches={matches} loading={false} error=""
                  onOpen={(m) => onOpenMatch(m.id)} empty={null}
                  hideScores={hideScores} />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}


/* ── İnceleme satırı: beğeni + yorumlar ───────────────────────────────────────
   Üçü de telefonda vardı, webde yoktu (likeReview / comments / addComment).
   Yorumlar TEMBEL yükleniyor: bir maçta sekiz inceleme var ve hiçbirine
   bakılmadan sekiz istek atmanın anlamı yok. */
/* 8a — Discover duvarı. Süzgeçler rayda (DiscoverFilters, §23.1 — çekmece
   yok); durum adreste, ray ile duvar aynı kaynağı okur. Sıralar görünür
   (Hottest / Soonest / Most reviewed). Ray ≤1080'de çekildiği için (Aşama
   18'e kadar) aynı süzgeçler başlıkta açılır bir kutuda da var. */
function DiscoverView({ filters, onChange, onFacets, tabs, onOpenMatch, hideScores }) {
  const key = JSON.stringify(filters);
  const [state, setState] = useState({ key: null, matches: [], total: 0, error: "" });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let alive = true;
    rankitApi.catalog({ ...filters, limit: 24, offset: 0, facets: true })
      .then((d) => {
        if (!alive) return;
        setState({ key, matches: (d.matches || []).map(toCard), total: d.total || 0, error: "" });
        onFacets(d.facets || null);
      })
      .catch((e) => alive && setState({ key, matches: [], total: 0, error: String(e.message || e) }));
    return () => { alive = false; };
  }, [key, filters, onFacets]);

  const ready = state.key === key;
  const more = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await rankitApi.catalog({ ...filters, limit: 24, offset: state.matches.length });
      setState((s) => ({ ...s, matches: [...s.matches, ...(d.matches || []).map(toCard)] }));
    } catch { /* düğme kalır */ }
    finally { setLoadingMore(false); }
  };
  const active = activeFilterCount(filters);

  return (
    <div className="riw-page riw-discover">
      <PageHead eyebrow={ready ? discoverEyebrow(state.total, filters) : "DISCOVER"} title="Discover">
        <SortBar label="Sort the wall" value={filters.sort} onChange={(sort) => onChange({ sort })} options={DISCOVER_SORTS} />
      </PageHead>
      <div className="riw-discover-tabs">{tabs}</div>
      <details className="riw-discover-inline" id="riw-discover-inline">
        <summary>Filters{active ? ` · ${active}` : ""}</summary>
        <DiscoverFilters filters={filters} onChange={onChange} facets={null} idPrefix="inline" />
      </details>
      <div className="riw-main solo riw-discover-wall">
        <Wall matches={ready ? state.matches : []} loading={!ready} error={ready ? state.error : ""} hideScores={hideScores}
          onOpen={(m) => onOpenMatch(m.id)}
          empty={(() => {
            const e = discoverEmpty(filters);
            return (
              <div className="riw-empty-one">
                <strong>{e.title}</strong>
                <p>{e.note}</p>
                {e.action && <button type="button" onClick={() => onChange(e.action.patch)}>{e.action.label}</button>}
              </div>
            );
          })()} />
        {ready && state.matches.length < state.total && (
          <button className="ri-load-more riw-more" onClick={more} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</button>
        )}
      </div>
    </div>
  );
}

/* Activity iki şeyi birden taşıyor ve eskiden yalnızca ikincisi vardı:
   TOPLULUK (başkalarının kayıtları ve yorumları) ve SENİN GÜNLÜĞÜN. Sayfanın
   adı "Activity" olmasına rağmen tek gösterdiği kendi kayıtlarındı; başka
   kimsenin yorumu web'de hiçbir yerde görünmüyordu. */
/* ── Kabuk ────────────────────────────────────────────────────────────────── */

// Tahtalarda ray yalnız bu iki yüzeyde (7a, 8a, 14b, 8d); diğer her sayfa tam
// genişlik — 7f'nin yedi sütunu, 7g'nin 38 haftası ancak böyle sığar.
const RAIL_SECTIONS = new Set(["home", "discover"]);
// 14a: ilk kurulum hesap başına bir kez sorulur; aynı oturumda ana sayfaya her
// dönüşte yeniden sorgulanmasın.
const onboardingChecked = new Set();

export default function RankItWeb({ section = "home" }) {
  const { user, isLoggedIn } = useAuth();
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // §25 ≤820: ray bir menünün arkasında (Discover'da süzgeçler). Açıldığı
  // adrese bağlı: başka sayfaya geçince kendiliğinden kapanır (efekt yok).
  const [menuAt, setMenuAt] = useState(null);
  const menuOpen = menuAt === location.pathname;
  const [hideScores, setHideScores] = useState(() => readPrefs().hideScores);
  const [ratedMatchIds, setRatedMatchIds] = useState(new Set());
  const visibleRatedMatchIds = isLoggedIn ? ratedMatchIds : new Set();
  const toggleScores = () => {
    const next = !hideScores;
    setHideScores(next);
    writePrefs({ hideScores: next });
  };
  const [rankOpen, setRankOpen] = useState(false);
  // Kabuğun verisi hesaba bağlı: çıkışta ya da hesap değişince bir önceki
  // kişinin kademesi bir an bile görünmesin.
  const accountId = isLoggedIn ? (user?.id ?? user?.username ?? "me") : null;

  // §17 arama alanı: sorgu /rankit/search?q= adresinde yaşıyor (11c), başka
  // bir bölümde yazılan taslak ise o bölüme ait — bölüm değişince alan
  // boşalır, sonuç sayfasına gelince adresteki sorguyu gösterir.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = section === "search" ? (searchParams.get("q") || "") : "";
  const [draft, setDraft] = useState({ section, value: urlQuery });
  const query = draft.section === section ? draft.value : urlQuery;
  const searchTab = section === "search" ? (searchParams.get("tab") || "all") : "all";
  const peopleTab = section === "people" ? (searchParams.get("tab") || "following") : "following";
  const profileView = section === "profile" ? searchParams.get("view") : null;
  const activityScope = section === "activity" && searchParams.get("scope") === "mutuals" ? "mutuals" : "following";
  // 8a: Discover süzgeçleri adreste; ray ve duvar aynı nesneyi okur.
  const discoverKey = section === "discover" ? searchParams.toString() : "";
  const discoverState = useMemo(() => discoverFilters(new URLSearchParams(discoverKey)), [discoverKey]);
  const setDiscover = (patch) => setSearchParams(discoverParams({ ...discoverState, ...patch }), { replace: true });
  const [discoverFacets, setDiscoverFacets] = useState(null);
  const searchParamsFor = (q, tab) => ({ ...(q.trim() ? { q } : {}), ...(tab && tab !== "all" ? { tab } : {}) });
  const onQuery = (value) => {
    setDraft({ section, value });
    if (section === "search") setSearchParams(searchParamsFor(value, searchTab), { replace: true });
  };
  const onSearchTab = (tab) => setSearchParams(searchParamsFor(urlQuery, tab), { replace: true });
  const onSearch = (term) => {
    if (!term) return;
    setDraft({ section: "search", value: term });
    navigate(`/rankit/search?q=${encodeURIComponent(term)}`);
  };

  // Denetçi artık KÖKTE, tek örnek — Catalog/ActivityView/HomeView'ün her biri
  // kendi "open" state'i ve kendi <Inspector>'ını taşıyordu. Küçültme özelliği
  // (Outlook'un taslak penceresi gibi: küçült, başka bir sekmeye geç, köşede
  // beklesin) bunu GEREKTİRİYOR — sayfa/sekme değişince state'i kaybeden bir
  // denetçi küçültülemez, sadece kapanır. Bileşenin kendisi hep DOM'da kalıyor
  // (minimized=true iken de) ki puanlama/yorum taslağı kaybolmasın.
  const [inspectId, setInspectId] = useState(null);
  const [inspectMinimized, setInspectMinimized] = useState(false);
  // Bir kayıt kaydedildiğinde günlüğü tazelemesi gereken görünümler buna
  // abone: hangi sekmede olursa olsun, artan sayaç yeniden çekmeyi tetikler.
  const [logVersion, setLogVersion] = useState(0);
  // 8d: çevrimdışında kartlar söner; bağlantı dönünce kuyruk yüklenir ve
  // günlüğe bağlı görünümler tazelenir.
  const network = useNetwork(() => setLogVersion((v) => v + 1));

  // Varlık çekmecesi (turnuva/oyuncu/takım/üye/liste). Maç denetçisinden AYRI
  // bir katman: bir maçtan oyuncuya, oyuncudan takımına geçilebilsin ve geri
  // dönüldüğünde maç taslağı hâlâ yerinde dursun.
  const [entity, setEntity] = useState(null);
  // 12a: kulüp bir bakış — Inspector yuvasında açılır, açık maç taslağı
  // küçülüp köşede bekler. 8c: turnuva kendi sayfası (§23.2).
  const [clubId, setClubId] = useState(null);
  const openEntity = useCallback((kind, id) => {
    if (kind === "competition") { setEntity(null); setClubId(null); navigate(`/rankit/competition/${id}`); return; }
    if (kind === "team") { setEntity(null); setInspectMinimized(true); setClubId(id); return; }
    if (kind === "list") { setEntity(null); setClubId(null); navigate(`/rankit/lists/${id}`); return; }
    setEntity({ kind, id });
  }, [navigate]);
  const closeEntity = useCallback(() => setEntity(null), []);
  const closeClub = useCallback(() => setClubId(null), []);

  const openMatch = useCallback((id) => { setClubId(null); setInspectId(id); setInspectMinimized(false); }, []);
  const closeMatch = useCallback(() => { setInspectId(null); setInspectMinimized(false); }, []);
  const minimizeMatch = useCallback(() => setInspectMinimized(true), []);
  const restoreMatch = useCallback(() => { setClubId(null); setInspectMinimized(false); }, []);
  // Küçültme çipinin özeti (etiket + taslak puanı) Inspector'dan gelir.
  const [inspectDraft, setInspectDraft] = useState(null);

  // 7e koleksiyon anı ve 11a hızlı puanlama — ikisi de duvarın üstünde.
  const [collectible, setCollectible] = useState(null);
  const [quick, setQuick] = useState(null);
  const [shortcutNote, setShortcutNote] = useState("");
  const showCollectible = (result) => {
    setQuick(null); setInspectId(null); setInspectMinimized(false); setCollectible(result);
  };

  // §20: R, üstünde durulan (ya da odaktaki) duvar kartını puanlar.
  const [hovered, setHovered] = useCardHover();
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "r" && event.key !== "R") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const card = hovered.current;
      if (!card?.raw || card.diary) return;
      event.preventDefault();
      // §9.1: yıldızlar tam zamanda açılır — öncesinde R bir şey puanlamaz.
      if (card.raw.status !== "finished") { setShortcutNote("Ratings open at full time."); return; }
      if (!isLoggedIn) { setShortcutNote("Sign in to rate matches."); return; }
      setQuick(card.raw);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLoggedIn, hovered]);

  // 12b: Lists kendi sayfası (/rankit/lists). Telefonun alt beşlisinde yer
  // olmadığı için Discover'ın ikinci sekmesi ona götürür.

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.diary().then(data => {
      if (alive) setRatedMatchIds(new Set((data.entries || []).filter(entry => Number(entry.rating) > 0).map(entry => Number(entry.match_id))));
    }).catch(() => { if (alive) setRatedMatchIds(new Set()); });
    return () => { alive = false; };
  }, [isLoggedIn, logVersion]);

  const discoverTabs = (
    <div className="riw-tabs" role="tablist" aria-label="Discover">
      {[["matches", "Matches"], ["lists", "Lists"]].map(([key, label]) => (
        <button key={key} role="tab" aria-selected={key === "matches"}
          className={key === "matches" ? "on" : undefined}
          onClick={() => { if (key === "lists") navigate("/rankit/lists"); }}>
          {label}
        </button>
      ))}
    </div>
  );

  const discover = <DiscoverView filters={discoverState} onChange={setDiscover} onFacets={setDiscoverFacets}
    tabs={discoverTabs} onOpenMatch={openMatch} hideScores={hideScores} />;

  const { rank, hunt, clubs } = useShellData(accountId, logVersion);

  // 14a: kurulumu bitmemiş hesap ana sayfaya geldiğinde karşılama ekranına
  // (telefonun 4h'si gibi; bayrak sunucuda, yeni cihazda yeniden sormaz).
  useEffect(() => {
    if (!isLoggedIn || section !== "home" || onboardingChecked.has(accountId)) return undefined;
    let alive = true;
    rankitApi.onboarding("").then((d) => {
      onboardingChecked.add(accountId);
      if (alive && d && d.done === false) navigate("/rankit/welcome", { replace: true });
    }).catch(() => {});
    return () => { alive = false; };
  }, [isLoggedIn, section, accountId, navigate]);

  const body = {
    home: <HomeView onOpenMatch={openMatch} hideScores={hideScores} ratedMatchIds={visibleRatedMatchIds}
      accountId={accountId} refreshToken={logVersion} onOpenEntity={openEntity} />,
    discover,
    lists: <ListsPage listId={params.listId ? Number(params.listId) : null} hideScores={hideScores} onOpenMatch={openMatch} />,
    hunt: <HuntPage collectionId={params.collectionId || null} hideScores={hideScores} onOpenMatch={openMatch} />,
    people: <PeoplePage tab={peopleTab} onTab={(t) => setSearchParams(t === "following" ? {} : { tab: t }, { replace: true })}
      onOpenMember={(id) => openEntity("member", id)} />,
    activity: <ActivityPage scope={activityScope} onScope={(v) => setSearchParams(v === "mutuals" ? { scope: v } : {}, { replace: true })}
      streak={rank?.streak?.current || 0} refreshToken={logVersion} hideScores={hideScores} onOpenMatch={openMatch} onOpenEntity={openEntity} />,
    profile: <ProfilePage rank={rank} hunt={hunt} view={profileView} onView={(v) => setSearchParams(v ? { view: v } : {})}
      hideScores={hideScores} onToggleScores={toggleScores} onOpenMatch={openMatch} />,
    shelf: <ShelfPage key={params.memberId || "me"} memberId={params.memberId ? Number(params.memberId) : null}
      user={user} isLoggedIn={isLoggedIn} hideScores={hideScores} onOpenMatch={openMatch} />,
    heat: <HeatMapPage key={params.competitionId} competitionId={Number(params.competitionId)} />,
    card: <SkinPage key={params.entryId} entryId={Number(params.entryId)} hideScores={hideScores} />,
    competition: <CompetitionPage key={params.competitionId} competitionId={Number(params.competitionId)}
      hideScores={hideScores} onOpenMatch={openMatch} onOpenEntity={openEntity} />,
    reviews: <ReviewsPage key={params.matchId} matchId={Number(params.matchId)} isLoggedIn={isLoggedIn}
      hideScores={hideScores} onOpenMatch={openMatch} />,
    // 11c — başlıktaki alan sorgunun tek girişi; sekme de adreste.
    search: <SearchPage query={urlQuery} tab={searchTab} onTab={onSearchTab} hideScores={hideScores}
      onOpenMatch={openMatch} onOpenEntity={openEntity} />,
  }[section];

  // 14a tek ekran: başlık da ray da yok (tahta) — vaat solda, seçimler sağda.
  if (section === "welcome") {
    return (
      <div className="riw riw-welcome-root">
        <SEO title="Welcome to RankIt" description="Rate one match. The rest builds itself." path="/rankit/welcome" />
        <WelcomePage hideScores={hideScores} onToggleScores={toggleScores} />
      </div>
    );
  }

  const docked = (!!inspectId && !inspectMinimized) || !!clubId;
  const withRail = RAIL_SECTIONS.has(section);
  return (
    <CardHoverContext.Provider value={setHovered}>
    <div className={`riw${docked ? " has-inspector" : ""}${withRail ? "" : " no-rail"}${network.online ? "" : " is-offline"}`}>
      <SEO title="RankIt — rate the matches you watch"
        description="A social diary for football and basketball. Rate matches, keep a record, follow people whose taste you recognise."
        path="/rankit" />
      <WebHeader user={user} isLoggedIn={isLoggedIn} hideScores={hideScores} onToggleScores={toggleScores}
        nights={rank?.streak?.current || 0} query={query} onQuery={onQuery} onSearch={onSearch}
        bell={isLoggedIn ? <NotificationsMenu key={accountId} hideScores={hideScores} onOpenMatch={openMatch} /> : null}
        searching={section === "search"} menuKind={section === "discover" ? "filters" : "rail"}
        onMenu={() => setMenuAt(location.pathname)} />
      {withRail && (section === "discover"
        ? <aside className="riw-rail riw-filter-rail" aria-label="Filters">
            <DiscoverFilters filters={discoverState} facets={discoverFacets} onChange={setDiscover} />
            {/* ≤1080 ikon sütununda süzgeçler sığmaz: tek düğme, başlıktaki kutuyu açar. */}
            <button type="button" className="riw-filter-rail-toggle" aria-label="Filters" title="Filters" onClick={() => {
              const box = document.getElementById("riw-discover-inline");
              if (box) { box.open = true; box.querySelector("summary")?.focus(); }
            }}><SlidersHorizontal size={18} aria-hidden="true" />{activeFilterCount(discoverState) > 0 && <b>{activeFilterCount(discoverState)}</b>}</button>
          </aside>
        : <WebRail isLoggedIn={isLoggedIn} rank={rank} hunt={hunt} clubs={clubs} onOpenEntity={openEntity} />)}
      <main className="riw-body">{body}</main>
      <PhoneTabs onRank={() => setRankOpen(true)} />
      {(!network.online || network.queued > 0) && (
        <div className={`riw-offline${network.online ? " is-queued" : ""}`} role="status">
          {network.online ? (
            <>
              <strong>{network.queued} saved {network.queued === 1 ? "rating" : "ratings"} waiting to upload</strong>
              <button type="button" onClick={network.retry}>Retry</button>
            </>
          ) : (
            <><strong>You're offline</strong><span>Your rating is saved here and will upload when you reconnect.</span></>
          )}
        </div>
      )}

      {rankOpen && (
        <RankSheet hideScores={hideScores} onClose={() => setRankOpen(false)} onPick={openMatch} />
      )}
      {menuOpen && (
        section === "discover" ? (
          <Sheet label="Filters" onClose={() => setMenuAt(null)} className="riw-menu-sheet">
            <DiscoverFilters filters={discoverState} facets={discoverFacets} onChange={setDiscover} idPrefix="sheet" />
          </Sheet>
        ) : (
          <Sheet label="Your RankIt" onClose={() => setMenuAt(null)} className="riw-menu-sheet">
            <WebRail sheet isLoggedIn={isLoggedIn} rank={rank} hunt={hunt} clubs={clubs}
              onOpenEntity={(kind, id) => { setMenuAt(null); openEntity(kind, id); }} />
          </Sheet>
        )
      )}
      {/* §25 ≤820: Inspector alttan tam genişlik sayfa; perdeye dokunmak maçı
          KÜÇÜLTÜR (taslak köşede bekler), kulübü kapatır. Genişte görünmez. */}
      {docked && <div className="riw-sheet-scrim" aria-hidden="true" onClick={clubId ? closeClub : minimizeMatch} />}
      {/* Küçültülmüşken panel DOM'da kalır (taslak yaşasın), yalnız gizli. */}
      {inspectId && (
        <div className="riw-insp-dock" hidden={inspectMinimized}>
          <Inspector key={inspectId} id={inspectId} hideScores={hideScores}
            onClose={closeMatch} onMinimize={minimizeMatch} onOpenEntity={openEntity}
            onDraftChange={setInspectDraft} onCollectible={showCollectible}
            onLogged={() => setLogVersion((v) => v + 1)} />
        </div>
      )}
      {clubId && (
        <div className="riw-insp-dock">
          <ClubInspector key={clubId} id={clubId} hideScores={hideScores} onClose={closeClub}
            onBackToMatch={inspectId ? restoreMatch : undefined} onOpenMatch={openMatch} onOpenEntity={openEntity}
            onSeeAll={(name) => { setClubId(null); navigate(`/rankit/search?q=${encodeURIComponent(name)}&tab=matches`); }} />
        </div>
      )}
      {inspectId && inspectMinimized && (
        <div className="riw-chip" role="button" tabIndex={0} onClick={restoreMatch}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); restoreMatch(); } }}
          aria-label={`Resume ${inspectDraft?.label || "the match"}`}>
          <div className="riw-chip-copy">
            <strong>{inspectDraft?.label || "Loading…"}</strong>
            <small>{inspectDraft?.rating > 0 ? `Draft · ${inspectDraft.rating.toFixed(1)}★` : "Tap to resume"}</small>
          </div>
          <button type="button" className="riw-chip-close" aria-label="Close the Inspector"
            onClick={(e) => { e.stopPropagation(); closeMatch(); }}><X size={13} /></button>
        </div>
      )}
      {quick && (
        <QuickRate match={quick} hideScores={hideScores} onClose={() => setQuick(null)}
          onLogged={() => setLogVersion((v) => v + 1)} onCollectible={showCollectible} />
      )}
      {collectible && (
        <CollectibleOverlay result={collectible} rank={rank} hideScores={hideScores}
          onDone={() => setCollectible(null)}
          onEdit={() => { const id = collectible.match.id; setCollectible(null); openMatch(id); }}
          onSkin={(entryId) => { setCollectible(null); navigate(`/rankit/card/${entryId}`); }} />
      )}
      {shortcutNote && (
        <div role="status" className="ri-action-toast" onAnimationEnd={() => setShortcutNote("")}>{shortcutNote}</div>
      )}
      {entity && (
        <EntityDrawer key={`${entity.kind}-${entity.id}`} kind={entity.kind} id={entity.id}
          onClose={closeEntity} onOpenMatch={openMatch} onOpenEntity={openEntity}
          hideScores={hideScores} ratedMatchIds={visibleRatedMatchIds} />
      )}
    </div>
    </CardHoverContext.Provider>
  );
}
