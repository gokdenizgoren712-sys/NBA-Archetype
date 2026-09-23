/* The Hunt — ekranlar 2m (dizin) ve 2n (tek koleksiyon).
 *
 * Görsel kaynak: `RankIt Redesign.dc.html#2m` ve `#2n`. Sayıların hepsi uçtan
 * (`GET /collections`, `GET /collections/{id}`); bu dosya yalnız çiziyor.
 * 2n'nin başlığı tahtada "honest about gaps": toplananlar, oynanmış ama
 * henüz puanlanmamışlar, sıradakiler ve PLANLANMAMIŞ fikstür sayısı. Fikstür
 * uydurulmaz; planlanmamış olanlar yalnız sayıyla söylenir.
 *
 * Yığın kalıbı MemberProfile ile aynı: itilen ekran `position:absolute`,
 * maç sayfası (`.ri-sheet-wrap`, fixed z:20) üstünde açılır.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { ratingAccount } from "../rankitOutbox";
import { hidesScore } from "../rankitPrefs";
import { useResource } from "./useResource";
import { useDialog } from "./useDialog";
import { useBackClose } from "./backStack";
import { ErrorState, Loading, SkeletonRows } from "./States";
import { RAMP } from "./heat";
import { lockSwatch } from "./skins";
import {
  huntPercent, collectionPercent, collectionExtra, collectionSentence, unscheduledNote, dayLabel, timeLabel,
} from "./huntSummary";

const RING_OFF = "rgba(255,255,255,.08)";

/* Tahtadaki halka: ısı rampası ilerleme noktasına kadar, gerisi sönük.
   Rampa renkleri ilerlemeyle birlikte ısınıyor (tahta böyle çiziyor). */
function ProgressRing({ pct, size = 48, inset = 5, fontSize = 13, label, hole = "#151618" }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
  const stops = RAMP.slice(0, Math.max(2, Math.ceil(p * RAMP.length)));
  const fill = p > 0
    ? `conic-gradient(from -90deg,${stops.map((c, i) => `${c} ${(i / (stops.length - 1)) * p}turn`).join(",")},${RING_OFF} ${p}turn)`
    : RING_OFF;
  return <div className="ri-hunt-ring" style={{ width: size, height: size }} aria-hidden="true">
    <i style={{ background: fill }} />
    <i style={{ inset, background: hole }} />
    <span style={{ fontSize }}>{label}</span>
  </div>;
}

function Screen({ label, onClose, children }) {
  const dialog = useDialog({ onClose, label });
  useBackClose(onClose);
  const screen = <section {...dialog} className="ri-hunt">
    <header className="ri-hunt-head">
      <button type="button" onClick={onClose} aria-label="Back"><ChevronLeft size={20} /></button>
    </header>
    <div className="ri-hunt-body">{children}</div>
  </section>;
  const host = document.querySelector(".rankit-app");
  return host ? createPortal(screen, host) : screen;
}

/* ── 2m ─────────────────────────────────────────────────────────────────── */

export default function HuntIndex({ onClose, onOpenMatch, hideScores, collectionId = null, onCollection }) {
  /* Acik koleksiyon CAGIRANDA tutulur (kontrollu). Icerde tutuldugunda,
     koleksiyondan bir mac puanlanip 6a'ya gidilince kabuk degisiyor, bu
     bilesen yeniden kuruluyor ve kullanici puanladigi koleksiyona degil
     dizine donuyordu (olculdu). Kontrolsuz kullanim icin yerel yedek var. */
  const [localId, setLocalId] = useState(collectionId);
  const openId = onCollection ? collectionId : localId;
  const setOpenId = onCollection || setLocalId;
  const { data, error, loading, reload } = useResource(`hunt:${ratingAccount()}`, () => rankitApi.collections());
  const summary = data?.summary;
  const items = data?.collections || [];
  const pct = huntPercent(summary);

  return <>
    <Screen label="The Hunt" onClose={onClose}>
      <p className="ri-hunt-eyebrow">MATCHES WORTH CHASING</p>
      <h1 className="ri-hunt-title">The Hunt</h1>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading collections"><SkeletonRows count={3} height={96} /></Loading>}
      {summary && <div className="ri-hunt-summary-card">
        <ProgressRing pct={(summary.pct ?? 0) * 100} size={70} inset={7} fontSize={18} hole="#121315"
          label={pct ?? "—"} />
        <div>
          <strong>{summary.active} collection{summary.active === 1 ? "" : "s"} active</strong>
          <p>{summary.total
            ? `${summary.collected} of ${summary.total} collected.${summary.one_left ? ` ${summary.one_left === 1 ? "One is" : `${summary.one_left} are`} one night from closing.` : ""}`
            : "Follow a club to start a season collection."}</p>
        </div>
      </div>}
      <div className="ri-hunt-list">
        {items.map((item) => {
          const extra = collectionExtra(item);
          const closed = item.status === "not_open";
          const p = collectionPercent(item);
          return <button type="button" key={item.id} className={`ri-hunt-row${closed ? " is-closed" : ""}`}
            disabled={closed} onClick={() => setOpenId(item.id)}
            aria-label={`${item.title}${closed ? ", not open yet" : `, ${item.collected} of ${item.total} collected`}`}>
            <div className="ri-hunt-row-top">
              <span>
                <strong>{item.title}</strong>
                {!closed && <small>{[item.subtitle, `${item.collected} of ${item.total}`].filter(Boolean).join(" · ")}</small>}
                {closed && <small className="is-note">{extra?.text}</small>}
              </span>
              {!closed && p !== null && <ProgressRing pct={p} label={p} />}
            </div>
            {!closed && extra && <p className={`ri-hunt-extra is-${extra.kind}`}>{extra.text}</p>}
          </button>;
        })}
      </div>
    </Screen>
    {openId != null && <CollectionScreen id={openId} hideScores={hideScores}
      onClose={() => setOpenId(null)} onOpenMatch={onOpenMatch} />}
  </>;
}

