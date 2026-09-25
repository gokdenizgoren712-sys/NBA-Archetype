/* Web Inspector — BUILD §9, §19, §19.1; ekranlar 16c · 15w · 7b · 15x · 7c ·
 * 16a · 7d · 16b · 15y · 15z.
 *
 *   kabuk     sağa sabit 468, başlık 56 (etiket solda, küçült, kapat).
 *             Açıkken ray çekilir, duvar .4'e söner (7b, 15y) ama dokunulabilir
 *             kalır: başka bir karta basmak Inspector'ı ona çevirir.
 *   sekmeler  Match · Community · Companion — "The tabs never change" (§9);
 *             değişen içerik ve alttaki tek birincil eylem (inspectorView.js).
 *   Match     planlı: kart + beklenen ısı + yayıncı + sezon kadrosu notu (16c);
 *             canlı: canlı hero + sahadakiler + oyuna girenler (15w) — anlar
 *             ve nabız YALNIZ Companion'da (§9.2); bitmiş: kart + özet +
 *             olaylar + yayıncı + kadro (7b).
 *   Community puansız: davet — "How was it?", 42px yıldızlar, 1–5 (15x);
 *             puanlı: YOUR ENTRY (yıldız, Classic, inceleme metni) → TAGS &
 *             PLAYERS → kalabalık → en çok respect alanlar (§9.4, 7c).
 *   Companion telefonla AYNI CompanionPanel (16a / 7d / 16b).
 *   15y       oyuncu seçici bir DİYALOG (PlayersPicker web varyantı).
 *   15z       inceleme yazıcı PANELİN İÇİNDE (§19.1) ve kayıt varken yazdıkça
 *             kaydeder — gövdede YALNIZ inceleme metni, `rating` alanı hiç
 *             gitmez (backend Phase 14: gönderilmeyen puan korunur).
 *
 * Kayıt (Log / Update) telefonla aynı yoldan: saveRating (günlük + POTM +
 * respect tek kuyrukta, kopunca bekler) → createCollectible → 7e katmanı.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronDown, Heart, Info, List as ListIcon, Minus, MoreHorizontal, PenLine, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { BROADCAST_COUNTRIES, hidesScore, resolveBroadcastCountry } from "../rankitPrefs";
import { saveRating } from "../rankitOutbox";
import { createCollectible } from "../collectibleState";
import { fromApiMatch } from "../matchModel";
import SharedMatchCard, { Shield } from "../redesign/MatchCard";
import { toMatchCardProps } from "../redesign/toMatchCardProps";
import ExpectedHeat from "../redesign/ExpectedHeat";
import CommunityVerdictGate from "../redesign/CommunityVerdictGate";
import CompanionPanel from "../redesign/CompanionPanel";
import PlayersPicker from "../redesign/PlayersPicker";
import MatchEvents from "../redesign/MatchEvents";
import { playedPlayers } from "../redesign/playedPlayers";
import { ratingField } from "../redesign/ratingField";
import { entryTagOptions, MAX_ENTRY_TAGS } from "../redesign/entryTags";
import { communityHeat, communityRatingCount, communityVerdictCovered, heatSteps, MIN_COMMUNITY_RATINGS, NAMES, RAMP } from "../redesign/heat";
import { companionMinute } from "../redesign/companionView";
import { liveFreshness } from "../redesign/liveFreshness";
import ReviewArticle from "./ReviewArticle";
import RatingStars from "./RatingStars";
import { Stars } from "./cards";
import {
  TABS, defaultTab, entryDirty, entryFromDetail, inspectorPhase, isFinished, matchLabel, positionShort,
  primaryAction, toggleHalf,
} from "./inspectorView";

const REVIEW_MAX = 4000;
const AUTOSAVE_MS = 900;

const today = () => new Date().toISOString().slice(0, 10);
const tzOffset = () => -new Date().getTimezoneOffset();
const teamName = (team) => team?.short || team?.short_name || team?.name || "";

function Eyebrow({ children, tone, color }) {
  return <span className={`riw-insp-eyebrow${tone ? ` is-${tone}` : ""}`} style={color ? { color } : undefined}>{children}</span>;
}

function Note({ children }) {
  return <p className="riw-insp-note"><Info size={17} aria-hidden="true" /><span>{children}</span></p>;
}

/* Klavyeyle gelen biri için kısayolun kendisi görünür (§20: "A shortcut
   nobody discovers is a shortcut that doesn't exist"). */
function Key({ children }) {
  return <kbd className="riw-key">{children}</kbd>;
}

