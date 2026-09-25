/* 10a — kişiler (BUILD Phase 16: "mobile's two screens become one, because
 * the list *is* the 'am I already following them' check").
 *
 *   sol    Following / Followers (sayılarıyla, adreste `?tab=`) · kendi
 *          listende arama · SORTED BY AGREEMENT · satır: ad, "284 logged ·
 *          31 classics", uyum çubuğu + yüzde (sayı çubuğun YANINDA — renk tek
 *          başına değil, §6), ilişki (§13.4: MUTUAL / FOLLOWING / FOLLOW /
 *          FOLLOW BACK); on ortak maçtan azsa "Too few to compare"
 *   sağ    452: herkeste arama · YOU AGREE WITH THESE PEOPLE (`/people/
 *          discover`) · FOLLOWS YOU çipi · eğilim cümlesi · "62 of 77 shared"
 *
 * "From Primary Arch · 14 people you already know" için veri yok
 * (`primary_arch_connections: null`) — satır uydurulmaz.
 */
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { relationshipState } from "../redesign/relationshipState";
import { initials } from "../redesign/feedItems";
import { RAMP, RAMP_OFF } from "../redesign/heat";
import { PageHead, SortBar } from "./PageParts";
import { agreementView, leaningLine, personStats } from "./pagesView";

function useRelation(person) {
  const [following, setFollowing] = useState(null);
  const value = following ?? !!person.following;
  const toggle = async () => {
    const before = value;
    setFollowing(!before);
    try {
      const r = await rankitApi.follow({ target_type: "user", target_id: person.id, notify: false }, !before);
      setFollowing(!!r.following);
    } catch { setFollowing(before); }
  };
  return [relationshipState(value, !!person.follows_you), toggle];
}

function RelationButton({ rel, person, onToggle }) {
  const on = rel.key === "mutual" || rel.key === "following";
  return (
    <button type="button" className={`riw-rel is-${rel.key}`} onClick={onToggle}
      aria-label={on ? `${rel.label} with @${person.username} — unfollow` : `${rel.label} @${person.username}`}>
      {rel.label.toUpperCase()}
    </button>
  );
}

function Bars({ steps, gap = 3 }) {
  return (
    <span className="riw-agree-bars" style={{ gap }} aria-hidden="true">
      {RAMP.map((c, i) => <i key={c} style={{ background: i < steps ? c : RAMP_OFF }} />)}
    </span>
  );
}

function PersonRow({ person, onOpen }) {
  const [rel, toggle] = useRelation(person);
  const agree = agreementView(person.overlap);
  return (
    <li className="riw-people-row">
      <button type="button" className="riw-people-open" onClick={() => onOpen(person.id)}>
        <span className="riw-review-avatar" aria-hidden="true">{initials(person.username)}</span>
        <span><strong>@{person.username}</strong><small>{personStats(person)}</small></span>
      </button>
      <span className="riw-agree" title={agree.long}>
        {agree.pct == null
          ? <small>Too few to<br />compare</small>
          : <><Bars steps={agree.steps} /><b>{agree.short}</b><span className="sr-only"> agreement</span></>}
      </span>
      <RelationButton rel={rel} person={person} onToggle={toggle} />
    </li>
  );
}

function SuggestCard({ person, onOpen }) {
  const [rel, toggle] = useRelation(person);
  const agree = agreementView(person.overlap);
  const lean = leaningLine(person.overlap?.bias);
  const on = rel.key === "mutual" || rel.key === "following";
  return (
    <li className="riw-suggest">
      <div className="riw-suggest-top">
        <button type="button" className="riw-people-open" onClick={() => onOpen(person.id)}>
          <span className="riw-review-avatar" aria-hidden="true">{initials(person.username)}</span>
          <span>
            <strong>@{person.username}{person.follows_you && !person.following && <em>FOLLOWS YOU</em>}</strong>
            <small>{agree.pct == null ? agree.long : lean || personStats(person)}</small>
          </span>
        </button>
        {on ? <RelationButton rel={rel} person={person} onToggle={toggle} />
          : <button type="button" className="riw-rel is-cta" onClick={toggle} aria-label={`${rel.label} @${person.username}`}>{rel.label.toUpperCase()}</button>}
      </div>
      {agree.pct != null && (
        <div className="riw-suggest-agree">
          <b style={{ color: agree.color }}>{agree.short}</b>
          <Bars steps={agree.steps} gap={4} />
          <small>{agree.long}</small>
        </div>
      )}
    </li>
  );
}

function SearchField({ label, value, onChange }) {
  return (
    <label className="riw-people-search">
      <Search size={15} aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label} />
    </label>
  );
}

/* Kendi listen (`/people`) ya da herkes (`/people/discover`); yazarken her
   tuşta istek atılmasın diye kısa bir bekleme. */
function fetchPeople(source, kind, q, offset) {
  return source === "discover"
    ? rankitApi.discoverPeople({ q, offset, limit: 12 })
    : rankitApi.people({ kind, q, offset, limit: 30 });
}

