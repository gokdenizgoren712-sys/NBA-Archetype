/* 11c — arama sonuçları, tam sayfa.
 *
 *   başlık   N RESULTS FOR "ARSENAL" · Search; sekmeler görünür, sayılarıyla
 *            (All / Matches / Clubs / People / Lists / Players) — sayılar
 *            uçtan gerçek toplamlar (`counts`), ilk 20 değil
 *   All      kulüp kartları · MATCHES · HOTTEST FIRST (dört kart) · PEOPLE |
 *            LISTS yan yana · oyuncular
 *   satırlar kulüp "Premier League · 4.3 avg heat" + FOLLOW / FOLLOWING;
 *            kişi "31 Arsenal matches logged" + ilişki (§13.4: FOLLOW /
 *            FOLLOW BACK / FOLLOWING / MUTUAL); liste "12 matches · by @selin"
 *
 * Sorgu adreste (`/rankit/search?q=`), giriş başlıktaki alan. Sekme de
 * adreste (`&tab=`), 12a'nın "All Arsenal matches"ı doğrudan Matches'e iner.
 * Veri tek istek: `GET /search?match_sort=hottest` (bölüm başına 20).
 */
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import SharedMatchCard, { Shield } from "../redesign/MatchCard";
import { relationshipState } from "../redesign/relationshipState";
import { initials } from "../redesign/feedItems";
import { PageHead, SortBar } from "./PageParts";
import { ShelfSkeleton } from "./Skeletons";
import { SEARCH_TABS, cardEyebrow, clubLine, compactCardProps, listLine, personLine, searchTabLabel, searchTotal } from "./pagesView";

const abbr = (team) => (team?.short_name || team?.name || "").slice(0, 3).toUpperCase();

function useFollow(initial, target) {
  const [on, setOn] = useState(null);
  const value = on ?? !!initial;
  const toggle = async (event) => {
    event.stopPropagation();
    const before = value;
    setOn(!before);
    try { const r = await rankitApi.follow({ ...target, notify: false }, !before); setOn(!!r.following); }
    catch { setOn(before); }
  };
  return [value, toggle];
}

function ClubCard({ team, isLoggedIn, onOpen }) {
  const [following, toggle] = useFollow(team.following, { target_type: "team", target_id: team.id });
  return (
    <div className="riw-search-club">
      <button type="button" className="riw-search-open" onClick={() => onOpen(team.id)}>
        <Shield side={31} color={team.color || "#3a3f47"} ink="#fff" abbr={abbr(team)} crestUrl={team.crest_url} badgeScale={0.3} />
        <span><strong>{team.name}</strong><small>{clubLine(team)}</small></span>
      </button>
      {isLoggedIn && (following
        ? <button type="button" className="riw-search-state" onClick={toggle} aria-label={`Following ${team.name} — unfollow`}>FOLLOWING</button>
        : <button type="button" className="riw-search-follow" onClick={toggle} aria-label={`Follow ${team.name}`}>FOLLOW</button>)}
    </div>
  );
}

function PersonRow({ member, isLoggedIn, onOpen }) {
  const [following, toggle] = useFollow(member.following, { target_type: "user", target_id: member.id });
  const rel = relationshipState(following, !!member.follows_you);
  const line = personLine(member);
  return (
    <li className="riw-search-row">
      <button type="button" className="riw-search-open" onClick={() => onOpen(member.id)}>
        <span className="riw-review-avatar" aria-hidden="true">{initials(member.username)}</span>
        <span><strong>@{member.username}</strong>{line && <small>{line}</small>}</span>
      </button>
      {isLoggedIn && (following
        ? <button type="button" className="riw-search-state" onClick={toggle} aria-label={`${rel.label} with @${member.username} — unfollow`}>{rel.label.toUpperCase()}</button>
        : <button type="button" className="riw-search-follow" onClick={toggle} aria-label={`${rel.label} @${member.username}`}>{rel.label.toUpperCase()}</button>)}
    </li>
  );
}

