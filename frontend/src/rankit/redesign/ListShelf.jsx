/* Ekran 3h — "Lists: a list is a shelf you curate".
 *
 * Bir liste en iyi maçların sıralaması DEĞİL; birinin seçtiği bir raf. O
 * yüzden ekranın ağırlığı başlıkta ve açıklamada — "Not the best matches,
 * the ones I'd sit through a second time" cümlesi listenin kendisi.
 *
 * Tasarımdan iki bilinçli sapma, ikisi de tasarımın KENDİ kurallarından:
 *   * Kalp yerine RankIt elması. §6.1: "Respect replaces likes — the verb for
 *     an opinion you rate highly is respect, not affection." Bir liste de bir
 *     görüş.
 *   * Sayaç ısı renginde değil. Tasarım "142"yi #d43a63 çiziyor; §1 ve
 *     prompt dosyasının duran kuralı "ısı asla bir CTA değil" diyor.
 *
 * Satırdaki ısı çubuğu TOPLULUĞUN puanı, "your 5★" ise senin. 3c ve 3e'de de
 * çubuk topluluğun; burada kendi puanın olsaydı aynı maç iki ekranda iki
 * renk taşırdı (bkz. heat.js başındaki not).
 *
 * Tasarımdaki "…" menüsü yok: içine konacak gerçek bir eylem yok — bir
 * listenin paylaşılabilir bir adresi henüz olmadığı için "Share" boş bir
 * bağlantı paylaşırdı.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Plus, Bookmark, X } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { hidesScore, readPrefs } from "../rankitPrefs";
import { SkeletonRows, Loading, EndOfList, ErrorState } from "./States";
import { CrestPair } from "./MatchCard";
import { communityHeat, communityRatingCount, communityVerdictCovered, inkFor, MIN_COMMUNITY_RATINGS } from "./heat";
import { useBackClose } from "./backStack";
import { useDialog } from "./useDialog";

const INK = "#eceded";
const INK_3 = "#9aa0a6";

/* "Sep 2026" — 3h ayı ve yılı yazıyor, günü değil: bir rafta önemli olan
   maçın hangi dönemden olduğu. */
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

function stars(r) {
  if (r == null) return "";
  const n = Number(r);
  return `${Math.floor(n)}${n % 1 ? "½" : ""}★`;
}

/* RankIt elması — §2.3'ün türetilmiş yarıçapı. Harcanmamışken ana hat,
   verilince dolu; asla altın, asla animasyonlu (§6.1). */
function RespectMark({ on, size = 14 }) {
  const r = `${(size * 0.29).toFixed(1)}px ${(size * 0.29).toFixed(1)}px ${(size * 0.34).toFixed(1)}px ${(size * 0.34).toFixed(1)}px`;
  return <span aria-hidden="true" style={{
    width: size, height: size, display: "inline-block", transform: "rotate(45deg)",
    borderRadius: r, border: `1.5px solid ${on ? INK : INK_3}`, background: on ? INK : "transparent",
  }} />;
}

