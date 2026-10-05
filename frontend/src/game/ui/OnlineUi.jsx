import { VersusFrame, TitleBlock } from "./VersusUi";
import { RulesStrip, WaitLine } from "./RoomUi";
import "./room.css";
import "./online.css";

// Online ekranları (The Board ve Live). Saf sunum: ağ ve WebSocket sayfada kalır.
// Spor bağımsız: basketbol şimdi, futbol aynı bileşenleri kullanabilir (sunucu tarafı hazır olunca).

export function OnlineTabs({ tab, onTab }) {
  return (
    <div className="sb-on-tabs" role="group" aria-label="Opponent">
      <button type="button" aria-pressed={tab === "board"} onClick={() => onTab("board")}>The Board<i>top 25 rosters</i></button>
      <button type="button" aria-pressed={tab === "live"} onClick={() => onTab("live")}>Live<i>random opponent</i></button>
    </div>
  );
}

/** The Board (6w): ilk 25 + skorla arama + seçili önizleme. */
export function OnlineBoard({
  sport, sportLabel, tab, onTab, lookup, onLookup, entries, loading, isFiltering, selected, onSelect,
  eraLabel, onChallenge, challenging, challengeLabel, roster, blindNote, notice,
}) {
  return (
    <VersusFrame sport={sport}>
      <TitleBlock eyebrow={`Online · The Board · ${sportLabel}`} title="Pick a" accent="roster"
        right={<div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <OnlineTabs tab={tab} onTab={onTab} />
          <input className="sb-on-lookup" type="number" min={0} max={100} placeholder="Look up an exact score…" aria-label="Look up an exact score"
            value={lookup} onChange={(e) => onLookup(e.target.value)} />
        </div>} />
      {notice && <p className="sb-room-err" role="alert" style={{ margin: 0 }}>{notice}</p>}
      <div className="sb-on-grid">
        <section className="sb-panel sb-on-table">
          <div className="sb-on-th"><span>{isFiltering ? "" : "#"}</span><span>PLAYER</span><span>ERA</span><span>SCORE</span></div>
          <div className="sb-on-rows">
            {loading && [...Array(8)].map((_, i) => <div key={i} className="sb-on-skel" />)}
            {!loading && entries.length === 0 && (
              <div className="sb-on-empty">{isFiltering ? `No Salary Cap roster has scored exactly ${lookup} yet.` : "No Salary Cap runs on the board yet. Play a Salary Cap game in Single Player and yours becomes the first roster anyone can challenge."}</div>
            )}
            {!loading && entries.map((e, i) => (
              <button key={`${e.id}-${i}`} type="button" className={`sb-on-tr${selected?.i === i ? " on" : ""}`} aria-pressed={selected?.i === i} onClick={() => onSelect({ ...e, i })}>
                <span className="rk">{isFiltering ? "" : i + 1}</span>
                <span className="nm">{e.username}</span>
                <span className="era">{eraLabel(e)}</span>
                <span className="sc">{e.pct}</span>
              </button>
            ))}
          </div>
        </section>
        <aside className={`sb-on-side${selected ? " hot" : ""}`}>
          {selected ? (
            <>
              <span className="k">Selected{!isFiltering ? ` · #${selected.i + 1}` : ""}</span>
              <h2>{selected.username}</h2>
              <div className="sb-on-chips">
                {eraLabel(selected) && <span>{eraLabel(selected)}</span>}
                <span className="mute">100% cap</span>
                {selected.wins != null && <span className="mute">{selected.wins}W season</span>}
                {selected.season_result && <span className="mute">{selected.season_result}</span>}
              </div>
              <div className="sb-on-roster">
                {roster.map((p, i) => <div key={`${p.name}-${i}`}><b>{p.slot}</b><span style={{ color: i < 5 ? "var(--sb-text)" : "var(--sb-text-2)" }}>{p.name}</span></div>)}
              </div>
              <p>{blindNote}</p>
            </>
          ) : (
            <div className="sb-on-roster empty" style={{ flex: 1 }}>Pick a roster from the Board to see who you face.</div>
          )}
          <button type="button" className="sb-btn solid" disabled={!selected || challenging} onClick={onChallenge}>
            {challenging ? "Starting…" : challengeLabel}
          </button>
        </aside>
      </div>
    </VersusFrame>
  );
}