function ListRow({ list, onOpen }) {
  return (
    <li className="riw-search-row">
      <button type="button" className="riw-search-open is-full" onClick={() => onOpen(list.id)}>
        <span><strong>{list.title}</strong><small>{listLine(list)}</small></span>
        <ChevronRight size={13} aria-hidden="true" />
      </button>
    </li>
  );
}

function PlayerRow({ player, onOpen }) {
  return (
    <li className="riw-search-row">
      <button type="button" className="riw-search-open is-full" onClick={() => onOpen(player.id)}>
        <span><strong>{player.name}</strong>{player.sport && <small>{player.sport}</small>}</span>
        <ChevronRight size={13} aria-hidden="true" />
      </button>
    </li>
  );
}

function Cards({ matches, hideScores, onOpenMatch, className = "riw-shelf-grid" }) {
  return (
    <div className={className}>
      {matches.map((m) => (
        <div key={m.id} className="riw-card-slot riw-shelf-slot is-community" role="button" tabIndex={0}
          aria-label={`${m.home?.name} versus ${m.away?.name}`}
          onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(m.id); }}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(m.id); }
          }}>
          <SharedMatchCard {...compactCardProps(m, { hideScores, eyebrow: cardEyebrow(m) })} crestSize={34} artHeight={56} cut={14} />
        </div>
      ))}
    </div>
  );
}

function Section({ title, meta, children, id }) {
  return (
    <section className="riw-search-section" aria-labelledby={id}>
      <div className="riw-search-sechead"><h2 id={id}>{title}</h2>{meta && <span>{meta}</span>}</div>
      {children}
    </section>
  );
}

const more = (shown, total) => (total > shown ? `Showing ${shown} of ${total.toLocaleString()} — add a word to narrow it.` : "");

