/* 12c — The Hunt, koleksiyon ızgarası (BUILD §24: koleksiyon ürünündür —
 * halka ve ödül; liste değil).
 *
 *   sol    300: COLLECTIONS · N ACTIVE — halka (yüzde), ad, "8 of 12";
 *          açılmamış olan kesikli + açılış notu · FINISHING THIS UNLOCKS
 *          (seçili koleksiyonun skin ödülü)
 *   sağ    COLLECTION · 2026/27 SEASON · başlık · "Rate all twelve…" · 104'lük
 *          halka · THE FULL GRID (lejantlı): toplanan kart → oynanmış ama
 *          puanlanmamış (kesikli) → sıradaki (kırmızı çerçeve) → kalanlar
 *
 * Seçili koleksiyon adreste (`/rankit/hunt/:collectionId`). Veri
 * `/collections`, `/collections/{id}`.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import SharedMatchCard from "../redesign/MatchCard";
import { collectionPercent, collectionSentence, ringFill, unscheduledNote } from "../redesign/huntSummary";
import MatchTile from "./MatchTile";
import { compactCardProps, dateEyebrow, huntGrid } from "./pagesView";

const seasonLabel = (c) => (c?.season ? `${String(c.season).replace("-", "/")} SEASON` : c?.year ? String(c.year) : "");
const clubTitle = (c) => {
  const club = c?.kind === "club_season" ? (c.team?.short_name || c.team?.name) : "";
  return club ? `${club} · ${c.title}` : c?.title || "";
};

function Ring({ pct, size, children, label }) {
  return (
    <span className={`riw-hunt-ringbox is-${size}`} role="img" aria-label={label} style={{ "--fill": ringFill(pct) }}>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}

function Detail({ d, error, hideScores, onOpenMatch }) {
  if (error) return <p className="riw-note" role="alert">{error}</p>;
  if (!d) return <div className="riw-read-skeleton" aria-busy="true" />;

  const pct = collectionPercent(d) ?? 0;
  const grid = huntGrid(d);
  const note = unscheduledNote(d.unscheduled);
  return (
    <section className="riw-hunt-detail" aria-labelledby="riw-hunt-title">
      <div className="riw-lists-head">
        <div>
          <p className="riw-page-eyebrow">COLLECTION{seasonLabel(d) ? ` · ${seasonLabel(d)}` : ""}</p>
          <h1 id="riw-hunt-title">{clubTitle(d)}</h1>
          <p className="riw-lists-desc">{d.subtitle ? `${d.subtitle}. ` : ""}{collectionSentence(d)}</p>
        </div>
        {Number(d.total) > 0 && (
          <Ring pct={pct} size="big" label={`${d.collected} of ${d.total} collected`}>
            <b>{d.collected}</b><small>OF {d.total}</small>
          </Ring>
        )}
      </div>

      {grid.length > 0 && (
        <>
          <div className="riw-hunt-legendrow">
            <h2 className="riw-page-eyebrow">THE FULL GRID</h2>
            <ul className="riw-hunt-legend" aria-label="Legend">
              <li><i className="is-collected" aria-hidden="true" />collected</li>
              <li><i className="is-next" aria-hidden="true" />next up</li>
              <li><i className="is-missing" aria-hidden="true" />still missing</li>
            </ul>
          </div>
          <div className="riw-hunt-grid">
            {grid.map(({ kind, match }) => kind === "collected" ? (
              <div key={match.id} className="riw-card-slot riw-shelf-slot riw-hunt-slot is-community" role="button" tabIndex={0}
                aria-label={`${match.home?.name} versus ${match.away?.name}, collected`}
                onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(match.id); }}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(match.id); }
                }}>
                <SharedMatchCard {...compactCardProps(match, { hideScores, eyebrow: dateEyebrow(match.starts_at) })} scoreSize={match.sport === "Basketball" ? 15 : 19} crestSize={30} artHeight={42} cut={14} />
              </div>
            ) : <MatchTile key={match.id} kind={kind} match={match} onOpen={onOpenMatch} />)}
          </div>
          {note && <p className="riw-page-fine riw-hunt-note">{note}</p>}
        </>
      )}
      {!grid.length && <div className="riw-page-empty riw-profile-empty"><strong>Nothing to collect yet</strong><p>{d.opens_note || "Opens when the schedule is published."}</p></div>}
    </section>
  );
}

export default function HuntPage({ collectionId, hideScores, onOpenMatch }) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [hunt, setHunt] = useState(null);
  const [detail, setDetail] = useState({ id: null, data: null, error: "" });

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.collections().then((d) => alive && setHunt(d)).catch(() => alive && setHunt({ collections: [] }));
    return () => { alive = false; };
  }, [isLoggedIn]);

  const collections = hunt?.collections || [];
  const open = collections.filter((c) => c.status !== "not_open");
  const selected = collectionId || open[0]?.id || null;
  const active = collections.filter((c) => c.status === "active").length;
  const current = collections.find((c) => String(c.id) === String(selected));

  // Ayrıntı tek istek: ızgara sağda, ödül (`skin_reward`) sol sütunda.
  useEffect(() => {
    if (!selected) return undefined;
    let alive = true;
    rankitApi.collection(selected)
      .then((data) => alive && setDetail({ id: selected, data, error: "" }))
      .catch((e) => alive && setDetail({ id: selected, data: null, error: String(e.message || e) }));
    return () => { alive = false; };
  }, [selected]);
  const d = detail.id === selected ? detail.data : null;
  const reward = d?.skin_reward || null;

  if (!isLoggedIn) {
    return (
      <div className="riw-page">
        <header className="riw-page-head"><div><p className="riw-page-eyebrow">THE HUNT</p><h1>Collections</h1></div></header>
        <div className="riw-page-empty"><strong>Sign in to start collecting</strong><p>Follow a club and every match of its season becomes a collection. <Link to="/login?next=/rankit/hunt">Sign in</Link></p></div>
      </div>
    );
  }

  return (
    <div className="riw-page riw-lists riw-hunt">
      <aside className="riw-lists-side is-narrow" aria-label="Collections">
        <h2 className="riw-page-eyebrow riw-hunt-sidehead">COLLECTIONS{hunt ? ` · ${active} ACTIVE` : ""}</h2>
        {!hunt && <div className="riw-read-skeleton" aria-busy="true" />}
        {hunt && !collections.length && <p className="riw-page-fine riw-lists-fine">Follow a club to start a season collection.</p>}
        <div className="riw-lists-stack">
          {collections.map((c) => c.status === "not_open" ? (
            <div key={c.id} className="riw-hunt-item is-closed">
              <strong>{clubTitle(c)}</strong>
              <small>{c.opens_note || "Opens when the schedule is published."}</small>
            </div>
          ) : (
            <button key={c.id} type="button" className={`riw-hunt-item${String(c.id) === String(selected) ? " is-on" : ""}`}
              aria-current={String(c.id) === String(selected) ? "true" : undefined} onClick={() => navigate(`/rankit/hunt/${c.id}`)}>
              <Ring pct={collectionPercent(c)} size="small" label={`${collectionPercent(c) ?? 0}%`}><b>{collectionPercent(c) ?? 0}</b></Ring>
              <span><strong>{clubTitle(c)}</strong><small>{c.collected} of {c.total}</small></span>
            </button>
          ))}
        </div>
        {reward && current && (
          <div className="riw-hunt-reward">
            <p className="riw-page-eyebrow">{reward.unlocked ? "UNLOCKED" : "FINISHING THIS UNLOCKS"}</p>
            <div><span className="riw-hunt-skin" aria-hidden="true" /><span><strong>{reward.name}</strong><small>a card skin</small></span></div>
          </div>
        )}
      </aside>
      <div className="riw-lists-main">
        {selected
          ? <Detail d={d} error={detail.id === selected ? detail.error : ""} hideScores={hideScores} onOpenMatch={onOpenMatch} />
          : hunt && <div className="riw-page-empty riw-profile-empty"><strong>No collection open yet</strong><p>Follow a club — its season becomes a collection you complete by rating every match.</p></div>}
      </div>
    </div>
  );
}