/** Live: başlangıç, arama, eşleşme bulundu (6j, 6k, 6l). */
export function OnlineLive({ sport, sportLabel, tab, onTab, state, elapsed, queueSize, opponent, me, rulesLine, onFind, onCancel, onAccept, notice, signedIn, onSignIn }) {
  const mm = Math.floor(elapsed / 60), ss = String(elapsed % 60).padStart(2, "0");
  if (state === "searching") {
    return (
      <VersusFrame sport={sport}>
        <div className="sb-room sb-on-center">
          <p className="sb-mono eyebrow">Online opponent · {sportLabel}</p>
          <div className="sb-on-ring" aria-hidden="true"><i /><i /><i /><b>{mm}:{ss}</b></div>
          <h1>Finding an <span className="sb-accent">opponent</span></h1>
          <p className="lede">You are matched with the next fan who is searching.</p>
          <div className="sb-on-stats">
            <div className="sb-on-stat"><span>In queue</span><b>{queueSize ?? "—"}</b></div>
            <div className="sb-on-stat"><span>Searching</span><b>{mm}:{ss}</b></div>
          </div>
          <RulesStrip>{rulesLine}</RulesStrip>
          <div className="sb-room-actions"><button type="button" className="sb-btn ghost" onClick={onCancel}>Cancel search</button></div>
        </div>
      </VersusFrame>
    );
  }
  if (state === "found" && opponent) {
    const rec = [opponent.games != null ? `${opponent.games} games` : "New challenger", opponent.best != null ? `best ${opponent.best}` : null].filter(Boolean).join(" · ");
    return (
      <VersusFrame sport={sport}>
        <div className="sb-room">
          <p className="sb-mono eyebrow">Online opponent · {sportLabel}</p>
          <h1>Match <span className="sb-accent">found</span></h1>
          <div className="sb-room-seats">
            <div className="sb-seatcard s1"><span className="av">{(me || "?")[0].toUpperCase()}</span><div><span className="nm">{me} <small>· you</small></span><span className="st">● Ready</span></div></div>
            <span className="vs">VS</span>
            <div className="sb-seatcard s2"><span className="av">{(opponent.username || "?")[0].toUpperCase()}</span><div style={{ minWidth: 0 }}><span className="nm">{opponent.username}</span><span className="st">● {rec}</span></div></div>
          </div>
          <RulesStrip>{rulesLine}</RulesStrip>
          <div className="sb-room-actions"><button type="button" className="sb-btn solid cta md" onClick={onAccept}>Enter draft →</button><button type="button" className="sb-btn ghost" onClick={onCancel}>Leave</button></div>
        </div>
      </VersusFrame>
    );
  }
  return (
    <VersusFrame sport={sport}>
      <TitleBlock eyebrow={`Online · Live · ${sportLabel}`} title="Play a" accent="real person" right={<OnlineTabs tab={tab} onTab={onTab} />} />
      <div className="sb-room" style={{ justifyContent: "flex-start", margin: 0, maxWidth: 820 }}>
        <p className="lede">Get paired with another fan at random. Same rules as With a Friend: one shared era, snake draft, 100% salary cap each, five jokers plus counter-jokers, best-of-7 series.</p>
        <RulesStrip>{rulesLine}</RulesStrip>
        {notice && <p className="sb-room-err" role="alert">{notice}</p>}
        <div className="sb-room-actions" style={{ justifyContent: "flex-start" }}>
          {signedIn
            ? <button type="button" className="sb-btn solid cta md" onClick={onFind}>Find opponent</button>
            : <button type="button" className="sb-btn solid cta md" onClick={onSignIn}>Sign in to play</button>}
        </div>
        {!signedIn && <WaitLine>Live matches need an account so your opponent knows who they are playing.</WaitLine>}
      </div>
    </VersusFrame>
  );
}