export default function SearchPage({ query, tab, onTab, hideScores, onOpenMatch, onOpenEntity }) {
  const { isLoggedIn } = useAuth();
  const term = String(query || "").trim();
  const [state, setState] = useState({ term: null, data: null, error: "" });

  useEffect(() => {
    if (term.length < 2) return undefined;
    let alive = true;
    // Yazarken her tuşta istek atılmasın.
    const timer = setTimeout(() => {
      rankitApi.search(term, "All", "All", "hottest")
        .then((data) => alive && setState({ term, data, error: "" }))
        .catch((e) => alive && setState({ term, data: null, error: String(e.message || e) }));
    }, 220);
    return () => { alive = false; clearTimeout(timer); };
  }, [term]);

  const data = state.term === term ? state.data : null;
  const counts = data?.counts;
  const total = searchTotal(counts);
  const active = SEARCH_TABS.some((t) => t.key === tab) ? tab : "all";
  const openClub = (id) => onOpenEntity("team", id);
  const openMember = (id) => onOpenEntity("member", id);
  const openList = (id) => onOpenEntity("list", id);
  const openPlayer = (id) => onOpenEntity("player", id);
  const c = (key) => Number(counts?.[key]) || 0;

  if (term.length < 2) {
    return (
      <div className="riw-page">
        <PageHead eyebrow="SEARCH" title="Search" />
        <div className="riw-page-empty">
          <strong>Type at least two letters</strong>
          <p>Use the search field above — matches, clubs, people, lists and players.</p>
        </div>
      </div>
    );
  }

  const eyebrow = counts ? `${total.toLocaleString()} ${total === 1 ? "RESULT" : "RESULTS"} FOR “${term.toUpperCase()}”` : `SEARCHING “${term.toUpperCase()}”`;

  return (
    <div className="riw-page riw-results">
      <PageHead eyebrow={eyebrow} title="Search">
        <SortBar label="Result type" value={active} onChange={onTab}
          options={SEARCH_TABS.map((t) => ({ key: t.key, label: searchTabLabel(t, counts) }))} />
      </PageHead>

      {state.error && state.term === term && <p className="riw-note riw-page-pad" role="alert">{state.error}</p>}
      {!data && !state.error && <div className="riw-search-body" aria-busy="true"><div className="riw-shelf-grid"><ShelfSkeleton count={4} /></div></div>}

      {data && total === 0 && (
        <div className="riw-page-empty">
          <strong>Nothing matches “{term}”</strong>
          <p>Try a club, a player, a competition or someone's username.</p>
        </div>
      )}

      {data && total > 0 && (
        <div className="riw-search-body">
          {active === "all" && (
            <>
              {!!data.teams?.length && (
                <div className="riw-search-clubs">
                  {data.teams.slice(0, 3).map((t) => <ClubCard key={t.id} team={t} isLoggedIn={isLoggedIn} onOpen={openClub} />)}
                </div>
              )}
              {!!data.matches?.length && (
                <Section id="riw-search-matches" title="MATCHES · HOTTEST FIRST" meta={`${c("matches").toLocaleString()} found`}>
                  <Cards matches={data.matches.slice(0, 4)} hideScores={hideScores} onOpenMatch={onOpenMatch} className="riw-search-four" />
                </Section>
              )}
              {(!!data.members?.length || !!data.lists?.length) && (
                <div className="riw-search-pair">
                  {!!data.members?.length && (
                    <Section id="riw-search-people" title="PEOPLE">
                      <ul className="riw-search-rows">{data.members.slice(0, 5).map((m) => <PersonRow key={m.id} member={m} isLoggedIn={isLoggedIn} onOpen={openMember} />)}</ul>
                    </Section>
                  )}
                  {!!data.lists?.length && (
                    <Section id="riw-search-lists" title="LISTS">
                      <ul className="riw-search-rows">{data.lists.slice(0, 5).map((l) => <ListRow key={l.id} list={l} onOpen={openList} />)}</ul>
                    </Section>
                  )}
                </div>
              )}
              {!!data.players?.length && (
                <Section id="riw-search-players" title="PLAYERS">
                  <ul className="riw-search-rows is-grid">{data.players.slice(0, 6).map((p) => <PlayerRow key={p.id} player={p} onOpen={openPlayer} />)}</ul>
                </Section>
              )}
            </>
          )}

          {active === "matches" && (
            <Section id="riw-search-matches" title="MATCHES · HOTTEST FIRST" meta={more(data.matches.length, c("matches")) || `${c("matches").toLocaleString()} found`}>
              {data.matches.length ? <Cards matches={data.matches} hideScores={hideScores} onOpenMatch={onOpenMatch} /> : <p className="riw-page-fine">No matches.</p>}
            </Section>
          )}
          {active === "teams" && (
            <Section id="riw-search-clubs" title="CLUBS" meta={more(data.teams.length, c("teams"))}>
              {data.teams.length ? <div className="riw-search-clubs is-wrap">{data.teams.map((t) => <ClubCard key={t.id} team={t} isLoggedIn={isLoggedIn} onOpen={openClub} />)}</div> : <p className="riw-page-fine">No clubs.</p>}
            </Section>
          )}
          {active === "members" && (
            <Section id="riw-search-people" title="PEOPLE" meta={more(data.members.length, c("members"))}>
              {data.members.length ? <ul className="riw-search-rows is-grid">{data.members.map((m) => <PersonRow key={m.id} member={m} isLoggedIn={isLoggedIn} onOpen={openMember} />)}</ul> : <p className="riw-page-fine">No people.</p>}
            </Section>
          )}
          {active === "lists" && (
            <Section id="riw-search-lists" title="LISTS" meta={more(data.lists.length, c("lists"))}>
              {data.lists.length ? <ul className="riw-search-rows is-grid">{data.lists.map((l) => <ListRow key={l.id} list={l} onOpen={openList} />)}</ul> : <p className="riw-page-fine">No lists.</p>}
            </Section>
          )}
          {active === "players" && (
            <Section id="riw-search-players" title="PLAYERS" meta={more(data.players.length, c("players"))}>
              {data.players.length ? <ul className="riw-search-rows is-grid">{data.players.map((p) => <PlayerRow key={p.id} player={p} onOpen={openPlayer} />)}</ul> : <p className="riw-page-fine">No players.</p>}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