function usePeople(source, kind, q) {
  const [state, setState] = useState({ key: null, rows: [], next: null, total: 0, counts: null, error: "" });
  const key = `${source}:${kind}:${q}`;
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      fetchPeople(source, kind, q, 0)
        .then((d) => alive && setState({ key, rows: d.people || [], next: d.next_offset ?? null, total: d.total ?? (d.people || []).length, counts: d.counts || null, error: "" }))
        .catch((e) => alive && setState({ key, rows: [], next: null, total: 0, counts: null, error: String(e.message || e) }));
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [key, source, kind, q]);
  const more = async () => {
    if (state.next == null) return;
    try {
      const d = await fetchPeople(source, kind, q, state.next);
      setState((s) => ({ ...s, rows: [...s.rows, ...(d.people || [])], next: d.next_offset ?? null }));
    } catch { /* düğme kalır */ }
  };
  return [state.key === key ? state : null, more];
}

export default function PeoplePage({ tab, onTab, onOpenMember }) {
  const { isLoggedIn, user } = useAuth();
  const kind = tab === "followers" ? "followers" : "following";
  const [mine, setMine] = useState("");
  const [anyone, setAnyone] = useState("");
  const [list, loadMore] = usePeople("mine", kind, mine.trim());
  const [suggest] = usePeople("discover", "", anyone.trim());

  if (!isLoggedIn) {
    return (
      <div className="riw-page">
        <PageHead eyebrow="PEOPLE" title="People" />
        <div className="riw-page-empty"><strong>Sign in to see who you follow</strong><p>People are matched by how closely their ratings agree with yours.</p></div>
      </div>
    );
  }

  const counts = list?.counts;
  const lastPct = list?.rows?.length ? agreementView(list.rows[list.rows.length - 1].overlap).pct : null;
  const remaining = list ? Math.max(0, (list.total || 0) - list.rows.length) : 0;

  return (
    <div className="riw-page riw-people">
      <PageHead eyebrow={`@${String(user?.username || "").toUpperCase()}`} title="People">
        <SortBar label="Whose list" value={kind} onChange={onTab} options={[
          { key: "following", label: `Following${counts ? ` ${counts.following.toLocaleString()}` : ""}` },
          // §13.2: takipçi SAYISI yok — sekme var, sayı yok.
          { key: "followers", label: "Followers" },
        ]} />
      </PageHead>

      <div className="riw-people-body">
        <section className="riw-people-main" aria-labelledby="riw-people-sorted">
          <SearchField label={kind === "followers" ? "Search your followers" : "Search the people you follow"} value={mine} onChange={setMine} />
          <div className="riw-search-sechead">
            <h2 id="riw-people-sorted">SORTED BY AGREEMENT</h2>
            {/* Takipçi listesinin boyu da bir takipçi sayısı (§13.2) — yalnız takip ettiklerinde. */}
            {list && kind === "following" && <span>{(list.total || 0).toLocaleString()} {list.total === 1 ? "person" : "people"}</span>}
          </div>
          {list?.error && <p className="riw-note" role="alert">{list.error}</p>}
          {!list && <div className="riw-read-skeleton" aria-busy="true" />}
          {list && !list.error && (list.rows.length ? (
            <ul className="riw-people-list">
              {list.rows.map((p) => <PersonRow key={p.id} person={p} onOpen={onOpenMember} />)}
              {remaining > 0 && (
                <li className="riw-people-more">
                  <button type="button" onClick={loadMore}>{kind === "following" ? `${remaining.toLocaleString()} more` : "Show more"}</button>
                  {lastPct != null && <small>below {lastPct}% agreement</small>}
                </li>
              )}
            </ul>
          ) : (
            <div className="riw-page-empty riw-profile-empty">
              <strong>{mine.trim() ? "Nobody by that name" : kind === "followers" ? "No followers yet" : "You don't follow anyone yet"}</strong>
              <p>{kind === "followers" ? "When someone follows you, they appear here — with how closely you agree." : "People you agree with are on the right."}</p>
            </div>
          ))}
        </section>

        <section className="riw-people-side" aria-labelledby="riw-people-agree">
          <SearchField label="Find anyone by name or @handle" value={anyone} onChange={setAnyone} />
          <h2 id="riw-people-agree" className="riw-page-eyebrow riw-people-label">{anyone.trim() ? "PEOPLE" : "YOU AGREE WITH THESE PEOPLE"}</h2>
          {!suggest && <div className="riw-read-skeleton" aria-busy="true" />}
          {suggest && (suggest.rows.length ? (
            <ul className="riw-suggest-list">{suggest.rows.map((p) => <SuggestCard key={p.id} person={p} onOpen={onOpenMember} />)}</ul>
          ) : <p className="riw-page-fine riw-profile-fine">{anyone.trim() ? "Nobody by that name." : "Rate a few more matches — suggestions come from shared ratings."}</p>)}
        </section>
      </div>
    </div>
  );
}
