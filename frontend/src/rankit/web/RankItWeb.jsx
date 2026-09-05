import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useParams, useNavigate } from "react-router-dom";
import {
  Home, Compass, Activity as ActivityIcon, List as ListIcon, CircleUserRound,
  Smartphone, Star, X, Minus, ChevronLeft, ChevronRight, FileText, Plus, Search,
  SlidersHorizontal, MessageSquare, Award, Eye, EyeOff, Radio, Send, Bookmark, Heart, Trophy, ThumbsUp,
} from "lucide-react";
import { SEO } from "../../hooks/useSEO";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi, rankitSocketUrl } from "../rankitApi";
import { BROADCAST_COUNTRIES, readPrefs, writePrefs, resolveBroadcastCountry, localeCountry } from "../rankitPrefs";
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

/* ── Carousel ─────────────────────────────────────────────────────────────────
   Telefonun hero şeridinin masaüstü karşılığı. Aynı mekanik (scroll-snap +
   kaydırma pozisyonundan hesaplanan aktif kart), masaüstünün ek verdiği tek
   şey: fare için ok düğmeleri. Aktif kart HER ZAMAN kaydırma pozisyonundan
   okunuyor — ok, nokta ve doğrudan kaydırma tek bir doğruyu paylaşsın. */
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
      const step = child.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || 0);
      if (step <= 0) return;
      setIndex(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / step))));
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

  return { ref, index, goTo, atStart: index <= 0, atEnd: index >= count - 1 };
}