/* ── 2n ─────────────────────────────────────────────────────────────────── */

function score(match, hideScores) {
  if (hidesScore(hideScores, match)) return "—";
  return match.home_score != null && match.away_score != null ? `${match.home_score}–${match.away_score}` : "";
}

function short(team) { return team?.short || team?.short_name || team?.name || ""; }

export function CollectionScreen({ id, onClose, onOpenMatch, hideScores }) {
  const { data, error, loading, reload } = useResource(`collection:${ratingAccount()}:${id}`,
    () => rankitApi.collection(id));
  const d = data;
  const [next, ...later] = d?.upcoming_matches || [];

  return <Screen label={d?.title || "Collection"} onClose={onClose}>
    {error && <ErrorState error={error} onRetry={reload} />}
    {loading && !d && <Loading label="Loading collection"><SkeletonRows count={4} height={64} /></Loading>}
    {d && <>
      <div className="ri-coll-head">
        <div className="ri-coll-count"><strong>{d.collected}</strong><span>OF {d.total}</span></div>
        <div>
          <p className="ri-hunt-eyebrow">COLLECTION</p>
          <h1 className="ri-coll-title">{d.title}</h1>
        </div>
      </div>
      <p className="ri-coll-sentence">{collectionSentence(d)}</p>
      {/* Lig skini (sahibin karari 2026-09-23): bu ligde bir kulup sezonunu
          bitirmek o ligin skinini acar. 2m'nin odul satiriyla ayni dil. */}
      {d.skin_reward && <p className={`ri-coll-reward${d.skin_reward.unlocked ? " is-owned" : ""}`}>
        <i style={{ background: lockSwatch(d.skin_reward.id) }} aria-hidden="true" />
        <span>{d.skin_reward.unlocked
          ? `THE ${d.skin_reward.name.toUpperCase()} SKIN IS IN YOUR SKINS`
          : `FINISHING THIS UNLOCKS THE ${d.skin_reward.name.toUpperCase()} SKIN`}</span>
      </p>}

      {!!d.collected_matches?.length && <section>
        <div className="ri-coll-section"><span>COLLECTED</span><small>Season order</small></div>
        <div className="ri-coll-rows">
          {d.collected_matches.map((m) => <button type="button" key={m.id} className="ri-coll-row is-collected"
            onClick={() => onOpenMatch?.(m)}>
            <strong>{short(m.home)}–{short(m.away)}</strong><b>{score(m, hideScores)}</b>
          </button>)}
        </div>
      </section>}

      {/* Oynanmış ama puanlanmamış: şu an kapatılabilecek boşluklar. Aynı
          ürün dili 3j'de de var ("NOT YET LOGGED"). */}
      {!!d.open_matches?.length && <section>
        <div className="ri-coll-section"><span>PLAYED · NOT YET LOGGED</span></div>
        <div className="ri-coll-rows">
          {d.open_matches.map((m) => <button type="button" key={m.id} className="ri-coll-row is-open"
            onClick={() => onOpenMatch?.(m)}>
            <strong>{short(m.home)} vs {short(m.away)}</strong><ChevronRight size={15} />
          </button>)}
        </div>
      </section>}

      {next && <button type="button" className="ri-coll-next" onClick={() => onOpenMatch?.(next)}>
        <small>{[dayLabel(next.starts_at).toUpperCase(), timeLabel(next.starts_at)].filter(Boolean).join(" ")}</small>
        <strong>{next.home?.name}</strong><strong>{next.away?.name}</strong>
      </button>}

      {!!later.length && <section>
        <div className="ri-coll-section"><span>Next in line</span></div>
        <div className="ri-coll-rows">
          {later.map((m) => <button type="button" key={m.id} className="ri-coll-row" onClick={() => onOpenMatch?.(m)}>
            <strong>{m.home?.name} · {m.away?.name}</strong><small>{dayLabel(m.starts_at)}</small>
          </button>)}
        </div>
      </section>}

      {unscheduledNote(d.unscheduled) && <p className="ri-coll-note">{unscheduledNote(d.unscheduled)}</p>}
    </>}
  </Screen>;
}