/* ── Match: canlı hero (15w) ────────────────────────────────────────────────── */

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return `rgba(58,63,71,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function LiveHero({ detail, scoreHidden, onReveal }) {
  const stale = liveFreshness(detail) === "stale";
  const minute = companionMinute(detail.live_minute, detail.sport);
  const [home, away] = String(detail.score || "").split(/\s*[–-]\s*/);
  return (
    <div className="riw-insp-live" style={{
      background: `linear-gradient(160deg,${hexToRgba(detail.home?.color, 0.22)},${hexToRgba(detail.away?.color, 0.16)})` }}>
      <div className="riw-insp-live-row">
        <Shield side={51} color={detail.home?.color || "#3a3f47"} ink="#fff" abbr={teamName(detail.home).slice(0, 3).toUpperCase()}
          crestUrl={detail.home?.crest_url} badgeScale={0.3} />
        <div className="riw-insp-live-score">
          {/* B7: canlı kaynak bayatsa "LIVE" denmez; skor bilgi olarak kalır. */}
          <span className={`riw-insp-livepill${stale ? " is-stale" : ""}`}>
            {!stale && <i aria-hidden="true" />}{stale ? "DELAYED" : minute ? `LIVE · ${minute}` : "LIVE"}
          </span>
          {scoreHidden
            ? <button type="button" className="riw-insp-reveal" onClick={onReveal}>Reveal score</button>
            : <strong>{home ?? "–"}<span aria-hidden="true">–</span>{away ?? "–"}</strong>}
        </div>
        <Shield side={51} color={detail.away?.color || "#2a2e34"} ink="#fff" abbr={teamName(detail.away).slice(0, 3).toUpperCase()}
          crestUrl={detail.away?.crest_url} badgeScale={0.3} />
      </div>
      <div className="riw-insp-live-title">
        <strong>{detail.home?.name} vs {detail.away?.name}</strong>
        <small>{[detail.competition, detail.venue].filter(Boolean).join(" · ")}</small>
      </div>
    </div>
  );
}

/* ── Match: ortak parçalar ─────────────────────────────────────────────────── */

function countryLabel(code) {
  return BROADCAST_COUNTRIES.find((c) => c.code === code)?.label || code;
}

function BroadcastCard({ country, broadcast }) {
  if (!country.supported) {
    return (
      <section className="riw-insp-card">
        <div className="riw-insp-row"><Eyebrow>WATCH</Eyebrow><Eyebrow>REGION NOT SET</Eyebrow></div>
        <p className="riw-insp-text">Pick a country under Profile › Settings to see who is showing it.</p>
      </section>
    );
  }
  const channels = broadcast?.channels || [];
  const confidence = broadcast?.confidence;
  const status = broadcast === undefined ? "CHECKING" : confidence === "confirmed" ? "CONFIRMED" : confidence === "typical" ? "TYPICAL" : "NOT LISTED";
  return (
    <section className="riw-insp-card">
      <div className="riw-insp-row">
        <Eyebrow>WATCH IN {countryLabel(country.code).toUpperCase()}</Eyebrow>
        <Eyebrow tone={confidence === "confirmed" ? "green" : undefined}>{status}</Eyebrow>
      </div>
      {channels.length
        ? <div className="riw-insp-channels">{channels.map((c) => (
            <span key={c.name} className={confidence === "confirmed" ? "is-confirmed" : undefined}>{c.name}</span>
          ))}</div>
        : broadcast !== undefined && <p className="riw-insp-text">No {country.code} broadcaster has been listed for this fixture. We will tell you the moment one is.</p>}
      {confidence === "typical" && <p className="riw-insp-fine">Typical coverage for this competition — check before kick-off.</p>}
    </section>
  );
}

function LineupCard({ side }) {
  const [benchOpen, setBenchOpen] = useState(false);
  return (
    <section className="riw-insp-card riw-insp-lineup">
      <header>
        <Shield side={22} color={side.color || "#3a3f47"} ink="#fff" abbr="" crestUrl={side.crest_url} badgeScale={0.3} />
        <span>
          <strong>{side.team}</strong>
          {side.coach && <small>{side.coach}</small>}
        </span>
        {side.formation && <b>{side.formation}</b>}
      </header>
      <ol>
        {side.starters.map((p, i) => (
          <li key={`${p.player_id || p.name}-${i}`}><span>{p.shirt_no ?? ""}</span><strong>{p.name}</strong></li>
        ))}
      </ol>
      {!!side.bench?.length && (
        <>
          <button type="button" className="riw-insp-bench" aria-expanded={benchOpen} onClick={() => setBenchOpen((v) => !v)}>
            BENCH · {side.bench.length}<ChevronDown size={14} aria-hidden="true" />
          </button>
          {benchOpen && <ol className="is-bench">{side.bench.map((p, i) => (
            <li key={`${p.player_id || p.name}-b${i}`}><span>{p.shirt_no ?? ""}</span><strong>{p.name}</strong>
              {p.sub_in != null && <small>{p.sub_in}'</small>}</li>
          ))}</ol>}
        </>
      )}
    </section>
  );
}

/* 15w: sahadakiler (ilk 11'den çıkmayanlar + girenler) ve oyuna girenler.
   Takım seçimi 15y'nin segment kalıbıyla. */
function LivePitch({ lineups }) {
  const [index, setIndex] = useState(0);
  const side = lineups[Math.min(index, lineups.length - 1)];
  const onPitch = [
    ...(side.starters || []).filter((p) => p.sub_out == null),
    ...(side.bench || []).filter((p) => p.sub_in != null && p.sub_out == null),
  ];
  const cameOn = (side.bench || []).filter((p) => p.played === true && p.sub_in != null);
  return (
    <>
      {lineups.length > 1 && (
        <div className="riw-insp-segment" role="tablist" aria-label="Team">
          {lineups.map((l, i) => (
            <button key={l.team_id} type="button" role="tab" aria-selected={i === index} onClick={() => setIndex(i)}>{l.team}</button>
          ))}
        </div>
      )}
      <div className="riw-insp-row riw-insp-row-label">
        <Eyebrow>ON THE PITCH</Eyebrow>
        <span className="riw-insp-formation">{String(side.team || "").toUpperCase()}{side.formation ? ` · ${side.formation}` : ""}</span>
      </div>
      <ol className="riw-insp-pitch">
        {onPitch.map((p, i) => (
          <li key={`${p.player_id || p.name}-${i}`}><span>{p.shirt_no ?? ""}</span><strong>{p.name}</strong><small>{positionShort(p.position)}</small></li>
        ))}
      </ol>
      {!!cameOn.length && (
        <>
          <div className="riw-insp-row riw-insp-row-label"><Eyebrow>CAME ON</Eyebrow></div>
          <ol className="riw-insp-pitch is-subs">
            {cameOn.map((p, i) => (
              <li key={`${p.player_id || p.name}-c${i}`}><span>{p.sub_in}'</span><strong>{p.name}</strong>{p.replaced && <small>for {p.replaced}</small>}</li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function MatchTab({ detail, phase, scoreHidden, country, broadcast, isLoggedIn, favorited, onFavorite, onAddToList, lists, listOpen }) {
  const finished = isFinished(phase);
  const lineups = detail.lineups || [];
  const squadSize = Math.max(0, ...[detail.home, detail.away].map((team) =>
    (detail.players || []).filter((p) => p.team === teamName(team)).length));
  return (
    <div className="riw-insp-stack">
      {phase === "live" && (lineups.length
        ? <LivePitch lineups={lineups} />
        : <Note>The lineup has not reached us yet. It appears here the moment the provider confirms it.</Note>)}
      {phase === "live" && <Note>Stars and players open at full time. Moments and the crowd pulse live in the Companion tab.</Note>}

      {finished && !scoreHidden && detail.summary && <p className="riw-insp-summary">{detail.summary}</p>}
      {/* 2f "result + events": olaylar skoru söyler — kalkan açıksa gizli. */}
      {finished && !scoreHidden && (
        <div className="riw-insp-events">
          <MatchEvents events={detail.events || []} checked={!!detail.events_checked} sport={detail.sport}
            home={detail.home} away={detail.away} />
        </div>
      )}

      {(phase === "scheduled" || phase === "lineup") && (
        <div className="riw-insp-expected"><ExpectedHeat match={detail} /></div>
      )}
      {phase !== "live" && <BroadcastCard country={country} broadcast={broadcast} />}

      {phase !== "live" && (lineups.length
        ? lineups.map((side) => <LineupCard key={side.team_id} side={side} />)
        : !finished && (
          <section className="riw-insp-card is-dashed">
            <Eyebrow>SEASON SQUADS</Eyebrow>
            <p className="riw-insp-text">{squadSize ? `${squadSize} registered names per club. ` : ""}Lineups are not announced — <strong>this is not a starting eleven</strong>, and the players picker stays closed until one exists.</p>
          </section>
        ))}

      {finished && isLoggedIn && (
        <div className="riw-insp-keep">
          <Eyebrow>KEEP IT</Eyebrow>
          <div>
            <button type="button" aria-pressed={favorited} onClick={onFavorite}>
              <Heart size={15} fill={favorited ? "currentColor" : "none"} aria-hidden="true" />{favorited ? "Favourite" : "Add to favourites"}
            </button>
            <button type="button" aria-expanded={listOpen} onClick={onAddToList}><ListIcon size={15} aria-hidden="true" />Add to list</button>
          </div>
          {lists}
        </div>
      )}
    </div>
  );
}

/* ── Community ─────────────────────────────────────────────────────────────── */

function CrowdVerdict({ detail }) {
  const count = communityRatingCount(detail) ?? 0;
  const heat = communityHeat(detail);
  // §5.5: 20 puanın altında topluluk hükmünün hiçbir sayısı yok — beş
  // kişiden "%80 Classic dedi" gürültüdür. Sayaçlar (inceleme, puan) kalır.
  const classicPct = count >= MIN_COMMUNITY_RATINGS && detail.classic_count != null
    ? Math.round((detail.classic_count / count) * 100) : null;
  const short = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  return (
    <section className="riw-insp-card riw-insp-crowd">
      <div className="riw-insp-row">
        {/* §5.5 20 puanın altında ısı yok — renk uydurulmaz, sayaç kalır. */}
        <Eyebrow color={heat !== null ? RAMP[Math.max(0, Math.round(heat) - 1)] : undefined}>{heat !== null ? NAMES[Math.max(0, Math.round(heat) - 1)] : "TOO FEW RATINGS"}</Eyebrow>
        <strong>{heat !== null ? heat.toFixed(1) : "—"}</strong>
      </div>
      <div className="riw-insp-ramp" aria-hidden="true">{heatSteps(heat).map((c, i) => <i key={i} style={{ background: c }} />)}</div>
      <dl>
        <div><dt>reviews</dt><dd>{short(detail.review_count || 0)}</dd></div>
        <div><dt>called Classic</dt><dd>{classicPct === null ? "—" : `${classicPct}%`}</dd></div>
        <div><dt>ratings</dt><dd>{short(count)}</dd></div>
      </dl>
      {detail.potm && <p className="riw-insp-fine">Player of the Match: <strong>{detail.potm.name}</strong></p>}
    </section>
  );
}

function CommunityTab({ detail, phase, draft, setDraft, isLoggedIn, scoreHidden, revealed, onReveal,
                        playerOptions, onOpenPlayers, onCompose, onMinimize }) {
  if (!isFinished(phase)) {
    return (
      <div className="riw-insp-stack">
        <Note>{phase === "live"
          ? "Nothing to rate while it is live — stars open at full time. The live read is in the Companion tab."
          : "Stars, players and reviews open at full time. Until then the room is reading appetite — see Expected heat on the Match tab."}</Note>
      </div>
    );
  }
  if (!isLoggedIn) {
    return (
      <div className="riw-insp-stack">
        <section className="riw-insp-card">
          <Eyebrow>YOUR ENTRY</Eyebrow>
          <p className="riw-insp-text"><Link to="/login?next=/rankit">Sign in</Link> to rate this match and keep it in your diary.</p>
        </section>
      </div>
    );
  }
  const rating = draft.rating;
  const saved = phase === "rated";
  const covered = communityVerdictCovered({ ...detail, my_rating: rating || detail.my_rating }, { revealed });
  const setRating = (value) => setDraft((d) => ({ ...d, rating: value }));
  const toggleTag = (tag) => setDraft((d) => ({
    ...d,
    tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : d.tags.length < MAX_ENTRY_TAGS ? [...d.tags, tag] : d.tags,
  }));
  const potm = playerOptions.find((p) => p.id === draft.potmId);
  const count = communityRatingCount(detail) ?? 0;
  return (
    <div className="riw-insp-stack">
      <section className={`riw-insp-card riw-insp-entry${rating > 0 ? "" : " is-invite"}`}>
        <div className="riw-insp-row">
          <Eyebrow>YOUR ENTRY</Eyebrow>
          <Eyebrow tone={saved ? "green" : undefined}>{saved ? "SAVED" : rating > 0 ? "DRAFT" : "NOT LOGGED"}</Eyebrow>
        </div>
        {rating > 0 ? (
          <>
            <RatingStars value={rating} onChange={setRating} size={34} />
            {/* §5.5 "a user's own stars are not heat": ısı adı (COLD…HOT)
                kişinin puanına konmaz; tahtadaki "All-timer" gibi bir kişisel
                sözlük BUILD'de tanımlı değil — yalnız sayı. */}
            <p className="riw-insp-value">{rating.toFixed(1)}</p>
            <button type="button" className={`riw-insp-classic${draft.classic ? " on" : ""}`} aria-pressed={draft.classic}
              onClick={() => setDraft((d) => ({ ...d, classic: !d.classic }))}>
              <i aria-hidden="true" />{draft.classic ? "INSTANT CLASSIC" : "STAMP A CLASSIC"}<Key>C</Key>
            </button>
            {draft.review && <p className="riw-insp-review">{draft.review}</p>}
            <button type="button" className="riw-insp-write" onClick={onCompose}>
              <PenLine size={15} aria-hidden="true" />{draft.review ? "Edit your review" : "Write about the night"}
            </button>
          </>
        ) : (
          <>
            <h3 className="riw-insp-ask">How was it?</h3>
            <RatingStars value={0} onChange={setRating} size={42} />
            <p className="riw-insp-hint">Click to rate — or press <Key>1</Key>–<Key>5</Key></p>
          </>
        )}
      </section>

      {rating > 0 ? (
        <section className="riw-insp-card">
          <Eyebrow>TAGS &amp; PLAYERS</Eyebrow>
          <div className="riw-insp-tags" role="group" aria-label={`Tags, up to ${MAX_ENTRY_TAGS}`}>
            {entryTagOptions(detail.sport).map((tag) => {
              const on = draft.tags.includes(tag);
              return <button key={tag} type="button" aria-pressed={on} className={on ? "on" : undefined}
                disabled={!on && draft.tags.length >= MAX_ENTRY_TAGS} onClick={() => toggleTag(tag)}>{tag}</button>;
            })}
          </div>
          {/* §10.2: seçici yalnız doğrulanmış kadro varken açılır. */}
          {playerOptions.length ? (
            <button type="button" className="riw-insp-players" onClick={onOpenPlayers}>
              <span>
                <small>PLAYER OF THE MATCH · RESPECT</small>
                <strong>{potm ? potm.name : "Choose a player"}{draft.respect.length ? ` · ${draft.respect.length} respect` : ""}</strong>
              </span>
              <b>CHOOSE</b>
            </button>
          ) : <p className="riw-insp-fine">Player picks open once this match has a confirmed lineup.</p>}
        </section>
      ) : <Note>Tags, players and a review open once there is a rating.</Note>}

      <div className="riw-insp-row riw-insp-row-label">
        <Eyebrow>WHAT EVERYONE ELSE SAID</Eyebrow>
        <span className="riw-insp-count">{count.toLocaleString()} {count === 1 ? "rating" : "ratings"}</span>
      </div>
      {scoreHidden || covered
        ? <CommunityVerdictGate spoiler={scoreHidden} onReveal={onReveal} />
        : (
          <>
            <CrowdVerdict detail={detail} />
            {!!detail.reviews?.length && (
              <>
                <div className="riw-insp-row riw-insp-row-label">
                  <Eyebrow>MOST RESPECTED</Eyebrow>
                  {/* 7c "All 318 ›" → 7h iki sütunlu okuma. */}
                  <Link to={`/rankit/match/${detail.id}/reviews`} className="riw-insp-all" onClick={onMinimize}>
                    All {(detail.review_count || detail.reviews.length).toLocaleString()} ›
                  </Link>
                </div>
                <div className="riw-insp-reviews">
                  {detail.reviews.slice(0, 3).map((r) => <ReviewArticle key={r.id} row={r} isLoggedIn={isLoggedIn} />)}
                </div>
              </>
            )}
          </>
        )}
    </div>
  );
}

/* ── 15z: panelin içindeki yazıcı ──────────────────────────────────────────── */

function Composer({ detail, draft, setDraft, entryId, label, onDone, onSaved }) {
  const [status, setStatus] = useState(entryId ? "Saves as you type" : "Kept with your entry — it saves when you log the match");
  const field = useRef(null);
  const timer = useRef(null);
  const lastSaved = useRef(detail.my_review || "");

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  /* Yazdıkça kaydet (§19.1): YALNIZ inceleme metni. `rating` alanını
     göndermemek puanı korur; "puanı kaldır" açık `"rating": null` ister. */
  const persist = async (text) => {
    if (!entryId || text === lastSaved.current) return;
    setStatus("Saving…");
    try {
      await rankitApi.log({ match_id: detail.id, entry_id: entryId, review: text, tz_offset: tzOffset() });
      lastSaved.current = text;
      // Kayıtlı hâl de güncellenir: yazıcıdan dönünce sunucudaki metin için
      // gereksiz bir "Update your entry" çıkmasın.
      onSaved?.(text);
      setStatus("Saved to your entry");
    } catch {
      setStatus("Not saved yet — your words are still here");
    }
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (text) => {
    setDraft((d) => ({ ...d, review: text }));
    if (!entryId) return;
    clearTimeout(timer.current);
    setStatus("Saves as you type");
    timer.current = setTimeout(() => persist(text), AUTOSAVE_MS);
  };
  const done = async () => {
    clearTimeout(timer.current);
    await persist(draft.review);
    onDone();
  };

  return (
    <>
      <div className="riw-insp-compose-entry">
        <Stars value={draft.rating} compact />
        <span>{draft.rating > 0 ? draft.rating.toFixed(1) : "Not rated"}</span>
        {draft.classic && <b><i aria-hidden="true" />CLASSIC</b>}
      </div>
      <div className="riw-insp-compose">
        <label className="riw-insp-compose-field">
          <span className="riw-visually-hidden">Your review of {label}</span>
          <textarea ref={field} maxLength={REVIEW_MAX} value={draft.review}
            onChange={(event) => change(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); done(); } }}
            placeholder="What happened, and why it stayed with you." />
          <span className="riw-insp-compose-meter">
            <small>OUTFIT · WHAT YOU SAY</small>
            <small>{draft.review.length.toLocaleString("en-GB")} / {REVIEW_MAX.toLocaleString("en-GB")}</small>
          </span>
        </label>
        {/* §11.1: yazar kimlerin ne göreceğini kelimeleri seçmeden bilmeli. */}
        <section className="riw-insp-card is-quiet">
          <Eyebrow>THIS WILL BE SPOILER-SHIELDED</Eyebrow>
          <p className="riw-insp-text">Anyone with the shield on sees <strong>CONTAINS SPOILERS · TAP TO SHOW</strong> instead of your words. Write as if they will read it anyway.</p>
        </section>
      </div>
      <footer className="riw-insp-foot">
        <span className="riw-insp-foot-note" role="status">{status}</span>
        <button type="button" className="riw-insp-primary is-fit" onClick={done}>Save to your entry</button>
      </footer>
    </>
  );
}

/* ── Kabuk ─────────────────────────────────────────────────────────────────── */

export default function Inspector({ id, hideScores, onClose, onMinimize, onLogged, onOpenEntity, onCollectible, onDraftChange }) {
  const { isLoggedIn } = useAuth();
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState(null);
  const [draft, setDraft] = useState(null);
  const [composing, setComposing] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const [communityRevealed, setCommunityRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [watchlisted, setWatchlisted] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [myLists, setMyLists] = useState(null);
  const [notice, setNotice] = useState(null);
  const [companion, setCompanion] = useState(null);
  const [broadcast, setBroadcast] = useState(undefined);
  const panel = useRef(null);
  const heading = useRef(null);

  // Detay ve taslak BİRLİKTE: taslak sunucunun kaydından başlar; kayıttan
  // sonra yeniden çekilen detay taslağı da tazeler.
  useEffect(() => {
    let alive = true;
    rankitApi.match(id).then((d) => {
      if (!alive) return;
      setDetail(d);
      setDraft(entryFromDetail(d));
      setWatchlisted(!!d.watchlisted); setFavorited(!!d.favorited);
      setTab((current) => current || defaultTab(inspectorPhase(d)));
    }).catch((e) => alive && setErr(String(e.message || e)));
    return () => { alive = false; };
  }, [id, version]);

  // Companion rozeti (24 gelen / LIVE) sekme açılmadan da görünür.
  useEffect(() => {
    let alive = true;
    rankitApi.companion(id).then((c) => alive && setCompanion(c)).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  const country = useMemo(() => resolveBroadcastCountry(), []);
  useEffect(() => {
    if (!country.supported) return undefined;
    let alive = true;
    rankitApi.broadcasts(id, country.code).then((b) => alive && setBroadcast(b)).catch(() => alive && setBroadcast(null));
    return () => { alive = false; };
  }, [id, country]);

  // Açılışta odak panele (klavyeyle gelen Tab'da duvara geri kaçmasın);
  // kapanınca açan karta döner.
  useEffect(() => {
    const opener = document.activeElement;
    heading.current?.focus({ preventScroll: true });
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);

  const phase = inspectorPhase(detail);
  const saved = useMemo(() => (detail ? entryFromDetail(detail) : null), [detail]);
  const dirty = entryDirty(draft, saved);
  const scoreHidden = !!detail && hidesScore(hideScores, { ...detail, my_rating: draft?.rating || detail.my_rating }) && !scoreRevealed;
  const playerOptions = useMemo(() => playedPlayers(detail?.lineups), [detail?.lineups]);
  const eligible = useMemo(() => new Set(playerOptions.map((p) => p.id)), [playerOptions]);
  const label = matchLabel(detail, { scoreHidden });

  // Kök küçültme çipi için taslak özeti.
  useEffect(() => { onDraftChange?.({ label, rating: draft?.rating || 0, dirty }); }, [label, draft?.rating, dirty, onDraftChange]);

  const flash = (message, tone = "success") => setNotice((n) => ({ message, tone, key: (n?.key || 0) + 1 }));

  const log = async () => {
    if (!detail || !draft || saving || !(draft.rating > 0)) return;
    setSaving(true); setSaveError("");
    const entryId = detail.my_entry_id || null;
    const entry = {
      rating: draft.rating, classic: draft.classic, tags: draft.tags, review: draft.review,
      potmId: eligible.has(draft.potmId) ? draft.potmId : null,
      respect: draft.respect.filter((pid) => eligible.has(pid) && pid !== draft.potmId).slice(0, 2),
      watchedDate: detail.my_watched_date || today(),
    };
    try {
      const result = await saveRating({
        diary: {
          match_id: detail.id, entry_id: entryId || undefined, watched_date: entry.watchedDate,
          ...ratingField({ touched: true, hasEntry: !!entryId, rating: entry.rating }),
          review: entry.review, classic: entry.classic, tags: entry.tags, tz_offset: tzOffset(),
        },
        matchId: detail.id, potmId: entry.potmId, respectIds: entry.respect,
      });
      onLogged?.();
      onCollectible?.(createCollectible(fromApiMatch(detail),
        { ...entry, entryId: result?.receipt?.entry_id || entryId }, result));
      setVersion((v) => v + 1);
    } catch (e) {
      setSaveError(e.message || "Could not save. Your entry is still here.");
    } finally { setSaving(false); }
  };

  const toggleWatchlist = async () => {
    const previous = watchlisted;
    setWatchlisted(!previous);
    try {
      const r = await rankitApi.toggleWatchlist(id, !previous);
      setWatchlisted(r.watchlisted);
      flash(r.watchlisted ? "Added to your watchlist" : "Removed from your watchlist");
    } catch { setWatchlisted(previous); flash("Watchlist could not be updated", "error"); }
  };
  const toggleFavorite = async () => {
    const previous = favorited;
    setFavorited(!previous);
    try {
      const r = await rankitApi.favorite({ target_type: "match", target_id: id }, !previous);
      setFavorited(r.favorited);
      flash(r.favorited ? "Added to your favourites" : "Removed from your favourites");
    } catch { setFavorited(previous); flash("Favourite could not be updated", "error"); }
  };
  const openLists = async () => {
    const next = !listOpen;
    setListOpen(next);
    if (next && myLists === null) {
      try { setMyLists((await rankitApi.lists()).lists || []); } catch { setMyLists([]); }
    }
  };
  const addToList = async (listId, title) => {
    setListOpen(false);
    try { await rankitApi.addListItem(listId, { match_id: id }); flash(`Added to ${title}`); }
    catch { flash("Could not add to that list", "error"); }
  };

  // Klavye (§21): Escape önce yazıcıyı, sonra paneli kapatır. Community'de
  // 1–5 puan, "." yarım, C Classic — yazı alanında değilken.
  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      // Küçültülmüş panel DOM'da kalır ama klavyeyi dinlemez: yoksa 12a
      // kulübünde basılan Escape, köşede bekleyen taslağı da kapatırdı.
      if (panel.current?.closest("[hidden]")) return;
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === "Escape") {
        if (typing && !panel.current?.contains(target)) return;
        event.preventDefault();
        if (composing) setComposing(false); else onClose();
        return;
      }
      if (typing || composing || tab !== "Community" || !isFinished(phase) || !isLoggedIn || !draft) return;
      if (/^[1-5]$/.test(event.key)) { event.preventDefault(); setDraft((d) => ({ ...d, rating: Number(event.key) })); }
      else if (event.key === ".") { event.preventDefault(); setDraft((d) => ({ ...d, rating: toggleHalf(d.rating) })); }
      else if ((event.key === "c" || event.key === "C") && draft.rating > 0) { event.preventDefault(); setDraft((d) => ({ ...d, classic: !d.classic })); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [composing, tab, phase, isLoggedIn, draft, onClose]);

  const action = detail && draft ? primaryAction(tab, phase, { rating: draft.rating, dirty, watchlisted }) : null;
  const runAction = () => {
    if (!action) return;
    if (action.kind === "watchlist") toggleWatchlist();
    else if (action.kind === "companion") setTab("Companion");
    else if (action.kind === "rate") setTab("Community");
    else if (action.kind === "log") log();
  };

  const selectTab = (name) => { setTab(name); setListOpen(false); };
  const onTabKey = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    selectTab(next);
    event.currentTarget.parentElement?.querySelector(`[data-tab="${next}"]`)?.focus();
  };

  const badge = companion?.badge;
  const listChips = listOpen && (
    <div className="riw-insp-lists">
      {myLists === null && <span className="riw-insp-fine">Loading…</span>}
      {myLists?.map((l) => <button key={l.id} type="button" onClick={() => addToList(l.id, l.title)}><ListIcon size={12} aria-hidden="true" />{l.title}</button>)}
      {myLists?.length === 0 && <span className="riw-insp-fine">No lists yet — make one under Lists.</span>}
    </div>
  );

  return (
    <aside className="riw-insp" ref={panel} role="dialog" aria-modal="false" aria-labelledby="riw-insp-title">
      <header className="riw-insp-head">
        <h2 id="riw-insp-title" ref={heading} tabIndex={-1}>{composing ? "WRITE" : "INSPECTOR"}{label ? ` · ${label}` : ""}</h2>
        {/* Outlook'un taslak penceresi gibi: küçültmek ARA VERMEK, kapatmak
            çıkmak. Taslak küçültmede de yaşar (bileşen DOM'da kalır). */}
        <button type="button" onClick={onMinimize} aria-label="Minimise"><Minus size={15} /></button>
        <button type="button" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </header>

      {!detail && !err && <div className="riw-insp-loading" aria-busy="true"><div /><div /><div /></div>}
      {err && <p className="riw-note riw-insp-error" role="alert">{err}</p>}

      {detail && draft && composing && (
        <Composer detail={detail} draft={draft} setDraft={setDraft} entryId={detail.my_entry_id || null}
          label={matchLabel(detail)} onDone={() => setComposing(false)}
          onSaved={(text) => setDetail((d) => ({ ...d, my_review: text }))} />
      )}

      {detail && draft && !composing && (
        <>
          <div className="riw-insp-scroll">
            {tab === "Match" && (phase === "live"
              ? <LiveHero detail={detail} scoreHidden={scoreHidden} onReveal={() => setScoreRevealed(true)} />
              : (
                <div className="riw-insp-hero">
                  <SharedMatchCard
                    {...toMatchCardProps(fromApiMatch({ ...detail, my_rating: draft.rating || detail.my_rating }),
                      { hideScores: hideScores && !scoreRevealed, scoreSize: 46, cardWidth: 428, crestSize: isFinished(phase) ? 56 : 52 })}
                    onOpenCompetition={detail.competition_id ? () => onOpenEntity?.("competition", detail.competition_id) : undefined}
                    artHeight={isFinished(phase) ? 132 : 118} crestSize={isFinished(phase) ? 56 : 52} cut={22} />
                </div>
              ))}

            <div className="riw-insp-tabs" role="tablist" aria-label="Inspector">
              {TABS.map((name) => (
                <button key={name} type="button" role="tab" data-tab={name} aria-selected={tab === name}
                  tabIndex={tab === name ? 0 : -1} onKeyDown={onTabKey} onClick={() => selectTab(name)}>
                  {name}
                  {name === "Companion" && badge && <b className={badge === "LIVE" ? "is-live" : undefined}>{badge}</b>}
                </button>
              ))}
            </div>

            <div className="riw-insp-body" role="tabpanel" aria-label={tab}>
              {tab === "Match" && (
                <MatchTab detail={detail} phase={phase} scoreHidden={scoreHidden} country={country} broadcast={broadcast}
                  isLoggedIn={isLoggedIn} favorited={favorited} onFavorite={toggleFavorite} onAddToList={openLists}
                  lists={listChips} listOpen={listOpen} />
              )}
              {tab === "Community" && (
                <CommunityTab detail={detail} phase={phase} draft={draft} setDraft={setDraft} isLoggedIn={isLoggedIn}
                  scoreHidden={scoreHidden} revealed={communityRevealed}
                  onReveal={() => { setScoreRevealed(true); setCommunityRevealed(true); }}
                  playerOptions={playerOptions} onOpenPlayers={() => setPlayersOpen(true)} onCompose={() => setComposing(true)}
                  onMinimize={onMinimize} />
              )}
              {tab === "Companion" && (
                <div className="riw-insp-companion">
                  <CompanionPanel matchId={detail.id} sport={detail.sport} isLoggedIn={isLoggedIn} rated={phase === "rated"}
                    onRate={() => selectTab("Community")} onStateChange={setCompanion} />
                </div>
              )}
            </div>
          </div>

          {action && (
            <footer className="riw-insp-foot">
              {saveError && <p className="riw-insp-foot-error" role="alert">{saveError}</p>}
              <button type="button" className="riw-insp-primary" disabled={!!action.disabled || saving} aria-busy={saving}
                onClick={runAction}>
                {action.kind === "watchlist" && <Bookmark size={15} fill={watchlisted ? "currentColor" : "none"} aria-hidden="true" />}
                {action.kind === "companion" && <i className="riw-insp-dot" aria-hidden="true" />}
                {saving ? "Saving…" : action.label}
              </button>
              {action.kind === "watchlist" && isLoggedIn && (
                <button type="button" className="riw-insp-secondary" aria-label="More: favourite or add to a list"
                  aria-expanded={listOpen} onClick={openLists}><MoreHorizontal size={17} /></button>
              )}
              {action.kind === "watchlist" && listOpen && (
                <div className="riw-insp-more" role="group" aria-label="More">
                  <button type="button" aria-pressed={favorited} onClick={toggleFavorite}>
                    <Heart size={14} fill={favorited ? "currentColor" : "none"} aria-hidden="true" />{favorited ? "Favourite" : "Add to favourites"}
                  </button>
                  {listChips}
                </div>
              )}
            </footer>
          )}
        </>
      )}

      {notice && (
        <div key={notice.key} role="status" className={`ri-action-toast ${notice.tone}`} onAnimationEnd={() => setNotice(null)}>{notice.message}</div>
      )}
      {/* 15y: diyalog, sayfa değil. Oylar taslağa yazılır ve kayıtla gider —
          telefonla aynı (saveRating günlük + POTM + respect'i birlikte taşır). */}
      {playersOpen && playerOptions.length > 0 && (
        <PlayersPicker variant="web" players={playerOptions} potmId={draft.potmId} respectIds={draft.respect}
          onPotm={(pid) => setDraft((d) => ({ ...d, potmId: pid, respect: d.respect.filter((x) => x !== pid) }))}
          onRespect={(pid) => setDraft((d) => {
            if (pid === d.potmId) return d;
            if (d.respect.includes(pid)) return { ...d, respect: d.respect.filter((x) => x !== pid) };
            return d.respect.length < 2 ? { ...d, respect: [...d.respect, pid] } : d;
          })}
          onClose={() => setPlayersOpen(false)} matchLabel={matchLabel(detail, { scoreHidden })} />
      )}
    </aside>
  );
}
