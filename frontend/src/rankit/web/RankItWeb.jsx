import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Compass, Activity as ActivityIcon, List as ListIcon, CircleUserRound,
  Smartphone, X, ChevronLeft, ChevronRight, FileText, Plus, Search,
  SlidersHorizontal, MessageSquare, EyeOff, Radio, Bookmark, Heart,
} from "lucide-react";
import { SEO } from "../../hooks/useSEO";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { BROADCAST_COUNTRIES, hidesScore, readPrefs, writePrefs, resolveBroadcastCountry, localeCountry } from "../rankitPrefs";
import { WallCard, Stars, formatWhen } from "./cards";
import { WebHeader, WebRail, PhoneTabs } from "./WebShell";
import { useShellData } from "./useShellData";
import FollowFeed from "./FollowFeed";
import Inspector from "./Inspector";
import CollectibleOverlay from "./CollectibleOverlay";
import QuickRate from "./QuickRate";
import { CardHoverContext, useCardHover } from "./cardHover";
import { rankitDayContext, tonightLabel, tonightRows } from "../redesign/homeTonight";
import CompetitionMatches from "../redesign/CompetitionMatches";
import SearchSheet from "../redesign/SearchSheet";
import CompetitionPlayers from "../redesign/CompetitionPlayers";
import CommunityVerdictGate from "../redesign/CommunityVerdictGate";
import { communityVerdictCovered } from "../redesign/heat";
import "../rankit.css";
import "./rankit-web.css";
import "./rankit-inspector.css";

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
    // Yeniden izleme aynı maçın ikinci kaydı: duvarın anahtarı MAÇ değil KAYIT
    // (aynı maç iki kez = iki kart; anahtar çakışıyordu, konsolda ölçüldü).
    key: `entry-${e.id}`,
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
    diary: true,
    raw: e,
  };
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
          <div className="riw-carousel">{[0, 1, 2].map((i) => <div key={i} className="riw-skeleton" />)}</div>
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
const ENTITY_LOADER = {
  competition: rankitApi.competition,
  player: rankitApi.player,
  team: rankitApi.team,
  member: rankitApi.member,
  list: rankitApi.list,
};

/* Turnuva gövdesi: Table / Players / Matches.
   Önceki hali 30 ismi alfabetik bir duvar olarak basıyordu — ne takım ne
   istatistik, yani "popular" kelimesini destekleyen hiçbir şey ekranda yoktu.
   Veri zaten geliyordu (team_name, appearances, potm_votes), gösterilmiyordu. */