function Item({ match, index, ranked, onOpen, hideScores }) {
  const [communityRevealed, setCommunityRevealed] = useState(false);
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const at = new Date(match.starts_at);
  const played = match.status === "finished";
  const mine = match.my_rating;
  const hidden = hidesScore(hideScores, match) && !scoreRevealed;
  const verdictCovered = communityVerdictCovered(match, { revealed: communityRevealed });
  const rating = played ? communityHeat(match) : null;
  const count = played ? communityRatingCount(match) : null;
  return (
    <div role="button" tabIndex={0} className="ri-shelf-item" onClick={event => { if (!event.target.closest("button")) onOpen(match); }}
      onKeyDown={event => { if (!event.target.closest("button") && ["Enter", " "].includes(event.key)) { event.preventDefault(); onOpen(match); } }}>
      {ranked && <span className="ri-shelf-rank">{index + 1}</span>}
      <CrestPair home={match.home} away={match.away} />
      <span className="ri-shelf-text">
        <strong>
          {match.home.name || match.home.short}
          {played && match.score && !hidden ? ` ${match.score} ` : " vs "}
          {match.away.name || match.away.short}
        </strong>
        <small>
          {Number.isNaN(at.getTime()) ? "" : MONTH.format(at)}
          {mine != null ? ` · your ${stars(mine)}` : ""}
        </small>
        {verdictCovered && !hidden && <small>Rate it first — then see whether the room agreed with you.</small>}
      </span>
      {hidden ? (
        <button type="button" className="ri-shelf-heat" onClick={event => { event.stopPropagation(); setScoreRevealed(true); }}
          aria-label="Reveal match result" style={{ border: 0, background: "none", color: "#ffb11b", padding: 0, cursor: "pointer" }}>TAP TO REVEAL</button>
      ) : verdictCovered ? (
        <button type="button" className="ri-shelf-heat" onClick={event => { event.stopPropagation(); setCommunityRevealed(true); }}
          style={{ border: 0, background: "none", color: "#ffb11b", padding: 0, cursor: "pointer" }}
          aria-label="Reveal community verdict anyway">REVEAL ANYWAY</button>
      ) : !hidden && rating !== null ? (
        <span className="ri-shelf-heat" aria-label={`Community ${rating.toFixed(1)}`}>
          <i style={{ background: inkFor(rating) }} aria-hidden="true" />{rating.toFixed(1)}
        </span>
      ) : !hidden && played && count !== null && count < MIN_COMMUNITY_RATINGS ? (
        <span className="ri-shelf-heat">TOO FEW RATINGS</span>
      ) : null}
    </div>
  );
}

/* "Add from your diary" — defterindeki, listede OLMAYAN maçlar. */
function DiaryPicker({ listId, inList, onAdded, onClose }) {
  const [entries, setEntries] = useState(null);
  const [busy, setBusy] = useState(null);
  useBackClose(onClose);

  useEffect(() => {
    rankitApi.diary().then((d) => setEntries(d.entries || d || [])).catch(() => setEntries([]));
  }, []);

  const add = async (matchId) => {
    setBusy(matchId);
    try { await rankitApi.addListItem(listId, { match_id: matchId }); onAdded(); }
    catch { /* taslak kalir, satir yeniden denenebilir */ }
    finally { setBusy(null); }
  };

  const picker = useDialog({ onClose, label: "Add from your diary" });

  // Ayni mac defterde birden cok kez olabilir (rewatch); bir kez gosterilir.
  const seen = new Set(inList);
  const rows = (entries || []).filter((e) => {
    if (seen.has(e.match_id)) return false;
    seen.add(e.match_id);
    return true;
  });

  return (
    <div className="ri-sheet-wrap" onClick={onClose}>
      <section {...picker} className="ri-rank-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ri-sheet-grab" aria-hidden="true" />
        <div className="ri-rank-head">
          <div><small>ADD TO LIST</small><h2>From your diary</h2></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {entries === null && <Loading label="Loading your diary"><SkeletonRows count={3} height={58} gap={8} radius={12}/></Loading>}
        {rows.map((e) => (
          <button key={e.id} type="button" className="ri-quick-row" disabled={busy === e.match_id}
            onClick={() => add(e.match_id)}>
            <span>
              <strong>{e.home_short} vs {e.away_short}</strong>
              <small>{e.competition || ""}{e.rating != null ? ` · your ${stars(e.rating)}` : ""}</small>
            </span>
            <Plus size={16} />
          </button>
        ))}
        {entries && !rows.length && (
          <p className="ri-companion-note">Everything in your diary is already on this list.</p>
        )}
      </section>
    </div>
  );
}