function Carousel({ items, hideScores, onOpen }) {
  const { ref, index, goTo, atStart, atEnd } = useCarousel(items.length);
  return (
    <div className="riw-carousel-wrap">
      <div className="riw-carousel" ref={ref}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
        }}>
        {items.map((m) => (
          <MatchCard key={m.id} match={m} hideScores={hideScores} onOpen={onOpen} />
        ))}
      </div>

      {items.length > 1 && (
        <>
          <button className="riw-carousel-arrow prev" onClick={() => goTo(index - 1)}
            disabled={atStart} aria-label="Previous match"><ChevronLeft size={18} /></button>
          <button className="riw-carousel-arrow next" onClick={() => goTo(index + 1)}
            disabled={atEnd} aria-label="Next match"><ChevronRight size={18} /></button>

          <div className="riw-carousel-dots" role="tablist" aria-label="Tonight's matches">
            {items.map((m, i) => (
              <button key={m.id} type="button" role="tab" aria-selected={index === i}
                aria-label={`Match ${i + 1} of ${items.length}`}
                className={index === i ? "active" : undefined} onClick={() => goTo(i)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* Topluluk yorumu satırı — /home ve Activity aynı şekli paylaşıyor. */
function ReviewRow({ row, onOpen, onOpenEntity }) {
  const initial = (row.username || "?").slice(0, 1).toUpperCase();
  const teams = `${row.home_short || row.home_name} v ${row.away_short || row.away_name}`;
  return (
    <article className="riw-review" onClick={() => onOpen?.(row.match_id)}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(row.match_id); } }}>
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
            {!!hero.length && (
              <Carousel items={hero} hideScores={hideScores} onOpen={(x) => onOpenMatch(x.id)} />
            )}
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

function Inspector({ id, minimized, onClose, onMinimize, onRestore, onLogged, onOpenEntity }) {
  const { isLoggedIn } = useAuth();
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  // Classic damgası webde HİÇ yoktu: telefonda puanlamanın yanındaki en
  // belirgin hareket, webde puan kaydedilebiliyor ama "bu bir klasikti"
  // denemiyordu.
  const [classic, setClassic] = useState(false);
  const [state, setState] = useState("idle");
  // Telefonla aynı varsayılan: bitmiş maçta önce topluluk, oynanmamışta künye.
  const [tab, setTab] = useState("Match");
  // Telefonda olup webde olmayan yetenekler (bkz. PRODUCT.md parite sözleşmesi).
  const [watchlisted, setWatchlisted] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [potmId, setPotmId] = useState(null);
  const [respect, setRespect] = useState([]);
  const [broadcast, setBroadcast] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  // "Bu maçı listeme ekle" — addListItem ucu arka uçta vardı ama HİÇBİR yüzey
  // çağırmıyordu: iki yüzey de yalnızca önceden seçilmiş maçlarla liste
  // kurabiliyordu. Listeler tembel yükleniyor, açılınca.
  const [myLists, setMyLists] = useState(null);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    rankitApi.match(id)
      .then((d) => {
        if (!alive) return;
        setDetail(d); setRating(d.my_rating || 0); setReview(d.my_review || "");
        setClassic(!!d.my_classic);
        setWatchlisted(!!d.watchlisted); setFavorited(!!d.favorited);
        setPotmId(d.my_potm_id || null); setRespect(d.my_respect_ids || []);
        setTab(d.status === "finished" ? "Community" : "Match");
      })
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => { alive = false; };
  }, [id]);

  // Yayın bilgisi ayrı uçtan gelir: kural tablosu turnuva+ülke başına çözülür,
  // maç satırında yalnızca serbest metin `broadcaster` var.
  // Ülke artık sabit "TR" değil: tercihten, yoksa tarayıcı dilinden. Kapsam
  // dışı bir ülkede hiç sormuyoruz — başka bir ülkenin yayıncısını göstermek
  // "veri yok" demekten daha kötü.
  const country = useMemo(() => resolveBroadcastCountry(), []);
  useEffect(() => {
    // Kapsam dışıysa istek atmıyoruz; "veri yok" durumu state'ten değil
    // country.supported'dan türetiliyor, yoksa efekt içinde setState gerekirdi.
    if (!country.supported) return undefined;
    let alive = true;
    rankitApi.broadcasts(id, country.code)
      .then((b) => alive && setBroadcast(b))
      .catch(() => alive && setBroadcast(null));
    return () => { alive = false; };
  }, [id, country]);

  useEffect(() => {
    // Küçükken Escape'in kapatacak "aktif" bir diyalog yok — chip modal değil,
    // arkasındaki sayfa tamamen kullanılabilir durumda.
    if (minimized) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, minimized]);

  // Kaydettikten sonra puanı değiştirince buton "Saved" olarak kalıyordu:
  // kullanıcı kaydedilmemiş bir değişikliği kaydedilmiş sanıp kapatıyordu.
  useEffect(() => { setState((s) => (s === "saved" ? "idle" : s)); }, [rating, review, classic]);

  // İyimser güncelleme + hata halinde geri alma: telefondaki davranışın aynısı.
  // id yalnızca React key'i: değişince toast animasyonu baştan oynar. Date.now()
  // yerine sayaç — saf, ve arka arkaya iki aynı mesajda da farklı key üretiyor.
  const flash = (message, tone = "success") =>
    setNotice((n) => ({ message, tone, id: (n?.id || 0) + 1 }));

  const toggleWatchlist = async () => {
    if (busy) return;
    const previous = watchlisted;
    setWatchlisted(!previous); setBusy("watchlist");
    try {
      const r = await rankitApi.toggleWatchlist(id);
      setWatchlisted(r.watchlisted);
      flash(r.watchlisted ? "Added to your watchlist" : "Removed from your watchlist");
    } catch {
      setWatchlisted(previous); flash("Watchlist could not be updated", "error");
    } finally { setBusy(""); }
  };

  const toggleFavorite = async () => {
    if (busy) return;
    const previous = favorited;
    setFavorited(!previous); setBusy("favorite");
    try {
      const r = await rankitApi.favorite({ target_type: "match", target_id: id });
      setFavorited(r.favorited);
      flash(r.favorited ? "Added to your favourites" : "Removed from your favourites");
    } catch {
      setFavorited(previous); flash("Favourite could not be updated", "error");
    } finally { setBusy(""); }
  };

  const choosePotm = async (playerId) => {
    const previous = potmId;
    setPotmId(playerId);
    // POTM ve Respect aynı oyuncuyu iki kez saymamalı — telefondaki kural.
    setRespect((v) => v.filter((x) => x !== playerId));
    try { await rankitApi.potm(id, playerId); flash("Player of the Match saved"); }
    catch { setPotmId(previous); flash("Vote could not be saved", "error"); }
  };

  const toggleRespect = async (playerId) => {
    if (playerId === potmId) return;
    const previous = respect;
    const next = respect.includes(playerId)
      ? respect.filter((x) => x !== playerId)
      : respect.length < 2 ? [...respect, playerId] : respect;
    if (next === respect) return;
    setRespect(next);
    try { await rankitApi.respect(id, next); }
    catch { setRespect(previous); flash("Vote could not be saved", "error"); }
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
      await rankitApi.addListItem(listId, { match_id: id });
      flash(`Added to ${listTitle}`);
    } catch { flash("Could not add to that list", "error"); }
  };

  const save = () => {
    setState("saving");
    rankitApi.log({ match_id: id, rating: rating || null, review, classic })
      .then(() => { setState("saved"); onLogged?.(); })
      .catch((e) => { setState("error"); setErr(String(e.message || e)); });
  };

  const finished = detail?.status === "finished";
  const when = formatWhen(detail?.starts_at);
  // Oylama listesi alfabetik tek bir duvardı: "Adam Smith" hangi takımda
  // belli olmuyordu ve aynı 30 isim POTM ve Respect için arka arkaya iki kez
  // basılıyordu. Telefon takıma göre grupluyor, web gruplamıyordu.
  const playersByTeam = useMemo(() => {
    const groups = new Map();
    for (const p of detail?.players || []) {
      if (!groups.has(p.team)) groups.set(p.team, []);
      groups.get(p.team).push(p);
    }
    return [...groups.entries()];
  }, [detail?.players]);

  // Küçültülmüşken tam çekmece hiç DOM'da değil — sadece köşedeki taslak
  // çipi. Bileşenin kendisi (ve içindeki rating/review state'i) mount'ta
  // kalıyor, sadece BU dal render ediliyor; küçültüp büyütünce taslağın
  // kaybolmaması bunun için şart.
  if (minimized) {
    const label = detail
      ? `${detail.home?.short || detail.home?.name || "?"} vs ${detail.away?.short || detail.away?.name || "?"}`
      : "Loading…";
    return (
      <div className="riw-chip" role="button" tabIndex={0} onClick={onRestore}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRestore(); } }}
        aria-label={`Resume rating ${label}`}>
        {detail && (
          <div className="riw-chip-crests">
            <TeamMark team={detail.home} /><TeamMark team={detail.away} />
          </div>
        )}
        <div className="riw-chip-copy">
          <strong>{label}</strong>
          <small>{rating > 0 ? `Draft · ${rating}★` : "Tap to resume"}</small>
        </div>
        <button type="button" className="riw-chip-close" aria-label="Discard and close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}><X size={13} /></button>
      </div>
    );
  }

  return (
    <div className="riw-inspect-wrap" onClick={onClose}>
      <section className="riw-inspect" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Match">
        <div className="ri-sheet-grab" aria-hidden="true" />
        <div className="riw-sheet-actions">
          {/* Outlook'un taslak penceresi gibi: kapatmak SİLMEK, küçültmek
              ARA VERMEK. Puanlama yarım kalmışken kapatma tuşuna basmak
              taslağı yok ediyordu — artık ikisi ayrı. */}
          <button onClick={onMinimize} className="ri-sheet-close" aria-label="Minimize"><Minus size={16} /></button>
          <button onClick={onClose} className="ri-sheet-close" aria-label="Close"><X size={16} /></button>
        </div>

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
              {["Match", "Community", "Watchalong"].map((name) => (
                <button key={name} role="tab" aria-selected={tab === name}
                  className={tab === name ? "active" : undefined}
                  onClick={() => setTab(name)}>{name}</button>
              ))}
            </div>

            {tab === "Watchalong" ? (
              <WatchalongPanel matchId={detail.id} isLoggedIn={isLoggedIn} />
            ) : tab === "Match" ? (
              <>
                {detail.summary && <p className="ri-summary">{detail.summary}</p>}
                <div className="riw-facts">
                  <div><span>KICK-OFF</span><strong>{when.full || "—"}</strong></div>
                  <div>
                    <span>COMPETITION</span>
                    {detail.competition_id ? (
                      <strong><button type="button" className="riw-linkish"
                        onClick={() => onOpenEntity?.("competition", detail.competition_id)}>
                        {detail.competition || "—"}
                      </button></strong>
                    ) : <strong>{detail.competition || "—"}</strong>}
                  </div>
                  {/* Eskiden veri yoksa satır hiç basılmıyordu — sonuç: "yayın
                      göremiyoruz" şikayeti, çünkü çoğu maçta broadcaster boş
                      ve özellik hiç KEŞFEDİLEMİYORDU. Telefon boşken bile
                      "pending" yazıyor; web artık aynısını yapıyor. */}
                  <div>
                    <span>BROADCAST{country.supported && country.code ? ` · ${country.code}` : ""}</span>
                    <strong>
                      {country.supported && broadcast?.channels?.length
                        ? broadcast.channels.map((c) => c.name).join(" · ")
                        : !country.supported
                        ? "Not covered in your region yet"
                        : detail.broadcaster || "Details pending"}
                    </strong>
                    {/* Kuraldan mı gelmiş yoksa maça özel doğrulanmış mı — bu
                        ayrım kullanıcı için önemli: yayın hakları sezon içinde
                        değişiyor ve tarihsiz bir kayıt bir süre sonra yalan olur. */}
                    {!country.supported ? (
                      <em>Pick a country under Profile &rsaquo; Settings</em>
                    ) : broadcast?.confidence === "typical" ? (
                      <em>Typical coverage — check before kick-off</em>
                    ) : null}
                  </div>
                  {detail.potm && (
                    <div><span>COMMUNITY POTM</span><strong>{detail.potm.name}</strong></div>
                  )}
                </div>
                {!finished && (
                  <p className="riw-quiet">This match has not been played yet.</p>
                )}

                {/* Doğrulanmış kadro: sağlayıcının o maça özel açıkladığı 11,
                    yedekler, diziliş ve teknik direktör. Sezon kadrosundan AYRI
                    alan (`lineups` vs `players`) — "gerçek ilk 11 mi bilmiyoruz"
                    şikayetinin cevabı bu ayrım. Yoksa hiç gösterilmiyor. */}
                {!!detail.lineups?.length && (
                  <div className="ri-lineup">
                    <div className="ri-lineup-title">
                      <span>CONFIRMED LINEUP</span>
                      {detail.lineups[0].confirmed_at && (
                        <em>Lineups can change until kick-off</em>
                      )}
                    </div>
                    <div className="ri-lineup-grid">
                      {detail.lineups.map((side) => (
                        <section key={side.team_id} className="ri-lineup-side">
                          <div className="ri-lineup-head">
                            <strong>{side.team}</strong>
                            {side.formation && (
                              <span className="ri-lineup-formation">{side.formation}</span>
                            )}
                            {side.coach && (
                              <span className="ri-lineup-coach"><b>Manager</b>{side.coach}</span>
                            )}
                          </div>
                          <div className="ri-lineup-list">
                            {side.starters.map((p, i) => (
                              <span key={`s-${i}`}>
                                <b>{p.shirt_no ?? ""}</b><i>{p.name}</i>
                              </span>
                            ))}
                          </div>
                          {!!side.bench?.length && (
                            <div className="ri-lineup-bench">
                              <small>BENCH · {side.bench.length}</small>
                              <div className="ri-lineup-list">
                                {side.bench.map((p, i) => (
                                  <span key={`b-${i}`}>
                                    <b>{p.shirt_no ?? ""}</b><i>{p.name}</i>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  </div>
                )}

                {/* "Gerçek ilk 11 mi bilmiyoruz" — haklı: bu SEZON KADROSU,
                    doğrulanmış maç kadrosu değil (CLAUDE.md'de kayıtlı bir
                    kısıt). Telefon bunu hiç gizlemiyor, adı zaten "SEASON
                    SQUADS" — burada da "Starting XI" YAZMIYORUZ, aynı dürüst
                    etiket. */}
                {!detail.lineups?.length && !!detail.players?.length && (
                  <div className="ri-squad-preview">
                    <div className="ri-chip-title">SEASON SQUAD <span>{detail.players.length}</span></div>
                    <div>
                      {[detail.home, detail.away].map((team) => (
                        <section key={team?.short || team?.name}>
                          <header>
                            <TeamMark team={team} />
                            {team?.id ? (
                              <strong><button type="button" className="riw-linkish"
                                onClick={() => onOpenEntity?.("team", team.id)}>
                                {team?.short || team?.name}
                              </button></strong>
                            ) : <strong>{team?.short || team?.name}</strong>}
                          </header>
                          <div>
                            {detail.players
                              .filter((p) => p.team === (team?.short || team?.name))
                              .map((p) => (
                                <span key={p.id}>
                                  {p.shirt_no && <b>{p.shirt_no}</b>}
                                  <button type="button" className="riw-linkish"
                                    onClick={() => onOpenEntity?.("player", p.id)}>{p.name}</button>
                                </span>
                              ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                )}

                {isLoggedIn ? (
                  <div className="ri-detail-actions">
                    {!finished && (
                      <button className={`ri-review-cta${watchlisted ? " saved" : ""}`}
                        disabled={busy === "watchlist"} onClick={toggleWatchlist}>
                        <Bookmark size={16} fill={watchlisted ? "currentColor" : "none"} />
                        {watchlisted ? "In your watchlist" : "Add to watchlist"}
                      </button>
                    )}
                    <button className={`ri-review-cta secondary${favorited ? " saved" : ""}`}
                      disabled={busy === "favorite"} onClick={toggleFavorite}>
                      <Heart size={16} fill={favorited ? "currentColor" : "none"} />
                      {favorited ? "Favourite" : "Add to favourites"}
                    </button>
                    <button className="ri-review-cta secondary" onClick={openLists}
                      aria-expanded={listOpen}>
                      <ListIcon size={16} /> Add to list
                    </button>
                  </div>
                ) : (
                  <p className="riw-quiet">
                    <Link to="/login?next=/rankit" style={{ color: "var(--ri-gold, #FFB11B)" }}>Sign in</Link>{" "}
                    to keep this match in your watchlist.
                  </p>
                )}

                {listOpen && (
                  <div className="riw-entity-chips">
                    {myLists === null && <span className="riw-quiet">Loading…</span>}
                    {myLists?.map((l) => (
                      <button key={l.id} type="button" onClick={() => addToList(l.id, l.title)}>
                        <ListIcon size={12} />{l.title}
                      </button>
                    ))}
                    {myLists?.length === 0 && (
                      <span className="riw-quiet">No lists yet — make one under Discover &rsaquo; Lists.</span>
                    )}
                  </div>
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
                        <button type="button" onClick={() => setClassic((v) => !v)}
                          aria-pressed={classic}
                          className={`ri-classic${classic ? " active" : ""}`}>
                          <span>CLASSIC</span><small>RANKIT SELECT</small>
                        </button>
                      </div>
                      {/* POTM + Respect: telefonda vardı, webde yoktu. Aynı kural —
                          bir oyuncu ikisinde birden olamaz, respect en fazla iki kişi. */}
                      {!!detail.players?.length && (
                        <div className="ri-vote-block">
                          <div className="ri-chip-title">
                            YOUR PLAYER OF THE MATCH
                            <span>{potmId ? "1" : "0"}/1</span>
                          </div>
                          {playersByTeam.map(([team, list]) => (
                            <section key={`potm-${team}`} className="riw-vote-team">
                              <small>{team}</small>
                              <div className="ri-respect-grid">
                                {list.map((p) => (
                                  <button key={`potm-${p.id}`} type="button"
                                    className={potmId === p.id ? "active" : undefined}
                                    onClick={() => choosePotm(p.id)}>
                                    <Trophy size={12} /><span>{p.name}</span>
                                  </button>
                                ))}
                              </div>
                            </section>
                          ))}
                          <div className="ri-chip-title">
                            RESPECT <span>{respect.length}/2</span>
                          </div>
                          {playersByTeam.map(([team, list]) => (
                            <section key={`respect-${team}`} className="riw-vote-team">
                              <small>{team}</small>
                              <div className="ri-respect-grid">
                                {list.filter((p) => p.id !== potmId).map((p) => (
                                  <button key={`respect-${p.id}`} type="button"
                                    className={respect.includes(p.id) ? "active" : undefined}
                                    onClick={() => toggleRespect(p.id)}>
                                    <ThumbsUp size={12} /><span>{p.name}</span>
                                  </button>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
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
                    <ReviewArticle key={r.id} row={r} isLoggedIn={isLoggedIn} />
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
        {notice && (
          <div key={notice.id} role="status" className={`ri-action-toast ${notice.tone}`}
            onAnimationEnd={() => setNotice(null)}>{notice.message}</div>
        )}
      </section>
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
  const [week, setWeek] = useState(null);
  // Yüklenen haftayı ADIYLA BİRLİKTE tutuyoruz: "hangi hafta yükleniyor"
  // bilgisi böyle türetilebiliyor ve efektin başında state sıfırlamak
  // gerekmiyor (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState({ stage: null, matches: [] });
  // `data.matchweeks || []` her render'da YENİ bir dizi üretiyordu ve aşağıdaki
  // useMemo'yu her seferinde yeniden çalıştırıyordu; referans burada sabitleniyor.
  const weeks = useMemo(() => data.matchweeks || [], [data.matchweeks]);

  // Açılışta oynanmakta olan haftayı seç: tamamlanmamış ilk hafta, yoksa sonuncu.
  const currentWeek = useMemo(() => {
    const live = weeks.find((w) => w.finished < w.matches);
    return (live || weeks[weeks.length - 1] || null)?.stage || null;
  }, [weeks]);

  const activeWeek = week || currentWeek;

  useEffect(() => {
    if (tab !== "matches" || !activeWeek) return undefined;
    let alive = true;
    rankitApi.competitionMatches(id, activeWeek)
      .then((d) => alive && setLoaded({ stage: activeWeek, matches: (d.matches || []).map(toCard) }))
      .catch(() => alive && setLoaded({ stage: activeWeek, matches: [] }));
    return () => { alive = false; };
  }, [id, tab, activeWeek]);

  // null => hâlâ yükleniyor (ya da başka bir haftanın sonucu duruyor).
  const weekMatches = loaded.stage === activeWeek ? loaded.matches : null;

  const players = useMemo(() => {
    // "Popular" bir sıraya dayanmalı: önce topluluk oyları, sonra maç sayısı.
    return [...(data.popular_players || [])].sort((a, b) =>
      (b.potm_votes + b.respect_votes) - (a.potm_votes + a.respect_votes) ||
      b.appearances - a.appearances);
  }, [data.popular_players]);

  const standings = data.standings || [];

  return (
    <>
      <div className="ri-detail-tabs" role="tablist" aria-label="Competition">
        {[["table", "Table"], ["players", "Players"], ["matches", "Matches"]].map(([key, label]) => (
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

      {tab === "players" && (
        players.length ? (
          <div className="riw-player-rows">
            {players.map((p) => {
              const votes = (p.potm_votes || 0) + (p.respect_votes || 0);
              return (
                <button key={p.id} type="button" className="riw-player-row"
                  onClick={() => onOpenEntity?.("player", p.id)}>
                  <span className="riw-player-name">{p.name}</span>
                  <span className="riw-player-team">{p.team_short || p.team_name}</span>
                  <span className="riw-player-stat">
                    {votes ? `${votes} votes` : `${p.appearances} apps`}
                  </span>
                </button>
              );
            })}
          </div>
        ) : <Empty icon={CircleUserRound} title="No players yet"
              note="Players appear once squads are loaded for this competition." />
      )}

      {tab === "matches" && (
        <>
          <div className="riw-weeks" role="tablist" aria-label="Matchweek">
            {weeks.map((w) => (
              <button key={w.stage} role="tab" aria-selected={activeWeek === w.stage}
                className={activeWeek === w.stage ? "on" : undefined}
                onClick={() => setWeek(w.stage)}
                title={`${w.matches} matches, ${w.finished} played`}>
                {/* Uzun etiket dar bir şeritte okunmaz: "Matchday 12" -> "12" */}
                {(w.stage.match(/\d+/) || [w.stage])[0]}
              </button>
            ))}
          </div>
          {!weeks.length && (
            <Empty icon={ListIcon} title="No matchweeks"
              note="This competition does not publish rounds." />
          )}
          {!!weeks.length && (
            <>
              <div className="ri-chip-title">{activeWeek}</div>
              <Wall matches={weekMatches || []} loading={weekMatches === null} error=""
                onOpen={(m) => onOpenMatch(m.id)}
                empty={<Empty icon={ListIcon} title="No matches in this round" note="" />} />
            </>
          )}
        </>
      )}
    </>
  );
}


function EntityDrawer({ kind, id, onClose, onOpenMatch, onOpenEntity }) {
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
      const r = await rankitApi.follow({ target_type: followTarget, target_id: id, notify: false });
      setFollowing(r.following);
    } catch { setFollowing(before); }
  };

  const toggleFav = async () => {
    if (!isLoggedIn) return;
    const before = favorited;
    setFavorited(!before);
    try {
      const r = await rankitApi.favorite({ target_type: kind, target_id: id });
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
                  <ReviewRow key={e.id} row={e} onOpen={onOpenMatch} />
                ))}
              </div>
            )}

            {kind !== "competition" && !!matches.length && (
              <>
                <div className="ri-chip-title" style={{ marginTop: 16 }}>
                  {kind === "competition" ? "FIXTURES" : "MATCHES"} <span>{matches.length}</span>
                </div>
                <Wall matches={matches} loading={false} error=""
                  onOpen={(m) => onOpenMatch(m.id)} empty={null} />
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
function ReviewArticle({ row, isLoggedIn }) {
  const [liked, setLiked] = useState(!!row.liked);
  const [likes, setLikes] = useState(row.likes || 0);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Spoiler webde "uygulamada aç" diyordu, oysa sunucu metni zaten gönderiyor:
  // okuyucuyu sahip olduğumuz içerik için başka bir yüzeye göndermek yerine
  // kendi kararını vermesine izin veriyoruz.
  const [spoilerShown, setSpoilerShown] = useState(false);

  const toggleLike = async () => {
    if (!isLoggedIn) return;
    const before = { liked, likes };
    setLiked(!liked); setLikes(likes + (liked ? -1 : 1));
    try {
      const r = await rankitApi.likeReview(row.id);
      setLiked(r.liked); setLikes(r.likes);
    } catch { setLiked(before.liked); setLikes(before.likes); }
  };

  const openComments = async () => {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      try { setComments((await rankitApi.comments(row.id)).comments || []); }
      catch { setComments([]); }
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await rankitApi.addComment(row.id, text);
      setComments((await rankitApi.comments(row.id)).comments || []);
      setDraft("");
    } catch { /* gönderilemedi: taslak duruyor, kullanıcı tekrar deneyebilir */ }
    finally { setSending(false); }
  };

  return (
    <article>
      <div>
        <strong style={{ font: "700 11px var(--font-logo)" }}>@{row.username}</strong>
        <Stars value={row.rating || 0} compact />
      </div>
      {row.review && (
        row.spoiler && !spoilerShown ? (
          <p>
            <button type="button" className="riw-spoiler" onClick={() => setSpoilerShown(true)}>
              Contains spoilers — tap to read
            </button>
          </p>
        ) : <p>{row.review}</p>
      )}
      <div className="riw-review-actions">
        <button type="button" className={liked ? "on" : undefined} onClick={toggleLike}
          disabled={!isLoggedIn} aria-pressed={liked}
          aria-label={liked ? "Remove your like" : "Like this review"}>
          <Heart size={13} fill={liked ? "currentColor" : "none"} /> {likes || ""}
        </button>
        <button type="button" onClick={openComments} aria-expanded={open}>
          <MessageSquare size={13} /> {row.comments || ""}
        </button>
      </div>
      {open && (
        <div className="riw-comments">
          {comments === null && <span className="riw-quiet">Loading…</span>}
          {comments?.map((c) => (
            <p key={c.id}><strong>@{c.username}</strong><span>{c.content}</span></p>
          ))}
          {comments?.length === 0 && <span className="riw-quiet">No replies yet.</span>}
          {isLoggedIn ? (
            <div className="ri-chat-compose">
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                aria-label="Reply to this review" placeholder="Write a reply" />
              <button onClick={send} disabled={sending || !draft.trim()} aria-label="Send reply">
                <Send size={14} />
              </button>
            </div>
          ) : (
            <span className="riw-quiet">
              <Link to="/login?next=/rankit" style={{ color: "var(--ri-gold, #FFB11B)" }}>Sign in</Link> to reply.
            </span>
          )}
        </div>
      )}
    </article>
  );
}


/* ── Watchalong: maç sırasında canlı sohbet ───────────────────────────────────
   Backend'de baştan beri vardı (REST geçmiş + /ws/watchalong soketi) ve
   telefonda da vardı; web'de HİÇ yoktu. Telefondaki panelin aynısı, aynı
   .ri-watchalong-* sınıflarıyla (bunlar rankit.css'te, yani web zaten
   yüklüyor). Fark: web'de oturum açmamış ziyaretçi de odayı OKUYABİLİR,
   sadece yazamaz — telefondan farklı olarak burada girişsiz gezinme normal. */
function WatchalongPanel({ matchId, isLoggedIn }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const logRef = useRef(null);
  useEffect(() => {
    let alive = true;
    rankitApi.watchalong(matchId).then((d) => { if (alive) setMessages(d.messages || []); }).catch(() => {});
    // Soket girişsiz kullanıcıyı 4401 ile kapatıyor (api/rankit.py). Bağlantıyı
    // hiç açmamak, her anonim ziyarette başarısız olacak bir el sıkışma
    // denemesinden ve sonsuza dek "Connecting…" yazan yanıltıcı bir durumdan
    // daha dürüst — geçmiş yine de REST'ten okunuyor, oda okunabilir kalıyor.
    if (!isLoggedIn) return () => { alive = false; };
    const token = localStorage.getItem("nba_arch_token") || "";
    let ws;
    try {
      ws = new WebSocket(rankitSocketUrl(`/api/rankit/ws/watchalong/${matchId}?token=${encodeURIComponent(token)}`));
    } catch { return () => { alive = false; }; }
    socketRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) setMessages((v) => [...v, data.message]);
      } catch { /* bicimsiz kare yok sayilir */ }
    };
    return () => { alive = false; ws.close(); };
  }, [matchId, isLoggedIn]);
  // Yeni mesaj gelince en alta kaydir; sohbet yukarida takili kalmasin.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const send = () => {
    const text = draft.trim();
    if (!text || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ content: text }));
    setDraft("");
  };
  return (
    <div className="ri-watchalong-live">
      <div className="ri-watchalong-card">
        <Radio size={22} />
        <div>
          <small>LIVE WATCHALONG</small>
          <strong>{!isLoggedIn ? "Read-only — sign in to post" : connected ? "Community room connected" : "Connecting…"}</strong>
          <span>React together without turning RankIt into a score app.</span>
        </div>
      </div>
      <div className="ri-chat-log" ref={logRef}>
        {messages.map((m) => (
          <p key={m.id}><strong>@{m.username}</strong><span>{m.content}</span></p>
        ))}
        {!messages.length && (
          <Empty icon={Radio} title="Nobody has said anything yet"
            note="Be the first — messages show up live for everyone watching." />
        )}
      </div>
      {isLoggedIn ? (
        <div className="ri-chat-compose">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label="Message the watchalong room"
            placeholder="Say something about the match" />
          <button onClick={send} disabled={!connected || !draft.trim()} aria-label="Send message">
            <Send size={15} />
          </button>
        </div>
      ) : (
        <p className="riw-quiet">
          <Link to="/login?next=/rankit" style={{ color: "var(--ri-gold, #FFB11B)" }}>Sign in</Link>{" "}
          to join the conversation.
        </p>
      )}
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

function Catalog({ title, note, meta, tabs, onOpenMatch }) {
  const [sport, setSport] = useState("All");
  const [competition, setCompetition] = useState("All");
  const [season, setSeason] = useState("All");
  const [status, setStatus] = useState("All");
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
function ActivityView({ onOpenMatch, refreshToken, onOpenEntity }) {
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
            {feed?.map((r) => <ReviewRow key={r.id} row={r} onOpen={onOpenMatch} onOpenEntity={onOpenEntity} />)}
            {feed && !feed.length && (
              <Empty icon={MessageSquare} title="No public reviews yet"
                note="Reviews members choose to make public show up here." />
            )}
          </div>
        ) : tab === "watchlist" ? (
          <Wall matches={watchRows || []} loading={isLoggedIn && watch === null} error=""
            onOpen={(m) => onOpenMatch(m.id)}
            empty={<Empty icon={Bookmark}
              title={isLoggedIn ? "Nothing on the watchlist" : "Sign in to keep a watchlist"}
              note="Open any upcoming match and add it — it waits here until kick-off." />} />
        ) : (
          <Wall matches={rows || []} loading={rows === null} error={err}
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

function Profile() {
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
              <input id="riw-hide" type="checkbox" checked={prefs.hideScores}
                onChange={(e) => setPref({ hideScores: e.target.checked })} />
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [rankOpen, setRankOpen] = useState(false);

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
    ? <Lists tabs={discoverTabs} onOpenEntity={openEntity} />
    : <Catalog meta={meta} title="Discover" tabs={discoverTabs} onOpenMatch={openMatch}
        note="Filter down to a competition, a season or a state of play." />;

  const body = {
    home: <HomeView onOpenMatch={openMatch} />,
    discover,
    lists: discover,
    activity: <ActivityView onOpenMatch={openMatch} refreshToken={logVersion} onOpenEntity={openEntity} />,
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
          onPick={(id) => { setRankOpen(false); openMatch(id); }} />
      )}
      {inspectId && (
        <Inspector id={inspectId} minimized={inspectMinimized}
          onClose={closeMatch} onMinimize={minimizeMatch} onRestore={restoreMatch}
          onOpenEntity={openEntity}
          onLogged={() => setLogVersion((v) => v + 1)} />
      )}
      {entity && (
        <EntityDrawer key={`${entity.kind}-${entity.id}`} kind={entity.kind} id={entity.id}
          onClose={closeEntity} onOpenMatch={openMatch} onOpenEntity={openEntity} />
      )}
    </div>
  );
}