function CompetitionBody({ id, data, onOpenMatch, onOpenEntity }) {
  const [tab, setTab] = useState("table");
  const standings = data.standings || [];

  return (
    <>
      <div className="ri-detail-tabs" role="tablist" aria-label="Competition">
        {[["table", "Table"], ["matches", "Matches"], ["players", "Players"]].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key}
            className={tab === key ? "active" : undefined}
            onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === "table" && (
        standings.length ? (
          <div className="riw-table-wrap">
            <table className="riw-table">
              <thead>
                <tr>
                  <th className="num">#</th><th>Team</th>
                  <th className="num">P</th><th className="num">W</th>
                  <th className="num">D</th><th className="num">L</th>
                  <th className="num">GD</th><th className="num pts">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => (
                  <tr key={row.team_id}>
                    <td className="num rank">{i + 1}</td>
                    <td>
                      <button type="button" className="riw-linkish"
                        onClick={() => onOpenEntity?.("team", row.team_id)}>
                        {row.short_name || row.name}
                      </button>
                    </td>
                    <td className="num">{row.played}</td>
                    <td className="num">{row.won}</td>
                    <td className="num">{row.drawn}</td>
                    <td className="num">{row.lost}</td>
                    <td className="num">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                    <td className="num pts">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={ListIcon} title="No table yet"
              note="Standings appear once results are in for this season." />
      )}

      {/* 3d — sezon cetveli. Eskiden burada POTM/Respect oylarina gore
          siralanmis bir "popular players" listesi vardi; 3d baska bir sey
          istiyor ve bilesenin kendi basligi bunu soyluyor. */}
      {tab === "players" && (
        <CompetitionPlayers competitionId={id}
          onOpenPlayer={(pid) => onOpenEntity?.("player", pid)} />
      )}

      {/* 3c — hafta seridi + gun gun fikstur kartlari. Telefonla AYNI bilesen. */}
      {tab === "matches" && (
        <CompetitionMatches competitionId={id}
          matchweeks={data.matchweeks || []} fixtures={data.fixtures || []}
          onOpenMatch={(m) => onOpenMatch(m.id)} />
      )}
    </>
  );
}


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

            {kind === "competition" && (
              <CompetitionBody id={id} data={data}
                onOpenMatch={onOpenMatch} onOpenEntity={onOpenEntity} />
            )}

            {/* Takım kadrosu: oyuncuya geçiş buradan. */}
            {kind === "team" && !!data.players?.length && (
              <div className="ri-squad-preview">
                <div className="ri-chip-title">SQUAD <span>{data.players.length}</span></div>
                <div className="riw-entity-chips">
                  {data.players.map((pl) => (
                    <button key={pl.id} type="button" onClick={() => onOpenEntity("player", pl.id)}>
                      {pl.shirt_no && <b>{pl.shirt_no}</b>}{pl.name}
                    </button>
                  ))}
                </div>
              </div>
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

            {kind !== "competition" && !!matches.length && (
              <>
                <div className="ri-chip-title" style={{ marginTop: 16 }}>
                  {kind === "competition" ? "FIXTURES" : "MATCHES"} <span>{matches.length}</span>
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
/* ── Rank: puanlanacak maçı bul ───────────────────────────────────────────────
   Telefondaki orta düğmenin karşılığı. Duvarda maçı aramak "önce filtrele,
   sonra bul" demek; buradaki iş tek bir maçı hatırlayıp puanlamak, o yüzden
   ayrı bir yüzey ve doğrudan arama. Yalnızca BİTMİŞ maçlar: oynanmamış bir
   maçı puanlatmak anlamsız. */
function RankSheet({ onClose, onPick, hideScores }) {
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
        <div className="ri-sheet-grab" aria-hidden="true" />
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
                {m.home.short || m.home.name} <b>{hidesScore(hideScores, m) ? "—" : m.score || "—"}</b> {m.away.short || m.away.name}
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

function Catalog({ title, note, meta, tabs, onOpenMatch, hideScores }) {
  const [sport, setSport] = useState("All");
  const [competition, setCompetition] = useState("All");
  const [season, setSeason] = useState("All");
  const [status, setStatus] = useState("All");
  const [filterOpen, setFilterOpen] = useState(false);

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
        {/* "Hide scores" burada ikinci kez vardı; kalkan artık her sayfada
            başlıkta (7a) — aynı ayar iki yerde durmaz (2a düzeltmesiyle aynı). */}
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
          onOpen={(m) => onOpenMatch(m.id)}
          empty={<Empty icon={Compass} title="Nothing matches those filters"
            note="Try a wider competition or season — the catalog covers two seasons." />} />
        {canLoadMore && !loading && (
          <button className="ri-load-more riw-more" onClick={more}>Load more</button>
        )}
      </div>
    </>
  );
}

/* Activity iki şeyi birden taşıyor ve eskiden yalnızca ikincisi vardı:
   TOPLULUK (başkalarının kayıtları ve yorumları) ve SENİN GÜNLÜĞÜN. Sayfanın
   adı "Activity" olmasına rağmen tek gösterdiği kendi kayıtlarındı; başka
   kimsenin yorumu web'de hiçbir yerde görünmüyordu. */
function ActivityView({ onOpenMatch, refreshToken, onOpenEntity, hideScores, ratedMatchIds }) {
  const { isLoggedIn } = useAuth();
  const [tab, setTab] = useState("community");
  const [rows, setRows] = useState(null);
  const [feed, setFeed] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    if (!isLoggedIn) { setRows([]); return; }
    rankitApi.diary()
      .then((d) => setRows((d.entries || []).map(diaryToCard)))
      .catch((e) => { setErr(String(e.message || e)); setRows([]); });
  }, [isLoggedIn]);
  // refreshToken: kökteki denetçi bir kayıt kaydettiğinde artıyor. Activity
  // ekranda değilken de kaydedebilirsin (Home/Discover'dan) — mount olduğunda
  // TEK seferlik `load` yetmiyordu, geri dönünce günlük bayat kalıyordu.
  useEffect(load, [load, refreshToken]);

  useEffect(() => {
    let alive = true;
    rankitApi.home("All")
      .then((d) => alive && setFeed(d.activity || []))
      .catch(() => alive && setFeed([]));
    return () => { alive = false; };
  }, []);

  // Watchlist telefonda vardı, webde yoktu. refreshToken'a bağlı: denetçiden
  // bir maç izleme listesine eklenince bu sekme bayat kalmasın.
  const [watch, setWatch] = useState(null);
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.watchlist()
      .then((d) => alive && setWatch((d.matches || []).map(toCard)))
      .catch(() => alive && setWatch([]));
    return () => { alive = false; };
  }, [isLoggedIn, refreshToken]);
  // Girişsizken istek atmıyoruz; "boş liste" durumu state'ten değil buradan
  // türetiliyor, yoksa efekt içinde setState gerekirdi.
  const watchRows = isLoggedIn ? watch : [];

  const tabs = (
    <div className="riw-tabs" role="tablist" aria-label="Activity">
      {[["community", "Community"], ["diary", "Your diary"], ["watchlist", "Watchlist"]].map(([key, label]) => (
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
          : tab === "watchlist"
          ? "Matches you marked to watch. They stay here until you log them."
          : "Everything you have logged, newest first."}</p>
        {tab === "diary" && rows && <span className="riw-count">{rows.length} entries</span>}
      </header>
      {tabs}

      <div className="riw-main solo">
        {tab === "community" ? (
          <div className="riw-review-list">
            {feed === null && <p className="ri-entity-loading">Loading…</p>}
            {feed?.map((r) => <ReviewRow key={r.id} row={r} onOpen={onOpenMatch} onOpenEntity={onOpenEntity} ratedMatchIds={ratedMatchIds} hideScores={hideScores} />)}
            {feed && !feed.length && (
              <Empty icon={MessageSquare} title="No public reviews yet"
                note="Reviews members choose to make public show up here." />
            )}
          </div>
        ) : tab === "watchlist" ? (
          <Wall matches={watchRows || []} loading={isLoggedIn && watch === null} error="" hideScores={hideScores}
            onOpen={(m) => onOpenMatch(m.id)}
            empty={<Empty icon={Bookmark}
              title={isLoggedIn ? "Nothing on the watchlist" : "Sign in to keep a watchlist"}
              note="Open any upcoming match and add it — it waits here until kick-off." />} />
        ) : (
          <Wall matches={rows || []} loading={rows === null} error={err} hideScores={hideScores}
            onOpen={(m) => onOpenMatch(m.id)}
            empty={<Empty icon={ActivityIcon}
              title={isLoggedIn ? "No entries yet" : "Sign in to keep a diary"}
              note={isLoggedIn
                ? "Rate a match from Home or Discover and it lands here."
                : "Your diary follows your Primary Arch account, so it is the same on the phone."} />} />
        )}
      </div>
    </>
  );
}

function Lists({ tabs, onOpenEntity }) {
  const { isLoggedIn } = useAuth();
  const [lists, setLists] = useState(null);
  // Liste OLUŞTURMA telefonda vardı, webde yoktu. Maç seçmeden boş bir liste
  // açılıyor; maçlar sonradan denetçideki "Add to list" ile ekleniyor, çünkü
  // web'de bir listeyi doldurmanın doğal yeri maçın kendisi.
  const [title, setTitle] = useState("");
  const [ranked, setRanked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);

  const create = async () => {
    const t = title.trim();
    if (!t || creating) return;
    setCreating(true);
    try {
      await rankitApi.createList({ title: t, ranked, match_ids: [] });
      setTitle(""); setRanked(false); setVersion((v) => v + 1);
    } catch { /* hata: başlık duruyor, tekrar denenebilir */ }
    finally { setCreating(false); }
  };
  useEffect(() => {
    if (!isLoggedIn) { setLists([]); return; }
    rankitApi.lists().then((d) => setLists(d.lists || [])).catch(() => setLists([]));
  }, [isLoggedIn, version]);

  return (
    <>
      <header className="riw-head">
        <h1>Discover</h1>
        <p>Collections you have made, ranked or not.</p>
        {lists && <span className="riw-count">{lists.length}</span>}
      </header>
      {tabs}
      <div className="riw-main solo">
        {isLoggedIn && (
          <div className="riw-list-new">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              maxLength={100} aria-label="New list title" placeholder="Name a new list" />
            <label>
              <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} />
              Ranked
            </label>
            <button onClick={create} disabled={creating || !title.trim()}>
              <Plus size={14} /> {creating ? "Creating…" : "Create"}
            </button>
          </div>
        )}
        <div className="ri-list-stack">
          {(lists || []).map((l) => (
            <article key={l.id} role="button" tabIndex={0}
              onClick={() => onOpenEntity?.("list", l.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenEntity?.("list", l.id); }
              }}
              aria-label={`Open list ${l.title}`}>
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

function Profile({ hideScores, onToggleScores }) {
  const { isLoggedIn, user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [prefs, setPrefs] = useState(readPrefs);
  const setPref = (patch) => setPrefs(writePrefs(patch));
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
      <div className="riw-tabs" role="tablist" aria-label="Profile">
        {[["overview", "Overview"], ["settings", "Settings"]].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key}
            className={tab === key ? "on" : undefined} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <div className="riw-main solo">
        {tab === "overview" && (isLoggedIn ? (
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
        ))}

        {tab === "settings" && (
        <section className="riw-settings">
          <div className="riw-set-group">
            <span>PERSONALISATION</span>

            <label className="riw-set-row" htmlFor="riw-country">
              <Radio size={16} />
              <div>
                <strong>Broadcast country</strong>
                <small>
                  {prefs.broadcastCountry === "auto"
                    ? (localeCountry()
                        ? `Following your browser — ${localeCountry()}`
                        : "Your browser's region has no coverage data yet")
                    : "Which country's listings to show on a match"}
                </small>
              </div>
              <select id="riw-country" value={prefs.broadcastCountry}
                onChange={(e) => setPref({ broadcastCountry: e.target.value })}>
                <option value="auto">Auto</option>
                {BROADCAST_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </label>

            <label className="riw-set-row" htmlFor="riw-hide">
              <EyeOff size={16} />
              <div>
                <strong>Hide scores by default</strong>
                <small>Cards and drawers open blurred until you choose to look.</small>
              </div>
              <input id="riw-hide" type="checkbox" checked={hideScores}
                onChange={onToggleScores} />
            </label>

            <label className="riw-set-row" htmlFor="riw-motion">
              <SlidersHorizontal size={16} />
              <div>
                <strong>Reduce motion</strong>
                <small>Turns off card entrance animations without changing your OS setting.</small>
              </div>
              <input id="riw-motion" type="checkbox" checked={prefs.reduceMotion}
                onChange={(e) => setPref({ reduceMotion: e.target.checked })} />
            </label>
          </div>

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
        )}
      </div>
    </>
  );
}

/* ── Kabuk ────────────────────────────────────────────────────────────────── */

export default function RankItWeb({ section = "home" }) {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
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
  const onQuery = (value) => {
    setDraft({ section, value });
    if (section === "search") setSearchParams(value.trim() ? { q: value } : {}, { replace: true });
  };
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

  // Varlık çekmecesi (turnuva/oyuncu/takım/üye/liste). Maç denetçisinden AYRI
  // bir katman: bir maçtan oyuncuya, oyuncudan takımına geçilebilsin ve geri
  // dönüldüğünde maç taslağı hâlâ yerinde dursun.
  const [entity, setEntity] = useState(null);
  const openEntity = useCallback((kind, id) => setEntity({ kind, id }), []);
  const closeEntity = useCallback(() => setEntity(null), []);

  const openMatch = useCallback((id) => { setInspectId(id); setInspectMinimized(false); }, []);
  const closeMatch = useCallback(() => { setInspectId(null); setInspectMinimized(false); }, []);
  const minimizeMatch = useCallback(() => setInspectMinimized(true), []);
  const restoreMatch = useCallback(() => setInspectMinimized(false), []);
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

  // Lists artık gezinme değil, Discover'ın ikinci sekmesi. /rankit/lists eski
  // bağlantıları kırmasın diye duruyor ve doğrudan o sekmeyi açıyor.
  const [discoverTab, setDiscoverTab] = useState(section === "lists" ? "lists" : "matches");
  useEffect(() => { setDiscoverTab(section === "lists" ? "lists" : "matches"); }, [section]);

  useEffect(() => { rankitApi.meta().then(setMeta).catch(() => setMeta(null)); }, []);
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
    ? <Lists tabs={discoverTabs} onOpenEntity={openEntity} />
    : <Catalog meta={meta} title="Discover" tabs={discoverTabs} onOpenMatch={openMatch} hideScores={hideScores}
        note="Filter down to a competition, a season or a state of play." />;

  const { rank, hunt, clubs } = useShellData(accountId, logVersion);

  const body = {
    home: <HomeView onOpenMatch={openMatch} hideScores={hideScores} ratedMatchIds={visibleRatedMatchIds}
      accountId={accountId} refreshToken={logVersion} onOpenEntity={openEntity} />,
    discover,
    lists: discover,
    activity: <ActivityView onOpenMatch={openMatch} refreshToken={logVersion} onOpenEntity={openEntity} hideScores={hideScores} ratedMatchIds={visibleRatedMatchIds} />,
    profile: <Profile hideScores={hideScores} onToggleScores={toggleScores} />,
    // 11c'nin tam sonuç sayfası (sekmeler, sayılar, "hottest first") Aşama
    // 17'de. O zamana kadar sonuçlar telefonla ortak 3e bileşeninden,
    // duvarın içinde — başlıktaki alan sorgunun tek girişi.
    search: (
      <>
        <header className="riw-head">
          <h1>Search</h1>
          <p>{urlQuery.trim().length >= 2 ? `Results for “${urlQuery.trim()}”` : "Type at least two letters in the search field above."}</p>
        </header>
        <div className="riw-main solo">
          <SearchSheet embedded query={urlQuery} hideScores={hideScores}
            onOpenMatch={(m) => openMatch(m.id)} onOpenEntity={openEntity} />
        </div>
      </>
    ),
  }[section];

  const docked = !!inspectId && !inspectMinimized;
  return (
    <CardHoverContext.Provider value={setHovered}>
    <div className={`riw${docked ? " has-inspector" : ""}`}>
      <SEO title="RankIt — rate the matches you watch"
        description="A social diary for football and basketball. Rate matches, keep a record, follow people whose taste you recognise."
        path="/rankit" />
      <WebHeader user={user} isLoggedIn={isLoggedIn} hideScores={hideScores} onToggleScores={toggleScores}
        nights={rank?.streak?.current || 0} query={query} onQuery={onQuery} onSearch={onSearch} />
      <WebRail isLoggedIn={isLoggedIn} rank={rank} hunt={hunt} clubs={clubs} onOpenEntity={openEntity} />
      <main className="riw-body">{body}</main>
      <PhoneTabs onRank={() => setRankOpen(true)} />

      {rankOpen && (
        <RankSheet hideScores={hideScores} onClose={() => setRankOpen(false)}
          onPick={(id) => { setRankOpen(false); openMatch(id); }} />
      )}
      {/* Küçültülmüşken panel DOM'da kalır (taslak yaşasın), yalnız gizli. */}
      {inspectId && (
        <div className="riw-insp-dock" hidden={inspectMinimized}>
          <Inspector key={inspectId} id={inspectId} hideScores={hideScores}
            onClose={closeMatch} onMinimize={minimizeMatch} onOpenEntity={openEntity}
            onDraftChange={setInspectDraft} onCollectible={showCollectible}
            onLogged={() => setLogVersion((v) => v + 1)} />
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
          onEdit={() => { const id = collectible.match.id; setCollectible(null); openMatch(id); }} />
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