export default function ListShelf({ listId, onClose, onOpenMatch, onOpenMember, hideScores = readPrefs().hideScores }) {
  const [loaded, setLoaded] = useState({ id: null, data: null });
  const [picking, setPicking] = useState(false);
  useBackClose(onClose);

  const load = useCallback(() => {
    rankitApi.list(listId)
      .then((d) => setLoaded({ id: listId, data: d }))
      .catch(error => setLoaded(previous => ({ id:listId,
        data: [403,404].includes(error.status) ? {missing:true} : previous.id === listId ? previous.data : null,
        error: [403,404].includes(error.status) ? null : error })));
  }, [listId]);
  useEffect(load, [load]);

  // "!picking" gerekmiyor: defter secici de bir dialog, yigindaki en ust o
  // oldugu icin Escape once ONU kapatiyor (bkz. useDialog).
  const data = loaded.id === listId ? loaded.data : null;
  const list = data?.list;
  const dialog = useDialog({ onClose, label: list?.title || "List" });

  const toggle = async (call, key, countKey) => {
    const before = { [key]: data[key], [countKey]: data[countKey] };
    setLoaded((v) => ({ ...v, data: { ...v.data, [key]: !before[key],
      [countKey]: before[countKey] + (before[key] ? -1 : 1) } }));
    try {
      // §5.4: istenen durum acikca gidiyor. `before[key]` ekranin o anki
      // hali oldugu icin istenen onun tersi; belirsiz kalan bir istegin
      // tekrari durumu geri cevirmesin.
      const r = await call(listId, !before[key]);
      setLoaded((v) => ({ ...v, data: { ...v.data, ...r } }));
    } catch {
      setLoaded((v) => ({ ...v, data: { ...v.data, ...before } }));
    }
  };

  const host = document.querySelector(".rankit-app");
  const screen = (
    <div {...dialog} className="ri-shelf">
      <div className="ri-shelf-head">
        <button type="button" onClick={onClose} aria-label="Back"><ChevronLeft size={16} /></button>
      </div>
      <div className="ri-shelf-body">
        {loaded.error && <ErrorState error={loaded.error} onRetry={load}/>}
        {!data && !loaded.error && <Loading label="Loading the list"><SkeletonRows count={4} height={68}/></Loading>}
        {data?.missing && (
          <div className="ri-empty-state"><strong>This list is not available</strong>
            <span style={{ color: INK_3 }}>It may be private, or it was removed.</span></div>
        )}
        {list && <>
          <header className="ri-shelf-title">
            <small>
              LIST BY{" "}
              <button type="button" onClick={() => onOpenMember?.(list.user_id)}>@{list.username}</button>
            </small>
            <h2>{list.title}</h2>
            {list.description && <p>{list.description}</p>}
            <div className="ri-shelf-acts">
              <button type="button" disabled={data.is_owner} aria-pressed={!!data.respected}
                aria-label={data.respected ? "Take back your respect" : "Respect this list"}
                onClick={() => toggle(rankitApi.respectList, "respected", "respect")}>
                <RespectMark on={data.respected} /> <b>{data.respect || 0}</b>
              </button>
              <button type="button" disabled={data.is_owner} aria-pressed={!!data.saved}
                aria-label={data.saved ? "Remove from saved" : "Save this list"}
                onClick={() => toggle(rankitApi.saveList, "saved", "saves")}>
                <Bookmark size={16} fill={data.saved ? "currentColor" : "none"} />
                <b>{data.saves || 0} saved</b>
              </button>
            </div>
          </header>

          <div className="ri-shelf-items">
            {data.matches.map((m, i) => (
              <Item key={m.id} match={m} index={i} ranked={!!list.ranked} onOpen={onOpenMatch} hideScores={hideScores} />
            ))}
            {!!data.matches.length && <EndOfList count={data.matches.length} />}
            {!data.matches.length && !data.is_owner && (
              <p className="ri-companion-note">Nothing on this shelf yet.</p>
            )}
            {data.is_owner && (
              <button type="button" className="ri-shelf-add" onClick={() => setPicking(true)}>
                <Plus size={15} /> Add from your diary
              </button>
            )}
          </div>
        </>}
      </div>
      {picking && <DiaryPicker listId={listId} inList={(data?.matches || []).map((m) => m.id)}
        onAdded={() => { setPicking(false); load(); }} onClose={() => setPicking(false)} />}
    </div>
  );
  return host ? createPortal(screen, host) : screen;
}
